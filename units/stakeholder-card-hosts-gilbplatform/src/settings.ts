// The platform's settings and the session, set once before the first child renders. The order is the Plan-card provider's:
// the origin first (every address and type URI derives from it), then the ontology's origin, the hosts allowed to receive a
// credential, the own-card host labels, the optional settings, the session, and last the type key (it reads the type registry,
// which reads the origin).

import { setBaseOrigin, setLocalRigHosts, setMinOntologyQuery, setOntologyApiOrigin, setOntologyApiOriginRaw, setPublicCorpusOrigin, setSystemVaultHosts, setVocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { setTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import { typeFacetKey } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

/** The optional settings. Each unset one keeps the unit's default (the same set the Plan-card provider takes). */
export interface StakeholderCardSettings {
  /** Bare host names of a local development rig; a rule that applies only to a local rig takes its branch only when the origin's host is listed. Default: none. */
  localRigHosts?: readonly string[];
  /** The origin that answers the public term search, when it is not the ontology origin. */
  ontologyApiOrigin?: string;
  /** The same origin as the text is given (not parsed), for a rig that serves terms over plain http or under a path. */
  ontologyApiOriginRaw?: string;
  /** The shortest query, in letters, that reaches the ontology. Default: 3. */
  minOntologyQuery?: number;
  /** The platform revisions at which the batched vocabulary read is served, as one comma-separated text. Default: none. */
  vocabTypeBatchRevisions?: string;
  /** The origin of the public term corpus that stands in when the origin is a local rig that holds no ontology. */
  publicCorpusOrigin?: string;
}

export interface PlatformSetup {
  origin: string;
  ontologyOrigin: string;
  systemVaultHosts: readonly string[];
  systemHostLabels: readonly string[];
  settings?: StakeholderCardSettings | undefined;
}

/** Sets the origins, the lists and the optional settings, in this order. Throws the setter's TypeError for a value it refuses. */
export function applyPlatformSetup(setup: PlatformSetup): void {
  setBaseOrigin(setup.origin);
  setTermOrigin(setup.ontologyOrigin);
  setSystemVaultHosts(setup.systemVaultHosts);
  setSystemHostLabels(setup.systemHostLabels);
  const s = setup.settings;
  if (s?.localRigHosts !== undefined) setLocalRigHosts(s.localRigHosts);
  if (s?.ontologyApiOrigin !== undefined) setOntologyApiOrigin(s.ontologyApiOrigin);
  if (s?.ontologyApiOriginRaw !== undefined) setOntologyApiOriginRaw(s.ontologyApiOriginRaw);
  if (s?.minOntologyQuery !== undefined) setMinOntologyQuery(s.minOntologyQuery);
  if (s?.vocabTypeBatchRevisions !== undefined) setVocabTypeBatchRevisions(s.vocabTypeBatchRevisions);
  if (s?.publicCorpusOrigin !== undefined) setPublicCorpusOrigin(s.publicCorpusOrigin);
}

/** Sets the auth seam from the session, then the type key. */
export function applySession(session: SessionCredential): void {
  setLwsAuth(lwsAuthFromSession(session));
  setTypeKey(typeFacetKey);
}

/** A key that changes exactly when a setup value changes, so a re-render with the same values sets nothing again. */
export function setupKey(setup: PlatformSetup): string {
  return JSON.stringify([setup.origin, setup.ontologyOrigin, setup.systemVaultHosts, setup.systemHostLabels, setup.settings ?? null]);
}
