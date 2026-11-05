/**
 * Field rules for the waiting-list form. Pure: no Vue, no network.
 * The form calls these before it sends, and the host's server should call `validate` again
 * with the same field list. An empty result means the answers pass.
 */
import type { WaitlistField } from "./types";

/** Something, one @, something, a dot, something. Loose on purpose: a strict pattern costs a person their place. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type FieldErrorCode = "required" | "invalidEmail" | "tooLong" | "invalidChoice";

export interface FieldError {
  name: string;
  code: FieldErrorCode;
  /** Set for `tooLong`: the field's maximum, after trimming. */
  max?: number;
}

/** What `buildBody` adds beside the field values. */
export interface WaitlistExtra {
  /** Included even when it is an empty string, so the record says where the person signed up. */
  page?: string;
  /** The notice words that were shown. Omitted when absent or empty. */
  notice?: string;
  /** Included when the form has a Turnstile key, once the widget has answered. */
  turnstileToken?: string;
  /** Included under `name` even when `value` is empty. Omitted when absent. */
  honeypot?: { name: string; value: string };
}

export type WaitlistValues = Record<string, string>;

function trimmed(values: WaitlistValues, name: string): string {
  return (values[name] ?? "").trim();
}

/**
 * The problems with these answers, in field order. Empty means they pass.
 *
 * @param fields - the questions the form showed
 * @param values - raw answers, keyed by field name (they are trimmed here)
 */
export function validate(fields: readonly WaitlistField[], values: WaitlistValues): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of fields) {
    const value = trimmed(values, field.name);
    if (field.kind === "choice") {
      if (value === "") {
        if (field.required) errors.push({ name: field.name, code: "required" });
        continue;
      }
      if (!field.options.some((option) => option.value === value)) {
        errors.push({ name: field.name, code: "invalidChoice" });
      }
      continue;
    }
    if (value === "") {
      if (field.required) errors.push({ name: field.name, code: "required" });
      continue;
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      errors.push({ name: field.name, code: "tooLong", max: field.maxLength });
      continue;
    }
    if (field.kind === "email" && !EMAIL_SHAPE.test(value)) {
      errors.push({ name: field.name, code: "invalidEmail" });
    }
  }
  return errors;
}

/**
 * The JSON body: trimmed field values, empty ones left out, then `page`, `notice`, `turnstileToken`
 * and, when given, the honeypot from `extra`.
 * Call `validate` first; this does not drop an answer that fails a rule.
 *
 * @param fields - the questions the form showed
 * @param values - raw answers, keyed by field name
 * @param extra - page, notice text, the Turnstile token, and the honeypot
 */
export function buildBody(
  fields: readonly WaitlistField[],
  values: WaitlistValues,
  extra: WaitlistExtra = {},
): Record<string, string> {
  const body: Record<string, string> = {};
  for (const field of fields) {
    const value = trimmed(values, field.name);
    if (value === "") continue;
    body[field.name] = value;
  }
  if (extra.page !== undefined) body.page = extra.page;
  if (extra.notice !== undefined && extra.notice !== "") body.notice = extra.notice;
  if (extra.turnstileToken !== undefined) body.turnstileToken = extra.turnstileToken;
  if (extra.honeypot !== undefined) body[extra.honeypot.name] = extra.honeypot.value;
  return body;
}
