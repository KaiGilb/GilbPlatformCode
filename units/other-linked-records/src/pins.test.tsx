// New tests: what the ported blocks leave unpinned: the host, the meta line, the focus ring, the title, the two named copies.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { forgetScreenLinks, setScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { CardModeProvider, useCardMode, type GroupInfo } from "@kaigilb/gilbplatformcode-card-mode";
import * as unit from "./index";
import { OTHER_CARDS_TITLE, OtherLinkedRecords, OtherLinkedRecordsHostContext, type OtherLinkedRecordsHost } from "./index";
import { formatShortDate } from "./formatShortDate";

const KAI = "https://kai.platform.example.test/vault";
const TOM = "https://tom.platform.example.test/vault";
const ACME = "https://acme.platform.example.test/vault";
const D = Date.UTC(2026, 9, 18, 12, 0, 0);

afterEach(() => {
  cleanup();
  forgetScreenLinks();
});

const withHost = (host: OtherLinkedRecordsHost, ui: ReactNode) => <OtherLinkedRecordsHostContext.Provider value={host}>{ui}</OtherLinkedRecordsHostContext.Provider>;
const shellOf = (vaults: { vaultId: string; name?: string | null }[] | null | undefined): OtherLinkedRecordsHost => ({ useShell: () => ({ vaults }) });
const set = (list: { id: string; title: string; vaultId?: string; updatedAt?: number }[], holder = KAI, principal = TOM) =>
  setScreenLinks(holder, new Map([[principal, list[0]!.id]]), new Map([[principal, list]]));
const row = () => screen.getAllByTestId("other-linked-record");

describe("the host", () => {
  it("with no provider above, the list throws an error that names the provider", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />)).toThrow(/OtherLinkedRecordsHostContext\.Provider/);
    err.mockRestore();
  });

  it("the host's useShell is called on every render, including when nothing is drawn", () => {
    const useShell = vi.fn(() => ({ vaults: [] }));
    const { rerender } = render(withHost({ useShell }, <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(useShell).toHaveBeenCalledTimes(1);
    rerender(withHost({ useShell }, <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(useShell).toHaveBeenCalledTimes(2);
  });
});

describe("what is listed", () => {
  it("the open record is left out, and the others come in the screen's order", () => {
    set([{ id: "r1", title: "First" }, { id: "r2", title: "Second" }, { id: "r3", title: "Third" }], KAI, TOM);
    render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r2" onOpen={() => {}} />));
    expect(row().map((r) => within(r).getAllByText(/./)[0]!.textContent)).toEqual(["First", "Third"]);
  });

  it("another person's records are not listed", () => {
    setScreenLinks(KAI, new Map([[TOM, "r1"], ["https://ava.platform.example.test/vault", "a1"]]), new Map([[TOM, [{ id: "r1", title: "T" }, { id: "r2", title: "T2" }]], ["https://ava.platform.example.test/vault", [{ id: "a1", title: "A" }, { id: "a2", title: "A2" }]]]));
    render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(row().map((r) => r.textContent)).toEqual(["T2"]);
  });

  it("nothing is drawn when the open record is the only one", () => {
    set([{ id: "r1", title: "Only" }]);
    const { container } = render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(container.innerHTML).toBe("");
  });

  it("the group's title is the exported one", () => {
    expect(OTHER_CARDS_TITLE).toBe("Your other cards of this person");
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }]);
    render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(screen.getByText(OTHER_CARDS_TITLE)).toBeTruthy();
  });

  it("a click opens that record, by its id, and only that one", async () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }, { id: "r3", title: "C" }]);
    const open = vi.fn();
    render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={open} />));
    await userEvent.click(row()[1]!);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("r3");
  });
});

