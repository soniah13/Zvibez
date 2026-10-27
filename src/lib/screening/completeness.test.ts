import { describe, expect, it } from "vitest";
import { checkCompleteness } from "./completeness";
import { DEFAULT_POLICY } from "./policy";
import { makeEvidence, makeSubmission } from "./fixtures";
import type { VerifyOutcome } from "../github/types";

const ok = (over = {}): VerifyOutcome => ({ status: "ok", evidence: makeEvidence(over) });
const fields = (r: { missing: { field: string }[] }) => r.missing.map((m) => m.field);
const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);
const ds = makeSubmission({ track: "Data Science" });

describe("required submission fields", () => {
  it("a complete submission has nothing missing", () => {
    expect(checkCompleteness(makeSubmission(), undefined).missing).toEqual([]);
  });
  it("lists every empty mandatory field", () => {
    const r = checkCompleteness(
      makeSubmission({ testingInstructions: "  ", aiToolsUsed: "", members: [], technologies: [] }),
      undefined,
    );
    expect(fields(r)).toEqual(expect.arrayContaining(["Testing instructions", "AI tools used", "Team members", "Technologies"]));
  });
  it("rejects a non-GitHub repository URL", () => {
    expect(fields(checkCompleteness(makeSubmission({ githubUrl: "https://gitlab.com/o/r" }), undefined))).toContain("GitHub repository URL");
  });
});

describe("demo link follows the confirmed track rules", () => {
  const noDemo = { demoUrl: undefined };
  it("is required for Software Engineering by default", () => {
    const r = checkCompleteness(makeSubmission(noDemo), undefined);
    expect(fields(r)).toContain("Demo URL");
    expect(r.missing.find((m) => m.field === "Demo URL")!.reason).toMatch(/Software Engineering/);
  });
  it("is not required for Data Science by default", () => {
    expect(fields(checkCompleteness({ ...ds, ...noDemo }, undefined))).not.toContain("Demo URL");
  });
  it("can be extended to other tracks through the policy", () => {
    const policy = { ...DEFAULT_POLICY, demoUrlRequiredTracks: ["Software Engineering" as const, "Data Science" as const] };
    expect(fields(checkCompleteness({ ...ds, ...noDemo }, undefined, policy))).toContain("Demo URL");
  });
  it("a provided demo link must be http(s), but its reachability is never tested", () => {
    expect(fields(checkCompleteness(makeSubmission({ demoUrl: "ftp://x" }), undefined))).toContain("Demo URL");
    expect(fields(checkCompleteness(makeSubmission({ demoUrl: "https://x.app" }), undefined))).not.toContain("Demo URL");
  });
});

describe("repository accessibility", () => {
  it("a 404 / private repository makes the submission incomplete (not misconduct)", () => {
    const r = checkCompleteness(makeSubmission(), { status: "not_accessible", reason: "not_found", message: "m", checkedAt: "t" });
    expect(fields(r)).toContain("GitHub repository");
    expect(r.missing[0].reason).toMatch(/not found or private/);
  });
  it("rate limits and timeouts are inconclusive, never missing information", () => {
    for (const reason of ["rate_limited", "timeout", "network", "http_error"] as const) {
      const r = checkCompleteness(makeSubmission(), { status: "unavailable", reason, message: "x", checkedAt: "t" });
      expect(r.missing).toEqual([]);
      expect(r.flags[0]).toMatchObject({ code: "GITHUB_UNAVAILABLE", kind: "inconclusive" });
      expect(r.flags[0].detail).toMatch(/not evidence of misconduct/);
    }
  });
});

describe("source files and README", () => {
  it("passes with source and a README with setup hints", () => {
    const r = checkCompleteness(makeSubmission(), ok());
    expect(r.missing).toEqual([]);
    expect(r.flags).toEqual([]);
  });
  it("reports missing source code when the full tree has none", () => {
    const r = checkCompleteness(makeSubmission(), ok({ tree: { paths: ["README.md", "LICENSE"], truncated: false } }));
    expect(fields(r)).toContain("Source code");
  });
  it("ignores vendored and build directories when looking for source", () => {
    const r = checkCompleteness(makeSubmission(), ok({ tree: { paths: ["README.md", "node_modules/x/index.js", "dist/a.js"], truncated: false } }));
    expect(fields(r)).toContain("Source code");
  });
  it("does not claim missing source when the tree was truncated", () => {
    const r = checkCompleteness(makeSubmission(), ok({ tree: { paths: ["README.md"], truncated: true } }));
    expect(fields(r)).not.toContain("Source code");
    expect(codes(r)).toContain("SOURCE_UNVERIFIED");
  });
  it("a missing tree is inconclusive", () => {
    expect(codes(checkCompleteness(makeSubmission(), ok({ tree: undefined })))).toContain("SOURCE_UNVERIFIED");
  });
  it("flags a missing README and README without setup hints as inconclusive", () => {
    expect(checkCompleteness(makeSubmission(), ok({ readme: { exists: false } })).flags[0]).toMatchObject({ code: "NO_README", kind: "inconclusive" });
    expect(checkCompleteness(makeSubmission(), ok({ readme: { exists: true, hasSetupHints: false } })).flags[0]).toMatchObject({
      code: "README_NO_SETUP_HINTS",
      kind: "inconclusive",
    });
  });
});

describe("Data Science artifacts", () => {
  const tree = (paths: string[], truncated = false) => ok({ tree: { paths, truncated } });

  it("passes with a notebook, data and evaluation evidence", () => {
    const r = checkCompleteness(ds, tree(["README.md", "notebooks/01_eval.ipynb", "data/prices.csv"]));
    expect(r.missing).toEqual([]);
    expect(codes(r)).toEqual([]);
  });
  it("does not require every artifact: a script alone is fine for completeness", () => {
    const r = checkCompleteness(ds, tree(["README.md", "train.py"]));
    expect(r.missing).toEqual([]);
    expect(codes(r)).toEqual(["NO_SUPPORTING_ARTIFACTS"]); // inconclusive only
    expect(r.flags[0].kind).toBe("inconclusive");
  });
  it("a model file or evaluation path counts as supporting evidence", () => {
    expect(codes(checkCompleteness(ds, tree(["train.py", "model.joblib"])))).toEqual([]);
    expect(codes(checkCompleteness(ds, tree(["train.py", "results/metrics.json"])))).toEqual([]);
  });
  it("reports missing analysis code when only non-analysis source exists", () => {
    const r = checkCompleteness(ds, tree(["README.md", "index.html", "style.css"]));
    expect(fields(r)).toContain("Data science code");
  });
  it("reports missing source entirely when there are no code files", () => {
    expect(fields(checkCompleteness(ds, tree(["README.md", "data.csv"])))).toContain("Source code");
  });
  it("is inconclusive, not missing, when the tree was truncated", () => {
    const r = checkCompleteness(ds, tree(["README.md", "index.html"], true));
    expect(fields(r)).not.toContain("Data science code");
    expect(codes(r)).toContain("SOURCE_UNVERIFIED");
    expect(r.flags.find((f) => f.code === "SOURCE_UNVERIFIED")?.detail).toMatch(/analysis/i);
  });
  it("software engineering projects are not asked for data science artifacts", () => {
    expect(codes(checkCompleteness(makeSubmission(), tree(["src/a.ts"])))).toEqual([]);
  });
});
