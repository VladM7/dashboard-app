import type { PrismaClient } from "@prisma/client";

import { toFiniteNumber } from "@/lib/api/numbers";

type Row = {
  transaction_id: number;
  delivery_date: Date;
  total_net_margin_eur: unknown;
  sales_altona: unknown;
};

type PeriodSummary = {
  total_net_margin_eur: number;
  row_count: number;
  start_date: string;
  end_date: string;
};

type MonthSeriesPoint = {
  month: string;
  total_net_margin_eur: number;
  sales_altona: number;
};

type DaySeriesPoint = {
  date: string;
  total_net_margin_eur: number;
  sales_altona: number;
};

type WeekSeriesPoint = {
  week_start: string;
  total_net_margin_eur: number;
  sales_altona: number;
};

export type NetMarginPayload = {
  currency: string;
  periods: {
    last_12_months: PeriodSummary;
    last_6_months: PeriodSummary;
    last_3_months: PeriodSummary;
    last_1_month: PeriodSummary;
  };
  monthly_series_12m: MonthSeriesPoint[];
  daily_series_3m: DaySeriesPoint[];
  daily_series_1m: DaySeriesPoint[];
  weekly_series_3m: WeekSeriesPoint[];
  weekly_series_1m: WeekSeriesPoint[];
  meta: {
    duplicate_transaction_ids: number[];
    duplicate_count: number;
    debug: boolean;
  };
  debug_rows?: {
    transaction_id: number;
    delivery_date: string;
    stored_margin: number;
  }[];
};

export type NetMarginOptions = {
  debug: boolean;
  now?: Date;
};

export async function buildNetMarginPayload(
  prisma: PrismaClient,
  options: NetMarginOptions,
): Promise<NetMarginPayload> {
  const now = normalizeDate(options.now ?? new Date());
  const debug = options.debug;

  const start12 = subMonths(now, 12);
  const start6 = subMonths(now, 6);
  const start3 = subMonths(now, 3);
  const start1 = subMonths(now, 1);

  const rawRows = await fetchNetMarginRows(prisma, start12);

  const { dedupedRows, duplicateIds } = deduplicateRows(rawRows);

  const {
    monthlySeries,
    monthlySalesSeries,
    dailySeries3m,
    dailySales3m,
    dailySeries1m,
    dailySales1m,
    weeklySeries3m,
    weeklySales3m,
    weeklySeries1m,
    weeklySales1m,
    periodTotals,
  } = aggregateRows(dedupedRows, {
    now,
    start12,
    start6,
    start3,
    start1,
  });

  const payload: NetMarginPayload = {
    currency: "EUR",
    periods: {
      last_12_months: buildPeriodSummary(
        periodTotals.last12.sum,
        periodTotals.last12.count,
        start12,
        now,
      ),
      last_6_months: buildPeriodSummary(
        periodTotals.last6.sum,
        periodTotals.last6.count,
        start6,
        now,
      ),
      last_3_months: buildPeriodSummary(
        periodTotals.last3.sum,
        periodTotals.last3.count,
        start3,
        now,
      ),
      last_1_month: buildPeriodSummary(
        periodTotals.last1.sum,
        periodTotals.last1.count,
        start1,
        now,
      ),
    },
    monthly_series_12m: mergeSeries(
      monthlySeries,
      monthlySalesSeries,
      (month) => ({
        month,
        total_net_margin_eur: monthlySeries[month] ?? 0,
        sales_altona: monthlySalesSeries[month] ?? 0,
      }),
    ),
    daily_series_3m: mergeSeries(dailySeries3m, dailySales3m, (date) => ({
      date,
      total_net_margin_eur: dailySeries3m[date] ?? 0,
      sales_altona: dailySales3m[date] ?? 0,
    })),
    daily_series_1m: mergeSeries(dailySeries1m, dailySales1m, (date) => ({
      date,
      total_net_margin_eur: dailySeries1m[date] ?? 0,
      sales_altona: dailySales1m[date] ?? 0,
    })),
    weekly_series_3m: mergeSeries(
      weeklySeries3m,
      weeklySales3m,
      (weekStart) => ({
        week_start: weekStart,
        total_net_margin_eur: weeklySeries3m[weekStart] ?? 0,
        sales_altona: weeklySales3m[weekStart] ?? 0,
      }),
    ),
    weekly_series_1m: mergeSeries(
      weeklySeries1m,
      weeklySales1m,
      (weekStart) => ({
        week_start: weekStart,
        total_net_margin_eur: weeklySeries1m[weekStart] ?? 0,
        sales_altona: weeklySales1m[weekStart] ?? 0,
      }),
    ),
    meta: {
      duplicate_transaction_ids: duplicateIds,
      duplicate_count: duplicateIds.length,
      debug,
    },
  };

  if (debug) {
    payload.debug_rows = dedupedRows.slice(0, 200).map((row) => ({
      transaction_id: row.transaction_id,
      delivery_date: row.delivery_date.toISOString(),
      stored_margin: toFiniteNumber(row.total_net_margin_eur),
    }));
  }

  return payload;
}

