// @vitest-environment jsdom
// New tests for the band and the row words (the source's band tests are the axe and contrast ones; see OwnCardBand.axe.test.tsx and
// the README, "Tests"). The link target is the unit's one setting, read when the band draws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OWN_CARD_WORDS, OwnCardBand, ownCardRowWords, resetMyNetProfileUrl, setMyNetProfileUrl } from "./index";
import type { OwnCardState } from "./index";
import { PROFILE_URL } from "../test/support";

beforeEach(() => setMyNetProfileUrl(PROFILE_URL));
afterEach(() => {
  cleanup();
  resetMyNetProfileUrl();
});

const own = (standing: OwnCardState["standing"]): OwnCardState => ({ pending: false, own: true, standing });
const MYNET = own({ kind: "mynet", alsoCards: [] });
const OTHER = own({ kind: "other", mynetCardId: "mnb-profile-1", mynetCardUri: "https://k.example.test/vault/e/mnb-profile-1" });
const UNKNOWN = own({ kind: "unknown" });

describe("OwnCardBand: when it draws", () => {
  it("draws nothing for a record that is not his own card, and nothing while the test is pending", () => {
    const a = render(<OwnCardBand state={{ pending: false, own: false, standing: { kind: "unknown" } }} onOpen={() => {}} />);
    expect(a.container.innerHTML).toBe("");
    const b = render(<OwnCardBand state={{ pending: true, own: false, standing: { kind: "unknown" } }} onOpen={() => {}} />);
    expect(b.container.innerHTML).toBe("");
  });
  it("draws a named region with the case on it", () => {
    render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    const band = screen.getByTestId("own-card-band");
    expect(band.getAttribute("data-own-card-case")).toBe("mynet");
    expect(band.getAttribute("aria-label")).toBe("Your own card");
    expect(screen.getByRole("region", { name: "Your own card" })).toBe(band);
  });
});

describe("OwnCardBand: the caption says how the card stands to the card MyNet shows", () => {
  it("MyNet's card", () => {
    render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet);
  });
  it("a different card", () => {
    render(<OwnCardBand state={OTHER} onOpen={() => {}} />);
    expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.other);
  });
  it("not known yet (or no card found): just 'your own card'", () => {
    render(<OwnCardBand state={UNKNOWN} onOpen={() => {}} />);
    expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.own);
  });
  it("always says it is edited in MyNet, and what is only here", () => {
    render(<OwnCardBand state={UNKNOWN} onOpen={() => {}} />);
    expect(screen.getByText(OWN_CARD_WORDS.readOnly)).toBeTruthy();
    expect(screen.getByTestId("own-card-only-here").textContent).toBe(OWN_CARD_WORDS.onlyHere);
  });
});

describe("OwnCardBand: opening the other card", () => {
  it("'other' offers the card MyNet shows and opens it by id", () => {
    const onOpen = vi.fn();
    render(<OwnCardBand state={OTHER} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("own-card-open-mynet-card"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("mnb-profile-1");
    expect(screen.getByTestId("own-card-open-mynet-card").textContent).toBe(OWN_CARD_WORDS.openOther);
  });
  it("'mynet' and 'unknown' offer no such button", () => {
    const a = render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    expect(screen.queryByTestId("own-card-open-mynet-card")).toBeNull();
    a.unmount();
    render(<OwnCardBand state={UNKNOWN} onOpen={() => {}} />);
    expect(screen.queryByTestId("own-card-open-mynet-card")).toBeNull();
  });
  it("a second own card is named, with a button that opens it by the id at the end of its address", () => {
    const onOpen = vi.fn();
    const state = own({ kind: "mynet", alsoCards: ["https://k.example.test/vault/e/vsc-aaa", "https://k.example.test/vault/e/vsc-bbb"] });
    render(<OwnCardBand state={state} onOpen={onOpen} />);
    const also = screen.getByTestId("own-card-also");
    expect(also.textContent).toContain(OWN_CARD_WORDS.also);
    const buttons = screen.getAllByRole("button", { name: OWN_CARD_WORDS.openAlso });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(onOpen).toHaveBeenCalledWith("vsc-bbb");
  });
  it("no second card, no list", () => {
    render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    expect(screen.queryByTestId("own-card-also")).toBeNull();
  });
  it("the second-card list belongs to 'mynet' only: 'other' does not draw it", () => {
    render(<OwnCardBand state={OTHER} onOpen={() => {}} />);
    expect(screen.queryByTestId("own-card-also")).toBeNull();
  });
});

describe("OwnCardBand: the one link out", () => {
  it("'Edit in MyNet' points at the address the host set, in a new tab, with no opener", () => {
    render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    const a = screen.getByTestId("own-card-edit-in-mynet") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe(PROFILE_URL);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.textContent).toBe(OWN_CARD_WORDS.edit);
  });
  it("the address is read when the band draws: a later setting is the one used", () => {
    setMyNetProfileUrl("https://profile2.example.test/p");
    render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    expect(screen.getByTestId("own-card-edit-in-mynet").getAttribute("href")).toBe("https://profile2.example.test/p");
  });
  it("with no address set the band does not draw a broken link: it throws and names the setter", () => {
    resetMyNetProfileUrl();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<OwnCardBand state={MYNET} onOpen={() => {}} />)).toThrow(/setMyNetProfileUrl/);
    quiet.mockRestore();
  });
  it("a band that is not drawn needs no address", () => {
    resetMyNetProfileUrl();
    expect(() => render(<OwnCardBand state={{ pending: false, own: false, standing: { kind: "unknown" } }} onOpen={() => {}} />)).not.toThrow();
  });
});

