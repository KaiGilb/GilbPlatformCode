// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SinceBanner } from "./SinceBanner";
import type { VisitChange } from "./visit";

afterEach(cleanup);

const mk = (n: number): VisitChange[] =>
  Array.from({ length: n }, (_, i) => ({ kind: (["added", "changed", "deleted"] as const)[i % 3]!, id: `r${i}`, label: `Thing ${i}`, who: "bob", at: 10_000 - i }));

describe("SinceBanner", () => {
  it("draws nothing when there are no changes", () => {
    const { container } = render(<SinceBanner changes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("is a polite status region with the heading and each change in words", () => {
    render(<SinceBanner changes={mk(3)} now={10_000 + 5 * 60_000} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Since your last visit:");
    expect(region.textContent).toContain("bob added Thing 0 (5 min ago)");
    expect(region.textContent).toContain("bob changed Thing 1");
    expect(region.textContent).toContain("bob deleted Thing 2");
  });

  it("shows three, then +N more opens the rest", async () => {
    render(<SinceBanner changes={mk(5)} />);
    expect(document.querySelectorAll("[data-since-item]")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(document.querySelectorAll("[data-since-item]")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("dismiss calls onDismiss once and hides the banner", async () => {
    const onDismiss = vi.fn();
    render(<SinceBanner changes={mk(1)} onDismiss={onDismiss} />);
    const btn = screen.getByRole("button", { name: "Dismiss" });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismiss works without onDismiss", async () => {
    render(<SinceBanner changes={mk(1)} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("words can be replaced, and shown can be changed", () => {
    render(<SinceBanner changes={mk(2)} shown={1} words={{ heading: "Depuis:", dismiss: "Fermer", more: (n) => `${n} de plus`, added: "a ajouté" }} />);
    expect(screen.getByText("Depuis:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 de plus" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("bob a ajouté Thing 0");
  });
});
