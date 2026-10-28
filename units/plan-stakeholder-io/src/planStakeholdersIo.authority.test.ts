// @vitest-environment node
// Authority is one t:AuthorityOf relation. The master walk and the write body are the contract. Ported from planStakeholders.vaultit.test.ts (the
// `writeAuthorityRelation`, `endThenWriteAuthority` and `migratedAuthorityRelation` blocks; the blocks of the pure functions are in
// `plan-stakeholders-model`). The app's mocks of its signing and token manager are the fake host of the auth seam here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHORITY_RELATION_TYPE } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { endThenWriteAuthority, migratedAuthorityRelation, writeAuthorityRelation } from "./planStakeholdersIo";
import { ONTOLOGY, setUp, tearDown } from "../test/support";

const ORIGIN = ONTOLOGY;
const P = "https://p.platform.example.test/vault";
const FN = "https://h.platform.example.test/base/e/fn1";
const KAI = "https://h.platform.example.test/base/e/kai";
const ORG = "https://h.platform.example.test/base/e/org";
const PLAIN = "https://h.platform.example.test/base/r/plain-1";

type Call = { method: string; url: string; body: Record<string, unknown> | null };

let calls: Call[];

function rel(type: string | undefined, member: string, id: string, role = "role:referenced-by"): RecordRelation {
  return {
    relation: id,
    role,
    ...(type ? { type } : {}),
    members: [{ member, role: "role:stakeholder" }],
  };
}

beforeEach(() => {
  calls = [];
  setUp();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      let body: Record<string, unknown> | null = null;
      if (method !== "GET" && typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ method, url, body });
      if (url.endsWith("/base/t/AuthorityOf")) {
        return Response.json({
          "@id": `${ORIGIN}/base/t/AuthorityOf`,
          "a:label": "authority-of",
          "a:subTypeOf": { "@id": `${ORIGIN}/base/t/StakeholderOf` },
        });
      }
      if (url.endsWith("/base/t/StakeholderOf")) {
        return Response.json({
          "@id": `${ORIGIN}/base/t/StakeholderOf`,
          "a:label": "stakeholder-of",
          "a:nodeKind": "relation",
          "a:subTypeOf": { "@id": `${ORIGIN}/base/t/Relation` },
        });
      }
      if (method === "POST" && url.includes("/end")) {
        // vaultOriginOf sends a non-platform host to baseOrigin(). The vault's answer is the
        // relation we addressed, not that request URL — endRelation checks the two hosts.
        const id = url.split("/r/")[1]?.replace(/\/end$/, "") ?? "";
        return Response.json({ relation: `https://h.platform.example.test/base/r/${id}`, changed: true });
      }
      if (method === "PUT") {
        const id = url.split("/r/")[1] ?? "minted";
        return Response.json({ changed: true, entity: `https://p.platform.example.test/vault/r/${id}` });
      }
      return Response.json(url.includes("/relations") ? { relations: [] } : {});
    }),
  );
});

function puts(): Call[] {
  return calls.filter((c) => c.method === "PUT" && c.url.includes("/vault/r/"));
}

afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("writeAuthorityRelation", () => {
  const input = {
    recordId: "fn1",
    recordUri: FN,
    stakeholderUri: KAI,
    vaultId: P,
  };

  it("writes one t:AuthorityOf, the two roles, and stakeholder — and stops the master walk at StakeholderOf", async () => {
    const written = await writeAuthorityRelation(input);
    expect(written.type).toBe(AUTHORITY_RELATION_TYPE);
    expect(written.members).toEqual([{ member: KAI, role: "role:stakeholder" }]);
    const put = puts();
    expect(put).toHaveLength(1);
    const body = put[0]!.body!;
    expect(body.type).toBe("t:AuthorityOf");
    expect(body.vault).toBe(P);
    const facts = body.facts as Record<string, unknown>;
    expect(facts["role:referenced-by"]).toEqual({ "@id": FN });
    expect(facts["role:stakeholder"]).toEqual({ "@id": KAI });
    expect(facts["a:relationType"]).toBe("stakeholder");
    expect(facts).not.toHaveProperty("role:source");
    expect(facts).not.toHaveProperty("role:target");
    expect(facts).not.toHaveProperty("a:authorityActsFor");
    const terms = calls.filter((c) => c.method === "GET" && c.url.includes("/base/t/")).map((c) => c.url);
    expect(terms.some((u) => u.endsWith("/base/t/AuthorityOf"))).toBe(true);
    expect(terms.some((u) => u.endsWith("/base/t/StakeholderOf"))).toBe(true);
    expect(terms.some((u) => u.endsWith("/base/t/Relation"))).toBe(false);
  });

  it("puts a:authorityActsFor on the relation only when acts-for is set", async () => {
    await writeAuthorityRelation({ ...input, actsFor: ORG });
    const facts = puts()[0]!.body!.facts as Record<string, unknown>;
    expect(facts["a:authorityActsFor"]).toEqual({ "@id": ORG });
  });

  it("ends the plain stakeholder, then writes the authority", async () => {
    await endThenWriteAuthority(PLAIN, input);
    const interesting = calls.filter((c) => c.method === "POST" || (c.method === "PUT" && c.url.includes("/vault/r/")));
    const endAt = interesting.findIndex((c) => c.method === "POST" && c.url.includes("/end") && c.url.includes("plain-1"));
    const putAt = interesting.findIndex((c) => c.method === "PUT");
    expect(endAt).toBeGreaterThanOrEqual(0);
    expect(putAt).toBeGreaterThan(endAt);
    expect(interesting[putAt]!.body!.type).toBe("t:AuthorityOf");
  });
});

describe("migratedAuthorityRelation", () => {
  const row = {
    id: "fn1",
    entityUri: FN,
    facts: { authorityHolder: KAI, authorityActsFor: ORG },
    served: { facts: { authorityHolder: { "@id": KAI }, authorityActsFor: { "@id": ORG } } },
  };

  it("writes the relation from the deprecated keys, and writes nothing when that person is already an authority", async () => {
    const first = await migratedAuthorityRelation(row, P, []);
    expect(first?.relation?.type).toBe(AUTHORITY_RELATION_TYPE);
    expect((puts()[0]!.body!.facts as Record<string, unknown>)["a:authorityActsFor"]).toEqual({ "@id": ORG });

    calls = [];
    const again = await migratedAuthorityRelation(row, P, [rel(AUTHORITY_RELATION_TYPE, KAI, "https://h.platform.example.test/base/r/a1")]);
    expect(again).toEqual({ relation: null });
    expect(puts()).toEqual([]);

    expect(await migratedAuthorityRelation({ id: "fn1", entityUri: FN, facts: {} }, P, [])).toBeNull();
  });
});
