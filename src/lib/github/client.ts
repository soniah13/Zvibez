import "server-only";
import { detectSetupHints } from "../screening/readme";
import { parseGithubUrl } from "../validation";
import type { BranchInspection, CommitRef, InitialCommitInfo, Limitation, RepoEvidence, VerifyOutcome } from "./types";

const API = "https://api.github.com";
const PER_PAGE = 100;

export interface GithubLimits {
  /** Per-request timeout. */
  timeoutMs: number;
  /** Wall-clock cap for one whole verification. */
  maxTotalMs: number;
  /** Hard cap on API requests per verification. */
  maxRequests: number;
  /** Commit pages (100 each) fetched per branch before reporting the history as partial. */
  maxCommitPagesPerBranch: number;
  /** Branches inspected, default branch first. */
  maxBranches: number;
  maxTreePaths: number;
  /** READMEs larger than this are not decoded. */
  maxReadmeBytes: number;
  /** Characters of README text retained for the AI summary. */
  maxReadmeExcerptChars: number;
}

export const DEFAULT_LIMITS: GithubLimits = {
  timeoutMs: 8_000,
  maxTotalMs: 30_000,
  maxRequests: 45,
  maxCommitPagesPerBranch: 5,
  maxBranches: 5,
  maxTreePaths: 5_000,
  maxReadmeBytes: 200_000,
  maxReadmeExcerptChars: 8_000,
};

export type GithubErrorKind =
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "timeout"
  | "network"
  | "http_error"
  | "budget_exceeded"
  | "empty";

export class GithubApiError extends Error {
  constructor(
    readonly kind: GithubErrorKind,
    message: string,
    readonly resetAt?: string,
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

/** Failures that mean "stop calling GitHub": retrying or continuing would only burn quota or time. */
const HALTING: GithubErrorKind[] = ["rate_limited", "budget_exceeded", "timeout", "network"];

export function parseLinkHeader(header: string | null): { next?: string; last?: string } {
  const out: { next?: string; last?: string } = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="(\w+)"/);
    if (m && (m[2] === "next" || m[2] === "last")) out[m[2]] = m[1];
  }
  return out;
}

interface CreateOptions {
  /** Optional token for higher rate limits. Defaults to GITHUB_TOKEN. Public repos work without one. */
  token?: string;
  fetchImpl?: typeof fetch;
  limits?: Partial<GithubLimits>;
  now?: () => Date;
}

type Json = Record<string, unknown>;

