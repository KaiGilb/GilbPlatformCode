// The quick list and the "Create in" vaults inside Stakeholders.
// Pure: no React. The stakeholder create hook calls it. The dialog still asks for the held-vault
// default and the error text, and the match list asks for the error text.
import { CreateRefusedError, PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { BoundTimeoutError } from "@kaigilb/gilbplatformcode-lws-relations";
import { VEDA_ID_PREFIX, type TypeOption, type TypeSearchFn } from "@kaigilb/gilbplatformcode-ontology-reads";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { plainBoundStep } from "./plainBoundStep";
import { isHeldVault, recordableKinds } from "./recordPerson";

/** The quick-list options inside Stakeholders: the kinds "Record someone" offered, as TypeOptions,
 *  in recordableKinds' order, each with its master label (else its bare name). */
export function stakeholderTypeOptions(fieldSets: StakeholderFieldSets): TypeOption[] {
  return recordableKinds(fieldSets).map((k) => ({
    id: VEDA_ID_PREFIX + k.name,
    label: k.label ?? k.name,
    typeName: k.name,
    spec: null,
    kind: "type" as const,
  }));
}

/** A TypeSearchFn over exactly those options. Blank query: all of them. Otherwise the options
 *  whose label or typeName contains the query, case-insensitively. Never asks the network. */
export function stakeholderTypeSearch(options: readonly TypeOption[], noun: string | null): TypeSearchFn {
  const base = noun
    ? `The kinds of ${noun} the GilbVeda master names.`
    : "The kinds the GilbVeda master names for this list.";
  return async (query: string) => {
    const q = query.trim();
    const matched =
      q === ""
        ? options
        : options.filter(
            (o) =>
              o.label.toLowerCase().includes(q.toLowerCase()) ||
              o.typeName.toLowerCase().includes(q.toLowerCase()),
          );
    return {
      options: matched,
      reach: q === "" ? base : `${base} Showing those matching “${q}”.`,
      degraded: false,
    };
  };
}

/** The vaults the person holds (isHeldVault), in the order given.
 *  An absent list is none: the shell's vaults are missing on the first render, and
 *  `writableVaults` already treats that as nowhere to write. */
export function heldVaults(vaults: readonly ReachableVault[] | null | undefined): ReachableVault[] {
  const list = vaults ?? [];
  return list.filter((v) => isHeldVault(v, list));
}

/** Record someone's default: the open vault if held, else the landing vault, else the first held,
 *  else null. */
export function defaultHeldVaultId(held: readonly ReachableVault[], readVaultId: string | null): string | null {
  const open = held.find((v) => v.vaultId === readVaultId);
  return (open ?? held.find((v) => v.isLandingVault) ?? held[0])?.vaultId ?? null;
}

/** True when `option` is one of `kindOptions` (compared by id). */
export function isStakeholderKindOption(option: TypeOption, kindOptions: readonly TypeOption[] | null): boolean {
  if (!kindOptions) return false;
  return kindOptions.some((o) => o.id === option.id);
}

/** How long typing settles before the vault is asked for matching names (Record someone's value). */
export const STAKEHOLDER_FIND_DEBOUNCE_MS = 300;
/** The shortest name that is looked up. */
export const STAKEHOLDER_FIND_MIN_CHARS = 2;
/**
 * The step a BoundTimeoutError names, including one buried in `cause` or stringified into a
 * message (`BoundTimeoutError: signing in timed out`). The package's request error does the
 * latter, so the object that arrives is not itself the timeout.
 */
function boundTimeoutStep(err: unknown, seen = new Set<unknown>()): string | null {
  if (!err || (typeof err !== "object" && typeof err !== "string")) return null;
  if (typeof err !== "string") {
    if (seen.has(err)) return null;
    seen.add(err);
  }
  if (err instanceof BoundTimeoutError) return err.message.replace(/ timed out$/, "");
  if (typeof err === "object") {
    const nested = boundTimeoutStep((err as { cause?: unknown }).cause, seen);
    if (nested) return nested;
  }
  const message = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  const named = /BoundTimeoutError: (.*?) timed out/.exec(message);
  return named?.[1] ? named[1] : null;
}

/** Create, or the match list's lookup. A lookup writes nothing, so it must not say a create failed. */
export type StakeholderErrorWhere = "create" | "lookup";

/** DPoP and signing-in both stop at 10 s. The error does not carry the number. */
const BOUND_WAIT_S = 10;

function recordIdOf(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const record = (err as { record?: unknown }).record;
  return typeof record === "string" && record !== "" ? record : null;
}

/** Kind labels and the other record this act meant to write and did not. Omitted: not said. */
export interface PartialStepsLeft {
  kinds?: readonly string[];
  linkTo?: string | null;
}

function quoted(s: string): string {
  return `“${s}”`;
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * What was not stored after the person exists. `noTag` says "It has no tag" and is set ONLY when the create's own master read really answered no tag
 * (see {@link answeredNoTag}); a missing tag is stated and never given as something to do on the card.
 */
function stepsLeftSentence(left: PartialStepsLeft | undefined, noTag: boolean): string {
  const kinds = (left?.kinds ?? []).map((k) => k.trim()).filter((k) => k !== "");
  const other = left?.linkTo?.trim() ?? "";
  const pieces: string[] = [];
  if (kinds.length === 1) pieces.push(`its kind ${quoted(kinds[0]!)}`);
  else if (kinds.length > 1) pieces.push(`its kinds ${joinAnd(kinds.map(quoted))}`);
  if (other) pieces.push(`the link to ${quoted(other)}`);
  const add: string[] = [];
  if (kinds.length === 1) add.push("the kind");
  else if (kinds.length > 1) add.push("the kinds");
  if (other) add.push("the link");
  const plural = pieces.length > 1 || kinds.length > 1;
  const notWritten =
    pieces.length === 0
      ? ""
      : `${joinAnd(pieces)} ${plural ? "were" : "was"} not written; add ${joinAnd(add)} on its card.`;
  if (noTag && notWritten) return `It has no tag, and ${notWritten}`;
  if (noTag) return "It has no tag.";
  if (!notWritten) return "";
  return notWritten.charAt(0).toUpperCase() + notWritten.slice(1);
}

/** The kind and the link a late-landing create did not write, as the partial sentence says them. Empty when this act meant neither. */
export function stepsNotWrittenSentence(left: PartialStepsLeft | undefined): string {
  return stepsLeftSentence(left, false);
}

/** Sentences joined by one space; an empty one leaves no gap. */
function joinSentences(...parts: readonly string[]): string {
  return parts.filter((p) => p !== "").join(" ");
}

/**
 * "It has no tag" is true only when the create's own master read answered "no tag" and the platform then REFUSED to make one: the partial's cause is a
 * 4xx answer of `POST /base/tag/ensure`, which the package asks only after the master read said `none`. A step that timed out, a master read that failed, a
 * 5xx (the tag may have been made) or any other cause says nothing about the tag, so nothing is claimed.
 */
export function answeredNoTag(err: PartialCreateError): boolean {
  const cause = err.cause;
  return cause instanceof PlatformError && cause.status >= 400 && cause.status < 500 && /\/base\/tag\/ensure(?:[?#]|$)/.test(cause.url);
}

function wasCreatedSentence(step: string, name?: string, left?: PartialStepsLeft): string {
  const who = name?.trim();
  const lead = who ? `“${who}” was created` : "A record was created";
  return joinSentences(`${lead}, but ${plainBoundStep(step)} did not answer within ${BOUND_WAIT_S} s.`, stepsLeftSentence(left, false), "Do not create it again.");
}

/**
 * What a record a field holds stored, said as the labels of the boxes it was written from ("only “Works for” was saved").
 * The held record carries every box filled for that field, so the labels come from the dialog, which knows which
 * boxes were filled. Unknown labels: a phrase that names no field.
 */
function savedDetailsPhrase(saved: readonly string[] | undefined): string {
  const labels = (saved ?? []).map((l) => l.trim()).filter((l) => l !== "");
  if (labels.length === 0) return "only the other person details were saved";
  return `only ${joinAnd(labels.map(quoted))} ${labels.length > 1 ? "were" : "was"} saved`;
}

/** The person was not written. A held field (the Employment a job title or employer is in) may have been. The name stays. */
function personNotCreatedSentence(step: string, name?: string, saved?: readonly string[]): string {
  const who = name?.trim();
  const lead = who ? `“${who}” was not created` : "The record was not created";
  return `${lead} (${plainBoundStep(step)} did not answer within ${BOUND_WAIT_S} s); ${savedDetailsPhrase(saved)}. Try again.`;
}

function heldWithoutPerson(name?: string, saved?: readonly string[]): string {
  const who = name?.trim();
  const lead = who ? `“${who}” was not created` : "The record was not created";
  return `${lead}; ${savedDetailsPhrase(saved)}. Try again.`;
}

/** Why a later step of a create did not finish (the platform makes the tag; the package reads it back). The record address is not shown. */
function refusalWhy(err: PartialCreateError): string {
  if (/its tag could not be read or made/i.test(err.message)) return "its tag could not be read or made";
  if (/could not be read back/i.test(err.message)) return "it could not be read back";
  return "a later step did not finish";
}

function partialRefusalSentence(err: PartialCreateError, name?: string, left?: PartialStepsLeft): string {
  const who = name?.trim();
  const lead = who ? `“${who}” was created` : "A record was created";
  return joinSentences(`${lead}, but ${refusalWhy(err)}.`, stepsLeftSentence(left, answeredNoTag(err)), "Do not create it again.");
}

function nothingCreatedSentence(step: string, where: StakeholderErrorWhere): string {
  const plain = plainBoundStep(step);
  if (where === "lookup") return `Could not look up matches: ${plain} did not answer within ${BOUND_WAIT_S} s.`;
  const named = plain.charAt(0).toUpperCase() + plain.slice(1);
  return `${named} did not answer within ${BOUND_WAIT_S} s; nothing was created. Try again.`;
}

/** A stakeholder create's or find's failure, in the package's own words.
 *  A partial create is said first: its cause may be a bound, and that bound must not claim
 *  nothing was written. The person, the tag, the kind and the link are each named only when
 *  that is what was stored. "Nothing was created" is only for a bound that has no partial and
 *  no record id. A lookup names the step and does not say to try a create. The raw message
 *  carries the address and the error's class name; neither is shown. */
export function stakeholderErrorText(
  err: unknown,
  where: StakeholderErrorWhere = "create",
  name?: string,
  left?: PartialStepsLeft,
  /** The labels of the boxes whose held record was written, when the person was not. Unknown: omitted. */
  saved?: readonly string[],
): string {
  if (err instanceof PartialCreateError) {
    const step = boundTimeoutStep(err);
    if (step && err.record) return wasCreatedSentence(step, name, left);
    if (step && err.written.length > 0) return personNotCreatedSentence(step, name, saved);
    if (step) return nothingCreatedSentence(step, where);
    if (err.record) return partialRefusalSentence(err, name, left);
    if (err.written.length > 0) return heldWithoutPerson(name, saved);
    return where === "lookup" ? "Could not look up matches." : "Nothing was created. Try again.";
  }
  const step = boundTimeoutStep(err);
  if (step) {
    if (!recordIdOf(err)) return nothingCreatedSentence(step, where);
    return wasCreatedSentence(step, name, left);
  }
  const body =
    err instanceof CreateRefusedError
      ? `Not recorded: ${err.message}`
      : err instanceof VocabularyUnavailableError
        ? `Not known yet: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
  if (where === "lookup") return `Matches not known: ${body}`;
  return body;
}
