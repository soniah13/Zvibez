import type { VerifyOutcome } from "../github/types";
import type { MissingItem, RequirementOutcome, RequirementResult, Submission } from "../types";
import { artifactLabel, formatLabel, platformOf, type ArtifactType, type ProjectFormat } from "../taxonomy";
import type { Track } from "../constants";
import { parseGithubUrl, isSafeHttpUrl } from "../validation";
import type { EvidenceRequirement, ScreeningPolicy } from "./policy";
import type { FlagDraft } from "./rules";

export type RequirementKey =
  | "repository"
  | "source_code"
  | "implementation_code"
  | "api_documentation"
  | "analysis_artifacts"
  | "supporting_artifacts"
  | "model_or_inference"
  | "evaluation_evidence"
  | "data_provenance"
  | "methodology"
  | "design_files"
  | "user_flows"
  | "pipeline_artifacts"
  | "data_flow"
  | "deliverable_artifact";

export const SOURCE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|ipynb|r|jl|java|kt|go|rs|rb|php|cs|cpp|cc|c|h|swift|dart|vue|svelte|scala|sql|sh|html|css)$/i;
const ANALYSIS_EXT = /\.(ipynb|py|r|rmd|qmd|jl|sql|pbix|pbit|twb|twbx|xlsx|xls)$/i;
const MODEL_EXT = /\.(pkl|pickle|joblib|h5|hdf5|pt|pth|onnx|safetensors|pb|ckpt|tflite|keras|bin)$/i;
const DATA_EXT = /\.(csv|tsv|parquet|feather|xlsx|xls|arrow)$/i;
const EVAL_PATH = /(^|[/_.-])(eval|evaluation|metrics?|results?|benchmarks?)([/_.-]|$)/i;
const IGNORED_DIR = /(^|\/)(node_modules|vendor|dist|build|\.git|\.github|\.next|venv|\.venv|__pycache__)\//i;

interface Definition {
  label: string;
  /** Field name shown in "missing information" when a required item is absent. */
  missingField: string;
  /** What good evidence looks like. Shown to teams on the form and given to the AI as the expectation. */
  expectation: string;
  /** Declared artifacts of these types satisfy it (their content is not inspected). */
  artifactTypes: ArtifactType[];
  /** Any repository path matching satisfies it. */
  repoPaths?: RegExp;
  /** Matched against the README excerpt (a heuristic: it shows the README mentions it, nothing more). */
  readmeHints?: RegExp;
  /** Flag code when an "expected" item is not found. */
  flagCode: string;
  /** Evaluate only if this requirement was not itself "not_found" (avoids duplicate complaints). */
  skipWhenNotFound?: RequirementKey;
  /** Evaluate only if this requirement was met or declared (otherwise the complaint would repeat). */
  onlyWhenMet?: RequirementKey;
}

