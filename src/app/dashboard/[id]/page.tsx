import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockSubmission } from "@/lib/mock-data";
import { formatEat } from "@/lib/format";
import { EVENT } from "@/lib/constants";
import { DemoBanner } from "@/components/DemoBanner";
import { FlagList } from "@/components/FlagList";
import { StatusBadge } from "@/components/StatusBadge";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const yn = (v?: boolean) => (v === undefined ? "Not checked" : v ? "Yes" : "No");

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
  const gh = r.github;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-slate-600 underline">← Back to dashboard</Link>
      <DemoBanner />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{s.teamName}</h1>
          <StatusBadge status={r.status} />
        </div>
        <p className="text-sm text-slate-700">{r.explanation}</p>
        {r.missing.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-slate-600">
            {r.missing.map((m) => <li key={m.field}><strong>{m.field}:</strong> {m.reason}</li>)}
          </ul>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Screening flags</h2>
        <FlagList flags={r.flags} />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Repository verification</h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-4">
          {gh ? (
            <>
              <Row label="Checked">{formatEat(gh.checkedAt)}</Row>
              <Row label="Accessible">{yn(gh.accessible)}</Row>
              <Row label="Repo created">{formatEat(gh.repoCreatedAt)}</Row>
              <Row label="Earliest commit">{formatEat(gh.earliestCommitAt)}</Row>
              <Row label="Default branch">{gh.defaultBranch ?? "—"}</Row>
              <Row label="Fork">{yn(gh.isFork)}</Row>
              <Row label="README">{yn(gh.hasReadme)}</Row>
            </>
          ) : (
            <Row label="Status">Not yet checked. Automated verification arrives in Phase 2.</Row>
          )}
        </dl>
        <p className="mt-1 text-xs text-slate-500">
          Event window: {EVENT.date}, 07:00–19:00 EAT. Dates on the event day are not proof the project was built during the event.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Team submission <span className="text-xs font-normal text-slate-500">(claims made by the team)</span></h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-4">
          <Row label="Members">{s.members.map((m) => m.name).join(", ")}</Row>
          <Row label="Track">{s.track}</Row>
          <Row label="Challenge">{s.challenge}</Row>
          <Row label="Problem">{s.problemDescription}</Row>
          <Row label="Solution">{s.proposedSolution}</Row>
          <Row label="Technologies">{s.technologies.join(", ")}</Row>
          <Row label="AI tools used">{s.aiToolsUsed}</Row>
          <Row label="External resources">{s.externalResources}</Row>
          <Row label="Testing instructions">{s.testingInstructions || "—"}</Row>
          <Row label="Links">
            <a href={s.githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Repository</a>
            {s.demoUrl && <> · <a href={s.demoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Demo</a></>}
          </Row>
        </dl>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Reviewer notes</h2>
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
      </section>

      <section>
        <h2 className="mb-2 font-semibold">AI summary</h2>
        <p className="text-sm text-slate-500">Claude-powered summaries arrive in Phase 3.</p>
      </section>
    </div>
  );
}
