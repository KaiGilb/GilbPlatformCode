// The prose level of the secret check (1.1.0). New code, not moved: the strict level (secretCheck.ts) was built for
// short typed answers and reads a possessive of 8 letters, a commit id or a record id as a key. A hand-off note is
// prose: this level refuses the SHAPES of known secrets and long random runs, and lets ordinary text through.
//
// It names the kind of secret it saw and never returns the text. The strict level is unchanged.

import { normalise } from "./secretCheck.js";

/** The kinds the prose level names. */
export type SecretKind =
  | "key-prefix"
  | "private-key-block"
  | "jwt"
  | "bearer-token"
  | "assignment"
  | "url-credentials"
  | "url-query-secret"
  | "one-time-code"
  | "random-run";

const KEY_PREFIX = new RegExp(
  [
    "\\bsk-[A-Za-z0-9][A-Za-z0-9_-]{15,}",
    "\\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[A-Z0-9]{16}\\b",
    "\\bgh[pousr]_[A-Za-z0-9]{20,}",
    "\\bgithub_pat_[A-Za-z0-9_]{20,}",
    "\\bglpat-[A-Za-z0-9_-]{16,}",
    "\\bxox[abprs]-[A-Za-z0-9-]{10,}",
    "\\bAIza[0-9A-Za-z_-]{30,}",
    "\\bnpm_[A-Za-z0-9]{30,}",
    "\\bSG\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}",
    "\\b(?:rk|sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}",
    "\\bshp(?:at|ss|ca|pa)_[A-Za-z0-9]{24,}",
  ].join("|"),
);

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|PRIVATE KEY BLOCK)-----/;

/** Three base64url parts, the first two starting `eyJ` (a JSON header and payload). A DPoP proof is this shape too. */
const JWT = /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/;

const BEARER = /\bbearer\s+(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{12,}/i;

/** `word = value` or `word: value`. The key word is a credential word; the value is judged by its shape. */
const ASSIGNMENT =
  /\b(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth(?:orization)?)\b\s*([:=])\s*("[^"\n]{3,}"|'[^'\n]{3,}'|[^\s,;]+)/gi;

const SCHEME_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i;

const QUERY_SECRET = /[?&](?:access_token|refresh_token|id_token|token|api[_-]?key|apikey|secret|client_secret|password|passwd|sig|signature|key)=[A-Za-z0-9._~%+/-]{8,}/i;

const ONE_TIME_CODE =
  /\b(?:one[- ]?time|otp|passcode|sign[- ]?in code|login code|verification code|security code|code)\b[^\n]{0,40}?\b((?:[A-Z0-9]{4}-){1,3}[A-Z0-9]{4}|\d{6,8}|[a-f0-9]{12,})\b/gi;

/** A code is digits, or groups of capitals and digits with a digit in them, or twelve or more hex characters with a digit. A hyphenated name is not one. */
function codeLooksLikeOneTimeCode(code: string): boolean {
  if (/^\d{6,8}$/.test(code)) return true;
  if (!/\d/.test(code)) return false;
  if (/^[a-f0-9]{12,}$/.test(code)) return true;
  return code === code.toUpperCase();
}

const RUN_CHARSET = /^[A-Za-z0-9+/_=.-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ONLY = /^[0-9a-f]+$/i;

function assignmentIsSecret(separator: string, value: string): boolean {
  const bare = value.replace(/^["']|["']$/g, "");
  if (separator === "=") return bare.length >= 3;
  // After a colon the value must look like a credential: quoted, or six or more characters with a digit or a symbol.
  if (value !== bare) return true;
  return bare.length >= 6 && /[\d!@#$%^&*()_+=<>?~`|\\{}[\]-]/.test(bare);
}

/** A segment of a name: all letters, all digits, or one capitalised word, of a normal length. */
function plainSegment(seg: string): boolean {
  return seg.length <= 16 && (/^[A-Za-z]+$/.test(seg) || /^\d+$/.test(seg));
}

/** A file name, a release name or a title written with hyphens, dots or underscores: most of its segments are plain words or numbers. */
function looksLikeName(token: string): boolean {
  const segments = token.split(/[-_.]/).filter((s) => s !== "");
  if (segments.length < 3) return false;
  return segments.filter(plainSegment).length / segments.length >= 0.5;
}

function runIsRandom(raw: string): boolean {
  // `NAME=value`: the value is the run.
  const unprefixed = raw.replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "");
  const token = unprefixed.replace(/^[("'[{<]+/, "").replace(/[)"'\]}>.,;:!?]+$/, "");
  if (token.length < 32 || !RUN_CHARSET.test(token) || UUID.test(token) || looksLikeName(token)) return false;
  const lower = /[a-z]/.test(token);
  const upper = /[A-Z]/.test(token);
  const digit = /\d/.test(token);
  const classes = (lower ? 1 : 0) + (upper ? 1 : 0) + (digit ? 1 : 0);
  if (classes >= 3) return true;
  // Two classes (lower and digits) of 40 or more that are not a hash: a key, not a name.
  return token.length >= 40 && lower && digit && !HEX_ONLY.test(token);
}

/**
 * The kind of secret the prose level finds in `text`, or null. Never the text itself.
 *
 * @param text any prose
 * @returns a kind, or null when nothing in it has the shape of a secret
 */
export function secretKindOfProse(text: string): SecretKind | null {
  const clean = normalise(text);
  if (PRIVATE_KEY_BLOCK.test(clean)) return "private-key-block";
  if (JWT.test(clean)) return "jwt";
  if (KEY_PREFIX.test(clean)) return "key-prefix";
  if (SCHEME_CREDENTIALS.test(clean)) return "url-credentials";
  if (QUERY_SECRET.test(clean)) return "url-query-secret";
  if (BEARER.test(clean)) return "bearer-token";
  ASSIGNMENT.lastIndex = 0;
  for (let m = ASSIGNMENT.exec(clean); m; m = ASSIGNMENT.exec(clean)) {
    if (assignmentIsSecret(m[1]!, m[2]!)) return "assignment";
  }
  ONE_TIME_CODE.lastIndex = 0;
  for (let m = ONE_TIME_CODE.exec(clean); m; m = ONE_TIME_CODE.exec(clean)) {
    if (codeLooksLikeOneTimeCode(m[1]!)) return "one-time-code";
  }
  for (const word of clean.split(/\s+/)) if (runIsRandom(word)) return "random-run";
  return null;
}

/**
 * True when the prose level finds a secret in `text`. The strict level is {@link textHasSecret}; the two answer differently on purpose.
 *
 * @param text any prose
 */
export function textHasSecretProse(text: string): boolean {
  return secretKindOfProse(text) !== null;
}
