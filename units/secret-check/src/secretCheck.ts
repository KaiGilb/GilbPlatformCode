// Moved as it is from GilbApp src/lib/base/projectDecisions.ts at commit 602ebf2eeb4f0d1a377911b1425c8283d9596e94.
// Only the three names marked `export` are new surface; no pattern, number or branch was changed.

const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]*-----[\s\S]*?-----END [A-Z0-9 ]*-----/gi;

/** A credential word, including one sitting inside a longer key name (`SECRET_KEY`, `authentication`). */
const CREDENTIAL =
  /pass(?:phrase|word|wd)?|pwd|private[ _-]?key|api[ _-]?key|access[ _-]?key|client[ _-]?secret|credential\w*|secret|token|bearer|auth\w*/gi;

const TOKEN_RUN = /[A-Za-z0-9+/_=.-]{15,}/g;

const URL_RUN = /https?:\/\/[^\s]+/g;

/** `|`, `|-`, `|2`, `>`, optionally with a trailing `#` comment. */
const YAML_INDICATOR = /^[|>](?:[+-][0-9]?|[0-9][+-]?)?(?:\s+#.*)?$/;

const PEM_OPEN = /^-----BEGIN [A-Z0-9 ]*-----[\s\S]*?-----END [A-Z0-9 ]*-----/i;

/** Drop every Unicode format character, including ZWJ (U+200D). Emoji sequences that need a joiner lose it. */
function stripFormatChars(text: string): string {
  return text.replace(/\p{Cf}/gu, "");
}

/** Format characters go, and every horizontal space (nbsp included) becomes a plain space. Line breaks stay. */
export function normalise(text: string): string {
  return stripFormatChars(text).replace(/[^\S\n\r]/gu, " ");
}

function maskSpans(text: string, spans: Array<[number, number]>): string {
  if (spans.length === 0) return text;
  const ordered = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const span of ordered) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  let out = "";
  let cursor = 0;
  for (const [from, to] of merged) {
    if (to <= cursor) continue;
    const start = Math.max(from, cursor);
    out += text.slice(cursor, start) + "[masked]";
    cursor = to;
  }
  return out + text.slice(cursor);
}

function rangesOf(text: string, re: RegExp): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  re.lastIndex = 0;
  for (let match = re.exec(text); match; match = re.exec(text)) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

function lineEnd(text: string, from: number): number {
  const nl = text.indexOf("\n", from);
  return nl === -1 ? text.length : nl;
}

function isIdentChar(ch: string): boolean {
  return ch !== "" && /[A-Za-z0-9_.-]/.test(ch);
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function lineIndent(line: string): number {
  let i = 0;
  while (i < line.length && isSpace(line.charAt(i))) i += 1;
  return i;
}

function lineStartAt(text: string, index: number): number {
  const nl = text.lastIndexOf("\n", index - 1);
  return nl === -1 ? 0 : nl + 1;
}

/** A trailing `\` that is not itself escaped continues the shell value onto the next line. */
function shellContinues(line: string): boolean {
  let n = 0;
  const trimmed = line.trimEnd();
  for (let i = trimmed.length - 1; i >= 0 && trimmed.charAt(i) === "\\"; i -= 1) n += 1;
  return n % 2 === 1;
}

function isYamlIndicator(line: string): boolean {
  return YAML_INDICATOR.test(line.trim());
}

/** Words of a value that is only letters, or null when it is quoted or not prose. */
function proseWords(value: string): string[] | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.startsWith('"') || trimmed.startsWith("'")) return null;
  const body = trimmed.replace(/[.!?;:,]+$/g, "");
  if (body === "") return null;
  const words = body.split(/\s+/);
  if (!words.every((word) => /^[A-Za-z]+$/.test(word))) return null;
  return words;
}

function isPassWord(word: string): boolean {
  return /^(?:pass(?:phrase|word|wd)?|pwd)$/i.test(word);
}

/** A key whose own word is a credential, not a longer English word that merely starts with one (`secretary`, `author`). */
const CREDENTIAL_PART =
  /^(?:pass(?:phrase|word|wd)?|pwd|private|api|access|client|credential|secret|token|bearer)$/i;

function isCredentialKey(key: string): boolean {
  return key.split(/[_\-.\s]+/).some((part) => CREDENTIAL_PART.test(part));
}

/**
 * Passwords mask the rest of the line (a passphrase may contain spaces).
 * A colon in front of three or more letter-words is a sentence only when words already
 * sit before the key (`Remember the password: it is the usual one.`). A bare
 * `password: letmein and …` is still a password.
 * Other credential keys mask a token, a quoted value, or one word. A sentence stays.
 */
