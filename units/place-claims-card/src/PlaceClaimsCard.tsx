// The Address group of a card: the list of a person's addresses, the add form, and what is said when the addresses were not all read.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` lines 496-969 (commit in the README). Changes are marked CHANGED.
//
// Each address is its own `t:PlaceClaim` in the vault that holds the person's record; this card does not write them: the caller's `onSave`, `onAmend`
// and `onRemove` do, and answer whether the store kept the change. The add form has no Save button: an address saves as the person chooses a place (or
// presses Enter in a text box, or leaves the form), as every other entry on a card saves.
import { useEffect, useRef, useState } from "react";
import { AddYourOwnButton } from "@kaigilb/gilbplatformcode-add-your-own";
import { AddressLineRows, AddressTextRow, SavedAddress } from "@kaigilb/gilbplatformcode-address-card-parts";
import { Button } from "@kaigilb/gilbplatformcode-button";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import type { GeoRung } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { useAddInPlace, useFoldedClaims } from "@kaigilb/gilbplatformcode-one-card-context";
import { placeClaimHasContent, type PlaceClaim } from "@kaigilb/gilbplatformcode-place-claims";
import { clearFinerOnCountryChange, clearRung } from "@kaigilb/gilbplatformcode-place-clear";
import {
  applyCarried,
  cascadeFrom,
  draftChangedSince,
  draftToInput,
  emptyDraft,
  type CarriedDraft,
  type PlaceClaimDraft,
  type PlaceSaveOutcome,
} from "@kaigilb/gilbplatformcode-place-draft";
import { PlacePicker, RUNG_LABEL } from "@kaigilb/gilbplatformcode-place-picker";

/** Suggestions for the Location box, not a value set: a datalist does not constrain what is typed. */
export const LABEL_SUGGESTIONS = ["home", "work", "home2", "cabin"] as const;

/** CHANGED (F1): said when the vault that holds the record is not known, so no address was asked for. */
export const NO_VAULT_NOTE = "Addresses are stored in a vault that is not known here, so they are not shown. This is not a statement that there are none.";
/** CHANGED (F2): said while the first read has not answered. */
export const READING_NOTE = "Reading addresses…";
/** CHANGED (F4): said when the read stopped before the end of the vault's addresses. `capped`: it reached its page limit; `stalled`: the door would not go on. */
export function incompleteNote(reason: "capped" | "stalled" | null | undefined, vaultName: string | null | undefined): string {
  const where = vaultName?.trim() ? vaultName.trim() : "this vault";
  return reason === "stalled" ? `Not every address in ${where} could be read: the read could not go on.` : `Not every address in ${where} was read.`;
}
/** CHANGED (F3): the failed read, when the caller gave no sentence of its own. */
export const READ_FAILED_NOTE = "The addresses could not be read right now. This is not a statement that there are none.";

/** CHANGED (new): what the read of the addresses came to, as `use-place-claims` tells it. Absent: the read is taken as done (GilbApp's card had no such state). */
export interface AddressReadState {
  readonly status: "no-vault" | "reading" | "failed" | "incomplete" | "ready";
  readonly reason?: "capped" | "stalled" | null;
  /** The name of the vault that holds the record, for the incomplete sentence. */
  readonly vaultName?: string | null;
}

export interface PlaceClaimsCardProps {
  /** The section's title: the address term's label, from the master. */
  title: string;
  /** A plain-text address the record already holds (the term's literal value), shown as it is stored. Empty for none. */
  legacyText?: string;
  claims: readonly PlaceClaim[];
  busy?: boolean;
  error?: string | null;
  /** CHANGED (new): what the read of the addresses came to; see {@link AddressReadState}. */
  readState?: AddressReadState;
  /** CHANGED (new): false withholds every way to add an address (the group's "Add" and "+ Add your own"). Default true. */
  canAdd?: boolean;
  /**
   * Returns whether the store confirmed the save. Anything other than a string (the new address's id) or `true` is treated as not confirmed and the
   * form stays open with what the person typed still in it. `true` means "confirmed, but no id": the card then puts back only what was typed since the
   * save began.
   */
  onSave: (draft: PlaceClaimDraft) => PlaceSaveOutcome | Promise<PlaceSaveOutcome>;
  /** Corrects a stored address in place. True only when the store kept the change. */
  onAmend: (claim: PlaceClaim, draft: PlaceClaimDraft) => boolean | Promise<boolean>;
  /** Whether the store carried the removal out. */
  onRemove: (claim: PlaceClaim) => boolean | Promise<boolean>;
  /** The card's edit mode: the page's, not one this card invents. It decides whether the (-) exists at all. False is read-only. */
  editMode: boolean;
  /** The master's label for each address-line term. Until it arrives each line shows its term name in words. */
  fieldLabels?: Readonly<Record<string, string>>;
  /** The holder may add an address here. On the one card, while it is presented, the group then offers "+ Add your own", which opens this card's own add form in the group. */
  addInPlace?: boolean;
}

