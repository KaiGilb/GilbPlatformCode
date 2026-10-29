// The card's reference add, as ONE hook: the reference
// reading, the write (ONLY through `addReference` of `holder-reference`) and the cache
// invalidation, with the keys imported from `record-cache-kit`, ⛔ never retyped. A component that
// offers the add receives props, calls this hook and renders (app state and
// data-access live in hooks, not components).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RECORDS_QUERY_HEAD, RECORD_QUERY_HEAD } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cardMasterSource, referenceReadingQuery } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { addReferenceFromCard, type CardReferenceInput } from "./cardReferences";
import { withoutEdges } from "./edgeItems";

/**
 * What the host answers for the card's remove. The member replaces one call of the app and is made when the remove
 * runs, never read once at render. A host that cannot write does not take `removeCardReference` and
 * `useRemoveCardReference`.
 */
export interface CardReferencesHost {
  /**
   * The one-key writer of a record's fact: the items AS STORED NOW are changed, written back as a merge PATCH of that
   * one key, conditional on the read it was built from (`If-Match`); a 412 re-reads and re-applies; one write at a time
   * per record. Replaces `changeRecordFactItems(recordId, recordEntityUri, factKey, change, notChanged)`
   * (GilbApp `src/lib/base/recordFactItems.ts` line 55), called at `src/lib/base/useAddCardReference.ts` line 57.
   */
  changeRecordFactItems(
    recordId: string,
    recordEntityUri: string | null,
    factKey: string,
    change: (stored: readonly unknown[]) => unknown[],
    notChanged: string,
  ): Promise<unknown[]>;
}

/**
 * Add one reference from the card. The reference reading is read once and held for the session with
 * the field sets; a refusal or "not known yet" rejects with the package's own error, and nothing was
 * sent. On success the carrier changed on the platform, so every cached record read and records list
 * is dropped: its next read must not come from a cache.
 */
export function useAddCardReference(fieldSets: StakeholderFieldSets) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CardReferenceInput) =>
      addReferenceFromCard(
        {
          fieldSets,
          references: () => qc.fetchQuery(referenceReadingQuery(fieldSets)),
          source: cardMasterSource(),
        },
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RECORD_QUERY_HEAD });
      void qc.invalidateQueries({ queryKey: RECORDS_QUERY_HEAD });
    },
  });
}

/**
 * Remove one link from the card. The package has no remove (it CHECKS a target
 * before it is written; dropping one needs no check), so this is the record's own one-key write: under
 * each spelling the field may hold it, the stored items AS STORED NOW lose that one link, as a merge
 * PATCH with `If-Match`, a 412 re-applied (`host.changeRecordFactItems`, one write at a time per record).
 * Every other item is kept as stored. A link no spelling holds in a form this app can match is SAID,
 * ⛔ never reported as removed.
 */
export async function removeCardReference(host: CardReferencesHost, input: {
  recordId: string;
  carrier: string | null;
  factKeys: readonly string[];
  target: string;
  label: string;
}): Promise<void> {
  let removed = false;
  for (const key of input.factKeys) {
    await host.changeRecordFactItems(
      input.recordId,
      input.carrier,
      key,
      (stored) => {
        const next = withoutEdges(stored, [input.target]);
        if (next.length < stored.length) removed = true;
        return next;
      },
      `the ${input.label} link was not removed`,
    );
  }
  if (!removed) throw new Error(`The record does not hold this link in a form this app can remove, so nothing was changed.`);
}

export function useRemoveCardReference(host: CardReferencesHost) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof removeCardReference>[1]) => removeCardReference(host, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RECORD_QUERY_HEAD });
      void qc.invalidateQueries({ queryKey: RECORDS_QUERY_HEAD });
    },
  });
}
