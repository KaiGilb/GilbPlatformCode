// The state of a record's addresses on a card, and the acts that save, change and remove one. Taken from GilbApp `src/lib/mynet/place/usePlaceClaims.ts`
// (commit in the README), which was copied from MyNet's. The contract is MyNet's: `save`, `amend` and `remove` resolve TRUE (or the new address's id) only when the
// store's READ-BACK proves it (`factsSurvived`, id gone), and a failed read is said, never shown as "no addresses". The changes are named in the README under
// "Changes from GilbApp" and each is marked `CHANGED` below.
//
// WHO and WHERE: the caller names the vault that HOLDS the person's record, the subject (the record's entity IRI) and the signed-in principal (the `a:directReader`
// at mint). The READ is one read of the vault's address set, held in React Query under ONE key per vault (`placeClaimsKey`) and SHARED by every person card in
// it, then narrowed to this record (`claimsAbout`). A load uses a held read up to `PLACE_CLAIMS_STALE_MS` old; every read-back after a write is FRESH.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PLACE_CLAIMS_STALE_MS,
  PLACE_TEXT_SLOTS,
  SHARED_ADDRESS_MESSAGE,
  SharedAddressError,
  claimFieldText,
  claimsAbout,
  placeClaimsKey,
  readPlaceClaimsInVault,
  type PlaceClaim,
  type PlaceClaimInput,
  type PlaceClaimsRead,
} from "@kaigilb/gilbplatformcode-place-claims";
import { claimPlaceIds } from "@kaigilb/gilbplatformcode-place-lines";
import { boundPlaceIds } from "@kaigilb/gilbplatformcode-place-lines";
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import {
  GeoWriteRefusedError,
  PlaceClaimPartialError,
  PlaceClaimRefusal,
  createPlaceClaim,
  removePlaceClaim,
  updatePlaceClaim,
} from "@kaigilb/gilbplatformcode-place-claim-write";

// ── CHANGED (F3, F15): every sentence a person may read from this hook is FIXED. No status, no server text, no term path, no address. The detail goes to the log. ──
/** The addresses are stored in a vault that is not known here (F1): nothing was read, and that is not "none". */
export const NO_VAULT_SAYS = "Addresses are stored in a vault that is not known here, so they are not shown. This is not a statement that there are none.";
export const READ_FAILED_SAYS = "The addresses could not be read right now. This is not a statement that there are none.";
/** Said beside the addresses that WERE read, when the read was not the whole vault (F4). */
export const INCOMPLETE_SAYS = "Not every address in this vault was read.";
export const NOT_SIGNED_IN_SAVE_SAYS = "Not signed in to a vault, so there is nowhere to store this address.";
export const NOT_SIGNED_IN_CHANGE_SAYS = "Not signed in to a vault, so there is nowhere to store this change.";
export const NOT_SIGNED_IN_REMOVE_SAYS = "Not signed in to a vault, so there is nothing to remove from.";
export const SAVE_FAILED_SAYS = "This address could not be saved right now.";
export const PARTIAL_SAVE_SAYS = "The address was saved, but one of its details was not.";
export const CHANGE_FAILED_SAYS = "This change could not be saved right now.";
export const REMOVE_FAILED_SAYS = "This address could not be removed right now.";
export const CATALOGUE_READ_ONLY_SAYS = "The place catalogue is read only, so nothing can be written to it.";
export const ORIGIN_UNKNOWN_SAYS = "Addresses cannot be saved here: the place catalogue is not known.";
export const VOCAB_DOWN_SAYS = "Addresses cannot be read or written right now, because the ontology did not answer.";
export const SAVE_NOT_CONFIRMED_SAYS = "Saved, but the addresses could not be read back, so this is not confirmed. Your address is still here — try again.";
export const SAVE_NOT_KEPT_SAYS = "The store accepted this address but did not keep it, so it is not saved. Your address is still here — try again.";
export const CHANGE_NOT_CONFIRMED_SAYS = "Changed, but the addresses could not be read back, so this is not confirmed. Your change is still here — try again.";
export const CHANGE_NOT_KEPT_SAYS = "The store accepted this change but did not keep it, so it is not saved. Your change is still here — try again.";
export const REMOVE_NOT_CONFIRMED_SAYS = "Removed, but the addresses could not be read back, so this is not confirmed. The address may still be there — try again.";
export const REMOVE_NOT_DONE_SAYS = "The store accepted this removal but did not carry it out, so the address is still there. Try again.";

