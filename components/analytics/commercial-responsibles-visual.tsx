"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { IconRefresh } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { cn } from "@/lib/utils";

type SalesChannel = "all" | "direct" | "indirect";
type TimeView = "yearly" | "monthly";

type PeriodBucket = {
  period: string;
  year: number;
  month: number | null;
  salesValue: number;
  quantity: number;
  deltaSalesValue: number | null;
  deltaQuantity: number | null;
};

type CommercialRow = {
  commercialResponsible: string;
  totalSalesValue: number;
  totalQuantity: number;
  shareOfSalesValue: number | null;
  shareOfQuantity: number | null;
  series: PeriodBucket[];
};

type ApiPayload = {
  rows: CommercialRow[];
  filters: {
    year: {
      selected: number | null;
      options: number[];
    };
    salesChannel: {
      selected: SalesChannel;
      options: SalesChannel[];
    };
    view: {
      selected: TimeView;
      options: TimeView[];
    };
  };
  totals: {
    quantity: number;
    salesValue: number;
  };
  metadata: {
    generatedAt: string;
    orderBy: "sales" | "quantity" | "name";
    limit: number | null;
  };
};

type SortKey =
  | "commercialResponsible"
  | "totalSalesValue"
  | "totalQuantity"
  | "shareOfSalesValue"
  | "shareOfQuantity";

type SortDirection = "asc" | "desc";

const COLOR_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#db2777",
  "#0ea5e9",
  "#ea580c",
  "#15803d",
] as const;

const DEFAULT_SELECTION_COUNT = 3;

const currencyFormatter = (() => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
  } catch {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  }
})();

const currencyCompactFormatter = (() => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 1,
      notation: "compact",
    });
  } catch {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" });
  }
})();

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function formatCurrency(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  try {
    return currencyFormatter.format(value ?? 0);
  } catch {
    return numberFormatter.format(value ?? 0);
  }
}

function formatCurrencyCompact(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  try {
    return currencyCompactFormatter.format(value ?? 0);
  } catch {
    return compactNumberFormatter.format(value ?? 0);
  }
}

function formatNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return numberFormatter.format(value ?? 0);
}

function formatNumberCompact(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return compactNumberFormatter.format(value ?? 0);
}

function formatDeltaCurrency(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const v = value ?? 0;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(v))}`;
}

function formatDeltaNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const v = value ?? 0;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(v))}`;
}

function formatMonthLabel(period: string): string {
  // expects YYYY-MM
  const [y, m] = period.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return period;
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  try {
    return date.toLocaleString(undefined, { month: "short" });
  } catch {
    return period;
  }
}

function toFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function buildSeriesKey(name: string, indexHint: number): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const uniqueSlug = String(indexHint)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug.length ? `cr-${slug}` : "cr-unknown";
  return uniqueSlug.length ? `${base}-${uniqueSlug}` : base;
}

function getSortDefaultDirection(key: SortKey): SortDirection {
  switch (key) {
    case "totalSalesValue":
    case "totalQuantity":
    case "shareOfSalesValue":
    case "shareOfQuantity":
      return "desc";
    case "commercialResponsible":
    default:
      return "asc";
  }
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "accent", numeric: true });
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function sortRows(rows: CommercialRow[], sort: { key: SortKey; direction: SortDirection }): CommercialRow[] {
  const dir = sort.direction === "asc" ? 1 : -1;

  const sorted = [...rows].sort((a, b) => {
    let d = 0;

    switch (sort.key) {
      case "commercialResponsible":
        d = compareStrings(a.commercialResponsible, b.commercialResponsible);
        break;
      case "totalSalesValue":
        d = compareNumbers(a.totalSalesValue ?? 0, b.totalSalesValue ?? 0);
        break;
      case "totalQuantity":
        d = compareNumbers(a.totalQuantity ?? 0, b.totalQuantity ?? 0);
        break;
      case "shareOfSalesValue":
        d = compareNumbers(a.shareOfSalesValue ?? -Infinity, b.shareOfSalesValue ?? -Infinity);
        break;
      case "shareOfQuantity":
        d = compareNumbers(a.shareOfQuantity ?? -Infinity, b.shareOfQuantity ?? -Infinity);
        break;
      default:
        d = 0;
    }

    if (d !== 0) return d * dir;

    // stable-ish fallback
    return (
      compareStrings(a.commercialResponsible, b.commercialResponsible) ||
      compareNumbers(a.totalSalesValue ?? 0, b.totalSalesValue ?? 0) * -1 ||
      compareNumbers(a.totalQuantity ?? 0, b.totalQuantity ?? 0) * -1
    );
  });

  return sorted;
}

