/** One Arrow row per qualifier set (never per date); each marker shows its own date; one grouping for Arrow, Timeline and "+ New". */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import { arrowBands, buildAxis, groupLevels, textWidth } from "@kaigilb/gilbplatformcode-value-graph-geometry";
import type { LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

afterEach(cleanup);

const lv = (kind: string, value: number | null, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});
const NO = { typeIri: "", typeLabel: "", words: "" };
const mk = (levels: ValueLevel[], direction: "lower" | "higher" = "lower"): ValueCardData => ({
  scale: { text: "minutes", unit: "min", rate: "", context: "", direction, source: {} },
  variables: [],
  endpoint: { subject: NO, reference: NO, text: "", source: {} },
  meters: [],
  levels,
});
const norway = { Country: "Norway" };
// The example: Status + Tolerable on 2027-10-27 and a Goal on 2027-01-27, all "Country = Norway".
const example = mk([
  lv("Status", 9, { when: "2026-10-27", variables: norway }),
  lv("Tolerable", 7, { when: "2027-10-27", variables: norway }),
  lv("Goal", 4, { when: "2027-01-27", variables: norway }),
]);

describe("one Arrow per qualifier set", () => {
  it("groupLevels ignores the date: the same choices, conditions and side are one set", () => {
    expect(groupLevels(example)).toHaveLength(1);
    expect(groupLevels(example)[0]!.label).toBe("Country = Norway");
    const other = mk([lv("Goal", 4, { when: "2027-01-27", variables: norway }), lv("Goal", 3, { when: "2028-01-27", variables: norway, conditions: ["c"] })]);
    expect(groupLevels(other)).toHaveLength(2);
  });

  it("the example draws ONE row, labelled without a date, with every marker under it", () => {
    const { container } = render(<PlanValueGraph data={example} editing={false} onChangeLevels={() => {}} />);
    expect(container.querySelectorAll("[data-row]")).toHaveLength(1);
    const row = container.querySelector('[data-row="0"]')!;
    expect(row.getAttribute("aria-label")).toBe("Country = Norway");
    expect(row.querySelectorAll("[role=slider]")).toHaveLength(3);
  });

  it("each marker shows its own date under its value, Status included", () => {
    const { container } = render(<PlanValueGraph data={example} editing={false} onChangeLevels={() => {}} />);
    const dates = (i: number) => [...container.querySelector(`[data-level="${i}"]`)!.querySelectorAll("text")].map((t) => t.textContent);
    expect(dates(0)).toEqual(["Status", "9", "2026-10-27"]);
    expect(dates(1)).toEqual(["Tolerable", "7", "2027-10-27"]);
    expect(dates(2)).toEqual(["Goal", "4", "2027-01-27"]);
  });

  it("two Goals of one set (2027 and 2028) are one row, both show their date, and no two label boxes meet", () => {
    const data = mk([
      lv("Goal", 5, { when: "2027-01-01", variables: norway }),
      lv("Goal", 5.2, { when: "2028-01-01", variables: norway }),
      lv("Status", 9, { when: "2026-10-27", variables: norway }),
    ]);
    const { container } = render(<PlanValueGraph data={data} editing={false} onChangeLevels={() => {}} />);
    expect(container.querySelectorAll("[data-row]")).toHaveLength(1);
    const texts = [...container.querySelectorAll('[data-row="0"] [role=slider] text')];
    expect(texts.map((t) => t.textContent)).toEqual(expect.arrayContaining(["2027-01-01", "2028-01-01", "2026-10-27"]));
    const box = (t: Element) => {
      const x = Number(t.getAttribute("x")), y = Number(t.getAttribute("y")), size = Number(t.getAttribute("font-size"));
      const w = textWidth(t.textContent ?? "", size);
      return { l: x - w / 2, r: x + w / 2, t: y - size, b: y };
    };
    const boxes = texts.map(box);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const meet = a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
        expect(meet, `${texts[i]!.textContent} meets ${texts[j]!.textContent}`).toBe(false);
      }
  });

  it("the Arrow row has no date chip (editing)", () => {
    render(<PlanValueGraph data={example} editing onChangeLevels={() => {}} />);
    expect(document.querySelector('[data-chip="date"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Change date/ })).toBeNull();
  });

  it("bands follow the latest-dated Goal and Tolerable; the earlier ones are markers only", () => {
    const data = mk([
      lv("Status", 12, { when: "2026-10-27", variables: norway }),
      lv("Tolerable", 10, { when: "2027-01-01", variables: norway }),
      lv("Goal", 5, { when: "2027-01-01", variables: norway }),
      lv("Tolerable", 8, { when: "2028-01-01", variables: norway }),
      lv("Goal", 3, { when: "2028-01-01", variables: norway }),
    ]);
    const { container } = render(<PlanValueGraph data={data} editing={false} onChangeLevels={() => {}} />);
    expect(container.querySelectorAll("[role=slider]")).toHaveLength(5); // all five are still drawn
    const got = [...container.querySelectorAll<SVGRectElement>("[data-band]")].map((r) => [r.getAttribute("data-band"), Number(r.getAttribute("x")), Number(r.getAttribute("width"))]);
    // The same bands as the plan of 2028 alone, on the same axis.
    const line = container.querySelector('[data-row="0"] line[stroke-width="1.5"]')!;
    const axis = buildAxis([12, 10, 5, 8, 3], "lower", Number(line.getAttribute("x1")), Number(line.getAttribute("x2")) + 4);
    const want = arrowBands("lower", [3], [8], axis).map((b) => [b.tone, b.x0, b.x1 - b.x0]);
    expect(got).toEqual(want.map(([t, x, w]) => [t, x, w]));
    expect(got.length).toBeGreaterThan(0);
  });

  it("the + New menu lists the same sets on the Arrow and on the Timeline", () => {
    const data = mk([
      lv("Goal", 5, { when: "2027-01-01", variables: norway }),
      lv("Goal", 4, { when: "2028-01-01", variables: norway }),
      lv("Goal", 6, { when: "2027-01-01", variables: { Country: "Sweden" } }),
    ]);
    const setsOnMenu = () => {
      fireEvent.click(screen.getByRole("button", { name: "+ New" }));
      const names = [...document.querySelectorAll("[data-newmenu-set]")].map((e) => e.getAttribute("aria-label"));
      fireEvent.keyDown(document.querySelector("[data-newmenu]")!, { key: "Escape" });
      return names;
    };
    render(<PlanValueGraph data={data} editing onChangeLevels={() => {}} />);
    const arrow = setsOnMenu();
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const timeline = setsOnMenu();
    expect(arrow).toEqual(["Country = Norway", "Country = Sweden"]);
    expect(timeline).toEqual(arrow);
  });
});
