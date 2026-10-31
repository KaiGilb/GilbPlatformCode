// One stored address on a card, amendable in place: compact lines until it is tapped, then the same controls a new address uses.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` (commit in the README). Changes are marked CHANGED.
import { useEffect, useRef, useState } from "react";
import { Button } from "@kaigilb/gilbplatformcode-button";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import {
  resolveGeoGrains,
  type GeoAncestry,
  type GeoGrainMap,
  type GeoPlace,
  type GeoRung,
} from "@kaigilb/gilbplatformcode-geo-catalogue";
import {
  EMPTY_ADDRESS_MESSAGE,
  claimFieldText,
  placeClaimHasContent,
  placeClaimHeading,
  type PlaceClaim,
  type PlaceTextTerm,
} from "@kaigilb/gilbplatformcode-place-claims";
import { clearRung } from "@kaigilb/gilbplatformcode-place-clear";
import {
  applyCarried,
  cascadeFrom,
  draftToInput,
  snapshotOf,
  type CarriedDraft,
  type FieldSnapshot,
  type PlaceClaimDraft,
} from "@kaigilb/gilbplatformcode-place-draft";
import { claimPlaceIds, claimStreetLine } from "@kaigilb/gilbplatformcode-place-lines";
import { usePlaceNames } from "@kaigilb/gilbplatformcode-place-names";
import { PlacePicker } from "@kaigilb/gilbplatformcode-place-picker";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { LINE_SLOTS, compactLines } from "./addressLines";
import { AddressLineRows, AddressTextRow } from "./AddressTextRows";
import { BoundPlaceLine } from "./BoundPlaceLine";
import { CompactAddress } from "./CompactAddress";

/** CHANGED (F5): said when a detail of the address is kept out of it (it names someone else, or its subjects could not be read). */
export function hiddenFieldsSentence(n: number): string {
  return n === 1
    ? "1 detail of this address is not shown (it belongs to someone else or could not be read)"
    : `${n} details of this address are not shown (they belong to someone else or could not be read)`;
}
/** CHANGED (F7): the kinds of place (the catalogue's grains) could not be read, so no place can be sorted into City, Region or Country. */
export const GRAINS_UNREAD_SAYS = "The kinds of place could not be read right now, so this address cannot be changed yet.";
/** CHANGED (F7): a place of the address could not be read. */
export const PLACE_UNREAD_SAYS =
  "One of this address's places cannot be read right now, so it cannot be changed without risking the places it already holds.";
/** CHANGED (F7): a place of the address is no longer in the catalogue. */
export const PLACE_GONE_SAYS =
  "One of this address's places is no longer in the catalogue, so it cannot be changed without risking the places it already holds.";
/** The address holds more places than the three boxes can show. */
export const PLACES_TOO_MANY_SAYS =
  "This address holds more places than this screen can show, so changing it here would drop the ones it cannot show.";
const REMOVE_HINT = " You can still remove it with the (−) at the top of this address.";
/** CHANGED (F15): said when a change fails for a reason the person is not given. The cause goes to `console.error`. */
export const CHANGE_FAILED_FIXED = "That change could not be saved right now.";

type GrainsState = { kind: "pending" } | { kind: "ok"; grains: GeoGrainMap } | { kind: "failed" };

/**
 * A thrown value that carries a sentence fit to be shown as it is (`PlaceClaimRefusal` of `place-claim-write`: a `sentence` string).
 * Recognised by shape, so this unit does not depend on the writer.
 */
function refusalSentence(e: unknown): string | null {
  if (e instanceof Error && e.name === "PlaceClaimRefusal") {
    const s = (e as { sentence?: unknown }).sentence;
    if (typeof s === "string" && s !== "") return s;
  }
  return null;
}

export interface SavedAddressProps {
  claim: PlaceClaim;
  busy: boolean;
  editMode: boolean;
  fieldLabels?: Readonly<Record<string, string>>;
  onAmend: (claim: PlaceClaim, draft: PlaceClaimDraft) => boolean | Promise<boolean>;
  onRemove: () => void;
  /** Typing from the add form that arrived during this address's first save. */
  carried?: CarriedDraft;
  onCarried?: () => void;
}

/**
 * A stored address, amendable in place: it renders the same controls a new one does, and each change commits through `onAmend`. No edit
 * toggle, no second form, no Save button.
 *
 * It fails closed until the places resolve. The amend is a merge patch of every key the writer composes, the places included; committing
 * before the stored places were read would patch them to empty. So no control commits until every stored place has been read, named, and
 * sorted into a rung, and the three boxes can hold what is stored.
 */
