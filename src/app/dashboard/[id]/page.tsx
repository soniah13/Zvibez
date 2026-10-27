import { Suspense } from "react";
import Link from "next/link";
import { artifactLabel, disciplineLabel, formatLabel } from "@/lib/taxonomy";
import { notFound } from "next/navigation";
import { getMockSubmission } from "@/lib/mock-data";
import { formatEat } from "@/lib/format";
import { DemoBanner } from "@/components/DemoBanner";
import { ReportPanels } from "@/components/ReportPanels";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function ReportPage({ params }: PageProps<"/dashboard/[id]">) {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-slate-500">Loading report…</p>}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: PageProps<"/dashboard/[id]">["params"] }) {
  const { id } = await params;
  const item = getMockSubmission(id);
  if (!item) notFound();
  const { submission: s, screening: r } = item;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-slate-600 underline">← Back to dashboard</Link>
      <DemoBanner />
      <h1 className="text-xl font-semibold">{s.teamName}</h1>

      <ReportPanels submissionId={s.id} initial={r} hasRepository={!!s.githubUrl}>
        <section>
          <h2 className="mb-2 font-semibold">Team submission <span className="text-xs font-normal text-slate-500">(claims made by the team)</span></h2>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-4">
            <Row label="Members">{s.members.map((m) => m.name).join(", ")}</Row>
            <Row label="Track">{s.track}</Row>
            <Row label="Disciplines">{[...s.disciplines.map(disciplineLabel), ...(s.otherDiscipline ? [`Other: ${s.otherDiscipline}`] : [])].join("; ")}</Row>
            <Row label="Project format">{s.projectFormats.map(formatLabel).join("; ")}</Row>
            <Row label="Challenge">{s.challenge}</Row>
            <Row label="Problem">{s.problemDescription}</Row>
            <Row label="Solution">{s.proposedSolution}</Row>
            <Row label="Technologies">{s.technologies.join(", ")}</Row>
            <Row label="AI tools used">{s.aiToolsUsed}</Row>
            <Row label="External resources">{s.externalResources}</Row>
            <Row label="Testing instructions">{s.testingInstructions || "—"}</Row>
            <Row label="Links">
              {s.githubUrl ? <a href={s.githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Repository</a> : <span className="text-slate-500">No repository submitted</span>}
              {s.demoUrl && <> · <a href={s.demoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Demo</a></>}
            </Row>
            {s.artifacts.length > 0 && (
              <Row label="Artifacts">
                <ul className="space-y-1">
                  {s.artifacts.map((a, i) => (
                    <li key={i}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{artifactLabel(a.type)}</a>
                      <span className="text-slate-600"> — {a.description}</span>
                      {a.timelineEvidence && <span className="block text-xs text-slate-500">Team states: {a.timelineEvidence} (unverified)</span>}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
          </dl>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Reviewer notes and final decision</h2>
          {r.notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet. Manual review controls arrive in Phase 4.</p>
          ) : (
            <ul className="space-y-2">
              {r.notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <p>{n.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{n.author} · {formatEat(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Final organizer decision: <strong>{r.finalDecision}</strong>. Only humans set this.</p>
        </section>
      </ReportPanels>
    </div>
  );
}
