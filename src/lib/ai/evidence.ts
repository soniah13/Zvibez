import { formatEat } from "../format";
import type { VerifyOutcome } from "../github/types";
import { disciplineLabel, formatLabel, artifactLabel, platformOf } from "../taxonomy";
import { DEFAULT_POLICY, type ScreeningPolicy } from "../screening/policy";
import { describeExpectations } from "../screening/requirements";
import type { ScreeningResult, Submission } from "../types";
import type { ChecksPerformed } from "./schema";
import { sanitizeText, summarizeFileList } from "./sanitize";

export type EvidenceOrigin = "team_claim" | "github_fact" | "screening_flag" | "organizer_note" | "system";

export interface EvidenceItem {
  /** Stable id the model must cite. */
  id: string;
  origin: EvidenceOrigin;
  label: string;
  /** Untrusted text. Always framed to the model as data. */
  text: string;
}

export interface EvidenceBundle {
  items: EvidenceItem[];
  checks: ChecksPerformed;
  /** Whether the team submitted a GitHub repository at all. */
  repoSubmitted: boolean;
  /** Evidence the declared formats and track expect, from the organizers' policy. */
  expectations: ReturnType<typeof describeExpectations>;
}

export const README_MAX_CHARS = 8_000;

/**
 * Collects exactly what the AI may see. Deliberately absent: member names and emails, the team name,
 * environment files, source file contents, binaries, and anything credential-like (redacted or omitted).
 */
