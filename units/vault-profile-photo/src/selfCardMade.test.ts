// Ported from the app's selfCardMade.ns1.test.ts (3 of 3): the one door that makes a vault's own card (`ensureVaultSelfCard`) says so once it
// is made, and never when it was not. The store's create door is a fake peer (`./selfCardRecord`, the app mocked `./records`).
import { afterEach, describe, expect, it, vi } from "vitest";

const door = vi.hoisted(() => ({ fail: null as Error | null }));
vi.mock("./selfCardRecord", () => ({
  ensureSelfCardRecord: async () => {
    if (door.fail) throw door.fail;
    return { id: "vsc-0123456789abcdef01234567", etag: null, adopted: false };
  },
}));

import { ensureVaultSelfCard } from "./vaultProfilePhoto";
import { announceSelfCardMade, onSelfCardMade } from "./selfCardMade";

const VAULT = "https://waitlist.example.test/vault";
let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  door.fail = null;
});

describe("ensureVaultSelfCard announces the card it made", () => {
  it("a made card is announced once, with its vault", async () => {
    const heard: string[] = [];
    stop = onSelfCardMade((v) => heard.push(v));
    await ensureVaultSelfCard(VAULT, {}, "waitlist");
    expect(heard).toEqual([VAULT]);
  });

  it("a refused door announces nothing", async () => {
    const heard: string[] = [];
    stop = onSelfCardMade((v) => heard.push(v));
    door.fail = new Error("Forbidden (403)");
    await expect(ensureVaultSelfCard(VAULT, {}, "waitlist")).rejects.toThrow(/403/);
    expect(heard).toEqual([]);
  });

  it("a listener that throws does not fail the door; a stopped listener hears nothing", async () => {
    const heard: string[] = [];
    const s1 = onSelfCardMade(() => {
      throw new Error("boom");
    });
    const s2 = onSelfCardMade((v) => heard.push(v));
    s2();
    expect(() => announceSelfCardMade(VAULT)).not.toThrow();
    s1();
    expect(heard).toEqual([]);
  });
});
