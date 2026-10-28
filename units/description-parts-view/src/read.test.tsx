import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DescriptionPartsHostContext, PlanDescriptionParts } from "./index";
import { ASSUMPTION_TYPE, AMES, Frame, PLAN_VAULT, SCREEN, SOL_ID, bonesFixture, makeWorld, part, settle, sequence, solution, uriOf } from "../test/fakeHost";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";

afterEach(() => cleanup());

const parts = () => [...document.querySelectorAll("[data-part]")].map((el) => el.getAttribute("data-part"));

describe("the tree", () => {
  it("draws every part from the host's finds, with its tag, in order, at any depth", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    expect(parts()).toEqual(["bones", "hip", "knee", "feet"]);
    const tags = [...document.querySelectorAll("[data-part]")].map((el) => el.getAttribute("data-part-tag"));
    expect(tags).toEqual(["Sol.Bones", "Sol.Bones.Hip", "Sol.Bones.Knee", "Sol.Feet"]);
    // A sub-part is drawn with an en dash in front and indented.
    expect(document.querySelector('[data-part="hip"]')!.className).toContain("pl-6");
    expect(document.querySelector('[data-part="bones"]')!.className).not.toContain("pl-6");
  });

  it("asks the host for the top find of the record at its own vault, with the cap 300, and for the deeper finds of the parts it found", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} vaultId={SCREEN} />);
    const top = world.callsOf("usePlanFind")[0]!;
    expect(top.args).toEqual([PLAN_VAULT, "a:partOf", SOL_ID, 300]);
    expect(world.callsOf("useRecords")[0]!.args).toEqual([PLAN_VAULT]);
    const last = world.callsOf("useSubFinds").at(-1)!;
    expect(last.args[0]).toBe(PLAN_VAULT);
    expect(last.args[1]).toBe("a:partOf");
    expect([...(last.args[2] as string[])].sort()).toEqual(["bones", "feet", "hip", "knee"]);
  });

  it("uses the record's own vault when no planVault is given, else the screen vault", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(
      <DescriptionPartsHostContext.Provider value={host}>
        <CardModeProvider canEdit startEditing>
          <PlanDescriptionParts record={world.record} vaultId={SCREEN} canEdit onOpen={() => {}} onNotice={() => {}} onBindAdd={() => {}} />
        </CardModeProvider>
      </DescriptionPartsHostContext.Provider>,
    );
    expect(world.callsOf("usePlanFind")[0]!.args[0]).toBe(PLAN_VAULT);
    cleanup();
    const noAddress = solution({ entityUri: undefined });
    const second = makeWorld({ record: noAddress });
    render(
      <DescriptionPartsHostContext.Provider value={second.host}>
        <CardModeProvider canEdit startEditing>
          <PlanDescriptionParts record={noAddress} vaultId={SCREEN} canEdit onOpen={() => {}} onNotice={() => {}} onBindAdd={() => {}} />
        </CardModeProvider>
      </DescriptionPartsHostContext.Provider>,
    );
    expect(second.world.callsOf("useRecords")[0]!.args[0]).toBe(SCREEN);
    // With no address the find is not asked for (the parent is null).
    expect(second.world.callsOf("usePlanFind")[0]!.args[2]).toBeNull();
  });

  it("in Edit every part is one row with data-part-row and the five buttons in data-part-moves", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const row = document.querySelector('[data-part-row="bones"]')!;
    expect(row).toBeTruthy();
    const moves = document.querySelector('[data-part-moves="bones"]')!;
    expect([...moves.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Move Bones up",
      "Move Bones down",
      "Move Bones out a level",
      "Move Bones in (no part above to go under)",
      "Remove Bones",
    ]);
    expect([...moves.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["↑", "↓", "←", "→", "×"]);
    expect(within(row as HTMLElement).getByText("Sol.Bones")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Drag Bones" }).getAttribute("data-tree-handle")).toBe("bones");
  });

  it("disables the buttons that cannot apply: first up, last down, top out, and in with no part above", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const dis = (name: string) => (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
    expect(dis("Move Bones up")).toBe(true);
    expect(dis("Move Bones down")).toBe(false);
    expect(dis("Move Feet down")).toBe(true);
    expect(dis("Move Feet out a level")).toBe(true);
    expect(dis("Move Hip out a level")).toBe(false);
    expect(dis("Move Hip in (no part above to go under)")).toBe(true);
    expect(dis("Move Knee in under Hip")).toBe(false);
    expect(dis("Move Feet in under Bones")).toBe(false);
  });

  it("an assumption never goes in or out across the Assumption part, so those buttons are disabled", () => {
    const world0 = makeWorld({
      parts: [
        ...bonesFixture(),
        part("assume", "Sol.Assumption", SOL_ID, 3, "", { type: ASSUMPTION_TYPE }),
        part("floor", "Sol.Assumption.Floor", "assume", 1, "The floor is flat.", { type: ASSUMPTION_TYPE }),
      ],
    });
    render(<Frame host={world0.host} world={world0.world} />);
    const dis = (name: string) => (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
    // The Assumption part is after Feet, which is not an assumption: it cannot go under it.
    expect(dis("Move Assumption in under Feet")).toBe(true);
    // The assumption cannot leave the Assumption part: its grandparent level is the Solution, which is not one.
    expect(dis("Move Floor out a level")).toBe(true);
  });

  it("reading mode draws Keyword: text, the source under the text, and no buttons", () => {
    const withSource = bonesFixture();
    withSource[0] = part("bones", "Sol.Bones", SOL_ID, 1, "The leg has 26 bones.", { sources: [{ "a:sourceOf": "a:body", "a:source": "Dr Ames" }] });
    const { world, host } = makeWorld({ parts: withSource });
    render(<Frame host={host} world={world} editing={false} />);
    expect(document.querySelectorAll("[data-part-moves]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-part-row]")).toHaveLength(0);
    expect(document.querySelector('[data-part="bones"]')!.textContent).toContain("Bones: The leg has 26 bones.");
    const source = document.querySelector('[data-part-source="bones"]')!;
    expect(source.textContent).toContain("Dr Ames");
    // Parts with no source have no source line in reading mode.
    expect(document.querySelector('[data-part-source="feet"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Part" })).toBeNull();
  });

  it("in Edit a part's source is hidden until the part is opened", async () => {
    const withSource = bonesFixture();
    withSource[0] = part("bones", "Sol.Bones", SOL_ID, 1, "The leg has 26 bones.", { sources: [{ "a:sourceOf": "a:body", "a:source": "Dr Ames" }] });
    const { world, host } = makeWorld({ parts: withSource });
    render(<Frame host={host} world={world} />);
    expect(document.querySelector('[data-part-source="bones"]')).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "The leg has 26 bones." }));
    expect(document.querySelector('[data-part-source="bones"]')).not.toBeNull();
    // The open part shows the text editor in place of the text button.
    expect(screen.getByLabelText("Edit Bones")).toBeTruthy();
  });

  it("clicking a keyword opens the record through onOpen", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const opened: string[] = [];
    render(<Frame host={host} world={world} onOpen={(id) => opened.push(id)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Hip" }));
    expect(opened).toEqual(["hip"]);
  });

  it("shows 'No description yet' only when there are no parts, no older text and no add row", async () => {
    const { world, host } = makeWorld();
    render(<Frame host={host} world={world} />);
    expect(screen.getByText("No description yet")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "+ Part" }));
    expect(screen.queryByText("No description yet")).toBeNull();
  });

  it("shows the older description text, with its source, and says parts are to be added", () => {
    const rec = solution({
      facts: { unitTag: "Sol", body: "The older text." },
      served: { facts: { unitTag: "Sol", body: "The older text.", lineSources: [{ "a:sourceOf": "a:body", "a:source": "Dr Ames" }] }, context: null, etag: '"s1"' },
    });
    const { world, host } = makeWorld({ record: rec });
    render(<Frame host={host} world={world} />);
    expect(screen.getByText("The older text.")).toBeTruthy();
    expect(screen.getByText("Older description — add parts below")).toBeTruthy();
    expect(screen.queryByText("No description yet")).toBeNull();
    cleanup();
    const second = makeWorld({ record: rec, parts: bonesFixture() });
    render(<Frame host={second.host} world={second.world} />);
    expect(screen.getByText("Older description — written before parts. Move its text into parts.")).toBeTruthy();
  });
});