describe("the meta line", () => {
  const D2 = Date.UTC(2020, 5, 3, 12, 0, 0);
  const meta = (r: HTMLElement) => r.querySelectorAll("span")[1]?.textContent ?? null;

  it("names the vault, then a date, joined by ' · '", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B", vaultId: ACME, updatedAt: D2 }]);
    render(withHost(shellOf([{ vaultId: ACME, name: "Acme" }]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(meta(row()[0]!)).toBe(`Acme · ${formatShortDate(D2)}`);
  });

  it("a vault with no stored name is named by the vault list's rule (the host label of a /base address)", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B", vaultId: "https://bilen.platform.example.test/base" }]);
    render(withHost(shellOf([{ vaultId: "https://bilen.platform.example.test/base", name: null }]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(meta(row()[0]!)).toBe("bilen");
  });

  it("only a date when the vault is not among the shell's, or the shell has no vaults", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B", vaultId: ACME, updatedAt: D2 }]);
    for (const vaults of [[], null, undefined]) {
      const { unmount } = render(withHost(shellOf(vaults), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
      expect(meta(row()[0]!)).toBe(formatShortDate(D2));
      unmount();
    }
  });

  it("only the vault when there is no date, and no meta at all when there is neither", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B", vaultId: ACME, updatedAt: 0 }, { id: "r3", title: "C" }]);
    render(withHost(shellOf([{ vaultId: ACME, name: "Acme" }]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(meta(row()[0]!)).toBe("Acme");
    expect(meta(row()[1]!)).toBeNull();
    expect(row()[1]!.querySelectorAll("span")).toHaveLength(1);
  });

  it("a record with no vault id gets no vault name even if the shell has a vault with an empty id", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }]);
    render(withHost(shellOf([{ vaultId: "", name: "Blank" }]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(row()[0]!.textContent).toBe("B");
  });
});

describe("the group", () => {
  it("tells the card mode that it is shown and cannot be added to (the chooser does not offer it)", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }]);
    let groups: ReadonlyMap<string, GroupInfo> = new Map();
    function Probe() {
      groups = useCardMode().groups;
      return null;
    }
    render(
      withHost(
        shellOf([]),
        <CardModeProvider canEdit startEditing>
          <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />
          <Probe />
        </CardModeProvider>,
      ),
    );
    expect(groups.get("other-linked-records")).toMatchObject({ kind: "other-linked-records", addable: false, shown: true });
  });
});

describe("the rows", () => {
  it("each has its own key: two records draw two rows with no key warning", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }, { id: "r3", title: "C" }]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    expect(err.mock.calls.filter((c) => String(c[0]).includes("same key"))).toHaveLength(0);
    err.mockRestore();
  });
});

describe("the row", () => {
  it("is a full-width button with the focus ring copied from the organization card's rows, and the title truncated", () => {
    set([{ id: "r1", title: "A" }, { id: "r2", title: "B" }]);
    render(withHost(shellOf([]), <OtherLinkedRecords holder={KAI} principal={TOM} selfId="r1" onOpen={() => {}} />));
    const r = row()[0]!;
    expect(r.tagName).toBe("BUTTON");
    expect(r.getAttribute("type")).toBe("button");
    expect(r.className).toContain("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]");
    expect(r.className).toContain("min-h-12 w-full");
    expect(r.querySelector("span")!.className).toContain("truncate");
  });
});

describe("formatShortDate (a named copy)", () => {
  const now = new Date(2026, 9, 31, 12, 0, 0);
  it.each([[0], [-1], [NaN], [Infinity], [null], [undefined]])("%s is not a date: the empty string", (ms) => {
    expect(formatShortDate(ms as number | null | undefined, now)).toBe("");
  });
  it("inside the current year it is day and month alone", () => {
    expect(formatShortDate(new Date(2026, 2, 12, 12).getTime(), now)).toBe(new Date(2026, 2, 12, 12).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  });
  it("outside the current year it adds the two-digit year", () => {
    const d = new Date(2024, 2, 12, 12);
    expect(formatShortDate(d.getTime(), now)).toBe(`${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} 24`);
    const old = new Date(2005, 2, 12, 12);
    expect(formatShortDate(old.getTime(), now)).toBe(`${old.toLocaleDateString(undefined, { day: "numeric", month: "short" })} 05`);
  });
  it("the year taken as this year is the one given, not a fixed one", () => {
    const later = new Date(2030, 0, 1, 12);
    const day = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    expect(formatShortDate(new Date(2030, 5, 3, 12).getTime(), later)).toBe(day(new Date(2030, 5, 3, 12)));
    expect(formatShortDate(new Date(2026, 5, 3, 12).getTime(), later)).toBe(`${day(new Date(2026, 5, 3, 12))} 26`);
  });
  it("without a now, the current year is taken from the clock", () => {
    const thisYear = new Date();
    thisYear.setMonth(0, 15);
    expect(formatShortDate(thisYear.getTime())).toBe(thisYear.toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  });
});

describe("the export list", () => {
  it("is exactly these names (the props type is erased)", () => {
    expect(Object.keys(unit).sort()).toEqual(["OTHER_CARDS_TITLE", "OtherLinkedRecords", "OtherLinkedRecordsHostContext", "useOtherLinkedRecordsHost"]);
  });
});
