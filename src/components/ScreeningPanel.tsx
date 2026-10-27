"use client";

import { useState } from "react";
import { formatEat } from "@/lib/format";
import type { FlagKind, ScreeningFlag, ScreeningResult } from "@/lib/types";
import { FlagList } from "./FlagList";
import { StatusBadge } from "./StatusBadge";

const GROUPS: { kind: FlagKind; title: string; blurb: string }[] = [
  { kind: "verified", title: "Verified findings", blurb: "Facts retrieved from GitHub that need a human look. A fact is not proof of misconduct." },
  { kind: "suspicious", title: "Suspicious signals", blurb: "Patterns that may indicate pre-existing work but have legitimate explanations." },
  { kind: "inconclusive", title: "Inconclusive checks", blurb: "Could not be completed or are ambiguous. Technical failures are never evidence of misconduct." },
  { kind: "info", title: "Information", blurb: "Context only. Does not affect the status." },
];

const OUTCOME: Record<string, { label: string; cls: string }> = {
  met: { label: "Found", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  declared_not_inspected: { label: "Declared, not opened", cls: "bg-sky-50 text-sky-900 ring-sky-600/20" },
  not_found: { label: "Not found", cls: "bg-amber-50 text-amber-900 ring-amber-600/30" },
  unknown: { label: "Could not check", cls: "bg-slate-100 text-slate-700 ring-slate-500/30" },
};

const yn = (v?: boolean, unknown = "Unknown") => (v === undefined ? unknown : v ? "Yes" : "No");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function ScreeningPanel({
  submissionId,
  result: r,
  onResult,
  hasRepository,
}: {
  submissionId: string;
  result: ScreeningResult;
  onResult: (result: ScreeningResult) => void;
  hasRepository: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screening/${submissionId}`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { result?: ScreeningResult; error?: string } | null;
      if (!res.ok || !body?.result) throw new Error(body?.error ?? `Verification failed (HTTP ${res.status}).`);
      onResult(body.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  const gh = r.github;
  const live = r.source === "live";
  const byKind = (k: FlagKind): ScreeningFlag[] => r.flags.filter((f) => f.kind === k);

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={r.status} />
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${live ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-900"}`}
          >
            {live ? (hasRepository ? `Live GitHub verification · ${formatEat(gh?.checkedAt)}` : "Live rule check · no repository submitted") : "Mock result · demo data, not live"}
          </span>
          <button
            type="button"
            onClick={rerun}
            disabled={loading}
            className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? (hasRepository ? "Checking GitHub…" : "Checking…") : live ? "Re-run verification" : hasRepository ? "Run live verification" : "Re-run checks"}
          </button>
        </div>
        <p className="text-sm text-slate-700">{r.explanation}</p>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {error} The previous result is still shown.
          </p>
        )}
        {r.missing.length > 0 && (
          <div>
            <h3 className="text-sm font-medium">Missing information</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
              {r.missing.map((m) => (
                <li key={m.field}>
                  <strong>{m.field}:</strong> {m.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Screening flags</h2>
        {r.flags.length === 0 && <FlagList flags={[]} />}
        {GROUPS.map((g) => {
          const flags = byKind(g.kind);
          if (flags.length === 0) return null;
          return (
            <div key={g.kind} className="space-y-1">
              <h3 className="text-sm font-medium">
                {g.title} <span className="font-normal text-slate-500">({flags.length})</span>
              </h3>
              <p className="text-xs text-slate-500">{g.blurb}</p>
              <FlagList flags={flags} />
            </div>
          );
        })}
      </section>

      {r.requirements.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Evidence expected for this project&apos;s format</h2>
          <p className="mb-2 text-xs text-slate-500">
            Set by the organizers&apos; policy for the declared format and track. A link alone does not count: the artifact must be of a
            suitable type, or repository files must match. Nothing was opened or run.
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-4">
            {r.requirements.map((q) => {
              const o = OUTCOME[q.outcome];
              return (
                <li key={q.key} className="py-2 text-sm">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${o.cls}`}>{o.label}</span>{" "}
                  {q.label} <span className="text-xs text-slate-500">({q.level})</span>
                  <p className="text-xs text-slate-600">{q.detail}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {r.artifactReviews.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Artifacts recorded for manual inspection</h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-4">
            {r.artifactReviews.map((a, i) => (
              <li key={i} className="py-2 text-sm">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                  {a.type.replace(/_/g, " ")} on {a.platform}
                </a>{" "}
                <span className="text-xs text-slate-500">Creation time verified: {a.creationTimeVerified ? "yes" : "no"}</span>
                <p className="text-xs text-slate-600">Team&apos;s description: {a.description}</p>
                {a.timelineEvidence && <p className="text-xs text-slate-600">Team states (unverified): {a.timelineEvidence}</p>}
                <p className="text-xs text-slate-500">{a.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Repository verification</h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-4">
          {gh ? (
            <>
              <Row label="Checked">{formatEat(gh.checkedAt)}</Row>
              <Row label="Accessible">{yn(gh.accessible, "Unknown (check could not be completed)")}</Row>
              <Row label="Repo created">{formatEat(gh.repoCreatedAt)}</Row>
              <Row label="Earliest commit seen">{formatEat(gh.earliestCommitAt)}</Row>
              <Row label="Default branch">{gh.defaultBranch ?? "—"}</Row>
              <Row label="Fork">{yn(gh.isFork, "Not checked")}{gh.upstream ? ` of ${gh.upstream}` : ""}</Row>
              <Row label="README">{yn(gh.hasReadme, "Not checked")}</Row>
              {gh.branches && (
                <Row label="Branches inspected">
                  {gh.branches.length === 0 ? (
                    "None"
                  ) : (
                    <ul className="space-y-0.5">
                      {gh.branches.map((b) => (
                        <li key={b.name}>
                          <span className="font-mono text-xs">{b.name}</span>
                          {b.isDefault && " (default)"}: {b.commitsExamined}
                          {b.totalCommits !== undefined && ` of ${b.totalCommits}`} commits examined,{" "}
                          {b.historyComplete ? "full history" : "partial history"}
                        </li>
                      ))}
                    </ul>
                  )}
                </Row>
              )}
              {gh.limitations && gh.limitations.length > 0 && (
                <Row label="Not checked">
                  <ul className="list-disc pl-4 text-amber-900">
                    {gh.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </Row>
              )}
            </>
          ) : (
            <Row label="Status">{hasRepository ? "Not yet checked. Use “Run live verification”." : "No GitHub repository was submitted, so none was checked. See the artifacts above."}</Row>
          )}
        </dl>
        <p className="mt-1 text-xs text-slate-500">
          Timestamps come from git metadata that authors can edit, so they are signals, not proof. Submitted code is never
          executed and repository text is never treated as instructions.
        </p>
      </section>
    </div>
  );
}
