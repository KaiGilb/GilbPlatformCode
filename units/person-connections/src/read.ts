/**
 * Read the holder's connections: the ONE file that knows the read half of the rung-membership route.
 *
 *   GET /base/connect/audience-rung/members[?vaultId=<the holder's own vault>]
 *   200 { holder, vaultId, sets: [{ context, depth, rungTerm, setUri, members: string[] }] }
 *
 * Read only. The PUT (placing and removing people) stays in the app that places people.
 *
 * Transport is INJECTED, as for every route in this package: `client.fetch` is the app's
 * authenticated fetch (token, DPoP proof, 401 handling); `vaultOrigin` tells which node holds a
 * vault. This package holds no credential and knows no deployment.
 */
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { composeConnectionsFromSets, type ConnectedPerson } from "./compose";
import type { AudienceRungSetRecord } from "./placements";

export const AUDIENCE_RUNG_MEMBERS_PATH = "/base/connect/audience-rung/members";

/** The rung-membership route answered with a status that is not a success. */
export class AudienceRungMembershipError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`AudienceRungMembership ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "AudienceRungMembershipError";
    this.status = status;
  }
}

/** Where and how to read. */
export interface ReadConnectionsOptions {
  /**
   * The holder's own vault (`https://<host>/base`). Omit only when it is not known yet: the request
   * then goes to `client.origin` without naming a vault, and the server resolves the vault from
   * the account.
   */
  vaultId?: string;
  /**
   * The origin of the node that holds `vaultId`. Called only when `vaultId` is given.
   * The app owns this knowledge (an app's own record of where each vault lives).
   */
  vaultOrigin: (vaultId: string) => string | Promise<string>;
  /** Passed to {@link composeConnectionsFromSets}: which members count as people. Default: all. */
  admit?: (member: string) => boolean;
}

/** What one read returns. */
export interface ConnectionsReading {
  /** The signed-in holder, as the server named them. */
  holder: string;
  /** The vault the server answered for (absent when the server named none). */
  vaultId?: string;
  /** The stored sets as returned; `[]` when the server sent none. */
  sets: AudienceRungSetRecord[];
  /** The sets composed one entry per member. */
  people: ConnectedPerson[];
}

/**
 * Read the four stored rung sets of the signed-in holder and compose them per member.
 *
 * THE READ FOLLOWS THE WRITE. The server keys each set by `(vaultId, holder, context, depth)`, so
 * a read that reaches a different vault than the write used finds four sets nobody wrote and
 * answers `sets: []`. That reads as "no circles", not as "wrong place". So `vaultId` does two jobs,
 * as on the write: it ADDRESSES the request at the node holding the vault (`vaultOrigin`), and it
 * NAMES the vault in the query so that node need not look it up. Never one without the other.
 *
 * @param client `origin` is used when no vault is named; `fetch` is the app's authenticated fetch
 * @param options the vault, its node, and the optional member filter
 * @returns the holder, the vault, the sets and the composed people
 * @throws AudienceRungMembershipError when the route answers a status that is not a success.
 *   A failure of the app's fetch itself (network, sign-in) is the app's error and passes through.
 */
export async function readConnections(
  client: PlatformClient,
  options: ReadConnectionsOptions,
): Promise<ConnectionsReading> {
  const vault = options.vaultId?.trim() || undefined;
  const origin = vault ? await options.vaultOrigin(vault) : client.origin;
  const query = vault ? `?vaultId=${encodeURIComponent(vault)}` : "";
  const url = `${origin.replace(/\/+$/, "")}${AUDIENCE_RUNG_MEMBERS_PATH}${query}`;

  const res = await client.fetch(url, { method: "GET" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AudienceRungMembershipError(res.status, detail);
  }
  const body = (await res.json()) as {
    holder: string;
    vaultId?: string;
    sets?: AudienceRungSetRecord[];
  };
  // A wrong-plane answer is `sets: []` and is returned as such (no error). See the note above.
  const sets = body.sets ?? [];
  return {
    holder: body.holder,
    vaultId: body.vaultId,
    sets,
    people: composeConnectionsFromSets(sets, { admit: options.admit }),
  };
}
