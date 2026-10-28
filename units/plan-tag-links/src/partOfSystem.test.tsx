// PlanPartOfSystem against a fake host: one a:partOf link, written by the caller through `onWrite`; the create dialog is the host's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanPartOfSystem } from "./index";
import { VAULT, gridRow, hit, labels, makeHost, page, row, uri } from "../test/fakeHost";
import { mount, pick, typeInto } from "../test/mount";
import type { ComponentProps } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const withPartOf = (partOf: unknown, flat?: string): BaseRecord =>
  row("self", "Door.Fix", {
    typeUri: "t:Solution",
    ...(flat === undefined ? {} : { facts: { unitTag: "Door.Fix", partOf: flat } }),
    served: { facts: { partOf }, context: undefined, etag: null },
  });
const self = row("self", "Door.Fix", { typeUri: "t:Solution" });

function setup(over: Partial<ComponentProps<typeof PlanPartOfSystem>> = {}, h = makeHost(), o: { editing?: boolean } = {}) {
  const p = { record: self, vaultId: VAULT, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn(), onPicked: vi.fn(), onWrite: vi.fn(), ...over };
  return { p, ...mount(<PlanPartOfSystem {...p} />, h, o) };
}
const sysHit = (id: string, tag: string, more: Partial<BaseRecord> = {}) => hit(id, tag, { typeUri: "t:SoftwareSystem", ...more });
const SYSTEMS = ["SoftwareSystem", "System"];

describe("what it shows", () => {
  it("shows the linked system by its live tag, and follows its label", () => {
    labels[uri("s1")] = "Core";
    const record = withPartOf({ "@id": uri("s1") });
    const t = setup({ record });
    expect(screen.getByText("Core")).toBeTruthy();
    labels[uri("s1")] = "Core v2";
    t.view.rerender(<PlanPartOfSystem {...t.p} record={record} />);
    expect(screen.getByText("Core v2")).toBeTruthy();
  });

  it("opens the system by its id", async () => {
    labels[uri("s1")] = "Core";
    const t = setup({ record: withPartOf({ "@id": uri("s1") }) });
    await userEvent.click(screen.getByText("Core"));
    expect(t.p.onOpen).toHaveBeenCalledWith("s1");
  });

  it("shows older words as words, not as a link, and shows nothing for no value", () => {
    setup({ record: withPartOf({ "a:label": "Old system" }) });
    expect(screen.getByText("Old system")).toBeTruthy();
    expect(screen.queryByLabelText("Remove Part of System")).toBeNull();
    cleanup();
    setup();
    expect(screen.getByTestId("plan-part-of-system").textContent).toBe("");
  });

  it("reads a flat fact when nothing is served", () => {
    labels[uri("s1")] = "Core";
    setup({ record: row("self", "Door.Fix", { typeUri: "t:Solution", facts: { unitTag: "Door.Fix", partOf: uri("s1") } }) });
    expect(screen.getByText("Core")).toBeTruthy();
  });
});

describe("who can edit", () => {
  it("draws the picker (labelled Part of System, hits under plan-system-hits) and the remove control in edit mode", async () => {
    labels[uri("s1")] = "Core";
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([sysHit("s2", "Edge")]));
    setup({ record: withPartOf({ "@id": uri("s1") }) }, h);
    expect(screen.getByLabelText("Remove Part of System")).toBeTruthy();
    await typeInto("Part of System", "Ed");
    const hits = await screen.findByTestId("plan-system-hits");
    expect(within(hits).getByText("Edge")).toBeTruthy();
    expect(screen.queryByTestId("plan-link-hits")).toBeNull();
    expect(screen.queryByTestId("plan-link-picker")).toBeNull();
  });

  it("draws neither in presentation; the picker alone when the group offers it", () => {
    labels[uri("s1")] = "Core";
    const record = withPartOf({ "@id": uri("s1") });
    setup({ record }, makeHost(), { editing: false });
    expect(screen.queryByRole("textbox", { name: "Part of System" })).toBeNull();
    expect(screen.queryByLabelText("Remove Part of System")).toBeNull();
    cleanup();
    setup({ record, offer: true }, makeHost(), { editing: false });
    expect(screen.getByRole("textbox", { name: "Part of System" })).toBeTruthy();
    expect(screen.queryByLabelText("Remove Part of System")).toBeNull();
  });

  it("draws nothing to edit when canEdit is false", () => {
    setup({ canEdit: false, offer: true });
    expect(screen.queryByRole("textbox", { name: "Part of System" })).toBeNull();
  });

  it("is read-only when the host has no ConnectedCreateDialog", () => {
    labels[uri("s1")] = "Core";
    setup({ record: withPartOf({ "@id": uri("s1") }), offer: true }, makeHost({ without: ["ConnectedCreateDialog"] }));
    expect(screen.getByText("Core")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Part of System" })).toBeNull();
    expect(screen.queryByLabelText("Remove Part of System")).toBeNull();
  });
});

