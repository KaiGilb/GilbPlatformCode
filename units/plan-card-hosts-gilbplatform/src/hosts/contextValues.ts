// The four contexts whose value is a function or a source object and not a host with members: the label of a linked record,
// the pickers' query hook, the picture of a type and the definition of a type.

import type { UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import type { ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import { createTypePictureSource, type TypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";
import { useResolvedRefLabel } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { readTermDefinition } from "@kaigilb/gilbplatformcode-ontology-reads";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { usePickerQuery } from "../inline";
import type { HostEnv } from "../env";

/** RefLabelContext. EntityRefValue.tsx:16 */
export function createRefLabel(): UseRefLabel {
  return (ref, vaultId) => useResolvedRefLabel(ref, vaultId);
}

/** PickerQueryContext. orgCard/OrgRecordPicker.tsx:144 */
export function createPickerQuery(): UsePickerQuery {
  return (args) => usePickerQuery(args);
}

/** TypePictureSourceContext. typePicture.ts:92: the source the unit ships, given the ontology's origin and the vault origin rule. */
export function createTypePicture(env: HostEnv): TypePictureSource {
  return createTypePictureSource({ termOrigin: env.ontologyOrigin, originOf: (iri) => vaultOriginOf(iri) });
}

/** TermDefinitionContext. TypeDescription.tsx:35 */
export function createTermDefinition(): ReadTermDefinition {
  return (typeName) => readTermDefinition(typeName);
}
