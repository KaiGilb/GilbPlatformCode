// The person's online card as the platform serves it (GET /base/connect/public-card?principal=), read at the VIEWER's rung
// (the app's authenticated fetch), read-only, and the candidates a find-by-name shows.
import { describe, expect, it } from "vitest";
import { readOnlineCard, ONLINE_CARD_READ_PATH, cardName, contactPointsOf } from "./publicCard";
import { findOnlineCardCandidates, findOnlineCardResult, FIND_BY_NAME_PATH, MAX_CANDIDATES } from "./find";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const ORIGIN = "https://id.example.test";
const ANN = "https://ann.example.test/vault";
const BEN = "https://ben.example.test/vault";

const cardBody = (principal: string, given: string, family: string, extra: unknown[] = []) => ({
  principal,
  viewer: "https://holder.example.test/vault",
  fields: [
    { principal, field: "a:givenName", value: given, sourceEntity: `${principal}/e/gn`, claimVaultId: principal, rung: "public" },
    { principal, field: "a:familyName", value: family, sourceEntity: `${principal}/e/fn`, claimVaultId: principal, rung: "public" },
    ...extra,
  ],
  skills: [],
  photoUrl: null,
});

function router(routes: Record<string, (url: URL) => { status: number; body: unknown }>, log: string[] = []): PlatformClient {
  return {
    origin: ORIGIN,
    fetch: async (url) => {
      const u = new URL(url);
      log.push(`${u.pathname}${u.search}`);
      const r = routes[u.pathname]?.(u) ?? { status: 404, body: {} };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    },
  };
}

