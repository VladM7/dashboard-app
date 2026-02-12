"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { IconRefresh } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type PartnerKind = "supplier" | "client";
type TopPartnerYearBreakdown = {
  year: number;
  totalQuantity: number;
  totalSalesValue: number;
};
type TopPartner = {
  rank: number;
  partnerName: string;
  totalQuantity: number;
  totalSalesValue: number;
  years: TopPartnerYearBreakdown[];
};
type TopPartnersPayload = {
  kind: PartnerKind;
  partners: TopPartner[];
  availableYears: number[];
  totals: {
    quantity: number;
    salesValue: number;
  };
  metadata: {
    limit: number;
    orderBy: "quantity" | "sales";
    minYear: number | null;
    maxYear: number | null;
    salesChannel: SalesChannel;
  };
};

type SalesChannel = "all" | "direct" | "indirect";

type SalesChannelOption = {
  value: SalesChannel;
  label: string;
};

type KindOption = {
  value: PartnerKind;
  label: string;
  description: string;
};

type MetricType = "quantity" | "sales";

type MetricOption = {
  value: MetricType;
  label: string;
};

const KIND_OPTIONS: KindOption[] = [
  {
    value: "supplier",
    label: "Suppliers",
    description: "Shows the suppliers with the highest purchase volume.",
  },
  {
    value: "client",
    label: "Clients",
    description: "Shows the clients with the highest sales volume.",
  },
];

const KIND_LABELS: Record<PartnerKind, string> = {
  supplier: "Suppliers",
  client: "Clients",
};

const METRIC_OPTIONS: MetricOption[] = [
  { value: "quantity", label: "Quantity" },
  { value: "sales", label: "Sales value" },
];

const SALES_CHANNEL_OPTIONS: SalesChannelOption[] = [
  { value: "all", label: "All" },
  { value: "direct", label: "Indirect sales" },
  { value: "indirect", label: "Direct sales" },
];

const METRIC_LABELS: Record<MetricType, string> = {
  quantity: "Quantity",
  sales: "Sales value",
};

const COLOR_PALETTE = [
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#f97316", // orange-500
  "#7c3aed", // violet-600
  "#db2777", // pink-600
  "#0ea5e9", // sky-500
  "#ea580c", // orange-600
  "#15803d", // green-700
];

const DEFAULT_SELECTION_COUNT = 3;
const TABLE_LIMIT = 5;
const DEFAULT_CURRENCY = "EUR";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

const currencyFormatter = ((): Intl.NumberFormat => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      maximumFractionDigits: 0,
    });
  } catch {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
})();

const currencyCompactFormatter = ((): Intl.NumberFormat => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      maximumFractionDigits: 1,
      notation: "compact",
    });
  } catch {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 1,
      notation: "compact",
    });
  }
})();

function formatQuantity(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return numberFormatter.format(value ?? 0);
}

function formatQuantityCompact(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "0";
  return compactNumberFormatter.format(value ?? 0);
}

function formatCurrency(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  try {
    return currencyFormatter.format(value ?? 0);
  } catch {
    return numberFormatter.format(value ?? 0);
  }
}

function formatCurrencyCompact(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "0";
  try {
    return currencyCompactFormatter.format(value ?? 0);
  } catch {
    return compactNumberFormatter.format(value ?? 0);
  }
}

function formatShare(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN) || (value ?? 0) <= 0) return "—";
  return percentFormatter.format(value ?? 0);
}

function formatMetricCompact(
  value: number | null | undefined,
  metric: MetricType,
): string {
  return metric === "sales"
    ? formatCurrencyCompact(value)
    : formatQuantityCompact(value);
}

function formatMetricTooltipValue(
  value: number | null | undefined,
  metric: MetricType,
): string {
  if (metric === "sales") {
    return formatCurrency(value);
  }
  return `${formatQuantity(value)} units`;
}

function buildSeriesKey(name: string, unique: number | string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const uniqueSlug = String(unique)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug.length ? `partner-${slug}` : "partner-unknown";
  return uniqueSlug.length ? `${base}-${uniqueSlug}` : base;
}

type SeriesDefinition = {
  key: string;
  color: string;
  partner: TopPartner;
};