/**
 * CHANGED (new, for F1/F2/F4): what the hook knows, as a state a view can tell apart. GilbApp had `claims: []`, `loading` and `error` only, so "no vault", "not read
 * yet" and "read, and none" all drew the same way.
 *  - `no-vault`: the vault that holds the record is not known (`vaultId` absent): NOTHING was read. `claims` is `[]` and that means "unknown", not "none".
 *  - `reading`: the first read has not answered. `claims` is `[]` and that means "not yet".
 *  - `failed`: the read failed; `error` says so ({@link READ_FAILED_SAYS}). `claims` are the last that were read, if any.
 *  - `incomplete`: the read answered but was not the whole vault (`reason`: `capped` or `stalled`); `claims` are what was read. Say {@link INCOMPLETE_SAYS}.
 *  - `ready`: the whole vault was read; `claims` are this record's addresses and `[]` means there are none.
 */
export type PlaceClaimsStatus = "no-vault" | "reading" | "failed" | "incomplete" | "ready";

export interface PlaceClaimsState {
  status: PlaceClaimsStatus;
  claims: PlaceClaim[];
  /** Why the read was not whole, when `status` is `incomplete`. */
  reason: "capped" | "stalled" | null;
  /** True while the first read (or a fresh one) is in flight. */
  loading: boolean;
  /** True while a write and its read-back are in flight. */
  busy: boolean;
  /** A fixed sentence about the last read or write that did not work, or null. */
  error: string | null;
  /** Mint one address. Resolves the new address's id only when the read-back proves it was kept; else null. */
  save: (input: PlaceClaimInput) => Promise<string | null>;
  /** Change one address. Resolves true only when the read-back proves it. */
  amend: (claim: PlaceClaim, input: PlaceClaimInput) => Promise<boolean>;
  /** Remove one address. Resolves true only when the read-back proves it is gone. */
  remove: (claim: PlaceClaim) => Promise<boolean>;
  /** The master's own labels for the address-line terms, once the vocabulary has been read. */
  fieldLabels: Readonly<Record<string, string>>;
}

/**
 * 🔴 DID THE FACTS SURVIVE, not just the row? Compares what the write composed with what the read-back carries: the label, EVERY free-text line the write NAMED (street,
 * Address 1, Address 2, Postal Code), and the bound places. `visibilityTier` is excluded on purpose (GilbApp writes none).
 * CHANGED (surprise 12): GilbApp's comment said "the label, the street line and the bound places"; its code also compared Address 1, Address 2 and the Postal Code. The comment
 * now says what the code does.
 */
export function factsSurvived(kept: PlaceClaim, input: PlaceClaimInput): boolean {
  if (kept.label.trim() !== input.label.trim()) return false;
  // 🔴 READ THROUGH THE DERIVED ACCESSORS, ⛔ never off the composite. After the address was decomposed the street and the places live on their own FIELD
  //    entities, so comparing `kept.streetLine` would compare `""` against what the person typed and report every good save as "did not keep it".
  // ⚠ EVERY free-text field, from the one table — a line the store did not keep is a save that did not happen, exactly as a street is.
  for (const { term } of PLACE_TEXT_SLOTS) {
    const want = input[term];
    if (want === undefined) continue; // not named by this write ⇒ not part of what it composed
    if (claimFieldText(kept, term).trim() !== want.trim()) return false;
  }
  const want = new Set(boundPlaceIds(input.place));
  const got = new Set(claimPlaceIds(kept));
  if (want.size !== got.size) return false;
  for (const id of want) if (!got.has(id)) return false;
  return true;
}

