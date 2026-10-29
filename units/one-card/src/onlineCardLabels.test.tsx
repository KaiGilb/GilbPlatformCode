// The words an online card's fields are shown with, and the one fact key the card keeps to itself.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const attributeLabel = vi.hoisted(() => vi.fn<(bare: string) => Promise<string | null>>());
vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({ ...((await orig()) as object), attributeLabel }));
import { ONLINE_CARD_LINK_KEY, isOnlineCardLinkKey, onlineCardLabelFor, useOnlineCardLabelFor } from "./onlineCardLabels";

const FIELDS = [
  { label: "Given name", factKeys: ["givenName"] },
  { label: null, factKeys: ["nickname"] },
  { label: "Email", factKeys: ["email", "mail"] },
];
const turns = async () => {
  for (let i = 0; i < 4; i++) await new Promise<void>((r) => setTimeout(r, 0));
};

beforeEach(() => attributeLabel.mockReset());

describe("the link key", () => {
  it("is sameAs, bare or framed, and nothing else", () => {
    expect(ONLINE_CARD_LINK_KEY).toBe("sameAs");
    expect(isOnlineCardLinkKey("sameAs")).toBe(true);
    expect(isOnlineCardLinkKey("a:sameAs")).toBe(true);
    expect(isOnlineCardLinkKey("a:sameAsX")).toBe(false);
    expect(isOnlineCardLinkKey("name")).toBe(false);
    expect(isOnlineCardLinkKey("")).toBe(false);
  });
});

describe("onlineCardLabelFor", () => {
  it("is the field set's label for a predicate, bare or framed", () => {
    expect(onlineCardLabelFor(FIELDS, "a:givenName")).toBe("Given name");
    expect(onlineCardLabelFor(FIELDS, "givenName")).toBe("Given name");
    expect(onlineCardLabelFor(FIELDS, "mail")).toBe("Email");
  });
  it("is empty when no field names it, or the field has no label", () => {
    expect(onlineCardLabelFor(FIELDS, "a:nickname")).toBe("");
    expect(onlineCardLabelFor(FIELDS, "a:unknown")).toBe("");
    expect(onlineCardLabelFor([], "a:givenName")).toBe("");
  });
});

describe("useOnlineCardLabelFor", () => {
  it("answers the field set's label at once and asks the master nothing", () => {
    const { result } = renderHook(() => useOnlineCardLabelFor(FIELDS));
    expect(result.current("a:givenName")).toBe("Given name");
    expect(attributeLabel).not.toHaveBeenCalled();
  });
  it("asks the master once for a predicate the set does not label, shows '' until it answers, then redraws with the label", async () => {
    attributeLabel.mockResolvedValue("Nick");
    let draws = 0;
    const { result } = renderHook(() => {
      draws += 1;
      return useOnlineCardLabelFor(FIELDS);
    });
    expect(result.current("a:nickname")).toBe("");
    expect(result.current("a:nickname")).toBe("");
    expect(attributeLabel).toHaveBeenCalledTimes(1);
    expect(attributeLabel).toHaveBeenCalledWith("nickname");
    const before = draws;
    await act(turns);
    expect(draws).toBeGreaterThan(before);
    expect(result.current("a:nickname")).toBe("Nick");
    expect(attributeLabel).toHaveBeenCalledTimes(1);
  });
  it("a master that has no label, or fails, leaves '' and is not asked again", async () => {
    attributeLabel.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useOnlineCardLabelFor(FIELDS));
    expect(result.current("a:one")).toBe("");
    expect(result.current("a:two")).toBe("");
    await act(turns);
    expect(result.current("a:one")).toBe("");
    expect(result.current("a:two")).toBe("");
    expect(attributeLabel).toHaveBeenCalledTimes(2);
  });
  it("the function is stable until the field set changes", () => {
    const { result, rerender } = renderHook((p: { f: typeof FIELDS }) => useOnlineCardLabelFor(p.f), { initialProps: { f: FIELDS } });
    const first = result.current;
    rerender({ f: FIELDS });
    expect(result.current).toBe(first);
    rerender({ f: [...FIELDS] });
    expect(result.current).not.toBe(first);
  });
});
