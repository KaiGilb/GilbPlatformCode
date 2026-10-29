// A copy of the app's `useStakeholderNoun` (`src/lib/base/stakeholderNoun.ts`), private to this unit, with the vocabulary host as its first argument.
import { useQuery } from "@tanstack/react-query";
import { stakeholderCardVocabularyQuery, type CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

/**
 * The master's word for "a stakeholder", for screens inside the Stakeholders working set.
 * `null` when not in Stakeholders, while the reading is out, or when the master gave
 * no label: the caller then shows its Nodes wording, unchanged.
 */
export function useStakeholderNoun(host: CardVocabularyHost, active: boolean): string | null {
  const q = useQuery({ ...stakeholderCardVocabularyQuery(host), enabled: active });
  if (!active) return null;
  const label = q.data?.roleLabel;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}
