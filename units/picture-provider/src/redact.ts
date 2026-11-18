// The secret redactor. Every reason, log line and error text that leaves this unit passes through it, so a key never
// reaches a log, a record or an answer: the whole key, any run of 8 or more of its characters, and its base64, base64url
// and URL-encoded forms.

/** The shortest string treated as a secret. A shorter one would blank ordinary words. */
export const MIN_SECRET_LENGTH = 12;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Removes the known secrets, any Bearer/Basic/Token value and any key-shaped string from text.
 *
 * Limit: an unknown secret written in free prose is not found. Pass every secret you hold in `secrets`.
 *
 * @param text the text to clean
 * @param secrets the exact secrets the caller holds (each at least {@link MIN_SECRET_LENGTH} characters)
 * @returns the text with each secret replaced by "[redacted]"
 */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = String(text);
  for (const sec of secrets) {
    if (typeof sec !== "string" || sec.length < MIN_SECRET_LENGTH) continue;
    out = out.replace(new RegExp(escape(sec), "gi"), "[redacted]");
  }
  out = redactFragments(out, secrets);
  // Header and assignment shapes, whatever the value looks like.
  out = out.replace(/\b(Authorization)\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?[^\s,;"']+/gi, "$1: [redacted]");
  out = out.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]");
  out = out.replace(/\b(x-api-key|api[_-]?key|apikey|access[_-]?token|secret|token|key)\s*[:=]\s*[^\s,;"']+/gi, "$1=[redacted]");
  out = out.replace(/\b(?:sk|ws|key|api[_-]?key)[_-][A-Za-z0-9_-]{12,}/gi, "[redacted]");
  return out;
}

/** The shortest run of a secret's characters that is redacted where it appears (Agent.Hacker L2). */
export const MIN_FRAGMENT = 8;

/** A secret as it may be echoed: itself, base64, base64url and URL-encoded. */
function encodings(sec: string): string[] {
  const out = [sec, encodeURIComponent(sec)];
  try {
    const b64 = btoa(sec);
    out.push(b64, b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  } catch { /* not latin-1: the plain forms only */ }
  return out;
}

/**
 * Removes every run of MIN_FRAGMENT or more characters that also appears in a secret (or in its base64, base64url or
 * URL-encoded form), compared case-insensitively (Agent.Hacker L2: a provider echoing part of the key). Each maximal
 * covered span becomes "[redacted]".
 */
function redactFragments(text: string, secrets: readonly string[]): string {
  const grams = new Set<string>();
  for (const sec of secrets) {
    if (typeof sec !== "string" || sec.length < MIN_SECRET_LENGTH) continue;
    for (const form of encodings(sec)) {
      const low = form.toLowerCase();
      for (let i = 0; i + MIN_FRAGMENT <= low.length; i++) grams.add(low.slice(i, i + MIN_FRAGMENT));
    }
  }
  if (grams.size === 0 || text.length < MIN_FRAGMENT) return text;
  const low = text.toLowerCase();
  const covered = new Uint8Array(text.length);
  let any = false;
  for (let i = 0; i + MIN_FRAGMENT <= low.length; i++) {
    if (grams.has(low.slice(i, i + MIN_FRAGMENT))) { covered.fill(1, i, i + MIN_FRAGMENT); any = true; }
  }
  if (!any) return text;
  let out = "";
  for (let i = 0; i < text.length;) {
    if (!covered[i]) { out += text[i]; i++; continue; }
    while (i < text.length && covered[i]) i++;
    out += "[redacted]";
  }
  return out;
}
