import type { FinalDecision, ScreeningStatus, Track } from "./constants";

export interface TeamMember {
  name: string;
  email?: string;
}

export interface Submission {
  id: string;
  createdAt: string; // ISO UTC
  teamName: string;
  members: TeamMember[];
  track: Track;
  challenge: string;
  problemDescription: string;
  proposedSolution: string;
  githubUrl: string;
  demoUrl?: string;
  technologies: string[];
  aiToolsUsed: string;
  externalResources: string;
  testingInstructions: string;
  mediaUrl?: string;
}

/**
 * verified: a fact retrieved from GitHub that is itself a concern (e.g. repo created before the event)
 * suspicious: a signal that may indicate pre-existing work; needs a human
 * inconclusive: the check could not be completed or the data is ambiguous (never proof of misconduct)
 * info: neutral context
 */
export type FlagKind = "verified" | "suspicious" | "inconclusive" | "info";

export interface ScreeningFlag {
  id: string;
  code: string;
  kind: FlagKind;
  title: string;
  detail: string;
  /** ISO timestamp the flag is about, where relevant. */
  timestamp?: string;
  /** Commit SHA(s) supporting the flag, where relevant. */
  commitSha?: string;
  evidenceUrl?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface MissingItem {
  field: string;
  reason: string;
}

export interface ReviewNote {
  id: string;
  author: string;
  createdAt: string;
  body: string;
}

export interface BranchSummary {
  name: string;
  isDefault: boolean;
  commitsExamined: number;
  /** True only if every commit reachable from this branch was examined. */
  historyComplete: boolean;
  totalCommits?: number;
  earliestCommitAt?: string;
}

export interface GithubVerification {
  checkedAt: string;
  /** true = reachable, false = confirmed not accessible (404/403), undefined = unknown (the check failed). */
  accessible?: boolean;
  /** Branches actually inspected. */
  branches?: BranchSummary[];
  /** Anything that was not or could not be checked. */
  limitations?: string[];
  repoCreatedAt?: string;
  defaultBranch?: string;
  earliestCommitAt?: string;
  isFork?: boolean;
  upstream?: string; // e.g. "owner/repo" of the fork's parent
  hasReadme?: boolean;
  commitCount?: number;
}

export interface ScreeningResult {
  submissionId: string;
  /** "mock" = seeded demo data; "live" = produced by a GitHub verification run. */
  source: "mock" | "live";
  status: ScreeningStatus;
  /** Plain-language explanation shown next to every status. */
  explanation: string;
  missing: MissingItem[];
  flags: ScreeningFlag[];
  github?: GithubVerification;
  notes: ReviewNote[];
  finalDecision: FinalDecision;
}

export interface SubmissionWithScreening {
  submission: Submission;
  screening: ScreeningResult;
}
