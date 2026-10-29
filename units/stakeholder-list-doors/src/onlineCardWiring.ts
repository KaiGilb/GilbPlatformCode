/**
 * The thin wiring of the online-card controller (`createOnlineCardController` of the `online-card` unit). Everything with a rule in
 * it is the unit's; this file only says WHICH functions do the controller's I/O acts.
 *
 *   platform       the identity node (the platform origin) with the DPoP read seam, for the card, the resolver and the find
 *   writeLink      `patchRecord` on the holder's OWN record, the link's patch only (merge patch: `sameAs` a reference, or null)
 *
 * No copy path ("We dont duplicate data. The source is the source."): nothing here writes a held claim from an online row.
 *
 * ⛔ No request is made here at import or at hook time: the controller reads only when the card is opened (`load()`).
 */
import type { LinkWrite, ControllerDeps } from "@kaigilb/gilbplatformcode-online-card";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { dpopReadAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";

/** This app's authenticated fetch for the identity node's routes: a DPoP proof minted for THIS url and method. */
export async function identityFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const res = await fetch(url, {
    ...init,
    method,
    headers: { ...(init?.headers as Record<string, string> | undefined), ...(await dpopReadAuth(method, url)) },
  });
  if (res.status === 401) {
    invalidateDpop();
    // The controller reads a 401 as "sign in again": it is not an exception here.
  }
  return res;
}

export interface WiringArgs {
  record: { id: string; entityUri: string };
  /** The vault that HOLDS the record. */
  vaultId: string;
  holder: string;
  canWrite: boolean;
  link: ControllerDeps["subject"]["link"];
  onLinkChanged: ControllerDeps["onLinkChanged"];
}

/** The controller's dependencies for a record of this app. Pure construction: nothing is requested. */
export function onlineCardDeps(a: WiringArgs): ControllerDeps {
  return {
    platform: { origin: baseOrigin(), fetch: identityFetch },
    subject: { uri: a.record.entityUri, holder: a.holder, link: a.link },
    canWrite: a.canWrite,
    writeLink: async (w: LinkWrite) => {
      await patchRecord(a.record.id, w.patch, a.record.entityUri);
    },
    onLinkChanged: a.onLinkChanged,
  };
}
