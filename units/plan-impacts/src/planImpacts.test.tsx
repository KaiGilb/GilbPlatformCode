// PlanImpacts against a fake host. The source had no test of it on its own (the card suites render whole cards over a stubbed
// fetch); every case here is new and pins what the source did, odd cases included.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanImpacts } from "./index";
import { ANN, VAULT, gridRow, hit, impactRelation, labels, makeHost, page, relUri, row, uri } from "../test/fakeHost";
import { mount, pick, typeInto } from "../test/mount";
import type { ComponentProps } from "react";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const ARROW = "→";
const solution = row("sol", "Fix.Door", { typeUri: "t:Solution" });

function setup(over: Partial<ComponentProps<typeof PlanImpacts>> = {}, h = makeHost(), o: { editing?: boolean } = {}) {
  const p = { record: solution, vaultId: VAULT, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn(), ...over };
  return { p, ...mount(<PlanImpacts {...p} />, h, o) };
}

/** Relations, pool and documents for impacts: [relation, target, tag, extras, role]. */
type Spec = [string, string, string, Record<string, unknown>, ("role:value" | "role:resource")?];
function withImpacts(h: ReturnType<typeof makeHost>, ...specs: Spec[]) {
  h.state.relations = { isPending: false, isError: false, data: specs.map(([r, t, , , role]) => impactRelation(r, t, role)) };
  h.state.pool = specs.map(([, t, tag, , role]) => gridRow(t, tag, { typeUri: role === "role:resource" ? "t:Resource" : "t:Value" }));
  for (const [r, t, tag, extras] of specs) {
    h.state.docs[r] = { data: { extras } };
    labels[uri(t)] = tag;
  }
}
const VALUE_EXTRAS = { "a:valueEstimate": `3 ${ARROW} 0.2`, "a:unit": "s", "a:impactBasis": "estimate" };
const speed = (extras: Record<string, unknown> = VALUE_EXTRAS): Spec => ["rel1", "v1", "Speed", extras];

const rowOf = (tag: string) => document.querySelector(`[data-impact-row="${tag}"]`) as HTMLElement;
const editor = () => document.querySelector("[data-impact-editor]") as HTMLElement | null;
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const written = (h: ReturnType<typeof makeHost>, n = 0) => h.fn.writePairRelation.mock.calls[n]![0] as Record<string, unknown>;

describe("the rows", () => {
  it("draws the root with its test id and a revision counter at 0, and asks the host for the pool and the relations", () => {
    const h = makeHost();
    setup({ planVault: "https://q.example.test/vault" }, h);
    const root = screen.getByTestId("plan-impacts");
    expect(root.getAttribute("data-impact-rev")).toBe("0");
    expect(h.fn.useRecords).toHaveBeenCalledWith(VAULT);
    expect(h.fn.useRelations).toHaveBeenCalledWith("sol", uri("sol"));
    expect(h.fn.useCreateRecord).toHaveBeenCalledWith("https://q.example.test/vault");
    expect(h.fn.useSelfSource).toHaveBeenCalled();
  });

  it("shows one row per impact, keyed by its tag, with the target by its live label and the numbers by impactNumbersText", () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({}, h);
    const r = rowOf("Speed");
    expect(r).toBeTruthy();
    expect(within(r).getByText("Speed")).toBeTruthy();
    expect(within(r).getByText(`3 ${ARROW} 0.2 s`)).toBeTruthy();
  });

  it("follows a label that changes", () => {
    const h = makeHost();
    withImpacts(h, speed());
    const t = setup({}, h);
    labels[uri("v1")] = "Pace";
    t.view.rerender(<PlanImpacts {...t.p} />);
    expect(within(rowOf("Speed")).getByText("Pace")).toBeTruthy();
  });

  it("marks an estimate, and not a measured one", () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({}, h);
    const mark = rowOf("Speed").querySelector('[data-impact-basis="estimate"]');
    expect(mark?.textContent).toBe(" (estimate)");
    cleanup();
    const m = makeHost();
    withImpacts(m, speed({ ...VALUE_EXTRAS, "a:impactBasis": "measured" }));
    setup({}, m);
    expect(rowOf("Speed").querySelector("[data-impact-basis]")).toBeNull();
  });

  it("shows a resource draw with a true minus and its unit, and a free-text estimate as it was stored, with no unit", () => {
    const h = makeHost();
    withImpacts(h, ["relA", "res", "Hours", { "a:resourceDraw": "-5", "a:unit": "h", "a:impactBasis": "measured" }, "role:resource"], ["relB", "v2", "Mood", { "a:valueEstimate": "better", "a:unit": "pts", "a:impactBasis": "measured" }]);
    setup({}, h);
    expect(within(rowOf("Hours")).getByText("−5 h")).toBeTruthy();
    expect(within(rowOf("Mood")).getByText("better")).toBeTruthy();
  });

  it("lists Values before Resources, each side by tag", () => {
    const h = makeHost();
    withImpacts(
      h,
      ["relA", "res", "Alpha.Res", { "a:resourceDraw": "-1" }, "role:resource"],
      ["relB", "v2", "Zed", VALUE_EXTRAS],
      ["relC", "v3", "Beta", VALUE_EXTRAS],
    );
    setup({}, h);
    expect([...document.querySelectorAll("[data-impact-row]")].map((n) => n.getAttribute("data-impact-row"))).toEqual(["Beta", "Zed", "Alpha.Res"]);
  });

  it("names a row by the target's address tail when the pool does not hold it", () => {
    const h = makeHost();
    h.state.relations = { isPending: false, isError: false, data: [impactRelation("rel1", "zz")] };
    h.state.docs.rel1 = { data: { extras: VALUE_EXTRAS } };
    setup({}, h);
    expect(rowOf("zz")).toBeTruthy();
  });

  it.each([
    ["pending", { isPending: true, isError: false }],
    ["failed", { isPending: false, isError: true }],
  ])("shows no rows while the relations are %s", (_n, state) => {
    const h = makeHost();
    withImpacts(h, speed());
    h.state.relations = { ...state, data: h.state.relations.data };
    setup({}, h);
    expect(document.querySelector("[data-impact-row]")).toBeNull();
  });

  it("shows a row with no numbers while its document is not read, or does not exist", () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.state.docs.rel1 = {};
    setup({}, h, { editing: false });
    expect(rowOf("Speed")).toBeTruthy();
    expect(rowOf("Speed").textContent).toBe("Speed: ");
    cleanup();
    h.state.docs.rel1 = { data: null };
    setup({}, h, { editing: false });
    expect(rowOf("Speed").textContent).toBe("Speed: ");
  });

  it("asks the host for each relation's document in the plan vault", () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({ planVault: "https://q.example.test/vault" }, h);
    expect(h.fn.useRelationDoc).toHaveBeenCalledWith("rel1", "https://q.example.test/vault");
  });

  it("shows the source of an impact, by the live label, under its row", () => {
    const h = makeHost();
    labels[ANN] = "Ann";
    withImpacts(h, speed({ ...VALUE_EXTRAS, "a:statedBy": { "@id": ANN } }));
    setup({}, h);
    expect(within(rowOf("Speed")).getByText("Source:")).toBeTruthy();
    expect(within(rowOf("Speed")).getByText("Ann")).toBeTruthy();
  });

  it("opens a target by the id of its address", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    const t = setup({}, h);
    await userEvent.click(within(rowOf("Speed")).getByText("Speed"));
    expect(t.p.onOpen).toHaveBeenCalledWith("v1");
  });
});

