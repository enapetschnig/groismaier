import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Assignment } from "./scheduleTypes";

export function useSchedulePermissions() {
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVorarbeiter, setIsVorarbeiter] = useState(false);
  const [isExtern, setIsExtern] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const [{ data: roleData }, { data: empData }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("employees")
          .select("ist_freelancer")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      // Vorarbeiter = eigene Rolle (app_role). Extern = Freelancer-Flag.
      // (Früher wurde fälschlich employees.kategorie abgefragt — Spalte
      // existiert nicht und warf einen 400er.)
      setIsAdmin(roleData?.role === "administrator");
      setIsVorarbeiter(roleData?.role === "vorarbeiter");
      setIsExtern((empData as any)?.ist_freelancer === true);
      setLoading(false);
    };
    check();
  }, []);

  const canEditProject = useCallback(
    (projectId: string, assignments: Assignment[]): boolean => {
      if (isAdmin) return true;
      if (!isVorarbeiter) return false;
      // Vorarbeiter can edit projects where they have an assignment
      return assignments.some(
        (a) => a.user_id === userId && a.project_id === projectId
      );
    },
    [isAdmin, isVorarbeiter, userId]
  );

  const canManageHolidays = isAdmin;

  return {
    userId,
    isAdmin,
    isVorarbeiter,
    isExtern,
    canEditProject,
    canManageHolidays,
    loading,
  };
}
