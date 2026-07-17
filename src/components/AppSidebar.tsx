import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Home, Clock, FolderKanban, LayoutGrid,
  Receipt, FileText,
  BookUser, Package, BarChart3, Shield, LogOut, FileDown, Calculator,
  TrendingUp, Wallet,
} from "lucide-react";
import { usePermissions, type FeatureKey } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface MenuItem {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  feature: FeatureKey | null;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Hauptmenü",
    items: [
      { title: "Dashboard", path: "/", icon: Home, feature: null },
      { title: "Zeiterfassung", path: "/time-tracking", icon: Clock, feature: null },
      { title: "Projekte", path: "/projects", icon: FolderKanban, feature: null },
      { title: "Plantafel", path: "/schedule", icon: LayoutGrid, feature: "plantafel" },
    ],
  },
  {
    label: "Dokumente",
    items: [
      { title: "Rechnungen & Angebote", path: "/invoices", icon: Receipt, feature: "rechnungen" },
      { title: "Eingangsrechnungen", path: "/eingangsrechnungen", icon: FileDown, feature: "eingangsrechnungen" },
      { title: "Regieberichte", path: "/disturbances", icon: FileText, feature: "regieberichte" },
    ],
  },
  {
    label: "Auswertung",
    items: [
      { title: "Nachkalkulation & Firmenzahlen", path: "/nachkalkulation", icon: TrendingUp, feature: "nachkalkulation" },
      { title: "Finanzplanung", path: "/finanzplanung", icon: Wallet, feature: "finanzplanung" },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      { title: "Kunden", path: "/customers", icon: BookUser, feature: "kunden" },
      { title: "Materialien & Kalkulation", path: "/materials", icon: Package, feature: "materialien" },
      { title: "Auftragskalkulation", path: "/auftragskalkulation", icon: Calculator, feature: "materialien" },
      { title: "Meine Stunden", path: "/my-hours", icon: BarChart3, feature: null },
      { title: "Stundenauswertung", path: "/hours-report", icon: BarChart3, feature: "stundenauswertung" },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Admin", path: "/admin", icon: Shield, feature: "admin" },
    ],
  },
];

function isActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  return currentPath === itemPath || currentPath.startsWith(itemPath + "/");
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { canView, loading: permsLoading } = usePermissions();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("profiles").select("vorname, nachname").eq("id", user.id).maybeSingle()
          .then(({ data }) => {
            if (data) setUserName(`${data.vorname || ""} ${data.nachname || ""}`.trim());
          });
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/auth");
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-3 border-b">
        <Link to="/" className="flex items-center justify-center px-1">
          <img
            src="/groismaier-logo.png"
            alt="Holzbau Groismaier"
            className="h-14 w-auto object-contain"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {MENU_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.feature || canView(item.feature)
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.path, location.pathname)}
                        tooltip={item.title}
                      >
                        <Link to={item.path}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <span className="text-sm font-medium truncate group-data-[collapsible=icon]:hidden">
            {userName || "Benutzer"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleLogout}
            title="Abmelden"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
