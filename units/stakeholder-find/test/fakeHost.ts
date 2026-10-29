// Test-only: the host of the unit as a recording fake, and a seeded query client. The vocabulary and the picker reading are put in the
// client's cache (both queries are fresh for ever), so no master is read; the host's kind reader refuses, to show it is not asked.
import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { stakeholderCardVocabularyQueryKey, type StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { pickerReadingQueryKey, stakeholderTypeOptions } from "@kaigilb/gilbplatformcode-person-create";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import type { PickerReading } from "@kaigilb/gilbplatformcode-pick-or-create";
import type { TypeOption } from "@kaigilb/gilbplatformcode-ontology-reads";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import type { StakeholderFindHost } from "../src/useStakeholderCreate";

export const VNS = "https://ann.platform.example.test/base";

const field = (writeKey: string, label: string) => ({
  term: `https://ontology.example.test/base/t/${label}`,
  label,
  readKeys: [writeKey],
  writeKey,
  writeKeyProblem: null,
  encoding: "inline-literal:text",
  many: false,
  declaredOn: ["Person"],
  record: null,
});

/** One kind, Person, whose set offers the name and one more text field. */
export const FIELD_SETS = {
  kinds: { predicates: { name: { writeKey: "a:name", readKeys: ["a:name"] } } },
  byKind: {
    "https://ontology.example.test/base/t/Person": {
      kind: "https://ontology.example.test/base/t/Person",
      name: "Person",
      label: "Person",
      ancestors: [],
      fields: [field("a:name", "Name"), field("a:nickname", "Nickname")],
    },
  },
  complete: true,
  incompleteAt: [],
  unreadable: [],
} as unknown as StakeholderFieldSets;

export const VOCAB: StakeholderCardVocabulary = {
  kindNames: ["Person"],
  kindsComplete: true,
  fieldSets: FIELD_SETS,
  fieldSetsRefusal: null,
  roleLabel: "Stakeholder",
};

export const READING = { fieldSets: FIELD_SETS } as unknown as PickerReading;

export const PERSON_OPTION: TypeOption = stakeholderTypeOptions(FIELD_SETS)[0]!;

export const vault = (vaultId: string): ReachableVault => ({ vaultId }) as unknown as ReachableVault;

export function fakeHost() {
  return {
    defaultWriteVaultId: vi.fn((vaults: readonly ReachableVault[] | null | undefined, _viewed: string | null | undefined): string | null => vaults?.[0]?.vaultId ?? null),
    vocabulary: {
      masterKindReader: vi.fn(() => {
        throw new Error("the kind reader was asked");
      }),
    },
    person: {
      adderCardOf: vi.fn(async () => `${VNS}/e/ann-card`),
      rememberCreatedIn: vi.fn(),
    },
  } satisfies StakeholderFindHost;
}
export type FakeHost = ReturnType<typeof fakeHost>;

/** A query client with the vocabulary and the picker reading already in hand. */
export function seededClient(seed = true): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  if (seed) {
    qc.setQueryData(stakeholderCardVocabularyQueryKey(), VOCAB);
    qc.setQueryData(pickerReadingQueryKey(), READING);
  }
  return qc;
}
