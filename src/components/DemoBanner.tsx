export function DemoBanner() {
  return (
    <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <strong>Demo data.</strong> Teams and submissions are fictional samples. Screening results labelled “Mock” are samples;
      results labelled “Live” were retrieved from GitHub when verification was run. Statuses are recommendations;
      organizers make every final decision.
    </p>
  );
}
