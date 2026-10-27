import type { Track } from "./constants";
import { artifactFlags, manualReviews } from "./screening/artifacts";
import { checkCompleteness } from "./screening/completeness";
import { deriveStatus } from "./screening/status";
import type { Artifact, Discipline, ProjectFormat } from "./taxonomy";
import type {
  FlagKind,
  GithubVerification,
  MissingItem,
  ReviewNote,
  ScreeningFlag,
  Submission,
  SubmissionWithScreening,
} from "./types";

interface Seed {
  id: string;
  team: string;
  members: string[];
  track: Track;
  /** Defaults by track when omitted (older seeds). */
  disciplines?: Discipline[];
  formats?: ProjectFormat[];
  challenge: string;
  problem: string;
  solution: string;
  repo?: string;
  artifacts?: Artifact[];
  /** true: screening is computed by Charlie's own rules from the submission (no GitHub call). Otherwise hand-seeded. */
  computed?: boolean;
  demo?: string;
  tech: string[];
  ai: string;
  external: string;
  testing: string;
  at: string;
  github?: GithubVerification;
  missing?: MissingItem[];
  flags?: Omit<ScreeningFlag, "id" | "resolved">[];
  resolved?: string[]; // flag codes
  notes?: ReviewNote[];
}

const flag = (code: string, kind: FlagKind, title: string, detail: string, evidenceUrl?: string) => ({
  code,
  kind,
  title,
  detail,
  evidenceUrl,
});

