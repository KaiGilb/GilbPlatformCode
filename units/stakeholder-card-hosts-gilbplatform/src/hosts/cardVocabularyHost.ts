import { masterKindReader } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import type { CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

export interface CardVocabularyHostOptions {
  /** Whether the card vocabulary is kept on this device. Absent: it is kept, as GilbApp does outside a test. */
  persistVocabulary?: () => boolean;
}

/** The host of `stakeholder-card-vocabulary`: the master's kind reader is the one `plan-stakeholder-io` holds. `persistVocabulary` is passed through when given. */
export function createCardVocabularyHost(options: CardVocabularyHostOptions = {}): CardVocabularyHost {
  return {
    masterKindReader,
    ...(options.persistVocabulary ? { persistVocabulary: options.persistVocabulary } : {}),
  };
}
