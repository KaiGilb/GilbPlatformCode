// The default predicate of a NEW link between two records.
// Two parties (a person or an organization on both ends, read from the master's kind catalogue) -> t:AssociatedWith; anything else keeps
// t:ConnectedTo, unchanged. The master is the fixture of the live one (`masterFetch`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterFetch } from "../test/masterFetch";
import { defaultLinkPredicate, isPartyTypeRef, masterTypeAddress } from "./partyTie";

const M = "https://ontology.example.test/base";

beforeEach(() => {
  __resetCatalogueCache();
  setTermOrigin("https://ontology.example.test");
  vi.stubGlobal("fetch", masterFetch().fetchImpl);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
});

describe("the default predicate of a new link", () => {
  it("person to person, person to organization, organization to organization: associated-with", async () => {
    expect(await defaultLinkPredicate("Person", "Person")).toBe("t:AssociatedWith");
    expect(await defaultLinkPredicate("t:Person", `${M}/t/Organization`)).toBe("t:AssociatedWith");
    expect(await defaultLinkPredicate("Organization", "Organization")).toBe("t:AssociatedWith");
  });
  it("a sub-type of Person is a party (read up is-a)", async () => {
    expect(await isPartyTypeRef("Passenger")).toBe(true);
    expect(await defaultLinkPredicate("Passenger", "Organization")).toBe("t:AssociatedWith");
  });
  it("a NON-PERSON link keeps connected-to (a note, a file, a task; one party end is not enough)", async () => {
    expect(await defaultLinkPredicate("Person", "NoteDocument")).toBe("t:ConnectedTo");
    expect(await defaultLinkPredicate("File", "Task")).toBe("t:ConnectedTo");
    expect(await defaultLinkPredicate(null, "Person")).toBe("t:ConnectedTo");
  });
  it("when the master cannot be read the link keeps connected-to as before (⛔ never guessed to be a tie between people)", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    expect(await defaultLinkPredicate("Person", "Person")).toBe("t:ConnectedTo");
  });
  it("masterTypeAddress reads any spelling", () => {
    for (const r of ["Person", "t:Person", "t/Person", `${M}/t/Person`, `${M}/t/Person/`]) expect(masterTypeAddress(r)).toBe(`${M}/t/Person`);
    expect(masterTypeAddress("")).toBe("");
    expect(masterTypeAddress(null)).toBe("");
  });
});
