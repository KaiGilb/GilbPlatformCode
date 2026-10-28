// PlanPartOf against a fake host. The source had no test of it on its own (the card suites render whole cards over a stubbed
// fetch); every case here is new and pins what the source did, odd cases included.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanPartOf } from "./index";
import { VAULT, gridRow, hit, labels, makeHost, page, row, uri } from "../test/fakeHost";
import { mount, pick, typeInto } from "../test/mount";
import type { ComponentProps } from "react";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const self = row("self", "Door");

function props(over: Partial<ComponentProps<typeof PlanPartOf>> = {}) {
  return { record: self, vaultId: VAULT, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn(), ...over };
}
function setup(over: Partial<ComponentProps<typeof PlanPartOf>> = {}, h = makeHost(), o: { editing?: boolean } = {}) {
  const p = props(over);
  return { p, ...mount(<PlanPartOf {...p} />, h, o) };
}

describe("what it shows", () => {
  it("says (none fits) when the record has no parent", () => {
    setup();
    expect(screen.getByTestId("plan-part-of").textContent).toContain("(none fits)");
    expect(screen.queryByLabelText("Remove Part of")).toBeNull();
  });

  it("shows the parent by its live tag, not by a copy: the label follows the record it points at", () => {
    labels[uri("p1")] = "Door.Close";
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    const t = setup({ record });
    expect(screen.getByText("Door.Close")).toBeTruthy();
    expect(screen.queryByText("(none fits)")).toBeNull();
    labels[uri("p1")] = "Door.Shut";
    t.view.rerender(<PlanPartOf {...t.p} record={record} />);
    expect(screen.getByText("Door.Shut")).toBeTruthy();
    expect(screen.queryByText("Door.Close")).toBeNull();
  });

  it("opens the parent by its id", async () => {
    labels[uri("p1")] = "Door.Close";
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    const t = setup({ record });
    await userEvent.click(screen.getByText("Door.Close"));
    expect(t.p.onOpen).toHaveBeenCalledWith("p1");
  });

  it("reads the parent from the served link first", () => {
    labels[uri("p2")] = "Served.Parent";
    const record = row("self", "Door", {
      facts: { unitTag: "Door", fvParent: uri("p1") },
      served: { facts: { fvParent: { "@id": uri("p2") } }, context: undefined, etag: null },
    });
    setup({ record });
    expect(screen.getByText("Served.Parent")).toBeTruthy();
  });

  it("asks the host for the pool of the screen vault and the create hook of the plan vault", () => {
    const t = setup({ planVault: "https://q.example.test/vault" });
    expect(t.fn.useRecords).toHaveBeenCalledWith(VAULT);
    expect(t.fn.useCreateRecord).toHaveBeenCalledWith("https://q.example.test/vault");
  });
});

describe("who can edit", () => {
  it("draws the picker and the remove control in edit mode", () => {
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    setup({ record });
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    expect(screen.getByLabelText("Remove Part of")).toBeTruthy();
  });

  it("draws neither in presentation", () => {
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    setup({ record }, makeHost(), { editing: false });
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove Part of")).toBeNull();
  });

  it("offers the picker in presentation when asked to (the group's + Add), but no remove control", () => {
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    setup({ record, offer: true }, makeHost(), { editing: false });
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    expect(screen.queryByLabelText("Remove Part of")).toBeNull();
  });

  it("draws nothing to edit when canEdit is false, offer or not", () => {
    setup({ canEdit: false, offer: true });
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
  });

  it("is read-only when the host has no patchRecord", () => {
    setup({ offer: true }, makeHost({ without: ["patchRecord"] }));
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
  });

  it("is read-only when the host has no useCreateRecord", () => {
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    const t = setup({ record, offer: true }, makeHost({ without: ["useCreateRecord"] }));
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove Part of")).toBeNull();
    expect(t.fn.useCreateRecord).not.toHaveBeenCalled();
  });
});

