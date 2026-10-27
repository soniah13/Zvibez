import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "./policy";
import { declaresExternalCode, evaluateEvidence } from "./rules";
import { commit, makeEvidence, makeSubmission } from "./fixtures";
import type { BranchInspection } from "../github/types";

const sub = makeSubmission();
const codes = (f: { code: string }[]) => f.map((x) => x.code);
const find = <T extends { code: string }>(f: T[], code: string) => f.find((x) => x.code === code);

function branch(name: string, commits: ReturnType<typeof commit>[], over: Partial<BranchInspection> = {}): BranchInspection {
  return {
    name,
    isDefault: name === "main",
    commits,
    historyComplete: true,
    totalCommits: commits.length,
    earliest: commits[commits.length - 1],
    ...over,
  };
}

describe("repository creation vs the window", () => {
  it("flags creation before the start as a verified fact, with evidence", () => {
    const f = evaluateEvidence(makeEvidence({ createdAt: "2026-11-07T03:59:59Z" }), sub);
    const flag = find(f, "REPO_CREATED_BEFORE_START")!;
    expect(flag.kind).toBe("verified");
    expect(flag.evidenceUrl).toBe("https://github.com/o/r");
    expect(flag.timestamp).toBe("2026-11-07T03:59:59Z");
  });
  it("a repository created before 7 November is flagged and is not described as empty when it has commits", () => {
    const flag = find(evaluateEvidence(makeEvidence({ createdAt: "2026-11-01T10:00:00Z" }), sub), "REPO_CREATED_BEFORE_START")!;
    expect(flag.title).toBe("Repository created before the official start");
    expect(flag.detail).not.toMatch(/looks like an empty repository/);
  });
  it("a genuinely empty repository created before 7 AM on the event day is still flagged, with a manual-review note", () => {
    const emptyBranch = { name: "main", isDefault: true, commits: [], historyComplete: true, totalCommits: 0 };
    const flag = find(evaluateEvidence(makeEvidence({ createdAt: "2026-11-07T03:00:00Z", branches: [emptyBranch] }), sub), "REPO_CREATED_BEFORE_START")!;
    expect(flag.kind).toBe("verified");
    expect(flag.title).toBe("Empty repository created before the official start");
    expect(flag.detail).toMatch(/created on the event day before the start/);
    expect(flag.detail).toMatch(/accept that after manual review/);
  });
  it("an empty repository with unverified (partial) history is not called empty", () => {
    const partial = { name: "main", isDefault: true, commits: [], historyComplete: false };
    const flag = find(evaluateEvidence(makeEvidence({ createdAt: "2026-11-07T03:00:00Z", branches: [partial] }), sub), "REPO_CREATED_BEFORE_START")!;
    expect(flag.title).toBe("Repository created before the official start");
  });
  it("does not flag creation exactly at the start", () => {
    const f = evaluateEvidence(makeEvidence({ createdAt: "2026-11-07T04:00:00Z" }), sub);
    expect(codes(f)).not.toContain("REPO_CREATED_BEFORE_START");
    expect(find(f, "EVENT_WINDOW_NOT_PROOF")?.kind).toBe("info");
  });
  it("accepts creation exactly at the deadline, flags one second later", () => {
    expect(codes(evaluateEvidence(makeEvidence({ createdAt: "2026-11-07T16:00:00Z" }), sub))).not.toContain("REPO_CREATED_AFTER_DEADLINE");
    expect(codes(evaluateEvidence(makeEvidence({ createdAt: "2026-11-07T16:00:01Z" }), sub))).toContain("REPO_CREATED_AFTER_DEADLINE");
  });
  it("event-day creation is informational and says it is not proof", () => {
    const flag = find(evaluateEvidence(makeEvidence(), sub), "EVENT_WINDOW_NOT_PROOF")!;
    expect(flag.kind).toBe("info");
    expect(flag.detail).toMatch(/not proof/i);
  });
  it("an unreadable creation time is inconclusive, not a violation", () => {
    const flag = find(evaluateEvidence(makeEvidence({ createdAt: "garbage" }), sub), "INVALID_REPO_TIMESTAMP")!;
    expect(flag.kind).toBe("inconclusive");
  });
});

