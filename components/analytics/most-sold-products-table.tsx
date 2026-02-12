"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ApiResponse = {
  filters: {
    year: {
      selected: string;
      options: string[];
    };
    category: {
      selected: string;
      options: string[];
    };
  };
  rows: MostSoldProductRow[];
  summary: {
    totalCategories: number;
    totalQuantityTopProducts: number;
    totalRows: number;
    generatedAt: string;
  };
};

type MostSoldProductRow = {
  productCategory: string;
  productReference: string;
  productFamily: string | null;
  totalQuantity: number;
  categoryTotalQuantity: number;
  shareWithinCategory: number | null;
  rankWithinCategory: number;
};

type SummaryMetrics = ApiResponse["summary"];

type SortKey =
  | "rankWithinCategory"
  | "productCategory"
  | "productReference"
  | "productFamily"
  | "totalQuantity"
  | "categoryTotalQuantity"
  | "shareWithinCategory";

type SortConfig = {
  key: SortKey;
  direction: "asc" | "desc";
};

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  style: "decimal",
  maximumFractionDigits: 0,
});

const PERCENT_FORMAT = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return NUMBER_FORMAT.format(value);
}

function formatShare(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return PERCENT_FORMAT.format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "–";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function MostSoldProductsTable() {
  const [rows, setRows] = useState<MostSoldProductRow[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>(["all"]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(["all"]);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "totalQuantity",
    direction: "desc",
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("year", selectedYear);
        params.set("category", selectedCategory);

        const response = await fetch(
          `/api/analytics/most-sold-products?${params.toString()}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          const json = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const message =
            json?.error ||
            `Failed to load analytics (status ${response.status})`;
          throw new Error(message);
        }

        const payload = (await response.json()) as ApiResponse;

        if (cancelled) return;

        const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
        const nextSummary =
          payload.summary && typeof payload.summary === "object"
            ? payload.summary
            : null;
        const nextYearOptions = Array.isArray(payload.filters?.year?.options)
          ? payload.filters.year.options
          : ["all"];
        const nextCategoryOptions = Array.isArray(
          payload.filters?.category?.options,
        )
          ? payload.filters.category.options
          : ["all"];

        setRows(nextRows);
        setSummary(nextSummary);
        setSelectedYear(payload.filters?.year?.selected ?? "all");
        setSelectedCategory(payload.filters?.category?.selected ?? "all");
        setYearOptions(nextYearOptions);
        setCategoryOptions(nextCategoryOptions);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Unexpected error while loading analytics.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [selectedYear, selectedCategory, refreshToken]);

  const hasRows = rows.length > 0;
  const totalQuantity = summary?.totalQuantityTopProducts ?? 0;

  const totalRows = summary?.totalRows ?? rows.length;

  const getDefaultSortDirection = (key: SortKey): "asc" | "desc" => {
    switch (key) {
      case "totalQuantity":
      case "categoryTotalQuantity":
      case "shareWithinCategory":
        return "desc";
      default:
        return "asc";
    }
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,

          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,

        direction: getDefaultSortDirection(key),
      };
    });
  };

  const getAriaSort = (key: SortKey): "ascending" | "descending" | "none" => {
    if (sortConfig.key !== key) return "none";
    return sortConfig.direction === "asc" ? "ascending" : "descending";
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return null;

    return (
      <span className="text-xs text-muted-foreground">
        {sortConfig.direction === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const headerDescription = useMemo(() => {
    const periodLabel =
      selectedYear === "all" ? "All time" : `Year ${selectedYear}`;
    const categoryLabel =
      selectedCategory === "all" ? "All categories" : selectedCategory;

    return `${periodLabel} · ${categoryLabel}`;
  }, [selectedYear, selectedCategory]);

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortConfig.direction === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      let result = 0;

      switch (sortConfig.key) {
        case "rankWithinCategory":
          result = a.rankWithinCategory - b.rankWithinCategory;
          break;
        case "productCategory":
          result = a.productCategory.localeCompare(b.productCategory);
          break;
        case "productReference":
          result = a.productReference.localeCompare(b.productReference);
          break;
        case "productFamily":
          result = (a.productFamily ?? "").localeCompare(b.productFamily ?? "");
          break;
        case "totalQuantity":
          result = (a.totalQuantity ?? 0) - (b.totalQuantity ?? 0);
          break;
        case "categoryTotalQuantity":
          result =
            (a.categoryTotalQuantity ?? 0) - (b.categoryTotalQuantity ?? 0);
          break;
        case "shareWithinCategory":
          result =
            (a.shareWithinCategory ?? Number.NEGATIVE_INFINITY) -
            (b.shareWithinCategory ?? Number.NEGATIVE_INFINITY);
          break;
      }

      if (result !== 0) {
        return result * directionMultiplier;
      }

      // deterministic tie-breaker
      result = a.productCategory.localeCompare(b.productCategory);
      if (result !== 0) return result;

      result = a.productReference.localeCompare(b.productReference);
      if (result !== 0) return result;

      return (a.productFamily ?? "").localeCompare(b.productFamily ?? "");
    });
  }, [rows, sortConfig]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            Most Sold Products by Category
          </h2>

          <p className="text-sm text-muted-foreground">
            Top 5 products per category · {headerDescription}
          </p>

          {summary ? (
            <p className="text-xs text-muted-foreground">
              Categories:{" "}
              <span className="font-medium">{summary.totalCategories}</span> |
              Rows shown:{" "}
              <span className="font-medium">{formatCount(totalRows)}</span> |
              Cumulative quantity:{" "}
              <span className="font-medium">{formatCount(totalQuantity)}</span>{" "}
              | Generated {formatDateTime(summary.generatedAt)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedYear}
            onValueChange={(value) => {
              setSelectedYear(value);
            }}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {year === "all" ? "All time" : year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedCategory}
            onValueChange={(value) => {
              setSelectedCategory(value);
            }}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === "all" ? "All categories" : category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setRefreshToken((token) => token + 1)}
          >
            <IconRefresh className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead
                className="w-16 text-right"
                aria-sort={getAriaSort("rankWithinCategory")}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-end gap-1"
                  onClick={() => handleSort("rankWithinCategory")}
                >
                  #{renderSortIndicator("rankWithinCategory")}
                </button>
              </TableHead>
              <TableHead
                className="w-[220px]"
                aria-sort={getAriaSort("productCategory")}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-start gap-1"
                  onClick={() => handleSort("productCategory")}
                >
                  Catégorie
                  {renderSortIndicator("productCategory")}
                </button>
              </TableHead>
              <TableHead
                className="w-60"
                aria-sort={getAriaSort("productReference")}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-start gap-1"
                  onClick={() => handleSort("productReference")}
                >
                  Produit
                  {renderSortIndicator("productReference")}
                </button>
              </TableHead>
              <TableHead aria-sort={getAriaSort("productFamily")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-start gap-1"
                  onClick={() => handleSort("productFamily")}
                >
                  Famille produit
                  {renderSortIndicator("productFamily")}
                </button>
              </TableHead>
              <TableHead
                className="text-right"
                aria-sort={getAriaSort("totalQuantity")}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-end gap-1"
                  onClick={() => handleSort("totalQuantity")}
                >
                  Quantité livrée et facturée
                  {renderSortIndicator("totalQuantity")}
                </button>
              </TableHead>
              <TableHead
                className="text-right"
                aria-sort={getAriaSort("categoryTotalQuantity")}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-end gap-1"
                  onClick={() => handleSort("categoryTotalQuantity")}
                >
                  Total catégorie
                  {renderSortIndicator("categoryTotalQuantity")}
                </button>
              </TableHead>
              <TableHead
                className="text-right"
                aria-sort={getAriaSort("shareWithinCategory")}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-end gap-1"
                  onClick={() => handleSort("shareWithinCategory")}
                >
                  % de la catégorie
                  {renderSortIndicator("shareWithinCategory")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm">
                  Loading analytics…
                </TableCell>
              </TableRow>
            ) : null}

            {!loading && error ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : null}

            {!loading && !error && !hasRows ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm">
                  No data available for the selected filters.
                </TableCell>
              </TableRow>
            ) : null}

            {!loading &&
              !error &&
              sortedRows.map((row) => (
                <TableRow
                  key={`${row.productCategory}-${row.productReference}-${row.rankWithinCategory}`}
                >
                  <TableCell className="text-right font-medium tabular-nums">
                    {row.rankWithinCategory}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="px-1.5">
                      {row.productCategory}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.productReference || "N/A"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.productFamily || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCount(row.totalQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCount(row.categoryTotalQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatShare(row.shareWithinCategory)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default MostSoldProductsTable;