describe("readOnlineCard", () => {
  it("is one GET of the card route keyed by the principal, nothing else", async () => {
    const log: string[] = [];
    const p = router({ [ONLINE_CARD_READ_PATH]: () => ({ status: 200, body: cardBody(ANN, "Ann", "Lund") }) }, log);
    const out = await readOnlineCard(p, ANN);
    expect(log).toEqual([`${ONLINE_CARD_READ_PATH}?principal=${encodeURIComponent(ANN)}`]);
    expect(out.kind).toBe("card");
  });
  it("keeps exactly the fields the server returned, each with the rung that travelled and its source claim", async () => {
    const p = router({
      [ONLINE_CARD_READ_PATH]: () => ({
        status: 200,
        body: cardBody(ANN, "Ann", "Lund", [
          { principal: ANN, field: "a:email", value: "ann@example.org", sourceEntity: "https://ann.example.test/base/e/pfc1", claimVaultId: ANN, rung: "t:SignedInGrantee", kind: "email" },
        ]),
      }),
    });
    const out = await readOnlineCard(p, ANN);
    if (out.kind !== "card") throw new Error("expected a card");
    expect(out.card.fields.map((f) => [f.predicate, f.value, f.rung, f.sourceEntity])).toEqual([
      ["a:givenName", "Ann", "public", `${ANN}/e/gn`],
      ["a:familyName", "Lund", "public", `${ANN}/e/fn`],
      ["a:email", "ann@example.org", "t:SignedInGrantee", "https://ann.example.test/base/e/pfc1"],
    ]);
    expect(cardName(out.card)).toBe("Ann Lund");
  });
  it("drops a field of another principal (the card is the party's only), and a field with no text", async () => {
    const p = router({
      [ONLINE_CARD_READ_PATH]: () => ({
        status: 200,
        body: cardBody(ANN, "Ann", "N", [
          { principal: BEN, field: "a:email", value: "ben@example.org", sourceEntity: "x", claimVaultId: BEN, rung: "public" },
          { principal: ANN, field: "a:phone", value: "  ", sourceEntity: "y", claimVaultId: ANN, rung: "public" },
        ]),
      }),
    });
    const out = await readOnlineCard(p, ANN);
    if (out.kind !== "card") throw new Error("expected a card");
    expect(out.card.fields.map((f) => f.predicate)).toEqual(["a:givenName", "a:familyName"]);
  });
  it("the name comes first (given, then family), the rest in the server's order", async () => {
    const f = (field: string, value: string) => ({ principal: ANN, field, value, sourceEntity: field, claimVaultId: ANN, rung: "public" });
    const p = router({ [ONLINE_CARD_READ_PATH]: () => ({ status: 200, body: { principal: ANN, fields: [f("a:email", "k@x.org"), f("a:familyName", "N"), f("a:phone", "1"), f("a:givenName", "K")], skills: [] } }) });
    const out = await readOnlineCard(p, ANN);
    if (out.kind !== "card") throw new Error("expected a card");
    expect(out.card.fields.map((x) => x.predicate)).toEqual(["a:givenName", "a:familyName", "a:email", "a:phone"]);
  });
  it("the same predicate, value and rung named twice is one line; a different value or rung is never merged", async () => {
    const dup = { principal: ANN, field: "a:email", value: "k@x.org", sourceEntity: "e1", claimVaultId: ANN, rung: "public" };
    const p = router({
      [ONLINE_CARD_READ_PATH]: () => ({
        status: 200,
        body: cardBody(ANN, "Ann", "N", [dup, { ...dup, sourceEntity: "e2" }, { ...dup, value: "other@x.org" }, { ...dup, rung: "t:SignedInGrantee" }]),
      }),
    });
    const out = await readOnlineCard(p, ANN);
    if (out.kind !== "card") throw new Error("expected a card");
    expect(out.card.fields.filter((f) => f.predicate === "a:email").map((f) => [f.value, f.rung])).toEqual([
      ["k@x.org", "public"],
      ["other@x.org", "public"],
      ["k@x.org", "t:SignedInGrantee"],
    ]);
  });
  it("404 is 'none' (a vault that is not a person, or no such person); other failures are 'unavailable', never 'none'", async () => {
    expect(await readOnlineCard(router({ [ONLINE_CARD_READ_PATH]: () => ({ status: 404, body: { code: "not_a_person" } }) }), ANN)).toEqual({ kind: "none" });
    expect(await readOnlineCard(router({ [ONLINE_CARD_READ_PATH]: () => ({ status: 500, body: {} }) }), ANN)).toEqual({ kind: "unavailable", status: 500 });
    const down: PlatformClient = { origin: ORIGIN, fetch: async () => { throw new TypeError("x"); } };
    expect(await readOnlineCard(down, ANN)).toEqual({ kind: "unavailable", status: 0 });
  });
  it("a card with no field at the viewer's rung is a card with nothing to show (not 'none')", async () => {
    const out = await readOnlineCard(router({ [ONLINE_CARD_READ_PATH]: () => ({ status: 200, body: { principal: ANN, fields: [], skills: [] } }) }), ANN);
    expect(out.kind).toBe("card");
    if (out.kind === "card") expect(out.card.fields).toEqual([]);
  });
  it("contact points are the email, phone and online-account fields the card shows", async () => {
    const p = router({
      [ONLINE_CARD_READ_PATH]: () => ({
        status: 200,
        body: cardBody(ANN, "Ann", "N", [
          { principal: ANN, field: "a:email", value: "k@x.org", sourceEntity: "e1", claimVaultId: ANN, rung: "public", kind: "email" },
          { principal: ANN, field: "a:phone", value: "+47 1", sourceEntity: "e2", claimVaultId: ANN, rung: "public", kind: "phone" },
          { principal: ANN, field: "a:jobTitle", value: "CTO", sourceEntity: "e3", claimVaultId: ANN, rung: "public" },
        ]),
      }),
    });
    const out = await readOnlineCard(p, ANN);
    if (out.kind !== "card") throw new Error("expected a card");
    expect(contactPointsOf(out.card).map((c) => c.value)).toEqual(["k@x.org", "+47 1"]);
  });
});