describe("who can edit", () => {
  it("draws the picker and a remove control in edit mode", () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({}, h);
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    expect(screen.getByLabelText("Remove Speed")).toBeTruthy();
  });

  it("draws neither in presentation, but the numbers can still be opened when canEdit", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({}, h, { editing: false });
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove Speed")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: `3 ${ARROW} 0.2 s` }));
    expect(editor()).toBeTruthy();
  });

  it("offers the picker in presentation when asked to, only when the record has an address", () => {
    const h = makeHost();
    setup({ offer: true }, h, { editing: false });
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    cleanup();
    setup({ offer: true, record: row("sol", "Fix.Door", { entityUri: undefined }) }, h, { editing: false });
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    cleanup();
    setup({ record: row("sol", "Fix.Door", { entityUri: undefined }) }, h);
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
  });

  it("draws the numbers as plain text, and no picker, when canEdit is false", () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({ canEdit: false, offer: true }, h);
    expect(screen.queryByRole("button", { name: `3 ${ARROW} 0.2 s` })).toBeNull();
    expect(screen.getByText(`3 ${ARROW} 0.2 s`)).toBeTruthy();
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove Speed")).toBeNull();
  });

  it.each(["writePairRelation", "endRelation", "useCreateRecord"] as const)("is read-only when the host has no %s", (missing) => {
    const h = makeHost({ without: [missing] });
    withImpacts(h, speed());
    setup({ offer: true }, h);
    expect(screen.getByText(`3 ${ARROW} 0.2 s`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: `3 ${ARROW} 0.2 s` })).toBeNull();
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove Speed")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Speed source" })).toBeNull();
  });

  it("throws an error that names the provider when there is none", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { Frame, newClient } = await import("../test/fakeHost");
    const { render } = await import("@testing-library/react");
    const h = makeHost();
    expect(() =>
      render(
        <Frame host={null} pickerHost={h.pickerHost} sourceHost={h.sourceHost} client={newClient()}>
          <PlanImpacts record={solution} vaultId={VAULT} canEdit onOpen={() => {}} onNotice={() => {}} />
        </Frame>,
      ),
    ).toThrow("plan-impacts: wrap the app in <PlanImpactsHostContext.Provider value={host}>");
    vi.restoreAllMocks();
  });
});

