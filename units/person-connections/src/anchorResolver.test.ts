// The adapter against the platform's online-card anchor resolver (GET /base/connect/online-card-anchor?record=).
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { resolveOnlineCard, ONLINE_CARD_ANCHOR_PATH } from "./index";

const RECORD = "https://holder.example.test/base/e/rec1";
const ORIGIN = "https://id.example.test";

function platformAnswering(status: number, body: unknown, seen: string[] = []): PlatformClient {
  return {
    origin: ORIGIN,
    fetch: async (url, init) => {
      seen.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  };
}

describe("resolveOnlineCard", () => {
  it("asks the identity node once, with the record as the only input", async () => {
    const seen: string[] = [];
    await resolveOnlineCard(platformAnswering(404, { code: "no_online_card" }, seen), RECORD);
    expect(seen).toEqual([`GET ${ORIGIN}${ONLINE_CARD_ANCHOR_PATH}?record=${encodeURIComponent(RECORD)}`]);
  });
  it("a person answer carries the current principal", async () => {
    const out = await resolveOnlineCard(
      platformAnswering(200, { surface: "connect-online-card-anchor/1", kind: "person", principal: "https://ann.example.test/vault", vaultId: null, entity: "https://ann.example.test/vault", vaultRepresents: "t/Person" }),
      RECORD,
    );
    expect(out).toEqual({ kind: "person", principal: "https://ann.example.test/vault", entity: "https://ann.example.test/vault" });
  });
  it("an organization answer is carried as an organization (the seam of the organization slice), not as a person", async () => {
    const out = await resolveOnlineCard(
      platformAnswering(200, { surface: "connect-online-card-anchor/1", kind: "organization", principal: null, vaultId: "https://shop.example.test/base", entity: "https://shop.example.test/base/e/o1", vaultRepresents: "t/Organization" }),
      RECORD,
    );
    expect(out).toEqual({ kind: "organization", vaultId: "https://shop.example.test/base", entity: "https://shop.example.test/base/e/o1" });
  });
  it("the one 404 is 'none' whatever the reason (not yours, no link, nothing there): no reason is read from it", async () => {
    for (const body of [{ code: "no_online_card" }, { code: "something_else", message: "x" }, "not json"]) {
      expect(await resolveOnlineCard(platformAnswering(404, body), RECORD)).toEqual({ kind: "none" });
    }
  });
  it("401 is 'unauthenticated', 503 and a network failure are 'unavailable', never 'none'", async () => {
    expect(await resolveOnlineCard(platformAnswering(401, {}), RECORD)).toEqual({ kind: "unauthenticated" });
    expect(await resolveOnlineCard(platformAnswering(503, {}), RECORD)).toEqual({ kind: "unavailable", status: 503 });
    const down: PlatformClient = { origin: ORIGIN, fetch: async () => { throw new TypeError("offline"); } };
    expect(await resolveOnlineCard(down, RECORD)).toEqual({ kind: "unavailable", status: 0 });
  });
  it("branches on vaultRepresents (the resolver's contract), the kind word only as a fallback", async () => {
    const person = { surface: "connect-online-card-anchor/1", kind: "organization", principal: "https://ann.example.test/vault", vaultId: null, entity: "e", vaultRepresents: "https://veda.example.test/base/t/Person" };
    expect((await resolveOnlineCard(platformAnswering(200, person), RECORD)).kind).toBe("person");
    const org = { surface: "connect-online-card-anchor/1", kind: "person", principal: null, vaultId: "https://o.example.test/base", entity: "e", vaultRepresents: "https://veda.example.test/base/t/Organization" };
    expect((await resolveOnlineCard(platformAnswering(200, org), RECORD)).kind).toBe("organization");
  });
  it("a 200 that names no person and no organization is refused as unavailable, never guessed", async () => {
    expect(await resolveOnlineCard(platformAnswering(200, { kind: "robot" }), RECORD)).toEqual({ kind: "unavailable", status: 200 });
    expect(await resolveOnlineCard(platformAnswering(200, { kind: "person", principal: "" }), RECORD)).toEqual({ kind: "unavailable", status: 200 });
    expect(await resolveOnlineCard(platformAnswering(200, "[]"), RECORD)).toEqual({ kind: "unavailable", status: 200 });
  });
  it("does not ask without a record", async () => {
    const seen: string[] = [];
    expect(await resolveOnlineCard(platformAnswering(200, {}, seen), "")).toEqual({ kind: "none" });
    expect(seen).toEqual([]);
  });
});