/** What a failed write is told to the person as: a fixed sentence by KIND of failure, never the failure's own text. The detail goes to the log. */
function sentenceFor(e: unknown, fallback: string): string {
  console.error(e);
  if (e instanceof GeoWriteRefusedError) return e.reason === "origin-unknown" ? ORIGIN_UNKNOWN_SAYS : CATALOGUE_READ_ONLY_SAYS;
  if (e instanceof SharedAddressError) return SHARED_ADDRESS_MESSAGE;
  if (e instanceof PlaceClaimRefusal) return e.sentence;
  if (e instanceof PlaceClaimPartialError) return PARTIAL_SAVE_SAYS;
  if (e instanceof Error && e.name === "PlaceVocabUnavailableError") return VOCAB_DOWN_SAYS;
  return fallback;
}

export function usePlaceClaims(
  /** The vault that HOLDS the person's record. */
  vaultId: string | null | undefined,
  /** The record's entity IRI: every address's `a:claimSubject`. */
  subject: string,
  /** The signed-in principal, granted read on each entity at mint. */
  principal?: string | null,
): PlaceClaimsState {
  const qc = useQueryClient();
  const [claims, setClaims] = useState<PlaceClaim[]>([]);
  const [status, setStatus] = useState<PlaceClaimsStatus>(vaultId ? "reading" : "no-vault");
  const [reason, setReason] = useState<"capped" | "stalled" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldLabels, setFieldLabels] = useState<Readonly<Record<string, string>>>({});
  const session = principal ? { principal } : undefined;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Read the vault's addresses (held up to the freshness, or FRESH) and narrow them to this record. Resolves what was read, or null when the read failed. */
  const reload = useCallback(
    async (fresh = true): Promise<{ claims: PlaceClaim[]; complete: boolean } | null> => {
      if (!vaultId) return null;
      setStatus((s) => (s === "ready" || s === "incomplete" ? s : "reading"));
      try {
        // ONE shape under the key: the whole `PlaceClaimsRead`, so the one card's merge reads through it.
        const all = await qc.fetchQuery<PlaceClaimsRead>({
          queryKey: placeClaimsKey(vaultId),
          queryFn: () => readPlaceClaimsInVault(vaultId),
          staleTime: fresh ? 0 : PLACE_CLAIMS_STALE_MS,
        });
        const rows = claimsAbout(all.claims, subject);
        if (alive.current) {
          setClaims(rows);
          setReason(all.complete ? null : all.reason);
          setStatus(all.complete ? "ready" : "incomplete");
          setError(null);
        }
        // The labels are an extra: their failure changes nothing about the addresses.
        void resolvePlaceVocab()
          .then((v) => alive.current && setFieldLabels(v.termLabels ?? {}))
          .catch(() => undefined);
        return { claims: rows, complete: all.complete };
      } catch (e) {
        console.error(e);
        if (alive.current) {
          // CHANGED (F3): a fixed sentence; GilbApp wrote "Could not read the addresses: <the error's own text>".
          setError(e instanceof Error && e.name === "PlaceVocabUnavailableError" ? VOCAB_DOWN_SAYS : READ_FAILED_SAYS);
          setStatus("failed");
        }
        return null;
      } finally {
        // CHANGED (0.1.1): a fresh read is the read-back of a write. The queries held UNDER the shared key (the one card's observer of the holder's addresses, whose key starts
        // with it) are now out of date: mark them so, so a linked card's merge never says "You have the same on your card" from the answer before the write. The shared
        // key itself is excluded: it was just read.
        if (fresh) {
          const base = placeClaimsKey(vaultId);
          void qc.invalidateQueries({ queryKey: base, predicate: (q) => q.queryKey.length > base.length });
        }
      }
    },
    [vaultId, subject, qc],
  );

  useEffect(() => {
    if (!vaultId) {
      // CHANGED (F1): not read, and SAID: `no-vault`, never `ready` with nothing in it.
      setStatus("no-vault");
      setClaims([]);
      setReason(null);
      return;
    }
    setStatus("reading");
    void reload(false);
  }, [reload, vaultId]);

  /**
   * 🔴 RETURNS WHETHER THE STORE KEPT THE CLAIM — proved by READING IT BACK BY ID. The id is returned only when the read-back carried the id the write returned, so the
   * caller never has to guess which address is new. Anything else is `null`, and the person keeps their form and their typing.
   */
  const save = useCallback(
    async (input: PlaceClaimInput): Promise<string | null> => {
      if (!vaultId) {
        setError(NOT_SIGNED_IN_SAVE_SAYS);
        return null;
      }
      setBusy(true);
      try {
        const written = await createPlaceClaim(vaultId, subject, input, session?.principal);
        setError(null);
        const rows = await reload();
        if (rows === null) {
          setError(SAVE_NOT_CONFIRMED_SAYS);
          return null;
        }
        const mine = rows.claims.find((c) => c.id === written.id || c.uri === written.uri);
        // The read was not the whole vault and does not hold the address: it may be past what was read. Not proven, so not claimed.
        if (mine === undefined && !rows.complete) {
          setError(SAVE_NOT_CONFIRMED_SAYS);
          return null;
        }
        if (!(mine !== undefined && factsSurvived(mine, input))) {
          setError(SAVE_NOT_KEPT_SAYS);
          return null;
        }
        return mine.id;
      } catch (e) {
        const said = sentenceFor(e, SAVE_FAILED_SAYS);
        // CHANGED (decision 12): the address WAS made when one of its details failed. Show it (a fresh read), and say so (the read clears the error, so it is set after);
        // the form is kept (null).
        if (e instanceof PlaceClaimPartialError) await reload();
        setError(said);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [vaultId, subject, reload, session?.principal],
  );

  /** The same read-back for a change: TRUE only when the address is still there carrying what was written. Same three outcomes, same "your typing survives" promise. */
  const amend = useCallback(
    async (claim: PlaceClaim, input: PlaceClaimInput): Promise<boolean> => {
      if (!vaultId) {
        setError(NOT_SIGNED_IN_CHANGE_SAYS);
        return false;
      }
      setBusy(true);
      try {
        await updatePlaceClaim(vaultId, claim, subject, input, session?.principal);
        setError(null);
        const rows = await reload();
        if (rows === null) {
          setError(CHANGE_NOT_CONFIRMED_SAYS);
          return false;
        }
        const mine = rows.claims.find((c) => c.id === claim.id);
        if (mine === undefined && !rows.complete) {
          setError(CHANGE_NOT_CONFIRMED_SAYS);
          return false;
        }
        if (!mine || !factsSurvived(mine, input)) {
          setError(CHANGE_NOT_KEPT_SAYS);
          return false;
        }
        return true;
      } catch (e) {
        setError(sentenceFor(e, CHANGE_FAILED_SAYS));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [vaultId, subject, reload, session?.principal],
  );

  /** TRUE only when the address is gone on the read-back. */
  const remove = useCallback(
    async (claim: PlaceClaim): Promise<boolean> => {
      if (!vaultId) {
        setError(NOT_SIGNED_IN_REMOVE_SAYS);
        return false;
      }
      setBusy(true);
      try {
        await removePlaceClaim(vaultId, claim, subject);
        setError(null);
        const rows = await reload();
        if (rows === null) {
          setError(REMOVE_NOT_CONFIRMED_SAYS);
          return false;
        }
        if (rows.claims.some((c) => c.id === claim.id)) {
          setError(REMOVE_NOT_DONE_SAYS);
          return false;
        }
        // A read that was not the whole vault cannot show that the address is gone from it.
        if (!rows.complete) {
          setError(REMOVE_NOT_CONFIRMED_SAYS);
          return false;
        }
        return true;
      } catch (e) {
        setError(sentenceFor(e, REMOVE_FAILED_SAYS));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [vaultId, reload, subject],
  );

  return { status, claims, reason, loading: status === "reading", busy, error, save, amend, remove, fieldLabels };
}
