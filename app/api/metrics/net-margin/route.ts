import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Net profit margin metrics endpoint.
 *
 * Always uses the stored `total_net_margin_eur` values (no recomputation).
 *
 * Periods returned:
 *  - last_12_months (trailing 12 months)
 *  - last_6_months  (trailing 6 months)
 *  - last_3_months  (trailing 3 months)
 *  - last_1_month   (trailing 1 month)
 *
 * Series returned:
 *  - monthly_series_12m
 *  - daily_series_3m
 *  - daily_series_1m
 *  - weekly_series_3m
 *  - weekly_series_1m
 *
 * Optional:
 *  - debug=1 : include duplicate transaction IDs list
 */

export const runtime = "nodejs";

type Row = {
  transaction_id: number;
  delivery_date: Date;
  total_net_margin_eur: unknown;
  sales_altona: unknown;
};

// ---------------------- Utilities ----------------------

type DecimalLike = { toNumber: () => number };
function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as Record<string, unknown>).toNumber === "function"
  );
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (isDecimalLike(value)) {
    try {
      return value.toNumber();
    } catch {
      return 0;
    }
  }
  return 0;
}

function subMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const target = new Date(
    y,
    m - months,
    1,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Week start chosen as Monday (ISO-like).
 */
function weekStartKey(d: Date): string {
  const wd = d.getDay();
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + mondayOffset);
  return dateKey(start);
}

function generateMonthRangeInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    keys.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

function generateDateRangeInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) {
    keys.push(dateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function generateWeekRangeInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const firstKey = weekStartKey(start);
  const cur = new Date(firstKey);
  const endMidnight = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );
  while (cur <= endMidnight) {
    keys.push(dateKey(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return keys;
}

// ---------------------- Handler ----------------------

export async function GET(req: Request) {
  try {
    const now = new Date();
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const start12 = subMonths(now, 12);
    const start6 = subMonths(now, 6);
    const start3 = subMonths(now, 3);
    const start1 = subMonths(now, 1);

    // Fetch rows in the largest window (12m)
    const rawRows: Row[] = await prisma.sales_transactions.findMany({
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

    // Deduplicate by transaction_id
    const seenIds = new Set<number>();
    const duplicateIds: number[] = [];
    const rows: Row[] = [];
    for (const r of rawRows) {
      if (seenIds.has(r.transaction_id)) {
        duplicateIds.push(r.transaction_id);
        continue;
      }
      seenIds.add(r.transaction_id);
      rows.push(r);
    }

    // Sums & counts using stored margins only
    let sum12 = 0,
      count12 = 0;
    let sum6 = 0,
      count6 = 0;
    let sum3 = 0,
      count3 = 0;
    let sum1 = 0,
      count1 = 0;

    const monthKeys = generateMonthRangeInclusive(start12, now);
    const monthlyBuckets: Record<string, number> = Object.fromEntries(
      monthKeys.map((k) => [k, 0]),
    );
    const monthlySalesBuckets: Record<string, number> = Object.fromEntries(
      monthKeys.map((k) => [k, 0]),
    );

    const dayKeys3m = generateDateRangeInclusive(start3, now);
    const dayKeys1m = generateDateRangeInclusive(start1, now);
    const dailyBuckets3m: Record<string, number> = Object.fromEntries(
      dayKeys3m.map((k) => [k, 0]),
    );
    const dailySalesBuckets3m: Record<string, number> = Object.fromEntries(
      dayKeys3m.map((k) => [k, 0]),
    );
    const dailyBuckets1m: Record<string, number> = Object.fromEntries(
      dayKeys1m.map((k) => [k, 0]),
    );
    const dailySalesBuckets1m: Record<string, number> = Object.fromEntries(
      dayKeys1m.map((k) => [k, 0]),
    );

    const weekKeys3m = generateWeekRangeInclusive(start3, now);
    const weekKeys1m = generateWeekRangeInclusive(start1, now);
    const weeklyBuckets3m: Record<string, number> = Object.fromEntries(
      weekKeys3m.map((k) => [k, 0]),
    );
    const weeklySalesBuckets3m: Record<string, number> = Object.fromEntries(
      weekKeys3m.map((k) => [k, 0]),
    );
    const weeklyBuckets1m: Record<string, number> = Object.fromEntries(
      weekKeys1m.map((k) => [k, 0]),
    );
    const weeklySalesBuckets1m: Record<string, number> = Object.fromEntries(
      weekKeys1m.map((k) => [k, 0]),
    );

    for (const r of rows) {
      const storedMargin = toNumber(r.total_net_margin_eur);
      const storedSales = toNumber(r.sales_altona);
      const d = r.delivery_date;

      if (d >= start12 && d <= now) {
        sum12 += storedMargin;
        count12++;
      }
      if (d >= start6 && d <= now) {
        sum6 += storedMargin;
        count6++;
      }
      if (d >= start3 && d <= now) {
        sum3 += storedMargin;
        count3++;
      }
      if (d >= start1 && d <= now) {
        sum1 += storedMargin;
        count1++;
      }

      const mKey = monthKey(d);
      if (mKey in monthlyBuckets) monthlyBuckets[mKey] += storedMargin;
      if (mKey in monthlySalesBuckets) monthlySalesBuckets[mKey] += storedSales;

      if (d >= start3) {
        const dk3 = dateKey(d);
        if (dk3 in dailyBuckets3m) dailyBuckets3m[dk3] += storedMargin;
        if (dk3 in dailySalesBuckets3m) dailySalesBuckets3m[dk3] += storedSales;
        const wk3 = weekStartKey(d);
        if (wk3 in weeklyBuckets3m) weeklyBuckets3m[wk3] += storedMargin;
        if (wk3 in weeklySalesBuckets3m)
          weeklySalesBuckets3m[wk3] += storedSales;
      }
      if (d >= start1) {
        const dk1 = dateKey(d);
        if (dk1 in dailyBuckets1m) dailyBuckets1m[dk1] += storedMargin;
        if (dk1 in dailySalesBuckets1m) dailySalesBuckets1m[dk1] += storedSales;
        const wk1 = weekStartKey(d);
        if (wk1 in weeklyBuckets1m) weeklyBuckets1m[wk1] += storedMargin;
        if (wk1 in weeklySalesBuckets1m)
          weeklySalesBuckets1m[wk1] += storedSales;
      }
    }

    const monthlySeries = monthKeys.map((k) => ({
      month: k,
      total_net_margin_eur: monthlyBuckets[k] || 0,
      sales_altona: monthlySalesBuckets[k] || 0,
    }));
    const dailySeries3m = dayKeys3m.map((k) => ({
      date: k,
      total_net_margin_eur: dailyBuckets3m[k] || 0,
      sales_altona: dailySalesBuckets3m[k] || 0,
    }));
    const dailySeries1m = dayKeys1m.map((k) => ({
      date: k,
      total_net_margin_eur: dailyBuckets1m[k] || 0,
      sales_altona: dailySalesBuckets1m[k] || 0,
    }));
    const weeklySeries3m = weekKeys3m.map((k) => ({
      week_start: k,
      total_net_margin_eur: weeklyBuckets3m[k] || 0,
      sales_altona: weeklySalesBuckets3m[k] || 0,
    }));
    const weeklySeries1m = weekKeys1m.map((k) => ({
      week_start: k,
      total_net_margin_eur: weeklyBuckets1m[k] || 0,
      sales_altona: weeklySalesBuckets1m[k] || 0,
    }));

    interface NetMarginPayload {
      currency: string;
      periods: {
        last_12_months: {
          total_net_margin_eur: number;
          row_count: number;
          start_date: string;
          end_date: string;
        };
        last_6_months: {
          total_net_margin_eur: number;
          row_count: number;
          start_date: string;
          end_date: string;
        };
        last_3_months: {
          total_net_margin_eur: number;
          row_count: number;
          start_date: string;
          end_date: string;
        };
        last_1_month: {
          total_net_margin_eur: number;
          row_count: number;
          start_date: string;
          end_date: string;
        };
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
    }

    const payload: NetMarginPayload = {
      currency: "EUR",
      periods: {
        last_12_months: {
          total_net_margin_eur: sum12,
          row_count: count12,
          start_date: start12.toISOString(),
          end_date: now.toISOString(),
        },
        last_6_months: {
          total_net_margin_eur: sum6,
          row_count: count6,
          start_date: start6.toISOString(),
          end_date: now.toISOString(),
        },
        last_3_months: {
          total_net_margin_eur: sum3,
          row_count: count3,
          start_date: start3.toISOString(),
          end_date: now.toISOString(),
        },
        last_1_month: {
          total_net_margin_eur: sum1,
          row_count: count1,
          start_date: start1.toISOString(),
          end_date: now.toISOString(),
        },
      },
      monthly_series_12m: monthlySeries,
      daily_series_3m: dailySeries3m,
      daily_series_1m: dailySeries1m,
      weekly_series_3m: weeklySeries3m,
      weekly_series_1m: weeklySeries1m,
      meta: {
        duplicate_transaction_ids: duplicateIds,
        duplicate_count: duplicateIds.length,
        debug,
      },
    };

    if (debug) {
      payload.debug_rows = rows.slice(0, 200).map((r) => ({
        transaction_id: r.transaction_id,
        delivery_date: r.delivery_date.toISOString(),
        stored_margin: toNumber(r.total_net_margin_eur),
      }));
    }

    return NextResponse.json(payload, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
