import { describe, expect, test } from "vitest";
import { queuePicture, forgetPictures, pictureObjectUrl } from "@kaigilb/gilbplatformcode-signed-picture";
import { listOps, saveOp, setQueueStore } from "@kaigilb/gilbplatformcode-save-queue";
import { forgetEverything } from "../src/App";
import { deviceCacheName, QUEUE_DB_NAME } from "../src/setup";
import { setup } from "./helpers";

describe("start-up settings", () => {
  test("the device cache name differs per person", () => {
    expect(deviceCacheName("https://x/i/ann")).not.toBe(deviceCacheName("https://x/i/ben"));
    expect(deviceCacheName("https://x/i/ann")).toBe(deviceCacheName("https://x/i/ann"));
    expect(deviceCacheName("https://x/i/ann")).toContain("pictures-example");
  });

  test("the queue lives in the database named for this app", async () => {
    setup();
    setQueueStore(null); // the real IndexedDB store (fake-indexeddb here)
    await saveOp({ id: "q1", kind: "create", change: {}, createdAt: new Date().toISOString(), tries: 0, principal: "ann" });
    expect(await listOps()).toHaveLength(1);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).toContain(QUEUE_DB_NAME);
    expect(QUEUE_DB_NAME).toBe("pictures-example");
  });

  test("at most 6 pictures are fetched at once", async () => {
    setup();
    let running = 0;
    let most = 0;
    const gates: (() => void)[] = [];
    const jobs = Array.from({ length: 10 }, () =>
      queuePicture(
        () =>
          new Promise<string>((res) => {
            running++;
            most = Math.max(most, running);
            gates.push(() => {
              running--;
              res("x");
            });
          }),
      ),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(most).toBe(6);
    while (gates.length) gates.shift()!();
    await new Promise((r) => setTimeout(r, 5));
    while (gates.length) gates.shift()!();
    await Promise.all(jobs);
  });

  test("sign-out forgets the pictures held in memory", async () => {
    const vault = setup();
    const f = vault.seed("a", new Uint8Array(5), new Uint8Array(5)).thumb;
    await pictureObjectUrl(f.entity, vault.origin);
    await pictureObjectUrl(f.entity, vault.origin);
    expect(vault.requests.filter((r) => r.startsWith("GET /files/"))).toHaveLength(1); // cached
    await forgetEverything();
    await pictureObjectUrl(f.entity, vault.origin);
    expect(vault.requests.filter((r) => r.startsWith("GET /files/"))).toHaveLength(2);
    forgetPictures();
  });

  test("the fake vault refuses, and records, any request to another host", async () => {
    const vault = setup();
    await expect(fetch("https://elsewhere.example/x")).rejects.toThrow(/not local/);
    expect(vault.violations).toEqual(["GET https://elsewhere.example/x"]);
  });
});
