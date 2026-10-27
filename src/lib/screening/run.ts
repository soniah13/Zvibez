import { collectCommits } from "./rules";
import type { RepoEvidence, VerifyOutcome } from "../github/types";
import type { GithubVerification, ScreeningFlag, ScreeningResult, Submission } from "../types";
import { artifactFlags, DEFAULT_PROVIDERS, reviewArtifacts, type ArtifactProvider } from "./artifacts";
import { checkCompleteness } from "./completeness";
import { DEFAULT_POLICY, type ScreeningPolicy } from "./policy";
import { evaluateEvidence, type FlagDraft } from "./rules";
import { deriveStatus } from "./status";
import { parseInstant } from "./window";

export interface RunOptions {
  /** Performs the GitHub verification. Injected so this module stays pure and testable. */
  verify: (githubUrl: string) => Promise<VerifyOutcome>;
  policy?: ScreeningPolicy;
  /** Reviewers for non-GitHub artifacts. Defaults to manual review for every platform. */
  providers?: ArtifactProvider[];
  /** An earlier result for the same submission. Its notes, final decision and resolved flags are kept. */
  previous?: ScreeningResult;
}

/**
 * Runs the full deterministic screening for one submission and returns the established ScreeningResult.
 * Missing information, verification evidence, flags and the organizer's decision stay in separate fields.
 */
export async function runScreening(submission: Submission, opts: RunOptions): Promise<ScreeningResult> {
  const policy = opts.policy ?? DEFAULT_POLICY;
  // A repository is verified only if one was submitted. Not every deliverable lives in GitHub.
  const outcome = submission.githubUrl?.trim() ? await opts.verify(submission.githubUrl) : undefined;
  const artifactReviews = await reviewArtifacts(submission, opts.providers ?? DEFAULT_PROVIDERS);

  const completeness = checkCompleteness(submission, outcome, policy);
  const drafts: FlagDraft[] = [
    ...completeness.flags,
    ...artifactFlags(submission, artifactReviews),
    ...(outcome?.status === "ok" ? evaluateEvidence(outcome.evidence, submission, policy) : []),
  ];

  const flags = finalizeFlags(submission.id, drafts, opts.previous?.flags ?? []);
  const { status, explanation } = deriveStatus(completeness.missing, flags);

  return {
    submissionId: submission.id,
    source: "live",
    status,
    explanation,
    missing: completeness.missing,
    flags,
    requirements: completeness.requirements,
    artifactReviews,
    github: outcome ? summarize(outcome) : undefined,
    // Carried over: a re-run must never erase an organizer's work.
    notes: opts.previous?.notes ?? [],
    finalDecision: opts.previous?.finalDecision ?? "pending",
  };
}

/** Assigns stable ids, drops duplicate codes, and keeps earlier resolutions for flags that are still raised. */
function finalizeFlags(submissionId: string, drafts: FlagDraft[], previous: ScreeningFlag[]): ScreeningFlag[] {
  const seen = new Set<string>();
  const out: ScreeningFlag[] = [];
  for (const d of drafts) {
    if (seen.has(d.code)) continue;
    seen.add(d.code);
    const prior = previous.find((p) => p.code === d.code && p.resolved);
    out.push({
      ...d,
      id: `${submissionId}:${d.code}`,
      resolved: !!prior,
      resolvedBy: prior?.resolvedBy,
      resolutionNote: prior?.resolutionNote,
    });
  }
  return out;
}

function summarize(outcome: VerifyOutcome): GithubVerification {
  if (outcome.status === "ok") return summarizeEvidence(outcome.evidence);
  return {
    checkedAt: outcome.checkedAt,
    // Only a confirmed 404/403 means "not accessible". Failures and bad URLs leave it unknown.
    accessible: outcome.status === "not_accessible" ? false : undefined,
    limitations: [outcome.message],
  };
}

function summarizeEvidence(ev: RepoEvidence): GithubVerification {
  const instants = collectCommits(ev.branches).flatMap((c) =>
    [parseInstant(c.authorDate), parseInstant(c.committerDate)].filter((t): t is number => t !== null),
  );
  const defaultBranch = ev.branches.find((b) => b.isDefault);
  return {
    checkedAt: ev.fetchedAt,
    accessible: true,
    repoCreatedAt: ev.createdAt,
    defaultBranch: ev.defaultBranch,
    earliestCommitAt: instants.length ? new Date(Math.min(...instants)).toISOString() : undefined,
    isFork: ev.isFork,
    upstream: ev.upstream?.fullName,
    hasReadme: ev.readme?.exists,
    commitCount: defaultBranch?.totalCommits,
    branches: ev.branches.map((b) => ({
      name: b.name,
      isDefault: b.isDefault,
      commitsExamined: b.commits.length,
      historyComplete: b.historyComplete,
      totalCommits: b.totalCommits,
      earliestCommitAt: b.earliest ? b.earliest.authorDate : undefined,
    })),
    limitations: [
      ...ev.limitations.map((l) => l.message),
      ...(ev.branchesNotInspected > 0 ? [`${ev.branchesNotInspected} other branch(es) were not inspected.`] : []),
      ...(ev.branchListComplete ? [] : ["The branch list was incomplete."]),
    ],
  };
}
