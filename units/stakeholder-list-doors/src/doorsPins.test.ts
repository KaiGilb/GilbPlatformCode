// New. Every export of the doors pinned against a fake host: the type address and the records page, the names door, the held vaults, the
// doors' members and what each takes from the host (the request count, the freshness of a cached record), and the up-front read's use of
// the host's freshness.
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { isCredentialSurfaceError } from "@kaigilb/gilbplatformcode-credential-surface";
import { screenAnswerUntil, memberAnswers, recordReads, forgetLinkedRecords as forgetState } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import type { VaultRecordsPage } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  CredentialRefusedError,
  forgetLinkedRecords,
  heldVaultsOwnFirst,
  linkedRecordsOf,
  listedRecordsPage,
  masterTypeAddress,
  nameAnswerOf,
  stakeholderListDeps,
} from "./listDoors";
import { fakeDoorsHost, installPlatformHooks, ONTOLOGY, resp } from "../test/support";

installPlatformHooks();

const OWN = "https://ann.example.test/vault";
const OTHER = "https://ben.example.test/vault";
const ANN = `${OWN}/i`;
const vault = (vaultId: string, modes: string[] = ["read", "write"]) => ({ vaultId, label: vaultId, modes, isLandingVault: false, entity: null, represents: null }) as unknown as ReachableVault;

describe("masterTypeAddress", () => {
  it("reads the ontology origin at the moment it is called", () => {
    expect(masterTypeAddress("t:Person")).toBe(`${ONTOLOGY}/base/t/Person`);
    setTermOrigin("https://other-ontology.example.test");
    expect(masterTypeAddress("t:Person")).toBe("https://other-ontology.example.test/base/t/Person");
  });
  it("cuts a vault-host address to its name, decodes it, and gives null for nothing", () => {
    expect(masterTypeAddress("https://x.example.test/base/t/Software%20System")).toBe(`${ONTOLOGY}/base/t/Software System`);
    expect(masterTypeAddress(null)).toBeNull();
    expect(masterTypeAddress(undefined)).toBeNull();
    expect(masterTypeAddress("   ")).toBeNull();
    expect(masterTypeAddress("t:")).toBeNull();
    expect(masterTypeAddress("  Person  ")).toBe(`${ONTOLOGY}/base/t/Person`);
  });
});

describe("listedRecordsPage", () => {
  const rec = (id: string, over: Record<string, unknown> = {}) => ({ id, entityUri: `https://ann.example.test/base/e/${id}`, typeUri: "t:Person", label: id.toUpperCase(), updatedAt: 7, vaultId: OWN, ...over });
  it("gives a record its address, title, type and time, and a link only when the page carried the body", () => {
    const page = { records: [rec("a", { body: { sameAs: { "@id": "https://k.example.test/vault" } } }), rec("b", { label: null, updatedAt: 0 })], total: 2, complete: true, pageSize: 20, offset: 0, served: 2, nextOffset: null } as unknown as VaultRecordsPage;
    const listed = listedRecordsPage(page);
    expect(listed.records[0]).toEqual({ recordId: "https://ann.example.test/base/e/a", title: "A", type: `${ONTOLOGY}/base/t/Person`, link: { state: "linked", target: "https://k.example.test/vault" }, updatedAt: 7 });
    expect("link" in listed.records[1]!).toBe(false);
    expect(listed.records[1]).toMatchObject({ title: null, updatedAt: null });
  });
  it("names the next offset by nextOffset, else by the rows the door sent, else by the rows kept", () => {
    const base = { records: [rec("a")], total: 9, complete: false, pageSize: 20, offset: 10 } as unknown as VaultRecordsPage;
    expect(listedRecordsPage({ ...base, nextOffset: 15 } as VaultRecordsPage).next).toBe(15);
    expect(listedRecordsPage({ ...base, served: 4 } as VaultRecordsPage).next).toBe(14);
    expect(listedRecordsPage(base).next).toBe(11);
    expect(listedRecordsPage({ ...base, complete: true, nextOffset: 15 } as VaultRecordsPage).next).toBeNull();
  });
});

describe("nameAnswerOf and CredentialRefusedError", () => {
  it("carries the photo address only when the card has one", () => {
    const card = (photoUrl?: string | null) => ({ kind: "card", card: { principal: "x", fields: [{ predicate: "a:givenName", value: "Ann", rung: "r" }], skills: [], ...(photoUrl !== undefined ? { photoUrl } : {}) } }) as never;
    expect(nameAnswerOf(card())).toEqual({ kind: "name", name: "Ann" });
    expect(nameAnswerOf(card(null))).toEqual({ kind: "name", name: "Ann", photoUrl: null });
    expect(nameAnswerOf(card("https://p.example.test/x"))).toEqual({ kind: "name", name: "Ann", photoUrl: "https://p.example.test/x" });
  });
  it("only a 401 is a sign-in failure; any other status is an unavailable name", () => {
    expect(nameAnswerOf({ kind: "unavailable", status: 500 })).toEqual({ kind: "unavailable" });
    expect(nameAnswerOf({ kind: "unavailable", status: 403 })).toEqual({ kind: "unavailable" });
    expect(() => nameAnswerOf({ kind: "unavailable", status: 401 })).toThrow(CredentialRefusedError);
  });
  it("the error is named, is an Error, says what failed, and is a credential error to the reader", () => {
    const e = new CredentialRefusedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CredentialRefusedError");
    expect(e.message).toBe("The platform did not accept this sign-in for the names of the people you placed.");
    expect(isCredentialSurfaceError(e)).toBe(true);
  });
});

