// The ten factories: each result is assignable to the interface of the unit that owns the host (checked by `tsc`), and each member is what the census says.
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { deletedLinkedRecords, forgetDeletedLinkedRecord } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OnlineStakeholderCardHost } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import type { StakeholderContactHeaderHost } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import type { OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import type { StakeholderListDoorsHost } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import type { PersonCreateHost } from "@kaigilb/gilbplatformcode-person-create";
import type { CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { masterKindReader, useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import type { CardReferencesHost } from "@kaigilb/gilbplatformcode-card-references";
import type { OrgMarkHost } from "@kaigilb/gilbplatformcode-org-mark";
import type { OrgEmployeesHost } from "@kaigilb/gilbplatformcode-org-employees";
import type { UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { changeRecordFactItems } from "@kaigilb/gilbplatformcode-record-fact-items";
import { downloadFileOutcome } from "@kaigilb/gilbplatformcode-file-download-outcome";
import { dropStaleSheetEntry, useSheetHistory } from "@kaigilb/gilbplatformcode-sheet-history";
import * as unit from "./index";
import {
  createCardReferencesHost,
  createCardVocabularyHost,
  createOneCardHost,
  createOnlineStakeholderCardHost,
  createOrgEmployeesHost,
  createOrgMarkHost,
  createPersonCreateHost,
  createPickerQuery,
  createStakeholderContactHeaderHost,
  createStakeholderListDoorsHost,
} from "./index";
import { adderCardOf } from "./adderCard";
import { heldRecordOf, readResources, rememberCreatedIn, useRecordsBeingDeleted, usePickerQuery } from "./inline";
import { defaultLoadGranteeFace, defaultLoadPhotoObjectUrl } from "./defaults";

// ---- Type level: each factory's result is exactly the interface of the unit that owns the context.
expectTypeOf<ReturnType<typeof createOnlineStakeholderCardHost>>().toEqualTypeOf<OnlineStakeholderCardHost>();
expectTypeOf<ReturnType<typeof createStakeholderContactHeaderHost>>().toEqualTypeOf<StakeholderContactHeaderHost>();
expectTypeOf<ReturnType<typeof createOneCardHost>>().toEqualTypeOf<OneCardHost>();
expectTypeOf<ReturnType<typeof createStakeholderListDoorsHost>>().toEqualTypeOf<StakeholderListDoorsHost>();
expectTypeOf<ReturnType<typeof createPersonCreateHost>>().toEqualTypeOf<PersonCreateHost>();
expectTypeOf<ReturnType<typeof createCardVocabularyHost>>().toEqualTypeOf<CardVocabularyHost>();
expectTypeOf<ReturnType<typeof createCardReferencesHost>>().toEqualTypeOf<CardReferencesHost>();
expectTypeOf<ReturnType<typeof createOrgMarkHost>>().toEqualTypeOf<OrgMarkHost>();
expectTypeOf<ReturnType<typeof createOrgEmployeesHost>>().toEqualTypeOf<OrgEmployeesHost>();
expectTypeOf<ReturnType<typeof createPickerQuery>>().toEqualTypeOf<UsePickerQuery>();

describe("the export list", () => {
  test("is the provider, the ten factories, the defaults constant and the sentence", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "NO_OWN_VAULT_SAYS",
      "STAKEHOLDER_CARD_QUERY_DEFAULTS",
      "StakeholderCardGilbPlatformProvider",
      "createCardReferencesHost",
      "createCardVocabularyHost",
      "createOneCardHost",
      "createOnlineStakeholderCardHost",
      "createOrgEmployeesHost",
      "createOrgMarkHost",
      "createPersonCreateHost",
      "createPickerQuery",
      "createStakeholderContactHeaderHost",
      "createStakeholderListDoorsHost",
    ]);
  });
});

describe("the members of each host", () => {
  test("the doors: nothing counts the requests, the freshness is the app's 15 s, the other two are the inline copies", () => {
    const doors = createStakeholderListDoorsHost();
    expect(doors.requestsSent()).toBe(0);
    expect(doors.heldRecordFreshMs).toBe(15_000);
    expect(doors.heldRecordOf).toBe(heldRecordOf);
    expect(doors.useRecordsBeingDeleted).toBe(useRecordsBeingDeleted);
  });

  test("the person host: the find half of the adder's card, and the inline rememberCreatedIn", () => {
    const person = createPersonCreateHost();
    expect(person.adderCardOf).toBe(adderCardOf);
    expect(person.rememberCreatedIn).toBe(rememberCreatedIn);
  });

  test("the vocabulary host: the kind reader of plan-stakeholder-io, and persistVocabulary only when given", () => {
    expect(createCardVocabularyHost().masterKindReader).toBe(masterKindReader);
    expect("persistVocabulary" in createCardVocabularyHost()).toBe(false);
    const persist = () => false;
    expect(createCardVocabularyHost({ persistVocabulary: persist }).persistVocabulary).toBe(persist);
  });

  test("the card host: its own three members from the options, the three hosts of its peers from their factories", () => {
    const useShell = vi.fn();
    const refresh = vi.fn();
    const keys = vi.fn(() => ["a:photo"]);
    const host = createOnlineStakeholderCardHost({ useShell: useShell as never, refreshOnlineStakeholders: refresh, photoReadKeysSync: keys });
    expect(host.useShell).toBe(useShell);
    expect(host.refreshOnlineStakeholders).toBe(refresh);
    expect(host.photoReadKeysSync).toBe(keys);
    expect(host.doors.heldRecordFreshMs).toBe(15_000);
    expect(host.person.adderCardOf).toBe(adderCardOf);
    expect(host.vocabulary.masterKindReader).toBe(masterKindReader);
    expect("persistVocabulary" in host.vocabulary).toBe(false);
    const persist = () => true;
    expect(createOnlineStakeholderCardHost({ useShell: useShell as never, refreshOnlineStakeholders: refresh, photoReadKeysSync: keys, persistVocabulary: persist }).vocabulary.persistVocabulary).toBe(persist);
  });

  test("the header host: useRelations of plan-stakeholder-io, and the photo members are those of vault-profile-photo and grantee-face by default", () => {
    const header = createStakeholderContactHeaderHost();
    expect(header.useRelations).toBe(useRelations);
    expect(header.loadPhotoObjectUrl).toBe(defaultLoadPhotoObjectUrl);
    expect(header.loadGranteeFace).toBe(defaultLoadGranteeFace);
    expect(typeof header.discoverVaultProfilePhoto).toBe("function");
  });

  test("the default discovery reads the photo term's keys through the given photoReadKeys, once per discovery", async () => {
    const keys = vi.fn(async () => ["a:myPhoto"] as readonly string[]);
    const header = createStakeholderContactHeaderHost({ photoReadKeys: keys });
    expect(await header.discoverVaultProfilePhoto(null)).toEqual({ profileId: null, photoRef: null, personName: null });
    expect(keys).toHaveBeenCalledTimes(1);
  });

  test("the header host: the held-note line has no origin, and the kind chips are none (the disabled branch of the source)", () => {
    const header = createStakeholderContactHeaderHost();
    expect(header.useHolderOriginLine({ vaultId: "v", ownVaultId: "v", recordEntityUri: null })).toEqual({ origin: null, loading: false });
    const labels = header.useContactLabels({ vaultId: "v", subject: "", principal: "p", ownVaultId: "v", typeUri: "t:Person", enabled: false });
    expect(labels).toMatchObject({ chips: null, offered: { circleLabel: [], relationshipKind: [] }, offersLoading: false, catalogueNote: null, actError: null });
    expect(labels.entryPredicates.size).toBe(0);
    return expect(labels.add({} as never)).resolves.toBe(false);
  });

  test("the header host: the developer's members win", async () => {
    const own = {
      discoverVaultProfilePhoto: vi.fn(async () => ({ photoRef: "r" })),
      loadPhotoObjectUrl: vi.fn(async () => "blob:x"),
      loadGranteeFace: vi.fn(async () => "blob:y"),
      useHolderOriginLine: vi.fn(() => ({ origin: "o", loading: false })),
      useContactLabels: vi.fn(() => ({}) as never),
    };
    const header = createStakeholderContactHeaderHost(own);
    expect(header.discoverVaultProfilePhoto).toBe(own.discoverVaultProfilePhoto);
    expect(header.loadPhotoObjectUrl).toBe(own.loadPhotoObjectUrl);
    expect(header.loadGranteeFace).toBe(own.loadGranteeFace);
    expect(header.useHolderOriginLine).toBe(own.useHolderOriginLine);
    expect(header.useContactLabels).toBe(own.useContactLabels);
  });

  test("the one card host: the place stubs find nothing, the key and stale time are the app's, the geo test follows the origin", async () => {
    const card = createOneCardHost({ geoOrigin: "https://geo.example.test" });
    expect(await card.listPlaceClaimsInVault("v")).toEqual([]);
    expect(card.claimsAbout([], "s")).toEqual([]);
    expect(card.claimFieldText({} as never, "streetLine")).toBe("");
    expect(await card.loadPlaceNames(["a"])).toEqual([]);
    expect(card.placeClaimsKey("v1")).toEqual(["mynet", "place-claims", "v1"]);
    expect(card.placeClaimsStaleMs).toBe(60_000);
    expect(card.isGeoEntityId("https://geo.example.test/base/e/x")).toBe(true);
    expect(card.isGeoEntityId("https://geo.example.test/base/t/x")).toBe(false);
    expect(card.isGeoEntityId(null)).toBe(false);
  });

  test("the one card host: the developer's place members win", async () => {
    const list = vi.fn(async () => []);
    const about = vi.fn(() => []);
    const text = vi.fn(() => "t");
    const names = vi.fn(async () => []);
    const card = createOneCardHost({ geoOrigin: "https://geo.example.test", listPlaceClaimsInVault: list, claimsAbout: about, claimFieldText: text, loadPlaceNames: names });
    expect(card.listPlaceClaimsInVault).toBe(list);
    expect(card.claimsAbout).toBe(about);
    expect(card.claimFieldText).toBe(text);
    expect(card.loadPlaceNames).toBe(names);
  });
});

describe("useRecordsBeingDeleted, the inline copy", () => {
  const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

  test("is an empty set at first, and the same set until something changes", () => {
    const qc = new QueryClient();
    const { result, rerender } = renderHook(() => useRecordsBeingDeleted(), { wrapper: wrap(qc) });
    const first = result.current;
    expect(first.size).toBe(0);
    rerender();
    expect(result.current).toBe(first);
  });

  test("holds the ids of a delete under way, and keeps them once it has landed", async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useRecordsBeingDeleted(), { wrapper: wrap(qc) });
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const run = qc.getMutationCache().build(qc, { mutationKey: ["base", "record-delete"], mutationFn: async (_v: { id: string }) => done }).execute({ id: "gone1" });
    await waitFor(() => expect([...result.current]).toEqual(["gone1"]));
    finish();
    await run;
    await waitFor(() => expect([...result.current]).toEqual(["gone1"]));
    expect(deletedLinkedRecords().has("gone1")).toBe(true);
  });

  test("a delete that failed leaves the set", async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useRecordsBeingDeleted(), { wrapper: wrap(qc) });
    let fail!: () => void;
    const done = new Promise<void>((_r, rej) => (fail = () => rej(new Error("no"))));
    const run = qc.getMutationCache().build(qc, { mutationKey: ["base", "record-delete"], mutationFn: async (_v: { id: string }) => done }).execute({ id: "kept1" });
    await waitFor(() => expect([...result.current]).toEqual(["kept1"]));
    fail();
    await run.catch(() => undefined);
    await waitFor(() => expect(result.current.size).toBe(0));
  });

  test("an id the session knows was deleted is in the set, and a mutation of another key is not", async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useRecordsBeingDeleted(), { wrapper: wrap(qc) });
    act(() => forgetDeletedLinkedRecord("https://holder.example.test/base/e/zed"));
    await waitFor(() => expect([...result.current]).toEqual(["zed"]));
    const other = qc.getMutationCache().build(qc, { mutationKey: ["base", "something-else"], mutationFn: async (_v: { id: string }) => undefined });
    await other.execute({ id: "not-a-delete" });
    expect([...result.current]).toEqual(["zed"]);
  });
});

