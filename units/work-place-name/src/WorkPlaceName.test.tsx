// @vitest-environment jsdom
// The read-only place of a role. Case 1 is GilbApp's `EmploymentCard.s8cardlook` presentation case, the part about the place (the sixth case of
// that file, left to the work-location batch by the employment unit): the name, and under it what it is and where (Kai 2026-10-16). The rest is new:
// F10 (a name not known is said), the fence, the name rule, and that the catalogue is only ever read.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { WorkPlaceName } from "./index";
import { GEO, GEO_ORIGIN, calls, callsTo, failIds, setCatalogueMode, useWorld } from "../test/world";

useWorld();
afterEach(cleanup);
beforeEach(() => setCatalogueMode("oslo-live"));

const NO_ADDRESS = /https?:|\/base\/e\/|osm-r-|oslo-township|@evil/;
const readable = () => document.body.textContent ?? "";

describe("a stored place with a known name", () => {
  it("(ported) presentation: the name, and under it what it is and where", async () => {
    render(<WorkPlaceName placeId={`${GEO}/oslo`} label="Oslo" />);
    expect(screen.getByTestId("experience-role-place").textContent).toBe("Oslo");
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toBe("municipality · in Norway"));
  });

  it("the role has no label (always so on a held card): the name comes from the catalogue", async () => {
    render(<WorkPlaceName placeId={`${GEO}/oslo-township`} label="" />);
    await waitFor(() => expect(screen.getByTestId("experience-role-place").textContent).toBe("Oslo Township"));
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toBe("municipality · in United States"));
    expect(readable()).not.toMatch(NO_ADDRESS);
  });

  it("a place with no label and no stored place draws nothing", () => {
    const { container } = render(<WorkPlaceName placeId="" label="" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("(F10) a stored place whose name is not known is said, never drawn as nothing", () => {
  it("a failed read: 'A place' and why", async () => {
    failIds.add(`${GEO}/oslo`);
    render(<WorkPlaceName placeId={`${GEO}/oslo`} label="" />);
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toBe("The name of this place could not be read right now."));
    expect(screen.getByTestId("experience-role-place").textContent).toBe("A place");
  });

  it("a 404: 'A place' and 'That place is no longer in the catalogue.'", async () => {
    render(<WorkPlaceName placeId={`${GEO}/gone`} label="" />);
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toBe("That place is no longer in the catalogue."));
    expect(screen.getByTestId("experience-role-place").textContent).toBe("A place");
  });

  it("an address that is not the catalogue's: 'A place', that it is not the catalogue's, and no request to that host", async () => {
    render(<WorkPlaceName placeId="https://evil.example/base/e/osm-r-1" label="" />);
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toMatch(/not in the place catalogue this app uses/));
    expect(screen.getByTestId("experience-role-place").textContent).toBe("A place");
    expect(calls).toEqual([]);
    expect(readable()).not.toMatch(NO_ADDRESS);
  });

  it("while it is being read it already says 'A place'", async () => {
    render(<WorkPlaceName placeId={`${GEO}/oslo`} label="" />);
    expect(screen.getByTestId("experience-role-place").textContent).toBe("A place");
    await waitFor(() => expect(screen.getByTestId("experience-role-place").textContent).toBe("Oslo"));
  });

  it("a label that is known is kept even when the catalogue cannot be read; only the kind line is missing", async () => {
    failIds.add(`${GEO}/oslo`);
    render(<WorkPlaceName placeId={`${GEO}/oslo`} label="Oslo" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId("experience-role-place").textContent).toBe("Oslo");
    expect(screen.queryByTestId("experience-role-place-kind")).toBeNull();
  });

  it("(F12) a kind whose container was not read says so", async () => {
    failIds.add(`${GEO}/no`);
    render(<WorkPlaceName placeId={`${GEO}/oslo`} label="Oslo" />);
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toBe("municipality · where: not read"));
  });
});

describe("the catalogue is only ever read", () => {
  it("every request to it is an anonymous GET", async () => {
    render(<WorkPlaceName placeId={`${GEO}/oslo`} label="" />);
    await waitFor(() => expect(screen.getByTestId("experience-role-place-kind").textContent).toBe("municipality · in Norway"));
    const geo = callsTo(GEO_ORIGIN);
    expect(geo.length).toBeGreaterThan(0);
    for (const c of geo) {
      expect(c.method).toBe("GET");
      expect(c.credentials).toBe("omit");
    }
  });
});
