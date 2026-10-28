// @vitest-environment jsdom
// Who already requires a record: the type of each Authority comes from the open vault's list first and from one read each otherwise, and
// the person Authorities are those whose type the master places under Person. Pending or error means the caller does not yet know.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { useAuthorityTypes, usePersonAuthorities } from "./useConstraintPeople";
import { RIG } from "../test/masterFixture";
import { HOST, VAULT, authorityRow, installWire } from "../test/wire";
import { setUp, tearDown } from "../test/support";

const hoisted = vi.hoisted(() => ({ rows: [] as { id: string; entityUri?: string; typeUri?: string }[], asked: [] as unknown[] }));
vi.mock("@kaigilb/gilbplatformcode-plan-record-hooks", () => ({
  useRecords: (vaultId: unknown) => {
    hoisted.asked.push(vaultId);
    return { data: hoisted.rows };
  },
}));

beforeEach(() => {
  setUp();
  setTermOrigin(RIG);
  forgetStakeholderKindReaders();
  // A fresh device store each test: a kind set kept by an earlier test would answer at once and the held master would not be waited for.
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) });
  hoisted.rows = [];
  hoisted.asked = [];
});
afterEach(() => {
  forgetStakeholderKindReaders();
  vi.unstubAllGlobals();
  tearDown();
});

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const ANN = `${HOST}/vault/e/ann`;
const BOB = `${HOST}/vault/e/bob`;
const ORG = `${HOST}/vault/e/org`;

