import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { USER_VOCAB_KEY as CATALOGUE_KEY, VocabUnreadableError as CatalogueError, readHeaderVocab as catalogueRead } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __setCatalogForTest } from "@kaigilb/gilbplatformcode-lws-relations";
import { fakeHost, newClient, OWN, Wrap } from "../test/fakeHost";
import { USER_VOCAB_KEY, VocabUnreadableError, predicateCurieKey, readHeaderVocab, useHeaderRelations, type HeaderRelationsArgs } from "./index";

const ENTITY = "https://holder.example.test/base/e/vault-holder";
const REC = { id: "06gkrecann", entityUri: "https://holder.example.test/base/e/06gkrecann", typeUri: "https://ontology.example.test/base/t/Person" };
const ARGS: HeaderRelationsArgs = {
  vaultId: OWN,
  vaultEntity: ENTITY,
  vaultRepresents: "https://ontology.example.test/base/t/Person",
  ownVaultId: OWN,
  principal: "https://id.example.test/base/p/holder",
  record: REC,
  canEdit: true,
  contactName: "Ann Larsen",
  holderName: "Cy Holder",
};

let fetched: string[];
beforeEach(() => {
  setBaseOrigin("https://base.example.test");
  setTermOrigin("https://ontology.example.test");
  __setCatalogForTest(null);
  __resetCatalogueCache();
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: RequestInfo | URL) => {
      fetched.push(String(u));
      return new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBaseOrigin();
  resetTermOrigin();
});

function run(over: Partial<HeaderRelationsArgs> = {}, fake = fakeHost()) {
  const qc = newClient();
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Wrap, { host: fake.host, qc, children });
  const hook = renderHook((a: HeaderRelationsArgs) => useHeaderRelations(a), { wrapper, initialProps: { ...ARGS, ...over } });
  return { ...hook, fake, qc };
}

describe("exports", () => {
  test("the vocabulary names are the catalogue unit's own (re-exported, not copied)", () => {
    expect(USER_VOCAB_KEY).toBe(CATALOGUE_KEY);
    expect(USER_VOCAB_KEY).toEqual(["s5c-user-link-plane"]);
    expect(VocabUnreadableError).toBe(CatalogueError);
    expect(readHeaderVocab).toBe(catalogueRead);
  });
  test("predicateCurieKey is the key the app shares", () => {
    expect(predicateCurieKey("base:e/term-1")).toEqual(["s5c-predicate-curie", "base:e/term-1"]);
  });
});

describe("'+ Relation' is offered under the body's '+ Kind' rule", () => {
  test.each([
    ["a writer in the signed-in holder's own vault", {}, true],
    ["own vault named with trailing slashes", { vaultId: `${OWN}//` }, true],
    ["the reader (no edit)", { canEdit: false }, false],
    ["no signed-in principal", { principal: null }, false],
    ["a record with no address", { record: { ...REC, entityUri: null } }, false],
    ["a vault that is not the holder's own", { vaultId: "https://acme.example.test/vault" }, false],
    ["no vault", { vaultId: null }, false],
    ["no own vault known", { ownVaultId: null }, false],
    ["neither the vault nor the own vault known (two empty ids are not the same vault)", { vaultId: null, ownVaultId: null }, false],
  ] as const)("%s: canAdd %s", (_name, over, expected) => {
    const { result } = run(over as Partial<HeaderRelationsArgs>);
    expect(result.current.canAdd).toBe(expected);
  });
});

describe("host.useContactLabels (a hook, called every render)", () => {
  test("called with the record's address as subject, the vault, the type, and the vault as the target of a kind", () => {
    const { fake } = run();
    expect(fake.state.labelsCalls.at(-1)).toEqual({
      vaultId: OWN,
      ownVaultId: OWN,
      subject: REC.entityUri,
      principal: ARGS.principal,
      typeUri: REC.typeUri,
      kindVault: { vaultId: OWN, entity: ENTITY, represents: "https://ontology.example.test/base/t/Person" },
      enabled: true,
      needOffers: false,
    });
  });
  test("a vault whose representation is not declared is passed as null, never guessed", () => {
    const { fake } = run({ vaultRepresents: undefined });
    expect(fake.state.labelsCalls.at(-1)!.kindVault).toEqual({ vaultId: OWN, entity: ENTITY, represents: null });
    expect(run({ vaultRepresents: null }).fake.state.labelsCalls.at(-1)!.kindVault).toEqual({ vaultId: OWN, entity: ENTITY, represents: null });
  });
  test("no vault: no kind vault and the read is disabled; no record address: disabled", () => {
    expect(run({ vaultId: null }).fake.state.labelsCalls.at(-1)).toMatchObject({ kindVault: null, enabled: false, subject: REC.entityUri });
    expect(run({ record: { ...REC, entityUri: null } }).fake.state.labelsCalls.at(-1)).toMatchObject({ enabled: false, subject: "" });
  });
  test("the lists to add from are wanted only after the chooser is opened, and stay wanted when it is closed", () => {
    const { result, fake } = run();
    expect(result.current.chooserOpen).toBe(false);
    expect(fake.state.labelsCalls.every((c) => c.needOffers === false)).toBe(true);
    act(() => result.current.openChooser());
    expect(result.current.chooserOpen).toBe(true);
    expect(fake.state.labelsCalls.at(-1)!.needOffers).toBe(true);
    act(() => result.current.closeChooser());
    expect(result.current.chooserOpen).toBe(false);
    expect(fake.state.labelsCalls.at(-1)!.needOffers).toBe(true);
  });
  test("the state hands on the host's labels as they are", () => {
    const { result, fake } = run();
    expect(result.current.labels.add).toBe(fake.state.add);
  });
  test("it is called again on a new render (a hook is never skipped)", () => {
    const { rerender, fake } = run();
    const n = fake.state.labelsCalls.length;
    rerender({ ...ARGS, canEdit: false });
    expect(fake.state.labelsCalls.length).toBeGreaterThan(n);
  });
});

