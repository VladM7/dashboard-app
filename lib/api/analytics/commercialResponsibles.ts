import { Prisma, type PrismaClient } from "@prisma/client";

import { toFiniteNumber } from "../numbers";

export type CommercialSalesChannel = "all" | "direct" | "indirect";
export type CommercialTimeView = "yearly" | "monthly";
export type CommercialResponsiblesOrderBy = "sales" | "quantity" | "name";

export interface CommercialResponsiblesOptions {
  /** Filter for direct/indirect sales. Defaults to "all". */
  salesChannel?: CommercialSalesChannel;
  /** If null => all years. If number => filter to that specific year. */
  year?: number | null;
  /** Yearly vs monthly buckets. Defaults to "yearly". */
  view?: CommercialTimeView;
  /** Sorting for the table. Defaults to "sales". */
  orderBy?: CommercialResponsiblesOrderBy;
  /** Optional cap for the number of rows returned. Clamped between 1 and 250. */
  limit?: number;
}

export interface CommercialPeriodBucket {
  /** For yearly view => a year (e.g. 2024). For monthly view => YYYY-MM (e.g. 2024-03). */
  period: string;
  /** For yearly view => year number. For monthly view => year number. */
  year: number;
  /** For yearly view => always null. For monthly view => 1..12. */
  month: number | null;

  salesValue: number;
  quantity: number;

  /** Compared to previous bucket within the same series (year->previous year, month->previous month). */
  deltaSalesValue: number | null;
  deltaQuantity: number | null;
}

export interface CommercialResponsibleRow {
  commercialResponsible: string;
  totalSalesValue: number;
  totalQuantity: number;
  /** Share of sales value within the returned table scope (after filters). */
  shareOfSalesValue: number | null;
  /** Share of quantity within the returned table scope (after filters). */
  shareOfQuantity: number | null;
  /** Buckets for the selected `view` and `year` (if provided). */
  series: CommercialPeriodBucket[];
}

export interface CommercialResponsiblesPayload {
  rows: CommercialResponsibleRow[];
  filters: {
    year: {
      selected: number | null;
      options: Array<number>;
    };
    salesChannel: {
      selected: CommercialSalesChannel;
      options: Array<CommercialSalesChannel>;
    };
    view: {
      selected: CommercialTimeView;
      options: Array<CommercialTimeView>;
    };
  };
  totals: {
    quantity: number;
    salesValue: number;
  };
  metadata: {
    generatedAt: string;
    orderBy: CommercialResponsiblesOrderBy;
    limit: number | null;
  };
}

const MAX_LIMIT = 250;
const MIN_ALLOWED_YEAR = 1900;
const MAX_ALLOWED_YEAR = 2200;

const INDIRECT_ORDER_TYPES = ["Permanent direct", "Opération direct"] as const;

/**
 * IMPORTANT:
 * User requirement says:
 * - indirect sales: order_type IN ("Permanent direct", "Opération direct") -> value in `direct_sales`
 * - direct sales: otherwise -> value in `sales_altona`
 *
 * (This is intentionally not symmetric with naming in the DB.)
 */
const SALES_VALUE_INDIRECT_EXPRESSION = Prisma.sql`COALESCE(direct_sales, 0)`;
const SALES_VALUE_DIRECT_EXPRESSION = Prisma.sql`COALESCE(sales_altona, 0)`;
const SALES_VALUE_ALL_EXPRESSION = Prisma.sql`
  CASE
    WHEN order_type IN (${Prisma.join(
      INDIRECT_ORDER_TYPES.map((t) => Prisma.sql`${t}`),
    )})
      THEN COALESCE(direct_sales, 0)
    ELSE COALESCE(sales_altona, 0)
  END
`;

type AggregateRow = {
  commercial_responsible: string | null;
  total_quantity: unknown;
  total_sales: unknown;
};

type PeriodRow = {
  commercial_responsible: string | null;
  year: number | string | bigint | null;
  month: number | string | bigint | null;
  total_quantity: unknown;
  total_sales: unknown;
};

