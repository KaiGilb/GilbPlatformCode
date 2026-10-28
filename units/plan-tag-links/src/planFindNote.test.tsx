// The copied find helpers: the sentences of the notes, the rows of a find, and the note itself.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLAN_FIND_CAP, PlanFindLimitNote, planCapSentence, planFindRows, planUnreadSentence, type PlanFind } from "./planFindNote";
import { row } from "../test/fakeHost";

afterEach(cleanup);

const find = (over: Partial<PlanFind> = {}): PlanFind => ({ rows: [], total: 0, capped: false, unread: 0, ...over });

describe("PLAN_FIND_CAP", () => {
  it("is 300", () => {
    expect(PLAN_FIND_CAP).toBe(300);
  });
});

describe("planFindRows", () => {
  it("is the rows of a find, and none for no find", () => {
    const rows = [row("a", "A")];
    expect(planFindRows(find({ rows }))).toBe(rows);
    expect(planFindRows(undefined)).toEqual([]);
  });
});

describe("planCapSentence", () => {
  it("says how many are shown of how many, with the default cap of 300", () => {
    expect(planCapSentence(450, "values")).toBe("Showing the first 300 of 450 values at this level.");
  });
  it("uses the cap it is given", () => {
    expect(planCapSentence(5000, "parts", 2000)).toBe("Showing the first 2000 of 5000 parts at this level.");
  });
});

describe("planUnreadSentence", () => {
  it("is singular for one, plural for any other number, zero included", () => {
    expect(planUnreadSentence(1, "value")).toBe("1 value could not be read. Try again");
    expect(planUnreadSentence(2, "value")).toBe("2 values could not be read. Try again");
    expect(planUnreadSentence(0, "value")).toBe("0 values could not be read. Try again");
  });
  it("uses the plural it is given", () => {
    expect(planUnreadSentence(2, "entry", "entries")).toBe("2 entries could not be read. Try again");
  });
});

describe("PlanFindLimitNote", () => {
  const draw = (data: PlanFind | null | undefined, extra: { partialSentence?: string | null } = {}) => {
    const onRetry = vi.fn();
    const view = render(<PlanFindLimitNote data={data} word="values" singular="value" onRetry={onRetry} {...extra} />);
    return { onRetry, view };
  };

  it.each([
    ["no find", undefined],
    ["a null find", null],
    ["a whole find", find({ total: 3 })],
  ])("draws nothing for %s", (_n, data) => {
    const t = draw(data);
    expect(t.view.container.innerHTML).toBe("");
  });

  it("draws the cap sentence and Try again for a find that was cut off, and calls onRetry", async () => {
    const t = draw(find({ capped: true, total: 400 }));
    expect(screen.getByText("Showing the first 300 of 400 values at this level.")).toBeTruthy();
    expect(screen.queryByText(/could not be read/)).toBeNull();
    await userEvent.click(screen.getByText("Try again"));
    expect(t.onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses the cap the find carries", () => {
    draw(find({ capped: true, total: 3000, cap: 2000 }));
    expect(screen.getByText("Showing the first 2000 of 3000 values at this level.")).toBeTruthy();
  });

  it("draws the unread sentence as a button that calls onRetry, and Try again", async () => {
    const t = draw(find({ unread: 2 }));
    expect(screen.queryByText(/Showing the first/)).toBeNull();
    await userEvent.click(screen.getByText("2 values could not be read. Try again"));
    await userEvent.click(screen.getByText("Try again"));
    expect(t.onRetry).toHaveBeenCalledTimes(2);
  });

  it("draws the partial sentence between them when the list has one", () => {
    draw(find({ unread: 1, capped: true, total: 400 }), { partialSentence: "Some parts are not shown." });
    const text = [...document.body.querySelectorAll("p, button")].map((n) => n.textContent);
    expect(text).toEqual(["Showing the first 300 of 400 values at this level.", "1 value could not be read. Try again", "Some parts are not shown.", "Try again"]);
  });

  it("draws the partial sentence for a cut-off find only, not for a whole one", () => {
    draw(find(), { partialSentence: "Some parts are not shown." });
    expect(screen.queryByText("Some parts are not shown.")).toBeNull();
  });
});
