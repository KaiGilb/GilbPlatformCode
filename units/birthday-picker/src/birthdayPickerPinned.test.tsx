// Pins every export of the unit and the behaviours the ported tests leave open.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as unit from "./index";
import { BIRTHDAY_FIRST_YEAR, BIRTHDAY_WORDS, BirthdayPicker } from "./index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const sel = (id: string) => screen.getByTestId(id) as HTMLSelectElement;
const pick = (id: string, v: string | number) => fireEvent.change(sel(id), { target: { value: String(v) } });
const save = () => screen.getByTestId("birthday-save") as HTMLButtonElement;

function setup(value = "", extra: Partial<Parameters<typeof BirthdayPicker>[0]> = {}) {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  render(<BirthdayPicker label="Birthday" value={value} onPick={onPick} onCancel={onCancel} locale="en-GB" thisYear={2026} {...extra} />);
  return { onPick, onCancel };
}

describe("the exports", () => {
  it("are BIRTHDAY_FIRST_YEAR, BIRTHDAY_WORDS and BirthdayPicker, and nothing else at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(["BIRTHDAY_FIRST_YEAR", "BIRTHDAY_WORDS", "BirthdayPicker"]);
  });
  it("BIRTHDAY_FIRST_YEAR is 1900", () => {
    expect(BIRTHDAY_FIRST_YEAR).toBe(1900);
  });
  it("BIRTHDAY_WORDS holds every word", () => {
    expect(Object.keys(BIRTHDAY_WORDS).sort()).toEqual(
      ["cancel", "clear", "day", "month", "needDayMonth", "noSuchDay", "noYear", "now", "pickDay", "pickMonth", "save", "unreadable", "year"],
    );
    expect(BIRTHDAY_WORDS.day).toBe("Day");
    expect(BIRTHDAY_WORDS.month).toBe("Month");
    expect(BIRTHDAY_WORDS.year).toBe("Year");
    expect(BIRTHDAY_WORDS.noYear).toBe("No year");
    expect(BIRTHDAY_WORDS.pickDay).toBe("Day…");
    expect(BIRTHDAY_WORDS.pickMonth).toBe("Month…");
    expect(BIRTHDAY_WORDS.save).toBe("Save");
    expect(BIRTHDAY_WORDS.cancel).toBe("Cancel");
    expect(BIRTHDAY_WORDS.clear).toBe("Clear");
    expect(BIRTHDAY_WORDS.needDayMonth).toBe("Pick the day and the month. The year is optional.");
  });
  it("the word functions build their sentences", () => {
    expect(BIRTHDAY_WORDS.now("1 March")).toBe("Now: 1 March");
    expect(BIRTHDAY_WORDS.unreadable("x")).toBe("Now: “x”, which is not a date the card can read. Pick the day to replace it.");
    expect(BIRTHDAY_WORDS.noSuchDay(31, "April", null)).toBe("There is no 31 April.");
    expect(BIRTHDAY_WORDS.noSuchDay(29, "February", 2023)).toBe("There is no 29 February 2023.");
  });
});

describe("the year list", () => {
  it("runs from thisYear down to BIRTHDAY_FIRST_YEAR, each once", () => {
    setup("", { thisYear: 1905 });
    const years = [...sel("birthday-year").options].slice(1).map((o) => o.textContent);
    expect(years).toEqual(["1905", "1904", "1903", "1902", "1901", "1900"]);
  });
  it("starts from the current year when thisYear is left out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));
    setup("", { thisYear: undefined });
    expect([...sel("birthday-year").options][1]!.textContent).toBe("2031");
  });
  it("a stored year inside the list is not listed twice", () => {
    setup("1980-03-14");
    const years = [...sel("birthday-year").options].map((o) => o.textContent);
    expect(years.filter((y) => y === "1980")).toHaveLength(1);
    expect(sel("birthday-year").value).toBe("1980");
  });
  it("a stored year after thisYear is offered last, and kept selected", () => {
    setup("2030-03-14");
    const years = [...sel("birthday-year").options].map((o) => o.textContent);
    expect(years.at(-1)).toBe("2030");
    expect(sel("birthday-year").value).toBe("2030");
  });
  it("a stored year before 1900 is offered last", () => {
    setup("1850-01-02");
    expect([...sel("birthday-year").options].map((o) => o.textContent).at(-1)).toBe("1850");
  });
});

