// The canonicaliser tells "no person" (an answer) from "could not ask" (not an answer),
// so a list reader can flag a person whose old spelling could not be checked instead of drawing two rows silently.
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { createPrincipalCanonicaliser } from "./index";

const IDENTITY = "https://id.example.test";
const ANN = "https://ann.example.test/vault";
const ANN_OLD = "https://ann.example.test/i";
const GROUP = "https://group.example.test/vault";

describe("createPrincipalCanonicaliser().answered", () => {
  it("a 200 and a 404 are answers; a 503, an unreachable node and a member never asked are not", async () => {
    let down = true;
    const platform: PlatformClient = {
      origin: IDENTITY,
      fetch: async (url) => {
        const input = new URL(url).searchParams.get("input");
        if (input === GROUP) return new Response(JSON.stringify({ code: "not_a_person" }), { status: 404 });
        if (input === "https://down.example.test/vault") throw new TypeError("fetch failed");
        if (down) return new Response("{}", { status: 503 });
        return new Response(JSON.stringify({ principal: ANN }), { status: 200 });
      },
    };
    const c = createPrincipalCanonicaliser(platform);
    expect(c.answered(ANN_OLD)).toBe(false);
    expect(await c(GROUP)).toBeNull();
    expect(c.answered(GROUP)).toBe(true);
    expect(await c(ANN_OLD)).toBeNull();
    expect(c.answered(ANN_OLD)).toBe(false);
    expect(await c("https://down.example.test/vault")).toBeNull();
    expect(c.answered("https://down.example.test/vault")).toBe(false);
    down = false;
    expect(await c(ANN_OLD)).toBe(ANN);
    expect(c.answered(ANN_OLD)).toBe(true);
  });

  it("a member past the lookup limit is not answered", async () => {
    const platform: PlatformClient = { origin: IDENTITY, fetch: async () => new Response(JSON.stringify({ principal: ANN }), { status: 200 }) };
    const c = createPrincipalCanonicaliser(platform, { maxLookups: 1 });
    expect(await c(ANN_OLD)).toBe(ANN);
    expect(await c("https://other.example.test/i")).toBeNull();
    expect(c.answered("https://other.example.test/i")).toBe(false);
    expect(c.answered(ANN_OLD)).toBe(true);
  });
});
