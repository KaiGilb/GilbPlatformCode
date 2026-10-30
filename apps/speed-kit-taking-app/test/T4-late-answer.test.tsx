import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ANN, BEN, boot, click, dumpDevice, sleep, watchForText } from "./helpers";

describe("T4 late answer", () => {
  test("T4 late answer: Ann's held answer, released after Ben signed in, reaches neither the screen nor the cache", async () => {
    const k = await boot();
    const release = k.platform.hold(ANN); // Ann's vault does not answer
    k.show();
    click("signin-ann");
    await screen.findByTestId("signout");
    await waitFor(() => expect(k.proof.requests.records).toBe(1)); // her first records request is out, and held
    const annKey = `${ANN}|${ANN}|entries`;
    click("signout");
    await screen.findByTestId("signin-ben");
    click("signin-ben");
    await screen.findByText("Ben entry 1");
    await waitFor(() => expect(k.platform.answered()).toBe(3)); // Ben's three requests (head, walk, changes since)

    const watch = watchForText("Ann entry");
    release(); // Ann's answers come now: the copy goes on (3 requests) and ends with her rows
    await waitFor(() => expect(k.platform.answered()).toBe(6));
    await sleep(50);
    await k.speed.currentPersist()!.flush();
    watch.stop();

    expect(watch.seen).toEqual([]); // not on the screen
    expect(document.body.textContent).toContain("Ben entry 1");
    expect(k.cache.sessionCache.peek(annKey).data).toBeUndefined(); // not in the cache
    expect(k.cache.sessionCache.size()).toBe(1);
    expect(k.provenance.has(annKey)).toBe(false); // nor in the app's own memory
    expect([...k.provenance.keys()].every((key) => key.startsWith(`${BEN}|`))).toBe(true);
    expect(await dumpDevice()).not.toContain("ann.example.test"); // nor on the device
  });
});
