// @vitest-environment jsdom
// New. A stored address in its editor: what a leave commits, what is refused, what waits for a save in flight, and how the draft follows the store without losing what the person typed.
// GilbApp tested these through the whole card.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { GEO, GEO_ORIGIN, callsTo, failIds, setCatalogueMode, useWorld } from "../test/world";
import { addressIn, claim, field, list } from "../test/support";

useWorld();
beforeEach(() => setCatalogueMode("normal"));
afterEach(cleanup);

const opened = async (props: Parameters<typeof list>[1], c = addressIn(`${GEO}/no`, "Storgata 1")) => {
  const r = render(list([c], { editMode: true, ...props }));
  fireEvent.click(await screen.findByRole("button", { name: `Edit address ${c.label || "Storgata 1"}` }));
  await screen.findByLabelText("Street..");
  return r;
};
const street = () => screen.getByLabelText("Street..") as HTMLInputElement;

describe("a leave commits the draft", () => {
  it("a changed street is handed to onAmend once, with the stored places kept", async () => {
    const onAmend = vi.fn(async () => true);
    await opened({ onAmend });
    fireEvent.change(street(), { target: { value: "Storgata 2" } });
    fireEvent.blur(street());
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    const [c, draft] = onAmend.mock.calls[0] as unknown as [{ id: string }, ReturnType<typeof emptyDraft>];
    expect(c.id).toBe("c-home");
    expect(draft.streetLine).toBe("Storgata 2");
    expect(draft.label).toBe("home");
    expect(draft.place.country?.id).toBe(`${GEO}/no`);
  });

  it("a country picked in the editor files through the cascade and commits", async () => {
    const onAmend = vi.fn(async () => true);
    const c = claim("c-s", "home", [field("c-s", { id: "s", subject: "street", streetLine: "Storgata 1" })]);
    render(list([c], { editMode: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    fireEvent.change(await screen.findByLabelText("Country"), { target: { value: "Norway" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("option")[0]!);
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    const draft = (onAmend.mock.calls[0] as unknown as [unknown, ReturnType<typeof emptyDraft>])[1];
    expect(draft.place.country?.id).toBe(`${GEO}/no`);
  });

  it("clearing a bound country commits an address without it", async () => {
    const onAmend = vi.fn(async () => true);
    await opened({ onAmend });
    fireEvent.click(screen.getByTestId("place-country-value"));
    const box = await screen.findAllByRole("combobox");
    fireEvent.change(box.at(-1)!, { target: { value: "" } });
    fireEvent.blur(box.at(-1)!);
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    expect((onAmend.mock.calls[0] as unknown as [unknown, ReturnType<typeof emptyDraft>])[1].place.country).toBeNull();
  });

  it("emptying the whole address is refused with the sentence, and nothing is sent", async () => {
    const onAmend = vi.fn(async () => true);
    const c = claim("c-e", "", [field("c-e", { id: "s", subject: "street", streetLine: "Storgata 1" })]);
    render(list([c], { editMode: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address Storgata 1" }));
    fireEvent.change(await screen.findByLabelText("Street.."), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("Street.."));
    expect((await screen.findByTestId("place-claim-empty-refused")).textContent).toBe("An address needs at least one part. Use Remove to delete it.");
    expect(onAmend).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Street.."), { target: { value: "x" } });
    expect(screen.queryByTestId("place-claim-empty-refused")).toBeNull();
  });
});

describe("a save in flight does not lose an edit", () => {
  it("an edit made while busy is not sent then, and is sent once when the save clears", async () => {
    const onAmend = vi.fn(async () => true);
    const c = addressIn(`${GEO}/no`, "Storgata 1");
    const { rerender } = render(list([c], { editMode: true, busy: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    fireEvent.change(await screen.findByLabelText("Street.."), { target: { value: "Storgata 5" } });
    fireEvent.blur(street());
    await new Promise((r) => setTimeout(r, 30));
    expect(onAmend).not.toHaveBeenCalled();
    rerender(list([c], { editMode: true, busy: false, onAmend }));
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    expect((onAmend.mock.calls[0] as unknown as [unknown, ReturnType<typeof emptyDraft>])[1].streetLine).toBe("Storgata 5");
  });

  it("after a save that failed, the queued edit is not sent behind it (the stored fields are stale)", async () => {
    const onAmend = vi.fn(async () => false);
    const c = addressIn(`${GEO}/no`, "Storgata 1");
    const { rerender } = render(list([c], { editMode: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    fireEvent.change(await screen.findByLabelText("Street.."), { target: { value: "Storgata 5" } });
    fireEvent.blur(street());
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    rerender(list([c], { editMode: true, busy: true, onAmend }));
    fireEvent.change(street(), { target: { value: "Storgata 6" } });
    fireEvent.blur(street());
    rerender(list([c], { editMode: true, busy: false, onAmend }));
    await new Promise((r) => setTimeout(r, 40));
    expect(onAmend).toHaveBeenCalledTimes(1);
  });
});

describe("no change is sent while the stored places are being read again", () => {
  it("the store's address changes under an open editor: until its places are read, a leave sends nothing", async () => {
    const onAmend = vi.fn(async () => true);
    const c1 = addressIn(`${GEO}/no`, "Storgata 1");
    const { rerender } = render(list([c1], { editMode: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    await screen.findByLabelText("Street..");
    // The same address now binds a place that cannot be read: its places are read again, and it is not resolved.
    failIds.add(`${GEO}/oslo`);
    const c2 = claim("c-home", "home", [field("c-home", { id: "h-s", subject: "street", streetLine: "Storgata 1" }), field("c-home", { id: "h-c", subject: "place", placeId: `${GEO}/oslo` })]);
    rerender(list([c2], { editMode: true, onAmend }));
    fireEvent.change(street(), { target: { value: "Storgata 7" } });
    fireEvent.blur(street());
    await new Promise((r) => setTimeout(r, 60));
    expect(onAmend).not.toHaveBeenCalled();
  });
});

describe("the draft follows the store without losing what the person typed", () => {
  it("a field the person did not touch follows the store; one they changed stays theirs", async () => {
    const onAmend = vi.fn(async () => true);
    const c1 = addressIn(`${GEO}/no`, "Storgata 1", "home");
    const { rerender } = render(list([c1], { editMode: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    fireEvent.change(await screen.findByLabelText("Location"), { target: { value: "cabin" } });
    const c2 = claim("c-home", "home", [field("c-home", { id: "h-s", subject: "street", streetLine: "Storgata 9" }), field("c-home", { id: "h-c", subject: "place", placeId: `${GEO}/no` })]);
    rerender(list([c2], { editMode: true, onAmend }));
    await waitFor(() => expect(street().value).toBe("Storgata 9"));
    expect((screen.getByLabelText("Location") as HTMLInputElement).value).toBe("cabin");
  });

  it("a trailing space the store trimmed does not keep the field the person's for the session", async () => {
    const onAmend = vi.fn(async () => true);
    const c1 = addressIn(`${GEO}/no`, "Nygata 8", "home");
    const { rerender } = render(list([c1], { editMode: true, onAmend }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    fireEvent.change(await screen.findByLabelText("Street.."), { target: { value: "Nygata 9 " } });
    fireEvent.blur(street());
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    const c2 = claim("c-home", "home", [field("c-home", { id: "h-s", subject: "street", streetLine: "Nygata 9" }), field("c-home", { id: "h-c", subject: "place", placeId: `${GEO}/no` })]);
    rerender(list([c2], { editMode: true, onAmend }));
    const c3 = claim("c-home", "home", [field("c-home", { id: "h-s", subject: "street", streetLine: "Nygata 10" }), field("c-home", { id: "h-c", subject: "place", placeId: `${GEO}/no` })]);
    rerender(list([c3], { editMode: true, onAmend }));
    await waitFor(() => expect(street().value).toBe("Nygata 10"));
  });
});

describe("typing from the add form that arrived during the first save", () => {
  it("is applied once, to the stored draft, and committed", async () => {
    const onAmend = vi.fn(async () => true);
    const onCarried = vi.fn();
    const sent = { ...emptyDraft(), label: "home", streetLine: "Storgata 1" };
    const latest = { ...sent, postalCode: "0150" };
    render(list([addressIn(`${GEO}/no`, "Storgata 1")], { editMode: true, onAmend, onCarried, carried: { sent, latest } }));
    await waitFor(() => expect(onAmend).toHaveBeenCalledTimes(1));
    expect(onCarried).toHaveBeenCalledTimes(1);
    const draft = (onAmend.mock.calls[0] as unknown as [unknown, ReturnType<typeof emptyDraft>])[1];
    expect(draft.postalCode).toBe("0150");
    expect(draft.streetLine).toBe("Storgata 1");
    expect(draft.place.country?.id).toBe(`${GEO}/no`);
  });
});

describe("the editor reads and sends nothing of its own", () => {
  it("only GETs reach the catalogue", async () => {
    await opened({});
    expect(callsTo(GEO_ORIGIN).every((c) => c.method === "GET" && c.credentials === "omit")).toBe(true);
  });
});
