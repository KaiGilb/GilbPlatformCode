// The note under a linked-records line when the find was cut off or some records could not be read, and the shapes it reads.
// Copied from the app unchanged (see the README): the find itself is the host's.

import { createElement, Fragment, type ReactNode } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";

/** One find shows at most this many linked records, and says so when more exist. */
export const PLAN_FIND_CAP = 300;

export type PlanFind = {
  rows: BaseRecord[];
  total: number;
  capped: boolean;
  unread: number;
  /** The cap this find used (absent on a find built by hand: {@link PLAN_FIND_CAP}). */
  cap?: number;
};

export function planFindRows(data: PlanFind | undefined): readonly BaseRecord[] {
  return data?.rows ?? [];
}

export function planCapSentence(total: number, word: string, cap: number = PLAN_FIND_CAP): string {
  return `Showing the first ${cap} of ${total} ${word} at this level.`;
}

export function planUnreadSentence(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural} could not be read. Try again`;
}

const quiet = "text-[12px] text-[var(--ink-soft)]";

export function PlanFindLimitNote({
  data,
  word,
  singular,
  onRetry,
  partialSentence = null,
}: {
  data: PlanFind | null | undefined;
  word: string;
  singular: string;
  onRetry: () => void;
  /** A list that has a sentence of its own for a partial level passes it; the link lines pass none. */
  partialSentence?: string | null;
}): ReactNode {
  if (!data || (data.unread <= 0 && !data.capped)) return null;
  // This file is .ts, so the note is built without JSX.
  // The cap or unread note, then the partial-level sentence when this list asked for one, then Try again.
  return createElement(
    Fragment,
    null,
    data.capped ? createElement("p", { className: quiet }, planCapSentence(data.total, word, data.cap)) : null,
    data.unread > 0
      ? createElement("button", { type: "button", className: quiet, onClick: onRetry }, planUnreadSentence(data.unread, singular))
      : null,
    partialSentence ? createElement("p", { className: quiet }, partialSentence) : null,
    createElement("button", { type: "button", className: quiet, onClick: onRetry }, "Try again"),
  );
}
