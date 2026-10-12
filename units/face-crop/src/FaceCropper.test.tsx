// The crop surface, actually rendered.
//
// A source-text grep is no test of a component: a rename defeats it while restoring the defect.
// So the shared component is rendered here, and what is asserted is the BEHAVIOUR:
//   - skipping the crop is a first-class BUTTON that moves you forward, never a cancel;
//   - "use this area" yields a rectangle; "use the whole picture" yields null;
//   - null and "cancelled" are different outcomes reaching different callbacks.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FaceCropper } from "./FaceCropper";

beforeEach(() => {
  // jsdom gives every element a zero-size box, so the component's measure step would never
  // produce a selection. Pin a realistic displayed size so the box maths runs for real.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  if (!("createObjectURL" in URL)) Object.assign(URL, {});
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const blob = (): Blob => new Blob(["x"], { type: "image/jpeg" });

describe("the crop surface", () => {
  it("renders both actions, and skipping is a BUTTON not a cancel", () => {
    render(<FaceCropper source={blob()} onUse={vi.fn()} onCancel={vi.fn()} />);

    // A person may select a crop, or not. The person who does not want to crop must have
    // somewhere to press that moves them forward. If "Use the whole picture" were ever demoted
    // to a link, or removed so that skipping meant cancelling, this goes red.
    const whole = screen.getByRole("button", { name: /use the whole picture/i });
    const area = screen.getByRole("button", { name: /use this area/i });
    const cancel = screen.getByRole("button", { name: /^cancel$/i });
    expect(whole).toBeDefined();
    expect(area).toBeDefined();
    expect(cancel).toBeDefined();
    // Skipping and cancelling are DIFFERENT controls — not the same one wearing two labels.
    expect(whole).not.toBe(cancel);
  });

  it("gives null — a real answer — when the whole picture is chosen", () => {
    const onUse = vi.fn();
    const onCancel = vi.fn();
    render(<FaceCropper source={blob()} onUse={onUse} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /use the whole picture/i }));

    // 🔴 `null` means "use all of it" and still asks the server for a fast picture. It must
    // reach onUse, NOT onCancel — routing it to onCancel is how "(or not)" becomes a dead end.
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith(null);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("gives a rectangle inside the unit square when an area is chosen", () => {
    const onUse = vi.fn();
    render(<FaceCropper source={blob()} onUse={onUse} onCancel={vi.fn()} />);

    fireEvent.load(screen.getByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /use this area/i }));

    expect(onUse).toHaveBeenCalledTimes(1);
    const rect = onUse.mock.calls[0]![0] as { x: number; y: number; width: number; height: number };
    expect(rect).not.toBeNull();
    for (const [k, v] of Object.entries(rect)) {
      expect(Number.isFinite(v), `${k} is finite`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    // On a 400x200 preview the default square is 160px: 0.4 of the width, 0.8 of the height.
    // ⛔ Not equal — a square on screen is NOT square in normalized coordinates unless the
    // picture is square, and faking that would crop a band and cut a chin off.
    expect(rect.width).not.toBeCloseTo(rect.height, 3);
  });

  it("cancelling reaches onCancel and yields no rectangle at all", () => {
    const onUse = vi.fn();
    const onCancel = vi.fn();
    render(<FaceCropper source={blob()} onUse={onUse} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("locks both actions while an upload is in flight", () => {
    render(<FaceCropper source={blob()} busy onUse={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /use the whole picture/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /use this area/i })).toHaveProperty("disabled", true);
  });

  it("says it is a re-cut when entered from an existing face", () => {
    // One surface with two ways in, so this is one component and `mode` changes only the words.
    render(<FaceCropper source="https://example.test/master.jpg" mode="recut" onUse={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: /frame your face again/i })).toBeDefined();
  });

  it("Escape CANCELS — it never silently commits a framing", () => {
    // 🔴 The sheet declares aria-modal="true", which is a promise. Escape did nothing.
    // ⚠ And Escape must reach onCancel, NOT onUse(null): backing out is not the same as
    //   choosing the whole picture, and conflating them commits a decision nobody made.
    const onUse = vi.fn();
    const onCancel = vi.fn();
    render(<FaceCropper source={blob()} onUse={onUse} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("puts focus inside the sheet, so a keyboard user starts in the dialog", () => {
    // Focus lands on the sheet rather than a button, so the heading and the "your original is
    // kept" hint are read before the person is standing on an action.
    const { container } = render(<FaceCropper source={blob()} onUse={vi.fn()} onCancel={vi.fn()} />);
    const sheet = container.querySelector(".gp-crop__sheet");
    expect(document.activeElement).toBe(sheet);
  });

  it("keeps Tab inside the dialog instead of walking into the covered page", () => {
    // Without a trap, Tab leaves the modal into content that is visually covered by the
    // overlay but still reachable — the controls a person cannot see are the ones they land on.
    // jsdom lays nothing out, so every element reads as hidden (offsetParent null); pin it to the
    // parent so the trap sees the controls a browser would.
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
      return this.parentElement;
    });
    const { container } = render(<FaceCropper source={blob()} onUse={vi.fn()} onCancel={vi.fn()} />);
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("moves and resizes the square with the arrow keys, + and -", () => {
    const onUse = vi.fn();
    render(<FaceCropper source={blob()} onUse={onUse} onCancel={vi.fn()} />);
    const box = screen.getByRole("slider");
    // 400 x 200 picture: the starting square is 160 px at (120, 20).
    fireEvent.keyDown(box, { key: "ArrowRight" });
    fireEvent.keyDown(box, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(box, { key: "-" });
    expect(box.style.left).toBe("125px");
    expect(box.style.top).toBe("40px");
    expect(box.style.width).toBe("155px");
    fireEvent.keyDown(box, { key: "+" });
    expect(box.style.width).toBe("160px");
  });

  it("while busy, Escape does not cancel and the arrow keys do not move the square", () => {
    const onCancel = vi.fn();
    render(<FaceCropper source={blob()} busy onUse={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    const box = screen.getByRole("slider");
    const before = box.style.left;
    fireEvent.keyDown(box, { key: "ArrowRight" });
    expect(box.style.left).toBe(before);
  });

  it("keeps focus where the person put it when the host re-renders with a new onCancel", () => {
    const { rerender } = render(<FaceCropper source="https://example.test/m.jpg" onUse={vi.fn()} onCancel={() => {}} />);
    const whole = screen.getByRole("button", { name: /use the whole picture/i });
    whole.focus();
    rerender(<FaceCropper source="https://example.test/m.jpg" onUse={vi.fn()} onCancel={() => {}} />);
    expect(document.activeElement).toBe(whole);
  });

  it("tells the person their original is kept", () => {
    // The original always stays in the vault; the surface where a person hands over a picture
    // is where saying so is worth anything.
    render(<FaceCropper source={blob()} onUse={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/original is kept/i)).toBeDefined();
  });
});
