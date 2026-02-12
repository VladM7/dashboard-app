import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const REQUIRED_NUMERIC_FIELDS = [
  "direct_sales",
  "commission_altona",
  "total_net_margin_eur",
] as const;

const COLUMN_MAP = [
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
] as const satisfies ReadonlyArray<keyof SalesUploadRow>;

export type SalesUploadRow = {
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
};

export type SalesUploadParseResult = {
  sheet: string;
  rows: SalesUploadRow[];
  errors: string[];
};

export type SalesUploadInsertResult = {
  sheet: string;
  inserted: number;
  errors: string[];
  message?: string;
};

export function parseSalesUploadWorkbook(
  workbookBuffer: ArrayBuffer | Buffer,
): SalesUploadParseResult {
  const buffer = ensureBuffer(workbookBuffer);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      sheet: "(unknown)",
      rows: [],
      errors: ["Workbook has no sheets"],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (rawRows.length < 2) {
    return {
      sheet: sheetName,
      rows: [],
      errors: ["Sheet is empty or missing data rows"],
    };
  }

  const dataRows = rawRows.slice(1);
  const rows: SalesUploadRow[] = [];
  const errors: string[] = [];

  dataRows.forEach((cells, index) => {
    const lineNo = index + 2;
    if (!Array.isArray(cells) || isBlankRow(cells)) {
      return;
    }

    if (cells.length < COLUMN_MAP.length) {
      errors.push(
        `Row ${lineNo}: expected ${COLUMN_MAP.length} columns, received ${cells.length}`,
      );
      return;
    }

    const draft: Record<string, unknown> = {};
    COLUMN_MAP.forEach((field, columnIndex) => {
      draft[field] = cells[columnIndex];
    });

    try {
      draft.delivery_date = toDate(draft.delivery_date);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid delivery_date";
      errors.push(`Row ${lineNo}: ${message}`);
      return;
    }

    optionalNumericFields().forEach((field) => {
      draft[field] = numOrNull(draft[field]);
    });

    REQUIRED_NUMERIC_FIELDS.forEach((field) => {
      draft[field] = numOrNull(draft[field]);
    });

    if (
      REQUIRED_NUMERIC_FIELDS.some(
        (field) => draft[field] === null || draft[field] === undefined,
      )
    ) {
      errors.push(
        `Row ${lineNo}: missing required numeric field(s) (${REQUIRED_NUMERIC_FIELDS.join(", ")})`,
      );
      return;
    }

    draft.billing_sign = normalizeStringOrNull(draft.billing_sign);
    draft.purchase_currency = normalizeStringOrNull(draft.purchase_currency);

    rows.push({
      commercial_responsible: String(draft.commercial_responsible ?? ""),
      order_type: String(draft.order_type ?? ""),
      supplier: String(draft.supplier ?? ""),
      billing_sign: draft.billing_sign as string | null,
      delivery_client: String(draft.delivery_client ?? ""),
      delivery_circuit: String(draft.delivery_circuit ?? ""),
      product_category: String(draft.product_category ?? ""),
      product_family: String(draft.product_family ?? ""),
      product_reference: String(draft.product_reference ?? ""),
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

  return {
    sheet: sheetName,
    rows,
    errors,
  };
}

export async function replaceSalesTransactions(
  prisma: PrismaClient,
  rows: SalesUploadRow[],
): Promise<number> {
  await prisma.sales_transactions.deleteMany();
  const result = await prisma.sales_transactions.createMany({
    data: rows,
  });
  return result.count;
}

export async function processSalesUpload(
  prisma: PrismaClient,
  workbookBuffer: ArrayBuffer | Buffer,
): Promise<SalesUploadInsertResult> {
  const parseResult = parseSalesUploadWorkbook(workbookBuffer);

  if (parseResult.rows.length === 0) {
    const message =
      parseResult.errors.length > 0
        ? `No valid rows to insert. Found ${parseResult.errors.length} issue${parseResult.errors.length === 1 ? "" : "s"}, including: ${parseResult.errors[0]}.`
        : "No valid rows to insert; the sheet may be empty.";
    return {
      sheet: parseResult.sheet,

      inserted: 0,

      errors: parseResult.errors,

      message,
    };
  }

  const inserted = await replaceSalesTransactions(prisma, parseResult.rows);

  return {
    sheet: parseResult.sheet,
    inserted,
    errors: parseResult.errors,
  };
}

function ensureBuffer(buffer: ArrayBuffer | Buffer): Buffer {
  if (Buffer.isBuffer(buffer)) {
    return buffer;
  }
  return Buffer.from(buffer);
}

function isBlankRow(cells: unknown[]): boolean {
  return cells.every(
    (cell) =>
      cell === null ||
      cell === undefined ||
      (typeof cell === "string" && cell.trim().length === 0),
  );
}

function toDate(raw: unknown): Date {
  if (raw instanceof Date) {
    return raw;
  }

  if (typeof raw === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + raw * 86_400_000);
  }

  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }

    const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) {
      const [, day, month, year] = match;
      const numericYear =
        year.length === 2 ? Number(`20${year}`) : Number.parseInt(year, 10);
      return new Date(
        numericYear,
        Number.parseInt(month, 10) - 1,
        Number.parseInt(day, 10),
      );
    }
  }

  throw new Error(`Unrecognized delivery_date value: ${String(raw)}`);
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    try {
      const numeric = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(numeric) ? numeric : null;
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function optionalNumericFields(): (keyof SalesUploadRow)[] {
  return [
    "quantity",
    "sales_altona",
    "purchases_altona_eur",
    "purchases_purchase_currency",
    "total_pub_budget",
    "rfa_on_resale_orders",
    "logistics_cost_altona",
    "prescriber_commission",
  ];
}
