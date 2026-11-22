import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { SaveStateLine, SAVE_STATE_WORDS } from "./SaveStateLine";

describe("SaveStateLine", () => {
  test("nothing at idle", () => {
    const { container } = render(<SaveStateLine state="idle" error={null} />);
    expect(container.innerHTML).toBe("");
  });
  test.each([
    ["pending", "Not saved yet…"],
    ["saving", "Saving…"],
    ["saved", "Saved"],
  ] as const)("%s says its word, politely announced, with its class", (state, word) => {
    render(<SaveStateLine state={state} error={null} />);
    const p = screen.getByText(word);
    expect(p.tagName).toBe("P");
    expect(p.getAttribute("aria-live")).toBe("polite");
    expect(p.getAttribute("role")).toBeNull();
    expect(p.getAttribute("data-save-state")).toBe(state);
    expect(p.className).toBe(`autosave-line autosave-line--${state}`);
  });
  test("invalid is an alert with its word", () => {
    render(<SaveStateLine state="invalid" error={null} />);
    const p = screen.getByRole("alert");
    expect(p.textContent).toBe(SAVE_STATE_WORDS.invalid);
    expect(p.getAttribute("data-save-state")).toBe("invalid");
    expect(p.className).toBe("autosave-line autosave-line--invalid");
  });
  test("error shows the message verbatim and Try again calls onRetry", () => {
    const onRetry = vi.fn();
    render(<SaveStateLine state="error" error="Refused by the vault" onRetry={onRetry} />);
    const p = screen.getByRole("alert");
    expect(p.getAttribute("data-save-state")).toBe("error");
    expect(p.textContent).toContain("Not saved: Refused by the vault");
    const b = screen.getByRole("button", { name: "Try again" });
    expect(b.getAttribute("type")).toBe("button");
    fireEvent.click(b);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  test("error without onRetry has no button", () => {
    render(<SaveStateLine state="error" error="x" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  test("words override, and testId names the line", () => {
    render(<SaveStateLine state="saved" error={null} words={{ saved: "Gespeichert" }} testId="fruit" />);
    expect(screen.getByTestId("fruit-save-state").textContent).toBe("Gespeichert");
  });
  test("a reworded error and retry are used", () => {
    render(<SaveStateLine state="error" error="e" onRetry={() => {}} words={{ error: "Fehler", retry: "Nochmal" }} />);
    expect(screen.getByRole("alert").textContent).toContain("Fehler: e");
    expect(screen.getByRole("button", { name: "Nochmal" })).toBeTruthy();
  });
  test("the error state has no axe violations", async () => {
    render(<SaveStateLine state="error" error="Refused by the vault" onRetry={() => {}} />);
    const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
