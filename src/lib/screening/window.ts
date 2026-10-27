import { EVENT } from "../constants";

export type WindowPosition = "before_start" | "within_window" | "after_deadline" | "invalid";

export interface BuildWindow {
  /** Inclusive start (UTC ISO). */
  startUtc: string;
  /** Deadline (UTC ISO). The deadline instant itself is still inside the window. */
  deadlineUtc: string;
}

export const EVENT_WINDOW: BuildWindow = {
  startUtc: EVENT.windowStartUtc,
  deadlineUtc: EVENT.windowEndUtc,
};

// Requires an explicit offset so a timezone-less string is never silently read in the server local zone.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseInstant(iso: string | undefined): number | null {
  if (!iso || !HAS_OFFSET.test(iso)) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** start <= t <= deadline is within the window; t < start is before; t > deadline is after. */
export function classifyTimestamp(iso: string | undefined, window: BuildWindow = EVENT_WINDOW): WindowPosition {
  const t = parseInstant(iso);
  if (t === null) return "invalid";
  if (t < Date.parse(window.startUtc)) return "before_start";
  if (t > Date.parse(window.deadlineUtc)) return "after_deadline";
  return "within_window";
}

/** Calendar date (YYYY-MM-DD) of an instant in Africa/Nairobi, or null if invalid. */
export function eatDate(iso: string | undefined): string | null {
  const t = parseInstant(iso);
  if (t === null) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}