describe("findOnlineCardCandidates", () => {
  const find = (url: URL) => {
    const name = url.searchParams.get("name");
    if (name === "ann")
      return {
        status: 200,
        body: {
          total: 3,
          connectVaultId: "x",
          matches: [
            { principal: ANN, field: "a:givenName", value: "Ann", sourceEntity: "e1", claimVaultId: ANN, rung: "public" },
            { principal: BEN, field: "a:givenName", value: "Ann", sourceEntity: "e2", claimVaultId: BEN, rung: "public" },
            { principal: ANN, field: "a:familyName", value: "Lund", sourceEntity: "e3", claimVaultId: ANN, rung: "public" },
          ],
        },
      };
    return { status: 200, body: { total: 0, matches: [], connectVaultId: "x" } };
  };
  const cards = (url: URL) => {
    const who = url.searchParams.get("principal");
    if (who === ANN) return { status: 200, body: cardBody(ANN, "Ann", "Lund", [{ principal: ANN, field: "a:email", value: "ann@example.org", sourceEntity: "p", claimVaultId: ANN, rung: "public", kind: "email" }]) };
    return { status: 200, body: cardBody(BEN, "Ann", "Berg") };
  };
  it("asks one find, groups its hits by person, and reads each person's card once so the holder sees name and contact points", async () => {
    const log: string[] = [];
    const out = await findOnlineCardCandidates(router({ [FIND_BY_NAME_PATH]: find, [ONLINE_CARD_READ_PATH]: cards }, log), "ann");
    expect(log.filter((l) => l.startsWith(FIND_BY_NAME_PATH)).length).toBe(1);
    expect(log.filter((l) => l.startsWith(ONLINE_CARD_READ_PATH)).length).toBe(2);
    expect(out.map((c) => [c.principal, c.name, c.contactPoints.map((p) => p.value)])).toEqual([
      [ANN, "Ann Lund", ["ann@example.org"]],
      [BEN, "Ann Berg", []],
    ]);
  });
  it("no candidate card is read for a name nobody has; an empty name asks nothing", async () => {
    const log: string[] = [];
    expect(await findOnlineCardCandidates(router({ [FIND_BY_NAME_PATH]: find, [ONLINE_CARD_READ_PATH]: cards }, log), "nobody")).toEqual([]);
    expect(log.some((l) => l.startsWith(ONLINE_CARD_READ_PATH))).toBe(false);
    log.length = 0;
    expect(await findOnlineCardCandidates(router({}, log), "   ")).toEqual([]);
    expect(log).toEqual([]);
  });
  it("shows at most MAX_CANDIDATES people (the cards read are bounded by it)", async () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://p${i}.example.test/vault`);
    const log: string[] = [];
    const out = await findOnlineCardCandidates(
      router(
        {
          [FIND_BY_NAME_PATH]: () => ({ status: 200, body: { total: 12, connectVaultId: "x", matches: many.map((p, i) => ({ principal: p, field: "a:givenName", value: "Ann", sourceEntity: `e${i}`, claimVaultId: p, rung: "public" })) } }),
          [ONLINE_CARD_READ_PATH]: (u) => ({ status: 200, body: cardBody(u.searchParams.get("principal")!, "Ann", "X") }),
        },
        log,
      ),
      "ann",
    );
    expect(out.length).toBe(MAX_CANDIDATES);
    expect(log.filter((l) => l.startsWith(ONLINE_CARD_READ_PATH)).length).toBe(MAX_CANDIDATES);
  });
  it("a candidate whose card cannot be read is still listed, saying so, never dropped or shown as having no contact point", async () => {
    const out = await findOnlineCardCandidates(
      router({ [FIND_BY_NAME_PATH]: find, [ONLINE_CARD_READ_PATH]: (u) => (u.searchParams.get("principal") === ANN ? { status: 500, body: {} } : cards(u)) }),
      "ann",
    );
    const ann = out.find((c) => c.principal === ANN)!;
    expect(ann.contactPoints).toEqual([]);
    expect(ann.cardRead).toBe("unavailable");
    expect(out.find((c) => c.principal === BEN)!.cardRead).toBe("ok");
  });
  it("findOnlineCardResult reports every person the find named, not only the shown ones", async () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://p${i}.example.test/vault`);
    const out = await findOnlineCardResult(
      router({
        [FIND_BY_NAME_PATH]: () => ({ status: 200, body: { total: 14, matches: [...many, many[0], many[1]].map((p) => ({ principal: p, field: "a:givenName", value: "Ann" })) } }),
        [ONLINE_CARD_READ_PATH]: (u) => ({ status: 200, body: cardBody(u.searchParams.get("principal")!, "Ann", "X") }),
      }),
      "ann",
    );
    expect(out.candidates.length).toBe(MAX_CANDIDATES);
    expect(out.total).toBe(12);
  });
  it("a find that fails throws, never an empty answer", async () => {
    await expect(findOnlineCardCandidates(router({ [FIND_BY_NAME_PATH]: () => ({ status: 500, body: {} }) }), "ann")).rejects.toThrow(/500/);
  });
});
