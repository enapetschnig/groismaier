/**
 * Lädt das aktuelle Invoice-Layout + Firmen-UID aus app_settings.
 * Wird für alle PDF-Generatoren verwendet (Rechnung/BTB/Ersttermin/Protokoll).
 */
import { supabase } from "@/integrations/supabase/client";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT, parseLayoutSettings } from "./invoiceLayoutTypes";

export interface LoadedLayout {
  layout: InvoiceLayoutSettings;
  firmenUid: string;
}

let cached: { data: LoadedLayout; at: number } | null = null;
const TTL = 2 * 60 * 1000; // 2 Min

export async function loadDocumentLayout(forceRefresh = false): Promise<LoadedLayout> {
  if (!forceRefresh && cached && (Date.now() - cached.at) < TTL) {
    return cached.data;
  }

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["invoice_layout", "firmen_uid"]);

  let layout: InvoiceLayoutSettings = DEFAULT_LAYOUT;
  let firmenUid = "";

  if (data) {
    for (const row of data as any[]) {
      if (row.key === "invoice_layout") layout = parseLayoutSettings(row.value);
      else if (row.key === "firmen_uid") firmenUid = row.value || "";
    }
  }

  cached = { data: { layout, firmenUid }, at: Date.now() };
  return cached.data;
}

export function clearLayoutCache() {
  cached = null;
}
