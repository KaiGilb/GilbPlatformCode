import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("names exactly what the README lists", () => {
    expect(Object.keys(unit).sort()).toEqual(["SOCIAL_LOGOS", "SocialLogo", "socialPlatformName"]);
  });
  it("the logo is a function component and the name reader a function", () => {
    expect(typeof unit.SocialLogo).toBe("function");
    expect(typeof unit.socialPlatformName).toBe("function");
  });
});
