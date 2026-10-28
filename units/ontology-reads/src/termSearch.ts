import { baseOrigin, localRigHosts, minOntologyQuery, ontologyApiOrigin, publicCorpusOrigin } from "@kaigilb/gilbplatformcode-base-origin";

function isLocalDevHost(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return localRigHosts().has(h);
  } catch {
    return false;
  }
}

/**
 * Origin for GET /base/terms (and only that).
 *
 * Override: `setOntologyApiOrigin(<origin>)` (or any Base that holds
 * the full ontology). Default: the public corpus origin (`publicCorpusOrigin()`) when the platform origin is
 * a local rig; otherwise the platform origin itself (apex / production-shaped deploys).
 */
export function corpusApiOrigin(): string {
  const override = ontologyApiOrigin();
  if (override) return override.replace(/\/$/, "");
  if (isLocalDevHost(baseOrigin())) return publicCorpusOrigin();
  return baseOrigin().replace(/\/$/, "");
}