describe("read-only", () => {
  it("a host with no writers gives no add row, no +buttons, no move buttons, no remove, no drag handle", () => {
    const { world, host } = makeWorld({ parts: bonesFixture(), readOnly: true });
    render(<Frame host={host} world={world} />);
    expect(parts()).toEqual(["bones", "hip", "knee", "feet"]);
    expect(document.querySelectorAll("[data-part-moves]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-tree-handle]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "+ Part" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Assumption" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paste parts" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    // The text is plain text, not a button that opens an editor.
    expect(screen.queryByRole("button", { name: "The leg has 26 bones." })).toBeNull();
    expect(document.querySelector('[data-part="bones"]')!.textContent).toContain("Bones: The leg has 26 bones.");
  });

  it.each(["createRecord", "patchRecord", "useDeleteRecord"] as const)("a host without %s alone is read-only too", (name) => {
    const { world, host } = makeWorld({ parts: bonesFixture(), without: [name] });
    render(<Frame host={host} world={world} />);
    expect(screen.queryByRole("button", { name: "+ Part" })).toBeNull();
    expect(document.querySelectorAll("[data-part-moves]")).toHaveLength(0);
  });

  it("canEdit false is read-only on a full host", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "+ Part" })).toBeNull();
    expect(document.querySelectorAll("[data-part-moves]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "The leg has 26 bones." })).toBeNull();
  });

  it("a read-only host still reads: the finds are asked for and nothing is written", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture(), readOnly: true });
    render(<Frame host={host} world={world} />);
    await settle();
    expect(world.callsOf("usePlanFind").length).toBeGreaterThan(0);
    expect(sequence(world, ["createRecord", "patchRecord", "deleteRecord", "storePlanRow"])).toEqual([]);
  });
});

