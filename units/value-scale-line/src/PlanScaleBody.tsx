// The Scale line of a Value card (and of a Development Resource): the Scale's unit, rate and context (a [Qualifier] in the rate or context is a chip),
// the direction, and the source. Every change goes up whole through onChange; nothing here writes.

import { type ReactNode } from "react";
import { carryRaw, type ScaleDirection, scaleDirectionOf } from "@kaigilb/gilbplatformcode-value-card-model";
import { box, CommitText, faint, InlineSelect, inPlace, own, Piece, Src, TextPiece, type ValueLineProps, ViewSrc } from "@kaigilb/gilbplatformcode-value-line-kit";

const DIRECTION_WORDS: Record<ScaleDirection, string> = {
  lower: "Lower is better",
  higher: "Higher is better",
  target: "Target range",
};

/** A [Name] chip in the Scale is a button: it scrolls to and focuses that qualifier's row in the Qualifiers section of the same card. */
function goToQualifier(from: Element, name: string): void {
  const scope = from.closest('[data-testid="record-detail-content"]') ?? document;
  const key = name.trim().toLowerCase();
  const row = [...scope.querySelectorAll<HTMLElement>("[data-qualifier-row]")].find((x) => x.dataset.qualifierRow === key);
  if (!row) return;
  row.scrollIntoView?.({ block: "nearest" });
  row.focus();
}

/** The sentence with each [Name] drawn as a chip. `wrap` lets a click-to-type piece surround the chips. */
function SentenceWithChips({
  text,
  label,
  wrap,
}: {
  text: string;
  label?: string;
  wrap?: (face: ReactNode) => ReactNode;
}) {
  const parts = text.split(/(\[[^\[\]]+\])/g);
  const face = parts.map((part, i) =>
    /^\[[^\[\]]+\]$/.test(part) ? (
      <span
        key={i}
        role="button"
        tabIndex={0}
        data-kind="plan-scale-variable"
        aria-label={`Go to qualifier ${part.slice(1, -1)}`}
        className="cursor-pointer rounded bg-[var(--accent-soft,#e8eefc)] px-1 text-[var(--accent)]"
        onClick={(e) => {
          e.stopPropagation();
          goToQualifier(e.currentTarget, part.slice(1, -1));
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          goToQualifier(e.currentTarget, part.slice(1, -1));
        }}
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
  return (
    <p className="whitespace-pre-wrap text-[14px] text-[var(--ink)]">
      {label ? <span>{label}: </span> : null}
      {wrap ? wrap(face) : face}
    </p>
  );
}

export function PlanScaleBody(p: ValueLineProps) {
  const { data, editing, onChange } = p;
  const s = data.scale;
  const put = (partial: Partial<typeof s>, stamp = true) => {
    const next = carryRaw({ ...s, ...partial }, s);
    if (stamp) next.source = own(next.source, p.selfId);
    onChange({ ...data, scale: next });
  };
  // The Scale has no sentence: an older a:scaleText is kept as it is and never shown or written anew.
  const said = !!(s.unit.trim() || s.rate.trim() || s.context.trim());
  if (!editing) {
    const on = inPlace(p);
    const unit = (
      <TextPiece
        on={on}
        label="Scale unit"
        value={s.unit}
        empty="Add unit"
        selectAll
        wide
        onCommit={(unit) => put({ unit })}
        face={s.unit.trim() ? <>Unit: {s.unit}</> : undefined}
      />
    );
    const sentence = (name: "rate" | "context", label: string, empty: string) => {
      const value = s[name];
      const commit = (v: string) => put({ [name]: v });
      if (!on) return value.trim() ? <SentenceWithChips label={label} text={value} /> : null;
      return value.trim() ? (
        <SentenceWithChips
          label={label}
          text={value}
          wrap={(face) => <TextPiece on multiline label={`Scale ${name}`} value={value} onCommit={commit} face={face} />}
        />
      ) : (
        <p className="text-[14px]">
          <TextPiece on multiline label={`Scale ${name}`} value="" empty={empty} onCommit={commit} />
        </p>
      );
    };
    return (
      <div className="flex w-full flex-col gap-1 py-2" data-testid="plan-scale-view">
        {on || s.unit.trim() ? <p className="text-[14px] text-[var(--ink)]">{unit}</p> : null}
        {sentence("rate", "Rate", "Add rate")}
        {sentence("context", "Context", "Add context")}
        {said || on ? (
          <p className={faint}>
            <Piece
              on={on}
              label="Scale direction"
              face={DIRECTION_WORDS[scaleDirectionOf({ scale: s })]}
              edit={(close) => (
                <InlineSelect
                  label="Scale direction"
                  value={scaleDirectionOf({ scale: s })}
                  options={(Object.keys(DIRECTION_WORDS) as ScaleDirection[]).map((d) => ({ value: d, label: DIRECTION_WORDS[d] }))}
                  onCommit={(d) => put({ direction: d as ScaleDirection }, false)}
                  close={close}
                />
              )}
            />
          </p>
        ) : null}
        <ViewSrc p={p} value={s.source} label="Scale source" offerNewStakeholder={false} onCommit={(source) => put({ source }, false)} />
      </div>
    );
  }
  const field = (name: string, input: ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className={faint}>{name}</span>
      {input}
    </div>
  );
  return (
    <div className="flex w-full flex-col gap-2 py-2">
      {field("Unit", <CommitText label="Scale unit" value={s.unit} placeholder="e.g. minutes" onCommit={(unit) => put({ unit })} />)}
      {field("Rate", <CommitText multiline label="Scale rate" value={s.rate} placeholder="e.g. per [Task]" onCommit={(rate) => put({ rate })} />)}
      {field("Context", <CommitText multiline label="Scale context" value={s.context} placeholder="from: …; until: …" onCommit={(context) => put({ context })} />)}
      {field(
        "Better",
        <select
          aria-label="Scale direction"
          className={box}
          value={scaleDirectionOf({ scale: s })}
          onChange={(e) => put({ direction: e.target.value as ScaleDirection }, false)}
        >
          {(Object.keys(DIRECTION_WORDS) as ScaleDirection[]).map((d) => (
            <option key={d} value={d}>
              {DIRECTION_WORDS[d]}
            </option>
          ))}
        </select>,
      )}
      <Src p={p} value={s.source} label="Scale source" offerNewStakeholder={false} onCommit={(source) => put({ source }, false)} />
    </div>
  );
}
