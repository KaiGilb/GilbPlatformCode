/**
 * The body of a person card: ONE card when the record is linked to an online card, today's frame otherwise.
 *
 * Linked: the card's own groups (the `children`, drawn as they always were) with the rows of their online card placed in the groups that
 * hold each field, shaded and marked with the chain link (no Theirs/Yours badges, no legend); the holder's own rows plain; and the foot
 * "Connected to their online card." with a quiet Unlink (the controller's existing unlink: no new write path).
 * NOT linked (no link, a malformed one, or two links) is the SAME one body with one source: the merge of the holder's own record alone
 * (`mergeOneCard` with no online card: no row of theirs, so no mark, no legend, no "+ Add your own"); the card's own groups and editors
 * exactly as today; and the foot "No online card is connected." with "Find their online card" (the existing Find).
 * After a Connect the controller's link turns "linked" and this body draws the linked one card where it stands, with no reload.
 * A link that resolves to nothing, or to an organization's card, is the linked body with one source: the platform's words at the top, no
 * row of theirs (no mark, no legend), and the foot with Unlink.
 *
 * The controller reads the online card once per open (`useOnlineCardState` loads on mount; a load in flight is shared); the merge is
 * pure. When the card is linked and ready and an address field is named, `useTheirAddresses` asks the host for the address spellings
 * and the place names. ⛔ Nothing of theirs is written into the record, ever: the theirs rows have no control.
 */
