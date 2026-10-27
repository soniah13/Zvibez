import type { SubmissionWithScreening } from "@/lib/types";

export function StatsBar({ items }: { items: SubmissionWithScreening[] }) {
  const count = (s: string) => items.filter((i) => i.screening.status === s).length;
  const stats = [
    { label: "Total submissions", value: items.length },
    { label: "Ready for review", value: count("ready") },
    { label: "Needs review", value: count("needs_review") },
    { label: "Incomplete", value: count("incomplete") },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <dt className="text-xs text-slate-500">{s.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
