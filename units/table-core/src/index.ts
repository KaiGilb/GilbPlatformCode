/**
 * The unit's public names: the table builder (`buildTable`), its cell readers and its types.
 */
export {
  NAME_COLUMN_ID,
  buildTable,
  cellOf,
  cellOfColumn,
  cellText,
  columnsOf,
  cellHoldsValue,
  narrowColumns,
  narrowFieldsOfRow,
  type BuildTableInput,
  type Cell,
  type ColumnSource,
  type NarrowField,
  type TableColumn,
  type TableModel,
  type TableRow,
} from "./tableCore";
