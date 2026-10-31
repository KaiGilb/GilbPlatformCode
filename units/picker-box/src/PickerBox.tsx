/**
 * A search box with a list to pick ONE value from. The person types, the matches show under the box, and a tap (or
 * Enter on the highlighted one) picks it. Nothing is ever saved from what was typed: only a picked match is.
 */
import { useEffect, useId, useRef, useState } from "react";

/** One match the person can pick. */
export interface PickerOption {
  /** What identifies the match to the caller (an entry address, a zone name). */
  id: string;
  /** What the person reads. */
  label: string;
}

export function PickerBox({
  label,
  placeholder,
  current,
  search,
  onChoose,
  onCancel,
  onClear,
  minChars = 1,
  debounceMs = 0,
}: {
  /** The box's accessible name (the field's name). */
  label: string;
  placeholder?: string;
  /** The stored value as the person reads it, shown above the box; empty when nothing is stored. */
  current: string;
  /** The matches for what was typed. ⚠ May be called again before an earlier call ends: the signal
   *  aborts the old one. */
  search: (query: string, signal: AbortSignal) => Promise<PickerOption[]> | PickerOption[];
  /** Picks one match. A thrown error's message is shown, and the box stays open. */
  onChoose: (option: PickerOption) => Promise<void> | void;
  onCancel: () => void;
  /** Offered only when something is stored. */
  onClear?: () => void;
  minChars?: number;
  debounceMs?: number;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "done" | "error">("idle");
  const [active, setActive] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The latest search wins: a slow answer to an older query must not replace a newer one.
  const runRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < minChars) {
      setOptions([]);
      setState("idle");
      return;
    }
    const run = ++runRef.current;
    const ctrl = new AbortController();
    setState("searching");
    const timer = setTimeout(() => {
      Promise.resolve(search(q, ctrl.signal)).then(
        (found) => {
          if (run !== runRef.current) return;
          setOptions(found);
          setActive(0);
          setState("done");
        },
        () => {
          if (run !== runRef.current || ctrl.signal.aborted) return;
          setOptions([]);
          setState("error");
        },
      );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, minChars, debounceMs, search]);

  const choose = async (o: PickerOption) => {
    if (choosing) return;
    setChoosing(true);
    setMessage(null);
    try {
      await onChoose(o);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setChoosing(false);
    }
  };

  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <div className="mt-0.5 flex flex-col gap-1">
      {current ? <p className="text-xs text-[var(--ink-faint)]" data-testid="picker-current">Now: {current}</p> : null}
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
        // The box opened because the person asked to change this value, so it takes the cursor.
        autoFocus
        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] text-[var(--ink)]"
        placeholder={placeholder}
        value={query}
        disabled={choosing}
        onChange={(e) => {
          setQuery(e.target.value);
          setMessage(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const o = options[active];
            if (o) void choose(o);
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
      />
      {/* Delta 6 F2: below the minimum nothing is sent, and the person is told to keep typing. */}
      {query.trim().length > 0 && query.trim().length < minChars ? (
        <p className="text-xs text-[var(--ink-faint)]" data-testid="picker-keep-typing">Keep typing…</p>
      ) : null}
      {state === "searching" ? <p className="text-xs text-[var(--ink-faint)]">Searching…</p> : null}
      {state === "done" && options.length === 0 ? (
        <p className="text-xs text-[var(--ink-faint)]" data-testid="picker-no-match">No match for “{query.trim()}”.</p>
      ) : null}
      {state === "error" ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="picker-search-failed">
          The list could not be searched right now. Nothing was changed.
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="picker-message">
          {message}
        </p>
      ) : null}
      <ul role="listbox" id={listId} aria-label={label} className="flex max-h-60 flex-col overflow-auto">
        {options.map((o, i) => (
          <li
            key={o.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            data-testid="picker-option"
            className={`min-h-11 cursor-pointer rounded-md px-2 py-2 text-[15px] text-[var(--ink)] ${i === active ? "bg-[var(--sel)]" : ""}`}
            // Keep the cursor in the box: a press here must not blur it before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void choose(o)}
          >
            {o.label}
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        <button type="button" className="text-xs font-medium text-[var(--ink-faint)] underline" onClick={onCancel}>
          Cancel
        </button>
        {onClear && current ? (
          <button type="button" className="text-xs font-medium text-[var(--bad)] underline" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
