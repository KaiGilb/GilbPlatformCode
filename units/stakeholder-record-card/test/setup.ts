// Every test starts with a fresh in-memory localStorage (the kind reader and the photo term keep device copies there) and leaves the page and the
// modules' state empty: what one test learns must not reach the next. Registers the jest-dom matchers.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetBaseOrigin, resetLocalRigHosts, resetMinOntologyQuery, resetOntologyApiOrigin, resetOntologyApiOriginRaw, resetPublicCorpusOrigin, resetSystemVaultHosts, resetVocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { resetSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { resetLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import { forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { forgetLinkedRecords, forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { __resetPersonCardSession } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { __resetSheetHistory } from "@kaigilb/gilbplatformcode-sheet-history";
import { resetGranteeFaces } from "@kaigilb/gilbplatformcode-grantee-face";
import { __resetAnnotationCapability } from "@kaigilb/gilbplatformcode-contact-annotation";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetAddedByForTest } from "@kaigilb/gilbplatformcode-added-by";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { clearEntityWriteDenials } from "@kaigilb/gilbplatformcode-entity-write-access";
import { resetMyNetProfileUrl, setMyNetProfileUrl } from "@kaigilb/gilbplatformcode-own-card-state";
import { MYNET_PROFILE_URL, resetResolvers, seam } from "./seam";

for (const name of ["createObjectURL", "revokeObjectURL"] as const) {
  if (typeof URL !== "undefined" && typeof (URL as unknown as Record<string, unknown>)[name] !== "function") {
    Object.defineProperty(URL, name, { configurable: true, writable: true, value: name === "createObjectURL" ? () => "blob:stand-in" : () => undefined });
  }
}

// jsdom lacks these; the header reads its width through ResizeObserver.
if (typeof window !== "undefined") {
  if (!window.ResizeObserver)
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver;
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  setMyNetProfileUrl(MYNET_PROFILE_URL);
});
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  seam.reset();
  resetResolvers();
  resetGranteeFaces();
  __resetSheetHistory();
  __resetAnnotationCapability();
  __resetContactLabelVocab();
  __resetAddedByForTest();
  clearEntityWriteDenials();
  resetMyNetProfileUrl();
  resetStoredSpellingCache();
  resetVaultContextCache();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetMinOntologyQuery();
  resetOntologyApiOrigin();
  resetOntologyApiOriginRaw();
  resetPublicCorpusOrigin();
  resetVocabTypeBatchRevisions();
  resetTermOrigin();
  resetSystemHostLabels();
  resetLwsAuth();
  resetTypeKey();
  forgetLinkedRecords();
  forgetScreenLinks();
  forgetPageLinks();
  forgetStakeholderKindReaders();
  __resetPersonCardSession();
});