describe("editing the numbers of a saved impact", () => {
  async function open(h: ReturnType<typeof makeHost>, tag = "Speed", text = `3 ${ARROW} 0.2 s`) {
    const t = setup({}, h);
    await userEvent.click(within(rowOf(tag)).getByRole("button", { name: text }));
    return t;
  }

  it("opens the boxes with the stored numbers, the unit and the basis", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    expect(input("Status").value).toBe("3");
    expect(input("Expected").value).toBe("0.2");
    expect(input("Unit").value).toBe("s");
    expect((screen.getByLabelText("Basis") as HTMLSelectElement).value).toBe("estimate");
    expect(document.activeElement).toBe(input("Status"));
  });

  it("opens a free-text estimate whole in the Status box, and a resource in the Amount box", async () => {
    const h = makeHost();
    withImpacts(h, ["relB", "v2", "Mood", { "a:valueEstimate": "better", "a:impactBasis": "measured" }], ["relA", "res", "Hours", { "a:resourceDraw": "-5", "a:unit": "h" }, "role:resource"]);
    setup({}, h);
    await userEvent.click(within(rowOf("Mood")).getByRole("button", { name: "better" }));
    expect(input("Status").value).toBe("better");
    expect(input("Expected").value).toBe("");
    cleanup();
    setup({}, h);
    await userEvent.click(within(rowOf("Hours")).getByRole("button", { name: "−5 h" }));
    expect(input("Amount").value).toBe("−5");
    expect(screen.queryByLabelText("Status")).toBeNull();
  });

  it("writes the relation once, in place, on Enter, with the numbers, the unit and the basis, and the person as its source", async () => {
    const h = makeHost();
    h.state.self = { "@id": ANN };
    withImpacts(h, speed());
    const t = await open(h);
    await userEvent.clear(input("Expected"));
    await userEvent.type(input("Expected"), "0.5{Enter}");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
    expect(written(h)).toEqual({
      relationId: "rel1",
      sourceId: "sol",
      targetId: "v1",
      sourceEntityUri: uri("sol"),
      targetEntityUri: uri("v1"),
      typeCurie: "t:ImpactOn",
      roles: { source: "role:solution", target: "role:value" },
      vaultNamespace: VAULT,
      extraFacts: {
        "a:relationType": "value-estimation",
        "a:unit": "s",
        "a:impactBasis": "estimate",
        "a:statedBy": { "@id": ANN },
        "a:valueEstimate": `3 ${ARROW} 0.5`,
      },
    });
    await waitFor(() => expect(editor()).toBeNull());
  });

  it("keeps the relation's id: an update is the same relation, never a new one", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect(written(h).relationId).toBe("rel1");
    expect(h.names()).toEqual(["writePairRelation"]);
  });

  it("writes to the plan vault, and names the target by the pool's row", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({ planVault: "https://q.example.test/vault" }, h);
    await userEvent.click(within(rowOf("Speed")).getByRole("button", { name: `3 ${ARROW} 0.2 s` }));
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect(written(h).vaultNamespace).toBe("https://q.example.test/vault");
  });

  it("makes the person its source only when they have a card, replacing the old one", async () => {
    const h = makeHost();
    withImpacts(h, speed({ ...VALUE_EXTRAS, "a:statedBy": { "@id": uri("ben") } }));
    await open(h);
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect((written(h).extraFacts as Record<string, unknown>)["a:statedBy"]).toEqual({ "@id": uri("ben") });
    cleanup();
    const g = makeHost();
    g.state.self = { "@id": ANN };
    withImpacts(g, speed({ ...VALUE_EXTRAS, "a:statedBy": { "@id": uri("ben") } }));
    await open(g);
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(g.fn.writePairRelation).toHaveBeenCalled());
    expect((written(g).extraFacts as Record<string, unknown>)["a:statedBy"]).toEqual({ "@id": ANN });
  });

  it("keeps the source the person chose or cleared for this impact when it writes the numbers", async () => {
    const h = makeHost();
    h.state.self = { "@id": ANN };
    withImpacts(h, speed({ ...VALUE_EXTRAS, "a:statedBy": { "@id": uri("ben") } }));
    labels[uri("ben")] = "Ben";
    const t = await open(h);
    await userEvent.click(screen.getByLabelText("Remove source"));
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1));
    expect(t.p.onNotice).toHaveBeenCalledWith(null);
    expect((written(h).extraFacts as Record<string, unknown>)["a:statedBy"]).toBeUndefined();
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalledTimes(2));
    const second = written(h, 1).extraFacts as Record<string, unknown>;
    expect(second["a:statedBy"]).toBeUndefined();
    expect(second["a:unit"]).toBe("sx");
  });

  it("commits once when Enter is pressed twice while the write is under way", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    let release: (v: { id: string; uri?: string | null }) => void = () => {};
    h.fn.writePairRelation.mockReturnValue(new Promise((r) => (release = r)));
    await open(h);
    await userEvent.type(input("Unit"), "x{Enter}");
    await userEvent.keyboard("{Enter}{Enter}");
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
    release({ id: "rel1" });
    await waitFor(() => expect(editor()).toBeNull());
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
  });

  it("commits once when the focus leaves the row, then again never after it closed", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.type(input("Unit"), "x");
    fireEvent.focusOut(input("Unit"), { relatedTarget: document.body });
    await waitFor(() => expect(editor()).toBeNull());
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
  });

  it("does not commit when the focus moves to another box of the same row", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.type(input("Unit"), "x");
    await userEvent.click(input("Expected"));
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    expect(editor()).toBeTruthy();
  });

  it("drops the edit on Escape without writing", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.type(input("Unit"), "x");
    await userEvent.keyboard("{Escape}");
    expect(editor()).toBeNull();
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    expect(screen.getByText(`3 ${ARROW} 0.2 s`)).toBeTruthy();
  });

  it("closes without writing when nothing changed", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(editor()).toBeNull());
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
  });

  it("keeps the boxes open, and says why, when the write is refused; a second Enter writes again", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.fn.writePairRelation.mockRejectedValueOnce(new Error("Refused"));
    const t = await open(h);
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Refused"));
    expect(editor()).toBeTruthy();
    expect(input("Unit").value).toBe("sx");
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("0");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(editor()).toBeNull());
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(2);
  });

  it("shows the duplicate-tag sentence when the write is refused with 409", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.fn.writePairRelation.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }));
    const t = await open(h);
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Speed" is already used in this vault. Pick another.'));
  });

  it("shows the rolled-back sentence for a refusal that is no error", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.fn.writePairRelation.mockRejectedValueOnce("no");
    const t = await open(h);
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Couldn't save — your change was rolled back. Try again."));
  });

  it("shows the new numbers before the relation is read again, and counts the revision", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.clear(input("Expected"));
    await userEvent.type(input("Expected"), "0.5{Enter}");
    await waitFor(() => expect(editor()).toBeNull());
    expect(screen.getByText(`3 ${ARROW} 0.5 s`)).toBeTruthy();
    expect(screen.queryByText(`3 ${ARROW} 0.2 s`)).toBeNull();
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("1");
    expect(h.fn.useRelationDoc).toHaveBeenLastCalledWith("rel1", VAULT);
  });

  it("says Enter a decimal number for a box that is no number, writes nothing, and clears the sentence on typing", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.clear(input("Expected"));
    await userEvent.type(input("Expected"), "abc{Enter}");
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a decimal number.");
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    expect(editor()).toBeTruthy();
    await userEvent.type(input("Expected"), "1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stores a comma as a point: 1,000 becomes 1.000", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.clear(input("Status"));
    await userEvent.type(input("Status"), "1,000");
    await userEvent.clear(input("Expected"));
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect((written(h).extraFacts as Record<string, unknown>)["a:valueEstimate"]).toBe(`1.000 ${ARROW} 2`);
  });

  it("takes unmeasured as the status and refuses it as the expected value", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.clear(input("Status"));
    await userEvent.type(input("Status"), "unmeasured");
    await userEvent.clear(input("Expected"));
    await userEvent.type(input("Expected"), "unmeasured{Enter}");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    await userEvent.clear(input("Expected"));
    await userEvent.type(input("Expected"), "4{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect((written(h).extraFacts as Record<string, unknown>)["a:valueEstimate"]).toBe(`unmeasured ${ARROW} 4`);
  });

  it("trims the unit and writes the basis chosen", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    await open(h);
    await userEvent.clear(input("Unit"));
    await userEvent.type(input("Unit"), "  ms  ");
    await userEvent.selectOptions(screen.getByLabelText("Basis"), "measured");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    const facts = written(h).extraFacts as Record<string, unknown>;
    expect(facts["a:unit"]).toBe("ms");
    expect(facts["a:impactBasis"]).toBe("measured");
  });

  it("writes a resource's amount with its sign, a true minus read as a hyphen, and refuses an amount with no sign", async () => {
    const h = makeHost();
    withImpacts(h, ["relA", "res", "Hours", { "a:resourceDraw": "-5", "a:unit": "h" }, "role:resource"]);
    setup({}, h);
    await userEvent.click(within(rowOf("Hours")).getByRole("button", { name: "−5 h" }));
    await userEvent.clear(input("Amount"));
    await userEvent.type(input("Amount"), "5{Enter}");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
    await userEvent.clear(input("Amount"));
    await userEvent.type(input("Amount"), "−3,5{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect(written(h).roles).toEqual({ source: "role:solution", target: "role:resource" });
    const facts = written(h).extraFacts as Record<string, unknown>;
    expect(facts["a:resourceDraw"]).toBe("-3.5");
    expect(facts["a:valueEstimate"]).toBeUndefined();
    await waitFor(() => expect(screen.getByText("−3.5 h")).toBeTruthy());
  });

  it("says the address was not read when this record has none, and writes nothing", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    const t = setup({ record: row("sol", "Fix.Door", { entityUri: undefined }) }, h);
    await userEvent.click(within(rowOf("Speed")).getByRole("button", { name: `3 ${ARROW} 0.2 s` }));
    await userEvent.type(input("Unit"), "x{Enter}");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's address was not read, so it was not linked."));
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
  });
});

