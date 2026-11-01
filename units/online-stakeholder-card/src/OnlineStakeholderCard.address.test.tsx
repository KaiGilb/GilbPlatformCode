// The address field's write key is handed to the one card, so their address is one row of that group.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { AddressSpellings } from "@kaigilb/gilbplatformcode-one-card-merge";
import type { GeoPlace, TheirPlaceRead } from "@kaigilb/gilbplatformcode-one-card";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { forgetLinkedRecords, forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { reset, VOCAB } from "../test/mocks";
import { setUp, tearDown } from "../test/support";
import { draw, oneCardHost, personFields, stubPlatform } from "../test/world";

const LINE = "Gladvollveien 38c, Oslo, Oslo, Norway";
const S: AddressSpellings = {
  label: "a:placeClaimLabel",
  streetLine: "a:streetLine",
  addressLine1: "a:addressLine1",
  addressLine2: "a:addressLine2",
  postalCode: "a:postalCode",
  claimPlace: "a:claimPlace",
};
const osloCity: GeoPlace = { id: "osloCity", label: "Oslo", type: "City", memberOf: ["osloRegion", "norway"] };
const osloRegion: GeoPlace = { id: "osloRegion", label: "Oslo", type: "Region", memberOf: ["norway"] };
const norway: GeoPlace = { id: "norway", label: "Norway", type: "Country", memberOf: [] };
const BY: Record<string, GeoPlace> = { osloCity, osloRegion, norway };

beforeEach(() => {
  setUp();
  reset();
  VOCAB.fields = personFields([
    ["GivenName", "Given Name", "givenName"],
    ["FamilyName", "Family Name", "familyName"],
    ["PostalAddress", "Postal Address", "postalAddress"],
  ]);
  oneCardHost.addressSpellings = async () => S;
  oneCardHost.readPlaceNames = async (ids) => ids.map((id): TheirPlaceRead => ({ state: "named", place: BY[id]! }));
  stubPlatform({
    ben: { given: "Kai", family: "Gilb", email: null },
    extra: [
      { field: S.label, value: "home", sourceEntity: "E1" },
      { field: S.streetLine, value: "Gladvollveien 38c", composite: "E1", sourceEntity: "S1" },
      { field: S.claimPlace, value: "osloCity", composite: "E1", sourceEntity: "P1" },
      { field: S.claimPlace, value: "osloRegion", composite: "E1", sourceEntity: "P2" },
      { field: S.claimPlace, value: "norway", composite: "E1", sourceEntity: "P3" },
    ],
  });
});

afterEach(() => {
  delete oneCardHost.addressSpellings;
  delete oneCardHost.readPlaceNames;
  vi.unstubAllGlobals();
  forgetLinkedRecords();
  forgetPageLinks();
  forgetScreenLinks();
  tearDown();
});

describe("their address on the online stakeholder card", () => {
  it("OneCardBody receives the address field's write key", async () => {
    draw();
    const value = await screen.findByText(LINE);
    const row = value.closest("[data-testid='one-card-row']") as HTMLElement;
    expect(row.querySelector("[data-testid='one-card-row-label']")?.textContent).toBe("home");
    expect(value.closest("[data-testid='card-group']")?.getAttribute("data-group")).toBe("theirs:a:postalAddress");
    const values = screen.getAllByTestId("one-card-row-value").map((el) => el.textContent);
    expect(values).not.toContain("Gladvollveien 38c");
  });
});
