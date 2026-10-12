// Renders the shipped Button in jsdom.
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  test("is a button by default, not a submit", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("button");
  });
  test("keeps a type the host passes", () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("type")).toBe("submit");
  });
  test("primary and md by default, with the accent fill and the 44 px floor", () => {
    render(<Button>Go</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-[var(--accent)]");
    expect(cls).toContain("min-h-[44px]");
    expect(cls).toContain("px-4");
  });
  test.each(["sm", "md", "icon"] as const)("size %s keeps the 44 px tap target", (size) => {
    render(<Button size={size}>x</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-[44px]");
  });
  test("danger draws in the bad colour, not the accent", () => {
    render(<Button variant="danger">Delete</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("text-[var(--bad)]");
    expect(cls).not.toContain("bg-[var(--accent)]");
  });
  test("a host class wins over the button's own padding", () => {
    render(<Button className="px-8">Wide</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("px-8");
    expect(cls).not.toContain("px-4");
  });
  test("forwards the ref and the click", () => {
    const ref = createRef<HTMLButtonElement>();
    let clicks = 0;
    render(<Button ref={ref} onClick={() => clicks++}>Tap</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(clicks).toBe(1);
    expect(ref.current).toBe(screen.getByRole("button"));
  });
});
