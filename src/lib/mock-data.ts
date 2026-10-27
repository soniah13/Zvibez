import type { Track } from "./constants";
import { deriveStatus } from "./screening/status";
import type {
  FlagKind,
  GithubVerification,
  MissingItem,
  ReviewNote,
  ScreeningFlag,
  SubmissionWithScreening,
} from "./types";

interface Seed {
  id: string;
  team: string;
  members: string[];
  track: Track;
  challenge: string;
  problem: string;
  solution: string;
  repo: string;
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
    github: { checkedAt: "2026-11-07T16:12:00Z", accessible: false },
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
    missing: [{ field: "Testing instructions", reason: "Required field is empty." }],
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
];

export const mockSubmissions: SubmissionWithScreening[] = seeds.map((s) => {
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
    submission: {
      id: s.id,
      createdAt: s.at,
      teamName: s.team,
      members: s.members.map((name) => ({ name })),
      track: s.track,
      challenge: s.challenge,
      problemDescription: s.problem,
      proposedSolution: s.solution,
      githubUrl: s.repo,
      demoUrl: s.demo,
      technologies: s.tech,
      aiToolsUsed: s.ai,
      externalResources: s.external,
      testingInstructions: s.testing,
    },
    screening: {
      submissionId: s.id,
      status,
      explanation,
      missing,
      flags,
      github: s.github,
      notes: s.notes ?? [],
      finalDecision: "pending",
    },
  };
});

export function getMockSubmission(id: string) {
  return mockSubmissions.find((m) => m.submission.id === id);
}
