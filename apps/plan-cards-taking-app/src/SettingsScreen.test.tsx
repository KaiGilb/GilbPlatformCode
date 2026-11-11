// The Settings form's buttons are in the Mac order (RuleUiActionRowMacOrder): Cancel, then "Save settings" rightmost.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "./SettingsScreen";

afterEach(cleanup);

describe("SettingsScreen action row", () => {
  it("puts Cancel before Save settings, right-aligned", () => {
    render(<SettingsScreen initial={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    const row = document.querySelector("[data-plan-button-row]") as HTMLElement;
    expect([...row.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Cancel", "Save settings"]);
    expect(row.style.justifyContent).toBe("flex-end");
    expect(row.querySelector("button[type=submit]")!.textContent).toBe("Save settings");
  });
  it("has only Save settings when there is nothing to cancel", () => {
    render(<SettingsScreen initial={null} onSave={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Save settings"]);
  });
});
