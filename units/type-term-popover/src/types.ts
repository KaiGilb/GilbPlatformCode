/**
 * What resolving one term's definition can honestly return.
 *
 * Three states, deliberately not two: `none` is a claim ABOUT THE TERM and may only be made
 * when the term was actually read; `unreachable` is a claim about THIS REQUEST and says
 * nothing about the term. Collapsing them is the defect this type exists to prevent.
 */
export type TermDefinition =
  /** The term was read and states what it does. */
  | { state: "defined"; does: string }
  /** The term was READ, and genuinely carries no `a:does`. A fact about the term. */
  | { state: "none" }
  /** The term could NOT be read. ⛔ Says nothing about whether it has a definition. */
  | { state: "unreachable"; reason: string };
