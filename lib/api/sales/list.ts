import type { PrismaClient } from "@prisma/client";

import {
  parseBoundedInteger,
  toNullableNumber,
} from "@/lib/api/numbers";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE = 10_000;
export const MIN_PAGE = 1;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 500;
export const DEFAULT_SCOPE_LIMIT = 1_000;

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
  quantity: unknown;
  sales_altona: unknown;
  purchases_altona_eur: unknown;
  purchases_purchase_currency: unknown;
  purchase_currency: string | null;
  direct_sales: unknown;
  commission_altona: unknown;
  total_pub_budget: unknown;
  rfa_on_resale_orders: unknown;
  logistics_cost_altona: unknown;
  prescriber_commission: unknown;
  total_net_margin_eur: unknown;
};

export type SalesListRow = Omit<SalesRow, "delivery_date"> & {
  delivery_date: string;
  quantity: number | null;
  sales_altona: number | null;
  purchases_altona_eur: number | null;
  purchases_purchase_currency: number | null;
  direct_sales: number | null;
  commission_altona: number | null;
  total_pub_budget: number | null;
  rfa_on_resale_orders: number | null;
  logistics_cost_altona: number | null;
  prescriber_commission: number | null;
  total_net_margin_eur: number | null;
};

export type SalesListAggregates = {
  direct_sales: number;
  commission_altona: number;
  total_net_margin_eur: number;
};

export type SalesListPayload = {
  scopeCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  totalRows: number;
  rows: SalesListRow[];
  aggregates: SalesListAggregates;
};

export type SalesListQuery = {
  page: number;
  pageSize: number;
};

export type SalesListOptions = {
  scopeLimit?: number;
};

export function parseSalesListQuery(
  params: URLSearchParams,
): SalesListQuery {
  const page = parseBoundedInteger(
    params.get("page"),
    DEFAULT_PAGE,
    MIN_PAGE,
    MAX_PAGE,
  );

  const pageSize = parseBoundedInteger(
    params.get("pageSize"),
    DEFAULT_PAGE_SIZE,
    MIN_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  return { page, pageSize };
}

export async function buildSalesListPayload(
  prisma: PrismaClient,
  query: SalesListQuery,
  options: SalesListOptions = {},
): Promise<SalesListPayload> {
  const scopeLimit = options.scopeLimit ?? DEFAULT_SCOPE_LIMIT;

  const totalRows = await prisma.sales_transactions.count();

  const latestRowsRaw = await prisma.sales_transactions.findMany({
    orderBy: { transaction_id: "desc" },
    take: scopeLimit,
  });

  const scopeCount = latestRowsRaw.length;

  const pageCount = Math.max(
    1,
    Math.ceil(scopeCount / query.pageSize),
  );
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * query.pageSize;
  const end = start + query.pageSize;

  const rows = latestRowsRaw
    .slice(start, end)
    .map(mapSalesRow);

  const aggregates = computeAggregates(latestRowsRaw);

  return {
    scopeCount,
    page,
    pageSize: query.pageSize,
    pageCount,
    totalRows,
    rows,
    aggregates,
  };
}

function mapSalesRow(row: SalesRow): SalesListRow {
  return {
    transaction_id: row.transaction_id,
    commercial_responsible: row.commercial_responsible,
    order_type: row.order_type,
    supplier: row.supplier,
    billing_sign: row.billing_sign,
    delivery_client: row.delivery_client,
    delivery_circuit: row.delivery_circuit,
    product_category: row.product_category,
    product_family: row.product_family,
    product_reference: row.product_reference,
    delivery_date: row.delivery_date.toISOString(),
    quantity: toNullableNumber(row.quantity),
    sales_altona: toNullableNumber(row.sales_altona),
    purchases_altona_eur: toNullableNumber(
      row.purchases_altona_eur,
    ),
    purchases_purchase_currency: toNullableNumber(
      row.purchases_purchase_currency,
    ),
    purchase_currency: row.purchase_currency,
    direct_sales: toNullableNumber(row.direct_sales),
    commission_altona: toNullableNumber(row.commission_altona),
    total_pub_budget: toNullableNumber(row.total_pub_budget),
    rfa_on_resale_orders: toNullableNumber(
      row.rfa_on_resale_orders,
    ),
    logistics_cost_altona: toNullableNumber(
      row.logistics_cost_altona,
    ),
    prescriber_commission: toNullableNumber(
      row.prescriber_commission,
    ),
    total_net_margin_eur: toNullableNumber(
      row.total_net_margin_eur,
    ),
  };
}

function computeAggregates(rows: SalesRow[]): SalesListAggregates {
  let direct = 0;
  let commission = 0;
  let margin = 0;

  for (const row of rows) {
    const directValue = toNullableNumber(row.direct_sales);
    const commissionValue = toNullableNumber(
      row.commission_altona,
    );
    const marginValue = toNullableNumber(
      row.total_net_margin_eur,
    );

    if (directValue !== null) direct += directValue;
    if (commissionValue !== null) commission += commissionValue;
    if (marginValue !== null) margin += marginValue;
  }

  return {
    direct_sales: direct,
    commission_altona: commission,
    total_net_margin_eur: margin,
  };
}
