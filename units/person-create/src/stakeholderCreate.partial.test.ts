// A stuck proof AFTER the record was written must not read "nothing was created".
import { describe, expect, it } from "vitest";
import { PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { BoundTimeoutError } from "@kaigilb/gilbplatformcode-lws-relations";
import { stakeholderErrorText } from "./stakeholderCreate";

const stuckProof = (method: string, url: string) =>
  new PlatformError(`${method} ${url} could not be reached: BoundTimeoutError: creating the DPoP proof timed out`, 0, url, "");

describe("a stuck proof after a write", () => {
  it("the record was written and its tag timed out: the text does not say nothing was created", () => {
    const record = "https://holder.example.test/base/e/06abc";
    const err = new PartialCreateError(`${record} was created and its tag "ann" could not be registered`, {
      record,
      written: [record],
      vaultId: "holder",
      cause: stuckProof("POST", "http://holder.example.test/base/tag/attach"),
    });
    const text = stakeholderErrorText(err);
    expect(text).not.toMatch(/nothing was created/i);
  });

  it("the record was written and its read-back timed out: the text does not say nothing was created", () => {
    const record = "https://holder.example.test/base/e/06abd";
    const err = new PartialCreateError(`the record was created at ${record} and could not be read back`, {
      record,
      written: [record],
      vaultId: "holder",
      cause: stuckProof("GET", record),
    });
    expect(stakeholderErrorText(err)).not.toMatch(/nothing was created/i);
  });

  it("control — a stuck proof before any write still says nothing was created", () => {
    expect(stakeholderErrorText(new BoundTimeoutError("creating the DPoP proof"))).toMatch(/nothing was created/);
  });

  it("the partial sentence names the person, the step, and the card", () => {
    const record = "https://holder.example.test/base/e/06abc";
    const err = new PartialCreateError(`${record} was created and its tag "ann" could not be registered`, {
      record,
      written: [record],
      vaultId: "holder",
      cause: stuckProof("POST", "http://holder.example.test/base/tag/attach"),
    });
    expect(stakeholderErrorText(err, "create", "Ann")).toBe(
      "“Ann” was created, but signing the request did not answer within 10 s. Do not create it again.",
    );
    expect(stakeholderErrorText(err, "create", "Ann")).not.toMatch(/give it a tag|tag on its card/);
  });

  it("a lookup names the step in plain words and does not say to try again", () => {
    const text = stakeholderErrorText(new BoundTimeoutError("creating the DPoP proof"), "lookup");
    expect(text).toBe("Could not look up matches: signing the request did not answer within 10 s.");
    expect(text).not.toMatch(/nothing was created|Try again|DPoP/);
  });

  it("a bound that carries a record id does not say nothing was created", () => {
    const err = new BoundTimeoutError("creating the DPoP proof") as BoundTimeoutError & { record: string };
    err.record = "https://holder.example.test/base/e/06abc";
    expect(stakeholderErrorText(err, "create", "Ann")).not.toMatch(/nothing was created/i);
  });
});
