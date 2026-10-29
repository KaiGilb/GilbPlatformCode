// New. The anchor share of an open card drops a FAILED answer at once, also when the resolver itself throws (the resolver of
// `person-connections` answers a failure of the request as an outcome, and rethrows anything else; here it is replaced to throw), so
// "Try again" asks again; a share already replaced by a newer ask is not cleared by the older one's failure.
import { describe, expect, it, vi } from "vitest";

const resolveOnlineCard = vi.hoisted(() => vi.fn());
vi.mock("@kaigilb/gilbplatformcode-person-connections", async (orig) => ({ ...((await orig()) as object), resolveOnlineCard }));
import { forgetAnchor, sharedAnchor, type AnchorShare } from "./personCard";
import { installPlatformHooks } from "../test/support";

installPlatformHooks();
const REC = "https://ann.example.test/base/e/r1";

describe("sharedAnchor and a resolver that throws", () => {
  it("the failure reaches the asker and is not kept: the next ask is sent again", async () => {
    resolveOnlineCard.mockReset();
    resolveOnlineCard.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ kind: "none" });
    const share: AnchorShare = { answer: null };
    await expect(sharedAnchor(share, REC)).rejects.toThrow("boom");
    expect(share.answer).toBeNull();
    expect((await sharedAnchor(share, REC)).kind).toBe("none");
    expect(resolveOnlineCard).toHaveBeenCalledTimes(2);
  });
  it("a failure after the share was forgotten does not clear the newer answer", async () => {
    resolveOnlineCard.mockReset();
    let fail: (e: Error) => void = () => undefined;
    resolveOnlineCard.mockImplementationOnce(() => new Promise((_r, rej) => (fail = rej)));
    const share: AnchorShare = { answer: null };
    const old = sharedAnchor(share, REC);
    old.catch(() => undefined);
    forgetAnchor(share);
    resolveOnlineCard.mockResolvedValueOnce({ kind: "person", principal: "p", entity: "e" });
    const fresh = await sharedAnchor(share, REC);
    fail(new Error("late"));
    await expect(old).rejects.toThrow("late");
    expect(share.answer).not.toBeNull();
    expect(await share.answer).toBe(fresh);
  });
  it("an answer that is a person, an organization or none is kept for the open card; any other is dropped", async () => {
    resolveOnlineCard.mockReset();
    resolveOnlineCard.mockResolvedValueOnce({ kind: "busy", retryAfterMs: null }).mockResolvedValueOnce({ kind: "organization", vaultId: "v", entity: "e" });
    const share: AnchorShare = { answer: null };
    expect((await sharedAnchor(share, REC)).kind).toBe("busy");
    expect(share.answer).toBeNull();
    expect((await sharedAnchor(share, REC)).kind).toBe("organization");
    expect(share.answer).not.toBeNull();
    expect((await sharedAnchor(share, REC)).kind).toBe("organization");
    expect(resolveOnlineCard).toHaveBeenCalledTimes(2);
  });
});