describe("onWrite", () => {
  it("is called with null when the link is removed, and with nothing else", async () => {
    labels[uri("s1")] = "Core";
    const t = setup({ record: withPartOf({ "@id": uri("s1") }) });
    await userEvent.click(screen.getByLabelText("Remove Part of System"));
    expect(t.p.onWrite).toHaveBeenCalledTimes(1);
    expect(t.p.onWrite).toHaveBeenCalledWith(null);
  });

  it("is called with the address of the system picked, after onPicked, and the notice is cleared; the host writes nothing", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([sysHit("s2", "Edge")]));
    const order: string[] = [];
    const t = setup(
      { onPicked: vi.fn(() => order.push("picked")), onWrite: vi.fn(() => order.push("write")), onNotice: vi.fn(() => order.push("notice")) },
      h,
    );
    await pick("Part of System", "Ed", "Edge", "plan-system-hits");
    await waitFor(() => expect(t.p.onWrite).toHaveBeenCalledWith(uri("s2")));
    expect(order).toEqual(["picked", "write", "notice"]);
    expect(t.p.onNotice).toHaveBeenCalledWith(null);
    expect(h.fn.find).toHaveBeenCalledWith(VAULT, "Ed", SYSTEMS);
    expect(h.names()).toEqual([]);
  });

  it("is called with the pool's address for a hit whose row is in the pool", async () => {
    const h = makeHost();
    h.state.pool = [gridRow("s2", "Edge", { typeUri: "t:SoftwareSystem" })];
    h.fn.find.mockResolvedValue(page([sysHit("s2", "Edge")]));
    const t = setup({}, h);
    await pick("Part of System", "Ed", "Edge", "plan-system-hits");
    await waitFor(() => expect(t.p.onWrite).toHaveBeenCalledWith(uri("s2")));
  });

  it("falls back to the hit's own address when the row has none and the address is absolute", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([sysHit("s2", "Edge", { entityUri: undefined })]));
    const t = setup({}, h);
    await pick("Part of System", "Ed", "Edge", "plan-system-hits");
    await waitFor(() => expect(t.p.onWrite).toHaveBeenCalledWith(uri("s2")));
  });

  it("says the address was not read, and does not write, when there is none", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue({ hits: [{ uri: "urn:s2", label: "Edge", row: sysHit("s2", "Edge", { entityUri: undefined }).row }], complete: true });
    const t = setup({}, h);
    await pick("Part of System", "Ed", "Edge", "plan-system-hits");
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("That record's address was not read, so it was not linked."));
    expect(t.p.onWrite).not.toHaveBeenCalled();
    expect(t.p.onPicked).not.toHaveBeenCalled();
  });

  it("does not offer the system already linked", async () => {
    labels[uri("s1")] = "Core";
    const h = makeHost();
    h.state.pool = [gridRow("s1", "Core", { typeUri: "t:SoftwareSystem" })];
    h.fn.find.mockResolvedValue(page([sysHit("s1", "Core"), sysHit("s2", "Edge")]));
    setup({ record: withPartOf({ "@id": uri("s1") }) }, h);
    await typeInto("Part of System", "Co");
    const hits = await screen.findByTestId("plan-system-hits");
    await within(hits).findByText("Edge");
    expect(within(hits).queryByText("Core")).toBeNull();
  });
});

describe("the search", () => {
  it("offers Create System for a free tag, and not for a used one", async () => {
    const h = makeHost();
    setup({}, h);
    await typeInto("Part of System", "Brand");
    const button = await screen.findByTestId("plan-link-create");
    expect(button.textContent).toBe('Create System "Brand"');
    expect(h.fn.tagUsed).toHaveBeenCalledWith(VAULT, "Brand");
    cleanup();
    const used = makeHost();
    used.fn.tagUsed.mockResolvedValue(true);
    setup({}, used);
    await typeInto("Part of System", "Brand");
    await waitFor(() => expect(used.fn.tagUsed).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("plan-link-create")).toBeNull();
  });

  it("says Could not search when the tag check fails", async () => {
    const h = makeHost();
    h.fn.tagUsed.mockRejectedValue(new Error("down"));
    setup({}, h);
    await typeInto("Part of System", "Brand");
    expect((await screen.findByRole("alert")).textContent).toBe("Could not search — try again");
  });

  it("says Create is not offered for text that is no tag when the search was not whole, with Try again under the system key", async () => {
    const h = makeHost();
    h.fn.find.mockResolvedValue(page([], false));
    setup({ planVault: "https://q.example.test/vault" }, h);
    const user = await typeInto("Part of System", "core system");
    expect(await screen.findByText("Not every record could be searched, so Create is not offered. Try again.")).toBeTruthy();
    expect(screen.queryByTestId("plan-link-create")).toBeNull();
    await user.click(screen.getByText("Try again"));
    expect(h.fn.invalidateSearch).toHaveBeenCalledWith(["plan-search", "https://q.example.test/vault", "SoftwareSystem\0System", "core system"]);
  });

  it("offers Create System for text that is no tag when the search was whole", async () => {
    setup();
    await typeInto("Part of System", "core system");
    expect((await screen.findByTestId("plan-link-create")).textContent).toBe('Create System "core system"');
  });
});

