// Renders the shipped Card in jsdom.
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";

afterEach(cleanup);

describe("Card", () => {
  test("carries the one card look, shadow included, and merges a host class", () => {
    const { container } = render(
      <Card className="p-4">
        <CardTitle>T</CardTitle>
        <CardContent>c</CardContent>
      </Card>,
    );
    const cls = (container.firstChild as HTMLElement).className;
    for (const c of ["rounded-[var(--r-lg)]", "bg-[var(--surface)]", "border-[var(--line-2)]", "shadow-[var(--shadow-sm)]", "p-4"]) {
      expect(cls).toContain(c);
    }
  });
  test("the title is a heading; the description is a paragraph", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>What this card is for.</CardDescription>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Settings" }).tagName).toBe("H2");
    expect(screen.getByText("What this card is for.").tagName).toBe("P");
  });
  test("a host padding class replaces the content padding instead of adding to it", () => {
    const { container } = render(<CardContent className="p-0">x</CardContent>);
    const cls = (container.firstChild as HTMLElement).className;
    expect(cls).toContain("p-0");
    expect(cls).not.toContain("p-5");
  });
  test("the title is serif and semibold: the family survives the class merge", () => {
    render(<CardTitle className="text-[21px]">Serif</CardTitle>);
    const cls = screen.getByRole("heading", { name: "Serif" }).className;
    expect(cls).toContain("font-[family-name:var(--serif)]");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("text-[21px]");
  });
});
