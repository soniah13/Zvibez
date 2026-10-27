import { describe, expect, it } from "vitest";
import { buildEvidenceBundle } from "./evidence";
import { deepFreeze, inputFor, makeSubmission, okOutcome, validOutput } from "./fixtures";
import { modelOutputJsonSchema, modelOutputSchema } from "./schema";
import { assembleSummary, sanitizeOutput } from "./summary";

const NOW = new Date("2026-11-07T12:00:00Z");

async function assemble(output = validOutput(), outcome: Parameters<typeof inputFor>[0] = okOutcome(), sub = makeSubmission()) {
  const input = await inputFor(outcome, sub);
  const bundle = buildEvidenceBundle(input);
  const summary = assembleSummary({ output, bundle, submission: sub, screening: input.screening, model: "m", fingerprint: "f", now: NOW });
  return { summary, input, bundle };
}

describe("output schema", () => {
  it("accepts a valid answer and rejects missing or mistyped fields", () => {
    expect(modelOutputSchema.safeParse(validOutput()).success).toBe(true);
    expect(modelOutputSchema.safeParse({ ...validOutput(), overview: undefined }).success).toBe(false);
    expect(modelOutputSchema.safeParse({ ...validOutput(), strengths: "none" }).success).toBe(false);
    expect(modelOutputSchema.safeParse({ ...validOutput(), alignment: { rating: "great", reasoning: "", evidenceRefs: [] } }).success).toBe(false);
  });

  it("produces a JSON Schema using only closed objects and no size keywords", () => {
    const seen: string[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === "object") {
        const o = n as Record<string, unknown>;
        if (o.type === "object") expect(o.additionalProperties).toBe(false);
        for (const k of Object.keys(o)) {
          seen.push(k);
          walk(o[k]);
        }
      }
    };
    walk(modelOutputJsonSchema);
    expect(modelOutputJsonSchema).not.toHaveProperty("$schema");
    for (const banned of ["minLength", "maxLength", "minItems", "maxItems", "pattern", "format"]) expect(seen).not.toContain(banned);
  });
});

describe("claims, facts and AI assessment stay separate", () => {
  it("copies the team's claims verbatim, whatever the model wrote", async () => {
    const sub = makeSubmission({ problemDescription: "Original problem text.", proposedSolution: "Original solution text.", aiToolsUsed: "Copilot for tests" });
    const { summary } = await assemble(validOutput({ problemSummary: "Something else entirely.", solutionSummary: "The model's rewrite." }), okOutcome(), sub);
    expect(summary.claims.problem).toBe("Original problem text.");
    expect(summary.claims.solution).toBe("Original solution text.");
    expect(summary.claims.aiToolsDeclared).toBe("Copilot for tests");
    expect(summary.assessment.problemSummary).toBe("Something else entirely."); // assessment is separate and labelled as such
  });

  it("copies verification findings from the deterministic screening, not from the model", async () => {
    const { summary, input } = await assemble(validOutput(), okOutcome({ createdAt: "2026-11-01T10:00:00Z" }));
    expect(summary.verification.flags.map((f) => f.code)).toEqual(input.screening.flags.map((f) => f.code));
    expect(summary.verification.flags.find((f) => f.code === "REPO_CREATED_BEFORE_START")).toMatchObject({ kind: "verified" });
    expect(summary.verification.screeningSource).toBe("live");
    // The model cannot add a flag: its output schema has no place for one.
    expect(Object.keys(summary.assessment)).not.toContain("flags");
  });

  it("records which checks were actually performed and never claims more", async () => {
    const { summary } = await assemble();
    expect(summary.checksPerformed).toMatchObject({ sourceFilesRead: false, codeExecuted: false, deploymentTested: false, modelEvaluated: false });
    const limits = summary.assessment.limitations.join(" ");
    expect(limits).toMatch(/not read, and no submitted code was run/);
    expect(limits).toMatch(/not opened or tested/);
    expect(limits).toMatch(/evidence, not proof/);
  });
});

