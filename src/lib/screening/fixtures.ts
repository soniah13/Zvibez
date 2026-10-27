import type { CommitRef, RepoEvidence } from "../github/types";
import type { Submission } from "../types";

/** Test helpers. Kept outside *.test.ts so several suites can share them. */
export const commit = (sha: string, authorDate: string, committerDate = authorDate): CommitRef => ({
  sha,
  url: `https://github.com/o/r/commit/${sha}`,
  authorDate,
  committerDate,
});

export function makeEvidence(over: Partial<RepoEvidence> = {}): RepoEvidence {
  const c1 = commit("a".repeat(40), "2026-11-07T05:00:00Z");
  return {
    owner: "o",
    repo: "r",
    htmlUrl: "https://github.com/o/r",
    fetchedAt: "2026-11-07T10:00:00Z",
    createdAt: "2026-11-07T04:30:00Z",
    defaultBranch: "main",
    isFork: false,
    branches: [{ name: "main", isDefault: true, commits: [c1], historyComplete: true, totalCommits: 1, earliest: c1 }],
    branchesNotInspected: 0,
    branchListComplete: true,
    tree: { paths: ["README.md", "src/index.ts"], truncated: false },
    readme: { exists: true, hasSetupHints: true },
    limitations: [],
    ...over,
  };
}

export function makeSubmission(over: Partial<Submission> = {}): Submission {
  return {
    id: "s",
    createdAt: "2026-11-07T10:00:00Z",
    teamName: "Team",
    members: [{ name: "A" }],
    track: "Software Engineering",
    disciplines: ["fullstack"],
    projectFormats: ["web_app"],
    artifacts: [],
    challenge: "c",
    problemDescription: "p",
    proposedSolution: "s",
    githubUrl: "https://github.com/o/r",
    demoUrl: "https://demo.example.app",
    technologies: ["ts"],
    aiToolsUsed: "None.",
    externalResources: "None.",
    testingInstructions: "Run it.",
    ...over,
  };
}