describe("useAuthorityTypes", () => {
  it("asks the list of the open vault, and of no vault for an empty id", () => {
    installWire();
    renderHook(() => useAuthorityTypes(VAULT, []), { wrapper: wrapper(client()) });
    renderHook(() => useAuthorityTypes("", []), { wrapper: wrapper(client()) });
    expect(hoisted.asked).toContain(VAULT);
    expect(hoisted.asked).toContain(null);
  });

  it("takes the type of a listed record by address, by id, or by the tail of the address, and reads nothing", async () => {
    const wire = installWire();
    hoisted.rows = [
      { id: "x1", entityUri: ANN, typeUri: "t:Person" },
      { id: "bob", typeUri: "t:Organization" },
      { id: "untyped", entityUri: ORG },
    ];
    const uris = [ANN, BOB, "bob"];
    const { result } = renderHook(() => useAuthorityTypes(VAULT, uris), { wrapper: wrapper(client()) });
    expect(result.current.typeOf(ANN)).toBe("t:Person");
    expect(result.current.typeOf(BOB)).toBe("t:Organization");
    expect(result.current.typeOf("bob")).toBe("t:Organization");
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(wire.reads).toEqual([]);
  });

  it("takes a listed type for an address however it is spelled, and from a later row when an earlier one has no type", async () => {
    const wire = installWire();
    hoisted.rows = [
      { id: "ann", entityUri: ANN },
      { id: "ann", entityUri: ANN, typeUri: "t:Person" },
      { id: "x2", entityUri: `${BOB}?v=1`, typeUri: "t:Organization" },
    ];
    const { result } = renderHook(() => useAuthorityTypes(VAULT, [ANN, `${ANN}?q=1`, BOB]), { wrapper: wrapper(client()) });
    expect(result.current.typeOf(ANN)).toBe("t:Person");
    expect(result.current.typeOf(`${ANN}?q=1`)).toBe("t:Person");
    expect(result.current.typeOf(BOB)).toBe("t:Organization");
    expect(result.current.pending).toBe(false);
    expect(wire.reads).toEqual([]);
  });

  it("runs no read of its own when nothing is missing", async () => {
    installWire();
    hoisted.rows = [{ id: "ann", entityUri: ANN, typeUri: "t:Person" }];
    const qc = client();
    renderHook(() => useAuthorityTypes(VAULT, [ANN]), { wrapper: wrapper(qc) });
    await new Promise((r) => setTimeout(r, 30));
    const query = qc.getQueryCache().find({ queryKey: ["plan", "stakeholder-type", VAULT, ""] });
    expect([query?.state.fetchStatus, query?.state.dataUpdateCount, query?.state.errorUpdateCount]).toEqual(["idle", 0, 0]);
  });

  it("reads each record the list does not hold, once, and is pending until they are in", async () => {
    const wire = installWire();
    hoisted.rows = [{ id: "ann", entityUri: ANN, typeUri: "t:Person" }];
    wire.setRecord("bob", { "@id": BOB, "@type": "t:Organization", "a:name": "Bob" });
    wire.setRecord("org", { "@id": ORG, "@type": "t:Person", "a:name": "Org" });
    const uris = [ANN, BOB, ORG];
    const { result } = renderHook(() => useAuthorityTypes(VAULT, uris), { wrapper: wrapper(client()) });
    expect(result.current.pending).toBe(true);
    expect(result.current.typeOf(BOB)).toBeNull();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(wire.reads).toHaveLength(2);
    expect(result.current.typeOf(ANN)).toBe("t:Person");
    expect(result.current.typeOf(BOB)).toMatch(/\/Organization$/);
    expect(result.current.typeOf(ORG)).toMatch(/\/Person$/);
    expect(result.current.typeOf(`${HOST}/vault/e/nobody`)).toBeNull();
  });

  it("treats a record that cannot be read as having no known type, not as an error", async () => {
    const wire = installWire();
    wire.setRecord("bob", 500);
    const { result } = renderHook(() => useAuthorityTypes(VAULT, [BOB]), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.typeOf(BOB)).toBeNull();
    expect(result.current.error).toBe(false);
  });

  it("keeps a read of the missing types for thirty seconds", async () => {
    const wire = installWire();
    wire.setRecord("bob", { "@id": BOB, "@type": "t:Person" });
    const qc = client();
    const { result } = renderHook(() => useAuthorityTypes(VAULT, [BOB]), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const query = qc.getQueryCache().find({ queryKey: ["plan", "stakeholder-type", VAULT, BOB] })!;
    expect(query.observers[0]!.options.staleTime).toBe(30_000);
  });

  it("is not pending when nothing is missing, though the disabled query has not run", () => {
    installWire();
    const { result } = renderHook(() => useAuthorityTypes(VAULT, []), { wrapper: wrapper(client()) });
    expect(result.current.pending).toBe(false);
  });

  it("keeps the missing reads under one key per vault and set of addresses, in sorted order", async () => {
    const wire = installWire();
    wire.setRecord("bob", { "@id": BOB, "@type": "t:Person" });
    wire.setRecord("org", { "@id": ORG, "@type": "t:Person" });
    const qc = client();
    const { result } = renderHook(() => useAuthorityTypes(VAULT, [ORG, BOB]), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const kept = qc.getQueryData<Record<string, string>>(["plan", "stakeholder-type", VAULT, [BOB, ORG].join("\n")]);
    expect(Object.keys(kept!)).toEqual([BOB, ORG]);
    expect(kept![BOB]).toMatch(/\/Person$/);
  });
});

describe("usePersonAuthorities", () => {
  const record = { id: "fn1", entityUri: `${HOST}/vault/e/fn1` };

  it("answers the Authorities whose type the master places under Person, and no other relation", async () => {
    const wire = installWire();
    wire.setRelations("fn1", [
      authorityRow(`${HOST}/vault/r/a1`, ANN),
      authorityRow(`${HOST}/vault/r/a2`, BOB),
      authorityRow(`${HOST}/vault/r/a3`, ORG),
      authorityRow(`${HOST}/vault/r/s1`, `${HOST}/vault/e/plain`, "t:StakeholderOf"),
    ]);
    hoisted.rows = [
      { id: "ann", entityUri: ANN, typeUri: "t:Person" },
      { id: "bob", entityUri: BOB, typeUri: "t:Passenger" },
      { id: "org", entityUri: ORG, typeUri: "t:Organization" },
      { id: "plain", entityUri: `${HOST}/vault/e/plain`, typeUri: "t:Person" },
    ];
    const { result } = renderHook(() => usePersonAuthorities(record, VAULT), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.people.map((p) => p.uri)).toEqual([ANN, BOB]);
    expect(result.current.error).toBe(false);
    expect(wire.relationReads).toHaveLength(1);
    expect(wire.relationReads[0]!.startsWith(HOST)).toBe(true);
  });

  it("is pending, with no one yet, until the relations, the kinds and the types are in", async () => {
    const wire = installWire();
    wire.setRelations("fn1", [authorityRow(`${HOST}/vault/r/a1`, BOB)]);
    hoisted.rows = [{ id: "bob", entityUri: BOB, typeUri: "t:Passenger" }];
    const { result } = renderHook(() => usePersonAuthorities(record, VAULT), { wrapper: wrapper(client()) });
    expect(result.current.pending).toBe(true);
    expect(result.current.people).toEqual([]);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.people).toHaveLength(1);
    expect(wire.master.requested.length).toBeGreaterThan(0);
  });

  it("looks up the type of an Authority only, never of a plain stakeholder", async () => {
    const wire = installWire();
    wire.setRelations("fn1", [authorityRow(`${HOST}/vault/r/a1`, ANN), authorityRow(`${HOST}/vault/r/s1`, `${HOST}/vault/e/plain`, "t:StakeholderOf")]);
    wire.setRecord("ann", { "@id": ANN, "@type": "t:Person" });
    wire.setRecord("plain", { "@id": `${HOST}/vault/e/plain`, "@type": "t:Person" });
    const { result } = renderHook(() => usePersonAuthorities(record, VAULT), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(wire.reads.map((u) => u.split("/lws/r/")[1])).toEqual(["ann"]);
  });

  it.each([
    ["the relations", "relations"],
    ["the kinds", "master"],
    ["the types", "records"],
  ] as const)("is still pending when only %s are out", async (_name, kind) => {
    const wire = installWire();
    wire.setRelations("fn1", [authorityRow(`${HOST}/vault/r/a1`, BOB)]);
    wire.setRecord("bob", { "@id": BOB, "@type": "t:Passenger" });
    const release = wire.hold(kind);
    const { result } = renderHook(() => usePersonAuthorities(record, VAULT), { wrapper: wrapper(client()) });
    // Wait for each read that is not held to have been made, then assert while the held one is still out.
    if (kind !== "relations") await waitFor(() => expect(wire.relationReads.length).toBeGreaterThan(0));
    if (kind !== "master") await waitFor(() => expect(wire.master.requested.length).toBeGreaterThan(0));
    if (kind === "master") await waitFor(() => expect(wire.reads.length).toBeGreaterThan(0));
    expect(result.current.pending).toBe(true);
    release();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.people.map((p) => p.uri)).toEqual([BOB]);
  });

  it("is an error when the relations cannot be read", async () => {
    const wire = installWire();
    wire.setRelations("fn1", 500);
    const { result } = renderHook(() => usePersonAuthorities(record, VAULT), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.people).toEqual([]);
  });

  it("names no person when the record has no address and no Authority", async () => {
    installWire();
    const { result } = renderHook(() => usePersonAuthorities({ id: "fn1" }, VAULT), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.people).toEqual([]);
  });
});
