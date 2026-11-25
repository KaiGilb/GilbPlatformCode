/**
 * Editing one cell of a table, with no screen and no network: whether a cell may be edited and with what, how typed text becomes the
 * value to store, what one edit sends, what to do when the record changed under an edit, what a refused write means for the cell, and
 * what each key does.
 *
 * A cell is one fact of one record. An edit of it is one merge-patch that names that one field; clearing a cell removes the fact and
 * never stores an empty text. Nothing here writes: a host hands the patch to its own write path.
 */

import type { TypeField } from "@kaigilb/gilbplatformcode-type-fields";
import { NAME_COLUMN_ID, type Cell, type TableColumn } from "./tableCore";

/** What a cell is edited with. `text` is also long text: the same box, which grows. */
export type EditorKind = "text" | "number" | "date" | "checkbox" | "choice";

/** A plain value one cell stores. "No fact" is `null`, never an empty text. */
export type CellValue = string | number | boolean;

/** A cell that may be edited, and how. */
export interface EditPlan {
  editable: true;
  editor: EditorKind;
  /** For `number`: the field takes whole numbers only. */
  integer: boolean;
  /** For `choice`: the field's closed list, in served order. */
  options: readonly string[] | null;
  /** The type requires this field of every record: it cannot be cleared. */
  required: boolean;
  /** The one key a writer may use for this field (`a:<slug>`). */
  writeKey: string;
  /** The field's label, for a sentence. */
  label: string;
}

/** A cell that may not be edited here, and why. The reason is a sentence for the person. */
export interface ReadOnlyCell {
  editable: false;
  reason: string;
}

export type Editability = EditPlan | ReadOnlyCell;

/** Why a cell is read-only, by case. Kept in one place so a screen and a test read the same words. */
export const READ_ONLY_REASON = {
  name: "The name is changed on the card for now",
  link: "Links are changed on the card for now",
  multi: "A field with several values is changed on the card for now",
  dateTime: "A date with a time is changed on the card for now",
  otherKind: "This kind of value is changed on the card for now",
  system: "The vault sets this value itself",
  stored: "No GilbVeda field describes this value, so it cannot be changed here",
  noWriteKey: "GilbVeda gives no single name to write this field under, so it cannot be changed here",
  unread: "This value is not loaded, so it cannot be changed here",
  severalHeld: "This cell holds several values; they are changed on the card for now",
  noPlainForm: "This value has no plain form; it is changed on the card for now",
} as const;

const no = (reason: string): ReadOnlyCell => ({ editable: false, reason });

/** Every form an encoding names, lower-cased (`a|b`, `a,b` and a served list are several forms). */
function encodingForms(encoding: TypeField["encoding"]): string[] {
  const served = typeof encoding === "string" ? [encoding] : (encoding ?? []);
  return served.flatMap((text) => text.split(/[|,]/)).map((part) => part.trim().toLowerCase()).filter((part) => part !== "");
}

/** What {@link editabilityOf} may be told by its host. */
export interface EditabilityOptions {
  /**
   * The keys of fields the vault sets itself (who stated a record, when it was made): a column whose field reads or writes one of them
   * is read-only. The host names them; this unit knows no field by name.
   */
  systemKeys?: ReadonlySet<string>;
}

/**
 * Whether one cell may be edited here, and with what editor; else why not.
 *
 * In scope: a single plain value of a text, number, date, yes-or-no or closed-list field. Read-only, each with its reason: the Name
 * column, a link, a field that holds several values, a date with a time, any other kind of value, a value no field describes, a field
 * with no single key to write, a field the vault sets itself, and a value that is not loaded.
 * A field whose term states no cardinality is edited as one value while its cell holds one value or none (a card edits it so too);
 * when the cell holds several, it is read-only.
 *
 * @param column the cell's column
 * @param cell the cell as the table built it
 * @param options what the host knows that the term does not say
 */
