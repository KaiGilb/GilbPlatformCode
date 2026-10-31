// @vitest-environment jsdom
// Ported from GilbApp `PlaceClaimsCard.viewLayout.c214.test.tsx` (5 cases) and 2 of `PlaceClaimsCard.s8cardlook.test.tsx` (4 cases): a stored address, not being edited, shows only its
// filled fields as compact lines; a tap opens every field; each address is its own headed block; the (-) cannot be pressed while a write is in flight; a tap in
// presentation turns edit mode on and opens that address, and Done makes it a compact reading again.
// The other 2 cases of `s8cardlook` need the card's group, its add row and the chooser sheet (the framed group with the address icon and no add row; the empty group and
// "Add Postal Address" with the cursor in the first field): they go with the card (H15g).
// Changed from the source: the cases render `SavedAddress` (in the card's list element, with `editMode` decided as the card decides it) instead of the whole card.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { GEO, setCatalogueMode, useWorld } from "../test/world";
import { Frame, claim, field, list, noop } from "../test/support";

useWorld();
beforeEach(() => {
  setCatalogueMode("normal");
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const HOME = claim("c-home", "home", [
  field("c-home", { id: "h-street", subject: "street", streetLine: "Storgata 1" }),
  field("c-home", { id: "h-l1", subject: "line1", addressLine1: "c/o Hansen" }),
  field("c-home", { id: "h-no", subject: "place", placeId: `${GEO}/no` }),
]);
const WORK = claim("c-work", "work", [field("c-work", { id: "w-street", subject: "street", streetLine: "Kongens gate 2" })]);

const labels = (el: HTMLElement) => [...el.querySelectorAll("label")].map((l) => l.textContent?.trim() ?? "");
// Waits for the address's settled compact view: "Norway" alone is not enough, the frame shown while the places are still being looked up names them too.
const settledCompact = (home: HTMLElement) =>
  waitFor(() => expect(within(home).getByTestId("place-view-region-country").textContent).toBe("Norway"));
const block = (container: HTMLElement, name: string) => within(container).getByRole("heading", { name }).closest("article") as HTMLElement;

describe("the (-) and its in-flight guard", () => {
  it("the (-) removes the address when pressed, and does nothing while the card is busy", async () => {
    const onRemove = vi.fn();
    const { container, rerender } = render(list([HOME], { editMode: true, onRemove }));
    const home = await waitFor(() => block(container, "home"));
    const remove = within(home).getByRole("button", { name: "Remove address home" }) as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    rerender(list([HOME], { editMode: true, busy: true, onRemove }));
    const busyRemove = within(block(container, "home")).getByRole("button", { name: "Remove address home" }) as HTMLButtonElement;
    expect(busyRemove.disabled).toBe(true);
    fireEvent.click(busyRemove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe("a stored address, not being edited", () => {
  it("shows only the filled fields, as lines, with no input boxes and no labels for empty fields", async () => {
    const { container } = render(list([HOME], { editMode: true }));
    const home = await waitFor(() => block(container, "home"));
    await settledCompact(home);
    expect(home.querySelectorAll("input")).toHaveLength(0);
    expect(within(home).getAllByTestId(/^place-view-/).map((l) => l.textContent)).toEqual(["Storgata 1", "c/o Hansen", "Norway"]);
    for (const empty of ["Address 2", "Postal Code", "City", "Region/State", "Street..", "Location"]) expect(labels(home), empty).not.toContain(empty);
  });

  it("a tap on the address opens every field; opening alone writes nothing; Done closes it again", async () => {
    const onAmend = vi.fn(() => true);
    const { container } = render(list([HOME], { editMode: true, onAmend }));
    const home = await waitFor(() => block(container, "home"));
    await settledCompact(home);
    fireEvent.click(within(home).getByRole("button", { name: "Edit address home" }));
    await waitFor(() => expect(labels(home)).toContain("City"));
    expect(labels(home)).toEqual(expect.arrayContaining(["Location", "Street..", "City", "Region/State"]));
    expect(home.querySelector<HTMLInputElement>("#street-c-home")!.value).toBe("Storgata 1");
    expect((document.activeElement as HTMLElement).tagName).not.toBe("INPUT");
    fireEvent.click(within(home).getByRole("button", { name: "Done with address home" }));
    expect(home.querySelectorAll("input")).toHaveLength(0);
    expect(onAmend).not.toHaveBeenCalled();
  });

  it("a record that may not be written shows the same lines, with nothing to tap", async () => {
    const { container } = render(list([HOME], { editMode: false }));
    const home = await waitFor(() => block(container, "home"));
    await settledCompact(home);
    expect(within(home).getAllByTestId(/^place-view-/).map((l) => l.textContent)).toEqual(["Storgata 1", "c/o Hansen", "Norway"]);
    expect(within(home).queryByRole("button")).toBeNull();
  });
});

describe("each address is its own headed block", () => {
  it("two addresses render as two blocks, headed home and work, each holding only its own lines", async () => {
    const { container } = render(list([HOME, WORK], { editMode: true }));
    await waitFor(() => expect(within(container).getAllByRole("article").map((a) => within(a).getByRole("heading").textContent)).toEqual(["home", "work"]));
    const home = block(container, "home");
    const work = block(container, "work");
    expect(home).not.toBe(work);
    await waitFor(() => expect(within(home).getByText("Storgata 1")).toBeTruthy());
    expect(within(work).getByText("Kongens gate 2")).toBeTruthy();
    expect(within(work).queryByText("Storgata 1")).toBeNull();
  });
});

describe("in the card's two modes", () => {
  const card = (claims = [HOME, WORK]) => (
    <CardModeProvider canEdit>
      <CardModeBar />
      <div data-testid="place-claims-list">
        {claims.map((c) => (
          <Frame key={c.id} claim={c} busy={false} editMode onAmend={noop} onRemove={noop} />
        ))}
      </div>
    </CardModeProvider>
  );
  const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");

  it("presentation: each address is its heading and compact lines; no (-), no input", async () => {
    render(card());
    expect(modeOf()).toBe("presentation");
    await waitFor(() => expect(screen.getByText("Storgata 1")).toBeTruthy());
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a tap on an address turns edit mode on and opens that address (every field, the (-))", async () => {
    render(card());
    fireEvent.click(await screen.findByRole("button", { name: "Edit address work" }));
    expect(modeOf()).toBe("edit");
    expect(screen.getByRole("button", { name: "Remove address work" })).toBeTruthy();
    expect(screen.getByLabelText("Street..")).toBeTruthy();
  });

  it("back in presentation (Done) an opened address is a compact reading again", async () => {
    render(card([HOME]));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    expect(screen.getByLabelText("Street..")).toBeTruthy();
    fireEvent.click(screen.getByTestId("card-done"));
    expect(screen.queryByLabelText("Street..")).toBeNull();
    fireEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByLabelText("Street..")).toBeNull(); // compact until tapped again
  });
});
