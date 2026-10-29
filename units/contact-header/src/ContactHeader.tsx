/**
 * ContactHeader: the content of the header on an open contact. One header for every app, so every app draws the same header from
 * the same code.
 *
 * What it draws: the holder's image (a slot), the app's navigation (a slot), the connection (the
 * placement chips as ONE button that opens the placement panel, the Where / How we met line), the
 * contact's name, and the contact's photo with the live-link badge.
 *
 * What it does NOT hold: navigation, search, routing, the QR sheet or the favourite star. Each
 * app keeps those around the component.
 *
 * The layouts, one component, ONE DOM: `narrow` (the two-row phone header), `wide` (on a PC: one row, holder far left, the connection
 * between, the contact's name right-justified and the contact image far right) and `auto` (narrow, wide from 56rem of its own width).
 * Only the stylesheet differs. The connection also holds the relation chips (one per line,
 * "+ Relation" last; in narrow in row 1 next to the holder).
 *
 * App-specific pieces come in as slots or render props, never as imports of app code:
 * - `holder`: the holder's image (for example a photo fetched with auth, with a face crop).
 * - `nav`: the app's navigation, drawn in row 1 right after the holder's image (narrow only). For example a home button and a back
 *   button: the home button sits right after the holder avatar.
 * - `renderPlacementChip`: the chip for one placement (for example the app's shared contact-kind chip).
 * - `renderPhoto`: the contact's image (for example an image that reads its bytes with auth).
 * - `photoEditor`: drawn instead of the photo when the app lets the holder change it (for example a group admin's editable avatar).
 * - `after`: drawn after the row (for example a full-screen photo lightbox).
 *
 * The header ships its own stylesheet (`gsh-*` classes), so an app needs no Tailwind scan of this
 * package and no icon font.
 */
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { displayPlacements, type AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import { LINK_NOTE, LinkGlyph, NAME_FONT, W, imageShapeOf, type ImageShape } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";

/**
 * How the header is arranged.
 * - `wide` (on a PC): one row; holder | connection | contact.
 * - `narrow` (the two-row phone header). The default; the layout at every width for an app that wants one.
 * - `auto`: `narrow`, and `wide` from 56rem of the header's own width, by a CSS container query (no JS measure).
 */
export type ContactHeaderLayout = "wide" | "narrow" | "auto";

/** What the header hands an image slot of the app (the holder's avatar, a photo editor). */
export interface ContactHeaderSlotImage {
  /** From the entity's type in the data (`imageShapeOf`): a person is a circle. */
  shape: ImageShape;
  /** The image's side, px, at its largest in this layout (for picking an image resolution). */
  size: number;
  /** The image's side as CSS (`128px`, or a CSS variable in `auto` that the stylesheet sets per width). Draw at this size. */
  cssSize: string;
}

/** The holder side of the `wide` layout: the vault the card is seen from. */
export interface ContactHeaderHolder {
  /** The vault's name ("Ann Berg", "Berg AS"). */
  name: string;
  /** Its kind in words ("Me", "Organization vault"), or null for none. */
  caption: string | null;
  /** The vault's type as the data states it (`a:vaultRepresents`), or null when not known. */
  type: string | null;
}

/** The contact as the header needs it. */
export interface ContactHeaderContact {
  displayName: string;
  /** True when no name is known; the initials are then "?". */
  unnamed: boolean;
  /** The contact's photo address, or null for initials. */
  photoUrl: string | null;
  /** The Where / How we met line, or null when there is none. */
  origin: string | null;
  /** True while the Where / How we met line is still being read. */
  originLoading: boolean;
  /** The holder's placements of this contact, as stored. Shown collapsed by `displayPlacements`. */
  placements: AtomicPlacement[];
  /** True while the placement panel is open; the chips button then shows a ring. */
  placementOpen: boolean;
  /** A person (default) or a group vault: changes only the empty-chip words. */
  kind?: "person" | "group";
}

/**
 * One relation chip of the connection. ⛔ The package holds no word: the app hands the text, read from GilbVeda: the actual predicate.
 */
export interface ContactHeaderRelation {
  /** Stable key (the predicate's CURIE, or the holder's own entry). */
  key: string;
  /** The words on the chip: the GilbVeda term's own `a:label`, its CURIE when it has none, or the holder's own label. */
  text: string;
  /**
   * - `predicate`: a GilbVeda relation predicate, shown by its own label;
   * - `term-name`: a GilbVeda predicate with no label (or the vocabulary could not be read), shown by its own name, its CURIE (mono);
   * - `own`: the holder's own label, ⛔ not a GilbVeda term (dashed, so it is never mistaken for one).
   */
  kind: "predicate" | "term-name" | "own";
  /** The predicate's CURIE (`t:CustomerOf`); null for an own label. */
  curie: string | null;
  /** The hover: the sentence and the term ("Ann Berg customer-of Ben Berg · GilbVeda t:CustomerOf"). */
  title: string;
}

/** What the header hands the app's image renderer. */
export interface ContactHeaderImage {
  src: string;
  alt: string;
  className: string;
  testId: string;
}

export interface ContactHeaderProps {
  contact: ContactHeaderContact;
  /** Defaults to `narrow` (the phone header). */
  layout?: ContactHeaderLayout;
  /**
   * False when the app's own header already draws the band around this one (its background, bottom line and padding), so this
   * header draws none of its own. Defaults to true.
   */
  framed?: boolean;
  /**
   * True when the contact is linked to an online card. Only then the live-link badge shows
   * (the little chain link is there when the contact is an online linked contact, and goes away when it is a local one).
   */
  linked: boolean;
  /** The holder's image (the app's own avatar). A function is handed the shape and size to draw. */
  holder: ReactNode | ((image: ContactHeaderSlotImage) => ReactNode);
  /** `wide` / `narrow` / `auto` only: the holder's name, kind and type (the shape of its image). */
  holderInfo?: ContactHeaderHolder;
  /** `wide` / `narrow` / `auto` only: the contact's type as the data states it (the shape of its image); null when not known. */
  contactType?: string | null;
  /** `wide` / `narrow` / `auto` only: the line under the contact's name ("Person · online card"). */
  contactCaption?: string | null;
  /** The app's navigation, drawn in row 1 right after the holder's image (`narrow`; `wide` has no place for it). */
  nav?: ReactNode;
  /** Draws one placement chip. */
  renderPlacementChip: (placement: AtomicPlacement) => ReactNode;
  /**
   * Opens or closes the placement panel (the chips button). Without it, in `wide`, the chips are
   * shown read-only and an empty placement draws nothing (a host that cannot place yet).
   */
  onTogglePlacement?: () => void;
  /** Draws the contact's image inside the photo button. */
  renderPhoto: (image: ContactHeaderImage) => ReactNode;
  /** Tapping the contact's photo (for example opens it full screen). Without it the photo is not a button in `wide`. */
  onPhoto?: () => void;
  /** When given, drawn in place of the photo (an editable picture). A function is handed the shape and size. */
  photoEditor?: ReactNode | ((image: ContactHeaderSlotImage) => ReactNode);
  /** Drawn after the header row (for example a photo lightbox). */
  after?: ReactNode;
  /**
   * The relation chips, in the order to show them (at most 4 lines; the 4th is "+N more" when there are more). An app with no kinds
   * passes none.
   */
  relations?: readonly ContactHeaderRelation[];
  /** "+ Relation" (drawn last) opens the app's add flow. Without it no "+ Relation" is drawn. */
  onAddRelation?: () => void;
}

/** Two letters for a contact with no photo: first and last word, or "?" when unnamed. */
export function contactInitials(contact: Pick<ContactHeaderContact, "displayName" | "unnamed">): string {
  if (contact.unnamed) return "?";
  const parts = contact.displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** A slot that may be a node or a function of the image it is to draw. */
function slot(value: ReactNode | ((image: ContactHeaderSlotImage) => ReactNode), image: ContactHeaderSlotImage): ReactNode {
  return typeof value === "function" ? value(image) : value;
}

/**
 * The contact header's content (see the file header).
 *
 * @param props see {@link ContactHeaderProps}
 * @returns the header block, `data-testid="contact-shell-header"`
 */
export function ContactHeader(props: ContactHeaderProps) {
  return <AdaptiveHeader {...props} layout={props.layout ?? "narrow"} />;
}

// ── wide / narrow / auto ─────────────────────────────────────────────────────────────────────────
// ONE DOM for all three values; only the stylesheet below arranges it:
// - `wide`: one row, holder | holder name | connection (circle chips stacked, Where / How we met, relation chips stacked) | contact name |
//   contact image.
// - `narrow`: row 1 holder image | relation chips | contact name over Where / How we met, right-justified | contact
//   image; row 2 the circle chips at full width, wrapping.
// - `auto`: narrow, and wide from 56rem, by a CSS CONTAINER QUERY on the header itself. ⛔ No JS width measure: a measured switch never
//   measured after an in-app open, and kept the wide row at any width (clipped to 0 px).
// ⚠ Styled by a stylesheet the header ships (class names `gsh-*`), not by Tailwind: a host's theme may have none of the utility
// names, and the stylesheet needs no `@source` scan. Colours are CSS variables: the host's token first, a second app's second, a literal
// last.

/** At most this many relation lines in the stack; the last of them is "+N more" when there are more. */
const REL_LINES = 4;

/** The image sizes, px: wide (the card picture) and narrow. */
const SIZE = { wide: 128, narrowHolder: 60, narrowContact: 80 } as const;
/** The CSS variables the stylesheet sets per layout (`auto` follows the container). */
const HOLD_VAR = "var(--gsh-hold)";
const CONT_VAR = "var(--gsh-cont)";

/**
 * Rules of the narrow layout, under a selector prefix.
 * With an app's `nav` (a home and a back button, for example) row 1 gets one more column, right after the holder's image, and the
 * column gap is 8 px instead of 12: at 360 px the name keeps about 76 px between the nav and the contact photo.
 * Without a nav the grid has no nav column.
 * ⚠ The Where / How we met line is RIGHT-aligned like the name (it belongs to the contact) and is ONE line with an
 * ellipsis here: Chromium draws no ellipsis on a right-aligned 2-line clamp (measured, four variants). The
 * full text is its title and stays in the DOM. Wide keeps 2 lines.
 */
function narrowRules(s: string): string {
  return `
${s} { --gsh-hold: ${SIZE.narrowHolder}px; --gsh-cont: ${SIZE.narrowContact}px; --gsh-badge: 28px; --gsh-badge-at: -4px; --gsh-name: 18px; }
${s} .gsh-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: "hpic rels name cpic" "hpic rels origin cpic" "chips chips chips chips"; column-gap: 12px; row-gap: 2px; align-items: center; padding: 12px; }
${s} .gsh-hpic { grid-area: hpic; }
${s} .gsh-conn { display: contents; }
${s} .gsh-ident { grid-area: name; align-self: end; text-align: right; }
${s} .gsh-cpic { grid-area: cpic; }
${s} .gsh-chips { grid-area: chips; flex-direction: row; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
${s} .gsh-rels { grid-area: rels; flex-direction: column; align-items: flex-start; align-self: center; max-width: 9rem; }
${s} .gsh-origin { grid-area: origin; align-self: start; justify-self: stretch; text-align: right; max-width: 100%; min-width: 0; display: block; white-space: nowrap; -webkit-line-clamp: unset; line-clamp: none; text-overflow: ellipsis; }
${s} .gsh-hname, ${s} .gsh-caption, ${s} .gsh-arrow { display: none; }
${s}[data-nav="true"] .gsh-row { grid-template-columns: auto auto auto minmax(0, 1fr) auto; grid-template-areas: "hpic nav rels name cpic" "hpic nav rels origin cpic" "chips chips chips chips chips"; column-gap: 8px; }
${s}[data-nav="true"] .gsh-nav { grid-area: nav; align-self: center; min-width: 0; }`;
}

/** Rules of the wide layout, under a selector prefix. Every middle track has a floor, so nothing is squeezed to 0 px. */
function wideRules(s: string): string {
  return `
${s} { --gsh-hold: ${SIZE.wide}px; --gsh-cont: ${SIZE.wide}px; --gsh-badge: 32px; --gsh-badge-at: 4px; --gsh-name: 22px; }
${s} .gsh-row { display: grid; grid-template-columns: auto fit-content(10rem) minmax(0, 1fr) fit-content(14rem) auto; grid-template-areas: "hpic hname conn name cpic"; column-gap: 20px; align-items: center; padding: 18px 24px; }
${s} .gsh-hname { display: flex; grid-area: hname; }
${s} .gsh-conn { display: flex; grid-area: conn; min-width: 0; overflow: hidden; column-gap: 0; }
${s} .gsh-conn > :not(.gsh-arrow) { margin-inline: 5px; }
${s} .gsh-ident { grid-area: name; align-self: center; text-align: right; }
${s} .gsh-chips { flex-direction: column; flex-wrap: nowrap; gap: 4px; margin-top: 0; }
${s} .gsh-rels { grid-area: auto; flex-direction: column; align-items: flex-start; align-self: auto; flex: 0 1 auto; min-width: 5rem; }
${s} .gsh-origin { text-align: left; justify-self: auto; max-width: 14rem; min-width: 3rem; display: -webkit-box; white-space: normal; -webkit-line-clamp: 2; line-clamp: 2; align-self: center; }
${s} .gsh-caption { display: block; }
${s} .gsh-arrow { display: block; }`;
}

/**
 * Rules added later, kept as one block at the end of the sheet so the layouts above stay as they were.
 * - F2: a name breaks only between words (`.gsh-word`, one per word, a hyphen ending a word); a word too long for its space ends in "…".
 * - F3: the Where / How we met line is a button; expanded, it shows its whole text (a phone has no hover).
 * - F4: the initials are ink tinted with the brand. The bare brand colour on its 9% tint measured 2.86:1 in one app's light theme;
 *   this mix measures at least 4.5:1 in two apps, light and dark.
 * - F1: below 340 px of header width the name and the origin leave row 1 and sit under the photo, right-aligned, each on its own row
 *   ("Below about 340 px the name and origin go under the contact photo"). Row 1 keeps the holder, the nav,
 *   the relations and the photo, with an empty flexible track between.
 */
function s46Rules(): string {
  const small = (s: string) => `
${s} .gsh-row { grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: "hpic rels . cpic" "name name name name" "origin origin origin origin" "chips chips chips chips"; row-gap: 4px; }
${s}[data-nav="true"] .gsh-row { grid-template-columns: auto auto auto minmax(0, 1fr) auto; grid-template-areas: "hpic nav rels . cpic" "name name name name name" "origin origin origin origin origin" "chips chips chips chips chips"; }
${s} .gsh-ident { margin-top: 6px; }`;
  return `
.gsh-name { overflow-wrap: normal; word-break: normal; }
.gsh-word { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; }
.gsh-origin { background: none; border: 0; padding: 0; margin: 0; font-family: inherit; line-height: inherit; cursor: pointer; }
.gsh-initials { color: color-mix(in srgb,${W.brand} 30%,${W.ink}); }
.gsh[data-layout="narrow"] .gsh-origin[aria-expanded="true"], .gsh[data-layout="auto"] .gsh-origin[aria-expanded="true"] { white-space: normal; overflow: visible; text-overflow: clip; }
.gsh[data-layout="wide"] .gsh-origin[aria-expanded="true"] { display: block; -webkit-line-clamp: unset; line-clamp: none; }
@container gsh (min-width: 56rem) {
.gsh[data-layout="auto"] .gsh-origin[aria-expanded="true"] { display: block; -webkit-line-clamp: unset; line-clamp: none; }
}
@container gsh (max-width: 340px) {${small('.gsh[data-layout="narrow"]')}${small('.gsh[data-layout="auto"]')}
}
/* Kai-Zen D6 (Tester s51): with relations in row 1 (at most 9rem), the name and origin go under the photo before their column would fall below
   120 px: 24 padding + 60 holder + 12 + 144 relations + 12 + 120 name + 12 + 80 photo = 464 px = 29rem. */
@container gsh (max-width: 29rem) {${small('.gsh[data-layout="narrow"][data-rels="true"]')}${small('.gsh[data-layout="auto"][data-rels="true"]')}
}
.gsh-origin[aria-expanded="true"] { overflow-wrap: normal; word-break: normal; }`;
}

/**
 * The name as words: one inline box per word, so a line breaks only between words; a hyphen ends a word, and `<wbr>`
 * marks the break after it. The text content stays the whole name.
 */
function nameWords(name: string): ReactNode[] {
  const out: ReactNode[] = [];
  name.split(/\s+/).filter(Boolean).forEach((word, i) => {
    if (i > 0) out.push(" ");
    word.split(/(?<=-)/).forEach((part, j) => {
      if (j > 0) out.push(<wbr key={`b${i}.${j}`} />);
      out.push(
        <span key={`w${i}.${j}`} className="gsh-word">
          {part}
        </span>,
      );
    });
  });
  return out;
}

/** The header's own stylesheet (the same text for every header, so the browser parses it once per page). */
const SHEET = `
.gsh-q { container-type: inline-size; container-name: gsh; }
.gsh { background: ${W.base}; border-bottom: 1px solid ${W.lineSubtle}; }
.gsh-hpic, .gsh-cpic { position: relative; min-width: 0; }
.gsh-hname { flex-direction: column; gap: 2px; min-width: 0; }
.gsh-hname-name { font-family: ${NAME_FONT}; font-size: 16px; font-weight: 700; line-height: 1.15; color: ${W.ink}; overflow-wrap: anywhere; }
.gsh-sub { font-size: 12px; color: ${W.muted}; }
.gsh-conn { min-width: 0; align-items: center; gap: 10px; flex-wrap: nowrap; }
.gsh-arrow { flex: 1 1000 16px; min-width: 0; overflow: hidden; height: 2px; background: ${W.line}; position: relative; }
.gsh-arrow-end { height: 10px; background: linear-gradient(${W.line},${W.line}) center / 100% 2px no-repeat; }
.gsh-arrow-end::after { content: ""; position: absolute; right: 0; top: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 7px solid ${W.line}; }
.gsh-chips { display: inline-flex; align-items: flex-start; flex: none; padding: 2px; border-radius: 6px; border: 0; background: transparent; }
.gsh-origin { font-size: 14px; color: ${W.ink}; flex: 0 1 auto; min-width: 5rem; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; text-overflow: ellipsis; overflow-wrap: anywhere; }
.gsh-loading { font-size: 12px; color: ${W.muted}; }
.gsh-rels { display: inline-flex; gap: 4px; flex: none; min-width: 0; max-width: 12rem; }
.gsh-rel, .gsh-add { display: inline-flex; max-width: 100%; min-width: 0; align-items: center; border: 1px solid ${W.relBorder}; border-radius: 6px; padding: 2px 8px; font-size: 12.5px; font-weight: 500; line-height: 1.3; color: ${W.ink}; background: ${W.relBg}; font-family: ${NAME_FONT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gsh-more { cursor: pointer; background: transparent; }
/* Tester s51 D5: Chromium draws no ellipsis on a flex container's own text, so the words sit in their own box. */
.gsh-rel-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gsh-rel-name { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
.gsh-rel-own { border-style: dashed; background: transparent; color: ${W.ownText}; }
.gsh-add { border-style: dashed; border-color: ${W.brand}; color: ${W.addText}; background: transparent; cursor: pointer; font-family: inherit; font-size: 12px; }
.gsh-ident { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gsh-name { margin: 0; font-family: ${NAME_FONT}; font-size: var(--gsh-name); font-weight: 700; line-height: 1.15; color: ${W.ink}; overflow-wrap: anywhere; }
.gsh-img { width: var(--gsh-cont); height: var(--gsh-cont); overflow: hidden; display: grid; place-items: center; background: ${W.brandLighter}; outline: 1px solid ${W.line}; padding: 0; border: 0; }
.gsh-img[data-shape="circle"] { border-radius: 50%; } .gsh-img[data-shape="rounded-square"] { border-radius: 16px; }
.gsh-initials { font-family: ${NAME_FONT}; font-size: calc(var(--gsh-cont) * 0.31); font-weight: 700; color: ${W.brand}; }
.gsh-badge { position: absolute; bottom: var(--gsh-badge-at); left: var(--gsh-badge-at); width: var(--gsh-badge); height: var(--gsh-badge); border-radius: 50%; display: grid; place-items: center; background: ${W.sheet}; color: ${W.link}; outline: 1px solid ${W.line}; box-shadow: 0 1px 2px rgba(0,0,0,.08); pointer-events: none; }
.gsh-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${narrowRules('.gsh[data-layout="narrow"]')}
${narrowRules('.gsh[data-layout="auto"]')}
${wideRules('.gsh[data-layout="wide"]')}
@container gsh (min-width: 56rem) {${wideRules('.gsh[data-layout="auto"]')}
}
.gsh[data-frame="none"] { background: transparent; border-bottom: 0; }
.gsh[data-frame="none"][data-layout] .gsh-row { padding: 0; }
${s46Rules()}`;

function AdaptiveHeader({
  contact,
  layout,
  framed = true,
  linked,
  holder,
  holderInfo,
  contactType,
  contactCaption,
  nav,
  renderPlacementChip,
  onTogglePlacement,
  renderPhoto,
  onPhoto,
  photoEditor,
  after,
  relations = [],
  onAddRelation,
}: ContactHeaderProps & { layout: "wide" | "narrow" | "auto" }) {
  const placements = displayPlacements(contact.placements);
  const initials = contactInitials(contact);
  // The Where / How we met line opens on a tap; a new contact (or a new text) starts closed.
  const [originOpen, setOriginOpen] = useState(false);
  useEffect(() => setOriginOpen(false), [contact.origin]);
  // People and contacts are circles, everything else squares. From the type in the data on both sides.
  const holderShape = imageShapeOf(holderInfo?.type);
  const contactShape = imageShapeOf(contactType);
  const holderImage: ContactHeaderSlotImage =
    layout === "wide"
      ? { shape: holderShape, size: SIZE.wide, cssSize: `${SIZE.wide}px` }
      : layout === "narrow"
        ? { shape: holderShape, size: SIZE.narrowHolder, cssSize: `${SIZE.narrowHolder}px` }
        : { shape: holderShape, size: SIZE.wide, cssSize: HOLD_VAR };
  const contactImage: ContactHeaderSlotImage =
    layout === "wide"
      ? { shape: contactShape, size: SIZE.wide, cssSize: `${SIZE.wide}px` }
      : layout === "narrow"
        ? { shape: contactShape, size: SIZE.narrowContact, cssSize: `${SIZE.narrowContact}px` }
        : { shape: contactShape, size: SIZE.wide, cssSize: CONT_VAR };
  const chips = placements.map((p) => <Fragment key={`${p.context}:${p.depth}`}>{renderPlacementChip(p)}</Fragment>);
  const hasRelations = relations.length > 0 || !!onAddRelation;
  // At most 4 relation lines. With more, the 4th line is "+N more"; it expands the stack in
  // place and collapses it again. "+ Relation" stays last.
  const [allRelations, setAllRelations] = useState(false);
  const capped = relations.length > REL_LINES && !allRelations;
  const shownRelations = capped ? relations.slice(0, REL_LINES - 1) : relations;
  const hasConnection = !!onTogglePlacement || placements.length > 0 || !!contact.origin || contact.originLoading || hasRelations;
  const photo = contact.photoUrl
    ? renderPhoto({ src: contact.photoUrl, alt: "", className: "h-full w-full object-cover", testId: "contact-card-photo" })
    : null;
  return (
    // ⚠ Two boxes on purpose: the OUTER box is the size container; the INNER `.gsh` carries the layout and the
    // size variables. A container query styles only the container's DESCENDANTS, so the sizes set on the container itself never
    // switched to wide (the pictures stayed 60 / 80 px at 1280 and 1700).
    <div data-testid="contact-shell-header" data-layout={layout} className="gsh-q" style={{ containerType: "inline-size" }}>
      <style>{SHEET}</style>
      {/* `data-nav` / `data-frame` are set only when used, so the DOM of a host with no nav, framed, has neither. */}
      <div
        className="gsh"
        data-layout={layout}
        data-nav={nav !== undefined && nav !== null ? "true" : undefined}
        data-rels={hasRelations ? "true" : undefined}
        data-frame={framed ? undefined : "none"}
      >
      <div data-testid="contact-shell-chrome-row" className="gsh-row">
        <div data-testid="contact-header-holder" data-shape={holderShape} className="gsh-hpic">
          {slot(holder, holderImage)}
        </div>
        <div data-testid="contact-header-holder-name" className="gsh-hname">
          <span className="gsh-hname-name">{holderInfo?.name ?? ""}</span>
          {holderInfo?.caption ? <span className="gsh-sub">{holderInfo.caption}</span> : null}
        </div>
        {nav !== undefined && nav !== null ? (
          <div data-testid="contact-header-nav" className="gsh-nav">
            {nav}
          </div>
        ) : null}
        {/* The connection: circle chips, the Where / How we met line, then the relation chips (predicates, one per line,
            "+ Relation" last). In narrow this box dissolves (`display: contents`) and its parts take their own places in
            the two rows: the relations go to row 1 next to the holder's image. */}
        <div data-testid="contact-header-connection" className="gsh-conn">
          {/* With nothing between the two sides, ONE line runs from the holder to the contact (two halves with a gap read as a break). */}
          {hasConnection ? <span aria-hidden="true" className="gsh-arrow" /> : null}
          {onTogglePlacement ? (
            <button
              type="button"
              aria-expanded={contact.placementOpen}
              data-testid="contact-card-open-placement"
              onClick={() => onTogglePlacement()}
              className="gsh-chips"
              style={{
                cursor: "pointer",
                boxShadow: contact.placementOpen ? `0 0 0 2px color-mix(in srgb,${W.brand} 40%,transparent)` : undefined,
              }}
            >
              {placements.length === 0 ? (
                <span
                  style={{ border: `1px solid ${W.line}`, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 500, background: W.sheet, color: W.muted }}
                >
                  {contact.kind === "group" ? "Set access" : "Set connection type"}
                </span>
              ) : (
                chips
              )}
            </button>
          ) : placements.length > 0 ? (
            <div data-testid="contact-card-placements" className="gsh-chips">
              {chips}
            </div>
          ) : null}
          {/* At most 2 lines, then an ellipsis; the whole text is the hover title and stays in the DOM (the
              accessible name), so nothing of it is lost when it is cut on screen. */}
          {contact.origin ? (
            // A phone has no hover, so the cut line is a button that shows the whole text in place.
            <button
              type="button"
              data-testid="contact-card-origin-inline"
              className="gsh-origin"
              title={contact.origin}
              aria-expanded={originOpen}
              onClick={() => setOriginOpen((open) => !open)}
            >
              {contact.origin}
            </button>
          ) : contact.originLoading ? (
            <span className="gsh-loading">Loading where you met…</span>
          ) : null}
          {hasRelations ? (
            <div data-testid="contact-header-relations" className="gsh-rels">
              {shownRelations.map((r) => (
                <span
                  key={r.key}
                  data-testid="contact-header-relation"
                  data-kind={r.kind}
                  data-curie={r.curie ?? undefined}
                  title={r.title}
                  className={r.kind === "own" ? "gsh-rel gsh-rel-own" : r.kind === "term-name" ? "gsh-rel gsh-rel-name" : "gsh-rel"}
                >
                  <span className="gsh-rel-text">{r.text}</span>
                </span>
              ))}
              {relations.length > REL_LINES ? (
                <button
                  type="button"
                  data-testid="contact-header-relations-more"
                  aria-expanded={allRelations}
                  className="gsh-rel gsh-more"
                  onClick={() => setAllRelations((v) => !v)}
                >
                  {capped ? `+${relations.length - (REL_LINES - 1)} more` : "Show fewer"}
                </button>
              ) : null}
              {onAddRelation ? (
                <button type="button" data-testid="contact-header-add-relation" className="gsh-add" onClick={() => onAddRelation()}>
                  + Relation
                </button>
              ) : null}
            </div>
          ) : null}
          <span aria-hidden="true" className="gsh-arrow gsh-arrow-end" />
        </div>
        {/* The name belongs to the profile on the right: it is right-justified. */}
        <div data-testid="contact-shell-identity" className="gsh-ident" style={{ textAlign: "right" }}>
          <h1
            data-testid="contact-card-name"
            data-unnamed={contact.unnamed ? "true" : "false"}
            className="gsh-name"
            title={contact.displayName}
          >
            {nameWords(contact.displayName)}
          </h1>
          {contactCaption ? (
            <span data-testid="contact-card-caption" className="gsh-sub gsh-caption">
              {contactCaption}
            </span>
          ) : null}
        </div>
        {/* The contact image, fixed at the far right. */}
        <div data-testid="contact-card-link-photo" data-shape={contactShape} className="gsh-cpic">
          {photoEditor !== undefined ? (
            <div data-testid="contact-card-avatar" data-has-photo={contact.photoUrl ? "true" : "false"}>
              {slot(photoEditor, contactImage)}
            </div>
          ) : photo && onPhoto ? (
            <button
              type="button"
              data-testid="contact-card-avatar"
              data-has-photo="true"
              data-shape={contactShape}
              className="gsh-img"
              aria-label={contact.displayName ? `View full-screen photo of ${contact.displayName}` : "View full-screen photo"}
              onClick={() => onPhoto()}
              style={{ cursor: "pointer" }}
            >
              {photo}
            </button>
          ) : photo ? (
            <div data-testid="contact-card-avatar" data-has-photo="true" data-shape={contactShape} className="gsh-img">
              {photo}
            </div>
          ) : (
            <div data-testid="contact-card-avatar" data-has-photo="false" data-shape={contactShape} className="gsh-img">
              <span data-testid="contact-card-initials" className="gsh-initials">
                {initials}
              </span>
            </div>
          )}
          {linked ? (
            <span title={LINK_NOTE} data-testid="contact-card-link-note" className="gsh-badge">
              <LinkGlyph />
              <span className="gsh-sr">{LINK_NOTE}</span>
            </span>
          ) : null}
        </div>
      </div>
      {after}
      </div>
    </div>
  );
}
