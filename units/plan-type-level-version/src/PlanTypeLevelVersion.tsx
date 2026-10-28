// The one line every Plan card shows first under its header: Type: <type> · Level: <level> · Version: <date>.
// One component for every Plan type (Function, Function Constraint, Solution, Solution Constraint, Value, and any added later).
// No source is shown on the line; stored level sources are kept untouched.

import { useState, type ReactNode } from "react";
import { TypePicture } from "@kaigilb/gilbplatformcode-type-picture";
import { localDay } from "./localDay";

export interface PlanLevelOption {
  token: string;
  label: string;
}

export interface PlanTypeSwitch {
  plainWord: string;
  constraintWord: string;
  constraint: boolean;
  /** The person picked a side. `true` asks for the constraint type. */
  onPick: (constraint: boolean) => void;
}

export interface PlanTypeLevelVersionProps {
  recordId: string;
  /** The Plan word for the type (Value, Function Constraint, Solution Constraint ...). */
  typeLabel: string;
  /** The GilbVeda type name behind that word (Value, Function, FunctionConstraint ...): its picture shows at 20 px before the word. */
  typeName?: string;
  /** Present when the card has the plain/constraint switch. Clicking the type word opens it in place. */
  typeSwitch?: PlanTypeSwitch | null;
  editing: boolean;
  canEdit: boolean;
  levelOpen: boolean;
  setLevelOpen: (open: boolean) => void;
  levelText: string;
  levelDefaultText: string;
  levelSelected: string;
  levelOptions: readonly PlanLevelOption[];
  optionLabel: (node: never) => string;
  addLevelValue: string;
  addingLevel: boolean;
  onAddLevel: () => void;
  onChooseLevel: (token: string) => void;
  version: Date | null;
  /** The out-of-tree warning and the add-level form, shown under the line. */
  below?: ReactNode;
  /** The type-change question, shown under the line. */
  ask?: ReactNode;
}

const dot = (
  <span aria-hidden className="text-[var(--ink-faint)]">
    ·
  </span>
);

export function PlanTypeLevelVersion(p: PlanTypeLevelVersionProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const sw = p.typeSwitch ?? null;
  const switching = sw !== null && (p.editing || typeOpen);
  const name = `plan-type-${p.recordId}`;
  return (
    <div data-testid="card-group" data-group="plan-type-level" data-kind="plan-type-level" className="flex min-h-7 flex-col gap-1 text-[14px] leading-7">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
        <span className="text-[12px] text-[var(--ink-soft)]">Type:</span>
        {p.typeName ? <TypePicture typeName={p.typeName} px={20} /> : null}
        {sw && switching ? (
          <span role="radiogroup" aria-label="Type" className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1 text-[var(--ink)]">
              <input
                type="radio"
                name={name}
                checked={!sw.constraint}
                onChange={() => {
                  sw.onPick(false);
                  setTypeOpen(false);
                }}
              />
              {sw.plainWord}
            </label>
            <label className="flex items-center gap-1 text-[var(--ink)]">
              <input
                type="radio"
                name={name}
                checked={sw.constraint}
                onChange={() => {
                  sw.onPick(true);
                  setTypeOpen(false);
                }}
              />
              {sw.constraintWord}
            </label>
          </span>
        ) : sw ? (
          <button
            type="button"
            aria-label="Type"
            className="text-left text-[var(--ink)]"
            onClick={() => {
              if (p.canEdit) setTypeOpen(true);
            }}
          >
            {p.typeLabel}
          </button>
        ) : (
          <span aria-label="Type" className="text-[var(--ink)]">
            {p.typeLabel}
          </span>
        )}
        {dot}
        <span className="text-[12px] text-[var(--ink-soft)]">Level:</span>
        {p.editing || p.levelOpen ? (
          <select
            aria-label="Level"
            autoFocus={p.levelOpen && !p.editing}
            value={p.levelSelected}
            onChange={(e) => {
              const token = e.target.value;
              if (token === p.addLevelValue) {
                p.onAddLevel();
                return;
              }
              if (!token) return;
              p.onChooseLevel(token);
            }}
            onBlur={() => {
              if (!p.editing && !p.addingLevel) p.setLevelOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && p.levelOpen && !p.editing) {
                e.preventDefault();
                e.stopPropagation();
                p.setLevelOpen(false);
              } else if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="h-7 rounded border border-[var(--line)] bg-transparent px-1 text-[14px] text-[var(--ink)]"
          >
            {p.levelSelected ? null : <option value=""> </option>}
            {p.levelOptions.map((node) => (
              <option key={node.token} value={node.token}>
                {p.optionLabel(node as never)}
              </option>
            ))}
            <option value={p.addLevelValue}>+ Add level…</option>
          </select>
        ) : (
          <button
            type="button"
            aria-label="Level"
            className={`text-left ${p.levelText ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}
            onClick={() => {
              if (p.canEdit) p.setLevelOpen(true);
            }}
          >
            {p.levelText || p.levelDefaultText}
          </button>
        )}
        {dot}
        <span className="text-[12px] text-[var(--ink-soft)]">Version:</span>
        <span aria-label="Version" title={p.version ? p.version.toLocaleString() : undefined} className="text-[var(--ink)]">
          {p.version ? localDay(p.version) : "—"}
        </span>
      </div>
      {p.below}
      {p.ask}
    </div>
  );
}
