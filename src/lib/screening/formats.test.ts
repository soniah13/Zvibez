import { describe, expect, it, vi } from "vitest";
import type { VerifyOutcome } from "../github/types";
import type { Submission } from "../types";
import { checkCompleteness } from "./completeness";
import { makeEvidence, makeSubmission } from "./fixtures";
import { DEFAULT_POLICY } from "./policy";
import { runScreening } from "./run";

/**
 * The same screening engine, five very different projects. Each is judged against the evidence its own format
 * expects, and none is asked for a web app's frontend, repository or deployment unless its format calls for it.
 */

const ok = (over = {}): VerifyOutcome => ({ status: "ok", evidence: makeEvidence(over) });
const tree = (paths: string[], readme = "# Project\n## Run\nnpm install") => ({
  tree: { paths, truncated: false },
  readme: { exists: true, hasSetupHints: true, excerpt: readme },
});
const fields = (r: { missing: { field: string }[] }) => r.missing.map((m) => m.field);
const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);
const art = (type: Submission["artifacts"][number]["type"], url: string, description = "Described by the team") => ({ type, url, description });

const design = (over: Partial<Submission> = {}) =>
  makeSubmission({
    disciplines: ["design"],
    projectFormats: ["design_prototype"],
    githubUrl: undefined,
    demoUrl: undefined,
    technologies: ["Figma"],
    artifacts: [
      { ...art("design_prototype", "https://www.figma.com/proto/x", "Clickable prototype, 12 screens"), timelineEvidence: "Version history starts 07:40 EAT" },
      art("design_documentation", "https://www.figma.com/board/y", "User flows and test notes"),
    ],
    ...over,
  });

const dashboard = (over: Partial<Submission> = {}) =>
  makeSubmission({
    track: "Data Science",
    disciplines: ["analytics_bi"],
    projectFormats: ["dashboard_bi", "data_analysis"],
    githubUrl: undefined,
    demoUrl: undefined,
    technologies: ["Power BI", "DAX"],
    artifacts: [
      art("dashboard", "https://app.powerbi.com/view?r=x", "Published report"),
      art("dataset_documentation", "https://docs.google.com/document/d/x", "Where the data came from"),
      art("evaluation_report", "https://docs.google.com/document/d/y", "Methodology note"),
    ],
    ...over,
  });

const backend = (over: Partial<Submission> = {}) =>
  makeSubmission({
    disciplines: ["backend"],
    projectFormats: ["backend_api"],
    demoUrl: undefined,
    technologies: ["FastAPI", "PostgreSQL"],
    artifacts: [art("api_docs", "https://api.example.dev/docs", "OpenAPI reference"), art("api_collection", "https://www.postman.com/x", "Postman collection")],
    ...over,
  });

const mlNotebook = (over: Partial<Submission> = {}) =>
  makeSubmission({
    track: "Data Science",
    disciplines: ["machine_learning", "data_science"],
    projectFormats: ["ml_ai", "notebook"],
    githubUrl: undefined,
    demoUrl: undefined,
    technologies: ["scikit-learn", "pandas"],
    artifacts: [
      art("notebook", "https://colab.research.google.com/drive/x", "End-to-end notebook"),
      art("model_card", "https://huggingface.co/x/model", "Model card with data and limits"),
      art("evaluation_report", "https://docs.google.com/document/d/z", "Evaluation write-up"),
    ],
    ...over,
  });

const pipeline = (over: Partial<Submission> = {}) =>
  makeSubmission({
    disciplines: ["data_engineering"],
    projectFormats: ["pipeline_automation"],
    demoUrl: undefined,
    technologies: ["Airflow", "dbt"],
    artifacts: [art("demo_video", "https://www.youtube.com/watch?v=x", "Walkthrough of a DAG run")],
    ...over,
  });

