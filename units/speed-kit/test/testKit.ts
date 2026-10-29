// Test fixture (not shipped API): a kit wired the way a small app would wire it, over an in-memory IndexedDB.
import { IDBFactory } from "fake-indexeddb";
import { indexedDbKv, type Kv } from "@kaigilb/gilbplatformcode-device-store";
import { createSessionCache } from "@kaigilb/gilbplatformcode-session-cache";
import { createSpeedKit, type SpeedKitOptions } from "../src/speedKit";

export const WS = "https://team.example.test/vault";
export const ANN = "https://ann.example.test/vault";
export const BEN = "https://ben.example.test/vault";
export const jobWords: SpeedKitOptions["jobs"] = {
  kinds: ["save"],
  failText: (kind, message) => `Not ${kind}: ${message}`,
  unfinishedText: (label) => `Did not finish: ${label}`,
  cancelledText: "Cancelled.",
  crashText: "Crashed.",
};
export function makeKit(factory: IDBFactory, extra: Partial<SpeedKitOptions> = {}) {
  const openKv = (): Promise<Kv | null> => indexedDbKv(factory, "example-cache");
  return createSpeedKit({ appName: "example", jobs: jobWords, persistResources: ["topics"], cache: createSessionCache(), openKv, ...extra });
}
export const noTimer = { schedule: () => undefined } as const; // a test flushes the disk by hand
export const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
