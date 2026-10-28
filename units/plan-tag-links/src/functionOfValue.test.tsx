// PlanFunctionOfValue against a fake host. New: the source had no test of it on its own.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanFunctionOfValue } from "./index";
import { VAULT, gridRow, hit, labels, makeHost, page, row, uri } from "../test/fakeHost";
import { mount, pick, typeInto } from "../test/mount";
import type { ComponentProps } from "react";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const self = row("self", "Door.Open");
const value = (id: string, tag: string, more: Parameters<typeof row>[2] = {}) => row(id, tag, { typeUri: "t:Value", ...more });

function setup(over: Partial<ComponentProps<typeof PlanFunctionOfValue>> = {}, h = makeHost(), o: { editing?: boolean } = {}) {
  const p = { record: self, vaultId: VAULT, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn(), ...over };
  return { p, ...mount(<PlanFunctionOfValue {...p} />, h, o) };
}
const find = (h: ReturnType<typeof makeHost>, rows: ReturnType<typeof row>[], more: object = {}) => {
  h.state.finds["a:measures"] = { isError: false, data: { rows, total: rows.length, capped: false, unread: 0, ...more } };
};

describe("the Values it measures", () => {
  it("asks the host's find for a:measures in the plan vault", () => {
    const h = makeHost();
    setup({ planVault: "https://q.example.test/vault" }, h);
    expect(h.fn.usePlanFind).toHaveBeenCalledWith("https://q.example.test/vault", "a:measures", self);
  });

  it("shows only Values, by their live tag, sorted by tag then id", () => {
    const h = makeHost();
    find(h, [value("b", "Speed.B"), row("f", "Door.Fn"), value("a", "Speed.A"), value("c", "Speed.A")]);
    labels[uri("a")] = "Speed.A";
    labels[uri("b")] = "Speed.B";
    labels[uri("c")] = "Speed.A too";
    setup({}, h);
    const text = [...screen.getByTestId("plan-function-of-value").querySelectorAll("button")]
      .map((b) => b.textContent)
      .filter((x) => x && !x.startsWith("+"));
    expect(text.filter((x) => !x.startsWith("Remove"))).toEqual(["Speed.A", "Speed.A too", "Speed.B"]);
  });

  it("follows a label that changes", () => {
    const h = makeHost();
    find(h, [value("a", "Speed.A")]);
    labels[uri("a")] = "Speed.A";
    const t = setup({}, h);
    labels[uri("a")] = "Speed.Z";
    t.view.rerender(<PlanFunctionOfValue {...t.p} />);
    expect(screen.getByText("Speed.Z")).toBeTruthy();
  });

  it("offers Try again in place of the rows when the find failed", async () => {
    const h = makeHost();
    find(h, [value("a", "Speed.A")]);
    h.state.finds["a:measures"]!.isError = true;
    labels[uri("a")] = "Speed.A";
    setup({}, h);
    expect(screen.queryByText("Speed.A")).toBeNull();
    await userEvent.click(screen.getByText("Could not read the values — try again"));
    expect(h.fn.invalidatePlanFind).toHaveBeenCalledWith(VAULT, "a:measures", "self");
  });

  it("shows the cap note, with the word values", () => {
    const h = makeHost();
    find(h, [], { total: 500, capped: true });
    setup({}, h);
    expect(screen.getByText("Showing the first 300 of 500 values at this level.")).toBeTruthy();
  });

  it("shows the unread note, singular and plural", () => {
    const h = makeHost();
    find(h, [], { unread: 1 });
    const t = setup({}, h);
    expect(screen.getByText("1 value could not be read. Try again")).toBeTruthy();
    find(h, [], { unread: 2 });
    t.view.rerender(<PlanFunctionOfValue {...t.p} />);
    expect(screen.getByText("2 values could not be read. Try again")).toBeTruthy();
  });
});

