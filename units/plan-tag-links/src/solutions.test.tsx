// PlanSolutionOf (on a Solution: the Functions it solves) and PlanSolutions (on a Function: its Solutions) against a fake host.
// They are one relation read from its two ends: what one writes as source the other writes as target.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSolutionOf, PlanSolutions } from "./index";
import { VAULT, gridRow, hit, labels, makeHost, page, row, solutionRelation, uri } from "../test/fakeHost";
import { mount, pick, typeInto } from "../test/mount";
import type { ComponentProps } from "react";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const self = row("self", "Door.Fix");
const common = () => ({ record: self, vaultId: VAULT, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn() });

type Case = {
  name: string;
  testId: string;
  Component: typeof PlanSolutionOf | typeof PlanSolutions;
  /** The role this record holds in the relation, and the role of the other member. */
  mine: "role:source" | "role:target";
  theirs: "role:source" | "role:target";
  view: "source" | "target";
  label: string;
  searched: string[];
  kind: string;
  created: string;
  typeId: string;
  typeNotMade: string;
  withWritten: boolean;
};

const CASES: Case[] = [
  {
    name: "PlanSolutionOf",
    testId: "plan-solution-of",
    Component: PlanSolutionOf,
    mine: "role:source",
    theirs: "role:target",
    view: "source",
    label: "Solution of Function",
    searched: ["Function"],
    kind: "Function",
    created: "Function",
    typeId: "function",
    typeNotMade: "Function is not a type this app can create.",
    withWritten: true,
  },
  {
    name: "PlanSolutions",
    testId: "plan-solutions",
    Component: PlanSolutions,
    mine: "role:target",
    theirs: "role:source",
    view: "target",
    label: "Solutions",
    searched: ["Solution", "DesignConstraint"],
    kind: "Solution",
    created: "Solution",
    typeId: "solution",
    typeNotMade: "Solution is not a type this app can create.",
    withWritten: false,
  },
];

