/**
 * "+ Add your own" in place on the one card, so every app adds an own field to a linked card from the same code.
 *
 * When there is an online card, it becomes the master, and the user can add their own fields to it. Under each group a quiet
 * "+ Add your own"; pressing it opens a small form in that group; Save puts the value on the holder's own card, private; their
 * online card is not touched.
 *
 * What it draws:
 * - `AddYourOwnButton`: the quiet button alone. For an app editor that opens its own way (a picker sheet, an address form), so the
 *   words and the look are the same; `buttonRef` lets the app return the focus to it when its editor closes.
 * - `AddYourOwn`: the button, and once pressed the in-place form around the app's own field editor (`children`): Save and Cancel and
 *   the private hint. Enter in a field saves (the form's submit), Esc and Cancel close it, and the focus returns to the button.
 *
 * ⛔ No field, no value, no read and no write here: the editor is the app's (`children`), and so is the save (`onSave`), which goes
 * through the app's existing write path for that field. A save that is not stored (`false`) keeps the form open with the app's own
 * `message` (its validation line or its save error), so nothing typed is lost. Cancel writes nothing; the app drops its draft.
 *
 * Styling is inline with CSS variables, the host app's token first, a second app's token next, then a plain value, as the other card controls do.
 * Contrast: the button and the labels use the accent ink and the soft ink (never the faint ink, 3.5:1 on the light surface).
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";

/** The words of the button and the form: the only words this file has. */
export const ADD_OWN_WORDS = {
  button: "+ Add your own",
  buttonName: (noun: string) => `Add your own ${noun}`,
  formName: (noun: string) => `Your own ${noun}`,
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  hint: "Saved on your card, private. Their online card is not changed.",
} as const;

const T = {
  ink: "var(--ink, var(--color-ink, #2a2622))",
  soft: "var(--ink-soft, var(--color-ink-secondary, #67635e))",
  accentInk: "var(--accent-ink, var(--color-primary, #8f4e33))",
  accent: "var(--accent, var(--color-primary, #a85c3b))",
  onAccent: "var(--on-accent, var(--color-on-primary, #fbfaf6))",
  surface: "var(--surface, var(--color-card, #ffffff))",
  line: "var(--line, var(--color-line, #d9d4cb))",
  bad: "var(--bad, var(--color-error-dark, #a5432c))",
  radius: "var(--r-sm, 7px)",
} as const;

/** The 44 px touch-target floor every card control keeps. */
const TARGET = 44;

export interface AddYourOwnButtonProps {
  /** What is added, in the card's words ("email", "phone"): the button's accessible name. */
  noun: string;
  onPress: () => void;
  /** The button element, so the app can return the focus to it when its own editor closes. */
  buttonRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
}

export function AddYourOwnButton({ noun, onPress, buttonRef, disabled = false }: AddYourOwnButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid="add-own"
      aria-label={ADD_OWN_WORDS.buttonName(noun)}
      disabled={disabled}
      onClick={onPress}
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        minHeight: TARGET,
        border: 0,
        background: "transparent",
        padding: "0 2px",
        color: T.accentInk,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {ADD_OWN_WORDS.button}
    </button>
  );
}

export interface AddYourOwnProps {
  /** What is added, in the card's words ("email", "phone"). */
  noun: string;
  /** The form opens: the app starts an empty draft. */
  onOpen?: () => void;
  /** Save the draft through the app's own write path. True: stored, the form closes. False: not stored, it stays open. */
  onSave: () => Promise<boolean> | boolean;
  /** Cancel or Esc: nothing is written; the app drops its draft. */
  onCancel?: () => void;
  /** The app's validation line or save error, shown in the form. */
  message?: ReactNode;
  /** The app's own field editor for the draft. */
  children: ReactNode;
  disabled?: boolean;
}