export async function buildCommercialResponsiblesPayload(
  prisma: PrismaClient,
  options: CommercialResponsiblesOptions,
): Promise<CommercialResponsiblesPayload> {
  const salesChannel = normalizeSalesChannel(options.salesChannel);
  const view: CommercialTimeView =
    options.view === "monthly" ? "monthly" : "yearly";
  const year = normalizeYearBound(options.year ?? null);
  const orderBy: CommercialResponsiblesOrderBy =
    options.orderBy === "quantity" ||
    options.orderBy === "name" ||
    options.orderBy === "sales"
      ? options.orderBy
      : "sales";
  const limit = normalizeLimit(options.limit);

  const salesValueExpression = resolveSalesValueExpression(salesChannel);

  const startDate =
    year !== null ? new Date(Date.UTC(year, 0, 1, 0, 0, 0)) : null;
  const endDate =
    year !== null ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)) : null;

  const baseFilters = buildBaseFilters(startDate, endDate, salesChannel);
  const baseWhereSql = buildWhereSql(baseFilters);

  const orderBySql = buildOrderBySql(orderBy);

  const aggregateRows = await prisma.$queryRaw<AggregateRow[]>`
    SELECT
      TRIM(commercial_responsible) AS commercial_responsible,
      SUM(COALESCE(quantity, 0)) AS total_quantity,
      SUM(${salesValueExpression}) AS total_sales
    FROM sales_transactions
    ${baseWhereSql}
    GROUP BY TRIM(commercial_responsible)
    ${orderBySql}
    ${limit !== null ? Prisma.sql`LIMIT ${limit}` : Prisma.sql``}
  `;

  const cleanedAgg = aggregateRows
    .map((r) => ({
      name: normalizeName(r.commercial_responsible),
      totalQuantity: toFiniteNumber(r.total_quantity),
      totalSalesValue: toFiniteNumber(r.total_sales),
    }))
    .filter(
      (
        r,
      ): r is {
        name: string;
        totalQuantity: number;
        totalSalesValue: number;
      } => !!r.name,
    );

  const includedNames = cleanedAgg.map((r) => r.name) as string[];

  // Totals within the returned (possibly limited) set, matching table scope.
  // If you want totals across *all* responsibles regardless of limit, remove `limit` from the aggregate query above.
  let totalQuantity = 0;
  let totalSalesValue = 0;
  for (const r of cleanedAgg) {
    totalQuantity += r.totalQuantity;
    totalSalesValue += r.totalSalesValue;
  }

  const periodRows = await loadPeriodRows(prisma, {
    salesValueExpression,
    view,
    salesChannel,
    startDate,
    endDate,
    includedNames,
  });

  const seriesByName = buildSeriesMap(periodRows, view);

  const rows: CommercialResponsibleRow[] = cleanedAgg.map((agg) => {
    const series = seriesByName.get(agg.name) ?? [];
    const shareOfSalesValue =
      totalSalesValue > 0 ? agg.totalSalesValue / totalSalesValue : null;
    const shareOfQuantity =
      totalQuantity > 0 ? agg.totalQuantity / totalQuantity : null;

    return {
      commercialResponsible: agg.name,
      totalSalesValue: agg.totalSalesValue,
      totalQuantity: agg.totalQuantity,
      shareOfSalesValue,
      shareOfQuantity,
      series,
    };
  });

  const availableYears = await loadAvailableYears(prisma);

  return {
    rows,
    filters: {
      year: {
        selected: year,
        options: availableYears,
      },
      salesChannel: {
        selected: salesChannel,
        options: ["all", "direct", "indirect"],
      },
      view: {
        selected: view,
        options: ["yearly", "monthly"],
      },
    },
    totals: {
      quantity: totalQuantity,
      salesValue: totalSalesValue,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      orderBy,
      limit,
    },
  };
}

