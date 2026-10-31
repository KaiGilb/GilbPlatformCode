// @vitest-environment jsdom
// New. What the parts say when they do not know (F5, F6, F7, F12, F14, F15), which GilbApp's card did not: it left a place out of the line without a word,
// said one sentence for three different causes, and wrote nothing at all when a change failed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BoundPlaceLine, SavedAddress, hiddenFieldsSentence } from "./index";
import { GEO, GEO_ORIGIN, calls, callsTo, failIds, setCatalogueMode, useWorld } from "../test/world";
import { addressIn, claim, field, list, noop } from "../test/support";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("cities-live"));

/** Every string a person or a screen reader can get: text, names, titles, placeholders, values. NOT `data-*` attributes. */
function readable(root: HTMLElement = document.body): string {
  const out: string[] = [root.textContent ?? ""];
  root.querySelectorAll<HTMLElement>("*").forEach((e) => {
    for (const a of ["aria-label", "aria-description", "title", "placeholder", "alt"]) {
      const v = e.getAttribute(a);
      if (v) out.push(v);
    }
    if (e instanceof HTMLInputElement) out.push(e.value);
  });
  return out.join("\n");
}
const NO_ADDRESS = /https?:|\/base\/e\/|oslo-township|oslo-admin|oslo-kommune|ny-admin|york-city|uk-region|deep-region|deepcity|\bentry\b|@evil/;

const THREE = (extra: string[] = []) =>
  claim("c-x", "home", [
    field("c-x", { id: "p-c", subject: "place", placeId: `${GEO}/no` }),
    field("c-x", { id: "p-r", subject: "place", placeId: `${GEO}/oslo-admin` }),
    ...extra.map((id, i) => field("c-x", { id: `p-${i}`, subject: "place", placeId: id })),
  ]);

describe("(F5) a detail that is kept out of the address is said", () => {
  it("one detail: the sentence, in the compact view, whatever the mode", async () => {
    render(list([addressIn(`${GEO}/no`, "Storgata 1", "home", { hiddenFieldCount: 1 })]));
    const note = await screen.findByTestId("place-claim-hidden-fields");
    expect(note.textContent).toBe("1 detail of this address is not shown (it belongs to someone else or could not be read)");
  });

  it("several details: plural", async () => {
    render(list([addressIn(`${GEO}/no`, "Storgata 1", "home", { hiddenFieldCount: 3 })]));
    expect((await screen.findByTestId("place-claim-hidden-fields")).textContent).toBe(hiddenFieldsSentence(3));
    expect(hiddenFieldsSentence(3)).toBe("3 details of this address are not shown (they belong to someone else or could not be read)");
  });

  it("none left out: nothing is said", async () => {
    render(list([addressIn(`${GEO}/no`, "Storgata 1")]));
    await screen.findByTestId("place-view-street");
    expect(screen.queryByTestId("place-claim-hidden-fields")).toBeNull();
  });

  it("it is said in the editor too", async () => {
    render(list([addressIn(`${GEO}/no`, "Storgata 1", "home", { hiddenFieldCount: 1 })], { editMode: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    expect(screen.getByTestId("place-claim-hidden-fields")).toBeTruthy();
  });
});

describe("(F6) the line of bound places says what it did not read, by state", () => {
  const line = async () => (await screen.findByTestId("place-claim-bound")).textContent;

  it("all read: the names, coarse to fine, as before", async () => {
    render(<BoundPlaceLine claim={THREE()} />);
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("Norway · Oslo"));
  });

  it("one not read (the catalogue failed for it): the names that were read, then '1 more place not read right now'", async () => {
    failIds.add(`${GEO}/oslo-admin`);
    render(<BoundPlaceLine claim={THREE()} />);
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("Norway · 1 more place not read right now"));
  });

  it("one no longer in the catalogue (a 404): '1 place no longer in the catalogue'", async () => {
    render(<BoundPlaceLine claim={THREE([`${GEO}/gone`])} />);
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("Norway · Oslo · 1 place no longer in the catalogue"));
  });

  it("both kinds: each said with its own words", async () => {
    failIds.add(`${GEO}/oslo-admin`);
    render(<BoundPlaceLine claim={THREE([`${GEO}/gone`])} />);
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("Norway · 1 more place not read right now · 1 place no longer in the catalogue"));
  });

  it("none read: the words alone, never 'none reachable' with a count of bound addresses", async () => {
    failIds.add(`${GEO}/no`);
    failIds.add(`${GEO}/oslo-admin`);
    render(<BoundPlaceLine claim={THREE()} />);
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("2 places not read right now"));
    expect(await line()).not.toMatch(/bound|reachable/);
  });

  it("an address outside the catalogue is 'not read', and no request is made for it", async () => {
    render(<BoundPlaceLine claim={claim("c-y", "home", [field("c-y", { id: "p", subject: "place", placeId: "https://evil.example/base/e/osm-r-1" })])} />);
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("1 place not read right now"));
    expect(calls.some((c) => c.url.includes("evil.example"))).toBe(false);
  });

  it("the other states: nothing bound, and still reading", async () => {
    const { unmount } = render(<BoundPlaceLine claim={claim("c-z", "home", [])} />);
    expect(screen.getByTestId("place-claim-bound").textContent).toBe("No catalogue place bound");
    unmount();
    render(<BoundPlaceLine claim={THREE()} />);
    expect(screen.getByTestId("place-claim-bound").textContent).toBe("Looking up the place…");
    await waitFor(() => expect(screen.getByTestId("place-claim-bound").textContent).toBe("Norway · Oslo"));
  });
});

