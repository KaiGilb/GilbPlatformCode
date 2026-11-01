import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { decideSource } from "../src/source";
import { ANN, boot, click, dumpDevice, panel, reload } from "./helpers";

const rows = () => screen.getAllByTestId(/^entry-e\d+$/);
const line = () => screen.getByTestId("updated-line").textContent;
/** Ann with 500 entries: the walk is three pages; the first two requests (head, page 1) answer and the rest wait or fail. */
const big = () => history.replaceState(null, "", "/?latency=0&entries=500");

/** Holds the device read for `ms` by keeping a readwrite transaction open on the app's database (as the F4 script does). */
async function holdDisk(ms: number, name = "speedkittaking-cache") {
  const req = indexedDB.open(name);
  const db = await new Promise<IDBDatabase>((res) => { req.onsuccess = () => res(req.result); });
  const os = db.transaction(["meta", "data"], "readwrite").objectStore("data");
  const t0 = performance.now();
  const spin = () => { if (performance.now() - t0 < ms) os.get("x").onsuccess = spin; };
  spin();
}

describe("P first page early", () => {
  test("P1 preview: the first page shows before the full answer with 'at least N', and the full answer replaces it", async () => {
    big();
    const k = await boot();
    const release = k.platform.holdAfter(ANN, 2);
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    expect(rows()).toHaveLength(200);
    expect(line()).toBe("Updating… showing at least 200 entries so far");
    await waitFor(() => expect(panel().dataset.source).toBe("preview"));
    expect(k.proof.lastPaint?.fullMs).toBeUndefined(); // not the whole list yet
    release();
    await waitFor(() => expect(rows()).toHaveLength(500), { timeout: 3000 });
    await waitFor(() => expect(line()).toMatch(/^Updated \d\d:\d\d$/));
    await waitFor(() => expect(k.proof.lastPaint?.fullMs).toBeGreaterThan(0));
    expect(panel().dataset.source).toBe("preview"); // the reading is of the FIRST rows
  });

  test("P2 error after a preview: the rows stay with the 'could not load the rest' line", async () => {
    big();
    const k = await boot();
    k.platform.failAfter(ANN, 2);
    k.show();
    click("signin-ann");
    await screen.findByTestId("partial-error");
    expect(screen.getByTestId("partial-error").textContent).toMatch(/^Showing at least 200 entries; could not load the rest: .+/);
    expect(rows()).toHaveLength(200);
    expect(screen.getByTestId("refresh")).toBeTruthy(); // Refresh stays
  });

  test("P3 entry page: an id beyond the preview says 'Loading…', never 'not found'; after the full list it is found, and a missing id is said to be missing", async () => {
    big();
    const k = await boot();
    const release = k.platform.holdAfter(ANN, 2);
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    const { EntryPage } = await import("../src/screens/Entry");
    render(<div data-testid="beyond"><EntryPage ws={ANN} client={k.session.client!} id="e300" onBack={() => undefined} /></div>);
    render(<div data-testid="absent"><EntryPage ws={ANN} client={k.session.client!} id="e900" onBack={() => undefined} /></div>);
    expect(screen.getByTestId("beyond").textContent).toContain("Loading…");
    expect(screen.getByTestId("absent").textContent).toContain("Loading…");
    expect(document.body.textContent).not.toMatch(/no entry|not found/i);
    release();
    await waitFor(() => expect(screen.getByTestId("beyond").textContent).toContain("Ann entry 300"), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId("absent").textContent).toContain("No entry e900 in the list."));
  });

  test("P4 source label: each of memory, device, device arriving late, preview and network is named when the first rows are seen", async () => {
    // the rule (network: the first rows are the full answer, which now only happens when no preview was shown)
    expect(decideSource({ hadRowsAtMount: false, partial: true, fromDevice: false })).toBe("preview");
    expect(decideSource({ hadRowsAtMount: true, partial: true, fromDevice: true })).toBe("preview");
    expect(decideSource({ hadRowsAtMount: true, partial: false, fromDevice: false })).toBe("memory");
    expect(decideSource({ hadRowsAtMount: true, partial: false, fromDevice: true })).toBe("device");
    expect(decideSource({ hadRowsAtMount: false, partial: false, fromDevice: true })).toBe("device");
    expect(decideSource({ hadRowsAtMount: false, partial: false, fromDevice: false })).toBe("network");

    // a device copy that arrives after the page mounted and after `start` stopped waiting still paints, and is labelled device
    const first = await boot();
    first.show();
    click("signin-ann");
    await waitFor(() => expect(first.proof.lastPaint?.fullMs).toBeGreaterThan(0));
    await first.speed.currentPersist()!.flush();
    const second = await reload();
    await holdDisk(900);
    const release = second.platform.hold(ANN); // the network does not answer while the disk is held
    second.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1", undefined, { timeout: 3000 });
    expect(second.proof.start).toMatchObject({ hydrated: false }); // start gave up after waitMs
    expect(second.platform.answered()).toBe(0);
    await waitFor(() => expect(panel().dataset.source).toBe("device"));
    release();
  });

  test("P5 a preview never reaches the device: only the committed list is saved", async () => {
    big();
    const k = await boot();
    const release = k.platform.holdAfter(ANN, 2);
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    expect(rows()).toHaveLength(200);
    await k.speed.currentPersist()!.flush();
    expect(await dumpDevice()).not.toContain("Ann entry"); // 200 preview rows are on screen, none on the device
    release();
    await waitFor(() => expect(rows()).toHaveLength(500), { timeout: 3000 });
    await waitFor(() => expect(line()).toMatch(/^Updated /));
    await k.speed.currentPersist()!.flush();
    expect(await dumpDevice()).toContain("Ann entry 500");
  });

  test("P6 a stale device mark is cleared when a network load commits: coming back to the page reads memory, not device", async () => {
    const first = await boot();
    first.show();
    click("signin-ann");
    await waitFor(() => expect(first.proof.lastPaint?.fullMs).toBeGreaterThan(0));
    await first.speed.currentPersist()!.flush();
    const second = await reload();
    second.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    await waitFor(() => expect(panel().dataset.source).toBe("device"));
    await waitFor(() => expect(line()).toMatch(/^Updated \d\d:\d\d$/)); // the network answer has committed over the copy
    click("nav-entry-e1");
    fireEvent.click(screen.getByTestId("nav-entries"));
    expect(panel().dataset.source).toBe("memory");
  });
});
