"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
  IconRefresh,
} from "@tabler/icons-react";

/**
 * Full Sales Transactions Table
 * - Fetches and displays the last 1000 records from the DB via API (expects /api/sales to allow pageSize=1000)
 * - Shows ALL columns
 * - Client-side pagination (page size selector)
 * - Column customization dropdown
 * - Row selection checkboxes + select-all current page
 * - Resembles existing DataTable styling & UX patterns
 *
 * NOTE:
 * If /api/sales currently limits pageSize < 1000, adjust its max or create a new endpoint.
 */

type SalesRow = {
  transaction_id: number;
  commercial_responsible: string;
  order_type: string;
  supplier: string;
  billing_sign: string | null;
  delivery_client: string;
  delivery_circuit: string;
  product_category: string;
  product_family: string;
  product_reference: string;
  delivery_date: string; // ISO string from API
  quantity: number | null;
  sales_altona: number | null;
  purchases_altona_eur: number | null;
  purchases_purchase_currency: number | null;
  purchase_currency: string | null;
  direct_sales: number | null;
  commission_altona: number | null;
  total_pub_budget: number | null;
  rfa_on_resale_orders: number | null;
  logistics_cost_altona: number | null;
  prescriber_commission: number | null;
  total_net_margin_eur: number | null;
};

interface ColumnDef {
  id: string;
  label: string;
  accessor: (row: SalesRow) => React.ReactNode;
  numeric?: boolean;
  width?: string;
}

/**
 * Format numbers consistently.
 */
function fmtNum(n: number | null | undefined): string {
  if (typeof n !== "number") return "";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Format date (assumes ISO).
 */
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB");
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    id: "transaction_id",
    label: "ID",
    accessor: (r) => (
      <span className="text-s font-bold">{r.transaction_id}</span>
    ),
    width: "70px",
  },
  {
    id: "commercial_responsible",
    label: "Responsable commercial",
    accessor: (r) => (
      <div className="max-w-[180px] truncate" title={r.commercial_responsible}>
        {r.commercial_responsible}
      </div>
    ),
  },
  {
    id: "order_type",
    label: "Type commande",
    accessor: (r) => (
      <Badge variant="secondary" className="px-1.5">
        {r.order_type}
      </Badge>
    ),
  },
  {
    id: "supplier",
    label: "Fournisseur",
    accessor: (r) => (
      <div className="max-w-[180px] truncate" title={r.supplier}>
        {r.supplier}
      </div>
    ),
  },
  {
    id: "billing_sign",
    label: "Enseigne (fact.)",
    accessor: (r) => r.billing_sign ?? "",
  },
  {
    id: "delivery_client",
    label: "Client (livr.)",
    accessor: (r) => (
      <div className="max-w-[180px] truncate" title={r.delivery_client}>
        {r.delivery_client}
      </div>
    ),
  },
  {
    id: "delivery_circuit",
    label: "Circuit de livraison",
    accessor: (r) => r.delivery_circuit,
  },
  {
    id: "product_category",
    label: "Catégorie de produit",
    accessor: (r) => (
      <Badge variant="outline" className="px-1.5">
        {r.product_category}
      </Badge>
    ),
  },
  {
    id: "product_family",
    label: "Famille produit",
    accessor: (r) => (
      <div className="max-w-[180px] truncate" title={r.product_family}>
        {r.product_family}
      </div>
    ),
  },
  {
    id: "product_reference",
    label: "Référence produit",
    accessor: (r) => (
      <div className="max-w-[180px] truncate" title={r.product_reference}>
        {r.product_reference}
      </div>
    ),
  },
  {
    id: "delivery_date",
    label: "Date de livraison",
    accessor: (r) => fmtDate(r.delivery_date),
    width: "120px",
  },
  {
    id: "quantity",
    label: "Quantité",
    accessor: (r) => fmtNum(r.quantity),
    numeric: true,
  },
  {
    id: "sales_altona",
    label: "Ventes Altona",
    accessor: (r) => fmtNum(r.sales_altona),
    numeric: true,
  },
  {
    id: "purchases_altona_eur",
    label: "Achats Altona en EUR",
    accessor: (r) => fmtNum(r.purchases_altona_eur),
    numeric: true,
  },
  {
    id: "purchases_purchase_currency",
    label: "Achats devise achat",
    accessor: (r) => fmtNum(r.purchases_purchase_currency),
    numeric: true,
  },
  {
    id: "purchase_currency",
    label: "Devise achat",
    accessor: (r) => r.purchase_currency ?? "",
    width: "110px",
  },
  {
    id: "direct_sales",
    label: "Ventes directes",
    accessor: (r) => fmtNum(r.direct_sales),
    numeric: true,
  },
  {
    id: "commission_altona",
    label: "Commission Altona",
    accessor: (r) => fmtNum(r.commission_altona),
    numeric: true,
  },
  {
    id: "total_pub_budget",
    label: "Total budget PUB",
    accessor: (r) => fmtNum(r.total_pub_budget),
    numeric: true,
  },
  {
    id: "rfa_on_resale_orders",
    label: "RFA sur les commandes achat-revente",
    accessor: (r) => fmtNum(r.rfa_on_resale_orders),
    numeric: true,
  },
  {
    id: "logistics_cost_altona",
    label: "Couts logistiques",
    accessor: (r) => fmtNum(r.logistics_cost_altona),
    numeric: true,
  },
  {
    id: "prescriber_commission",
    label: "Commission payable aux prescripteurs",
    accessor: (r) => fmtNum(r.prescriber_commission),
    numeric: true,
  },
  {
    id: "total_net_margin_eur",
    label: "Marge Nette Totale en EUR",
    accessor: (r) => fmtNum(r.total_net_margin_eur),
    numeric: true,
  },
];

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 250];