describe("who can edit", () => {
  it("shows + Value and a remove control for each Value in edit mode, and no picker until + Value is pressed", async () => {
    const h = makeHost();
    find(h, [value("a", "Speed.A")]);
    setup({}, h);
    expect(screen.getByLabelText("Remove Speed.A")).toBeTruthy();
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    await userEvent.click(screen.getByText("+ Value"));
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
  });

  it("opens the picker at once, in presentation, when the group offers it", () => {
    const h = makeHost();
    find(h, [value("a", "Speed.A")]);
    setup({ offer: true }, h, { editing: false });
    expect(screen.getByTestId("plan-link-picker")).toBeTruthy();
    expect(screen.queryByLabelText("Remove Speed.A")).toBeNull();
  });

  it("shows nothing to edit in presentation without the offer", () => {
    const h = makeHost();
    find(h, [value("a", "Speed.A")]);
    setup({}, h, { editing: false });
    expect(screen.queryByText("+ Value")).toBeNull();
    expect(screen.queryByLabelText("Remove Speed.A")).toBeNull();
  });

  it.each(["patchRecord", "createRecord"] as const)("is read-only when the host has no %s", (missing) => {
    const h = makeHost({ without: [missing] });
    find(h, [value("a", "Speed.A")]);
    setup({ offer: true }, h);
    expect(screen.queryByText("+ Value")).toBeNull();
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
    expect(screen.queryByLabelText("Remove Speed.A")).toBeNull();
  });
});

describe("picking a Value", () => {
  async function pickValue(h: ReturnType<typeof makeHost>) {
    return pick("Function of Value", "Speed", "Speed.A");
  }

  it("searches Values and writes a:measures on the Value through the host's patch", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("a", "Speed.A", { typeUri: "t:Value" })]));
    const t = setup({ offer: true }, h);
    await pickValue(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.find).toHaveBeenCalledWith(VAULT, "Speed", ["Value"]);
    expect(h.fn.patchRecord).toHaveBeenCalledTimes(1);
    expect(h.fn.patchRecord).toHaveBeenCalledWith("a", { measures: { "@id": uri("self") } }, uri("a"), undefined, { ifMatch: '"e"' });
    expect(h.names()).toEqual(["liveRow", "ensureEtagUnchanged", "patchRecord", "applyPatch", "storePlanRow", "setPlanRecord", "prependPlanFind"]);
    expect(h.calls).toContain(`prependPlanFind ${JSON.stringify([VAULT, "a:measures", "self", "a"])}`);
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
  });

  it("refuses a Value that already measures another Function, naming both", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("a", "Speed.A", { typeUri: "t:Value", facts: { unitTag: "Speed.A", measures: uri("other") } })]));
    h.state.pool = [gridRow("other", "Door.Other")];
    const t = setup({ offer: true }, h);
    await pickValue(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('"Speed.A" already measures "Door.Other".'));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("names the other Function by its address tail when the pool does not hold it", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("a", "Speed.A", { typeUri: "t:Value", facts: { unitTag: "Speed.A", measures: uri("zz") } })]));
    const t = setup({ offer: true }, h);
    await pickValue(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('"Speed.A" already measures "zz".'));
  });

  it("does nothing, and says nothing, for a Value that already measures this Function", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("a", "Speed.A", { typeUri: "t:Value", facts: { unitTag: "Speed.A", measures: uri("self") } })]));
    const t = setup({ offer: true }, h);
    await pickValue(h);
    await waitFor(() => expect(h.fn.find).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(t.p.onNotice).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("says the address was not read when this record has none", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([hit("a", "Speed.A", { typeUri: "t:Value" })]));
    const t = setup({ offer: true, record: row("self", "Door.Open", { entityUri: undefined }) }, h);
    await pickValue(h);
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's address was not read, so it was not linked."));
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
  });
});

