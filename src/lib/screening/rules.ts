import type { BranchInspection, CommitRef, RepoEvidence } from "../github/types";
import { formatEat } from "../format";
import type { ScreeningFlag, Submission } from "../types";
import { DEFAULT_POLICY, type ScreeningPolicy } from "./policy";
import { EVENT } from "../constants";
import { classifyTimestamp, eatDate, parseInstant } from "./window";

/** A flag before Charlie assigns ids and resolution state. */
export type FlagDraft = Omit<ScreeningFlag, "id" | "resolved">;

/**
 * Deterministic provenance rules. Pure: evidence + submission + policy in, flags out.
 *
 * Every rule produces signals for a human. None of them proves misconduct: commit and repository
 * timestamps can be set or rewritten by the author, and forks, templates and large first commits
 * all have legitimate explanations.
 */
export function evaluateEvidence(
  evidence: RepoEvidence,
  submission: Pick<Submission, "externalResources">,
  policy: ScreeningPolicy = DEFAULT_POLICY,
): FlagDraft[] {
  const flags: FlagDraft[] = [];
  const declared = declaresExternalCode(submission.externalResources);
  const commits = collectCommits(evidence.branches);
  const shortSha = (c: CommitRef) => c.sha.slice(0, 7);
  const sample = (list: SeenCommit[]) =>
    list
      .slice(0, policy.maxCommitSamples)
      .map((c) => `${shortSha(c)} (${c.branches.join(", ")})`)
      .join("; ");

  // 1. Repository creation time.
  const created = classifyTimestamp(evidence.createdAt, policy.window);
  const startEat = formatEat(policy.window.startUtc);
  const deadlineEat = formatEat(policy.window.deadlineUtc);
  if (created === "before_start") {
    // Event rule: repositories created before the event date must be flagged; a genuinely empty one
    // created before the 7:00 AM start on the event day may be accepted after manual review.
    const isEmpty = evidence.branches.length > 0 && evidence.branches.every((b) => b.commits.length === 0 && b.historyComplete);
    const onEventDay = eatDate(evidence.createdAt) === EVENT.date;
    const emptyNote = isEmpty
      ? ` The inspected branches contain no commits, so this looks like an empty repository${onEventDay ? " created on the event day before the start" : ""}; the event rules allow an organizer to accept that after manual review.`
      : "";
    flags.push({
      code: "REPO_CREATED_BEFORE_START",
      kind: "verified",
      title: isEmpty ? "Empty repository created before the official start" : "Repository created before the official start",
      detail: `GitHub reports the repository was created ${formatEat(evidence.createdAt)}, before the official start (${startEat}). This is a verified repository fact, not proof the code pre-dates the event: a team may have created an empty repository early.${emptyNote} Manual verification needed.`,
      timestamp: evidence.createdAt,
      evidenceUrl: evidence.htmlUrl,
    });
  } else if (created === "after_deadline") {
    flags.push({
      code: "REPO_CREATED_AFTER_DEADLINE",
      kind: "verified",
      title: "Repository created after the build deadline",
      detail: `GitHub reports the repository was created ${formatEat(evidence.createdAt)}, after the deadline (${deadlineEat}). The code may have been moved to a new repository; confirm with the team.`,
      timestamp: evidence.createdAt,
      evidenceUrl: evidence.htmlUrl,
    });
  } else if (created === "within_window") {
    flags.push({
      code: "EVENT_WINDOW_NOT_PROOF",
      kind: "info",
      title: "Repository created inside the build window",
      detail:
        "Creation inside the window is expected but is not proof the project was built during the event. Timestamps can be misleading or manipulated.",
      timestamp: evidence.createdAt,
      evidenceUrl: evidence.htmlUrl,
    });
  } else {
    flags.push({
      code: "INVALID_REPO_TIMESTAMP",
      kind: "inconclusive",
      title: "Repository creation time could not be read",
      detail: "GitHub returned a missing or malformed creation timestamp, so the event-window check could not be done.",
      evidenceUrl: evidence.htmlUrl,
    });
  }

  // 2. Commit timestamps against the window.
  const pre = commits.filter((c) => isBefore(c.authorDate, policy) || isBefore(c.committerDate, policy));
  if (pre.length > 0) {
    const authorN = pre.filter((c) => isBefore(c.authorDate, policy)).length;
    const committerN = pre.filter((c) => isBefore(c.committerDate, policy)).length;
    const first = oldest(pre);
    flags.push({
      code: "PRE_EVENT_COMMITS",
      kind: "suspicious",
      title: `${pre.length} inspected commit${pre.length === 1 ? "" : "s"} dated before the official start`,
      detail: `Author date before start: ${authorN}; committer date before start: ${committerN}. Examples: ${sample(pre)}. Commit dates are set by the author's git client and can be edited, and they can legitimately come from template or imported code. Manual verification needed.`,
      timestamp: earliestInstant(first),
      commitSha: first.sha,
      evidenceUrl: first.url,
    });
  }

  const post = commits.filter((c) => isAfter(c.authorDate, policy) || isAfter(c.committerDate, policy));
  if (post.length > 0) {
    const last = newest(post);
    flags.push({
      code: "COMMITS_AFTER_DEADLINE",
      kind: "suspicious",
      title: `${post.length} inspected commit${post.length === 1 ? "" : "s"} dated after the build deadline`,
      detail: `These commits are outside the published window (after ${deadlineEat}). Examples: ${sample(post)}. Whether post-deadline commits are allowed (for example documentation fixes) is an organizer decision.`,
      timestamp: latestInstant(last),
      commitSha: last.sha,
      evidenceUrl: last.url,
    });
  }

  const bad = commits.filter((c) => !valid(c.authorDate) || !valid(c.committerDate));
  if (bad.length > 0) {
    flags.push({
      code: "INVALID_COMMIT_TIMESTAMP",
      kind: "inconclusive",
      title: `${bad.length} commit${bad.length === 1 ? " has" : "s have"} unreadable timestamps`,
      detail: `Examples: ${sample(bad)}. These commits could not be placed relative to the build window.`,
      commitSha: bad[0].sha,
      evidenceUrl: bad[0].url,
    });
  }

  // 3. Author vs committer discrepancy.
  const gap = commits.filter((c) => {
    const a = parseInstant(c.authorDate);
    const k = parseInstant(c.committerDate);
    return a !== null && k !== null && Math.abs(a - k) > policy.timestampDiscrepancyThresholdMs;
  });
  if (gap.length > 0) {
    const hours = Math.round(policy.timestampDiscrepancyThresholdMs / 3_600_000);
    flags.push({
      code: "TIMESTAMP_DISCREPANCY",
      kind: "suspicious",
      title: `${gap.length} commit${gap.length === 1 ? "" : "s"} with author and committer dates more than ${hours}h apart`,
      detail: `Examples: ${sample(gap)}. This happens with rebases, cherry-picks and amended commits, so it is not misconduct by itself. It is listed because rewritten history can hide when work was done.`,
      commitSha: gap[0].sha,
      evidenceUrl: gap[0].url,
    });
  }

  // 4. Imported or inherited history: commits older than the repository itself.
  const createdMs = parseInstant(evidence.createdAt);
  if (createdMs !== null) {
    const imported = commits.filter((c) => {
      const t = minInstant(c);
      return t !== null && t < createdMs - policy.importedHistoryToleranceMs;
    });
    if (imported.length > 0) {
      const first = oldest(imported);
      const preStart = imported.filter((c) => isBefore(c.authorDate, policy) || isBefore(c.committerDate, policy)).length;
      flags.push({
        code: "IMPORTED_HISTORY",
        kind: "suspicious",
        title: `${imported.length} inspected commit${imported.length === 1 ? "" : "s"} older than the repository`,
        detail: `Commits dated more than ${Math.round(policy.importedHistoryToleranceMs / 60_000)} minutes before the repository was created (${formatEat(evidence.createdAt)}) suggest history imported from elsewhere. ${preStart} of them also pre-date the official start. Examples: ${sample(imported)}. A local project pushed to a new repository looks the same, so confirm with the team.`,
        timestamp: earliestInstant(first),
        commitSha: first.sha,
        evidenceUrl: first.url,
      });
    }
  }

  // 5. Fork status.
  if (evidence.isFork) {
    const upstream = evidence.upstream;
    const cmp = evidence.forkComparison;
    const defaultBranch = evidence.branches.find((b) => b.isDefault);
    let inherited = "";
    if (cmp && defaultBranch?.totalCommits !== undefined) {
      inherited = ` Roughly ${Math.max(defaultBranch.totalCommits - cmp.aheadBy, 0)} of ${defaultBranch.totalCommits} commits on the default branch come from upstream.`;
    }
    const cmpText = cmp
      ? ` Compared with upstream: ${cmp.aheadBy} commit${cmp.aheadBy === 1 ? "" : "s"} ahead, ${cmp.behindBy} behind.${inherited}`
      : " The comparison with upstream could not be retrieved.";
    const downgrade = declared && policy.declaredExternalCodeHandling === "info_if_declared";
    flags.push({
      code: "IS_FORK",
      kind: downgrade ? "info" : "suspicious",
      title: "Repository is a fork",
      detail: `Forked from ${upstream?.fullName ?? "an upstream repository"}, so existing implementation code may have been inherited.${cmpText} ${
        declared
          ? "The team's declared external resources mention existing or starter code."
          : "The team's declared external resources do not mention existing or starter code."
      } Whether forks are eligible is an organizer decision (policy: ${policy.declaredExternalCodeHandling}).`,
      evidenceUrl: upstream?.htmlUrl ?? evidence.htmlUrl,
    });
    if (cmp && cmp.aheadBy === 0) {
      flags.push({
        code: "FORK_NO_ORIGINAL_COMMITS",
        kind: "suspicious",
        title: "Fork has no commits beyond its upstream",
        detail: "The fork's default branch is not ahead of upstream, so no new work is visible there. Work may be on another branch or elsewhere.",
        evidenceUrl: cmp.url,
      });
    }
    if (!cmp) {
      flags.push({
        code: "FORK_COMPARISON_UNAVAILABLE",
        kind: "inconclusive",
        title: "Could not compare the fork with its upstream",
        detail: "How much of the code is original could not be determined automatically.",
        evidenceUrl: upstream?.htmlUrl ?? evidence.htmlUrl,
      });
    }
  }

  // 6. Large initial commit.
  const ic = evidence.initialCommit;
  if (ic) {
    const { minTotalChanges, minFilesChanged } = policy.largeInitialCommit;
    const big =
      (ic.totalChanges !== undefined && ic.totalChanges >= minTotalChanges) ||
      (ic.filesChanged !== undefined && ic.filesChanged >= minFilesChanged);
    if (big) {
      const downgrade = declared && policy.declaredExternalCodeHandling === "info_if_declared";
      const earliest = evidence.branches.find((b) => b.isDefault)?.earliest;
      flags.push({
        code: "LARGE_INITIAL_COMMIT",
        kind: downgrade ? "info" : "suspicious",
        title: "Large initial commit",
        detail: `The first commit on the default branch changes ${ic.totalChanges ?? "an unknown number of"} lines across ${ic.filesChanged ?? "an unknown number of"}${ic.filesListTruncated ? "+" : ""} files (thresholds: ${minTotalChanges} lines or ${minFilesChanged} files). Starter templates, scaffolding and project imports produce this; it does not show misconduct by itself. ${
          declared ? "The team declared external or starter code." : "The team did not declare external or starter code."
        }`,
        timestamp: earliest ? earliestInstant(earliest) : undefined,
        commitSha: ic.sha,
        evidenceUrl: ic.url,
      });
    }
  }

  // 7. What was and was not inspected.
  const incomplete = evidence.branches.filter((b) => !b.historyComplete);
  const gaps: string[] = [];
  if (incomplete.length > 0) {
    gaps.push(
      `History not fully examined on: ${incomplete.map((b) => `${b.name} (${b.commits.length}${b.totalCommits ? ` of ${b.totalCommits}` : ""} commits)`).join(", ")}.`,
    );
  }
  if (evidence.branchesNotInspected > 0) gaps.push(`${evidence.branchesNotInspected} other branch(es) were not inspected.`);
  if (!evidence.branchListComplete) gaps.push("The branch list itself was truncated, so unseen branches may exist.");
  for (const l of evidence.limitations) gaps.push(l.message);
  if (gaps.length > 0) {
    flags.push({
      code: "HISTORY_INCOMPLETE",
      kind: "inconclusive",
      title: "Verification is incomplete",
      detail: `${gaps.join(" ")} Findings above cover only what was inspected; absence of a flag is not confirmation.`,
      evidenceUrl: evidence.htmlUrl,
    });
  }

  flags.push({
    code: "HISTORY_SCOPE",
    kind: "info",
    title: "Branches inspected",
    detail:
      evidence.branches.length === 0
        ? "No branch history could be inspected."
        : evidence.branches
            .map(
              (b) =>
                `${b.name}${b.isDefault ? " (default)" : ""}: ${b.commits.length} commit${b.commits.length === 1 ? "" : "s"} examined, ${b.historyComplete ? "full history" : "partial history"}`,
            )
            .join("; "),
    evidenceUrl: evidence.htmlUrl,
  });

  return flags;
}