function shouldMaskAssignment(word: string, separator: string, value: string, key: string, proseBefore: boolean): boolean {
  const words = proseWords(value);
  if (isPassWord(word) || isPassWord(key)) {
    if (separator === ":" && words !== null && words.length >= 3 && proseBefore) return false;
    return true;
  }
  if (words !== null && !(words.length === 1 && (words[0]!.length >= 15 || isCredentialKey(key)))) return false;
  return true;
}

/** Following lines that are indented further than the key, plus blank lines inside that block. */
function yamlBlockEnd(text: string, keyLineStart: number, indicatorEnd: number): number {
  const parent = lineIndent(text.slice(keyLineStart, lineEnd(text, keyLineStart)).replace(/\r$/, ""));
  let cursor = indicatorEnd < text.length ? indicatorEnd + 1 : text.length;
  let end = indicatorEnd;
  while (cursor < text.length) {
    const stop = lineEnd(text, cursor);
    const line = text.slice(cursor, stop).replace(/\r$/, "");
    if (line.trim() === "" || lineIndent(line) > parent) {
      end = stop;
      cursor = stop < text.length ? stop + 1 : text.length;
      continue;
    }
    break;
  }
  return end;
}

/** Where the value that starts at `valueAt` ends. A PEM value, a YAML block, and a shell continuation are included whole. */
function valueEnd(text: string, valueAt: number): number {
  const pem = PEM_OPEN.exec(text.slice(valueAt));
  if (pem && pem.index === 0) return valueAt + pem[0].length;

  const firstBreak = lineEnd(text, valueAt);
  const firstRaw = text.slice(valueAt, firstBreak).replace(/\r$/, "");
  if (isYamlIndicator(firstRaw)) {
    return yamlBlockEnd(text, lineStartAt(text, valueAt), firstBreak);
  }
  if (shellContinues(firstRaw)) {
    let end = firstBreak;
    let raw = firstRaw;
    while (shellContinues(raw) && end < text.length) {
      const next = end + 1;
      end = lineEnd(text, next);
      raw = text.slice(next, end).replace(/\r$/, "");
    }
    return end;
  }
  if (firstRaw.trim() !== "") return firstBreak;
  const next = firstBreak < text.length ? firstBreak + 1 : text.length;
  if (next >= text.length) return firstBreak;
  return lineEnd(text, next);
}

function assignmentSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  CREDENTIAL.lastIndex = 0;
  for (let match = CREDENTIAL.exec(text); match; match = CREDENTIAL.exec(text)) {
    const wordAt = match.index;
    const word = match[0];
    let identStart = wordAt;
    while (identStart > 0 && isIdentChar(text.charAt(identStart - 1))) identStart -= 1;
    let start = identStart;
    if (start > 0 && (text.charAt(start - 1) === '"' || text.charAt(start - 1) === "'")) start -= 1;
    let keyEnd = wordAt + word.length;
    while (keyEnd < text.length && isIdentChar(text.charAt(keyEnd))) keyEnd += 1;
    const key = text.slice(identStart, keyEnd);
    const proseBefore = /[A-Za-z]/.test(text.slice(lineStartAt(text, identStart), identStart));
    let j = keyEnd;
    if (j < text.length && (text.charAt(j) === '"' || text.charAt(j) === "'")) j += 1;
    while (j < text.length && isSpace(text.charAt(j))) j += 1;
    const sep = text.charAt(j);
    let resume = Math.max(CREDENTIAL.lastIndex, keyEnd);
    if (sep === ":" || sep === "=") {
      j += 1;
      while (j < text.length && isSpace(text.charAt(j))) j += 1;
      const end = valueEnd(text, j);
      if (shouldMaskAssignment(word, sep, text.slice(j, end), key, proseBefore)) {
        spans.push([start, end]);
        resume = Math.max(resume, end);
      }
    }
    if (CREDENTIAL.lastIndex < resume) CREDENTIAL.lastIndex = resume;
  }
  return spans;
}

/** A lowercase word, or a hyphenated phrase whose pieces are all shorter than a token. */
function isPlainWordOrPath(run: string): boolean {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(run)) return false;
  const parts = run.split("-");
  if (parts.length === 1) return true;
  return parts.every((part) => part.length < 20);
}

/**
 * A release, a version, a dotted name, or one word of letters.
 * Between separators, letter pieces stop at 12 (`christopher` is 11, `eyJabcdefghij` is 13)
 * and digit runs stop at 4 (a year stays, `xoxb-1234567890` does not).
 */
function isName(run: string): boolean {
  const bare = run.replace(/\.+$/g, "");
  if (bare === "") return false;
  if (/^[A-Za-z]+$/.test(bare)) return true;
  const parts = bare.split(/[-._/]/);
  if (parts.length < 2 || parts.some((part) => part.length === 0)) return false;
  return parts.every(
    (part) => /^[A-Za-z]{1,12}$/.test(part) || /^v?\d{1,4}$/.test(part) || /^[A-Za-z][A-Za-z0-9]{0,7}$/.test(part),
  );
}

