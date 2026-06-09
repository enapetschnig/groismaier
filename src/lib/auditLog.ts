import { supabase } from "@/integrations/supabase/client";

export async function logAudit(
  action: string,
  opts: {
    entity_type?: string;
    entity_id?: string;
    old_values?: any;
    new_values?: any;
    metadata?: any;
  } = {}
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action,
      entity_type: opts.entity_type || null,
      entity_id: opts.entity_id || null,
      old_values: opts.old_values ?? null,
      new_values: opts.new_values ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch {
    // Audit-Log darf die eigentliche Aktion nicht blockieren
  }
}