// ---- helpers -------------------------------------------------------------------------------------

export interface SeenCommit extends CommitRef {
  branches: string[];
}

/** Merges commits across branches, de-duplicating by SHA and remembering which branches contain each. */
export function collectCommits(branches: BranchInspection[]): SeenCommit[] {
  const seen = new Map<string, SeenCommit>();
  for (const b of branches) {
    for (const c of [...b.commits, ...(b.earliest ? [b.earliest] : [])]) {
      const existing = seen.get(c.sha);
      if (existing) {
        if (!existing.branches.includes(b.name)) existing.branches.push(b.name);
      } else {
        seen.set(c.sha, { ...c, branches: [b.name] });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Keyword heuristic over the team's own declaration. Sentences that negate ("No starter template")
 * are ignored. It only informs wording and, if the organizers opt in, severity; it never decides eligibility.
 */
export function declaresExternalCode(text: string | undefined): boolean {
  if (!text) return false;
  const positive = text
    .toLowerCase()
    .split(/[.;\n]+/)
    .filter((s) => s.trim() && !/\b(no|not|none|without|n\/a|nil)\b/.test(s));
  return positive.some((s) =>
    /\b(fork|forked|template|starter|boilerplate|clone|cloned|existing|based on|scaffold|open[- ]source)\b/.test(s),
  );
}

const valid = (iso: string) => parseInstant(iso) !== null;
const isBefore = (iso: string, p: ScreeningPolicy) => classifyTimestamp(iso, p.window) === "before_start";
const isAfter = (iso: string, p: ScreeningPolicy) => classifyTimestamp(iso, p.window) === "after_deadline";

function minInstant(c: CommitRef): number | null {
  const ts = [parseInstant(c.authorDate), parseInstant(c.committerDate)].filter((t): t is number => t !== null);
  return ts.length ? Math.min(...ts) : null;
}
function maxInstant(c: CommitRef): number | null {
  const ts = [parseInstant(c.authorDate), parseInstant(c.committerDate)].filter((t): t is number => t !== null);
  return ts.length ? Math.max(...ts) : null;
}
const earliestInstant = (c: CommitRef) => {
  const t = minInstant(c);
  return t === null ? undefined : new Date(t).toISOString();
};
const latestInstant = (c: CommitRef) => {
  const t = maxInstant(c);
  return t === null ? undefined : new Date(t).toISOString();
};
const oldest = (list: SeenCommit[]) => [...list].sort((a, b) => (minInstant(a) ?? Infinity) - (minInstant(b) ?? Infinity))[0];
const newest = (list: SeenCommit[]) => [...list].sort((a, b) => (maxInstant(b) ?? -Infinity) - (maxInstant(a) ?? -Infinity))[0];
