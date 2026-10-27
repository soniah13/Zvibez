/**
 * Preparing untrusted repository text for the model. Nothing here makes text safe to obey. It only
 * keeps secrets and junk out of the request. Safety against instructions comes from how the text is
 * framed (JSON data, no tools, validated output), not from filtering.
 */

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

// key = value assignments: keep the key, drop the value.
const ASSIGNMENT = /\b((?:api[_-]?key|secret|token|passwd|password|private[_-]?key|access[_-]?key)\w*)(\s*[:=]\s*)(['"]?)[^\s'"]{8,}\3/gi;

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.replace(ASSIGNMENT, "$1$2[REDACTED]");
}

/** Removes control characters (keeps tab/newline), redacts secrets and bounds the length. */
export function sanitizeText(text: string, maxChars: number): string {
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return redactSecrets(clean).slice(0, maxChars);
}

/** File names that usually hold credentials. Their names are omitted from what the model sees. */
const SENSITIVE_PATH =
  /(^|\/)(\.env(\..*)?|[^/]*\.(pem|key|p12|pfx|keystore|jks)|id_(rsa|dsa|ecdsa|ed25519)[^/]*|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|\.npmrc|\.netrc|\.pypirc|[^/]*service[-_]?account[^/]*\.json)$/i;

const IGNORED_DIR = /(^|\/)(node_modules|vendor|dist|build|\.git|\.next|venv|\.venv|__pycache__)\//i;

export interface FileListing {
  /** Total paths in the repository tree that was retrieved (before filtering). */
  totalPaths: number;
  /** Paths shown to the model: shallow first, no vendored directories, no credential-looking names. */
  shown: string[];
  omittedSensitive: number;
  omittedVendored: number;
  omittedOverLimit: number;
  /** File counts by extension across all non-vendored, non-sensitive paths. */
  extensions: Record<string, number>;
  treeTruncated: boolean;
}

export function summarizeFileList(paths: string[], treeTruncated: boolean, maxShown = 300): FileListing {
  const sensitive = paths.filter((p) => SENSITIVE_PATH.test(p));
  const vendored = paths.filter((p) => !SENSITIVE_PATH.test(p) && IGNORED_DIR.test(p));
  const usable = paths.filter((p) => !SENSITIVE_PATH.test(p) && !IGNORED_DIR.test(p));

  const extensions: Record<string, number> = {};
  for (const p of usable) {
    const m = p.match(/\.([A-Za-z0-9]{1,8})$/);
    const ext = m ? `.${m[1].toLowerCase()}` : "(none)";
    extensions[ext] = (extensions[ext] ?? 0) + 1;
  }

  const depth = (p: string) => p.split("/").length;
  const sorted = [...usable].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return {
    totalPaths: paths.length,
    shown: sorted.slice(0, maxShown).map((p) => sanitizeText(p, 200)),
    omittedSensitive: sensitive.length,
    omittedVendored: vendored.length,
    omittedOverLimit: Math.max(sorted.length - maxShown, 0),
    extensions,
    treeTruncated,
  };
}