async function fetchNetMarginRows(
  prisma: PrismaClient,
  start12: Date,
): Promise<Row[]> {
  return prisma.sales_transactions.findMany({
    where: {
      delivery_date: {
        gte: start12,
      },
    },
    select: {
      transaction_id: true,
      delivery_date: true,
      total_net_margin_eur: true,
      sales_altona: true,
    },
    orderBy: {
      delivery_date: "asc",
    },
  });
}

function deduplicateRows(rows: Row[]): {
  dedupedRows: Row[];
  duplicateIds: number[];
} {
  const seenIds = new Set<number>();
  const duplicateIds: number[] = [];
  const dedupedRows: Row[] = [];

  for (const row of rows) {
    if (seenIds.has(row.transaction_id)) {
      duplicateIds.push(row.transaction_id);
      continue;
    }
    seenIds.add(row.transaction_id);
    dedupedRows.push(row);
  }

  return { dedupedRows, duplicateIds };
}

function aggregateRows(
  rows: Row[],
  {
    now,
    start12,
    start6,
    start3,
    start1,
  }: {
    now: Date;
    start12: Date;
    start6: Date;
    start3: Date;
    start1: Date;
  },
) {
  let sum12 = 0;
  let sum6 = 0;
  let sum3 = 0;
  let sum1 = 0;
  let count12 = 0;
  let count6 = 0;
  let count3 = 0;
  let count1 = 0;

  const monthKeys = generateMonthRangeInclusive(start12, now);
  const monthlySeries = initSeries(monthKeys);
  const monthlySalesSeries = initSeries(monthKeys);

  const dayKeys3m = generateDateRangeInclusive(start3, now);
  const dailySeries3m = initSeries(dayKeys3m);
  const dailySales3m = initSeries(dayKeys3m);

  const dayKeys1m = generateDateRangeInclusive(start1, now);
  const dailySeries1m = initSeries(dayKeys1m);
  const dailySales1m = initSeries(dayKeys1m);

  const weekKeys3m = generateWeekRangeInclusive(start3, now);
  const weeklySeries3m = initSeries(weekKeys3m);
  const weeklySales3m = initSeries(weekKeys3m);

  const weekKeys1m = generateWeekRangeInclusive(start1, now);
  const weeklySeries1m = initSeries(weekKeys1m);
  const weeklySales1m = initSeries(weekKeys1m);

  for (const row of rows) {
    const storedMargin = toFiniteNumber(row.total_net_margin_eur);
    const storedSales = toFiniteNumber(row.sales_altona);
    const deliveryDate = row.delivery_date;

    if (withinRange(deliveryDate, start12, now)) {
      sum12 += storedMargin;
      count12 += 1;
    }
    if (withinRange(deliveryDate, start6, now)) {
      sum6 += storedMargin;
      count6 += 1;
    }
    if (withinRange(deliveryDate, start3, now)) {
      sum3 += storedMargin;
      count3 += 1;
    }
    if (withinRange(deliveryDate, start1, now)) {
      sum1 += storedMargin;
      count1 += 1;
    }

    const monthKeyValue = monthKey(deliveryDate);
    monthlySeries[monthKeyValue] =
      (monthlySeries[monthKeyValue] ?? 0) + storedMargin;
    monthlySalesSeries[monthKeyValue] =
      (monthlySalesSeries[monthKeyValue] ?? 0) + storedSales;

    if (deliveryDate >= start3) {
      const dayKeyValue = dateKey(deliveryDate);
      dailySeries3m[dayKeyValue] =
        (dailySeries3m[dayKeyValue] ?? 0) + storedMargin;
      dailySales3m[dayKeyValue] =
        (dailySales3m[dayKeyValue] ?? 0) + storedSales;

      const weekKeyValue = weekStartKey(deliveryDate);
      weeklySeries3m[weekKeyValue] =
        (weeklySeries3m[weekKeyValue] ?? 0) + storedMargin;
      weeklySales3m[weekKeyValue] =
        (weeklySales3m[weekKeyValue] ?? 0) + storedSales;
    }

    if (deliveryDate >= start1) {
      const dayKeyValue = dateKey(deliveryDate);
      dailySeries1m[dayKeyValue] =
        (dailySeries1m[dayKeyValue] ?? 0) + storedMargin;
      dailySales1m[dayKeyValue] =
        (dailySales1m[dayKeyValue] ?? 0) + storedSales;

      const weekKeyValue = weekStartKey(deliveryDate);
      weeklySeries1m[weekKeyValue] =
        (weeklySeries1m[weekKeyValue] ?? 0) + storedMargin;
      weeklySales1m[weekKeyValue] =
        (weeklySales1m[weekKeyValue] ?? 0) + storedSales;
    }
  }

  return {
    monthlySeries,
    monthlySalesSeries,
    dailySeries3m,
    dailySales3m,
    dailySeries1m,
    dailySales1m,
    weeklySeries3m,
    weeklySales3m,
    weeklySeries1m,
    weeklySales1m,
    periodTotals: {
      last12: { sum: sum12, count: count12 },
      last6: { sum: sum6, count: count6 },
      last3: { sum: sum3, count: count3 },
      last1: { sum: sum1, count: count1 },
    },
  };
}

