import type { ScreeningStatus } from "../constants";
import type { MissingItem, ScreeningFlag } from "../types";

/**
 * Derives the screening status. Pure and deterministic.
 * Charlie only ever recommends a status; it never disqualifies a team.
 */
export function deriveStatus(
  missing: MissingItem[],
  flags: ScreeningFlag[],
): { status: ScreeningStatus; explanation: string } {
  if (missing.length > 0) {
    return {
      status: "incomplete",
      explanation: `Missing required information: ${missing.map((m) => m.field).join(", ")}.`,
    };
  }
  const open = flags.filter((f) => !f.resolved && f.kind !== "info");
  if (open.length > 0) {
    const n = open.length;
    return {
      status: "needs_review",
      explanation: `${n} unresolved ${n === 1 ? "flag requires" : "flags require"} manual verification: ${open
        .map((f) => f.title)
        .join("; ")}. Flags are signals for organizers, not proof of misconduct.`,
    };
  }
  return {
    status: "ready",
    explanation: "All required information is present and no unresolved screening concerns were detected.",
  };
}
