// A link to one standard in the standards editor.
//
// An app links to the editor and never rebuilds it. The URL shape is the editor's own
// URL-as-state:
//   ?pod=<vaultId>&section=standards[&stab=<tab>][&pk=<kind>]&<param>=<id>
// The host passes the editor's base URL, so this names no host.

/** A standards tab in the editor, and the selection param it reads. */
export interface StandardLinkTarget {
  /** The editor's tab, e.g. "processes", "rules", "procedures". "processes" is the default tab. */
  tab: string;
  /** The tab's selection param, e.g. "std" (processes), "rs" (rules), "pr" (procedures). */
  param: string;
  /** The standard's id tail. */
  id: string;
  /** The process kind, on the processes tab only; "process" is the default. */
  processKind?: string;
  /** The vault holding the standard. */
  vaultId?: string;
}

/**
 * Builds the link.
 *
 * @param editorBase the editor's absolute base URL, from the host's configuration
 * @param t what to open
 * @returns the absolute URL
 * @throws {TypeError} when `editorBase` is not an absolute URL
 */
export function standardHref(editorBase: string, t: StandardLinkTarget): string {
  const u = new URL(editorBase);
  const p = new URLSearchParams();
  if (t.vaultId) p.set("pod", t.vaultId);
  p.set("section", "standards");
  if (t.tab !== "processes") p.set("stab", t.tab);
  if (t.tab === "processes" && t.processKind && t.processKind !== "process") p.set("pk", t.processKind);
  p.set(t.param, t.id);
  u.search = p.toString();
  return u.toString();
}
