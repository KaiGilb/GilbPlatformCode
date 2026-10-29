// A bound after held field records but BEFORE the person was written must not say "Do not create it again".
// A partial create that is not a bound (the tag route answered 500) shows no address.
import { describe, expect, it } from "vitest";
import { PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { stakeholderErrorText } from "./stakeholderCreate";

const stuckProof = (method: string, url: string) =>
  new PlatformError(`${method} ${url} could not be reached: BoundTimeoutError: creating the DPoP proof timed out`, 0, url, "");

describe("partials that are not bounds", () => {
  it("the person record was NOT written (only a held field record): the text does not tell the person not to create it", () => {
    const held = "https://holder.example.test/vault/e/06held";
    const err = new PartialCreateError("the record could not be created after 1 record(s) a field holds were written", {
      record: null,
      written: [held],
      vaultId: "holder",
      cause: stuckProof("POST", "https://holder.example.test/lws/vault/x/c"),
    });
    const text = stakeholderErrorText(err, "create", "Ann");
    expect(text).not.toMatch(/Do not create it again/);
    expect(text).toMatch(/not created|was not written|no record/i);
    expect(text).toBe("“Ann” was not created (signing the request did not answer within 10 s); only the other person details were saved. Try again.");
    expect(text).not.toMatch(/https?:/);
  });

  it("a partial create whose tag route answered 500 shows no address and says not to create it again", () => {
    const record = "https://holder.example.test/vault/e/06abc";
    // The package no longer registers a tag; its partial is "its tag could not be read or made" (the master read or ensure failed).
    const err = new PartialCreateError(`${record} was created and its tag could not be read or made`, {
      record,
      written: [record],
      vaultId: "holder",
      cause: new PlatformError(`POST https://holder.example.test/base/tag/ensure answered 500`, 500, "https://holder.example.test/base/tag/ensure", "{}"),
    });
    const text = stakeholderErrorText(err, "create", "Ann");
    expect(text).not.toMatch(/https?:/);
    expect(text).toMatch(/Do not create it again/);
    // A 500 of ensure says nothing about whether a tag was made, so "It has no tag" is NOT said (it was, before).
    expect(text).toBe("“Ann” was created, but its tag could not be read or made. Do not create it again.");
  });

  it("'It has no tag' is said ONLY when the master read answered no tag and the platform then refused (4xx) to make one", () => {
    const record = "https://holder.example.test/vault/e/06abc";
    const partial = (cause: unknown) =>
      new PartialCreateError(`${record} was created and its tag could not be read or made`, { record, written: [record], vaultId: "holder", cause });
    const platform = (method: string, path: string, status: number) =>
      new PlatformError(`${method} https://holder.example.test${path} answered ${status}`, status, `https://holder.example.test${path}`, "{}");
    const said = (cause: unknown) => stakeholderErrorText(partial(cause), "create", "Ann");
    // ensure refused (403, 400): the read said none, the platform would not make one
    expect(said(platform("POST", "/base/tag/ensure", 403))).toBe("“Ann” was created, but its tag could not be read or made. It has no tag. Do not create it again.");
    expect(said(platform("POST", "/base/tag/ensure", 400))).toContain("It has no tag.");
    // ensure 5xx (a tag may have been made), the master read itself failed, a timeout, no cause: nothing is claimed
    for (const cause of [platform("POST", "/base/tag/ensure", 500), platform("GET", "/base/tag/master", 500), platform("GET", "/base/tag/master", 403), null, new Error("boom")]) {
      expect(said(cause)).not.toMatch(/no tag/i);
      expect(said(cause)).toBe("“Ann” was created, but its tag could not be read or made. Do not create it again.");
    }
    // a step that timed out is said as a timeout, and still claims nothing about the tag
    expect(said(stuckProof("POST", "http://holder.example.test/base/tag/ensure"))).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. Do not create it again.",
    );
  });

  it("the partial names each step that was not written, and never a tag control", () => {
    const record = "https://holder.example.test/base/e/06abc";
    const err = new PartialCreateError(`${record} was created and its tag "ann" could not be registered`, {
      record,
      written: [record],
      vaultId: "holder",
      cause: stuckProof("POST", "http://holder.example.test/base/tag/attach"),
    });
    expect(stakeholderErrorText(err, "create", "Ann", { kinds: ["Colleague"], linkTo: "Ben" })).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. Its kind “Colleague” and the link to “Ben” were not written; add the kind and the link on its card. Do not create it again.",
    );
    expect(stakeholderErrorText(err, "create", "Ann", { kinds: ["Colleague"] })).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. Its kind “Colleague” was not written; add the kind on its card. Do not create it again.",
    );
    expect(stakeholderErrorText(err, "create", "Ann", { linkTo: "Ben" })).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. The link to “Ben” was not written; add the link on its card. Do not create it again.",
    );
  });

  it("a tag that could not be read or made names the kind and the link and shows no address", () => {
    const record = "https://holder.example.test/vault/e/06abc";
    const err = new PartialCreateError(`${record} was created and its tag could not be read or made`, {
      record,
      written: [record],
      vaultId: "holder",
      cause: new PlatformError("POST https://holder.example.test/base/tag/ensure answered 403", 403, "https://holder.example.test/base/tag/ensure", "{}"),
    });
    const text = stakeholderErrorText(err, "create", "Ann", { kinds: ["Colleague"], linkTo: "Ben" });
    expect(text).toBe(
      "“Ann” was created, but its tag could not be read or made. It has no tag, and its kind “Colleague” and the link to “Ben” were not written; add the kind and the link on its card. Do not create it again.",
    );
    expect(text).not.toMatch(/https?:/);
  });
});
