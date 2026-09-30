/** True only on an exact match. A near spelling is not the marker. */
export function isExactPrincipal(principal: string | null | undefined, marker: string): boolean {
  return marker !== "" && principal === marker;
}

/**
 * A public read. `kind: "public"` or an exact marker match, and a read or write mode.
 * The host passes the marker. This unit does not know which id that is.
 */
export function isPublicReadEdge(
  edge: { kind?: string; sourceVault?: string; mode: string },
  marker: string,
): boolean {
  const isPublic = edge.kind === "public" || isExactPrincipal(edge.sourceVault, marker);
  return isPublic && (edge.mode === "read" || edge.mode === "write");
}
