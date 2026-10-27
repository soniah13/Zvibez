import type { ScreeningFlag } from "@/lib/types";
import { FlagBadge } from "./StatusBadge";

export function FlagList({ flags }: { flags: ScreeningFlag[] }) {
  if (flags.length === 0) {
    return <p className="text-sm text-slate-500">No flags were raised for this submission.</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {flags.map((f) => (
        <li key={f.id} className="space-y-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FlagBadge kind={f.kind} />
            <span className={`font-medium ${f.resolved ? "text-slate-400 line-through" : ""}`}>{f.title}</span>
            {f.resolved && <span className="text-xs text-emerald-700">Resolved</span>}
          </div>
          <p className="text-sm text-slate-600">{f.detail}</p>
          {f.evidenceUrl && (
            <a href={f.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">
              View evidence
            </a>
          )}
          {f.resolved && f.resolutionNote && (
            <p className="text-xs text-slate-500">
              {f.resolvedBy}: {f.resolutionNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
