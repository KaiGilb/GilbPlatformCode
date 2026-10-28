// The Illustration line: the value graph of the card's levels; what is editable, what it hands up, and what it takes from the card.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { othersOf, withOthers, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValuePictureBody } from "./index";
import { Card, VAULT, changes, lastChange, level, record, render, type Props } from "../test/mount";
import { goalSlider, keyed, lowered, openMarker, sliders } from "../test/graph";

afterEach(cleanup);

const mount = (start: ValueCardData, props: Props = {}) => render(<Card Body={PlanValuePictureBody} start={start} props={props} />);
const legacy = (o: Partial<NonNullable<Props["legacy"]>> = {}) => ({ levels: 2, qualifiers: 0, meters: 0, busy: false, canMove: true, onMove: vi.fn(), ...o });
const GONE = "This level was removed by someone else.";

describe("what is editable", () => {
  it("draws the graph of the card's levels inside a block with the line's spacing", () => {
    const { container } = mount(lowered());
    expect(container.firstElementChild?.className).toBe("w-full py-2");
    expect(sliders().map((s) => s.getAttribute("aria-label")?.split(",")[0])).toEqual(["Status", "Goal"]);
  });
  it("read-only (not in Edit, may not edit): a key on a marker changes nothing", () => {
    mount(lowered());
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "+ New" })).toBeNull();
  });
  it("in Edit a key steps a marker and hands up the whole card; the lists and parts the graph did not touch are the same objects", () => {
    const s = lowered();
    mount(s, { editing: true });
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(1);
    expect(lastChange().levels.map((l) => [l.kind, l.value])).toEqual([["Status", 9], ["Goal", 4]]);
    expect(lastChange().levels[0]).toBe(s.levels[0]);
    expect(lastChange().scale).toBe(s.scale);
    expect(lastChange().variables).toBe(s.variables);
    expect(lastChange().endpoint).toBe(s.endpoint);
    expect(lastChange().meters).toBe(s.meters);
  });
  it("a person who may edit (canEdit) can step a marker on a card that is not in Edit: the graph is in place always", () => {
    mount(lowered(), { canEdit: true });
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(1);
    expect(screen.getByRole("button", { name: "+ New" })).toBeTruthy();
  });
  it("editing without the right to edit is still an editing graph (the line adds the two: editing or canEdit)", () => {
    mount(lowered(), { editing: true, canEdit: false });
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(1);
  });
  it("an older stored list of levels makes the graph read-only, even in Edit and for a person who may edit", () => {
    mount(lowered(), { editing: true, canEdit: true, legacy: legacy() });
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "+ New" })).toBeNull();
  });
  it("an older list of qualifiers or Meters does not: only the levels' list matters here", () => {
    mount(lowered(), { editing: true, legacy: legacy({ levels: 0, qualifiers: 3, meters: 2 }) });
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(1);
  });
  it("the older list is moved: the graph is editable again", () => {
    const view = render(<Card Body={PlanValuePictureBody} start={lowered()} props={{ editing: true, legacy: legacy() }} />);
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(0);
    view.rerender(<Card Body={PlanValuePictureBody} start={lowered()} props={{ editing: true, legacy: legacy({ levels: 0 }) }} />);
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(changes).toHaveLength(1);
  });
});

describe("what goes up", () => {
  it("the unknown items of the levels list ride along on the new list, not enumerable", () => {
    const base = lowered();
    const list = withOthers([...base.levels], [{ unknownItem: true }]);
    mount({ ...base, levels: list }, { editing: true });
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(lastChange().levels).not.toBe(list);
    expect(othersOf(lastChange().levels)).toEqual([{ unknownItem: true }]);
    expect(JSON.stringify(lastChange().levels)).not.toContain("unknownItem");
  });
  it("the '+ New' menu adds a level at the end of the old list, once, from a card with levels", () => {
    const s = lowered();
    mount(s, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    fireEvent.click(within(screen.getByRole("menu")).getAllByRole("menuitem", { name: /^Add Wish to/ })[0]!);
    expect(changes).toHaveLength(1);
    expect(lastChange().levels).toHaveLength(3);
    expect(lastChange().levels.slice(0, 2)).toEqual([s.levels[0], s.levels[1]]);
    expect(lastChange().levels[2]!.kind).toBe("Wish");
  });
});

describe("what it takes from the card", () => {
  it("the card's title is the name in the full-screen header; without a title the graph's own default is used", () => {
    mount(lowered());
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(within(screen.getByTestId("plan-graph-fullscreen")).getByText("A Value")).toBeTruthy();
    cleanup();
    render(<Card Body={PlanValuePictureBody} start={lowered()} props={{ record: { ...record, facts: {} } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(within(screen.getByTestId("plan-graph-fullscreen")).getByText("Illustration")).toBeTruthy();
  });
  it("the card's group write shows as 'Moving 1 of 5…', the find's cut-off as a note; none given, none shown", () => {
    mount(lowered(), { host: { progress: { done: 1, total: 5 }, capped: { total: 24, cap: 2 } } });
    expect(screen.getByTestId("plan-graph-progress").textContent).toBe("Moving 1 of 5…");
    expect(screen.getByTestId("plan-graph-capped").textContent).toBe("Showing the first 2 of 24 records at this level.");
    cleanup();
    mount(lowered(), { host: { progress: null, capped: null } });
    expect(screen.queryByTestId("plan-graph-progress")).toBeNull();
    expect(screen.queryByTestId("plan-graph-capped")).toBeNull();
    cleanup();
    mount(lowered());
    expect(screen.queryByTestId("plan-graph-progress")).toBeNull();
    expect(screen.queryByTestId("plan-graph-capped")).toBeNull();
  });
  const bare = (levels: ValueCardData["levels"], onNotice?: (n: string | null) => void): Parameters<typeof PlanValuePictureBody>[0] => ({
    data: lowered({ levels }),
    editing: true,
    canEdit: false,
    vaultId: VAULT,
    record,
    onOpen: () => {},
    selfId: null,
    onChange: () => {},
    ...(onNotice ? { host: { onNotice } } : {}),
  });
  const a = () => keyed(level("Status", 9, { when: "2026-10-27" }), "ra");
  const b = () => keyed(level("Goal", 5, { when: "2027-06-30" }), "rb");
  const c = () => keyed(level("Wish", 3, { when: "2028-01-01" }), "rc");
  it("the graph's notice goes to the card's notice line when the card gave one: a level removed under an open popover", () => {
    const onNotice = vi.fn();
    const view = render(<PlanValuePictureBody {...bare([a(), b(), c()], onNotice)} />);
    openMarker(view.container, 1);
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
    expect(onNotice).not.toHaveBeenCalled();
    view.rerender(<PlanValuePictureBody {...bare([a(), c()], onNotice)} />);
    expect(onNotice).toHaveBeenCalledWith(GONE);
    expect(screen.getByTestId("plan-graph-notice").textContent).toContain(GONE);
  });
  it("without a notice line from the card the graph still shows its own notice and does not fail", () => {
    const view = render(<PlanValuePictureBody {...bare([a(), b(), c()])} />);
    openMarker(view.container, 1);
    view.rerender(<PlanValuePictureBody {...bare([a(), c()])} />);
    expect(screen.getByTestId("plan-graph-notice").textContent).toContain(GONE);
  });
});
