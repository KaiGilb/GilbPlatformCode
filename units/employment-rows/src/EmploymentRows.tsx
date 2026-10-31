/**
 * A person record's Employment section: the employments the record's `a:employment` edges name, each its own `t:Employment` entity in the
 * vault that holds the record, over the state that reads and writes them (`employments-state`) and the card that draws them (`employment-card`).
 *
 * The record carries the ordered edges; they are written by the state through the edge writer, never by the record card's own save, which
 * keeps the edge key.
 *
 *   - The add and remove controls show only while the card is being edited: `canEdit`, a vault to write into, and the card's edit mode;
 *   - the company chooser offers the organization RECORDS of the vault that holds this card, through the `find` it is given;
 *   - the work place is a slot (`renderWorkLocation`, `renderPlaceName`), absent unless the caller gives it;
 *   - UNKNOWN IS NOT EMPTY: when the record names employments but no vault is known, nothing can be read, and the card says that, instead of
 *     drawing an empty list;
 *   - mount, render, idle and a change of `canEdit` write nothing.
 */
import { EmploymentCard, type RenderPlaceName, type RenderWorkLocation } from "@kaigilb/gilbplatformcode-employment-card";
import { useEmployments } from "@kaigilb/gilbplatformcode-employments-state";
import { storedEdgeItems } from "@kaigilb/gilbplatformcode-employment-edges";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import type { CompanyFind } from "@kaigilb/gilbplatformcode-company-search";

export function EmploymentRows({
  title,
  recordId,
  recordEntityUri,
  vaultId,
  edgeKey,
  servedEdges,
  servedReady = true,
  canEdit,
  onSaved,
  find,
  vaultName,
  renderWorkLocation,
  renderPlaceName,
  catalogueOrigin,
}: {
  /** The employment term's label, from the master. */
  title: string;
  recordId: string;
  /** The record's entity IRI (its own host, for the edge write). */
  recordEntityUri: string;
  /** The vault that HOLDS the record. Null: not known; nothing is read or written, and the card says so if the record names employments. */
  vaultId: string | null;
  /** The record's key for the `a/employment` term (found by term). */
  edgeKey: string;
  /** The edge fact as the record served it. */
  servedEdges: unknown;
  /** False while only a list row's flattened value is known: the section waits for the record. */
  servedReady?: boolean;
  canEdit: boolean;
  /** The record's edge list changed: the card re-reads the record. */
  onSaved?: () => void;
  /** The finder of organization records in one vault, for the company box. */
  find: CompanyFind;
  /** The name of the holding vault, as the person knows it; absent: "this vault". */
  vaultName?: string;
  /** The edit control of the work place. Absent: no Location box. */
  renderWorkLocation?: RenderWorkLocation;
  /** The read-only name of the work place. Absent: no place is drawn. */
  renderPlaceName?: RenderPlaceName;
  /** The origin of the place catalogue, so that a place stored as a compact id reads as an address. Absent: it reads as none. */
  catalogueOrigin?: string;
}) {
  const editor = useEmployments({ recordId, recordEntityUri, vaultId, edgeKey, servedEdges, onSaved, servedReady, ...(catalogueOrigin !== undefined ? { catalogueOrigin } : {}) });
  // The add and remove controls show only while the card is being edited.
  const mode = useCardMode();
  // The record names employments, but the vault that holds them is not known: they were not read. That is not "none".
  const vaultUnknown = !vaultId && servedReady && storedEdgeItems(servedEdges).length > 0;
  return (
    <EmploymentCard
      title={title}
      editor={editor}
      editMode={canEdit && !!vaultId && !(mode.managed && mode.presentation)}
      recordsVaultId={vaultId}
      find={find}
      vaultUnknown={vaultUnknown}
      {...(vaultName !== undefined ? { vaultName } : {})}
      {...(renderWorkLocation ? { renderWorkLocation } : {})}
      {...(renderPlaceName ? { renderPlaceName } : {})}
    />
  );
}