describe("commit timestamps", () => {
  const inWindow = commit("1".repeat(40), "2026-11-07T06:00:00Z");

  it("flags commits before the start by author OR committer date, and gives the earliest sha and url", () => {
    const early = commit("e".repeat(40), "2026-11-07T03:00:00Z");
    const committerEarly = commit("c".repeat(40), "2026-11-07T08:00:00Z", "2026-11-07T03:59:59Z");
    const ev = makeEvidence({ branches: [branch("main", [inWindow, committerEarly, early])] });
    const flag = find(evaluateEvidence(ev, sub), "PRE_EVENT_COMMITS")!;
    expect(flag.kind).toBe("suspicious");
    expect(flag.title).toMatch(/^2 inspected commits/);
    expect(flag.commitSha).toBe("e".repeat(40));
    expect(flag.evidenceUrl).toBe(`https://github.com/o/r/commit/${"e".repeat(40)}`);
  });
  it("a commit exactly at the start is not pre-event", () => {
    const ev = makeEvidence({ branches: [branch("main", [commit("2".repeat(40), "2026-11-07T04:00:00Z")])] });
    expect(codes(evaluateEvidence(ev, sub))).not.toContain("PRE_EVENT_COMMITS");
  });
  it("flags commits after the deadline but not exactly at it", () => {
    const at = makeEvidence({ branches: [branch("main", [commit("3".repeat(40), "2026-11-07T16:00:00Z")])] });
    const after = makeEvidence({ branches: [branch("main", [commit("4".repeat(40), "2026-11-07T16:00:01Z")])] });
    expect(codes(evaluateEvidence(at, sub))).not.toContain("COMMITS_AFTER_DEADLINE");
    expect(find(evaluateEvidence(after, sub), "COMMITS_AFTER_DEADLINE")?.kind).toBe("suspicious");
  });
  it("de-duplicates a commit shared by two branches and lists both", () => {
    const shared = commit("5".repeat(40), "2026-11-06T10:00:00Z");
    const ev = makeEvidence({ createdAt: "2026-11-06T09:00:00Z", branches: [branch("main", [shared]), branch("dev", [shared], { isDefault: false })] });
    const flag = find(evaluateEvidence(ev, sub), "PRE_EVENT_COMMITS")!;
    expect(flag.title).toMatch(/^1 inspected commit /);
    expect(flag.detail).toContain("main, dev");
  });
  it("finds pre-event commits that exist only on a non-default branch", () => {
    const ev = makeEvidence({
      branches: [branch("main", [inWindow]), branch("legacy", [commit("6".repeat(40), "2026-10-01T10:00:00Z")], { isDefault: false })],
    });
    const flag = find(evaluateEvidence(ev, sub), "PRE_EVENT_COMMITS")!;
    expect(flag.detail).toContain("legacy");
  });
  it("unreadable commit dates are inconclusive", () => {
    const ev = makeEvidence({ branches: [branch("main", [commit("7".repeat(40), "")])] });
    expect(find(evaluateEvidence(ev, sub), "INVALID_COMMIT_TIMESTAMP")?.kind).toBe("inconclusive");
  });
});

describe("author vs committer discrepancy", () => {
  it("flags gaps above the threshold as a signal, with a not-misconduct caveat", () => {
    const c = commit("8".repeat(40), "2026-11-07T05:00:00Z", "2026-11-09T05:00:00Z");
    const flag = find(evaluateEvidence(makeEvidence({ branches: [branch("main", [c])] }), sub), "TIMESTAMP_DISCREPANCY")!;
    expect(flag.kind).toBe("suspicious");
    expect(flag.detail).toMatch(/not misconduct by itself/);
  });
  it("ignores gaps at or below the threshold", () => {
    const c = commit("9".repeat(40), "2026-11-07T05:00:00Z", "2026-11-08T05:00:00Z"); // exactly 24h
    expect(codes(evaluateEvidence(makeEvidence({ branches: [branch("main", [c])] }), sub))).not.toContain("TIMESTAMP_DISCREPANCY");
  });
  it("respects a custom threshold", () => {
    const c = commit("9".repeat(40), "2026-11-07T05:00:00Z", "2026-11-07T07:00:00Z");
    const ev = makeEvidence({ branches: [branch("main", [c])] });
    expect(codes(evaluateEvidence(ev, sub, { ...DEFAULT_POLICY, timestampDiscrepancyThresholdMs: 3_600_000 }))).toContain("TIMESTAMP_DISCREPANCY");
  });
});

