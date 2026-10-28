// The Meters line of a Value card: each Meter's qualifier and its Human, AI and Instrument lines. Every change goes up whole through onChange.

import { type ReactNode, useState } from "react";
import { planSourceEmpty, type PlanSourceValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { PlanQualifierValue } from "@kaigilb/gilbplatformcode-qualifier-value-picker";
import { carryOthers, carryRaw, type MeterKind, qualifierValues, scaleQualifierNames, type ValueMeter, withScaleQualifiers } from "@kaigilb/gilbplatformcode-value-card-model";
import { CommitText, eq, faint, inPlace, LegacyMoveButton, own, quiet, Src, TextPiece, UnsetQualifiers, type ValueLineProps, ViewSrc } from "@kaigilb/gilbplatformcode-value-line-kit";

const METER_ROWS: readonly { kind: MeterKind; label: string }[] = [
  { kind: "human", label: "HumanAgent" },
  { kind: "ai", label: "AiAgent" },
  { kind: "instrument", label: "Instrument" },
];

export function PlanValueMetersBody(p: ValueLineProps) {
  if (!p.legacy?.meters) return <><PlanValueMetersList {...p} /><LegacyMoveButton p={p} group="meters" /></>;
  return (
    <>
      <PlanValueMetersList {...p} editing={false} canEdit={false} />
      <LegacyMoveButton p={p} group="meters" />
    </>
  );
}

function PlanValueMetersList(p: ValueLineProps) {
  const { data, editing, onChange } = p;
  // "+ Meter" out of Edit opens a blank meter; it is written once it has a qualifier or a method.
  const [pad, setPad] = useState(false);
  const putAll = (meters: ValueMeter[]) => onChange({ ...data, meters: carryOthers(meters, data.meters) });
  const meterAt = (i: number): ValueMeter => data.meters[i] ?? { qualifier: "", lines: [] };
  const putMeter = (i: number, partial: Partial<ValueMeter>) => {
    const prev = meterAt(i);
    const next = carryRaw({ ...prev, ...partial }, prev);
    if (i >= data.meters.length) {
      setPad(false);
      putAll([...data.meters, next]);
      return;
    }
    putAll(data.meters.map((m, j) => (j === i ? next : m)));
  };
  const putLine = (i: number, kind: MeterKind, partial: { method?: string; source?: PlanSourceValue }, stamp: boolean) => {
    const m = meterAt(i);
    const prev = m.lines.find((l) => l.kind === kind);
    const base = prev ?? { kind, method: "", source: {} };
    const line = carryRaw({ ...base, ...partial }, prev);
    if (stamp) line.source = own(line.source, p.selfId);
    const lines = prev ? m.lines.map((l) => (l === prev ? line : l)) : [...m.lines, line];
    putMeter(i, { lines: carryOthers(lines, m.lines) });
  };
  const meterPicks = (m: ValueMeter, i: number): ReactNode => {
    const names = scaleQualifierNames(data.scale);
    if (!names.length) return null;
    return (
      <UnsetQualifiers
        n={i + 1}
        caption="meter"
        hasBracket
        names={names}
        chooser={(name, close) => {
          const def = withScaleQualifiers(data).variables.find((v) => eq(v.name, name));
          return (
            <PlanQualifierValue
              single
              label={`Meter ${i + 1} ${name}`}
              name={name}
              options={def?.options ?? []}
              defaultOption={def?.defaultOption}
              value=""
              used={[]}
              onCommit={(pick) => {
                const v = qualifierValues(pick)[0];
                if (!v) return;
                const text = `${name} = ${v}`;
                putMeter(i, { qualifier: m.qualifier.trim() ? `${m.qualifier.trim()}, ${text}` : text });
              }}
              close={close}
            />
          );
        }}
      />
    );
  };
  if (!editing) {
    const on = inPlace(p);
    const shown = on && pad ? [...data.meters, { qualifier: "", lines: [] } as ValueMeter] : data.meters;
    return (
      <div className="flex w-full flex-col gap-3 py-2" data-testid="plan-value-meters-view">
        {shown.map((m, i) => (
          <div key={i} className="flex flex-col gap-1">
            <p className="text-[14px] font-semibold text-[var(--ink)]">
              Meter
              {m.qualifier.trim() || on ? " " : ""}
              {m.qualifier.trim() || on ? "[" : ""}
              <TextPiece
                on={on}
                label={`Meter ${i + 1} qualifier`}
                value={m.qualifier}
                empty="Add qualifier"
                onCommit={(qualifier) => putMeter(i, { qualifier })}
              />
              {on ? meterPicks(m, i) : null}
              {m.qualifier.trim() || on ? "]" : ""}:
            </p>
            {METER_ROWS.map(({ kind, label }) => {
              const line = m.lines.find((l) => l.kind === kind);
              const filled = !!line && (!!line.method.trim() || !planSourceEmpty(line.source));
              if (!filled && !on) return null;
              return (
                <div key={kind} className="flex flex-col pl-3">
                  <p className="text-[14px] text-[var(--ink)]">
                    {label}:{" "}
                    <TextPiece
                      on={on}
                      label={`Meter ${i + 1} ${label}`}
                      value={line?.method ?? ""}
                      empty={`Add ${label} method`}
                      multiline
                      onCommit={(method) => putLine(i, kind, { method }, true)}
                    />
                  </p>
                  {line ? (
                    <ViewSrc p={p} value={line.source} label={`${label} source`} onCommit={(source) => putLine(i, kind, { source }, false)} />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        {on && !pad ? (
          <button type="button" className={`${quiet} self-start`} onClick={() => setPad(true)}>
            + Meter
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 py-2">
      {data.meters.map((m, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-2" data-testid="plan-value-meter">
          <div className="flex gap-2">
            <CommitText
              label={`Meter ${i + 1} qualifier`}
              value={m.qualifier}
              placeholder="Qualifier, e.g. During Development"
              onCommit={(qualifier) => putMeter(i, { qualifier })}
            />
            {meterPicks(m, i)}
            <button
              type="button"
              className={quiet}
              aria-label={`Remove meter ${i + 1}`}
              onClick={() => putAll(data.meters.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
          {METER_ROWS.map(({ kind, label }) => {
            const line = m.lines.find((l) => l.kind === kind);
            return (
              <div key={kind} className="flex flex-col gap-1">
                <p className={faint}>{label}</p>
                <CommitText
                  label={`Meter ${i + 1} ${label}`}
                  multiline
                  value={line?.method ?? ""}
                  onCommit={(method) => putLine(i, kind, { method }, true)}
                />
                <Src
                  p={p}
                  value={line?.source ?? {}}
                  label={`Meter ${i + 1} ${label} source`}
                  onCommit={(source) => putLine(i, kind, { source }, false)}
                />
              </div>
            );
          })}
        </div>
      ))}
      <button type="button" className={quiet} onClick={() => putAll([...data.meters, { qualifier: "", lines: [] }])}>
        + Meter
      </button>
    </div>
  );
}
