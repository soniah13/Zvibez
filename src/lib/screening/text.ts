/** Collapses whitespace, strips control characters and bounds length. For team-written text shown inside flags. */
export function sanitizeShort(text: string, max: number): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