describe("OwnCardBand: text colours (WCAG AA 4.5:1 on the band)", () => {
  // The source's contrast test reads the host's token file, which is not in this unit. What it measured is pinned here as the classes:
  // the small text uses `--ink-soft` and the link `--accent-ink`; `--ink-faint` (3.58:1) and `--accent` (4.49:1) failed.
  it("the 'only here' line uses --ink-soft and the link uses --accent-ink on --surface", () => {
    render(<OwnCardBand state={MYNET} onOpen={() => {}} />);
    const onlyHere = screen.getByTestId("own-card-only-here");
    expect(onlyHere.className).toContain("text-[var(--ink-soft)]");
    expect(onlyHere.className).not.toContain("ink-faint");
    const edit = screen.getByTestId("own-card-edit-in-mynet");
    expect(edit.className).toContain("text-[var(--accent-ink)]");
    expect(edit.className).toContain("bg-[var(--surface)]");
    expect(screen.getByTestId("own-card-band").className).toContain("bg-[var(--surface-hi)]");
  });
  it("touch targets: both buttons and the link are at least 44px high", () => {
    render(<OwnCardBand state={own({ kind: "other", mynetCardId: "x", mynetCardUri: "https://k.example.test/vault/e/x" })} onOpen={() => {}} />);
    expect(screen.getByTestId("own-card-open-mynet-card").className).toContain("min-h-[44px]");
    expect(screen.getByTestId("own-card-edit-in-mynet").className).toContain("min-h-[44px]");
  });
});

describe("ownCardRowWords: the mark on the grid row", () => {
  it("says it for his own card, by case", () => {
    expect(ownCardRowWords(MYNET)).toBe(OWN_CARD_WORDS.rowMynet);
    expect(ownCardRowWords(OTHER)).toBe(OWN_CARD_WORDS.rowOther);
    expect(ownCardRowWords(UNKNOWN)).toBe(OWN_CARD_WORDS.rowOwn);
  });
  it("is null for any other row, and while pending", () => {
    expect(ownCardRowWords({ pending: false, own: false, standing: { kind: "mynet", alsoCards: [] } })).toBeNull();
    expect(ownCardRowWords({ pending: true, own: false, standing: { kind: "unknown" } })).toBeNull();
  });
  it("the words themselves are pinned", () => {
    expect(OWN_CARD_WORDS).toEqual({
      mynet: "Your own card. This is the card MyNet shows.",
      own: "Your own card.",
      other: "MyNet uses a different card of you.",
      openOther: "Open the card MyNet shows",
      also: "You have one more card of you in this vault. MyNet does not show it, and nothing has been changed on either card.",
      openAlso: "Open the other card",
      readOnly: "Your own card is edited in MyNet, so what you change reaches the people in your circles at the level you set.",
      onlyHere: "Skills, interests, languages and employment shown here are only here, not on your MyNet card.",
      edit: "Edit in MyNet",
      rowMynet: "Your MyNet card",
      rowOwn: "Your own card",
      rowOther: "Your own card, not the one MyNet shows",
    });
  });
});
