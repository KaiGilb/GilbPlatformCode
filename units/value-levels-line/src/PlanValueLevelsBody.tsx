// The Levels line of a Value card: every level with its number, date, qualifiers, conditions and source. Every change goes up whole through onChange.

import { type KeyboardEvent as ReactKeyEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MODAL_LAYER_Z, registerOpen, useModalPortalTarget } from "@kaigilb/gilbplatformcode-open-popups";
import { type PlanSourceValue, sourceWithText } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { PlanQualifierValue, type QualifierPick } from "@kaigilb/gilbplatformcode-qualifier-value-picker";
import { blankLevel, carryOthers, carryRaw, defaultLevelRowsFor, levelGroupKey, levelIsBlank, levelLineSegments, levelNumberDisplay, levelOfTyped, newLevelFromClick, offeredLevelKindsFor, parseLevelLineWarn, qualifierValues, RESOURCE_LEVEL_KINDS, resourceKind, scaleDirectionOf, scaleQualifierNames, sortLevels, STANDARD_LEVEL_KINDS, type ValueLevel, withScaleQualifiers } from "@kaigilb/gilbplatformcode-value-card-model";
import { box, chip, CommitText, eq, faint, faintBtn, hint, InlineInput, InlineSelect, inPlace, LegacyMoveButton, own, Piece, quiet, small, Src, TextPiece, UnsetQualifiers, useValueLinesHost, type ValueLineProps } from "@kaigilb/gilbplatformcode-value-line-kit";
import { planCapSentence } from "./planCapSentence";

/** The live label of a linked record: its a:unitTag, else its name. null while it is being read. */
function useLinkLabel(uri: string | undefined, vaultId: string): string | null {
  return useValueLinesHost().useLinkLabel(uri, vaultId);
}

/** Gives a level line the label of its linked source (when it has no text): "…" while it loads. */
function WithSourceLabel({
  source,
  vaultId,
  render,
}: {
  source: PlanSourceValue;
  vaultId: string;
  render: (label: string | undefined) => ReactNode;
}) {
  const link = source.text?.trim() ? undefined : source.statedBy || source.derivedFrom;
  const label = useLinkLabel(link, vaultId);
  return <>{link ? render(label ?? "\u2026") : render(undefined)}</>;
}

