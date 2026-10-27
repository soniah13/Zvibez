import { z } from "zod";
import { TRACKS } from "./constants";
import { ARTIFACT_TYPE_IDS, DISCIPLINE_IDS, PROJECT_FORMAT_IDS, normalizeTechnologies } from "./taxonomy";

/** Returns {owner, repo} for a github.com repo URL, or null. Rejects other hosts and non-repo paths. */
export function parseGithubUrl(input: string): { owner: string; repo: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname)) return null;
  const [owner, rawRepo, ...rest] = url.pathname.split("/").filter(Boolean);
  if (!owner || !rawRepo || rest.length > 0) return null;
  const repo = rawRepo.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  return { owner, repo };
}

const text = (label: string, max = 4000) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** http(s) only, and no embedded credentials (a link with user:password@ would leak a secret into reports). */
export function isSafeHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
  } catch {
    return false;
  }
}

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || isSafeHttpUrl(v), "Must be an http(s) URL without a username or password")
  .optional();

export const artifactSchema = z.object({
  type: z.enum(ARTIFACT_TYPE_IDS),
  url: z.string().trim().min(1, "Artifact URL is required").max(500).refine(isSafeHttpUrl, "Must be an http(s) URL without a username or password"),
  description: text("Artifact description", 300),
  timelineEvidence: z.string().trim().max(1000).optional().or(z.literal("")),
});

const baseSchema = z.object({
  teamName: text("Team name", 100),
  members: z
    .array(z.object({ name: z.string().trim().min(1, "Member name is required").max(100), email: z.string().trim().email("Invalid email").optional().or(z.literal("")) }))
    .min(1, "Add at least one team member")
    .max(10),
  track: z.enum(TRACKS),
  disciplines: z.array(z.enum(DISCIPLINE_IDS)).min(1, "Select at least one discipline").max(DISCIPLINE_IDS.length),
  otherDiscipline: z.string().trim().max(200).optional().or(z.literal("")),
  projectFormats: z.array(z.enum(PROJECT_FORMAT_IDS)).min(1, "Select at least one project format").max(PROJECT_FORMAT_IDS.length),
  challenge: text("Challenge or problem statement", 1000),
  problemDescription: text("Problem description"),
  proposedSolution: text("Proposed solution"),
  // Optional: whether a repository is expected depends on the project format (see screening policy).
  githubUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || parseGithubUrl(v) !== null, "Enter a URL like https://github.com/owner/repo")
    .optional(),
  artifacts: z.array(artifactSchema).max(15, "At most 15 artifacts").default([]),
  demoUrl: optionalUrl,
  // Any technology is accepted. Entries are normalised and de-duplicated, never checked against a list.
  technologies: z
    .array(z.string().max(50, "Each technology must be 50 characters or fewer"))
    .transform(normalizeTechnologies)
    .pipe(z.array(z.string().min(1)).min(1, "List at least one technology or tool").max(30)),
  aiToolsUsed: text("AI tools used (write 'None' if none)", 2000),
  externalResources: text("External resources (write 'None' if none)", 2000),
  testingInstructions: text("Testing instructions", 3000),
  mediaUrl: optionalUrl,
});

/** Cross-field rule: choosing "Other" as a discipline needs a description. */
export const submissionSchema = baseSchema.superRefine((v, ctx) => {
  if (v.disciplines.includes("other") && !v.otherDiscipline?.trim()) {
    ctx.addIssue({ code: "custom", path: ["otherDiscipline"], message: "Describe the other discipline" });
  }
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
