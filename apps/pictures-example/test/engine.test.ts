import { describe, expect, test, vi } from "vitest";
import { file, fakeSet, newEngine, setConnection, setup } from "./helpers";
import { listOpsFor, saveOp, stampOp, memoryStore, setQueueStore } from "@kaigilb/gilbplatformcode-save-queue";
import { PictureUnreadableError, HEIC_UNREADABLE } from "@kaigilb/gilbplatformcode-picture-shrink";

const settle = () => new Promise((r) => setTimeout(r, 60));

describe("engine: add and store", () => {
  test("the tile shows at once with the local thumbnail, then is stored; the vault holds three files, one upload each", async () => {
    const vault = setup();
    const makeSet = vi.fn(async () => fakeSet());
    const engine = newEngine(vault, makeSet);
    await engine.start();
    await engine.add([file("ann.jpg")]);
    expect(makeSet).toHaveBeenCalledWith(expect.any(File), { type: "auto" });
    const first = engine.getSnapshot().tiles[0];
    expect(first?.previewUrl).toMatch(/^blob:/);
    expect(["saving", "waiting"]).toContain(first?.status);
    await settle();
    const snap = engine.getSnapshot();
    expect(snap.tiles).toHaveLength(1);
    expect(snap.tiles[0]!.status).toBe("stored");
    expect(vault.uploads).toEqual(["ann.jpg", "ann-full.jpg", "ann-320.jpg"]);
    expect(snap.tiles[0]!.copies.map((c) => c.bytes)).toEqual([10, 100, 1000]);
    expect(snap.tiles[0]!.previewUrl).toMatch(/^blob:/); // no flicker: the local thumbnail stays
    expect(await listOpsFor("ann")).toHaveLength(0);
    expect(vault.violations).toEqual([]);
    // the two links the unit sends: small copy and master are made from the full copy
    expect(vault.patches.map((p) => Object.keys(p.body))).toEqual([["a:transcodedFrom"], ["a:transcodedFrom"]]);
  });

  test("on cellular the full copy is not sent; it is sent when Wi-Fi is seen, and only then", async () => {
    const vault = setup({ cellular: true });
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await engine.add([file("c.jpg")]);
    await settle();
    expect(vault.uploads).toEqual(["c.jpg", "c-320.jpg"]);
    expect(engine.getSnapshot().tiles[0]!.status).toBe("wifi");
    expect(await listOpsFor("ann")).toHaveLength(1); // kept for the full copy
    // still cellular: poking sends nothing and asks the vault nothing
    const before = vault.requests.length;
    engine.poke();
    await settle();
    expect(vault.uploads).toEqual(["c.jpg", "c-320.jpg"]);
    expect(vault.requests.length).toBe(before);
    // Wi-Fi arrives
    setConnection("wifi");
    engine.poke();
    await settle();
    expect(vault.uploads).toEqual(["c.jpg", "c-320.jpg", "c-full.jpg"]);
    expect(engine.getSnapshot().tiles).toHaveLength(1);
    expect(engine.getSnapshot().tiles[0]!.status).toBe("stored");
    expect(engine.getSnapshot().tiles[0]!.copies.map((c) => c.bytes)).toEqual([10, 100, 1000]);
    expect(await listOpsFor("ann")).toHaveLength(0);
  });

  test("where the browser does not say (iOS) the full copy waits, as the plan's default", async () => {
    const vault = setup({ cellular: null });
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await engine.add([file("i.jpg")]);
    await settle();
    expect(vault.uploads).toEqual(["i.jpg", "i-320.jpg"]);
  });

  test("a small picture has no full copy and is simply stored", async () => {
    const vault = setup({ cellular: true });
    const engine = newEngine(vault, async () => fakeSet(false));
    await engine.start();
    await engine.add([file("s.jpg")]);
    await settle();
    expect(engine.getSnapshot().tiles[0]!.status).toBe("stored");
    expect(await listOpsFor("ann")).toHaveLength(0);
  });
});

