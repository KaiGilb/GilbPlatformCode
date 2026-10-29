// The relation chips in the stakeholder header (the shared ContactHeader), wired to the real reads.
// Measured here: the chips' words are the GilbVeda terms' labels from the vocabulary route (a live master's answer as the fixture);
// the vocabulary is read ONCE for the session (not per card); each predicate's term once; "+ Relation" is last and opens the card's EXISTING
// "+ Kind" chooser and its existing write; no "+ Relation" where the body would offer no "+ Kind".
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { ContactChip } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __setCatalogForTest } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import fixture from "../test/relationsMaster.json";
import { fakeHost, newClient, OWN, OTHER, vaultOf, Wrap } from "../test/fakeHost";
import { StakeholderContactHeader } from "./StakeholderContactHeader";

const ONTOLOGY = "https://ontology.example.test";
type Doc = Record<string, unknown>;
const ENTRIES = fixture.entries as Record<string, Doc>;
const TERMS = fixture.terms as Record<string, Doc>;
const GRAPH = fixture.vocab["@graph"] as Doc[];
const entry = (word: string) => Object.values(ENTRIES).find((e) => e["label"] === word)!;
const refOf = (e: Doc) => (e["kindPredicate"] as { "@id": string } | undefined)?.["@id"] ?? null;
const labelOfCurie = (curie: string) => String(GRAPH.find((t) => t["a:typeAttribute"] === curie)!["a:label"]);
const curieOfWord = (word: string) => String(TERMS[refOf(entry(word))!.replace("base:e/", `${ONTOLOGY}/base/e/`)]!["typeAttribute"]);

const VAULT: ReachableVault = vaultOf();
const OTHER_VAULT: ReachableVault = vaultOf({ vaultId: OTHER, entity: "https://acme.example.test/base/e/vault-acme", name: "Acme AS", isLandingVault: false });
const rec = (n: string) => ({ id: `06gkrec${n}`, entityUri: `https://holder.example.test/base/e/06gkrec${n}`, typeUri: `${ONTOLOGY}/base/t/Person` });
const ANN = rec("ann");
const BEN = rec("ben");
const OWN_KIND = "https://holder.example.test/base/e/own-kind-book-club";
const chip = (entryId: string, label: string): ContactChip => ({ key: `c-${entryId}`, axis: "relationshipKind", entryId, label, tone: "neutral", claimId: `claim-${entryId}` });

