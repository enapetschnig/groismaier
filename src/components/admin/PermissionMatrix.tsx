import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FEATURES, FEATURE_LABELS, type FeatureKey } from "@/hooks/usePermissions";

const ROLES = ["administrator", "vorarbeiter", "mitarbeiter"] as const;
const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  vorarbeiter: "Vorarbeiter",
  mitarbeiter: "Mitarbeiter",
};

type PermRow = {
  id: string;
  role: string;
  feature: string;
  can_view: boolean;
  can_edit: boolean;
};

export function PermissionMatrix() {
  const [rows, setRows] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadPerms = async () => {
    const { data, error } = await (supabase.from("role_permissions" as never) as any)
      .select("*");
    if (error) {
      toast({ title: "Fehler", description: "Berechtigungen konnten nicht geladen werden.", variant: "destructive" });
      return;
    }
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadPerms();
  }, []);

  const getCell = (role: string, feature: string) => {
    return rows.find((r) => r.role === role && r.feature === feature);
  };

  const handleToggle = async (role: string, feature: string, field: "can_view" | "can_edit", value: boolean) => {
    if (role === "administrator") return;

    const existing = getCell(role, feature);
    const updates: Record<string, unknown> = { [field]: value, updated_at: new Date().toISOString() };

    // If enabling edit, also enable view
    if (field === "can_edit" && value) {
      updates.can_view = true;
    }
    // If disabling view, also disable edit
    if (field === "can_view" && !value) {
      updates.can_edit = false;
    }

    if (existing) {
      const { error } = await (supabase.from("role_permissions" as never) as any)
        .update(updates)
        .eq("id", existing.id);
      if (error) {
        toast({ title: "Fehler", description: "Berechtigung konnte nicht gespeichert werden.", variant: "destructive" });
        return;
      }
    } else {
      const { error } = await (supabase.from("role_permissions" as never) as any)
        .insert({ role, feature, can_view: false, can_edit: false, ...updates });
      if (error) {
        toast({ title: "Fehler", description: "Berechtigung konnte nicht erstellt werden.", variant: "destructive" });
        return;
      }
    }

    toast({ title: "Gespeichert", description: `${ROLE_LABELS[role]}: ${FEATURE_LABELS[feature as FeatureKey]} aktualisiert.` });
    loadPerms();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Berechtigungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Laden...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Berechtigungen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Funktion</TableHead>
                {ROLES.map((role) => (
                  <TableHead key={role} className="text-center min-w-[140px]" colSpan={1}>
                    {ROLE_LABELS[role]}
                    <div className="flex justify-center gap-4 text-xs font-normal text-muted-foreground mt-1">
                      <span>Sehen</span>
                      <span>Bearbeiten</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURES.map((feature) => (
                <TableRow key={feature}>
                  <TableCell className="font-medium">{FEATURE_LABELS[feature]}</TableCell>
                  {ROLES.map((role) => {
                    const cell = getCell(role, feature);
                    const isAdminRole = role === "administrator";
                    const canView = cell?.can_view ?? false;
                    const canEdit = cell?.can_edit ?? false;
                    return (
                      <TableCell key={role} className="text-center">
                        <div className="flex justify-center gap-4">
                          <Checkbox
                            checked={isAdminRole ? true : canView}
                            disabled={isAdminRole}
                            onCheckedChange={(checked) =>
                              handleToggle(role, feature, "can_view", !!checked)
                            }
                            className={isAdminRole ? "opacity-50" : ""}
                          />
                          <Checkbox
                            checked={isAdminRole ? true : canEdit}
                            disabled={isAdminRole}
                            onCheckedChange={(checked) =>
                              handleToggle(role, feature, "can_edit", !!checked)
                            }
                            className={isAdminRole ? "opacity-50" : ""}
                          />
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
