import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseLayoutSettings, DEFAULT_LAYOUT } from "@/lib/invoiceLayoutTypes";
import type { InvoiceLayoutSettings } from "@/lib/invoiceLayoutTypes";

export function useInvoiceLayout() {
  const [layout, setLayout] = useState<InvoiceLayoutSettings>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "invoice_layout")
      .maybeSingle();
    setLayout(parseLayoutSettings(data?.value));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newLayout: InvoiceLayoutSettings) => {
    setLayout(newLayout);
    await supabase.from("app_settings").upsert({
      key: "invoice_layout",
      value: JSON.stringify(newLayout),
      updated_at: new Date().toISOString(),
    });
  }, []);

  return { layout, loading, save, reload: load };
}
