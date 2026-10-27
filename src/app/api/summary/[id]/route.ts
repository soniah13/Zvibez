import { crossOriginResponse, isValidId, json } from "@/lib/api";
import { getSummaryService } from "@/lib/ai/service";
import type { SummaryErrorCode } from "@/lib/ai/schema";
import { getMockSubmission } from "@/lib/mock-data";
import { getLive, verifyAndScreen } from "@/lib/screening/live-store";

// A model call can take a while; platforms that honour this keep the request alive long enough.
export const maxDuration = 150;

// Phase 4 adds organizer authentication. Until then, regenerating is throttled per submission.
const FORCE_COOLDOWN_MS = 15_000;
const lastForced = new Map<string, number>();

const STATUS: Record<SummaryErrorCode, number> = {
  not_configured: 503,
  timeout: 504,
  rate_limited: 429,
  api_error: 502,
  refusal: 502,
  truncated: 502,
  malformed: 502,
};

export async function POST(req: Request, { params }: RouteContext<"/api/summary/[id]">) {
  const blocked = crossOriginResponse(req);
  if (blocked) return blocked;

  const { id } = await params;
  if (!isValidId(id)) return json({ error: { code: "bad_request", message: "Invalid submission id." } }, 400);
  const existing = getMockSubmission(id);
  if (!existing) return json({ error: { code: "not_found", message: "Submission not found." } }, 404);

  // Fail fast and cheaply: no GitHub calls if AI is not configured.
  const service = getSummaryService();
  if (!service.configured) {
    return json(
      { error: { code: "not_configured", message: "AI summaries are not configured: ANTHROPIC_API_KEY is not set on the server." } },
      STATUS.not_configured,
    );
  }

  const body = (await req.json().catch(() => null)) as { force?: unknown } | null;
  const force = body?.force === true;

  if (force) {
    const last = lastForced.get(id);
    if (last !== undefined && Date.now() - last < FORCE_COOLDOWN_MS) {
      return json({ error: { code: "rate_limited", message: "A summary was just regenerated. Try again in a few seconds." } }, 429, { "Retry-After": "15" });
    }
    lastForced.set(id, Date.now());
  }

  try {
    // Use the live evidence the organizer already has; verify first only if there is none yet.
    const live = getLive(id) ?? (await verifyAndScreen(existing.submission, existing.screening));

    const outcome = await service.generate(
      { submission: existing.submission, screening: live.result, outcome: live.outcome },
      { force },
    );
    if (!outcome.ok) {
      return json({ error: outcome.error, screening: live.result }, STATUS[outcome.error.code]);
    }
    // The screening result is returned unchanged, so the page can show the evidence the summary used.
    return json({ summary: outcome.summary, cached: outcome.cached, screening: live.result });
  } catch (e) {
    console.error("summary route failed:", e instanceof Error ? e.name : "unknown");
    return json({ error: { code: "api_error", message: "The summary could not be generated. Try again." } }, 500);
  }
}