export function editabilityOf(column: TableColumn, cell: Cell, options: EditabilityOptions = {}): Editability {
  if (column.id === NAME_COLUMN_ID || column.source === "name") return no(READ_ONLY_REASON.name);
  const field = column.field;
  if (!field) return no(READ_ONLY_REASON.stored);
  if (options.systemKeys && [field.anchor, ...field.readKeys].some((key) => options.systemKeys?.has(key))) return no(READ_ONLY_REASON.system);
  if (field.kind === "reference" || cell.kind === "ref") return no(READ_ONLY_REASON.link);
  if (field.cardinality === "multi") return no(READ_ONLY_REASON.multi);
  if (cell.kind === "unread") return no(READ_ONLY_REASON.unread);
  if (cell.kind === "list") return cell.items.some((item) => item.kind === "ref") ? no(READ_ONLY_REASON.link) : no(READ_ONLY_REASON.severalHeld);
  if (cell.kind === "object") return no(READ_ONLY_REASON.noPlainForm);
  if (field.writeKey === null) return no(READ_ONLY_REASON.noWriteKey);
  const plan = (editor: EditorKind, extra: Partial<EditPlan> = {}): EditPlan => ({
    editable: true,
    editor,
    integer: false,
    options: null,
    required: field.required,
    writeKey: field.writeKey as string,
    label: field.label,
    ...extra,
  });
  // A field with a list of values that is not declared open is a choice from that list, whatever its literal kind.
  const closed = field.valueSet !== null && field.valueSet.values.length > 0 && (field.valueSet.closure ?? "closed").toLowerCase() !== "open";
  switch (field.kind) {
    case "text":
    case "token":
      return closed ? plan("choice", { options: field.valueSet?.values ?? [] }) : plan("text");
    case "integer":
      return plan("number", { integer: true });
    case "decimal":
      return plan("number");
    case "boolean":
      return plan("checkbox");
    case "date":
      return encodingForms(field.encoding).some((form) => form.includes("datetime")) ? no(READ_ONLY_REASON.dateTime) : plan("date");
    default:
      return no(READ_ONLY_REASON.otherKind);
  }
}

/**
 * The plain value a cell stores: the value, `null` for no fact, or `undefined` when the cell holds something that is not one plain
 * value (a link, a list, an unread fact).
 *
 * @param cell the cell
 */
export function storedValueOf(cell: Cell): CellValue | null | undefined {
  if (cell.kind === "empty") return null;
  if (cell.kind === "value") return cell.value;
  return undefined;
}

/** True when two cell values are the same stored fact: `null` only equals `null`, a number equals the same number, text is compared exactly. */
export function sameCellValue(a: CellValue | null | undefined, b: CellValue | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === "number" && typeof b === "number") return a === b;
  return typeof a === typeof b && a === b;
}

// --- Typed text to a value ---

/** Typed text read as a value to store, or the reason it is not written. `value: null` means "remove the fact". */
export type Parsed<T extends CellValue = CellValue> = { ok: true; value: T | null } | { ok: false; why: string };

/** The marks a locale writes a number with. */
export interface NumberMarks {
  decimal: string;
  group: string;
}

/**
 * The decimal and grouping marks of a locale, from `Intl.NumberFormat` (no table of locales is kept here).
 *
 * @param locale a BCP 47 tag, as the browser gives it (`navigator.language`)
 */
export function numberMarksOf(locale: string): NumberMarks {
  let parts: Intl.NumberFormatPart[];
  try {
    parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1234567.5);
  } catch {
    parts = new Intl.NumberFormat("en", { useGrouping: true }).formatToParts(1234567.5);
  }
  return { decimal: parts.find((p) => p.type === "decimal")?.value ?? ".", group: parts.find((p) => p.type === "group")?.value ?? "," };
}

/** Every kind of space a locale may group digits with (fr: a narrow no-break space) reads as that locale's grouping space. */
const SPACES = /[\s   ]/g;
const isSpace = (mark: string) => mark.replace(SPACES, "") === "";

/**
 * A number as the person typed it, in their locale, as a JSON number.
 *
 * The locale's own decimal and grouping marks are the only ones read (`1,234.5` in en, `1.234,5` in de). Grouping must be in threes,
 * so that `1,23` in en, which is most likely a decimal typed the other way, is refused and not read as 123. A mark the locale does not
 * use, in a place where it could be either, is refused as ambiguous and not guessed. `1e3` is 1000. `-0` is stored as 0 (JSON has no
 * negative zero). Empty text is no value. Whole digits typed in full that cannot be stored exactly (past 2^53) are refused.
 *
 * @param text what was typed
 * @param locale the person's locale
 * @param rule `integer`: the field takes whole numbers only
 * @returns the number, `null` for empty text, or why it is not a number
 */
