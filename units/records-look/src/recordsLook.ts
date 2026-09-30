export type RecordsView = "grid" | "graph" | "both" | "card";

export const RECORDS_VIEW_PARAM = "view";
export const FOLDER_VIEW_PARAM = "fv";
export const VAULT_SCOPED_SELECTION_PARAMS = ["rec", FOLDER_VIEW_PARAM] as const;

export type RowOpenAct = "detailPaneKeepGrid" | "listRowOpen";

/** Anything unrecognised is grid. */
export function parseView(v: string | null | undefined): RecordsView {
  if (v === "graph" || v === "both" || v === "card") return v;
  return "grid";
}

/** True only when the list is the only view on screen. */
export function listIsSoleView(v: string | null | undefined): boolean {
  return parseView(v) === "grid";
}

/** A folder keeps the grid. An unknown type is not treated as a folder. */
export function rowOpenAct(typeId: string | null | undefined): RowOpenAct {
  return typeId === "folder" ? "detailPaneKeepGrid" : "listRowOpen";
}

export function paramsForListRowOpen(prev: URLSearchParams, id: string): URLSearchParams {
  const p = new URLSearchParams(prev);
  p.set("section", "data");
  p.delete("ftab");
  p.set("rec", id);
  if (listIsSoleView(p.get(RECORDS_VIEW_PARAM))) p.set(RECORDS_VIEW_PARAM, "card");
  return p;
}

export function paramsForDetailPaneOpen(prev: URLSearchParams, id: string): URLSearchParams {
  const p = new URLSearchParams(prev);
  p.set("section", "data");
  p.delete("ftab");
  p.set("rec", id);
  return p;
}

export function paramsForFolderEnter(prev: URLSearchParams, folderId: string): URLSearchParams {
  const p = new URLSearchParams(prev);
  p.set("section", "data");
  p.delete("ftab");
  p.set(FOLDER_VIEW_PARAM, folderId);
  p.set("rec", folderId);
  return p;
}

export function paramsForShowAll(prev: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(prev);
  p.delete(FOLDER_VIEW_PARAM);
  p.delete("rec");
  p.delete(RECORDS_VIEW_PARAM);
  return p;
}

/** The folder's own address, never the address of whatever is selected inside it. */
export function folderDoorEntityUri(
  loadedEntityUri: string | undefined,
  folderFallbackEntityUri: string | undefined,
): string | undefined {
  return loadedEntityUri ?? folderFallbackEntityUri;
}

/**
 * Move one row to the front. Every other row keeps its order.
 * A missing id returns a copy. The input is not changed.
 */
export function leadWith<T>(items: readonly T[], leadId: string | null | undefined, idOf: (item: T) => string): T[] {
  if (!leadId) return [...items];
  const at = items.findIndex((item) => idOf(item) === leadId);
  if (at < 0) return [...items];
  const lead = items[at];
  if (lead === undefined) return [...items];
  return [lead, ...items.slice(0, at), ...items.slice(at + 1)];
}
