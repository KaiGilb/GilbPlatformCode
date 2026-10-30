import { describe, expect, test, vi } from "vitest";
import type { PhotoTerm, PhotoTermResolver } from "@kaigilb/gilbplatformcode-photo-term";
import { PHOTO_TERM_RETRY_MS, __resetPhotoTermResolvers, photoReadKeysOf, photoReadKeysSyncOf, photoTermResolverFor } from "./photoTerm";

describe("the photo term's resolver", () => {
  test("one per origin, the same one when asked again, and another for another origin", () => {
    const a = photoTermResolverFor("https://one.example.test");
    expect(photoTermResolverFor("https://one.example.test")).toBe(a);
    expect(photoTermResolverFor("https://two.example.test")).not.toBe(a);
  });

  test("the reset forgets them", () => {
    const a = photoTermResolverFor("https://one.example.test");
    __resetPhotoTermResolvers();
    expect(photoTermResolverFor("https://one.example.test")).not.toBe(a);
  });

  test("it reads the term at the origin it was made for", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      seen.push(String(u));
      return new Response("{}", { status: 404 });
    });
    await photoTermResolverFor("https://one.example.test").get();
    expect(seen).toEqual(["https://one.example.test/base/a/profilePhoto"]);
  });

  test("it keeps the last answer on this device", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ "@id": "x", "a:predicateAttribute": "a:avatarImage" }), { status: 200 }));
    await photoTermResolverFor("https://one.example.test").get();
    expect([...Array(localStorage.length).keys()].map((i) => localStorage.key(i)!).some((k) => k.includes("photo-term"))).toBe(true);
  });

  test("the sync read keys are the resolver's, or none when it holds none", () => {
    const keys = photoReadKeysSyncOf({ peek: () => null, get: async () => ({}) as never });
    expect(keys()).toEqual([]);
    const some = photoReadKeysSyncOf({ peek: () => ({ readKeys: ["a:p"], writeKey: "a:p", writeKeyBare: "p", termUrl: "u" }), get: async () => ({}) as never });
    expect(some()).toEqual(["a:p"]);
  });
});

describe("photoReadKeysOf (GilbApp photoReadKeys, photoTerm.ts:37)", () => {
  const term = (...keys: string[]): PhotoTerm => ({ readKeys: keys, writeKey: keys[0]!, writeKeyBare: "p", termUrl: "u" }) as PhotoTerm;
  const resolver = (get: () => Promise<PhotoTerm>, peek: () => PhotoTerm | null = () => null): PhotoTermResolver => ({ get, peek });

  test("the resolved term's read keys", async () => {
    expect(await photoReadKeysOf(resolver(async () => term("a:one", "a:two")))()).toEqual(["a:one", "a:two"]);
  });

  test("the window is 60 s", () => {
    expect(PHOTO_TERM_RETRY_MS).toBe(60_000);
  });

  test("one ask is shared for 60 s, whatever it answered, and asked again at 60 s", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(5_000_000);
      const get = vi.fn(async () => term("a:one"));
      const keys = photoReadKeysOf(resolver(get));
      const first = keys();
      expect(keys()).toBe(first);
      await first;
      vi.setSystemTime(5_000_000 + 59_999);
      expect(keys()).toBe(first);
      expect(get).toHaveBeenCalledTimes(1);
      vi.setSystemTime(5_000_000 + 60_000);
      expect(keys()).not.toBe(first);
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the same function for the same resolver, another for another", () => {
    const r = resolver(async () => term("a:one"));
    expect(photoReadKeysOf(r)).toBe(photoReadKeysOf(r));
    expect(photoReadKeysOf(resolver(async () => term("a:one")))).not.toBe(photoReadKeysOf(r));
  });

  test("a failed resolve answers the last answer that worked, without a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const keys = photoReadKeysOf(resolver(async () => Promise.reject(new Error("down")), () => term("a:known")));
      expect(await keys()).toEqual(["a:known"]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("a failed resolve that has never worked answers none, and says it is not evidence of no photo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const keys = photoReadKeysOf(resolver(async () => Promise.reject(new Error("down"))));
      expect(await keys()).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("NOT evidence that there is no photo");
    } finally {
      warn.mockRestore();
    }
  });
});
