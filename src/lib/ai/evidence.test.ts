import { describe, expect, it } from "vitest";
import { buildEvidenceBundle, README_MAX_CHARS } from "./evidence";
import { inputFor, makeEvidence, makeSubmission, okOutcome } from "./fixtures";
import { redactSecrets, summarizeFileList } from "./sanitize";

const text = (b: ReturnType<typeof buildEvidenceBundle>) => JSON.stringify(b.items);
const ids = (b: ReturnType<typeof buildEvidenceBundle>) => b.items.map((i) => i.id);

describe("what the AI is allowed to see", () => {
  it("includes the team's claims, repository facts, flags and a record of what was done", async () => {
    const b = buildEvidenceBundle(await inputFor(okOutcome({ createdAt: "2026-11-01T10:00:00Z" })));
    expect(ids(b)).toEqual(
      expect.arrayContaining(["claim.problem", "claim.solution", "claim.technologies", "claim.ai_tools", "claim.external_resources", "claim.testing", "repo.meta", "files", "readme", "flag.REPO_CREATED_BEFORE_START", "checks"]),
    );
    expect(b.items.find((i) => i.id === "claim.problem")!.origin).toBe("team_claim");
    expect(b.items.find((i) => i.id === "repo.meta")!.origin).toBe("github_fact");
    expect(b.items.find((i) => i.id === "flag.REPO_CREATED_BEFORE_START")!.origin).toBe("screening_flag");
  });

  it("never includes member names, emails or the team name", async () => {
    const sub = makeSubmission({ teamName: "SECRETTEAMNAME", members: [{ name: "Alice Wanjiru", email: "alice@example.com" }] });
    const b = buildEvidenceBundle(await inputFor(okOutcome(), sub));
    expect(text(b)).not.toMatch(/SECRETTEAMNAME|Alice|alice@example/);
  });

  it("includes human organizer notes, labelled as such, without the author", async () => {
    const sub = makeSubmission();
    const input = await inputFor(okOutcome(), sub, {
      submissionId: "s", source: "mock", status: "needs_review", explanation: "", missing: [], flags: [], requirements: [], artifactReviews: [], finalDecision: "pending",
      notes: [{ id: "n1", author: "organizer@zindua.test", createdAt: "2026-11-07T10:00:00Z", body: "Team confirmed the fork." }],
    });
    const b = buildEvidenceBundle(input);
    expect(b.items.find((i) => i.id === "note.1")).toMatchObject({ origin: "organizer_note", text: "Team confirmed the fork." });
    expect(text(b)).not.toContain("organizer@zindua.test");
  });

  it("records only the checks that really happened", async () => {
    const b = buildEvidenceBundle(await inputFor(okOutcome()));
    expect(b.checks).toEqual({
      repositoryMetadata: true, commitHistory: true, fileListing: true, readmeExcerptRead: true, artifactsOpened: false,
      sourceFilesRead: false, codeExecuted: false, deploymentTested: false, modelEvaluated: false,
    });
    const checks = b.items.find((i) => i.id === "checks")!.text;
    expect(checks).toMatch(/Read source file contents: no/);
    expect(checks).toMatch(/Opened or tested the demo, deployment or any artifact link.*: no/);
  });
});

