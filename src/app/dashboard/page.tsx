import { Suspense } from "react";
import Link from "next/link";
import { SCREENING_STATUSES, STATUS_LABEL, TRACKS } from "@/lib/constants";
import { mockSubmissions } from "@/lib/mock-data";
import { PROJECT_FORMATS } from "@/lib/taxonomy";
import { DemoBanner } from "@/components/DemoBanner";
import { StatsBar } from "@/components/StatsBar";
import { SubmissionTable } from "@/components/SubmissionTable";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-slate-500">Loading submissions…</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase();
  const track = first(sp.track);
  const status = first(sp.status);
  const format = first(sp.format);

  const filtered = mockSubmissions.filter(
    ({ submission, screening }) =>
      (!q || submission.teamName.toLowerCase().includes(q)) &&
      (!track || submission.track === track) &&
      (!format || submission.projectFormats.some((f) => f === format)) &&
      (!status || screening.status === status),
  );
  const hasFilters = !!(q || track || status || format);
  const field = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Organizer dashboard</h1>
      </div>
      <DemoBanner />

      <StatsBar items={mockSubmissions} />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search team name" aria-label="Search team name" className={`${field} w-56`} />
        <select name="track" defaultValue={track} aria-label="Filter by track" className={field}>
          <option value="">All tracks</option>
          {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="format" defaultValue={format} aria-label="Filter by project format" className={field}>
          <option value="">All formats</option>
          {PROJECT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Filter by status" className={field}>
          <option value="">All statuses</option>
          {SCREENING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Apply</button>
        {hasFilters && <Link href="/dashboard" className="text-sm text-slate-600 underline">Clear</Link>}
      </form>

      <SubmissionTable items={filtered} />
    </div>
  );
}
