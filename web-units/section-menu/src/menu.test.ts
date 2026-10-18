// The website menu's data helpers.
import { describe, expect, test } from "vitest";
import { currentSectionId, normalisePath, placesFor, type WebMenu } from "./menu";

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", to: "/services", links: [{ id: "x", label: "X", to: "/work/x" }] },
    { id: "blog", label: "Blog", to: "/blog/" },
    { id: "blogtags", label: "Tags", to: "/blog/tag" },
  ],
  places: [
    { id: "a", label: "A", href: "https://example.test/a" },
    { id: "b", label: "B", href: "https://example.test/b" },
  ],
};

describe("menu", () => {
  describe("normalisePath", () => {
    test("drops a trailing slash, a query and a hash, but keeps /", () => {
      expect(normalisePath("/blog/")).toBe("/blog");
      expect(normalisePath("/blog?x=1#y")).toBe("/blog");
      expect(normalisePath("/")).toBe("/");
      expect(normalisePath("")).toBe("/");
    });
  });

  describe("currentSectionId", () => {
    test("a section's own page, a page under it, and a sub-page listed elsewhere", () => {
      expect(currentSectionId(MENU, "/services")).toBe("services");
      expect(currentSectionId(MENU, "/services/websites")).toBe("services");
      expect(currentSectionId(MENU, "/work/x")).toBe("services");
      expect(currentSectionId(MENU, "/blog/hello-world")).toBe("blog");
    });
    test("the longest match wins; / matches only itself; a lookalike prefix does not match", () => {
      expect(currentSectionId(MENU, "/blog/tag/news")).toBe("blogtags");
      expect(currentSectionId(MENU, "/")).toBe("home");
      expect(currentSectionId(MENU, "/contact")).toBeUndefined();
      expect(currentSectionId(MENU, "/blogging")).toBeUndefined();
    });
  });

  describe("placesFor", () => {
    test("the places a section names, in the places' own order", () => {
      expect(placesFor({ also: ["b", "a"] }, MENU.places).map((p) => p.id)).toEqual(["a", "b"]);
      expect(placesFor({}, MENU.places)).toEqual([]);
      expect(placesFor({ also: ["a"] })).toEqual([]);
    });
  });
});
