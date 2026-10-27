import type { VerifyOutcome } from "../github/types";
import { isSafeHttpUrl, parseGithubUrl } from "../validation";
import type { MissingItem, RequirementResult, Submission } from "../types";
import { DEFAULT_POLICY, type ScreeningPolicy } from "./policy";
import { evaluateRequirements, hasDemoEvidence } from "./requirements";
import type { FlagDraft } from "./rules";

export interface CompletenessResult {
  /** Missing mandatory information or required materials. Drives the "Incomplete" status. */
  missing: MissingItem[];
  /** Inconclusive checks and informational notes. Drive "Needs review", never misconduct. */
  flags: FlagDraft[];
  /** Evidence the declared formats and track expect, with what was found for each. */
  requirements: RequirementResult[];
}

/**
 * Checks required submission fields, then the evidence the declared project formats and track expect.
 * Only file paths, README keywords and declared artifact types are inspected; submitted code is never
 * read or executed, and no artifact link is opened. What counts as expected evidence comes from the
 * policy, so it follows the organizers' rules instead of assuming every project is a web application.
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
  if (!submission.projectFormats?.length) {
    missing.push({ field: "Project format", reason: "Select at least one project format so Charlie knows what evidence to expect." });
  }
  if (!submission.disciplines?.length) {
    missing.push({ field: "Disciplines", reason: "Select at least one discipline." });
  } else if (submission.disciplines.includes("other") && empty(submission.otherDiscipline)) {
    missing.push({ field: "Other discipline", reason: "Describe the other discipline." });
  }

  // GitHub is optional in general; whether a repository is expected depends on the declared format.
  if (!empty(submission.githubUrl) && !parseGithubUrl(submission.githubUrl!)) {
    missing.push({ field: "GitHub repository URL", reason: "Not a valid https://github.com/owner/repo URL." });
  }

  (submission.artifacts ?? []).forEach((a, i) => {
    const n = i + 1;
    if (!isSafeHttpUrl(a.url ?? "")) missing.push({ field: `Artifact ${n} link`, reason: "Not a valid http(s) URL." });
    if (empty(a.description)) missing.push({ field: `Artifact ${n} description`, reason: "Describe what this evidence is." });
  });

  // Demo or deployment: required only for the tracks the organizers designate. The demo URL or a suitable
  // artifact counts. Presence and format only: Charlie never opens or tests it.
  if (!empty(submission.demoUrl) && !isSafeHttpUrl(submission.demoUrl!)) {
    missing.push({ field: "Demo URL", reason: "Provided but not a valid http(s) URL." });
  } else if (policy.demoUrlRequiredTracks.includes(submission.track) && !hasDemoEvidence(submission, policy)) {
    missing.push({ field: "Demo URL", reason: `A working deployment or demo is required for the ${submission.track} track. Provide a demo link, or an artifact such as a deployed app, prototype, API collection, dashboard or demo video.` });
  }

  const req = evaluateRequirements(submission, outcome, policy);
  missing.push(...req.missing);
  flags.push(...req.flags);

  if (!outcome) return { missing, flags, requirements: req.results };

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
    case "ok": {
      const ev = outcome.evidence;
      const readmeExpected = submission.projectFormats?.some((f) => policy.readmeExpectedFormats.includes(f));
      if (ev.readme && readmeExpected) {
        if (!ev.readme.exists) {
          flags.push({
            code: "NO_README",
            kind: "inconclusive",
            title: "No README found",
            detail: "The repository has no README, so what the project does and how to run it cannot be checked from the repository.",
            evidenceUrl: ev.htmlUrl,
          });
        } else if (ev.readme.hasSetupHints === false) {
          flags.push({
            code: "README_NO_SETUP_HINTS",
            kind: "inconclusive",
            title: "README has no obvious setup or run instructions",
            detail:
              "A keyword check found no install, run or test guidance. This is a heuristic and can miss unusual wording, so please read the README.",
            evidenceUrl: ev.readme.url ?? ev.htmlUrl,
          });
        }
      }
      break;
    }
  }
  return { missing, flags, requirements: req.results };
}