describe("secrets and sensitive files stay out", () => {
  it("redacts credentials inside README text", async () => {
    const readme = [
      "# App", "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456", "ANTHROPIC key sk-ant-api03-abcdefghijklmnop", "AWS AKIAABCDEFGHIJKLMNOP",
      "password = hunter2hunter2", "-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----", "Run npm start",
    ].join("\n");
    const b = buildEvidenceBundle(await inputFor(okOutcome({ readme: { exists: true, excerpt: readme, hasSetupHints: true } })));
    const out = b.items.find((i) => i.id === "readme")!.text;
    for (const secret of ["ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456", "sk-ant-api03-abcdefghijklmnop", "AKIAABCDEFGHIJKLMNOP", "hunter2hunter2", "MIIEabc"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("Run npm start");
  });

  it("omits credential-looking and vendored file names but reports that it did", async () => {
    const tree = { paths: ["README.md", "src/app.ts", ".env", ".env.production", "config/id_rsa", "secrets.json", "certs/server.pem", "node_modules/x/index.js"], truncated: false };
    const b = buildEvidenceBundle(await inputFor(okOutcome({ tree })));
    const files = b.items.find((i) => i.id === "files")!.text;
    expect(files).not.toMatch(/\.env|id_rsa|secrets\.json|server\.pem|node_modules/);
    expect(files).toContain("src/app.ts");
    expect(files).toMatch(/5 credential-looking names/);
    expect(files).toMatch(/1 vendored/);
  });

  it("redactSecrets leaves ordinary text alone", () => {
    expect(redactSecrets("Install with npm install, then visit localhost:3000")).toBe("Install with npm install, then visit localhost:3000");
  });

  it("bounds the README and the file list", async () => {
    const paths = Array.from({ length: 2_000 }, (_, i) => `src/dir${i % 50}/file${i}.ts`);
    const b = buildEvidenceBundle(await inputFor(okOutcome({ tree: { paths, truncated: false }, readme: { exists: true, excerpt: "x".repeat(50_000), hasSetupHints: true } })));
    expect(b.items.find((i) => i.id === "readme")!.text.length).toBeLessThanOrEqual(README_MAX_CHARS);
    const listing = summarizeFileList(paths, false);
    expect(listing.shown).toHaveLength(300);
    expect(listing.omittedOverLimit).toBe(1_700);
  });

  it("strips control characters from untrusted text", async () => {
    const b = buildEvidenceBundle(await inputFor(okOutcome({ readme: { exists: true, excerpt: "Hello\u0000\u001b[31m world\u0007", hasSetupHints: true } })));
    expect(b.items.find((i) => i.id === "readme")!.text).not.toMatch(/[\u0000\u0007\u001b]/);
  });
});

describe("missing or incomplete repository evidence", () => {
  it.each([
    [{ status: "not_accessible", reason: "not_found", message: "Not found", checkedAt: "t" } as const],
    [{ status: "unavailable", reason: "rate_limited", message: "Rate limited", checkedAt: "t" } as const],
  ])("an unreachable repository (%o) yields no repository facts and no checks performed", async (outcome) => {
    const b = buildEvidenceBundle(await inputFor(outcome));
    expect(ids(b)).toContain("repo.status");
    expect(ids(b)).not.toEqual(expect.arrayContaining(["repo.meta"]));
    expect(ids(b)).not.toContain("files");
    expect(ids(b)).not.toContain("readme");
    expect(b.checks).toMatchObject({ repositoryMetadata: false, commitHistory: false, fileListing: false, readmeExcerptRead: false });
    expect(b.items.find((i) => i.id === "repo.status")!.text).toMatch(/No repository facts are available/);
  });

  it("works with no verification at all", async () => {
    const b = buildEvidenceBundle({ ...(await inputFor(undefined)), outcome: undefined });
    expect(b.items.find((i) => i.id === "repo.status")!.text).toMatch(/No GitHub verification was available/);
  });

  it("a truncated tree and a missing README are stated, and no README item exists", async () => {
    const b = buildEvidenceBundle(await inputFor(okOutcome({ tree: { paths: ["a.ts"], truncated: true }, readme: { exists: false } })));
    expect(b.items.find((i) => i.id === "files")!.text).toMatch(/truncated/);
    expect(ids(b)).not.toContain("readme");
    expect(b.items.find((i) => i.id === "repo.meta")!.text).toMatch(/README: absent/);
    expect(b.checks.readmeExcerptRead).toBe(false);
  });

  it("unfinished checks are listed as not completed in the repository facts", async () => {
    const outcome = { status: "ok", evidence: makeEvidence({ limitations: [{ code: "X", message: "The README check could not be completed: rate limit." }] }) } as const;
    const b = buildEvidenceBundle(await inputFor(outcome));
    expect(b.items.find((i) => i.id === "repo.meta")!.text).toMatch(/Not completed: The README check could not be completed/);
  });
});
