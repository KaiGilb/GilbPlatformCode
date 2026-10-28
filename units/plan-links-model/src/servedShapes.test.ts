// Ported from the app's planServedShapes test: the cases that read links and Part of System.
// In the app's file the two linkAddress assertions sit inside a larger case about a part record (they are
// split out here, with the same inputs and expectations); the Part of System case is whole.
import { describe, expect, it } from "vitest";
import { linkAddress, readPartOfFact } from "./index";

describe("served plan records (links)", () => {
  it("reads a link served as a bare {\"@id\"}, and one served as a one-member list under an a: key", () => {
    expect(
      linkAddress(
        { facts: {}, served: { facts: { fvParent: { "@id": "https://vault.example.test/base/e/parent-fn" } } } },
        "fvParent",
      ),
    ).toBe("https://vault.example.test/base/e/parent-fn");
    expect(
      linkAddress(
        { facts: {}, served: { facts: { "a:measures": [{ "@id": "https://vault.example.test/base/e/value-1" }] } } },
        "measures",
      ),
    ).toBe("https://vault.example.test/base/e/value-1");
  });

  it("reads Part of System from a bare partOf link", () => {
    const system = "https://vault.example.test/base/e/system";
    expect(readPartOfFact({ facts: {}, served: { facts: { partOf: { "@id": system } } } })).toEqual({ kind: "link", uri: system });
  });
});
