// @vitest-environment jsdom
// New (the source has none of these). The guarantee of the languages section, pinned at the section:
//   1. With the slot present, mount, render, idle and a `canEdit` change make ZERO writes: no request but a GET, and the record's own save (`writeContact`) is never called.
//   2. The record's save is called only on the user's act (mark, clear the mark by removing the marked language) and a null goes out ONLY for the key the user cleared
//      (No flag; Make shared); nothing else, anywhere, carries a null.
//   3. The country search is the host's slot: absent, there is no "Another country…" and no search; present, its pick is the flag.
//   4. No state of the section shows an address or the last part of one (reading, read, failed, a language with no name).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetFlags, setFlagSource, setFlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import { __resetHeldLanguageVocab } from "@kaigilb/gilbplatformcode-held-language";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __resetLanguageEntries } from "@kaigilb/gilbplatformcode-language-entry";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { AGENT, AUS, ENG, ID_TAIL, NOR, POR, UK, store, uriOf, installWorld, resetWorld, show, world, writesOf } from "../test/world";
import { LanguageEntryPicker } from "./index";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const stater = vi.hoisted(() => ({ uri: "" }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri),
);

let tom: string;
const held = (language: string, extra: Record<string, unknown> = {}) =>
  fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": language }, ...extra });
const rows = () => screen.queryAllByTestId("language-row");
const names = () => rows().map((r) => within(r).getByTestId("language-row-value").textContent);
const rowOf = (name: string) => rows().find((r) => within(r).getByTestId("language-row-value").textContent === name)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Everything a JSON body holds, flattened to `key = value` leaves, to find a null anywhere in it. */
const leaves = (v: unknown, at = ""): [string, unknown][] =>
  v !== null && typeof v === "object" ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leaves(x, at ? `${at}.${k}` : k)) : [[at, v]];

beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldLanguageVocab();
  __resetHeldNoteChains();
  __resetLanguageEntries();
  __resetFetchPool();
  __resetFlags();
  setFlagStore(null);
  resetWorld();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  installWorld();
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  resetTermOrigin();
  tearDown();
});

describe("🔴 1 · reading writes nothing", () => {
  it("mount, render, idle and canEdit flips make zero writes; the record's save is never called", async () => {
    held(NOR);
    held(ENG);
    world.contact.tag = "en";
    const v = show(tom);
    await waitFor(() => expect(names()).toEqual(["English", "Norwegian"]));
    v.again({ canEdit: false });
    v.again({ canEdit: true });
    v.again({ canEdit: false });
    v.again({ canEdit: true });
    await act(async () => {
      await sleep(400);
    });
    expect(names()).toEqual(["English", "Norwegian"]);
    expect(writesOf()).toEqual([]);
    expect(world.contactWrites).toEqual([]);
    expect(world.wire.some((w) => w.method === "GET")).toBe(true);
  });

  it("an empty card, a reader's card and a failed read make zero writes too", async () => {
    world.contact.tag = "no";
    const v = show(tom, { canEdit: false });
    await sleep(300);
    expect(writesOf()).toEqual([]);
    expect(world.contactWrites).toEqual([]);
    v.unmount();
    fake.findByAttribute.mockRejectedValue(new Error("down"));
    show(tom);
    await screen.findByTestId("languages-read-error");
    await sleep(100);
    expect(writesOf()).toEqual([]);
    expect(world.contactWrites).toEqual([]);
  });

  it("a card the person may not edit never writes, whatever is clicked", async () => {
    held(NOR);
    show(tom, { canEdit: false });
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    for (const b of screen.queryAllByRole("button")) fireEvent.click(b);
    await sleep(100);
    expect(writesOf()).toEqual([]);
    expect(world.contactWrites).toEqual([]);
  });
});

