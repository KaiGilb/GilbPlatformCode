// The autosave loop: a keystroke settles and saves by itself, a save in flight queues the next edit, leaving the card flushes it, a 412 is read again and
// rebased. Every write is one PATCH against the version the card read.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RecordDetail, ShellContext, seam } from "../test/app";
import { cardWorld, newQc, personRecord, putList, shellOf, P } from "../test/cardWorld";

const ready = () => waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });
const tree = (qc: QueryClient, rec: { id: string }) => (
  <QueryClientProvider client={qc}>
    <ShellContext.Provider value={shellOf(rec)}>
      <RecordDetail />
    </ShellContext.Provider>
  </QueryClientProvider>
);
function held(facts: Record<string, unknown> = {}) {
  const rec = personRecord("pn", { givenName: "Tom", familyName: "Gilb", ...facts });
  const qc = newQc();
  putList(qc, P, [rec]);
  return { rec, qc };
}
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the autosave loop", () => {
  it("a keystroke settles for the debounce and saves by itself, with no blur", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Tom"), "x");
    expect(w.writes).toEqual([]);
    await waitFor(() => expect(w.writes.length).toBe(1), { timeout: 2500 });
    expect(w.writes[0]!.body["a:givenName"]).toBe("Tomx");
  });

  it("an edit made while a save is in flight is queued and sent after it, with the version the first save returned", async () => {
    const w = cardWorld();
    let patches = 0;
    w.respond = async (method) => {
      if (method !== "PATCH") return undefined;
      patches += 1;
      if (patches === 1) await nap(250);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json", etag: `"sha256:v${patches}"` } });
    };
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.type(box, "a");
    await userEvent.tab();
    await waitFor(() => expect(w.writes.length).toBe(1), { timeout: 3000 });
    await userEvent.click(box);
    await userEvent.type(box, "b");
    await userEvent.tab();
    await waitFor(() => expect(w.writes.length).toBe(2), { timeout: 4000 });
    expect(w.writes[0]!.body["a:givenName"]).toBe("Toma");
    expect(w.writes[1]!.body["a:givenName"]).toBe("Tomab");
    expect(w.writes[1]!.ifMatch).toBe('"sha256:v1"');
  });

  it("leaving the card flushes an edit that has not settled", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    const view = render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Tom"), "y");
    expect(w.writes).toEqual([]);
    view.unmount();
    await waitFor(() => expect(w.writes.length).toBe(1), { timeout: 3000 });
    expect(w.writes[0]!.body["a:givenName"]).toBe("Tomy");
  });

  it("a page that goes hidden flushes an edit that has not settled", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Tom"), "z");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await waitFor(() => expect(w.writes.length).toBe(1), { timeout: 400 });
    expect(w.writes[0]!.body["a:givenName"]).toBe("Tomz");
  });

  it("a set that offers no name field: the given name settles and saves by itself too, and no name is written", async () => {
    const w = cardWorld({ notOfPerson: ["name"] });
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Tom"), "!");
    expect(w.writes).toEqual([]);
    await waitFor(() => expect(w.writes.length).toBe(1), { timeout: 2500 });
    expect(w.writes[0]!.body["a:givenName"]).toBe("Tom!");
    expect(w.writes[0]!.body["a:name"]).toBeUndefined();
  });

  it("a record that is read again while it is being typed in does not take the typed text away, nor move the version it will be written against", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Tom"), "x");
    putList(qc, P, [personRecord("pn", { givenName: "Tom", familyName: "Gilb" }, { etag: '"sha256:9"' })]);
    await nap(60);
    expect(screen.getByDisplayValue("Tomx")).toBeTruthy();
    await userEvent.tab();
    await waitFor(() => expect(w.writes.length).toBe(1), { timeout: 3000 });
    expect(w.writes[0]!.body["a:givenName"]).toBe("Tomx");
    expect(w.writes[0]!.ifMatch).toBe('"sha256:0"');
  });

  it("an edit that changes nothing sends nothing", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.type(box, "x");
    await userEvent.type(box, "{Backspace}");
    await userEvent.tab();
    await nap(900);
    expect(w.writes).toEqual([]);
  });

  it("a 412: what changed elsewhere is kept, only the person's own edit is sent again, with the new version", async () => {
    const w = cardWorld();
    let patches = 0;
    w.respond = (method, url) => {
      if (method === "PATCH") {
        patches += 1;
        return new Response("{}", { status: patches === 1 ? 412 : 200, headers: { "content-type": "application/json", etag: '"sha256:2"' } });
      }
      if (method === "GET" && url.endsWith("/lws/r/pn"))
        return new Response(JSON.stringify({ "@context": "https://www.w3.org/ns/lws/v1", "@id": "https://h.gilb.test/base/e/pn", "@type": "t:Person", name: "Tom Gilb", givenName: "Tom", familyName: "Gilbert", nickname: "T" }), {
          status: 200,
          headers: { "content-type": "application/json", etag: '"sha256:1"' },
        });
      return undefined;
    };
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.clear(box);
    await userEvent.type(box, "Thomas");
    await userEvent.tab();
    await waitFor(() => expect(w.writes.length).toBe(2), { timeout: 5000 });
    const second = w.writes[1]!;
    expect(second.ifMatch).toBe('"sha256:1"');
    expect(second.body["a:givenName"]).toBe("Thomas");
    expect(second.body["a:familyName"]).not.toBe("Gilb");
    expect(second.body["a:nickname"]).not.toBeNull();
  });

  it("a 412 whose re-read is refused (403) pins the record as read only", async () => {
    const w = cardWorld();
    let reads = 0;
    w.respond = (method, url) => {
      if (method === "PATCH") return new Response("{}", { status: 412, headers: { "content-type": "application/json" } });
      if (method === "GET" && url.endsWith("/lws/r/pn")) {
        reads += 1;
        // the first re-read is the save's own (it keeps the caches level); the card's re-read after it is the one that is refused
        return reads === 1
          ? new Response(JSON.stringify({ "@context": "https://www.w3.org/ns/lws/v1", "@id": "https://h.gilb.test/base/e/pn", "@type": "t:Person", name: "Tom Gilb", givenName: "Tom", familyName: "Gilb" }), { status: 200, headers: { "content-type": "application/json", etag: '"sha256:1"' } })
          : new Response("{}", { status: 403, headers: { "content-type": "application/json" } });
      }
      return undefined;
    };
    const { rec, qc } = held();
    render(tree(qc, rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.clear(box);
    await userEvent.type(box, "Thomas");
    await userEvent.tab();
    await waitFor(() => expect(screen.queryByTestId("card-done")).toBeNull(), { timeout: 5000 });
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect(w.writes).toHaveLength(1);
  });
});

describe("the vault that holds the record, when the host gives none", () => {
  it("a create's memory is the holding vault; with none the door; the card's own default, not a host member", async () => {
    cardWorld();
    const seen: (string | null)[] = [];
    seam.omitHolding = true;
    seam.address = (p) => (seen.push(p.vaultId), null);
    const { rec, qc } = held({ postalAddress: "Storgata 1" });
    qc.setQueryData(["created-in-vault", "pn"], "https://made.gilb.test/vault");
    const view = render(tree(qc, rec));
    await ready();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(new Set(seen)).toEqual(new Set(["https://made.gilb.test/vault"]));
    view.unmount();
    seen.length = 0;
    const b = held({ postalAddress: "Storgata 1" });
    render(tree(b.qc, b.rec));
    await ready();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(new Set(seen)).toEqual(new Set([P]));
  });
});
