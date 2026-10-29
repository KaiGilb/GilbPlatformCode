// The picker branches of the field row, pinned alone: with no host pickers the row is a text box (as in 0.1.0), with them the
// picker is drawn at the same place with the same arguments; the birthday picker is a peer and needs no host.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { openPortalRoots } from "@kaigilb/gilbplatformcode-open-popups";
import { FieldPickersProvider, FieldRow, useFieldPickers, type FieldPickerProps, type FieldPickers } from "./index";

afterEach(() => {
  cleanup();
  openPortalRoots.length = 0;
  document.body.innerHTML = "";
});

const inCard = (ui: ReactNode) => <CardModeProvider canEdit>{ui}</CardModeProvider>;
const withPickers = (pickers: FieldPickers, ui: ReactNode) => inCard(<FieldPickersProvider pickers={pickers}>{ui}</FieldPickersProvider>);

/** A fake picker that records the props it was given and shows three buttons. */
function fake(name: string, seen: FieldPickerProps[]) {
  return function Fake(props: FieldPickerProps) {
    seen.push(props);
    return (
      <div data-testid={`picker-${name}`}>
        <button onClick={() => props.onPick("picked")}>pick</button>
        <button onClick={() => props.onPick(props.value.trim())}>pick-same</button>
        <button onClick={props.onCancel}>cancel</button>
        <button onClick={props.onClear}>clear</button>
      </div>
    );
  };
}

describe("with no host pickers", () => {
  it("useFieldPickers answers an empty object", () => {
    expect(renderHook(() => useFieldPickers()).result.current).toEqual({});
  });
  it.each(["contact-language", "time-zone"] as const)("a %s row edits as a text box", (picker) => {
    render(inCard(<FieldRow label="Language" value="nb" picker={picker} initialEditing onCommitValue={() => {}} />));
    expect(screen.getByRole("textbox", { name: "Edit Language" })).toBeTruthy();
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
  });
  it.each(["contact-language", "time-zone"] as const)("a %s row shows the stored value as it is", (picker) => {
    render(inCard(<FieldRow label="Language" value="nb-NO" picker={picker} onCommitValue={() => {}} />));
    expect(screen.getByRole("button", { name: "Edit Language" }).textContent).toBe("nb-NO");
  });
  it("a row with picker null is the text box", () => {
    render(inCard(<FieldRow label="Web" value="x" picker={null} initialEditing onCommitValue={() => {}} />));
    expect(screen.getByRole("textbox", { name: "Edit Web" })).toBeTruthy();
  });
});