describe("picking a parent", () => {
  it("searches Functions and Function constraints in the plan vault", async () => {
    const h = makeHost();
    setup({ planVault: "https://q.example.test/vault" }, h);
    await typeInto("Part of", "Door");
    await waitFor(() => expect(h.fn.find).toHaveBeenCalledWith("https://q.example.test/vault", "Door", ["Function", "FunctionConstraint"]));
  });

  it("writes one link through the host, in the order the source made its calls", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    h.state.records.p1 = row("p1", "Door.Close");
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.names().filter((n) => n !== "invalidatePlanSearch")).toEqual([
      "readRecord",
      "liveRow",
      "ensureEtagUnchanged",
      "patchRecord",
      "applyPatch",
      "storePlanRow",
      "setPlanRecord",
      "prependPlanFind",
    ]);
    expect(h.fn.patchRecord).toHaveBeenCalledTimes(1);
    expect(h.fn.patchRecord).toHaveBeenCalledWith("self", { fvParent: { "@id": uri("p1") } }, uri("self"), undefined, { ifMatch: '"e"' });
    expect(h.fn.readRecord).toHaveBeenCalledWith("p1", uri("p1"));
    expect(h.calls).toContain(`prependPlanFind ${JSON.stringify([VAULT, "a:fvParent", "p1", "self"])}`);
    expect(h.calls).toContain(`setPlanRecord ${JSON.stringify(["self", uri("self"), "self"])}`);
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
  });

  it("passes the write source when the record carries served keys", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    h.state.records.p1 = row("p1", "Door.Close");
    h.state.live.self = { ...gridRow("self", "Door"), servedKeys: ["unitTag"], etag: '"s1"' };
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.patchRecord).toHaveBeenCalledWith(
      "self",
      { fvParent: { "@id": uri("p1") } },
      uri("self"),
      { at: uri("self"), servedKeys: ["unitTag"] },
      { ifMatch: '"s1"' },
    );
  });

  it("retracts the old parent from its find when a new one is picked", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p2", "Door.Shut")]));
    h.state.records.p2 = row("p2", "Door.Shut");
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    h.state.live.self = { ...gridRow("self", "Door"), facts: record.facts };
    labels[uri("p1")] = "Door.Close";
    const t = setup({ record }, h);
    await pick("Part of", "Door", "Door.Shut");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.calls).toContain(`dropPlanFind ${JSON.stringify([VAULT, "a:fvParent", "p1", "self"])}`);
    expect(h.calls.indexOf(`dropPlanFind ${JSON.stringify([VAULT, "a:fvParent", "p1", "self"])}`)).toBeLessThan(
      h.calls.indexOf(`prependPlanFind ${JSON.stringify([VAULT, "a:fvParent", "p2", "self"])}`),
    );
  });

  it("uses the pool row for the chosen record when the card already holds it", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    h.state.records.p1 = row("p1", "Door.Close");
    h.state.pool = [gridRow("p1", "Door.Close")];
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.patchRecord).toHaveBeenCalledTimes(1);
  });

  it("does not offer a record that sits under this one, or this one", async () => {
    const h = makeHost();
    h.state.pool = [gridRow("kid", "Door.Kid", { facts: { unitTag: "Door.Kid", fvParent: uri("self") } })];
    h.fn.find.mockResolvedValue(page([hit("kid", "Door.Kid"), hit("self", "Door"), hit("p1", "Door.Close")]));
    setup({}, h);
    await typeInto("Part of", "Door");
    const hits = await screen.findByTestId("plan-link-hits");
    await within(hits).findByText("Door.Close");
    expect(within(hits).queryByText("Door.Kid")).toBeNull();
    expect(within(hits).queryByText("Door")).toBeNull();
  });

  it("says the address was not read, and writes nothing, for a record with no address", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([{ uri: uri("p1"), label: "Door.Close", row: row("p1", "Door.Close", { entityUri: undefined }) }]));
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("That record's address was not read, so it was not linked."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });
});

