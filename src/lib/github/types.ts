/**
 * Evidence retrieved from GitHub. Everything here is untrusted third-party data:
 * it is only ever compared, counted and displayed, never interpreted as instructions or executed.
 */

export interface CommitRef {
  sha: string;
  url: string;
  authorDate: string;
  committerDate: string;
}

export interface BranchInspection {
  name: string;
  isDefault: boolean;
  /** Commits actually fetched (sampled from the tip backwards). */
  commits: CommitRef[];
  /** True only if every commit reachable from the branch tip was fetched. */
  historyComplete: boolean;
  /** Exact total when the pagination links revealed it. */
  totalCommits?: number;
  /** Oldest commit on the branch. Known even for truncated history when the last page could be fetched. */
  earliest?: CommitRef;
}

export interface InitialCommitInfo {
  sha: string;
  url: string;
  totalChanges?: number;
  filesChanged?: number;
  /** GitHub caps the file list; if true, filesChanged is a lower bound. */
  filesListTruncated?: boolean;
}

export interface Limitation {
  code: string;
  message: string;
}

export interface RepoEvidence {
  owner: string;
  repo: string;
  htmlUrl: string;
  fetchedAt: string;
  createdAt: string;
  defaultBranch: string;
  isFork: boolean;
  upstream?: { fullName: string; htmlUrl: string; defaultBranch: string };
  /** Fork vs upstream default branch. Undefined if not a fork or the comparison failed. */
  forkComparison?: { aheadBy: number; behindBy: number; status: string; url: string };
  branches: BranchInspection[];
  /** Branches that exist but were not inspected (limits). Undefined count means the list itself was incomplete. */
  branchesNotInspected: number;
  branchListComplete: boolean;
  initialCommit?: InitialCommitInfo;
  tree?: { paths: string[]; truncated: boolean };
  readme?: {
    exists: boolean;
    url?: string;
    hasSetupHints?: boolean;
    /** Bounded README text. Untrusted. Server-side only: never include in responses sent to browsers. */
    excerpt?: string;
  };
  limitations: Limitation[];
}

export type VerifyOutcome =
  | { status: "ok"; evidence: RepoEvidence }
  /** Repository confirmed not reachable publicly (404 / 403 without rate limiting). May be private or mistyped. */
  | { status: "not_accessible"; reason: "not_found" | "forbidden"; message: string; checkedAt: string }
  /** Verification could not be completed for a technical reason. Never evidence of misconduct. */
  | {
      status: "unavailable";
      reason: "rate_limited" | "timeout" | "network" | "http_error" | "budget_exceeded";
      message: string;
      checkedAt: string;
      resetAt?: string;
    }
  | { status: "invalid_url"; message: string; checkedAt: string };
