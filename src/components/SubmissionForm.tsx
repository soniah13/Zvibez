"use client";

import { useMemo, useState } from "react";
import { TRACKS, type Track } from "@/lib/constants";
import { DEFAULT_POLICY } from "@/lib/screening/policy";
import { describeExpectations } from "@/lib/screening/requirements";
import {
  ARTIFACT_TYPES,
  DISCIPLINES,
  PROJECT_FORMATS,
  TECH_SUGGESTIONS,
  normalizeTechnologies,
  type ArtifactType,
  type Discipline,
  type ProjectFormat,
} from "@/lib/taxonomy";
import { submissionSchema } from "@/lib/validation";

type Errors = Record<string, string>;
interface ArtifactRow {
  type: ArtifactType;
  url: string;
  description: string;
  timelineEvidence: string;
}

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
const MAX_ARTIFACTS = 15;

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

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function SubmissionForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  const [track, setTrack] = useState<Track | "">("");
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [formats, setFormats] = useState<ProjectFormat[]>([]);
  const [techs, setTechs] = useState<string[]>([]);
  const [techDraft, setTechDraft] = useState("");
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);

  // What the organizers' policy expects for the chosen format(s), so teams know before they submit.
  const expectations = useMemo(
    () => (formats.length > 0 && track ? describeExpectations({ projectFormats: formats, track }, DEFAULT_POLICY) : []),
    [formats, track],
  );

  function addTech(raw: string) {
    const parts = raw.split(/[\n,]/);
    setTechs((cur) => normalizeTechnologies([...cur, ...parts]));
    setTechDraft("");
  }
  const updateArtifact = (i: number, patch: Partial<ArtifactRow>) => setArtifacts((cur) => cur.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const list = (k: string) => get(k).split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

    const result = submissionSchema.safeParse({
      teamName: get("teamName"),
      members: list("members").map((name) => ({ name })),
      track: track,
      disciplines,
      otherDiscipline: get("otherDiscipline"),
      projectFormats: formats,
      challenge: get("challenge"),
      problemDescription: get("problemDescription"),
      proposedSolution: get("proposedSolution"),
      githubUrl: get("githubUrl"),
      artifacts: artifacts.map((a) => ({ ...a })),
      demoUrl: get("demoUrl"),
      // Anything typed but not yet added still counts.
      technologies: [...techs, ...techDraft.split(/[\n,]/)],
      aiToolsUsed: get("aiToolsUsed"),
      externalResources: get("externalResources"),
      testingInstructions: get("testingInstructions"),
      mediaUrl: get("mediaUrl"),
    });

    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) {
        // Artifact rows report as artifacts.<n>.<field>; show them against the artifacts block.
        const key = issue.path[0] === "artifacts" && issue.path.length > 1 ? `artifacts.${String(issue.path[1])}` : String(issue.path[0]);
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

  const suggestions = TECH_SUGGESTIONS.filter((t) => !techs.some((x) => x.toLowerCase() === t.toLowerCase())).slice(0, 18);

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
      <Field label="Competition track *" name="track" error={errors.track} hint="The official Zinduathon track you are entering. This is separate from what you are building, which you describe next.">
        <select id="track" name="track" value={track} onChange={(e) => setTrack(e.target.value as Track)} className={input}>
          <option value="" disabled>Select a track</option>
          {TRACKS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What kind of work is this? *</legend>
        <p className="text-xs text-slate-500">Pick every discipline your project involves. These describe what you built; they do not limit which technologies you may use.</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {DISCIPLINES.map((d) => (
            <Check key={d.id} checked={disciplines.includes(d.id)} onChange={() => setDisciplines((c) => toggle(c, d.id))}>{d.label}</Check>
          ))}
        </div>
        {disciplines.includes("other") && (
          <Field label="Describe the other discipline *" name="otherDiscipline" error={errors.otherDiscipline}>
            <input id="otherDiscipline" name="otherDiscipline" maxLength={200} className={input} />
          </Field>
        )}
        {errors.disciplines && <p role="alert" className="text-xs text-red-700">{errors.disciplines}</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Project format *</legend>
        <p className="text-xs text-slate-500">What are you handing in? Choose all that apply. This decides which supporting evidence Charlie looks for.</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {PROJECT_FORMATS.map((f) => (
            <Check key={f.id} checked={formats.includes(f.id)} onChange={() => setFormats((c) => toggle(c, f.id))}>{f.label}</Check>
          ))}
        </div>
        {errors.projectFormats && <p role="alert" className="text-xs text-red-700">{errors.projectFormats}</p>}
      </fieldset>

      {expectations.length > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
          <p className="font-medium">Evidence organizers expect for your format</p>
          <ul className="mt-1 list-disc pl-5">
            {expectations.map((e) => (
              <li key={e.key}>
                <strong>{e.label}</strong> ({e.level}): {e.expectation}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">These are typical, not a checklist every project must pass. If something does not apply to your project, explain why in the testing instructions.</p>
        </div>
      )}

      <Field label="Challenge / problem statement *" name="challenge" error={errors.challenge}>
        <input id="challenge" name="challenge" maxLength={1000} className={input} />
      </Field>
      <Field label="Problem description *" name="problemDescription" error={errors.problemDescription}>
        <textarea id="problemDescription" name="problemDescription" rows={4} className={input} />
      </Field>
      <Field label="Proposed solution *" name="proposedSolution" error={errors.proposedSolution}>
        <textarea id="proposedSolution" name="proposedSolution" rows={4} className={input} />
      </Field>
      <Field label="GitHub repository URL" name="githubUrl" error={errors.githubUrl} hint="Required for code-based formats; leave empty if your work lives elsewhere (add it as an artifact below).">
        <input id="githubUrl" name="githubUrl" placeholder="https://github.com/owner/repo" className={input} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Artifacts and project evidence</legend>
        <p className="text-xs text-slate-500">
          Links to anything that shows your work: deployed app, API docs or a test collection, a design or prototype, a dashboard, a
          notebook, a model card, an evaluation report, a script, a demo video. Make sure the links are viewable by reviewers. Charlie
          does not open them; organizers do.
        </p>
        {artifacts.map((a, i) => (
          <div key={i} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
              <select aria-label={`Artifact ${i + 1} type`} value={a.type} onChange={(e) => updateArtifact(i, { type: e.target.value as ArtifactType })} className={input}>
                {ARTIFACT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input aria-label={`Artifact ${i + 1} URL`} value={a.url} onChange={(e) => updateArtifact(i, { url: e.target.value })} placeholder="https://" className={input} />
            </div>
            <input aria-label={`Artifact ${i + 1} description`} value={a.description} onChange={(e) => updateArtifact(i, { description: e.target.value })} placeholder="What is this? (one sentence)" maxLength={300} className={input} />
            <input aria-label={`Artifact ${i + 1} timeline note`} value={a.timelineEvidence} onChange={(e) => updateArtifact(i, { timelineEvidence: e.target.value })} placeholder="Optional: when and how was it made? e.g. where to find version history" maxLength={1000} className={input} />
            <button type="button" onClick={() => setArtifacts((c) => c.filter((_, j) => j !== i))} className="text-xs text-red-700 underline">Remove artifact {i + 1}</button>
            {errors[`artifacts.${i}`] && <p role="alert" className="text-xs text-red-700">{errors[`artifacts.${i}`]}</p>}
          </div>
        ))}
        {artifacts.length < MAX_ARTIFACTS && (
          <button
            type="button"
            onClick={() => setArtifacts((c) => [...c, { type: "deployed_app", url: "", description: "", timelineEvidence: "" }])}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Add an artifact
          </button>
        )}
        {errors.artifacts && <p role="alert" className="text-xs text-red-700">{errors.artifacts}</p>}
      </fieldset>

      <Field label="Live demo / deployment URL" name="demoUrl" error={errors.demoUrl} hint="Required for the Software Engineering track. A deployed-app, prototype, API collection, dashboard or demo-video artifact above also counts.">
        <input id="demoUrl" name="demoUrl" placeholder="https://" className={input} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Technologies, tools and platforms *</legend>
        <p className="text-xs text-slate-500">Add anything you used: languages, frameworks, libraries, databases, platforms, APIs, design or analytics tools, ML tooling. The suggestions are examples, not an approved list.</p>
        {techs.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected technologies">
            {techs.map((t) => (
              <li key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs">
                {t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => setTechs((c) => c.filter((x) => x !== t))} className="text-slate-500 hover:text-red-700">×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            id="technologies"
            value={techDraft}
            onChange={(e) => setTechDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTech(techDraft);
              }
            }}
            placeholder="Type a technology and press Enter"
            className={input}
          />
          <button type="button" onClick={() => addTech(techDraft)} className="rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {suggestions.map((t) => (
            <button key={t} type="button" onClick={() => addTech(t)} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">+ {t}</button>
          ))}
        </div>
        {errors.technologies && <p role="alert" className="text-xs text-red-700">{errors.technologies}</p>}
      </fieldset>

      <Field label="AI tools used and how *" name="aiToolsUsed" error={errors.aiToolsUsed} hint="Write “None” if you used none.">
        <textarea id="aiToolsUsed" name="aiToolsUsed" rows={3} className={input} />
      </Field>
      <Field label="External libraries, templates, starter code, existing assets *" name="externalResources" error={errors.externalResources} hint="Include datasets, pre-trained models, design kits and templates. Write “None” if none.">
        <textarea id="externalResources" name="externalResources" rows={3} className={input} />
      </Field>
      <Field label="Instructions for testing, reproducing or reviewing the project *" name="testingInstructions" error={errors.testingInstructions} hint="How can a judge run it, open it or reproduce the results?">
        <textarea id="testingInstructions" name="testingInstructions" rows={4} className={input} />
      </Field>
      <Field label="Demo video or screenshots URL" name="mediaUrl" error={errors.mediaUrl}>
        <input id="mediaUrl" name="mediaUrl" placeholder="https://" className={input} />
      </Field>
      <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">Submit project</button>
    </form>
  );
}