describe("the birthday picker, a peer", () => {
  it("is drawn with no host pickers, with the label and the stored value", () => {
    render(inCard(<FieldRow label="Birthday" value="1961-03-14" picker="birthday" initialEditing onCommitValue={() => {}} />));
    const group = screen.getByTestId("birthday-picker");
    expect(group.getAttribute("aria-label")).toBe("Birthday");
    expect(screen.getByTestId("birthday-picker-current").textContent).toContain("14 March 1961");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("shows the stored value in words, and an odd value as stored", () => {
    const { rerender } = render(inCard(<FieldRow label="Birthday" value="--03-14" picker="birthday" onCommitValue={() => {}} />));
    expect(screen.getByRole("button", { name: "Edit Birthday" }).textContent).toBe("14 March");
    rerender(inCard(<FieldRow label="Birthday" value="soon" picker="birthday" onCommitValue={() => {}} />));
    expect(screen.getByRole("button", { name: "Edit Birthday" }).textContent).toBe("soon");
  });
  it("commits the master's shape on Save and closes", () => {
    const commit = vi.fn();
    render(inCard(<FieldRow label="Birthday" value="" picker="birthday" initialEditing onCommitValue={commit} />));
    fireEvent.change(screen.getByTestId("birthday-day"), { target: { value: "14" } });
    fireEvent.change(screen.getByTestId("birthday-month"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("birthday-save"));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("--03-14");
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
  });
  it("does not commit a pick equal to the stored value", () => {
    const commit = vi.fn();
    render(inCard(<FieldRow label="Birthday" value="--03-14" picker="birthday" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByTestId("birthday-save"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
  });
  it("Clear commits an empty value when a value is stored", () => {
    const commit = vi.fn();
    render(inCard(<FieldRow label="Birthday" value="--03-14" picker="birthday" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByTestId("birthday-clear"));
    expect(commit).toHaveBeenCalledWith("");
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
  });
  it("Cancel closes without a commit", () => {
    const commit = vi.fn();
    render(inCard(<FieldRow label="Birthday" value="--03-14" picker="birthday" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByTestId("birthday-cancel"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
  });
});

describe("with host pickers", () => {
  it("draws the contact-language picker with the row's label and value, not the time-zone one", () => {
    const lang: FieldPickerProps[] = [];
    const zone: FieldPickerProps[] = [];
    render(withPickers({ ContactLanguagePicker: fake("lang", lang), TimeZonePicker: fake("zone", zone) }, <FieldRow label="Language" value=" nb " picker="contact-language" initialEditing onCommitValue={() => {}} />));
    expect(screen.getByTestId("picker-lang")).toBeTruthy();
    expect(screen.queryByTestId("picker-zone")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(lang[0]).toMatchObject({ label: "Language", value: " nb " });
    expect(zone).toHaveLength(0);
  });
  it("draws the time-zone picker, not the contact-language one", () => {
    const lang: FieldPickerProps[] = [];
    const zone: FieldPickerProps[] = [];
    render(withPickers({ ContactLanguagePicker: fake("lang", lang), TimeZonePicker: fake("zone", zone) }, <FieldRow label="Time zone" value="" picker="time-zone" initialEditing onCommitValue={() => {}} />));
    expect(screen.getByTestId("picker-zone")).toBeTruthy();
    expect(screen.queryByTestId("picker-lang")).toBeNull();
    expect(zone[0]).toMatchObject({ label: "Time zone", value: "" });
  });
  it("a pick commits and closes; a pick equal to the trimmed stored value commits nothing", () => {
    const commit = vi.fn();
    const { unmount } = render(withPickers({ TimeZonePicker: fake("zone", []) }, <FieldRow label="Zone" value=" Europe/Oslo " picker="time-zone" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByText("pick"));
    expect(commit).toHaveBeenCalledWith("picked");
    expect(screen.queryByTestId("picker-zone")).toBeNull();
    unmount();
    commit.mockClear();
    render(withPickers({ TimeZonePicker: fake("zone", []) }, <FieldRow label="Zone" value=" Europe/Oslo " picker="time-zone" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByText("pick-same"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("picker-zone")).toBeNull();
  });
  it("Clear commits an empty value only when a value is stored; Cancel commits nothing", () => {
    const commit = vi.fn();
    const { unmount } = render(withPickers({ ContactLanguagePicker: fake("lang", []) }, <FieldRow label="Language" value="nb" picker="contact-language" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByText("clear"));
    expect(commit).toHaveBeenCalledWith("");
    unmount();
    commit.mockClear();
    const empty = render(withPickers({ ContactLanguagePicker: fake("lang", []) }, <FieldRow label="Language" value="  " picker="contact-language" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByText("clear"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("picker-lang")).toBeNull();
    empty.unmount();
    render(withPickers({ ContactLanguagePicker: fake("lang", []) }, <FieldRow label="Language" value="nb" picker="contact-language" initialEditing onCommitValue={commit} />));
    fireEvent.click(screen.getByText("cancel"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("picker-lang")).toBeNull();
  });
  it("shows the stored value through the host's display member, per picker", () => {
    const pickers: FieldPickers = {
      ContactLanguagePicker: fake("lang", []),
      TimeZonePicker: fake("zone", []),
      contactLanguageDisplay: (v) => `lang:${v}`,
      timeZoneDisplay: (v) => `zone:${v}`,
    };
    render(withPickers(pickers, <><FieldRow label="L" value="nb" picker="contact-language" onCommitValue={() => {}} /><FieldRow label="Z" value="UTC" picker="time-zone" onCommitValue={() => {}} /><FieldRow label="W" value="plain" onCommitValue={() => {}} /></>));
    expect(screen.getByRole("button", { name: "Edit L" }).textContent).toBe("lang:nb");
    expect(screen.getByRole("button", { name: "Edit Z" }).textContent).toBe("zone:UTC");
    expect(screen.getByRole("button", { name: "Edit W" }).textContent).toBe("plain");
  });
  it("a picker member without a display member shows the value as stored", () => {
    render(withPickers({ ContactLanguagePicker: fake("lang", []) }, <FieldRow label="L" value="nb" picker="contact-language" onCommitValue={() => {}} />));
    expect(screen.getByRole("button", { name: "Edit L" }).textContent).toBe("nb");
  });
  it("a display member without its picker member changes nothing: the row is a text box, shown as stored", () => {
    const display = vi.fn((v: string) => `lang:${v}`);
    render(withPickers({ contactLanguageDisplay: display }, <FieldRow label="L" value="nb" picker="contact-language" onCommitValue={() => {}} />));
    expect(screen.getByRole("button", { name: "Edit L" }).textContent).toBe("nb");
    expect(display).not.toHaveBeenCalled();
  });
  it("only the other picker supplied: the row is a text box", () => {
    render(withPickers({ TimeZonePicker: fake("zone", []) }, <FieldRow label="L" value="nb" picker="contact-language" initialEditing onCommitValue={() => {}} />));
    expect(screen.getByRole("textbox", { name: "Edit L" })).toBeTruthy();
    expect(screen.queryByTestId("picker-zone")).toBeNull();
  });
  it("the nearest provider wins", () => {
    const outer: FieldPickerProps[] = [];
    const inner: FieldPickerProps[] = [];
    render(withPickers({ TimeZonePicker: fake("outer", outer) }, <FieldPickersProvider pickers={{ TimeZonePicker: fake("inner", inner) }}><FieldRow label="Z" value="" picker="time-zone" initialEditing onCommitValue={() => {}} /></FieldPickersProvider>));
    expect(screen.getByTestId("picker-inner")).toBeTruthy();
    expect(outer).toHaveLength(0);
  });
  it("an editor that is not open draws no picker", () => {
    render(withPickers({ TimeZonePicker: fake("zone", []) }, <FieldRow label="Z" value="UTC" picker="time-zone" onCommitValue={() => {}} />));
    expect(screen.queryByTestId("picker-zone")).toBeNull();
  });
  it("a click on the value opens the picker", () => {
    render(withPickers({ TimeZonePicker: fake("zone", []) }, <FieldRow label="Z" value="UTC" picker="time-zone" onCommitValue={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: "Edit Z" }));
    expect(screen.getByTestId("picker-zone")).toBeTruthy();
  });
});
