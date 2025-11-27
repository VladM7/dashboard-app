import { prisma } from "@/lib/prisma";

export type TrendDirection = "up" | "down";

export type DeltaSummary = {
  value: number;
  mode: "percent" | "absolute";
  direction: TrendDirection;
} | null;

export type SummaryCardId =
  | "totalRevenue"
  | "quantitySold"
  | "operatingCostShare";

export type SummaryCard = {
  id: SummaryCardId;
  label: string;
  unit: "currency" | "number" | "percent";
  currentValue: number | null;
  previousValue: number | null;
  delta: DeltaSummary;
};

export type TopSupplierSummary = {
  supplier: string;
  totalRevenue: number;
  quantitySold: number;
} | null;

export type PeriodSummary = {
  start: Date;
  end: Date;
  label: string;
};

export type DashboardSummary = {
  currentPeriod: PeriodSummary;
  previousPeriod: PeriodSummary;
  cards: SummaryCard[];
  topSupplier: TopSupplierSummary;
};

export type PeriodSummaryJson = {
  start: string;
  end: string;
  label: string;
};

export type DashboardSummaryJson = {
  currentPeriod: PeriodSummaryJson;
  previousPeriod: PeriodSummaryJson;
  cards: SummaryCard[];
  topSupplier: TopSupplierSummary;
};

export type DashboardSummaryInput = {
  /**
   * How many whole months back to look.
   * `1` = last completed month (default), `2` = two months ago, etc.
   */
  monthsAgo?: number;
  /**
   * Reference date used to determine what “current” means.
   * Defaults to `new Date()`.
   */
  referenceDate?: Date;
};

type AggregateResult = Awaited<
  ReturnType<typeof prisma.sales_transactions.aggregate>
>;

type TopSupplierRow = {
  supplier: string;
  total_direct_sales: number;
  total_quantity: number;
};

const EMPTY_AGGREGATE_SUM = {
  direct_sales: null,
  quantity: null,
  logistics_cost_altona: null,
  commission_altona: null,
  prescriber_commission: null,
  rfa_on_resale_orders: null,
};

function getAggregateSum(aggregate: AggregateResult) {
  return { ...EMPTY_AGGREGATE_SUM, ...(aggregate._sum ?? {}) };
}

type AggregateSum = ReturnType<typeof getAggregateSum>;

export async function getDashboardSummary(
  options: DashboardSummaryInput = {},
): Promise<DashboardSummary> {
  const { monthsAgo = 1, referenceDate = new Date() } = options;

  if (monthsAgo < 1) {
    throw new Error("monthsAgo must be >= 1");
  }

  const { currentPeriod, previousPeriod } = getPeriodRanges(
    monthsAgo,
    referenceDate,
  );

  const [currentAgg, previousAgg, topSupplierGroup] = await Promise.all([
    aggregatePeriod(currentPeriod.start, currentPeriod.end),
    aggregatePeriod(previousPeriod.start, previousPeriod.end),
    groupTopSupplier(currentPeriod.start, currentPeriod.end),
  ]);

  const currentSum = getAggregateSum(currentAgg);
  const previousSum = getAggregateSum(previousAgg);

  const currentRevenue = safeNumber(currentSum.direct_sales);
  const previousRevenue = safeNumber(previousSum.direct_sales);

  const currentQuantity = safeNumber(currentSum.quantity);
  const previousQuantity = safeNumber(previousSum.quantity);

  const currentOperatingCost = computeOperatingCost(currentSum);
  const previousOperatingCost = computeOperatingCost(previousSum);

  const currentOperatingShare =
    currentRevenue > 0 ? (currentOperatingCost / currentRevenue) * 100 : null;
  const previousOperatingShare =
    previousRevenue > 0
      ? (previousOperatingCost / previousRevenue) * 100
      : null;

  const cards: SummaryCard[] = [
    {
      id: "totalRevenue",
      label: "Total Revenue",
      unit: "currency",
      currentValue: currentRevenue,
      previousValue: previousRevenue,
      delta: computePercentDelta(currentRevenue, previousRevenue),
    },
    {
      id: "quantitySold",
      label: "Quantity Sold",
      unit: "number",
      currentValue: currentQuantity,
      previousValue: previousQuantity,
      delta: computePercentDelta(currentQuantity, previousQuantity),
    },
    {
      id: "operatingCostShare",
      label: "Operating Cost Share",
      unit: "percent",
      currentValue:
        currentOperatingShare !== null ? round(currentOperatingShare, 4) : null,
      previousValue:
        previousOperatingShare !== null
          ? round(previousOperatingShare, 4)
          : null,
      delta: computeAbsoluteDelta(
        currentOperatingShare,
        previousOperatingShare,
      ),
    },
  ];

  const topSupplierRow = topSupplierGroup[0];

  const topSupplier = topSupplierRow
    ? {
        supplier: topSupplierRow.supplier,
        totalRevenue: safeNumber(topSupplierRow.total_direct_sales),
        quantitySold: safeNumber(topSupplierRow.total_quantity),
      }
    : null;

  return {
    currentPeriod,
    previousPeriod,
    cards,
    topSupplier,
  };
}

