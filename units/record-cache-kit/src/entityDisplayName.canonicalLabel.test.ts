// Ported from entityDisplayName.test.ts (the withCanonicalLabel block, all 7).
import { describe, expect, it } from "vitest";
import { CANONICAL_DISPLAY_SLUG, withCanonicalLabel } from "./entityDisplayName";

describe("withCanonicalLabel", () => {
  it("dual-writes label from nameField on create/save", () => {
    expect(withCanonicalLabel({ title: "New note" }, "title")).toEqual({
      title: "New note",
      [CANONICAL_DISPLAY_SLUG]: "New note",
    });
  });

  it("mint dual content: copies unitTag *string* into label when label empty (tag type unchanged)", () => {
    expect(withCanonicalLabel({ unitTag: "ProcVdcStX" }, "title")).toEqual({
      unitTag: "ProcVdcStX",
      label: "ProcVdcStX",
    });
  });

  it("does not overwrite existing label from unitTag; dual-writes title bridge", () => {
    expect(
      withCanonicalLabel({ unitTag: "ProcVdcStX", label: "Human name" }, "title"),
    ).toEqual({ unitTag: "ProcVdcStX", label: "Human name", title: "Human name" });
  });

  it("leaves existing label and dual-writes title bridge", () => {
    expect(withCanonicalLabel({ label: "analyse big data" }, "title")).toEqual({
      label: "analyse big data",
      title: "analyse big data",
    });
  });

  it("updates label when nameField changes (bridge period)", () => {
    expect(
      withCanonicalLabel({ title: "Renamed", label: "Old" }, "title"),
    ).toEqual({ title: "Renamed", label: "Renamed" });
  });

  it("mint dual content: accountSubject → label when no other name", () => {
    expect(withCanonicalLabel({ accountSubject: "1@example.test" }, "title")).toEqual({
      accountSubject: "1@example.test",
      label: "1@example.test",
    });
  });

  it("mint dual content: registeredVault host → label", () => {
    expect(
      withCanonicalLabel({ registeredVault: "https://connect.example.test/base" }, "title"),
    ).toEqual({
      registeredVault: "https://connect.example.test/base",
      label: "connect.example.test",
    });
  });
});

