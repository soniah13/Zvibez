import type { ScreeningResult, Submission } from "../types";
import type { EvidenceBundle } from "./evidence";
import { artifactLabel, disciplineLabel, formatLabel, platformOf } from "../taxonomy";
import type { ModelOutput, ProjectSummary, TeamClaims, VerificationSection } from "./schema";

/** Verdict language the model must never produce. Humans decide eligibility. */
export const VERDICT_LANGUAGE =
  /\b(disqualif\w*|ineligible|not eligible|is eligible|are eligible|should be (rejected|removed|banned)|must be (rejected|removed|banned)|cheat(ed|ing)?|plagiari[sz]\w*|fraud\w*)\b/i;

/** First-person or system claims of actions Charlie never performed. */
export const FALSE_ACTION_CLAIM =
  /\b(i|we|charlie|the (system|assistant|reviewer))\s+(have\s+|has\s+)?(ran|run|tested|executed|evaluated|inspected|opened|visited|deployed|installed|read the source|reviewed the source)\b/i;

const MAX = { features: 8, implementation: 8, strengths: 5, questions: 8, missing: 8, limitations: 8, technologies: 20 };
const REMOVED_PLACEHOLDER = "[removed: contained eligibility language or a claim of an action that was not performed]";

/** Evidence ids that actually describe the repository (not flags, claims or notes). */
const REPO_CONTENT_IDS = ["repo.meta", "files", "readme"];

interface SanitizeResult {
  assessment: ModelOutput;
  removedOrDowngraded: number;
  notes: string[];
}

/**
 * Enforces grounding on the model's answer. The model can be wrong, or can have been steered by hostile
 * README text, so nothing it returns is trusted until it has been checked against the evidence we sent.
 */
