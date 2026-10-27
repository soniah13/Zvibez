import "server-only";
import { createGithubClient } from "../github/client";
import type { VerifyOutcome } from "../github/types";
import type { ScreeningResult, Submission } from "../types";
import { runScreening } from "./run";

/**
 * Holds the latest live verification per submission, server-side and in memory, so that an AI summary
 * is built from the same evidence the organizer already saw instead of asking GitHub again.
 * Phase 4 replaces this with Supabase. Entries expire, and a restart clears them.
 */
export interface LiveEntry {
  result: ScreeningResult;
  /** Raw verification outcome, including README text and file paths. Never sent to browsers. */
  outcome: VerifyOutcome;
  savedAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const store = new Map<string, LiveEntry>();
const inFlight = new Map<string, Promise<LiveEntry>>();

export function getLive(id: string): LiveEntry | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt > TTL_MS) {
    store.delete(id);
    return undefined;
  }
  return entry;
}

/** Runs GitHub verification and deterministic screening, then remembers the evidence. Shares concurrent runs. */
export function verifyAndScreen(submission: Submission, previous?: ScreeningResult): Promise<LiveEntry> {
  const running = inFlight.get(submission.id);
  if (running) return running;

  const promise = (async () => {
    const github = createGithubClient();
    let outcome: VerifyOutcome | undefined;
    const result = await runScreening(submission, {
      verify: async (url) => (outcome = await github.verifyRepository(url)),
      previous,
    });
    // verify() always runs inside runScreening, so outcome is set.
    const entry: LiveEntry = { result, outcome: outcome as VerifyOutcome, savedAt: Date.now() };
    store.set(submission.id, entry);
    return entry;
  })().finally(() => inFlight.delete(submission.id));

  inFlight.set(submission.id, promise);
  return promise;
}
