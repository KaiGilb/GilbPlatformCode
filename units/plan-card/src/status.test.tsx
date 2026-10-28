// The Status line: add a line, change its word and its date, the older lines kept as Past, and the sentence when a line repeats.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeApp, mountCard } from "../test/app";
import { settle } from "../test/helpers";

const STATUS_DUP = "That status is already recorded for that date.";

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T12:00:00") }));
afterEach(() => vi.useRealTimers());

function setup(statuses: { s: string; w: string }[] = [], mode: "legacy" | "view" | "edit" = "legacy") {
  const app = makeApp({ ifMatch: true });
  const served = statuses.length ? { levelStatements: statuses.map((x) => ({ "a:status": x.s, "a:statusWhen": x.w })) } : {};
  const row = app.seed("fn1", "t:Function", { unitTag: "Content.Measure", ...served });
  const notices: (string | null)[] = [];
  mountCard(app, row, { mode, onNotice: (n) => notices.push(n) });
  return { app, notices, user: userEvent.setup({ advanceTimers: () => {} }) };
}
const bodies = (app: ReturnType<typeof makeApp>) => app.server.log.map((w) => w.body);
const statusGroup = () => document.querySelector('[data-group="plan-status"]') as HTMLElement;

describe("adding a status", () => {
  test("with none yet, the first line is Planned, dated today", async () => {
    const { app, user } = setup();
    expect(statusGroup().textContent).toContain("No status yet");
    await user.click(screen.getByRole("button", { name: "+ New status" }));
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(bodies(app)[0]).toEqual({ levelStatements: [{ "a:status": "Planned", "a:statusWhen": "2026-10-28" }] });
    expect(app.server.log[0]!.ifMatch).toBe('"v1"');
  });

  test("the new line is the next word after the current Status, and the old Status becomes Past", async () => {
    const { app, user } = setup([{ s: "Planned", w: "2026-10-01" }]);
    await user.click(screen.getByRole("button", { name: "+ New status" }));
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(bodies(app)[0]).toEqual({
      levelStatements: [
        { "a:status": "Planned", "a:statusWhen": "2026-10-01" },
        { "a:status": "Developed", "a:statusWhen": "2026-10-28" },
      ],
    });
    await waitFor(() => expect(statusGroup().textContent).toContain("Status [2026-10-28] Developed"));
    expect(statusGroup().textContent).toContain("Past [2026-10-01] Planned");
  });

  test("the last word stays the last word", async () => {
    const { app, user } = setup([{ s: "Retired", w: "2026-10-01" }]);
    await user.click(screen.getByRole("button", { name: "+ New status" }));
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    const lines = (bodies(app)[0] as { levelStatements: { "a:status": string }[] }).levelStatements;
    expect(lines.map((l) => l["a:status"])).toEqual(["Retired", "Retired"]);
  });

  test("a line that repeats the same word on the same date is refused with a sentence, and nothing is written", async () => {
    const { app, user } = setup([{ s: "Retired", w: "2026-10-28" }]);
    await user.click(screen.getByRole("button", { name: "+ New status" }));
    expect((await screen.findByRole("alert")).textContent).toBe(STATUS_DUP);
    await settle();
    expect(app.server.log).toEqual([]);
  });

  test("a press made by a script (detail 0) twice in one turn adds one line; a person's presses each add one", async () => {
    const { app, user } = setup([{ s: "Planned", w: "2026-10-01" }]);
    const button = screen.getByRole("button", { name: "+ New status" });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    await settle();
    expect(bodies(app)).toHaveLength(1);
    expect((bodies(app)[0] as { levelStatements: unknown[] }).levelStatements).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "+ New status" }));
    await waitFor(() => expect(bodies(app)).toHaveLength(2));
    expect((bodies(app)[1] as { levelStatements: unknown[] }).levelStatements).toHaveLength(3);
  });
});

