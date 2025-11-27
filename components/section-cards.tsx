import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";

import type {
  DashboardSummaryJson,
  DeltaSummary,
  SummaryCardId,
  TrendDirection,
} from "@/lib/metrics/dashboard-summary";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SUMMARY_MONTHS_AGO = 1;

type StatCard = {
  id: string;
  label: string;
  value: string;
  delta?: {
    value: string;
    direction: TrendDirection;
    message: string;
  };
  footerPrimary: string;
  footerSecondary?: string;
};

type ApiSummaryCard = DashboardSummaryJson["cards"][number];

async function fetchDashboardSummary(): Promise<DashboardSummaryJson | null> {
  try {
    const baseUrl = getBaseUrl();
    const endpoint = new URL(
      `/api/dashboard/summary?monthsAgo=${SUMMARY_MONTHS_AGO}`,
      baseUrl,
    ).toString();

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 300,
      },
    });

    if (!response.ok) {
      console.error(
        "[SectionCards] Failed to fetch dashboard summary:",
        response.statusText,
      );
      return null;
    }

    return (await response.json()) as DashboardSummaryJson;
  } catch (error) {
    console.error("[SectionCards] Error fetching dashboard summary:", error);
    return null;
  }
}

function getBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.API_BASE_URL;

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.length > 0) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

function findCard(
  summary: DashboardSummaryJson | null,
  id: SummaryCardId,
): ApiSummaryCard | undefined {
  return summary?.cards.find((card) => card.id === id);
}

function formatUnitValue(unit: ApiSummaryCard["unit"], value: number): string {
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value, { fractionDigits: 1 });
    case "number":
    default:
      return formatNumber(value);
  }
}

function formatCardValue(card: ApiSummaryCard | undefined): string {
  if (!card || card.currentValue === null || card.currentValue === undefined) {
    return "—";
  }
  return formatUnitValue(card.unit, card.currentValue);
}

function buildPreviousValueLabel(
  card: ApiSummaryCard | undefined,
  previousLabel: string,
): string {
  if (
    !card ||
    card.previousValue === null ||
    card.previousValue === undefined
  ) {
    return `Previous month (${previousLabel}): —`;
  }
  return `Previous month (${previousLabel}): ${formatUnitValue(
    card.unit,
    card.previousValue,
  )}`;
}

function buildDelta(
  delta: DeltaSummary | null | undefined,
  options?: {
    fractionDigits?: number;
    suffix?: string;
    message?: string;
  },
): StatCard["delta"] {
  if (!delta) {
    return undefined;
  }

  const fractionDigits =
    options?.fractionDigits ?? (delta.mode === "percent" ? 1 : 1);
  const suffix = options?.suffix ?? "";
  const message = options?.message ?? "vs previous month";
  const sign = delta.value >= 0 ? "+" : "-";

  if (delta.mode === "percent") {
    const magnitude = Math.abs(delta.value).toFixed(fractionDigits);
    return {
      value: `${sign}${magnitude}%${suffix}`,
      direction: delta.direction,
      message,
    };
  }

  const magnitude = formatNumber(Math.abs(delta.value), { fractionDigits });
  return {
    value: `${sign}${magnitude}${suffix}`,
    direction: delta.direction,
    message,
  };
}

function formatCurrency(
  amount: number,
  options?: { fractionDigits?: number },
): string {
  const fractionDigits = options?.fractionDigits ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatNumber(
  value: number,
  options?: { fractionDigits?: number },
): string {
  const fractionDigits =
    options?.fractionDigits ?? (Number.isInteger(value) ? 0 : 2);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatPercent(
  value: number,
  options?: { fractionDigits?: number },
): string {
  const fractionDigits = options?.fractionDigits ?? 1;
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(fractionDigits)}%`;
}

export async function SectionCards() {
  const summary = await fetchDashboardSummary();

  const currentLabel = summary?.currentPeriod.label ?? "Last Month";
  const previousLabel = summary?.previousPeriod.label ?? "Previous Month";

  const revenueCard = findCard(summary, "totalRevenue");
  const quantityCard = findCard(summary, "quantitySold");
  const operatingShareCard = findCard(summary, "operatingCostShare");
  const topSupplier = summary?.topSupplier ?? null;

  const cards: StatCard[] = [
    {
      id: "revenue",
      label: `Total Revenue (${currentLabel})`,
      value: formatCardValue(revenueCard),
      delta: buildDelta(revenueCard?.delta, {
        fractionDigits: 1,
        message: `vs ${previousLabel}`,
      }),
      footerPrimary: "Period-over-period revenue change",
      footerSecondary: buildPreviousValueLabel(revenueCard, previousLabel),
    },
    {
      id: "quantity",
      label: `Quantity Sold (${currentLabel})`,
      value: formatCardValue(quantityCard),
      delta: buildDelta(quantityCard?.delta, {
        fractionDigits: 1,
        message: `vs ${previousLabel}`,
      }),
      footerPrimary: "Units delivered last month",
      footerSecondary: buildPreviousValueLabel(quantityCard, previousLabel),
    },
    {
      id: "operating-cost-share",
      label: `Operating Cost Share (${currentLabel})`,
      value: formatCardValue(operatingShareCard),
      delta: buildDelta(operatingShareCard?.delta, {
        fractionDigits: 1,
        suffix: " pts",
        message: `vs ${previousLabel}`,
      }),
      footerPrimary: "Logistics, commissions, RFA as % of revenue",
      footerSecondary: buildPreviousValueLabel(
        operatingShareCard,
        previousLabel,
      ),
    },
    {
      id: "top-supplier",
      label: `Top Supplier (${currentLabel})`,
      value: topSupplier?.supplier ?? "—",
      footerPrimary: topSupplier
        ? `Total sales: ${formatCurrency(topSupplier.totalRevenue)}`
        : "No supplier data available",
      footerSecondary: topSupplier
        ? `Quantity sold: ${formatNumber(topSupplier.quantitySold)}`
        : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:shadow-xs *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => {
        const TrendIcon =
          card.delta?.direction === "down" ? IconTrendingDown : IconTrendingUp;

        return (
          <Card key={card.id} className="@container/card" data-slot="card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {card.value}
              </CardTitle>
              {card.delta ? (
                <CardAction>
                  <Badge variant="outline">
                    <TrendIcon className="size-4" />
                    {card.delta.value}
                    <span className="sr-only">{card.delta.message}</span>
                  </Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="flex flex-wrap items-center gap-2 font-medium line-clamp-2">
                {card.footerPrimary}
                {card.delta?.message ? (
                  <span className="font-normal text-muted-foreground">
                    {card.delta.message}
                  </span>
                ) : null}
              </div>
              {card.footerSecondary ? (
                <div className="text-muted-foreground">
                  {card.footerSecondary}
                </div>
              ) : null}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
