import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnnotationSaveState, PrivateMarker } from "./index";

afterEach(cleanup);

describe("AnnotationSaveState: the line that says whether what was typed has left the browser", () => {
  const props = { error: null, testId: "t", errorCopy: "Could not save x" };
  it("is silent at idle", () => {
    const { container } = render(<AnnotationSaveState state="idle" {...props} />);
    expect(container.innerHTML).toBe("");
  });
  it.each([
    ["pending", "Not saved yet…"],
    ["saving", "Saving…"],
    ["saved", "Saved"],
  ] as const)("%s says %s, politely announced", (state, words) => {
    render(<AnnotationSaveState state={state} {...props} />);
    const p = screen.getByTestId("t-save-state");
    expect(p.textContent).toBe(words);
    expect(p.getAttribute("data-save-state")).toBe(state);
    expect(p.getAttribute("aria-live")).toBe("polite");
  });
  it("a failure is an alert with the lead-in and the failure's own words, verbatim", () => {
    render(<AnnotationSaveState state="error" error="Annotation 500 — boom" testId="t" errorCopy="Could not save x" />);
    const p = screen.getByRole("alert");
    expect(p.textContent).toBe("Could not save x — Annotation 500 — boom");
    expect(p.getAttribute("data-testid")).toBe("t-save-error");
  });
  it("pending/saving use the accent colour, saved the quiet one, an error the bad one", () => {
    const col = (s: "pending" | "saved" | "error") => {
      const { unmount } = render(<AnnotationSaveState state={s} error="e" {...{ testId: "c", errorCopy: "x" }} />);
      const el = screen.getByTestId(s === "error" ? "c-save-error" : "c-save-state");
      const c = el.getAttribute("style");
      unmount();
      return c;
    };
    expect(col("pending")).toContain("--accent-ink");
    expect(col("saved")).toContain("--ink-faint");
    expect(col("error")).toContain("--bad");
  });
});

describe("PrivateMarker", () => {
  it("says Private, with the marker attribute and the caller's test id", () => {
    render(<PrivateMarker testId="m" />);
    const el = screen.getByTestId("m");
    expect(el.textContent).toBe("Private");
    expect(el.getAttribute("data-private-marker")).toBe("true");
  });
});
