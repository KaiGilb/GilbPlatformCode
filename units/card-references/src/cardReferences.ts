// Adds one reference from a card field to another record, ONLY through the checked write of `holder-reference`.

import { addReference, type CheckedReference, type ReferenceReading } from "@kaigilb/gilbplatformcode-holder-reference";
import { platformFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import type { CardField } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import type { VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";

export interface CardReferenceInput {
  /** The vault that holds the carrier. */
  vaultId: string;
  /** The signed-in principal the write is made as. */
  agent: string;
  /** The carrier record's own address. */
  carrier: string;
  field: CardField;
  target: string;
}

/**
 * Add one reference from the card, ONLY through the package's checked write. The reference reading
 * is read once and held with the session reading's field sets. A refusal or "not known yet" is the
 * package's error, thrown as it is: nothing was sent.
 */
export async function addReferenceFromCard(
  deps: {
    fieldSets: StakeholderFieldSets;
    references: () => Promise<ReferenceReading>;
    source: VocabularySource;
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  },
  input: CardReferenceInput,
): Promise<CheckedReference & { carrier: string }> {
  if (input.field.mode !== "reference-add") throw new Error(`${input.field.term} is not written by the package's reference write`);
  if (!input.field.writeKey) throw new Error(`${input.field.term} names no spelling to write`);
  const references = await deps.references();
  const picker = {
    platform: { origin: vaultOriginOf(input.vaultId), fetch: deps.fetchImpl ?? platformFetch() },
    reading: { fieldSets: deps.fieldSets, references },
    master: deps.source,
  };
  // The field is named by its write spelling, which the package matches (`referenceFieldFor`): the
  // set's term IRI is the master's listing form, not the per-term form the reading holds.
  return addReference(picker, { vaultId: input.vaultId, agent: input.agent, carrier: input.carrier, field: input.field.writeKey, target: input.target });
}
