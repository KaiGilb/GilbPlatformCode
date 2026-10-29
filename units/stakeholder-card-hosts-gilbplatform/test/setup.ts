// Every test starts with a fresh in-memory localStorage (the kind reader and the photo term keep device copies there) and leaves the page empty.
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
import { __resetPhotoTermResolvers } from "../src/photoTerm";

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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetPhotoTermResolvers();
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
  // The module state of the units the card reads: what one test learns must not reach the next.
  forgetLinkedRecords();
  forgetScreenLinks();
  forgetPageLinks();
  forgetStakeholderKindReaders();
  __resetPersonCardSession();
});
