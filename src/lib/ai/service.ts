import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { VerifyOutcome } from "../github/types";
import type { ScreeningResult, Submission } from "../types";
import { buildEvidenceBundle } from "./evidence";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { modelOutputJsonSchema, modelOutputSchema, type SummaryError, type SummaryOutcome } from "./schema";
import { assembleSummary } from "./summary";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** The only fields Charlie ever sends. Note there is no `tools` entry: the model cannot call anything. */
export interface SummaryRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
  output_config: { effort: "medium"; format: { type: "json_schema"; schema: Record<string, unknown> } };
}

/** The parts of a Messages API response that Charlie reads. */
export interface ModelResponse {
  model?: string;
  stop_reason?: string | null;
  content: { type: string; text?: string }[];
}

export type CreateMessage = (req: SummaryRequest) => Promise<ModelResponse>;

export interface SummaryInput {
  submission: Submission;
  screening: ScreeningResult;
  outcome?: VerifyOutcome;
}

export interface ServiceOptions {
  /** Defaults to ANTHROPIC_API_KEY. Without one, every call returns a not_configured error. */
  apiKey?: string;
  /** Defaults to CHARLIE_AI_MODEL, then claude-opus-5-5. */
  model?: string;
  timeoutMs?: number;
  /** Server-side refusal fallback (beta). On by default; CHARLIE_AI_FALLBACKS=off disables it. */
  useFallbacks?: boolean;
  /** Injected in tests. */
  createMessage?: CreateMessage;
  now?: () => Date;
  cacheTtlMs?: number;
}

const CACHE_LIMIT = 200;

const err = (code: SummaryError["code"], message: string): SummaryOutcome => ({ ok: false, error: { code, message } });

export function createSummaryService(options: ServiceOptions = {}) {
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.ANTHROPIC_API_KEY;
  const model = options.model ?? process.env.CHARLIE_AI_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const now = options.now ?? (() => new Date());
  const ttl = options.cacheTtlMs ?? 6 * 60 * 60 * 1000;
  const useFallbacks = options.useFallbacks ?? process.env.CHARLIE_AI_FALLBACKS !== "off";

  const cache = new Map<string, { summary: Extract<SummaryOutcome, { ok: true }>["summary"]; at: number }>();
  const inFlight = new Map<string, Promise<SummaryOutcome>>();

  async function callModel(req: SummaryRequest): Promise<ModelResponse> {
    if (options.createMessage) return options.createMessage(req);
    const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
    if (useFallbacks) {
      const res = await client.beta.messages.create({ ...req, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
      return res as unknown as ModelResponse;
    }
    return (await client.messages.create(req)) as unknown as ModelResponse;
  }

  async function run(input: SummaryInput, fingerprint: string, cacheKey: string): Promise<SummaryOutcome> {
    const bundle = buildEvidenceBundle(input);
    const request: SummaryRequest = {
      model,
      max_tokens: 12_000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(bundle.items) }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: modelOutputJsonSchema } },
    };

    let response: ModelResponse;
    try {
      response = await callModel(request);
    } catch (e) {
      const failure = classifyError(e);
      // Log the class of failure only: upstream messages can carry request details.
      console.error("AI summary failed:", failure.code);
      return { ok: false, error: failure };
    }

    if (response.stop_reason === "refusal") {
      return err("refusal", "The AI declined to produce a summary for this submission. Review it manually.");
    }
    if (response.stop_reason === "max_tokens") {
      return err("truncated", "The AI response was cut off before it finished. Try again.");
    }

    const text = (response.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return err("malformed", "The AI returned a response that could not be read. Try again.");
    }
    const valid = modelOutputSchema.safeParse(parsed);
    if (!valid.success) {
      return err("malformed", "The AI returned a response that did not match the expected format. Try again.");
    }

    const summary = assembleSummary({
      output: valid.data,
      bundle,
      submission: input.submission,
      screening: input.screening,
      model: response.model ?? model,
      fingerprint,
      now: now(),
    });
    cache.set(cacheKey, { summary, at: Date.now() });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    return { ok: true, summary, cached: false };
  }

  /**
   * Generates (or returns the cached) summary. A valid report for the same evidence is reused unless
   * `force` is set, and simultaneous requests for the same evidence share one model call.
   */
  async function generate(input: SummaryInput, opts: { force?: boolean } = {}): Promise<SummaryOutcome> {
    if (!apiKey) {
      return err("not_configured", "AI summaries are not configured: ANTHROPIC_API_KEY is not set on the server.");
    }
    const bundle = buildEvidenceBundle(input);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ v: PROMPT_VERSION, model, items: bundle.items }))
      .digest("hex")
      .slice(0, 16);
    const cacheKey = `${input.submission.id}:${fingerprint}`;

    if (!opts.force) {
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < ttl) return { ok: true, summary: hit.summary, cached: true };
    }
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;

    const promise = run(input, fingerprint, cacheKey).finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, promise);
    return promise;
  }

  return { generate, model };
}

/** Maps SDK and network failures to organizer-friendly errors. Works on duck-typed errors too. */
export function classifyError(e: unknown): SummaryError {
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : undefined;
  const name = e instanceof Error ? e.name : "";
  if (/timeout|abort/i.test(name) || /timed? ?out/i.test((e as Error)?.message ?? "")) {
    return { code: "timeout", message: "The AI service did not respond in time. Try again shortly." };
  }
  if (status === 429) return { code: "rate_limited", message: "The AI service is rate limited right now. Try again in a minute." };
  if (status === 401 || status === 403) {
    return { code: "not_configured", message: "The AI service rejected the configured credentials. Check ANTHROPIC_API_KEY on the server." };
  }
  if (status !== undefined && status >= 500) return { code: "api_error", message: "The AI service is temporarily unavailable. Try again shortly." };
  if (status === 400) return { code: "api_error", message: "The AI service rejected the request. Contact the Charlie maintainers." };
  return { code: "api_error", message: "The AI summary could not be generated. Try again." };
}

let singleton: ReturnType<typeof createSummaryService> | undefined;
/** Shared instance so the cache and in-flight de-duplication work across requests. */
export function getSummaryService() {
  return (singleton ??= createSummaryService());
}