export function PlaceClaimsCard({
  title,
  legacyText = "",
  claims,
  busy = false,
  error = null,
  readState,
  canAdd = true,
  editMode: editModeProp,
  fieldLabels,
  onSave,
  onAmend,
  onRemove,
  addInPlace = false,
}: PlaceClaimsCardProps) {
  const cardMode = useCardMode();
  const editMode = editModeProp && !(cardMode.managed && cardMode.presentation);
  const [draft, setDraft] = useState<PlaceClaimDraft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  // "+ Add your own" is drawn only on the one card, while it is presented and the record may be written.
  const inPlace = useAddInPlace(addInPlace) && canAdd;
  // The addresses of mine the merge folded into a row of theirs ("You have the same on your card") are not drawn twice while the card is presented.
  const folded = useFoldedClaims("address");
  const shownClaims = cardMode.managed && cardMode.presentation ? claims.filter((c) => !folded.has(c.uri)) : claims;
  const formOpen = adding && (editMode || inPlace);
  const addOwnRef = useRef<HTMLButtonElement | null>(null);
  // Set when the add form was opened by "+ Add your own": Esc closes it, and the focus goes back to the button.
  const openedInPlace = useRef(false);
  useEffect(() => {
    if (adding || !openedInPlace.current) return;
    openedInPlace.current = false;
    addOwnRef.current?.focus();
  }, [adding]);

  // The two faces of one fact: a pick that landed at another rung is said on the chip it landed in and in the box the person used.
  const div = draft.divergence;
  const foundInBoxLabel = (r: GeoRung) => (div && div.rung === r ? RUNG_LABEL[div.boxRung] : null);
  const landedElsewhere = (r: GeoRung) => (div && div.boxRung === r ? { label: div.label, rungLabel: RUNG_LABEL[div.rung] } : null);

  const complete = placeClaimHasContent(draftToInput(draft));

  // Auto-save on a selection. `minting` stops a second save while the first is in flight.
  const minting = useRef(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  // Close was pressed while the first save was in flight: its outcome is then applied to a form that is gone.
  const closedDuringSave = useRef(false);
  const closePressed = useRef(false);
  // The person closed the form while a save was in flight and that save could not be confirmed. Said, because the address may be stored.
  const [closedUnconfirmed, setClosedUnconfirmed] = useState<{ error: string | null | undefined } | null>(null);
  useEffect(() => {
    if (!closedUnconfirmed) return;
    if (closedUnconfirmed.error === undefined) setClosedUnconfirmed({ error });
    else if (error !== closedUnconfirmed.error) setClosedUnconfirmed(null);
  }, [closedUnconfirmed, error]);

  // What the person typed while the first save was in flight: handed to the saved address once it exists, never to a guessed one.
  const [carry, setCarry] = useState<(CarriedDraft & { target: string | null }) | null>(null);
  const carryTarget = carry && carry.target !== null && claims.some((c) => c.id === carry.target) ? carry.target : null;
  const [confirmedSave, setConfirmedSave] = useState<{ target: string | null; sent: PlaceClaimDraft } | null>(null);
  useEffect(() => {
    if (!confirmedSave) return;
    setConfirmedSave(null);
    if (closedDuringSave.current) {
      closedDuringSave.current = false;
      return;
    }
    if (draftChangedSince(draft, confirmedSave.sent)) setCarry({ ...confirmedSave, latest: draft });
    setCarryReturned(false);
    setAdding(false);
    setDraft(emptyDraft());
  }, [confirmedSave]); // eslint-disable-line react-hooks/exhaustive-deps
  // The address the carried typing belongs to never appeared in the read: the typing is put back in the add form, and said.
  const [carryReturned, setCarryReturned] = useState(false);
  useEffect(() => {
    if (!carry || carryTarget !== null) return;
    setCarry(null);
    setDraft(applyCarried(emptyDraft(), carry));
    closing.current = false;
    setAdding(true);
    setCarryReturned(true);
  }, [carry, carryTarget]);

  const commit = (next: PlaceClaimDraft) => {
    if (!placeClaimHasContent(draftToInput(next)) || busy || minting.current) return;
    minting.current = true;
    closedDuringSave.current = false;
    void (async () => {
      let outcome: PlaceSaveOutcome = null;
      try {
        outcome = await onSave(next);
      } catch {
        outcome = null;
      }
      minting.current = false;
      const target = typeof outcome === "string" && outcome !== "" ? outcome : null;
      if (target !== null || outcome === true) setConfirmedSave({ target, sent: next });
      else if (closedDuringSave.current) {
        closedDuringSave.current = false;
        setClosedUnconfirmed({ error: undefined });
      }
    })();
  };

  // Leaving the whole form (not moving between its parts, not choosing a row of its lists) commits it.
  const leaveForm = (e: React.FocusEvent<HTMLDivElement>) => {
    if (closing.current) return;
    if (closePressed.current) return;
    const to = e.relatedTarget;
    if (to instanceof Node && formRef.current?.contains(to)) return;
    if (to instanceof Element && to.closest('[role="listbox"]')) return;
    commit(draft);
  };

  // Close writes nothing more. If the first save is in flight, its outcome is not applied to the form that is gone.
  const closeForm = () => {
    closing.current = true;
    closePressed.current = false;
    if (minting.current) closedDuringSave.current = true;
    setCarryReturned(false);
    setDraft(emptyDraft());
    setAdding(false);
  };

  // CHANGED (F1-F4): the group is never hidden while the read has not answered, or did not answer, or was not whole.
  const status = readState?.status ?? "ready";
  const notReadAsEmpty = status !== "ready";
  const showAddButton = canAdd && (editMode || formOpen);

  return (
    <CardGroup
      kind="address"
      testId="address-rows"
      title={title}
      icon="address"
      empty={shownClaims.length === 0 && !legacyText.trim() && !error && !closedUnconfirmed && !formOpen && !notReadAsEmpty}
      addOwn={
        inPlace && !adding ? (
          <AddYourOwnButton
            noun={title.toLowerCase()}
            buttonRef={addOwnRef}
            onPress={() => {
              openedInPlace.current = true;
              closing.current = false;
              closePressed.current = false;
              setClosedUnconfirmed(null);
              setDraft(emptyDraft());
              setAdding(true);
            }}
          />
        ) : null
      }
    >
      {/* A plain-text address the record already holds, shown as it is stored: never dropped, never rewritten. */}
      {legacyText.trim() ? (
        <div className="py-1.5" data-testid="postal-address-legacy">
          <p className="whitespace-pre-wrap break-words text-[15px] text-[var(--ink)]">{legacyText}</p>
        </div>
      ) : null}

      {/* CHANGED (F1-F4): what the read came to, in words. */}
      {status === "no-vault" ? (
        <p className="text-xs text-[var(--ink-faint)]" role="status" data-testid="place-claims-no-vault">
          {NO_VAULT_NOTE}
        </p>
      ) : status === "reading" && claims.length === 0 ? (
        <p className="text-xs text-[var(--ink-faint)]" aria-live="polite" data-testid="place-claims-reading">
          {READING_NOTE}
        </p>
      ) : status === "incomplete" ? (
        <p className="text-xs text-[var(--ink-faint)]" role="status" data-testid="place-claims-incomplete">
          {incompleteNote(readState?.reason, readState?.vaultName)}
        </p>
      ) : status === "failed" && !error ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="place-claims-error">
          {READ_FAILED_NOTE}
        </p>
      ) : null}

      {/* The error lives at section level, not inside the add form, so it survives the click that closes the form, and a failed read. */}
      {closedUnconfirmed ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="place-closed-unconfirmed">
          You closed the form while this address was saving, and the save could not be confirmed. It may be stored even though it is not shown here, so do not
          type it again yet: reload the page to see whether it was saved.
        </p>
      ) : error ? (
        <p className="text-xs text-[var(--bad)]" role="alert" data-testid="place-claims-error">
          {error}
        </p>
      ) : null}

      {/* Each address is its own framed block, headed by its Location, with a clear gap between blocks. */}
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-[var(--line)]" data-testid="place-claims-list">
        {shownClaims.map((c) => (
          <SavedAddress
            key={c.id}
            claim={c}
            busy={busy}
            editMode={editMode}
            fieldLabels={fieldLabels}
            onAmend={onAmend}
            onRemove={() => void onRemove(c)}
            carried={c.id === carryTarget ? carry ?? undefined : undefined}
            onCarried={() => setCarry(null)}
          />
        ))}
      </div>

      {!showAddButton ? null : !adding ? (
        <button
          type="button"
          data-testid="address-add"
          data-card-add=""
          className="mt-1 flex min-h-11 items-center gap-2 self-start text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          onClick={() => {
            closing.current = false;
            closePressed.current = false;
            setClosedUnconfirmed(null);
            setDraft(emptyDraft());
            setAdding(true);
          }}
        >
          <span aria-hidden="true" className="text-[18px] text-[var(--good,#3a8a3a)]">⊕</span> Add {title}
        </button>
      ) : (
        <div
          ref={formRef}
          className="flex flex-col gap-3 rounded-2xl border border-[var(--line-2)] p-3"
          onBlur={leaveForm}
          // Opened by "+ Add your own": Esc closes the form as Close does (nothing that is not yet saved is written).
          onKeyDown={(e) => {
            if (!openedInPlace.current || e.key !== "Escape" || e.defaultPrevented) return;
            e.preventDefault();
            closeForm();
          }}
          // Focus back in the form: an earlier press on Close was abandoned.
          onFocus={() => {
            closePressed.current = false;
          }}
        >
          {carryReturned ? (
            <p className="text-xs text-[var(--bad)]" role="status" data-testid="place-carry-returned">
              Your address was saved. What you typed while it was saving could not be added to it, so only that is still here, not the parts already saved.
              Leaving this form saves it as a separate address.
            </p>
          ) : null}

          {/* Kai's order: Location / Street.. / City / Region/State / Country. The name used to sit last because auto-save commits at the first nameable
              moment; the amend path (`SavedAddress`) makes a truncated address repairable in place, so the reason for that order is gone. */}
          <AddressTextRow
            id="place-label"
            autoFocus
            label="Location"
            listId="place-label-suggestions"
            value={draft.label}
            placeholder="home, work, cabin — your words"
            onChange={(v) => setDraft((d) => ({ ...d, label: v }))}
            onEnter={() => commit(draft)}
          />
          <datalist id="place-label-suggestions">
            {LABEL_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <AddressTextRow
            id="place-street"
            label="Street.."
            value={draft.streetLine}
            placeholder="Storgata 1"
            hint="Kept on this card in your vault. Local cards are never shared to GilbConnect's public search."
            onChange={(v) => setDraft((d) => ({ ...d, streetLine: v }))}
            onEnter={() => commit(draft)}
          />

          <AddressLineRows idPrefix="place" draft={draft} labels={fieldLabels} onText={(term, v) => setDraft((d) => ({ ...d, [term]: v }))} onEnter={() => commit(draft)} />

          <PlacePicker
            rung="city"
            label="City"
            value={draft.place.city}
            filledByCascade={draft.cascaded.city}
            foundInBoxLabel={foundInBoxLabel("city")}
            pickLandedElsewhere={landedElsewhere("city")}
            restrictToCountryId={draft.place.country?.id ?? null}
            onPick={async (p) => {
              const next = await cascadeFrom(draft, p, "city");
              setDraft(next);
              commit(next); // a selection: auto-save
            }}
            onClear={() => setDraft((d) => clearRung(d, "city"))}
          />

          <PlacePicker
            rung="region"
            label="Region/State"
            value={draft.place.region}
            filledByCascade={draft.cascaded.region}
            foundInBoxLabel={foundInBoxLabel("region")}
            pickLandedElsewhere={landedElsewhere("region")}
            restrictToCountryId={draft.place.country?.id ?? null}
            onPick={async (p) => {
              const next = await cascadeFrom(draft, p, "region");
              setDraft(next);
              commit(next); // a selection: auto-save
            }}
            onClear={() => setDraft((d) => clearRung(d, "region"))}
          />

          <PlacePicker
            rung="country"
            label="Country"
            value={draft.place.country}
            filledByCascade={draft.cascaded.country}
            foundInBoxLabel={foundInBoxLabel("country")}
            pickLandedElsewhere={landedElsewhere("country")}
            // The promise is returned, not swallowed: the picker keeps the box open with the reason on screen if the cascade cannot reach the catalogue.
            onPick={async (p) => {
              // Choosing a country narrows the city lookup, so a city from the old country is cleared before the cascade runs.
              const cleared = clearFinerOnCountryChange(draft);
              const next = await cascadeFrom(cleared, p, "country");
              setDraft(next);
              commit(next); // a selection: auto-save
            }}
            onClear={() => setDraft((d) => clearRung(d, "country"))}
          />

          {/* The rule is stated once there is something to state it about, and not before. */}
          {complete ? (
            <p className="text-[11px] text-[var(--ink-faint)]" data-testid="place-autosave-hint">
              Saved automatically as you choose.
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              aria-label="Close"
              data-testid="place-add-close"
              // Pressing Close must not blur the form into a commit: the press is marked before the focus moves.
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={() => {
                closePressed.current = true;
              }}
              onPointerCancel={() => {
                closePressed.current = false;
              }}
              onClick={closeForm}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </CardGroup>
  );
}