export function sanitizeOutput(out: ModelOutput, bundle: EvidenceBundle): SanitizeResult {
  const known = new Set(bundle.items.map((i) => i.id));
  const hasRepoContent = REPO_CONTENT_IDS.filter((id) => known.has(id));
  const claimText = bundle.items
    .filter((i) => i.id === "claim.technologies")
    .map((i) => i.text.toLowerCase())
    .join(" ");

  let removed = 0;
  const notes: string[] = [];
  const note = (n: string) => {
    removed++;
    if (!notes.includes(n)) notes.push(n);
  };

  const scrub = (text: string): string | null => {
    const t = text.trim();
    if (!t) return null;
    if (VERDICT_LANGUAGE.test(t) || FALSE_ACTION_CLAIM.test(t)) {
      note("Text with eligibility language or claims of unperformed actions was removed.");
      return null;
    }
    return t;
  };
  const scrubOrPlaceholder = (text: string) => scrub(text) ?? REMOVED_PLACEHOLDER;
  const cleanRefs = (refs: string[]): string[] => {
    const unique = [...new Set(refs)];
    const kept = unique.filter((r) => known.has(r));
    if (kept.length !== unique.length) note("Citations to evidence that was not supplied were removed.");
    return kept;
  };
  const cleanStrings = (list: string[], max: number) => [...new Set(list.map((s) => scrub(s)).filter((s): s is string => s !== null))].slice(0, max);

  const mainFeatures = out.mainFeatures.slice(0, MAX.features).flatMap((f) => {
    const feature = scrub(f.feature);
    if (!feature) return [];
    const refs = cleanRefs(f.evidenceRefs);
    const needs = f.basis === "readme" ? "readme" : f.basis === "file_paths" ? "files" : null;
    const ok = needs
      ? refs.includes(needs)
      : f.basis === "artifact_description"
        ? refs.some((r) => r.startsWith("claim.artifact."))
        : refs.some((r) => r.startsWith("claim."));
    if (!ok) {
      note("Features that were not backed by their stated source were removed.");
      return [];
    }
    return [{ feature, basis: f.basis, evidenceRefs: refs }];
  });

  const technologies = out.technologies.slice(0, MAX.technologies).flatMap((t) => {
    const name = scrub(t.name);
    if (!name) return [];
    const sourceAvailable =
      t.basis === "team_claim" ||
      (t.basis === "artifact_description" && [...known].some((id) => id.startsWith("claim.artifact."))) || (t.basis === "readme" && known.has("readme")) || (t.basis === "file_paths" && known.has("files"));
    if (sourceAvailable) return [{ name, basis: t.basis }];
    // Cited a source that was never supplied: keep only if the team itself listed it.
    if (claimText.includes(name.toLowerCase())) return [{ name, basis: "team_claim" as const }];
    note("Technologies attributed to unavailable sources were removed.");
    return [];
  });

  const implementationEvidence = out.implementationEvidence.slice(0, MAX.implementation).flatMap((e) => {
    const claim = scrub(e.claim);
    if (!claim) return [];
    const refs = cleanRefs(e.evidenceRefs);
    let status = e.status;
    let noteText = scrubOrPlaceholder(e.note);
    const backedByRepo = refs.some((r) => hasRepoContent.includes(r));
    if (status !== "not_verified" && !backedByRepo) {
      status = "not_verified";
      noteText = `${noteText} (Downgraded: no repository evidence supports this; it rests on the team's own statement.)`.trim();
      note("Implementation claims without repository evidence were downgraded to not verified.");
    }
    return [{ claim, status, evidenceRefs: refs, note: noteText }];
  });

  const strengths = out.strengths.slice(0, MAX.strengths).flatMap((s) => {
    const statement = scrub(s.statement);
    if (!statement) return [];
    const refs = cleanRefs(s.evidenceRefs);
    if (!refs.some((r) => hasRepoContent.includes(r))) {
      note("Strengths without repository evidence were removed.");
      return [];
    }
    return [{ statement, evidenceRefs: refs }];
  });

  const approachRefs = cleanRefs(out.approach.evidenceRefs);
  const approachText = scrub(out.approach.summary);
  // An approach nobody can trace to the supplied evidence is not shown as if it were grounded.
  const approach =
    approachText && approachRefs.length > 0
      ? { summary: approachText, evidenceRefs: approachRefs }
      : { summary: "The supplied evidence does not describe the implementation or analysis approach.", evidenceRefs: [] as string[] };
  if (!approachText || approachRefs.length === 0) note("An approach statement without supporting evidence was replaced.");

  const assessment: ModelOutput = {
    overview: scrubOrPlaceholder(out.overview),
    problemSummary: scrubOrPlaceholder(out.problemSummary),
    solutionSummary: scrubOrPlaceholder(out.solutionSummary),
    coreDeliverable: scrubOrPlaceholder(out.coreDeliverable),
    approach,
    mainFeatures,
    technologies,
    implementationEvidence,
    alignment: {
      rating: out.alignment.rating,
      reasoning: scrubOrPlaceholder(out.alignment.reasoning),
      evidenceRefs: cleanRefs(out.alignment.evidenceRefs),
    },
    strengths,
    missingInformation: cleanStrings(out.missingInformation, MAX.missing),
    judgeQuestions: cleanStrings(out.judgeQuestions, MAX.questions),
    limitations: cleanStrings(out.limitations, MAX.limitations),
  };
  return { assessment, removedOrDowngraded: removed, notes };
}

