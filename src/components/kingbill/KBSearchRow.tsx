/**
 * KBSearchRow — Suchzeile im KingBill-Stil: [Suche…-Feld] [🔍 Such-Button].
 *
 * VERTRAG (für alle Agenten/Masken):
 *   <KBSearchRow buttonLabel="Angebot suchen"
 *                onSearch={(q) => navigate(`/invoices?tab=angebot${q ? `&q=${encodeURIComponent(q)}` : ""}`)} />
 *
 * Enter im Feld oder Klick auf den Button ruft onSearch(query) auf
 * (query ist getrimmt, kann leer sein — Zielseite entscheidet).
 *
 * Props:
 *   onSearch      (query: string) => void (Pflicht)
 *   buttonLabel?  string — Label des Such-Buttons (default „Suchen")
 *   placeholder?  string — Placeholder des Feldes (default „Suche…")
 *   defaultValue? string — Vorbelegung des Feldes
 *   className?    string
 *   inputAriaLabel? string — aria-label des Feldes (default = buttonLabel)
 */
import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KBSearchRowProps {
  onSearch: (query: string) => void;
  buttonLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
  inputAriaLabel?: string;
}

export function KBSearchRow({
  onSearch,
  buttonLabel = "Suchen",
  placeholder = "Suche…",
  defaultValue = "",
  className,
  inputAriaLabel,
}: KBSearchRowProps) {
  const [query, setQuery] = React.useState(defaultValue);

  const submit = () => onSearch(query.trim());

  return (
    <div className={cn("flex w-full items-stretch gap-1.5", className)}>
      <input
        type="search"
        className="kb-input min-w-0 flex-1"
        placeholder={placeholder}
        aria-label={inputAriaLabel ?? buttonLabel}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="kb-btn shrink-0" onClick={submit}>
        {/* gelbe Lupe wie im KingBill-Original */}
        <Search className="h-4 w-4 shrink-0 text-kb-yellow" strokeWidth={2.5} />
        <span className="truncate">{buttonLabel}</span>
      </button>
    </div>
  );
}
