// @vitest-environment jsdom
// Ported from the source's `useLanguageInfos.s8fix.test.tsx`: the `useMarkIntent (F2)` block, 3 cases (the other 5 of that file are `useLanguageInfos`'s, in `language-entry`).
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ownsMark, useMarkIntent } from "./index";

describe("useMarkIntent (F2): the mark as it was last asked for", () => {
  it("starts as the stored value; a recorded intent stands until the store shows something new", () => {
    const { result, rerender } = renderHook(({ s }) => useMarkIntent(s), { initialProps: { s: { tag: "en", access: "public" as string | null } } });
    expect(result.current.current()).toEqual({ tag: "en", access: "public" });
    act(() => result.current.set({ tag: "no", access: "private" }));
    // a render with the SAME stored value (some other state changed): the intent is kept
    rerender({ s: { tag: "en", access: "public" } });
    expect(result.current.current()).toEqual({ tag: "no", access: "private" });
    // the store now shows the move: same thing
    rerender({ s: { tag: "no", access: "private" } });
    expect(result.current.current()).toEqual({ tag: "no", access: "private" });
    // the store shows something nobody here asked for (another tab): that is the mark now
    rerender({ s: { tag: "fr", access: "public" } });
    expect(result.current.current()).toEqual({ tag: "fr", access: "public" });
  });

  it("remembers which tag an entry put on the mark", () => {
    const { result } = renderHook(() => useMarkIntent({ tag: "", access: null }));
    expect(result.current.putBy("x")).toBeNull();
    act(() => result.current.put("x", "arb"));
    expect(result.current.putBy("x")).toBe("arb");
  });

  it("an entry owns the mark only while the mark is still the tag it put there (case aside); a mark that was never its own is not", () => {
    expect(ownsMark("en", { tag: "EN", access: null })).toBe(true);
    expect(ownsMark("en", { tag: "no", access: null })).toBe(false);
    expect(ownsMark(null, { tag: "en", access: null })).toBe(false);
    expect(ownsMark("", { tag: "", access: null })).toBe(false);
  });
});