/** Edit mode: a button showing the qualifier's value that opens the shared chooser. */
function QualifierField({
  label,
  name,
  value,
  notInScale,
  ...rest
}: {
  label: string;
  name: string;
  /** The name is no longer in the Scale: the choice is kept and shown greyed with a note. */
  notInScale?: boolean;
  options: readonly { name: string; definition: string }[];
  defaultOption?: string;
  value: QualifierPick;
  used: readonly string[];
  onCommit: (next: QualifierPick) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <PlanQualifierValue label={label} name={name} value={value} notInScale={notInScale} {...rest} close={() => setOpen(false)} />;
  const vals = qualifierValues(value);
  const text = vals.length > 1 ? `{${vals.join(", ")}}` : (vals[0] ?? "");
  return (
    <>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        className={`${small} text-left ${text ? "" : "text-[var(--ink-faint)]"} ${notInScale ? "opacity-60" : ""}`}
        onClick={() => setOpen(true)}
      >
        {text ? `${name}: ${text}` : name}
      </button>
      {notInScale ? <span className={`${faint} text-[12px]`}>Not in the Scale</span> : null}
    </>
  );
}

/** A faint, text-less button (its face is drawn by CSS, so the line's text stays the pure line) that opens an input. */
function AddPiece({
  label,
  title,
  className,
  type,
  onCommit,
}: {
  label: string;
  title: string;
  className: string;
  type?: string;
  onCommit: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <InlineInput label={label} value="" type={type} onCommit={onCommit} close={() => setOpen(false)} />;
  return <button type="button" aria-label={label} title={title} className={`${faintBtn} ${className}`} onClick={() => setOpen(true)} />;
}

/** The label of a linked source in a read line. A click opens the source picker in place; a pick or Escape closes it. */
function LinkedSourcePiece({
  p,
  label,
  value,
  face,
  onCommit,
}: {
  p: ValueLineProps;
  label: string;
  value: PlanSourceValue;
  face: string;
  onCommit: (next: PlanSourceValue) => void;
}) {
  return (
    <Piece
      on
      label={label}
      face={face}
      edit={(close) => (
        <span
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        >
          <Src
            p={{ ...p, editing: true }}
            value={value}
            label={label}
            onCommit={(next) => {
              onCommit(next);
              close();
            }}
          />
        </span>
      )}
    />
  );
}

function ConditionChips({ label, items, onChange }: { label: string; items: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((c, i) => (
        <span key={i} className={chip}>
          {c}
          <button type="button" aria-label={`Remove condition ${c}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        className={small}
        value={text}
        placeholder="Condition, Enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = text.trim();
            if (t) onChange([...items, t]);
            setText("");
          }
        }}
      />
    </div>
  );
}

/** The level's number as the author's text (any text: "5-10", "approx. 5", "1,5"); it is never rejected, never rewritten. */
function NumberText({ label, value, onCommit, autoFocus }: { label: string; value: string; onCommit: (v: string) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const done = () => {
    if (text.trim() !== value) onCommit(text);
  };
  return (
    <input
      aria-label={label}
      autoFocus={autoFocus}
      className={`${small} w-24`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          done();
        }
      }}
    />
  );
}

export function PlanValueLevelsBody(p: ValueLineProps) {
  if (!p.legacy?.levels) return (
    <>
      <PlanValueLevelsList {...p} />
      <LegacyMoveButton p={p} group="levels" />
    </>
  );
  // The old stored list: shown as it is, read-only. One button moves it into level records; nothing is written before the click.
  return (
    <>
      <PlanValueLevelsList {...p} editing={false} canEdit={false} />
      <LegacyMoveButton p={p} group="levels" />
    </>
  );
}

/**
 * The "+ Level" button. A click (or Enter / Space) opens a small menu with every level kind and "Other word…". Arrows move,
 * Escape closes. Portalled like the other popovers and registered on the open-popover stack.
 */
function LevelKindMenu({ kinds, onPick, onOther }: { kinds: readonly string[]; onPick: (kind: string) => void; onOther: () => void }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const target = useModalPortalTarget();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const quietClose = useRef(() => setOpen(false));
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const off = registerOpen({ el: () => box.current, close: () => close(), dismiss: () => quietClose.current(), exclusive: true });
    const press = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && (box.current?.contains(t) || trigger.current?.contains(t))) return;
      quietClose.current();
    };
    document.addEventListener("pointerdown", press, true);
    return () => {
      off();
      document.removeEventListener("pointerdown", press, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Exactly the five standard kinds, then "Other word…" (Fail / Survival are typed there).
  const items = [...kinds, "Other word…"];
  const move = (e: ReactKeyEvent<HTMLElement>, by: number) => {
    const all = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at0 = all.indexOf(document.activeElement as HTMLElement);
    all[(at0 + by + all.length) % all.length]?.focus();
    e.preventDefault();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Pick a level kind"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${quiet} min-h-11 min-w-11 px-2 text-[var(--accent)]`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ left: r.left, top: r.bottom + 4 });
          setOpen(!open);
        }}
      >
        + Level
      </button>
      {open
        ? createPortal(
            <div
              ref={box}
              role="menu"
              aria-label="Level kinds"
              style={{ position: "fixed", left: at.left, top: at.top, zIndex: MODAL_LAYER_Z }}
              className="flex w-48 flex-col rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-1 text-[14px] text-[var(--ink)] shadow"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                } else if (e.key === "ArrowDown") move(e, 1);
                else if (e.key === "ArrowUp") move(e, -1);
              }}
            >
              {items.map((k, n) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  tabIndex={n === 0 ? 0 : -1}
                  className="min-h-11 rounded-[var(--r-sm)] px-3 text-left hover:bg-[var(--line)]"
                  onClick={() => {
                    setOpen(false);
                    if (k === "Other word…") onOther();
                    else onPick(k);
                  }}
                >
                  {k}
                </button>
              ))}
            </div>,
            target,
          )
        : null}
    </>
  );
}

