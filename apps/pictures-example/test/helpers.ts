import { vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { forgetPictures } from "@kaigilb/gilbplatformcode-signed-picture";
import { setQueueStore, memoryStore } from "@kaigilb/gilbplatformcode-save-queue";
import { FakeVault, installFakeAuth } from "../src/fakeVault";
import { configureApp } from "../src/setup";
import { PictureEngine } from "../src/engine";

export const ORIGIN = "https://app.example.test";
export const ROOT = `${ORIGIN}/vault`;

/** A picture "set" as makePictureSet would answer: sizes tell the copies apart. */
export function fakeSet(full = true) {
  const mk = (n: number) => new Blob([new Uint8Array(n)], { type: "image/jpeg" });
  return { thumb: mk(10), screen: mk(100), full: full ? mk(1000) : null, width: 4000, height: 3000, type: "image/jpeg" };
}

export function setup(opts: { cellular?: boolean | null } = {}) {
  resetBaseOrigin();
  resetSystemVaultHosts();
  forgetPictures();
  setQueueStore(memoryStore());
  configureApp(ORIGIN);
  installFakeAuth("ann", ROOT);
  const vault = new FakeVault({ origin: ORIGIN, root: ROOT });
  vi.stubGlobal("fetch", vault.fetch);
  const wifi = opts.cellular === undefined ? false : opts.cellular; // default: Wi-Fi
  setConnection(wifi === null ? undefined : wifi ? "cellular" : "wifi");
  return vault;
}

export function newEngine(vault: FakeVault, makeSet: (f: File, o?: unknown) => Promise<ReturnType<typeof fakeSet>>, principal = "ann") {
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