export function SavedAddress({ claim, busy, editMode, fieldLabels, onAmend, onRemove, carried, onCarried }: SavedAddressProps) {
  const boundIds = claimPlaceIds(claim);
  const heading = placeClaimHeading(claim);
  const storedStreet = claimStreetLine(claim);
  const storedLine1 = claimFieldText(claim, "addressLine1");
  const storedLine2 = claimFieldText(claim, "addressLine2");
  const storedPostal = claimFieldText(claim, "postalCode");
  const reads = usePlaceNames(boundIds);
  // CHANGED (F7): the grains' failure is its own state; GilbApp set `null` for both "not yet" and "failed", and said a place could not be read.
  const [grainsState, setGrainsState] = useState<GrainsState>({ kind: "pending" });
  useEffect(() => {
    let alive = true;
    void resolveGeoGrains()
      .then((g) => alive && setGrainsState({ kind: "ok", grains: g }))
      .catch(() => alive && setGrainsState({ kind: "failed" }));
    return () => {
      alive = false;
    };
  }, []);
  const grains = grainsState.kind === "ok" ? grainsState.grains : null;
  // CHANGED (F6): the named places, in order. GilbApp's list held only these and the caller was told by its length.
  const places: GeoPlace[] | null = reads === null ? null : reads.flatMap((r) => (r.state === "named" ? [r.place] : []));

  const allDereferenced = reads !== null && grains !== null && places !== null && places.length === boundIds.length;

  // A second, stricter test: the three slots must be able to hold what is stored. `a:memberOf` is not restricted to one row per grain, so a
  // lawful claim can hold two places at one rung, or a place this build cannot classify. The editor buckets into three slots, so amending any
  // field, even the street line, would silently drop the rest.
  const representable =
    allDereferenced &&
    (() => {
      const seen = new Set<GeoRung>();
      for (const p of places!) {
        const rung = grains!.rungOf.get(p.type);
        if (rung === undefined) return false; // a place this build cannot classify
        if (seen.has(rung)) return false; // a second place at a rung the editor has one slot for
        seen.add(rung);
      }
      return true;
    })();

  const resolved = representable;

  const [draft, setDraft] = useState<PlaceClaimDraft | null>(null);

  // A stored address shows every field only while it is being edited, after a tap on it. Otherwise it shows only its filled fields, as compact
  // lines.
  const [open, setOpen] = useState(false);
  const expanded = open;
  const mode = useCardMode();
  const tapToEdit = mode.managed && mode.presentation && mode.canEdit;
  useEffect(() => {
    if (mode.managed && mode.presentation) setOpen(false);
  }, [mode.managed, mode.presentation]);

  // The edit the person made while a save was in flight is never dropped: it is flushed by the effect below the moment the save clears.
  const pendingEdit = useRef<boolean>(false);

  // What the store last said. A field is the person's exactly while its draft value differs from this; otherwise it is the store's. There is no
  // flag to set and none to clear: ownership is derived, never declared, so a call site cannot forget it and it releases itself the moment a
  // save confirms and the store hands the same value back.
  const storeSnapshot = useRef<FieldSnapshot | null>(null);

  useEffect(() => {
    if (!resolved) return;
    const slot: { city: GeoPlace | null; region: GeoPlace | null; country: GeoPlace | null } = { city: null, region: null, country: null };
    for (const p of places!) {
      const rung = grains!.rungOf.get(p.type);
      if (rung && slot[rung] === null) slot[rung] = p;
    }
    const place: GeoAncestry = slot;
    setDraft((prev) => {
      const fromStore: PlaceClaimDraft = {
        label: claim.label,
        streetLine: storedStreet,
        addressLine1: storedLine1,
        addressLine2: storedLine2,
        postalCode: storedPostal,
        place,
        cascaded: { city: false, region: false, country: false },
        divergence: null,
      };
      const snap = snapshotOf(fromStore);
      const was = storeSnapshot.current;
      storeSnapshot.current = snap;
      if (prev === null || was === null) return fromStore;

      // Dirty = the person's value drifted from what the store last said.
      const mine = <K extends keyof FieldSnapshot>(k: K, now: FieldSnapshot[K]) => now !== was[k];
      // Text releases on the trimmed value, never on the raw one: the writer stores the trimmed text, so a trailing space the person typed would
      // otherwise never match the store again and stay theirs for the whole session. Do not "fix" this by trimming as the person types.
      const mineText = (k: "label" | PlaceTextTerm, now: string) => now.trim() !== was[k].trim();

      const keepCity = mine("city", prev.place.city ? prev.place.city.id : null);
      const keepRegion = mine("region", prev.place.region ? prev.place.region.id : null);
      const keepCountry = mine("country", prev.place.country ? prev.place.country.id : null);
      return {
        ...fromStore,
        label: mineText("label", prev.label) ? prev.label : fromStore.label,
        streetLine: mineText("streetLine", prev.streetLine) ? prev.streetLine : fromStore.streetLine,
        addressLine1: mineText("addressLine1", prev.addressLine1) ? prev.addressLine1 : fromStore.addressLine1,
        addressLine2: mineText("addressLine2", prev.addressLine2) ? prev.addressLine2 : fromStore.addressLine2,
        postalCode: mineText("postalCode", prev.postalCode) ? prev.postalCode : fromStore.postalCode,
        place: {
          city: keepCity ? prev.place.city : fromStore.place.city,
          region: keepRegion ? prev.place.region : fromStore.place.region,
          country: keepCountry ? prev.place.country : fromStore.place.country,
        },
        cascaded: keepCity || keepRegion || keepCountry ? prev.cascaded : fromStore.cascaded,
      };
    });
  }, [resolved, claim.id, claim.label, storedStreet, storedLine1, storedLine2, storedPostal, claim.fields, reads, grainsState]); // eslint-disable-line react-hooks/exhaustive-deps

  /** CHANGED (F15): the sentence for a change that failed, or null. A refusal's own sentence is shown as it is; any other cause is not. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSaveFailed = useRef(false);

  async function sendAmend(next: PlaceClaimDraft) {
    setSaveError(null);
    try {
      lastSaveFailed.current = (await onAmend(claim, next)) === false;
    } catch (e) {
      lastSaveFailed.current = true;
      const sentence = refusalSentence(e);
      if (sentence === null) console.error("address change failed", e);
      setSaveError(sentence ?? CHANGE_FAILED_FIXED);
    }
  }

  // Commits only once the places have resolved, and only a draft holding something.
  const commit = (next: PlaceClaimDraft) => {
    setDraft(next);
    if (!resolved) return;
    if (!placeClaimHasContent(draftToInput(next))) {
      setEmptyRefused(true);
      return;
    }
    setEmptyRefused(false);
    if (busy) {
      pendingEdit.current = true;
      return;
    }
    void sendAmend(next);
  };

  // The last change was refused because it would have emptied the address. Shown only while the draft is still empty.
  const [emptyRefused, setEmptyRefused] = useState(false);
  const showEmptyRefused = emptyRefused && draft !== null && !placeClaimHasContent(draftToInput(draft));

  // The add form's carried typing, applied once, after this frame has its stored draft.
  const carriedApplied = useRef(false);
  useEffect(() => {
    if (!carried || carriedApplied.current || !resolved || draft === null) return;
    carriedApplied.current = true;
    onCarried?.();
    commit(applyCarried(draft, carried));
  }, [carried, resolved, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // The draft as of the last committed render: what the flush must send. The reconcile effect and the flush effect run in the same pass, so
  // reading `draft` from the flush's closure would give the value from before the read.
  const latestDraft = useRef<PlaceClaimDraft | null>(null);
  latestDraft.current = draft;

  // Flushes the queued edit once the in-flight save clears, and only after a save that succeeded: after a failed save the stored fields are stale
  // and a flush could mint a field twice. The queued edit is not lost: it is the draft on screen, and the next blur commits it.
  useEffect(() => {
    if (busy || !resolved) return;
    if (!pendingEdit.current) return;
    if (lastSaveFailed.current) {
      pendingEdit.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!pendingEdit.current) return;
      const queued = latestDraft.current;
      if (queued === null) return;
      if (!placeClaimHasContent(draftToInput(queued))) {
        setEmptyRefused(true);
        return;
      }
      pendingEdit.current = false;
      void sendAmend(queued);
    }, 0);
    return () => clearTimeout(t);
  }, [busy, resolved, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Why a stored address cannot be changed, said by cause. CHANGED (F7): GilbApp said one sentence ("One of this address's places cannot be read")
  // for a failed grain read, a failed place read, and a gone place alike.
  const lockedSays = (): string => {
    if (reads === null || grainsState.kind === "pending") return "Looking up this address before it can be changed…";
    if (grainsState.kind === "failed") return GRAINS_UNREAD_SAYS + REMOVE_HINT;
    if (reads.some((r) => r.state === "failed")) return PLACE_UNREAD_SAYS + REMOVE_HINT;
    if (reads.some((r) => r.state === "missing")) return PLACE_GONE_SAYS + REMOVE_HINT;
    return PLACES_TOO_MANY_SAYS + REMOVE_HINT;
  };

  return (
    // Each address is its own frame: one address is one entity, removing it leaves every sibling untouched, and the frame says which street
    // line and which rung belong to which address.
    <article className="flex flex-col gap-2 py-3" data-testid="place-claim">
      <div className="flex items-start gap-2">
        {editMode ? (
          <RemoveControl
            testId="address-remove"
            // Names the address, not "this address": with four frames on screen a screen reader otherwise offers four identically-named buttons.
            label={`Remove address ${heading}`.trim()}
            onClick={onRemove}
            // The one control that keeps its guard: removing an address while a write against that same entity is in flight races the write it
            // deletes. Typing is never destructive; this is.
            disabled={busy}
          />
        ) : null}
        {/* The frame's own name, always drawn: it is the frame's accessible identity, and the heading a person scans. */}
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--ink)]" data-testid="place-claim-label">
          {heading}
        </h3>
      </div>

      {/* CHANGED (F5): a detail that exists and is not drawn is said. */}
      {claim.hiddenFieldCount > 0 ? (
        <p className="text-xs text-[var(--ink-faint)]" data-testid="place-claim-hidden-fields">
          {hiddenFieldsSentence(claim.hiddenFieldCount)}
        </p>
      ) : null}

      {showEmptyRefused ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="place-claim-empty-refused">
          {EMPTY_ADDRESS_MESSAGE}
        </p>
      ) : null}

      {/* CHANGED (F15): a change that failed. */}
      {saveError !== null ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="place-claim-save-error">
          {saveError}
        </p>
      ) : null}

      {draft && !(editMode && expanded) ? (
        <CompactAddress
          heading={heading}
          lines={compactLines(draft)}
          onOpen={editMode ? () => setOpen(true) : tapToEdit ? () => { setOpen(true); mode.enter(); } : undefined}
        />
      ) : draft && editMode ? (
        <>
          {/* The same controls a new address uses, in the same order and the same row. A stored one is not a different kind of thing; a different
              order between the two would re-open the difference. Order: Location / Street.. / City / Region/State / Country. */}
          <AddressTextRow
            id={`name-${claim.id}`}
            label="Location"
            value={draft.label}
            placeholder="home, work, cabin — your words"
            onChange={(v) => setDraft({ ...draft, label: v })}
            onBlur={() => commit(draft)}
          />

          <AddressTextRow
            id={`street-${claim.id}`}
            label="Street.."
            value={draft.streetLine}
            placeholder="Storgata 1"
            onChange={(v) => setDraft({ ...draft, streetLine: v })}
            onBlur={() => commit(draft)}
          />

          <AddressLineRows
            idPrefix={`line-${claim.id}`}
            draft={draft}
            labels={fieldLabels}
            onText={(term, v) => setDraft({ ...draft, [term]: v })}
            onBlur={() => commit(draft)}
          />

          <PlacePicker
            rung="city"
            label="City"
            value={draft.place.city}
            restrictToCountryId={draft.place.country?.id ?? null}
            onPick={async (p) => commit(await cascadeFrom(draft, p, "city"))}
            onClear={() => commit(clearRung(draft, "city"))}
          />

          <PlacePicker
            rung="region"
            label="Region/State"
            value={draft.place.region}
            restrictToCountryId={draft.place.country?.id ?? null}
            onPick={async (p) => commit(await cascadeFrom(draft, p, "region"))}
            onClear={() => commit(clearRung(draft, "region"))}
          />

          <PlacePicker
            rung="country"
            label="Country"
            value={draft.place.country}
            onPick={async (p) => commit(await cascadeFrom({ ...draft, place: { ...draft.place, country: null } }, p, "country"))}
            onClear={() => commit(clearRung(draft, "country"))}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              aria-label={`Done with address ${heading}`.trim()}
              data-testid="place-claim-done"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Until the stored places have been read and sorted, the row is read-only: editable controls would invite a correction that would
              silently drop a place. It shows the derived street and places, which is what is stored. */}
          {storedStreet ? (
            <span className="text-[15px] text-[var(--ink)]" data-testid="place-claim-street">{storedStreet}</span>
          ) : null}
          {LINE_SLOTS.map(({ slot, term }) => {
            const text = claimFieldText(claim, term);
            return text ? (
              <span key={slot} className="text-[15px] text-[var(--ink)]" data-testid={`place-claim-${slot}`}>
                {text}
              </span>
            ) : null;
          })}
          <BoundPlaceLine claim={claim} />
          {/* Three different facts, not one transient-sounding sentence: a place that will not be read never resolves, so "looking up..." would be
              a lasting lie; and a set the three-slot editor cannot represent is a third case, and the dangerous one. Each sentence names where
              the way out is. */}
          {editMode ? (
            <span className="text-[11px] text-[var(--ink-faint)]" aria-live="polite" data-testid="place-claim-locked">
              {lockedSays()}
            </span>
          ) : null}
        </>
      )}
    </article>
  );
}
