/**
 * A create that minted a record, then could not confirm that the record joined the list.
 * `createdId` may be an empty string when the create answer named no id.
 * `linkState` is "not-linked" when the list was read and the id was absent,
 * or "unverified" when that read itself failed. This unit does not fetch.
 */
export class StepCreatedNotConfirmedError extends Error {
  readonly createdId: string;
  readonly linkState: "not-linked" | "unverified";

  constructor(createdId: string, linkState: "not-linked" | "unverified", message: string) {
    super(message);
    this.name = "StepCreatedNotConfirmedError";
    this.createdId = createdId;
    this.linkState = linkState;
  }
}

/**
 * The minted id, or null when this failure is not that error.
 * A lookalike object with a createdId field is null. An empty string on the real error is kept.
 */
export function createdStepIdOf(error: unknown): string | null {
  return error instanceof StepCreatedNotConfirmedError ? error.createdId : null;
}
