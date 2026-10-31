// Test-only. Records every request the code made, with its method, address, headers (lower-case names) and raw body, in front of the fake
// platform (`fakePlaceStore.fakeFetch`). Call it after `setUp()`. A write is any request that is not a GET.
import { vi } from "vitest";
import { fakeFetch } from "./fakePlaceStore";

export interface WireCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export function watchWire(): WireCall[] {
  const calls: WireCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
      calls.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(input), headers, body });
      return fakeFetch(input, init);
    }),
  );
  return calls;
}
export const writes = (calls: readonly WireCall[]) => calls.filter((c) => c.method !== "GET");