describe("five formats, five different evidence sets", () => {
  it("design prototype: no repository, source code, README or model asked for; needs a human for timeline only", async () => {
    const verify = vi.fn();
    const r = await runScreening(design(), { verify });
    expect(verify).not.toHaveBeenCalled(); // nothing to verify on GitHub
    expect(r.missing).toEqual([]);
    expect(r.status).toBe("needs_review");
    expect(codes(r)).toEqual(["ARTIFACT_TIMELINE_MANUAL_REVIEW"]);
    expect(r.github).toBeUndefined();
    expect(r.artifactReviews.every((a) => a.creationTimeVerified === false)).toBe(true);
    expect(r.requirements.map((q) => q.key)).toEqual(["design_files", "user_flows"]);
    expect(r.requirements.every((q) => q.outcome === "declared_not_inspected")).toBe(true);
    expect(fields(r)).not.toEqual(expect.arrayContaining(["Source code", "Source repository", "Data science code"]));
  });

  it("dashboard / BI (Data Science track): accepted on analysis artifacts, with no demo URL or repository", async () => {
    const r = await runScreening(dashboard(), { verify: vi.fn() });
    expect(r.missing).toEqual([]);
    expect(r.status).toBe("needs_review");
    expect(r.requirements.find((q) => q.key === "analysis_artifacts")?.outcome).toBe("declared_not_inspected");
    expect(r.requirements.find((q) => q.key === "data_provenance")?.outcome).toBe("declared_not_inspected");
  });

  it("backend API: needs source and API docs, but no frontend or user-facing deployment", async () => {
    const outcome = ok({ ...tree(["README.md", "openapi.yaml", "app/main.py", "tests/test_api.py"], "# API\nGET /sales endpoint\n## Run\npip install -r requirements.txt") });
    const r = await runScreening(backend(), { verify: async () => outcome });
    expect(r.missing).toEqual([]);
    expect(r.requirements.find((q) => q.key === "api_documentation")?.outcome).toBe("met");
    expect(r.requirements.find((q) => q.key === "source_code")?.outcome).toBe("met");
    expect(fields(r)).not.toContain("Demo URL"); // the API collection counts as a demo for the track rule
    expect(codes(r)).not.toContain("NO_README");
  });

  it("ML / notebook (Data Science track): a notebook and model card are enough, with no repo, frontend or deployment", async () => {
    const r = await runScreening(mlNotebook(), { verify: vi.fn() });
    expect(r.missing).toEqual([]);
    expect(codes(r)).toEqual(["ARTIFACT_TIMELINE_MANUAL_REVIEW"]);
    const byKey = Object.fromEntries(r.requirements.map((q) => [q.key, q.outcome]));
    expect(byKey).toMatchObject({ implementation_code: "declared_not_inspected", model_or_inference: "declared_not_inspected", evaluation_evidence: "declared_not_inspected", analysis_artifacts: "declared_not_inspected" });
  });

  it("data pipeline: needs pipeline scripts or configuration in the repository, not a web frontend", async () => {
    const outcome = ok({ ...tree(["README.md", "dags/farm_etl.py", "Dockerfile", "dbt_project.yml"], "# Pipeline\nThe data flow: ingest, validate, load.\n## Run\ndocker compose up") });
    const r = await runScreening(pipeline(), { verify: async () => outcome });
    expect(r.missing).toEqual([]);
    expect(r.requirements.find((q) => q.key === "pipeline_artifacts")?.outcome).toBe("met");
    expect(r.requirements.find((q) => q.key === "data_flow")?.outcome).toBe("met");
  });
});

describe("a link is not enough: the evidence must be of the right kind", () => {
  it("a design project with only a deployed-app link still lacks a design file", () => {
    const r = checkCompleteness(design({ artifacts: [art("deployed_app", "https://app.example.dev")] }), undefined);
    expect(fields(r)).toContain("Design file or prototype");
  });
  it("a dashboard project with only a video lacks analysis artifacts", () => {
    const r = checkCompleteness(dashboard({ artifacts: [art("demo_video", "https://youtu.be/x")] }), undefined);
    expect(fields(r)).toContain("Data science code");
  });
  it("a web app with no repository is incomplete, and one with an empty repository is too", () => {
    expect(fields(checkCompleteness(makeSubmission({ githubUrl: undefined }), undefined))).toContain("Source repository");
    expect(fields(checkCompleteness(makeSubmission(), ok({ ...tree(["README.md"]) })))).toContain("Source code");
  });
  it("an artifact without a description does not satisfy anything", () => {
    const r = checkCompleteness(design({ artifacts: [art("design_prototype", "https://www.figma.com/proto/x", "  ")] }), undefined);
    expect(fields(r)).toEqual(expect.arrayContaining(["Artifact 1 description", "Design file or prototype"]));
  });
  it("a bad artifact URL is reported, not trusted", () => {
    const r = checkCompleteness(design({ artifacts: [art("design_prototype", "javascript:alert(1)")] }), undefined);
    expect(fields(r)).toEqual(expect.arrayContaining(["Artifact 1 link", "Design file or prototype"]));
  });
  it("a backend API with a repo but no endpoint documentation gets an inconclusive flag, not Incomplete", () => {
    const sub = backend({ artifacts: [art("demo_video", "https://youtu.be/x")] });
    const r = checkCompleteness(sub, ok({ ...tree(["README.md", "app/main.py"], "# API\n## Run\npip install") }));
    expect(codes(r)).toContain("NO_API_DOCUMENTATION");
    expect(fields(r)).toEqual([]);
  });
});

