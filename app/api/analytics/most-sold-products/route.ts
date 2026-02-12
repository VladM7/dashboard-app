import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

type YearFilter = "all" | number;
type CategoryFilter = "all" | string;

type RawYearRow = {
  year: number | string | bigint | null;
};

type RawCategoryRow = {
  category: string | null;
};

type RawTopProductRow = {
  product_category: string | null;
  product_family: string | null;
  product_reference: string | null;
  total_quantity: number | string | bigint | null;
  category_total_quantity: number | string | bigint | null;
  rank: number | string | bigint | null;
};

type MostSoldProductRow = {
  productCategory: string;
  productReference: string;
  productFamily: string | null;
  totalQuantity: number;
  categoryTotalQuantity: number;
  shareWithinCategory: number | null;
  rankWithinCategory: number;
};

type FiltersPayload = {
  year: {
    selected: string;
    options: string[];
  };
  category: {
    selected: string;
    options: string[];
  };
};

type ResponsePayload = {
  filters: FiltersPayload;
  rows: MostSoldProductRow[];
  summary: {
    totalCategories: number;
    totalQuantityTopProducts: number;
    totalRows: number;
    generatedAt: string;
  };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseYear(url.searchParams.get("year"));
    const category = parseCategory(url.searchParams.get("category"));

    const yearOptionsPromise = prisma.$queryRaw<RawYearRow[]>`
      SELECT DISTINCT CAST(
        strftime('%Y', delivery_date / 1000.0, 'unixepoch')
        AS INTEGER
      ) AS year
      FROM sales_transactions
      WHERE delivery_date IS NOT NULL
      ORDER BY year DESC
    `;

    const categoryOptionsPromise = prisma.$queryRaw<RawCategoryRow[]>`
      SELECT DISTINCT product_category AS category
      FROM sales_transactions
      WHERE product_category IS NOT NULL
        AND TRIM(product_category) <> ''
      ORDER BY category ASC
    `;

    const whereSql = buildWhereClause(year, category);

    const countWhereSql = buildCountWhereClause(year, category);

    const topProductsPromise = prisma.$queryRaw<RawTopProductRow[]>(
      Prisma.sql`
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
      `,
    );

    const totalRowsPromise = prisma.$queryRaw<
      { total: number | string | bigint | null }[]
    >(
      Prisma.sql`
          SELECT COUNT(*) AS total
          FROM sales_transactions
          ${countWhereSql}
        `,
    );

    const [yearRows, categoryRows, topProductRows, totalRowsResult] =
      await Promise.all([
        yearOptionsPromise,
        categoryOptionsPromise,
        topProductsPromise,
        totalRowsPromise,
      ]);

    const yearOptions = buildYearOptions(yearRows, year);
    const categoryOptions = buildCategoryOptions(categoryRows, category);

    const rows = mapTopProductRows(topProductRows);
    const uniqueCategories = new Set(rows.map((row) => row.productCategory));
    const totalQuantityTopProducts = rows.reduce(
      (total, row) => total + row.totalQuantity,
      0,
    );
    const totalRows =
      totalRowsResult.length > 0 ? toNumber(totalRowsResult[0].total) : 0;

    const payload: ResponsePayload = {
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
        totalRows,
        generatedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof BadRequestError ? 400 : 500;
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status });
  }
}

function parseYear(value: string | null): YearFilter {
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

function parseCategory(value: string | null): CategoryFilter {
  if (!value || value.trim().length === 0 || value.toLowerCase() === "all") {
    return "all";
  }

  return value.trim();
}

function buildWhereClause(
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

function buildCountWhereClause(
  year: YearFilter,
  category: CategoryFilter,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];

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

function buildYearOptions(
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

function buildCategoryOptions(
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

function normalizeYearValue(
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

function mapTopProductRows(rows: RawTopProductRow[]): MostSoldProductRow[] {
  return rows
    .filter(
      (row): row is RawTopProductRow & { product_category: string } =>
        !!row.product_category,
    )
    .map((row) => {
      const totalQuantity = toNumber(row.total_quantity);
      const categoryTotal = toNumber(row.category_total_quantity);
      return {
        productCategory: row.product_category!,
        productReference: row.product_reference || "N/A",
        productFamily: row.product_family,
        totalQuantity,
        categoryTotalQuantity: categoryTotal,
        shareWithinCategory:
          categoryTotal > 0 ? totalQuantity / categoryTotal : null,
        rankWithinCategory: toNumber(row.rank),
      };
    });
}

function toNumber(value: number | string | bigint | null): number {
  if (value === null) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