function buildPeriodSummary(
  totalMargin: number,
  rowCount: number,
  startDate: Date,
  endDate: Date,
): PeriodSummary {
  return {
    total_net_margin_eur: totalMargin,
    row_count: rowCount,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
  };
}

function withinRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function initSeries(keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function mergeSeries<T>(
  primary: Record<string, number>,
  secondary: Record<string, number>,
  factory: (key: string) => T,
): T[] {
  const keys = Array.from(
    new Set([...Object.keys(primary), ...Object.keys(secondary)]),
  ).sort((a, b) => a.localeCompare(b));
  return keys.map(factory);
}

function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setMilliseconds(0);
  return normalized;
}

function subMonths(date: Date, months: number): Date {
  const clone = new Date(date);
  const year = clone.getFullYear();
  const month = clone.getMonth();
  const day = clone.getDate();

  const target = new Date(
    year,
    month - months,
    1,
    clone.getHours(),
    clone.getMinutes(),
    clone.getSeconds(),
    clone.getMilliseconds(),
  );

  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();

  target.setDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function weekStartKey(date: Date): string {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset);

  return dateKey(start);
}

function generateMonthRangeInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
}

function generateDateRangeInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= last) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function generateWeekRangeInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const firstWeek = weekStartKey(start);
  const cursor = new Date(firstWeek);
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= last) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  return keys;
}
