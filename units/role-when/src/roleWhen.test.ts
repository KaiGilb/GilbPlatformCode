import { describe, expect, it } from "vitest";
import { formatRoleWhen } from "./roleWhen";

const NOW = new Date(2026, 8, 27);

describe("formatRoleWhen", () => {
  it("returns blank when the start is missing or not a month", () => {
    expect(formatRoleWhen(undefined, undefined, true, NOW, "en-US")).toBe("");
    expect(formatRoleWhen("", "2020-01", false, NOW, "en-US")).toBe("");
    expect(formatRoleWhen("2020-13", undefined, false, NOW, "en-US")).toBe("");
    expect(formatRoleWhen("2020-00", undefined, false, NOW, "en-US")).toBe("");
    expect(formatRoleWhen("2020-1", undefined, false, NOW, "en-US")).toBe("");
    expect(formatRoleWhen("2020-01-15", undefined, false, NOW, "en-US")).toBe("");
    expect(formatRoleWhen("Jan 2020", undefined, false, NOW, "en-US")).toBe("");
  });

  it("shows the start alone when there is no end and current is not true", () => {
    expect(formatRoleWhen("2011-01", "", false, NOW, "en-US")).toBe("Jan 2011");
    expect(formatRoleWhen("2025-08", "", undefined, NOW, "en-US")).toBe("Aug 2025");
    expect(formatRoleWhen(" 2025-08 ", undefined, false, NOW, "en-US")).toBe("Aug 2025");
  });

  it("says Present only when current is true and the end is not a month", () => {
    const line = formatRoleWhen("2025-08", "", true, NOW, "en-US");
    expect(line.startsWith("Aug 2025 – Present · ")).toBe(true);
    expect(line).not.toContain("Sep 2026");
  });

  it("does not say Present when an end month is present, even if current is true", () => {
    const line = formatRoleWhen("2024-07", "2025-09", true, NOW, "en-US");
    expect(line.startsWith("Jul 2024 – Sep 2025 · ")).toBe(true);
    expect(line).not.toContain("Present");
  });

  it("counts both months, and uses the fallback span when DurationFormat is absent", () => {
    const hasDuration =
      typeof (Intl as { DurationFormat?: unknown }).DurationFormat === "function";
    const line = formatRoleWhen("2020-01", "2021-03", false, NOW, "en-US");
    expect(line.startsWith("Jan 2020 – Mar 2021 · ")).toBe(true);
    if (!hasDuration) {
      expect(line).toBe("Jan 2020 – Mar 2021 · 1 yr 3 mos");
      expect(formatRoleWhen("2020-01", "2020-01", false, NOW, "en-US")).toBe(
        "Jan 2020 – Jan 2020 · 1 mo",
      );
      expect(formatRoleWhen("2020-01", "2020-12", false, NOW, "en-US")).toBe(
        "Jan 2020 – Dec 2020 · 1 yr",
      );
    }
  });

  it("does not swap a backwards range, and raises the span to one month", () => {
    const hasDuration =
      typeof (Intl as { DurationFormat?: unknown }).DurationFormat === "function";
    const line = formatRoleWhen("2021-06", "2020-01", false, NOW, "en-US");
    expect(line.startsWith("Jun 2021 – Jan 2020 · ")).toBe(true);
    if (!hasDuration) expect(line).toBe("Jun 2021 – Jan 2020 · 1 mo");
  });

  it("uses an en dash and a middle dot", () => {
    const line = formatRoleWhen("2024-07", "2025-09", false, NOW, "en-US");
    expect(line).toContain(" – ");
    expect(line).toContain(" · ");
    expect(line).not.toContain(" - ");
  });
});