describe("🔴 2 · a null goes out only for the key the user cleared; the record is written only on the user's act", () => {
  it("No flag is ONE PATCH of exactly the flag as null; a set flag is ONE PATCH of exactly that key; no other request carries a null", async () => {
    const id = held(ENG);
    show(tom);
    await waitFor(() => expect(names()).toEqual(["English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the flag of osm-r-62149" }));
    await waitFor(() => expect(writesOf()).toHaveLength(1));
    expect(writesOf()[0]).toMatchObject({ method: "PATCH", body: { "a:flagCountry": { "@id": UK } } });
    await waitFor(() => expect(store.get(id)!.facts["a:flagCountry"]).toEqual({ "@id": UK }));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByTestId("flag-none"));
    await waitFor(() => expect(writesOf()).toHaveLength(2));
    expect(writesOf()[1]).toMatchObject({ method: "PATCH", body: { "a:flagCountry": null } });
    const nulls = writesOf().flatMap((w) => leaves(w.body)).filter(([, x]) => x === null).map(([k]) => k);
    expect(nulls).toEqual(["a:flagCountry"]);
    expect(world.contactWrites).toEqual([]);
  });

  it("Make shared is ONE PATCH of exactly the two mark keys as null; Make private is ONE PATCH of exactly the two keys set; no other null", async () => {
    held(NOR);
    show(tom);
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    fireEvent.click(await within(rowOf("Norwegian")).findByRole("button", { name: /private to me only/ }));
    await waitFor(() => expect(writesOf()).toHaveLength(1));
    expect(writesOf()[0]!.body).toEqual({ "a:visibilityTier": "private", "a:claimSubject": { "@id": AGENT } });
    fireEvent.click(await within(rowOf("Norwegian")).findByRole("button", { name: /to everyone in this vault/ }));
    await waitFor(() => expect(writesOf()).toHaveLength(2));
    expect(writesOf()[1]!.body).toEqual({ "a:visibilityTier": null, "a:claimSubject": null });
    const nulls = writesOf().flatMap((w) => leaves(w.body)).filter(([, x]) => x === null).map(([k]) => k).sort();
    expect(nulls).toEqual(["a:claimSubject", "a:visibilityTier"]);
    expect(world.contactWrites).toEqual([]);
  });

  it("adding a language is ONE create with no null anywhere in it; the record is not written", async () => {
    show(tom);
    const add = await screen.findByRole("button", { name: /Add languages/ });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("combobox", { name: "Add a language" }), { target: { value: "Port" } });
    fireEvent.click(await screen.findByRole("option", { name: "Portuguese" }));
    await waitFor(() => expect(names()).toEqual(["Portuguese"]));
    expect(writesOf().map((w) => w.method)).toEqual(["POST"]);
    expect(leaves(writesOf()[0]!.body).filter(([, x]) => x === null || x === "")).toEqual([]);
    expect(world.contactWrites).toEqual([]);
  });

  it("marking writes the record's contact tag ONCE; clearing the marked language by removing it writes '' ONCE and nothing else of the record", async () => {
    held(NOR);
    held(POR);
    show(tom);
    await waitFor(() => expect(names()).toEqual(["Norwegian", "Portuguese"]));
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Make Portuguese the contact language" }));
    await waitFor(() => expect(names()).toEqual(["Portuguese", "Norwegian"]));
    expect(world.contactWrites).toEqual(["pt"]);
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Remove language Portuguese" }));
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(world.contactWrites).toEqual(["pt", ""]);
    expect(writesOf().map((w) => w.method)).toEqual(["DELETE"]);
  });

  it("removing a language that is not the marked one never writes the record", async () => {
    held(NOR);
    held(POR);
    world.contact.tag = "no";
    show(tom);
    await waitFor(() => expect(names()).toEqual(["Norwegian", "Portuguese"]));
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Remove language Portuguese" }));
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    expect(world.contactWrites).toEqual([]);
  });
});

