/**
 * The box a cell is typed in: text (which grows for long text), a number, a date, or a choice from a closed list.
 *
 * It holds what is being typed and nothing else. Enter, Tab and leaving the box hand the text to the table, which reads it as a value
 * and saves it, or answers why it cannot be stored: then the text stays and the reason is shown. Escape gives the edit up. A yes-or-no
 * cell has no box: it is changed in place.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { keyAct, type EditPlan } from "@kaigilb/gilbplatformcode-table-core";

/** Where the selection goes when an edit is finished. `stay`: the box was left by a click or a tap elsewhere. */
export type AfterCommit = "down" | "up" | "right" | "left" | "stay";

export interface CellEditorProps {
  plan: EditPlan;
  /** What the box starts with. */
  initialText: string;
  /** True to select the starting text (Enter on a cell); false to put the caret after it (a typed character started the edit). */
  selectAll: boolean;
  /** A reason to show from the start (the text was refused when the box was last left). */
  initialWhy?: string | null;
  /** The field's name, for a screen reader. */
  label: string;
  /**
   * Finish the edit with this text. Answers null when the table took it (the box is then removed), or the reason it cannot be stored
   * (the box stays, and shows it).
   */
  onCommit: (text: string, then: AfterCommit) => string | null;
  /** Give the edit up. */
  onCancel: () => void;
}

const BOX = "block w-full min-w-0 resize-none border-0 bg-[var(--surface)] px-2.5 text-[13px] leading-[20px] text-[var(--ink)] outline-none";
/** Text longer than this, or with a line break, opens as a tall box. */
const LONG_TEXT = 60;
const MAX_BOX_HEIGHT = 220;

/**
 * The editor of one cell.
 *
 * Keys: Enter saves and moves down (Shift: up); Tab saves and moves right (Shift: left); Escape gives up; Alt+Enter is a new line in
 * text. In a choice, the arrows move through the list and Enter takes the marked value.
 *
 * @param props the cell's plan, the starting text, and the table's two answers (`onCommit`, `onCancel`)
 */
export function CellEditor({ plan, initialText, selectAll, initialWhy = null, label, onCommit, onCancel }: CellEditorProps) {
  const [text, setText] = useState(initialText);
  const [why, setWhy] = useState<string | null>(initialWhy);
  const [marked, setMarked] = useState(-1);
  const box = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  /** Set once the edit was finished or given up, so that the box losing focus as it is removed does not finish it a second time. */
  const done = useRef(false);
  const isText = plan.editor === "text";
  const isChoice = plan.editor === "choice";

  // The box takes the focus as it appears; the starting text is selected, or the caret is put after the character that began the edit.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      if (selectAll) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      // A date box has no text selection.
    }
  }, [selectAll]);

  // A text box is as tall as its text, up to a limit; then it scrolls.
  useLayoutEffect(() => {
    const el = box.current;
    if (!isText || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(MAX_BOX_HEIGHT, Math.max(36, el.scrollHeight))}px`;
  }, [isText, text]);

  const options = useMemo(() => {
    if (!isChoice) return [];
    const all = plan.options ?? [];
    const typed = text.trim().toLowerCase();
    // While what is typed is a value of the list, or nothing, the whole list shows; else the values that contain it.
    if (typed === "" || all.includes(text)) return all;
    const found = all.filter((o) => o.toLowerCase().includes(typed));
    return found.length > 0 ? found : all;
  }, [isChoice, plan.options, text]);

  const finish = (value: string, then: AfterCommit) => {
    if (done.current) return;
    const refused = onCommit(value, then);
    if (refused === null) done.current = true;
    else setWhy(refused);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  // The page being hidden or closed finishes the edit: what is typed is sent, not lost.
  const latest = useRef({ text, finish });
  latest.current = { text, finish };
  useEffect(() => {
    const onHide = () => latest.current.finish(latest.current.text, "stay");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    // The table's row must not also act on a key typed here.
    e.stopPropagation();
    if (isChoice && (e.key === "ArrowDown" || e.key === "ArrowUp") && options.length > 0) {
      e.preventDefault();
      setMarked((m) => (e.key === "ArrowDown" ? Math.min(options.length - 1, m + 1) : Math.max(0, m - 1)));
      return;
    }
    const act = keyAct({ key: e.key, shift: e.shiftKey, alt: e.altKey, command: e.ctrlKey || e.metaKey, mode: "edit", editable: true, editor: plan.editor, composing: e.nativeEvent.isComposing });
    if (act.act === "cancel") {
      e.preventDefault();
      cancel();
      return;
    }
    if (act.act === "commit") {
      e.preventDefault();
      const picked = isChoice && marked >= 0 ? options[marked] : undefined;
      finish(picked ?? text, act.then);
      return;
    }
    // Alt+Enter: a new line in text, where the caret is.
    if (isText && e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}\n${text.slice(end)}`;
      setText(next);
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(start + 1, start + 1);
        } catch {
          // The box is gone.
        }
      });
    }
  };

  const common = {
    "aria-label": label,
    "aria-invalid": why !== null || undefined,
    "data-testid": "record-table-editor",
    onKeyDown,
    onBlur: () => finish(latest.current.text, "stay"),
    // A click in the box is not a click on the cell or the row.
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
  const change = (value: string) => {
    setText(value);
    setWhy(null);
    setMarked(-1);
  };
  const long = isText && (initialText.length > LONG_TEXT || initialText.includes("\n"));

  return (
    <span className={"absolute left-0 top-0 z-[4] block w-full shadow-[0_0_0_2px_var(--accent)] " + (long ? "min-w-[320px]" : "")} data-editor-kind={plan.editor} data-invalid={why !== null || undefined}>
      {isText ? (
        <textarea ref={(el) => { box.current = el; }} rows={1} value={text} onChange={(e) => change(e.target.value)} className={BOX + " py-[8px]"} {...common} />
      ) : plan.editor === "date" ? (
        <input ref={(el) => { box.current = el; }} type="date" value={text} onChange={(e) => change(e.target.value)} className={BOX + " h-[36px]"} {...common} />
      ) : (
        <input
          ref={(el) => { box.current = el; }}
          type="text"
          inputMode={plan.editor === "number" ? "decimal" : undefined}
          autoComplete="off"
          role={isChoice ? "combobox" : undefined}
          aria-expanded={isChoice ? true : undefined}
          aria-controls={isChoice ? "record-table-choice-list" : undefined}
          aria-autocomplete={isChoice ? "list" : undefined}
          value={text}
          onChange={(e) => change(e.target.value)}
          className={BOX + " h-[36px]"}
          {...common}
        />
      )}
      {why !== null ? (
        <span role="alert" className="block border-t border-[var(--bad,#9c4438)] bg-[var(--surface)] px-2.5 py-1 text-[12px] leading-[16px] text-[var(--bad,#9c4438)]" data-testid="record-table-editor-why">
          {why}
        </span>
      ) : null}
      {isChoice ? (
        <ul id="record-table-choice-list" role="listbox" aria-label={`${label}: the list`} className="max-h-[200px] overflow-auto border-t border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow-md)]" data-testid="record-table-choice-list">
          {options.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={option === text}
              data-marked={i === marked || undefined}
              // The press must not take the focus from the box (that would finish the edit with what is typed, not with this value).
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                finish(option, "stay");
              }}
              className={"cursor-pointer px-2.5 py-1 text-[13px] leading-[20px] text-[var(--ink)] " + (i === marked ? "bg-[var(--sel)]" : "hover:bg-[var(--paper-2)]") + (option === text ? " font-semibold" : "")}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