const seeds: Seed[] = [
  {
    id: "s1",
    team: "Mwangaza Labs",
    members: ["Amina Odhiambo", "Brian Kiptoo"],
    track: "Software Engineering",
    challenge: "Improve access to clean water information",
    problem: "Residents of informal settlements can't tell which water kiosks are operating or what they charge.",
    solution: "A USSD + web app where kiosk operators post status and prices; residents search by location.",
    repo: "https://github.com/mwangaza-labs/kiosk-finder",
    demo: "https://kiosk-finder.example.app",
    tech: ["Next.js", "Supabase", "Africa's Talking"],
    ai: "GitHub Copilot for boilerplate; Claude to draft test cases.",
    external: "shadcn/ui components. No starter template.",
    testing: "Open the demo and search 'Kibera'. Operator login details are in the README.",
    at: "2026-11-07T14:20:00Z",
    github: { checkedAt: "2026-11-07T14:25:00Z", accessible: true, repoCreatedAt: "2026-11-07T04:40:00Z", defaultBranch: "main", earliestCommitAt: "2026-11-07T04:52:00Z", isFork: false, hasReadme: true, commitCount: 61 },
  },
  {
    id: "s2",
    team: "DataDuka",
    members: ["Cynthia Wanjiru", "Peter Mutua", "Ali Hassan"],
    track: "Data Science",
    challenge: "Predict maize price volatility",
    problem: "Smallholder farmers sell too early because they can't anticipate market price swings.",
    solution: "A gradient-boosted model forecasting weekly maize prices per county with a farmer-facing SMS summary.",
    repo: "https://github.com/dataduka/maize-forecast",
    tech: ["Python", "scikit-learn", "pandas"],
    ai: "ChatGPT for debugging pandas code.",
    external: "KAMIS public price data.",
    testing: "Run notebooks/01_eval.ipynb top to bottom.",
    at: "2026-11-07T15:02:00Z",
    github: { checkedAt: "2026-11-07T15:05:00Z", accessible: true, repoCreatedAt: "2026-11-02T09:10:00Z", defaultBranch: "main", earliestCommitAt: "2026-11-02T09:14:00Z", isFork: false, hasReadme: true, commitCount: 34 },
    flags: [
      flag("REPO_CREATED_BEFORE_EVENT", "verified", "Repository created before the event", "GitHub reports creation on 2 Nov 2026, five days before the event window.", "https://github.com/dataduka/maize-forecast"),
      flag("PRE_EVENT_COMMITS", "suspicious", "12 commits dated before the event", "Earliest commit 2 Nov 2026 09:14 UTC. Commit dates can be set by the author, so this needs human verification.", "https://github.com/dataduka/maize-forecast/commits/main?until=2026-11-07"),
    ],
  },
  {
    id: "s3",
    team: "Pesa Pulse",
    members: ["Joy Njeri"],
    track: "Software Engineering",
    challenge: "Simplify micro-merchant bookkeeping",
    problem: "Market vendors track sales on paper and can't see profit trends.",
    solution: "A voice-note based ledger that turns spoken sales into categorized records.",
    repo: "https://github.com/joynjeri/pesa-pulse",
    demo: "https://pesa-pulse.example.app",
    tech: ["React", "Node.js", "Whisper API"],
    ai: "Claude for code review.",
    external: "None.",
    testing: "Record 'sold three sukuma for 60 shillings' on the demo page.",
    at: "2026-11-07T13:45:00Z",
    github: { checkedAt: "2026-11-07T13:50:00Z", accessible: true, repoCreatedAt: "2026-11-07T05:30:00Z", defaultBranch: "main", earliestCommitAt: "2026-11-07T05:33:00Z", isFork: false, hasReadme: true, commitCount: 48 },
  },
  {
    id: "s4",
    team: "Gridlock",
    members: ["Samuel Otieno", "Faith Achieng"],
    track: "Software Engineering",
    challenge: "Reduce urban commute delays",
    problem: "Commuters in Nairobi lack real-time matatu route disruption info.",
    solution: "Crowdsourced disruption reports rendered on a live route map.",
    repo: "https://github.com/gridlock-ke/matatu-live",
    demo: "https://matatu-live.example.app",
    tech: ["Vue", "Firebase", "Mapbox"],
    ai: "None.",
    external: "Fork of an open-source transit map viewer.",
    testing: "See README.",
    at: "2026-11-07T15:30:00Z",
    github: { checkedAt: "2026-11-07T15:33:00Z", accessible: true, repoCreatedAt: "2026-11-07T06:00:00Z", defaultBranch: "main", earliestCommitAt: "2026-10-01T10:00:00Z", isFork: true, hasReadme: true, commitCount: 212 },
    flags: [
      flag("IS_FORK", "suspicious", "Repository is a fork", "Forked from transit-viewer/open-transit-map. Declared external resources mention a fork, so this may be legitimate.", "https://github.com/transit-viewer/open-transit-map"),
      flag("IMPORTED_HISTORY", "suspicious", "Commit history predates repository creation", "Earliest commit (1 Oct 2026) is older than the repo (7 Nov 2026), which suggests imported history.", "https://github.com/gridlock-ke/matatu-live/commits/main"),
    ],
    resolved: ["IS_FORK"],
    notes: [{ id: "n1", author: "organizer@zindua.test", createdAt: "2026-11-07T15:50:00Z", body: "Team declared the fork in their submission. Still checking how much was changed." }],
  },
  {
    id: "s5",
    team: "Kijani Insights",
    members: ["Wanjiku Kamau", "David Rono"],
    track: "Data Science",
    challenge: "Monitor deforestation from satellite imagery",
    problem: "Forest officers detect illegal clearing too late.",
    solution: "Change-detection pipeline over Sentinel-2 tiles that flags new clearings weekly.",
    repo: "https://github.com/kijani-insights/forest-watch",
    tech: ["Python", "rasterio", "PyTorch"],
    ai: "Claude for documentation.",
    external: "Sentinel-2 imagery (ESA).",
    testing: "Run `python run_pipeline.py --sample`.",
    at: "2026-11-07T16:10:00Z",
    github: { checkedAt: "2026-11-07T16:12:00Z" },
    flags: [
      flag("GITHUB_UNAVAILABLE", "inconclusive", "GitHub check could not be completed", "GitHub API returned a rate-limit response. This is a technical failure, not evidence of misconduct. Re-run verification."),
    ],
  },
  {
    id: "s6",
    team: "Tumaini Health",
    members: ["Grace Mbugua"],
    track: "Software Engineering",
    challenge: "Improve maternal health follow-up",
    problem: "Community health workers lose track of postnatal check-ups.",
    solution: "Offline-first PWA that schedules and reminds follow-ups.",
    repo: "https://github.com/tumaini-health/followup-pwa",
    tech: ["SvelteKit", "IndexedDB"],
    ai: "None.",
    external: "None.",
    testing: "",
    at: "2026-11-07T16:40:00Z",
    missing: [
      { field: "Testing instructions", reason: "Required field is empty." },
      { field: "Demo URL", reason: "A live demo is required for the Software Engineering track." },
    ],
  },
  {
    id: "s7",
    team: "Sauti",
    members: ["Ian Mwangi", "Lucy Akinyi"],
    track: "Data Science",
    challenge: "Detect misinformation in Swahili social posts",
    problem: "Existing classifiers underperform on Sheng and code-switched text.",
    solution: "Fine-tuned multilingual transformer with a Sheng-augmented dataset.",
    repo: "https://github.com/sauti-ds/sheng-misinfo",
    demo: "https://sauti.example.app",
    tech: ["Python", "Hugging Face", "FastAPI"],
    ai: "Claude for code review.",
    external: "AfriBERTa base model.",
    testing: "POST text to /predict (see README).",
    at: "2026-11-07T14:55:00Z",
    github: { checkedAt: "2026-11-07T15:00:00Z", accessible: true, repoCreatedAt: "2026-11-07T04:30:00Z", defaultBranch: "main", earliestCommitAt: "2026-11-07T04:45:00Z", isFork: false, hasReadme: true, commitCount: 39 },
  },
  {
    id: "s8",
    team: "Soko Smart",
    members: ["Moses Karanja", "Diana Chebet"],
    track: "Software Engineering",
    challenge: "Connect farmers directly to buyers",
    problem: "Middlemen take a large share of farmers' revenue.",
    solution: "A marketplace with escrow payments over M-Pesa.",
    repo: "https://github.com/soko-smart/marketplace",
    demo: "https://soko.example.app",
    tech: ["Next.js", "PostgreSQL", "M-Pesa Daraja"],
    ai: "Copilot.",
    external: "Next.js commerce starter template.",
    testing: "Sign in as the buyer account listed in the demo page footer.",
    at: "2026-11-07T15:15:00Z",
    github: { checkedAt: "2026-11-07T15:20:00Z", accessible: true, repoCreatedAt: "2026-11-07T04:20:00Z", defaultBranch: "main", earliestCommitAt: "2026-11-07T04:21:00Z", isFork: false, hasReadme: false, commitCount: 5 },
    flags: [
      flag("EVENT_DAY_NOT_PROOF", "info", "Repository created on event day", "Creation on the event date is expected and is not proof the project was built during the event."),
      flag("NO_README", "inconclusive", "No README found", "The repository has no README, so setup and testing cannot be checked from the repo.", "https://github.com/soko-smart/marketplace"),
      flag("LARGE_INITIAL_COMMIT", "suspicious", "Large initial commit", "First commit 1 minute after creation. A starter template is declared, so this may be benign.", "https://github.com/soko-smart/marketplace/commits/main"),
    ],
  },
  {
    // Fictional team pointing at GitHub's public sample repository, so "Run live verification" can be tried for real.
    id: "s9",
    team: "Live Test (Hello-World)",
    members: ["Demo Member"],
    track: "Software Engineering",
    challenge: "Demo: exercising live GitHub verification",
    problem: "Organizers need to see live verification working end to end.",
    solution: "Points at the public octocat/Hello-World repository. It pre-dates the event, so it should be flagged.",
    repo: "https://github.com/octocat/Hello-World",
    demo: "https://demo.example.app",
    tech: ["Git"],
    ai: "None.",
    external: "None.",
    testing: "Run live verification from the report page.",
    at: "2026-11-07T12:00:00Z",
  },
  {
    // Design project: no repository. Evidence lives on a design platform, so its timeline needs manual inspection.
    id: "s10",
    team: "Pesa Plain Studio",
    members: ["Wanjiku Maina", "Tom Okello"],
    track: "Software Engineering",
    disciplines: ["design"],
    formats: ["design_prototype"],
    challenge: "Make mobile money easier for first-time users",
    problem: "First-time mobile money users abandon transfers because confirmation screens use unfamiliar financial jargon.",
    solution: "A plain-language transfer flow with visual confirmation steps, tested as a clickable prototype.",
    artifacts: [
      { type: "design_prototype", url: "https://www.figma.com/proto/pesa-plain-example", description: "Clickable prototype of the transfer flow (12 screens).", timelineEvidence: "Figma version history starts 7 Nov, 07:40 EAT; page 'Flow v1' created at 08:15." },
      { type: "design_documentation", url: "https://www.figma.com/board/pesa-plain-flows-example", description: "User flow diagram and the three usability-test notes." },
    ],
    tech: ["Figma", "FigJam"],
    ai: "None.",
    external: "Material Design icon set. No templates.",
    testing: "Open the prototype and follow the 'Send money' path. The flow board explains each step.",
    at: "2026-11-07T15:40:00Z",
    computed: true,
  },
  {
    // Dashboard / BI project on a non-GitHub platform.
    id: "s11",
    team: "Kilimo Insights",
    members: ["Esther Njeri", "Dennis Ochieng", "Faith Akinyi"],
    track: "Data Science",
    disciplines: ["analytics_bi", "data_science"],
    formats: ["dashboard_bi", "data_analysis"],
    challenge: "Predict maize price volatility",
    problem: "County agricultural officers lack a simple view of how maize prices moved over the last five years.",
    solution: "A Power BI dashboard of county price trends with a short methodology note on how outliers were handled.",
    artifacts: [
      { type: "dashboard", url: "https://app.powerbi.com/view?r=kilimo-insights-example", description: "Published Power BI report with county filters and price trend pages." },
      { type: "dataset_documentation", url: "https://docs.google.com/document/d/kilimo-data-example", description: "Source of the price data (KAMIS open data) and cleaning steps." },
      { type: "evaluation_report", url: "https://docs.google.com/document/d/kilimo-method-example", description: "Methodology note: outlier handling and trend smoothing." },
    ],
    tech: ["Power BI", "Excel", "DAX"],
    ai: "ChatGPT for DAX formula debugging.",
    external: "KAMIS open price data. No templates.",
    testing: "Open the dashboard, pick a county in the filter and compare the trend pages. The method note explains the smoothing.",
    at: "2026-11-07T14:50:00Z",
    computed: true,
  },
  {
    // Backend/API project: repository plus API documentation and a test collection; no user-facing site.
    id: "s12",
    team: "Ledger Forge",
    members: ["Ibrahim Salim", "Grace Mwende"],
    track: "Software Engineering",
    disciplines: ["backend"],
    formats: ["backend_api"],
    challenge: "Help small shops keep reliable records",
    problem: "Small shops record sales on paper and lose track of credit given to customers.",
    solution: "A REST API for sales, credit and payments with idempotent endpoints, meant to back any shop app.",
    repo: "https://github.com/ledger-forge/shop-ledger-api",
    artifacts: [
      { type: "api_docs", url: "https://ledger-forge.example.dev/docs", description: "OpenAPI reference for all 14 endpoints." },
      { type: "api_collection", url: "https://www.postman.com/ledger-forge/collection-example", description: "Postman collection with a happy-path run and the idempotency tests." },
    ],
    tech: ["FastAPI", "PostgreSQL", "Docker"],
    ai: "GitHub Copilot for boilerplate.",
    external: "FastAPI and SQLAlchemy. No starter template.",
    testing: "Import the Postman collection, set the base URL from the README and run the collection.",
    at: "2026-11-07T15:10:00Z",
    computed: true,
  },
  {
    // ML project delivered as a notebook and model card. No frontend and no deployment.
    id: "s13",
    team: "Mvua Models",
    members: ["Joyce Kamau", "Samuel Rotich"],
    track: "Data Science",
    disciplines: ["machine_learning", "data_science"],
    formats: ["ml_ai", "notebook"],
    challenge: "Predict maize price volatility",
    problem: "Rainfall variability makes next-season yield hard to anticipate for smallholder farmers.",
    solution: "A gradient-boosted model forecasting seasonal rainfall anomalies per county, documented with a model card.",
    artifacts: [
      { type: "notebook", url: "https://colab.research.google.com/drive/mvua-models-example", description: "End-to-end notebook: data load, features, training and evaluation." },
      { type: "model_card", url: "https://huggingface.co/mvua-models/rainfall-gbm-example", description: "Model card with training data, intended use and limitations." },
    ],
    tech: ["Python", "scikit-learn", "pandas", "Google Colab"],
    ai: "Claude for explaining scikit-learn errors.",
    external: "CHIRPS rainfall data (public). No starter code.",
    testing: "Open the notebook and run all cells in order. It downloads the public data and prints the evaluation table at the end.",
    at: "2026-11-07T14:30:00Z",
    computed: true,
  },
  {
    // Pipeline project under the Software Engineering track: shows the demo rule applying, and what is missing.
    id: "s14",
    team: "Shamba Pipes",
    members: ["Kevin Barasa"],
    track: "Software Engineering",
    disciplines: ["data_engineering", "automation_devops"],
    formats: ["pipeline_automation"],
    challenge: "Make farm data usable",
    problem: "Cooperative farm records arrive as scattered spreadsheets and cannot be combined.",
    solution: "An Airflow pipeline that ingests the spreadsheets, validates them and loads a clean PostgreSQL schema.",
    repo: "https://github.com/shamba-pipes/farm-etl",
    tech: ["Airflow", "PostgreSQL", "dbt", "Docker"],
    ai: "None.",
    external: "Apache Airflow and dbt. No starter template.",
    testing: "Run docker compose up, then trigger the farm_etl DAG from the Airflow UI.",
    at: "2026-11-07T15:55:00Z",
    computed: true,
  },
];