function PlanValueLevelsList(p: ValueLineProps) {
  const { data, editing, onChange } = p;
  const [paste, setPaste] = useState("");
  const [pasteWarnings, setPasteWarnings] = useState<string[]>([]);
  const [newKind, setNewKind] = useState("");
  // The row just added from "+ Level" opens with its value field focused.
  const [focusRow, setFocusRow] = useState<ValueLevel | null>(null);
  // An empty Value offers Status, Tolerable and Goal (a Development Resource: Budget) as blank rows. A blank row is not written: it joins the levels
  // only once it has a value or a qualifier.
  const [pads, setPads] = useState<ValueLevel[]>(() =>
    data.levels.length === 0 ? defaultLevelRowsFor(data.resource).map((k) => blankLevel(k)) : [],
  );
  const putAll = (levels: ValueLevel[]) =>
    onChange({ ...data, levels: carryOthers(data.resource ? levels.map((l) => (resourceKind(l.kind, true) === l.kind ? l : carryRaw({ ...l, kind: "Budget" }, l))) : levels, data.levels) });
  const on = inPlace(p);
  const [adding, setAdding] = useState(false);
  const all = editing || on ? [...data.levels, ...pads] : data.levels;
  const putLevel = (i: number, partial: Partial<ValueLevel>, stamp = true) => {
    const prev = all[i]!;
    const next = carryRaw({ ...prev, ...partial, ...(partial.kind !== undefined ? { kind: resourceKind(partial.kind, data.resource) } : {}) }, prev);
    if (stamp) next.source = own(next.source, p.selfId);
    if (i >= data.levels.length) {
      const at = i - data.levels.length;
      if (levelIsBlank(next)) {
        setPads(pads.map((l, j) => (j === at ? next : l)));
        return;
      }
      setPads(pads.filter((_, j) => j !== at));
      putAll([...data.levels, next]);
      return;
    }
    putAll(data.levels.map((l, j) => (j === i ? next : l)));
  };
  const removeLevel = (i: number) => {
    if (i >= data.levels.length) setPads(pads.filter((_, j) => j !== i - data.levels.length));
    else putAll(data.levels.filter((_, j) => j !== i));
  };
  const putQualifier = (i: number, partial: Partial<ValueLevel["qualifier"]>) => {
    const prev = all[i]!;
    putLevel(i, { qualifier: { ...prev.qualifier, ...partial } }, false);
  };
  const sorted = sortLevels(all, scaleDirectionOf(data), data.resource);
  // The level pickers offer the Scale's names, in Scale order, then the defined names the Scale lacks (their data is kept).
  const qdata = withScaleQualifiers(data);
  const scaleNames = scaleQualifierNames(data.scale);
  // A new choice is offered only for the Scale's names. A defined name the Scale lacks stays only where a level already holds a choice.
  const inScale = (n: string) => scaleNames.some((x) => eq(x, n));
  const variableNames = qdata.variables.map((v) => v.name.trim()).filter((n) => n && inScale(n));
  const usedValues = (name: string): string[] => {
    const seen = new Set<string>();
    for (const l of data.levels) {
      for (const [k, v] of Object.entries(l.qualifier.variables)) if (eq(k, name)) for (const x of qualifierValues(v)) seen.add(x);
    }
    return [...seen];
  };

  /** The shared chooser for one qualifier of one level (view click-to-type, the unset menu). */
  const variableChooser = (l: ValueLevel, i: number, name: string, close: () => void): ReactNode => {
    const q = l.qualifier;
    const def = qdata.variables.find((v) => eq(v.name, name));
    const key = Object.keys(q.variables).find((k) => eq(k, name)) ?? name;
    return (
      <PlanQualifierValue
        label={`Level ${i + 1} ${name}`}
        notInScale={!inScale(name)}
        name={name}
        options={def?.options ?? []}
        defaultOption={def?.defaultOption}
        value={q.variables[key] ?? ""}
        used={usedValues(name)}
        onCommit={(pick) => {
          const vars = { ...q.variables };
          delete vars[key];
          if (qualifierValues(pick).length) vars[def?.name || name] = pick;
          putQualifier(i, { variables: vars });
        }}
        close={close}
      />
    );
  };

  const addPasted = () => {
    const added: ValueLevel[] = [];
    const warned: string[] = [];
    for (const line of paste.split(/\r?\n/)) {
      const { level, warnings } = parseLevelLineWarn(line, qdata.variables);
      if (level) added.push(level);
      for (const w of warnings) if (!warned.includes(w)) warned.push(w);
    }
    if (added.length) putAll([...data.levels, ...added]);
    setPasteWarnings(warned);
    setPaste("");
  };

  const kindInput = useRef<HTMLInputElement>(null);
  const [moreKinds, setMoreKinds] = useState(false);
  const addKind = (k: string) => {
    const nl = newLevelFromClick(resourceKind(k, data.resource), [...data.levels, ...pads]);
    setFocusRow(nl);
    setPads([...pads, nl]);
  };
  const addSection = (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="plan-level-add">
        <LevelKindMenu kinds={offeredLevelKindsFor(data.resource)} onPick={addKind} onOther={() => {
          setMoreKinds(true);
          setTimeout(() => kindInput.current?.focus(), 0);
        }} />
        {offeredLevelKindsFor(data.resource).map((k) => (
          <button
            key={k}
            type="button"
            className={`${chip} text-[var(--accent)]`}
            aria-label={`Add ${k} level`}
            onClick={() => addKind(k)}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Other level word"
          aria-expanded={moreKinds}
          className={`${chip} min-h-11 text-[var(--accent)]`}
          onClick={() => setMoreKinds(!moreKinds)}
        >
          Other word…
        </button>
        {moreKinds ? (
        <input
          ref={kindInput}
          aria-label="New level kind"
          className={`${small} w-32`}
          value={newKind}
          placeholder="Other word, Enter"
          onChange={(e) => setNewKind(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const k = newKind.trim();
            if (k) addKind(k);
            setNewKind("");
          }}
        />
        ) : null}
      </div>
      <textarea
        aria-label="Paste lines"
        className={`${box} py-2`}
        rows={3}
        value={paste}
        placeholder={`Paste lines, e.g. ${data.resource ? "Budget" : "Goal"} [2027-06-30, Release 3.0] 5 <- Kai-Zen estimate`}
        onChange={(e) => {
          setPaste(e.target.value);
          setPasteWarnings([]);
        }}
      />
      <button type="button" className={quiet} disabled={!paste.trim()} onClick={addPasted}>
        Add pasted lines
      </button>
      {pasteWarnings.length ? (
        <div role="status" data-testid="plan-paste-warning" className="text-xs text-amber-700">
          {pasteWarnings.join(". ")}
        </div>
      ) : null}
    </>
  );

  if (!editing) {
    // Out of Edit the line is still text; only the piece that was clicked becomes its editor, and is text again after.
    const pieceOf = (l: ValueLevel, i: number, seg: ReturnType<typeof levelLineSegments>[number]): ReactNode => {
      const part = seg.part;
      if (!part || !on) return seg.text;
      const q = l.qualifier;
      const n = i + 1;
      const lead = part.t === "value" && seg.text.startsWith(" ") ? " " : "";
      const text = seg.text.slice(lead.length);
      let node: ReactNode;
      switch (part.t) {
        case "kind":
          node = (
            <TextPiece
              on
              label={`Level ${n} kind`}
              value={l.kind}
              list={`plan-level-kinds-${p.record.id}`}
              selectAll
              onCommit={(v) => {
                if (v.trim() && v.trim() !== l.kind) putLevel(i, { kind: v.trim() });
              }}
            />
          );
          break;
        case "when":
          node = <TextPiece on label={`Level ${n} date`} value={q.when} type="date" onCommit={(v) => putQualifier(i, { when: v })} />;
          break;
        case "condition": {
          const index = part.index;
          node = (
            <TextPiece
              on
              label={`Level ${n} condition`}
              value={q.conditions[index] ?? ""}
              selectAll
              onCommit={(v) => {
                const t = v.trim();
                putQualifier(i, {
                  conditions: t
                    ? q.conditions.map((c, j) => (j === index ? t : c))
                    : q.conditions.filter((_, j) => j !== index),
                });
              }}
            />
          );
          break;
        }
        case "variable": {
          const name = part.name;
          node = (
            <Piece
              on
              label={`Level ${n} ${name}`}
              face={<>{seg.text}</>}
              edit={(close) => variableChooser(l, i, name, close)}
            />
          );
          break;
        }
        case "side":
          node = (
            <Piece
              on
              label={`Level ${n} side`}
              face={seg.text}
              edit={(close) => (
                <InlineSelect
                  label={`Level ${n} side`}
                  value={q.side}
                  options={[
                    { value: "", label: "One side" },
                    { value: "low", label: "low" },
                    { value: "high", label: "high" },
                  ]}
                  onCommit={(v) => putQualifier(i, { side: v as "" | "low" | "high" })}
                  close={close}
                />
              )}
            />
          );
          break;
        case "value":
          node = (
            <TextPiece
              on
              label={`Level ${n} value`}
              value={levelNumberDisplay(l)}
              selectAll
              face={text ? text : hint(" Add value")}
              onCommit={(v) => {
                // The number is the author's text ("5-10", "approx. 5", "1,5"); what it draws at is read from it.
                if (v.trim() === levelNumberDisplay(l)) return;
                putLevel(i, levelOfTyped(v));
              }}
            />
          );
          break;
        case "source":
          node = !l.source.text?.trim() ? (
            <LinkedSourcePiece
              p={p}
              label={`Level ${n} source`}
              value={l.source}
              face={seg.text}
              onCommit={(next) => putLevel(i, { source: next }, false)}
            />
          ) : (
            <TextPiece
              on
              label={`Level ${n} source`}
              value={l.source.text ?? ""}
              onCommit={(v) => putLevel(i, { source: sourceWithText(l.source, v) }, false)}
            />
          );
          break;
        case "note":
          node = <TextPiece on label={`Level ${n} note`} value={l.note} onCommit={(v) => putLevel(i, { note: v }, false)} />;
          break;
      }
      return (
        <>
          {lead}
          {node}
        </>
      );
    };
    // Out of Edit, a level line also offers the faint ways to add: a date, a qualifier not yet set, and one more condition.
    const lineWithAdds = (
      l: ValueLevel,
      i: number,
      segs: ReturnType<typeof levelLineSegments>,
      draw: (seg: ReturnType<typeof levelLineSegments>[number], k: number) => ReactNode,
    ): ReactNode[] => {
      const q = l.qualifier;
      const n = i + 1;
      const hasBracket = segs.some((s) => s.text === " [" && !s.part);
      const unset = qdata.variables.filter(
        (v) => v.name.trim() && inScale(v.name) && !Object.keys(q.variables).some((k) => eq(k, v.name) && qualifierValues(q.variables[k]).length),
      );
      const dateBtn = !q.when ? (
        <AddPiece
          key="add-date"
          label={`Add Level ${n} date`}
          title="Add a date"
          type="date"
          className={hasBracket ? "mr-1 before:content-['date'] after:content-[',']" : "before:content-['_[date']"}
          onCommit={(v) => {
            if (v) putQualifier(i, { when: v });
          }}
        />
      ) : null;
      const plusBtn = unset.length ? null : (
        <AddPiece
          key="add-condition"
          label={`Add Level ${n} condition`}
          title="Add a condition"
          className={hasBracket ? "ml-1 before:content-['+']" : "ml-1 before:content-['+]']"}
          onCommit={(v) => {
            const t = v.trim();
            if (t) putQualifier(i, { conditions: [...q.conditions, t] });
          }}
        />
      );
      const unsetNodes = unset.length
        ? [
            <UnsetQualifiers
              key="unset"
              n={n}
              hasBracket={hasBracket}
              names={unset.map((v) => v.name)}
              chooser={(name, close) => variableChooser(l, i, name, close)}
              onCondition={(v) => {
                const t = v.trim();
                if (t) putQualifier(i, { conditions: [...q.conditions, t] });
              }}
            />,
          ]
        : [];
      const out: ReactNode[] = [];
      segs.forEach((seg, k) => {
        if (seg.text === " [" && !seg.part) {
          out.push(draw(seg, k));
          if (dateBtn) out.push(dateBtn);
          return;
        }
        if (seg.text === "]" && !seg.part) {
          out.push(...unsetNodes, ...(plusBtn ? [plusBtn] : []), draw(seg, k));
          return;
        }
        out.push(draw(seg, k));
        if (!hasBracket && seg.part?.t === "kind") out.push(dateBtn, ...unsetNodes, ...(plusBtn ? [plusBtn] : []));
      });
      return out;
    };
    return (
      <div className="flex w-full flex-col py-2" data-testid="plan-levels-view">
        {p.host?.capped ? (
          <p data-testid="plan-levels-capped" className={faint}>
            {planCapSentence(p.host.capped.total, "records", p.host.capped.cap)}
          </p>
        ) : null}
        {on ? (
          <datalist id={`plan-level-kinds-${p.record.id}`}>
            {(data.resource ? RESOURCE_LEVEL_KINDS : STANDARD_LEVEL_KINDS).slice()
              .sort()
              .map((k) => (
                <option key={k} value={k} />
              ))}
          </datalist>
        ) : null}
        {sorted.map((l, row) => {
          const i = all.indexOf(l);
          return (
            <div key={i}>
              {row > 0 && levelGroupKey(sorted[row - 1]!) !== levelGroupKey(l) ? <div className="h-3" /> : null}
              <p className="whitespace-pre-wrap text-[14px] text-[var(--ink)]">
                <WithSourceLabel
                  source={l.source}
                  vaultId={p.vaultId}
                  render={(label) => {
                    const segs = levelLineSegments(l, qdata.variables, label);
                    // A choice for a name the Scale no longer has is kept, with a short grey note after it.
                    const note = (seg: (typeof segs)[number], k: number) =>
                      seg.part?.t === "variable" && !inScale(seg.part.name) ? (
                        <span key={`ns${k}`} data-testid="level-not-in-scale" className="text-[var(--ink-faint,var(--ink-soft))]">
                          {" (not in the Scale)"}
                        </span>
                      ) : null;
                    if (!on)
                      return segs.map((seg, k) => (
                        <span key={k}>
                          {seg.text}
                          {note(seg, k)}
                        </span>
                      ));
                    return lineWithAdds(l, i, segs, (seg, k) => (
                      <span key={k}>
                        {pieceOf(l, i, seg)}
                        {note(seg, k)}
                      </span>
                    ));
                  }}
                />
              </p>
            </div>
          );
        })}
        {on ? (
          adding ? (
            <div
              className="mt-2 flex flex-col gap-2"
              data-testid="plan-level-panel"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
            >
              {addSection}
            </div>
          ) : (
            <button type="button" className={`${quiet} self-start`} onClick={() => setAdding(true)}>
              + Level
            </button>
          )
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 py-2">
      <datalist id={`plan-level-kinds-${p.record.id}`}>
        {(data.resource ? RESOURCE_LEVEL_KINDS : STANDARD_LEVEL_KINDS).slice()
          .sort()
          .map((k) => (
            <option key={k} value={k} />
          ))}
      </datalist>
      {sorted.map((l, row) => {
        const i = all.indexOf(l);
        const q = l.qualifier;
        return (
          <div key={i}>
            {row > 0 && levelGroupKey(sorted[row - 1]!) !== levelGroupKey(l) ? <div className="h-4" /> : null}
            <div className="rounded-[var(--r-md)] border border-[var(--line)] p-2" data-testid="plan-level-row">
              <div className="flex flex-wrap items-center gap-2 min-[900px]:flex-nowrap">
                <input
                  aria-label={`Level ${i + 1} kind`}
                  list={`plan-level-kinds-${p.record.id}`}
                  className={`${small} w-32`}
                  defaultValue={l.kind}
                  key={`${i}-${l.kind}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== l.kind) putLevel(i, { kind: v });
                    else e.target.value = l.kind;
                  }}
                />
                <input
                  aria-label={`Level ${i + 1} date`}
                  type="date"
                  className={small}
                  value={q.when}
                  onChange={(e) => putQualifier(i, { when: e.target.value })}
                />
                {[...variableNames, ...Object.keys(q.variables).filter((k) => k.trim() && !variableNames.some((x) => eq(x, k)))].map((name) => {
                  const def = qdata.variables.find((v) => eq(v.name, name));
                  const key = Object.keys(q.variables).find((k) => eq(k, name)) ?? name;
                  const current = q.variables[key] ?? "";
                  return (
                    <QualifierField
                      key={name}
                      label={`Level ${i + 1} ${name}`}
                      notInScale={!scaleNames.some((x) => eq(x, name))}
                      name={name}
                      options={def?.options ?? []}
                      defaultOption={def?.defaultOption}
                      value={current}
                      used={usedValues(name)}
                      onCommit={(pick) => {
                        const vars = { ...q.variables };
                        delete vars[key];
                        if (qualifierValues(pick).length) vars[def?.name || name] = pick;
                        putQualifier(i, { variables: vars });
                      }}
                    />
                  );
                })}
                {scaleDirectionOf(data) === "target" ? (
                  <select
                    aria-label={`Level ${i + 1} side`}
                    className={small}
                    value={q.side}
                    onChange={(e) => putQualifier(i, { side: e.target.value as "" | "low" | "high" })}
                  >
                    <option value="">One side</option>
                    <option value="low">low</option>
                    <option value="high">high</option>
                  </select>
                ) : null}
                <ConditionChips
                  label={`Level ${i + 1} condition`}
                  items={q.conditions}
                  onChange={(conditions) => putQualifier(i, { conditions })}
                />
                <NumberText label={`Level ${i + 1} value`} autoFocus={l === focusRow} value={levelNumberDisplay(l)} onCommit={(v) => putLevel(i, levelOfTyped(v))} />
                <div className="min-w-[8rem]">
                  <Src
                    p={p}
                    value={l.source}
                    label={`Level ${i + 1} source`}
                    offerNewStakeholder={false}
                    onCommit={(source) => putLevel(i, { source }, false)}
                  />
                </div>
                <CommitText
                  label={`Level ${i + 1} note`}
                  className={small}
                  value={l.note}
                  placeholder="Note, e.g. estimate"
                  onCommit={(note) => putLevel(i, { note }, false)}
                />
                <button
                  type="button"
                  className="min-h-9 px-2 text-[14px] text-[var(--accent)]"
                  title="Copy qualifier to a new level"
                  aria-label="Copy qualifier to a new level"
                  onClick={() =>
                    putAll([
                      ...data.levels,
                      {
                        ...blankLevel(data.resource ? "Budget" : "Goal"),
                        qualifier: { ...q, variables: { ...q.variables }, conditions: q.conditions.slice() },
                      },
                    ])
                  }
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className={quiet}
                  aria-label={`Remove level ${i + 1}`}
                  onClick={() => removeLevel(i)}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {addSection}
    </div>
  );
}