export default function SalesTransactionsTableFull() {
  return <SalesTransactionsTableFullClient />;
}

function SalesTransactionsTableFullClient() {
  const [allRows, setAllRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    ALL_COLUMNS.map((c) => c.id),
  );

  // Row selection (by transaction_id)
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Fetch last 1000 rows
  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "1000",
          sortField: "transaction_id",
          sortOrder: "desc",
        });
        const res = await fetch(`/api/sales?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(
            `Failed to fetch data (status ${res.status}) ${res.statusText}`,
          );
        }
        const json = await res.json();
        if (!ignore) {
          setAllRows(json.rows || []);
          setPageIndex(0);
          setSelected(new Set());
        }
      } catch (e: unknown) {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // Derived pagination rows
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(allRows.length / pageSize)),
    [allRows.length, pageSize],
  );

  const currentPageRows = useMemo(() => {
    const start = pageIndex * pageSize;
    return allRows.slice(start, start + pageSize);
  }, [allRows, pageIndex, pageSize]);

  // Aggregates over loaded dataset
  const aggregates = useMemo(() => {
    let direct = 0;
    let commission = 0;
    let margin = 0;
    for (const r of allRows) {
      if (typeof r.direct_sales === "number") direct += r.direct_sales;
      if (typeof r.commission_altona === "number")
        commission += r.commission_altona;
      if (typeof r.total_net_margin_eur === "number")
        margin += r.total_net_margin_eur;
    }
    return {
      direct: fmtNum(direct),
      commission: fmtNum(commission),
      margin: fmtNum(margin),
    };
  }, [allRows]);

  function toggleRow(id: number) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) {
        copy.delete(id);
      } else {
        copy.add(id);
      }
      return copy;
    });
  }

  function toggleAllCurrentPage() {
    const ids = currentPageRows.map((r) => r.transaction_id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const copy = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => copy.delete(id));
      } else {
        ids.forEach((id) => copy.add(id));
      }
      return copy;
    });
  }

  function isColumnVisible(id: string) {
    return visibleColumns.includes(id);
  }

  function toggleColumn(id: string, value: boolean) {
    setVisibleColumns((prev) => {
      if (value) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      } else {
        return prev.filter((c) => c !== id);
      }
    });
  }

  function firstPage() {
    setPageIndex(0);
  }

  function prevPage() {
    setPageIndex((p) => Math.max(0, p - 1));
  }

  function nextPage() {
    setPageIndex((p) => Math.min(pageCount - 1, p + 1));
  }

  function lastPage() {
    setPageIndex(pageCount - 1);
  }

  function refresh() {
    // Trigger refetch by re-running effect:
    setAllRows([]);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "1000",
          sortField: "transaction_id",
          sortOrder: "desc",
        });
        const res = await fetch(`/api/sales?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch (status ${res.status})`);
        }
        const json = await res.json();
        setAllRows(json.rows || []);
        setPageIndex(0);
        setSelected(new Set());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header / Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Recent Sales</h2>
          <p className="text-xs text-muted-foreground">
            Loaded {allRows.length} rows | Selected {selected.size}
          </p>
          <p className="text-xs text-muted-foreground">
            Aggregates (loaded): Direct Sales {aggregates.direct} | Commission{" "}
            {aggregates.commission} | Net Margin {aggregates.margin}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns className="mr-1" />
                Customize Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-[60vh] w-64 overflow-y-auto"
            >
              {ALL_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={isColumnVisible(col.id)}
                  onCheckedChange={(v) => toggleColumn(col.id, !!v)}
                  className="capitalize"
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <Label htmlFor="rows-per-page" className="text-s ml-2">
              Rows/page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
              }}
            >
              <SelectTrigger id="rows-per-page" className="h-8 w-24">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={refresh}
          >
            <IconRefresh className="mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={
                    currentPageRows.length > 0 &&
                    currentPageRows.every((r) => selected.has(r.transaction_id))
                      ? true
                      : currentPageRows.some((r) =>
                            selected.has(r.transaction_id),
                          )
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAllCurrentPage}
                  aria-label="Select all visible"
                />
              </TableHead>
              {ALL_COLUMNS.filter((c) => isColumnVisible(c.id)).map((col) => (
                <TableHead
                  key={col.id}
                  className={col.numeric ? "text-right" : undefined}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={1 + visibleColumns.length}
                  className="h-24 text-center text-sm"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && error && (
              <TableRow>
                <TableCell
                  colSpan={1 + visibleColumns.length}
                  className="h-24 text-center text-red-500 text-sm"
                >
                  {error}
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && currentPageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={1 + visibleColumns.length}
                  className="h-24 text-center text-sm"
                >
                  No rows.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              !error &&
              currentPageRows.map((row) => {
                const isSelected = selected.has(row.transaction_id);
                return (
                  <TableRow
                    key={row.transaction_id}
                    data-selected={isSelected ? "true" : "false"}
                    className={isSelected ? "bg-muted/50" : undefined}
                  >
                    <TableCell className="w-8">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(row.transaction_id)}
                        aria-label={`Select row ${row.transaction_id}`}
                      />
                    </TableCell>
                    {ALL_COLUMNS.filter((c) => isColumnVisible(c.id)).map(
                      (col) => {
                        const value = col.accessor(row);
                        return (
                          <TableCell
                            key={col.id}
                            className={
                              col.numeric
                                ? "text-right font-medium tabular-nums"
                                : undefined
                            }
                          >
                            {value}
                          </TableCell>
                        );
                      },
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="hidden text-sm text-muted-foreground lg:block">
          {selected.size} of {currentPageRows.length} on this page selected. |{" "}
          Total loaded: {allRows.length}
        </div>
        <div className="flex w-full items-center gap-6 lg:w-fit">
          <div className="flex items-center gap-2 text-sm font-medium">
            Page {pageIndex + 1} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={firstPage}
              disabled={pageIndex === 0 || loading}
            >
              <IconChevronsLeft />
              <span className="sr-only">First page</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 p-0"
              onClick={prevPage}
              disabled={pageIndex === 0 || loading}
            >
              <IconChevronLeft />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 p-0"
              onClick={nextPage}
              disabled={pageIndex >= pageCount - 1 || loading}
            >
              <IconChevronRight />
              <span className="sr-only">Next page</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={lastPage}
              disabled={pageIndex >= pageCount - 1 || loading}
            >
              <IconChevronsRight />
              <span className="sr-only">Last page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
