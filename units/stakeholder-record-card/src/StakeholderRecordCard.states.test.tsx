// What the card draws while the master has not said what a record is, or when it is not a person: the header, the state line, and no field. The
// source drew its generic editor in those states (a Person whose master read hangs had an editable Name box); this card draws no editor for them.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RecordDetail, ShellContext } from "../test/app";
import { cardWorld, newQc, personRecord, putList, shellOf, P, type CardWorld } from "../test/cardWorld";

function show(qc: QueryClient, id: string) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shellOf({ id })}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>,
  );
}
const stateIs = (s: string) => waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe(s), { timeout: 4000 });
const inputs = () => [...document.querySelectorAll("input, textarea, select")];

function held(extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  const rec = personRecord("pn", { givenName: "Tom", familyName: "Gilb", ...extra }, over);
  const qc = newQc();
  putList(qc, P, [rec]);
  return { rec, qc };
}

describe("the states of a card that is not (yet) a person card", () => {
  it("reading: the master has not answered: the header names the record, one status line says what is going on, and there is no input", async () => {
    cardWorld({ master: "hang" });
    const { rec, qc } = held();
    show(qc, rec.id);
    await stateIs("reading");
    expect(screen.getByTestId("stakeholder-card-status").textContent).toBe("Reading the fields of this card…");
    expect(screen.getByRole("heading", { name: "Tom Gilb" })).toBeTruthy();
    expect(inputs()).toEqual([]);
  });

  it("the master answers 503 (kinds not known): the state's own line is drawn, the status line is not, and there is no input", async () => {
    cardWorld({ master: "503" });
    const { rec, qc } = held();
    show(qc, rec.id);
    await waitFor(() => expect(screen.getByTestId("stakeholder-fields-state")).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId("stakeholder-fields-state").textContent).toMatch(/Not known yet whether this is a stakeholder kind/);
    expect(screen.queryByTestId("stakeholder-card-status")).toBeNull();
    expect(inputs()).toEqual([]);
  });

  it("a record whose type is not a stakeholder kind: one line, no editor, no free fact inputs", async () => {
    cardWorld();
    const rec = personRecord("note1", { title: "A note", body: "text" }, { typeUri: "t:NoteDocument" });
    const qc = newQc();
    putList(qc, P, [rec]);
    show(qc, rec.id);
    await stateIs("not-a-stakeholder-kind");
    expect(screen.getByTestId("stakeholder-card-status").textContent).toBe("This card draws the card of a person only.");
    expect(inputs()).toEqual([]);
    expect(screen.queryByTestId("card-edit")).toBeNull();
  });

  it("an organization (a ready kind whose set carries the logo): the same line, no editor and no organization groups", async () => {
    cardWorld({ terms: [["name", "Name", undefined, "Organization"], ["logo", "Logo", undefined, "Organization"]] });
    const rec = personRecord("org1", { name: "Acme" }, { typeUri: "t:Organization" });
    const qc = newQc();
    putList(qc, P, [rec]);
    show(qc, rec.id);
    await stateIs("ready");
    expect(screen.getByTestId("stakeholder-card-status").textContent).toBe("This card draws the card of a person only.");
    expect(inputs()).toEqual([]);
    expect(screen.queryByTestId("card-edit")).toBeNull();
  });

  it("a ready person card has no status line", async () => {
    cardWorld();
    const { rec, qc } = held();
    show(qc, rec.id);
    await stateIs("ready");
    expect(screen.queryByTestId("stakeholder-card-status")).toBeNull();
  });
});

describe("the four source cases that change with it (the master hangs or is not asked)", () => {
  async function noWrite(w: CardWorld) {
    await new Promise((r) => setTimeout(r, 120));
    expect(w.writes).toEqual([]);
  }

  it("fields not known yet (no selector on the master): the state is said, no input is offered, nothing is written; with the selector the same card edits", async () => {
    const w = cardWorld({ selector: false });
    const { rec, qc } = held({ nickname: "" });
    const first = show(qc, rec.id);
    await waitFor(() => expect(screen.getByTestId("stakeholder-fields-state")).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId("stakeholder-fields-state").textContent).toMatch(/Fields not known yet for this stakeholder kind, so nothing can be edited here/);
    expect(inputs()).toEqual([]);
    expect(screen.queryByTestId("card-edit")).toBeNull();
    await noWrite(w);
    first.unmount();
    cardWorld({ selector: true });
    const again = held({ nickname: "" });
    show(again.qc, again.rec.id);
    await stateIs("ready");
    expect(screen.getByTestId("card-edit")).toBeTruthy();
  });

  it("a label-only Person while the master answers 503: the name is the header's, there is no Name box, and no write carries a:label or a:title", async () => {
    const w = cardWorld({ master: "503" });
    const rec = personRecord("lbl", {}, { facts: { label: "Tom Gilb" } as never });
    const qc = newQc();
    putList(qc, P, [rec]);
    show(qc, rec.id);
    await waitFor(() => expect(screen.getByTestId("stakeholder-fields-state")).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByRole("heading", { name: "Tom Gilb" })).toBeTruthy();
    expect(inputs()).toEqual([]);
    await noWrite(w);
  });

  it("a Person that already holds a:name, master hanging: no Name box to edit, nothing is written", async () => {
    const w = cardWorld({ master: "hang" });
    const { rec, qc } = held();
    show(qc, rec.id);
    await stateIs("reading");
    expect(inputs()).toEqual([]);
    expect(screen.queryByDisplayValue("Tom")).toBeNull();
    await noWrite(w);
  });

  it("a Person in the same window (master hanging) is not retracted from here: nothing is written, the legacy label stays", async () => {
    const w = cardWorld({ master: "hang" });
    const rec = personRecord("legacy", {}, { facts: { name: "Tom", label: "Tom Gilb" } as never });
    const qc = newQc();
    putList(qc, P, [rec]);
    show(qc, rec.id);
    await stateIs("reading");
    expect(inputs()).toEqual([]);
    await noWrite(w);
  });
});