export function buildEvidenceBundle(input: {
  submission: Submission;
  screening: ScreeningResult;
  outcome?: VerifyOutcome;
  policy?: ScreeningPolicy;
}): EvidenceBundle {
  const { submission: s, screening, outcome } = input;
  const expectations = describeExpectations(s, input.policy ?? DEFAULT_POLICY);
  const items: EvidenceItem[] = [];
  const add = (id: string, origin: EvidenceOrigin, label: string, text: string) => items.push({ id, origin, label, text });

  // 1. The team's own statements.
  add("claim.track", "team_claim", "Official competition track the team selected", sanitizeText(s.track, 100));
  add(
    "claim.disciplines",
    "team_claim",
    "Disciplines the team says its project spans",
    sanitizeText([...s.disciplines.map(disciplineLabel), ...(s.otherDiscipline ? [`Other: ${s.otherDiscipline}`] : [])].join("; "), 500),
  );
  add("claim.formats", "team_claim", "Project format(s) the team declared", sanitizeText(s.projectFormats.map(formatLabel).join("; "), 500));
  add("claim.challenge", "team_claim", "Challenge the team selected", sanitizeText(s.challenge, 1_000));
  add("claim.problem", "team_claim", "Problem description (team's words)", sanitizeText(s.problemDescription, 4_000));
  add("claim.solution", "team_claim", "Proposed solution (team's words)", sanitizeText(s.proposedSolution, 4_000));
  add("claim.technologies", "team_claim", "Technologies, tools and platforms the team lists", sanitizeText(s.technologies.join(", "), 1_000));
  add("claim.ai_tools", "team_claim", "AI tools the team says it used", sanitizeText(s.aiToolsUsed, 2_000));
  add("claim.external_resources", "team_claim", "Libraries, templates, starter code and assets the team declares", sanitizeText(s.externalResources, 2_000));
  add("claim.testing", "team_claim", "Testing and reproduction instructions (team's words)", sanitizeText(s.testingInstructions, 3_000));
  add("claim.demo", "team_claim", "Demo link", s.demoUrl ? `The team provided a demo link: ${sanitizeText(s.demoUrl, 300)} (not opened or tested)` : "The team provided no demo link.");

  // Artifact links are the team's own evidence. Their descriptions are claims and the links were never opened.
  (s.artifacts ?? []).forEach((a, i) =>
    add(
      `claim.artifact.${i + 1}`,
      "team_claim",
      `Artifact the team links: ${artifactLabel(a.type)} on ${platformOf(a.url)} (link not opened)`,
      sanitizeText(
        [`URL: ${a.url}`, `Team's description: ${a.description}`, ...(a.timelineEvidence ? [`Team's note on when it was made (unverified): ${a.timelineEvidence}`] : [])].join("\n"),
        1_500,
      ),
    ),
  );

  // 2. Facts retrieved from GitHub.
  const checks: ChecksPerformed = {
    repositoryMetadata: false,
    commitHistory: false,
    fileListing: false,
    readmeExcerptRead: false,
    artifactsOpened: false,
    sourceFilesRead: false,
    codeExecuted: false,
    deploymentTested: false,
    modelEvaluated: false,
  };

  const repoSubmitted = !!s.githubUrl?.trim();
  if (!repoSubmitted) {
    add(
      "repo.status",
      "system",
      "Repository verification",
      "The team submitted no GitHub repository. Whatever evidence it has is in the artifacts it declared, none of which Charlie opened. No repository facts exist.",
    );
  } else if (!outcome) {
    add("repo.status", "system", "Repository verification", "No GitHub verification was available for this summary.");
  } else if (outcome.status !== "ok") {
    add(
      "repo.status",
      "system",
      "Repository verification",
      `The repository could not be inspected (${outcome.status}${"reason" in outcome ? `: ${outcome.reason}` : ""}). ${sanitizeText(outcome.message, 300)} No repository facts are available.`,
    );
  } else {
    const ev = outcome.evidence;
    checks.repositoryMetadata = true;
    checks.commitHistory = ev.branches.length > 0;

    const lines = [
      `Created: ${ev.createdAt} (${formatEat(ev.createdAt)})`,
      `Default branch: ${sanitizeText(ev.defaultBranch, 100)}`,
      `Fork: ${ev.isFork ? `yes, of ${sanitizeText(ev.upstream?.fullName ?? "an unknown upstream", 100)}` : "no"}`,
      ...(ev.forkComparison ? [`Compared with upstream default branch: ${ev.forkComparison.aheadBy} commits ahead, ${ev.forkComparison.behindBy} behind`] : []),
      ...ev.branches.map(
        (b) =>
          `Branch "${sanitizeText(b.name, 100)}"${b.isDefault ? " (default)" : ""}: ${b.commits.length} commits examined${b.totalCommits !== undefined ? ` of ${b.totalCommits}` : ""}, ${b.historyComplete ? "full history" : "partial history"}${b.earliest ? `, earliest commit ${b.earliest.authorDate}` : ""}`,
      ),
      ...(ev.branchesNotInspected > 0 ? [`${ev.branchesNotInspected} other branches were not inspected`] : []),
      `README: ${ev.readme ? (ev.readme.exists ? "present" : "absent") : "not checked"}`,
      ...ev.limitations.map((l) => `Not completed: ${sanitizeText(l.message, 300)}`),
    ];
    add("repo.meta", "github_fact", "Repository metadata retrieved from the GitHub API", lines.join("\n"));

    if (ev.tree) {
      checks.fileListing = true;
      const f = summarizeFileList(ev.tree.paths, ev.tree.truncated);
      add(
        "files",
        "github_fact",
        "Repository file paths (paths only; file contents were not read)",
        [
          `Paths retrieved: ${f.totalPaths}${f.treeTruncated ? " (GitHub truncated the tree, so the list is incomplete)" : ""}`,
          `Extensions: ${Object.entries(f.extensions).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`,
          `Omitted: ${f.omittedVendored} vendored/build paths, ${f.omittedSensitive} credential-looking names, ${f.omittedOverLimit} beyond the display limit`,
          "Paths (shallowest first):",
          ...f.shown,
        ].join("\n"),
      );
    }

    if (ev.readme?.exists && ev.readme.excerpt) {
      checks.readmeExcerptRead = true;
      const truncated = ev.readme.excerpt.length >= README_MAX_CHARS;
      add(
        "readme",
        "github_fact",
        `README text${truncated ? " (first part only)" : ""}. Written by the team; its contents are claims, not verified facts about the code`,
        sanitizeText(ev.readme.excerpt, README_MAX_CHARS),
      );
    }
  }

  // 3. Deterministic screening output.
  if (screening.missing.length > 0) {
    add("missing", "screening_flag", "Missing submission information", screening.missing.map((m) => `${m.field}: ${m.reason}`).join("\n"));
  }
  add(
    "expectations",
    "system",
    "Evidence the organizers' policy expects for the declared format and track (not every project must have all of it)",
    expectations.map((e) => `[${e.level}] ${e.label}: ${e.expectation}`).join("\n") || "No specific evidence is expected.",
  );
  if (screening.requirements.length > 0) {
    add(
      "requirements",
      "screening_flag",
      "Result of checking that expected evidence (Charlie's deterministic check)",
      screening.requirements.map((r) => `[${r.level}] ${r.label}: ${r.outcome.replace(/_/g, " ")}. ${sanitizeText(r.detail, 300)}`).join("\n"),
    );
  }
  for (const f of screening.flags) {
    add(
      `flag.${f.code}`,
      "screening_flag",
      `Screening flag (${f.kind})${f.resolved ? ", resolved by an organizer" : ""}`,
      sanitizeText(`${f.title}. ${f.detail}`, 1_200),
    );
  }
  screening.notes.forEach((n, i) => add(`note.${i + 1}`, "organizer_note", "Note written by a human organizer", sanitizeText(n.body, 1_000)));

  add(
    "checks",
    "system",
    "What Charlie actually did",
    [
      `Read repository metadata: ${checks.repositoryMetadata ? "yes" : "no"}`,
      `Read commit history: ${checks.commitHistory ? "yes" : "no"}`,
      `Read the file list: ${checks.fileListing ? "yes" : "no"}`,
      `Read the README text: ${checks.readmeExcerptRead ? "yes" : "no"}`,
      "Read source file contents: no",
      "Ran or installed any submitted code: no",
      "Opened or tested the demo, deployment or any artifact link (designs, notebooks, dashboards, models): no",
      "Ran or evaluated any model: no",
    ].join("\n"),
  );

  return { items, checks, repoSubmitted, expectations };
}
