// The second line of a place row: its kind in strong type, then where it is (`placeHitLine`). Taken from GilbApp (commit in the README); only the imports changed.
import type { PlaceHitDetail } from "./placeHitDetails";
import { placeHitLine } from "./placeHitDetails";

export function PlaceHitMeta({ detail, fallback = null }: { detail: PlaceHitDetail | undefined; fallback?: string | null }) {
  if (!detail) return <>{fallback ?? ""}</>;
  const line = placeHitLine(detail);
  if (!detail.kind) return <>{line || (fallback ?? "")}</>;
  // The kind is drawn strong; the rest of the line is the same string `placeHitLine` makes, so what is read is what is tested.
  return (
    <>
      <span className="font-medium text-[var(--ink-soft)]">{detail.kind}</span>
      {line.slice(detail.kind.length)}
    </>
  );
}
