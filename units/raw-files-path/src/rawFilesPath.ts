/**
 * True when a value is a raw vault file path.
 *
 * Trim, then:
 *
 * - the value starts with `/files/` — this arm is case-sensitive, or
 * - the value matches `http://<host>/files/` or `https://<host>/files/` —
 *   this arm is case-insensitive.
 *
 * `/Files/a` is false. `HTTPS://host.example.test/files/a` is true.
 * That split is the shipped check. Do not make the two arms agree.
 *
 * `/files` with nothing after `files` is false. `/other/files/a` is false.
 * The absolute arm requires `/files/` directly after the host.
 *
 * True means do not use this string as a picture address. This function
 * does not build a replacement. The host does that, with its own origin.
 */
export function isRawFilesPath(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("/files/") || /^https?:\/\/[^/]+\/files\//i.test(trimmed);
}