describe("host.useRelations (a hook)", () => {
  test("asked with the record's id and address", () => {
    const { fake } = run();
    expect(fake.state.relationsCalls.at(-1)).toEqual({ id: REC.id, at: REC.entityUri });
  });
  test("with no address it is asked with null", () => {
    const { fake } = run({ record: { ...REC, entityUri: null } });
    expect(fake.state.relationsCalls.at(-1)).toEqual({ id: REC.id, at: null });
  });
  test("with no kind and no stored edge nothing about the vocabulary is read", async () => {
    const { result, qc } = run();
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(result.current.relations).toEqual([]);
    expect(fetched.filter((u) => u.includes("/base/vocab"))).toEqual([]);
  });
  test("a stored edge asks for the vocabulary once, kept for the session (staleTime and gcTime Infinity, no retry)", async () => {
    const fake = fakeHost();
    fake.state.rows[REC.id] = [{ relation: "https://holder.example.test/base/r/r1", role: "role:source", type: "t:Customer", members: [{ member: REC.entityUri, role: "role:source" }, { member: ENTITY, role: "role:target" }] }];
    const { qc } = run({}, fake);
    await waitFor(() => expect(fetched.some((u) => u.includes("/base/vocab?status=all&linkPlane=user"))).toBe(true));
    const q = qc.getQueryCache().find({ queryKey: USER_VOCAB_KEY })!;
    const o = q.options as { staleTime?: unknown; gcTime?: unknown; retry?: unknown; refetchOnWindowFocus?: unknown };
    expect([o.staleTime, o.gcTime, o.retry, o.refetchOnWindowFocus]).toEqual([Infinity, Infinity, false, false]);
  });
  test("a kind with a predicate reads that term once, kept for the session, asked twice more on failure", async () => {
    const fake = fakeHost();
    fake.state.labels = { [REC.entityUri]: { chips: [{ key: "c", axis: "relationshipKind", entryId: "e1", label: "Customer", tone: "neutral", claimId: "x" }], preds: { e1: "base:e/term-1" } } };
    const { qc } = run({}, fake);
    await waitFor(() => expect(qc.getQueryCache().find({ queryKey: predicateCurieKey("base:e/term-1") })).toBeTruthy());
    const q = qc.getQueryCache().find({ queryKey: predicateCurieKey("base:e/term-1") })!;
    const o = q.options as { staleTime?: unknown; gcTime?: unknown; retry?: unknown; refetchOnWindowFocus?: unknown };
    expect([o.staleTime, o.gcTime, o.retry, o.refetchOnWindowFocus]).toEqual([Infinity, Infinity, 2, false]);
  });
  test("a chip of a kind that names no predicate reads no term", async () => {
    const fake = fakeHost();
    fake.state.labels = { [REC.entityUri]: { chips: [{ key: "c", axis: "relationshipKind", entryId: "e1", label: "Book club", tone: "neutral", claimId: "x" }], preds: { e1: null } } };
    const { qc } = run({}, fake);
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(fetched).toEqual([]);
  });
  test("a circle label is not a relation: its predicate is not read", async () => {
    const fake = fakeHost();
    fake.state.labels = { [REC.entityUri]: { chips: [{ key: "c", axis: "circleLabel", entryId: "e1", label: "Personal · 1st Connection", tone: "personal", claimId: "x" }], preds: { e1: "base:e/term-1" } } };
    const { qc } = run({}, fake);
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(fetched).toEqual([]);
  });
});