export function TopPartnersVisual(): ReactNode {
  const [partnerKind, setPartnerKind] = useState<PartnerKind>("supplier");
  const [metric, setMetric] = useState<MetricType>("quantity");
  const [salesChannel, setSalesChannel] = useState<SalesChannel>("all");
  const [payload, setPayload] = useState<TopPartnersPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(
    () => new Set(),
  );
  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("kind", partnerKind);
        params.set("limit", "5");
        params.set("orderBy", metric);
        params.set("salesChannel", salesChannel);

        const response = await fetch(
          `/api/analytics/top-partners?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const json = await response
          .json()
          .catch(
            () => null as unknown as TopPartnersPayload | { error: string },
          );

        if (!response.ok) {
          const message =
            typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof json.error === "string"
              ? json.error
              : `Failed to load top ${KIND_LABELS[partnerKind].toLowerCase()}.`;
          throw new Error(message);
        }

        const data = json as TopPartnersPayload;

        if (controller.signal.aborted) {
          return;
        }

        setPayload(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error while loading data.";
        setError(message);
        setPayload(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [partnerKind, metric, salesChannel, refreshIndex]);

  const tablePartners = useMemo(() => {
    const partners = payload?.partners ?? [];
    const sorted = [...partners].sort((a, b) => {
      const aValue = metric === "sales" ? a.totalSalesValue : a.totalQuantity;
      const bValue = metric === "sales" ? b.totalSalesValue : b.totalQuantity;
      return bValue - aValue;
    });
    return sorted.slice(0, TABLE_LIMIT);
  }, [payload, metric]);

  useEffect(() => {
    if (!tablePartners.length) {
      setSelectedNames((previous) =>
        previous.size === 0 ? previous : new Set(),
      );

      return;
    }

    const allowedNames = tablePartners.map((partner) => partner.partnerName);

    setSelectedNames((previous) => {
      const filtered = allowedNames.filter((name) => previous.has(name));

      if (filtered.length === previous.size && previous.size > 0) {
        return previous;
      }

      if (filtered.length > 0) {
        return new Set(filtered);
      }

      const defaults = allowedNames.slice(
        0,

        Math.min(DEFAULT_SELECTION_COUNT, allowedNames.length),
      );

      return new Set(defaults);
    });
  }, [tablePartners]);

  const selectedPartners = useMemo(
    () =>
      tablePartners.filter((partner) => selectedNames.has(partner.partnerName)),

    [tablePartners, selectedNames],
  );

  const chartSeries: SeriesDefinition[] = useMemo(() => {
    return selectedPartners.map((partner) => {
      const tableIndex = tablePartners.findIndex(
        (row) => row.partnerName === partner.partnerName,
      );
      const paletteIndex = tableIndex >= 0 ? tableIndex : 0;

      return {
        key: buildSeriesKey(
          partner.partnerName,
          tableIndex >= 0 ? tableIndex : partner.rank,
        ),
        color: COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length],
        partner,
      };
    });
  }, [selectedPartners, tablePartners]);

  const chartConfig = useMemo<ChartConfig>(() => {
    return chartSeries.reduce((acc, series) => {
      acc[series.key] = {
        label: series.partner.partnerName,

        color: series.color,
      };

      return acc;
    }, {} as ChartConfig);
  }, [chartSeries]);

  const tooltipNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    chartSeries.forEach((series) => {
      map.set(series.key, series.partner.partnerName);
    });
    return map;
  }, [chartSeries]);

  const chartData = useMemo(() => {
    if (!chartSeries.length) return [];

    const allYears = new Set<number>();
    for (const series of chartSeries) {
      for (const point of series.partner.years) {
        allYears.add(point.year);
      }
    }

    return Array.from(allYears)
      .sort((a, b) => a - b)
      .map((year) => {
        const row: Record<string, number | string> = { year };
        for (const series of chartSeries) {
          const match = series.partner.years.find(
            (entry) => entry.year === year,
          );
          const metricValue =
            metric === "sales"
              ? (match?.totalSalesValue ?? 0)
              : (match?.totalQuantity ?? 0);
          row[series.key] = metricValue;
        }
        return row;
      });
  }, [chartSeries, metric]);

  const totalQuantity = payload?.totals.quantity ?? 0;

  const totalSales = payload?.totals.salesValue ?? 0;

  const totalMetric = metric === "sales" ? totalSales : totalQuantity;

  const metricLabel = METRIC_LABELS[metric];
  const metricTrendLabel = metric === "sales" ? "sales value" : "quantity";
  const selectionSummary = `${selectedPartners.length} selected of ${tablePartners.length}`;

  const handleToggleSelection = useCallback(
    (partnerName: string, nextChecked: boolean) => {
      setSelectedNames((previous) => {
        const allowedNames = new Set(
          tablePartners.map((partner) => partner.partnerName),
        );
        if (!allowedNames.has(partnerName)) {
          return previous;
        }

        const next = new Set(previous);
        if (nextChecked) {
          next.add(partnerName);
        } else {
          next.delete(partnerName);
        }
        return next;
      });
    },
    [tablePartners],
  );

  const handleSelectMetric = useCallback((value: string) => {
    if (value === "quantity" || value === "sales") {
      setMetric(value);
    }
  }, []);

  const handleSelectKind = useCallback((value: string) => {
    if (value === "supplier" || value === "client") {
      setPartnerKind(value);
    }
  }, []);

  const handleSelectSalesChannel = useCallback((value: string) => {
    if (value === "all" || value === "direct" || value === "indirect") {
      setSalesChannel(value);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshIndex((index) => index + 1);
  }, []);

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-2">
          <CardTitle>Top Partners Overview</CardTitle>
          <CardDescription>
            Visualize the yearly quantity or sales value of the leading partners
            and compare their performance side by side.
          </CardDescription>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>
              {
                KIND_OPTIONS.find((option) => option.value === partnerKind)
                  ?.description
              }
            </span>
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-normal">
                Total quantity: {formatQuantity(totalQuantity)}
              </Badge>
              <Badge variant="outline" className="font-normal">
                Total value: {formatCurrency(totalSales)}
              </Badge>
              <Badge variant="outline" className="font-normal">
                Chart metric: {metricLabel}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {selectionSummary}
              </Badge>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={partnerKind} onValueChange={handleSelectKind}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={salesChannel}
              onValueChange={handleSelectSalesChannel}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Sales channel" />
              </SelectTrigger>
              <SelectContent>
                {SALES_CHANNEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
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
          {loading && (
            <div className="grid h-80 place-items-center rounded-lg border border-dashed border-muted">
              <span className="text-sm text-muted-foreground">
                Loading top partners…
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="grid h-80 place-items-center rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {chartSeries.length === 0 ? (
                <div className="grid h-80 place-items-center rounded-lg border border-dashed border-muted bg-muted/10 px-4 text-center text-sm text-muted-foreground">
                  Select at least one{" "}
                  {KIND_LABELS[partnerKind].toLowerCase().slice(0, -1)} to
                  display their yearly {metricTrendLabel} trend.
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-80 w-full">
                  <LineChart
                    data={chartData}
                    margin={{ top: 16, right: 24, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      tickFormatter={(value) => String(value)}
                    />
                    <YAxis
                      width={72}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) =>
                        formatMetricCompact(
                          Number.isFinite(value as number)
                            ? (value as number)
                            : 0,
                          metric,
                        )
                      }
                    />

                    <ChartTooltip
                      cursor={{ strokeDasharray: "4 4" }}
                      content={
                        <ChartTooltipContent
                          indicator="dot"
                          labelFormatter={(_, items) => {
                            const first = Array.isArray(items)
                              ? items[0]
                              : undefined;
                            const rawYear =
                              first && first.payload
                                ? (first.payload as { year?: unknown }).year
                                : undefined;
                            const coercedYear =
                              typeof rawYear === "number"
                                ? rawYear
                                : Number.isFinite(Number(rawYear))
                                  ? Number(rawYear)
                                  : undefined;
                            return coercedYear !== undefined
                              ? `Year ${coercedYear}`
                              : "Year";
                          }}
                          formatter={(value, name) => {
                            const numericValue =
                              typeof value === "number"
                                ? value
                                : Number(value ?? 0);
                            const amount = Number.isFinite(numericValue)
                              ? numericValue
                              : 0;
                            const key =
                              typeof name === "string"
                                ? name
                                : String(name ?? "");
                            const configLabel =
                              typeof name === "string"
                                ? chartConfig[name]?.label
                                : undefined;
                            const configLabelText =
                              typeof configLabel === "string"
                                ? configLabel
                                : "";
                            const friendlyName =
                              tooltipNameByKey.get(key) ||
                              configLabelText ||
                              (typeof name === "string" ? name : "");
                            const prefix =
                              friendlyName && friendlyName.length
                                ? `${friendlyName} · `
                                : "";
                            const formattedValue = formatMetricTooltipValue(
                              amount,
                              metric,
                            );
                            return prefix
                              ? `${prefix}${formattedValue}`
                              : formattedValue;
                          }}
                        />
                      }
                    />

                    <ChartLegend
                      verticalAlign="bottom"
                      content={<ChartLegendContent />}
                    />

                    {chartSeries.map((series) => (
                      <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        stroke={`var(--color-${series.key})`}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        animationDuration={300}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Top {TABLE_LIMIT} {KIND_LABELS[partnerKind]}
            </h3>

            <span className="text-xs text-muted-foreground">
              Tick rows to compare them in the chart above.
            </span>
          </div>

          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span
              className="text-xs font-medium text-muted-foreground"
              id="top-partners-metric-label"
            >
              Metric shown in chart &amp; table · {metricLabel}
            </span>
            <Select value={metric} onValueChange={handleSelectMetric}>
              <SelectTrigger
                aria-labelledby="top-partners-metric-label"
                className="h-9 w-[200px] sm:w-[220px]"
              >
                <SelectValue placeholder="Choose metric" />
              </SelectTrigger>

              <SelectContent>
                {METRIC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40 text-s tracking-wide text-muted-foreground">
                <TableRow>
                  <TableHead className="w-12 text-left">Select</TableHead>
                  <TableHead className="w-16 text-left">Rank</TableHead>
                  <TableHead className="min-w-40">Partner</TableHead>
                  <TableHead
                    className={cn(
                      "w-32 text-right",
                      metric === "quantity" && "text-foreground font-semibold",
                    )}
                  >
                    Quantity
                  </TableHead>
                  <TableHead
                    className={cn(
                      "w-32 text-right",
                      metric === "sales" && "text-foreground font-semibold",
                    )}
                  >
                    Sales value
                  </TableHead>
                  <TableHead className="w-28 text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tablePartners.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {loading
                        ? "Loading…"
                        : `No ${KIND_LABELS[partnerKind]
                            .toLowerCase()
                            .slice(
                              0,
                              -1,
                            )} data available for the selected filters.`}
                    </TableCell>
                  </TableRow>
                )}

                {tablePartners.map((partner) => {
                  const isSelected = selectedNames.has(partner.partnerName);
                  const partnerMetricTotal =
                    metric === "sales"
                      ? partner.totalSalesValue
                      : partner.totalQuantity;
                  const share =
                    totalMetric > 0 ? partnerMetricTotal / totalMetric : null;
                  const quantityCellClass = cn(
                    "text-right font-mono text-sm",
                    metric === "quantity" && "text-primary font-semibold",
                  );
                  const salesCellClass = cn(
                    "text-right font-mono text-sm",
                    metric === "sales" && "text-primary font-semibold",
                  );

                  return (
                    <TableRow
                      key={`${partner.partnerName}-${partner.rank}`}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected && "bg-muted/60",
                      )}
                      onClick={() =>
                        handleToggleSelection(partner.partnerName, !isSelected)
                      }
                    >
                      <TableCell
                        className="w-12"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleToggleSelection(
                              partner.partnerName,
                              checked === true,
                            )
                          }
                          aria-label={`Select ${partner.partnerName}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        #{partner.rank}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {partner.partnerName}
                          </span>
                          {isSelected && (
                            <span className="text-xs text-primary">
                              Included in chart
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={quantityCellClass}>
                        {formatQuantity(partner.totalQuantity)}
                      </TableCell>
                      <TableCell className={salesCellClass}>
                        {formatCurrency(partner.totalSalesValue)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatShare(share)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
