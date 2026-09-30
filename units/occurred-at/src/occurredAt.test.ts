import { describe, expect, it } from "vitest";
import {
  earliestValidFrom,
  extrasFromPoints,
  pointsFromExtras,
  sortPointsChronologically,
  toDateTimeLocal,
  toIsoDateTime,
} from "./occurredAt";
import type { TimeSpacePoint } from "./occurredAt";

function point(partial: Partial<TimeSpacePoint> & Pick<TimeSpacePoint, "id">): TimeSpacePoint {
  return { when: "", where: "", ...partial };
}

describe("occurred at", () => {
  it("keeps a minute value as written, and cuts an unparseable value to 16 characters", () => {
    expect(toDateTimeLocal("2020-01-05T15:04")).toBe("2020-01-05T15:04");
    expect(toDateTimeLocal("not-a-date-really")).toBe("not-a-date-reall");
    expect(toDateTimeLocal("   ")).toBe("");
    expect(toIsoDateTime("not-a-date")).toBe("not-a-date");
    expect(toIsoDateTime("2020-01-05T15:04")).toBe(new Date("2020-01-05T15:04").toISOString());
  });

  it("sorts a blank time after a real time, and breaks a tie by id", () => {
    const ordered = sortPointsChronologically([
      point({ id: "b", when: "" }),
      point({ id: "a", when: "2020-01-05T15:04" }),
      point({ id: "c", when: "2020-01-05T15:04" }),
    ]);
    expect(ordered.map((row) => row.id)).toEqual(["a", "c", "b"]);
  });

  it("stores a JSON string of plain objects, and lets an undated where win", () => {
    const extras = extrasFromPoints([
      point({ id: "a", when: "2020-01-05T15:04", where: "Oslo" }),
      point({ id: "b", when: "", where: "  Bergen  " }),
      point({ id: "c", tag: "only-tag" }),
    ]);
    const stored = extras["a:occurredAt"];
    expect(typeof stored).toBe("string");
    const rows = JSON.parse(String(stored)) as Array<Record<string, string>>;
    expect(rows.some((row) => "@value" in row)).toBe(false);
    expect(rows.map((row) => row.where)).toEqual(["Oslo", "Bergen"]);
    expect(extras["a:location"]).toBe("Bergen");
    expect(rows.find((row) => row.tag === "only-tag")).toBeUndefined();
  });

  it("copies a separate location only onto an empty where", () => {
    const filled = pointsFromExtras({
      "a:occurredAt": JSON.stringify([{ when: "2020-01-05T15:04", where: " " }]),
      "a:location": "Oslo",
    });
    expect(filled).toHaveLength(1);
    expect(filled[0]?.where).toBe(" ");
    const empty = pointsFromExtras({ occurredAt: "2020-01-05T15:04", location: "Oslo" });
    expect(empty[0]?.where).toBe("Oslo");
    expect(empty[0]?.when).toBe("2020-01-05T15:04");
    const placeOnly = pointsFromExtras({ "a:location": "Oslo" });
    expect(placeOnly).toEqual([expect.objectContaining({ when: "", where: "Oslo" })]);
  });

  it("returns no earliest instant when no point has a time", () => {
    expect(earliestValidFrom([point({ id: "a", where: "Oslo" })])).toBeUndefined();
    expect(earliestValidFrom([point({ id: "a", when: "2020-01-05T15:04" })])).toBe(
      new Date("2020-01-05T15:04").toISOString(),
    );
  });
});