describe("(F7) why a stored address cannot be changed is said by cause", () => {
  const locked = async () => (await screen.findByTestId("place-claim-locked")).textContent ?? "";
  const open = (c = addressIn(`${GEO}/no`)) => render(list([c], { editMode: true }));

  it("the kinds of place could not be read: the grains sentence, not 'a place cannot be read'", async () => {
    // The ontology answers 502 for the grain map.
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (String(input).includes("/base/t/") ? new Response("down", { status: 502 }) : inner(input as never, init))));
    open();
    await waitFor(async () => expect(await locked()).toContain("The kinds of place could not be read right now, so this address cannot be changed yet."));
    expect(await locked()).not.toMatch(/One of this address's places/);
    expect(await locked()).toContain("(−)");
  });

  it("a place could not be read: the place sentence", async () => {
    failIds.add(`${GEO}/no`);
    open();
    await waitFor(async () => expect(await locked()).toContain("One of this address's places cannot be read right now"));
  });

  it("a place is no longer in the catalogue: a different sentence", async () => {
    open(addressIn(`${GEO}/gone`));
    await waitFor(async () => expect(await locked()).toContain("is no longer in the catalogue"));
    expect(await locked()).not.toContain("cannot be read right now");
  });

  it("two places at one rung: the 'more places than this screen can show' sentence, and no editor (M30)", async () => {
    const c = claim("c-two", "home", [
      field("c-two", { id: "a", subject: "place", placeId: `${GEO}/oslo` }),
      field("c-two", { id: "b", subject: "place", placeId: `${GEO}/bergen` }),
    ]);
    cleanup();
    open(c);
    await waitFor(async () => expect(await locked()).toContain("This address holds more places than this screen can show"));
    expect(screen.queryByRole("button", { name: "Edit address home" })).toBeNull();
    expect(document.querySelectorAll("input")).toHaveLength(0);
  });

  it("a place of a kind this build cannot sort is not editable either (the row has no kind)", async () => {
    open(addressIn(`${GEO}/puzzling`));
    await waitFor(async () => expect(await locked()).toContain("This address holds more places than this screen can show"));
    expect(screen.queryByRole("button", { name: "Edit address home" })).toBeNull();
  });

  it("while it is still being read: the waiting sentence", () => {
    open();
    expect(screen.getByTestId("place-claim-locked").textContent).toBe("Looking up this address before it can be changed…");
  });
});