import { useEffect, type ReactNode } from "react";
import { bareForm } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { birthdayText } from "@kaigilb/gilbplatformcode-birthday-text";
import { LanguageRow } from "@kaigilb/gilbplatformcode-language-row";
import { referentNameOf, termNameWord } from "@kaigilb/gilbplatformcode-term-name-text";
import { displayPlacements, type PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import type { OneCardField, OneCardGroup, OneCardRow, TheirAddressInput } from "@kaigilb/gilbplatformcode-one-card-merge";
import type { OnlineCardController } from "@kaigilb/gilbplatformcode-online-card";
import { OneCardFoot } from "@kaigilb/gilbplatformcode-one-card-rows";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { OneCardProvider, oneCardOf, placeOneCard, useOneCard, type OneCardView } from "@kaigilb/gilbplatformcode-one-card-context";
import { useOnlineCardState } from "./useOnlineCardState";
import { publishTheirPlaces, type TheirPlaceGroup } from "./theirPlaces";
import { NoOnlineCardFoot } from "./OneCardFind";
import { useHeldAddresses } from "./heldAddresses";
import { useTheirAddresses, type TheirAddressView } from "./theirAddresses";
// The `.tsx` is required: extensionless `./TheirAddressLines` resolves to `theirAddressLines.ts` on a case-insensitive volume.
import { TheirAddressLines } from "./TheirAddressLines.tsx";
import { useOneCardHost, type OneCardHost } from "./oneCardHost";

export interface OneCardBodyProps {
  controller: OnlineCardController | null;
  /** The master's label of a predicate ("" when unknown). */
  labelFor: (predicate: string) => string;
  /** The local card's name: the unlinked foot's words, and what its search opens with. */
  searchName: string;
  canWrite: boolean;
  /** The kind's field set, in the card's order (`resolveFieldSets`). */
  fieldOrder: readonly OneCardField[];
  /** The record's SERVED facts, one value per entry; null when the whole record is not read yet (then no merge is made). */
  servedFacts: Record<string, unknown> | null;
  /** The predicate the person card's skills are written under (the skill field's write key), or null. */
  skillPredicate: string | null;
  /** The card's own group a merged group is drawn in (by its term), or null for a group of its own. */
  groupOf: (group: OneCardGroup) => string | null;
  /** Merged groups the body does not draw (the photo: the header's picture). */
  skip: (group: OneCardGroup) => boolean;
  /** The card's own position of a merged group's field (rows in a group of several fields follow it). */
  order: (group: OneCardGroup) => number;
  /** The person card's placement reading: after an unlink a placed person shows as their own row. */
  personCard: PersonCard | null;
  /** The address field's write spelling (`a:postalAddress`), or null when the kind has no address field. */
  addressPredicate?: string | null;
  /** The vault that holds the record, and the record's entity IRI: where its held addresses are read (the Address group's read). */
  addressVaultId?: string | null;
  addressSubject?: string | null;
  /** The record's entity IRI, under which the places taken off the card are handed to the Details panel (`theirPlaces`). */
  recordUri?: string | null;
  /** The card's own groups, as the app draws them. */
  children: ReactNode;
}

/**
 * A group of their card the card draws in no group of its own whose every value of theirs is a GilbGeo address (the "Claim Place" group)
 * is not drawn on the card: it is technical back information, and goes to the Details panel as the place's name. Found by the VALUES,
 * ⛔ no predicate is named here (the same test a place card uses to name a place, `isGeoEntityId`). A group the card places in one of its
 * own groups is not taken.
 */
export function isTheirPlaceGroup(host: OneCardHost, group: OneCardGroup, groupOf: (group: OneCardGroup) => string | null): boolean {
  if (groupOf(group)) return false;
  const theirs = group.rows.filter((r) => r.source === "theirs");
  return theirs.length > 0 && theirs.every((r) => host.isGeoEntityId(r.value.trim()));
}

/** Hands the places taken off the card to the Details panel while the card is open; clears them when it closes. */
function PublishTheirPlaces({ recordUri, groups }: { recordUri: string; groups: readonly TheirPlaceGroup[] }) {
  const key = JSON.stringify(groups);
  useEffect(() => {
    publishTheirPlaces(recordUri, JSON.parse(key) as TheirPlaceGroup[]);
  }, [recordUri, key]);
  useEffect(() => () => publishTheirPlaces(recordUri, []), [recordUri]);
  return null;
}

const LOADING = "Loading their online card…";
const READING_THEIR_ADDRESS = "Reading their address…";
const THEIR_ADDRESS_FAILED = "Their address could not be read right now.";

/** The status of their card while it is not ready, in the frame's own words. */
function statusLine(status: string): { text: string; alert: boolean } | null {
  switch (status) {
    case "idle":
    case "loading":
      return { text: LOADING, alert: false };
    case "busy":
      // Nothing asks again by itself, so the line offers Try again (enabled once the platform's wait is over).
      return { text: "Their online card is busy just now. Your card is shown. Wait a moment and try again. Your link is unchanged.", alert: true };
    case "unavailable":
      return { text: "Their online card could not be reached just now. Your link is unchanged.", alert: true };
    case "unauthenticated":
      return { text: "Sign in again to see their online card.", alert: true };
    case "none":
      return { text: "The linked card cannot be opened from here now: it may have been removed, or it is not open to you. Your link is unchanged.", alert: false };
    case "organization":
      // The link names an organization's card, which the organization card shows.
      return { text: "This record is connected to an organization’s online card. The organization card shows it.", alert: false };
    default:
      return null;
  }
}

/**
 * How a row of theirs words its value: a birthday reads "14 March" / "14 March 1980" (`birthdayText`, the
 * month in the reader's language); every other value as served. Keyed on the field's TERM (`a:birthday`, the one term whose
 * encoding is `inline-literal:date-or-month-day`), ⛔ never on the value's shape: "--03-14" is also a lawful nickname. A birthday
 * that is not a lawful one reads as stored, ⛔ never a guessed date.
 */
function theirValueText(row: OneCardRow): ReactNode {
  return languageUsedText(row) ?? (bareForm(row.field) === "birthday" ? (birthdayText(row.value) ?? row.value) : row.value);
}

/**
 * A skill of theirs is shown by its name: the master's label, else the catalogue name in the term's address (`referentNameOf`), else, for any other
 * ADDRESS, the word "A skill". Text that is not an address (a free-text skill) is its own name. Never an address, never the last part of one.
 */
function skillText(value: string, label: string): string {
  return label || referentNameOf(value) || (/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? termNameWord("skill") : value);
}

/**
 * A language of theirs is drawn by its name with its country's flag (`LanguageRow`), never as its address. Keyed on the field's TERM
 * (`a:languageUsed`), ⛔ never on the value's shape. Null for every other field.
 */
function languageUsedText(row: OneCardRow): ReactNode | null {
  return bareForm(row.field) === "languageUsed" ? <LanguageRow language={row.value} /> : null;
}

/** `TheirAddressView` as the merge's input. The line is `addressLine` of these parts. */
function toTheirInput(a: TheirAddressView): TheirAddressInput {
  return {
    composite: a.composite,
    label: a.label,
    parts: { street: a.street, line1: a.line1, line2: a.line2, postalCode: a.postalCode, city: a.city, region: a.region, country: a.country },
    countryId: a.countryId,
    rungs: a.rungs,
    unread: a.unread,
    gone: a.gone,
  };
}

export function OneCardBody(props: OneCardBodyProps) {
  const { controller, labelFor, searchName, canWrite, children } = props;
  const host = useOneCardHost();
  const state = useOnlineCardState(controller);
  // The holder's addresses go into the merge (equal to theirs -> one row "same"). Read only for a linked card whose online card is
  // read, and only the vault's one shared address read (no request of its own).
  const addresses = useHeldAddresses(
    !!props.addressPredicate && state?.link.state === "linked" && state?.online.status === "ready",
    props.addressVaultId,
    props.addressSubject,
  );
  // Their addresses are read only for a linked card whose online card is ready and which names an address field.
  // `ready` merges from `rest` and the addresses. `reading` with `rest` (spellings known) merges from `rest` only, so the
  // raw part rows are already gone. Before the spellings, and on `failed` or `off`, the card is the online card as served.
  const onlineReady = state?.link.state === "linked" && state.online.status === "ready" ? state.online : null;
  const theirState = useTheirAddresses(!!props.addressPredicate && onlineReady !== null, onlineReady ? onlineReady.card.fields : null);
  if (!controller || !state) return <>{children}</>;
  const linked = state.link.state === "linked";
  if (!linked) {
    // One source. The merge of the holder's own record alone draws no row of theirs, so every group, editor and
    // write is today's; the view only makes this the one card (no marks: `marks` is false with no online card).
    const view: OneCardView | null =
      props.servedFacts === null
        ? null
        : unlinkedView(oneCardOf({ online: null, servedFacts: props.servedFacts, fieldOrder: props.fieldOrder, skillPredicate: props.skillPredicate }), props);
    return (
      <OneCardProvider view={view}>
        <div className="flex flex-col gap-4" data-testid="one-card" data-online-status="none" data-link={state.link.state}>
          {/* A failed Connect is said in the foot, beside the Find where it was pressed (not here at the top). */}
          {children}
          <NoOnlineCardFoot controller={controller} state={state} searchName={searchName} canWrite={canWrite} />
        </div>
      </OneCardProvider>
    );
  }
  const online = state.online;
  let view: OneCardView | null = null;
  let places: TheirPlaceGroup[] = [];
  if (online.status === "ready" && props.servedFacts !== null) {
    const theirReady = theirState.state === "ready" ? theirState : null;
    // `[]` is a real rest (every field was an address part). Absent means the spellings are not known yet.
    const theirRest = theirReady?.rest ?? (theirState.state === "reading" ? theirState.rest : undefined);
    const card = oneCardOf({
      online: theirRest !== undefined ? { ...online.card, fields: theirRest } : online.card,
      servedFacts: props.servedFacts!,
      fieldOrder: props.fieldOrder,
      skillPredicate: props.skillPredicate,
      addressPredicate: props.addressPredicate ?? null,
      addresses: addresses ?? [],
      theirAddresses: theirReady ? theirReady.addresses.map(toTheirInput) : undefined,
    });
    // The place groups are taken off the card (and handed to Details below).
    const placeGroups = card.groups.filter((g) => !props.skip(g) && isTheirPlaceGroup(host, g, props.groupOf));
    places = placeGroups.map((g) => ({
      label: g.label ?? (labelFor(g.field) || g.field.replace(/^[a-z]+:/, "")),
      places: g.rows.filter((r) => r.source === "theirs").map((r) => r.value.trim()),
    }));
    const placed = placeOneCard(card, props.groupOf, (g) => props.skip(g) || placeGroups.includes(g), props.order);
    const skill = props.skillPredicate;
    view = {
      // Marks and the legend only when a row of theirs is drawn (a card that shares nothing drawn here
      // has one source on screen).
      marks: card.marks && [...placed.byKind.values()].some((p) => p.groups.some((g) => g.rows.some((r) => r.source === "theirs"))),
      byKind: placed.byKind,
      own: placed.own,
      rowLabel: (kind, g) => (kind === "name" || kind === "record" || kind === "time-zone" || kind === "details" ? (g.label ?? (labelFor(g.field) || null)) : null),
      // A skill is shown by its name (`skillText`). A
      // birthday of theirs reads "14 March" / "14 March 1980" (`theirValueText`).
      valueText: (row: OneCardRow) => {
        // Lines and the flag, copied from address-card-parts `compactLines` / CompactAddress. Not the plain one-line value.
        if (row.address) return <TheirAddressLines address={row.address} />;
        return skill && row.field === skill ? skillText(row.value, labelFor(row.value)) : theirValueText(row);
      },
    };
  }
  const status = statusLine(online.status);
  const placedInCircles = props.personCard?.how === "placement" && displayPlacements(props.personCard.placements).length > 0;
  return (
    <OneCardProvider view={view}>
      <div className="flex flex-col gap-4" data-testid="one-card" data-online-status={online.status}>
        {status ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p role={status.alert ? "alert" : "status"} aria-live="polite" className={`m-0 min-w-0 flex-1 basis-56 text-[13px] ${status.alert ? "text-[color-mix(in_srgb,var(--warn)_55%,var(--ink))]" : "text-[var(--ink-soft)]"}`} data-testid="one-card-status">
              {status.text}
            </p>
            {online.status === "busy" || online.status === "unavailable" ? (
              // Try again, kept on the one card: it reads the card again; during a 429's wait it is disabled
              // (the controller says when the wait is over).
              <button
                type="button"
                className="inline-flex min-h-[36px] pointer-coarse:min-h-[44px] items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
                disabled={online.status === "busy" && Date.now() < online.retryAt}
                onClick={() => void controller.load(true)}
                data-testid="one-card-retry"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {theirState.state === "reading" || theirState.state === "failed" ? (
          // Only while their address is being read or the read failed. Never a claim that there is no address.
          <p role="status" aria-live="polite" className="m-0 text-[13px] text-[var(--ink-soft)]" data-testid="their-address-status">
            {theirState.state === "reading" ? READING_THEIR_ADDRESS : THEIR_ADDRESS_FAILED}
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-[13px] text-[var(--warn)]" data-testid="one-card-error">
            {state.error}
          </p>
        ) : null}
        {/* No legend; the shade and the chain link on a row of theirs say it. */}
        {props.recordUri ? <PublishTheirPlaces recordUri={props.recordUri} groups={places} /> : null}
        {children}
        <OneCardFoot canUnlink={canWrite} busy={state.busy?.act === "unlink"} placed={placedInCircles} onUnlink={() => void controller.unlink()} />
      </div>
    </OneCardProvider>
  );
}

/** The one card's view with one source (no online card): the holder's own rows placed in the card's groups, no marks. */
function unlinkedView(card: ReturnType<typeof oneCardOf>, props: OneCardBodyProps): OneCardView {
  const placed = placeOneCard(card, props.groupOf, props.skip, props.order);
  return { marks: card.marks, byKind: placed.byKind, own: placed.own, rowLabel: () => null, valueText: (row: OneCardRow) => languageUsedText(row) ?? row.value };
}

/** The groups of their card that the card draws nowhere else (a field of theirs the person card has no group for), each a group of its own. */
export function OneCardOwnGroups({ labelFor }: { labelFor: (predicate: string) => string }) {
  const view = useOneCard();
  if (!view) return null;
  return (
    <>
      {view.own.map((kind) => {
        const g = view.byKind.get(kind)!.groups[0]!;
        const title = g.label ?? (labelFor(g.field) || g.field.replace(/^[a-z]+:/, ""));
        return (
          <CardGroup key={kind} kind={kind} title={title} icon="record" empty addable={false}>
            {null}
          </CardGroup>
        );
      })}
    </>
  );
}
