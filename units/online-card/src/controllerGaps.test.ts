// Gaps found in the controller: one write for two concurrent confirmations, a stale search answer dropped, a search cancelled with the card.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnlineCardController, type ControllerDeps } from "./controller";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
afterEach(() => vi.useRealTimers());
const RECORD = "https://h.test/base/e/r1", HOLDER = "https://h.test/vault", P = "https://k.test/vault", ENT = "https://k.test/vault/entity-x";
/** The write waits for `gate` when one is given, so a second call can arrive while the first is in flight (no wall-clock wait). */
function mk(over: Partial<ControllerDeps> = {}, find?: () => Promise<Response>, card404 = false, gate?: Promise<void>) {
  const links: any[] = [];
  const platform: PlatformClient = { origin: "https://id.test", fetch: async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("online-card-anchor")) return new Response(JSON.stringify({ kind: "person", principal: P, entity: ENT }), { status: 200 });
    if (u.pathname.endsWith("public-card")) return card404 ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ fields: [{ principal: P, field: "a:email", value: "k@x.org", rung: "public", sourceEntity: "https://k.test/e/1" }] }), { status: 200 });
    if (u.pathname.endsWith("find-by-name")) return find ? find() : new Response(JSON.stringify({ matches: [{ principal: P, value: "Ann Q" }] }), { status: 200 });
    return new Response("{}", { status: 404 });
  } };
  const deps: ControllerDeps = { platform, subject: { uri: RECORD, holder: HOLDER, link: { state: "linked", target: P } }, canWrite: true,
    writeLink: async (l) => { if (gate) await gate; links.push(l); },
    ...over };
  return { deps, links };
}
describe("controller gaps", () => {
  it("two concurrent confirmLink calls write once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const w = mk({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } }, undefined, false, gate);
    const c = createOnlineCardController(w.deps);
    const both = Promise.all([c.confirmLink({ principal: P }), c.confirmLink({ principal: P })]);
    release();
    await both;
    expect(w.links.length).toBe(1);
  });
  it("a stale search answer is dropped when a newer search was made", async () => {
    vi.useFakeTimers();
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const w = mk({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } }, async () => { const my = ++n; if (my === 1) await gate; return new Response(JSON.stringify({ matches: [{ principal: my === 1 ? "https://old.test/vault" : P, value: my === 1 ? "Old" : "New" }] }), { status: 200 }); }, true);
    const c = createOnlineCardController(w.deps);
    c.openFind("x");
    const a = c.search("old"); await vi.advanceTimersByTimeAsync(0); const b = c.search("new");
    await b;
    release();
    await a;
    const s = c.getState().find;
    expect(s.status === "results" && s.query === "new").toBe(true);
  });
  it("closing the card while a search hangs cancels the search request", async () => {
    vi.useFakeTimers();
    const seen: (AbortSignal | null | undefined)[] = [];
    const hang = () => new Promise<Response>(() => {});
    const base = mk({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } }, hang);
    const platform: PlatformClient = { origin: "https://id.test", fetch: async (url, init) => { if (new URL(url).pathname.endsWith("find-by-name")) seen.push(init?.signal); return base.deps.platform.fetch(url, init); } };
    const c = createOnlineCardController({ ...base.deps, platform });
    c.openFind("g"); void c.search("g"); await vi.advanceTimersByTimeAsync(0);
    expect(seen.length).toBe(1); expect(seen[0]!.aborted).toBe(false);
    c.dispose();
    expect(seen[0]!.aborted).toBe(true);
  });
});
