import { describe, expect, it } from "vitest";
import type { VerifyOutcome } from "../github/types";
import type { ScreeningResult } from "../types";
import { commit, makeEvidence, makeSubmission } from "./fixtures";
import { runScreening } from "./run";

const ok = (over = {}): VerifyOutcome => ({ status: "ok", evidence: makeEvidence(over) });
const run = (outcome: VerifyOutcome, sub = makeSubmission(), previous?: ScreeningResult) =>
  runScreening(sub, { verify: async () => outcome, previous });

describe("status derivation from live evidence", () => {
  it("a clean in-window repository is Ready for review and is labelled live", async () => {
    const r = await run(ok());
    expect(r.status).toBe("ready");
    expect(r.source).toBe("live");
    expect(r.finalDecision).toBe("pending");
    expect(r.github).toMatchObject({ accessible: true, defaultBranch: "main" });
  });
  it("a pre-event repository Needs review (never auto-rejected)", async () => {
    const r = await run(ok({ createdAt: "2026-11-01T10:00:00Z" }));
    expect(r.status).toBe("needs_review");
    expect(r.explanation).toMatch(/not proof of misconduct/);
    expect(r.finalDecision).toBe("pending");
  });
  it("a private or missing repository is Incomplete", async () => {
    const r = await run({ status: "not_accessible", reason: "not_found", message: "m", checkedAt: "t" });
    expect(r.status).toBe("incomplete");
    expect(r.github?.accessible).toBe(false);
  });
  it("a rate limit is Needs review with accessibility unknown, not Incomplete or misconduct", async () => {
    const r = await run({ status: "unavailable", reason: "rate_limited", message: "limit", checkedAt: "t", resetAt: "x" });
    expect(r.status).toBe("needs_review");
    expect(r.github?.accessible).toBeUndefined();
    expect(r.flags.map((f) => f.code)).toEqual(["GITHUB_UNAVAILABLE"]);
    expect(r.flags[0].kind).toBe("inconclusive");
  });
  it("missing mandatory fields win: Incomplete, even with a clean repository", async () => {
    const r = await run(ok(), makeSubmission({ testingInstructions: "" }));
    expect(r.status).toBe("incomplete");
    expect(r.missing.map((m) => m.field)).toContain("Testing instructions");
  });
  it("an event-day repository with only informational flags stays Ready", async () => {
    const r = await run(ok());
    expect(r.flags.every((f) => f.kind === "info")).toBe(true);
    expect(r.status).toBe("ready");
  });
  it("partial history keeps the run at Needs review and says what was not checked", async () => {
    const r = await run(
      ok({ branches: [{ name: "main", isDefault: true, commits: [commit("1".repeat(40), "2026-11-07T06:00:00Z")], historyComplete: false, totalCommits: 700 }] }),
    );
    expect(r.status).toBe("needs_review");
    expect(r.github?.branches?.[0]).toMatchObject({ name: "main", historyComplete: false, commitsExamined: 1, totalCommits: 700 });
  });
});

describe("flag evidence", () => {
  it("every flag has a stable code, a kind, an explanation and a unique id", async () => {
    const r = await run(
      ok({
        createdAt: "2026-11-01T10:00:00Z",
        branches: [{ name: "main", isDefault: true, commits: [commit("2".repeat(40), "2026-10-30T10:00:00Z")], historyComplete: true, totalCommits: 1, earliest: commit("2".repeat(40), "2026-10-30T10:00:00Z") }],
      }),
    );
    expect(new Set(r.flags.map((f) => f.id)).size).toBe(r.flags.length);
    for (const f of r.flags) {
      expect(f.code).toMatch(/^[A-Z_]+$/);
      expect(["verified", "suspicious", "inconclusive", "info"]).toContain(f.kind);
      expect(f.detail.length).toBeGreaterThan(10);
    }
    const pre = r.flags.find((f) => f.code === "PRE_EVENT_COMMITS")!;
    expect(pre.commitSha).toBe("2".repeat(40));
    expect(pre.evidenceUrl).toContain("/commit/");
    expect(pre.timestamp).toBe("2026-10-30T10:00:00.000Z");
  });
});

describe("re-running preserves organizer work", () => {
  const previous: ScreeningResult = {
    submissionId: "s",
    source: "mock",
    status: "needs_review",
    explanation: "",
    missing: [],
    flags: [
      { id: "old1", code: "REPO_CREATED_BEFORE_START", kind: "verified", title: "t", detail: "d", resolved: true, resolvedBy: "org@x", resolutionNote: "Checked with team." },
      { id: "old2", code: "SOMETHING_ELSE", kind: "suspicious", title: "t", detail: "d", resolved: true },
    ],
    notes: [{ id: "n", author: "org@x", createdAt: "2026-11-07T10:00:00Z", body: "Called the team." }],
    finalDecision: "cleared",
  };

  it("keeps notes, the final decision, and resolution of flags that are raised again", async () => {
    const r = await run(ok({ createdAt: "2026-11-01T10:00:00Z" }), makeSubmission(), previous);
    expect(r.notes).toEqual(previous.notes);
    expect(r.finalDecision).toBe("cleared");
    const flag = r.flags.find((f) => f.code === "REPO_CREATED_BEFORE_START")!;
    expect(flag).toMatchObject({ resolved: true, resolvedBy: "org@x", resolutionNote: "Checked with team." });
    expect(r.flags.find((f) => f.code === "SOMETHING_ELSE")).toBeUndefined();
  });
  it("a resolved flag no longer blocks Ready for review, but a new flag does", async () => {
    const onlyResolved = await run(ok({ createdAt: "2026-11-01T10:00:00Z", branches: [] }), makeSubmission(), previous);
    // branches: [] adds no commit flags; the creation flag is resolved; scope info does not block.
    expect(onlyResolved.status).toBe("ready");
    const newFlag = await run(ok({ createdAt: "2026-11-01T10:00:00Z", isFork: true }), makeSubmission(), previous);
    expect(newFlag.status).toBe("needs_review");
  });
});
