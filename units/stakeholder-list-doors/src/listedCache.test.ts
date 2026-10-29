// New. The doors note where each listed record lives in the query cache (`["base","stakeholder-list","page",<vault>,<offset>]`: the id,
// the address, the type and the vault), so the record pane can open a listed record from ITS vault: for a records page, and for a record the
// up-front read brought (offset -1). Only those four are kept, never a fact. These replace the app's two tests that read the same rows
// back through the pane's cache scan (`findKnownRecordInCache`), which is the app's.
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createStakeholderListReader } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks, ORIGIN, resp } from "../test/support";

installPlatformHooks();
const doorsHost = fakeDoorsHost();

const OWN = "https://ann.example.test/vault";
const WORK = "https://acme.example.test/vault";
const KEY = ["base", "stakeholder-list", "page"] as const;
const row = (vault: string, id: string, type: string, label: string, link?: string) => {
  const entity = `${new URL(vault).origin}/base/e/${id}`;
  const body: Record<string, unknown> = { "@id": entity, "@type": `t:${type}`, name: label, ...(link ? { sameAs: { "@id": link } } : {}) };
  return { entity, typeUri: `t:${type}`, updatedAt: "2026-10-19T10:00:00Z", label, vault, vaultAmbiguous: false, body };
};

describe("the doors note where a listed record lives", () => {
  it("a records page: the id, the address, the type and the vault of each record, and nothing else", async () => {
    const qc = new QueryClient();
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/records")) {
        const records = [row(WORK, "acme-r0", "Organization", "Acme AS")];
        return resp(200, { total: 1, complete: true, pageSize: 20, offset: 0, nextOffset: null, records });
      }
      return resp(404, {});
    });
    const deps = stakeholderListDeps(doorsHost, { qc, holder: `${OWN}/i`, vaults: [WORK], ownVaultId: null, typeNames: ["Organization"], ownCardIds: [] });
    await createStakeholderListReader(deps).read();
    expect(qc.getQueryData([...KEY, WORK, 0])).toEqual({
      records: [{ id: "acme-r0", entityUri: "https://acme.example.test/base/e/acme-r0", typeUri: `${ORIGIN}/base/t/Organization`, sourceVaultId: WORK }],
    });
    vi.unstubAllGlobals();
  });

  it("a record only the up-front read brought: noted under offset -1, with the vault it was found in", async () => {
    const AVA = "https://ava.example.test/vault";
    const wenche = row(WORK, "wenche", "Person", "Wenche Work", AVA);
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/base/find-by-attribute")) {
        const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
        const ids = value["@id"] === AVA ? [wenche.entity] : [];
        return resp(200, { count: ids.length, ids });
      }
      if (url.pathname.endsWith("/lws/r/wenche")) return resp(200, wenche.body);
      return resp(404, {});
    });
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: `${OWN}/i`, vaults: [OWN, WORK], ownVaultId: OWN, typeNames: ["Person"], ownCardIds: [] });
    const found = await deps.linkedRecordsOf!([AVA]);
    expect(found.map((f) => f.record.recordId)).toEqual([wenche.entity]);
    const noted = qc.getQueryData([...KEY, WORK, -1]) as { records: { id: string; entityUri: string; sourceVaultId: string }[] };
    expect(noted.records.map((r) => [r.id, r.entityUri, r.sourceVaultId])).toEqual([["wenche", wenche.entity, WORK]]);
    vi.unstubAllGlobals();
  });
});
