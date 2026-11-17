// The secret redactor. Every reason, log line and error text that leaves this unit passes through it, so a key never
// reaches a log, a record or an answer.

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
  // Header and assignment shapes, whatever the value looks like.
  out = out.replace(/\b(Authorization)\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?[^\s,;"']+/gi, "$1: [redacted]");
  out = out.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]");
  out = out.replace(/\b(x-api-key|api[_-]?key|apikey|access[_-]?token|secret|token|key)\s*[:=]\s*[^\s,;"']+/gi, "$1=[redacted]");
  out = out.replace(/\b(?:sk|ws|key|api[_-]?key)[_-][A-Za-z0-9_-]{12,}/gi, "[redacted]");
  return out;
}