describe("the hosts of the standalone units", () => {
  test("card-references: the one-key writer of record-fact-items", () => {
    expect(Object.keys(createCardReferencesHost())).toEqual(["changeRecordFactItems"]);
    expect(createCardReferencesHost().changeRecordFactItems).toBe(changeRecordFactItems);
  });

  test("org-mark: the bounded file read of file-download-outcome", () => {
    expect(Object.keys(createOrgMarkHost())).toEqual(["downloadFileOutcome"]);
    expect(createOrgMarkHost().downloadFileOutcome).toBe(downloadFileOutcome);
  });

  test("org-employees: readResources inline, the two history members of sheet-history, the photo keys given, and no face unless one is given", async () => {
    const keys = vi.fn(async () => ["a:p"] as readonly string[]);
    const host = createOrgEmployeesHost({ photoReadKeys: keys });
    expect(Object.keys(host).sort()).toEqual(["dropStaleSheetEntry", "photoReadKeys", "readResources", "useSheetHistory"]);
    expect(host.readResources).toBe(readResources);
    expect(host.useSheetHistory).toBe(useSheetHistory);
    expect(host.dropStaleSheetEntry).toBe(dropStaleSheetEntry);
    expect(host.photoReadKeys).toBe(keys);
    const Face = () => null;
    const withFace = createOrgEmployeesHost({ RecordFace: Face });
    expect(withFace.RecordFace).toBe(Face);
    expect(typeof withFace.photoReadKeys).toBe("function");
  });

  test("the pickers' query hook is the one that passes retry: false", () => {
    expect(createPickerQuery()).toBe(usePickerQuery);
  });
});