describe("creating a system", () => {
  async function openDialog(h = makeHost(), over: Partial<ComponentProps<typeof PlanPartOfSystem>> = {}) {
    const t = setup(over, h);
    const user = await typeInto("Part of System", "Brand");
    await user.click(await screen.findByTestId("plan-link-create"));
    return { t, h, user };
  }

  it("opens the host's dialog on the Software System type, drawing this vault and the plan vault", async () => {
    const { h } = await openDialog(makeHost(), { planVault: "https://q.example.test/vault" });
    expect(screen.getByTestId("create-dialog")).toBeTruthy();
    expect(h.state.dialogProps.at(-1)).toMatchObject({
      open: true,
      stakeholders: true,
      source: null,
      drawnVaultIds: [VAULT, "https://q.example.test/vault"],
      initialTypeOption: { id: "veda:SoftwareSystem", label: "Software System", typeName: "SoftwareSystem", spec: null, kind: "type" },
    });
  });

  it("draws no dialog until Create is pressed, and closes it on close", async () => {
    const h = makeHost();
    setup({}, h);
    expect(screen.queryByTestId("create-dialog")).toBeNull();
    const user = await typeInto("Part of System", "Brand");
    await user.click(await screen.findByTestId("plan-link-create"));
    await user.click(screen.getByText("Close dialog"));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
  });

  it("reads the new record, closes the dialog and hands its address to onWrite", async () => {
    const h = makeHost();
    h.state.records.new1 = row("new1", "Brand", { typeUri: "t:SoftwareSystem" });
    const { t, user } = await openDialog(h);
    await user.click(screen.getByText("Created new1"));
    await waitFor(() => expect(t.p.onWrite).toHaveBeenCalledWith(uri("new1")));
    expect(h.fn.readRecord).toHaveBeenCalledWith("new1", VAULT);
    expect(t.p.onPicked).toHaveBeenCalledTimes(1);
    expect(t.p.onNotice).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId("create-dialog")).toBeNull();
  });

  it("reads the new record in the plan vault", async () => {
    const h = makeHost();
    h.state.records.new1 = row("new1", "Brand");
    const { t, user } = await openDialog(h, { planVault: "https://q.example.test/vault" });
    await user.click(screen.getByText("Created new1"));
    await waitFor(() => expect(t.p.onWrite).toHaveBeenCalled());
    expect(h.fn.readRecord).toHaveBeenCalledWith("new1", "https://q.example.test/vault");
  });

  it("disables Create while the new record is read", async () => {
    const h = makeHost();
    let release: (r: BaseRecord | null) => void = () => {};
    h.fn.readRecord.mockReturnValue(new Promise((r) => (release = r)));
    const { t, user } = await openDialog(h);
    await user.click(screen.getByText("Created new1"));
    await waitFor(() => expect((screen.getByTestId("plan-link-create") as HTMLButtonElement).disabled).toBe(true));
    release(row("new1", "Brand"));
    await waitFor(() => expect(t.p.onWrite).toHaveBeenCalled());
    await waitFor(() => expect((screen.getByTestId("plan-link-create") as HTMLButtonElement).disabled).toBe(false));
  });

  it.each([
    ["not found", null],
    ["found with no address", row("new1", "Brand", { entityUri: undefined })],
  ])("says the record was made but not linked when it is %s", async (_n, read) => {
    const h = makeHost();
    h.fn.readRecord.mockResolvedValue(read);
    const { t, user } = await openDialog(h);
    await user.click(screen.getByText("Created new1"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("The record was made, but its address was not read, so it was not linked."));
    expect(t.p.onWrite).not.toHaveBeenCalled();
  });

  it("shows the read's own message when it fails with an error, and the made-but-not-linked sentence for anything else", async () => {
    const h = makeHost();
    h.fn.readRecord.mockRejectedValueOnce(new Error("offline"));
    const { t, user } = await openDialog(h);
    await user.click(screen.getByText("Created new1"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("offline"));
    await user.click(await screen.findByTestId("plan-link-create"));
    h.fn.readRecord.mockRejectedValueOnce("x");
    await user.click(screen.getByText("Created new1"));
    await waitFor(() => expect(t.p.onNotice).toHaveBeenCalledWith("The record was made, but its address was not read, so it was not linked."));
    expect(t.p.onWrite).not.toHaveBeenCalled();
  });
});