describe("the lists and the stored value", () => {
  it("the day list always offers 1 to 31", () => {
    setup("", { locale: "en-GB" });
    expect([...sel("birthday-day").options].slice(1).map((o) => o.value)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
  });
  it("a stored day and month without a year opens with No year", () => {
    setup("--12-25");
    expect(sel("birthday-day").value).toBe("25");
    expect(sel("birthday-month").value).toBe("12");
    expect(sel("birthday-year").value).toBe("");
    expect(screen.getByTestId("birthday-picker-current").textContent).toBe("Now: 25 December");
  });
  it("nothing stored shows no 'Now' line; a blank value counts as nothing", () => {
    setup("   ");
    expect(screen.queryByTestId("birthday-picker-current")).toBeNull();
  });
  it("picking the empty option again puts the list back to empty", () => {
    setup("--03-14");
    pick("birthday-day", "");
    expect(sel("birthday-day").value).toBe("");
    expect(save().disabled).toBe(true);
    expect(screen.getByTestId("birthday-need-day-month")).toBeTruthy();
    pick("birthday-day", 14);
    pick("birthday-month", "");
    expect(save().disabled).toBe(true);
  });
  it("choosing No year after a year stores the year-less form", () => {
    const { onPick } = setup("1980-03-14");
    pick("birthday-year", "");
    fireEvent.click(save());
    expect(onPick).toHaveBeenCalledWith("--03-14");
  });
  it("saving without a change hands back the stored date in the master's shape, spaces around it dropped", () => {
    const { onPick } = setup("  1961-03-04 ");
    fireEvent.click(save());
    expect(onPick).toHaveBeenCalledWith("1961-03-04");
  });
  it("29 February with no year is allowed", () => {
    const { onPick } = setup();
    pick("birthday-day", 29);
    pick("birthday-month", 2);
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(onPick).toHaveBeenCalledWith("--02-29");
  });
  it("the last day of a 30-day month is allowed and the 31st is not", () => {
    setup();
    pick("birthday-month", 6);
    pick("birthday-day", 30);
    expect(save().disabled).toBe(false);
    pick("birthday-day", 31);
    expect(save().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("There is no 31 June.");
  });
  it("a day that stops being lawful when the month changes is refused", () => {
    setup();
    pick("birthday-day", 31);
    pick("birthday-month", 1);
    expect(save().disabled).toBe(false);
    pick("birthday-month", 11);
    expect(save().disabled).toBe(true);
    pick("birthday-month", 12);
    expect(save().disabled).toBe(false);
  });
  it("the months are named in the given locale in the message too", () => {
    setup("", { locale: "nb" });
    pick("birthday-day", 31);
    pick("birthday-month", 4);
    expect(screen.getByRole("alert").textContent).toBe("There is no 31 april.");
  });
});

describe("the messages", () => {
  it("before day and month are chosen the line is quiet: no alert role", () => {
    setup();
    const p = screen.getByTestId("birthday-need-day-month");
    expect(p.getAttribute("role")).toBeNull();
    expect(p.style.fontWeight).toBe("");
    expect(p.style.color).toBe("var(--ink-soft, var(--color-ink-secondary, #67635e))");
  });
  it("an impossible day is an alert and drawn heavier", () => {
    setup();
    pick("birthday-day", 31);
    pick("birthday-month", 9);
    const p = screen.getByTestId("birthday-no-such-day");
    expect(p.getAttribute("role")).toBe("alert");
    expect(p.style.fontWeight).toBe("600");
    expect(screen.queryByTestId("birthday-need-day-month")).toBeNull();
  });
  it("no message when the date is lawful", () => {
    setup();
    pick("birthday-day", 1);
    pick("birthday-month", 1);
    expect(screen.queryByTestId("birthday-need-day-month")).toBeNull();
    expect(screen.queryByTestId("birthday-no-such-day")).toBeNull();
  });
});

describe("the keys and buttons", () => {
  it("Escape cancels and does not reach handlers outside the picker", () => {
    const outer = vi.fn();
    const onCancel = vi.fn();
    render(
      <div onKeyDown={outer}>
        <BirthdayPicker label="Birthday" value="" onPick={() => {}} onCancel={onCancel} thisYear={2026} />
      </div>,
    );
    fireEvent.keyDown(sel("birthday-day"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
  it("Enter in a list saves, is prevented, and does not reach handlers outside", () => {
    const outer = vi.fn();
    const onPick = vi.fn();
    render(
      <div onKeyDown={outer}>
        <BirthdayPicker label="Birthday" value="--03-14" onPick={onPick} onCancel={() => {}} thisYear={2026} />
      </div>,
    );
    const notPrevented = fireEvent.keyDown(sel("birthday-month"), { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(onPick).toHaveBeenCalledWith("--03-14");
    expect(outer).not.toHaveBeenCalled();
  });
  it("Enter on a button is left to the button: the picker does not save for it", () => {
    const { onPick } = setup("--03-14");
    const notPrevented = fireEvent.keyDown(screen.getByTestId("birthday-cancel"), { key: "Enter" });
    expect(notPrevented).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
  });
  it("another key does nothing", () => {
    const { onPick, onCancel } = setup("--03-14");
    fireEvent.keyDown(sel("birthday-day"), { key: "a" });
    fireEvent.keyDown(sel("birthday-day"), { key: "Tab" });
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
  it("Cancel calls onCancel and nothing else", () => {
    const { onPick, onCancel } = setup("--03-14");
    fireEvent.click(screen.getByTestId("birthday-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
  it("Clear is offered only with onClear and a stored value", () => {
    const onClear = vi.fn();
    setup("--03-14");
    expect(screen.queryByTestId("birthday-clear")).toBeNull();
    cleanup();
    setup("", { onClear });
    expect(screen.queryByTestId("birthday-clear")).toBeNull();
    cleanup();
    setup("   ", { onClear });
    expect(screen.queryByTestId("birthday-clear")).toBeNull();
    cleanup();
    setup("not a date", { onClear });
    fireEvent.click(screen.getByTestId("birthday-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
  it("Save off is dimmed; Save on is full", () => {
    setup();
    expect(save().style.opacity).toBe("0.6");
    pick("birthday-day", 1);
    pick("birthday-month", 1);
    expect(save().style.opacity).toBe("1");
    expect(save().style.fontWeight).toBe("700");
  });
  it("the three buttons are type button, so no form around the picker is submitted", () => {
    setup("--03-14", { onClear: () => {} });
    for (const id of ["birthday-save", "birthday-cancel", "birthday-clear"]) expect(screen.getByTestId(id).getAttribute("type")).toBe("button");
    expect(screen.getByTestId("birthday-picker").closest("form")).toBeNull();
  });
});

describe("the markup", () => {
  it("is a group named by the label, and each list is labelled by its word", () => {
    setup("", { label: "Date of birth" });
    expect(screen.getByRole("group", { name: "Date of birth" })).toBeTruthy();
    expect(screen.getByLabelText("Day")).toBe(sel("birthday-day"));
    expect(screen.getByLabelText("Month")).toBe(sel("birthday-month"));
    expect(screen.getByLabelText("Year")).toBe(sel("birthday-year"));
  });
  it("two pickers on one page have different ids", () => {
    render(
      <>
        <BirthdayPicker label="A" value="" onPick={() => {}} onCancel={() => {}} />
        <BirthdayPicker label="B" value="" onPick={() => {}} onCancel={() => {}} />
      </>,
    );
    const ids = screen.getAllByTestId("birthday-day").map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("the day list takes the focus on opening", () => {
    setup();
    expect(document.activeElement).toBe(sel("birthday-day"));
  });
  it("the colours are chains with a literal last", () => {
    setup();
    expect(sel("birthday-day").style.color).toBe("var(--ink, var(--color-ink, #2a2622))");
    expect(sel("birthday-day").style.background).toBe("var(--surface, var(--color-card, #ffffff))");
    expect(sel("birthday-day").style.border).toContain("var(--line, var(--color-line, #d9d4cb))");
    expect(sel("birthday-day").style.borderRadius).toBe("var(--r-sm, 7px)");
  });
});
