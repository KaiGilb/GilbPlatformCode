// The Qualifiers line of a Value card: each Scale qualifier with its options and definitions. Every change goes up whole through onChange.

import { useState } from "react";
import { planSourceEmpty } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { blankVariable, carryOthers, carryRaw, listLikeDefinition, movableConditions, moveConditionIntoVariable, PRESET_QUALIFIERS, type QualifierRow, qualifierRows, renameCandidate, scaleQualifierNames, type ScaleVariable } from "@kaigilb/gilbplatformcode-value-card-model";
import { box, chip, CommitText, eq, faint, faintBtn, inPlace, LegacyMoveButton, own, quiet, small, Src, TextPiece, type ValueLineProps, ViewSrc } from "@kaigilb/gilbplatformcode-value-line-kit";

/** "+ Qualifier": a quiet panel with a name box and the preset chips. A name is added to the Scale (" for [Name]" on the Context), never to a list of its own. Escape closes it. */
function AddQualifier({ names, onAdd, presetsShown }: { names: readonly string[]; onAdd: (name: string) => void; presetsShown?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const add = (n: string) => {
    onAdd(n);
    setName("");
  };
  const presets = (
    <div className="flex flex-wrap gap-2" data-testid="plan-qualifier-presets">
      {PRESET_QUALIFIERS.filter((n) => !names.some((x) => eq(x, n))).map((n) => (
        <button key={n} type="button" className={`${chip} text-[var(--accent)]`} aria-label={`Add qualifier ${n}`} onClick={() => add(n)}>
          {n}
        </button>
      ))}
    </div>
  );
  if (!open) {
    return (
      <>
        <button type="button" className="self-start px-3 py-1 text-[14px] text-[var(--accent)]" onClick={() => setOpen(true)}>
          + Qualifier
        </button>
        {presetsShown ? presets : null}
      </>
    );
  }
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="plan-qualifier-add"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <input
        aria-label="New qualifier name"
        autoFocus
        className={small}
        value={name}
        placeholder="Qualifier name, Enter"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (name.trim()) add(name.trim());
        }}
      />
      {presets}
    </div>
  );
}

/** "+ value": Enter adds (a typed "Norway, Sweden" becomes two) and keeps the box open; Escape or leaving closes it. */
function AddValues({ label, onAdd }: { label: string; onAdd: (names: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const take = () => {
    const names = text.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (names.length) onAdd(names);
    setText("");
  };
  if (!open)
    return (
      <button type="button" className={`${faintBtn} before:content-['+_value']`} aria-label={`Add ${label} value`} onClick={() => setOpen(true)} />
    );
  return (
    <input
      autoFocus
      aria-label={`New ${label} value`}
      className={`${small} min-w-[8rem]`}
      value={text}
      placeholder="Value, Enter"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        take();
        setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          take();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setText("");
          setOpen(false);
        }
      }}
    />
  );
}

/** The one-click repair for a definition that is really a list of values. */
function MakeValuesButton({ items, onClick }: { items: string[]; onClick: () => void }) {
  return (
    <button type="button" className={`${quiet} self-start`} onClick={onClick}>
      Make {items.map((x) => `"${x}"`).join(", ")} values
    </button>
  );
}

export function PlanVariablesBody(p: ValueLineProps) {
  if (!p.legacy?.qualifiers) return <><PlanVariablesList {...p} /><LegacyMoveButton p={p} group="qualifiers" /></>;
  return (
    <>
      <PlanVariablesList {...p} editing={false} canEdit={false} />
      <LegacyMoveButton p={p} group="qualifiers" />
    </>
  );
}

/** The word a Default badge or action uses. At most one option of a qualifier wears the badge. */
const DEFAULT_BADGE = "rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold leading-4 text-white";

/** One qualifier row's note and buttons when its name is no longer in the Scale (the data is kept). */
function NotInScale({ name, onRemove, onAdd }: { name: string; onRemove: () => void; onAdd: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2" data-testid="plan-variable-not-in-scale">
      <span className={`${faint} text-[12px]`}>Not in the Scale</span>
      <button type="button" className={quiet} aria-label={`Remove qualifier ${name}`} onClick={onRemove}>
        Remove qualifier
      </button>
      <button type="button" className={quiet} aria-label={`Add ${name} to the Scale`} onClick={onAdd}>
        Add to Scale
      </button>
    </span>
  );
}

