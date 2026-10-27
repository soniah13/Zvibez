import type { Track } from "../constants";
import type { ArtifactType, ProjectFormat } from "../taxonomy";
import type { RequirementKey } from "./requirements";
import { EVENT_WINDOW, type BuildWindow } from "./window";

/**
 * "required": if no suitable evidence is found the submission is Incomplete.
 * "expected": if none is found a reviewer is asked to look (inconclusive flag). Never blocks, never misconduct.
 */
export interface EvidenceRequirement {
  key: RequirementKey;
  level: "required" | "expected";
}

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
   * Tracks that must provide a working deployment or demo.
   * Confirmed event rule: Software Engineering submissions require one. Data Science projects need
   * reproducibility instructions and track-appropriate artifacts instead; add "Data Science" here
   * if the track rules ever require a deployed demo for it too.
   * Charlie checks link presence and format only; it never fetches or tests a deployment.
   */
  demoUrlRequiredTracks: Track[];

  /**
   * ORGANIZER DECISION REQUIRED: besides the demo URL field, which artifact types count as "a working
   * deployment or demo" for the tracks above. A command-line tool or API has no web page to open, and an
   * interactive prototype or dashboard is its own demo. Only presence is checked, never the link itself.
   */
  demoEvidenceArtifactTypes: ArtifactType[];

  /**
   * Evidence expected for each declared project format. A project with several formats gets the union,
   * and the stricter level wins. These describe typical evidence, not a checklist every project must pass:
   * a design project is never asked for a README or a model file, and a model project never for a frontend.
   */
  formatRequirements: Record<ProjectFormat, EvidenceRequirement[]>;

  /** Extra evidence the official track rules add, whatever the format. */
  trackRequirements: Partial<Record<Track, EvidenceRequirement[]>>;

  /** Formats for which a README with setup guidance is expected when a repository is submitted. */
  readmeExpectedFormats: ProjectFormat[];

  /** Max example commits listed per flag. */
  maxCommitSamples: number;
}

const req = (key: RequirementKey, level: "required" | "expected"): EvidenceRequirement => ({ key, level });

export const DEFAULT_POLICY: ScreeningPolicy = {
  window: EVENT_WINDOW,
  timestampDiscrepancyThresholdMs: 24 * 60 * 60 * 1000,
  importedHistoryToleranceMs: 60 * 60 * 1000,
  largeInitialCommit: { minTotalChanges: 2000, minFilesChanged: 50 },
  declaredExternalCodeHandling: "manual_review",
  demoUrlRequiredTracks: ["Software Engineering"],
  demoEvidenceArtifactTypes: ["deployed_app", "demo_video", "design_prototype", "api_collection", "dashboard"],
  formatRequirements: {
    web_app: [req("repository", "required"), req("source_code", "required")],
    backend_api: [req("repository", "required"), req("source_code", "required"), req("api_documentation", "expected")],
    mobile_desktop_cli: [req("repository", "required"), req("source_code", "required")],
    dashboard_bi: [req("analysis_artifacts", "required"), req("data_provenance", "expected"), req("methodology", "expected")],
    data_analysis: [req("analysis_artifacts", "required"), req("data_provenance", "expected"), req("methodology", "expected")],
    notebook: [req("analysis_artifacts", "required"), req("data_provenance", "expected"), req("methodology", "expected")],
    ml_ai: [
      req("implementation_code", "required"),
      req("model_or_inference", "expected"),
      req("evaluation_evidence", "expected"),
      req("data_provenance", "expected"),
    ],
    pipeline_automation: [req("pipeline_artifacts", "required"), req("repository", "expected"), req("data_flow", "expected")],
    design_prototype: [req("design_files", "required"), req("user_flows", "expected")],
    other: [req("deliverable_artifact", "required")],
  },
  trackRequirements: {
    // Confirmed event rule: track-appropriate artifacts, reproducibility and a model or script where applicable.
    "Data Science": [req("analysis_artifacts", "required"), req("supporting_artifacts", "expected")],
  },
  readmeExpectedFormats: ["web_app", "backend_api", "mobile_desktop_cli", "ml_ai", "pipeline_automation", "notebook", "data_analysis", "other"],
  maxCommitSamples: 5,
};
