// Ported from GilbApp `attributeFind.origin.d8.test.ts` (all 3). The app's version set the build environment and wrapped `./dpop`; here
// the platform origin is a setting and the credential is the fake host of `test/support.ts`, whose `dpopReadAuth` records the URL it
// was asked to sign for (a fake of the credential, not of the routing). The `htuFor` check (the proof's `htu` host) belongs to the
// replaced DPoP module and is not taken.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findByAttribute } from "./attributeFind";
import { ORIGIN as PROD_ORIGIN, setUp, tearDown } from "../test/support";

const HOST_B = "https://hytta.platform.example.test";

let host: ReturnType<typeof setUp>;
beforeEach(() => {
  host = setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

function prod(status = 200) {
  const fetched: string[] = [];
  let first = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      const s = first ? status : 200;
      first = false;
      return new Response(JSON.stringify({ count: 1, ids: [`${HOST_B}/base/e/06gk1`] }), { status: s });
    }),
  );
  const signed = host.dpopReadAuth.mock.calls;
  return { findByAttribute, signed, fetched, host };
}

describe("Delta8 B1: find-by-attribute at the vault's own host", () => {
  it("🔴 given host B, the request goes to B and the proof is signed for B, ⛔ never the apex", async () => {
    const { signed, fetched } = prod();
    await findByAttribute("a:heldParty", { "@id": `${HOST_B}/base/e/tom` }, { limit: 200 }, HOST_B);
    expect(fetched).toHaveLength(1);
    expect(new URL(fetched[0]!).origin).toBe(HOST_B);
    expect(signed.map((c) => c[1])).toEqual(fetched);
    expect(signed.map((c) => c[0])).toEqual(["GET"]);
    expect(fetched[0]).not.toContain("://platform.example.test/");
  });

  it("the 400 retry (older Base, no paging) stays at host B", async () => {
    const { fetched, signed } = prod(400);
    await findByAttribute("a:heldParty", { "@id": "x" }, { limit: 200 }, HOST_B);
    expect(fetched).toHaveLength(2);
    for (const u of fetched) expect(new URL(u).origin).toBe(HOST_B);
    expect(signed.map((c) => c[1])).toEqual(fetched);
  });

  it("⚠ control: with no host given, the find still asks the apex (other callers unchanged)", async () => {
    const { fetched } = prod();
    await findByAttribute("a:x", "v");
    expect(new URL(fetched[0]!).origin).toBe(PROD_ORIGIN);
  });
});
