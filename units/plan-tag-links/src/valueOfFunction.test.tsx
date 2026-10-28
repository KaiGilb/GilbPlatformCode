// PlanValueOfFunction against a fake host: the Value card's list of the Functions it measures, a list of links written whole.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanValueOfFunction } from "./index";
import { VAULT, gridRow, hit, labels, makeHost, page, row, uri } from "../test/fakeHost";
import { mount, pick, typeInto } from "../test/mount";
import type { ComponentProps } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const valueRow = (measures: unknown, more: Partial<BaseRecord> = {}): BaseRecord =>
  row("val", "Speed", { typeUri: "t:Value", served: { facts: { measures }, context: undefined, etag: null }, ...more });

function setup(over: Partial<ComponentProps<typeof PlanValueOfFunction>> = {}, h = makeHost(), o: { editing?: boolean } = {}) {
  const p = { record: valueRow([{ "@id": uri("f1") }]), vaultId: VAULT, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn(), onWritten: vi.fn(), ...over };
  return { p, ...mount(<PlanValueOfFunction {...p} />, h, o) };
}
const shown = () => [...screen.getByTestId("plan-value-of-function").querySelectorAll("button[title]")].map((s) => s.textContent);

describe("the Functions it measures", () => {
  it("shows each served link by its live tag, in stored order", () => {
    labels[uri("f1")] = "Door.Open";
    labels[uri("f2")] = "Door.Close";
    setup({ record: valueRow([{ "@id": uri("f1") }, { "@id": uri("f2") }]) });
    expect(shown()).toEqual(["Door.Open", "Door.Close"]);
  });

  it("follows a label that changes", () => {
    labels[uri("f1")] = "Door.Open";
    const t = setup();
    labels[uri("f1")] = "Door.Ajar";
    t.view.rerender(<PlanValueOfFunction {...t.p} />);
    expect(shown()).toEqual(["Door.Ajar"]);
  });

  it("reads one link, a bare address, a JSON text, and a flat fact when nothing is served", () => {
    for (const [served, flat] of [
      [{ "@id": uri("f1") }, undefined],
      [uri("f1"), undefined],
      [JSON.stringify([{ "@id": uri("f1") }]), undefined],
      [undefined, uri("f1")],
    ] as const) {
      cleanup();
      labels[uri("f1")] = "Door.Open";
      const record =
        served === undefined
          ? row("val", "Speed", { typeUri: "t:Value", facts: { unitTag: "Speed", measures: flat! } })
          : valueRow(served);
      setup({ record });
      expect(shown()).toEqual(["Door.Open"]);
    }
  });

  it("shows each address once, and reads the served list before the flat fact", () => {
    labels[uri("f1")] = "Door.Open";
    labels[uri("f2")] = "Door.Close";
    setup({ record: valueRow([{ "@id": uri("f1") }, { "@id": uri("f1") }, uri("f1")], { facts: { unitTag: "Speed", measures: uri("f2") } }) });
    expect(shown()).toEqual(["Door.Open"]);
  });

  it("ignores a text that is not a link list, and an empty one", () => {
    setup({ record: valueRow("{broken") });
    expect(shown()).toEqual([]);
    cleanup();
    setup({ record: valueRow("   ") });
    expect(shown()).toEqual([]);
  });

  it("opens a Function by the id of its address", async () => {
    labels[uri("f1")] = "Door.Open";
    const t = setup();
    await userEvent.click(screen.getByText("Door.Open"));
    expect(t.p.onOpen).toHaveBeenCalledWith("f1");
  });

  it("names the remove control by the pool's tag, else by the address tail", () => {
    const h = makeHost();
    h.state.pool = [gridRow("f1", "Door.Open")];
    setup({ record: valueRow([{ "@id": uri("f1") }, { "@id": uri("zz") }]) }, h);
    expect(screen.getByLabelText("Remove Door.Open")).toBeTruthy();
    expect(screen.getByLabelText("Remove zz")).toBeTruthy();
  });
});

describe("who can edit", () => {
  it("draws the picker and the remove controls in edit mode; neither in presentation", () => {
    setup();
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    expect(screen.getByLabelText("Remove f1")).toBeTruthy();
    cleanup();
    setup({}, makeHost(), { editing: false });
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove f1")).toBeNull();
  });

  it("offers the picker in presentation when asked to", () => {
    setup({ offer: true }, makeHost(), { editing: false });
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
  });

  it.each(["patchRecord", "createRecord"] as const)("is read-only when the host has no %s", (missing) => {
    setup({ offer: true }, makeHost({ without: [missing] }));
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove f1")).toBeNull();
  });
});