describe("a loop", () => {
  it("is refused before any write, with the sentence naming both tags", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    h.state.records.p1 = row("p1", "Door.Close", { facts: { unitTag: "Door.Close", fvParent: uri("self") } });
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Door.Close is under Door, so it cannot be its Part of."));
    expect(h.names()).toEqual(["readRecord"]);
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("is refused for a record two steps up, found by reading the chain", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    h.state.records.p1 = row("p1", "Door.Close", { facts: { unitTag: "Door.Close", fvParent: uri("p2") } });
    h.state.records.p2 = row("p2", "Door.Shut", { facts: { unitTag: "Door.Shut", fvParent: uri("self") } });
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Door.Close is under Door, so it cannot be its Part of."));
    expect(h.names()).toEqual(["readRecord", "readRecord"]);
  });

  it("says the chain could not be checked when a parent cannot be read, and writes nothing", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    h.fn.readRecord.mockRejectedValue(new Error("offline"));
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Could not check the chain — try again."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("says the chain could not be checked when a parent is not there", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p1", "Door.Close")]));
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Could not check the chain — try again."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("says the chain is too deep after 50 reads", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("p0", "Door.Close")]));
    for (let i = 0; i < 60; i++) h.state.records[`p${i}`] = row(`p${i}`, `T${i}`, { facts: { unitTag: "Door", fvParent: uri(`p${i + 1}`) } });
    const t = setup({}, h);
    await pick("Part of", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This chain is too deep to check."));
    expect(h.fn.readRecord).toHaveBeenCalledTimes(50);
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });
});