describe("imported history", () => {
  it("flags commits older than the repository beyond the tolerance", () => {
    const old = commit("a1".repeat(20), "2026-10-01T10:00:00Z");
    const ev = makeEvidence({ createdAt: "2026-11-07T05:00:00Z", branches: [branch("main", [commit("b".repeat(40), "2026-11-07T06:00:00Z"), old])] });
    const f = evaluateEvidence(ev, sub);
    const flag = find(f, "IMPORTED_HISTORY")!;
    expect(flag.kind).toBe("suspicious");
    expect(flag.detail).toMatch(/also pre-date the official start/);
    expect(flag.commitSha).toBe("a1".repeat(20));
  });
  it("tolerates a short local-init-then-push gap", () => {
    const c = commit("c".repeat(40), "2026-11-07T04:40:00Z"); // 20 min before creation at 05:00
    const ev = makeEvidence({ createdAt: "2026-11-07T05:00:00Z", branches: [branch("main", [c])] });
    expect(codes(evaluateEvidence(ev, sub))).not.toContain("IMPORTED_HISTORY");
  });
  it("uses the branch's true earliest commit even when history was truncated", () => {
    const tip = commit("d".repeat(40), "2026-11-07T06:00:00Z");
    const root = commit("f".repeat(40), "2026-09-01T00:00:00Z");
    const ev = makeEvidence({ branches: [branch("main", [tip], { historyComplete: false, totalCommits: 900, earliest: root })] });
    expect(codes(evaluateEvidence(ev, sub))).toEqual(expect.arrayContaining(["IMPORTED_HISTORY", "PRE_EVENT_COMMITS", "HISTORY_INCOMPLETE"]));
  });
});

describe("forks", () => {
  const forkEv = (over = {}) =>
    makeEvidence({
      isFork: true,
      upstream: { fullName: "up/stream", htmlUrl: "https://github.com/up/stream", defaultBranch: "main" },
      forkComparison: { aheadBy: 12, behindBy: 3, status: "diverged", url: "https://github.com/o/r/compare" },
      ...over,
    });

  it("a fork needs review under the default policy and reports upstream and ahead/behind", () => {
    const flag = find(evaluateEvidence(forkEv(), sub), "IS_FORK")!;
    expect(flag.kind).toBe("suspicious");
    expect(flag.detail).toContain("up/stream");
    expect(flag.detail).toContain("12 commits ahead");
    expect(flag.detail).toMatch(/organizer decision/);
  });
  it("a declared fork stays suspicious under the default policy (no silent eligibility rule)", () => {
    const flag = find(evaluateEvidence(forkEv(), makeSubmission({ externalResources: "Forked from up/stream" })), "IS_FORK")!;
    expect(flag.kind).toBe("suspicious");
    expect(flag.detail).toMatch(/mention existing or starter code/);
  });
  it("a declared fork becomes informational only when the organizers opt in", () => {
    const policy = { ...DEFAULT_POLICY, declaredExternalCodeHandling: "info_if_declared" as const };
    expect(find(evaluateEvidence(forkEv(), makeSubmission({ externalResources: "Forked from up/stream" }), policy), "IS_FORK")!.kind).toBe("info");
    // ...and an undeclared fork is still flagged even then.
    expect(find(evaluateEvidence(forkEv(), sub, policy), "IS_FORK")!.kind).toBe("suspicious");
  });
  it("flags a fork with no commits beyond upstream even when declared", () => {
    const policy = { ...DEFAULT_POLICY, declaredExternalCodeHandling: "info_if_declared" as const };
    const ev = forkEv({ forkComparison: { aheadBy: 0, behindBy: 0, status: "identical", url: "u" } });
    expect(find(evaluateEvidence(ev, makeSubmission({ externalResources: "fork" }), policy), "FORK_NO_ORIGINAL_COMMITS")!.kind).toBe("suspicious");
  });
  it("an unavailable upstream comparison is inconclusive", () => {
    expect(find(evaluateEvidence(forkEv({ forkComparison: undefined }), sub), "FORK_COMPARISON_UNAVAILABLE")!.kind).toBe("inconclusive");
  });
  it("estimates inherited commits from totalCommits minus aheadBy", () => {
    const ev = forkEv({ branches: [branch("main", [commit("1".repeat(40), "2026-11-07T06:00:00Z")], { totalCommits: 100 })] });
    expect(find(evaluateEvidence(ev, sub), "IS_FORK")!.detail).toContain("88 of 100 commits");
  });
  it("non-forks produce no fork flags", () => {
    expect(codes(evaluateEvidence(makeEvidence(), sub)).filter((c) => c.includes("FORK"))).toEqual([]);
  });
});

