import { NextResponse } from "next/server";

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Rejects cross-site browser requests so a third-party page cannot spend our API quota. */
export function crossOriginResponse(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).host === req.headers.get("host")) return null;
  } catch {
    return json({ error: "Invalid origin." }, 403);
  }
  return json({ error: "Cross-origin requests are not allowed." }, 403);
}

export const isValidId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