let fetches: string[];
let vocabStatus: number;
let fake: ReturnType<typeof fakeHost>;
beforeEach(() => {
  setBaseOrigin("https://base.example.test");
  setTermOrigin(ONTOLOGY);
  __setCatalogForTest(null);
  __resetCatalogueCache();
  fetches = [];
  vocabStatus = 200;
  fake = fakeHost();
  fake.state.origin = { origin: "Madrid Conference, 2026", loading: false };
  fake.state.offered = { circleLabel: [], relationshipKind: [{ id: String(entry("Customer")["@id"]), label: "Customer", order: 1, playableBy: [], axis: "relationshipKind", own: false }] };
  const customer = entry("Customer");
  const colleague = entry("Colleague");
  fake.state.labels = {
    [ANN.entityUri]: {
      chips: [chip(String(colleague["@id"]), "Colleague"), chip(String(customer["@id"]), "Customer"), chip(OWN_KIND, "Book club")],
      preds: { [String(colleague["@id"])]: refOf(colleague), [String(customer["@id"])]: refOf(customer), [OWN_KIND]: null },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: RequestInfo | URL) => {
      const url = String(u);
      fetches.push(url);
      if (/\/base\/vocab\?status=all&linkPlane=user$/.test(url)) return new Response(JSON.stringify(fixture.vocab), { status: vocabStatus });
      const m = /\/base\/e\/([^/?#]+)$/.exec(url);
      const doc = m ? TERMS[`${ONTOLOGY}/base/e/${m[1]}`] : undefined;
      return doc ? new Response(JSON.stringify(doc), { status: 200 }) : new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBaseOrigin();
  resetTermOrigin();
});

function draw(qc: QueryClient, over: { record?: typeof ANN; vault?: ReachableVault; canEdit?: boolean } = {}) {
  const record = over.record ?? ANN;
  return render(
    <Wrap host={fake.host} qc={qc}>
      <StakeholderContactHeader
        key={record.id}
        holderVault={over.vault ?? VAULT}
        ownVaultId={OWN}
        viewer="https://id.example.test/base/p/holder"
        principal="https://id.example.test/base/p/holder"
        canEdit={over.canEdit ?? true}
        record={record}
        ownName={record === ANN ? "Ann Larsen" : "Ben Moreno"}
        kind={{ kind: record.typeUri, ancestors: [] }}
        kindLabel="Person"
        personCard={null}
        onlineCard={null}
        ownPicture={null}
      />
    </Wrap>,
  );
}
const texts = () => screen.queryAllByTestId("contact-header-relation").map((c) => [c.textContent, c.getAttribute("data-kind")]);
const vocabReads = () => fetches.filter((u) => u.includes("/base/vocab?")).length;

describe("the relation chips in the header", () => {
  test("two kinds mapped to predicates and one own label: the GilbVeda labels from the vocabulary route, the own label dashed, '+ Relation' last", async () => {
    draw(newClient());
    await waitFor(() => expect(texts()).toHaveLength(3));
    expect(texts()).toEqual([
      [labelOfCurie(curieOfWord("Colleague")), "predicate"],
      [labelOfCurie(curieOfWord("Customer")), "predicate"],
      ["Book club", "own"],
    ]);
    const box = screen.getByTestId("contact-header-relations");
    expect(box.lastElementChild!.textContent).toBe("+ Relation");
    expect(screen.getAllByTestId("contact-header-relation")[1]!.getAttribute("title")).toBe(
      `Ann Larsen ${labelOfCurie(curieOfWord("Customer"))} Cy Holder · GilbVeda ${curieOfWord("Customer")} · private, grants nothing`,
    );
  });
  test("the holder name is the self card's name, the same name the dialog and the graph use", async () => {
    vi.mocked(fake.host.discoverVaultProfilePhoto).mockResolvedValue({ photoRef: null, personName: "Dee Owner" });
    try {
      draw(newClient());
      await waitFor(() => expect(screen.getByTestId("contact-header-holder-name").textContent).toContain("Dee Owner"));
      expect(screen.getByTestId("contact-header-holder-name").textContent).toContain("Me");
      expect(screen.getByTestId("contact-header-holder-name").textContent).not.toContain("Cy Holder");
      await waitFor(() => expect(texts()).toHaveLength(3));
      expect(screen.getAllByTestId("contact-header-relation")[1]!.getAttribute("title")).toContain("Dee Owner");
      expect(screen.getAllByTestId("contact-header-relation")[1]!.getAttribute("title")).not.toContain("Cy Holder");
    } finally {
      vi.mocked(fake.host.discoverVaultProfilePhoto).mockResolvedValue({ photoRef: null });
    }
  });
  test("a person with none: no relation chip, just '+ Relation'; no vocabulary read for her", async () => {
    draw(newClient(), { record: BEN });
    await waitFor(() => expect(screen.getByTestId("contact-header-add-relation")).toBeTruthy());
    expect(texts()).toEqual([]);
    expect(vocabReads()).toBe(0);
  });
  test("the vocabulary is read ONCE for the session, not per card; each predicate's term once", async () => {
    const qc = newClient();
    const first = draw(qc);
    await waitFor(() => expect(texts()).toHaveLength(3));
    first.unmount();
    // the vocabulary module's own 60 s cache has run out (as it does on a long session): the SESSION cache must still hold
    __setCatalogForTest(null);
    draw(qc, { record: BEN });
    await waitFor(() => expect(screen.getByTestId("contact-header-add-relation")).toBeTruthy());
    cleanup();
    draw(qc);
    await waitFor(() => expect(texts()).toHaveLength(3));
    expect(vocabReads()).toBe(1);
    for (const w of ["Customer", "Colleague"]) expect(fetches.filter((u) => u.endsWith(refOf(entry(w))!.replace("base:e/", "/e/")))).toHaveLength(1);
  });
  test("the vocabulary cannot be read: the terms' names (CURIEs), never a made-up word; the failure is not kept", async () => {
    vocabStatus = 500;
    const qc = newClient();
    draw(qc);
    await waitFor(() => expect(texts()).toHaveLength(3));
    expect(texts()).toEqual([
      [curieOfWord("Colleague"), "term-name"],
      [curieOfWord("Customer"), "term-name"],
      ["Book club", "own"],
    ]);
    expect(qc.getQueryState(["s5c-user-link-plane"])?.status).toBe("error");
  });
  test("a relation edge already stored (contact customer-of the vault, and a friend-of from the vault's side) shows, ONE chip per predicate", async () => {
    const customer = curieOfWord("Customer");
    const friend = curieOfWord("Friend");
    const m = (s: string, t: string) => [
      { member: s, role: "role:source" },
      { member: t, role: "role:target" },
    ];
    fake.state.rows[ANN.id] = [
      { relation: "https://holder.example.test/base/r/r1", role: "role:source", type: customer, members: m(ANN.entityUri, VAULT.entity!) },
      { relation: "https://holder.example.test/base/r/r2", role: "role:target", type: friend, members: m(VAULT.entity!, ANN.entityUri) },
    ];
    draw(newClient());
    await waitFor(() => expect(texts()).toHaveLength(4));
    expect(texts().map((t) => t[0])).toEqual([labelOfCurie(curieOfWord("Colleague")), labelOfCurie(customer), "Book club", labelOfCurie(friend)]);
  });
});

describe("'+ Relation' opens the card's existing '+ Kind' add flow", () => {
  test("it opens the 'Kind of contact' chooser (the card body's), asks for its lists, and a pick goes through the existing add", async () => {
    draw(newClient());
    await waitFor(() => expect(screen.getByTestId("contact-header-add-relation")).toBeTruthy());
    expect(fake.state.labelsCalls.every((c) => !c.needOffers)).toBe(true);
    fireEvent.click(screen.getByTestId("contact-header-add-relation"));
    const dlg = await screen.findByTestId("contact-kind-chooser");
    expect(dlg.getAttribute("aria-label")).toBe("Add a kind of contact");
    expect(fake.state.labelsCalls.at(-1)!.needOffers).toBe(true);
    fireEvent.click(screen.getAllByTestId("contact-kind-option")[0]!);
    expect(fake.state.add).toHaveBeenCalledTimes(1);
    expect(fake.state.add.mock.calls[0]![0]).toMatchObject({ id: String(entry("Customer")["@id"]) });
    await waitFor(() => expect(screen.queryByTestId("contact-kind-chooser")).toBeNull());
  });
  test("no '+ Relation' where the body offers no '+ Kind': a reader (no edit), or a record held in another vault (relations still shown)", async () => {
    draw(newClient(), { canEdit: false });
    await waitFor(() => expect(texts()).toHaveLength(3));
    expect(screen.queryByTestId("contact-header-add-relation")).toBeNull();
    cleanup();
    draw(newClient(), { vault: OTHER_VAULT });
    await waitFor(() => expect(texts()).toHaveLength(3));
    expect(screen.queryByTestId("contact-header-add-relation")).toBeNull();
  });
});
