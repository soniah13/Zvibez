import type { RepoEvidence, VerifyOutcome } from "../github/types";
import { parseGithubUrl } from "../validation";
import type { MissingItem, Submission } from "../types";
import { DEFAULT_POLICY, type ScreeningPolicy } from "./policy";
import type { FlagDraft } from "./rules";

const SOURCE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|ipynb|r|jl|java|kt|go|rs|rb|php|cs|cpp|cc|c|h|swift|dart|vue|svelte|scala|sql|sh|html|css)$/i;
const ANALYSIS_EXT = /\.(ipynb|py|r|jl|sql)$/i;
const MODEL_EXT = /\.(pkl|pickle|joblib|h5|hdf5|pt|pth|onnx|safetensors|pb|ckpt|tflite|keras|bin)$/i;
const DATA_EXT = /\.(csv|tsv|parquet|feather|xlsx|xls|arrow)$/i;
const EVAL_PATH = /(^|[/_.-])(eval|evaluation|metrics?|results?|benchmarks?)([/_.-]|$)/i;
const IGNORED_DIR = /(^|\/)(node_modules|vendor|dist|build|\.git|\.github|\.next|venv|\.venv|__pycache__)\//i;

export interface CompletenessResult {
  /** Missing mandatory information or required materials. Drives the "Incomplete" status. */
  missing: MissingItem[];
  /** Inconclusive checks and informational notes. Drive "Needs review", never misconduct. */
  flags: FlagDraft[];
}

/**
 * Checks required submission fields and, when GitHub evidence is available, the repository materials.
 * It only inspects file paths and README keywords; it never reads or executes submitted code.
 */
export function checkCompleteness(
  submission: Submission,
  outcome: VerifyOutcome | undefined,
  policy: ScreeningPolicy = DEFAULT_POLICY,
): CompletenessResult {
  const missing: MissingItem[] = [];
  const flags: FlagDraft[] = [];
  const empty = (v: string | undefined) => !v || v.trim() === "";

  const required: [string, string | undefined][] = [
    ["Team name", submission.teamName],
    ["Track", submission.track],
    ["Challenge", submission.challenge],
    ["Problem description", submission.problemDescription],
    ["Proposed solution", submission.proposedSolution],
    ["AI tools used", submission.aiToolsUsed],
    ["External resources", submission.externalResources],
    ["Testing instructions", submission.testingInstructions],
  ];
  for (const [field, value] of required) {
    if (empty(value)) missing.push({ field, reason: "Required field is empty." });
  }
  if (!submission.members?.some((m) => !empty(m.name))) {
    missing.push({ field: "Team members", reason: "At least one named member is required." });
  }
  if (!submission.technologies?.some((t) => !empty(t))) {
    missing.push({ field: "Technologies", reason: "At least one technology is required." });
  }
  if (empty(submission.githubUrl)) {
    missing.push({ field: "GitHub repository URL", reason: "Required field is empty." });
  } else if (!parseGithubUrl(submission.githubUrl)) {
    missing.push({ field: "GitHub repository URL", reason: "Not a valid https://github.com/owner/repo URL." });
  }

  // Demo link: only mandatory for tracks the organizers designate (default: none). Presence and format only.
  if (!empty(submission.demoUrl)) {
    if (!/^https?:\/\//i.test(submission.demoUrl!.trim())) {
      missing.push({ field: "Demo URL", reason: "Provided but not a valid http(s) URL." });
    }
  } else if (policy.demoUrlRequiredTracks.includes(submission.track)) {
    missing.push({ field: "Demo URL", reason: `A live demo is required for the ${submission.track} track.` });
  }

  if (!outcome) return { missing, flags };

  switch (outcome.status) {
    case "invalid_url":
      break; // already reported by the field check above
    case "not_accessible":
      missing.push({
        field: "GitHub repository",
        reason: `Repository could not be accessed (${outcome.reason === "not_found" ? "not found or private" : "access forbidden"}). Confirm the URL is correct and the repository is public.`,
      });
      break;
    case "unavailable":
      flags.push({
        code: "GITHUB_UNAVAILABLE",
        kind: "inconclusive",
        title: "GitHub verification could not be completed",
        detail: `${outcome.message} This is a technical failure, not evidence of misconduct. Re-run verification later.`,
      });
      break;
    case "ok":
      repoChecks(submission, outcome.evidence, missing, flags);
      break;
  }
  return { missing, flags };
}

function repoChecks(submission: Submission, ev: RepoEvidence, missing: MissingItem[], flags: FlagDraft[]) {
  const url = ev.htmlUrl;

  if (!ev.tree) {
    flags.push({
      code: "SOURCE_UNVERIFIED",
      kind: "inconclusive",
      title: "Repository file list could not be retrieved",
      detail: "Source files and project artifacts could not be checked automatically.",
      evidenceUrl: url,
    });
  } else {
    const paths = ev.tree.paths.filter((p) => !IGNORED_DIR.test(p));
    const source = paths.filter((p) => SOURCE_EXT.test(p));
    if (source.length === 0) {
      if (ev.tree.truncated) {
        flags.push({
          code: "SOURCE_UNVERIFIED",
          kind: "inconclusive",
          title: "No source files seen, but the file list was truncated",
          detail: "GitHub truncated the repository tree, so the absence of source files is not confirmed.",
          evidenceUrl: url,
        });
      } else {
        missing.push({ field: "Source code", reason: "No source files were found in the repository file tree." });
      }
    }

    if (submission.track === "Data Science") {
      const analysis = paths.filter((p) => ANALYSIS_EXT.test(p));
      if (analysis.length === 0 && source.length > 0 && !ev.tree.truncated) {
        missing.push({
          field: "Data science code",
          reason: "No notebooks or analysis scripts (.ipynb, .py, .r, .jl, .sql) were found.",
        });
      } else if (analysis.length === 0 && ev.tree.truncated) {
        flags.push({
          code: "DS_ARTIFACTS_UNVERIFIED",
          kind: "inconclusive",
          title: "Data science artifacts could not be confirmed",
          detail: "The repository tree was truncated, so notebooks and scripts may exist that were not seen.",
          evidenceUrl: url,
        });
      }
      const hasSupport = paths.some((p) => MODEL_EXT.test(p) || DATA_EXT.test(p) || EVAL_PATH.test(p));
      if (!hasSupport && analysis.length > 0) {
        flags.push({
          code: "DS_NO_SUPPORTING_ARTIFACTS",
          kind: "inconclusive",
          title: "No model, data or evaluation files found",
          detail:
            "Code was found but no model files, datasets or evaluation outputs. Not every project needs all of these (data may be external, results may be in the README or notebooks), so a reviewer should check.",
          evidenceUrl: url,
        });
      }
    }
  }

  if (ev.readme) {
    if (!ev.readme.exists) {
      flags.push({
        code: "NO_README",
        kind: "inconclusive",
        title: "No README found",
        detail: "The repository has no README, so what the project does and how to run it cannot be checked from the repository.",
        evidenceUrl: url,
      });
    } else if (ev.readme.hasSetupHints === false) {
      flags.push({
        code: "README_NO_SETUP_HINTS",
        kind: "inconclusive",
        title: "README has no obvious setup or run instructions",
        detail:
          "A keyword check found no install, run or test guidance. This is a heuristic and can miss unusual wording, so please read the README.",
        evidenceUrl: ev.readme.url ?? url,
      });
    }
  }
}