describe("heldVaultsOwnFirst", () => {
  it("puts the own vault first only when it is held; with no own vault, or one not held, the order is the held order", () => {
    const vs = [vault(OTHER), vault(OWN)];
    expect(heldVaultsOwnFirst(vs, OWN)).toEqual([OWN, OTHER]);
    expect(heldVaultsOwnFirst(vs, null)).toEqual([OTHER, OWN]);
    expect(heldVaultsOwnFirst(vs, "https://not-held.example.test/vault")).toEqual([OTHER, OWN]);
  });
  it("leaves out a vault the person cannot read", () => {
    expect(heldVaultsOwnFirst([vault(OTHER, []), vault(OWN)], OWN)).toEqual([OWN]);
  });
});

describe("stakeholderListDeps: the members that are not the reader's own", () => {
  const args = { qc: new QueryClient(), holder: ANN, vaults: [OWN, OTHER], ownVaultId: OWN, typeNames: ["Person"], ownCardIds: ["c1"] };
  it("is pure construction: nothing is requested, and the lists it was given are copied", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const vaults = [OWN, OTHER];
    const ownCardIds = ["c1"];
    const deps = stakeholderListDeps(fakeDoorsHost(), { ...args, vaults, ownCardIds });
    vaults.push("x");
    ownCardIds.push("c2");
    expect(deps.vaults).toEqual([OWN, OTHER]);
    expect(deps.ownCardIds).toEqual(["c1"]);
    expect(deps.holder).toBe(ANN);
    expect(deps.holderVault).toBe(OWN);
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("names no holder vault when there is no own vault, and then the connections cannot be read", async () => {
    const deps = stakeholderListDeps(fakeDoorsHost(), { ...args, ownVaultId: null });
    expect("holderVault" in deps).toBe(false);
    await expect(deps.connections()).rejects.toThrow("your own vault is not known");
  });
  it("requestsSoFar is the host's count less the count at the screen's start, read each time it is asked", () => {
    let sent = 10;
    const host = fakeDoorsHost({ requestsSent: () => sent });
    const deps = stakeholderListDeps(host, { ...args, screenStartedAt: 4 });
    expect(deps.requestsSoFar!()).toBe(6);
    sent = 25;
    expect(deps.requestsSoFar!()).toBe(21);
    expect(stakeholderListDeps(host, args).requestsSoFar!()).toBe(25);
  });
  it("listRecords from the screen's pages sends no request, answers the first page only, and an empty page for a vault not loaded", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const page = { records: [{ recordId: "https://ann.example.test/base/e/r1", title: "R1", type: null, updatedAt: null }], next: null };
    const deps = stakeholderListDeps(fakeDoorsHost(), { ...args, screenPages: (v: string) => (v === OWN ? page : null) });
    expect(await deps.listRecords(OWN, 0, 5)).toBe(page);
    expect(await deps.listRecords(OWN, 20, 5)).toEqual({ records: [], next: null });
    expect(await deps.listRecords(OTHER, 0, 5)).toEqual({ records: [], next: null });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("readLink reads the whole record and reads the link in its served document", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(new URL(url).pathname).toContain("/lws/r/r9");
      return resp(200, { "@id": "https://ann.example.test/base/e/r9", "@type": "t:Person", name: "N", sameAs: { "@id": "https://k.example.test/vault" } });
    });
    const deps = stakeholderListDeps(fakeDoorsHost(), args);
    expect(await deps.readLink("https://ann.example.test/base/e/r9")).toEqual({ state: "linked", target: "https://k.example.test/vault" });
    vi.unstubAllGlobals();
  });
  it("the canonicaliser is the holder's one, kept for the session", () => {
    const a = stakeholderListDeps(fakeDoorsHost(), args).canonical;
    const b = stakeholderListDeps(fakeDoorsHost(), args).canonical;
    expect(a).toBe(b);
  });
});

describe("linkedRecordsOf: the host's freshness of a cached record", () => {
  const MEMBER = "https://k.example.test/vault";
  const screen = (readAt: number) => ({ screenLinks: () => ({ byPerson: new Map([[MEMBER, ["https://ann.example.test/base/e/r1"]]]), partial: new Set<string>(), readAt }), held: () => null });
  function untilAfter(freshMs: number, readAt: number) {
    forgetState();
    vi.stubGlobal("fetch", async () => resp(404, {}));
    return linkedRecordsOf(fakeDoorsHost({ heldRecordFreshMs: freshMs }), ANN, [OWN], [MEMBER], undefined, undefined, screen(readAt)).then(() => {
      const times = [...screenAnswerUntil.values()];
      vi.unstubAllGlobals();
      return times;
    });
  }
  it("an answer the screen gave lapses the host's freshness after the list's read", async () => {
    expect(await untilAfter(1000, 500)).toEqual([1500]);
    expect(await untilAfter(40, 500)).toEqual([540]);
  });
  it("keeps the member's answer and the record's read in the shared state", async () => {
    await untilAfter(1000, 500);
    expect(memberAnswers.size).toBe(1);
    expect(recordReads.size).toBe(1);
  });
  it("forgetLinkedRecords is the state's sign-out reset", async () => {
    await untilAfter(1000, 500);
    forgetLinkedRecords();
    expect(memberAnswers.size).toBe(0);
    expect(screenAnswerUntil.size).toBe(0);
  });
});
