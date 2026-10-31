import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { boot, click, sleep } from "./helpers";

describe("T5 prefetch", () => {
  test("T5 prefetch: pointing at Entries from an Entry page with a cold cache sends the records request before any click", async () => {
    vi.stubGlobal("requestIdleCallback", () => 0); // the idle warm never runs: only the pointer can start it
    const k = await boot();
    k.show();
    fireEvent.click(screen.getByTestId("signin-ann"));
    await screen.findByTestId("entry-e1");
    click("nav-entry-e1");
    k.cache.sessionCache.clear(); // a cold cache
    await sleep(20);
    const before = k.proof.requests.records;
    expect(screen.getByText("Loading…")).toBeTruthy(); // the Entry page has nothing to show

    fireEvent.pointerOver(screen.getByTestId("nav-entries")); // no click
    expect(k.proof.requests.records).toBe(before + 1);
    expect(screen.getByTestId("back")).toBeTruthy(); // still on the Entry page: nothing was clicked
  });
});
