import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, submissionSchema } from "./validation";

const base = {
  teamName: "Team",
  members: [{ name: "A" }],
  track: "Software Engineering",
  disciplines: ["design"],
  projectFormats: ["design_prototype"],
  challenge: "c",
  problemDescription: "p",
  proposedSolution: "s",
  githubUrl: "",
  artifacts: [{ type: "design_prototype", url: "https://www.figma.com/proto/x", description: "Clickable prototype" }],
  demoUrl: "",
  technologies: ["Figma"],
  aiToolsUsed: "None",
  externalResources: "None",
  testingInstructions: "Open the prototype",
  mediaUrl: "",
};
const parse = (over: Record<string, unknown> = {}) => submissionSchema.safeParse({ ...base, ...over });
const firstError = (over: Record<string, unknown>) => {
  const r = parse(over);
  return r.success ? undefined : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("a non-repository project is a valid submission", () => {
  it("accepts a design project with no GitHub URL and artifact links", () => {
    expect(parse().success).toBe(true);
  });
  it("accepts an omitted GitHub URL and omitted artifacts", () => {
    const { githubUrl: _g, artifacts: _a, ...rest } = base;
    expect(submissionSchema.safeParse(rest).success).toBe(true);
  });
  it("still rejects a GitHub URL that is not a GitHub repository", () => {
    expect(firstError({ githubUrl: "https://gitlab.com/o/r" })?.join()).toMatch(/githubUrl/);
  });
});

describe("disciplines and formats", () => {
  it("allows several of each", () => {
    expect(parse({ disciplines: ["frontend", "backend", "machine_learning"], projectFormats: ["web_app", "ml_ai"] }).success).toBe(true);
  });
  it("requires at least one of each", () => {
    expect(firstError({ disciplines: [] })?.join()).toMatch(/disciplines/);
    expect(firstError({ projectFormats: [] })?.join()).toMatch(/projectFormats/);
  });
  it("rejects values outside the vocabulary", () => {
    expect(parse({ disciplines: ["quantum_wizardry"] }).success).toBe(false);
    expect(parse({ projectFormats: ["spreadsheet"] }).success).toBe(false);
  });
  it("requires a description when Other is chosen, and not otherwise", () => {
    expect(firstError({ disciplines: ["other"] })?.join()).toMatch(/otherDiscipline/);
    expect(parse({ disciplines: ["other"], otherDiscipline: "Bioinformatics" }).success).toBe(true);
    expect(parse({ disciplines: ["design"], otherDiscipline: "" }).success).toBe(true);
  });
  it("keeps the official track separate and still validated", () => {
    expect(parse({ track: "Design" }).success).toBe(false);
    expect(parse({ track: "Data Science" }).success).toBe(true);
  });
});

describe("technologies", () => {
  it("accepts any tool, however unfamiliar, and normalises it", () => {
    const r = parse({ technologies: ["  Zig ", "zig", "Obscure Toolkit", "R"] });
    expect(r.success && r.data.technologies).toEqual(["Zig", "Obscure Toolkit", "R"]);
  });
  it("needs at least one and at most 30, each 50 characters or fewer", () => {
    expect(parse({ technologies: [] }).success).toBe(false);
    expect(parse({ technologies: ["", "  "] }).success).toBe(false);
    expect(parse({ technologies: Array.from({ length: 31 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(parse({ technologies: ["x".repeat(51)] }).success).toBe(false);
  });
});

describe("artifacts", () => {
  const art = (over = {}) => ({ type: "notebook", url: "https://colab.research.google.com/drive/x", description: "Analysis notebook", ...over });
  it("needs a known type, a safe URL and a description", () => {
    expect(parse({ artifacts: [art({ type: "spaceship" })] }).success).toBe(false);
    expect(parse({ artifacts: [art({ description: " " })] }).success).toBe(false);
    expect(parse({ artifacts: [art({ url: "ftp://example.com/x" })] }).success).toBe(false);
    expect(parse({ artifacts: [art({ url: "javascript:alert(1)" })] }).success).toBe(false);
  });
  it("rejects links with embedded credentials", () => {
    expect(isSafeHttpUrl("https://user:secret@example.com/x")).toBe(false);
    expect(parse({ artifacts: [art({ url: "https://user:secret@example.com/x" })] }).success).toBe(false);
    expect(parse({ demoUrl: "https://user:secret@example.com/x" }).success).toBe(false);
  });
  it("accepts an optional team timeline note and caps the list at 15", () => {
    expect(parse({ artifacts: [art({ timelineEvidence: "Version history starts 07:40 EAT" })] }).success).toBe(true);
    expect(parse({ artifacts: Array.from({ length: 16 }, () => art()) }).success).toBe(false);
    expect(parse({ artifacts: Array.from({ length: 15 }, () => art()) }).success).toBe(true);
  });
});
