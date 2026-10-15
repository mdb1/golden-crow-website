// table-features.ts
//
// The TanStack Table v9 feature set for the gc-fitness tables (exercise
// library, habit columns). v9 ships no features by default: each one a table
// or column definition touches must be registered here, and `ColumnDef` takes
// this set as its first generic.
//
// Sorting and sizing are registered only so the column definitions'
// `enableSorting` / `size` keys stay valid — there is no sorted row model, so
// nothing is sorted (same behavior as v8, where those keys were inert too).

import {
  columnSizingFeature,
  columnVisibilityFeature,
  createPaginatedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

export const gcFitnessTableFeatures = tableFeatures({
  columnVisibilityFeature, // row.getVisibleCells()
  rowPaginationFeature,
  rowSortingFeature,
  columnSizingFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type GcFitnessColumnDef<TData extends RowData> = ColumnDef<
  typeof gcFitnessTableFeatures,
  TData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;
