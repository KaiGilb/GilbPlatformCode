import { describe, expect, it } from "vitest";
import { asStandingReport, standingNotice } from "./standingNotice";

describe("asStandingReport", () => {
  it("drops a missing outcome and maps an unknown word to unreadable", () => {
    expect(asStandingReport(null)).toBeNull();
    expect(asStandingReport({})).toBeNull();
    expect(asStandingReport({ outcome: 1 })).toBeNull();
    expect(asStandingReport([])).toBeNull();

    const known = asStandingReport({ outcome: "unreadable", reason: "" });
    expect(known).toEqual({ outcome: "unreadable", group: "", vault: "" });
    expect(known && "reason" in known).toBe(false);

    const unknown = asStandingReport({ outcome: "nope", group: 1, vault: null, reason: "" });
    expect(unknown).toEqual({
      outcome: "unreadable",
      group: "",
      vault: "",
      reason: "the host reported an outcome this app does not know: nope",
    });

    const spaced = asStandingReport({
      outcome: "group-absent",
      group: "",
      vault: "",
      groupsSeen: [" A ", "", "   ", "B", 1],
      reason: "  x",
    });
    expect(spaced).toEqual({
      outcome: "group-absent",
      group: "",
      vault: "",
      groupsSeen: [" A ", "", "   ", "B"],
      reason: "  x",
    });
  });
});

describe("standingNotice", () => {
  it("uses a different ending for each failure and none for loaded", () => {
    expect(
      standingNotice({ outcome: "loaded", group: "G", vault: "V" }),
    ).toBeNull();
    expect(
      standingNotice({ outcome: "unreadable", group: "", vault: "" }),
    ).toBe(
      "The agent is answering WITHOUT its standing instructions: the standards vault could not be read. This is not an empty group.",
    );
    expect(
      standingNotice({
        outcome: "unreadable",
        group: "",
        vault: "",
        reason: "timed out",
      }),
    ).toBe(
      "The agent is answering WITHOUT its standing instructions: the standards vault could not be read (timed out). This is not an empty group.",
    );
    expect(
      standingNotice({
        outcome: "group-absent",
        group: "",
        vault: "",
        groupsSeen: [" A ", "", "   ", "B"],
      }),
    ).toBe(
      'The agent is answering WITHOUT its standing instructions: no group called "the default group" is on the standards vault. That vault offers:  A , B.',
    );
    expect(
      standingNotice({ outcome: "group-empty", group: "G", vault: "V" }),
    ).toBe(
      'The agent is answering WITHOUT its standing instructions: the group "G" exists and holds no steps.',
    );
  });
});