export const REQUIREMENTS: Record<RequirementKey, Definition> = {
  repository: {
    label: "Source repository",
    missingField: "Source repository",
    expectation: "A public GitHub repository with the project's source.",
    artifactTypes: ["github_repository"],
    flagCode: "NO_REPOSITORY",
  },
  source_code: {
    label: "Source code",
    missingField: "Source code",
    expectation: "Source files in the repository.",
    artifactTypes: ["github_repository"],
    repoPaths: SOURCE_EXT,
    flagCode: "NO_SOURCE_CODE",
  },
  implementation_code: {
    label: "Implementation code or notebook",
    missingField: "Implementation code",
    expectation: "Source files in a repository, or a notebook or reproducible script link.",
    artifactTypes: ["notebook", "reproducible_script", "github_repository"],
    repoPaths: SOURCE_EXT,
    flagCode: "NO_IMPLEMENTATION_CODE",
  },
  api_documentation: {
    label: "API documentation or test collection",
    missingField: "API documentation",
    expectation: "Endpoint documentation (OpenAPI, docs or README) or an API testing collection.",
    artifactTypes: ["api_docs", "api_collection"],
    repoPaths: /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$|(^|\/)(docs?|api)\/|postman/i,
    readmeHints: /\b(endpoints?|openapi|swagger|GET \/|POST \/|PUT \/|DELETE \/)/i,
    flagCode: "NO_API_DOCUMENTATION",
  },
  analysis_artifacts: {
    label: "Analysis code, notebook, queries or report outputs",
    missingField: "Data science code",
    expectation: "A notebook, analysis scripts, queries, a dashboard or report outputs.",
    artifactTypes: ["notebook", "reproducible_script", "dashboard", "evaluation_report"],
    repoPaths: ANALYSIS_EXT,
    flagCode: "NO_ANALYSIS_ARTIFACTS",
    skipWhenNotFound: "source_code",
  },
  supporting_artifacts: {
    label: "Model, data or evaluation files",
    missingField: "Supporting artifacts",
    expectation: "Model files, datasets or evaluation outputs (or a model card, dataset notes or evaluation report).",
    artifactTypes: ["model_card", "dataset_documentation", "evaluation_report"],
    repoPaths: undefined, // matched by predicate below
    flagCode: "NO_SUPPORTING_ARTIFACTS",
    onlyWhenMet: "analysis_artifacts",
  },
  model_or_inference: {
    label: "Model or inference artifacts",
    missingField: "Model or inference artifacts",
    expectation: "Model files, a training or inference script, or a model card.",
    artifactTypes: ["model_card", "reproducible_script", "notebook", "deployed_app"],
    repoPaths: new RegExp(`${MODEL_EXT.source}|(^|/)(predict|inference|infer|serve|train|training)[^/]*\\.(py|ipynb|r|jl|js|ts)$|(^|/)models?/`, "i"),
    flagCode: "NO_MODEL_OR_INFERENCE",
  },
  evaluation_evidence: {
    label: "Evaluation evidence",
    missingField: "Evaluation evidence",
    expectation: "Metrics, an evaluation report or notebook output showing how well the model or analysis performs.",
    artifactTypes: ["evaluation_report", "model_card", "notebook"],
    repoPaths: EVAL_PATH,
    readmeHints: /\b(accuracy|f1|precision|recall|rmse|mae|auc|roc|evaluation|cross[- ]validation|confusion matrix|benchmark)\b/i,
    flagCode: "NO_EVALUATION_EVIDENCE",
  },
  data_provenance: {
    label: "Data provenance",
    missingField: "Data provenance",
    expectation: "Where the data came from and how it may be used.",
    artifactTypes: ["dataset_documentation", "model_card"],
    repoPaths: new RegExp(`${DATA_EXT.source}|(^|/)(data|datasets?)/|data[-_ ]?(sources?|card|dictionary)`, "i"),
    readmeHints: /\b(dataset|data ?source|provenance|collected from|kaggle|open data|source of the data)\b/i,
    flagCode: "NO_DATA_PROVENANCE",
  },
  methodology: {
    label: "Methodology",
    missingField: "Methodology",
    expectation: "How the analysis or model was built, in a report, notebook or README.",
    artifactTypes: ["evaluation_report", "notebook", "model_card"],
    repoPaths: /(methodology|approach|report)\.(md|pdf|docx)$/i,
    readmeHints: /\b(methodolog\w*|approach|feature engineering|preprocess\w*|we (trained|cleaned|analy[sz]ed))\b/i,
    flagCode: "NO_METHODOLOGY",
  },
  design_files: {
    label: "Accessible design file or prototype",
    missingField: "Design file or prototype",
    expectation: "A link to the design file or interactive prototype that reviewers can open.",
    artifactTypes: ["design_prototype"],
    repoPaths: /\.(fig|sketch|xd|psd|ai)$/i,
    flagCode: "NO_DESIGN_FILES",
  },
  user_flows: {
    label: "User flows or design documentation",
    missingField: "User flows",
    expectation: "User flows, wireframes or research notes that show how the solution works.",
    artifactTypes: ["design_documentation"],
    repoPaths: /(user[-_ ]?flows?|wireframes?|journey)/i,
    flagCode: "NO_USER_FLOWS",
  },
  pipeline_artifacts: {
    label: "Pipeline configuration or scripts",
    missingField: "Pipeline configuration or scripts",
    expectation: "Pipeline definitions, workflow configuration or scripts that can be rerun.",
    artifactTypes: ["reproducible_script", "github_repository"],
    repoPaths: /(^|\/)(dags?|pipelines?|workflows?|airflow)\/|dbt_project\.yml$|Dockerfile$|docker-compose\.ya?ml$|Makefile$|\.(tf|sql|ya?ml|sh|py|ipynb)$/i,
    flagCode: "NO_PIPELINE_ARTIFACTS",
  },
  data_flow: {
    label: "Data flow explanation",
    missingField: "Data flow explanation",
    expectation: "An explanation or diagram of how data moves through the pipeline.",
    artifactTypes: ["design_documentation", "dataset_documentation"],
    repoPaths: /(architecture|diagram|lineage|data[-_ ]?flow)/i,
    readmeHints: /\b(data ?flow|architecture|lineage|schedule|ingest\w*|pipeline)\b/i,
    flagCode: "NO_DATA_FLOW",
  },
  deliverable_artifact: {
    label: "Project artifact",
    missingField: "Project artifact",
    expectation: "At least one artifact or repository that shows the deliverable, with a description.",
    artifactTypes: ["github_repository", "deployed_app", "api_docs", "api_collection", "design_prototype", "design_documentation", "dashboard", "notebook", "dataset_documentation", "model_card", "evaluation_report", "reproducible_script", "demo_video", "other"],
    flagCode: "NO_DELIVERABLE",
  },
};

