// The place catalogue is read only, and a write is never addressed to it. Every write function of this unit asks this BEFORE its first request, about each
// URL that write is going to send a POST, PATCH or DELETE to: the container URL of the vault for a create, the resource URL of the entity for a change or a
// remove. The URL is the one `vault-origin-rule` builds from the same arguments the record client will be given, so what is checked is what would be sent
// (a planted entity address under the catalogue is refused even when the vault argument is the holder's). The test is on the PARSED origin
// (`isGeoUrl` of `geo-origin`), never on the text.
import { isGeoUrl } from "@kaigilb/gilbplatformcode-geo-origin";
import { entityUriInVault } from "@kaigilb/gilbplatformcode-vault-namespace";
import { LWS_RESOURCE_URL, LWS_VAULT_CONTAINER_URL } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** A write was addressed to the place catalogue. The message names no address. */
export class GeoWriteRefusedError extends Error {
  constructor() {
    super("The place catalogue is read only, so nothing can be written to it.");
    this.name = "GeoWriteRefusedError";
  }
}

/** True when the address is inside the catalogue. An origin that was never set means no catalogue is known, so nothing is inside it. */
function insideCatalogue(url: string): boolean {
  try {
    return isGeoUrl(url);
  } catch {
    return false;
  }
}

/** The URL a create in `vaultId` is POSTed to. */
export const createTarget = (vaultId: string): string => LWS_VAULT_CONTAINER_URL(vaultId);

/** The URL a PATCH or DELETE of entity `id` is sent to, given the entity address the record client will be handed (`entityUri`, else the vault's own address for it). */
export const resourceTarget = (id: string, vaultId: string, entityUri?: string): string => LWS_RESOURCE_URL(id, entityUri ?? entityUriInVault(vaultId, id));

/** Throws {@link GeoWriteRefusedError}, with no request made, when any of the URLs is inside the place catalogue. */
export function assertNotCatalogue(urls: readonly string[]): void {
  if (urls.some(insideCatalogue)) throw new GeoWriteRefusedError();
}
