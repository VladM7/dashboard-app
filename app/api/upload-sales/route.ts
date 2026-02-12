import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

interface ParsedRow {
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
  direct_sales: number;
  commission_altona: number;
  total_pub_budget: number | null;
  rfa_on_resale_orders: number | null;
  logistics_cost_altona: number | null;
  prescriber_commission: number | null;
  total_net_margin_eur: number;
}

const columnMap: (keyof ParsedRow)[] = [
  "commercial_responsible",
  "order_type",
  "supplier",
  "billing_sign",
  "delivery_client",
  "delivery_circuit",
  "product_category",
  "product_family",
  "product_reference",
  "delivery_date",
  "quantity",
  "sales_altona",
  "purchases_altona_eur",
  "purchases_purchase_currency",
  "purchase_currency",
  "direct_sales",
  "commission_altona",
  "total_pub_budget",
  "rfa_on_resale_orders",
  "logistics_cost_altona",
  "prescriber_commission",
  "total_net_margin_eur",
];

function toDate(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + raw * 86400000);
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return new Date(parsed);
    const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      const [, d, mo, y] = m;
      const year = y.length === 2 ? Number("20" + y) : Number(y);
      return new Date(year, Number(mo) - 1, Number(d));
    }
  }
  throw new Error(`Unrecognized date: ${raw}`);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function POST(req: Request) {
  try {
    if (
      !(req.headers.get("content-type") || "").includes("multipart/form-data")
    ) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Missing 'file' field" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "Workbook has no sheets" },
        { status: 400 },
      );
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });

    if (rawRows.length < 2) {
      return NextResponse.json(
        { error: "Sheet is empty or missing data rows" },
        { status: 400 },
      );
    }

    const dataRows = rawRows.slice(1);
    const rows: ParsedRow[] = [];
    const errors: string[] = [];

    dataRows.forEach((arr, idx) => {
      const lineNo = idx + 2;
      if (
        !Array.isArray(arr) ||
        arr.length === 0 ||
        arr.every((c) => c === null || c === "")
      ) {
        return;
      }
      if (arr.length < columnMap.length) {
        errors.push(
          `Row ${lineNo}: expected ${columnMap.length} cols, got ${arr.length}`,
        );
        return;
      }

      const draft: Record<string, unknown> = {};
      columnMap.forEach((field, i) => {
        draft[field] = arr[i];
      });

      // Date
      try {
        draft.delivery_date = toDate(draft.delivery_date);
      } catch {
        errors.push(`Row ${lineNo}: invalid delivery_date`);
        return;
      }

      // Optional numeric conversions
      [
        "quantity",
        "sales_altona",
        "purchases_altona_eur",
        "purchases_purchase_currency",
        "total_pub_budget",
        "rfa_on_resale_orders",
        "logistics_cost_altona",
        "prescriber_commission",
      ].forEach((f) => {
        draft[f] = numOrNull(draft[f]);
      });

      draft.direct_sales = numOrNull(draft.direct_sales);
      draft.commission_altona = numOrNull(draft.commission_altona);
      draft.total_net_margin_eur = numOrNull(draft.total_net_margin_eur);

      if (
        draft.direct_sales === null ||
        draft.commission_altona === null ||
        draft.total_net_margin_eur === null
      ) {
        errors.push(`Row ${lineNo}: missing required numeric field(s)`);
        return;
      }

      draft.billing_sign =
        draft.billing_sign !== null && draft.billing_sign !== ""
          ? String(draft.billing_sign)
          : null;
      draft.purchase_currency =
        draft.purchase_currency !== null && draft.purchase_currency !== ""
          ? String(draft.purchase_currency)
          : null;

      rows.push({
        commercial_responsible: String(draft.commercial_responsible || ""),
        order_type: String(draft.order_type || ""),
        supplier: String(draft.supplier || ""),
        billing_sign: draft.billing_sign as string | null,
        delivery_client: String(draft.delivery_client || ""),
        delivery_circuit: String(draft.delivery_circuit || ""),
        product_category: String(draft.product_category || ""),
        product_family: String(draft.product_family || ""),
        product_reference: String(draft.product_reference || ""),
        delivery_date: draft.delivery_date as Date,
        quantity: draft.quantity as number | null,
        sales_altona: draft.sales_altona as number | null,
        purchases_altona_eur: draft.purchases_altona_eur as number | null,
        purchases_purchase_currency: draft.purchases_purchase_currency as
          | number
          | null,
        purchase_currency: draft.purchase_currency as string | null,
        direct_sales: draft.direct_sales as number,
        commission_altona: draft.commission_altona as number,
        total_pub_budget: draft.total_pub_budget as number | null,
        rfa_on_resale_orders: draft.rfa_on_resale_orders as number | null,
        logistics_cost_altona: draft.logistics_cost_altona as number | null,
        prescriber_commission: draft.prescriber_commission as number | null,
        total_net_margin_eur: draft.total_net_margin_eur as number,
      });
    });

    if (rows.length === 0) {
      return NextResponse.json(
        {
          sheet: sheetName,
          inserted: 0,
          errors,
          message: "No valid rows to insert",
        },
        { status: 400 },
      );
    }

    // Replace existing data entirely
    await prisma.sales_transactions.deleteMany();
    const result = await prisma.sales_transactions.createMany({
      data: rows,
    });

    return NextResponse.json({
      sheet: sheetName,
      inserted: result.count,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
