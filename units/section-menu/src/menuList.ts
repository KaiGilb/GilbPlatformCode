/**
 * The shape of a section menu's list, and the helpers that read it.
 *
 * A host writes ONE list of sections, options and places. The section menu draws it, and a command
 * palette can read the same list through `menuCommands`, so the two cannot drift apart.
 *
 * Every act is written against the host's own `Api` (the type parameter), and every gate against the
 * host's own `Gate`. So this file holds no React, no router and no address: what a section does is the
 * host's; how the list is read is this unit's.
 *
 * ⚠ AVAILABILITY. An unbuilt destination is left out of the list, not drawn (Rule_Code_gilb-app-nav-truth,
 * RuleBaserenderNoUnbuiltDestination). `coming` exists only for an entry the owner names as coming: it is
 * drawn greyed out and does nothing.
 */
import type { MenuIconKey } from "./MenuIcon";

/** One option: a row the person can choose. */
export interface MenuOption<Api = unknown, Gate = unknown, Icon extends string = MenuIconKey> {
  id: string;
  icon: Icon;
  label: string;
  description: string;
  /** Extra words a command palette matches. */
  keywords?: readonly string[];
  /** Named as coming by the owner: drawn greyed out, with no act. */
  coming?: boolean;
  /** An address outside the app, opened in a new tab. */
  href?: string;
  run?: (api: Api) => void;
  /**
   * Shown only when this returns true for the gate the host passes (the menu's `gate` prop, or the
   * helpers' `gate` argument). With no gate given, an entry that has `show` is left out.
   */
  show?: (gate: Gate) => boolean;
  /** A line saying why a gated entry is shown. */
  context?: string;
  /** Listed by a command palette only, not in the menu. */
  commandOnly?: boolean;
}

/** One section: a main destination on the menu's left, with its own options. */
export interface MenuSection<Id extends string = string, Api = unknown, Gate = unknown, Icon extends string = MenuIconKey> {
  id: Id;
  icon: Icon;
  label: string;
  description: string;
  /** A line under the description, for example why a gated section is shown. */
  note?: string;
  show?: (gate: Gate) => boolean;
  /** Goes to the section. */
  go: (api: Api) => void;
  options: readonly MenuOption<Api, Gate, Icon>[];
  /** Ids of places ("Also useful here") that fit this section, in the places' own order. */
  also?: readonly string[];
}

/** An extra command for a command palette only, placed under a section (or none) for the ordering. */
export type MenuExtraCommand<Id extends string = string, Api = unknown, Gate = unknown, Icon extends string = MenuIconKey> =
  MenuOption<Api, Gate, Icon> & { section: Id | null };

/** A host's whole list. */
export interface MenuList<Id extends string = string, Api = unknown, Gate = unknown, Icon extends string = MenuIconKey> {
  sections: readonly MenuSection<Id, Api, Gate, Icon>[];
  /** "Also useful here": places a section names by id in `also`. */
  places?: readonly MenuOption<Api, Gate, Icon>[];
  /** "For you": gated entries for this person. */
  forYou?: readonly MenuOption<Api, Gate, Icon>[];
  /** Command-palette-only commands. */
  extraCommands?: readonly MenuExtraCommand<Id, Api, Gate, Icon>[];
}

/**
 * The sections this person sees, in list order.
 * @param sections the host's sections
 * @param gate what the gates read; undefined counts as no gate, and a gated entry is then left out
 */
export function visibleSections<S extends { show?: (gate: G) => boolean }, G>(sections: readonly S[], gate: G): S[] {
  return sections.filter((s) => passes(s, gate, gate !== undefined));
}

/**
 * True when an entry's gate lets it show: no gate on the entry, or the host's gate given and agreeing.
 * ONE rule for every helper and the menu, so the menu and a palette cannot drift: an undefined gate (a
 * host's gate still loading) is no gate, and a gated entry is then left out (Agent.Tester rounds 2-3, D8, D12).
 */
// `never` in the parameter accepts an entry of any gate type; the host's own types keep the gate it passes right.
function passes(o: { show?: (gate: never) => boolean }, gate: unknown, hasGate: boolean): boolean {
  return !o.show || (hasGate && o.show(gate as never));
}

/**
 * A section's menu options: the command-palette-only ones and the gated-off ones left out.
 * @param section one section
 * @param gate what the options' gates read; without it (or undefined), an option that has a gate is left out
 */
