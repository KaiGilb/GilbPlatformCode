/**
 * Cycle214 s8 — React binding for a HELD person card's languages (`heldLanguage.ts` holds the rules): the
 * `LanguagesState` the shared Languages card is drawn from, with NO rung (a local card is not shared, so its
 * languages are never found). It is `useHeldNotes`'s shape and ⛔ reuses its pieces:
 *   - the READ is the one per-person read of every held claim (`heldClaimsKey` / `listHeldClaimsAbout`), shared
 *     with the Skills and Interests sections, asked at the vault's own host;
 *   - every act on ONE language (add, flag, remove) runs after the one before it has settled (`runSerial`), and
 *     plans on a FRESH read of this person's claims; after a write ONLY the claim written is read again, and a
 *     write is TRUE only when that read-back carries what was asked;
 *   - the stater is the ADDER's own card (`useAdderCard`, RuleBaseappSourceIsAdder), ⛔ never the holding vault's card. Every language the
 *     platform returns about the person is listed, whoever stated it; only the ones the viewer stated are flagged or removed by them.
 * The contact mark is the record's own `a:contactLanguage` (ONE tag, unchanged): the card gives this hook its
 * stored value and the function that writes it (the person record's own save), so a move of the mark is ONE write
 * and there is never a second mark.
 *
 * Fix round (Agent.Scaling Languages Delta1): ONE ENTRY = ONE ROW (`dedupeHeldLanguages`; a flag acts on every claim
 * for the entry, Remove already took them all), and overlapping acts leave the mark the person last chose
 * (`useMarkIntent`: a removal clears the mark only if the mark is STILL that entry's when the removal finishes).
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdderCard } from "@kaigilb/gilbplatformcode-adder-card";
import { flagChoices } from "@kaigilb/gilbplatformcode-flag-choice";
import {
  addHeldLanguage,
  dedupeHeldLanguages,
  heldLanguagesAbout,
  heldLanguagesOf,
  ownHeldLanguages,
  removeHeldLanguages,
  resolveHeldLanguageVocab,
  setHeldLanguageFlag,
  toHeldLanguage,
} from "@kaigilb/gilbplatformcode-held-language";
import type { HeldLanguage } from "@kaigilb/gilbplatformcode-held-language";
import {
  HELD_NOTES_STALE_MS,
  heldClaimsKey,
  listHeldClaimsAbout,
  mergeClaim,
  privateMarkFacts,
  readHeldClaimDoc,
  runSerial,
  sharedMarkFacts,
  writeHeldMark,
} from "@kaigilb/gilbplatformcode-held-notes";
import type { HeldClaimDoc } from "@kaigilb/gilbplatformcode-held-notes";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";
import { contactTagForMark } from "@kaigilb/gilbplatformcode-language-order";
import { isStatedBy } from "@kaigilb/gilbplatformcode-stated-by";
import type { LanguageRow, LanguagesState } from "./languagesState";
import { ownsMark, useMarkIntent } from "./useMarkIntent";

export function useHeldLanguages(
  /** The vault that HOLDS the person's record — where the languages are written and read. */
  vaultId: string | null | undefined,
  /** The person's record (its entity IRI): every claim's `a:heldParty`. */
  subject: string,
  /** The signed-in principal, granted read on each claim at mint. */
  principal: string | null | undefined,
  /** The record's own `a:contactLanguage`: its stored tag, and the one function that writes it ("" clears). */
  contact: { tag: string; write: ((tag: string) => void) | null },
): LanguagesState & {
  /** The person has no landing vault of their own, so a language they add would have no source: none is offered (the card says it once). */
  noOwnVault: boolean;
} {
  const qc = useQueryClient();
  // RuleBaseappSourceIsAdder: the viewer's OWN card (one read per session); a write asks `adder.resolve()` for the card to state.
  const adder = useAdderCard(!!subject);
  const card = adder.card;
  const markIntent = useMarkIntent({ tag: contact.tag, access: null });
  const vocabQuery = useQuery({ queryKey: ["mynet", "held-language-vocab"] as const, queryFn: resolveHeldLanguageVocab, staleTime: Infinity, retry: false });
  const vocab = vocabQuery.data ?? null;
  const key = heldClaimsKey(vaultId ?? "", subject);
  const query = useQuery({
    queryKey: key,
    queryFn: () => listHeldClaimsAbout(vaultId ?? "", subject),
    enabled: !!vaultId && !!subject,
    staleTime: HELD_NOTES_STALE_MS,
    retry: false,
  });
  /** Every language claim about this person that the platform returned, whoever stated it. */
  const mine = useMemo(
    () => (query.data && vocab ? heldLanguagesAbout(heldLanguagesOf(query.data, vocab), subject) : null),
    [query.data, subject, vocab],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [saving, setSaving] = useState<ReadonlyMap<string, number>>(new Map());
  const setError = (language: string, message: string | null) =>
    setErrors((e) => {
      const next = { ...e };
      if (message) next[language] = message;
      else delete next[language];
      return next;
    });
  const mark = (language: string, on: boolean) =>
    setSaving((s) => {
      const next = new Map(s);
      const n = (next.get(language) ?? 0) + (on ? 1 : -1);
      if (n > 0) next.set(language, n);
      else next.delete(language);
      return next;
    });

  /** A FRESH read of this card's held languages (put into the shared query), or null when the read failed. `own` is what `stater` stated. */
  const readFresh = useCallback(async (stater: string): Promise<{ all: HeldLanguage[]; own: HeldLanguage[] } | null> => {
    if (!vaultId) return null;
    try {
      const [raw, v] = await Promise.all([listHeldClaimsAbout(vaultId, subject), resolveHeldLanguageVocab()]);
      qc.setQueryData(heldClaimsKey(vaultId, subject), raw);
      const all = heldLanguagesAbout(heldLanguagesOf(raw, v), subject);
      return { all, own: ownHeldLanguages(all, stater) };
    } catch {
      return null;
    }
  }, [qc, vaultId, subject]);

  /** Read back ONLY the claim a write touched, merge it into the query, and return it as a held language. */
  const readBack = useCallback(
    async (claim: { id: string; uri: string }): Promise<HeldLanguage | null | "unread"> => {
      if (!vaultId) return "unread";
      try {
        const [got, v] = await Promise.all([readHeldClaimDoc(vaultId, claim), resolveHeldLanguageVocab()]);
        mergeClaim(qc, heldClaimsKey(vaultId, subject), claim.id, got as HeldClaimDoc | null);
        return got ? toHeldLanguage(got.id, got.uri, got.doc, v) : null;
      } catch {
        return "unread";
      }
    },
    [qc, vaultId, subject],
  );

  /** The ONE write of the record's contact tag; the intent is recorded at once, so an act that finishes meanwhile sees it. */
  const writeMark = (tag: string): void => {
    markIntent.set({ tag, access: null });
    contact.write?.(tag);
  };

  const chainKey = (language: string) => `language\u0000${vaultId ?? ""}\u0000${subject}\u0000${language}`;
  const noVault = "Not signed in to a vault, so there is nowhere to store this language.";

  const add = useCallback(
    (info: LanguageEntryInfo): Promise<boolean> => {
      const language = info.uri;
      if (!vaultId) {
        setError(language, noVault);
        return Promise.resolve(false);
      }
      mark(language, true);
      return runSerial(chainKey(language), async () => {
        try {
          // The source first: with no own vault (or no card that can be made) nothing is written.
          let stater: string;
          try {
            stater = await adder.resolve();
          } catch (e) {
            setError(language, (e as Error).message);
            return false;
          }
          const before = await readFresh(stater);
          if (before === null) {
            setError(language, "The card could not be read, so this language is not added. Try again.");
            return false;
          }
          const flagCountry = flagChoices(info.countries).defaultCountry;
          const res = await addHeldLanguage({ vaultId, subject, language, flagCountry, existing: before.own, stater, readerPrincipal: principal });
          if (res.kind === "none") return true;
          const after = await readBack(res.claim);
          if (after === "unread" || after === null || after.language !== language) {
            setError(language, "The store accepted this language but did not keep it, so it is not added. Try again.");
            return false;
          }
          setError(language, null);
          return true;
        } catch (e) {
          setError(language, `Could not add this language: ${(e as Error).message}`);
          return false;
        } finally {
          mark(language, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, subject, principal, adder.resolve, readFresh, readBack],
  );

  const setFlag = useCallback(
    (row: LanguageRow, country: string | null): Promise<boolean> => {
      const language = row.language;
      if (!vaultId) {
        setError(language, noVault);
        return Promise.resolve(false);
      }
      mark(language, true);
      return runSerial(chainKey(language), async () => {
        try {
          // Only the viewer's own claims carry a flag change; another's is left as it is.
          const stater = await adder.find();
          const before = stater ? await readFresh(stater) : null;
          const all = before?.own.filter((l) => l.language === language) ?? [];
          if (all.length === 0) {
            setError(language, "The language could not be found on this card, so its flag is not saved. Try again.");
            return false;
          }
          // Every claim for the entry carries the flag (a duplicate is ⛔ left with another one).
          for (const claim of all) {
            if (claim.flagCountry === country) continue;
            await setHeldLanguageFlag(vaultId, claim, country);
            const after = await readBack(claim);
            if (after === "unread" || after === null || after.flagCountry !== country) {
              setError(language, "The store accepted this flag but did not keep it, so it is not saved. Try again.");
              return false;
            }
          }
          setError(language, null);
          return true;
        } catch (e) {
          setError(language, `Could not save this flag: ${(e as Error).message}`);
          return false;
        } finally {
          mark(language, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, adder.find, readFresh, readBack],
  );

  const remove = useCallback(
    (row: LanguageRow, marked: boolean): Promise<boolean> => {
      const language = row.language;
      // The tag the entry's mark carried when the act began (null: it was not the marked one).
      const owned = marked ? markIntent.current().tag : null;
      if (!vaultId) return Promise.resolve(false);
      return runSerial(chainKey(language), async () => {
        try {
          // Only what the viewer stated themselves is removed. With no card of their own they have stated nothing here.
          const stater = await adder.find();
          if (!stater) return true;
          const before = await readFresh(stater);
          if (before === null) {
            setError(language, "The languages could not be read, so this was not removed.");
            return false;
          }
          const claims = before.own.filter((l) => l.language === language);
          await removeHeldLanguages(vaultId, claims);
          for (const c of claims) {
            if ((await readBack(c)) !== null) {
              setError(language, "This language could not be confirmed removed. Try again.");
              return false;
            }
          }
          setError(language, null);
          // The marked entry left the list: the mark is cleared by ONE write of the record's own contact tag — but ONLY
          // if the mark is still this entry's NOW (a mark moved meanwhile is the person's later choice: left alone).
          if (ownsMark(owned, markIntent.current()) || ownsMark(markIntent.putBy(language), markIntent.current())) writeMark("");
          return true;
        } catch (e) {
          setError(language, `Could not remove this language: ${(e as Error).message}`);
          return false;
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, adder.find, readFresh, readBack, contact.write, markIntent],
  );

  const setPrivate = useCallback(
    (row: LanguageRow, makePrivate: boolean): Promise<boolean> => {
      const language = row.language;
      if (!vaultId || !principal) {
        setError(language, "Not signed in, so who sees this cannot be changed.");
        return Promise.resolve(false);
      }
      mark(language, true);
      return runSerial(chainKey(language), async () => {
        try {
          // Only the adder: the claims whose one `a:statedBy` is the viewer's own card.
          const stater = await adder.find();
          const before = stater ? await readFresh(stater) : null;
          if (stater && before === null) {
            setError(language, "The languages could not be read, so who sees this was not changed. Try again.");
            return false;
          }
          const claims = before?.own.filter((l) => l.language === language) ?? [];
          if (claims.length === 0) {
            setError(language, "You did not add this, so you cannot change who sees it.");
            return false;
          }
          for (const c of claims) {
            await writeHeldMark(c, makePrivate ? privateMarkFacts(principal) : sharedMarkFacts());
            const after = await readBack(c);
            if (after === "unread" || after === null || (after.isPrivate === true) !== makePrivate) {
              setError(language, "The store accepted this but did not keep it, so who sees it is not changed. Try again.");
              return false;
            }
          }
          setError(language, null);
          return true;
        } catch (e) {
          setError(language, `Could not change who sees this: ${(e as Error).message}`);
          return false;
        } finally {
          mark(language, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultId, principal, adder.find, readFresh, readBack],
  );

  const rows: LanguageRow[] = dedupeHeldLanguages(mine ?? [], card).map((l) => ({
    id: l.id,
    language: l.language,
    flagCountry: l.flagCountry,
    access: null,
    own: isStatedBy(l.statedBy, card, l.uri),
    private: l.isPrivate === true,
    uri: l.uri,
    hasSource: l.statedBy.length > 0,
  }));
  return {
    rows,
    loading: mine === null && !vocabQuery.isError && !query.isError,
    error: vocabQuery.isError
        ? `Could not read your languages: ${(vocabQuery.error as Error).message}`
        : query.isError
          ? `Could not read your languages: ${(query.error as Error).message}`
          : null,
    noOwnVault: adder.noOwnVault,
    contactTag: contact.tag,
    hasRungs: false,
    errorFor: (language) => errors[language] ?? null,
    savingFor: (language) => (saving.get(language) ?? 0) > 0,
    add,
    // A held card has no rung, so a legacy value is listed exactly as any other language: nothing can be widened.
    listLegacy: add,
    remove,
    setFlag,
    setPrivate,
    markContact: async (row, info, listed) => {
      const m = contactTagForMark(info, null, listed);
      if (!m || !contact.write) return false;
      markIntent.put(row.language, m.tag);
      writeMark(m.tag);
      return true;
    },
    clearContact: async () => {
      writeMark("");
      return contact.write !== null;
    },
  };
}
