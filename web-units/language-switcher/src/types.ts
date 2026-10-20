/** One language the visitor can pick. */
export interface LanguageOption {
  /** The language's code, e.g. "nb". It is what `select` carries and what `lang` is set to on the item. */
  code: string;
  /** The language's own name, e.g. "Norsk". Drawn in the list and used in the button's name. */
  name: string;
  /**
   * Which flag to draw: one of the built-in keys (see `flagKeys`) or any other text. A key the unit does not know is
   * drawn as a small badge with the first letters of the key. Flags are data, never taken from the code: "en" may
   * show the US flag on one site and the British flag on another. When missing, the badge shows the code.
   */
  flag?: string;
}

/** The flags the unit can draw. Any other key is drawn as a badge with its first two letters. */
export const flagKeys = ["us", "gb", "no", "de", "fr", "es"] as const;
