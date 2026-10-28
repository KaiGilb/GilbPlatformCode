// Hostile probe: a picker search never claims it searched everything when a hit was dropped.
import { describe, expect, it } from "vitest";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { searchPlanRecords } from "./planSearch";

const H = "https://h.platform.example.test/vault/e";

function rec(id: string, typeUri: string, facts: Record<string, string>, served: Record<string, unknown> = facts): BaseRecord {
  return {
    id,
    entityUri: `${H}/${id}`,
    typeUri,
    facts,
    opaqueFacts: [],
    etag: '"e"',
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag: '"e"' },
  } as BaseRecord;
}

describe("QA2-S picker searches never claim they searched everything when a hit was dropped", () => {
  it("searchPlanRecords: a hit whose read fails makes the answer not complete", async () => {
    const page = await searchPlanRecords("https://h.platform.example.test/vault", "walk faster", ["Function"], {
      search: async () => ({ ids: [`${H}/wf`], next: null }),
      read: async () => {
        throw new Error("500");
      },
    });
    expect(page).toMatchObject({ hits: [], complete: false });
  });
});
