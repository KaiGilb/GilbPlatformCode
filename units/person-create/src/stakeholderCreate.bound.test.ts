// A BoundTimeoutError shown to the person names the step. No address, no class name.
import { describe, expect, it } from "vitest";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { BoundTimeoutError } from "@kaigilb/gilbplatformcode-lws-relations";
import { stakeholderErrorText } from "./stakeholderCreate";

describe("stakeholderErrorText — a bound that did not answer", () => {
  it("names the step, including the example for signing in", () => {
    expect(stakeholderErrorText(new BoundTimeoutError("signing in"))).toBe(
      "Signing in did not answer within 10 s; nothing was created. Try again.",
    );
  });

  it("reads a BoundTimeoutError anywhere in the cause chain, and drops the address", () => {
    const inner = new BoundTimeoutError("signing in");
    const mid = new Error("mid", { cause: inner });
    const outer = new Error("GET http://holder.example.test/base/tag/resolve?tagString=ann could not be reached", { cause: mid });
    const text = stakeholderErrorText(outer);
    expect(text).toBe("Signing in did not answer within 10 s; nothing was created. Try again.");
    expect(text).not.toMatch(/https?:|BoundTimeoutError/);
  });

  it("reads the class name the package stringifies into the request error", () => {
    const err = new PlatformError(
      "GET http://holder.example.test/base/tag/resolve?tagString=ann&vault=x could not be reached: BoundTimeoutError: creating the DPoP proof timed out",
      0,
      "http://holder.example.test/base/tag/resolve?tagString=ann&vault=x",
      "",
    );
    const text = stakeholderErrorText(err);
    expect(text).toBe("Signing the request did not answer within 10 s; nothing was created. Try again.");
    expect(text).not.toMatch(/https?:|BoundTimeoutError|DPoP/);
  });

  it("leaves an ordinary failure in its own words", () => {
    expect(stakeholderErrorText(new Error("the vault did not answer"))).toBe("the vault did not answer");
  });
});
