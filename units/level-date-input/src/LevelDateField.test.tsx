import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { YEAR_RANGE_SENTENCE, yearOutOfRange } from "@kaigilb/gilbplatformcode-date-rules";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEVEL_DATE_ERROR_TESTID, LevelDateField, type LevelDateFieldProps } from "./index";

afterEach(cleanup);

function props(extra: Partial<LevelDateFieldProps> = {}): LevelDateFieldProps {
  return { defaultValue: "", showYearError: false, onYearCheck: vi.fn(), onCommit: vi.fn(), onEscape: vi.fn(), ...extra };
}

describe("the markup", () => {
  it("is a label 'Date' around a date input, with the exact classes", () => {
    const r = render(<LevelDateField {...props()} />);
    const label = r.container.querySelector("label")!;
    expect(label.getAttribute("class")).toBe("mt-1 flex items-center gap-1");
    expect(label.querySelector("span")!.textContent).toBe("Date");
    const input = screen.getByLabelText("Date") as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("date");
    expect(input.getAttribute("aria-label")).toBe("Date");
    expect(input.getAttribute("class")).toBe("rounded border border-gray-300 px-1");
    expect(label.contains(input)).toBe(true);
  });
  it("shows the defaultValue", () => {
    render(<LevelDateField {...props({ defaultValue: "2027-06-30" })} />);
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2027-06-30");
  });
  it("is uncontrolled: a new defaultValue without a new key does not change the field; with a new key it does", () => {
    const r = render(<LevelDateField key="a|2027-06-30" {...props({ defaultValue: "2027-06-30" })} />);
    r.rerender(<LevelDateField key="a|2027-06-30" {...props({ defaultValue: "2028-01-01" })} />);
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2027-06-30");
    r.rerender(<LevelDateField key="a|2028-01-01" {...props({ defaultValue: "2028-01-01" })} />);
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2028-01-01");
  });
  it("renders a label and nothing else when the alert is off (a fragment, no wrapper)", () => {
    const r = render(<LevelDateField {...props()} />);
    expect(r.container.children).toHaveLength(1);
    expect(r.container.firstElementChild!.tagName).toBe("LABEL");
  });
});

describe("the year alert", () => {
  it("is absent when showYearError is false", () => {
    render(<LevelDateField {...props({ showYearError: false })} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("plan-date-year-error")).toBeNull();
  });
  it("is a paragraph with role alert, the test id, the classes and the sentence, after the label, when true", () => {
    const r = render(<LevelDateField {...props({ showYearError: true })} />);
    const alert = screen.getByRole("alert");
    expect(alert.tagName).toBe("P");
    expect(alert.getAttribute("data-testid")).toBe("plan-date-year-error");
    expect(alert.getAttribute("class")).toBe("mt-1 text-[var(--danger,#b91c1c)]");
    expect(alert.textContent).toBe("Year must be 1900–2200");
    expect(r.container.children).toHaveLength(2);
    expect(r.container.children[1]).toBe(alert);
  });
  it("the test id constant and the sentence match what is rendered", () => {
    render(<LevelDateField {...props({ showYearError: true })} />);
    expect(LEVEL_DATE_ERROR_TESTID).toBe("plan-date-year-error");
    expect(screen.getByTestId(LEVEL_DATE_ERROR_TESTID).textContent).toBe(YEAR_RANGE_SENTENCE);
  });
});

describe("the events", () => {
  it("Escape calls onEscape once and does not bubble to a parent keydown handler", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    const onCommit = vi.fn();
    const parent = vi.fn();
    render(
      <div onKeyDown={parent}>
        <LevelDateField {...props({ onEscape, onCommit })} />
      </div>,
    );
    screen.getByLabelText("Date").focus();
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("Enter calls onCommit with the typed value and not onEscape; the key reaches the parent", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    const onCommit = vi.fn();
    const parent = vi.fn();
    render(
      <div onKeyDown={parent}>
        <LevelDateField {...props({ onEscape, onCommit })} />
      </div>,
    );
    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "2031-10-27" } });
    input.focus();
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("2031-10-27");
    expect(onEscape).not.toHaveBeenCalled();
    expect(parent).toHaveBeenCalledTimes(1);
  });
  it("Enter on an empty field commits the empty string", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<LevelDateField {...props({ onCommit })} />);
    screen.getByLabelText("Date").focus();
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("");
  });
  it("another key does nothing", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<LevelDateField {...p} />);
    screen.getByLabelText("Date").focus();
    await user.keyboard("{ArrowUp}");
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(p.onEscape).not.toHaveBeenCalled();
  });
  it("blur calls onCommit with the value", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<LevelDateField {...props({ onCommit, defaultValue: "2027-06-30" })} />);
    await user.click(screen.getByLabelText("Date"));
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("2027-06-30");
  });
  it("a change calls onYearCheck(true) for 0202-01-01 and onYearCheck(false) for 2031-10-27, and does not commit", () => {
    const p = props();
    render(<LevelDateField {...p} />);
    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "0202-01-01" } });
    expect(p.onYearCheck).toHaveBeenLastCalledWith(true);
    fireEvent.change(input, { target: { value: "2031-10-27" } });
    expect(p.onYearCheck).toHaveBeenLastCalledWith(false);
    expect(p.onYearCheck).toHaveBeenCalledTimes(2);
    expect(p.onCommit).not.toHaveBeenCalled();
  });
});

// A host-shaped test: the host keeps the alert state, the key and the write decision, as GilbApp's value graph does.
interface Lv {
  id: string;
  qualifier: { when: string };
}
function Host({ onChangeLevels }: { onChangeLevels: (levels: Lv[]) => void }) {
  const [levels] = useState<Lv[]>([{ id: "L1", qualifier: { when: "2027-06-30" } }]);
  const [badYearFor, setBadYearFor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>("L1");
  const commitWhen = (i: number, when: string) => {
    const l = levels[i];
    if (!l || l.qualifier.when === when) return;
    if (when !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(when) || yearOutOfRange(when))) return;
    onChangeLevels(levels.map((x, n) => (n === i ? { ...x, qualifier: { ...x.qualifier, when } } : x)));
  };
  if (!openId) return <p>closed</p>;
  const openAt = 0;
  return (
    <LevelDateField
      key={`${openId}|${levels[openAt]!.qualifier.when}`}
      defaultValue={levels[openAt]!.qualifier.when}
      showYearError={badYearFor === openId}
      onYearCheck={(bad) => setBadYearFor(bad ? openId : null)}
      onCommit={(v) => commitWhen(openAt, v)}
      onEscape={() => setOpenId(null)}
    />
  );
}

describe("in a host that keeps the alert state and the write", () => {
  it("0202 shows 'Year must be 1900–2200' and is not written; a good year clears the alert and is written once", () => {
    const onChange = vi.fn();
    render(<Host onChangeLevels={onChange} />);
    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "0202-10-27" } });
    expect(screen.getByRole("alert").textContent).toBe("Year must be 1900–2200");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2031-10-27" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]![0] as Lv[])[0]!.qualifier.when).toBe("2031-10-27");
  });
  it("Escape closes the host's popover", () => {
    render(<Host onChangeLevels={() => {}} />);
    fireEvent.keyDown(screen.getByLabelText("Date"), { key: "Escape" });
    expect(screen.getByText("closed")).toBeTruthy();
  });
});