export function serializeDashboardSummary(
  summary: DashboardSummary,
): DashboardSummaryJson {
  return {
    currentPeriod: serializePeriod(summary.currentPeriod),
    previousPeriod: serializePeriod(summary.previousPeriod),
    cards: summary.cards.map((card) => ({
      ...card,
      delta: card.delta
        ? {
            ...card.delta,
          }
        : null,
    })),
    topSupplier: summary.topSupplier
      ? {
          supplier: summary.topSupplier.supplier,
          totalRevenue: summary.topSupplier.totalRevenue,
          quantitySold: summary.topSupplier.quantitySold,
        }
      : null,
  };
}

function serializePeriod(period: PeriodSummary): PeriodSummaryJson {
  return {
    start: period.start.toISOString(),
    end: period.end.toISOString(),
    label: period.label,
  };
}

function aggregatePeriod(start: Date, end: Date): Promise<AggregateResult> {
  return prisma.sales_transactions.aggregate({
    where: {
      delivery_date: {
        gte: start,
        lt: end,
      },
    },
    _sum: {
      direct_sales: true,
      quantity: true,
      logistics_cost_altona: true,
      commission_altona: true,
      prescriber_commission: true,
      rfa_on_resale_orders: true,
    },
  });
}

async function groupTopSupplier(
  start: Date,
  end: Date,
): Promise<TopSupplierRow[]> {
  const rows = await prisma.$queryRaw<
    {
      supplier: string | null;
      total_direct_sales: number | null;
      total_quantity: number | null;
    }[]
  >`
    SELECT
      supplier,
      SUM(direct_sales) AS total_direct_sales,
      SUM(quantity) AS total_quantity
    FROM sales_transactions
    WHERE delivery_date >= ${start}
      AND delivery_date < ${end}
      AND supplier <> ''
    GROUP BY supplier
    ORDER BY total_direct_sales DESC
    LIMIT 1
  `;

  return rows
    .filter((row) => row.supplier)
    .map((row) => ({
      supplier: row.supplier as string,
      total_direct_sales: row.total_direct_sales ?? 0,
      total_quantity: row.total_quantity ?? 0,
    }));
}

function computeOperatingCost(sum: AggregateSum): number {
  return (
    safeNumber(sum.logistics_cost_altona) +
    safeNumber(sum.commission_altona) +
    safeNumber(sum.prescriber_commission) +
    safeNumber(sum.rfa_on_resale_orders)
  );
}

function computePercentDelta(
  currentValue: number | null,
  previousValue: number | null,
): DeltaSummary {
  if (
    currentValue === null ||
    previousValue === null ||
    !isFinite(previousValue) ||
    previousValue === 0
  ) {
    return null;
  }

  const delta =
    ((currentValue - previousValue) / Math.abs(previousValue)) * 100;

  if (!isFinite(delta)) {
    return null;
  }

  return {
    value: round(delta, 4),
    mode: "percent",
    direction: delta >= 0 ? "up" : "down",
  };
}

function computeAbsoluteDelta(
  currentValue: number | null,
  previousValue: number | null,
): DeltaSummary {
  if (
    currentValue === null ||
    previousValue === null ||
    !isFinite(currentValue) ||
    !isFinite(previousValue)
  ) {
    return null;
  }

  const delta = currentValue - previousValue;

  return {
    value: round(delta, 4),
    mode: "absolute",
    direction: delta >= 0 ? "up" : "down",
  };
}

function getPeriodRanges(monthsAgo: number, reference: Date) {
  const currentPeriod = getMonthBounds(reference, monthsAgo);
  const previousPeriod = getMonthBounds(reference, monthsAgo + 1);

  return {
    currentPeriod,
    previousPeriod,
  };
}

function getMonthBounds(reference: Date, monthsAgo: number): PeriodSummary {
  const now = new Date(reference.getTime());
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  base.setUTCMonth(base.getUTCMonth() - monthsAgo);

  const start = base;
  const end = new Date(base.getTime());
  end.setUTCMonth(end.getUTCMonth() + 1);

  return {
    start,
    end,
    label: formatMonthLabel(start),
  };
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function safeNumber(input: unknown): number {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : 0;
  }

  if (typeof input === "string") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "toNumber" in (input as Record<string, unknown>) &&
    typeof (input as { toNumber?: () => number }).toNumber === "function"
  ) {
    try {
      const numeric = (input as { toNumber: () => number }).toNumber();
      return Number.isFinite(numeric) ? numeric : 0;
    } catch {
      return 0;
    }
  }

  return 0;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
