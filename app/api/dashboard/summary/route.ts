import { NextResponse } from "next/server";

import {
  getDashboardSummary,
  serializeDashboardSummary,
  type DashboardSummaryJson,
} from "@/lib/metrics/dashboard-summary";

const DEFAULT_MONTHS_AGO = 1;

function parseMonthsAgo(request: Request): number {
  const url = new URL(request.url);
  const param = url.searchParams.get("monthsAgo");

  if (!param) {
    return DEFAULT_MONTHS_AGO;
  }

  const parsed = Number(param);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("monthsAgo must be a positive integer (>= 1).");
  }

  return parsed;
}

export async function GET(request: Request) {
  try {
    const monthsAgo = parseMonthsAgo(request);

    const summary = await getDashboardSummary({
      monthsAgo,
    });
    const payload = serializeDashboardSummary(summary);

    return NextResponse.json<DashboardSummaryJson>(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error occurred.";

    const status = message.includes("monthsAgo") ? 400 : 500;

    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
