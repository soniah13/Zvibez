export const EVENT = {
  name: "Zinduathon 3.0",
  date: "2026-11-07",
  timezone: "Africa/Nairobi",
  // 07:00–19:00 EAT (UTC+3) expressed in UTC
  windowStartUtc: "2026-11-07T04:00:00Z",
  windowEndUtc: "2026-11-07T16:00:00Z",
} as const;

export const TRACKS = ["Software Engineering", "Data Science"] as const;
export type Track = (typeof TRACKS)[number];

export const SCREENING_STATUSES = ["ready", "needs_review", "incomplete"] as const;
export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];

export const STATUS_LABEL: Record<ScreeningStatus, string> = {
  ready: "Ready for review",
  needs_review: "Needs review",
  incomplete: "Incomplete",
};

export const FINAL_DECISIONS = ["pending", "cleared", "escalated", "rejected_by_organizer"] as const;
export type FinalDecision = (typeof FINAL_DECISIONS)[number];
