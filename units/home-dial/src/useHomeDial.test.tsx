// The hook: which claim may prefill, the walk from a place to its country, the one request, and what is shown for every way
// it can end. A recording `fetch`; the host's `resolveAncestry` is a function the test writes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { noAncestry, useHomeDial, type HomeDialClaim, type ResolveAncestry } from "./useHomeDial";

afterEach(() => vi.unstubAllGlobals());

const NORWAY = "https://catalogue.example.test/base/e/norway";
const SWEDEN = "https://catalogue.example.test/base/e/sweden";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubCountries(docs: Record<string, unknown>) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    if (!(url in docs)) return new Response("no", { status: 404 });
    return json(docs[url]);
  });
  return urls;
}
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });

const home = (placeIds: string[], uri = "claim:home"): HomeDialClaim => ({ label: "Home", uri, placeIds });
const inNorway: ResolveAncestry = async () => ({ country: { id: NORWAY } });

describe("useHomeDial", () => {
  it("no claims: nothing is asked, the answer is empty", async () => {
    const urls = stubCountries({});
    const ancestry = vi.fn(inNorway);
    const { result } = renderHook(() => useHomeDial([], ancestry));
    await flush();
    expect(result.current).toBe("");
    expect(ancestry).not.toHaveBeenCalled();
    expect(urls).toEqual([]);
  });
  it("the default host knows no country: the answer is empty and nothing is requested", async () => {
    const urls = stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const { result } = renderHook(() => useHomeDial([home(["p1"])]));
    await flush();
    expect(result.current).toBe("");
    expect(urls).toEqual([]);
    expect(await noAncestry("anything")).toEqual({ country: null });
  });
  it("a home address in a country with ONE code gives its digits, read once at the country's own address", async () => {
    const urls = stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const { result } = renderHook(() => useHomeDial([home(["p1"])], inNorway));
    expect(result.current).toBe("");
    await flush();
    expect(result.current).toBe("47");
    expect(urls).toEqual([NORWAY]);
  });
  it("a country with TWO codes picks neither", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: ["+290", "+247"] } });
    const { result } = renderHook(() => useHomeDial([home(["p1"])], inNorway));
    await flush();
    expect(result.current).toBe("");
  });
  it("a country with no code, or a refused read, gives empty", async () => {
    stubCountries({ [NORWAY]: { name: "Norway" } });
    const a = renderHook(() => useHomeDial([home(["p1"])], inNorway));
    await flush();
    expect(a.result.current).toBe("");
    stubCountries({});
    const b = renderHook(() => useHomeDial([home(["p1"])], inNorway));
    await flush();
    expect(b.result.current).toBe("");
  });
  it("walks the place ids in order until one has a country", async () => {
    const urls = stubCountries({ [SWEDEN]: { countryCallingCode: "+46" } });
    const seen: string[] = [];
    const ancestry: ResolveAncestry = async (id) => {
      seen.push(id);
      return id === "p2" ? { country: { id: SWEDEN } } : { country: null };
    };
    const { result } = renderHook(() => useHomeDial([home(["p1", "p2", "p3"])], ancestry));
    await flush();
    expect(seen).toEqual(["p1", "p2"]);
    expect(result.current).toBe("46");
    expect(urls).toEqual([SWEDEN]);
  });
  it("a country with an empty id is no country", async () => {
    const urls = stubCountries({});
    const { result } = renderHook(() => useHomeDial([home(["p1"])], async () => ({ country: { id: "" } })));
    await flush();
    expect(result.current).toBe("");
    expect(urls).toEqual([]);
  });
  it("the home-labelled address wins among several; several with none labelled home prefill nothing; one address is used with any label", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" }, [SWEDEN]: { countryCallingCode: "+46" } });
    const byPlace: ResolveAncestry = async (id) => ({ country: { id: id === "no" ? NORWAY : SWEDEN } });
    const work: HomeDialClaim = { label: "Work", uri: "claim:work", placeIds: ["se"] };
    const a = renderHook(() => useHomeDial([work, home(["no"])], byPlace));
    await flush();
    expect(a.result.current).toBe("47");
    const b = renderHook(() => useHomeDial([work, { label: "Cabin", uri: "claim:cabin", placeIds: ["no"] }], byPlace));
    await flush();
    expect(b.result.current).toBe("");
    const c = renderHook(() => useHomeDial([work], byPlace));
    await flush();
    expect(c.result.current).toBe("46");
  });
  it("a failing host, or a failing request, gives empty and does not throw", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const a = renderHook(() => useHomeDial([home(["p1"])], async () => { throw new Error("geo down"); }));
    await flush();
    expect(a.result.current).toBe("");
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const b = renderHook(() => useHomeDial([home(["p1"])], inNorway));
    await flush();
    expect(b.result.current).toBe("");
  });
  it("a new claims list with the SAME address does not restart the walk", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const ancestry = vi.fn(inNorway);
    const { result, rerender } = renderHook(({ claims }) => useHomeDial(claims, ancestry), { initialProps: { claims: [home(["p1", "p2"])] } });
    await flush();
    expect(result.current).toBe("47");
    expect(ancestry).toHaveBeenCalledTimes(1);
    rerender({ claims: [home(["p1", "p2"])] });
    await flush();
    expect(ancestry).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("47");
  });
  it("a different address (its uri or its places) restarts the walk and the answer follows", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" }, [SWEDEN]: { countryCallingCode: "+46" } });
    const byPlace: ResolveAncestry = async (id) => ({ country: { id: id === "no" ? NORWAY : SWEDEN } });
    const { result, rerender } = renderHook(({ claims }) => useHomeDial(claims, byPlace), { initialProps: { claims: [home(["no"])] } });
    await flush();
    expect(result.current).toBe("47");
    rerender({ claims: [home(["se"])] });
    await flush();
    expect(result.current).toBe("46");
    rerender({ claims: [home(["se"], "claim:other")] });
    await flush();
    expect(result.current).toBe("46");
  });
  it("when the claims go away the answer is emptied at once", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const { result, rerender } = renderHook(({ claims }) => useHomeDial(claims, inNorway), { initialProps: { claims: [home(["p1"])] } });
    await flush();
    expect(result.current).toBe("47");
    rerender({ claims: [] as HomeDialClaim[] });
    await flush();
    expect(result.current).toBe("");
  });
  it("an answer that arrives after the hook was left is dropped (no update, no error)", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: ResolveAncestry = async () => { await gate; return { country: { id: NORWAY } }; };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useHomeDial([home(["p1"])], slow));
    unmount();
    release();
    await flush();
    expect(result.current).toBe("");
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
  it("an old walk that finishes after a newer one started does not overwrite it", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" }, [SWEDEN]: { countryCallingCode: "+46" } });
    let releaseOld!: () => void;
    const gate = new Promise<void>((r) => { releaseOld = r; });
    const byPlace: ResolveAncestry = async (id) => {
      if (id === "old") await gate;
      return { country: { id: id === "old" ? NORWAY : SWEDEN } };
    };
    const { result, rerender } = renderHook(({ claims }) => useHomeDial(claims, byPlace), { initialProps: { claims: [home(["old"], "claim:old")] } });
    rerender({ claims: [home(["new"], "claim:new")] });
    await flush();
    expect(result.current).toBe("46");
    releaseOld();
    await flush();
    expect(result.current).toBe("46");
  });
  it("a country object with an empty id does not end the walk: the next place is tried", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const ancestry: ResolveAncestry = async (id) => (id === "p1" ? { country: { id: "" } } : { country: { id: NORWAY } });
    const { result } = renderHook(() => useHomeDial([home(["p1", "p2"])], ancestry));
    await flush();
    expect(result.current).toBe("47");
  });
  it("an old walk that ends with NO country does not clear the newer answer", async () => {
    stubCountries({ [SWEDEN]: { countryCallingCode: "+46" } });
    let releaseOld!: () => void;
    const gate = new Promise<void>((r) => { releaseOld = r; });
    const byPlace: ResolveAncestry = async (id) => {
      if (id === "old") {
        await gate;
        return { country: null };
      }
      return { country: { id: SWEDEN } };
    };
    const { result, rerender } = renderHook(({ claims }) => useHomeDial(claims, byPlace), { initialProps: { claims: [home(["old"], "claim:old")] } });
    rerender({ claims: [home(["new"], "claim:new")] });
    await flush();
    expect(result.current).toBe("46");
    releaseOld();
    await flush();
    expect(result.current).toBe("46");
  });
  it("an old walk whose country read is still out when a newer walk answers does not overwrite it", async () => {
    let releaseOld!: () => void;
    const gate = new Promise<void>((r) => { releaseOld = r; });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === NORWAY) {
        await gate;
        return json({ countryCallingCode: "+47" });
      }
      return json({ countryCallingCode: "+46" });
    });
    const byPlace: ResolveAncestry = async (id) => ({ country: { id: id === "old" ? NORWAY : SWEDEN } });
    const { result, rerender } = renderHook(({ claims }) => useHomeDial(claims, byPlace), { initialProps: { claims: [home(["old"], "claim:old")] } });
    await flush();
    rerender({ claims: [home(["new"], "claim:new")] });
    await flush();
    expect(result.current).toBe("46");
    releaseOld();
    await flush();
    expect(result.current).toBe("46");
  });
  it("the digits only: a leading + is removed, and the claims are never changed", async () => {
    stubCountries({ [NORWAY]: { countryCallingCode: "+47" } });
    const claims = [home(["p1"])];
    const before = JSON.stringify(claims);
    const { result } = renderHook(() => useHomeDial(claims, inNorway));
    await flush();
    expect(result.current).toBe("47");
    expect(JSON.stringify(claims)).toBe(before);
  });
});