export function parseNumberInput(text: string, locale: string, rule: { integer?: boolean } = {}): Parsed<number> {
  const typed = text.trim();
  if (typed === "") return { ok: true, value: null };
  const { decimal, group } = numberMarksOf(locale);
  const other = decimal === "." ? "," : ".";
  const notANumber = (): Parsed<number> => ({ ok: false, why: `"${typed}" is not a number` });
  // The minus sign may be typed as a hyphen or as the real minus.
  let rest = typed.replace(/^[−-]/, "-");
  const negative = rest.startsWith("-");
  if (negative || rest.startsWith("+")) rest = rest.slice(1);
  // An exponent is read as written (`1e3`), after the mantissa in the locale's marks.
  const exp = /^(.*?)[eE]([+-]?\d+)$/.exec(rest);
  const mantissa = exp ? (exp[1] as string) : rest;
  const exponent = exp ? Number(exp[2]) : 0;
  const pieces = mantissa.split(decimal);
  if (pieces.length > 2) return notANumber();
  let whole = pieces[0] as string;
  const fraction = pieces[1] ?? "";
  if (fraction !== "" && !/^\d+$/.test(fraction)) {
    // Something that is not a digit after the decimal mark: the other locale's way of writing (`1,234.5` typed in de), or not a number.
    if (/^[\d.,\s   ']+$/.test(fraction)) return { ok: false, why: `"${typed}" can be read in two ways. Write the decimals after "${decimal}" and leave out other marks` };
    return notANumber();
  }
  const groupMark = isSpace(group) ? " " : group;
  if (isSpace(group)) whole = whole.replace(SPACES, " ");
  if (whole.includes(groupMark)) {
    const groups = whole.split(groupMark);
    const inThrees = /^\d{1,3}$/.test(groups[0] as string) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
    if (!inThrees) {
      if (groups.every((g) => /^\d*$/.test(g))) return { ok: false, why: `"${typed}" can be read in two ways. Write the decimals after "${decimal}"${groupMark === " " ? "" : `; "${groupMark}" only separates thousands`}` };
      return notANumber();
    }
    whole = groups.join("");
  }
  if (!/^\d*$/.test(whole)) {
    // The other mark, where this locale does not use it: one read would make it a decimal, another a thousands separator.
    if (new RegExp(`^[\\d${other === "." ? "\\." : other}]+$`).test(whole)) return { ok: false, why: `"${typed}" can be read in two ways. Here decimals are written after "${decimal}"` };
    return notANumber();
  }
  if (whole === "" && fraction === "") return notANumber();
  const value = Number(`${whole === "" ? "0" : whole}${fraction === "" ? "" : `.${fraction}`}e${exponent}`);
  if (!Number.isFinite(value)) return notANumber();
  // Whole digits typed out in full that a JSON number cannot hold exactly (past 2^53) would come back as another number: refused.
  if (!exp && fraction === "" && whole.length > 15 && BigInt(whole) !== BigInt(value)) return { ok: false, why: `"${typed}" is too large to be stored exactly` };
  if (rule.integer && !Number.isInteger(value)) return { ok: false, why: `"${typed}" is not a whole number` };
  // `-0` and `0` are one number, and JSON has only the one.
  return { ok: true, value: value === 0 ? 0 : negative ? -value : value };
}

/**
 * A stored number as the person's locale writes it, with the locale's decimal mark and no grouping (a year stays `2026`). Typing this
 * text back gives the same number.
 *
 * @param value the stored number
 * @param locale the person's locale
 */
export function formatNumber(value: number, locale: string): string {
  // The shortest text that reads back as exactly this number (JavaScript's own), with the locale's decimal mark in place of the point.
  // Digits are 0 to 9 in every locale, as `parseNumberInput` reads them. A very large or very small number keeps its exponent form.
  return String(Object.is(value, -0) ? 0 : value).replace(".", numberMarksOf(locale).decimal);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * A date as picked (`YYYY-MM-DD`), kept as that text. It is checked as a calendar date by arithmetic alone: it never passes through a
 * `Date`, so no time zone can move it to the day before or after.
 *
 * @param text what the date box holds
 * @returns the same text, `null` for empty text, or why it is not a date
 */
export function parseDateInput(text: string): Parsed<string> {
  const typed = text.trim();
  if (typed === "") return { ok: true, value: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typed);
  const refuse = (): Parsed<string> => ({ ok: false, why: `"${typed}" is not a date. Write it as year-month-day, for example 2026-12-31` });
  if (!m) return refuse();
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return refuse();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = month === 2 && leap ? 29 : (DAYS_IN_MONTH[month - 1] as number);
  if (day > last) return refuse();
  return { ok: true, value: typed };
}

/**
 * A value against a closed list. The list is checked here every time, because a list on a term a person made does not bind on the
 * server.
 *
 * @param text what was typed or picked
 * @param options the list
 * @returns the value exactly as the list holds it, `null` for empty text, or "<value> is not in this list"
 */
export function checkChoice(text: string, options: readonly string[]): Parsed<string> {
  if (text === "") return { ok: true, value: null };
  if (options.includes(text)) return { ok: true, value: text };
  return { ok: false, why: `${text} is not in this list` };
}

/**
 * Typed text as the value one cell stores.
 *
 * Text is stored exactly as typed: nothing is trimmed, so leading and trailing spaces and every character come back the same; only
 * empty text is "no value". A number, a date and a choice are read by their own rules. A value of `null` on a required field is
 * refused with "<field> is required".
 *
 * @param plan the cell's edit plan
 * @param text what the editor holds
 * @param locale the person's locale, for a number
 */
export function parseEdit(plan: EditPlan, text: string, locale: string): Parsed {
  let parsed: Parsed;
  if (plan.editor === "number") parsed = parseNumberInput(text, locale, { integer: plan.integer });
  else if (plan.editor === "date") parsed = parseDateInput(text);
  else if (plan.editor === "choice") parsed = checkChoice(text, plan.options ?? []);
  else if (plan.editor === "checkbox") parsed = text === "" ? { ok: true, value: null } : text === "true" || text === "false" ? { ok: true, value: text === "true" } : { ok: false, why: `"${text}" is not yes or no` };
  else parsed = { ok: true, value: text === "" ? null : text };
  if (parsed.ok && parsed.value === null && plan.required) return { ok: false, why: `${plan.label} is required` };
  return parsed;
}

/**
 * What a stored value reads as on screen, and what its editor starts with: a number in the locale's marks, anything else as stored.
 * `parseEdit` of this text gives the value back.
 *
 * @param value the stored value, or `null` for none
 * @param locale the person's locale
 */
export function valueText(value: CellValue | null | undefined, locale: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value, locale);
  return String(value);
}

/**
 * The merge-patch one cell edit sends: that one field and nothing else. Clearing a cell removes the fact (`null`); it never writes `""`.
 *
 * @param writeKey the field's write key
 * @param value the new value, or `null` to remove the fact
 */
export function cellPatch(writeKey: string, value: CellValue | null): Record<string, CellValue | null> {
  return { [writeKey]: value === "" ? null : value };
}

// --- A record that changed under the edit ---

/** What to do when the vault says the record changed since the cell read it (412), after the record was read again. */
export type StaleDecision =
  /** The field still holds what the edit started from: send again with the new version. */
  | "retry"
  /** The field already holds what was typed: it counts as saved. */
  | "saved"
  /** The field holds something else: show both and ask. Never overwrite. */
  | "conflict";

/**
 * The decision after a stale write.
 *
 * @param at `base`: what the field held when the edit started; `typed`: what the person entered; `server`: what the field holds now
 */
export function decideAfterStale(at: { base: CellValue | null; typed: CellValue | null; server: CellValue | null | undefined }): StaleDecision {
  // A server value that is not one plain value (it became a list or a link) is never what the edit started from.
  if (at.server === undefined) return "conflict";
  if (sameCellValue(at.server, at.typed)) return "saved";
  if (sameCellValue(at.server, at.base)) return "retry";
  return "conflict";
}

// --- A refused write ---

/** A write that did not land, as the host saw it. A refused cross-origin call has no status: that is `network`. */
export type WriteFailure =
  | { kind: "network"; message?: string | null }
  | { kind: "http"; status: number; error?: string | null; message?: string | null };

/** What a failed write means for its cell. */
export interface CellProblem {
  /**
   * `failed`: not saved, can be tried again. `not-in-list`: the vault refused the value. `required`: the field cannot be cleared.
   * `read-only`: the person may not write this record. `gone`: the record is no longer there. `refused`: any other refusal, in the
   * vault's own words.
   */
  state: "failed" | "not-in-list" | "required" | "read-only" | "gone" | "refused";
  /** What the cell says. */
  message: string;
  /** True when sending the same value again can help (the cell offers Retry). */
  retry: boolean;
  /** True when the typed value stays in the cell; false when the cell goes back to the stored value. */
  keepsTyped: boolean;
}

/**
 * What a failed write means for the cell.
 *
 * - no answer at all (offline, or a cross-origin call the browser refused, which has no status): "Not saved: no connection. Retry";
 * - 5xx: not saved, with the vault's own words, and Retry;
 * - 422 `ValueNotAllowedError`: the value is not in the field's list; 422 `RequiredSlotMissingError`: "<field> is required", and the
 *   cell is not cleared;
 * - 403: the person may not write this record: read-only, with the reason;
 * - 404: "This record is no longer there";
 * - anything else (409 `UndefinedTermError` among them): the vault's own words.
 *
 * @param failure the failure
 * @param cell the field's label and the typed value, for the sentences
 */
export function problemOf(failure: WriteFailure, cell: { label: string; typed: CellValue | null; locale?: string }): CellProblem {
  const words = (failure.message ?? "").trim();
  if (failure.kind === "network") return { state: "failed", message: "Not saved: no connection. Retry", retry: true, keepsTyped: true };
  const { status, error } = failure;
  if (status >= 500) return { state: "failed", message: `Not saved: ${words || `the vault answered ${status}`}. Retry`, retry: true, keepsTyped: true };
  if (status === 422 && error === "ValueNotAllowedError") return { state: "not-in-list", message: `${valueText(cell.typed, cell.locale ?? "en")} is not in this list`, retry: false, keepsTyped: true };
  if (status === 422 && error === "RequiredSlotMissingError") return { state: "required", message: `${cell.label} is required`, retry: false, keepsTyped: false };
  if (status === 403) return { state: "read-only", message: words || "You can read this record but not change it", retry: false, keepsTyped: false };
  if (status === 404) return { state: "gone", message: "This record is no longer there", retry: false, keepsTyped: false };
  if (status === 401) return { state: "failed", message: "Not saved: you are signed out. Sign in, then Retry", retry: true, keepsTyped: true };
  return { state: "refused", message: `Not saved: ${words || `the vault answered ${status}${error ? ` ${error}` : ""}`}`, retry: false, keepsTyped: true };
}

// --- The keyboard ---

/** What the table is doing with keys: moving a selection, or typing in a cell. */
export type GridMode = "nav" | "edit";

/** One key press, with what the table knows about the selected cell. */
export interface KeyInput {
  key: string;
  shift?: boolean;
  alt?: boolean;
  /** Control or the Mac's command key: the browser's own shortcuts, never the table's. */
  command?: boolean;
  mode: GridMode;
  /** The selected cell may be edited. */
  editable: boolean;
  /** The selected cell's editor, when it may be edited. */
  editor: EditorKind | null;
  /** The key came while an input method was still composing a character: it is the input method's key. */
  composing?: boolean;
}

/** What a key press does. */
export type KeyAct =
  /** Nothing of the table's: the browser does what it does. */
  | { act: "none" }
  | { act: "move"; rows: number; cols: number }
  | { act: "page"; direction: 1 | -1 }
  | { act: "edge"; to: "first-row" | "last-row" }
  /** Open the selected row's record. */
  | { act: "open" }
  /** Start typing in the cell. `replaceWith`: the character that starts an edit and replaces the value. */
  | { act: "edit"; replaceWith?: string }
  /** A yes-or-no cell: change it and save at once. */
  | { act: "toggle" }
  /** Remove the cell's value. */
  | { act: "clear" }
  /** Finish the edit and save, then move. */
  | { act: "commit"; then: "down" | "up" | "right" | "left" }
  /** Give the edit up and show the stored value. */
  | { act: "cancel" }
  /** A cell that may not be edited was asked to: say why. */
  | { act: "explain" };

/**
 * What a key does.
 *
 * Moving (`nav`): the arrows move the selection; Page up and down, Home and End move by a screen and to the first and last row; Space
 * opens the row's record, except on a yes-or-no cell, where Space and Enter change it and save; Enter starts an edit; a typed character
 * starts an edit that replaces the value; Delete and Backspace clear the cell. On a cell that may not be edited, Enter, a character and
 * Delete say why. Typing (`edit`): Enter saves and moves down (Shift: up), Tab saves and moves right (Shift: left), Escape gives the
 * edit up. Alt+Enter is the editor's own (a new line in long text). Every other key is the editor's.
 *
 * @param input the key and what is selected
 */
export function keyAct(input: KeyInput): KeyAct {
  const { key, mode } = input;
  if (input.composing) return { act: "none" };
  if (mode === "edit") {
    if (key === "Escape") return { act: "cancel" };
    if (key === "Enter") return input.alt ? { act: "none" } : { act: "commit", then: input.shift ? "up" : "down" };
    if (key === "Tab") return { act: "commit", then: input.shift ? "left" : "right" };
    return { act: "none" };
  }
  if (input.command) return { act: "none" };
  switch (key) {
    case "ArrowDown":
      return { act: "move", rows: 1, cols: 0 };
    case "ArrowUp":
      return { act: "move", rows: -1, cols: 0 };
    case "ArrowRight":
      return { act: "move", rows: 0, cols: 1 };
    case "ArrowLeft":
      return { act: "move", rows: 0, cols: -1 };
    case "PageDown":
      return { act: "page", direction: 1 };
    case "PageUp":
      return { act: "page", direction: -1 };
    case "Home":
      return { act: "edge", to: "first-row" };
    case "End":
      return { act: "edge", to: "last-row" };
    case " ":
    case "Spacebar":
      return input.editable && input.editor === "checkbox" ? { act: "toggle" } : { act: "open" };
    case "Enter":
      if (!input.editable) return { act: "explain" };
      return input.editor === "checkbox" ? { act: "toggle" } : { act: "edit" };
    case "Delete":
    case "Backspace":
      return input.editable ? { act: "clear" } : { act: "explain" };
    default:
      // One typed character (a letter, a digit, a sign; not a named key such as "F2" or "Shift") starts an edit that replaces the value.
      if ([...key].length === 1 && !input.alt) {
        if (!input.editable) return { act: "explain" };
        return input.editor === "checkbox" ? { act: "none" } : { act: "edit", replaceWith: key };
      }
      return { act: "none" };
  }
}

/** Where the selection is, and whether a cell is being typed in. Columns count from 0, the Name column. */
export interface GridState {
  row: number;
  col: number;
  mode: GridMode;
}

/**
 * The selection after an act, inside a table of `rows` by `cols`. A move stops at the table's edges; finishing or giving up an edit
 * returns to moving; a page move is `pageRows` rows.
 *
 * @param state the selection now
 * @param act what a key did
 * @param size the table's size, and how many rows a page move is
 */
export function nextGridState(state: GridState, act: KeyAct, size: { rows: number; cols: number; pageRows?: number }): GridState {
  const clampRow = (r: number) => Math.max(0, Math.min(size.rows - 1, r));
  const clampCol = (c: number) => Math.max(0, Math.min(size.cols - 1, c));
  switch (act.act) {
    case "move":
      return { row: clampRow(state.row + act.rows), col: clampCol(state.col + act.cols), mode: "nav" };
    case "page":
      return { ...state, row: clampRow(state.row + act.direction * Math.max(1, size.pageRows ?? 1)), mode: "nav" };
    case "edge":
      return { ...state, row: act.to === "first-row" ? 0 : clampRow(size.rows - 1), mode: "nav" };
    case "edit":
      return { ...state, mode: "edit" };
    case "commit": {
      const rows = act.then === "down" ? 1 : act.then === "up" ? -1 : 0;
      const cols = act.then === "right" ? 1 : act.then === "left" ? -1 : 0;
      return { row: clampRow(state.row + rows), col: clampCol(state.col + cols), mode: "nav" };
    }
    case "cancel":
      return { ...state, mode: "nav" };
    default:
      return state;
  }
}
