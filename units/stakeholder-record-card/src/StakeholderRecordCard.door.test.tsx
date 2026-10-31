// The record's door: the vault that holds it. The read is addressed there; with no door the card does not read, and says so (it never asks the base address).
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RecordDetail, ShellContext, BASE } from "../test/app";
import { P, Q, cardWorld, newQc, personRecord, putList, shellOf, type CardWorld } from "../test/cardWorld";

const ready = () => waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });

/** The card for `id`, the shell selecting it, with the vault asked for (or not) as the prop. */
function mountFor(qc: QueryClient, id: string, _vaultId: string | null | undefined, shellOver: Parameters<typeof shellOf>[1] = {}) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shellOf({ id }, shellOver)}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>,
  );
}

const readsOf = (w: CardWorld, id: string) => w.platform.requests.filter((r) => r.method === "GET" && r.path.endsWith(`/lws/r/${id}`));

describe("the door", () => {
  it("reads the record at the node of the vault it is given, not at the base address", async () => {
    const w = cardWorld();
    const iri = w.platform.seed(Q, "t:Person", { "a:name": "Ann Door", "a:givenName": "Ann", "a:familyName": "Door" });
    const id = iri.slice(iri.lastIndexOf("/") + 1);
    mountFor(newQc(), id, Q, { readVaultId: Q });
    await screen.findByTestId("record-detail");
    expect(readsOf(w, id).length).toBeGreaterThan(0);
    expect(w.other.filter((u) => u.startsWith(`GET ${BASE}/`) && u.includes("/lws/r/"))).toEqual([]);
  });

  it("with no door at all it does not read, says which vault is not known, and sends no request for the record", async () => {
    const w = cardWorld();
    mountFor(newQc(), "unknown-card", null, { readVaultId: "" });
    expect(await screen.findByText("Which vault holds this card is not known, so it was not read.")).toBeTruthy();
    expect(screen.getByTestId("stakeholder-record-card-no-door")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 60));
    expect(w.platform.requests.filter((r) => r.path.includes("unknown-card"))).toEqual([]);
    expect(w.other.filter((u) => u.includes("unknown-card"))).toEqual([]);
    expect(screen.queryByText("Loading record…")).toBeNull();
  });

  it("falls back to the vault a create wrote the record into when no door is given", async () => {
    const w = cardWorld();
    const iri = w.platform.seed(Q, "t:Person", { "a:name": "Bea Made", "a:givenName": "Bea", "a:familyName": "Made" });
    const id = iri.slice(iri.lastIndexOf("/") + 1);
    const qc = newQc();
    qc.setQueryData(["created-in-vault", id], Q);
    mountFor(qc, id, undefined, { readVaultId: "" });
    await screen.findByTestId("record-detail");
    expect(readsOf(w, id).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("stakeholder-record-card-no-door")).toBeNull();
  });

  it("an address the caches know for the record (a create wrote it into Q) decides over the vault the host names", async () => {
    const w = cardWorld();
    const iri = w.platform.seed(Q, "t:Person", { "a:name": "Cy Given", "a:givenName": "Cy", "a:familyName": "Given" });
    const id = iri.slice(iri.lastIndexOf("/") + 1);
    const qc = newQc();
    qc.setQueryData(["created-in-vault", id], Q);
    mountFor(qc, id, "https://elsewhere.gilb.test/vault", { readVaultId: "https://elsewhere.gilb.test/vault" });
    await screen.findByTestId("record-detail");
    expect(readsOf(w, id).length).toBeGreaterThan(0);
    expect(w.other.filter((u) => u.includes("elsewhere.gilb.test"))).toEqual([]);
  });

  it("with no door given, a cached copy of the record that names its own address is read there", async () => {
    const w = cardWorld();
    const iri = w.platform.seed(Q, "t:Person", { "a:name": "Eve Cached", "a:givenName": "Eve", "a:familyName": "Cached" });
    const id = iri.slice(iri.lastIndexOf("/") + 1);
    const qc = newQc();
    const rec = personRecord(id, { givenName: "Eve", familyName: "Cached" }, { entityUri: `${new URL(Q).origin}/base/e/${id}` });
    qc.setQueryData(["base", "record", id, new URL(Q).origin], rec);
    mountFor(qc, id, undefined, { readVaultId: "" });
    await screen.findByTestId("record-detail");
    expect(screen.queryByTestId("stakeholder-record-card-no-door")).toBeNull();
  });

  it("with no door given, the vault a create wrote into is where the list is looked in: the listed record is drawn with no read", async () => {
    const w = cardWorld();
    const rec = personRecord("made", { givenName: "Fay", familyName: "Made" });
    const qc = newQc();
    putList(qc, Q, [rec]);
    qc.setQueryData(["created-in-vault", "made"], Q);
    mountFor(qc, "made", undefined, { readVaultId: "" });
    await screen.findByTestId("record-detail");
    await new Promise((r) => setTimeout(r, 60));
    expect(readsOf(w, "made")).toEqual([]);
    expect(w.other.filter((u) => u.includes("/lws/r/made"))).toEqual([]);
  });

  it("a record the list already holds is drawn from the list, with no read of it", async () => {
    const w = cardWorld();
    const rec = personRecord("listed", { givenName: "Di", familyName: "Listed" });
    const qc = newQc();
    putList(qc, P, [rec]);
    mountFor(qc, "listed", P);
    await ready();
    await new Promise((r) => setTimeout(r, 40));
    expect(readsOf(w, "listed")).toEqual([]);
  });

  it("a vault that does not return the record is named by its label, and asserts nothing more", async () => {
    cardWorld();
    mountFor(newQc(), "gone", Q, { readVaultId: Q, vaults: [{ vaultId: Q, entity: null, name: "Quarry", parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: false }] });
    expect(await screen.findByText(/Quarry didn’t return this record\. It may have been deleted, or your access may not reach it\./)).toBeTruthy();
  });

  it("while the read is out, it says Loading record…", async () => {
    const w = cardWorld();
    w.platform.failNext("GET", "/lws/r/", 500);
    mountFor(newQc(), "slow", Q, { readVaultId: Q });
    expect(screen.getByText("Loading record…")).toBeTruthy();
  });
});
