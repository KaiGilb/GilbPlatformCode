// The settings screen's values, kept in localStorage, and the provider props they become. Every value is typed by the person; none is
// baked in. The values are kept as the text the person typed (a list is comma-separated text), and turned into props in one place.
import type { StakeholderCardGilbPlatformProviderProps } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

export const SETTINGS_KEY = "stakeholder-card-taking-app.settings";

export interface AppSettings {
  /** The platform origin of the vault, `https://host`, no path. */
  origin: string;
  /** The origin of the platform's identity service, where the person signs in (`https://host`, no path). Sign-in calls go only here; the card reads and writes at `origin`. */
  signInOrigin: string;
  /** The origin that serves the ontology's terms. */
  ontologyOrigin: string;
  /** The origin of the shared world catalogue (the GilbGeo vault). */
  geoOrigin: string;
  /** Bare host names, comma-separated, besides the origin's family, that are read at their own address. */
  systemVaultHosts: string;
  /** First labels of the platform's own hosts, comma-separated. */
  systemHostLabels: string;
  /** Optional: the origin that answers the public term search. */
  ontologyApiOrigin: string;
  /** Optional: the same origin as text, for a rig that serves terms over plain http or under a path. */
  ontologyApiOriginRaw: string;
  /** Optional: the public term corpus. */
  publicCorpusOrigin: string;
  /** Optional: the host the platform origin forwards to (an apex forwarded to the identity host). Requests sent to the platform origin are signed for it. */
  dpopProofOrigin: string;
  /** Optional: bare host names of a local development rig, comma-separated. */
  localRigHosts: string;
  /** Optional: the shortest query that reaches the ontology, in letters. */
  minOntologyQuery: string;
  /** Optional: platform revisions that serve the batched vocabulary read, comma-separated text. */
  vocabTypeBatchRevisions: string;
}

export const EMPTY_SETTINGS: AppSettings = {
  origin: "",
  signInOrigin: "",
  ontologyOrigin: "",
  geoOrigin: "",
  systemVaultHosts: "",
  systemHostLabels: "",
  ontologyApiOrigin: "",
  ontologyApiOriginRaw: "",
  publicCorpusOrigin: "",
  dpopProofOrigin: "",
  localRigHosts: "",
  minOntologyQuery: "",
  vocabTypeBatchRevisions: "",
};

/** The saved settings, or null when none were saved (first run) or the saved text cannot be read. */
export function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<Record<keyof AppSettings, unknown>>;
    const out: AppSettings = { ...EMPTY_SETTINGS };
    for (const k of Object.keys(EMPTY_SETTINGS) as (keyof AppSettings)[]) {
      const v = parsed[k];
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const list = (text: string): string[] => text.split(/[\s,]+/).filter((x) => x !== "");

function originProblem(label: string, value: string): string | null {
  if (value.trim() === "") return `${label} is needed.`;
  try {
    const u = new URL(value.trim());
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.pathname !== "/" || u.search !== "" || u.hash !== "") return `${label} must look like https://host, with no path.`;
  } catch {
    return `${label} must look like https://host, with no path.`;
  }
  return null;
}

/** What is wrong with the settings, in plain sentences; empty when they can be used. */
export function settingsProblems(s: AppSettings): string[] {
  const out: string[] = [];
  const a = originProblem("The platform origin", s.origin);
  if (a) out.push(a);
  const si = originProblem("The sign-in origin", s.signInOrigin);
  if (si) out.push(si);
  const b = originProblem("The ontology origin", s.ontologyOrigin);
  if (b) out.push(b);
  const c = originProblem("The world catalogue origin", s.geoOrigin);
  if (c) out.push(c);
  if (list(s.systemVaultHosts).length === 0) out.push("At least one system vault host is needed.");
  if (list(s.systemHostLabels).length === 0) out.push("At least one system host label is needed.");
  if (s.dpopProofOrigin.trim() !== "") {
    const d = originProblem("The DPoP proof origin", s.dpopProofOrigin);
    if (d) out.push(d);
  }
  if (s.minOntologyQuery.trim() !== "" && !/^\d+$/.test(s.minOntologyQuery.trim())) out.push("The shortest ontology query must be a whole number.");
  return out;
}

type SettingsProp = NonNullable<StakeholderCardGilbPlatformProviderProps["settings"]>;

/** The provider props the settings feed (everything but the session, the callbacks and the children). */
export function providerSettings(s: AppSettings): Pick<StakeholderCardGilbPlatformProviderProps, "origin" | "ontologyOrigin" | "geoOrigin" | "systemVaultHosts" | "systemHostLabels" | "settings"> {
  const optional: SettingsProp = {};
  if (s.localRigHosts.trim() !== "") optional.localRigHosts = list(s.localRigHosts);
  if (s.ontologyApiOrigin.trim() !== "") optional.ontologyApiOrigin = s.ontologyApiOrigin.trim();
  if (s.ontologyApiOriginRaw.trim() !== "") optional.ontologyApiOriginRaw = s.ontologyApiOriginRaw.trim();
  if (s.minOntologyQuery.trim() !== "") optional.minOntologyQuery = Number(s.minOntologyQuery.trim());
  if (s.vocabTypeBatchRevisions.trim() !== "") optional.vocabTypeBatchRevisions = s.vocabTypeBatchRevisions.trim();
  if (s.publicCorpusOrigin.trim() !== "") optional.publicCorpusOrigin = s.publicCorpusOrigin.trim();
  if (s.dpopProofOrigin.trim() !== "") optional.dpopProofOrigin = s.dpopProofOrigin.trim();
  return {
    origin: s.origin.trim(),
    ontologyOrigin: s.ontologyOrigin.trim(),
    geoOrigin: s.geoOrigin.trim(),
    systemVaultHosts: list(s.systemVaultHosts),
    systemHostLabels: list(s.systemHostLabels),
    ...(Object.keys(optional).length > 0 ? { settings: optional } : {}),
  };
}
