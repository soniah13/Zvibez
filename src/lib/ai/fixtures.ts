import type { VerifyOutcome } from "../github/types";
import { commit, makeEvidence, makeSubmission } from "../screening/fixtures";
import { runScreening } from "../screening/run";
import type { ScreeningResult, Submission } from "../types";
import type { SummaryInput } from "./service";
import type { ModelOutput } from "./schema";
import type { ModelResponse } from "./service";

/** Test helpers for the AI layer. */
export const okOutcome = (over = {}): VerifyOutcome => ({
  status: "ok",
  evidence: makeEvidence({
    tree: { paths: ["README.md", "src/index.ts", "src/api/routes.ts", "package.json"], truncated: false },
    readme: { exists: true, hasSetupHints: true, excerpt: "# Kiosk Finder\nFinds water kiosks.\n## Run\nnpm install && npm start" },
    ...over,
  }),
});

export async function inputFor(outcome: VerifyOutcome | undefined, sub: Submission = makeSubmission(), previous?: ScreeningResult): Promise<SummaryInput> {
  const screening = await runScreening(sub, {
    verify: async () => outcome ?? { status: "unavailable", reason: "network", message: "n/a", checkedAt: "t" },
    previous,
  });
  return { submission: sub, screening, outcome };
}

/** A well-formed, well-grounded model answer for okOutcome(). */
export function validOutput(over: Partial<ModelOutput> = {}): ModelOutput {
  return {
    overview: "The team states it built a water kiosk finder. The repository contains a TypeScript source tree.",
    problemSummary: "The team states residents cannot find working water kiosks.",
    solutionSummary: "The team states it built a searchable kiosk directory.",
    mainFeatures: [{ feature: "Kiosk search", basis: "readme", evidenceRefs: ["readme"] }],
    technologies: [{ name: "ts", basis: "team_claim" }],
    implementationEvidence: [
      { claim: "A source tree with an API routes file exists", status: "supported", evidenceRefs: ["files"], note: "src/api/routes.ts is listed. File contents were not read." },
    ],
    alignment: { rating: "partial", reasoning: "The README describes search; no deployment was tested.", evidenceRefs: ["readme", "claim.solution"] },
    strengths: [{ statement: "The README includes run instructions.", evidenceRefs: ["readme"] }],
    missingInformation: ["No evidence of how kiosk data is sourced."],
    judgeQuestions: ["How is kiosk status data kept current?"],
    limitations: [],
    ...over,
  };
}

export const okResponse = (output: unknown, over: Partial<ModelResponse> = {}): ModelResponse => ({
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }],
  ...over,
});

export const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

export { commit, makeEvidence, makeSubmission };
