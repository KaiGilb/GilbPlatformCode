// A small fake platform for the own-card tests: records by id (GET /lws/r/<id>), each a served document or a status. Not shipped (the package files are `src` only).
import { vi } from "vitest";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";

export const SEAT = "https://t1kai.platform.example.test/vault";
export const SEAT_ROOT = SEAT;
export const SEAT_ENTITY = `${SEAT}/e/seat-record`;

export type Doc = Record<string, unknown>;
export interface Wire {
  reads: string[];
  set(id: string, doc: Doc | number): void;
}

export function installWire(): Wire {
  const records = new Map<string, Doc | number>();
  const wire: Wire = { reads: [], set: (id, doc) => void records.set(id, doc) };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    wire.reads.push(url);
    if (!url.includes("/lws/r/")) return new Response("{}", { status: 404 });
    const id = decodeURIComponent(url.split("/lws/r/")[1]!.split("?")[0]!);
    const got = records.get(id);
    if (got === undefined) return new Response("", { status: 404 });
    if (typeof got === "number") return new Response("", { status: got });
    return Response.json(got, { headers: { etag: '"e"' } });
  });
  return wire;
}

export const derivedIdOf = (root: string = SEAT_ROOT) => selfCardIdForVault(root);

export const person = (id: string, over: Doc = {}): Doc => ({ "@id": `${SEAT}/e/${id}`, "@type": "t:Person", "a:name": "Kai Gilb", ...over });

export function vault(over: Partial<ReachableVault> = {}): ReachableVault {
  return { vaultId: SEAT, entity: SEAT_ENTITY, name: "t1kai", parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: true, ...over } as ReachableVault;
}