describe("the host context", () => {
  it("throws an error naming the context when no provider is above", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { world } = makeWorld();
    expect(() => render(<Frame host={null} world={world} />)).toThrow(/DescriptionPartsHostContext/);
    err.mockRestore();
  });
});

describe("onBindAdd", () => {
  it("is called on every render with a function that opens the add row", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    const bound: (() => void)[] = [];
    render(<Frame host={host} world={world} onBindAdd={(open) => bound.push(open)} />);
    expect(bound.length).toBeGreaterThan(0);
    const before = bound.length;
    act(() => bound.at(-1)!());
    expect(bound.length).toBeGreaterThan(before);
    expect(screen.getByLabelText("Keyword")).toBeTruthy();
    // It asks for the text box to be focused, not the Keyword.
    expect(document.activeElement).toBe(screen.getByLabelText("Text"));
  });
});

describe("a source", () => {
  it("is read from the part's line sources and drawn by the plan-source unit under the text", () => {
    const withSource = bonesFixture();
    withSource[3] = part("feet", "Sol.Feet", SOL_ID, 2, "The feet touch the ground.", { sources: [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": AMES } }] });
    const { world, host } = makeWorld({ parts: withSource });
    render(<Frame host={host} world={world} editing={false} />);
    expect(document.querySelector('[data-part-source="feet"]')!.textContent).toContain("Dr Ames");
  });
});

describe("the levels the host could not read whole", () => {
  it("a cut level says so, offers Try again, and the arrows read the whole level first", async () => {
    const { world, host } = makeWorld({ parts: [...bonesFixture(), part("wheel", "Sol.Wheel", SOL_ID, 3, "A wheel.")] });
    render(<Frame host={host} world={world} />);
    act(() => world.cutLevel(SOL_ID, 2));
    expect(screen.getByText("Showing the first 2 of 3 parts at this level.")).toBeTruthy();
    expect(screen.getByText("Some parts at this level are not shown. Moves here read the whole level first.")).toBeTruthy();
    world.clearCalls();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    // One re-read of the record's level, then one of each part's level, each with every member (no options).
    const lines = sequence(world, ["invalidatePlanFind"]);
    expect(lines[0]).toBe('invalidatePlanFind "PV" "a:partOf" "sol1" undefined');
    expect(lines.slice(1).sort()).toEqual(["bones", "feet", "hip", "knee"].map((id) => `invalidatePlanFind "PV" "a:partOf" "${id}" undefined`).sort());
  });

  it("a top find that failed shows only 'Could not read the parts' and no tree; a deeper one shows the partial sentence", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    // The failed read leaves the find's earlier answer in place; the tree is still not drawn from it.
    world.errors.add(SOL_ID);
    render(<Frame host={host} world={world} />);
    expect(world.finds.get(`${PLAN_VAULT}|a:partOf|${SOL_ID}`)!.rows.length).toBe(2);
    expect(screen.getByRole("button", { name: "Could not read the parts — try again" })).toBeTruthy();
    expect(parts()).toEqual([]);
    expect(screen.queryByText("No description yet")).toBeNull();
    cleanup();
    const second = makeWorld({ parts: bonesFixture() });
    second.world.errors.add("bones");
    render(<Frame host={second.host} world={second.world} />);
    expect(screen.getByRole("button", { name: "Could not read the parts — try again" })).toBeTruthy();
    expect(parts()).toContain("bones");
    expect(screen.getAllByText("Some parts at this level are not shown. Moves here read the whole level first.").length).toBeGreaterThan(0);
  });
});

describe("the help buttons", () => {
  it("each + button has a help button the host draws, with the section it opens at", () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    const helps = [...document.querySelectorAll("[data-help-button]")];
    expect(helps.map((h) => h.getAttribute("aria-label"))).toEqual(["Help: + Part", "Help: + Assumption", "Help: Paste parts"]);
    expect(helps.map((h) => h.getAttribute("data-start-at"))).toEqual(["desc-part", "desc-assumption", "desc-paste"]);
  });

  it("the panel is the Description help with the card's own tag, as a Solution", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    render(<Frame host={host} world={world} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Help: + Part" }));
    const dialog = screen.getByRole("dialog", { name: "Help: the Description" });
    expect(within(dialog).getByRole("heading", { name: "The Description of a Solution" })).toBeTruthy();
    expect(dialog.textContent).toContain("Sol.Bones");
    expect(dialog.textContent).not.toContain("MySolution");
  });

  it("the panel says Function for a Function record, and uses MyFunction when the card has no tag", async () => {
    const rec = solution({ typeUri: `${PLAN_VAULT}/t/Function`, facts: {}, served: { facts: {}, context: null, etag: '"s1"' } });
    const { world, host } = makeWorld({ record: rec });
    render(<Frame host={host} world={world} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Help: Paste parts" }));
    const dialog = screen.getByRole("dialog", { name: "Help: the Description" });
    expect(within(dialog).getByRole("heading", { name: "The Description of a Function" })).toBeTruthy();
    expect(dialog.textContent).toContain("MyFunction.Step");
  });
});

describe("the cap of the part find", () => {
  it("is 300 for a Solution and 2000 for a Value or a Development Resource", () => {
    for (const [type, cap] of [["Solution", 300], ["Function", 300], ["Value", 2000], ["Resource", 2000]] as const) {
      const rec = solution({ typeUri: `${PLAN_VAULT}/t/${type}` });
      const { world, host } = makeWorld({ record: rec });
      render(<Frame host={host} world={world} />);
      expect(world.callsOf("usePlanFind")[0]!.args[3], type).toBe(cap);
      cleanup();
    }
  });
});

describe("a deeper level that is still being read", () => {
  it("counts as a level the card does not know whole: a move into it reads the level first", async () => {
    const { world, host } = makeWorld({ parts: bonesFixture() });
    world.finds.delete(`${PLAN_VAULT}|a:partOf|bones`);
    render(<Frame host={host} world={world} />);
    expect(parts()).toEqual(["bones", "feet"]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Move Feet in under Bones" }));
    await waitFor(() => expect(world.callsOf("patchRecord").length).toBeGreaterThan(0));
    expect(world.callsOf("pageChildIds").map((c) => c.args[1])).toEqual([uriOf("bones")]);
    // Bones really holds Hip (1) and Knee (2): the new last sub-part is numbered 3, from the fresh read.
    expect(world.callsOf("patchRecord")[0]!.args[1]).toEqual({ partOf: { "@id": uriOf("bones") }, elementOrder: 3 });
  });
});
