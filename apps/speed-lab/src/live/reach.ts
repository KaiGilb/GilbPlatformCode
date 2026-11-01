// What the signed-in person reaches: `GET /lws/vaults` (GilbPlatform src/lws/vaults.ts, `ReachableVaultsDocument`), and the two ways a sign-in ends.
import type { TermFetch } from "@kaigilb/gilbplatformcode-platform-fetch";

export interface Reach {
  /** Every vault the principal reaches: its `vaultId` namespace and the mode set. */
  vaults: { vaultId: string; modes: string[]; name: string | null; entity: string | null }[];
  /** True when every store that holds vaults answered. False means the list is SHORT. */
  complete: boolean;
  /** How many peer stores did not contribute. */
  incompletePeers: number;
}

export class ReachError extends Error {
  readonly status: number;
  constructor(status: number) { super(`GET /lws/vaults answered ${status}`); this.name = "ReachError"; this.status = status; }
}

export async function readReach(fetchIt: TermFetch, platformOrigin: string): Promise<Reach> {
  const res = await fetchIt(`${platformOrigin.replace(/\/+$/, "")}/lws/vaults`);
  if (res.status !== 200) throw new ReachError(res.status);
  const body = (await res.json()) as { vaults?: unknown; complete?: unknown; incompletePeers?: unknown };
  const vaults = (Array.isArray(body.vaults) ? body.vaults : [])
    .filter((v): v is { vaultId: string; modes?: unknown; name?: unknown; "@id"?: unknown } => !!v && typeof v === "object" && typeof (v as { vaultId?: unknown }).vaultId === "string")
    .map((v) => ({ vaultId: v.vaultId, modes: Array.isArray(v.modes) ? v.modes.filter((m): m is string => typeof m === "string") : [], name: typeof v.name === "string" ? v.name : null, entity: typeof v["@id"] === "string" ? v["@id"] : null }));
  return { vaults, complete: body.complete === true, incompletePeers: typeof body.incompletePeers === "number" ? body.incompletePeers : 0 };
}

/** A 401 from the platform, or the sign-in unit saying the token ran out (the proof could not be made): the sign-in has expired, which is not "not signed in". */
export function isExpired(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; message?: unknown };
  return e.status === 401 || /NotSignedInError|sign-in needs refreshing/i.test(String(e.message ?? ""));
}

export type Matched = "vaultId" | "@id origin";
/** Does a reach row stand for the pinned vault? By its `vaultId`, else by the origin of its `@id` (the vault's entity). Says which field matched. */
export function matchPinned(reach: Reach, pinned: string): Matched | null {
  if (reach.vaults.some((v) => v.vaultId === pinned)) return "vaultId";
  let origin: string;
  try { origin = new URL(pinned).origin; } catch { return null; }
  const same = (entity: string | null) => { try { return entity !== null && new URL(entity).origin === origin; } catch { return false; } };
  return reach.vaults.some((v) => same(v.entity)) ? "@id origin" : null;
}
