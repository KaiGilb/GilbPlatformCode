// Test-only. Records every request the code made, with its method, address and raw body, in front of the fake platform (`fakePlaceStore.fakeFetch`).
// Call it after `setUp()`. A write is any request that is not a GET.
import { vi } from "vitest";
import { fakeFetch } from "./fakePlaceStore";

export interface WireCall {
  method: string;
  url: string;
  body: unknown;
}

export function watchWire(): WireCall[] {
  const calls: WireCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
      calls.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(input), body });
      return fakeFetch(input, init);
    }),
  );
  return calls;
}
export const writes = (calls: readonly WireCall[]) => calls.filter((c) => c.method !== "GET");
