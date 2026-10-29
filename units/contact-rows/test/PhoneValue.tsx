// A copy of the app's PhoneValue (src/components/mynet/PhoneValue.tsx lines 11-159), used by the tests as the host's `PhoneValue`.
// Leaving without a change saves nothing.

import { useEffect, useRef, useState } from "react";
import { joinPhone, splitPhone } from "./appDialCode";

export function PhoneValue({
  value,
  suggestedDial,
  onCommit,
  onDialSet,
  ariaLabel,
  startEditing = false,
}: {
  value: string;
  suggestedDial?: string;
  onCommit: (value: string) => void;
  /** The person changed the code. Not called for a prefill. */
  onDialSet?: (dial: string) => void;
  ariaLabel: string;
  /**
   * GilbApp (Kai 2026-10-14: a new phone "needs to automatically put the cursor in the + field ready
   * for typing"): a row just added by "add phone" opens straight into editing with the cursor in the
   * country-code box, instead of showing a blank "Add phone" to tap first. Not in MyNet `18f6c2d`.
   */
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [dial, setDial] = useState("");
  const [national, setNational] = useState("");
  const sentDial = useRef("");
  const opened = useRef<{ dial: string; national: string }>({ dial: "", national: "" });
  const codeRef = useRef<HTMLInputElement>(null);
  const focusCode = useRef(false);

  function open() {
    const parts = splitPhone(value);
    const nextDial = value.trim() === "" ? parts.dial || suggestedDial || "" : parts.dial;
    const nextNational = parts.national;
    setDial(nextDial);
    setNational(nextNational);
    opened.current = { dial: nextDial, national: nextNational };
    setEditing(true);
  }

  // A new row opens at once with the cursor after the "+" (GilbApp, see `startEditing`).
  useEffect(() => {
    if (!startEditing) return;
    focusCode.current = true;
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the row is added
  }, [startEditing]);
  useEffect(() => {
    if (!editing || !focusCode.current) return;
    focusCode.current = false;
    const el = codeRef.current;
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [editing]);

  /** A4: the person changed the code box from what it showed at open. Accepting the prefilled
   *  home code is ⛔ not a change (the contract of `onDialSet`: "Not called for a prefill"). */
  function codeChangedFromOpen(nextDial: string): boolean {
    return nextDial.replace(/\D/g, "") !== opened.current.dial.replace(/\D/g, "");
  }

  function commit(nextDial: string, nextNational: string, codeChanged: boolean) {
    if (
      nextDial.replace(/\D/g, "") === opened.current.dial.replace(/\D/g, "") &&
      nextNational.trim() === opened.current.national.trim()
    ) {
      setEditing(false);
      return;
    }
    const next = nextNational.trim() ? joinPhone(nextDial, nextNational) : "";
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    onCommit(next);
    const digits = nextDial.replace(/\D/g, "");
    if (codeChanged && digits && sentDial.current !== digits) {
      sentDial.current = digits;
      onDialSet?.(digits);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="mt-0.5 block w-full break-words text-left text-[15px] text-[var(--ink)]"
        aria-label={ariaLabel}
        onClick={open}
      >
        {value.trim() ? (
          value.trim()
        ) : (
          <span className="text-[var(--ink-faint)]">Add phone</span>
        )}
      </button>
    );
  }

  return (
    <div
      className="mt-0.5 flex gap-2"
      data-testid="phone-parts"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        commit(dial, national, codeChangedFromOpen(dial));
      }}
    >
      <label className="flex w-24 shrink-0 flex-col gap-0.5">
        <span className="sr-only">Country code</span>
        <input
          ref={codeRef}
          aria-label="Country code"
          inputMode="tel"
          className="min-h-11 w-full rounded-[var(--r-sm)] border border-[var(--line-2)] bg-[var(--surface)] px-2 text-[16px] text-[var(--ink)]"
          value={dial ? `+${dial.replace(/\D/g, "")}` : "+"}
          // A3: a number that already starts with + keeps its own code (`joinPhone`), so a code
          // typed here would be dropped without a sign. The box is read-only until the + is gone.
          readOnly={national.trim().startsWith("+")}
          title={national.trim().startsWith("+") ? "The number already carries its country code" : undefined}
          onChange={(e) => setDial(e.target.value.replace(/\D/g, ""))}
          data-testid="phone-country-code"
        />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="sr-only">Phone number</span>
        <input
          aria-label="Phone number"
          inputMode="tel"
          className="min-h-11 w-full rounded-[var(--r-sm)] border border-[var(--line-2)] bg-[var(--surface)] px-2 text-[16px] text-[var(--ink)]"
          value={national}
          onChange={(e) => setNational(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(dial, national, codeChangedFromOpen(dial));
          }}
          data-testid="phone-national"
        />
      </label>
    </div>
  );
}
