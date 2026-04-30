import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import type { WastingItem } from "../api";

interface Props {
  data: WastingItem[];
  showEntityType?: boolean;
}

const col = createColumnHelper<WastingItem>();

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const ENTITY_LABEL: Record<string, string> = {
  campaign: "Campaign", ad_group: "Ad Group",
  keyword: "Keyword", search_term: "Search Term", ad: "Ad",
};

export default function AuditTable({ data, showEntityType = false }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "cost_usd", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const columns = [
    ...(showEntityType
      ? [col.accessor("entity_type", {
          header: "Type",
          cell: (c) => (
            <span className="text-xs font-medium text-gray-500">
              {ENTITY_LABEL[c.getValue()] ?? c.getValue()}
            </span>
          ),
        })]
      : []),
    col.accessor("name", {
      header: "Name",
      cell: (c) => (
        <div className="font-semibold text-gray-800 max-w-[200px] truncate" title={c.getValue()}>
          {c.getValue()}
        </div>
      ),
    }),
    col.accessor("campaign", {
      header: "Campaign",
      cell: (c) => (
        <div className="text-sm text-gray-500 max-w-[180px] truncate" title={c.getValue()}>
          {c.getValue()}
        </div>
      ),
    }),
    col.accessor("match_type", {
      header: "Match",
      cell: (c) => c.getValue()
        ? <span className="text-xs text-gray-400 uppercase tracking-wide">{c.getValue()}</span>
        : null,
    }),
    col.accessor("cost_usd", {
      header: "Cost",
      cell: (c) => <span className="font-semibold text-[#ff2e6a]">{usd(c.getValue())}</span>,
    }),
    col.accessor("conversions", {
      header: "Conversions",
      cell: (c) => <span className="text-gray-700">{c.getValue()}</span>,
    }),
    col.accessor("cpa_usd", {
      header: "CPA",
      cell: (c) => c.getValue() != null
        ? <span className="text-gray-700">{usd(c.getValue()!)}</span>
        : <span className="text-gray-300">—</span>,
    }),
    col.accessor("clicks", {
      header: "Clicks",
      cell: (c) => <span className="text-gray-600">{c.getValue().toLocaleString()}</span>,
    }),
    col.accessor("waste_reason", {
      header: "Reason",
      cell: (c) => c.getValue() === "high_cpa"
        ? <span className="tag-high-cpa">High CPA</span>
        : <span className="tag-zero-conv">Zero Conv.</span>,
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (data.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="font-medium">Nothing flagged here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
          <input
            type="text"
            placeholder="Filter by name, campaign..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 pr-4 py-2 rounded-xl bg-white/60 border border-white/50 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#7f7fd5]/30"
          />
        </div>
        <span className="text-sm text-gray-400">
          {table.getFilteredRowModel().rows.length} items
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/40">
        <table className="w-full text-sm audit-table">
          <thead>
            <tr className="bg-white/30">
              {table.getHeaderGroups()[0].headers.map((h) => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  className="text-left px-4 py-3 font-medium text-gray-500 cursor-pointer select-none whitespace-nowrap hover:text-gray-700"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === "asc" && " ↑"}
                  {h.column.getIsSorted() === "desc" && " ↓"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1.5 rounded-xl glass-light disabled:opacity-40 hover:bg-white/70"
          >
            Previous
          </button>
          <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1.5 rounded-xl glass-light disabled:opacity-40 hover:bg-white/70"
          >
            Next
          </button>
        </div>
        <select
          value={pagination.pageSize}
          onChange={(e) => setPagination((p) => ({ ...p, pageSize: Number(e.target.value) }))}
          className="glass-light rounded-xl px-3 py-1.5 text-sm"
        >
          {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>
    </div>
  );
}
