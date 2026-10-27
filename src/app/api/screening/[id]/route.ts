import { NextResponse } from "next/server";
import { createGithubClient } from "@/lib/github/client";
import { getMockSubmission } from "@/lib/mock-data";
import { runScreening } from "@/lib/screening/run";

// Phase 4 replaces the mock lookup with Supabase and adds organizer authentication.
// Until then this route is unauthenticated, so it is throttled per submission.
const COOLDOWN_MS = 10_000;
const lastRun = new Map<string, number>();

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(req: Request, { params }: RouteContext<"/api/screening/[id]">) {
  // Reject cross-site browser requests so a third-party page cannot spend our GitHub quota.
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return json({ error: "Cross-origin requests are not allowed." }, 403);
    } catch {
      return json({ error: "Invalid origin." }, 403);
    }
  }

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return json({ error: "Invalid submission id." }, 400);

  const existing = getMockSubmission(id);
  if (!existing) return json({ error: "Submission not found." }, 404);

  const now = Date.now();
  const last = lastRun.get(id);
  if (last !== undefined && now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return json({ error: `Verification was just run. Try again in ${wait}s.` }, 429, { "Retry-After": String(wait) });
  }
  lastRun.set(id, now);

  try {
    const github = createGithubClient();
    const result = await runScreening(existing.submission, {
      verify: (url) => github.verifyRepository(url),
      previous: existing.screening,
    });
    return json({ result });
  } catch (e) {
    // Log only the error class: messages from upstream could contain request details.
    console.error("screening run failed:", e instanceof Error ? e.name : "unknown");
    lastRun.delete(id);
    return json({ error: "Screening failed unexpectedly. Please try again." }, 500);
  }
}
