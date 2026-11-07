import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, test } from "vitest";
import { PictureFailureNote } from "./index";

afterEach(cleanup);

const axeIds = async (): Promise<string[]> =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => v.id);

const failure = { kind: "unknown" as const, sentence: "The picture could not be saved.", next: "Try again.", detail: "boom" };

describe("PictureFailureNote", () => {
  test("an alert with the sentence, and the next step in its own span", () => {
    render(<PictureFailureNote failure={failure} />);
    const p = screen.getByRole("alert");
    expect(p.tagName).toBe("P");
    expect(p.className).toBe("picture-failure");
    expect(p.textContent).toBe("The picture could not be saved. Try again.");
    const next = p.querySelector("span.picture-failure-next") as HTMLElement;
    expect(next.textContent).toBe("Try again.");
  });
  test("with a detail: a collapsed Details block that holds it", () => {
    render(<PictureFailureNote failure={failure} />);
    const d = document.querySelector("details.picture-failure-details") as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(screen.getByText("Details")).toBeTruthy();
    expect(d.textContent).toContain("boom");
  });
  test("with a null detail there is no Details block", () => {
    render(<PictureFailureNote failure={{ ...failure, detail: null }} />);
    expect(document.querySelector("details")).toBeNull();
    expect(screen.queryByText("Details")).toBeNull();
  });
  test("an empty detail text is still a detail (it is not null)", () => {
    render(<PictureFailureNote failure={{ ...failure, detail: "" }} />);
    expect(document.querySelector("details")).not.toBeNull();
  });
  test("axe: no violations with and without a detail", async () => {
    render(<PictureFailureNote failure={failure} />);
    expect(await axeIds()).toEqual([]);
    cleanup();
    render(<PictureFailureNote failure={{ ...failure, detail: null }} />);
    expect(await axeIds()).toEqual([]);
  });
});
