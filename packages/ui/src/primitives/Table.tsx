"use client";

import * as React from "react";
import { cx } from "./cx";
import { Input } from "./Input";
import { Button } from "./Button";
import css from "./table.module.css";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface TableColumn<T = Record<string, unknown>> {
  /** Property key on the row object. */
  key: string;
  /** Human-readable header label. */
  label: string;
  /** Enable sorting on this column. */
  sortable?: boolean;
  /** Fixed width in px — applied as `minWidth` + `width` on the `<th>`. */
  width?: number;
  /** Custom cell renderer. Receives the cell value and the full row. */
  render?: (value: unknown, row: T) => React.ReactNode;
}

type SortDir = "asc" | "desc";

export interface TableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Column definitions. */
  columns: TableColumn<T>[];
  /** Row data. Each row must have a unique `id` (string | number). */
  data: T[];
  /** Key used to uniquely identify rows. Defaults to `"id"`. */
  rowKey?: string;
  /** Rows per page. When omitted, pagination is disabled. */
  pageSize?: number;
  /** Show the filter input. */
  filterable?: boolean;
  /** Placeholder text for the filter input. */
  filterPlaceholder?: string;
  /** Show a checkbox column for row selection. */
  selectable?: boolean;
  /** Called with selected row keys whenever the selection changes. */
  onSelect?: (selectedKeys: (string | number)[]) => void;
  /** Message shown when the (filtered) data set is empty. */
  emptyMessage?: string;
  /** Keep the header row fixed while scrolling vertically. */
  stickyHeader?: boolean;
  /** Allow column resizing by dragging header borders. */
  resizable?: boolean;
  /** Additional className on the root wrapper. */
  className?: string;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function getRowId(row: Record<string, unknown>, rowKey: string): string | number {
  const v = row[rowKey];
  if (typeof v === "string" || typeof v === "number") return v;
  return String(v);
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const sa = cellToString(a).toLowerCase();
  const sb = cellToString(b).toLowerCase();
  const na = Number(a);
  const nb = Number(b);

  // If both are numeric, compare numerically
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== "" && b !== "") {
    return dir === "asc" ? na - nb : nb - na;
  }

  // Otherwise, locale string compare
  const cmp = sa.localeCompare(sb, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function Table<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  data,
  rowKey = "id",
  pageSize,
  filterable = false,
  filterPlaceholder = "Filter…",
  selectable = false,
  onSelect,
  emptyMessage = "No data.",
  stickyHeader = false,
  resizable = false,
  className,
}: TableProps<T>) {
  /* ── State ─────────────────────────────────────────────────────── */
  const [filter, setFilter] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string | number>>(new Set());
  const [colWidths, setColWidths] = React.useState<Record<string, number>>({});

  /* Reset to first page when filter changes */
  const handleFilterChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(e.target.value);
      setPage(0);
    },
    [],
  );

  /* ── Derived data ──────────────────────────────────────────────── */

  // Filter
  const filtered = React.useMemo(() => {
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => cellToString((row as Record<string, unknown>)[col.key]).toLowerCase().includes(q)),
    );
  }, [data, columns, filter]);

  // Sort
  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) =>
      compareValues(
        (a as Record<string, unknown>)[sortKey],
        (b as Record<string, unknown>)[sortKey],
        sortDir,
      ),
    );
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages - 1);
  const paged = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  /* ── Sorting handler ───────────────────────────────────────────── */

  const handleSort = React.useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortKey],
  );

  /* ── Selection handlers ────────────────────────────────────────── */

  const allPageIds = React.useMemo(
    () => paged.map((r) => getRowId(r as Record<string, unknown>, rowKey)),
    [paged, rowKey],
  );

  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selected.has(id));
  const someSelected = !allSelected && allPageIds.some((id) => selected.has(id));

  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allPageIds.forEach((id) => next.delete(id));
      } else {
        allPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allSelected, allPageIds]);

  const toggleRow = React.useCallback((id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Notify parent of selection changes
  React.useEffect(() => {
    onSelect?.(Array.from(selected));
  }, [selected, onSelect]);

  /* ── Column resize ─────────────────────────────────────────────── */

  const handleResizeStart = React.useCallback(
    (colKey: string, startX: number, startWidth: number) => {
      const onMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        setColWidths((prev) => ({
          ...prev,
          [colKey]: Math.max(40, startWidth + delta),
        }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [],
  );

  /* ── Render ────────────────────────────────────────────────────── */

  const renderSortArrow = (col: TableColumn<T>) => {
    if (!col.sortable) return null;
    const isActive = sortKey === col.key;
    const arrow = isActive && sortDir === "desc" ? "▼" : "▲";
    return (
      <span
        className={cx(css.sortArrow, isActive && css.sortArrowActive)}
        aria-hidden
      >
        {arrow}
      </span>
    );
  };

  return (
    <div className={cx(css.root, className)}>
      {/* Toolbar */}
      {filterable && (
        <div className={css.toolbar}>
          <Input
            sizing="sm"
            placeholder={filterPlaceholder}
            value={filter}
            onChange={handleFilterChange}
            className={css.filterInput}
            leading={<span aria-hidden>&#x1F50D;</span>}
          />
        </div>
      )}

      {/* Scroll container */}
      <div className={cx(css.scrollWrap, stickyHeader && css.stickyHeader)}>
        <table className={css.table}>
          <thead className={css.thead}>
            <tr>
              {selectable && (
                <th className={cx(css.th, css.checkCol)}>
                  <input
                    type="checkbox"
                    className={css.checkbox}
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => {
                const w = colWidths[col.key] ?? col.width;
                return (
                  <th
                    key={col.key}
                    className={cx(css.th, col.sortable && css.thSortable)}
                    style={w ? { width: w, minWidth: w } : undefined}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    aria-sort={
                      sortKey === col.key
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <span className={css.thContent}>
                      {col.label}
                      {renderSortArrow(col)}
                    </span>
                    {resizable && (
                      <span
                        className={css.resizeHandle}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const th = e.currentTarget.parentElement!;
                          handleResizeStart(col.key, e.clientX, th.offsetWidth);
                        }}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className={css.tbody}>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className={css.empty}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const id = getRowId(row as Record<string, unknown>, rowKey);
                const isSelected = selected.has(id);
                return (
                  <tr key={id}>
                    {selectable && (
                      <td className={cx(css.td, css.checkCol)}>
                        <input
                          type="checkbox"
                          className={css.checkbox}
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select row ${id}`}
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const value = (row as Record<string, unknown>)[col.key];
                      return (
                        <td key={col.key} className={css.td}>
                          {col.render
                            ? col.render(value, row)
                            : cellToString(value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageSize && sorted.length > 0 && (
        <div className={css.pagination}>
          <span className={css.pageInfo}>
            {sorted.length === 0
              ? "0 rows"
              : `${safePage * pageSize + 1}–${Math.min(
                  (safePage + 1) * pageSize,
                  sorted.length,
                )} of ${sorted.length}`}
          </span>
          <div className={css.pageControls}>
            <Button
              variant="outlined"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <span className={css.pageInfo}>
              Page {safePage + 1} of {totalPages}
            </span>
            <Button
              variant="outlined"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
