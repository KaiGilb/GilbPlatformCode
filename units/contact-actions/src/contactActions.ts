/**
 * Up to N quick links for a person: call, SMS, email, then social pages.
 * Never invents a destination. SMS is offered only when a phone exists.
 */

export type ContactActionKind = "phone" | "sms" | "email" | "social";

export interface ContactAction {
  kind: ContactActionKind;
  /** Openable href: tel:, sms:, mailto:, or http(s). */
  href: string;
  /** The text the host passed, trimmed. Not the normalized href. */
  value: string;
  /** Fixed English word: Call, SMS, Email, or Social. */
  label: string;
}

export interface ContactActionSource {
  phones?: readonly string[];
  emails?: readonly string[];
  socials?: readonly string[];
}

/** Digits and symbols for tel: and sms:. Strips a leading `tel:` and all whitespace. */
export function phoneForUri(value: string): string {
  const trimmed = value.trim();
  const bare = trimmed.toLowerCase().startsWith("tel:") ? trimmed.slice("tel:".length) : trimmed;
  return bare.replace(/\s+/g, "");
}

/** A mailto href. A value that already starts with `mailto:` is left as trimmed. */
export function toMailtoHref(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("mailto:")) return trimmed;
  return `mailto:${trimmed}`;
}

/**
 * A social value that can be opened as http or https, or null.
 *
 * - A blank string is null.
 * - A value that starts with `@` is null. No site is guessed.
 * - `javascript:`, `data:`, and `vbscript:` are null, in any letter case.
 * - Any other scheme is parsed. Only `http:` and `https:` are kept.
 * - A value with no scheme is given `https://` and then parsed.
 * - The returned string is the URL parser's href, which may add a trailing
 *   slash on a host that had no path. It may also lowercase the host.
 */
export function resolvableSocialHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return null;
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    return null;
  } catch {
    return null;
  }
}

/**
 * Pick up to `max` actions. Default 3.
 *
 * Order is fixed: the first non-blank phone (Call), SMS for that same phone,
 * the first non-blank email, then social values that resolve, in the order
 * given. Later phones and later emails are ignored. A social that does not
 * resolve is skipped, not replaced with a made-up page.
 *
 * `max` below 1 yields an empty list. It is not "unlimited".
 * Labels are exactly `Call`, `SMS`, `Email`, and `Social`.
 */
export function pickContactActions(
  source: ContactActionSource,
  max = 3,
): ContactAction[] {
  const out: ContactAction[] = [];
  const phone = source.phones?.find((p) => p.trim())?.trim();
  if (phone && out.length < max) {
    out.push({ kind: "phone", href: `tel:${phoneForUri(phone)}`, value: phone, label: "Call" });
  }
  if (phone && out.length < max) {
    out.push({ kind: "sms", href: `sms:${phoneForUri(phone)}`, value: phone, label: "SMS" });
  }
  const email = source.emails?.find((e) => e.trim())?.trim();
  if (email && out.length < max) {
    out.push({ kind: "email", href: toMailtoHref(email), value: email, label: "Email" });
  }
  for (const social of source.socials ?? []) {
    if (out.length >= max) break;
    const href = resolvableSocialHref(social);
    if (!href) continue;
    out.push({ kind: "social", href, value: social, label: "Social" });
  }
  return out;
}
