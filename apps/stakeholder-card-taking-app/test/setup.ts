// Every test starts with a fresh in-memory localStorage and sessionStorage (the settings, the kind reader's device copy and the sign-in's
// pending mailbox live there) and leaves the page empty. The module state of the units (origins, session, type key, and what the
// Stakeholder units learn) is set again by each provider mount; it is also reset here, as units/stakeholder-card-hosts-gilbplatform/test/setup.ts does.
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
import { __resetAnnotationCapability } from "@kaigilb/gilbplatformcode-contact-annotation";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetAddedByForTest } from "@kaigilb/gilbplatformcode-added-by";
import { resetStoredSpellingCache, resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { clearEntityWriteDenials } from "@kaigilb/gilbplatformcode-entity-write-access";
import { resetMyNetProfileUrl } from "@kaigilb/gilbplatformcode-own-card-state";

// jsdom lacks these; the held card's header reads its width through ResizeObserver.
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
for (const name of ["createObjectURL", "revokeObjectURL"] as const) {
  if (typeof (URL as unknown as Record<string, unknown>)[name] !== "function") {
    Object.defineProperty(URL, name, { configurable: true, writable: true, value: name === "createObjectURL" ? () => "blob:stand-in" : () => undefined });
  }
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
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
