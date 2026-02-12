import { Prisma, type PrismaClient } from "@prisma/client";

import { toFiniteNumber } from "../numbers";

export type PartnerKind = "supplier" | "client";
export type PartnerKindInput = PartnerKind | "suppliers" | "clients";
export type TopPartnersOrderBy = "sales" | "quantity";

export type SalesChannel = "all" | "direct" | "indirect";

export interface TopPartnersOptions {
  kind: PartnerKind;
  /** Maximum number of partners returned. Defaults to 5. Clamped between 1 and 25. */
  limit?: number;
  /** Sorting strategy for the top list. Defaults to "sales". */
  orderBy?: TopPartnersOrderBy;
  /** Inclusive lower bound for the delivery year. */
  minYear?: number | null;
  /** Inclusive upper bound for the delivery year. */
  maxYear?: number | null;
  /** Filter for direct/indirect sales. Defaults to "all". */
  salesChannel?: SalesChannel;
}

export interface TopPartnerYearBreakdown {
  year: number;
  totalQuantity: number;
  totalSalesValue: number;
}

export interface TopPartner {
  rank: number;
  partnerName: string;
  totalQuantity: number;
  totalSalesValue: number;
  years: TopPartnerYearBreakdown[];
}

export interface TopPartnersPayload {
  kind: PartnerKind;
  partners: TopPartner[];
  availableYears: number[];
  totals: {
    quantity: number;
    salesValue: number;
  };
  metadata: {
    limit: number;
    orderBy: TopPartnersOrderBy;
    minYear: number | null;
    maxYear: number | null;
    salesChannel: SalesChannel;
  };
}

export class InvalidPartnerKindError extends Error {
  constructor(kind: unknown) {
    super(`Unsupported partner kind: ${kind}`);
    this.name = "InvalidPartnerKindError";
  }
}

const PARTNER_COLUMN_MAP: Record<PartnerKind, Prisma.Sql> = {
  supplier: Prisma.sql`supplier`,
  client: Prisma.sql`billing_sign`,
};

const DEFAULT_TOP_LIMIT = 5;
const MAX_TOP_LIMIT = 25;
const MIN_ALLOWED_YEAR = 1900;
const MAX_ALLOWED_YEAR = 2200;
const RAW_LIMIT_MULTIPLIER = 4;

const INDIRECT_ORDER_TYPES = ["Permanent direct", "Opération direct"] as const;

const SALES_VALUE_ALL_EXPRESSION = Prisma.sql`
  CASE
    WHEN COALESCE(sales_altona, 0) <> 0 THEN COALESCE(sales_altona, 0)
    WHEN COALESCE(direct_sales, 0) <> 0 THEN COALESCE(direct_sales, 0)
    ELSE COALESCE(sales_altona, direct_sales, 0)
  END
`;

const SALES_VALUE_DIRECT_EXPRESSION = Prisma.sql`COALESCE(direct_sales, 0)`;
const SALES_VALUE_INDIRECT_EXPRESSION = Prisma.sql`COALESCE(sales_altona, 0)`;

type AggregateRow = {
  partner_name: string | null;
  total_quantity: unknown;
  total_sales: unknown;
};

type YearRow = {
  partner_name: string | null;
  year: number | string | bigint | null;
  total_quantity: unknown;
  total_sales: unknown;
};

type CanonicalBucket = {
  canonicalKey: string;
  displayName: string;
  variants: Set<string>;
  totalQuantity: number;
  totalSalesValue: number;
  years: Map<number, { totalQuantity: number; totalSalesValue: number }>;
  ordinal: number;
};

export function normalizePartnerKind(
  kind: PartnerKindInput | string | null | undefined,
): PartnerKind {
  const normalized = (kind ?? "").toString().trim().toLowerCase();

  if (normalized === "supplier" || normalized === "suppliers") {
    return "supplier";
  }

  if (normalized === "client" || normalized === "clients") {
    return "client";
  }

  throw new InvalidPartnerKindError(kind);
}

