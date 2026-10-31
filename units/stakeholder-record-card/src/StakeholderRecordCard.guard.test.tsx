// Who may write: the shell's guard, a framed grant, the session's refusal. Each of them takes the card's Edit away, or stops a save that has begun.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ENTITY_READ_ONLY_REASON } from "@kaigilb/gilbplatformcode-entity-write-access";
import { RecordDetail, ShellContext, type ShellContextValue } from "../test/app";
import { AGENT, HELD_VAULT, cardWorld, newQc, personRecord, putList, shellOf, P } from "../test/cardWorld";

function tree(qc: QueryClient, shell: ShellContextValue) {
  return (
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shell}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>
  );
}
const ready = () => waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });
const nap = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function held(facts: Record<string, unknown> = {}) {
  const rec = personRecord("pn", { givenName: "Tom", familyName: "Gilb", ...facts });
  const qc = newQc();
  putList(qc, P, [rec]);
  return { rec, qc };
}

describe("the shell's write guard", () => {
  it("not allowed: no Edit, no + , no input, and the reason is said", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec, { writeGuard: { allowed: false, reason: "This vault is open for reading only." } })));
    await ready();
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect(screen.queryByTestId("card-add-info")).toBeNull();
    expect(document.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(screen.getByText("This vault is open for reading only.")).toBeTruthy();
    expect(w.writes).toEqual([]);
  });

  it("allowed: Edit is offered", async () => {
    cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(screen.getByTestId("card-edit")).toBeTruthy();
  });

  it("withdrawn while a keystroke is waiting to autosave: the save does not go out", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    const view = render(tree(qc, shellOf(rec)));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.type(box, "x");
    view.rerender(tree(qc, shellOf(rec, { writeGuard: { allowed: false, reason: "Closed now." } })));
    await userEvent.tab();
    await nap(900);
    expect(w.writes).toEqual([]);
  });
});

describe("the header's controls", () => {
  it("a read-only holder with the holder's vault known: the wide header is drawn, and the row of the card's controls is not", async () => {
    cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec, { vaults: [HELD_VAULT], writeGuard: { allowed: false, reason: "closed" } })));
    await ready();
    expect(screen.getByTestId("contact-shell-header")).toBeTruthy();
    expect(screen.queryByTestId("record-header-actions")).toBeNull();
  });

  it("a holder who may write: the row of the card's controls is under the wide header", async () => {
    cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec, { vaults: [HELD_VAULT] })));
    await ready();
    expect(within(screen.getByTestId("record-header-actions")).getByTestId("card-edit")).toBeTruthy();
  });
});

describe("a framed grant", () => {
  it("the session is only a reader of the record (named by principal): read only, no Edit", async () => {
    const w = cardWorld();
    const { rec, qc } = held({ directReader: AGENT, statedBy: "https://someone.else/base/e/x" });
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect(screen.getByText(ENTITY_READ_ONLY_REASON)).toBeTruthy();
    expect(w.writes).toEqual([]);
  });

  it("the session is named by its short web id only: still a reader, still read only", async () => {
    cardWorld();
    const short = "kai-short-webid";
    const { rec, qc } = held({ directReader: short, statedBy: "https://someone.else/base/e/x" });
    render(tree(qc, shellOf(rec, { session: { principal: AGENT, vault: { entity: null, shortWebId: short } } })));
    await ready();
    expect(screen.queryByTestId("card-edit")).toBeNull();
  });

  it("a record that becomes read only for the session while it is being typed in: the save does not go out", async () => {
    const w = cardWorld();
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Tom"), "x");
    putList(qc, P, [personRecord("pn", { givenName: "Tom", familyName: "Gilb", directReader: AGENT, statedBy: "https://someone.else/base/e/x" }, { etag: '"sha256:5"' })]);
    await nap(60);
    await userEvent.tab();
    await nap(900);
    expect(w.writes).toEqual([]);
  });

  it("the session is a writer of the record: Edit is offered", async () => {
    cardWorld();
    const { rec, qc } = held({ directReader: AGENT, directWriter: AGENT });
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(screen.getByTestId("card-edit")).toBeTruthy();
  });

  it("a grant naming someone else does not take Edit away", async () => {
    cardWorld();
    const { rec, qc } = held({ directReader: "https://someone.else/base/p/other" });
    render(tree(qc, shellOf(rec)));
    await ready();
    expect(screen.getByTestId("card-edit")).toBeTruthy();
  });
});

describe("a refused write", () => {
  async function typeAndLeave(value: string) {
    await userEvent.click(screen.getByTestId("card-edit"));
    const box = screen.getByDisplayValue("Tom");
    await userEvent.clear(box);
    await userEvent.type(box, value);
    await userEvent.tab();
  }

  it("a 403 on the save: the draft is rolled back, the read-only reason is said, Edit goes, and the id is not written again", async () => {
    const w = cardWorld();
    w.respond = (method) => (method === "PATCH" ? new Response("{}", { status: 403, headers: { "content-type": "application/json" } }) : undefined);
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    await typeAndLeave("Thomas");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(ENTITY_READ_ONLY_REASON), { timeout: 4000 });
    expect(w.writes).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("card-done")).toBeNull());
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect(screen.queryByDisplayValue("Thomas")).toBeNull();
    await nap(800);
    expect(w.writes).toHaveLength(1);
  });

  it("a 412 on the save: the record is read again, the edit is rebased on it and sent once more with the new version", async () => {
    const w = cardWorld();
    let patches = 0;
    w.respond = (method, url) => {
      if (method === "PATCH") {
        patches += 1;
        return patches === 1
          ? new Response("{}", { status: 412, headers: { "content-type": "application/json" } })
          : new Response("{}", { status: 200, headers: { "content-type": "application/json", etag: '"sha256:2"' } });
      }
      if (method === "GET" && url.endsWith("/lws/r/pn"))
        return new Response(JSON.stringify({ "@context": "https://www.w3.org/ns/lws/v1", "@id": "https://h.gilb.test/base/e/pn", "@type": "t:Person", name: "Tom Gilb", givenName: "Tom", familyName: "Gilb", nickname: "T" }), {
          status: 200,
          headers: { "content-type": "application/json", etag: '"sha256:1"' },
        });
      return undefined;
    };
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    await typeAndLeave("Thomas");
    await waitFor(() => expect(w.writes.length).toBe(2), { timeout: 5000 });
    expect(w.writes[0]!.ifMatch).toBe('"sha256:0"');
    expect(w.writes[1]!.ifMatch).toBe('"sha256:1"');
    expect(w.writes[1]!.body["a:givenName"]).toBe("Thomas");
    expect(within(document.body).queryByRole("alert")).toBeNull();
  });

  it("any other failure of the save is said and the value stays for a later try", async () => {
    const w = cardWorld();
    w.respond = (method) => (method === "PATCH" ? new Response("{}", { status: 500, headers: { "content-type": "application/json" } }) : undefined);
    const { rec, qc } = held();
    render(tree(qc, shellOf(rec)));
    await ready();
    await typeAndLeave("Thomas");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't save — your change was rolled back. Try again."), { timeout: 4000 });
    expect(screen.getByTestId("card-done")).toBeTruthy();
  });
});
