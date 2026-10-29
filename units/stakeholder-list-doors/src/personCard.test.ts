// The person card resolver's wiring: the connections are read once per holder per session at the holder's OWN vault; a failed read is not
// kept; one open card asks the resolver once (its controller and its chips share the answer).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { __resetPersonCardSession, forgetAnchor, sessionConnections, sharedAnchor, type AnchorShare } from "./personCard";
import { installPlatformHooks } from "../test/support";

installPlatformHooks();

const HOLDER = "https://id.platform.example.test/base/p/holder";
const OWN = "https://holder.platform.example.test/vault";
const RECORD = "https://holder.platform.example.test/vault/e/rec";

let seen: string[];
let answer: { status: number; body: unknown };

beforeEach(() => {
  __resetPersonCardSession();
  seen = [];
  answer = { status: 200, body: { holder: HOLDER, vaultId: OWN, sets: [] } };
  vi.stubGlobal("fetch", async (url: string) => {
    seen.push(url);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sessionConnections", () => {
  it("reads at the holder's own vault's node, naming the vault, ONCE for the session", async () => {
    const qc = new QueryClient();
    await sessionConnections(qc, HOLDER, OWN);
    await sessionConnections(qc, HOLDER, OWN);
    await Promise.all([sessionConnections(qc, HOLDER, OWN), sessionConnections(qc, HOLDER, OWN)]);
    expect(seen).toEqual([`https://holder.platform.example.test/base/connect/audience-rung/members?vaultId=${encodeURIComponent(OWN)}`]);
  });

  it("a FAILED read is not kept: the next card asks again", async () => {
    const qc = new QueryClient();
    answer = { status: 500, body: {} };
    await expect(sessionConnections(qc, HOLDER, OWN)).rejects.toThrow();
    answer = { status: 200, body: { holder: HOLDER, vaultId: OWN, sets: [] } };
    await expect(sessionConnections(qc, HOLDER, OWN)).resolves.toMatchObject({ holder: HOLDER });
    expect(seen.length).toBe(2);
  });
});

describe("sharedAnchor (one open card)", () => {
  const person = { surface: "x", kind: "person", principal: "https://k.platform.example.test/vault", vaultId: null, entity: "e", vaultRepresents: "t/Person" };

  it("the card and its chips share ONE resolver request; a new card open (new share) asks again", async () => {
    answer = { status: 200, body: person };
    const share: AnchorShare = { answer: null };
    const [a, b] = await Promise.all([sharedAnchor(share, RECORD), sharedAnchor(share, RECORD)]);
    expect(a).toEqual(b);
    await sharedAnchor(share, RECORD);
    expect(seen.length).toBe(1);
    await sharedAnchor({ answer: null }, RECORD);
    expect(seen.length).toBe(2);
  });

  it("a failure is dropped at once (Try again asks again); a link change forgets the answer", async () => {
    const share: AnchorShare = { answer: null };
    answer = { status: 503, body: {} };
    expect((await sharedAnchor(share, RECORD)).kind).toBe("unavailable");
    answer = { status: 200, body: person };
    expect((await sharedAnchor(share, RECORD)).kind).toBe("person");
    expect(seen.length).toBe(2);
    forgetAnchor(share);
    await sharedAnchor(share, RECORD);
    expect(seen.length).toBe(3);
  });
});
