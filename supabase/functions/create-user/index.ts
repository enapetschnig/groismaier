import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
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

    // Check caller is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleData?.role !== "administrator") {
      return new Response(JSON.stringify({ error: "Nur Administratoren können Benutzer erstellen" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      username, password, rolle,
      vorname, nachname, telefon, email,
      adresse, plz, ort,
      geburtsdatum, sv_nummer, eintrittsdatum, stundenlohn,
      ist_freelancer,
    } = await req.json();

    if (!username || !password || !vorname || !nachname) {
      return new Response(JSON.stringify({ error: "Benutzername, Passwort, Vor- und Nachname sind Pflicht" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check username uniqueness
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Benutzername bereits vergeben" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with internal email.
    // Wenn ein vorheriger Versuch mittendrin gecrashed ist, existiert evtl. schon
    // ein Auth-User mit genau dieser Email → wir räumen ihn auf und legen neu an.
    const cleanUser = username.toLowerCase().trim();
    const internalEmail = `${cleanUser}@app.cg-holzbau.at`;

    let { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { vorname, nachname, username: cleanUser },
    });

    // Orphan-Cleanup: User existiert schon in auth, aber nicht vollständig aktiviert
    if (authError && /already|exists|registered/i.test(authError.message || "")) {
      console.warn("Auth user exists — attempting orphan cleanup:", internalEmail);
      const { data: listed } = await supabase.auth.admin.listUsers();
      const orphan = listed?.users?.find((u: any) => u.email === internalEmail);
      if (orphan) {
        // Nur löschen, wenn kein aktives Profil dran hängt — sonst Konflikt melden
        const { data: prof } = await supabase
          .from("profiles").select("is_active").eq("id", orphan.id).maybeSingle();
        if (!prof || prof.is_active !== true) {
          await supabase.auth.admin.deleteUser(orphan.id);
          console.log("Orphan deleted, retrying createUser");
          const retry = await supabase.auth.admin.createUser({
            email: internalEmail,
            password,
            email_confirm: true,
            user_metadata: { vorname, nachname, username: cleanUser },
          });
          authData = retry.data;
          authError = retry.error;
        } else {
          return new Response(JSON.stringify({
            error: `Benutzername "${cleanUser}" ist bereits vergeben (aktiver User).`,
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    if (authError || !authData?.user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({
        error: `Auth-User konnte nicht erstellt werden: ${authError?.message || "unbekannt"}`,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = authData.user.id;

    // Update profile with all data
    const { error: profErr } = await supabase.from("profiles").update({
      vorname,
      nachname,
      username: cleanUser,
      must_change_password: true,
      is_active: true,
      telefon: telefon || null,
      email: email || null,
      adresse: adresse || null,
      plz: plz || null,
      ort: ort || null,
      geburtsdatum: geburtsdatum || null,
      sv_nummer: sv_nummer || null,
      eintrittsdatum: eintrittsdatum || null,
      stundenlohn: stundenlohn ? parseFloat(stundenlohn) : null,
    }).eq("id", userId);
    if (profErr) {
      console.error("Profile update failed:", profErr);
      // Rollback: Auth-User wieder entfernen, damit kein halber Datensatz bleibt
      await supabase.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: `Profil: ${profErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set role — user_roles hat UNIQUE (user_id, role), daher erst alte Rollen
    // löschen und dann neue einfügen (saubere 1-Rolle-pro-User-Semantik).
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const userRole = rolle || "mitarbeiter";
    const { error: roleErr } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: userRole,
    });
    if (roleErr) {
      console.error("Role insert failed:", roleErr);
      return new Response(JSON.stringify({ error: `Rolle konnte nicht gesetzt werden: ${roleErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create employees row (for Plantafel, Zeitbuchung).
    const employeePayload: Record<string, unknown> = {
      user_id: userId,
      vorname,
      nachname,
      email: email || null,
      telefon: telefon || null,
      aktiv: true,
      ist_freelancer: ist_freelancer === true,
    };

    const { data: newEmp, error: empErr } = await supabase
      .from("employees")
      .insert(employeePayload)
      .select("id")
      .single();
    if (empErr) {
      // Nicht kritisch — User ist trotzdem angelegt. Nur loggen, nicht abbrechen.
      console.error("Employee insert failed (non-fatal):", empErr);
    }

    // Fallback: wenn insert kein id zurückgab, per user_id nachschauen
    let employeeId: string | null = newEmp?.id ?? null;
    if (!employeeId) {
      const { data: existing } = await supabase
        .from("employees").select("id").eq("user_id", userId).maybeSingle();
      employeeId = existing?.id ?? null;
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      username: username.toLowerCase().trim(),
      employee_id: employeeId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Create user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
