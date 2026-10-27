import Link from "next/link";
import { EVENT } from "@/lib/constants";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-10">
      <h1 className="text-2xl font-semibold">Charlie</h1>
      <p className="text-slate-700">
        Project screening assistant for {EVENT.name} (7 November 2026, 07:00–19:00 EAT). Charlie helps organizers verify
        submissions and prepare summaries for human judges. It never disqualifies a team on its own.
      </p>
      <div className="flex gap-3">
        <Link href="/submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">Submit a project</Link>
        <Link href="/dashboard" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100">Organizer dashboard</Link>
      </div>
    </div>
  );
}
