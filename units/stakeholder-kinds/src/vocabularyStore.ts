// Where a last-known-good reading is kept across reloads.

/** Where a last-known-good reading is kept across reloads. `localStorage` satisfies it. */
export interface VocabularyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