export function AddYourOwn({ noun, onOpen, onSave, onCancel, message, children, disabled = false }: AddYourOwnProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  /** The form just closed: the focus goes back to the button once it is drawn again. */
  const back = useRef(false);
  const alive = useRef(true);
  /** A save is running: set at once, so a second submit in the same task (two Enters, Enter + click) never saves twice. */
  const running = useRef(false);
  /** The save was not stored: once Save is enabled again, the focus goes back to the field. */
  const refocus = useRef(false);
  const id = useId();
  const msgId = `${id}-message`;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  /** The app's fields in the form (its inputs, never the form's own buttons). */
  const fields = () => [...(form.current?.querySelectorAll<HTMLElement>("input:not([type=hidden]), textarea, select") ?? [])];
  // Save was disabled while it ran, and the browser moved the focus off it to the page; a save that is not stored puts
  // the focus back in the first field, so the person keeps their place and Esc (the form's key) still closes it.
  useEffect(() => {
    if (saving || !refocus.current) return;
    refocus.current = false;
    fields().find((f) => !(f as HTMLInputElement).disabled)?.focus();
  }, [saving]);
  // The message names the fields it is about: each field's aria-describedby carries the message's
  // id and the field is aria-invalid while the message stands. The fields are the app's, so their own attributes are kept.
  useEffect(() => {
    if (!open) return;
    for (const f of fields()) {
      const ids = (f.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((x) => x && x !== msgId);
      if (message) ids.push(msgId);
      if (ids.length) f.setAttribute("aria-describedby", ids.join(" "));
      else f.removeAttribute("aria-describedby");
      if (message) {
        f.setAttribute("aria-invalid", "true");
        f.setAttribute("data-add-own-invalid", "");
      } else if (f.hasAttribute("data-add-own-invalid")) {
        // only what this form set is taken back
        f.removeAttribute("aria-invalid");
        f.removeAttribute("data-add-own-invalid");
      }
    }
  });
  useEffect(() => {
    if (open) {
      // The cursor goes into the app's first field, ready for typing.
      form.current?.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)")?.focus();
    } else if (back.current) {
      back.current = false;
      button.current?.focus();
    }
  }, [open]);

  const close = () => {
    back.current = true;
    setOpen(false);
  };
  const cancel = () => {
    if (running.current) return;
    onCancel?.();
    close();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (running.current) return;
    running.current = true;
    setSaving(true);
    let stored = false;
    try {
      stored = await onSave();
    } catch {
      stored = false;
    }
    running.current = false;
    if (!alive.current) return;
    if (stored) close();
    else refocus.current = true;
    setSaving(false);
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  };

  if (!open)
    return (
      <AddYourOwnButton
        noun={noun}
        disabled={disabled}
        buttonRef={button}
        onPress={() => {
          onOpen?.();
          setOpen(true);
        }}
      />
    );
  const btn = { minHeight: TARGET, borderRadius: T.radius, padding: "0 14px", fontSize: 14, fontWeight: 500, cursor: "pointer" } as const;
  return (
    <form
      ref={form}
      data-testid="add-own-form"
      aria-label={ADD_OWN_WORDS.formName(noun)}
      // The app's own editor validates (its hint, its words): ⛔ no browser bubble on a type="email" box.
      noValidate
      aria-describedby={`${id}-hint`}
      onSubmit={(e) => void submit(e)}
      onKeyDown={keys}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", padding: "8px 0" }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 12, color: T.soft }}>{ADD_OWN_WORDS.formName(noun)}</span>
        {children}
      </div>
      <button
        type="submit"
        data-testid="add-own-save"
        disabled={saving}
        style={{ ...btn, border: `1px solid ${T.accent}`, background: T.accent, color: T.onAccent, opacity: saving ? 0.7 : 1 }}
      >
        {saving ? ADD_OWN_WORDS.saving : ADD_OWN_WORDS.save}
      </button>
      <button type="button" data-testid="add-own-cancel" disabled={saving} onClick={cancel} style={{ ...btn, border: `1px solid ${T.line}`, background: T.surface, color: T.ink }}>
        {ADD_OWN_WORDS.cancel}
      </button>
      {message ? (
        <p id={msgId} role="alert" data-testid="add-own-message" style={{ flexBasis: "100%", margin: 0, fontSize: 12.5, color: T.bad }}>
          {message}
        </p>
      ) : null}
      <p id={`${id}-hint`} data-testid="add-own-hint" style={{ flexBasis: "100%", margin: 0, fontSize: 11.5, color: T.soft }}>
        {ADD_OWN_WORDS.hint}
      </p>
    </form>
  );
}
