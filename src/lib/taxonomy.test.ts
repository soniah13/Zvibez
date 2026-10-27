import { describe, expect, it } from "vitest";
import { ARTIFACT_TYPES, DISCIPLINES, PROJECT_FORMATS, TECH_SUGGESTIONS, isTimelineRelevant, normalizeTechnologies, platformOf } from "./taxonomy";

describe("technologies are open-ended", () => {
  it("keeps unfamiliar tools exactly as typed and never checks an approved list", () => {
    expect(normalizeTechnologies(["Zig", "Obscure-ML-Toolkit 2", "Figma"])).toEqual(["Zig", "Obscure-ML-Toolkit 2", "Figma"]);
    expect(TECH_SUGGESTIONS).not.toContain("Obscure-ML-Toolkit 2");
  });
  it("trims, collapses whitespace, strips control characters and drops case-insensitive duplicates", () => {
    expect(normalizeTechnologies(["  React ", "react", "Power\u0000  BI", "", "   ", "POWER BI"])).toEqual(["React", "Power BI"]);
  });
  it("does not score or order by popularity", () => {
    expect(normalizeTechnologies(["Zz", "Aa", "React"])).toEqual(["Zz", "Aa", "React"]);
  });
});

describe("vocabularies", () => {
  it("cover every discipline and format the organizers listed, with an Other escape hatch", () => {
    const d = DISCIPLINES.map((x) => x.id);
    for (const id of ["frontend", "backend", "fullstack", "design", "analytics_bi", "data_science", "machine_learning", "ai_applications", "data_engineering", "automation_devops", "embedded_iot", "other"]) {
      expect(d).toContain(id);
    }
    const f = PROJECT_FORMATS.map((x) => x.id);
    for (const id of ["web_app", "backend_api", "mobile_desktop_cli", "dashboard_bi", "data_analysis", "notebook", "ml_ai", "pipeline_automation", "design_prototype", "other"]) {
      expect(f).toContain(id);
    }
  });
  it("only work-product artifacts need timeline inspection", () => {
    expect(isTimelineRelevant("design_prototype")).toBe(true);
    expect(isTimelineRelevant("notebook")).toBe(true);
    expect(isTimelineRelevant("deployed_app")).toBe(false);
    expect(isTimelineRelevant("demo_video")).toBe(false);
    expect(ARTIFACT_TYPES.length).toBeGreaterThan(10);
  });
});

describe("platformOf labels links by hostname only", () => {
  it("names well-known platforms and falls back to the host", () => {
    expect(platformOf("https://www.figma.com/design/abc")).toBe("Figma");
    expect(platformOf("https://app.powerbi.com/view?r=x")).toBe("Power BI");
    expect(platformOf("https://colab.research.google.com/drive/x")).toBe("Google Colab");
    expect(platformOf("https://my-team.example.dev/docs")).toBe("my-team.example.dev");
    expect(platformOf("not a url")).toBe("unknown");
  });
  it("is not fooled by a platform name in the path or a look-alike host", () => {
    expect(platformOf("https://evil.example/figma.com")).toBe("evil.example");
    expect(platformOf("https://figma.com.evil.example/x")).toBe("figma.com.evil.example");
  });
});
