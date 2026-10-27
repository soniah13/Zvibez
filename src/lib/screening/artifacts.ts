import type { ArtifactReview, Submission } from "../types";
import { artifactLabel, isTimelineRelevant, platformOf, type Artifact } from "../taxonomy";
import { isSafeHttpUrl } from "../validation";
import type { FlagDraft } from "./rules";
import { sanitizeShort } from "./text";

/**
 * Evidence providers. Each knows how to review one kind of artifact. Phase 3 ships only the manual-review
 * provider; a platform adapter (for example one that reads a design file's version history through an
 * official API) is added by writing another provider and listing it before the fallback, with no change to
 * screening or the AI layer. A provider must only report a creation time as verified if it really checked it.
 */
export interface ArtifactProvider {
  id: string;
  handles(artifact: Artifact): boolean;
  review(artifact: Artifact): ArtifactReview | Promise<ArtifactReview>;
}

/** Fallback for every platform without an adapter. Fetches nothing and verifies nothing. */
export const manualReviewProvider: ArtifactProvider = {
  id: "manual",
  handles: () => true,
  review(a) {
    const relevant = isTimelineRelevant(a.type);
    return {
      url: a.url,
      type: a.type,
      platform: platformOf(a.url),
      description: a.description,
      timelineEvidence: a.timelineEvidence?.trim() || undefined,
      verification: relevant ? "manual_review" : "not_applicable",
      creationTimeVerified: false,
      note: relevant
        ? "No automatic check exists for this platform. The link was not opened and its creation time was not verified. An organizer must inspect it."
        : "Recorded as evidence that the item exists. The link was not opened or tested.",
    };
  },
};

/** Synchronous manual reviews, for seeded demo data and tests where nothing is fetched. */
export function manualReviews(submission: Pick<Submission, "artifacts">): ArtifactReview[] {
  return (submission.artifacts ?? []).filter((a) => isSafeHttpUrl(a.url)).map((a) => manualReviewProvider.review(a) as ArtifactReview);
}

export const DEFAULT_PROVIDERS: ArtifactProvider[] = [manualReviewProvider];

export async function reviewArtifacts(
  submission: Pick<Submission, "artifacts">,
  providers: ArtifactProvider[] = DEFAULT_PROVIDERS,
): Promise<ArtifactReview[]> {
  const reviews: ArtifactReview[] = [];
  for (const a of submission.artifacts ?? []) {
    if (!isSafeHttpUrl(a.url)) continue; // reported as missing information elsewhere
    const provider = providers.find((p) => p.handles(a)) ?? manualReviewProvider;
    try {
      reviews.push(await provider.review(a));
    } catch {
      // A broken adapter must not take screening down. Fall back to manual inspection.
      reviews.push(await manualReviewProvider.review(a));
    }
  }
  return reviews;
}

/**
 * One flag for everything that needs a human to check its creation time. Inconclusive, never misconduct:
 * a design file or notebook on another platform simply has no automatic timestamp check yet.
 */
export function artifactFlags(submission: Pick<Submission, "githubUrl">, reviews: ArtifactReview[]): FlagDraft[] {
  const manual = reviews.filter((r) => r.verification === "manual_review" && !r.creationTimeVerified);
  const flags: FlagDraft[] = [];

  if (manual.length > 0) {
    const lines = manual.map((r) => {
      const claim = r.timelineEvidence ? ` The team states: "${sanitizeShort(r.timelineEvidence, 300)}" (unverified).` : "";
      return `${artifactLabel(r.type)} on ${r.platform}: ${r.url}.${claim}`;
    });
    flags.push({
      code: "ARTIFACT_TIMELINE_MANUAL_REVIEW",
      kind: "inconclusive",
      title: `${manual.length} artifact${manual.length === 1 ? "" : "s"} need manual timeline inspection`,
      detail: `Charlie cannot verify when these were created. ${lines.join(" ")} Open each link and check its version history or last-modified date against the event window, and compare it with the team's disclosure of pre-existing work.`,
      evidenceUrl: manual[0].url,
    });
  }

  const hasRepo = !!submission.githubUrl?.trim();
  const hasWorkProduct = reviews.some((r) => r.verification === "manual_review");
  if (!hasRepo && !hasWorkProduct) {
    flags.push({
      code: "NO_TIMELINE_EVIDENCE",
      kind: "inconclusive",
      title: "No evidence that can show when the work was created",
      detail: "No repository and no work-product artifact (such as a design file, notebook or report) was submitted, so nothing here can show whether the work was done during the event window.",
    });
  }
  return flags;
}
