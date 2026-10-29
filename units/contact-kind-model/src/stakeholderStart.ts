/**
 * The New-record picker starts from the master's SHORTCUTS, not from the long list: a few of the master's own types first (for example
 * Organization, Person, System), with a "More types…" row keeping every other type reachable. The shortcuts are `a:createShortcut` on
 * `t:Stakeholder`, read into the card vocabulary (`stakeholder-card-vocabulary`); this file only fits them to what the dialog can create.
 * ⛔ No type is named here.
 *
 * ⚠ ONE display word is typed: "System" for the master's "Software System", keyed by the TERM's name; a type not listed keeps the master's label.
 */
import type { StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

/** Display copy keyed by type NAME ("Software System" is shown as "System"). Everything else keeps the master's own label. */
const SHORTCUT_WORDS: Readonly<Record<string, string>> = { SoftwareSystem: "System" };

export function shortcutDisplay(name: string, masterLabel: string | null): string {
  return SHORTCUT_WORDS[name] ?? masterLabel ?? name;
}

export interface StartStep {
  name: string;
  label: string;
  depth: number;
}

export interface StartShortcut {
  /** The type's bare name (the dialog's `TypeOption.typeName`). */
  name: string;
  term: string;
  /** The word on the row. */
  display: string;
  /** The master's own label, kept for the tooltip. */
  masterLabel: string | null;
  /** The types below it that can be created here, nearest first (the System step). Empty for a type with none. */
  steps: StartStep[];
}

/**
 * The shortcuts the dialog offers: the master's, in the master's order, kept to the types the dialog can create (`available`: the recordable
 * kinds). `[]` when none are known: the dialog then lists every type alike, as before.
 */
export function startShortcuts(
  vocab: Pick<StakeholderCardVocabulary, "createShortcuts" | "shortcutSteps"> | undefined,
  available: readonly { typeName: string }[],
): StartShortcut[] {
  const can = new Set(available.map((o) => o.typeName));
  const out: StartShortcut[] = [];
  for (const sc of vocab?.createShortcuts ?? []) {
    if (!can.has(sc.name)) continue;
    const steps = (vocab?.shortcutSteps?.[sc.name] ?? [])
      .filter((d) => can.has(d.name))
      .map((d) => ({ name: d.name, label: d.label ?? d.name, depth: d.depth }));
    out.push({ name: sc.name, term: sc.term, display: shortcutDisplay(sc.name, sc.label), masterLabel: sc.label, steps });
  }
  return out;
}

/** The shortcut a chosen type belongs to: its own type, or one of the types below it. `null` for a type reached through "More types…". */
export function shortcutOfType(shortcuts: readonly StartShortcut[], typeName: string): StartShortcut | null {
  return shortcuts.find((s) => s.name === typeName) ?? shortcuts.find((s) => s.steps.some((d) => d.name === typeName)) ?? null;
}

/**
 * The create options with the shortcuts first, in the master's order, then every other option in the order it had. So the first type the
 * dialog selects is the master's first shortcut, not whichever type the master happens to list first. Nothing is dropped.
 */
export function orderByShortcuts<T extends { typeName: string }>(options: readonly T[], shortcuts: readonly StartShortcut[]): T[] {
  const first = shortcuts.map((s) => options.find((o) => o.typeName === s.name)).filter((o): o is T => !!o);
  return [...first, ...options.filter((o) => !first.includes(o))];
}

/** The options that are NOT a shortcut: what "More types…" lists (every other type stays reachable; a type that is a shortcut is not listed twice). */
export function moreTypeOptions<T extends { typeName: string }>(options: readonly T[], shortcuts: readonly StartShortcut[]): T[] {
  const names = new Set(shortcuts.map((s) => s.name));
  return options.filter((o) => !names.has(o.typeName));
}
