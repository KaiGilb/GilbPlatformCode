/**
 * listVaultRecordsPage must put lifecycle=ended on the wire.
 *
 * Spec: VKT-NodeDeletedSetMechanism-GilbApp (ended set is a query, vault-confined).
 * Transport stubbed; listVaultRecordsPage is REAL (RuleBasetestMockedModuleNoInstrument).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setUp, tearDown } from "../test/support";
import { listVaultRecordsPage } from "./vaultSets";

const VAULT = "https://home.platform.example.test/base";

beforeEach(() => setUp());
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("Cycle199 S6 — ended records list door", () => {
  it("live list does ⛔ not send lifecycle=ended", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toMatch(/lifecycle=ended/);
      return new Response(
        JSON.stringify({ records: [], total: 0, complete: true, pageSize: 20, offset: 0 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await listVaultRecordsPage(VAULT, ["Person"], 0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("ended list sends lifecycle=ended on GET /lws/vault/:id/records", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toMatch(/lifecycle=ended/);
      expect(url).toMatch(/\/lws\/vault\//);
      return new Response(
        JSON.stringify({
          records: [
            {
              entity: `${VAULT}/e/ended-1`,
              typeUri: "t:Person",
              updatedAt: "2026-09-20T00:00:00.000Z",
              label: "Ended",
              endingActorKind: "holder",
            },
          ],
          total: 1,
          complete: true,
          pageSize: 20,
          offset: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await listVaultRecordsPage(VAULT, [], 0, { lifecycle: "ended" });
    expect(page.records).toHaveLength(1);
    expect(page.records[0]!.endingActorKind).toBe("holder");
    expect(page.records[0]!.id).toBe("ended-1");
  });

  it("does ⛔ not invent holder when the wire omits endingActorKind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            records: [
              {
                entity: `${VAULT}/e/crossed`,
                typeUri: "t:Person",
                updatedAt: "2026-09-20T00:00:00.000Z",
                label: "Crossed",
              },
            ],
            total: 1,
            complete: true,
            pageSize: 20,
            offset: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const page = await listVaultRecordsPage(VAULT, [], 0, { lifecycle: "ended" });
    expect(page.records[0]!.endingActorKind).toBeUndefined();
  });
});