function PlanVariablesList(p: ValueLineProps) {
  const { data, editing, onChange } = p;
  const putAll = (vars: ScaleVariable[]) => onChange({ ...data, variables: carryOthers(vars, data.variables) });
  const putOne = (i: number, partial: Partial<ScaleVariable>, stamp = true) => {
    const prev = data.variables[i]!;
    const next = carryRaw({ ...prev, ...partial }, prev);
    if (stamp) next.source = own(next.source, p.selfId);
    putAll(data.variables.map((v, j) => (j === i ? next : v)));
  };
  const rows = qualifierRows(data);
  const helper = renameCandidate(data);
  // A Scale name has no record until its first value or definition is added: then the record is made, once, by this write.
  const putRow = (r: QualifierRow, partial: Partial<ScaleVariable>, stamp = true) => {
    if (r.index !== null) return putOne(r.index, partial, stamp);
    const next = { ...blankVariable(r.name), ...partial };
    if (stamp) next.source = own(next.source, p.selfId);
    putAll([...data.variables, next]);
  };
  const removeRow = (r: QualifierRow) => {
    if (r.index !== null) putAll(data.variables.filter((_, j) => j !== r.index));
  };
  const addToScale = (name: string) => {
    const s = data.scale;
    const word = name.replace(/[\[\]]/g, "").trim();
    if (!word || scaleQualifierNames(s).some((x) => eq(x, word))) return;
    const next = carryRaw({ ...s, context: `${s.context.trimEnd()} for [${word}]`.trimStart() }, s);
    next.source = own(next.source, p.selfId);
    onChange({ ...data, scale: next });
  };
  if (!editing) {
    const on = inPlace(p);
    return (
      <div className="flex w-full flex-col gap-2 py-2" data-testid="plan-variables-view">
        {rows.map((r, ri) => {
          const v = r.variable;
          const n = ri + 1;
          const items = v.options.length ? null : listLikeDefinition(v.definition);
          const setOptions = (names: string[], defaultOption = v.defaultOption) =>
            putRow(r, {
              options: names.map((nm) => v.options.find((o) => o.name === nm) ?? { name: nm, definition: "" }),
              defaultOption,
            });
          const canRename = on && helper && p.onRenameQualifier && eq(helper.to, r.name);
          return (
            <div
              key={r.name.toLowerCase()}
              tabIndex={-1}
              className={`group/row flex flex-col outline-none ${r.inScale ? "" : "opacity-60"}`}
              data-testid="plan-variable-view-row"
              data-qualifier-row={r.name.toLowerCase()}
              data-in-scale={r.inScale ? "yes" : "no"}
              data-has-record={r.index !== null ? "yes" : "no"}
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[var(--ink)]">
                {r.inScale ? (
                  <span data-testid="plan-variable-name">[{r.name}]</span>
                ) : (
                  <span data-testid="plan-variable-name">
                    [
                    <TextPiece on={on} label={`Qualifier ${n} name`} value={v.name} empty="Add name" onCommit={(name) => putRow(r, { name })} />
                    ]
                  </span>
                )}
                {v.options.map((o, k) => {
                  const isDefault = !!v.defaultOption && o.name === v.defaultOption;
                  return (
                    <span key={k} className={`${chip} group relative`} data-testid="plan-variable-option">
                      {isDefault ? (
                        on ? (
                          <button
                            type="button"
                            data-testid="plan-variable-default"
                            aria-label={`Clear default ${o.name}`}
                            title="Clear default"
                            className="-my-3 inline-flex min-h-11 items-center"
                            onClick={() => putRow(r, { defaultOption: "" }, false)}
                          >
                            <span className={DEFAULT_BADGE}>default</span>
                          </button>
                        ) : (
                          <span data-testid="plan-variable-default" aria-label="default" title="default" className={DEFAULT_BADGE}>
                            default
                          </span>
                        )
                      ) : null}
                      <TextPiece
                        on={on}
                        label={`Qualifier ${n} value ${k + 1}`}
                        value={o.name}
                        onCommit={(name) => {
                          const t = name.trim();
                          if (!t) return setOptions(v.options.filter((_, j) => j !== k).map((x) => x.name), v.defaultOption === o.name ? "" : v.defaultOption);
                          putRow(r, {
                            options: v.options.map((x, j) => (j === k ? { ...x, name: t } : x)),
                            defaultOption: v.defaultOption === o.name ? t : v.defaultOption,
                          });
                        }}
                      />
                      {on ? (
                        <>
                          {!isDefault ? (
                            <button
                              type="button"
                              data-testid="plan-variable-make-default"
                              aria-label={`Make default ${o.name}`}
                              className="pointer-events-none absolute left-0 top-full z-10 inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-2 text-[12px] text-[var(--accent)] opacity-0 shadow focus:pointer-events-auto focus:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                              onClick={() => putRow(r, { defaultOption: o.name }, false)}
                            >
                              Make default
                            </button>
                          ) : null}
                          <button
                            type="button"
                            aria-label={`Remove value ${o.name}`}
                            onClick={() =>
                              putRow(
                                r,
                                {
                                  options: v.options.filter((_, j) => j !== k),
                                  defaultOption: v.defaultOption === o.name ? "" : v.defaultOption,
                                },
                                false,
                              )
                            }
                          >
                            ×
                          </button>
                        </>
                      ) : null}
                    </span>
                  );
                })}
                {on ? (
                  <AddValues
                    label={`Qualifier ${n}`}
                    onAdd={(names) => {
                      const fresh = names.filter((x) => !v.options.some((o) => eq(o.name, x)));
                      if (fresh.length) setOptions([...v.options.map((o) => o.name), ...fresh]);
                    }}
                  />
                ) : null}
                {v.definition || (on && r.index !== null) ? (
                  <span className={`${faint} text-[12px]`}>
                    definition:{" "}
                    <TextPiece
                      on={on}
                      label={`Qualifier ${n} definition`}
                      value={v.definition}
                      empty="Add definition"
                      onCommit={(definition) => putRow(r, { definition })}
                    />
                  </span>
                ) : null}
              </p>
              {on && items ? <MakeValuesButton items={items} onClick={() => putRow(r, { options: items.map((x) => ({ name: x, definition: "" })), definition: "" })} /> : null}
              {canRename ? (
                <button
                  type="button"
                  className={`${quiet} self-start`}
                  data-testid="plan-variable-rename-helper"
                  onClick={() => p.onRenameQualifier!(helper.from, helper.to)}
                >
                  Rename [{helper.from}] to [{helper.to}]?
                </button>
              ) : null}
              {!r.inScale && on ? <NotInScale name={r.name} onRemove={() => removeRow(r)} onAdd={() => addToScale(r.name)} /> : null}
              {!r.inScale && !on ? <span className={`${faint} text-[12px]`}>Not in the Scale</span> : null}
              {r.index === null || planSourceEmpty(v.source) ? null : (
                <ViewSrc p={p} value={v.source} label={`[${v.name}] source`} onCommit={(source) => putRow(r, { source }, false)} />
              )}
            </div>
          );
        })}
        {on
          ? movableConditions(data).map((m) => (
              <button
                key={`${m.variable}|${m.option}`}
                type="button"
                className={`${quiet} self-start`}
                onClick={() => onChange(moveConditionIntoVariable(data, m))}
              >
                Move '{m.condition}' into [{m.variable}] on {m.count} level{m.count === 1 ? "" : "s"}
              </button>
            ))
          : null}
        {on ? <AddQualifier names={rows.map((r) => r.name)} onAdd={addToScale} /> : null}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 py-2">
      {rows.map((r, ri) => {
        const v = r.variable;
        const n = ri + 1;
        const canRename = helper && p.onRenameQualifier && eq(helper.to, r.name);
        return (
          <div
            key={r.name.toLowerCase()}
            tabIndex={-1}
            className={`flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-2 outline-none ${r.inScale ? "" : "opacity-60"}`}
            data-testid="plan-variable-row"
            data-qualifier-row={r.name.toLowerCase()}
            data-in-scale={r.inScale ? "yes" : "no"}
            data-has-record={r.index !== null ? "yes" : "no"}
          >
            <div className="flex items-center gap-2">
              {r.inScale ? (
                <span className="min-h-11 flex-1 py-2 text-[14px] text-[var(--ink)]" data-testid="plan-variable-name">
                  [{r.name}]
                </span>
              ) : (
                <CommitText label={`Qualifier ${n} name`} value={v.name} placeholder="Name" onCommit={(name) => putRow(r, { name })} />
              )}
              {r.index !== null ? (
                <button type="button" className={quiet} aria-label={`Remove qualifier ${v.name || n}`} onClick={() => removeRow(r)}>
                  ×
                </button>
              ) : null}
            </div>
            {canRename ? (
              <button
                type="button"
                className={`${quiet} self-start`}
                data-testid="plan-variable-rename-helper"
                onClick={() => p.onRenameQualifier!(helper.from, helper.to)}
              >
                Rename [{helper.from}] to [{helper.to}]?
              </button>
            ) : null}
            {!r.inScale ? (
              <span className="flex flex-wrap items-center gap-x-2" data-testid="plan-variable-not-in-scale">
                <span className={`${faint} text-[12px]`}>Not in the Scale</span>
                <button type="button" className={quiet} aria-label={`Add ${r.name} to the Scale`} onClick={() => addToScale(r.name)}>
                  Add to Scale
                </button>
              </span>
            ) : null}
            {v.options.length ? (
              <select
                aria-label={`Qualifier ${n} default option`}
                className={box}
                value={v.defaultOption}
                onChange={(e) => putRow(r, { defaultOption: e.target.value }, false)}
              >
                <option value="">No default</option>
                {v.options.map((o, k) => (
                  <option key={k} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {v.options.map((o, k) => (
                <span key={k} className={chip}>
                  <CommitText
                    label={`Qualifier ${n} option ${k + 1} name`}
                    className={small}
                    value={o.name}
                    placeholder="Option"
                    onCommit={(name) =>
                      putRow(r, {
                        options: v.options.map((x, j) => (j === k ? { ...x, name } : x)),
                        defaultOption: v.defaultOption === o.name ? name : v.defaultOption,
                      })
                    }
                  />
                  <CommitText
                    label={`Qualifier ${n} option ${k + 1} definition`}
                    className={small}
                    value={o.definition}
                    placeholder="Definition (optional)"
                    onCommit={(definition) =>
                      putRow(r, { options: v.options.map((x, j) => (j === k ? { ...x, definition } : x)) })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove option ${o.name || k + 1}`}
                    onClick={() =>
                      putRow(
                        r,
                        {
                          options: v.options.filter((_, j) => j !== k),
                          defaultOption: v.defaultOption === o.name ? "" : v.defaultOption,
                        },
                        false,
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {r.index !== null ? (
                <button
                  type="button"
                  className={quiet}
                  onClick={() => putRow(r, { options: [...v.options, { name: "", definition: "" }] }, false)}
                >
                  + Option
                </button>
              ) : (
                <AddValues
                  label={`Qualifier ${n}`}
                  onAdd={(names) => putRow(r, { options: names.map((x) => ({ name: x, definition: "" })) })}
                />
              )}
            </div>
            {!v.options.length && listLikeDefinition(v.definition) ? (
              <MakeValuesButton
                items={listLikeDefinition(v.definition)!}
                onClick={() => putRow(r, { options: listLikeDefinition(v.definition)!.map((x) => ({ name: x, definition: "" })), definition: "" })}
              />
            ) : null}
            <span className={`${faint} text-[12px]`}>definition:</span>
            <CommitText
              label={`Qualifier ${n} definition`}
              value={v.definition}
              placeholder="definition"
              onCommit={(definition) => putRow(r, { definition })}
            />
            {r.index !== null ? <Src p={p} value={v.source} label={`Qualifier ${n} source`} onCommit={(source) => putRow(r, { source }, false)} /> : null}
          </div>
        );
      })}
      <AddQualifier presetsShown names={rows.map((r) => r.name)} onAdd={addToScale} />
      {movableConditions(data).map((m) => (
        <button
          key={`${m.variable}|${m.option}`}
          type="button"
          className={quiet}
          onClick={() => onChange(moveConditionIntoVariable(data, m))}
        >
          Move '{m.condition}' into [{m.variable}] on {m.count} level{m.count === 1 ? "" : "s"}
        </button>
      ))}
    </div>
  );
}
