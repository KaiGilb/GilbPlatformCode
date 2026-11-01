// Every export of the entry point is pinned: its name and its kind.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

const FUNCTIONS = [
  "useOneCardHost",
  "noteConnected", "connectedKnown", "useConnected", "__resetConnectedRecords",
  "publishTheirPlaces", "useTheirPlaces", "__resetTheirPlaces",
  "isOnlineCardLinkKey", "onlineCardLabelFor", "useOnlineCardLabelFor",
  "useOnlineCardState", "useOnlineCardController", "usePersonCard",
  "ownAddressOf", "useHeldAddresses", "orderPlaces", "useTheirAddresses",
  "GlobeIcon", "NoOnlineCardFoot", "ConnectedMarker",
  "isTheirPlaceGroup", "OneCardBody", "OneCardOwnGroups",
] as const;

describe("the entry point", () => {
  it.each(FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof (unit as Record<string, unknown>)[name]).toBe("function");
  });
  it("exports ONLINE_CARD_LINK_KEY as sameAs", () => {
    expect(unit.ONLINE_CARD_LINK_KEY).toBe("sameAs");
  });
  it("exports OneCardHostContext, a context with no default host", () => {
    expect(unit.OneCardHostContext).toBeDefined();
    expect((unit.OneCardHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
  it("exports nothing else (a new export must be pinned here)", () => {
    const expected = new Set<string>([...FUNCTIONS, "ONLINE_CARD_LINK_KEY", "OneCardHostContext"]);
    expect(Object.keys(unit).filter((k) => !expected.has(k))).toEqual([]);
    expect([...expected].filter((k) => !(k in unit))).toEqual([]);
  });
});
