// @vitest-environment jsdom
// The card over a stand-in editor (one spy for each act). Ported from GilbApp: `EmploymentCard.s8cardlook` (5 of 6; the sixth draws the place line,
// which is a slot here), `EmploymentCard.s10iter1focus` (2) and `RoleWhen.roleOngoing.c214` (1, through the Location slot). The rest is new.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { EmploymentCard, RoleWhen } from "./index";
import type { RenderPlaceName, RenderWorkLocation } from "./index";
import type { CompanyFind } from "@kaigilb/gilbplatformcode-company-search";
import { AddInformationSheet, addInformation } from "../test/chooser";
import { acts, editor, emp, type SpyEditor } from "../test/editor";

const VAULT = "https://hytta.platform.example.test/base";
const PLACE = "https://geo.platform.example.test/base/e/osm-r-2775550";
const ORG = `${VAULT}/e/06gk0000000000000000000009`;
let fetchSpy: ReturnType<typeof vi.fn>;
let find: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response("{}", { status: 404 }));
  vi.stubGlobal("fetch", fetchSpy);
  find = vi.fn(async () => ({ hits: [], complete: true }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type CardProps = Partial<Parameters<typeof EmploymentCard>[0]>;
const props = (e: SpyEditor, over: CardProps = {}): Parameters<typeof EmploymentCard>[0] => ({
  title: "Employment",
  editor: e,
  editMode: true,
  recordsVaultId: VAULT,
  vaultName: "Hytta",
  find: find as unknown as CompanyFind,
  ...over,
});
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
/** The card in a record card's modes (presentation until a click), with the chooser's stand-in. */
const managed = (e: SpyEditor, over: CardProps = {}, canEdit = true) => (
  <QueryClientProvider client={qc()}>
    <CardModeProvider canEdit={canEdit}>
      <CardModeBar />
      <EmploymentCard {...props(e, over)} />
      <AddInformationSheet />
    </CardModeProvider>
  </QueryClientProvider>
);
/** The card with no modes (always editing, as a card outside a record card). */
const plain = (e: SpyEditor, over: CardProps = {}) => (
  <QueryClientProvider client={qc()}>
    <EmploymentCard {...props(e, over)} />
  </QueryClientProvider>
);
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");
const slotPlace: RenderPlaceName = (p) => <p data-testid="slot-place">{p.placeLabel || "A place"}</p>;
const slotLocation: RenderWorkLocation = (p) => (
  <button type="button" data-testid="slot-location" onClick={() => p.onChange({ placeId: `${PLACE}-2`, placeLabel: "Bergen" })}>
    {p.placeLabel || "Location"}
  </button>
);

describe("Employment, in the card's two modes (ported from the source)", () => {
  it("presentation: a card with no content, and an employment with nothing in it, is not drawn", () => {
    render(managed(editor([emp({ company: "", titles: [{ key: "t0", value: "" }], role: undefined })])));
    expect(screen.queryByTestId("employment-rows")).toBeNull();
  });

  it("presentation: a blank employment beside a real one is not drawn", () => {
    render(managed(editor([emp(), emp({ key: "e2", company: "", titles: [{ key: "t0", value: "" }], role: undefined })])));
    expect(screen.getAllByTestId("employment-row")).toHaveLength(1);
  });

  it("a click on the company turns edit mode on: the (−), the add rows and the editable role appear; with no place slot there is no Location box", async () => {
    render(managed(editor([emp()])));
    await userEvent.click(screen.getByTestId("employment-company-value"));
    expect(modeOf()).toBe("edit");
    expect(document.querySelectorAll("[data-remove-control]").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("add employment")).toBeTruthy();
    expect(screen.getByText("add job title")).toBeTruthy();
    expect(screen.getByLabelText("Role start")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Role location" })).toBeNull();
  });

  it("on a card with no employment the chooser adds the group with the company box (the way to add the first one)", async () => {
    render(managed(editor([])));
    expect(screen.queryByTestId("employment-rows")).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByTestId("employment-rows")).toBeNull();
    await addInformation("Employment");
    expect(screen.getByTestId("employment-section-default")).toBeTruthy();
  });

  it("a card that may not be written shows the text with nothing to click", () => {
    render(
      <QueryClientProvider client={qc()}>
        <CardModeProvider canEdit={false}>
          <EmploymentCard {...props(editor([emp()]), { editMode: false })} />
        </CardModeProvider>
      </QueryClientProvider>,
    );
    expect(within(screen.getByTestId("employment-rows")).getByTestId("employment-company-value").tagName).toBe("P");
  });

  it("s10: after the pick from + Add information the company box is open and has the focus; nothing is focused on loading", async () => {
    render(managed(editor([])));
    expect(document.activeElement).toBe(document.body);
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Employment");
    const box = screen.getByPlaceholderText("Add company");
    expect(box.tagName).toBe("INPUT");
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard("Lar");
    expect((box as HTMLInputElement).value).toBe("Lar");
  });

  it("s10: no focus on loading", () => {
    render(managed(editor([emp()])));
    expect(document.activeElement).toBe(document.body);
  });

  it("RoleWhen ongoing: choosing nothing else, a role whose current state was never said commits current null (through the Location slot)", () => {
    const onCommit = vi.fn();
    render(
      <RoleWhen
        start="2019-03"
        end=""
        current={null}
        placeId={PLACE}
        placeLabel="Oslo"
        onCommit={onCommit}
        renderWorkLocation={(p) => (
          <button type="button" aria-label="Role location" onClick={() => p.onChange({ placeId: "", placeLabel: "" })}>
            {p.placeLabel}
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByLabelText("Role location"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![0].current).toBe(null);
  });
});

describe("presentation, new", () => {
  it("company, role line and title read as text in a framed group; nothing that edits, no place", () => {
    render(managed(editor([emp({ role: { start: "2024-03", end: "", current: true, placeId: PLACE, placeLabel: "Oslo" } })])));
    const g = screen.getByRole("region", { name: "Employment" });
    expect(g.querySelector("svg[data-card-icon='employment']")).toBeTruthy();
    expect(screen.getByTestId("employment-company-value").textContent).toBe("Larsen & Co");
    expect(screen.getByTestId("employment-title-value").textContent).toBe("Product lead");
    expect(screen.getByTestId("experience-role").textContent).toMatch(/Mar 2024 – Present/);
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.queryByText(/add employment|add job title/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/Oslo|A place/)).toBeNull();
  });
});

describe("zero writes: mount, render, idle, a change of mode", () => {
  const worlds: [string, () => SpyEditor][] = [
    ["no employment", () => editor([])],
    ["one", () => editor([emp()])],
    ["two, one with a stored place", () => editor([emp(), emp({ key: "e2", company: "Beta", role: { start: "2019-03", end: "2021-06", current: false, placeId: PLACE, placeLabel: "" } })])],
    ["an edge that did not read, and a legacy text", () => editor([emp()], { unresolved: [`${VAULT}/e/gone`], legacyText: ["Acme (old text)"] })],
    ["a read error", () => editor([], { error: "Employment could not be read right now." })],
  ];
  for (const [name, make] of worlds) {
    it(`${name}: nothing is asked and nothing written, over 2 s, re-renders, and editMode and canEdit flipped`, () => {
      vi.useFakeTimers();
      const e = make();
      const view = render(managed(e));
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      for (const editMode of [false, true, false, true]) view.rerender(managed(e, { editMode }));
      view.rerender(managed(e, {}, false));
      view.rerender(managed(e, {}, true));
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      view.rerender(plain(e));
      view.rerender(plain(e, { editMode: false }));
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(acts(e)).toBe(0);
      expect(find).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("opening the company box, typing and leaving it, and Escape, write nothing (the finder is only asked, a read)", async () => {
    const e = editor([emp()]);
    render(plain(e));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    await new Promise((r) => setTimeout(r, 350));
    expect(acts(e)).toBe(0);
    const box = screen.getByLabelText("Edit Employment Company");
    fireEvent.change(box, { target: { value: "Lars" } });
    fireEvent.blur(box);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(acts(e)).toBe(0);
  });

  it("focusing a title and leaving it without a change, Enter without a change, and Escape after a change write nothing", () => {
    const e = editor([emp()]);
    render(plain(e));
    fireEvent.click(screen.getByLabelText("Edit Employment Job title"));
    let box = screen.getByLabelText("Edit Employment Job title");
    fireEvent.blur(box);
    fireEvent.click(screen.getByLabelText("Edit Employment Job title"));
    box = screen.getByLabelText("Edit Employment Job title");
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByLabelText("Edit Employment Job title"));
    box = screen.getByLabelText("Edit Employment Job title");
    fireEvent.change(box, { target: { value: "Changed" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(acts(e)).toBe(0);
    expect(screen.getByLabelText("Edit Employment Job title").textContent).toBe("Product lead");
  });

  it("a change of the role from outside (the state re-read) commits nothing", () => {
    const e = editor([emp()]);
    const view = render(plain(e));
    view.rerender(plain(editor([emp({ role: { start: "2020-01", end: "2021-01", current: false, placeId: PLACE, placeLabel: "" } })]), {}));
    expect(acts(e)).toBe(0);
    const onCommit = vi.fn();
    const r = render(<RoleWhen start="2020-01" end="" current={null} placeId="" placeLabel="" onCommit={onCommit} />);
    r.rerender(<RoleWhen start="2021-01" end="2022-01" current={false} placeId={PLACE} placeLabel="" onCommit={onCommit} />);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("each act asks the editor for exactly that", () => {
  const STORED = { start: "2019-03", end: "2021-06", current: false as boolean | null, placeId: PLACE, placeLabel: "" };
  const roleOf = (over: Partial<typeof STORED> = {}) => emp({ role: { ...STORED, ...over } });

  it("a start month: the role as it was, the start changed, the stored place carried (no slot)", () => {
    const e = editor([roleOf()]);
    render(plain(e));
    fireEvent.change(screen.getByLabelText("Role start"), { target: { value: "2018-09" } });
    expect(e.editEmploymentRole.mock.calls).toEqual([["e1", { start: "2018-09", end: "2021-06", current: false, placeId: PLACE, placeLabel: "" }]]);
  });

  it("clearing a month asks for an empty month, and only that", () => {
    const e = editor([roleOf()]);
    render(plain(e));
    fireEvent.change(screen.getByLabelText("Role start"), { target: { value: "" } });
    expect(e.editEmploymentRole.mock.calls).toEqual([["e1", { start: "", end: "2021-06", current: false, placeId: PLACE, placeLabel: "" }]]);
  });

  it("an end month on a role whose current state was never said keeps current null (never false)", () => {
    const e = editor([roleOf({ end: "", current: null })]);
    render(plain(e));
    fireEvent.change(screen.getByLabelText("Role end"), { target: { value: "2022-05" } });
    expect(e.editEmploymentRole.mock.calls).toEqual([["e1", { start: "2019-03", end: "2022-05", current: null, placeId: PLACE, placeLabel: "" }]]);
  });

  it("Present on clears the end and says current; off says not current and keeps the end empty", () => {
    const e = editor([roleOf()]);
    render(plain(e));
    fireEvent.click(screen.getByLabelText("Role is current"));
    expect(e.editEmploymentRole.mock.calls[0]).toEqual(["e1", { start: "2019-03", end: "", current: true, placeId: PLACE, placeLabel: "" }]);
    fireEvent.click(screen.getByLabelText("Role is current"));
    expect(e.editEmploymentRole.mock.calls[1]).toEqual(["e1", { start: "2019-03", end: "", current: false, placeId: PLACE, placeLabel: "" }]);
  });

  it("a role stored as current with an end month: any act sends the end empty (Present wins)", () => {
    const e = editor([roleOf({ end: "2021-06", current: true })]);
    render(plain(e));
    fireEvent.change(screen.getByLabelText("Role start"), { target: { value: "2018-09" } });
    expect(e.editEmploymentRole.mock.calls).toEqual([["e1", { start: "2018-09", end: "", current: true, placeId: PLACE, placeLabel: "" }]]);
  });

  it("with two employments each act goes to the row it was made in", () => {
    const e = editor([emp(), emp({ key: "e2", company: "Beta", titles: [{ key: "t0", value: "CTO" }, { key: "t1", value: "Founder" }] })]);
    render(plain(e));
    fireEvent.click(screen.getByRole("button", { name: "Remove employment Beta" }));
    expect(e.deleteEmployment.mock.calls).toEqual([["e2"]]);
    const row2 = within(screen.getAllByTestId("employment-row")[1]!);
    fireEvent.click(row2.getAllByRole("button", { name: "Remove Job title" })[1]!);
    expect(e.deleteJobTitle.mock.calls).toEqual([["e2", "t1"]]);
    fireEvent.click(row2.getAllByText("add job title")[0]!);
    expect(e.addJobTitle.mock.calls).toEqual([["e2"]]);
    fireEvent.change(row2.getByLabelText("Role start"), { target: { value: "2020-01" } });
    expect(e.editEmploymentRole.mock.calls[0]![0]).toBe("e2");
  });

  it("a role with no stored place asks with an empty place (nothing invented)", () => {
    const e = editor([emp({ role: undefined })]);
    render(plain(e));
    fireEvent.change(screen.getByLabelText("Role start"), { target: { value: "2020-02" } });
    expect(e.editEmploymentRole.mock.calls).toEqual([["e1", { start: "2020-02", end: "", current: null, placeId: "", placeLabel: "" }]]);
  });

  it("a title: edit, clear, remove, add", () => {
    const e = editor([emp()]);
    render(plain(e));
    fireEvent.click(screen.getByLabelText("Edit Employment Job title"));
    fireEvent.change(screen.getByLabelText("Edit Employment Job title"), { target: { value: "Chair" } });
    fireEvent.keyDown(screen.getByLabelText("Edit Employment Job title"), { key: "Enter" });
    expect(e.editJobTitle.mock.calls).toEqual([["e1", "t0", "Chair"]]);
    fireEvent.click(screen.getByLabelText("Edit Employment Job title"));
    fireEvent.change(screen.getByLabelText("Edit Employment Job title"), { target: { value: "  " } });
    fireEvent.blur(screen.getByLabelText("Edit Employment Job title"));
    expect(e.editJobTitle.mock.calls[1]).toEqual(["e1", "t0", ""]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Job title" }));
    expect(e.deleteJobTitle.mock.calls).toEqual([["e1", "t0"]]);
    fireEvent.click(screen.getByText("add job title"));
    expect(e.addJobTitle.mock.calls).toEqual([["e1"]]);
  });

  it("the company: typed text, a record, remove; and the empty card's box adds", async () => {
    const e = editor([emp()]);
    find.mockResolvedValue({ hits: [{ uri: ORG, label: "Butikk AS" }], complete: true });
    render(plain(e));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Buti" } });
    fireEvent.click(await screen.findByTestId(`company-search-hit-${ORG}`));
    expect(e.editEmploymentCompany.mock.calls).toEqual([["e1", "Butikk AS", { uri: ORG }]]);
    find.mockResolvedValue({ hits: [], complete: true });
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Gamma Ltd" } });
    fireEvent.click(await screen.findByTestId("company-use-typed"));
    expect(e.editEmploymentCompany.mock.calls[1]).toEqual(["e1", "Gamma Ltd"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove employment Larsen & Co" }));
    expect(e.deleteEmployment.mock.calls).toEqual([["e1"]]);
  });

  it("the empty card: a company typed adds one employment with the name; a record adds the record too; 'add employment' adds a blank one", async () => {
    const e = editor([]);
    find.mockResolvedValue({ hits: [{ uri: ORG, label: "Butikk AS" }], complete: true });
    render(plain(e));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Buti" } });
    fireEvent.click(await screen.findByTestId(`company-search-hit-${ORG}`));
    expect(e.addEmployment.mock.calls).toEqual([[{ company: "Butikk AS", employer: { uri: ORG } }]]);
    find.mockResolvedValue({ hits: [], complete: true });
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    fireEvent.click(await screen.findByTestId("company-use-typed"));
    expect(e.addEmployment.mock.calls[1]).toEqual([{ company: "Zeta" }]);
    fireEvent.click(screen.getByText("add employment"));
    expect(e.addEmployment.mock.calls[2]).toEqual([]);
  });

  it("a failed row shows 'not saved · retry', and the retry asks the editor to retry", () => {
    const e = editor([emp()], { status: { "emp:e1": "failed", "emp:e1:t0": "saving" } });
    render(plain(e));
    expect(screen.getByText("saving")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not saved — retry" }));
    expect(e.retryOutbox).toHaveBeenCalledTimes(1);
  });

  it("read-only: the controls are disabled or absent and nothing can be asked", () => {
    const e = editor([emp()]);
    render(plain(e, { editMode: false }));
    expect((screen.getByTestId("company-search-closed") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Edit Employment Job title") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Role start")).toBeNull();
    expect(screen.queryByText("add employment")).toBeNull();
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
  });
});

describe("the work place is a slot", () => {
  it("absent: no place is drawn in any mode, and an employment with only a place is not drawn in presentation", () => {
    const only = emp({ company: "", titles: [{ key: "t0", value: "" }], role: { start: "", end: "", current: null, placeId: PLACE, placeLabel: "Oslo" } });
    render(managed(editor([only])));
    expect(screen.queryByTestId("employment-rows")).toBeNull();
    cleanup();
    render(plain(editor([emp({ role: { start: "2024-03", end: "", current: true, placeId: PLACE, placeLabel: "Oslo" } })]), { editMode: false }));
    expect(screen.queryByText("Oslo")).toBeNull();
    expect(screen.getByTestId("experience-role").textContent).not.toMatch(/Oslo/);
    cleanup();
    render(plain(editor([emp({ role: { start: "2024-03", end: "", current: true, placeId: PLACE, placeLabel: "Oslo" } })])));
    expect(screen.queryByText("Oslo")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Role location" })).toBeNull();
  });

  it("present: the name slot is drawn in presentation and read-only with the stored place, and an employment with only a place counts as content", () => {
    const only = emp({ company: "", titles: [{ key: "t0", value: "" }], role: { start: "", end: "", current: null, placeId: PLACE, placeLabel: "Oslo" } });
    render(managed(editor([only]), { renderPlaceName: slotPlace }));
    expect(screen.getByTestId("slot-place").textContent).toBe("Oslo");
    cleanup();
    render(plain(editor([emp({ role: { start: "2024-03", end: "", current: true, placeId: PLACE, placeLabel: "" } })]), { editMode: false, renderPlaceName: slotPlace }));
    expect(screen.getByTestId("slot-place").textContent).toBe("A place");
  });

  it("present: the Location slot is not drawn when the card may not be edited", () => {
    render(plain(editor([emp({ role: { start: "2019-03", end: "", current: true, placeId: PLACE, placeLabel: "Oslo" } })]), { editMode: false, renderWorkLocation: slotLocation, renderPlaceName: slotPlace }));
    expect(screen.queryByTestId("slot-location")).toBeNull();
    expect(screen.getByTestId("slot-place").textContent).toBe("Oslo");
  });

  it("present: the Location slot is drawn in edit mode with the stored place; choosing another commits the role with it, and nothing else changed", () => {
    const e = editor([emp({ role: { start: "2019-03", end: "2021-06", current: false, placeId: PLACE, placeLabel: "Oslo" } })]);
    render(plain(e, { renderWorkLocation: slotLocation }));
    expect(screen.getByTestId("slot-location").textContent).toBe("Oslo");
    fireEvent.click(screen.getByTestId("slot-location"));
    expect(e.editEmploymentRole.mock.calls).toEqual([["e1", { start: "2019-03", end: "2021-06", current: false, placeId: `${PLACE}-2`, placeLabel: "Bergen" }]]);
  });

  it("the card's source imports nothing of a place catalogue, a directory finder or a host", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src", "EmploymentCard.tsx"), "utf8");
    const specs = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(specs.sort()).toEqual(
      [
        "@kaigilb/gilbplatformcode-card-group",
        "@kaigilb/gilbplatformcode-card-mode",
        "@kaigilb/gilbplatformcode-company-search",
        "@kaigilb/gilbplatformcode-employments-state",
        "@kaigilb/gilbplatformcode-remove-control",
        "@kaigilb/gilbplatformcode-role-when",
        "react",
      ].sort(),
    );
    expect(src).not.toMatch(/org-find|findOrgs|baseGeo|geo-/i);
  });
});

describe("a company and a role show by name, never by an address", () => {
  const ADDR_EMP = emp({
    key: `${VAULT}/e/06gk00000000000000000000aa`,
    uri: `${VAULT}/e/06gk00000000000000000000aa`,
    company: "https://acme.example.test/base/e/06gk00000000000000000000bb",
    titles: [{ key: "t0", value: "base:e/06gk00000000000000000000cc" }, { key: "t1", value: "Chair" }],
    employer: ORG,
    employerStored: ORG,
    role: { start: "2019-03", end: "", current: true, placeId: PLACE, placeLabel: "" },
  });

  function visibleStrings(): string[] {
    const all = [...document.body.querySelectorAll("*")];
    return [
      document.body.textContent ?? "",
      ...all.flatMap((el) => ["aria-label", "title", "placeholder", "value", "alt"].map((a) => el.getAttribute(a) ?? "")),
      ...(all.filter((el) => el instanceof HTMLInputElement) as HTMLInputElement[]).map((i) => i.value),
    ];
  }
  const noAddress = () => {
    for (const s of visibleStrings()) {
      expect(s).not.toContain("://");
      expect(s).not.toContain("06gk");
      expect(s).not.toContain("base:e/");
      expect(s).not.toContain("osm-");
    }
  };

  it("presentation: an address stored as the company or the role reads 'A company' / 'A role'", () => {
    render(managed(editor([ADDR_EMP])));
    expect(screen.getByTestId("employment-company-value").textContent).toBe("A company");
    expect(screen.getAllByTestId("employment-title-value").map((n) => n.textContent)).toEqual(["A role", "Chair"]);
    noAddress();
  });

  it("a card that may not be written (plain text, nothing to click): the same", () => {
    render(managed(editor([ADDR_EMP]), { editMode: false }, false));
    expect(screen.getByTestId("employment-company-value").textContent).toBe("A company");
    expect(screen.getAllByTestId("employment-title-value").map((n) => n.textContent)).toEqual(["A role", "Chair"]);
    noAddress();
  });

  it("edit and read-only: the same, including the labels of the remove and edit controls and the boxes", async () => {
    render(plain(editor([ADDR_EMP])));
    expect(screen.getByTestId("company-search-closed").textContent).toBe("A company");
    expect(screen.getByRole("button", { name: "Remove employment A company" })).toBeTruthy();
    expect(screen.getAllByLabelText("Edit Employment Job title").map((n) => n.textContent)).toEqual(["A role", "Chair"]);
    fireEvent.click(screen.getByTestId("company-search-closed"));
    noAddress();
    cleanup();
    render(plain(editor([ADDR_EMP]), { editMode: false }));
    noAddress();
  });

  it("an edit box opened on a role that is an address shows the word, and leaving it unchanged asks nothing", () => {
    const e = editor([ADDR_EMP]);
    render(plain(e));
    fireEvent.click(screen.getAllByLabelText("Edit Employment Job title")[0]!);
    const box = screen.getAllByLabelText("Edit Employment Job title").find((n) => n.tagName === "INPUT") as HTMLInputElement;
    expect(box.value).toBe("A role");
    noAddress();
    fireEvent.blur(box);
    expect(e.editJobTitle).not.toHaveBeenCalled();
  });

  it("unresolved edges are counted, never listed; the read error and the unknown vault are fixed sentences", () => {
    const e = editor([emp()], { unresolved: [`${VAULT}/e/06gk00000000000000000000dd`, `${VAULT}/e/06gk00000000000000000000ee`], error: "Employment could not be read right now. This is not a statement that there is none." });
    render(plain(e));
    expect(screen.getByTestId("employment-unresolved").textContent).toBe("2 employments this record links to could not be read. They are kept as stored.");
    noAddress();
    cleanup();
    render(plain(editor([]), { vaultUnknown: true, recordsVaultId: null }));
    noAddress();
  });

  it("a record that names an employment with no company text but a link draws no address", () => {
    render(managed(editor([emp({ company: "", employer: ORG, employerStored: ORG, titles: [{ key: "t0", value: "CEO" }] })])));
    noAddress();
  });
});

describe("unknown is not empty", () => {
  it("U1: the vault that holds the employments is not known: one sentence, the group is drawn, nothing to add", () => {
    render(managed(editor([]), { vaultUnknown: true, recordsVaultId: null, editMode: false }));
    expect(screen.getByTestId("employment-vault-unknown").textContent).toBe(
      "Employment is stored in a vault that is not known here, so it is not shown. This is not a statement that there is none.",
    );
    expect(screen.getByTestId("employment-rows")).toBeTruthy();
    expect(screen.queryByTestId("employment-section-default")).toBeNull();
  });

  it("U1: without the flag, a card with nothing in it is not drawn (that is a statement the state can make)", () => {
    render(managed(editor([])));
    expect(screen.queryByTestId("employment-rows")).toBeNull();
    expect(screen.queryByTestId("employment-vault-unknown")).toBeNull();
  });

  it("U2: a failed read says so and withholds the add box, and 'add employment'", () => {
    const text = "Employment could not be read right now. This is not a statement that there is none.";
    render(plain(editor([], { error: text })));
    expect(screen.getByRole("alert").textContent).toBe(text);
    expect(screen.queryByTestId("employment-section-default")).toBeNull();
    expect(screen.queryByText("add employment")).toBeNull();
    cleanup();
    render(plain(editor([emp()], { error: text })));
    expect(screen.getByRole("alert").textContent).toBe(text);
    expect(screen.queryByText("add employment")).toBeNull();
  });

  it("U2: with no error and the read done, the add box is there; while still reading it is not", () => {
    render(plain(editor([])));
    expect(screen.getByTestId("employment-section-default")).toBeTruthy();
    cleanup();
    render(plain(editor([], { loading: true })));
    expect(screen.queryByTestId("employment-section-default")).toBeNull();
  });

  it("an edge that did not read is said once and the others show", () => {
    render(plain(editor([emp()], { unresolved: [`${VAULT}/e/gone`] })));
    expect(screen.getByTestId("employment-unresolved").textContent).toContain("One employment this record links to could not be read.");
    expect(screen.getAllByTestId("employment-row")).toHaveLength(1);
  });
});

describe("the company box says what it searched", () => {
  it("names the vault it was given when the answer is not complete, and draws no miss; a complete miss is 'No organization record named …'", async () => {
    find.mockResolvedValue({ hits: [], complete: false });
    render(plain(editor([emp()])));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    expect((await screen.findByTestId("company-search-incomplete")).textContent).toContain("Not every record in Hytta was searched.");
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
    expect(find).toHaveBeenCalledWith(VAULT, "Zeta");
    cleanup();
    find.mockResolvedValue({ hits: [], complete: true });
    render(plain(editor([emp()]), { vaultName: undefined }));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    expect((await screen.findByTestId("company-search-miss")).textContent).toBe("No organization record named “Zeta” in this vault.");
  });

  it("a failed search is said, with the vault; with no vault nothing is searched", async () => {
    find.mockRejectedValue(new Error("503"));
    render(plain(editor([emp()])));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    expect((await screen.findByRole("alert")).textContent).toContain("The search of Hytta could not be made.");
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
    cleanup();
    find.mockClear();
    render(plain(editor([emp()]), { recordsVaultId: null }));
    fireEvent.click(screen.getByTestId("company-search-closed"));
    fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    await screen.findByTestId("company-search-not-made");
    expect(find).not.toHaveBeenCalled();
  });
});
