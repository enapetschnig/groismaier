import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Admin-Check (Function läuft mit verify_jwt=false, daher manuell prüfen)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", caller.id).maybeSingle();
    if (roleData?.role !== "administrator") {
      return new Response(JSON.stringify({ error: "Nur Administratoren" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Du kannst dich nicht selbst löschen" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Foreign-Key-Referenzen auf auth.users auflösen ──
    // Viele Tabellen haben FKs auf auth.users ohne ON DELETE-Regel. Vor dem
    // Auth-Delete müssen alle dieser Referenzen auf NULL gesetzt werden,
    // sonst schlägt der Delete mit FK-Violation fehl. Historische Daten
    // bleiben erhalten (nur der User-Bezug wird anonymisiert).
    const nullifyRefs: Array<[string, string]> = [
      ["projects", "user_id"],
      ["projects", "erfasst_von"],
      ["time_entries", "approved_by"],
      ["invitation_logs", "gesendet_von"],
      ["contact_history", "erstellt_von"],
      ["teams", "created_by"],
      ["board_projects", "created_by"],
      ["einsaetze", "created_by"],
      ["audit_log", "user_id"],
    ];
    for (const [tab, col] of nullifyRefs) {
      const { error } = await (supabase.from(tab as never) as any)
        .update({ [col]: null })
        .eq(col, user_id);
      if (error) console.error(`nullify ${tab}.${col} failed: ${error.message}`);
    }

    // Jetzt abhängige Datensätze löschen (Cascade übernimmt anderes).
    await supabase.from("employees").delete().eq("user_id", user_id);
    await supabase.from("user_roles").delete().eq("user_id", user_id);
    await supabase.from("profiles").delete().eq("id", user_id);

    // Auth-User löschen — sollte jetzt sauber durchgehen.
    const { error: authErr } = await supabase.auth.admin.deleteUser(user_id);
    if (authErr) {
      console.error("Auth delete error:", authErr);
      return new Response(JSON.stringify({
        error: `Auth-User: ${authErr.message}`,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("delete-user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
