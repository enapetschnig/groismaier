// ============================================================================
// EinheitSelect — EIN Dropdown für Mengeneinheiten, überall gleich
// (Kundenmeldung 24.08.2026: "Bei der Auswahl Einheit gibt es kein Dropdown —
// da muss ich selber reinschreiben").
//
// Die Liste kommt aus useEinheiten (Standard + Admin-Bereich → Einstellungen,
// app_settings.einheiten — dort erweiterbar). Ein gespeicherter Wert, der
// nicht in der Liste steht, wird immer mit angeboten — sonst zeigte das
// Feld leer und die Einheit ginge beim nächsten Speichern verloren.
// ============================================================================
import { useEinheiten } from "@/hooks/useEinheiten";

interface Props {
  value: string;
  onChange: (einheit: string) => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}

export function EinheitSelect({ value, onChange, className, disabled, title, "aria-label": ariaLabel }: Props) {
  const einheiten = useEinheiten();
  const wert = value || "";
  return (
    <select
      className={className || "kb-input h-11 min-h-0 w-full px-2 py-1 text-sm sm:h-8"}
      value={wert}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || "Einheit"}
      onChange={(e) => onChange(e.target.value)}
    >
      {!wert && <option value="">—</option>}
      {wert && !einheiten.includes(wert) && <option value={wert}>{wert}</option>}
      {einheiten.map((e) => (
        <option key={e} value={e}>{e}</option>
      ))}
    </select>
  );
}
