// Test support: the fake peers (the module mocks of the four test files) and the state they share. This file imports NO unit that is mocked
// at run time, so a mock factory may load it while the module it replaces is being loaded.
import { vi } from "vitest";
import { PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";

export const ONTOLOGY = "https://ontology.example.test";
export const PERSON_TYPE = `${ONTOLOGY}/base/t/Person`;
export const RECORDS = "https://ann.platform.example.test/vault/e/";

export interface FakeField {
  term: string;
  label: string;
  readKeys: string[];
  writeKey: string;
  writeKeyProblem: null;
  encoding: string;
  many: boolean;
  declaredOn: string[];
  record: null;
}

/** What the fakes did and what they are told to do. `reset()` puts it back before each test. */
export const M = {
  made: [] as { vault: string; name: string }[],
  patched: [] as { id: string; patch: unknown; uri: unknown }[],
  /** Every delete as (id, address). */
  deleteArgs: [] as [string, unknown][],
  opened: [] as string[],
  /** The vault the card handed the host for each existing record it opened (`rememberVaultOf`). */
  vaults: {} as Record<string, string>,
  deleted: [] as string[],
  patchFails: 0,
  /** When set, the create waits for it (two presses can then be made while the first is out). */
  gate: null as Promise<void> | null,
  partial: 0,
  deleteFails: null as Set<string> | null,
  /** Whether a tag was sent with each create (it must always be null). */
  tags: [] as (string | null)[],
  /** The host each create and each after-create was given first. */
  personHosts: [] as unknown[],
  afterHosts: [] as unknown[],
  afterCalls: 0,
  /** What recordPerson was called with, after the host: the deps and the input. */
  createArgs: [] as { deps: unknown; input: unknown }[],
  /** What afterRecordPerson was called with after the host: the query client and what was made. */
  afterArgs: [] as { qc: unknown; made: unknown }[],
  /** The record the create answers (the address of the record, or just its id). */
  record: "https://ann.platform.example.test/vault/e/newrec",
  /** When set, the create throws this instead. */
  createThrows: undefined as unknown,
  /** The kinds the person-create fake offers (an empty list: the Person kind is not known). */
  noKind: false,
  afterFails: 0,
};
export const FIND = { ids: [] as string[], fail: false };
/** The circles read waits for `hold` when set; `requests` counts the reads that arrived. */
export const CIRCLES = { hold: null as Promise<void> | null, alsoSelf: false, requests: 0 };
/** The card vocabulary the fake query answers, and the host each call was given. */
export const VOCAB = { fields: [] as FakeField[], hosts: [] as unknown[], /** The master gave no field sets. */ noFieldSets: false };
/** The order host members and fake peers were called in, across renders. */
export const LOG: string[] = [];
export const SPY: { forgetLinkedFinds: ReturnType<typeof vi.fn> | null } = { forgetLinkedFinds: null };

export function reset(): void {
  M.made = [];
  M.patched = [];
  M.deleteArgs = [];
  M.opened = [];
  M.vaults = {};
  M.deleted = [];
  M.patchFails = 0;
  M.gate = null;
  M.partial = 0;
  M.deleteFails = null;
  M.tags = [];
  M.personHosts = [];
  M.afterHosts = [];
  M.afterCalls = 0;
  M.createArgs = [];
  M.afterArgs = [];
  M.record = "https://ann.platform.example.test/vault/e/newrec";
  M.createThrows = undefined;
  M.noKind = false;
  M.afterFails = 0;
  FIND.ids = [];
  FIND.fail = false;
  CIRCLES.hold = null;
  CIRCLES.alsoSelf = false;
  CIRCLES.requests = 0;
  VOCAB.fields = [];
  VOCAB.hosts = [];
  VOCAB.noFieldSets = false;
  LOG.length = 0;
}

/** Fake of `person-create`: the kinds, the picker reading and the two writers; the rest is the peer's. */
export function personCreateMock<T extends object>(actual: T): T {
  return {
    ...actual,
    recordableKinds: () => (M.noKind ? [] : [{ name: "Person", kind: PERSON_TYPE, fields: [] }]),
    pickerReadingQuery: () => ({ queryKey: ["fake-picker"], queryFn: async () => ({ grammar: { separator: "." } }) }),
    // The create takes NO tag; `M.tags` records whether one was sent (it must always be null).
    recordPerson: vi.fn(async (host: unknown, deps: unknown, input: { vault: ReachableVault; name: string }) => {
      LOG.push("recordPerson");
      M.personHosts.push(host);
      M.createArgs.push({ deps, input });
      if (M.createThrows !== undefined) throw M.createThrows;
      M.tags.push("tag" in input ? String((input as { tag?: unknown }).tag) : null);
      if (M.partial > 0) {
        // The record WAS written, then a later step failed (its tag could not be read or made): the package's PartialCreateError, with its cause.
        M.partial -= 1;
        throw new PartialCreateError(`${RECORDS}loser was created and its tag could not be read or made`, {
          record: `${RECORDS}loser`,
          written: [`${RECORDS}loser`],
          vaultId: input.vault.vaultId,
          cause: new Error("POST /base/tag/ensure 500"),
        });
      }
      if (M.gate) await M.gate;
      M.made.push({ vault: input.vault.vaultId, name: input.name });
      return { record: M.record, vaultId: input.vault.vaultId, tag: "ben", tagHandle: `${RECORDS}newtag` };
    }),
    afterRecordPerson: vi.fn(async (host: unknown, qc: unknown, made: unknown) => {
      LOG.push("afterRecordPerson");
      M.afterHosts.push(host);
      M.afterArgs.push({ qc, made });
      M.afterCalls += 1;
      if (M.afterFails > 0) {
        M.afterFails -= 1;
        throw new Error("the lists could not be read again");
      }
    }),
  } as T;
}

/** Fake of `lws-records`: the link write and the delete are recorded; the rest is the peer's. */
export function lwsRecordsMock<T extends object>(actual: T): T {
  return {
    ...actual,
    patchRecord: vi.fn(async (id: string, patch: unknown, uri?: unknown) => {
      LOG.push("patchRecord");
      if (M.patchFails > 0) {
        M.patchFails -= 1;
        throw new Error("PATCH 500");
      }
      M.patched.push({ id, patch, uri });
      return { etag: null };
    }),
    deleteRecord: vi.fn(async (id: string, uri?: unknown) => {
      LOG.push("deleteRecord");
      M.deleteArgs.push([id, uri]);
      if (M.deleteFails?.has(id)) throw new Error("DELETE 500");
      M.deleted.push(id);
    }),
  } as T;
}

/** Fake of `stakeholder-card-vocabulary`: the query answers a Person kind with the fields of `VOCAB.fields`. */
export function vocabularyMock<T extends object>(actual: T): T {
  return {
    ...actual,
    stakeholderCardVocabularyQuery: (host: unknown) => {
      VOCAB.hosts.push(host);
      LOG.push("vocabulary");
      return {
        queryKey: ["fake-card-vocab"],
        queryFn: async () => ({
          kindNames: ["Person"],
          kindsComplete: true,
          fieldSets: VOCAB.noFieldSets
            ? null
            : {
                kinds: {},
                byKind: { [PERSON_TYPE]: { kind: PERSON_TYPE, name: "Person", label: "Person", ancestors: [], fields: VOCAB.fields } },
                complete: true,
                incompleteAt: [],
                unreadable: [],
              },
          fieldSetsRefusal: null,
          roleLabel: null,
          createShortcuts: [],
          shortcutSteps: {},
        }),
      };
    },
  } as T;
}

/** Spy on the peer's `forgetLinkedFinds` (it still runs). */
export function listStateMock<T extends { forgetLinkedFinds: () => void }>(actual: T): T {
  const forgetLinkedFinds = vi.fn(actual.forgetLinkedFinds);
  SPY.forgetLinkedFinds = forgetLinkedFinds;
  return { ...actual, forgetLinkedFinds } as T;
}
