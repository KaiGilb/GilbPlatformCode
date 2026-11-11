import { vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { createFakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { forgetPictures } from "@kaigilb/gilbplatformcode-signed-picture";
import { setQueueStore, memoryStore } from "@kaigilb/gilbplatformcode-save-queue";
import { configureApp } from "../src/setup";
import { PictureEngine } from "../src/engine";
import type { Session } from "../src/types";

export const ORIGIN = "https://app.example.test";
export const ROOT = `${ORIGIN}/vault`;

/** A picture "set" as makePictureSet would answer: sizes tell the copies apart. */
export function fakeSet(full = true) {
  const mk = (n: number) => new Blob([new Uint8Array(n)], { type: "image/jpeg" });
  return { thumb: mk(10), screen: mk(100), full: full ? mk(1000) : null, width: 4000, height: 3000, type: "image/jpeg" };
}

/** The shared fake platform with ann signed in and a vault at ROOT; `readOnly` makes the vault ben's and gives ann read only. */
export function setup(opts: { cellular?: boolean | null; readOnly?: boolean } = {}) {
  resetBaseOrigin();
  resetSystemVaultHosts();
  forgetPictures();
  setQueueStore(memoryStore());
  configureApp(ORIGIN);
  // A clock that moves one millisecond at every reading: files written one after another never share an updatedAt, so "newest first" has one answer
  // however fast or slow the machine is (the grid orders by updatedAt; equal times fall back to the platform's name order).
  let clock = Date.now();
  const fake = createFakePlatform({ origin: ORIGIN, now: () => (clock += 1) });
  const ann = fake.seedPerson({ email: "ann@example.test" });
  const owner = opts.readOnly ? fake.seedPerson({ email: "ben@example.test" }) : ann;
  const vault = fake.seedVault({ name: "ann", owner, host: new URL(ORIGIN).host });
  if (opts.readOnly) fake.grant(vault, ann, "read");
  setLwsAuth(fake.authHost(ann));
  vi.stubGlobal("fetch", fake.fetch);
  const wifi = opts.cellular === undefined ? false : opts.cellular; // default: Wi-Fi
  setConnection(wifi === null ? undefined : wifi ? "cellular" : "wifi");
  const calls = (m: string) => fake.calls.of(m as never);
  const entity = (id: string) => `${ORIGIN}/vault/e/${id}`;
  return {
    fake,
    ann,
    vault,
    origin: ORIGIN,
    root: ROOT,
    session: (principal = "ann"): Session => ({ principal, vaultOrigin: ORIGIN, vaultRoot: ROOT }),
    /** A stored picture with no request: the master and its small copy. */
    seed(name: string, master: Uint8Array, thumb: Uint8Array) {
      const p = fake.seedPicture(vault, { name, master, thumb });
      return { master: { id: p.master.id, entity: entity(p.master.id) }, thumb: { id: p.thumb.id, entity: entity(p.thumb.id) } };
    },
    /** File names of every upload that reached the fake, failed attempts included, in order. */
    get uploads(): string[] {
      return calls("PUT /lws/vault/:vault/files").map((c) => c.query.name![0]!);
    },
    /** The merge-patch body of every PATCH, in order. */
    get patches(): { body: Record<string, unknown> }[] {
      return calls("PATCH /lws/r/:id").map((c) => ({ body: c.body as Record<string, unknown> }));
    },
    /** "METHOD /path" of every request, in order. */
    get requests(): string[] {
      return fake.calls.all.map((c) => `${c.method} ${c.path}`);
    },
    get violations(): string[] {
      return fake.violations;
    },
    get files(): { id: string; name: string }[] {
      return [...fake.state.files.values()].map((f) => ({ id: f.id, name: String(f.facts.fileName) }));
    },
  };
}

export function newEngine(vault: ReturnType<typeof setup>, makeSet: (f: File, o?: unknown) => Promise<ReturnType<typeof fakeSet>>, principal = "ann") {
  return new PictureEngine(vault.session(principal), { makeSet: makeSet as never, setTimer: () => 0 });
}

export const file = (name = "a.jpg") => new File([new Uint8Array(5)], name, { type: "image/jpeg" });

/** jsdom has no navigator.connection; set what the browser would say, or nothing (iOS). */
export function setConnection(type: "wifi" | "cellular" | undefined): void {
  Object.defineProperty(window.navigator, "connection", {
    configurable: true,
    value: type ? { type, saveData: false, addEventListener() {}, removeEventListener() {} } : undefined,
  });
}
