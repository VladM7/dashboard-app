import { Prisma, type PrismaClient } from "@prisma/client";

import { toFiniteNumber } from "../numbers";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export type YearFilter = "all" | number;
export type CategoryFilter = "all" | string;

export type RawYearRow = {
  year: number | string | bigint | null;
};

export type RawCategoryRow = {
  category: string | null;
};

export type RawTopProductRow = {
  product_category: string | null;
  product_family: string | null;
  product_reference: string | null;
  total_quantity: number | string | bigint | null;
  category_total_quantity: number | string | bigint | null;
  rank: number | string | bigint | null;
};

export type MostSoldProductRow = {
  productCategory: string;
  productReference: string;
  productFamily: string | null;
  totalQuantity: number;
  categoryTotalQuantity: number;
  shareWithinCategory: number | null;
  rankWithinCategory: number;
};

export type MostSoldProductsFiltersPayload = {
  year: {
    selected: string;
    options: string[];
  };
  category: {
    selected: string;
    options: string[];
  };
};

export type MostSoldProductsSummaryPayload = {
  totalCategories: number;
  totalQuantityTopProducts: number;
  totalRows: number;
  generatedAt: string;
};

export type MostSoldProductsResponsePayload = {
  filters: MostSoldProductsFiltersPayload;
  rows: MostSoldProductRow[];
  summary: MostSoldProductsSummaryPayload;
};

export function parseYear(value: string | null): YearFilter {
  if (!value || value.trim().length === 0 || value.toLowerCase() === "all") {
    return "all";
  }

  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 1900 || numeric > 2200) {
    throw new BadRequestError(
      "Invalid year parameter. Use 'all' or a four-digit year between 1900 and 2200.",
    );
  }

  return numeric;
}

export function parseCategory(value: string | null): CategoryFilter {
  if (!value || value.trim().length === 0 || value.toLowerCase() === "all") {
    return "all";
  }

  return value.trim();
}

