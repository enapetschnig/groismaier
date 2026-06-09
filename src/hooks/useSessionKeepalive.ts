import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Verlängert die Supabase-Session automatisch alle 30min falls aktiv.
 * Verhindert dass User nach 24h ausgeloggt wird während er das Formular bearbeitet.
 */
export function useSessionKeepalive() {
  useEffect(() => {
    const refresh = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // Refresh wenn Token innerhalb 10min abläuft
        const expiresAt = session.expires_at;
        if (!expiresAt) return;
        const msUntilExpiry = expiresAt * 1000 - Date.now();
        if (msUntilExpiry < 10 * 60 * 1000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // silent fail — User merkt es spätestens beim nächsten Save
      }
    };

    // Beim Mount + alle 30min
    refresh();
    const interval = setInterval(refresh, 30 * 60 * 1000);

    // Auch bei Tab-Wechsel / Focus refreshen
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