/** Union of format and track requirements. The stricter level wins. Order is stable. */
export function resolveRequirements(
  submission: Pick<Submission, "projectFormats" | "track">,
  policy: ScreeningPolicy,
): EvidenceRequirement[] {
  const merged = new Map<RequirementKey, EvidenceRequirement>();
  const add = (list: EvidenceRequirement[] = []) => {
    for (const r of list) {
      const existing = merged.get(r.key);
      if (!existing || (existing.level === "expected" && r.level === "required")) merged.set(r.key, { ...r });
    }
  };
  for (const f of submission.projectFormats ?? []) add(policy.formatRequirements[f]);
  add(policy.trackRequirements[submission.track as Track]);
  return [...merged.values()];
}

/** Plain-language list of expected evidence, for the submission form and for the AI summary. */
export function describeExpectations(
  submission: Pick<Submission, "projectFormats" | "track">,
  policy: ScreeningPolicy,
): { key: RequirementKey; label: string; level: "required" | "expected"; expectation: string }[] {
  return resolveRequirements(submission, policy).map((r) => ({
    key: r.key,
    label: REQUIREMENTS[r.key].label,
    level: r.level,
    expectation: REQUIREMENTS[r.key].expectation,
  }));
}

const clean = (p: string[]) => p.filter((x) => !IGNORED_DIR.test(x));

export interface RequirementEvaluation {
  results: RequirementResult[];
  missing: MissingItem[];
  flags: FlagDraft[];
}

/**
 * Checks each expected piece of evidence against what was actually submitted and, if available, what
 * GitHub showed. A link alone never satisfies a requirement: the artifact must be of a suitable type
 * and described, or repository files must match. Nothing is opened, fetched or run.
 */
