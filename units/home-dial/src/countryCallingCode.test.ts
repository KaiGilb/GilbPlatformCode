// The request that reads a country's calling codes: one GET at the address it is given.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCountryCallingCodes } from "./countryCallingCode";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer(url, init);
  });
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const COUNTRY = "https://catalogue.example.test/base/e/country-1";

describe("readCountryCallingCodes", () => {
  it("is one GET at the country's own address, asking for JSON, with no credential", async () => {
    const calls = stubFetch(() => json({ countryCallingCode: "+47" }));
    expect(await readCountryCallingCodes(COUNTRY)).toEqual(["+47"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(COUNTRY);
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(Object.keys(calls[0]!.init).sort())).toBe(JSON.stringify(["headers", "method", "signal"]));
    expect(calls[0]!.init.signal).toBeUndefined();
  });
  it("passes the abort signal it is given", async () => {
    const calls = stubFetch(() => json({}));
    const ac = new AbortController();
    await readCountryCallingCodes(COUNTRY, ac.signal);
    expect(calls[0]!.init.signal).toBe(ac.signal);
  });
  it("reads one code served as a string, two as an array, and drops what is not a code", async () => {
    stubFetch(() => json({ countryCallingCode: ["+290", "+247", "+290", "bad", "+1 876", 5] }));
    expect(await readCountryCallingCodes(COUNTRY)).toEqual(["+290", "+247"]);
  });
  it("a country with no code is an empty list, not an error", async () => {
    stubFetch(() => json({ name: "Nowhere" }));
    expect(await readCountryCallingCodes(COUNTRY)).toEqual([]);
  });
  it("a refused read throws with the status, never an empty list", async () => {
    stubFetch(() => new Response("no", { status: 404 }));
    await expect(readCountryCallingCodes(COUNTRY)).rejects.toThrow("Country read 404");
    stubFetch(() => new Response("no", { status: 500 }));
    await expect(readCountryCallingCodes(COUNTRY)).rejects.toThrow("Country read 500");
  });
  it("a network failure is the caller's to handle", async () => {
    stubFetch(() => {
      throw new TypeError("offline");
    });
    await expect(readCountryCallingCodes(COUNTRY)).rejects.toThrow("offline");
  });
});