export function menuOptionsOf<O extends { commandOnly?: boolean; show?: (gate: never) => boolean }>(
  section: { options: readonly O[] },
  ...gate: [] | [unknown]
): O[] {
  // An undefined gate (a host's gate still loading) counts as no gate (Agent.Tester round 2, D8).
  return section.options.filter((o) => !o.commandOnly && passes(o, gate[0], gate[0] !== undefined));
}

/**
 * The places that fit a section, in the places' own order, gated-off ones left out.
 * @param section one section; its `also` names place ids
 * @param places the host's places
 * @param gate what the places' gates read; without it (or undefined), a place that has a gate is left out
 */
export function placesFor<O extends { id: string; show?: (gate: never) => boolean }>(
  section: { also?: readonly string[] },
  places: readonly O[] = [],
  ...gate: [] | [unknown]
): O[] {
  const also = section.also ?? [];
  return places.filter((p) => also.includes(p.id) && passes(p, gate[0], gate[0] !== undefined));
}

/**
 * The "For you" entries this person sees.
 * @param forYou the host's "For you" entries
 * @param gate what the gates read; undefined counts as no gate, and a gated entry is then left out
 */
export function forYouFor<O extends { show?: (gate: G) => boolean }, G>(forYou: readonly O[], gate: G): O[] {
  return forYou.filter((o) => passes(o, gate, gate !== undefined));
}

/** One command-palette row, built from the list. */
export interface MenuCommand<Id extends string = string, Api = unknown, Icon extends string = MenuIconKey> {
  id: string;
  icon: Icon;
  label: string;
  keywords: readonly string[];
  /** The label of the section the row belongs to ("" for none). */
  loc: string;
  section: Id | null;
  coming: boolean;
  href?: string;
  run?: (api: Api) => void;
}

/** How `menuCommands` words its rows. */
export interface MenuCommandWords {
  /** The row that goes to a section. Default "Go to <label>". */
  goTo?: (sectionLabel: string) => string;
  /** The `loc` of a "For you" row. Default "For you". */
  forYou?: string;
}

/**
 * Every command-palette row from the list: "Go to" each visible section, then each section's options
 * (command-only ones too), the places, the "For you" entries and the extra commands; every entry whose
 * gate is closed for `gate` is left out.
 * When `current` is given, the current section's rows come first; otherwise the list order holds.
 * @param list the host's list
 * @param gate what the gates read; undefined counts as no gate, and a gated entry is then left out
 * @param current the section the person is in, or null
 * @param words how the rows are worded
 */
export function menuCommands<Id extends string, Api, Gate, Icon extends string>(
  list: MenuList<Id, Api, Gate, Icon>,
  gate: Gate,
  current: Id | null,
  words: MenuCommandWords = {},
): MenuCommand<Id, Api, Icon>[] {
  const goTo = words.goTo ?? ((label: string) => `Go to ${label}`);
  const out: MenuCommand<Id, Api, Icon>[] = [];
  for (const s of visibleSections(list.sections, gate)) {
    out.push({ id: `go.${s.id}`, icon: s.icon, label: goTo(s.label), keywords: [s.label, s.description],
      loc: s.label, section: s.id, coming: false, run: s.go });
    // Command-only options are rows here; gated-off ones are not.
    for (const o of s.options.filter((x) => passes(x, gate, gate !== undefined))) out.push(toCommand(o, s.label, s.id));
  }
  for (const p of forYouFor(list.places ?? [], gate)) out.push(toCommand<Id, Api, Gate, Icon>(p, "", null));
  for (const o of forYouFor(list.forYou ?? [], gate)) out.push(toCommand<Id, Api, Gate, Icon>(o, words.forYou ?? "For you", null));
  // The extra command's `loc` names its section even when the gate hides that section from this person.
  const labelOf = (id: Id | null) => list.sections.find((s) => s.id === id)?.label ?? "";
  for (const o of forYouFor(list.extraCommands ?? [], gate)) out.push(toCommand(o, labelOf(o.section), o.section));
  if (!current) return out;
  // A stable partition: the current section's rows, then the rest, each in list order.
  return [...out.filter((c) => c.section === current), ...out.filter((c) => c.section !== current)];
}

/**
 * One option as a command-palette row.
 * @param o the option
 * @param loc the label of the section it belongs to ("" for none)
 * @param section the section's id, or null
 */
export function toCommand<Id extends string, Api, Gate, Icon extends string>(
  o: MenuOption<Api, Gate, Icon>,
  loc: string,
  section: Id | null,
): MenuCommand<Id, Api, Icon> {
  return {
    id: o.id, icon: o.icon, label: o.label, keywords: [...(o.keywords ?? []), o.description],
    loc, section, coming: !!o.coming, href: o.href, run: o.run,
  };
}
