import { SubmissionForm } from "@/components/SubmissionForm";

export const metadata = { title: "Submit a project · Charlie" };

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Submit your project</h1>
      <p className="text-sm text-slate-600">Fields marked * are required.</p>
      <SubmissionForm />
    </div>
  );
}
