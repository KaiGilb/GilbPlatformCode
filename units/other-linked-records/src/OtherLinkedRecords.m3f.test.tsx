// Ported from GilbApp `src/components/records/OtherLinkedRecords.m3f.test.tsx` (a703b3ed): 4 of 4 tests. The person's other linked
// records are reached from their card: a CardGroup (as every group of the card), rows that open a record, each with its vault and
// date so same-named cards can be told apart, kept in step with the grid. Changes: the `vi.mock` of the app's shell is the host
// of this unit (`OtherLinkedRecordsHostContext`, a fake), the import paths are the units', and the example hosts are `example.test`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { forgetScreenLinks, setScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { OtherLinkedRecords, OtherLinkedRecordsHostContext, type OtherLinkedRecordsHost } from "./index";

const host: OtherLinkedRecordsHost = {
  useShell: () => ({
    vaults: [
      { vaultId: "https://kai.platform.example.test/vault", name: "Kai" },
      { vaultId: "https://acme.platform.example.test/vault", name: "Acme" },
    ],
  }),
};
const wrap = (ui: ReactNode) => <OtherLinkedRecordsHostContext.Provider value={host}>{ui}</OtherLinkedRecordsHostContext.Provider>;

const KAI = "https://kai.platform.example.test/vault";
const TOM = "https://tom.platform.example.test/vault";
const D = Date.UTC(2026, 9, 18, 12, 0, 0);
afterEach(() => {
  cleanup();
  forgetScreenLinks();
});
const set = (list: { id: string; title: string; vaultId?: string; updatedAt?: number }[]) =>
  setScreenLinks(KAI, new Map([[TOM, list[0]!.id]]), new Map([[TOM, list]]));

describe("M3f r4 · the person's other linked records, from their card", () => {
  it("R3-1: a CardGroup of the card (data-group, labelled title, the record icon), rows that open a record", async () => {
    set([{ id: "r1", title: "Tom Gilb" }, { id: "r2", title: "Tom Gilb (work)", vaultId: "https://acme.platform.example.test/vault", updatedAt: D }]);
    const open = vi.fn();
    render(wrap(<OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={open} />));
    const section = screen.getByTestId("other-linked-records");
    expect(section.getAttribute("data-group")).toBe("other-linked-records");
    expect(section.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(section.getAttribute("aria-labelledby")!)!.textContent).toBe("Your other cards of this person");
    await userEvent.click(screen.getByRole("button", { name: /Tom Gilb \(work\)/ }));
    expect(open).toHaveBeenCalledWith("r2", "https://acme.platform.example.test/vault");
  });

  it("each entry names its vault and date, so same-named cards can be told apart", () => {
    set([
      { id: "r1", title: "Tom Gilb" },
      { id: "r2", title: "Tom Gilb", vaultId: "https://acme.platform.example.test/vault", updatedAt: D },
      { id: "r3", title: "Tom Gilb", vaultId: "https://kai.platform.example.test/vault", updatedAt: D - 86_400_000 * 400 },
    ]);
    render(wrap(<OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    const rows = screen.getAllByTestId("other-linked-record");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Acme");
    expect(rows[1]!.textContent).toContain("Kai");
    expect(rows[0]!.textContent).not.toBe(rows[1]!.textContent);
  });

  it("N8: when the grid's screen changes while the card is open, the list follows", () => {
    set([{ id: "r1", title: "Tom Gilb" }, { id: "r2", title: "Tom Gilb (work)" }]);
    render(wrap(<OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(screen.getAllByTestId("other-linked-record")).toHaveLength(1);
    act(() => set([{ id: "r1", title: "Tom Gilb" }, { id: "r2", title: "Tom Gilb (work)" }, { id: "r4", title: "Tom Gilb (club)" }]));
    expect(screen.getAllByTestId("other-linked-record")).toHaveLength(2);
    act(() => set([{ id: "r1", title: "Tom Gilb" }]));
    expect(screen.queryByTestId("other-linked-records")).toBeNull();
  });

  it("only one record, or another holder's screen: nothing is drawn", () => {
    setScreenLinks("https://ava.platform.example.test/vault", new Map([[TOM, "a1"]]), new Map([[TOM, [{ id: "a1", title: "A" }, { id: "a2", title: "B" }]]]));
    const { container } = render(wrap(<OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(container.innerHTML).toBe("");
  });
});
