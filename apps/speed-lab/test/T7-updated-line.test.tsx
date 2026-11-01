import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ANN, boot, click } from "./helpers";

describe("T7 updated line", () => {
  test("T7 updated line: Updating… while a revalidation runs, then Updated HH:MM", async () => {
    const k = await boot();
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    await waitFor(() => expect(screen.getByTestId("updated-line").textContent).toMatch(/^Updated \d\d:\d\d$/));

    const release = k.platform.hold(ANN);
    click("refresh");
    await waitFor(() => expect(screen.getByTestId("updated-line").textContent).toBe("Updating…"));
    expect(screen.getByTestId("entry-e1")).toBeTruthy(); // the rows stay while it asks
    release();
    await waitFor(() => expect(screen.getByTestId("updated-line").textContent).toMatch(/^Updated \d\d:\d\d$/));
  });
});
