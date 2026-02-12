import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  buildTopPartnersPayload,
  normalizePartnerKind,
  InvalidPartnerKindError,
  type PartnerKind,
  type TopPartnersOrderBy,
  type SalesChannel,
} from "@/lib/api/analytics/topPartners";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;

    const kind = parseKind(params.get("kind"));
    const limit = parseOptionalPositiveInteger(params.get("limit"));
    const orderBy = parseOrderBy(params.get("orderBy"));
    const minYear = parseOptionalYear(params.get("minYear"));
    const maxYear = parseOptionalYear(params.get("maxYear"));
    const salesChannel = parseSalesChannel(params.get("salesChannel"));

    const payload = await buildTopPartnersPayload(prisma, {
      kind,
      limit: limit ?? undefined,
      orderBy,
      minYear,
      maxYear,
      salesChannel,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (
      error instanceof InvalidPartnerKindError ||
      error instanceof RangeError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseKind(value: string | null): PartnerKind {
  if (!value || value.trim().length === 0) {
    return "supplier";
  }
  return normalizePartnerKind(value);
}

function parseOrderBy(value: string | null): TopPartnersOrderBy {
  if (!value) {
    return "sales";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "sales" || normalized === "quantity") {
    return normalized;
  }

  throw new RangeError(
    "Invalid orderBy parameter. Supported values are 'sales' or 'quantity'.",
  );
}

function parseSalesChannel(value: string | null): SalesChannel {
  if (!value || value.trim().length === 0) {
    return "all";
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "all" ||
    normalized === "direct" ||
    normalized === "indirect"
  ) {
    return normalized;
  }

  throw new RangeError(
    "Invalid salesChannel parameter. Supported values are 'all', 'direct', or 'indirect'.",
  );
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

function parseOptionalYear(value: string | null): number | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(
      `Invalid year parameter. Expected a four-digit year, received '${value}'.`,
    );
  }

  const integer = Math.trunc(parsed);
  return integer;
}
