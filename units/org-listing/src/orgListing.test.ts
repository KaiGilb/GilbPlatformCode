import { describe, expect, it } from "vitest";
import { isOrgListing, listingFromBody } from "./orgListing";

describe("org listing", () => {
  it("accepts only the two exact spellings", () => {
    expect(isOrgListing("public")).toBe(true);
    expect(isOrgListing("private")).toBe(true);
    expect(isOrgListing("Public")).toBe(false);
    expect(isOrgListing("private ")).toBe(false);
    expect(isOrgListing("")).toBe(false);
    expect(isOrgListing(null)).toBe(false);
    expect(isOrgListing(undefined)).toBe(false);
  });

  it("shows a bad body as public, which is the same word as a stored public", () => {
    expect(listingFromBody("private")).toBe("private");
    expect(listingFromBody("public")).toBe("public");
    expect(listingFromBody(undefined)).toBe("public");
    expect(listingFromBody(null)).toBe("public");
    expect(listingFromBody("Public")).toBe("public");
    expect(listingFromBody("")).toBe("public");
  });
});