export function evaluateRequirements(
  submission: Submission,
  outcome: VerifyOutcome | undefined,
  policy: ScreeningPolicy,
): RequirementEvaluation {
  const results: RequirementResult[] = [];
  const missing: MissingItem[] = [];
  const flags: FlagDraft[] = [];
  const byKey = new Map<RequirementKey, RequirementOutcome>();

  const repoDeclared = !!submission.githubUrl?.trim() && parseGithubUrl(submission.githubUrl) !== null;
  const ev = outcome?.status === "ok" ? outcome.evidence : undefined;
  const paths = ev?.tree ? clean(ev.tree.paths) : undefined;
  const treeComplete = !!ev?.tree && !ev.tree.truncated;
  const readme = ev?.readme?.exists ? ev.readme.excerpt : undefined;
  const artifacts = (submission.artifacts ?? []).filter((a) => a.description?.trim() && isSafeHttpUrl(a.url));
  const unverifiable: string[] = [];

  for (const r of resolveRequirements(submission, policy)) {
    const def = REQUIREMENTS[r.key];
    if (def.skipWhenNotFound && byKey.get(def.skipWhenNotFound) === "not_found") continue;
    if (def.onlyWhenMet && !["met", "declared_not_inspected"].includes(byKey.get(def.onlyWhenMet) ?? "")) continue;

    let outcomeKey: RequirementOutcome;
    let detail: string;

    const declared = artifacts.filter((a) => def.artifactTypes.includes(a.type));
    const pathHit = paths && matchPaths(r.key, def, paths);

    if (r.key === "repository") {
      if (repoDeclared) [outcomeKey, detail] = ["met", "A GitHub repository URL was provided."];
      else if (declared.length) [outcomeKey, detail] = ["declared_not_inspected", "Only an additional repository artifact was declared; it is not verified automatically."];
      else [outcomeKey, detail] = ["not_found", "No GitHub repository was provided."];
    } else if (r.key === "deliverable_artifact" && repoDeclared) {
      [outcomeKey, detail] = ["met", "A GitHub repository was provided."];
    } else if (pathHit) {
      [outcomeKey, detail] = ["met", `Repository files match: ${pathHit.slice(0, 3).join(", ")}${pathHit.length > 3 ? ", ..." : ""}. File contents were not read.`];
    } else if (declared.length) {
      [outcomeKey, detail] = [
        "declared_not_inspected",
        `Declared by the team: ${declared.map((a) => `${artifactLabel(a.type)} (${platformOf(a.url)})`).join(", ")}. The link was not opened.`,
      ];
    } else if (readme && def.readmeHints?.test(readme)) {
      [outcomeKey, detail] = ["met", "The README text mentions it (keyword match only; not verified)."];
    } else if (repoDeclared && !treeComplete) {
      // Files may exist that were not seen: GitHub verification pending, failed, or truncated.
      [outcomeKey, detail] = ["unknown", ev ? "The repository file list was missing or incomplete, so this could not be confirmed." : "Repository evidence is not available yet (verification pending, failed or inaccessible), so this could not be checked."];
      if (ev) unverifiable.push(def.label);
    } else {
      [outcomeKey, detail] = ["not_found", def.expectation];
    }

    byKey.set(r.key, outcomeKey);
    results.push({ key: r.key, label: def.label, level: r.level, outcome: outcomeKey, detail });

    if (outcomeKey === "not_found") {
      if (r.level === "required") {
        missing.push({ field: def.missingField, reason: `${missingReason(r.key, def, submission)}` });
      } else {
        flags.push({
          code: def.flagCode,
          kind: "inconclusive",
          title: `No ${def.label.toLowerCase()} found`,
          detail: `Expected for the declared format: ${def.expectation} None was found in the declared artifacts${ev ? " or the repository files" : ""}. This may not apply to the project, so a reviewer should check.`,
          evidenceUrl: ev?.htmlUrl,
        });
      }
    }
  }

  if (ev && unverifiable.length) {
    flags.push({
      code: "SOURCE_UNVERIFIED",
      kind: "inconclusive",
      title: ev.tree ? "Repository file list was truncated" : "Repository file list could not be retrieved",
      detail: `Could not confirm: ${unverifiable.join(", ")}. The absence of evidence is not confirmed because the file list is incomplete.`,
      evidenceUrl: ev.htmlUrl,
    });
  }
  return { results, missing, flags };
}

function matchPaths(key: RequirementKey, def: Definition, paths: string[]): string[] | undefined {
  let hits: string[];
  if (key === "supporting_artifacts") hits = paths.filter((p) => MODEL_EXT.test(p) || DATA_EXT.test(p) || EVAL_PATH.test(p));
  else if (def.repoPaths) hits = paths.filter((p) => def.repoPaths!.test(p));
  else return undefined;
  return hits.length ? hits : undefined;
}

function missingReason(key: RequirementKey, def: Definition, s: Submission): string {
  const formats = (s.projectFormats ?? []).map(formatLabel).join(", ");
  switch (key) {
    case "source_code":
      return "No source files were found in the repository file tree.";
    case "repository":
      return `A source repository is required for the declared format (${formats}). Add a GitHub repository URL.`;
    case "analysis_artifacts":
      return "No notebooks, analysis scripts, queries, dashboards or report outputs were found in the repository or declared artifacts.";
    case "design_files":
      return "No design file or prototype link was declared. Add an artifact of type 'Design file or interactive prototype' with an accessible link.";
    default:
      return `No suitable evidence was found. Expected: ${def.expectation}`;
  }
}

/** Does the submission include something that counts as a working deployment or demo? Presence only. */
export function hasDemoEvidence(submission: Submission, policy: ScreeningPolicy): boolean {
  if (submission.demoUrl?.trim()) return true;
  return (submission.artifacts ?? []).some((a) => policy.demoEvidenceArtifactTypes.includes(a.type) && a.description?.trim() && isSafeHttpUrl(a.url));
}

export type { ProjectFormat };
