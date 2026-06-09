import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  const isMobile = useIsMobile();

  // Mobile: no sidebar, render pages directly as before
  if (isMobile) {
    return <Outlet />;
  }

  // Desktop: sidebar + content area
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
