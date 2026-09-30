/**
 * What a step shows: an optional tag pill, the body text, and that same body
 * split into text and reference spans.
 *
 * The tag pill comes only from `unitTagCarrier` — the tag already stored on
 * the step. A token at the front of the sentence is not a tag by itself.
 *
 * Handoff wikilinks are removed from the body, because those links already
 * have their own chips. Any other `[[Name]]` loses its brackets and stays
 * as words. The `segments` list keeps that other name marked as a ref, so a
 * renderer can still recognise it. `text` is the same characters with the
 * ref flattened.
 *
 * The bracket-and-address split inside a text span is the same rule as
 * `statement-refs`. This folder carries its own copy so it can be taken alone.
 */

export interface StatementSegment {
  kind: "text" | "ref";
  value: string;
}

export interface StepInstructionDisplay {
  /** The stored tag, or null when the caller did not pass one. Never invented from the sentence. */
  tag: string | null;
  /**
   * Body after a matching prefix is lifted and handoff wikilinks are removed.
   * Empty only when the input instruction is empty. If the cleanup would erase
   * everything, this is the original instruction and `tag` is null.
   */
  text: string;
  /**
   * The same shaped body, with in-statement references still marked.
   * Always set by `formatStepInstruction`. Optional on the type so a hand-built
   * `{ tag, text }` still type-checks.
   */
  segments?: StatementSegment[];
}

const SEP = " \u2014 ";
const SENTINEL = "\u0000";
const MARK = "\u0001";

function slashTail(value: string): string {
  const marker = value.lastIndexOf("/");
  return marker === -1 ? value : value.slice(marker + 1);
}

function slugifyWikilinkInner(inner: string): string {
  return inner.toLowerCase().replace(/_/g, "-");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseStatementRefs(raw: string): StatementSegment[] {
  const segments: StatementSegment[] = [];
  if (raw === "") return segments;
  const pattern = /\[\[([^\]]*)\]\]|(https?:\/\/[^\s<>"'`]+)/gi;
  let cursor = 0;
  for (let m = pattern.exec(raw); m !== null; m = pattern.exec(raw)) {
    let value = m[1] !== undefined ? m[1] : (m[2] ?? "");
    let end = m.index + m[0].length;
    if (m[1] === undefined) {
      const trimmed = value.replace(/[.,;:!?)\]}]+$/, "");
      end -= value.length - trimmed.length;
      value = trimmed;
    }
    if (m.index > cursor) segments.push({ kind: "text", value: raw.slice(cursor, m.index) });
    if (value !== "") segments.push({ kind: "ref", value });
    cursor = end;
    pattern.lastIndex = end;
  }
  if (cursor < raw.length) segments.push({ kind: "text", value: raw.slice(cursor) });
  return segments;
}

function statementSegmentsOf(body: string, handoffTails: ReadonlySet<string>): StatementSegment[] {
  if (body.includes(MARK) || body.includes(SENTINEL)) return parseStatementRefs(body);

  let marked = body.replace(/\[\[([^\]]*)\]\]/g, (_m, inner: string) => {
    if (handoffTails.has(slugifyWikilinkInner(inner))) return SENTINEL;
    return `${MARK}${inner}${MARK}`;
  });
  marked = marked
    .replace(new RegExp(`${escapeRegExp(SEP)}${SENTINEL}`, "g"), "")
    .replace(new RegExp(`${SENTINEL}${escapeRegExp(SEP)}`, "g"), "")
    .replace(new RegExp(SENTINEL, "g"), "");
  marked = marked
    .replace(new RegExp(`^(?:${escapeRegExp(SEP)})+|(?:${escapeRegExp(SEP)})+$`, "g"), "")
    .replace(new RegExp(`(?:${escapeRegExp(SEP)}){2,}`, "g"), SEP)
    .trim();

  const segments: StatementSegment[] = [];
  const chunks = marked.split(MARK);
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (chunk === undefined || chunk === "") continue;
    if (i % 2 === 1) segments.push({ kind: "ref", value: chunk });
    else segments.push(...parseStatementRefs(chunk));
  }
  return segments;
}

/**
 * Shape one step instruction for a viewer.
 *
 * `handsOffToIds` is one address or a list. Each is reduced with a last-slash
 * cut (`slashTail` in id-tail): the query is kept, and the segment is not
 * decoded. A wikilink is a handoff when its inner text, lowercased, with `_`
 * turned into `-`, equals that cut. Dots are not turned into hyphens.
 *
 * `unitTagCarrier` blank or whitespace-only means there is no tag. A real
 * carrier is shown as given, spaces included. It is not trimmed before display.
 * The prefix is lifted out of the body only when it is character-for-character
 * the same as that carrier.
 *
 * Pass null for the handoff list when the step has no links. Do not pass the
 * tag you hoped the sentence contained.
 */
export function formatStepInstruction(
  instruction: string,
  handsOffToIds?: string | readonly string[] | null,
  unitTagCarrier?: string | null,
): StepInstructionDisplay {
  if (instruction === "") return { tag: null, text: "", segments: [] };

  let tag: string | null = null;
  let body = instruction;

  const sepIdx = instruction.indexOf(SEP);
  let prosePrefix: string | null = null;
  if (sepIdx > 0) {
    const candidate = instruction.slice(0, sepIdx);
    if (!/\s/.test(candidate) && !candidate.startsWith("[[")) {
      prosePrefix = candidate;
    }
  }

  const carrier =
    typeof unitTagCarrier === "string" && unitTagCarrier.trim() !== "" ? unitTagCarrier : undefined;

  if (carrier != null) {
    tag = carrier;
    if (prosePrefix != null && prosePrefix === carrier && sepIdx > 0) {
      body = instruction.slice(sepIdx + SEP.length);
    }
  }

  const rawIds = handsOffToIds == null ? [] : typeof handsOffToIds === "string" ? [handsOffToIds] : handsOffToIds;
  const handoffTails = new Set(rawIds.filter((id) => id !== "").map((id) => slashTail(id)));

  let text = body.replace(/\[\[([^\]]*)\]\]/g, (_m, inner: string) => {
    if (handoffTails.has(slugifyWikilinkInner(inner))) return SENTINEL;
    return inner;
  });

  text = text
    .replace(new RegExp(`${escapeRegExp(SEP)}${SENTINEL}`, "g"), "")
    .replace(new RegExp(`${SENTINEL}${escapeRegExp(SEP)}`, "g"), "")
    .replace(new RegExp(SENTINEL, "g"), "");

  text = text
    .replace(new RegExp(`^(?:${escapeRegExp(SEP)})+|(?:${escapeRegExp(SEP)})+$`, "g"), "")
    .replace(new RegExp(`(?:${escapeRegExp(SEP)}){2,}`, "g"), SEP)
    .trim();

  if (text === "") {
    return { tag: null, text: instruction, segments: parseStatementRefs(instruction) };
  }

  return { tag, text, segments: statementSegmentsOf(body, handoffTails) };
}
