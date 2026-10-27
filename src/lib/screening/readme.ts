/**
 * Heuristic: does README text appear to contain run/setup/test guidance?
 * The text is untrusted. It is only matched against a fixed keyword list and is never followed or executed.
 */
const SETUP_HINTS = [
  /^#{1,6}\s*.*\b(install|installation|setup|set up|getting started|quick ?start|usage|run|running|build|test|testing|how to)\b/im,
  /\b(npm|yarn|pnpm)\s+(install|run|start|test)\b/i,
  /\bpip\s+install\b/i,
  /\bpython3?\s+\S+\.py\b/i,
  /\bdocker(-compose)?\s+(compose\s+)?(up|run|build)\b/i,
  /\bjupyter\b/i,
];

export function detectSetupHints(readmeText: string): boolean {
  return SETUP_HINTS.some((re) => re.test(readmeText.slice(0, 200_000)));
}
