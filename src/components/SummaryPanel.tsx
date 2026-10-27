"use client";

import { useState } from "react";
import { formatEat } from "@/lib/format";
import type { ProjectSummary, SummaryError } from "@/lib/ai/schema";
import type { ScreeningResult } from "@/lib/types";
import { FlagBadge, StatusBadge } from "./StatusBadge";

type Basis = "team_claim" | "readme" | "file_paths";
const BASIS_LABEL: Record<Basis, string> = { team_claim: "team claim", readme: "README", file_paths: "file paths" };
const EVIDENCE_STATUS: Record<string, { label: string; cls: string }> = {
  supported: { label: "Supported by repository", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  partially_supported: { label: "Partly supported", cls: "bg-amber-50 text-amber-900 ring-amber-600/30" },
  not_verified: { label: "Not verified", cls: "bg-slate-100 text-slate-700 ring-slate-500/30" },
  contradicted: { label: "Conflicts with repository", cls: "bg-red-50 text-red-800 ring-red-600/20" },
};
const ALIGNMENT_LABEL: Record<string, string> = { strong: "Strong", partial: "Partial", weak: "Weak", cannot_determine: "Cannot determine" };
const CHECK_LABELS: [keyof ProjectSummary["checksPerformed"], string][] = [
  ["repositoryMetadata", "Repository metadata read"],
  ["commitHistory", "Commit history read"],
  ["fileListing", "File list read"],
  ["readmeExcerptRead", "README text read"],
  ["sourceFilesRead", "Source file contents read"],
  ["codeExecuted", "Submitted code run"],
  ["deploymentTested", "Demo / deployment tested"],
  ["modelEvaluated", "Model evaluated"],
];

const chip = "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset";

function Section({ tag, tagClass, title, note, children }: { tag: string; tagClass: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${chip} ${tagClass}`}>{tag}</span>
        <h3 className="font-medium">{title}</h3>
      </div>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {children}
    </section>
  );
}

const Refs = ({ refs }: { refs: string[] }) =>
  refs.length === 0 ? null : (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {refs.map((r) => (
        <span key={r} className="rounded bg-slate-100 px-1 font-mono text-[11px] text-slate-600">{r}</span>
      ))}
    </span>
  );

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-sm whitespace-pre-wrap">{children}</dd>
  </div>
);

export function SummaryPanel({ submissionId, onScreening }: { submissionId: string; onScreening: (r: ScreeningResult) => void }) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SummaryError | null>(null);

  async function generate(force: boolean) {
    if (loading) return; // never stack duplicate requests
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/summary/${submissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const body = (await res.json().catch(() => null)) as {
        summary?: ProjectSummary;
        cached?: boolean;
        screening?: ScreeningResult;
        error?: SummaryError;
      } | null;
      // The summary is built from live verification, so show that same evidence in the screening panel.
      if (body?.screening) onScreening(body.screening);
      if (!res.ok || !body?.summary) {
        setError(body?.error ?? { code: "api_error", message: `The summary could not be generated (HTTP ${res.status}).` });
        return;
      }
      setSummary(body.summary);
      setCached(body.cached === true);
    } catch {
      setError({ code: "api_error", message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">AI summary</h2>
        <button
          type="button"
          onClick={() => generate(summary !== null)}
          disabled={loading}
          className="rounded-md bg-violet-700 px-3 py-1.5 text-sm text-white hover:bg-violet-600 disabled:opacity-60"
        >
          {loading ? "Generating…" : summary ? "Regenerate summary" : "Generate AI summary"}
        </button>
      </div>

      {!summary && !loading && !error && (
        <p className="text-sm text-slate-500">
          Claude writes a briefing for judges from the team&apos;s submission, the GitHub verification results and a bounded README
          excerpt and file list. Source code is not read, and secrets are removed before anything is sent. It does not change the
          screening status or decide eligibility.
        </p>
      )}
      {loading && <p role="status" className="text-sm text-slate-500">Checking GitHub if needed, then asking Claude. This can take up to a minute…</p>}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error.message}
          {summary ? " The previous summary is still shown." : ""}
        </p>
      )}

      {summary && <SummaryBody summary={summary} cached={cached} />}
    </div>
  );
}

function SummaryBody({ summary: m, cached }: { summary: ProjectSummary; cached: boolean }) {
  const a = m.assessment;
  const v = m.verification;
  return (
    <div className="space-y-4">
      <p role="note" className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
        <strong>AI-generated briefing for organizers and judges.</strong> It can be wrong. It does not score or rank the project,
        decide eligibility or change the screening status. Generated {formatEat(m.generatedAt)} by {m.model}
        {cached ? " (stored report for unchanged evidence)" : ""}.
      </p>

      <Section tag="What Charlie did" tagClass="bg-slate-100 text-slate-700 ring-slate-500/30" title="Checks performed and not performed">
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {CHECK_LABELS.map(([k, label]) => (
            <li key={k} className={m.checksPerformed[k] ? "text-slate-800" : "text-slate-500"}>
              <span aria-hidden>{m.checksPerformed[k] ? "✓" : "✗"}</span> {label}: <strong>{m.checksPerformed[k] ? "yes" : "no"}</strong>
            </li>
          ))}
        </ul>
      </Section>

      <Section tag="Team claims" tagClass="bg-slate-100 text-slate-700 ring-slate-500/30" title="What the team says" note="Copied from the submission. Not verified.">
        <dl className="divide-y divide-slate-100">
          <Row label="Problem">{m.claims.problem}</Row>
          <Row label="Solution">{m.claims.solution}</Row>
          <Row label="Technologies">{m.claims.technologies.join(", ")}</Row>
          <Row label="AI tools declared">{m.claims.aiToolsDeclared}</Row>
          <Row label="External resources declared">{m.claims.externalResourcesDeclared}</Row>
          <Row label="Testing instructions">{m.claims.testingInstructions || "—"}</Row>
        </dl>
      </Section>

      <Section
        tag={v.screeningSource === "live" ? "GitHub facts · live" : "Screening · mock"}
        tagClass="bg-sky-50 text-sky-900 ring-sky-600/20"
        title="Repository verification findings"
        note="From Charlie's deterministic checks, not from the AI. Flags are signals for humans, not proof of misconduct."
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={v.status} />
          <span className="text-slate-700">{v.statusExplanation}</span>
        </div>
        {v.missing.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-slate-600">
            {v.missing.map((x) => (
              <li key={x.field}>
                <strong>{x.field}:</strong> {x.reason}
              </li>
            ))}
          </ul>
        )}
        {v.flags.length === 0 ? (
          <p className="text-sm text-slate-500">No flags were raised.</p>
        ) : (
          <ul className="space-y-1.5">
            {v.flags.map((f) => (
              <li key={f.code} className="text-sm">
                <FlagBadge kind={f.kind} /> <span className={f.resolved ? "line-through text-slate-400" : ""}>{f.title}</span>
                {f.resolved && <span className="ml-1 text-xs text-emerald-700">resolved</span>}
                {f.evidenceUrl && (
                  <a href={f.evidenceUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-700 underline">
                    evidence
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {v.repository && v.repository.branchesInspected.length > 0 && (
          <p className="text-xs text-slate-500">Branches inspected: {v.repository.branchesInspected.join(", ")}</p>
        )}
        {v.repository && v.repository.limitations.length > 0 && (
          <p className="text-xs text-amber-900">Not checked: {v.repository.limitations.join(" ")}</p>
        )}
        <p className="text-xs text-slate-500">Final organizer decision: <strong>{v.finalDecision}</strong></p>
      </Section>

      <Section tag="AI assessment" tagClass="bg-violet-50 text-violet-900 ring-violet-600/20" title="What the AI concludes from that evidence" note="Evidence ids show what each statement rests on.">
        <p className="text-sm">{a.overview}</p>
        <dl className="divide-y divide-slate-100">
          <Row label="Problem (as stated)">{a.problemSummary}</Row>
          <Row label="Solution (as stated)">{a.solutionSummary}</Row>
        </dl>

        <h4 className="pt-2 text-sm font-medium">Main features</h4>
        {a.mainFeatures.length === 0 ? (
          <p className="text-sm text-slate-500">No features could be tied to the supplied evidence.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {a.mainFeatures.map((f, i) => (
              <li key={i}>
                {f.feature} <span className="text-xs text-slate-500">({BASIS_LABEL[f.basis]})</span>
                <Refs refs={f.evidenceRefs} />
              </li>
            ))}
          </ul>
        )}

        {a.technologies.length > 0 && (
          <p className="text-sm">
            <strong>Technologies:</strong> {a.technologies.map((t) => `${t.name} (${BASIS_LABEL[t.basis]})`).join(", ")}
          </p>
        )}

        <h4 className="pt-2 text-sm font-medium">Evidence of implementation</h4>
        <p className="text-xs text-slate-500">File paths show that files exist, not that they work. Source contents were not read.</p>
        {a.implementationEvidence.length === 0 ? (
          <p className="text-sm text-slate-500">No implementation claims could be assessed.</p>
        ) : (
          <ul className="space-y-2">
            {a.implementationEvidence.map((e, i) => {
              const s = EVIDENCE_STATUS[e.status];
              return (
                <li key={i} className="text-sm">
                  <span className={`${chip} ${s.cls}`}>{s.label}</span> {e.claim}
                  <Refs refs={e.evidenceRefs} />
                  {e.note && <p className="mt-0.5 text-slate-600">{e.note}</p>}
                </li>
              );
            })}
          </ul>
        )}

        <h4 className="pt-2 text-sm font-medium">Problem–solution alignment: {ALIGNMENT_LABEL[a.alignment.rating]}</h4>
        <p className="text-sm">
          {a.alignment.reasoning}
          <Refs refs={a.alignment.evidenceRefs} />
        </p>

        {a.strengths.length > 0 && (
          <>
            <h4 className="pt-2 text-sm font-medium">Strengths supported by repository evidence</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {a.strengths.map((s, i) => (
                <li key={i}>
                  {s.statement}
                  <Refs refs={s.evidenceRefs} />
                </li>
              ))}
            </ul>
          </>
        )}

        {a.missingInformation.length > 0 && (
          <>
            <h4 className="pt-2 text-sm font-medium">Missing information and unresolved questions</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">{a.missingInformation.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>
        )}

        {a.judgeQuestions.length > 0 && (
          <>
            <h4 className="pt-2 text-sm font-medium">Suggested questions for judges</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">{a.judgeQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>
        )}

        <h4 className="pt-2 text-sm font-medium">Limitations and uncertainty</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{a.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
        {m.sanitization.removedOrDowngraded > 0 && (
          <p className="text-xs text-amber-900">
            {m.sanitization.removedOrDowngraded} statement(s) were removed or downgraded because the evidence did not support them.
          </p>
        )}
      </Section>
    </div>
  );
}