async function loadPeriodRows(
  prisma: PrismaClient,
  input: {
    salesValueExpression: Prisma.Sql;
    view: CommercialTimeView;
    salesChannel: CommercialSalesChannel;
    startDate: Date | null;
    endDate: Date | null;
    includedNames: string[];
  },
): Promise<PeriodRow[]> {
  if (input.includedNames.length === 0) {
    return [];
  }

  const baseFilters = buildBaseFilters(
    input.startDate,
    input.endDate,
    input.salesChannel,
  );
  const baseWhereSql = buildWhereSql(baseFilters);

  const nameSqlList = input.includedNames.map((n) => Prisma.sql`${n}`);
  const nameFilter = Prisma.sql`TRIM(commercial_responsible) IN (${Prisma.join(nameSqlList)})`;
  const whereSql = buildWhereSql([...baseFilters, nameFilter]);

  if (input.view === "monthly") {
    return prisma.$queryRaw<PeriodRow[]>`
      SELECT
        TRIM(commercial_responsible) AS commercial_responsible,
        CAST(strftime('%Y', delivery_date / 1000.0, 'unixepoch') AS INTEGER) AS year,
        CAST(strftime('%m', delivery_date / 1000.0, 'unixepoch') AS INTEGER) AS month,
        SUM(COALESCE(quantity, 0)) AS total_quantity,
        SUM(${input.salesValueExpression}) AS total_sales
      FROM sales_transactions
      ${whereSql}
      GROUP BY TRIM(commercial_responsible), year, month
      ORDER BY commercial_responsible ASC, year ASC, month ASC
    `;
  }

  // yearly
  return prisma.$queryRaw<PeriodRow[]>`
    SELECT
      TRIM(commercial_responsible) AS commercial_responsible,
      CAST(strftime('%Y', delivery_date / 1000.0, 'unixepoch') AS INTEGER) AS year,
      NULL AS month,
      SUM(COALESCE(quantity, 0)) AS total_quantity,
      SUM(${input.salesValueExpression}) AS total_sales
    FROM sales_transactions
    ${whereSql}
    GROUP BY TRIM(commercial_responsible), year
    ORDER BY commercial_responsible ASC, year ASC
  `;
}

function buildSeriesMap(
  rows: PeriodRow[],
  view: CommercialTimeView,
): Map<string, CommercialPeriodBucket[]> {
  const bucketsByName = new Map<
    string,
    Array<Omit<CommercialPeriodBucket, "deltaSalesValue" | "deltaQuantity">>
  >();

  for (const row of rows) {
    const name = normalizeName(row.commercial_responsible);
    if (!name) continue;

    const year = normalizeYearValue(row.year);
    if (year === null) continue;

    const month = view === "monthly" ? normalizeMonthValue(row.month) : null;
    if (view === "monthly" && month === null) continue;

    const period =
      view === "monthly"
        ? `${year}-${String(month).padStart(2, "0")}`
        : String(year);

    const salesValue = toFiniteNumber(row.total_sales);
    const quantity = toFiniteNumber(row.total_quantity);

    const list = bucketsByName.get(name) ?? [];
    list.push({
      period,
      year,
      month,
      salesValue,
      quantity,
    });
    bucketsByName.set(name, list);
  }

  const withDeltas = new Map<string, CommercialPeriodBucket[]>();

  for (const [name, list] of bucketsByName.entries()) {
    // Ensure deterministic ordering.
    list.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const am = a.month ?? 0;
      const bm = b.month ?? 0;
      return am - bm;
    });

    const series: CommercialPeriodBucket[] = list.map((b, idx) => {
      const prev = idx > 0 ? list[idx - 1] : null;
      const deltaSalesValue = prev ? b.salesValue - prev.salesValue : null;
      const deltaQuantity = prev ? b.quantity - prev.quantity : null;

      return {
        ...b,
        deltaSalesValue,
        deltaQuantity,
      };
    });

    withDeltas.set(name, series);
  }

  return withDeltas;
}

async function loadAvailableYears(prisma: PrismaClient): Promise<number[]> {
  const rows = await prisma.$queryRaw<
    Array<{ year: number | string | bigint | null }>
  >`
    SELECT
      CAST(strftime('%Y', delivery_date / 1000.0, 'unixepoch') AS INTEGER) AS year
    FROM sales_transactions
    WHERE delivery_date IS NOT NULL
    GROUP BY year
    ORDER BY year ASC
  `;

  const years = rows
    .map((r) => normalizeYearValue(r.year))
    .filter((y): y is number => y !== null);

  // ensure uniqueness + sorted
  return Array.from(new Set(years)).sort((a, b) => a - b);
}

function normalizeLimit(limit?: number): number | null {
  if (limit === undefined || limit === null) return null;
  if (!Number.isFinite(limit)) return null;

  const integer = Math.trunc(limit);
  if (integer < 1) return 1;
  if (integer > MAX_LIMIT) return MAX_LIMIT;
  return integer;
}

