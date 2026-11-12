const META_CANNOT_USE = new Set(["frame-ancestors", "report-uri", "report-to", "sandbox"]);

/**
 * A policy file as one policy: comments (`#` to the end of the line) and blank lines are dropped, the directives are trimmed and
 * joined with "; " (a trailing ";" on a line is fine). Throws a plain sentence when nothing is left.
 */
export function readPolicy(text: string): string {
  const directives = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ""))
    .join(";")
    .split(";")
    .map((d) => d.trim().replace(/\s+/g, " "))
    .filter((d) => d !== "");
  if (directives.length === 0) throw new Error("The Content-Security-Policy is empty: it has no directive after the comments and blank lines are removed.");
  return directives.join("; ");
}

/** The policy as a `<meta>` tag may carry it: without `frame-ancestors`, `report-uri`, `report-to` and `sandbox`, which a meta tag cannot use. */
export function metaPolicy(policy: string): string {
  return policy
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d !== "" && !META_CANNOT_USE.has(d.split(/\s+/)[0]!.toLowerCase()))
    .join("; ");
}

const headerLines = (policy: string, extra: Record<string, string>): string[] => [
  `  Content-Security-Policy: ${policy}`,
  ...Object.entries(extra)
    .filter(([name]) => name.toLowerCase() !== "content-security-policy")
    .map(([name, value]) => `  ${name}: ${value}`),
];

/** The text of a Cloudflare Pages `_headers` file: one `/*` block with the policy, then the extra headers. */
export function headersFileText(policy: string, extra: Record<string, string> = {}): string {
  return ["/*", ...headerLines(policy, extra)].join("\n") + "\n";
}

/**
 * Puts the policy and the extra headers into an existing `_headers` text. In the `/*` block, a line for a header of the same name
 * (any case) is replaced, so the policy is never there twice; without a `/*` block one is added at the end. Other blocks stay as they are.
 */
export function mergeHeadersFile(existing: string, policy: string, extra: Record<string, string> = {}): string {
  const ours = headerLines(policy, extra);
  const names = new Set(ours.map((l) => l.slice(2, l.indexOf(":")).toLowerCase()));
  const lines = existing.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === "/*" && !/^\s/.test(l));
  if (start < 0) {
    const kept = existing.replace(/\s+$/, "");
    return (kept === "" ? "" : kept + "\n\n") + headersFileText(policy, extra);
  }
  let end = start + 1;
  while (end < lines.length && (lines[end]!.trim() === "" || /^\s/.test(lines[end]!))) end++;
  const block = lines.slice(start + 1, end);
  const trailing: string[] = [];
  while (block.length > 0 && block[block.length - 1]!.trim() === "") trailing.push(block.pop()!);
  const kept = block.filter((l) => {
    const i = l.indexOf(":");
    return !(i > 0 && names.has(l.slice(0, i).trim().toLowerCase()));
  });
  const merged = [...lines.slice(0, start + 1), ...kept, ...ours, ...trailing, ...lines.slice(end)].join("\n");
  return merged.endsWith("\n") ? merged : merged + "\n";
}

const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const isCspMeta = (tag: string): boolean => /\bhttp-equiv\s*=\s*(["']?)content-security-policy\1(?=[\s/>])/i.test(tag);
const escapeAttr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The page with exactly one `<meta http-equiv="Content-Security-Policy">`. An existing one is replaced where it stands (a second one is
 * removed); with none, the tag goes right after `<head>`. `policy` is used as given: pass `metaPolicy(...)`.
 */
export function withMetaPolicy(html: string, policy: string): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(policy)}">`;
  let placed = false;
  const replaced = html.replace(META_TAG, (m) => {
    if (!isCspMeta(m)) return m;
    if (placed) return "";
    placed = true;
    return tag;
  });
  if (placed) return replaced;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + "\n    " + tag + html.slice(head.index + head[0].length);
  return tag + "\n" + html;
}
