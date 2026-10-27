/**
 * Descriptive vocabularies for what teams build. These describe projects; they never restrict which
 * technologies a team may use, and they are separate from the official competition tracks (constants.ts).
 */

export const DISCIPLINES = [
  { id: "frontend", label: "Frontend development" },
  { id: "backend", label: "Backend development and APIs" },
  { id: "fullstack", label: "Full-stack development" },
  { id: "mobile_desktop_cli", label: "Mobile, desktop or command-line applications" },
  { id: "design", label: "UI/UX design and prototyping" },
  { id: "analytics_bi", label: "Data analytics and business intelligence" },
  { id: "data_science", label: "Data science and statistical analysis" },
  { id: "machine_learning", label: "Machine learning and predictive modelling" },
  { id: "ai_applications", label: "AI applications and intelligent systems" },
  { id: "data_engineering", label: "Data engineering and data pipelines" },
  { id: "automation_devops", label: "Automation, DevOps and cloud engineering" },
  { id: "embedded_iot", label: "Embedded systems and IoT" },
  { id: "other", label: "Other (describe)" },
] as const;
export type Discipline = (typeof DISCIPLINES)[number]["id"];
export const DISCIPLINE_IDS = DISCIPLINES.map((d) => d.id) as [Discipline, ...Discipline[]];
export const disciplineLabel = (id: string) => DISCIPLINES.find((d) => d.id === id)?.label ?? id;

export const PROJECT_FORMATS = [
  { id: "web_app", label: "Web application or frontend interface" },
  { id: "backend_api", label: "Backend service or API" },
  { id: "mobile_desktop_cli", label: "Mobile, desktop or command-line application" },
  { id: "dashboard_bi", label: "Dashboard or business intelligence report" },
  { id: "data_analysis", label: "Data analysis or research project" },
  { id: "notebook", label: "Jupyter notebook or reproducible analysis" },
  { id: "ml_ai", label: "Machine learning model or AI-powered application" },
  { id: "pipeline_automation", label: "Data pipeline or automation workflow" },
  { id: "design_prototype", label: "UI/UX design or interactive prototype" },
  { id: "other", label: "Other technical deliverable" },
] as const;
export type ProjectFormat = (typeof PROJECT_FORMATS)[number]["id"];
export const PROJECT_FORMAT_IDS = PROJECT_FORMATS.map((f) => f.id) as [ProjectFormat, ...ProjectFormat[]];
export const formatLabel = (id: string) => PROJECT_FORMATS.find((f) => f.id === id)?.label ?? id;

/**
 * timelineRelevant: the artifact is itself work product whose creation time matters for the event window.
 * Deployments, videos and documentation links only show that something exists, so they need no timeline review.
 */
export const ARTIFACT_TYPES = [
  { id: "github_repository", label: "GitHub repository", timelineRelevant: true },
  { id: "deployed_app", label: "Deployed application", timelineRelevant: false },
  { id: "api_docs", label: "API documentation", timelineRelevant: false },
  { id: "api_collection", label: "API testing collection", timelineRelevant: true },
  { id: "design_prototype", label: "Design file or interactive prototype", timelineRelevant: true },
  { id: "design_documentation", label: "User flows or design documentation", timelineRelevant: true },
  { id: "dashboard", label: "Dashboard or report", timelineRelevant: true },
  { id: "notebook", label: "Notebook", timelineRelevant: true },
  { id: "dataset_documentation", label: "Dataset or data provenance documentation", timelineRelevant: true },
  { id: "model_card", label: "Model card", timelineRelevant: true },
  { id: "evaluation_report", label: "Evaluation or methodology report", timelineRelevant: true },
  { id: "reproducible_script", label: "Reproducible script or pipeline configuration", timelineRelevant: true },
  { id: "demo_video", label: "Demo video or screenshots", timelineRelevant: false },
  { id: "other", label: "Other project evidence", timelineRelevant: true },
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]["id"];
export const ARTIFACT_TYPE_IDS = ARTIFACT_TYPES.map((a) => a.id) as [ArtifactType, ...ArtifactType[]];
export const artifactLabel = (id: string) => ARTIFACT_TYPES.find((a) => a.id === id)?.label ?? id;
export const isTimelineRelevant = (id: ArtifactType) => ARTIFACT_TYPES.find((a) => a.id === id)?.timelineRelevant ?? true;

export interface Artifact {
  type: ArtifactType;
  url: string;
  /** The team's own short description of what this evidence is. */
  description: string;
  /** The team's own account of when and how this was made (e.g. where to find version history). Unverified. */
  timelineEvidence?: string;
}

/**
 * Suggestions for the technology picker. Examples only: any other value is accepted as typed, and stacks
 * are stored as free-form tags so a new tool never needs a code or schema change.
 */
export const TECH_SUGGESTIONS = [
  "React", "Vue", "Angular", "Next.js", "Node.js", "Django", "FastAPI", "Flask", "Spring Boot",
  "PostgreSQL", "MySQL", "MongoDB", "Firebase", "Supabase", "Python", "R", "SQL", "TypeScript", "JavaScript",
  "Java", "Kotlin", "Flutter", "React Native", "Power BI", "Tableau", "Excel", "Figma", "Adobe XD",
  "TensorFlow", "PyTorch", "scikit-learn", "pandas", "Jupyter", "dbt", "Airflow", "Docker", "Kubernetes",
  "AWS", "Azure", "Google Cloud", "Arduino", "Raspberry Pi",
];

/** Trims, collapses whitespace, removes control characters and drops case-insensitive duplicates. Keeps the first spelling. */
export function normalizeTechnologies(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const name = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Well-known platform names by hostname. Used only as a label; Charlie never fetches these links. */
const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)gitlab\.com$/, "GitLab"],
  [/(^|\.)figma\.com$/, "Figma"],
  [/(^|\.)canva\.com$/, "Canva"],
  [/(^|\.)miro\.com$/, "Miro"],
  [/(^|\.)adobe\.com$/, "Adobe"],
  [/(^|\.)tableau\.com$/, "Tableau"],
  [/(^|\.)powerbi\.com$/, "Power BI"],
  [/(^|\.)lookerstudio\.google\.com$/, "Looker Studio"],
  [/(^|\.)colab\.research\.google\.com$/, "Google Colab"],
  [/(^|\.)kaggle\.com$/, "Kaggle"],
  [/(^|\.)huggingface\.co$/, "Hugging Face"],
  [/(^|\.)postman\.(com|co)$/, "Postman"],
  [/(^|\.)swagger\.io$/, "Swagger"],
  [/(^|\.)docs\.google\.com$/, "Google Docs"],
  [/(^|\.)drive\.google\.com$/, "Google Drive"],
  [/(^|\.)notion\.(so|site)$/, "Notion"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)loom\.com$/, "Loom"],
  [/(^|\.)vercel\.app$|(^|\.)netlify\.app$|(^|\.)onrender\.com$|(^|\.)herokuapp\.com$/, "Hosting platform"],
];

export function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return "unknown";
  }
}
