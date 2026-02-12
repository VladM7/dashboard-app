import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  buildCommercialResponsiblesPayload,
  type CommercialResponsiblesOrderBy,
  type CommercialSalesChannel,
  type CommercialTimeView,
} from "@/lib/api/analytics/commercialResponsibles";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;

    const salesChannel = parseSalesChannel(params.get("salesChannel"));
    const year = parseYear(params.get("year"));
    const view = parseView(params.get("view"));
    const orderBy = parseOrderBy(params.get("orderBy"));
    const limit = parseOptionalPositiveInteger(params.get("limit"));

    const payload = await buildCommercialResponsiblesPayload(prisma, {
      salesChannel,
      year,
      view,
      orderBy,
      limit: limit ?? undefined,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseSalesChannel(value: string | null): CommercialSalesChannel {
  if (!value || value.trim().length === 0) {
    return "all";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "all" || normalized === "direct" || normalized === "indirect") {
    return normalized;
  }

  throw new RangeError(
    "Invalid salesChannel parameter. Supported values are 'all', 'direct', or 'indirect'.",
  );
}

function parseView(value: string | null): CommercialTimeView {
  if (!value || value.trim().length === 0) {
    return "yearly";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "yearly" || normalized === "monthly") {
    return normalized;
  }

  throw new RangeError(
    "Invalid view parameter. Supported values are 'yearly' or 'monthly'.",
  );
}

function parseOrderBy(value: string | null): CommercialResponsiblesOrderBy {
  if (!value || value.trim().length === 0) {
    return "sales";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "sales" || normalized === "quantity" || normalized === "name") {
    return normalized;
  }

  throw new RangeError(
    "Invalid orderBy parameter. Supported values are 'sales', 'quantity', or 'name'.",
  );
}

function parseYear(value: string | null): number | null {
  if (!value || value.trim().length === 0 || value.trim().toLowerCase() === "all") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(
      `Invalid year parameter. Expected 'all' or a year number, received '${value}'.`,
    );
  }

  return Math.trunc(parsed);
}

function parseOptionalPositiveInteger(value: string | null): number | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(
      `Invalid numeric parameter. Expected a finite number, received '${value}'.`,
    );
  }

  const integer = Math.trunc(parsed);
  if (integer <= 0) {
    throw new RangeError(
      `Numeric parameters must be positive integers. Received '${integer}'.`,
    );
  }

  return integer;
}
