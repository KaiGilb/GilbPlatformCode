// The state of the held notes of one kind (skill notes), as the section reads it: a structural copy of the interface of the app's held-notes hook.
// The hook itself (its queries, its writes) is the host's; the section only reads and calls these members.

export interface HeldNotesState {
  /** The note on one category ("" when none), or null while the notes are not read. */
  noteFor: (topic: string) => string | null;
  /** This card's categories of this kind that have a claim, in mint order; null while not read. */
  topics: () => string[] | null;
  /** The read failed: said, ⛔ never shown as "no note". ⛔ Not set when the vault simply has no card of its own (`noCard`). */
  readError: string | null;
  /** The person has no landing vault of their own, so what they add would have no source: nothing of this kind is offered (the card says it once). */
  noOwnVault: boolean;
  /** The viewer may change this category's note: they stated it, or nobody has stated one yet. False when only another's (or an old vault card's) claim is there. */
  editableFor: (topic: string) => boolean;
  /** The last save or removal that did not happen, and why, per category. */
  errorFor: (topic: string) => string | null;
  /** Categories whose note is being saved. */
  savingFor: (topic: string) => boolean;
  /** Save the note on one category; TRUE only when the read-back of the claim written carries it. */
  save: (topic: string, text: string) => Promise<boolean>;
  /** Add a category as its own claim (no note); TRUE only when the read-back carries it. */
  add: (topic: string) => Promise<boolean>;
  /** The category left the card: remove its claims about this person; TRUE only when each is gone. */
  removeFor: (topic: string) => Promise<boolean>;
  /**
   * Who sees the viewer's own claim on this category: "private" (only they), "shared" (everyone who may read the vault, the default), or null when
   * the viewer stated none (then there is no switch: only the adder may set it).
   */
  markFor: (topic: string) => "private" | "shared" | null;
  /**
   * The claim the category's line is drawn from (the viewer's own when they stated one, else the first the platform returned): its address, whether
   * the viewer added it, and whether it names a source at all; null when the category has no claim. The "Added by" line asks about this.
   */
  sourceFor: (topic: string) => { item: string; own: boolean; hasSource: boolean } | null;
  /** Set the viewer's own claim on this category private (`true`) or back to shared (`false`): one PATCH with If-Match. Refuses a claim the viewer did not add. TRUE only when the read-back carries it. */
  setPrivate: (topic: string, makePrivate: boolean) => Promise<boolean>;
}
