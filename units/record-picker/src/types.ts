/**
 * The part of a record row that a hit may carry. The picker itself reads none of it: the row is for the caller, who
 * passes the hit back through `onPick`. A host's own record type is assignable to this when it has an `id`.
 */
export interface PickerRow {
  id: string;
  entityUri?: string;
  typeUri?: string;
  facts?: Record<string, string>;
}

export interface OrgRecordHit {
  /** The organization record's address. */
  uri: string;
  label: string;
  /** Bare type name, when the find read one. Absent: the caller does not know the type. */
  typeName?: string;
  /** A second line under the name. Absent: the hit is the name alone. */
  note?: string;
  /** The row the find already read. A second picker uses this instead of a private cache. */
  row?: PickerRow;
  /** A heading the picker draws above the first hit of this group. Absent: the hit is in the first, unnamed group. */
  group?: string;
}