function toSubmission(s: Seed): Submission {
  const ds = s.track === "Data Science";
  return {
    id: s.id,
    createdAt: s.at,
    teamName: s.team,
    members: s.members.map((name) => ({ name })),
    track: s.track,
    disciplines: s.disciplines ?? (ds ? ["data_science", "machine_learning"] : ["fullstack"]),
    projectFormats: s.formats ?? (ds ? ["ml_ai"] : ["web_app"]),
    challenge: s.challenge,
    problemDescription: s.problem,
    proposedSolution: s.solution,
    githubUrl: s.repo,
    artifacts: s.artifacts ?? [],
    demoUrl: s.demo,
    technologies: s.tech,
    aiToolsUsed: s.ai,
    externalResources: s.external,
    testingInstructions: s.testing,
  };
}

export const mockSubmissions: SubmissionWithScreening[] = seeds.map((s) => {
  const submission = toSubmission(s);

  if (s.computed) {
    // Computed by Charlie's own deterministic rules from the submission. Nothing is fetched: a repository, if
    // any, stays unverified until someone runs live verification. Still labelled "mock" because the team is fictional.
    const completeness = checkCompleteness(submission, undefined);
    const artifactReviews = manualReviews(submission);
    const flags: ScreeningFlag[] = [...completeness.flags, ...artifactFlags(submission, artifactReviews)].map((f, i) => ({
      ...f,
      id: `${s.id}-f${i}`,
      resolved: false,
    }));
    const { status, explanation } = deriveStatus(completeness.missing, flags);
    return {
      submission,
      screening: {
        submissionId: s.id,
        source: "mock",
        status,
        explanation,
        missing: completeness.missing,
        flags,
        requirements: completeness.requirements,
        artifactReviews,
        notes: [],
        finalDecision: "pending",
      },
    };
  }

  const flags: ScreeningFlag[] = (s.flags ?? []).map((f, i) => {
    const isResolved = !!s.resolved?.includes(f.code);
    return {
      ...f,
      id: `${s.id}-f${i}`,
      resolved: isResolved,
      resolvedBy: isResolved ? "organizer@zindua.test" : undefined,
      resolutionNote: isResolved ? "Declared by team; verified." : undefined,
    };
  });
  const missing = s.missing ?? [];
  const { status, explanation } = deriveStatus(missing, flags);
  return {
    submission,
    screening: {
      submissionId: s.id,
      source: "mock",
      status,
      explanation,
      missing,
      flags,
      requirements: [],
      artifactReviews: [],
      github: s.github,
      notes: s.notes ?? [],
      finalDecision: "pending",
    },
  };
});

export function getMockSubmission(id: string) {
  return mockSubmissions.find((m) => m.submission.id === id);
}