describe("track and format rules combine, and the confirmed demo rule still holds", () => {
  it("Software Engineering still needs a working deployment or demo, whatever the format", () => {
    expect(fields(checkCompleteness(pipeline({ artifacts: [] }), undefined))).toContain("Demo URL");
    expect(fields(checkCompleteness(design({ artifacts: [art("design_prototype", "https://www.figma.com/proto/x"), art("design_documentation", "https://www.figma.com/board/y")] }), undefined))).not.toContain("Demo URL");
  });
  it("a demo video, deployed app or API collection counts as demo evidence; a plain notebook link does not", () => {
    for (const t of ["demo_video", "deployed_app", "api_collection"] as const) {
      expect(fields(checkCompleteness(pipeline({ artifacts: [art(t, "https://x.example/x")] }), undefined))).not.toContain("Demo URL");
    }
    expect(fields(checkCompleteness(pipeline({ artifacts: [art("notebook", "https://x.example/x")] }), undefined))).toContain("Demo URL");
  });
  it("Data Science projects are not asked for a deployed demo", () => {
    expect(fields(checkCompleteness(mlNotebook(), undefined))).not.toContain("Demo URL");
  });
  it("the Data Science track still asks for track-appropriate analysis artifacts, even on a design project (organizer decision flagged)", () => {
    expect(fields(checkCompleteness(design({ track: "Data Science" }), undefined))).toContain("Data science code");
  });
  it("several formats combine: a web app with a design adds the design file requirement", () => {
    const sub = makeSubmission({ projectFormats: ["web_app", "design_prototype"], githubUrl: undefined, artifacts: [] });
    expect(fields(checkCompleteness(sub, undefined))).toEqual(expect.arrayContaining(["Source repository", "Design file or prototype"]));
  });
  it("the stricter level wins when two formats expect the same evidence", () => {
    const sub = makeSubmission({ projectFormats: ["pipeline_automation", "web_app"], githubUrl: undefined, artifacts: [] });
    expect(checkCompleteness(sub, undefined).requirements.find((q) => q.key === "repository")?.level).toBe("required");
  });
});

describe("requirements follow the organizers' policy, not hardcoded assumptions", () => {
  it("a policy that does not require a repository for web apps stops flagging its absence", () => {
    const policy = { ...DEFAULT_POLICY, formatRequirements: { ...DEFAULT_POLICY.formatRequirements, web_app: [] } };
    expect(fields(checkCompleteness(makeSubmission({ githubUrl: undefined }), undefined, policy))).not.toContain("Source repository");
  });
  it("a policy can require a repository for design projects too", () => {
    const policy = { ...DEFAULT_POLICY, formatRequirements: { ...DEFAULT_POLICY.formatRequirements, design_prototype: [{ key: "repository" as const, level: "required" as const }] } };
    expect(fields(checkCompleteness(design(), undefined, policy))).toContain("Source repository");
  });
  it("a policy with no demo-required tracks drops the demo rule", () => {
    const policy = { ...DEFAULT_POLICY, demoUrlRequiredTracks: [] };
    expect(fields(checkCompleteness(pipeline({ artifacts: [] }), undefined, policy))).not.toContain("Demo URL");
  });
});

