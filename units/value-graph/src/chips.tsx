// A row's (or series') qualifier as chips you can change in the graph. Each variable the row sets is a chip
// ("User type = Novice"); a click opens the shared PlanQualifierValue picker. A pick is handed
// up ONCE; the graph applies it to every level of the row in one call.
import { memo, useState, type CSSProperties } from "react";
import { ALL_VALUE, qualifierValues, scaleQualifierNames } from "@kaigilb/gilbplatformcode-value-card-model";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanQualifierValue, type QualifierPick } from "@kaigilb/gilbplatformcode-qualifier-value-picker";

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** The button is 44 x 44 px or more (RuleMobileTouchTarget); the chip inside keeps the usual look at 24 px. */
const CHIP = "pointer-events-auto flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap";
const CHIP_FACE = "inline-flex h-6 items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 text-[12px] text-[var(--ink)]";

/** The variables a level sets itself, as the row label shows them. */
export function setVariables(level: ValueLevel, order?: readonly string[]): { name: string; text: string }[] {
  const list = Object.entries(level.qualifier.variables)
    .map(([name, v]) => {
      const vals = qualifierValues(v);
      return { name, text: vals.length > 1 ? `{${vals.join(", ")}}` : (vals[0] ?? "") };
    })
    .filter((x) => x.text);
  // In the Scale's order (names the Scale lacks keep their place after it).
  if (!order) return list;
  const at = (n: string) => {
    const i = order.findIndex((x) => eq(x, n));
    return i < 0 ? order.length : i;
  };
  return list.map((x, i) => ({ x, i })).sort((a, b) => at(a.x.name) - at(b.x.name) || a.i - b.i).map((e) => e.x);
}

/** The new variables of a level after `pick` was chosen for `name` (an empty pick removes the variable). */
export function withVariable(data: ValueCardData, level: ValueLevel, name: string, pick: QualifierPick): Record<string, string | string[]> {
  const vars: Record<string, string | string[]> = { ...level.qualifier.variables };
  const key = Object.keys(vars).find((k) => eq(k, name));
  if (key) delete vars[key];
  if (qualifierValues(pick).length) vars[data.variables.find((v) => eq(v.name, name))?.name || name] = pick;
  return vars;
}

export const RowChips = memo(function RowChips({
  data,
  from,
  mode,
  rowId,
  indexes,
  onVar,
  bandStyle,
  popTop,
  popLeft,
}: {
  data: ValueCardData;
  /** The level that defines the row's qualifier. */
  from: ValueLevel;
  /** "band": a one-line strip over the Arrow with the picker below it. "inline": in the Timeline legend, the picker replaces the chip. */
  mode: "band" | "inline";
  rowId: string;
  /** The levels the row holds (for finding the row again after it moved). */
  indexes: number[];
  /** Stable callbacks that get the row's `indexes` back, so the strip is memoised and a drag does not re-render it. */
  onVar: (indexes: number[], name: string, pick: QualifierPick) => void;
  bandStyle?: CSSProperties;
  popTop?: number;
  popLeft?: number;
}) {
  const [open, setOpen] = useState<{ kind: "var"; name: string } | null>(null);
  const q = from.qualifier;
  const scaleNames = scaleQualifierNames(data.scale);
  const vars = setVariables(from, data.variables.map((v) => v.name));
  const used = (name: string) => {
    const seen = new Set<string>();
    for (const l of data.levels)
      for (const [k, v] of Object.entries(l.qualifier.variables))
        if (eq(k, name)) for (const x of qualifierValues(v)) if (!eq(x, ALL_VALUE)) seen.add(x);
    return [...seen];
  };
  const picker = open ? (
    (
      (() => {
        const name = open.name;
        const def = data.variables.find((v) => eq(v.name, name));
        const key = Object.keys(q.variables).find((k) => eq(k, name));
        return (
          <PlanQualifierValue
            label={`${name} for ${rowId}`}
            notInScale={!scaleNames.some((x) => eq(x, name))}
            name={name}
            options={def?.options ?? []}
            defaultOption={def?.defaultOption}
            value={key ? q.variables[key] : ""}
            used={used(name)}
            onCommit={(pick) => onVar(indexes, name, pick)}
            close={() => setOpen(null)}
          />
        );
      })()
    )
  ) : null;
  const chip = (id: string, text: string, aria: string, name: string) => {
    if (mode === "inline" && open && open.name === name) return <span key={id}>{picker}</span>;
    return (
      <button
        key={id}
        type="button"
        data-chip={id}
        aria-label={aria}
        aria-haspopup="dialog"
        className={CHIP}
        title={scaleNames.some((x) => eq(x, name)) ? undefined : "Not in the Scale"}
        data-not-in-scale={scaleNames.some((x) => eq(x, name)) ? undefined : "yes"}
        onClick={() => setOpen({ kind: "var", name })}
      >
        <span className={CHIP_FACE + (scaleNames.some((x) => eq(x, name)) ? "" : " opacity-60")}>{text}</span>
      </button>
    );
  };
  const items = (
    <>
      {vars.map((x) => chip(`var:${x.name}`, `${x.name} = ${x.text}`, `Change ${x.name}, ${x.text}, ${rowId}`, x.name))}
      {!vars.length ? <span className="self-center text-[12px] text-gray-500">no qualifier</span> : null}
      {[...q.conditions, ...(q.side ? [`${q.side} side`] : [])].map((c) => (
        <span key={c} className="shrink-0 self-end whitespace-nowrap pb-1 text-[12px] text-gray-500">
          · {c}
        </span>
      ))}
    </>
  );
  if (mode === "inline") {
    return (
      <span data-row-chips={rowId} data-row-idx={indexes.join(",")} className="inline-flex flex-wrap items-center gap-1">
        {items}
      </span>
    );
  }
  return (
    <>
      <div data-row-chips={rowId} data-row-idx={indexes.join(",")} className="pointer-events-none absolute z-[5] flex items-center gap-1 overflow-x-auto" style={bandStyle}>
        {items}
      </div>
      {picker ? (
        <div className="absolute z-20" style={{ top: popTop, left: popLeft }}>
          {picker}
        </div>
      ) : null}
    </>
  );
});