describe("creating a parent", () => {
  async function createFree(h: ReturnType<typeof makeHost>, text = "Window") {
    const user = await typeInto("Part of", text);
    const button = await screen.findByTestId("plan-link-create");
    expect(button.textContent).toBe(`Create Function "${text}"`);
    await user.click(button);
  }

  it("makes the Function with the optimistic create, then links it, in the source's order", async () => {
    const h = makeHost();
    const t = setup({}, h);
    await createFree(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.fn.mutateAsync).toHaveBeenCalledWith({ type: { id: "function" }, facts: { unitTag: "Window" }, nameOnly: true });
    expect(h.fn.tagUsed).toHaveBeenCalledWith(VAULT, "Window");
    expect(h.names().filter((n) => n !== "readRecord")).toEqual([
      "mutateAsync",
      "invalidatePlanSearch",
      "liveRow",
      "ensureEtagUnchanged",
      "patchRecord",
      "applyPatch",
      "storePlanRow",
      "setPlanRecord",
      "prependPlanFind",
    ]);
    expect(h.fn.patchRecord).toHaveBeenCalledWith("self", { fvParent: { "@id": uri("made") } }, uri("self"), undefined, { ifMatch: '"e"' });
    expect(h.fn.createRecord).not.toHaveBeenCalled();
  });

  it("does not take the raw create path", async () => {
    const h = makeHost();
    setup({}, h);
    await createFree(h);
    await waitFor(() => expect(h.fn.patchRecord).toHaveBeenCalled());
    expect(h.fn.createRecord).not.toHaveBeenCalled();
  });

  it("says so, and links nothing, when the type cannot be made", async () => {
    const h = makeHost();
    h.state.types.function = null;
    const t = setup({}, h);
    await createFree(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Function is not a type this app can create."));
    expect(h.fn.mutateAsync).not.toHaveBeenCalled();
  });

  it("says the record was made but not linked when the vault gave no address", async () => {
    const h = makeHost();
    h.fn.mutateAsync.mockResolvedValue({ id: "made", etag: null, tempId: "" });
    const t = setup({}, h);
    await createFree(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("The record was made, but its address was not read, so it was not linked."));
    expect(h.names()).toEqual(["mutateAsync", "invalidatePlanSearch"]);
    expect(h.fn.invalidatePlanSearch).toHaveBeenCalledWith(VAULT);
  });

  it("shows the duplicate-tag sentence when the vault answers 409", async () => {
    const h = makeHost();
    h.fn.mutateAsync.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    const t = setup({}, h);
    await createFree(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Window" is already used in this vault. Pick another.'));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("shows another error's own message, and the rolled-back sentence for a non-error", async () => {
    const h = makeHost();
    h.fn.mutateAsync.mockRejectedValueOnce(new Error("Network down"));
    const t = setup({}, h);
    await createFree(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Network down"));
    h.fn.mutateAsync.mockRejectedValueOnce("boom");
    await userEvent.click(await screen.findByTestId("plan-link-create"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Couldn't save — your change was rolled back. Try again."));
  });
});

describe("unlinking", () => {
  const withParent = () => row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });

  it("patches the link to null and takes the record off the parent's find", async () => {
    labels[uri("p1")] = "Door.Close";
    const h = makeHost();
    h.state.live.self = { ...gridRow("self", "Door"), facts: withParent().facts };
    const t = setup({ record: withParent() }, h);
    await userEvent.click(screen.getByLabelText("Remove Part of"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.patchRecord).toHaveBeenCalledWith("self", { fvParent: null }, uri("self"), undefined, { ifMatch: '"e"' });
    expect(h.calls).toContain(`dropPlanFind ${JSON.stringify([VAULT, "a:fvParent", "p1", "self"])}`);
    expect(h.names()).not.toContain("prependPlanFind");
    expect(h.names()).not.toContain("readRecord");
  });

  it("disables the control while the write is under way, and only then", async () => {
    labels[uri("p1")] = "Door.Close";
    const h = makeHost();
    let release: (v: { etag: string }) => void = () => {};
    h.fn.patchRecord.mockReturnValue(new Promise((r) => (release = r)));
    h.state.live.self = { ...gridRow("self", "Door"), facts: withParent().facts };
    setup({ record: withParent() }, h);
    const remove = screen.getByLabelText("Remove Part of") as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    await userEvent.click(remove);
    await waitFor(() => expect(remove.disabled).toBe(true));
    release({ etag: '"e3"' });
    await waitFor(() => expect(remove.disabled).toBe(false));
  });
});

describe("a write that cannot be made", () => {
  async function removeWith(gate: unknown) {
    labels[uri("p1")] = "Door.Close";
    const h = makeHost();
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    h.state.live.self = { ...gridRow("self", "Door"), facts: record.facts };
    h.fn.ensureEtagUnchanged.mockResolvedValue(gate as never);
    const t = setup({ record }, h);
    await userEvent.click(screen.getByLabelText("Remove Part of"));
    return { h, t };
  }

  it("says the version could not be read, and does not patch", async () => {
    const { h, t } = await removeWith({ unreadable: true });
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's version could not be read, so your change was not saved. Reload and try again."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("says it changed elsewhere, and does not patch", async () => {
    const { h, t } = await removeWith({ conflict: true });
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This changed elsewhere. The card now shows the latest; your change was not saved."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("gives the host a check that the link is still the one the write started from", async () => {
    const { h, t } = await removeWith({ unreadable: true });
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalled());
    const same = h.fn.ensureEtagUnchanged.mock.calls[0]![2];
    expect(same({ ...gridRow("self", "Door"), facts: { fvParent: uri("p1") } })).toBe(true);
    expect(same({ ...gridRow("self", "Door"), facts: { fvParent: uri("p9") } })).toBe(false);
    expect(same({ ...gridRow("self", "Door"), facts: {} })).toBe(false);
  });

  it("shows a rejected patch's message", async () => {
    labels[uri("p1")] = "Door.Close";
    const h = makeHost();
    const record = row("self", "Door", { facts: { unitTag: "Door", fvParent: uri("p1") } });
    h.state.live.self = { ...gridRow("self", "Door"), facts: record.facts };
    h.fn.patchRecord.mockRejectedValue(new Error("412 precondition"));
    const t = setup({ record }, h);
    await userEvent.click(screen.getByLabelText("Remove Part of"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("412 precondition"));
    expect(h.names()).not.toContain("storePlanRow");
  });
});
