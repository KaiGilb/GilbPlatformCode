// Typecheck only (never run): the README's example, against the signature of `patchRecord` in units/lws-records/src/records.ts.
// lws-records imports other units by package name, so it is not imported here; the types below are copied from it:
//   export async function patchRecord(id: string, patch: Record<string, MergePatchValue>, at: string | null,
//     source?: WriteSource, precondition?: { ifMatch?: string | null }): Promise<{ etag: string | null }>
// (`BaseRecord` there has `id: string`, `entityUri?: string`, `facts: Record<string, string>`.)
import { SaveStateLine, useAutosaveRecord } from "../src/index";

type MergePatchValue = string | number | boolean | null | { readonly [key: string]: unknown } | readonly unknown[];
declare function patchRecord(
  id: string,
  patch: Record<string, MergePatchValue>,
  at: string | null,
  source?: unknown,
  precondition?: { ifMatch?: string | null },
): Promise<{ etag: string | null }>;
interface BaseRecord {
  id: string;
  entityUri?: string;
  facts: Record<string, string>;
}

export function FruitScreen({ rec, canWrite }: { rec: BaseRecord | null; canWrite: boolean }) {
  const r = useAutosaveRecord({
    stored: rec ? { fruitName: rec.facts.fruitName ?? "", placeName: rec.facts.placeName ?? "" } : null,
    write: (changed) => patchRecord(rec!.id, changed, rec!.entityUri ?? null).then(() => undefined),
    readOnly: !canWrite,
  });
  return (
    <>
      <label>
        Fruit name <input {...r.text("fruitName")} />
      </label>
      <label>
        Place name <input {...r.text("placeName")} />
      </label>
      <SaveStateLine state={r.state} error={r.error} onRetry={r.retry} />
    </>
  );
}
