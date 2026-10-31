// @vitest-environment jsdom
// New. What the box says when it does not know: the decisions of the H15b plan (F9, F11, F12, F14 and the fence's note). GilbApp's box set "" for a
// name it could not read and wrote the place's address as text for assistive tech.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkLocationField } from "./index";
import { GEO, GEO_ORIGIN, ROWS, calls, callsTo, failIds, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("cities-live"));

const box = () => screen.getByRole("textbox", { name: "Role location" }) as HTMLInputElement;
/** Every string a person or a screen reader can get from the box: text, names, titles, placeholders, values. NOT `data-*` attributes. */
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
const NO_ADDRESS = /https?:|\/base\/e\/|oslo-township|osm-r-|@evil/;

describe("a stored place is shown by its name", () => {
  it("(F9) hydrated from the catalogue when the role carries no label; the box shows the name", async () => {
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="" onChange={vi.fn()} />);
    await waitFor(() => expect(box().value).toBe("Oslo"));
    expect(readable()).not.toMatch(NO_ADDRESS);
  });

  it("(F9, surprise 8) a click on the box keeps the name: it does not blank the box over a stored place", async () => {
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="" onChange={vi.fn()} />);
    await waitFor(() => expect(box().value).toBe("Oslo"));
    fireEvent.focus(box());
    expect(box().value).toBe("Oslo");
  });

  it("focus then leaving without typing writes nothing", async () => {
    const onChange = vi.fn();
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="" onChange={onChange} />);
    await waitFor(() => expect(box().value).toBe("Oslo"));
    fireEvent.focus(box());
    fireEvent.blur(box());
    await new Promise((r) => setTimeout(r, 200));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("(F14) no address, id tail or host is readable anywhere, in any state", async () => {
    const states: Array<[string, string]> = [
      [`${GEO}/oslo`, ""],
      [`${GEO}/oslo-township`, ""],
      [`${GEO}/gone`, ""], // a 404
      ["https://evil.example/base/e/osm-r-1", ""], // outside
      [`${GEO}/oslo`, "Oslo"],
    ];
    for (const [placeId, label] of states) {
      const { unmount } = render(<WorkLocationField placeId={placeId} label={label} onChange={vi.fn()} />);
      await new Promise((r) => setTimeout(r, 30));
      expect(readable(), `${placeId}`).not.toMatch(NO_ADDRESS);
      fireEvent.focus(box());
      expect(readable(), `${placeId} focused`).not.toMatch(NO_ADDRESS);
      unmount();
    }
  });
});

describe("a stored place whose name is not known says so", () => {
  it("(F9) a failed read: 'A place' in the box, and a line that says the name could not be read; the place is still saved", async () => {
    failIds.add(`${GEO}/oslo`);
    const onChange = vi.fn();
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="" onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId("work-location-unread")).toBeTruthy());
    expect(box().value).toBe("A place");
    expect(screen.getByTestId("work-location-unread").textContent).toMatch(/could not be read right now/);
    expect(screen.queryByTestId("work-location-missing")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("(F9) a 404 is told from a failure: 'That place is no longer in the catalogue.'", async () => {
    render(<WorkLocationField placeId={`${GEO}/gone`} label="" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("work-location-missing")).toBeTruthy());
    expect(screen.getByTestId("work-location-missing").textContent).toBe("That place is no longer in the catalogue.");
    expect(box().value).toBe("A place");
    expect(screen.queryByTestId("work-location-unread")).toBeNull();
  });

  it("(fence) a place of another host: 'A place', a line that says it is not the catalogue's, and NO request to that host", async () => {
    render(<WorkLocationField placeId="https://evil.example/base/e/osm-r-1" label="" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("work-location-unread")).toBeTruthy());
    expect(box().value).toBe("A place");
    expect(screen.getByTestId("work-location-unread").textContent).toMatch(/not in the place catalogue this app uses/);
    expect(calls).toEqual([]);
  });

  it("while the name is being read the box already says 'A place', never nothing", async () => {
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="" onChange={vi.fn()} />);
    expect(box().value).toBe("A place");
    await waitFor(() => expect(box().value).toBe("Oslo"));
  });

  it("a role that carries its own label shows it and asks nobody", () => {
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="Oslo" onChange={vi.fn()} />);
    expect(box().value).toBe("Oslo");
    expect(calls).toEqual([]);
  });

  it("with no place stored the box is empty and says nothing about a place", () => {
    render(<WorkLocationField placeId="" label="" onChange={vi.fn()} />);
    expect(box().value).toBe("");
    expect(screen.queryByTestId("work-location-unread")).toBeNull();
    expect(screen.queryByTestId("work-location-missing")).toBeNull();
  });
});