export function createGithubClient(options: CreateOptions = {}) {
  const limits: GithubLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const token = options.token !== undefined ? options.token : process.env.GITHUB_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  /** Per-verification state: request budget and clock. */
  function session() {
    let requests = 0;
    const startedAt = Date.now();

    async function request(target: string): Promise<{ data: unknown; links: { next?: string; last?: string } }> {
      // Pagination links come from the response; only ever follow GitHub API URLs.
      const url = target.startsWith("https://") ? target : `${API}${target}`;
      if (!url.startsWith(`${API}/`)) throw new GithubApiError("http_error", "Refused to follow a non-GitHub URL.");
      if (requests >= limits.maxRequests) throw new GithubApiError("budget_exceeded", "Request limit for one verification reached.");
      if (Date.now() - startedAt > limits.maxTotalMs) throw new GithubApiError("timeout", "Time limit for one verification reached.");
      requests++;

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "charlie-screening-bot",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      let res: Response;
      try {
        res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(limits.timeoutMs), cache: "no-store" });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "TimeoutError" || name === "AbortError") throw new GithubApiError("timeout", "GitHub did not respond in time.");
        throw new GithubApiError("network", "Could not reach GitHub.");
      }

      if (res.ok) {
        try {
          return { data: await res.json(), links: parseLinkHeader(res.headers.get("link")) };
        } catch {
          throw new GithubApiError("http_error", "GitHub returned a response that could not be read.");
        }
      }

      switch (res.status) {
        case 404:
          throw new GithubApiError("not_found", "Not found (the repository may be private or the URL mistyped).");
        case 409:
          throw new GithubApiError("empty", "The repository is empty.");
        case 401:
          throw new GithubApiError("http_error", "GitHub rejected the configured credentials (HTTP 401). Check GITHUB_TOKEN.");
        case 403:
        case 429: {
          const remaining = res.headers.get("x-ratelimit-remaining");
          const retryAfter = res.headers.get("retry-after");
          if (res.status === 429 || remaining === "0" || retryAfter) {
            const reset = res.headers.get("x-ratelimit-reset");
            const resetAt = reset
              ? new Date(Number(reset) * 1000).toISOString()
              : retryAfter
                ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString()
                : undefined;
            throw new GithubApiError("rate_limited", "GitHub rate limit reached.", Number.isNaN(Date.parse(resetAt ?? "")) ? undefined : resetAt);
          }
          throw new GithubApiError("forbidden", "Access to the repository is forbidden.");
        }
        default:
          throw new GithubApiError("http_error", `GitHub returned HTTP ${res.status}.`);
      }
    }
    return { request };
  }

  async function verifyRepository(githubUrl: string): Promise<VerifyOutcome> {
    const checkedAt = now().toISOString();
    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      return { status: "invalid_url", message: "Not a valid https://github.com/owner/repo URL.", checkedAt };
    }
    const { request } = session();
    const enc = encodeURIComponent;

    let repo: Json;
    try {
      repo = (await request(`/repos/${enc(parsed.owner)}/${enc(parsed.repo)}`)).data as Json;
      if (typeof repo.created_at !== "string" || typeof repo.default_branch !== "string") {
        throw new GithubApiError("http_error", "GitHub returned an unexpected repository response.");
      }
    } catch (e) {
      const err = asApiError(e);
      if (err.kind === "not_found" || err.kind === "forbidden") {
        return { status: "not_accessible", reason: err.kind, message: err.message, checkedAt };
      }
      return {
        status: "unavailable",
        reason: err.kind === "empty" ? "http_error" : (err.kind as Exclude<GithubErrorKind, "not_found" | "forbidden" | "empty">),
        message: err.message,
        checkedAt,
        resetAt: err.resetAt,
      };
    }

    const owner = ((repo.owner as Json | undefined)?.login as string) ?? parsed.owner;
    const name = (repo.name as string) ?? parsed.repo;
    const base = `/repos/${enc(owner)}/${enc(name)}`;
    const defaultBranch = repo.default_branch as string;
    const htmlUrl = (repo.html_url as string) ?? `https://github.com/${owner}/${name}`;

    const limitations: Limitation[] = [];
    let halted: GithubApiError | null = null;

    /** Runs one optional check. A failure becomes a recorded limitation, never an exception. */
    async function step<T>(code: string, label: string, fn: () => Promise<T>): Promise<T | undefined> {
      if (halted) {
        limitations.push({ code: `${code}_SKIPPED`, message: `${label} was skipped (${haltReason(halted)}).` });
        return undefined;
      }
      try {
        return await fn();
      } catch (e) {
        const err = asApiError(e);
        if (HALTING.includes(err.kind)) halted = err;
        limitations.push({ code: `${code}_${err.kind.toUpperCase()}`, message: `${label} could not be completed: ${err.message}` });
        return undefined;
      }
    }

    // Branch list: default first, then others in GitHub order, up to the limit.
    let branchNames = [defaultBranch];
    let branchListComplete = false;
    const listed = await step("BRANCH_LIST", "The branch list", async () => {
      const { data, links } = await request(`${base}/branches?per_page=${PER_PAGE}`);
      return { names: (data as Json[]).map((b) => String(b.name)), complete: !links.next };
    });
    if (listed) {
      branchNames = [defaultBranch, ...listed.names.filter((n) => n !== defaultBranch)];
      branchListComplete = listed.complete;
    }
    const toInspect = branchNames.slice(0, limits.maxBranches);
    const branchesNotInspected = Math.max(branchNames.length - toInspect.length, 0);

    // Commit history per branch.
    const branches: BranchInspection[] = [];
    for (const branch of toInspect) {
      const result = await step(`COMMITS_${branch}`, `Commit history of "${branch}"`, () =>
        inspectBranch(request, base, branch, branch === defaultBranch, limits.maxCommitPagesPerBranch),
      );
      if (result) branches.push(result);
    }

    // Size of the very first commit on the default branch (a true root only).
    let initialCommit: InitialCommitInfo | undefined;
    const rootSha = branches.find((b) => b.isDefault)?.earliest?.sha;
    if (rootSha) {
      initialCommit = await step("INITIAL_COMMIT", "The initial commit details", async () => {
        const { data } = await request(`${base}/commits/${enc(rootSha)}`);
        const d = data as { sha?: string; html_url?: string; stats?: { total?: number }; files?: unknown[] };
        const filesChanged = Array.isArray(d.files) ? d.files.length : undefined;
        return {
          sha: d.sha ?? rootSha,
          url: d.html_url ?? `${htmlUrl}/commit/${rootSha}`,
          totalChanges: d.stats?.total,
          filesChanged,
          filesListTruncated: filesChanged !== undefined && filesChanged >= 300,
        };
      });
    }

    // File structure (paths only; contents are never fetched except the README below).
    const tree = await step("TREE", "The repository file list", async () => {
      try {
        const { data } = await request(`${base}/git/trees/${enc(defaultBranch)}?recursive=1`);
        const d = data as { tree?: { path: string; type: string }[]; truncated?: boolean };
        const blobs = (d.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path);
        return { paths: blobs.slice(0, limits.maxTreePaths), truncated: !!d.truncated || blobs.length > limits.maxTreePaths };
      } catch (e) {
        if (asApiError(e).kind === "empty") return { paths: [], truncated: false };
        throw e;
      }
    });

    // README: existence plus a keyword check on its text. The text is untrusted and is not retained.
    const readme = await step("README", "The README check", async () => {
      try {
        const { data } = await request(`${base}/readme`);
        const d = data as { content?: string; encoding?: string; size?: number; html_url?: string };
        let hasSetupHints: boolean | undefined;
        let excerpt: string | undefined;
        if (d.encoding === "base64" && typeof d.content === "string" && (d.size ?? 0) <= limits.maxReadmeBytes) {
          const text = Buffer.from(d.content, "base64").toString("utf8");
          hasSetupHints = detectSetupHints(text);
          // Bounded, untrusted text kept server-side only (never returned to browsers) for the AI summary.
          excerpt = text.slice(0, limits.maxReadmeExcerptChars);
        }
        return { exists: true, url: d.html_url, hasSetupHints, excerpt };
      } catch (e) {
        if (asApiError(e).kind === "not_found") return { exists: false };
        throw e;
      }
    });

    // Fork details.
    const isFork = repo.fork === true;
    let upstream: RepoEvidence["upstream"];
    let forkComparison: RepoEvidence["forkComparison"];
    const parent = repo.parent as { full_name?: string; html_url?: string; default_branch?: string; owner?: { login?: string } } | undefined;
    if (isFork && parent?.full_name) {
      upstream = {
        fullName: parent.full_name,
        htmlUrl: parent.html_url ?? `https://github.com/${parent.full_name}`,
        defaultBranch: parent.default_branch ?? "main",
      };
      const [parentOwner] = parent.full_name.split("/");
      forkComparison = await step("FORK_COMPARE", "The comparison with the upstream repository", async () => {
        const basehead = `${enc(parentOwner)}:${enc(upstream!.defaultBranch)}...${enc(owner)}:${enc(defaultBranch)}`;
        const { data } = await request(`${base}/compare/${basehead}?per_page=1`);
        const d = data as { ahead_by?: number; behind_by?: number; status?: string; html_url?: string };
        return {
          aheadBy: d.ahead_by ?? 0,
          behindBy: d.behind_by ?? 0,
          status: d.status ?? "unknown",
          url: d.html_url ?? `${htmlUrl}/compare`,
        };
      });
    }

    return {
      status: "ok",
      evidence: {
        owner,
        repo: name,
        htmlUrl,
        fetchedAt: now().toISOString(),
        createdAt: repo.created_at as string,
        defaultBranch,
        isFork,
        upstream,
        forkComparison,
        branches,
        branchesNotInspected,
        branchListComplete,
        initialCommit,
        tree,
        readme,
        limitations,
      },
    };
  }

  return { verifyRepository };
}

