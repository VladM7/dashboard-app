import { SiteHeader } from "@/components/site-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommercialResponsiblesVisual } from "@/components/analytics/commercial-responsibles-visual";
import { MostSoldProductsTable } from "@/components/analytics/most-sold-products-table";
import { TopPartnersVisual } from "@/components/analytics/top-partners-visual";

export default function Page() {
  return (
    <div>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />

          <div className="flex flex-col">
            <div className="@container/main flex flex-col gap-2">
              <div className="flex flex-col gap-3 py-4 md:gap-5 md:py-6">
                <div className="px-4 lg:px-6 space-y-4 md:space-y-5">
                  <TopPartnersVisual />
                  <CommercialResponsiblesVisual />
                  <MostSoldProductsTable />
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