function buildChartData(
  selected: Array<{ key: string; name: string; series: PeriodBucket[] }>,
  view: TimeView,
): Array<Record<string, unknown>> {
  if (selected.length === 0) return [];

  const periodSet = new Set<string>();
  for (const s of selected) {
    for (const b of s.series) {
      periodSet.add(b.period);
    }
  }

  const periods = Array.from(periodSet).sort((a, b) => {
    // For yearly: numeric string
    // For monthly: YYYY-MM sorts lexicographically correctly
    if (view === "yearly") return Number(a) - Number(b);
    return a.localeCompare(b);
  });

  return periods.map((period) => {
    const row: Record<string, unknown> = { period };

    for (const s of selected) {
      const match = s.series.find((x) => x.period === period);
      row[`${s.key}__salesValue`] = match?.salesValue ?? 0;
      row[`${s.key}__quantity`] = match?.quantity ?? 0;
      row[`${s.key}__deltaSalesValue`] = match?.deltaSalesValue ?? null;
      row[`${s.key}__deltaQuantity`] = match?.deltaQuantity ?? null;
      row[`${s.key}__hasData`] = !!match;
    }

    return row;
  });
}

export function CommercialResponsiblesVisual() {
  const [payload, setPayload] = React.useState<ApiPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [salesChannel, setSalesChannel] = React.useState<SalesChannel>("all");
  const [year, setYear] = React.useState<string>("all");
  const [view, setView] = React.useState<TimeView>("yearly");

  const [refreshIndex, setRefreshIndex] = React.useState(0);

  const [selectedNames, setSelectedNames] = React.useState<Set<string>>(() => new Set());

  const [chartMetric, setChartMetric] = React.useState<"salesValue" | "quantity">("salesValue");

  const [sort, setSort] = React.useState<{ key: SortKey; direction: SortDirection }>(() => ({
    key: "totalSalesValue",
    direction: "desc",
  }));

  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("salesChannel", salesChannel);
        params.set("year", year);
        params.set("view", view);
        // default table sort should be by sales; backend supports this metadata
        params.set("orderBy", "sales");

        const response = await fetch(`/api/analytics/commercial-responsibles?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const json = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            json && typeof json === "object" && "error" in json && typeof json.error === "string"
              ? json.error
              : `Failed to load commercial responsibles analytics (status ${response.status}).`;
          throw new Error(message);
        }

        if (controller.signal.aborted) return;

        const data = json as ApiPayload;
        setPayload(data);
      } catch (e) {
        if (controller.signal.aborted) return;
        setPayload(null);
        setError(e instanceof Error ? e.message : "Unexpected error while loading data.");
      } finally {
        if (controller.signal.aborted) return;
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [salesChannel, year, view, refreshIndex]);

  const yearOptions = React.useMemo(() => {
    const options = payload?.filters.year.options ?? [];
    // render as strings for Select
    return ["all", ...options.map((y) => String(y))];
  }, [payload]);

  const rows = payload?.rows ?? [];

  // Apply client-side sorting (requirement: sortable table)
  const sortedRows = React.useMemo(() => sortRows(rows, sort), [rows, sort]);

  // Ensure default selection: first 3 by sales value (after filters, and after sorting by sales desc).
  React.useEffect(() => {
    if (!payload) return;
    if (rows.length === 0) {
      setSelectedNames((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    // If current selection still valid and non-empty, keep it.
    const allowed = new Set(rows.map((r) => r.commercialResponsible));
    setSelectedNames((prev) => {
      const filtered = new Set(Array.from(prev).filter((n) => allowed.has(n)));
      if (filtered.size > 0) return filtered;

      const top3 = [...rows]
        .sort((a, b) => (b.totalSalesValue ?? 0) - (a.totalSalesValue ?? 0))
        .slice(0, Math.min(DEFAULT_SELECTION_COUNT, rows.length))
        .map((r) => r.commercialResponsible);

      return new Set(top3);
    });
  }, [payload, rows]);

  const selectedRows = React.useMemo(() => {
    return sortedRows.filter((r) => selectedNames.has(r.commercialResponsible));
  }, [sortedRows, selectedNames]);

  const seriesDefinitions = React.useMemo(() => {
    const list = selectedRows.map((r, idx) => {
      const key = buildSeriesKey(r.commercialResponsible, idx);
      const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      return {
        key,
        name: r.commercialResponsible,
        color,
        series: r.series ?? [],
      };
    });

    return list;
  }, [selectedRows]);

  const chartConfig = React.useMemo(() => {
    return seriesDefinitions.reduce<Record<string, { label: string; color: string }>>((acc, s) => {
      // We define config for both metrics (sales/qty) for legend styling.
      acc[`${s.key}__salesValue`] = { label: s.name, color: s.color };
      acc[`${s.key}__quantity`] = { label: s.name, color: s.color };
      return acc;
    }, {});
  }, [seriesDefinitions]);

  const tooltipNameByDataKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seriesDefinitions) {
      map.set(`${s.key}__salesValue`, s.name);
      map.set(`${s.key}__quantity`, s.name);
      map.set(`${s.key}__deltaSalesValue`, s.name);
      map.set(`${s.key}__deltaQuantity`, s.name);
    }
    return map;
  }, [seriesDefinitions]);

  const chartData = React.useMemo(() => buildChartData(seriesDefinitions, view), [seriesDefinitions, view]);

  const totals = payload?.totals ?? null;

  const selectedSummary = `${selectedRows.length} selected of ${rows.length}`;

  const description = React.useMemo(() => {
    const yearPart = year === "all" ? "All years" : `Year ${year}`;
    const viewPart = view === "yearly" ? "Yearly view" : "Monthly view";
    const channelPart =
      salesChannel === "all" ? "All sales" : salesChannel === "direct" ? "Direct sales" : "Indirect sales";
    return `${channelPart} · ${yearPart} · ${viewPart}`;
  }, [salesChannel, year, view]);

  const handleToggleSelected = React.useCallback((name: string, nextChecked: boolean) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (nextChecked) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  const handleSort = React.useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: getSortDefaultDirection(key) };
    });
  }, []);

  const ariaSort = React.useCallback(
    (key: SortKey): React.AriaAttributes["aria-sort"] => {
      if (sort.key !== key) return "none";
      return sort.direction === "asc" ? "ascending" : "descending";
    },
    [sort],
  );

  const sortIndicator = React.useCallback(
    (key: SortKey) => {
      if (sort.key !== key) return null;
      return <span className="text-xs text-muted-foreground">{sort.direction === "asc" ? "▲" : "▼"}</span>;
    },
    [sort],
  );

  const yAxisTickFormatter = React.useCallback(
    (v: unknown) => {
      const n = toFiniteNumber(v);
      return chartMetric === "salesValue" ? formatCurrencyCompact(n) : formatNumberCompact(n);
    },
    [chartMetric],
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-2">
          <CardTitle>Commercial Responsibles Overview</CardTitle>
          <CardDescription>
            Statistics by <span className="font-medium">commercial_responsible</span> · {description}
          </CardDescription>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal">
              Total value: {formatCurrency(totals?.salesValue ?? 0)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Total quantity: {formatNumber(totals?.quantity ?? 0)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Chart metric: {chartMetric === "salesValue" ? "Sales value" : "Quantity"}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {selectedSummary}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={salesChannel} onValueChange={(v) => setSalesChannel(v as SalesChannel)}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue placeholder="Sales channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sales</SelectItem>
                <SelectItem value="direct">Direct sales</SelectItem>
                <SelectItem value="indirect">Indirect sales</SelectItem>
              </SelectContent>
            </Select>

            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y === "all" ? "All years" : y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={view} onValueChange={(v) => setView(v as TimeView)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="View" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>

            <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as "salesValue" | "quantity")}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="salesValue">Sales value</SelectItem>
                <SelectItem value="quantity">Quantity</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setRefreshIndex((v) => v + 1)}
              className="inline-flex items-center gap-1"
            >
              <IconRefresh className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 pb-0 md:pb-2">
        <div className="space-y-2">
          {loading ? (
            <div className="grid h-80 place-items-center rounded-lg border border-dashed border-muted">
              <span className="text-sm text-muted-foreground">Loading commercial responsibles…</span>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="grid h-80 place-items-center rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 text-center text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && !error ? (
            <>
              {seriesDefinitions.length === 0 ? (
                <div className="grid h-80 place-items-center rounded-lg border border-dashed border-muted bg-muted/10 px-4 text-center text-sm text-muted-foreground">
                  Select at least one commercial responsible to display their {view === "yearly" ? "yearly" : "monthly"}{" "}
                  trend.
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-80 w-full">
                  <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="period"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      tickFormatter={(value) => {
                        const s = String(value ?? "");
                        return view === "monthly" ? formatMonthLabel(s) : s;
                      }}
                    />
                    <YAxis width={84} tickLine={false} axisLine={false} tickFormatter={yAxisTickFormatter} />
                    <ChartTooltip
                      cursor={{ strokeDasharray: "4 4" }}
                      content={
                        <ChartTooltipContent
                          indicator="dot"
                          labelFormatter={(label, payloadItems) => {
                            const first = Array.isArray(payloadItems) ? payloadItems[0] : undefined;
                            const rawPeriod =
                              first && typeof first.payload === "object" && first.payload
                                ? (first.payload as any).period
                                : label;

                            const period = String(rawPeriod ?? "");

                            if (view === "yearly") return `Year ${period}`;
                            // monthly
                            const yearPart = period.split("-")[0] ?? period;
                            const monthLabel = formatMonthLabel(period);
                            return `${monthLabel} ${yearPart}`;
                          }}
                          formatter={(value, name, item) => {
                            const dataKey = typeof name === "string" ? name : String(name ?? "");
                            // ChartTooltipContent's formatter signature doesn't give us stable access to sibling fields,
                            // so we encode all tooltip fields directly as their own data keys in chartData.
                            const seriesName = tooltipNameByDataKey.get(dataKey) ?? "";

                            const isSales = dataKey.endsWith("__salesValue");
                            const isQty = dataKey.endsWith("__quantity");
                            const isDeltaSales = dataKey.endsWith("__deltaSalesValue");
                            const isDeltaQty = dataKey.endsWith("__deltaQuantity");

                            const v = toFiniteNumber(value);

                            if (isSales) {
                              return seriesName ? `${seriesName} · Sales: ${formatCurrency(v)}` : `Sales: ${formatCurrency(v)}`;
                            }

                            if (isQty) {
                              return seriesName ? `${seriesName} · Quantity: ${formatNumber(v)}` : `Quantity: ${formatNumber(v)}`;
                            }

                            if (isDeltaSales) {
                              // note: for tooltip we want delta vs previous in same series, which API provides.
                              return seriesName
                                ? `${seriesName} · Δ sales: ${formatDeltaCurrency(value as any)}`
                                : `Δ sales: ${formatDeltaCurrency(value as any)}`;
                            }

                            if (isDeltaQty) {
                              return seriesName
                                ? `${seriesName} · Δ qty: ${formatDeltaNumber(value as any)}`
                                : `Δ qty: ${formatDeltaNumber(value as any)}`;
                            }

                            // fallback
                            return seriesName ? `${seriesName} · ${String(value ?? "—")}` : String(value ?? "—");
                          }}
                        />
                      }
                    />
                    <ChartLegend verticalAlign="bottom" content={<ChartLegendContent />} />

                    {seriesDefinitions.map((s) => {
                      const dataKey = chartMetric === "salesValue" ? `${s.key}__salesValue` : `${s.key}__quantity`;
                      return (
                        <Line
                          key={dataKey}
                          type="monotone"
                          dataKey={dataKey}
                          stroke={`var(--color-${dataKey})`}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          animationDuration={300}
                        />
                      );
                    })}
                  </LineChart>
                </ChartContainer>
              )}
            </>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Commercial responsibles</h3>
            <span className="text-xs text-muted-foreground">Tick rows to compare them in the chart above.</span>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40 tracking-wide text-muted-foreground">
                <TableRow>
                  <TableHead className="w-12 text-left">Select</TableHead>

                  <TableHead className="min-w-48 text-left" aria-sort={ariaSort("commercialResponsible")}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-start gap-1"
                      onClick={() => handleSort("commercialResponsible")}
                    >
                      Commercial responsible {sortIndicator("commercialResponsible")}
                    </button>
                  </TableHead>

                  <TableHead className="w-40 text-right" aria-sort={ariaSort("totalSalesValue")}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-end gap-1"
                      onClick={() => handleSort("totalSalesValue")}
                    >
                      Sales value {sortIndicator("totalSalesValue")}
                    </button>
                  </TableHead>

                  <TableHead className="w-32 text-right" aria-sort={ariaSort("totalQuantity")}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-end gap-1"
                      onClick={() => handleSort("totalQuantity")}
                    >
                      Quantity {sortIndicator("totalQuantity")}
                    </button>
                  </TableHead>

                  <TableHead className="w-28 text-right" aria-sort={ariaSort("shareOfSalesValue")}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-end gap-1"
                      onClick={() => handleSort("shareOfSalesValue")}
                    >
                      Share (value) {sortIndicator("shareOfSalesValue")}
                    </button>
                  </TableHead>

                  <TableHead className="w-28 text-right" aria-sort={ariaSort("shareOfQuantity")}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-end gap-1"
                      onClick={() => handleSort("shareOfQuantity")}
                    >
                      Share (qty) {sortIndicator("shareOfQuantity")}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {loading ? "Loading…" : "No commercial responsible data available for the selected filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((r) => {
                    const isSelected = selectedNames.has(r.commercialResponsible);

                    const salesCellClass = cn(
                      "text-right font-mono text-sm",
                      chartMetric === "salesValue" && "text-primary font-semibold",
                    );

                    const qtyCellClass = cn(
                      "text-right font-mono text-sm",
                      chartMetric === "quantity" && "text-primary font-semibold",
                    );

                    const shareSales = Number.isFinite(r.shareOfSalesValue ?? NaN) ? (r.shareOfSalesValue as number) : null;
                    const shareQty = Number.isFinite(r.shareOfQuantity ?? NaN) ? (r.shareOfQuantity as number) : null;

                    return (
                      <TableRow
                        key={r.commercialResponsible}
                        className={cn("cursor-pointer transition-colors", isSelected && "bg-muted/60")}
                        onClick={() => handleToggleSelected(r.commercialResponsible, !isSelected)}
                      >
                        <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(v) => handleToggleSelected(r.commercialResponsible, v === true)}
                            aria-label={`Select ${r.commercialResponsible}`}
                          />
                        </TableCell>

                        <TableCell className="pr-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{r.commercialResponsible}</span>
                            {isSelected ? <span className="text-xs text-primary">Included in chart</span> : null}
                          </div>
                        </TableCell>

                        <TableCell className={salesCellClass}>{formatCurrency(r.totalSalesValue)}</TableCell>
                        <TableCell className={qtyCellClass}>{formatNumber(r.totalQuantity)}</TableCell>

                        <TableCell className="text-right text-sm text-muted-foreground">
                          {shareSales === null ? "—" : percentFormatter.format(shareSales)}
                        </TableCell>

                        <TableCell className="text-right text-sm text-muted-foreground">
                          {shareQty === null ? "—" : percentFormatter.format(shareQty)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Hover a point in the chart to see: sales value, quantity, Δ sales vs previous period, and Δ quantity vs
            previous period.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default CommercialResponsiblesVisual;