describe("large initial commit", () => {
  const withIc = (totalChanges?: number, filesChanged?: number) =>
    makeEvidence({ initialCommit: { sha: "0".repeat(40), url: "https://github.com/o/r/commit/0", totalChanges, filesChanged } });

  it("flags by lines or by files", () => {
    expect(find(evaluateEvidence(withIc(2000, 3), sub), "LARGE_INITIAL_COMMIT")!.kind).toBe("suspicious");
    expect(codes(evaluateEvidence(withIc(1999, 49), sub))).not.toContain("LARGE_INITIAL_COMMIT");
    expect(codes(evaluateEvidence(withIc(10, 50), sub))).toContain("LARGE_INITIAL_COMMIT");
  });
  it("carries the commit sha and url as evidence and states it is not misconduct by itself", () => {
    const flag = find(evaluateEvidence(withIc(5000, 100), sub), "LARGE_INITIAL_COMMIT")!;
    expect(flag.commitSha).toBe("0".repeat(40));
    expect(flag.evidenceUrl).toBe("https://github.com/o/r/commit/0");
    expect(flag.detail).toMatch(/does not show misconduct by itself/);
  });
  it("is downgraded to info only when declared and the organizers opt in", () => {
    const declaredSub = makeSubmission({ externalResources: "Next.js commerce starter template" });
    const optIn = { ...DEFAULT_POLICY, declaredExternalCodeHandling: "info_if_declared" as const };
    expect(find(evaluateEvidence(withIc(5000, 100), declaredSub), "LARGE_INITIAL_COMMIT")!.kind).toBe("suspicious");
    expect(find(evaluateEvidence(withIc(5000, 100), declaredSub, optIn), "LARGE_INITIAL_COMMIT")!.kind).toBe("info");
  });
});

describe("declaresExternalCode", () => {
  it.each([
    ["Fork of an open-source transit map viewer.", true],
    ["Next.js commerce starter template.", true],
    ["None.", false],
    ["", false],
    ["shadcn/ui components. No starter template.", false],
    ["Not using any template", false],
    ["Used a template. No other code.", true],
  ])("%s -> %s", (text, expected) => {
    expect(declaresExternalCode(text)).toBe(expected);
  });
});

describe("incomplete verification is reported, never assumed complete", () => {
  it("flags truncated history, uninspected branches and a truncated branch list as inconclusive", () => {
    const ev = makeEvidence({
      branches: [branch("main", [commit("1".repeat(40), "2026-11-07T06:00:00Z")], { historyComplete: false, totalCommits: 800 })],
      branchesNotInspected: 4,
      branchListComplete: false,
      limitations: [{ code: "RATE_LIMITED", message: "GitHub rate limit reached." }],
    });
    const flag = find(evaluateEvidence(ev, sub), "HISTORY_INCOMPLETE")!;
    expect(flag.kind).toBe("inconclusive");
    expect(flag.detail).toContain("main (1 of 800 commits)");
    expect(flag.detail).toContain("4 other branch(es) were not inspected");
    expect(flag.detail).toContain("truncated");
    expect(flag.detail).toContain("rate limit");
  });
  it("lists inspected branches as an informational scope note", () => {
    const flag = find(evaluateEvidence(makeEvidence(), sub), "HISTORY_SCOPE")!;
    expect(flag.kind).toBe("info");
    expect(flag.detail).toContain("main (default): 1 commit examined, full history");
  });
  it("a clean, complete, in-window repository raises only informational flags", () => {
    const kinds = evaluateEvidence(makeEvidence(), sub).map((f) => f.kind);
    expect(kinds.every((k) => k === "info")).toBe(true);
  });
});
