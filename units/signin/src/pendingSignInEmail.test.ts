import { afterEach, describe, expect, it } from "vitest";
import {
  clearPendingSignInEmail,
  loadPendingSignInEmail,
  savePendingSignInEmail,
} from "./pendingSignInEmail";

class MemStorage implements Storage {
  #m = new Map<string, string>();
  get length(): number {
    return this.#m.size;
  }
  clear(): void {
    this.#m.clear();
  }
  getItem(key: string): string | null {
    return this.#m.has(key) ? this.#m.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.#m.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#m.delete(key);
  }
  setItem(key: string, value: string): void {
    this.#m.set(key, value);
  }
}

const session = new MemStorage();
const local = new MemStorage();

const g = globalThis as typeof globalThis & {
  window?: unknown;
  sessionStorage?: Storage;
  localStorage?: Storage;
};

g.window = globalThis;
g.sessionStorage = session;
g.localStorage = local;

afterEach(() => {
  session.clear();
  local.clear();
});

describe("pendingSignInEmail — browser storage, not vault facts", () => {
  it("keys the pending mailbox by injected app id", () => {
    savePendingSignInEmail("host-a", "a@example.test", true);
    expect(loadPendingSignInEmail("host-a")?.email).toBe("a@example.test");
    expect(loadPendingSignInEmail("host-b")).toBeNull();
    expect(session.getItem("host-a.pendingSignInEmail")).toBeTruthy();
    expect(session.getItem("host-b.pendingSignInEmail")).toBeNull();
  });

  it("clears only that app id", () => {
    savePendingSignInEmail("host-a", "a@example.test", true);
    savePendingSignInEmail("host-b", "b@example.test", true);
    clearPendingSignInEmail("host-a");
    expect(loadPendingSignInEmail("host-a")).toBeNull();
    expect(loadPendingSignInEmail("host-b")?.email).toBe("b@example.test");
  });
});