describe("changing the current status", () => {
  test("another word is one patch, the older lines kept", async () => {
    const { app, user } = setup([
      { s: "Planned", w: "2026-10-01" },
      { s: "Developed", w: "2026-10-10" },
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "In-Production");
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(bodies(app)[0]).toEqual({
      levelStatements: [
        { "a:status": "Planned", "a:statusWhen": "2026-10-01" },
        { "a:status": "In-Production", "a:statusWhen": "2026-10-10" },
      ],
    });
  });

  test("a word the list does not have is kept as the first choice", async () => {
    const { user } = setup([{ s: "Mothballed", w: "2026-10-01" }]);
    const select = screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["Mothballed", "Planned", "Developed", "In-Production", "Retired"]);
    expect(select.value).toBe("Mothballed");
    expect(user).toBeTruthy();
  });

  test("a date is saved when the field is left, not at each digit", async () => {
    const { app } = setup([{ s: "Planned", w: "2026-10-01" }]);
    const input = screen.getByLabelText("Status date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-10-15" } });
    await settle();
    expect(app.server.log).toEqual([]);
    expect(input.value).toBe("2026-10-15");
    fireEvent.blur(input);
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(bodies(app)[0]).toEqual({ levelStatements: [{ "a:status": "Planned", "a:statusWhen": "2026-10-15" }] });
  });

  test("Enter saves the date too", async () => {
    const { app } = setup([{ s: "Planned", w: "2026-10-01" }]);
    const input = screen.getByLabelText("Status date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-11-02" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect((bodies(app)[0] as { levelStatements: { "a:statusWhen": string }[] }).levelStatements[0]!["a:statusWhen"]).toBe("2026-11-02");
  });

  test.each([["", "empty"], ["2026-1", "half typed"], ["2026-02-30", "not a day on the calendar"], ["2026-13-01", "no such month"]])(
    "%j (%s) is not saved",
    async (value) => {
      const { app } = setup([{ s: "Planned", w: "2026-10-01" }]);
      const input = screen.getByLabelText("Status date") as HTMLInputElement;
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      await settle();
      expect(app.server.log).toEqual([]);
    },
  );

  test("a date the line already has is not written", async () => {
    const { app } = setup([{ s: "Planned", w: "2026-10-01" }]);
    const input = screen.getByLabelText("Status date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-10-01" } });
    fireEvent.blur(input);
    await settle();
    expect(app.server.log).toEqual([]);
  });

  test("a date earlier than an older line puts the lines in date order: the newest date becomes the Status (the last line stored)", async () => {
    const { app } = setup([
      { s: "Planned", w: "2026-10-01" },
      { s: "Developed", w: "2026-10-10" },
    ]);
    const input = screen.getByLabelText("Status date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-09-01" } });
    fireEvent.blur(input);
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(bodies(app)[0]).toEqual({
      levelStatements: [
        { "a:status": "Developed", "a:statusWhen": "2026-09-01" },
        { "a:status": "Planned", "a:statusWhen": "2026-10-01" },
      ],
    });
    await waitFor(() => expect(statusGroup().textContent).toContain("Status [2026-10-01] Planned"));
  });

  test("the line key the editor keeps on a line never reaches the vault", async () => {
    const { app } = setup([{ s: "Planned", w: "2026-10-01" }]);
    const input = screen.getByLabelText("Status date") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-10-15" } });
    fireEvent.blur(input);
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(JSON.stringify(bodies(app)[0])).not.toContain("lineKey");
  });
});

describe("the older lines", () => {
  test("a Past line is removed with its ×, in Edit", async () => {
    const { app, user } = setup([
      { s: "Planned", w: "2026-10-01" },
      { s: "Developed", w: "2026-10-10" },
    ]);
    await user.click(screen.getByRole("button", { name: "Delete past 2026-10-01 Planned" }));
    await waitFor(() => expect(bodies(app)).toHaveLength(1));
    expect(bodies(app)[0]).toEqual({ levelStatements: [{ "a:status": "Developed", "a:statusWhen": "2026-10-10" }] });
  });
});

describe("in view mode", () => {
  test("the Status is a button that opens its editor for a person who may write, and the + New status line is not offered", async () => {
    const { user } = setup([{ s: "Planned", w: "2026-10-01" }], "view");
    expect(screen.queryByRole("button", { name: "+ New status" })).toBeNull();
    expect(screen.queryByLabelText("Status date")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByLabelText("Status date")).toBeTruthy();
  });

  test("Escape closes the editor; so does a press outside the group", async () => {
    const { user } = setup([{ s: "Planned", w: "2026-10-01" }], "view");
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByLabelText("Status date")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Status date")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByLabelText("Status date")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("Status date")).toBeNull();
  });
});
