import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ANN, boot, click, dumpDevice, panel, reload } from "./helpers";

describe("T2 device", () => {
  test("T2 device: after a reload the rows come from the device before the stand-in answers", async () => {
    const first = await boot();
    first.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    await first.speed.currentPersist()!.flush(); // let the disk save (no timer: flushed by hand)
    expect(await dumpDevice()).toContain("Ann entry 30"); // it is on the device

    const second = await reload(); // no hub person, no cache memory, no job store, a new stand-in; the device stays
    expect(second.cache.sessionCache.size()).toBe(0);
    expect(second.hub.currentPrincipal()).toBeNull();
    const release = second.platform.hold(ANN); // the stand-in will not answer until released
    second.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1"); // rows are on screen...
    expect(screen.getAllByTestId(/^entry-e\d+$/)).toHaveLength(30);
    expect(second.platform.answered()).toBe(0); // ...and the stand-in has answered no records request
    expect(panel().dataset.source).toBe("device");
    expect(second.proof.lastPaint?.source).toBe("device");
    expect(screen.getByTestId("updated-line").textContent).toBe("Updating…"); // behind the rows, it is asking
    release();
    await waitFor(() => expect(screen.getByTestId("updated-line").textContent).toMatch(/^Updated \d\d:\d\d$/));
    expect(panel().dataset.source).toBe("device"); // the reading is of the first rows
  });
});