describe("3 · the country search is the host's slot (STOP-3)", () => {
  const search = (p: { onPick(country: string): void }) => (
    <button type="button" data-testid="country-search" onClick={() => p.onPick(AUS)}>
      search
    </button>
  );
  it("ABSENT: a language in three countries offers its three flags and No flag, and no 'Another country…'", async () => {
    held(ENG);
    show(tom);
    await waitFor(() => expect(names()).toEqual(["English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    const chooser = await screen.findByTestId("flag-chooser");
    expect(within(chooser).getAllByTestId("flag-choice")).toHaveLength(3);
    expect(within(chooser).queryByTestId("flag-another")).toBeNull();
    expect(within(chooser).queryByTestId("country-search")).toBeNull();
    expect(within(chooser).getByTestId("flag-none")).toBeTruthy();
  });
  it("ABSENT: a language with no country has only No flag, and the card draws no search", async () => {
    held(POR);
    show(tom);
    await waitFor(() => expect(names()).toEqual(["Portuguese"]));
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Change the flag for Portuguese" }));
    const chooser = await screen.findByTestId("flag-chooser");
    expect(within(chooser).queryAllByTestId("flag-choice")).toHaveLength(0);
    expect(within(chooser).queryByTestId("flag-another")).toBeNull();
    expect(within(chooser).getByTestId("flag-none")).toBeTruthy();
  });
  it("PRESENT: 'Another country…' mounts the host's search, and its pick is saved as the claim's flag", async () => {
    const id = held(ENG);
    show(tom, { renderCountrySearch: search });
    await waitFor(() => expect(names()).toEqual(["English"]));
    fireEvent.click(within(rowOf("English")).getByRole("button", { name: "Change the flag for English" }));
    fireEvent.click(await screen.findByTestId("flag-another"));
    fireEvent.click(await screen.findByTestId("country-search"));
    await waitFor(() => expect(store.get(id)!.facts["a:flagCountry"]).toEqual({ "@id": AUS }));
    expect(writesOf()).toHaveLength(1);
  });
  it("PRESENT: a language with no country shows the search at once", async () => {
    held(POR);
    show(tom, { renderCountrySearch: search });
    await waitFor(() => expect(names()).toEqual(["Portuguese"]));
    fireEvent.click(within(rowOf("Portuguese")).getByRole("button", { name: "Change the flag for Portuguese" }));
    expect(await screen.findByTestId("country-search")).toBeTruthy();
  });
});

describe("🔴 4 · no state of the section shows an address or the last part of one", () => {
  const shownText = () => {
    const attrs = [...document.querySelectorAll("[aria-label],[alt],[title]")].flatMap((e) => [e.getAttribute("aria-label"), e.getAttribute("alt"), e.getAttribute("title")]);
    return [document.body.textContent ?? "", ...attrs].filter((x): x is string => !!x).join(" | ");
  };
  const clean = () => {
    const t = shownText();
    expect(t).not.toMatch(/:\/\//);
    expect(t).not.toMatch(/\/base\/e\//);
    expect(t).not.toMatch(ID_TAIL);
  };

  it("while the entries are being read: '…', no address, no id", async () => {
    held(NOR);
    let release!: () => void;
    world.held.set(NOR, new Promise<void>((r) => (release = r)));
    show(tom);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(names()).toEqual(["…"]);
    clean();
    release();
    await waitFor(() => expect(names()).toEqual(["Norwegian"]));
    clean();
  });
  it("when the entry could not be read: 'A language', no address, no id, and the catalogue line says so", async () => {
    held(NOR);
    world.failing = new Set([NOR]);
    show(tom);
    await screen.findByTestId("languages-catalogue-error");
    expect(names()).toEqual(["A language"]);
    clean();
    fireEvent.click(within(rowOf("A language")).getByTestId("language-flag-button"));
    const chooser = await screen.findByTestId("flag-chooser");
    expect(chooser.getAttribute("aria-label")).toBe("Choose a flag for A language");
    clean();
  });
  it("an entry that gives no name: 'A language', not its id", async () => {
    world.catalogue[NOR] = { iso6393Code: "nor" };
    held(NOR);
    show(tom);
    await waitFor(() => expect(names()).toEqual(["A language"]));
    expect(screen.queryByTestId("languages-catalogue-error")).toBeNull();
    clean();
    expect(within(rowOf("A language")).getByRole("button", { name: "Make A language the contact language" })).toBeTruthy();
  });
  it("in the presentation of a reader and in every row action's name", async () => {
    held(NOR);
    held(ENG);
    held(POR);
    world.failing = new Set([POR]);
    show(tom, { canEdit: false });
    await waitFor(() => expect([...names()].sort()).toEqual(["A language", "English", "Norwegian"]));
    clean();
    cleanup();
    show(tom, { canEdit: true });
    await waitFor(() => expect([...names()].sort()).toEqual(["A language", "English", "Norwegian"]));
    clean();
  });
  it("a language that failed to be added says the label of what was picked, not an address", async () => {
    fake.createRecord.mockImplementationOnce(async () => ({ id: "ghost", etag: '"x"' }));
    show(tom);
    const add = await screen.findByRole("button", { name: /Add languages/ });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("combobox", { name: "Add a language" }), { target: { value: "Norw" } });
    fireEvent.click(await screen.findByRole("option", { name: "Norwegian" }));
    await screen.findByTestId("language-error");
    clean();
  });
  it("a stored contact tag that no entry matches is shown as the tag the record holds, never as an address", async () => {
    world.contact.tag = "no";
    show(tom);
    expect((await screen.findByTestId("language-legacy-row")).textContent).toContain("Norwegian (no)");
    clean();
  });
});

describe("the entry picker", () => {
  it("searches after two characters, hides the languages already listed, and hands back the entry and its name", async () => {
    const onPick = vi.fn();
    render(<LanguageEntryPicker excludeUris={[NOR]} onPick={onPick} onCancel={() => undefined} />);
    const box = screen.getByRole("combobox", { name: "Add a language" });
    fireEvent.change(box, { target: { value: "N" } });
    await sleep(300);
    expect(world.wire.filter((w) => w.url.includes("/base/search"))).toHaveLength(0);
    fireEvent.change(box, { target: { value: "Po" } });
    fireEvent.click(await screen.findByRole("option", { name: "Portuguese" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(POR, "Portuguese"));
    fireEvent.change(box, { target: { value: "No" } });
    await waitFor(() => expect(screen.getByTestId("picker-no-match")).toBeTruthy());
    expect(screen.queryByRole("option", { name: "Norwegian" })).toBeNull();
    expect(world.wire.filter((w) => w.url.includes("/base/search")).every((w) => w.method === "GET")).toBe(true);
  });
});