describe("the source of a saved impact", () => {
  it("writes the relation in place with the source chosen, and clears the notice", async () => {
    const h = makeHost();
    labels[ANN] = "Ann";
    withImpacts(h, speed({ ...VALUE_EXTRAS, "a:statedBy": { "@id": ANN } }));
    const t = setup({}, h);
    await userEvent.click(within(rowOf("Speed")).getByLabelText("Remove source"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
    expect(written(h)).toMatchObject({ relationId: "rel1", extraFacts: { "a:unit": "s", "a:valueEstimate": `3 ${ARROW} 0.2` } });
    expect((written(h).extraFacts as Record<string, unknown>)["a:statedBy"]).toBeUndefined();
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("1");
  });

  it("writes words as the source from the picker's own text button", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    const t = setup({}, h);
    const user = await typeInto("Speed source", "the manual");
    await user.click(await screen.findByText('Use "the manual" as text'));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect((written(h).extraFacts as Record<string, unknown>)["a:source"]).toBe("the manual");
  });

  it("says why when the write of the source is refused", async () => {
    const h = makeHost();
    labels[ANN] = "Ann";
    withImpacts(h, speed({ ...VALUE_EXTRAS, "a:statedBy": { "@id": ANN } }));
    h.fn.writePairRelation.mockRejectedValue(new Error("Refused"));
    const t = setup({}, h);
    await userEvent.click(within(rowOf("Speed")).getByLabelText("Remove source"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Refused"));
  });

  it("shows the source line in edit mode only for an editable card", () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({ canEdit: false }, h);
    expect(screen.queryByRole("textbox", { name: "Speed source" })).toBeNull();
    cleanup();
    setup({}, h);
    expect(screen.getByRole("textbox", { name: "Speed source" })).toBeTruthy();
  });
});

describe("removing an impact", () => {
  it("ends the relation in the plan vault, forgets its numbers and takes it out of the cached relations", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.state.cachedRelations = [impactRelation("rel1", "v1"), impactRelation("rel2", "v2")];
    const t = setup({ planVault: "https://q.example.test/vault" }, h);
    await userEvent.click(screen.getByLabelText("Remove Speed"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.endRelation).toHaveBeenCalledWith("rel1", "https://q.example.test/vault");
    expect(h.names()).toEqual(["endRelation", "setRelations"]);
    expect(h.state.cachedRelations).toEqual([impactRelation("rel2", "v2")]);
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("1");
  });

  it("forgets the numbers just written for it: what the host reads shows again", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    setup({}, h);
    await userEvent.click(within(rowOf("Speed")).getByRole("button", { name: `3 ${ARROW} 0.2 s` }));
    await userEvent.clear(input("Unit"));
    await userEvent.type(input("Unit"), "ms{Enter}");
    await waitFor(() => expect(editor()).toBeNull());
    expect(screen.getByText(`3 ${ARROW} 0.2 ms`)).toBeTruthy();
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("1");
    await userEvent.click(screen.getByLabelText("Remove Speed"));
    await waitFor(() => expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("2"));
    expect(screen.getByText(`3 ${ARROW} 0.2 s`)).toBeTruthy();
    expect(screen.queryByText(`3 ${ARROW} 0.2 ms`)).toBeNull();
  });

  it("keeps the row and says why when the end is refused", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.fn.endRelation.mockRejectedValue(new Error("Refused"));
    const t = setup({}, h);
    await userEvent.click(screen.getByLabelText("Remove Speed"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Refused"));
    expect(h.names()).toEqual(["endRelation"]);
    expect(screen.getByTestId("plan-impacts").getAttribute("data-impact-rev")).toBe("0");
    expect((screen.getByLabelText("Remove Speed") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the controls while the end is under way", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    let release: (v: object) => void = () => {};
    h.fn.endRelation.mockReturnValue(new Promise((r) => (release = r)));
    setup({}, h);
    const remove = screen.getByLabelText("Remove Speed") as HTMLButtonElement;
    await userEvent.click(remove);
    await waitFor(() => expect(remove.disabled).toBe(true));
    release({});
    await waitFor(() => expect(remove.disabled).toBe(false));
  });

  it("names the 409 sentence by the target's tag", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.fn.endRelation.mockRejectedValue(Object.assign(new Error("x"), { status: 409 }));
    const t = setup({}, h);
    await userEvent.click(screen.getByLabelText("Remove Speed"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Speed" is already used in this vault. Pick another.'));
  });
});

describe("adding an impact by picking", () => {
  const valueHit = (id = "v2", tag = "Pace") =>
    hit(id, tag, { served: { facts: { scale: { "a:unit": "ms" } }, context: undefined, etag: null } });

  it("searches Values and Resources in the plan vault", async () => {
    const h = makeHost();
    setup({ planVault: "https://q.example.test/vault" }, h);
    await typeInto("Impacts", "Pa");
    await waitFor(() => expect(h.fn.find).toHaveBeenCalledWith("https://q.example.test/vault", "Pa", ["Value", "Resource"]));
  });

  it("opens a draft row for the pick, with the unit of the target's scale, and writes nothing yet", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([valueHit()]));
    const t = setup({}, h);
    await pick("Pa", "Pace");
    expect(rowOf("Pace")).toBeTruthy();
    expect(editor()).toBeTruthy();
    expect(input("Unit").value).toBe("ms");
    expect(input("Status").value).toBe("");
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
    expect(t.p.onNotice).toHaveBeenCalledWith(null);
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
  });

  it("draws an Amount box for a Resource and a Status and Expected for a Value", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("r9", "Hours.Res", { typeUri: "t:Resource" })]));
    setup({}, h);
    await pick("Ho", "Hours.Res");
    expect(screen.getByLabelText("Amount")).toBeTruthy();
    expect(screen.queryByLabelText("Status")).toBeNull();
  });

  it("writes a new relation, without a relation id, with the pick's end as role:value, and puts it in the cached relations", async () => {
    const h = makeHost();
    h.state.self = { "@id": ANN };
    h.fn.find.mockResolvedValue(page([valueHit()]));
    const t = setup({}, h);
    await pick("Pa", "Pace");
    await userEvent.type(input("Status"), "10");
    await userEvent.type(input("Expected"), "20{Enter}");
    await waitFor(() => expect(editor()).toBeNull());
    expect(h.fn.writePairRelation).toHaveBeenCalledTimes(1);
    const input1 = written(h);
    expect("relationId" in input1).toBe(false);
    expect(input1).toEqual({
      sourceId: "sol",
      targetId: "v2",
      sourceEntityUri: uri("sol"),
      targetEntityUri: uri("v2"),
      typeCurie: "t:ImpactOn",
      roles: { source: "role:solution", target: "role:value" },
      vaultNamespace: VAULT,
      extraFacts: {
        "a:relationType": "value-estimation",
        "a:unit": "ms",
        "a:impactBasis": "estimate",
        "a:statedBy": { "@id": ANN },
        "a:valueEstimate": `10 ${ARROW} 20`,
      },
    });
    expect(h.names()).toEqual(["writePairRelation", "setRelations"]);
    expect(h.state.cachedRelations).toEqual([impactRelation(relUri("rel-new"), "v2")]);
    expect(t.p.onNotice).toHaveBeenLastCalledWith(null);
    expect(rowOf("Pace")).toBeNull();
  });

  it("keys the relation by the address the vault gave, else by its id; a row of the same relation is replaced", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([valueHit()]));
    h.fn.writePairRelation.mockResolvedValue({ id: "rel9", uri: null });
    h.state.cachedRelations = [impactRelation("rel9", "stale")];
    setup({}, h);
    await pick("Pa", "Pace");
    await userEvent.type(input("Status"), "1");
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(h.state.cachedRelations).toEqual([impactRelation("rel9", "v2")]));
    cleanup();
    const g = makeHost();
    g.fn.find.mockResolvedValue(page([valueHit()]));
    g.fn.writePairRelation.mockResolvedValue({ id: "rel9", uri: "not-an-address" });
    setup({}, g);
    await pick("Pa", "Pace");
    await userEvent.type(input("Status"), "1");
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(g.state.cachedRelations).toEqual([impactRelation("rel9", "v2")]));
  });

  it("writes a Resource with role:resource", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("r9", "Hours.Res", { typeUri: "t:Resource" })]));
    setup({}, h);
    await pick("Ho", "Hours.Res");
    await userEvent.type(input("Amount"), "-2{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect(written(h).roles).toEqual({ source: "role:solution", target: "role:resource" });
    expect(h.state.cachedRelations).toEqual([impactRelation(relUri("rel-new"), "r9", "role:resource")]);
  });

  it("makes the person the source of a new impact by default, and shows it", async () => {
    const h = makeHost();
    h.state.self = { "@id": ANN };
    labels[ANN] = "Ann";
    h.fn.find.mockResolvedValue(page([valueHit()]));
    setup({}, h);
    await pick("Pa", "Pace");
    expect(within(rowOf("Pace")).getByText("Ann")).toBeTruthy();
  });

  it("leaves a new impact with no source when the person has no card", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([valueHit()]));
    setup({}, h);
    await pick("Pa", "Pace");
    await userEvent.type(input("Status"), "1");
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect((written(h).extraFacts as Record<string, unknown>)["a:statedBy"]).toBeUndefined();
  });

  it("keeps a source the person cleared on a new impact: it is not theirs to fill in", async () => {
    const h = makeHost();
    h.state.self = { "@id": ANN };
    labels[ANN] = "Ann";
    h.fn.find.mockResolvedValue(page([valueHit()]));
    setup({}, h);
    await pick("Pa", "Pace");
    await userEvent.click(within(rowOf("Pace")).getByLabelText("Remove source"));
    await userEvent.type(input("Status"), "1");
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect((written(h).extraFacts as Record<string, unknown>)["a:statedBy"]).toBeUndefined();
  });

  it("keeps a source the person chose on a new impact", async () => {
    const h = makeHost();
    h.state.self = { "@id": ANN };
    h.fn.find.mockResolvedValue(page([valueHit()]));
    setup({}, h);
    await pick("Pa", "Pace");
    const user = await typeInto("Pace source", "the manual");
    await user.click(await screen.findByText('Use "the manual" as text'));
    await userEvent.type(input("Status"), "1");
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    const facts = written(h).extraFacts as Record<string, unknown>;
    expect(facts["a:source"]).toBe("the manual");
    expect(facts["a:statedBy"]).toEqual({ "@id": ANN });
  });

  it("keeps the draft, and says why, when the write is refused", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([valueHit()]));
    h.fn.writePairRelation.mockRejectedValueOnce(new Error("Refused"));
    const t = setup({}, h);
    await pick("Pa", "Pace");
    await userEvent.type(input("Status"), "1");
    await userEvent.type(input("Expected"), "2{Enter}");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Refused"));
    expect(rowOf("Pace")).toBeTruthy();
    expect(h.names()).toEqual(["writePairRelation"]);
  });

  it("drops the draft on Escape without writing", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([valueHit()]));
    setup({}, h);
    await pick("Pa", "Pace");
    await userEvent.keyboard("{Escape}");
    expect(rowOf("Pace")).toBeNull();
    expect(h.fn.writePairRelation).not.toHaveBeenCalled();
  });

  it("does not offer a target already impacted, or already a draft", async () => {
    const h = makeHost();
    withImpacts(h, speed());
    h.fn.find.mockResolvedValue(page([hit("v1", "Speed"), valueHit(), hit("v3", "Pacer")]));
    setup({}, h);
    await typeInto("Impacts", "Pa");
    const first = await screen.findByTestId("plan-link-hits");
    expect(within(first).queryByText("Speed")).toBeNull();
    expect(within(first).getByText("Pace")).toBeTruthy();
    await userEvent.click(within(first).getByText("Pace"));
    expect(rowOf("Pace")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Impacts" });
    await userEvent.click(box);
    await userEvent.clear(box);
    await userEvent.type(box, "Pac");
    const hits = await screen.findByTestId("plan-link-hits");
    expect(within(hits).getByText("Pacer")).toBeTruthy();
    expect(within(hits).queryByText("Pace")).toBeNull();
    expect(within(hits).queryByText("Speed")).toBeNull();
  });

  it("says the address was not read for a pick with none, and opens no draft", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("v2", "Pace", { entityUri: undefined })]));
    const t = setup({}, h);
    await pick("Pa", "Pace");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("That record's address was not read, so it was not linked."));
    expect(rowOf("Pace")).toBeNull();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("names a draft by the address tail when the pick has no tag", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([{ uri: uri("v2"), label: "Pace", row: row("v2", "", { facts: {} }) }]));
    setup({}, h);
    await pick("Pa", "Pace");
    expect(rowOf("v2")).toBeTruthy();
  });
});

