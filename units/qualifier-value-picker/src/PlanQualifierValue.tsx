// One qualifier-value chooser, shared by the level lines, the Meter qualifier and the Illustration filter.
// It offers the qualifier's defined options (each with its definition as a hint), ALL ("every value"), a free-text
// "Other…" and Clear. Several options may be ticked; ALL is exclusive. Enter or leaving commits ONE change, Escape commits nothing.

import { PlanButtonRow } from "@kaigilb/gilbplatformcode-plan-button-row";
import { useRef, useState, type KeyboardEvent as ReactKeyEvent } from "react";
import { ALL_VALUE, packQualifierValues, qualifierValues } from "@kaigilb/gilbplatformcode-qualifier-values";

export type QualifierPick = string | string[];

export interface QualifierValueProps {
  /** The accessible name, e.g. "Level 2 Country". */
  label: string;
  name: string;
  options: readonly { name: string; definition: string }[];
  defaultOption?: string;
  value: QualifierPick | undefined;
  /** Values used on other levels: the datalist when the qualifier has no options. */
  used?: readonly string[];
  /** Hide the multi-select (the Illustration filter and the Meter qualifier pick one value). */
  single?: boolean;
  /** The name is no longer in the Scale: the choice is kept, greyed with a note, and can be cleared. */
  notInScale?: boolean;
  onCommit: (next: QualifierPick) => void;
  close: () => void;
}

const same = (a: QualifierPick, b: QualifierPick) => JSON.stringify(qualifierValues(a)) === JSON.stringify(qualifierValues(b));
const eqs = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function PlanQualifierValue({ label, name, options, defaultOption, value, used = [], single = false, notInScale = false, onCommit, close }: QualifierValueProps) {
  const start = qualifierValues(value);
  const named = options.filter((o) => o.name.trim());
  const noOptions = named.length === 0;
  // With no defined options the free text is the main input and starts with the current value.
  const typed = noOptions && start.length === 1 && !eqs(start[0]!, ALL_VALUE) ? start[0]! : "";
  const [picked, setPicked] = useState<string[]>(typed ? [] : start);
  const [other, setOther] = useState(typed);
  const finished = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = `qv-${label.replace(/\W+/g, "-")}`;

  const finish = (save: boolean, clear = false) => {
    if (finished.current) return;
    finished.current = true;
    if (save) {
      const next: QualifierPick = clear ? "" : packQualifierValues([...picked, other]);
      if (!same(next, start)) onCommit(next);
    }
    close();
  };
  const toggle = (v: string) => {
    if (single) {
      setPicked(picked.length === 1 && eqs(picked[0]!, v) ? [] : [v]);
      return;
    }
    if (eqs(v, ALL_VALUE)) {
      setPicked(picked.some((x) => eqs(x, ALL_VALUE)) ? [] : [ALL_VALUE]);
      return;
    }
    const without = picked.filter((x) => !eqs(x, ALL_VALUE));
    setPicked(without.some((x) => eqs(x, v)) ? without.filter((x) => !eqs(x, v)) : [...without, v]);
  };
  const keys = (e: ReactKeyEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const boxes = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-qv-row]") ?? []);
      if (!boxes.length) return;
      e.preventDefault();
      const at = boxes.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (at + 1) % boxes.length : (at <= 0 ? boxes.length : at) - 1;
      boxes[next]!.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = e.target as HTMLElement;
      if (!noOptions && !single && target.hasAttribute("data-qv-row-free")) {
        // Other…: Enter adds the typed word as a ticked value; Done commits.
        const t = other.trim();
        if (t) {
          setPicked([...picked.filter((x) => !eqs(x, ALL_VALUE) && !eqs(x, t)), t]);
          setOther("");
          return;
        }
      }
      const row = target.getAttribute("data-qv-row");
      if (row !== null && picked.length === 0 && !other.trim()) {
        // Nothing ticked yet: Enter on a row picks that row.
        const v = row;
        finished.current = true;
        onCommit(v);
        close();
        return;
      }
      finish(true);
    }
  };

  const extras = [...start, ...picked].filter(
    (v, k, all) => !eqs(v, ALL_VALUE) && !named.some((o) => eqs(o.name, v)) && !(noOptions && eqs(v, typed)) && all.findIndex((x) => eqs(x, v)) === k,
  );
  const rows = [ALL_VALUE, ...named.map((o) => o.name), ...extras];
  const defs: Record<string, string> = { [ALL_VALUE]: `Every value of ${name}` };
  for (const o of named) defs[o.name] = o.definition || (eqs(o.name, defaultOption ?? "") ? "Default" : "");

  return (
    <div
      ref={root}
      role="group"
      aria-label={`Choose ${label}`}
      data-not-in-scale={notInScale ? "yes" : undefined}
      className={`inline-flex flex-col gap-1 rounded-[var(--r-md)] border border-[var(--focus)] bg-[var(--surface)] p-2 text-[14px] text-[var(--ink)] ${notInScale ? "opacity-70" : ""}`}
      onKeyDown={keys}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) finish(true);
      }}
    >
      {notInScale ? <span className="text-[12px] text-[var(--ink-faint,var(--ink-soft))]">Not in the Scale</span> : null}
      {noOptions ? (
        <datalist id={listId}>
          {used.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ) : null}
      <div className="flex max-h-[11rem] flex-col gap-1 overflow-y-auto" data-testid="qv-rows">
      {rows.map((r) => (
        <label key={r} className="flex cursor-pointer items-center gap-2" title={defs[r] || undefined}>
          <input
            type="checkbox"
            data-qv-row={r}
            aria-label={`${label} ${r}`}
            checked={picked.some((x) => eqs(x, r))}
            onChange={() => toggle(r)}
          />
          <span>{r}</span>
          {defs[r] ? <span className="text-[12px] text-[var(--ink-faint,var(--ink-soft))]">{defs[r]}</span> : null}
        </label>
      ))}
      </div>
      <input
        aria-label={noOptions ? `Edit ${label}` : `Other value for ${label}`}
        autoFocus={noOptions}
        data-qv-row-free=""
        className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5"
        list={noOptions ? listId : undefined}
        placeholder={noOptions ? name : "Other…"}
        value={other}
        onChange={(e) => setOther(e.target.value)}
      />
      <PlanButtonRow>
        <button type="button" className="text-[var(--ink-soft)]" aria-label={`Clear ${label}`} onClick={() => finish(true, true)}>
          Clear
        </button>
        <button type="button" className="text-[var(--accent)]" onClick={() => finish(true)}>
          Done
        </button>
      </PlanButtonRow>
    </div>
  );
}
