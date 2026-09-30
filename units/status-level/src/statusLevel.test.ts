import { describe, expect, it } from "vitest";
import {
  SEED_STATUS_VALUES,
  STATUS_SEED,
  bindableValues,
  describeLifecycle,
  keepLifecycleStatus,
  reconcileLifecycleSelection,
  statusTone,
} from "./statusLevel";

const custom = { value: "Custom", label: "Custom", admitsNewBinding: false };

describe("STATUS_SEED", () => {
  it("admits binding on the first two levels and does not name a retired word in the help", () => {
    expect(SEED_STATUS_VALUES).toEqual(["Suggested", "Approved", "Deprecated"]);
    expect(bindableValues(STATUS_SEED)).toEqual(["Suggested", "Approved"]);
    const deprecated = STATUS_SEED[2];
    expect(deprecated?.help?.toLowerCase().includes("retired")).toBe(false);
    expect(bindableValues([])).toEqual([]);
    expect(bindableValues([{ value: "A", label: "A", admitsNewBinding: true }, { value: "A", label: "A", admitsNewBinding: true }])).toEqual(["A", "A"]);
  });
});

describe("statusTone", () => {
  it("colours the seed, leaves Approved uncoloured, and does not guess", () => {
    expect(statusTone(" Suggested ")).toBe("var(--ok)");
    expect(statusTone("APPROVED")).toBeNull();
    expect(statusTone("deprecated")).toBe("var(--bad)");
    expect(statusTone("Retired")).toBeNull();
    expect(statusTone("")).toBeNull();
    expect(statusTone(null)).toBeNull();
    expect(statusTone("Suggested", [])).toBeNull();
    expect(statusTone("Suggested", [{ value: "Suggested", label: "Suggested", admitsNewBinding: true, tone: "" }])).toBeNull();
  });
});

describe("keepLifecycleStatus", () => {
  it("shows a blank or an unrecognised status, and hides a known status that was not selected", () => {
    expect(keepLifecycleStatus("  ", ["Deprecated"], SEED_STATUS_VALUES)).toBe(true);
    expect(keepLifecycleStatus(null, [], SEED_STATUS_VALUES)).toBe(true);
    expect(keepLifecycleStatus("Retired", [], SEED_STATUS_VALUES)).toBe(true);
    expect(keepLifecycleStatus("Deprecated", [], SEED_STATUS_VALUES)).toBe(false);
    expect(keepLifecycleStatus("deprecated", ["Deprecated"], SEED_STATUS_VALUES)).toBe(true);
    expect(keepLifecycleStatus("Suggested", ["Approved"], SEED_STATUS_VALUES)).toBe(false);
    expect(keepLifecycleStatus("Deprecated", [" deprecated "], SEED_STATUS_VALUES)).toBe(false);
    expect(keepLifecycleStatus("Suggested", [], [])).toBe(true);
  });
});

describe("describeLifecycle", () => {
  it("uses is for one hidden level and a shorter sentence when nothing is hidden", () => {
    expect(describeLifecycle(["Suggested", "Approved"], SEED_STATUS_VALUES)).toBe(
      "Lifecycle: showing Suggested, Approved. Deprecated is hidden. Terms with no recorded standing are still listed.",
    );
    expect(describeLifecycle([], ["Deprecated", "Approved"])).toBe(
      "Lifecycle: showing none. Deprecated, Approved are hidden. Terms with no recorded standing are still listed.",
    );
    expect(describeLifecycle(["suggested"], ["Suggested"])).toBe(
      "Lifecycle: showing every standing (suggested).",
    );
  });
});

describe("reconcileLifecycleSelection", () => {
  it("leaves a missing key untouched and rewrites case without dropping a private choice", () => {
    const off = { other: ["x"] };
    expect(reconcileLifecycleSelection(off, STATUS_SEED)).toBe(off);

    const same = { lifecycle: ["Suggested", "Approved"] };
    expect(reconcileLifecycleSelection(same, STATUS_SEED)).toBe(same);

    const cased = { lifecycle: ["suggested"], other: ["keep"] };
    const next = reconcileLifecycleSelection(cased, STATUS_SEED);
    expect(next).not.toBe(cased);
    expect(next.lifecycle).toEqual(["Suggested"]);
    expect(next.other).toEqual(["keep"]);

    const kept = { lifecycle: ["KeepMe", "Suggested"] };
    expect(reconcileLifecycleSelection(kept, STATUS_SEED)).toBe(kept);
  });

  it("appends a level the seed has not heard of, including onto an empty list", () => {
    const levels = [...STATUS_SEED, custom];
    const state = { lifecycle: ["Suggested", "Approved"] };
    expect(reconcileLifecycleSelection(state, levels).lifecycle).toEqual([
      "Suggested",
      "Approved",
      "Custom",
    ]);
    const empty = { lifecycle: [] as readonly string[] };
    expect(reconcileLifecycleSelection(empty, levels).lifecycle).toEqual(["Custom"]);
    expect(
      reconcileLifecycleSelection(state, levels, levels.map((l) => l.value)).lifecycle,
    ).toEqual(["Suggested", "Approved"]);
  });

  it("uses the filter id it is given", () => {
    const state = { mine: ["suggested"] };
    expect(reconcileLifecycleSelection(state, STATUS_SEED, SEED_STATUS_VALUES, "mine").mine).toEqual([
      "Suggested",
    ]);
    expect(reconcileLifecycleSelection(state, STATUS_SEED).mine).toEqual(["suggested"]);
  });
});
