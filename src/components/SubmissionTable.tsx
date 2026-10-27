import Link from "next/link";
import type { SubmissionWithScreening } from "@/lib/types";
import { formatEat } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function SubmissionTable({ items }: { items: SubmissionWithScreening[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        No submissions match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Team</th>
            <th className="px-4 py-2 font-medium">Track</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Why</th>
            <th className="px-4 py-2 font-medium">Links</th>
            <th className="px-4 py-2 font-medium">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(({ submission: s, screening }) => (
            <tr key={s.id} className="align-top hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/dashboard/${s.id}`} className="font-medium text-blue-800 hover:underline">
                  {s.teamName}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">{s.track}</td>
              <td className="px-4 py-3"><StatusBadge status={screening.status} /></td>
              <td className="max-w-sm px-4 py-3 text-slate-600">{screening.explanation}</td>
              <td className="space-y-1 px-4 py-3">
                <a href={s.githubUrl} target="_blank" rel="noopener noreferrer" className="block text-blue-700 underline">Repo</a>
                {s.demoUrl && (
                  <a href={s.demoUrl} target="_blank" rel="noopener noreferrer" className="block text-blue-700 underline">Demo</a>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatEat(s.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
