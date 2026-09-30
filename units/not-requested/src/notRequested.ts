/**
 * The sentence for a list that was never asked for, because no vault is selected.
 *
 * This is not the sentence for a vault that answered and held nothing.
 * Those are different facts and they must not share a sentence.
 *
 * `documentLabelPlural` is the noun the screen already uses ("rules",
 * "procedures"). It is inserted as given. This function does not look up a
 * type, and it does not refuse a type name. Do not pass one. A type name in
 * this sentence is your mistake, printed verbatim.
 *
 * An empty noun leaves a double space: "no  were requested". Pass the noun.
 */
export function noVaultNotRequestedSentence(documentLabelPlural: string): string {
  return `No vault is selected, so no ${documentLabelPlural} were requested. Nothing was invented.`;
}