function normalizeSalesChannel(
  channel?: CommercialSalesChannel,
): CommercialSalesChannel {
  if (channel === "all" || channel === "direct" || channel === "indirect") {
    return channel;
  }
  return "all";
}

function normalizeYearBound(year: number | null): number | null {
  if (year === null) return null;

  if (!Number.isFinite(year)) {
    throw new RangeError(
      `Year must be a finite number or null. Received ${year}.`,
    );
  }

  const integer = Math.trunc(year);

  if (integer < MIN_ALLOWED_YEAR || integer > MAX_ALLOWED_YEAR) {
    throw new RangeError(
      `Year must be between ${MIN_ALLOWED_YEAR} and ${MAX_ALLOWED_YEAR}. Received ${integer}.`,
    );
  }

  return integer;
}

function normalizeYearValue(
  value: number | string | bigint | null,
): number | null {
  if (value === null) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const integerYear = Math.trunc(value);
    return inAllowedYearRange(integerYear) ? integerYear : null;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const integerYear = Math.trunc(numeric);
    return inAllowedYearRange(integerYear) ? integerYear : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;

  const integerYear = Math.trunc(numeric);
  return inAllowedYearRange(integerYear) ? integerYear : null;
}

function normalizeMonthValue(
  value: number | string | bigint | null,
): number | null {
  if (value === null) return null;

  let numeric: number;

  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "bigint") {
    numeric = Number(value);
  } else {
    const trimmed = value.trim();
    if (!trimmed) return null;
    numeric = Number(trimmed);
  }

  if (!Number.isFinite(numeric)) return null;

  const month = Math.trunc(numeric);
  if (month < 1 || month > 12) return null;

  return month;
}

function normalizeName(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildBaseFilters(
  startDate: Date | null,
  endDate: Date | null,
  salesChannel: CommercialSalesChannel,
): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [
    Prisma.sql`commercial_responsible IS NOT NULL`,
    Prisma.sql`TRIM(commercial_responsible) <> ''`,
    Prisma.sql`delivery_date IS NOT NULL`,
  ];

  if (startDate) {
    filters.push(Prisma.sql`delivery_date >= ${startDate}`);
  }

  if (endDate) {
    filters.push(Prisma.sql`delivery_date < ${endDate}`);
  }

  const channelFilter = buildSalesChannelFilter(salesChannel);
  if (channelFilter) {
    filters.push(channelFilter);
  }

  return filters;
}

function buildWhereSql(filters: Prisma.Sql[]): Prisma.Sql {
  if (filters.length === 0) return Prisma.sql``;
  return Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;
}

function buildSalesChannelFilter(
  channel: CommercialSalesChannel,
): Prisma.Sql | null {
  if (channel === "all") return null;

  const indirectTypesSqlList = INDIRECT_ORDER_TYPES.map(
    (t) => Prisma.sql`${t}`,
  );
  const isIndirectSql = Prisma.sql`order_type IN (${Prisma.join(indirectTypesSqlList)})`;

  return channel === "indirect"
    ? isIndirectSql
    : Prisma.sql`NOT (${isIndirectSql})`;
}

function resolveSalesValueExpression(
  channel: CommercialSalesChannel,
): Prisma.Sql {
  if (channel === "direct") {
    return SALES_VALUE_DIRECT_EXPRESSION;
  }

  if (channel === "indirect") {
    return SALES_VALUE_INDIRECT_EXPRESSION;
  }

  return SALES_VALUE_ALL_EXPRESSION;
}

function buildOrderBySql(orderBy: CommercialResponsiblesOrderBy): Prisma.Sql {
  switch (orderBy) {
    case "quantity":
      return Prisma.sql`ORDER BY total_quantity DESC, total_sales DESC, commercial_responsible ASC`;
    case "name":
      return Prisma.sql`ORDER BY commercial_responsible ASC, total_sales DESC, total_quantity DESC`;
    case "sales":
    default:
      return Prisma.sql`ORDER BY total_sales DESC, total_quantity DESC, commercial_responsible ASC`;
  }
}

function inAllowedYearRange(year: number): boolean {
  return year >= MIN_ALLOWED_YEAR && year <= MAX_ALLOWED_YEAR;
}
