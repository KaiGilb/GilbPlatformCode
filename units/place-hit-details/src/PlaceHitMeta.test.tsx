// @vitest-environment jsdom
// New. The component has no test of its own in GilbApp (the pickers' tests read its text). Pins the shape those tests read.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PlaceHitMeta, type PlaceHitDetail } from "./index";

afterEach(cleanup);
const d = (over: Partial<PlaceHitDetail>): PlaceHitDetail => ({ id: "x", kind: "municipality", container: ["Norway"], state: "named", partial: false, position: null, ...over });

describe("PlaceHitMeta", () => {
  it("the kind is strong and the rest is the line `placeHitLine` makes", () => {
    const { container } = render(<PlaceHitMeta detail={d({})} />);
    expect(container.querySelector("span")?.textContent).toBe("municipality");
    expect(container.textContent).toBe("municipality · in Norway");
  });
  it("no detail: the fallback, or nothing", () => {
    expect(render(<PlaceHitMeta detail={undefined} fallback="city" />).container.textContent).toBe("city");
    cleanup();
    expect(render(<PlaceHitMeta detail={undefined} />).container.textContent).toBe("");
  });
  it("a hit whose kind is unknown draws the line alone", () => {
    expect(render(<PlaceHitMeta detail={d({ kind: null, state: "none-recorded", container: [] })} />).container.textContent).toBe("no containing place recorded");
  });
  it("a container not read is said, not left out", () => {
    expect(render(<PlaceHitMeta detail={d({ state: "unavailable", container: [] })} />).container.textContent).toBe("municipality · where: not read");
  });
});
