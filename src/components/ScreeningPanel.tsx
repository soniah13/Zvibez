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

const yn = (v?: boolean, unknown = "Unknown") => (v === undefined ? unknown : v ? "Yes" : "No");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function ScreeningPanel({ submissionId, initial }: { submissionId: string; initial: ScreeningResult }) {
  const [r, setR] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screening/${submissionId}`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { result?: ScreeningResult; error?: string } | null;
      if (!res.ok || !body?.result) throw new Error(body?.error ?? `Verification failed (HTTP ${res.status}).`);
      setR(body.result);
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
            {live ? `Live GitHub verification · ${formatEat(gh?.checkedAt)}` : "Mock result · demo data, not live"}
          </span>
          <button
            type="button"
            onClick={rerun}
            disabled={loading}
            className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Checking GitHub…" : live ? "Re-run verification" : "Run live verification"}
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
            <Row label="Status">Not yet checked. Use “Run live verification”.</Row>
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