describe.each(CASES)("$name", (c) => {
  const C = c.Component as (p: ComponentProps<typeof PlanSolutionOf>) => React.ReactElement;
  function setup(over: Partial<ComponentProps<typeof PlanSolutionOf>> = {}, h = makeHost(), o: { editing?: boolean } = {}) {
    const p = { ...common(), onWritten: vi.fn(), ...over };
    return { p, ...mount(<C {...p} />, h, o) };
  }
  const linked = (h: ReturnType<typeof makeHost>, ...ids: string[]) => {
    h.state.relations = { isPending: false, isError: false, data: ids.map((id) => solutionRelation(`rel-${id}`, c.mine, uri(id))) };
  };
  const shown = () => [...screen.getByTestId(c.testId).querySelectorAll("button[title]")].map((b) => b.textContent);
  /** The pair a write names: source and target, as ids and addresses. */
  const pair = (other: string) => {
    const me = { id: "self", uri: uri("self") };
    const them = { id: other, uri: uri(other) };
    const [s, t] = c.view === "source" ? [me, them] : [them, me];
    return {
      sourceId: s.id,
      targetId: t.id,
      sourceEntityUri: s.uri,
      targetEntityUri: t.uri,
      typeCurie: "t:SolutionOf",
      roles: { source: "role:source", target: "role:target" },
      vaultNamespace: VAULT,
    };
  };

  describe("named by the main tag", () => {
    const namelessPool = (...ids: string[]) => ids.map((id) => ({ ...gridRow(id, "x"), facts: {} }));

    it("labels the remove control of a linked record that has no name or unitTag with the main tag the host answers", () => {
      const h = makeHost();
      linked(h, "f1");
      h.state.pool = namelessPool("f1");
      h.state.mains.set(uri("f1"), "Alpha");
      setup({}, h);
      expect(screen.getByLabelText("Remove Alpha")).toBeTruthy();
    });

    it("keeps a unitTag over a main tag the host holds for the record", () => {
      const h = makeHost();
      linked(h, "f1");
      h.state.pool = [gridRow("f1", "Door.One")];
      h.state.mains.set(uri("f1"), "Alpha");
      setup({}, h);
      expect(screen.getByLabelText("Remove Door.One")).toBeTruthy();
      expect(screen.queryByLabelText("Remove Alpha")).toBeNull();
    });

    it("asks the host once per render with the pool's records that the links point at and no others", () => {
      const h = makeHost();
      linked(h, "f1");
      h.state.pool = [...namelessPool("f1"), gridRow("other", "Door.Other")];
      const t = setup({}, h);
      const calls = h.fn.useMainTagsForRows.mock.calls;
      expect(calls.at(-1)![0].map((r) => r.entityUri)).toEqual([uri("f1")]);
      const before = calls.length;
      t.view.rerender(<C {...t.p} />);
      expect(h.fn.useMainTagsForRows.mock.calls.length).toBeGreaterThan(before);
    });

    it("matches a link to a pool record by id as well as by address, and names it by the main tag under the record's own address", () => {
      const h = makeHost();
      h.state.relations = { isPending: false, isError: false, data: [solutionRelation("rel-f1", c.mine, "f1")] };
      h.state.pool = namelessPool("f1");
      h.state.mains.set(uri("f1"), "Alpha");
      setup({}, h);
      expect(h.fn.useMainTagsForRows.mock.calls.at(-1)![0].map((r) => r.entityUri)).toEqual([uri("f1")]);
      expect(screen.getByLabelText("Remove Alpha")).toBeTruthy();
    });

    it("still calls the hook when there are no links, so that the hooks stay in order when the first link arrives", () => {
      const h = makeHost();
      const t = setup({}, h);
      expect(h.fn.useMainTagsForRows).toHaveBeenCalled();
      expect(h.fn.useMainTagsForRows.mock.calls.at(-1)![0]).toEqual([]);
      linked(h, "f1");
      h.state.pool = namelessPool("f1");
      h.state.mains.set(uri("f1"), "Alpha");
      t.view.rerender(<C {...t.p} />);
      expect(screen.getByLabelText("Remove Alpha")).toBeTruthy();
      linked(h);
      t.view.rerender(<C {...t.p} />);
      expect(screen.queryByLabelText("Remove Alpha")).toBeNull();
    });
  });

  describe("what it shows", () => {
    it("reads the record's relations from the host, by id and address", () => {
      const h = makeHost();
      setup({}, h);
      expect(h.fn.useRelations).toHaveBeenCalledWith("self", uri("self"));
      expect(h.fn.useRecords).toHaveBeenCalledWith(VAULT);
    });

    it("shows the linked records by their live tag", () => {
      const h = makeHost();
      linked(h, "f1", "f2");
      labels[uri("f1")] = "Door.One";
      labels[uri("f2")] = "Door.Two";
      setup({}, h);
      expect(shown()).toEqual(["Door.One", "Door.Two"]);
    });

    it("follows a label that changes", () => {
      const h = makeHost();
      linked(h, "f1");
      labels[uri("f1")] = "Door.One";
      const t = setup({}, h);
      labels[uri("f1")] = "Door.Uno";
      t.view.rerender(<C {...t.p} />);
      expect(shown()).toEqual(["Door.Uno"]);
    });

    it("shows only the relations in which this record holds its own role", () => {
      const h = makeHost();
      h.state.relations = {
        isPending: false,
        isError: false,
        data: [
          solutionRelation("rel-mine", c.mine, uri("f1")),
          solutionRelation("rel-theirs", c.theirs, uri("f2")),
          { relation: "rel-other", role: c.mine, type: "t:Other", members: [{ member: uri("f3"), role: c.theirs }] },
        ],
      };
      labels[uri("f1")] = "Door.One";
      labels[uri("f2")] = "Door.Two";
      labels[uri("f3")] = "Door.Three";
      setup({}, h);
      expect(shown()).toEqual(["Door.One"]);
    });

    it.each([
      ["pending", { isPending: true, isError: false }],
      ["failed", { isPending: false, isError: true }],
    ])("shows nothing while the relations are %s", (_n, state) => {
      const h = makeHost();
      h.state.relations = { ...state, data: [solutionRelation("rel-f1", c.mine, uri("f1"))] };
      labels[uri("f1")] = "Door.One";
      setup({}, h);
      expect(shown()).toEqual([]);
    });

    it("opens a record by the id of its address, and names it by the pool's tag in the remove control", async () => {
      const h = makeHost();
      linked(h, "f1");
      h.state.pool = [gridRow("f1", "Door.One")];
      labels[uri("f1")] = "Door.One";
      const t = setup({}, h);
      await userEvent.click(screen.getByText("Door.One"));
      expect(t.p.onOpen).toHaveBeenCalledWith("f1");
      expect(screen.getByLabelText("Remove Door.One")).toBeTruthy();
    });

    it("names the remove control by the address tail when the pool does not hold the record", () => {
      const h = makeHost();
      linked(h, "f1");
      setup({}, h);
      expect(screen.getByLabelText("Remove f1")).toBeTruthy();
    });
  });

  describe("who can edit", () => {
    it("draws the picker and the remove controls in edit mode", () => {
      const h = makeHost();
      linked(h, "f1");
      setup({}, h);
      expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
      expect(screen.getByLabelText("Remove f1")).toBeTruthy();
    });

    it("draws neither in presentation, and the picker alone when the group offers it", () => {
      const h = makeHost();
      linked(h, "f1");
      setup({}, h, { editing: false });
      expect(screen.queryByTestId("plan-link-picker")).toBeNull();
      expect(screen.queryByLabelText("Remove f1")).toBeNull();
      cleanup();
      setup({ offer: true }, h, { editing: false });
      expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
      expect(screen.queryByLabelText("Remove f1")).toBeNull();
    });

    it("draws nothing to edit when canEdit is false", () => {
      setup({ canEdit: false, offer: true });
      expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    });

    it.each(["writePairRelation", "endRelation", "useCreateRecord"] as const)("is read-only when the host has no %s", (missing) => {
      const h = makeHost({ without: [missing] });
      linked(h, "f1");
      labels[uri("f1")] = "Door.One";
      setup({ offer: true }, h);
      expect(screen.getByText("Door.One")).toBeTruthy();
      expect(screen.queryByTestId("plan-link-picker")).toBeNull();
      expect(screen.queryByLabelText("Remove f1")).toBeNull();
    });
  });

  describe("picking", () => {
    it("searches the right types and writes one relation with this record's end first or second as its view says", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      const t = setup({}, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
      expect(h.fn.find).toHaveBeenCalledWith(VAULT, "Door", c.searched);
      expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
      expect(h.fn.writePairRelation).toHaveBeenCalledWith(pair("f9"));
      expect(h.names()).toEqual(["writePairRelation", "getRelations", "setRelations"]);
      expect(t.p.onPicked).toHaveBeenCalledTimes(1);
      if (c.withWritten) expect(t.p.onWritten).toHaveBeenCalledTimes(1);
    });

    it("puts the written relation in the cached relations, by the address the vault gave, replacing an older row of the same relation", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      const stale = solutionRelation("https://h.example.test/base/r/rel1", c.mine, uri("old"));
      const keep = solutionRelation("rel-keep", c.mine, uri("f1"));
      h.state.cachedRelations = [stale, keep];
      const t = setup({}, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
      expect(h.state.cachedRelations).toEqual([keep, solutionRelation("https://h.example.test/base/r/rel1", c.mine, uri("f9"))]);
      expect(h.calls).toContain(`getRelations ${JSON.stringify(["self", uri("self")])}`);
    });

    it("keys the cached row by the relation's id when the vault gave no address, and caches from nothing", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      h.fn.writePairRelation.mockResolvedValue({ id: "rel7", uri: null });
      const t = setup({}, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
      expect(h.state.cachedRelations).toEqual([solutionRelation("rel7", c.mine, uri("f9"))]);
    });

    it("does not offer a record already linked", async () => {
      const h = makeHost();
      linked(h, "f1");
      h.fn.find.mockResolvedValue(page([hit("f1", "Door.One"), hit("f9", "Door.Nine")]));
      setup({}, h);
      await typeInto(c.label, "Door");
      await screen.findByText("Door.Nine");
      expect(screen.getAllByTestId("org-record-hit").map((x) => x.textContent)).toEqual(["Door.Nine"]);
    });

    it("says the address was not read, and writes nothing, for a record with none", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine", { entityUri: undefined })]));
      const t = setup({}, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("That record's address was not read, so it was not linked."));
      expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    });

    it("says this record's address was not read when it has none", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      const t = setup({ record: row("self", "Door.Fix", { entityUri: undefined }) }, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's address was not read, so it was not linked."));
      expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    });

    it("shows a rejected write's message, and leaves the cache and the caller alone", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      h.fn.writePairRelation.mockRejectedValue(new Error("Refused"));
      const t = setup({}, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Refused"));
      expect(h.names()).toEqual(["writePairRelation"]);
      expect(t.p.onWritten).not.toHaveBeenCalled();
    });

    it("shows the duplicate-tag sentence on a 409", async () => {
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      h.fn.writePairRelation.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
      const t = setup({}, h);
      await pick(c.label, "Door", "Door.Nine");
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Door.Nine" is already used in this vault. Pick another.'));
    });
  });

  describe("creating", () => {
    async function createFree(text = "Door.Fresh") {
      const user = await typeInto(c.label, text);
      const button = await screen.findByTestId("plan-link-create");
      expect(button.textContent).toBe(`Create ${c.created} "${text}"`);
      await user.click(button);
    }

    it("makes the record with the optimistic create, then writes the relation with the new record at the other end", async () => {
      const h = makeHost();
      const t = setup({}, h);
      await createFree();
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
      expect(h.fn.mutateAsync).toHaveBeenCalledWith({ type: { id: c.typeId }, facts: { unitTag: "Door.Fresh" }, nameOnly: true });
      expect(h.fn.createRecord).not.toHaveBeenCalled();
      expect(h.fn.writePairRelation).toHaveBeenCalledWith(pair("made"));
      expect(h.names()).toEqual(["mutateAsync", "invalidatePlanSearch", "writePairRelation", "getRelations", "setRelations"]);
      expect(h.fn.invalidatePlanSearch).toHaveBeenCalledWith(VAULT);
      if (c.withWritten) expect(t.p.onWritten).toHaveBeenCalledTimes(1);
    });

    it("says the type cannot be made, before it makes anything", async () => {
      const h = makeHost();
      h.state.types[c.typeId] = null;
      const t = setup({}, h);
      await createFree();
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(c.typeNotMade));
      expect(h.fn.mutateAsync).not.toHaveBeenCalled();
    });

    it("says this record's address was not read, before it makes anything", async () => {
      const h = makeHost();
      const t = setup({ record: row("self", "Door.Fix", { entityUri: undefined }) }, h);
      await createFree();
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's address was not read, so it was not linked."));
      expect(h.fn.mutateAsync).not.toHaveBeenCalled();
    });

    it("says the record was made but not linked when the vault gave no address", async () => {
      const h = makeHost();
      h.fn.mutateAsync.mockResolvedValue({ id: "made", etag: null, tempId: "" });
      const t = setup({}, h);
      await createFree();
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("The record was made, but its address was not read, so it was not linked."));
      expect(h.fn.writePairRelation).not.toHaveBeenCalled();
      expect(h.fn.invalidatePlanSearch).toHaveBeenCalledTimes(1);
    });

    it("shows the duplicate-tag sentence on a 409", async () => {
      const h = makeHost();
      h.fn.mutateAsync.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
      const t = setup({}, h);
      await createFree();
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Door.Fresh" is already used in this vault. Pick another.'));
      expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    });
  });

  describe("unlinking", () => {
    it("ends the relation in the plan vault and takes it out of the cached relations", async () => {
      const h = makeHost();
      linked(h, "f1", "f2");
      h.state.cachedRelations = [solutionRelation("rel-f1", c.mine, uri("f1")), solutionRelation("rel-f2", c.mine, uri("f2"))];
      const t = setup({ planVault: "https://q.example.test/vault" }, h);
      await userEvent.click(screen.getByLabelText("Remove f1"));
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
      expect(h.fn.endRelation).toHaveBeenCalledWith("rel-f1", "https://q.example.test/vault");
      expect(h.names()).toEqual(["endRelation", "setRelations"]);
      expect(h.state.cachedRelations).toEqual([solutionRelation("rel-f2", c.mine, uri("f2"))]);
      expect(h.calls[1]).toBe(`setRelations ${JSON.stringify(["self", uri("self"), "updater"])}`);
    });

    it("empties a cache that held nothing", async () => {
      const h = makeHost();
      linked(h, "f1");
      const t = setup({}, h);
      await userEvent.click(screen.getByLabelText("Remove f1"));
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
      expect(h.state.cachedRelations).toEqual([]);
    });

    it("keeps the cache and shows the message when the end is refused", async () => {
      const h = makeHost();
      linked(h, "f1");
      h.fn.endRelation.mockRejectedValue(new Error("Refused"));
      const t = setup({}, h);
      await userEvent.click(screen.getByLabelText("Remove f1"));
      await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Refused"));
      expect(h.names()).toEqual(["endRelation"]);
    });

    it("disables the controls while the end is under way", async () => {
      const h = makeHost();
      linked(h, "f1");
      let release: (v: object) => void = () => {};
      h.fn.endRelation.mockReturnValue(new Promise((r) => (release = r)));
      setup({}, h);
      const remove = screen.getByLabelText("Remove f1") as HTMLButtonElement;
      await userEvent.click(remove);
      await waitFor(() => expect(remove.disabled).toBe(true));
      release({});
      await waitFor(() => expect(remove.disabled).toBe(false));
    });
  });
});

