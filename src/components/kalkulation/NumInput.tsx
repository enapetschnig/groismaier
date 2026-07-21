// ============================================================================
// NumInput — Zahlen-Eingabefeld für die Kalkulation.
// Deutsche Komma-Eingabe ("1,5"), leeres Feld = 0, committet live bei jedem
// Tastendruck (die Engine rechnet sofort neu, wie das 300-ms-Debounce des
// Originals). Während des Tippens bleibt der Rohtext erhalten, damit "1," und
// "0,0" nicht weggenormalisiert werden.
//
// Edge-Case-Review 2026-07-21:
//   1. Das Parsen lief über eine eigene Faustregel (alle Punkte löschen), die
//      "1.5" zu 15 und "12.50" zu 1250 machte. Jetzt zentral über
//      parseDecimal() aus src/lib/num.ts — dieselbe getestete Umrechnung wie
//      im Rest der App ("1.250" → 1250, "1.5" → 1.5, "12,50" → 12,5).
//   2. Mengenfelder (Fläche, Arbeiter, Tage, Wandhöhe, Dimensionen …) nahmen
//      negative Werte an und erzeugten negative Summen. Über `min`/`max` wird
//      der Wert beim Committen geklemmt; verlässt der Anwender das Feld, zeigt
//      es den tatsächlich übernommenen Wert.
// ============================================================================
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { clamp, formatForInput, parseDecimal } from "@/lib/num";

interface NumInputProps {
  value: number | null;
  onCommit: (n: number | null) => void;
  /** true: leeres Feld committet null statt 0 (z.B. Ist-Werte der Nachkalkulation). */
  nullable?: boolean;
  /** Untergrenze (typisch 0 für Mengen — negative Flächen/Tage sind Unsinn). */
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

const toText = (v: number | null): string =>
  v === null || v === 0 ? "" : formatForInput(v);

export function NumInput({
  value, onCommit, nullable, min, max, className, placeholder, title, disabled,
  "aria-label": ariaLabel,
}: NumInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(toText(value));
  }, [value, focused]);

  const commit = (roh: string) => {
    const n = parseDecimal(roh);
    if (n === null) { onCommit(nullable ? null : 0); return; }
    onCommit(clamp(n, min, max));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={cn("kb-input h-11 min-h-0 w-full px-2 py-1 text-right text-sm tabular-nums sm:h-8", className)}
      value={text}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onBlur={() => {
        setFocused(false);
        // Rohtext auf den tatsächlich übernommenen Wert zurückholen — sonst
        // bliebe z.B. "-5" im Feld stehen, obwohl 0 gespeichert wurde.
        const n = parseDecimal(text);
        setText(n === null ? "" : toText(clamp(n, min, max)));
      }}
    />
  );
}
