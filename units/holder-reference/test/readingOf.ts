// Shared set-up of the tests (not shipped). The reference reading a picker holds, built as the source's `readPickerVocabulary` builds
// its `fieldSets` and `references` parts: `references` only when asked for, read through `readReferenceVocabulary`.
import type { VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceVocabulary, type ReferenceReading, type ReferenceReadingOptions } from "../src/holderReference";

export async function readReferenceReading(
  source: VocabularySource,
  fieldSets: StakeholderFieldSets,
  opts: { references?: boolean } & ReferenceReadingOptions = {},
): Promise<{ fieldSets: StakeholderFieldSets; references?: ReferenceReading }> {
  const references = opts.references ? await readReferenceVocabulary(source, fieldSets, opts) : undefined;
  const reading: { fieldSets: StakeholderFieldSets; references?: ReferenceReading } = { fieldSets };
  if (references) reading.references = references;
  return reading;
}
