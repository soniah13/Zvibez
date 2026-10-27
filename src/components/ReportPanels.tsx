"use client";

import { useState } from "react";
import type { ScreeningResult } from "@/lib/types";
import { ScreeningPanel } from "./ScreeningPanel";
import { SummaryPanel } from "./SummaryPanel";

/** Owns the screening result so the verification and the AI summary always describe the same evidence. */
export function ReportPanels({ submissionId, initial, children }: { submissionId: string; initial: ScreeningResult; children?: React.ReactNode }) {
  const [screening, setScreening] = useState(initial);
  return (
    <div className="space-y-6">
      <ScreeningPanel submissionId={submissionId} result={screening} onResult={setScreening} />
      {children}
      <SummaryPanel submissionId={submissionId} onScreening={setScreening} />
    </div>
  );
}
