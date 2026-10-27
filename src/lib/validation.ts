import { z } from "zod";
import { TRACKS } from "./constants";

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

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an http(s) URL")
  .optional();

export const submissionSchema = z.object({
  teamName: text("Team name", 100),
  members: z
    .array(z.object({ name: z.string().trim().min(1, "Member name is required").max(100), email: z.string().trim().email("Invalid email").optional().or(z.literal("")) }))
    .min(1, "Add at least one team member")
    .max(10),
  track: z.enum(TRACKS),
  challenge: text("Challenge or problem statement", 1000),
  problemDescription: text("Problem description"),
  proposedSolution: text("Proposed solution"),
  githubUrl: z
    .string()
    .trim()
    .min(1, "GitHub repository URL is required")
    .refine((v) => parseGithubUrl(v) !== null, "Enter a URL like https://github.com/owner/repo"),
  demoUrl: optionalUrl,
  technologies: z.array(z.string().trim().min(1).max(50)).min(1, "List at least one technology").max(30),
  aiToolsUsed: text("AI tools used (write 'None' if none)", 2000),
  externalResources: text("External resources (write 'None' if none)", 2000),
  testingInstructions: text("Testing instructions", 3000),
  mediaUrl: optionalUrl,
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
