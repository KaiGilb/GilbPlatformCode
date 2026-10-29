// Ported from the app's test of the shared anchor ask: an ask in flight is shared by overlapping draws; once answered, a later ask is
// sent again (an ended record answers 404 only to a new ask). No mocks. The app's test let each ask answer after 5 ms; here the
// answer is released by hand, so the test waits for nothing but the asks themselves.
import { describe, expect, it } from "vitest";
import { keptResolve } from "./linkedAnswers";

describe("keptResolve", () => {
  it("three overlapping asks of one record send ONE request; another record sends its own", async () => {
    let sent = 0;
    const release: Array<() => void> = [];
    const ask = () =>
      new Promise<string>((r) => {
        const n = ++sent;
        release.push(() => r(`answer ${n}`));
      });
    const all = Promise.all([keptResolve("h\u0000r1", ask), keptResolve("h\u0000r1", ask), keptResolve("h\u0000r1", ask), keptResolve("h\u0000r2", ask)]);
    expect(sent).toBe(2);
    for (const r of release) r();
    const got = await all;
    expect(sent).toBe(2);
    expect(got[0]).toBe(got[1]);
    expect(got[1]).toBe(got[2]);
  });

  it("an answered ask is not kept: the next ask is sent again; a failed one too", async () => {
    let sent = 0;
    await keptResolve("h\u0000r3", async () => ++sent);
    await keptResolve("h\u0000r3", async () => ++sent);
    expect(sent).toBe(2);
    await expect(keptResolve("h\u0000r4", async () => { throw new Error("down"); })).rejects.toThrow("down");
    expect(await keptResolve("h\u0000r4", async () => "up")).toBe("up");
  });
});