/** Limitations Charlie states itself, so they hold whatever the model wrote. */
export function deterministicLimitations(bundle: EvidenceBundle, removed: number): string[] {
  const c = bundle.checks;
  const list = [
    "Source file contents were not read, and no submitted code was run, installed or evaluated.",
    "Any demo or deployment link was not opened or tested.",
    "File paths show that files exist, not that they work or that they are the team's own work.",
    "Repository and commit timestamps are evidence, not proof, of when code was written.",
  ];
  if (!bundle.repoSubmitted) {
    list.push("No GitHub repository was submitted, so no repository evidence exists. This summary rests on the team's own description of its work and artifacts.");
  } else if (!c.repositoryMetadata) list.push("The repository could not be inspected, so this summary rests on the team's own description.");
  else {
    if (!c.fileListing) list.push("The repository file list was not available.");
    if (!c.readmeExcerptRead) list.push("README text was not available to read.");
  }
  if (bundle.items.some((i) => i.id.startsWith("claim.artifact."))) {
    list.push("The team's linked artifacts (designs, notebooks, dashboards, models, documents) were not opened. Their descriptions are the team's claims, and their creation times are unverified.");
  }
  if (removed > 0) list.push(`${removed} statement(s) in the AI output were removed or downgraded because the supplied evidence did not support them.`);
  return list;
}

export function assembleSummary(args: {
  output: ModelOutput;
  bundle: EvidenceBundle;
  submission: Submission;
  screening: ScreeningResult;
  model: string;
  fingerprint: string;
  now: Date;
}): ProjectSummary {
  const { submission: s, screening: r, bundle } = args;
  const { assessment, removedOrDowngraded, notes } = sanitizeOutput(args.output, bundle);

  const claims: TeamClaims = {
    track: s.track,
    disciplines: s.disciplines.map(disciplineLabel),
    otherDiscipline: s.otherDiscipline,
    projectFormats: s.projectFormats.map(formatLabel),
    artifacts: (s.artifacts ?? []).map((a) => ({
      type: artifactLabel(a.type),
      platform: platformOf(a.url),
      url: a.url,
      description: a.description,
      timelineEvidence: a.timelineEvidence || undefined,
    })),
    challenge: s.challenge,
    problem: s.problemDescription,
    solution: s.proposedSolution,
    technologies: [...s.technologies],
    aiToolsDeclared: s.aiToolsUsed,
    externalResourcesDeclared: s.externalResources,
    testingInstructions: s.testingInstructions,
    githubUrl: s.githubUrl,
    demoUrl: s.demoUrl,
  };

  const gh = r.github;
  const verification: VerificationSection = {
    screeningSource: r.source,
    status: r.status,
    statusExplanation: r.explanation,
    finalDecision: r.finalDecision,
    missing: r.missing.map((m) => ({ ...m })),
    requirements: r.requirements.map((q) => ({ ...q })),
    artifactReviews: r.artifactReviews.map((a) => ({ ...a })),
    flags: r.flags.map((f) => ({ code: f.code, kind: f.kind, title: f.title, detail: f.detail, evidenceUrl: f.evidenceUrl, resolved: f.resolved })),
    repository: gh && {
      accessible: gh.accessible,
      createdAt: gh.repoCreatedAt,
      defaultBranch: gh.defaultBranch,
      isFork: gh.isFork,
      hasReadme: gh.hasReadme,
      branchesInspected: (gh.branches ?? []).map((b) => `${b.name}${b.historyComplete ? "" : " (partial)"}`),
      limitations: [...(gh.limitations ?? [])],
    },
  };

  const limitations = [...deterministicLimitations(bundle, removedOrDowngraded), ...assessment.limitations].slice(0, 14);
  if (!bundle.checks.repositoryMetadata) {
    // Without repository evidence the alignment rating can only reflect the team's own description.
    assessment.alignment.reasoning = `${assessment.alignment.reasoning} (Based on the team's description only; no repository content was available.)`.trim();
  }

  return {
    generatedAt: args.now.toISOString(),
    model: args.model,
    evidenceFingerprint: args.fingerprint,
    claims,
    expectedEvidence: bundle.expectations.map((e) => ({ label: e.label, level: e.level, expectation: e.expectation })),
    verification,
    checksPerformed: { ...bundle.checks },
    assessment: { ...assessment, limitations },
    sanitization: { removedOrDowngraded, notes },
  };
}