describe("the originality policy does not depend on the technology", () => {
  it("an ML repository is checked for forks and early creation exactly like a web app", async () => {
    const sub = makeSubmission({ track: "Data Science", disciplines: ["machine_learning"], projectFormats: ["ml_ai"], demoUrl: undefined });
    const outcome = ok({ ...tree(["README.md", "train.py", "model.pkl"], "# Model\naccuracy 0.91\n## Run\npip install"), createdAt: "2026-11-01T10:00:00Z", isFork: true, upstream: { fullName: "a/b", htmlUrl: "https://github.com/a/b", defaultBranch: "main" } });
    const r = await runScreening(sub, { verify: async () => outcome });
    expect(codes(r)).toEqual(expect.arrayContaining(["REPO_CREATED_BEFORE_START", "IS_FORK"]));
    expect(r.status).toBe("needs_review");
  });
  it("external resources and AI tool disclosure stay mandatory for every format", () => {
    const r = checkCompleteness(design({ externalResources: "", aiToolsUsed: "" }), undefined);
    expect(fields(r)).toEqual(expect.arrayContaining(["External resources", "AI tools used"]));
  });
  it("Charlie never claims an artifact's creation time was verified", async () => {
    for (const s of [design(), dashboard(), mlNotebook()]) {
      const r = await runScreening(s, { verify: vi.fn() });
      expect(r.artifactReviews.some((a) => a.creationTimeVerified)).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/created during the event|verified as created/i);
    }
  });
  it("a project with no repository and no work-product artifact is told it has no timeline evidence", async () => {
    const r = await runScreening(pipeline({ githubUrl: undefined, artifacts: [art("deployed_app", "https://app.example.dev")] }), { verify: vi.fn() });
    expect(codes(r)).toContain("NO_TIMELINE_EVIDENCE");
  });
});

describe("organizer work survives a re-run of a non-repository project", () => {
  it("keeps notes, the final decision and resolved flags, and the resolved timeline flag lets it reach Ready", async () => {
    const first = await runScreening(design(), { verify: vi.fn() });
    const reviewed = {
      ...first,
      finalDecision: "cleared" as const,
      notes: [{ id: "n1", author: "org@example.org", createdAt: "2026-11-07T18:00:00Z", body: "Checked Figma history by hand." }],
      flags: first.flags.map((f) => ({ ...f, resolved: true, resolvedBy: "org@example.org", resolutionNote: "Verified in Figma." })),
    };
    const again = await runScreening(design(), { verify: vi.fn(), previous: reviewed });
    expect(again.finalDecision).toBe("cleared");
    expect(again.notes).toHaveLength(1);
    expect(again.flags[0]).toMatchObject({ code: "ARTIFACT_TIMELINE_MANUAL_REVIEW", resolved: true, resolvedBy: "org@example.org" });
    expect(again.status).toBe("ready");
  });
});

describe("incomplete or unusual submissions", () => {
  it("asks for a format and discipline when none was chosen", () => {
    const r = checkCompleteness(makeSubmission({ projectFormats: [], disciplines: [] }), undefined);
    expect(fields(r)).toEqual(expect.arrayContaining(["Project format", "Disciplines"]));
  });
  it("asks for the Other discipline description", () => {
    expect(fields(checkCompleteness(makeSubmission({ disciplines: ["other"], otherDiscipline: " " }), undefined))).toContain("Other discipline");
  });
  it("an 'other' format needs at least one described artifact or a repository", () => {
    const base = makeSubmission({ projectFormats: ["other"], githubUrl: undefined, artifacts: [], demoUrl: "https://x.example/x" });
    expect(fields(checkCompleteness(base, undefined))).toContain("Project artifact");
    expect(fields(checkCompleteness({ ...base, artifacts: [art("other", "https://x.example/thing", "A hardware build log")] }, undefined))).not.toContain("Project artifact");
    expect(fields(checkCompleteness({ ...base, githubUrl: "https://github.com/o/r" }, undefined))).not.toContain("Project artifact");
  });
  it("an inaccessible repository is still Incomplete for a format that expects one, and design projects are unaffected", async () => {
    const gone: VerifyOutcome = { status: "not_accessible", reason: "not_found", message: "m", checkedAt: "t" };
    const r = await runScreening(makeSubmission(), { verify: async () => gone });
    expect(r.status).toBe("incomplete");
    expect(fields(r)).toContain("GitHub repository");
  });
});
