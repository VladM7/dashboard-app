import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Ensure we run on the Node.js runtime (needed for Prisma + SQLite).
 */
export const runtime = "nodejs";

type SalesRow = {
  transaction_id: number;
  commercial_responsible: string;
  order_type: string;
  supplier: string;
  billing_sign: string | null;
  delivery_client: string;
  delivery_circuit: string;
  product_category: string;
  product_family: string;
  product_reference: string;
  delivery_date: Date;
  quantity: number | null;
  sales_altona: number | null;
  purchases_altona_eur: number | null;
  purchases_purchase_currency: number | null;
  purchase_currency: string | null;
  direct_sales: number | null;
  commission_altona: number | null;
  total_pub_budget: number | null;
  rfa_on_resale_orders: number | null;
  logistics_cost_altona: number | null;
  prescriber_commission: number | null;
  total_net_margin_eur: number | null;
};

type ApiRow = Omit<SalesRow, "delivery_date"> & { delivery_date: string };

interface ApiResponse {
  scopeCount: number; // number of rows considered (<= 1000)
  page: number;
  pageSize: number;
  pageCount: number;
  totalRows: number; // total rows in table
  rows: ApiRow[];
  aggregates: {
    direct_sales: number;
    commission_altona: number;
    total_net_margin_eur: number;
  };
}

/**
 * Safely parse integer query params with min/max bounds.
 */
function parseIntParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Normalize possible Prisma Decimal / number / string to number | null
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    // @ts-expect-error - decimal.js object from Prisma
    typeof value.toNumber === "function"
  ) {
    try {
      return (value as { toNumber: () => number }).toNumber();
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = parseIntParam(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = parseIntParam(
      url.searchParams.get("pageSize"),
      50,
      1,
      500,
    );

    // Total rows in full table
    const totalRows = await prisma.sales_transactions.count();

    // Fetch latest up to 1000 rows (scope)
    const latestRowsRaw = await prisma.sales_transactions.findMany({
      orderBy: { transaction_id: "desc" },
      take: 1000,
    });

    const scopeCount = latestRowsRaw.length;
    const pageCount = Math.max(1, Math.ceil(scopeCount / pageSize));
    const effectivePage = Math.min(page, pageCount);

    // Slice in-memory for requested page
    const start = (effectivePage - 1) * pageSize;
    const end = start + pageSize;
    const slice = latestRowsRaw.slice(start, end);

    // Map & normalize
    const rows: ApiRow[] = slice.map(
      (r: (typeof latestRowsRaw)[number]): ApiRow => ({
        transaction_id: r.transaction_id,
        commercial_responsible: r.commercial_responsible,
        order_type: r.order_type,
        supplier: r.supplier,
        billing_sign: r.billing_sign,
        delivery_client: r.delivery_client,
        delivery_circuit: r.delivery_circuit,
        product_category: r.product_category,
        product_family: r.product_family,
        product_reference: r.product_reference,
        delivery_date: r.delivery_date.toISOString(),
        quantity: toNumber(r.quantity),
        sales_altona: toNumber(r.sales_altona),
        purchases_altona_eur: toNumber(r.purchases_altona_eur),
        purchases_purchase_currency: toNumber(r.purchases_purchase_currency),
        purchase_currency: r.purchase_currency,
        direct_sales: toNumber(r.direct_sales),
        commission_altona: toNumber(r.commission_altona),
        total_pub_budget: toNumber(r.total_pub_budget),
        rfa_on_resale_orders: toNumber(r.rfa_on_resale_orders),
        logistics_cost_altona: toNumber(r.logistics_cost_altona),
        prescriber_commission: toNumber(r.prescriber_commission),
        total_net_margin_eur: toNumber(r.total_net_margin_eur),
      }),
    );

    // Aggregates over the entire 1000-row scope (not just current page)
    let aggDirect = 0;
    let aggCommission = 0;
    let aggMargin = 0;
    for (const r of latestRowsRaw) {
      const d = toNumber(r.direct_sales);
      const c = toNumber(r.commission_altona);
      const m = toNumber(r.total_net_margin_eur);
      if (d !== null) aggDirect += d;
      if (c !== null) aggCommission += c;
      if (m !== null) aggMargin += m;
    }

    const response: ApiResponse = {
      scopeCount,
      page: effectivePage,
      pageSize,
      pageCount,
      totalRows,
      rows,
      aggregates: {
        direct_sales: aggDirect,
        commission_altona: aggCommission,
        total_net_margin_eur: aggMargin,
      },
    };

    return NextResponse.json(response, {
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