function shouldMaskToken(run: string): boolean {
  if (run.length < 15 || !/[A-Za-z]/.test(run)) return false;
  if (isPlainWordOrPath(run) || isName(run)) return false;
  // 20 or more: any non-name shape (unknown vendors, JWTs). 15–19: only with a digit (ASIA…, xox…).
  return run.length >= 20 || /\d/.test(run);
}

/**
 * The password of an http(s) URL that carries `user:password@` in front of its host. A user name with no
 * password (`https://user@host/`) and an empty password (`https://user:@host/`) are not secrets.
 */
function urlCredentialSpans(url: string, base: number): Array<[number, number]> {
  const match = /^https?:\/\/[^/?#@:\s]*:([^/?#@\s]+)@/i.exec(url);
  if (!match) return [];
  const from = base + match[0].length - 1 - match[1]!.length;
  return [[from, from + match[1]!.length]];
}

/** Token runs inside one URL path or query segment. */
function urlSecretSpans(url: string, base: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /[A-Za-z0-9+/_=.-]{15,}/g;
  let seg = 0;
  for (let i = 0; i <= url.length; i += 1) {
    if (i !== url.length && !"/?&#=".includes(url.charAt(i))) continue;
    const segment = url.slice(seg, i);
    re.lastIndex = 0;
    for (let match = re.exec(segment); match; match = re.exec(segment)) {
      if (!shouldMaskToken(match[0])) continue;
      const from = base + seg + match.index;
      spans.push([from, from + match[0].length]);
    }
    seg = i + 1;
  }
  return spans;
}

/** All letters, with at most one capital and only at the start (`People`, `ship`). */
function isDictionaryWord(token: string): boolean {
  return /^[A-Z]?[a-z]+$/.test(token);
}

function tokenCore(token: string): string {
  return token.replace(/^[("'[{]+/, "").replace(/[)"'\]}.,;:!?]+$/g, "");
}

function classCount(token: string): number {
  let n = 0;
  if (/[a-z]/.test(token)) n += 1;
  if (/[A-Z]/.test(token)) n += 1;
  if (/\d/.test(token)) n += 1;
  if (/[^A-Za-z0-9]/.test(token)) n += 1;
  return n;
}

/**
 * A whitespace token of 8 or more characters that mixes two of lower, upper, digits, and symbols.
 * A dictionary word, a name, a version, or an http(s) URL stays. The current name rule still
 * keeps a pure letter-run (`messagesForFreshThread`) and a dotted release (`node-v20.18.0-lts`).
 */
function isMixedSecretToken(raw: string): boolean {
  const core = tokenCore(raw);
  if (core.length < 8 || /^https?:\/\//i.test(core)) return false;
  if (isDictionaryWord(core) || isPlainWordOrPath(core) || isName(core)) return false;
  return classCount(core) >= 2;
}

function mixedSecretSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /\S+/g;
  for (let match = re.exec(text); match; match = re.exec(text)) {
    if (!isMixedSecretToken(match[0])) continue;
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

function tokenSpans(text: string): Array<[number, number]> {
  const urls = rangesOf(text, URL_RUN);
  const spans: Array<[number, number]> = [];
  TOKEN_RUN.lastIndex = 0;
  for (let match = TOKEN_RUN.exec(text); match; match = TOKEN_RUN.exec(text)) {
    const run = match[0];
    const from = match.index;
    const to = from + run.length;
    if (urls.some(([start, end]) => from < end && to > start)) continue;
    if (shouldMaskToken(run)) spans.push([from, to]);
  }
  for (const [start, end] of urls) {
    spans.push(...urlSecretSpans(text.slice(start, end), start));
    spans.push(...urlCredentialSpans(text.slice(start, end), start));
  }
  return spans;
}

/**
 * Older scanner, kept for its own tests. A decision is not saved from this.
 * The save uses {@link decisionTextOrdinary}: the whole answer, or none of it.
 * Replace a PEM block, a credential assignment, a token-shaped run, or a mixed-class token with `[masked]`.
 * Format characters are removed and Unicode spaces become plain spaces first; that normalised text is what we keep.
 * Ordinary words and names stay. A key inside an http(s) URL is masked; the rest of the URL stays.
 */
export function maskSecrets(text: string): string {
  const clean = normalise(text);
  const pem = maskSpans(clean, rangesOf(clean, PEM_BLOCK));
  const assigned = maskSpans(pem, assignmentSpans(pem));
  return maskSpans(assigned, [...tokenSpans(assigned), ...mixedSecretSpans(assigned)]);
}

/** True when the secret check would change this text. Ordinary words and names stay false. */
export function textHasSecret(text: string): boolean {
  const normalised = normalise(text);
  return maskSecrets(normalised) !== normalised;
}