describe("adding a Function", () => {
  it("searches Functions, and writes the whole list with the new one last", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f2", "Door.Close")]));
    const t = setup({}, h);
    await pick("Value of Function", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.find).toHaveBeenCalledWith(VAULT, "Door", ["Function"]);
    expect(h.fn.patchRecord).toHaveBeenCalledTimes(1);
    expect(h.fn.patchRecord).toHaveBeenCalledWith("val", { measures: [{ "@id": uri("f1") }, { "@id": uri("f2") }] }, uri("val"), undefined, { ifMatch: '"e"' });
    expect(h.names()).toEqual(["liveRow", "liveRow", "ensureEtagUnchanged", "patchRecord", "applyPatch", "storePlanRow", "setPlanRecord"]);
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
    expect(t.p.onWritten).toHaveBeenCalledTimes(1);
  });

  it("does not offer a Function the Value already measures", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f1", "Door.Open"), hit("f2", "Door.Close")]));
    setup({}, h);
    await typeInto("Value of Function", "Door");
    await screen.findByText("Door.Close");
    expect(screen.queryByText("Door.Open")).toBeNull();
  });

  it("adds nothing when the live row already holds the Function", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f2", "Door.Close")]));
    h.state.live.val = { ...valueRow([{ "@id": uri("f1") }, { "@id": uri("f2") }]), updatedAt: 1 };
    const t = setup({}, h);
    await pick("Value of Function", "Door", "Door.Close");
    await waitFor(() => expect(h.names()).toContain("liveRow"));
    await new Promise((r) => setTimeout(r, 50));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
    expect(t.p.onWritten).not.toHaveBeenCalled();
  });

  it("says the address was not read for a record with none", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f2", "Door.Close", { entityUri: undefined })]));
    const t = setup({}, h);
    await pick("Value of Function", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("That record's address was not read, so it was not linked."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("shows the duplicate-tag sentence if the patch is refused with 409", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f2", "Door.Close")]));
    h.fn.patchRecord.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    const t = setup({}, h);
    await pick("Value of Function", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Door.Close" is already used in this vault. Pick another.'));
    expect(t.p.onWritten).not.toHaveBeenCalled();
  });

  it("says the version could not be read, and does not patch, when no ETag can be had", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f2", "Door.Close")]));
    h.fn.ensureEtagUnchanged.mockResolvedValue({ unreadable: true });
    const t = setup({}, h);
    await pick("Value of Function", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's version could not be read, so your change was not saved. Reload and try again."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });

  it("checks the list is unchanged before it writes it: the same list, in the same order", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("f2", "Door.Close")]));
    h.fn.ensureEtagUnchanged.mockResolvedValue({ conflict: true });
    const t = setup({}, h);
    await pick("Value of Function", "Door", "Door.Close");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This changed elsewhere. The card now shows the latest; your change was not saved."));
    const same = h.fn.ensureEtagUnchanged.mock.calls[0]![2];
    expect(same(valueRow([{ "@id": uri("f1") }]) as never)).toBe(true);
    expect(same(valueRow([{ "@id": uri("f2") }]) as never)).toBe(false);
    expect(same(valueRow([{ "@id": uri("f1") }, { "@id": uri("f2") }]) as never)).toBe(false);
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });
});

describe("removing a Function", () => {
  it("writes the list without it, and tells the caller", async () => {
    labels[uri("f1")] = "Door.Open";
    labels[uri("f2")] = "Door.Close";
    const h = makeHost();
    h.state.pool = [gridRow("f1", "Door.Open"), gridRow("f2", "Door.Close")];
    const t = setup({ record: valueRow([{ "@id": uri("f1") }, { "@id": uri("f2") }]) }, h);
    await userEvent.click(screen.getByLabelText("Remove Door.Open"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.patchRecord).toHaveBeenCalledWith("val", { measures: [{ "@id": uri("f2") }] }, uri("val"), undefined, { ifMatch: '"e"' });
    expect(t.p.onWritten).toHaveBeenCalledTimes(1);
  });

  it("retracts the fact when the list becomes empty, and does not tell the caller", async () => {
    labels[uri("f1")] = "Door.Open";
    const h = makeHost();
    const t = setup({}, h);
    await userEvent.click(screen.getByLabelText("Remove f1"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.patchRecord).toHaveBeenCalledWith("val", { measures: null }, uri("val"), undefined, { ifMatch: '"e"' });
    expect(t.p.onWritten).not.toHaveBeenCalled();
  });
});

describe("creating a Function", () => {
  async function createFree(text = "Door.Fresh") {
    const user = await typeInto("Value of Function", text);
    const button = await screen.findByTestId("plan-link-create");
    expect(button.textContent).toBe(`Create Function "${text}"`);
    await user.click(button);
  }

  it("makes it with the raw create and writes the list with the new address last", async () => {
    const h = makeHost();
    const t = setup({}, h);
    await createFree();
    await waitFor(() => expect(t.p.onWritten).toHaveBeenCalled());
    expect(h.fn.createRecord).toHaveBeenCalledWith(VAULT, "t:Function", { unitTag: "Door.Fresh" }, "Door.Fresh");
    expect(h.fn.mutateAsync).not.toHaveBeenCalled();
    expect(h.fn.patchRecord).toHaveBeenCalledWith("val", { measures: [{ "@id": uri("f1") }, { "@id": `${VAULT}/e/made` }] }, uri("val"), undefined, { ifMatch: '"e"' });
    expect(h.names()).toEqual([
      "typeUriForVaultNamespace",
      "createRecord",
      "invalidatePlanSearch",
      "memberEntityUri",
      "liveRow",
      "liveRow",
      "ensureEtagUnchanged",
      "patchRecord",
      "applyPatch",
      "storePlanRow",
      "setPlanRecord",
    ]);
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
    expect(t.p.onNotice).toHaveBeenLastCalledWith(null);
  });

  it("says the type cannot be made, before it makes anything", async () => {
    const h = makeHost();
    h.state.types.function = null;
    const t = setup({}, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("Function is not a type this app can create."));
    expect(h.fn.createRecord).not.toHaveBeenCalled();
  });

  it("says the record was made but not linked when the vault gave no id", async () => {
    const h = makeHost();
    h.fn.createRecord.mockResolvedValue({ id: "", etag: null });
    const t = setup({}, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("The record was made, but its address was not read, so it was not linked."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("shows the duplicate-tag sentence on a 409", async () => {
    const h = makeHost();
    h.fn.createRecord.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    const t = setup({}, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Door.Fresh" is already used in this vault. Pick another.'));
  });
});
