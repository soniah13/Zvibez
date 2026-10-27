import type { Track } from "../constants";
import { EVENT_WINDOW, type BuildWindow } from "./window";

/**
 * Screening policy. Every value here is an event-rule decision, not a technical constant.
 * Defaults are deliberately conservative: when in doubt Charlie asks a human.
 */
export interface ScreeningPolicy {
  window: BuildWindow;

  /** Author vs committer dates further apart than this are flagged. Rebases and amends cause benign gaps. */
  timestampDiscrepancyThresholdMs: number;

  /** Commits older than the repository by more than this suggest imported history (local init then push is normal). */
  importedHistoryToleranceMs: number;

  /** The first commit is "large" if it changes at least this many lines OR files. */
  largeInitialCommit: { minTotalChanges: number; minFilesChanged: number };

  /**
   * ORGANIZER DECISION REQUIRED: are forks, starter templates and inherited code eligible?
   * - "manual_review": forks and large initial commits always need a human, even if declared (default).
   * - "info_if_declared": if the team declared external code in their submission, the finding is
   *   downgraded to informational (still listed, no longer blocks "Ready for review").
   * Charlie never decides eligibility itself.
   */
  declaredExternalCodeHandling: "manual_review" | "info_if_declared";

  /**
   * ORGANIZER DECISION REQUIRED: which tracks must provide a live demo link?
   * Default: none. A demo link is optional everywhere until the organizers say otherwise.
   * Charlie checks link presence and format only; it never fetches or tests a deployment.
   */
  demoUrlRequiredTracks: Track[];

  /** Max example commits listed per flag. */
  maxCommitSamples: number;
}

export const DEFAULT_POLICY: ScreeningPolicy = {
  window: EVENT_WINDOW,
  timestampDiscrepancyThresholdMs: 24 * 60 * 60 * 1000,
  importedHistoryToleranceMs: 60 * 60 * 1000,
  largeInitialCommit: { minTotalChanges: 2000, minFilesChanged: 50 },
  declaredExternalCodeHandling: "manual_review",
  demoUrlRequiredTracks: [],
  maxCommitSamples: 5,
};
