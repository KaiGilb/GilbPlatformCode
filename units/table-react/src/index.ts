/**
 * The unit's public names: the `RecordTable` component and the types of what it is given; and, for a host that lets cells be edited,
 * the shape of its cell write and the error it rejects with.
 */
export { RecordTable, type RecordTableProps, type TableEditing, type TableRef } from "./RecordTable";
export { CellWriteError, cellKey, type CellSaveView, type CellWrite, type CellWriteRequest } from "./cellSaves";