describe("the search says what it could not check", () => {
  async function search(text: string) {
    render(<WorkLocationField placeId="" label="" onChange={vi.fn()} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: text } });
  }

  it("(F11) a truncated empty answer is NOT 'no city matches'", async () => {
    setCatalogueMode("truncated-empty");
    await search("New York");
    await waitFor(() => expect(screen.getByText(/Could not check every match for “New York”/)).toBeTruthy());
    expect(screen.queryByText(/No city, town, or municipality matches/)).toBeNull();
    expect(screen.getByText(/This is not a statement that the place does not exist/)).toBeTruthy();
  });

  it("a complete empty answer still says there is no match", async () => {
    setCatalogueMode("normal");
    await search("Zzzzqq");
    await waitFor(() => expect(screen.getByText("No city, town, or municipality matches.")).toBeTruthy());
    expect(screen.queryByText(/Could not check every match/)).toBeNull();
  });

  it("(F11) a truncated answer WITH hits lists them and says there are more", async () => {
    setCatalogueMode("truncated-with-hits");
    await search("Osl");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(screen.getByTestId("work-location-capped-note")).toBeTruthy();
    // the listbox owns options and nothing else
    expect(screen.getByRole("listbox").querySelectorAll(":scope > :not([role='option'])")).toHaveLength(0);
  });

  it("an unreachable catalogue says so and is not 'no match'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    await search("Oslo");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/could not be reached/));
    expect(screen.queryByText(/No city, town, or municipality matches/)).toBeNull();
  });
});

describe("(F12, F14) two identical rows are told apart by position, a container not read is said", () => {
  it("twins read '1 of 2 with this name' and '2 of 2 with this name', and no id", async () => {
    ROWS[`${GEO}/s8x-twin-a`] = { "@id": `${GEO}/s8x-twin-a`, "@type": "t:Municipality", label: "Twinton", memberOf: `${GEO}/no` };
    ROWS[`${GEO}/s8x-twin-b`] = { "@id": `${GEO}/s8x-twin-b`, "@type": "t:Municipality", label: "Twinton", memberOf: `${GEO}/no` };
    const { SEARCH } = await import("../test/world");
    SEARCH["City|Twinton"] = [`${GEO}/s8x-twin-a`, `${GEO}/s8x-twin-b`];
    SEARCH["Municipality|Twinton"] = [`${GEO}/s8x-twin-a`, `${GEO}/s8x-twin-b`];
    try {
      setCatalogueMode("normal");
      render(<WorkLocationField placeId="" label="" onChange={vi.fn()} />);
      fireEvent.focus(box());
      fireEvent.change(box(), { target: { value: "Twinton" } });
      await waitFor(() => expect(screen.getAllByRole("option").some((o) => /1 of 2 with this name/.test(o.textContent ?? ""))).toBe(true));
      const lines = screen.getAllByRole("option").map((o) => o.textContent ?? "");
      expect(lines.some((l) => /2 of 2 with this name/.test(l))).toBe(true);
      expect(readable()).not.toMatch(/s8x-twin|entry/);
    } finally {
      delete ROWS[`${GEO}/s8x-twin-a`];
      delete ROWS[`${GEO}/s8x-twin-b`];
      delete SEARCH["City|Twinton"];
      delete SEARCH["Municipality|Twinton"];
    }
  });
});

describe("the choice and the clearing, and the catalogue is only ever read", () => {
  it("choosing a row hands over exactly that row's address and name", async () => {
    setCatalogueMode("oslo-live");
    const onChange = vi.fn();
    render(<WorkLocationField placeId="" label="" onChange={onChange} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    fireEvent.click(screen.getAllByRole("option").find((o) => /Oslo Township/.test(o.textContent ?? ""))!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ placeId: `${GEO}/oslo-township`, placeLabel: "Oslo Township" });
  });

  it("emptying the box clears the place: exactly one call with empty id and label", async () => {
    const onChange = vi.fn();
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="Oslo" onChange={onChange} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ placeId: "", placeLabel: "" });
  });

  it("typing text that is not empty clears nothing", async () => {
    const onChange = vi.fn();
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="Oslo" onChange={onChange} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "Os" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("everything it asked of the catalogue was an anonymous GET", async () => {
    setCatalogueMode("oslo-live");
    render(<WorkLocationField placeId={`${GEO}/oslo`} label="" onChange={vi.fn()} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "Oslo" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(4));
    const geo = callsTo(GEO_ORIGIN);
    expect(geo.length).toBeGreaterThan(0);
    for (const c of geo) {
      expect(c.method).toBe("GET");
      expect(c.credentials).toBe("omit");
    }
  });
});