type Requester = (target: string) => Promise<{ data: unknown; links: { next?: string; last?: string } }>;

/**
 * Follows commit pagination up to the page limit. If the limit stops us, the history is reported as partial,
 * and the oldest commit is still fetched from the "last" page so imported history is not missed.
 */
async function inspectBranch(
  request: Requester,
  base: string,
  branch: string,
  isDefault: boolean,
  maxPages: number,
): Promise<BranchInspection> {
  const commits: CommitRef[] = [];
  let next: string | undefined = `${base}/commits?sha=${encodeURIComponent(branch)}&per_page=${PER_PAGE}`;
  let lastUrl: string | undefined;
  let pages = 0;
  const toRef = (raw: Json): CommitRef => {
    const c = (raw.commit ?? {}) as { author?: { date?: string }; committer?: { date?: string } };
    return { sha: String(raw.sha ?? ""), url: String(raw.html_url ?? ""), authorDate: c.author?.date ?? "", committerDate: c.committer?.date ?? "" };
  };

  try {
    while (next && pages < maxPages) {
      const { data, links } = await request(next);
      if (pages === 0) lastUrl = links.last;
      commits.push(...(data as Json[]).map(toRef));
      pages++;
      next = links.next;
    }
  } catch (e) {
    if (asApiError(e).kind === "empty") return { name: branch, isDefault, commits: [], historyComplete: true, totalCommits: 0 };
    throw e;
  }

  const complete = !next;
  if (complete) {
    return { name: branch, isDefault, commits, historyComplete: true, totalCommits: commits.length, earliest: commits[commits.length - 1] };
  }

  // Partial: fetch the last page to learn the oldest commit and the exact total.
  let earliest: CommitRef | undefined;
  let totalCommits: number | undefined;
  if (lastUrl) {
    try {
      const { data } = await request(lastUrl);
      const arr = data as Json[];
      const lastPage = Number(new URL(lastUrl).searchParams.get("page"));
      if (arr.length > 0) {
        earliest = toRef(arr[arr.length - 1]);
        if (lastPage > 0) totalCommits = (lastPage - 1) * PER_PAGE + arr.length;
      }
    } catch (e) {
      // Non-fatal: keep the commits already fetched. History stays "partial" and the root commit unknown.
      void e;
    }
  }
  return { name: branch, isDefault, commits, historyComplete: false, totalCommits, earliest };
}

function asApiError(e: unknown): GithubApiError {
  return e instanceof GithubApiError ? e : new GithubApiError("network", "Unexpected error while contacting GitHub.");
}

function haltReason(e: GithubApiError): string {
  switch (e.kind) {
    case "rate_limited":
      return "GitHub rate limit reached earlier in this run";
    case "budget_exceeded":
      return "request limit reached";
    case "timeout":
      return "time limit reached";
    default:
      return "GitHub became unreachable";
  }
}