describe("unlinking a Value", () => {
  it("patches a:measures on that Value to null and takes it off the find", async () => {
    const h = makeHost();
    const v = value("a", "Speed.A", { facts: { unitTag: "Speed.A", measures: uri("self") } });
    find(h, [v]);
    h.state.live.a = { ...v, updatedAt: 1 };
    labels[uri("a")] = "Speed.A";
    const t = setup({}, h);
    await userEvent.click(screen.getByLabelText("Remove Speed.A"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.patchRecord).toHaveBeenCalledWith("a", { measures: null }, uri("a"), undefined, { ifMatch: '"e"' });
    expect(h.calls).toContain(`dropPlanFind ${JSON.stringify([VAULT, "a:measures", "self", "a"])}`);
    expect(h.names()).not.toContain("prependPlanFind");
  });

  it("writes nothing for a Value that does not point at this Function", async () => {
    const h = makeHost();
    const v = value("a", "Speed.A", { facts: { unitTag: "Speed.A", measures: uri("other") } });
    find(h, [v]);
    labels[uri("a")] = "Speed.A";
    setup({}, h);
    await userEvent.click(screen.getByLabelText("Remove Speed.A"));
    await new Promise((r) => setTimeout(r, 50));
    expect(h.names()).toEqual([]);
  });

  it("names the remove control by the id when the Value has no tag", () => {
    const h = makeHost();
    find(h, [value("a", "x", { facts: {} })]);
    labels[uri("a")] = "x";
    setup({}, h);
    expect(screen.getByLabelText("Remove a")).toBeTruthy();
  });
});

describe("creating a Value", () => {
  async function createFree(text = "Speed.New") {
    const user = await typeInto("Function of Value", text);
    const button = await screen.findByTestId("plan-link-create");
    expect(button.textContent).toBe(`Create Value "${text}"`);
    await user.click(button);
  }

  it("makes the Value with the raw create, already linked, and shows it on the line before the find is read again", async () => {
    const h = makeHost();
    const t = setup({ offer: true }, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(h.fn.createRecord).toHaveBeenCalledWith(VAULT, "t:Value", { unitTag: "Speed.New", measures: { "@id": uri("self") } }, "Speed.New");
    expect(h.fn.mutateAsync).not.toHaveBeenCalled();
    expect(h.fn.patchRecord).not.toHaveBeenCalled();
    expect(h.names()).toEqual(["typeUriForVaultNamespace", "createRecord", "invalidatePlanSearch", "memberEntityUri", "typeUriForVaultNamespace", "putRecordInCaches", "prependPlanFind"]);
    expect(h.calls).toContain(`putRecordInCaches ${JSON.stringify([VAULT, "made", { insert: true }])}`);
    expect(h.calls).toContain(`memberEntityUri ${JSON.stringify(["made", null, VAULT])}`);
    expect(h.calls).toContain(`prependPlanFind ${JSON.stringify([VAULT, "a:measures", "self", "made"])}`);
  });

  it("gives the host the row it has to show: the tag, the link, the first ETag and the served facts", async () => {
    const h = makeHost();
    let seen: unknown;
    const put = h.host.putRecordInCaches;
    h.host.putRecordInCaches = (v, r, o) => {
      seen = r;
      put(v, r, o);
    };
    const t = setup({ offer: true }, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(seen).toEqual({
      id: "made",
      entityUri: `${VAULT}/e/made`,
      typeUri: "t:Value",
      facts: { unitTag: "Speed.New", measures: uri("self") },
      opaqueFacts: [],
      etag: '"m1"',
      updatedAt: expect.any(Number),
      servedKeys: ["unitTag", "measures"],
      served: { facts: { unitTag: "Speed.New", measures: { "@id": uri("self") } }, context: undefined, etag: '"m1"' },
    });
  });

  it("does nothing more when the vault answers no id", async () => {
    const h = makeHost();
    h.fn.createRecord.mockResolvedValue({ id: "", etag: null });
    const t = setup({ offer: true }, h);
    await createFree();
    await waitFor(() => expect(h.fn.createRecord).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(h.names()).toEqual(["typeUriForVaultNamespace", "createRecord"]);
    expect(t.p.onNotice).not.toHaveBeenCalled();
  });

  it("keeps a null ETag as null", async () => {
    const h = makeHost();
    h.fn.createRecord.mockResolvedValue({ id: "made", etag: null });
    let seen: { etag?: unknown } = {};
    const put = h.host.putRecordInCaches;
    h.host.putRecordInCaches = (v, r, o) => {
      seen = r;
      put(v, r, o);
    };
    const t = setup({ offer: true }, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith(null));
    expect(seen.etag).toBeNull();
  });

  it("shows the duplicate-tag sentence when the vault answers 409", async () => {
    const h = makeHost();
    h.fn.createRecord.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    const t = setup({ offer: true }, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith('The tag "Speed.New" is already used in this vault. Pick another.'));
    expect(h.names()).not.toContain("putRecordInCaches");
  });

  it("says the address was not read when this record has none", async () => {
    const h = makeHost();
    const t = setup({ offer: true, record: row("self", "Door.Open", { entityUri: undefined }) }, h);
    await createFree();
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("This record's address was not read, so it was not linked."));
    expect(h.fn.createRecord).not.toHaveBeenCalled();
  });
});
