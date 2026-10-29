// The birthday picker: day + month required, year optional, a real picker (no free text); an impossible
// day is refused; the stored shape is exactly the master's ("1961-03-14" or "--03-14").
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BIRTHDAY_WORDS, BirthdayPicker } from "./index";

afterEach(cleanup);

/** The ink colour the picker paints with (`T.ink` in BirthdayPicker.tsx). */
const INK = "var(--ink, var(--color-ink, #2a2622))";

const sel = (id: string) => screen.getByTestId(id) as HTMLSelectElement;
const pick = (id: string, v: string | number) => fireEvent.change(sel(id), { target: { value: String(v) } });
const save = () => screen.getByTestId("birthday-save") as HTMLButtonElement;

function setup(value = "", extra: Partial<Parameters<typeof BirthdayPicker>[0]> = {}) {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  const onClear = vi.fn();
  render(<BirthdayPicker label="Birthday" value={value} onPick={onPick} onCancel={onCancel} onClear={onClear} locale="en-GB" thisYear={2026} {...extra} />);
  return { onPick, onCancel, onClear };
}

describe("BirthdayPicker", () => {
  it("is three lists, no text box: day, month (named in the locale) and year with 'No year' first", () => {
    setup();
    expect(screen.getByRole("group", { name: "Birthday" })).toBeTruthy();
    expect(screen.getByTestId("birthday-picker").querySelector("input")).toBeNull();
    expect([...sel("birthday-day").options].map((o) => o.textContent)).toEqual([BIRTHDAY_WORDS.pickDay, ...Array.from({ length: 31 }, (_, i) => String(i + 1))]);
    expect([...sel("birthday-month").options].slice(1).map((o) => o.textContent)).toEqual([
      "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    ]);
    const years = [...sel("birthday-year").options].map((o) => o.textContent);
    expect(years[0]).toBe(BIRTHDAY_WORDS.noYear);
    expect(years[1]).toBe("2026");
    expect(years.at(-1)).toBe("1900");
  });

  it("names the months in the reader's language", () => {
    setup("", { locale: "nb" });
    expect(sel("birthday-month").options[3]!.textContent).toBe("mars");
  });

  it("needs the day and the month: Save is off until both are picked", () => {
    const { onPick } = setup();
    expect(save().disabled).toBe(true);
    expect(screen.getByTestId("birthday-need-day-month").textContent).toBe(BIRTHDAY_WORDS.needDayMonth);
    pick("birthday-day", 14);
    expect(save().disabled).toBe(true);
    pick("birthday-month", 3);
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(onPick).toHaveBeenCalledWith("--03-14");
  });

  it("with a year, stores the full date", () => {
    const { onPick } = setup();
    pick("birthday-day", 14);
    pick("birthday-month", 3);
    pick("birthday-year", 1980);
    fireEvent.click(save());
    expect(onPick).toHaveBeenCalledWith("1980-03-14");
  });

  it("refuses 31 February and 29 February of a common year, in words; allows 29 February with no year or in a leap year", () => {
    const { onPick } = setup();
    pick("birthday-day", 31);
    pick("birthday-month", 2);
    expect(save().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("There is no 31 February.");
    fireEvent.click(save());
    pick("birthday-day", 29);
    expect(save().disabled).toBe(false);
    pick("birthday-year", 2023);
    expect(save().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("There is no 29 February 2023.");
    pick("birthday-year", 2024);
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("2024-02-29");
  });

  it("refuses 31 April", () => {
    setup();
    pick("birthday-day", 31);
    pick("birthday-month", 4);
    expect(save().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("There is no 31 April.");
  });

  it("opens on the stored value and says it; a year outside the list is kept", () => {
    setup("1890-12-01");
    expect(sel("birthday-day").value).toBe("1");
    expect(sel("birthday-month").value).toBe("12");
    expect(sel("birthday-year").value).toBe("1890");
    expect(screen.getByTestId("birthday-picker-current").textContent).toBe("Now: 1 December 1890");
  });

  it("an odd stored value is shown as stored, never read as a date, and the lists start empty", () => {
    const { onPick } = setup("14th of March");
    expect(screen.getByTestId("birthday-picker-current").textContent).toBe(BIRTHDAY_WORDS.unreadable("14th of March"));
    expect(sel("birthday-day").value).toBe("");
    expect(sel("birthday-month").value).toBe("");
    expect(save().disabled).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("Enter saves, Escape cancels; Clear only when something is stored", () => {
    const a = setup("--03-14");
    fireEvent.keyDown(sel("birthday-day"), { key: "Enter" });
    expect(a.onPick).toHaveBeenCalledWith("--03-14");
    fireEvent.keyDown(sel("birthday-month"), { key: "Escape" });
    expect(a.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("birthday-clear"));
    expect(a.onClear).toHaveBeenCalledTimes(1);
    cleanup();
    setup("");
    expect(screen.queryByTestId("birthday-clear")).toBeNull();
  });

  it("every control keeps the 44 px touch floor", () => {
    setup("--03-14");
    for (const id of ["birthday-day", "birthday-month", "birthday-year", "birthday-save", "birthday-cancel", "birthday-clear"]) {
      expect((screen.getByTestId(id) as HTMLElement).style.minHeight, id).toBe("44px");
    }
  });

  // Enter must not save a day that does not exist, or a day and month not yet picked.
  it("Enter on an impossible day saves nothing and leaves the picker open (31 February, 29 February 2023, 31 April)", () => {
    const { onPick, onCancel } = setup();
    // The picker's own guard must stop it, not an exception thrown further down (that would show as an uncaught error).
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener("error", onError);
    pick("birthday-day", 31);
    pick("birthday-month", 2);
    fireEvent.keyDown(sel("birthday-day"), { key: "Enter" });
    fireEvent.keyDown(sel("birthday-month"), { key: "Enter" });
    fireEvent.keyDown(sel("birthday-year"), { key: "Enter" });
    pick("birthday-day", 29);
    pick("birthday-year", 2023);
    fireEvent.keyDown(sel("birthday-year"), { key: "Enter" });
    pick("birthday-day", 31);
    pick("birthday-month", 4);
    pick("birthday-year", "");
    fireEvent.keyDown(sel("birthday-day"), { key: "Enter" });
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("birthday-picker")).toBeTruthy();
    // positive control: the same keys save a real day
    pick("birthday-day", 30);
    fireEvent.keyDown(sel("birthday-day"), { key: "Enter" });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("--04-30");
  });

  it("Enter before the day and month are picked saves nothing", () => {
    const { onPick } = setup();
    fireEvent.keyDown(sel("birthday-day"), { key: "Enter" });
    pick("birthday-day", 14);
    fireEvent.keyDown(sel("birthday-day"), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });

  // The live Save button is drawn in the text colour (and bold), never in a brand colour whose contrast the picker cannot
  // know (a teal brand colour on a card was 3.26:1). The text colour is the one pair every theme already keeps readable.
  it("Save is drawn in the ink colour, not an accent colour", () => {
    setup();
    pick("birthday-day", 14);
    pick("birthday-month", 3);
    expect(save().style.color).toContain("--ink");
    expect(save().style.color).not.toContain("accent");
    expect(save().style.color).not.toContain("primary");
  });

  // The impossible-day message and Clear were --bad. In the colour-blind theme that is 3.54:1 on the card.
  // Both are the ink colour (the pair every theme already keeps at 4.5:1). Weight, not a new word, marks the warning.
  it("an impossible day is said in the ink colour, not the bad colour", () => {
    setup();
    pick("birthday-day", 31);
    pick("birthday-month", 2);
    const msg = screen.getByTestId("birthday-no-such-day") as HTMLElement;
    expect(msg.textContent).toBe("There is no 31 February.");
    expect(msg.style.color).toBe(INK);
    expect(msg.style.color).not.toContain("--bad");
    expect(msg.style.fontWeight).toBe("600");
  });

  it("Clear is drawn in the ink colour", () => {
    setup("1961-03-14");
    const clear = screen.getByTestId("birthday-clear") as HTMLButtonElement;
    expect(clear.style.color).toBe(INK);
    expect(clear.style.color).not.toContain("--bad");
    expect(clear.style.textDecoration).toContain("underline");
  });

  it("the picker source does not use T.bad", () => {
    const src = readFileSync(`${process.cwd()}/src/BirthdayPicker.tsx`, "utf8");
    expect(src).not.toContain("T.bad");
  });
});
