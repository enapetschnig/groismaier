// ============================================================================
// NumInput — Zahlen-Eingabefeld für die Kalkulation.
// Deutsche Komma-Eingabe ("1,5"), leeres Feld = 0, committet live bei jedem
// Tastendruck (die Engine rechnet sofort neu, wie das 300-ms-Debounce des
// Originals). Während des Tippens bleibt der Rohtext erhalten, damit "1," und
// "0,0" nicht weggenormalisiert werden.
// ============================================================================
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface NumInputProps {
  value: number | null;
  onCommit: (n: number | null) => void;
  /** true: leeres Feld committet null statt 0 (z.B. Ist-Werte der Nachkalkulation). */
  nullable?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
}

const toText = (v: number | null): string =>
  v === null || v === 0 ? "" : String(v).replace(".", ",");

const parse = (t: string): number | null => {
  const trimmed = t.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "," || trimmed === "-,") return null;
  const n = parseFloat(trimmed.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function NumInput({ value, onCommit, nullable, className, placeholder, title, disabled }: NumInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(toText(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={cn("kb-input h-8 min-h-0 px-2 py-1 text-right text-sm tabular-nums", className)}
      value={text}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        onCommit(n === null ? (nullable ? null : 0) : n);
      }}
      onBlur={() => setFocused(false)}
    />
  );
}
