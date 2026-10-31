import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { boot, click, reload } from "./helpers";

const line = () => screen.getByTestId("start-line").textContent ?? "";

describe("T11 start diagnostics", () => {
  test("T11 start: what `start` answered is in window.__speedProof.start and on one line under the speed panel (hydrated with entries; an empty disk)", async () => {
    const first = await boot();
    first.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    const empty = first.proof.start!;
    expect(empty).toMatchObject({ disk: true, hydrated: false, entries: 0 }); // a disk, nothing on it yet
    expect(Number.isFinite(empty.ms)).toBe(true);
    expect(Number.isNaN(Date.parse(empty.at))).toBe(false);
    expect(line()).toMatch(/^start: disk yes, hydrated no, 0 entries, [\d.]+ ms$/);
    await first.speed.currentPersist()!.flush();

    const second = await reload();
    second.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    expect(second.proof.start).toMatchObject({ disk: true, hydrated: true, entries: 1 }); // the one `entries` copy of Ann's list
    expect(line()).toMatch(/^start: disk yes, hydrated yes, 1 entries, [\d.]+ ms$/);
  });

  test("T11 start: a disk that is slower than waitMs gives hydrated no after the wait", async () => {
    vi.stubGlobal("indexedDB", { open: () => ({}) }); // an open that never answers
    const k = await boot();
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1", undefined, { timeout: 3000 });
    const s = k.proof.start!;
    expect(s).toMatchObject({ disk: false, hydrated: false, entries: 0 });
    expect(s.ms).toBeGreaterThanOrEqual(390); // it waited the 400 ms
    expect(line()).toMatch(/^start: disk no, hydrated no, 0 entries, [\d.]+ ms$/);
  });

  test("T11 start: no disk at all gives disk no, hydrated no, at once", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const k = await boot();
    k.show();
    click("signin-ann");
    await waitFor(() => expect(k.proof.start).not.toBeNull());
    expect(k.proof.start).toMatchObject({ disk: false, hydrated: false, entries: 0 });
    expect(k.proof.start!.ms).toBeLessThan(300);
    await screen.findByTestId("entry-e1");
    expect(line()).toMatch(/^start: disk no, hydrated no, 0 entries, [\d.]+ ms$/);
  });
});
