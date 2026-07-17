import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const FEATURES = [
  'zeiterfassung','projekte','meine_stunden','regieberichte','rechnungen',
  'plantafel',
  'kunden','materialien','admin','stundenauswertung','eingangsrechnungen',
  'nachkalkulation','finanzplanung'
] as const;
export type FeatureKey = typeof FEATURES[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  zeiterfassung: "Zeiterfassung",
  projekte: "Projekte",
  meine_stunden: "Meine Stunden",
  regieberichte: "Regieberichte",
  rechnungen: "Rechnungen & Angebote",
  plantafel: "Plantafel",
  kunden: "Kunden",
  materialien: "Materialien",
  admin: "Admin-Bereich",
  stundenauswertung: "Stundenauswertung",
  eingangsrechnungen: "Eingangsrechnungen",
  nachkalkulation: "Nachkalkulation & Firmenzahlen",
  finanzplanung: "Finanzplanung",
};

// Map routes to features for ProtectedRoute
export const ROUTE_FEATURE_MAP: Record<string, FeatureKey> = {
  '/time-tracking': 'zeiterfassung',
  '/projects': 'projekte',
  '/my-hours': 'meine_stunden',
  '/disturbances': 'regieberichte',
  '/invoices': 'rechnungen',
  '/schedule': 'plantafel',
  '/customers': 'kunden',
  '/materials': 'materialien',
  '/admin': 'admin',
  '/hours-report': 'stundenauswertung',
  '/eingangsrechnungen': 'eingangsrechnungen',
  '/nachkalkulation': 'nachkalkulation',
  '/finanzplanung': 'finanzplanung',
};

type PermsMap = Record<string, { can_view: boolean; can_edit: boolean }>;

export function usePermissions() {
  const [perms, setPerms] = useState<PermsMap>({});
  const [userRole, setUserRole] = useState<string>("mitarbeiter");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: rd } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = rd?.role || "mitarbeiter";
    setUserRole(role);

    const { data: pd } = await (supabase.from("role_permissions" as never) as any)
      .select("feature, can_view, can_edit")
      .eq("role", role);

    const map: PermsMap = {};
    for (const f of FEATURES) map[f] = { can_view: false, can_edit: false };
    if (pd) {
      for (const r of pd) {
        if (map[r.feature]) {
          map[r.feature] = { can_view: r.can_view, can_edit: r.can_edit };
        }
      }
    }
    setPerms(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auth-State-Listener: wenn der User sich neu anmeldet (z. B. nach Token-
  // Refresh oder frischer Session), die Permissions komplett neu laden. Ohne
  // diesen Listener konnten frisch eingeloggte User manchmal mit einem leeren
  // Permissions-Map starten, weil getUser() beim ersten Render noch null war.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        load();
      }
    });
    return () => { subscription.unsubscribe(); };
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("perms-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_permissions" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const canView = useCallback((f: FeatureKey) => perms[f]?.can_view ?? false, [perms]);
  const canEdit = useCallback((f: FeatureKey) => perms[f]?.can_edit ?? false, [perms]);
  const isAdmin = userRole === "administrator";

  return { canView, canEdit, isAdmin, userRole, loading, refetch: load };
}
