import { describe, expect, it } from "vitest";
import {
  PAGE_WALK_MAX_PAGES,
  pageWindowParams,
  windowExhausted,
  withPageWindow,
} from "./pageWindow";

describe("windowExhausted", () => {
  it("stops when the returned count reaches the total, and not before", () => {
    expect(windowExhausted(0, 30, 30)).toBe(true);
    expect(windowExhausted(20, 10, 30)).toBe(true);
    expect(windowExhausted(0, 30, 31)).toBe(false);
    expect(windowExhausted(0, 0, 0)).toBe(true);
  });

  it("uses the count that came back, so a short page does not look finished", () => {
    expect(windowExhausted(0, 10, 50)).toBe(false);
  });
});

describe("pageWindowParams", () => {
  it("writes offset and limit, including zero", () => {
    expect(pageWindowParams({ offset: 0, limit: 30 })).toBe("offset=0&limit=30");
    expect(pageWindowParams({ offset: 30, limit: 30 })).toBe("offset=30&limit=30");
  });

  it("omits offset when the walk is limit-only, and still writes a zero limit", () => {
    expect(pageWindowParams({ offset: 0, limit: 30 }, false)).toBe("limit=30");
    expect(pageWindowParams({ offset: 0, limit: 0 }, false)).toBe("limit=0");
  });
});

describe("withPageWindow", () => {
  it("chooses ? or & by looking at the URL", () => {
    expect(withPageWindow("https://example.test/items", { offset: 0, limit: 30 })).toBe(
      "https://example.test/items?offset=0&limit=30",
    );
    expect(withPageWindow("https://example.test/items?a=1", { offset: 30, limit: 30 })).toBe(
      "https://example.test/items?a=1&offset=30&limit=30",
    );
  });
});

describe("PAGE_WALK_MAX_PAGES", () => {
  it("is 50", () => {
    expect(PAGE_WALK_MAX_PAGES).toBe(50);
  });
});
