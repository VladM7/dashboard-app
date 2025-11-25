"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const description = "An interactive area chart for net profit margin";

type Period = {
  total_net_margin_eur: number;
  row_count: number;
  start_date: string;
  end_date: string;
};

type MetricsResponse = {
  currency: string;
  periods: {
    last_12_months: Period;
    last_6_months: Period;
    last_3_months: Period;
    last_1_month: Period;
  };
  monthly_series_12m: {
    month: string;
    total_net_margin_eur: number;
    sales_altona: number;
  }[];
  daily_series_3m: {
    date: string;
    total_net_margin_eur: number;
    sales_altona: number;
  }[];
  daily_series_1m: {
    date: string;
    total_net_margin_eur: number;
    sales_altona: number;
  }[];
  weekly_series_3m: {
    week_start: string;
    total_net_margin_eur: number;
    sales_altona: number;
  }[];
  weekly_series_1m: {
    week_start: string;
    total_net_margin_eur: number;
    sales_altona: number;
  }[];
};

function formatCurrency(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

const chartConfig = {
  net_margin: {
    label: "Net margin (EUR)",
    color: "var(--primary)",
  },
  sales_altona: {
    label: "Sales (EUR)",
    color: "var(--tertiary)",
  },
} satisfies ChartConfig;

export function ChartAreaInteractive() {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState<"12m" | "6m" | "3m" | "1m">(
    "12m",
  );
  // Granularity only applies to 3m and 1m ranges
  const [granularity, setGranularity] = React.useState<"daily" | "weekly">(
    "daily",
  );
  const [metrics, setMetrics] = React.useState<MetricsResponse | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isMobile) setTimeRange("3m");
  }, [isMobile]);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchMetrics() {
      try {
        setLoading(true);
        const res = await fetch("/api/metrics/net-margin", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: MetricsResponse = await res.json();
        if (!cancelled) {
          setMetrics(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset granularity if switching to a range where weekly doesn't apply
  React.useEffect(() => {
    if (timeRange === "6m" || timeRange === "12m") {
      setGranularity("daily");
    }
  }, [timeRange]);

  const currency = metrics?.currency ?? "EUR";

  // Removed unused monthsToShow variable (was previously computing months for slicing)

  const filteredData = React.useMemo(() => {
    if (!metrics) return [];
    // Monthly ranges
    if (timeRange === "12m" || timeRange === "6m") {
      return (metrics.monthly_series_12m ?? [])
        .slice(-(timeRange === "12m" ? 12 : 6))
        .map((d) => ({
          month: d.month,
          net_margin: d.total_net_margin_eur,
          sales_altona: d.sales_altona,
        }));
    }
    // 3m range
    if (timeRange === "3m") {
      if (granularity === "weekly") {
        return (metrics.weekly_series_3m ?? []).map((d) => ({
          week_start: d.week_start,
          net_margin: d.total_net_margin_eur,
          sales_altona: d.sales_altona,
        }));
      }
      return (metrics.daily_series_3m ?? []).map((d) => ({
        date: d.date,
        net_margin: d.total_net_margin_eur,
        sales_altona: d.sales_altona,
      }));
    }
    // 1m range
    if (timeRange === "1m") {
      if (granularity === "weekly") {
        return (metrics.weekly_series_1m ?? []).map((d) => ({
          week_start: d.week_start,
          net_margin: d.total_net_margin_eur,
          sales_altona: d.sales_altona,
        }));
      }
      return (metrics.daily_series_1m ?? []).map((d) => ({
        date: d.date,
        net_margin: d.total_net_margin_eur,
        sales_altona: d.sales_altona,
      }));
    }
    return [];
  }, [metrics, timeRange, granularity]);

  const selectedTotal = React.useMemo(() => {
    if (!metrics) return 0;
    switch (timeRange) {
      case "12m":
        return metrics.periods.last_12_months.total_net_margin_eur;
      case "6m":
        return metrics.periods.last_6_months.total_net_margin_eur;
      case "3m":
        return metrics.periods.last_3_months.total_net_margin_eur;
      case "1m":
        return metrics.periods.last_1_month.total_net_margin_eur;
      default:
        return 0;
    }
  }, [metrics, timeRange]);

  const rangeLabel: Record<"12m" | "6m" | "3m" | "1m", string> = {
    "12m": "Last 12 months",
    "6m": "Last 6 months",
    "3m": "Last 3 months",
    "1m": "Last month",
  };

  // Determine axis key and formatting
  const axisKey =
    timeRange === "12m" || timeRange === "6m"
      ? "month"
      : granularity === "weekly"
        ? "week_start"
        : "date";

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{formatCurrency(selectedTotal, currency)}</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Total net profit margin • {rangeLabel[timeRange]}
          </span>
          <span className="@[540px]/card:hidden">{rangeLabel[timeRange]}</span>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v as typeof timeRange)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="12m">12m</ToggleGroupItem>
            <ToggleGroupItem value="6m">6m</ToggleGroupItem>
            <ToggleGroupItem value="3m">3m</ToggleGroupItem>
            <ToggleGroupItem value="1m">1m</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={timeRange}
            onValueChange={(v) => setTimeRange(v as typeof timeRange)}
          >
            <SelectTrigger
              className="flex w-28 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a range"
            >
              <SelectValue placeholder="12m" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="12m">12 months</SelectItem>
              <SelectItem value="6m">6 months</SelectItem>
              <SelectItem value="3m">3 months</SelectItem>
              <SelectItem value="1m">1 month</SelectItem>
            </SelectContent>
          </Select>
          {(timeRange === "3m" || timeRange === "1m") && (
            <ToggleGroup
              type="single"
              value={granularity}
              onValueChange={(v) =>
                v && setGranularity(v as typeof granularity)
              }
              variant="outline"
              className="*:data-[slot=toggle-group-item]:!px-3"
            >
              <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
              <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
            </ToggleGroup>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillNet" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-net_margin)"
                  stopOpacity={0.85}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-net_margin)"
                  stopOpacity={0.12}
                />
              </linearGradient>
              <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-sales_altona)"
                  stopOpacity={0.7}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-sales_altona)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={axisKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              tickFormatter={(value) => {
                const raw = String(value);
                if (axisKey === "month") {
                  const date = new Date(raw + "-01T00:00:00");
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                  });
                }
                // daily or weekly start
                const date = new Date(raw + "T00:00:00");
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    const raw = String(value);
                    if (axisKey === "month") {
                      const date = new Date(raw + "-01T00:00:00");
                      return date.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      });
                    }
                    const date = new Date(raw + "T00:00:00");
                    if (granularity === "weekly") {
                      return `Week of ${date.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}`;
                    }
                    return date.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    });
                  }}
                  formatter={(val, name, item) => {
                    type ChartPoint = {
                      month?: string;
                      date?: string;
                      week_start?: string;
                      net_margin: number;
                      sales_altona: number;
                      [k: string]: unknown;
                    };
                    const valueNum =
                      typeof val === "number" ? val : Number(val);
                    const point = item?.payload as ChartPoint | undefined;
                    const key =
                      point &&
                      (point.month || point.date || point.week_start
                        ? point[axisKey as keyof ChartPoint]
                        : undefined);
                    let prevValue: number | undefined;
                    if (key !== undefined) {
                      const idx = filteredData.findIndex(
                        (p: ChartPoint) =>
                          (p as Record<string, unknown>)[axisKey] === key,
                      );
                      if (idx > 0) {
                        const prevPoint = filteredData[idx - 1] as ChartPoint;
                        prevValue = prevPoint[
                          name === "Net margin (EUR)" || name === "net_margin"
                            ? "net_margin"
                            : "sales_altona"
                        ] as number;
                      }
                    }
                    let pct: string | null = null;
                    if (
                      prevValue !== undefined &&
                      prevValue !== 0 &&
                      Number.isFinite(prevValue)
                    ) {
                      const change =
                        ((valueNum - prevValue) / Math.abs(prevValue)) * 100;
                      pct = `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
                    }
                    return (
                      <span className="flex flex-col text-foreground">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{
                              backgroundColor: (item as { color?: string })
                                ?.color,
                            }}
                          />
                          <span className="font-mono font-medium tabular-nums">
                            {formatCurrency(
                              Number.isFinite(valueNum) ? valueNum : 0,
                              currency,
                            )}
                          </span>
                        </span>
                        {pct && (
                          <span className="text-xs text-muted-foreground">
                            {pct} vs prev
                          </span>
                        )}
                      </span>
                    );
                  }}
                  indicator="dot"
                />
              }
            />

            <Area
              dataKey="net_margin"
              type="monotone"
              fill="url(#fillNet)"
              stroke="var(--color-net_margin)"
            />

            <Area
              dataKey="sales_altona"
              type="monotone"
              fill="url(#fillSales)"
              stroke="var(--color-sales_altona)"
            />

            <ChartLegend
              verticalAlign="bottom"
              content={<ChartLegendContent />}
            />
          </AreaChart>
        </ChartContainer>
        {loading && (
          <div className="text-muted-foreground mt-2 text-xs">Loading…</div>
        )}
        {error && !loading && (
          <div className="text-destructive mt-2 text-xs">Error: {error}</div>
        )}
        {!loading && !error && filteredData.length === 0 && (
          <div className="text-muted-foreground mt-2 text-xs">No data</div>
        )}
      </CardContent>
    </Card>
  );
}