export async function buildTopPartnersPayload(
  prisma: PrismaClient,
  options: TopPartnersOptions,
): Promise<TopPartnersPayload> {
  const limit = normalizeLimit(options.limit);
  const rawLimit = Math.max(
    limit,
    Math.min(
      limit * RAW_LIMIT_MULTIPLIER,
      MAX_TOP_LIMIT * RAW_LIMIT_MULTIPLIER,
    ),
  );

  const orderBy: TopPartnersOrderBy = options.orderBy ?? "sales";
  const salesChannel: SalesChannel = normalizeSalesChannel(
    options.salesChannel,
  );

  const minYear = normalizeYearBound(options.minYear);
  const maxYear = normalizeYearBound(options.maxYear);

  if (minYear !== null && maxYear !== null && minYear > maxYear) {
    throw new RangeError(
      `minYear (${minYear}) must be less than or equal to maxYear (${maxYear}).`,
    );
  }

  const startDate =
    minYear !== null ? new Date(Date.UTC(minYear, 0, 1, 0, 0, 0)) : null;
  const endDate =
    maxYear !== null ? new Date(Date.UTC(maxYear + 1, 0, 1, 0, 0, 0)) : null;

  const partnerColumn = PARTNER_COLUMN_MAP[options.kind];
  const trimmedPartnerColumn = Prisma.sql`TRIM(${partnerColumn})`;
  const baseFilters = buildBaseFilters(
    trimmedPartnerColumn,
    startDate,
    endDate,
    salesChannel,
  );
  const baseWhereSql = buildWhereSql(baseFilters);

  const salesValueExpression = resolveSalesValueExpression(salesChannel);

  const orderBySql =
    orderBy === "quantity"
      ? Prisma.sql`ORDER BY total_quantity DESC, total_sales DESC, partner_name ASC`
      : Prisma.sql`ORDER BY total_sales DESC, total_quantity DESC, partner_name ASC`;

  const topPartnersRaw = await prisma.$queryRaw<AggregateRow[]>`
    SELECT
      ${trimmedPartnerColumn} AS partner_name,
      SUM(COALESCE(quantity, 0)) AS total_quantity,
      SUM(${salesValueExpression}) AS total_sales
    FROM sales_transactions
    ${baseWhereSql}
    GROUP BY ${trimmedPartnerColumn}
    ${orderBySql}
    LIMIT ${rawLimit}
  `;

  const bucketMap = new Map<string, CanonicalBucket>();

  topPartnersRaw.forEach((row, index) => {
    const partnerName = normalizePartnerName(row.partner_name);
    if (!partnerName) {
      return;
    }

    const canonicalKey = canonicalizePartnerKey(partnerName);
    if (!canonicalKey) {
      return;
    }

    const totalQuantity = toFiniteNumber(row.total_quantity);
    const totalSalesValue = toFiniteNumber(row.total_sales);

    let bucket = bucketMap.get(canonicalKey);
    if (!bucket) {
      bucket = {
        canonicalKey,
        displayName: partnerName,
        variants: new Set([partnerName]),
        totalQuantity: 0,
        totalSalesValue: 0,
        years: new Map(),
        ordinal: index,
      };
      bucketMap.set(canonicalKey, bucket);
    } else {
      bucket.variants.add(partnerName);
      bucket.displayName = choosePreferredDisplayName(
        bucket.displayName,
        partnerName,
      );
      bucket.ordinal = Math.min(bucket.ordinal, index);
    }

    bucket.totalQuantity += totalQuantity;
    bucket.totalSalesValue += totalSalesValue;
  });

  const variantNames = new Set<string>();
  for (const bucket of bucketMap.values()) {
    for (const variant of bucket.variants) {
      const trimmed = variant.trim();
      if (trimmed.length > 0) {
        variantNames.add(trimmed);
      }
    }
  }

  if (variantNames.size > 0) {
    const partnerNameSqlList = Array.from(variantNames).map(
      (name) => Prisma.sql`${name}`,
    );

    if (partnerNameSqlList.length > 0) {
      const partnerFilter = Prisma.sql`${trimmedPartnerColumn} IN (${Prisma.join(partnerNameSqlList)})`;
      const yearFilters = [...baseFilters, partnerFilter];
      const yearWhereSql = buildWhereSql(yearFilters);

      const yearRows = await prisma.$queryRaw<YearRow[]>`
        SELECT
          ${trimmedPartnerColumn} AS partner_name,
          CAST(strftime('%Y', delivery_date / 1000.0, 'unixepoch') AS INTEGER) AS year,
          SUM(COALESCE(quantity, 0)) AS total_quantity,
          SUM(${salesValueExpression}) AS total_sales
        FROM sales_transactions
        ${yearWhereSql}
        GROUP BY ${trimmedPartnerColumn}, year
        ORDER BY partner_name ASC, year ASC
      `;

      for (const row of yearRows) {
        const partnerName = normalizePartnerName(row.partner_name);
        if (!partnerName) {
          continue;
        }

        const canonicalKey = canonicalizePartnerKey(partnerName);
        if (!canonicalKey) {
          continue;
        }

        const bucket = bucketMap.get(canonicalKey);
        if (!bucket) {
          continue;
        }

        const year = normalizeYearValue(row.year);
        if (year === null) {
          continue;
        }

        const totalQuantity = toFiniteNumber(row.total_quantity);
        const totalSalesValue = toFiniteNumber(row.total_sales);

        const yearBucket = bucket.years.get(year) ?? {
          totalQuantity: 0,
          totalSalesValue: 0,
        };

        yearBucket.totalQuantity += totalQuantity;
        yearBucket.totalSalesValue += totalSalesValue;

        bucket.years.set(year, yearBucket);
      }
    }
  }

  const buckets = Array.from(bucketMap.values());

  buckets.sort((a, b) => {
    if (orderBy === "quantity") {
      return (
        compareDescending(a.totalQuantity, b.totalQuantity) ||
        compareDescending(a.totalSalesValue, b.totalSalesValue) ||
        compareAscendingString(a.displayName, b.displayName) ||
        a.ordinal - b.ordinal
      );
    }

    return (
      compareDescending(a.totalSalesValue, b.totalSalesValue) ||
      compareDescending(a.totalQuantity, b.totalQuantity) ||
      compareAscendingString(a.displayName, b.displayName) ||
      a.ordinal - b.ordinal
    );
  });

  const topBuckets = buckets.slice(0, limit);

  const partners: TopPartner[] = topBuckets.map((bucket, index) => {
    const years = Array.from(bucket.years.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, values]) => ({
        year,
        totalQuantity: values.totalQuantity,
        totalSalesValue: values.totalSalesValue,
      }));

    return {
      rank: index + 1,
      partnerName: bucket.displayName,
      totalQuantity: bucket.totalQuantity,
      totalSalesValue: bucket.totalSalesValue,
      years,
    };
  });

  const availableYears = Array.from(
    new Set(topBuckets.flatMap((bucket) => Array.from(bucket.years.keys()))),
  ).sort((a, b) => a - b);

  let aggregateQuantity = 0;
  let aggregateSalesValue = 0;

  partners.forEach((partner) => {
    aggregateQuantity += partner.totalQuantity;
    aggregateSalesValue += partner.totalSalesValue;
  });

  return {
    kind: options.kind,
    partners,
    availableYears,
    totals: {
      quantity: aggregateQuantity,
      salesValue: aggregateSalesValue,
    },
    metadata: {
      limit,
      orderBy,
      minYear,
      maxYear,
      salesChannel,
    },
  };
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit ?? NaN)) {
    return DEFAULT_TOP_LIMIT;
  }

  const integerLimit = Math.trunc(limit as number);
  if (integerLimit < 1) {
    return 1;
  }

  if (integerLimit > MAX_TOP_LIMIT) {
    return MAX_TOP_LIMIT;
  }

  return integerLimit;
}

