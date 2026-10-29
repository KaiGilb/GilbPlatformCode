// The names door gives the photo address that comes with the name (the card's own `photoUrl`, read in the same `public-card` request: 0
// requests more), and the reader's records come from the pages the grid already loaded, with their links.
import { describe, expect, it } from "vitest";
import { nameAnswerOf } from "./listDoors";

const card = (photoUrl: string | null) =>
  ({ kind: "card", card: { principal: "x", fields: [{ predicate: "a:givenName", value: "Ben", rung: "r" }, { predicate: "a:familyName", value: "Cora", rung: "r" }], skills: [], photoUrl } }) as never;

describe("nameAnswerOf carries the card's photo address", () => {
  it("a card that shares a photo: its address with the name", () => {
    expect(nameAnswerOf(card("https://example.test/base/connect/profile-photo?principal=x"))).toEqual({ kind: "name", name: "Ben Cora", photoUrl: "https://example.test/base/connect/profile-photo?principal=x" });
  });
  it("a card that shares none: null (the row keeps the kind picture, and asks for no photo)", () => {
    expect(nameAnswerOf(card(null))).toEqual({ kind: "name", name: "Ben Cora", photoUrl: null });
  });
});

// ── the reader's records come from the pages the grid already loaded, with their links ──────
import { afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


describe("the reader's records door answers from the screen's own pages", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("listRecords sends no request and gives the screen's records, each with its link; a vault the screen did not load is empty", async () => {
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      sent.push(String(u));
      return new Response("{}", { status: 404 });
    });
    const rec = { recordId: "https://dan.example.test/vault/e/k0", title: "K0", type: "https://ontology.example.test/base/t/Person", link: { state: "linked" as const, target: "https://ben.example.test/vault" } };
    const deps = stakeholderListDeps(doorsHost, {
      qc: new QueryClient(),
      holder: "https://dan.example.test/vault",
      vaults: ["https://dan.example.test/vault", "https://team.example.test/vault"],
      ownVaultId: "https://dan.example.test/vault",
      typeNames: ["Person"],
      ownCardIds: [],
      screenPages: (v) => (v === "https://dan.example.test/vault" ? { records: [rec], next: null } : null),
    });
    expect(await deps.listRecords("https://dan.example.test/vault", 0, 20)).toEqual({ records: [rec], next: null });
    expect(await deps.listRecords("https://team.example.test/vault", 0, 20)).toEqual({ records: [], next: null });
    expect(await deps.listRecords("https://dan.example.test/vault", 20, 20)).toEqual({ records: [], next: null });
    expect(sent).toEqual([]);
  });
});
