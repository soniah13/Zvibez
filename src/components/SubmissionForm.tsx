"use client";

import { useState } from "react";
import { TRACKS } from "@/lib/constants";
import { submissionSchema } from "@/lib/validation";

type Errors = Record<string, string>;

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

function Field({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function SubmissionForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const list = (k: string) => get(k).split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

    const result = submissionSchema.safeParse({
      teamName: get("teamName"),
      members: list("members").map((name) => ({ name })),
      track: get("track"),
      challenge: get("challenge"),
      problemDescription: get("problemDescription"),
      proposedSolution: get("proposedSolution"),
      githubUrl: get("githubUrl"),
      demoUrl: get("demoUrl"),
      technologies: list("technologies"),
      aiToolsUsed: get("aiToolsUsed"),
      externalResources: get("externalResources"),
      testingInstructions: get("testingInstructions"),
      mediaUrl: get("mediaUrl"),
    });

    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        next[key] ??= issue.message;
      }
      setErrors(next);
      setDone(false);
      return;
    }
    // Phase 4 will POST this to a server route that persists to Supabase.
    setErrors({});
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        Your submission passed validation. Persistent storage is not connected yet (Phase 4), so nothing was saved.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">Please fix the highlighted fields.</p>
      )}
      <Field label="Team name *" name="teamName" error={errors.teamName}>
        <input id="teamName" name="teamName" maxLength={100} className={input} />
      </Field>
      <Field label="Team members *" name="members" error={errors.members} hint="One name per line (or comma-separated).">
        <textarea id="members" name="members" rows={3} className={input} />
      </Field>
      <Field label="Track *" name="track" error={errors.track}>
        <select id="track" name="track" defaultValue="" className={input}>
          <option value="" disabled>Select a track</option>
          {TRACKS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Challenge / problem statement *" name="challenge" error={errors.challenge}>
        <input id="challenge" name="challenge" maxLength={1000} className={input} />
      </Field>
      <Field label="Problem description *" name="problemDescription" error={errors.problemDescription}>
        <textarea id="problemDescription" name="problemDescription" rows={4} className={input} />
      </Field>
      <Field label="Proposed solution *" name="proposedSolution" error={errors.proposedSolution}>
        <textarea id="proposedSolution" name="proposedSolution" rows={4} className={input} />
      </Field>
      <Field label="GitHub repository URL *" name="githubUrl" error={errors.githubUrl}>
        <input id="githubUrl" name="githubUrl" placeholder="https://github.com/owner/repo" className={input} />
      </Field>
      <Field label="Live demo / deployment URL" name="demoUrl" error={errors.demoUrl} hint="Leave empty if not applicable.">
        <input id="demoUrl" name="demoUrl" placeholder="https://" className={input} />
      </Field>
      <Field label="Technologies used *" name="technologies" error={errors.technologies} hint="Comma-separated.">
        <input id="technologies" name="technologies" className={input} />
      </Field>
      <Field label="AI tools used and how *" name="aiToolsUsed" error={errors.aiToolsUsed} hint="Write “None” if you used none.">
        <textarea id="aiToolsUsed" name="aiToolsUsed" rows={3} className={input} />
      </Field>
      <Field label="External libraries, templates, starter code, existing assets *" name="externalResources" error={errors.externalResources} hint="Write “None” if none.">
        <textarea id="externalResources" name="externalResources" rows={3} className={input} />
      </Field>
      <Field label="Instructions for testing the project *" name="testingInstructions" error={errors.testingInstructions}>
        <textarea id="testingInstructions" name="testingInstructions" rows={4} className={input} />
      </Field>
      <Field label="Demo video or screenshots URL" name="mediaUrl" error={errors.mediaUrl}>
        <input id="mediaUrl" name="mediaUrl" placeholder="https://" className={input} />
      </Field>
      <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">Submit project</button>
    </form>
  );
}