function normalizeYearBound(year?: number | null): number | null {
  if (year === undefined || year === null) {
    return null;
  }

  if (!Number.isFinite(year)) {
    throw new RangeError(
      `Year bounds must be finite numbers. Received ${year}.`,
    );
  }

  const integerYear = Math.trunc(year);

  if (integerYear < MIN_ALLOWED_YEAR || integerYear > MAX_ALLOWED_YEAR) {
    throw new RangeError(
      `Year bounds must be between ${MIN_ALLOWED_YEAR} and ${MAX_ALLOWED_YEAR}. Received ${integerYear}.`,
    );
  }

  return integerYear;
}

function normalizeYearValue(
  value: number | string | bigint | null,
): number | null {
  if (value === null) {
    return null;
  }

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
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const integerYear = Math.trunc(numeric);
  return inAllowedYearRange(integerYear) ? integerYear : null;
}

function normalizePartnerName(name: string | null): string | null {
  if (typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizePartnerKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function choosePreferredDisplayName(
  existing: string,
  candidate: string,
): string {
  if (!existing) {
    return candidate;
  }

  if (!candidate) {
    return existing;
  }

  if (candidate.length > existing.length) {
    return candidate;
  }

  if (candidate.length < existing.length) {
    return existing;
  }

  const comparison = candidate.localeCompare(existing, undefined, {
    sensitivity: "accent",
    numeric: true,
  });

  if (comparison < 0) {
    return candidate;
  }

  return existing;
}

function buildBaseFilters(
  partnerColumn: Prisma.Sql,
  startDate?: Date | null,
  endDate?: Date | null,
  salesChannel: SalesChannel = "all",
): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [
    Prisma.sql`${partnerColumn} IS NOT NULL`,
    Prisma.sql`${partnerColumn} <> ''`,
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
  if (filters.length === 0) {
    return Prisma.sql``;
  }

  return Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;
}

function normalizeSalesChannel(channel?: SalesChannel): SalesChannel {
  if (channel === "direct" || channel === "indirect" || channel === "all") {
    return channel;
  }
  return "all";
}

function buildSalesChannelFilter(channel: SalesChannel): Prisma.Sql | null {
  if (channel === "all") {
    return null;
  }

  const indirectTypesSqlList = INDIRECT_ORDER_TYPES.map(
    (t) => Prisma.sql`${t}`,
  );
  const isIndirectSql = Prisma.sql`order_type IN (${Prisma.join(indirectTypesSqlList)})`;

  return channel === "indirect"
    ? isIndirectSql
    : Prisma.sql`NOT (${isIndirectSql})`;
}

function resolveSalesValueExpression(channel: SalesChannel): Prisma.Sql {
  if (channel === "direct") {
    return SALES_VALUE_INDIRECT_EXPRESSION;
  }

  if (channel === "indirect") {
    return SALES_VALUE_DIRECT_EXPRESSION;
  }

  return SALES_VALUE_ALL_EXPRESSION;
}

function inAllowedYearRange(year: number): boolean {
  return year >= MIN_ALLOWED_YEAR && year <= MAX_ALLOWED_YEAR;
}

function compareDescending(a: number, b: number): number {
  return b - a;
}

function compareAscendingString(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    sensitivity: "accent",
    numeric: true,
  });
}
