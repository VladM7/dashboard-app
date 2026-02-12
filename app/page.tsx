import type { CSSProperties } from "react";
import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { DashboardSummaryJson } from "@/lib/metrics/dashboard-summary";
import { getBaseUrl } from "@/lib/api/base-url";
import {
  IconChartScatter,
  IconClipboardData,
  IconCloudUpload,
  IconSettings,
} from "@tabler/icons-react";

type AnalyticsSnapshot = {
  generatedAt: string | null;
  totalCategories: number | null;
  totalRows: number | null;
  totalQuantity: number | null;
};

type HomeData = {
  dashboardSummary: DashboardSummaryJson | null;
  analyticsSnapshot: AnalyticsSnapshot | null;
};

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export default async function Home() {
  const { dashboardSummary, analyticsSnapshot } = await getHomeData();

  const currentPeriodLabel =
    dashboardSummary?.currentPeriod?.label ?? "the latest period";
  const dataPoints = buildDataStrip({
    analyticsSnapshot,
    currentPeriodLabel,
  });

  return (
    <div>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-8 lg:px-10">
            <div className="font-light text-5xl">Altona - latest insights</div>

            <section
              aria-label="Quick actions & resources"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick actions & resources
                </span>
                <h2 className="text-lg font-medium">
                  Keep the operations moving
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage data sources and configuration.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {QUICK_ACTIONS.map((action) => (
                  <Card
                    key={action.title}
                    className="group flex h-full flex-col justify-between border border-transparent bg-linear-to-br from-background via-background to-muted transition hover:from-primary/5 hover:to-primary/10 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <CardHeader className="flex flex-row items-start gap-4">
                      <span className="rounded-full border border-border bg-background p-2 text-primary transition group-hover:border-primary/40 group-hover:text-primary">
                        <action.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="flex flex-col gap-1">
                        <CardTitle className="text-base font-semibold">
                          {action.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-6">
                          {action.description}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        variant="link"
                        className="px-0 text-sm font-medium text-primary group-hover:text-primary/90"
                        asChild
                      >
                        <Link href={action.href}>{action.ctaLabel}</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section
              aria-label="Data readiness indicators"
              className="rounded-2xl border border-border bg-linear-to-br from-background via-background to-muted px-6 py-4"
            >
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Data readiness
                  </span>
                  <h2 className="text-lg font-medium">
                    Operational dataset health check
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {dataPoints.map((item) => (
                    <DataPoint key={item.label} {...item} />
                  ))}
                </div>
              </div>
            </section>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function buildDataStrip(params: {
  analyticsSnapshot: AnalyticsSnapshot | null;
  currentPeriodLabel: string;
}) {
  const { analyticsSnapshot, currentPeriodLabel } = params;

  const lastRefresh = analyticsSnapshot?.generatedAt
    ? formatDateTime(analyticsSnapshot.generatedAt)
    : null;

  const totalRows =
    analyticsSnapshot?.totalRows !== null &&
    analyticsSnapshot?.totalRows !== undefined
      ? NUMBER_FORMAT.format(analyticsSnapshot.totalRows)
      : null;

  const totalCategories =
    analyticsSnapshot?.totalCategories !== null &&
    analyticsSnapshot?.totalCategories !== undefined
      ? NUMBER_FORMAT.format(analyticsSnapshot.totalCategories)
      : null;

  const totalQuantity =
    analyticsSnapshot?.totalQuantity !== null &&
    analyticsSnapshot?.totalQuantity !== undefined
      ? NUMBER_FORMAT.format(analyticsSnapshot.totalQuantity)
      : null;

  return [
    {
      label: "Last data refresh",
      value: lastRefresh ?? "Awaiting upload",
      helper: lastRefresh
        ? `Latest dataset covers ${currentPeriodLabel}`
        : "Upload the latest sales extract to refresh metrics.",
    },
    {
      label: "Records processed",
      value: totalRows ?? "—",
      helper: totalRows
        ? "Rows currently powering the analytics workspace."
        : "Row count becomes available after the first upload.",
    },
    {
      label: "Categories tracked",
      value: totalCategories ?? "—",
      helper: totalCategories
        ? "Product categories with enough data for benchmarking."
        : "We’ll surface product mix once categories are loaded.",
    },
    {
      label: "Units covered in top movers",
      value: totalQuantity ?? "—",
      helper: totalQuantity
        ? "Cumulative quantity represented in top-performing products."
        : "Upload fresh sales to populate product-level insights.",
    },
  ];
}

function DataPoint(props: { label: string; value: string; helper: string }) {
  const { label, value, helper } = props;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-background/80 px-4 py-3 shadow-sm shadow-black/[0.02]">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-xl font-semibold text-foreground">{value}</span>
      <span className="text-xs leading-5 text-muted-foreground">{helper}</span>
    </div>
  );
}

const QUICK_ACTIONS = [
  {
    title: "Upload latest sales dataset",
    description: "Ingest the newest CSV or Excel extract to refresh metrics.",
    href: "/upload",
    ctaLabel: "Start upload",
    icon: IconCloudUpload,
  },
  {
    title: "Configure workspace settings",
    description: "Manage reporting periods, thresholds, and user access.",
    href: "/settings",
    ctaLabel: "Open settings",
    icon: IconSettings,
  },
  {
    title: "View advanced analytics",
    description: "Explore detailed reports and product performance insights.",
    href: "/analytics",
    ctaLabel: "View analytics",
    icon: IconChartScatter,
  },
  {
    title: "Generate reports",
    description: "Create and download custom reports based on uploaded data.",
    href: "#",
    ctaLabel: "Generate report",
    icon: IconClipboardData,
  },
] as const;

async function getHomeData(): Promise<HomeData> {
  const [dashboardSummary, analyticsSnapshot] = await Promise.all([
    fetchDashboardSummary(),
    fetchAnalyticsSnapshot(),
  ]);

  return {
    dashboardSummary,
    analyticsSnapshot,
  };
}

async function fetchDashboardSummary(): Promise<DashboardSummaryJson | null> {
  try {
    const baseUrl = getBaseUrl();
    const endpoint = new URL(
      "/api/dashboard/summary?monthsAgo=1",
      baseUrl,
    ).toString();

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 300,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DashboardSummaryJson;
  } catch {
    return null;
  }
}

async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot | null> {
  try {
    const baseUrl = getBaseUrl();
    const endpoint = new URL(
      "/api/analytics/most-sold-products?year=all&category=all",
      baseUrl,
    ).toString();

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 300,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      summary?: {
        totalCategories?: number;
        totalQuantityTopProducts?: number;
        totalRows?: number;
        generatedAt?: string;
      };
    };

    return {
      generatedAt: payload.summary?.generatedAt ?? null,
      totalCategories: payload.summary?.totalCategories ?? null,
      totalRows: payload.summary?.totalRows ?? null,
      totalQuantity: payload.summary?.totalQuantityTopProducts ?? null,
    };
  } catch {
    return null;
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