describe("(F12) a hit's container that could not be read is said in the editor's list", () => {
  it("City box, 'Manchester', its parent unreadable: 'where: not read'", async () => {
    setCatalogueMode("normal");
    render(list([claim("c-s", "home", [field("c-s", { id: "s", subject: "street", streetLine: "Storgata 1" })])], { editMode: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    failIds.add(`${GEO}/uk-region`);
    fireEvent.change(await screen.findByLabelText("City"), { target: { value: "Manchester" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(1));
    await waitFor(() => expect(screen.getAllByRole("option")[0]!.textContent).toMatch(/where: not read/));
  });
});

describe("(F14) no address or id tail is readable in any state", () => {
  it("compact, read-only, the editor, locked, and with details left out", async () => {
    const claims = [
      addressIn(`${GEO}/no`, "Storgata 1", "home", { hiddenFieldCount: 2 }),
      THREE(),
      claim("c-out", "far", [field("c-out", { id: "o", subject: "place", placeId: "https://evil.example/base/e/osm-r-1" })]),
    ];
    const { unmount } = render(list(claims, { editMode: true }));
    await waitFor(() => expect(screen.getAllByTestId("place-claim-locked").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 60));
    expect(readable()).not.toMatch(NO_ADDRESS);
    unmount();
    render(list([addressIn(`${GEO}/no`, "Storgata 1")], { editMode: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    fireEvent.change(await screen.findByLabelText("City"), { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 100));
    expect(readable()).not.toMatch(NO_ADDRESS);
    // the country's id is only in a data attribute
    cleanup();
    render(list([addressIn(`${GEO}/no`)]));
    const line = await screen.findByTestId("place-view-region-country");
    expect(line.getAttribute("data-country-id")).toBe(`${GEO}/no`);
    expect(readable()).not.toMatch(NO_ADDRESS);
  });
});

describe("(F15) a change that fails says a sentence, and not its cause", () => {
  async function editAndLeave(onAmend: (...a: never[]) => unknown) {
    render(list([addressIn(`${GEO}/no`, "Storgata 1")], { editMode: true, onAmend: onAmend as never }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    const street = await screen.findByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Storgata 2" } });
    fireEvent.blur(street);
  }

  it("any thrown error: the fixed sentence; the cause is in the console", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await editAndLeave(async () => { throw new Error("PlaceClaim 403 - server detail at https://x.example/lws/r/abc"); });
    const alert = await screen.findByTestId("place-claim-save-error");
    expect(alert.textContent).toBe("That change could not be saved right now.");
    expect(readable()).not.toMatch(/403|server detail|https?:/);
    expect(log.mock.calls.flat().map(String).join(" ")).toMatch(/403/);
    log.mockRestore();
  });

  it("a refusal that carries its own sentence is shown as given", async () => {
    const refusal = Object.assign(new Error("internal"), { name: "PlaceClaimRefusal", sentence: "An address needs at least one part. Use Remove to delete it." });
    await editAndLeave(async () => { throw refusal; });
    expect((await screen.findByTestId("place-claim-save-error")).textContent).toBe("An address needs at least one part. Use Remove to delete it.");
  });

  it("a change the card answered 'false' to says nothing here (the card says it), and a good one clears an older message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const onAmend = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(true);
    await editAndLeave(onAmend);
    await screen.findByTestId("place-claim-save-error");
    const street = screen.getByLabelText("Street..");
    fireEvent.change(street, { target: { value: "Storgata 3" } });
    fireEvent.blur(street);
    await waitFor(() => expect(screen.queryByTestId("place-claim-save-error")).toBeNull());
    log.mockRestore();
  });
});

describe("the parts make no request of their own", () => {
  it("reading and editing: every request to the catalogue is a GET with credentials omitted", async () => {
    render(list([addressIn(`${GEO}/no`, "Storgata 1")], { editMode: true, onAmend: noop }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit address home" }));
    await screen.findByLabelText("City");
    expect(callsTo(GEO_ORIGIN).length).toBeGreaterThan(0);
    expect(callsTo(GEO_ORIGIN).filter((c) => c.method !== "GET" || c.credentials !== "omit")).toEqual([]);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});