describe("the two ends of one relation", () => {
  it("write the same relation with source and target swapped", async () => {
    const written: Record<string, unknown>[] = [];
    for (const Comp of [PlanSolutionOf, PlanSolutions] as const) {
      cleanup();
      const h = makeHost();
      h.fn.find.mockResolvedValue(page([hit("f9", "Door.Nine")]));
      const p = common();
      mount(<Comp {...p} />, h);
      await pick(Comp === PlanSolutionOf ? "Solution of Function" : "Solutions", "Door", "Door.Nine");
      await waitFor(() => expect(p.onNotice).toHaveBeenCalledWith(null));
      written.push(h.fn.writePairRelation.mock.calls[0]![0] as Record<string, unknown>);
    }
    const [ofFunction, solutions] = written as [Record<string, string>, Record<string, string>];
    expect(ofFunction.sourceId).toBe("self");
    expect(ofFunction.targetId).toBe("f9");
    expect(solutions.sourceId).toBe("f9");
    expect(solutions.targetId).toBe("self");
    expect(ofFunction.sourceEntityUri).toBe(solutions.targetEntityUri);
    expect(ofFunction.targetEntityUri).toBe(solutions.sourceEntityUri);
    expect({ ...ofFunction, sourceId: 0, targetId: 0, sourceEntityUri: 0, targetEntityUri: 0 }).toEqual({
      ...solutions,
      sourceId: 0,
      targetId: 0,
      sourceEntityUri: 0,
      targetEntityUri: 0,
    });
  });
});