export function buildWhereClause(
  year: YearFilter,
  category: CategoryFilter,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`product_category IS NOT NULL AND TRIM(product_category) <> ''`,
  ];

  if (year !== "all") {
    const startMs = Date.UTC(year, 0, 1);
    const endMs = Date.UTC(year + 1, 0, 1);
    clauses.push(
      Prisma.sql`delivery_date >= ${startMs} AND delivery_date < ${endMs}`,
    );
  }

  if (category !== "all") {
    clauses.push(Prisma.sql`product_category = ${category}`);
  }

  if (clauses.length === 0) {
    return Prisma.sql``;
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

export function buildYearOptions(
  rows: RawYearRow[],
  selectedYear: YearFilter,
): number[] {
  const seen = new Set<number>();
  const years: number[] = [];

  for (const { year } of rows) {
    const normalized = normalizeYearValue(year);
    if (normalized !== null && !seen.has(normalized)) {
      seen.add(normalized);
      years.push(normalized);
    }
  }

  if (selectedYear !== "all" && !seen.has(selectedYear)) {
    seen.add(selectedYear);
    years.push(selectedYear);
  }

  years.sort((a, b) => b - a);

  return years;
}

export function buildCategoryOptions(
  rows: RawCategoryRow[],
  selectedCategory: CategoryFilter,
): string[] {
  const categories = rows
    .map((row) => row.category)
    .filter(
      (category): category is string => !!category && category.trim() !== "",
    );

  const unique = Array.from(new Set(categories)).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  if (
    selectedCategory !== "all" &&
    !unique.some(
      (category) =>
        category.localeCompare(selectedCategory, undefined, {
          sensitivity: "base",
        }) === 0,
    )
  ) {
    unique.unshift(selectedCategory);
  }

  return unique;
}

export function normalizeYearValue(
  year: number | string | bigint | null,
): number | null {
  if (year === null) {
    return null;
  }

  if (typeof year === "number") {
    return Number.isInteger(year) ? year : null;
  }

  if (typeof year === "bigint") {
    const numeric = Number(year);
    return Number.isFinite(numeric) && Number.isInteger(numeric)
      ? numeric
      : null;
  }

  const trimmed = year.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isInteger(numeric) ? numeric : null;
}

export function mapTopProductRows(
  rows: RawTopProductRow[],
): MostSoldProductRow[] {
  return rows
    .filter(
      (row): row is RawTopProductRow & { product_category: string } =>
        !!row.product_category,
    )
    .map((row) => {
      const totalQuantity = toFiniteNumber(row.total_quantity);
      const categoryTotal = toFiniteNumber(row.category_total_quantity);
      return {
        productCategory: row.product_category!,
        productReference: row.product_reference || "N/A",
        productFamily: row.product_family,
        totalQuantity,
        categoryTotalQuantity: categoryTotal,
        shareWithinCategory:
          categoryTotal > 0 ? totalQuantity / categoryTotal : null,
        rankWithinCategory: toFiniteNumber(row.rank),
      };
    });
}

export async function fetchYearRows(
  prisma: PrismaClient,
): Promise<RawYearRow[]> {
  return prisma.$queryRaw<RawYearRow[]>`
    SELECT DISTINCT CAST(
      strftime('%Y', delivery_date / 1000.0, 'unixepoch')
      AS INTEGER
    ) AS year
    FROM sales_transactions
    WHERE delivery_date IS NOT NULL
    ORDER BY year DESC
  `;
}

export async function fetchCategoryRows(
  prisma: PrismaClient,
): Promise<RawCategoryRow[]> {
  return prisma.$queryRaw<RawCategoryRow[]>`
    SELECT DISTINCT product_category AS category
    FROM sales_transactions
    WHERE product_category IS NOT NULL
      AND TRIM(product_category) <> ''
    ORDER BY category ASC
  `;
}

export function buildTopProductsQuery(whereSql: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    WITH filtered AS (
      SELECT
        product_category,
        product_family,
        product_reference,
        SUM(COALESCE(quantity, 0)) AS total_quantity
      FROM sales_transactions
      ${whereSql}
      GROUP BY product_category, product_family, product_reference
    ),
    ranked AS (
      SELECT
        product_category,
        product_family,
        product_reference,
        total_quantity,
        SUM(total_quantity) OVER (PARTITION BY product_category) AS category_total_quantity,
        ROW_NUMBER() OVER (
          PARTITION BY product_category
          ORDER BY total_quantity DESC, product_reference ASC
        ) AS rn
      FROM filtered
    )
    SELECT
      product_category,
      product_family,
      product_reference,
      total_quantity,
      category_total_quantity,
      rn AS rank
    FROM ranked
    WHERE rn <= 5
    ORDER BY total_quantity DESC, product_category ASC, product_reference ASC
  `;
}

export async function fetchTopProductRows(
  prisma: PrismaClient,
  whereSql: Prisma.Sql,
): Promise<RawTopProductRow[]> {
  return prisma.$queryRaw<RawTopProductRow[]>(buildTopProductsQuery(whereSql));
}

export async function buildMostSoldProductsPayload(
  prisma: PrismaClient,
  year: YearFilter,
  category: CategoryFilter,
): Promise<MostSoldProductsResponsePayload> {
  const whereSql = buildWhereClause(year, category);

  const [yearRows, categoryRows, topProductRows] = await Promise.all([
    fetchYearRows(prisma),
    fetchCategoryRows(prisma),
    fetchTopProductRows(prisma, whereSql),
  ]);

  const yearOptions = buildYearOptions(yearRows, year);
  const categoryOptions = buildCategoryOptions(categoryRows, category);
  const rows = mapTopProductRows(topProductRows);

  const uniqueCategories = new Set(rows.map((row) => row.productCategory));
  const totalQuantityTopProducts = rows.reduce(
    (total, row) => total + row.totalQuantity,
    0,
  );

  return {
    filters: {
      year: {
        selected: year === "all" ? "all" : String(year),
        options: ["all", ...yearOptions.map(String)],
      },
      category: {
        selected: category === "all" ? "all" : category,
        options: ["all", ...categoryOptions],
      },
    },
    rows,
    summary: {
      totalCategories: uniqueCategories.size,
      totalQuantityTopProducts,
      totalRows: rows.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
