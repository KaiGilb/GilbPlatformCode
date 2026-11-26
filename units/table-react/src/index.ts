/**
 * The unit's public names: the `RecordTable` component and the types of what it is given; and, for a host that lets cells be edited,
 * the shape of its cell write and the error it rejects with; and the words and acts of a clash, for a host's own form.
 */
export { RecordTable, type RecordTableProps, type TableEditing, type TableRef } from "./RecordTable";
export { CellWriteError, cellKey, type CellCommit, type CellSaveView, type CellWrite, type CellWriteRequest, type HostCellSaves } from "./cellSaves";
export { CONFLICT_WORDS, ConflictActs } from "./ConflictChoice";