describe("unsupported claims and insufficient evidence", () => {
  it("removes citations to evidence that was never supplied", async () => {
    const { summary } = await assemble(
      validOutput({ strengths: [{ statement: "Has a README.", evidenceRefs: ["readme", "flag.MADE_UP", "files.secret"] }] }),
    );
    expect(summary.assessment.strengths[0].evidenceRefs).toEqual(["readme"]);
    expect(summary.sanitization.notes.join(" ")).toMatch(/not supplied/);
  });

  it("drops strengths that rest only on the team's own words", async () => {
    const { summary } = await assemble(validOutput({ strengths: [{ statement: "Excellent architecture.", evidenceRefs: ["claim.solution"] }, { statement: "Nothing cited.", evidenceRefs: [] }] }));
    expect(summary.assessment.strengths).toEqual([]);
  });

  it("downgrades an implementation claim that only the team supports", async () => {
    const { summary } = await assemble(
      validOutput({ implementationEvidence: [{ claim: "Offline mode works", status: "supported", evidenceRefs: ["claim.solution"], note: "The team says so." }] }),
    );
    const e = summary.assessment.implementationEvidence[0];
    expect(e.status).toBe("not_verified");
    expect(e.note).toMatch(/Downgraded/);
    expect(summary.sanitization.removedOrDowngraded).toBeGreaterThan(0);
  });

  it("keeps an implementation claim that repository evidence backs", async () => {
    const { summary } = await assemble();
    expect(summary.assessment.implementationEvidence[0].status).toBe("supported");
  });

  it("with no repository evidence at all, nothing can be 'supported' and the limitation is stated", async () => {
    const out = validOutput({
      implementationEvidence: [{ claim: "Works end to end", status: "supported", evidenceRefs: ["claim.solution", "flag.GITHUB_UNAVAILABLE"], note: "n" }],
      strengths: [{ statement: "Strong code", evidenceRefs: ["flag.GITHUB_UNAVAILABLE"] }],
      mainFeatures: [{ feature: "Search", basis: "readme", evidenceRefs: ["readme"] }],
    });
    const { summary } = await assemble(out, { status: "unavailable", reason: "rate_limited", message: "limit", checkedAt: "t" });
    expect(summary.assessment.implementationEvidence[0].status).toBe("not_verified");
    expect(summary.assessment.strengths).toEqual([]);
    expect(summary.assessment.mainFeatures).toEqual([]);
    expect(summary.assessment.limitations.join(" ")).toMatch(/could not be inspected/);
    expect(summary.assessment.alignment.reasoning).toMatch(/team's description only/);
    expect(summary.checksPerformed.repositoryMetadata).toBe(false);
  });

  it("removes features and technologies attributed to sources that were not supplied", async () => {
    const out = validOutput({
      mainFeatures: [{ feature: "Real-time sync", basis: "file_paths", evidenceRefs: ["claim.solution"] }, { feature: "Kiosk search", basis: "team_claim", evidenceRefs: ["claim.solution"] }],
      technologies: [{ name: "ts", basis: "team_claim" }, { name: "Kubernetes", basis: "readme" }],
    });
    const { summary, bundle } = await assemble(out, okOutcome({ readme: { exists: false } }));
    expect(bundle.items.some((i) => i.id === "readme")).toBe(false);
    expect(summary.assessment.mainFeatures.map((f) => f.feature)).toEqual(["Kiosk search"]);
    expect(summary.assessment.technologies.map((t) => t.name)).toEqual(["ts"]); // Kubernetes cited a README that was not supplied
  });
});

describe("the AI cannot issue verdicts or claim actions Charlie did not take", () => {
  it("removes eligibility language", async () => {
    const out = validOutput({
      overview: "This team should be disqualified for copying.",
      judgeQuestions: ["Is the team ineligible?", "How does the offline sync handle conflicts?"],
      limitations: ["The project is not eligible."],
    });
    const { summary } = await assemble(out);
    expect(summary.assessment.overview).toMatch(/^\[removed/);
    expect(summary.assessment.judgeQuestions).toEqual(["How does the offline sync handle conflicts?"]);
    expect(summary.assessment.limitations.join(" ")).not.toMatch(/not eligible/);
  });

  it.each(["We ran the app and it works.", "I tested the deployment successfully.", "Charlie inspected the source code.", "The system executed the notebook."])(
    "removes the false action claim %j",
    async (claim) => {
      const { summary } = await assemble(validOutput({ overview: claim, strengths: [{ statement: claim, evidenceRefs: ["readme"] }] }));
      expect(summary.assessment.overview).toMatch(/^\[removed/);
      expect(summary.assessment.strengths).toEqual([]);
    },
  );

  it("does not touch the team's own statements about testing", async () => {
    const { summary } = await assemble(validOutput({ overview: "The team states the app was tested with 20 users." }));
    expect(summary.assessment.overview).toBe("The team states the app was tested with 20 users.");
  });

  it("caps list lengths", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `Question ${i}?`);
    const { summary } = await assemble(validOutput({ judgeQuestions: many }));
    expect(summary.assessment.judgeQuestions).toHaveLength(8);
  });
});

describe("existing screening state is preserved", () => {
  it("does not change or mutate the screening result, statuses or organizer decision", async () => {
    const sub = makeSubmission({ testingInstructions: "" }); // incomplete
    const input = await inputFor(okOutcome({ createdAt: "2026-11-01T10:00:00Z" }), sub, {
      submissionId: "s", source: "mock", status: "needs_review", explanation: "", missing: [], flags: [],
      notes: [{ id: "n", author: "org", createdAt: "2026-11-07T10:00:00Z", body: "Called the team." }], finalDecision: "escalated",
    });
    const before = JSON.stringify(input.screening);
    deepFreeze(input);
    deepFreeze(sub);
    const bundle = buildEvidenceBundle(input);
    const summary = assembleSummary({ output: validOutput(), bundle, submission: sub, screening: input.screening, model: "m", fingerprint: "f", now: NOW });
    expect(JSON.stringify(input.screening)).toBe(before);
    expect(summary.verification.status).toBe(input.screening.status);
    expect(summary.verification.status).toBe("incomplete");
    expect(summary.verification.finalDecision).toBe("escalated");
    expect(summary.verification.missing).toEqual(input.screening.missing);
  });

  it("an AI answer that praises the project cannot move an incomplete or flagged submission", async () => {
    const { summary, input } = await assemble(validOutput({ overview: "Excellent. Ready for review." }), okOutcome({ createdAt: "2026-11-01T10:00:00Z" }));
    expect(input.screening.status).toBe("needs_review");
    expect(summary.verification.status).toBe("needs_review");
  });
});

describe("sanitizeOutput", () => {
  it("is idempotent on a clean answer", async () => {
    const input = await inputFor(okOutcome());
    const bundle = buildEvidenceBundle(input);
    const first = sanitizeOutput(validOutput(), bundle);
    expect(first.removedOrDowngraded).toBe(0);
    expect(sanitizeOutput(first.assessment, bundle).assessment).toEqual(first.assessment);
  });
});
