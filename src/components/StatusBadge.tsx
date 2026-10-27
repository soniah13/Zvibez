import { STATUS_LABEL, type ScreeningStatus } from "@/lib/constants";
import type { FlagKind } from "@/lib/types";

const STATUS_STYLE: Record<ScreeningStatus, string> = {
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  needs_review: "bg-amber-50 text-amber-900 ring-amber-600/30",
  incomplete: "bg-slate-100 text-slate-700 ring-slate-500/30",
};

const FLAG_STYLE: Record<FlagKind, string> = {
  verified: "bg-red-50 text-red-800 ring-red-600/20",
  suspicious: "bg-amber-50 text-amber-900 ring-amber-600/30",
  inconclusive: "bg-sky-50 text-sky-800 ring-sky-600/20",
  info: "bg-slate-100 text-slate-700 ring-slate-500/30",
};

const FLAG_LABEL: Record<FlagKind, string> = {
  verified: "Verified finding",
  suspicious: "Suspicious signal",
  inconclusive: "Inconclusive",
  info: "Info",
};

const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({ status }: { status: ScreeningStatus }) {
  return <span className={`${base} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function FlagBadge({ kind }: { kind: FlagKind }) {
  return <span className={`${base} ${FLAG_STYLE[kind]}`}>{FLAG_LABEL[kind]}</span>;
}
