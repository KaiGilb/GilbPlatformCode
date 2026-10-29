import { describe, expect, test, vi } from "vitest";
import { __resetPhotoTermResolvers, photoReadKeysSyncOf, photoTermResolverFor } from "./photoTerm";

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