describe("engine: retry resumes", () => {
  test("a small copy that failed is tried again without uploading the picture a second time", async () => {
    const vault = setup();
    vault.fake.failNext("PUT /lws/vault/:vault/files", { status: 503, times: 1, skip: 2 }); // master and full pass; the small copy fails once
    const engine = newEngine(vault, async () => fakeSet());
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await engine.start();
    await engine.add([file("r.jpg")]);
    await settle();
    expect(vault.uploads).toEqual(["r.jpg", "r-full.jpg", "r-320.jpg"]);
    const ops = await listOpsFor("ann");
    expect(ops).toHaveLength(1);
    expect(ops[0]!.masterEntity).toBeTruthy(); // the finished step is in the stored op
    expect(engine.getSnapshot().tiles).toHaveLength(1); // one picture, not the queued one and the stored one
    await engine.loadStored(); // the vault already lists the master (and the full copy): still one tile
    expect(engine.getSnapshot().tiles).toHaveLength(1);
    expect(engine.getSnapshot().tiles[0]!.status).not.toBe("stored");
    engine.poke();
    await settle();
    expect(vault.uploads).toEqual(["r.jpg", "r-full.jpg", "r-320.jpg", "r-320.jpg"]); // only the small copy again
    expect(engine.getSnapshot().tiles[0]!.status).toBe("stored");
    expect(await listOpsFor("ann")).toHaveLength(0);
  });

  test("an op already holding its master (a crash after step one) does not upload the master again after a restart", async () => {
    const vault = setup();
    const seeded = vault.seed("r2", new Uint8Array(100), new Uint8Array(10));
    const op = stampOp({ id: "op-1", kind: "create", change: { name: "r2.jpg" }, pictureBlob: new Blob([new Uint8Array(100)], { type: "image/jpeg" }), thumbBlob: new Blob([new Uint8Array(10)], { type: "image/jpeg" }), createdAt: new Date().toISOString(), tries: 1, masterEntity: seeded.master.entity }, "ann")!;
    await saveOp(op);
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await settle();
    expect(vault.uploads).toEqual(["r2-320.jpg"]);
    expect(await listOpsFor("ann")).toHaveLength(0);
  });

  test("busy: the op waits, the busy delay is 2 s then 5 s, and a later try stores it", async () => {
    const vault = setup();
    vault.fake.failNext("PUT /lws/vault/:vault/files", { status: 503, times: 2 });
    const delays: number[] = [];
    const engine = new (await import("../src/engine")).PictureEngine(vault.session("ann"), { makeSet: (async () => fakeSet()) as never, setTimer: (_f, ms) => delays.push(ms) });
    await engine.start();
    await engine.add([file("b.jpg")]);
    await settle();
    expect(delays).toEqual([2000]);
    expect(engine.getSnapshot().tiles[0]!.status).toBe("waiting");
    engine.poke();
    await settle();
    expect(delays).toEqual([2000, 5000]);
    engine.poke();
    await settle();
    expect(engine.getSnapshot().tiles[0]!.status).toBe("stored");
  });

  test("a busy answer stops the queue: the second picture is not tried while the vault is busy", async () => {
    const vault = setup();
    vault.fake.failNext("PUT /lws/vault/:vault/files", { status: 503, times: 99 });
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await engine.add([file("one.jpg"), file("two.jpg")]);
    await settle();
    expect(vault.uploads).toEqual(["one.jpg"]);
  });

  test("five other failures make the op stuck; Try again clears it", async () => {
    const vault = setup();
    const stopFailing = vault.fake.failNext("PUT /lws/vault/:vault/files", { status: 500, times: 99 });
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await engine.add([file("x.jpg")]);
    for (let i = 0; i < 6; i++) {
      engine.poke();
      await settle();
    }
    const t = engine.getSnapshot().tiles[0]!;
    expect(t.status).toBe("stuck");
    expect(t.failure?.kind).toBe("unknown");
    const tried = vault.uploads.length;
    engine.poke();
    await settle();
    expect(vault.uploads.length).toBe(tried); // a stuck op is not sent again until the person says Try again
    stopFailing();
    engine.tryAgain(t.key);
    await settle();
    await settle();
    expect(engine.getSnapshot().tiles[0]!.status).toBe("stored");
  });
});

describe("engine: failures and people", () => {
  test("a picture the browser cannot read is shown as a failure note with the cause, and nothing is queued", async () => {
    const vault = setup();
    const engine = newEngine(vault, async () => {
      throw new PictureUnreadableError(HEIC_UNREADABLE);
    });
    await engine.start();
    await engine.add([file("h.heic")]);
    const note = engine.getSnapshot().notes[0]!;
    expect(note.failure.kind).toBe("unreadable");
    expect(note.failure.sentence).toContain("HEIC");
    expect(engine.getSnapshot().tiles).toHaveLength(0);
    expect(await listOpsFor("ann")).toHaveLength(0);
  });

  test("a refused upload (403) is dropped from the queue and shown as no-access with the platform's own line in the details", async () => {
    const vault = setup({ readOnly: true }); // ann may read this vault, not write
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await engine.add([file("n.jpg")]);
    await settle();
    const snap = engine.getSnapshot();
    expect(snap.notes[0]!.failure.kind).toBe("no-access");
    expect(snap.notes[0]!.failure.detail).toContain(`vault target denied: the principal holds no write reach on vault ${vault.root}`);
    expect(snap.tiles).toHaveLength(0);
    expect(await listOpsFor("ann")).toHaveLength(0);
  });

  test("another person's queued work is not shown or sent", async () => {
    const vault = setup();
    const other = stampOp({ id: "ben-1", kind: "create", change: { name: "ben.jpg" }, pictureBlob: new Blob([new Uint8Array(5)]), thumbBlob: new Blob([new Uint8Array(5)]), createdAt: new Date().toISOString(), tries: 0 }, "ben")!;
    await saveOp(other);
    const engine = newEngine(vault, async () => fakeSet());
    await engine.start();
    await settle();
    expect(engine.getSnapshot().tiles).toHaveLength(0);
    expect(vault.uploads).toEqual([]);
  });

  test("nobody signed in: nothing is queued", async () => {
    const vault = setup();
    setQueueStore(memoryStore());
    const engine = newEngine(vault, async () => fakeSet(), "");
    await engine.start();
    await engine.add([file("z.jpg")]);
    expect(engine.getSnapshot().tiles).toHaveLength(0);
    expect(vault.uploads).toEqual([]);
  });
});
