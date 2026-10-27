import type { FinalDecision, ScreeningStatus, Track } from "./constants";
import type { Artifact, Discipline, ProjectFormat } from "./taxonomy";

export interface TeamMember {
  name: string;
  email?: string;
}

export interface Submission {
  id: string;
  createdAt: string; // ISO UTC
  teamName: string;
  members: TeamMember[];
  /** Official competition track. Separate from disciplines and formats, which describe what was built. */
  track: Track;
  /** One or more. A project can span several disciplines. */
  disciplines: Discipline[];
  /** Required when disciplines includes "other". */
  otherDiscipline?: string;
  /** One or more. Decides which supporting evidence is expected. */
  projectFormats: ProjectFormat[];
  challenge: string;
  problemDescription: string;
  proposedSolution: string;
  /** The repository Charlie verifies automatically. Optional: not every deliverable lives in GitHub. */
  githubUrl?: string;
  /** Any other evidence: deployments, prototypes, notebooks, dashboards, model cards, API docs and so on. */
  artifacts: Artifact[];
  demoUrl?: string;
  /** Free-form tags. Never validated against an approved list. */
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

export type RequirementOutcome = "met" | "declared_not_inspected" | "not_found" | "unknown";

/** One piece of evidence the declared format or track expects, and what Charlie found. */
export interface RequirementResult {
  key: string;
  label: string;
  level: "required" | "expected";
  outcome: RequirementOutcome;
  /** What satisfied it (or what is missing), in plain words. */
  detail: string;
}

/** What Charlie recorded about a non-GitHub artifact. It never claims more than was checked. */
export interface ArtifactReview {
  url: string;
  type: string;
  platform: string;
  description: string;
  /** Team-supplied note, shown as a claim. */
  timelineEvidence?: string;
  /** "manual_review" for platforms without an adapter: nothing was fetched or verified. */
  verification: "manual_review" | "not_applicable";
  /** Whether the artifact's creation time was verified automatically. Only true if an adapter really did it. */
  creationTimeVerified: boolean;
  note: string;
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
  /** Evidence expected for the declared formats and track, with what was found. */
  requirements: RequirementResult[];
  /** Non-repository artifacts, recorded for organizer inspection. */
  artifactReviews: ArtifactReview[];
  github?: GithubVerification;
  notes: ReviewNote[];
  finalDecision: FinalDecision;
}

export interface SubmissionWithScreening {
  submission: Submission;
  screening: ScreeningResult;
}
