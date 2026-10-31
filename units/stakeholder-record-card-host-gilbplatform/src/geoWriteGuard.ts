// The place catalogue is read only: nothing the held card writes may be addressed to it. The Employment section writes to the vault that holds the record
// (the entity it creates, the employment entities it patches, the record's own edge key); every target of those writes is named by the slot's props. This
// guard looks at all of them BEFORE the section is given the means to write: a target whose origin is the catalogue's is refused, with no request.
import { edgeIdOf, storedEdgeItems } from "@kaigilb/gilbplatformcode-employment-edges";
import { isGeoUrl } from "@kaigilb/gilbplatformcode-geo-origin";
import type { EmploymentSlotProps } from "@kaigilb/gilbplatformcode-stakeholder-record-card";

/** A write was addressed to the place catalogue. The message names no address. */
export class GeoWriteRefusedError extends Error {
  constructor() {
    super("The place catalogue is read only, so nothing can be written to it.");
    this.name = "GeoWriteRefusedError";
  }
}

/** True when the address is inside the catalogue. An origin that was never set means no catalogue is known, so nothing is inside it. */
function insideCatalogue(target: unknown): boolean {
  try {
    return isGeoUrl(target);
  } catch {
    return false;
  }
}

/** Throws `GeoWriteRefusedError` when any of the targets is inside the catalogue. Makes no request. */
export function assertNoGeoWriteTarget(targets: readonly (string | null | undefined)[]): void {
  if (targets.some((t) => insideCatalogue(t))) throw new GeoWriteRefusedError();
}

/** Every address the Employment section may write to, as the slot's props name them: the vault, the record, and each employment its edge names. */
export function employmentWriteTargets(p: Pick<EmploymentSlotProps, "vaultId" | "recordEntityUri" | "servedEdges">): (string | null)[] {
  return [p.vaultId, p.recordEntityUri, ...storedEdgeItems(p.servedEdges).map(edgeIdOf)];
}

/** True when the section must not be given the means to write: some target is inside the catalogue. */
export function employmentWritesRefused(p: Pick<EmploymentSlotProps, "vaultId" | "recordEntityUri" | "servedEdges">): boolean {
  try {
    assertNoGeoWriteTarget(employmentWriteTargets(p));
    return false;
  } catch (e) {
    if (e instanceof GeoWriteRefusedError) return true;
    throw e;
  }
}
