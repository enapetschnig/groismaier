import { useNavigate } from "react-router-dom";

/**
 * App-weites „Zurück": führt IMMER auf die zuvor besuchte Seite
 * (Browser-Verlauf), nicht auf ein fest verdrahtetes Ziel — Kundenwunsch:
 * „Zurück soll wirklich immer die Seite sein, wo ich davor war."
 *
 * Fallback greift nur, wenn es KEINEN In-App-Verlauf gibt (Seite direkt
 * per URL geöffnet / erster Aufruf) — sonst würde navigate(-1) die App
 * verlassen oder ins Leere laufen. React Router zählt den Verlauf in
 * window.history.state.idx mit (0 = erster Eintrag der Session).
 *
 *   const zurueck = useZurueck("/invoices");
 *   <KBToolbar onBack={zurueck} … />
 */
export function useZurueck(fallback: string = "/") {
  const navigate = useNavigate();
  return () => {
    const idx = (typeof window !== "undefined" && (window.history.state as any)?.idx) ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };
}