describe("creating a Value or a Resource", () => {
  async function createFree(kind: "Value" | "Resource", text = "Latency") {
    const user = await typeInto("Impacts", text);
    const buttons = await screen.findAllByTestId("plan-link-create");
    expect(buttons.map((b) => b.textContent)).toEqual([`Create Value "${text}"`, `Create Resource "${text}"`]);
    await user.click(buttons[kind === "Value" ? 0 : 1]!);
  }

  it("offers one create button for each kind", async () => {
    const h = makeHost();
    setup({}, h);
    await typeInto("Impacts", "Latency");
    expect(await screen.findAllByTestId("plan-link-create")).toHaveLength(2);
  });

  it("makes a Value with the optimistic create and opens a draft for it", async () => {
    const h = makeHost();
    const t = setup({}, h);
    await createFree("Value");
    await waitFor(() => expect(rowOf("Latency")).toBeTruthy());
    expect(h.fn.mutateAsync).toHaveBeenCalledWith({ type: { id: "value" }, facts: { unitTag: "Latency" }, nameOnly: true });
    expect(h.fn.resolveType).toHaveBeenCalledWith("value");
    expect(h.names()).toEqual(["mutateAsync", "invalidatePlanSearch"]);
    expect(h.fn.invalidatePlanSearch).toHaveBeenCalledWith(VAULT);
    expect(t.p.onNotice).toHaveBeenLastCalledWith(null);
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
    expect(input("Unit").value).toBe("");
    expect(screen.getByLabelText("Status")).toBeTruthy();
  });

  it("makes a Resource, and its draft asks for an amount, written with role:resource", async () => {
    const h = makeHost();
    setup({}, h);
    await createFree("Resource");
    await waitFor(() => expect(rowOf("Latency")).toBeTruthy());
    expect(h.fn.mutateAsync).toHaveBeenCalledWith({ type: { id: "resource" }, facts: { unitTag: "Latency" }, nameOnly: true });
    await userEvent.type(input("Amount"), "+4{Enter}");
    await waitFor(() => expect(h.fn.writePairRelation).toHaveBeenCalled());
    expect(written(h)).toMatchObject({ targetId: "made", targetEntityUri: uri("made"), roles: { source: "role:solution", target: "role:resource" } });
  });

  it("says the type cannot be made, naming the kind, before it makes anything", async () => {
    const h = makeHost();
    h.state.types.resource = null;
    const t = setup({}, h);
    await createFree("Resource");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Resource is not a type this app can create."));
    expect(h.fn.mutateAsync).not.toHaveBeenCalled();
    cleanup();
    const g = makeHost();
    g.state.types.value = null;
    const u = setup({}, g);
    await createFree("Value");
    await waitFor(() => expect(u.p.onNotice).toHaveBeenCalledWith("Value is not a type this app can create."));
  });

  it("offers no picker, so no create, to a record with no address", () => {
    const h = makeHost();
    const t = setup({ record: row("sol", "Fix.Door", { entityUri: undefined }), offer: true }, h, { editing: false });
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(t.p.onNotice).not.toHaveBeenCalled();
  });

  it("says the record was made but not linked when the vault gave no address", async () => {
    const h = makeHost();
    h.fn.mutateAsync.mockResolvedValue({ id: "made", etag: null, tempId: "" });
    const t = setup({}, h);
    await createFree("Value");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("The record was made, but its address was not read, so it was not linked."));
    expect(rowOf("Latency")).toBeNull();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("shows the duplicate-tag sentence when the vault answers 409", async () => {
    const h = makeHost();
    h.fn.mutateAsync.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    const t = setup({}, h);
    await createFree("Value");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Latency" is already used in this vault. Pick another.'));
    expect(rowOf("Latency")).toBeNull();
  });

  it("disables the create buttons while the record is made", async () => {
    const h = makeHost();
    let release: (v: { id: string; etag: string | null; entityUri?: string; tempId: string }) => void = () => {};
    h.fn.mutateAsync.mockReturnValue(new Promise((r) => (release = r)));
    setup({}, h);
    await createFree("Value");
    await waitFor(() => expect((screen.getAllByTestId("plan-link-create")[0] as HTMLButtonElement).disabled).toBe(true));
    release({ id: "made", etag: null, entityUri: uri("made"), tempId: "" });
    await waitFor(() => expect(rowOf("Latency")).toBeTruthy());
  });
});

describe("showing a created record on the screen vault's list", () => {
  const made = gridRow("made", "Latency");
  const other = gridRow("other", "Other");
  const pages = (records: typeof made[], total = records.length) => ({ pages: [{ records, total, extra: "kept" } as never], pageParams: [0] });
  const create = async (h: ReturnType<typeof makeHost>, planVault?: string) => {
    const t = setup(planVault ? { planVault } : {}, h);
    const user = await typeInto("Impacts", "Latency");
    await user.click((await screen.findAllByTestId("plan-link-create"))[0]!);
    await waitFor(() => expect(h.fn.invalidatePlanSearch).toHaveBeenCalled());
    return t;
  };

  it("does nothing when the screen vault is the record's vault", async () => {
    const h = makeHost();
    await create(h);
    expect(h.names()).not.toContain("getRecordPages");
    expect(h.names()).not.toContain("setRecordPages");
  });

  it("copies the new row to the front of the screen vault's first page when that list is loaded, widening the total", async () => {
    const h = makeHost();
    h.state.pages["https://q.example.test/vault"] = pages([made]);
    h.state.pages[VAULT] = pages([other], 1);
    await create(h, "https://q.example.test/vault");
    expect(h.calls.filter((c) => c.startsWith("getRecordPages")).map((c) => c.split(" ")[1])).toEqual([
      JSON.stringify(["https://q.example.test/vault"]),
      JSON.stringify([VAULT]),
    ]);
    expect(h.state.pages[VAULT]).toEqual({ pages: [{ records: [made, other], total: 2, extra: "kept" }], pageParams: [0] });
  });

  it("keeps the larger total", async () => {
    const h = makeHost();
    h.state.pages["https://q.example.test/vault"] = pages([made]);
    h.state.pages[VAULT] = pages([other], 40);
    await create(h, "https://q.example.test/vault");
    expect((h.state.pages[VAULT]!.pages[0] as { total: number }).total).toBe(40);
  });

  it.each([
    ["the screen list is not loaded", { made: pages([made]), screen: undefined }],
    ["the screen list has no page", { made: pages([made]), screen: { pages: [], pageParams: [] } }],
    ["the record's list does not hold the row", { made: pages([other]), screen: pages([other]) }],
    ["the record's list is not loaded", { made: undefined, screen: pages([other]) }],
    ["the screen list already holds the row", { made: pages([made]), screen: pages([made, other]) }],
  ])("leaves the screen list alone when %s", async (_n, lists) => {
    const h = makeHost();
    h.state.pages["https://q.example.test/vault"] = lists.made;
    h.state.pages[VAULT] = lists.screen;
    const before = JSON.stringify(lists.screen);
    await create(h, "https://q.example.test/vault");
    expect(h.names()).not.toContain("setRecordPages");
    expect(JSON.stringify(h.state.pages[VAULT])).toBe(before);
  });
});
