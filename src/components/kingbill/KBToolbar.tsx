/**
 * KBToolbar — blaue KingBill-Werkzeugleiste, oben auf jeder Maske.
 *
 * VERTRAG (für alle Agenten/Masken):
 *   <KBToolbar onBack={() => navigate(-1)} title="Rechnung bearbeiten"
 *              rightActions={<KBToolbarButton icon={Check} label="Speichern & Schließen" variant="green" />}>
 *     <KBToolbarButton icon={Printer} label="Drucken" />
 *   </KBToolbar>
 *
 * Aufbau: links „Zurück" (blauer Kreis-Pfeil, nur wenn onBack gesetzt) + Titel,
 * Mitte = children (Aktions-Buttons, umbrechen bei Platzmangel),
 * rechts = rightActions (z. B. grüner „Speichern & Schließen"-Button).
 *
 * Props:
 *   onBack?       () => void — rendert den runden Zurück-Button
 *   backLabel?    string — Tooltip/aria-label des Zurück-Buttons (default „Zurück")
 *   title?        string — weißer Titel neben dem Zurück-Button
 *   children?     ReactNode — Aktionen in der Mitte
 *   rightActions? ReactNode — rechtsbündige Aktionen
 *   className?    string
 *   sticky?       boolean — klebt oben (default true)
 */
import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KBToolbarProps {
  onBack?: () => void;
  backLabel?: string;
  title?: string;
  children?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function KBToolbar({
  onBack,
  backLabel = "Zurück",
  title,
  children,
  rightActions,
  className,
  sticky = true,
}: KBToolbarProps) {
  return (
    <div className={cn("kb-toolbar flex-wrap", sticky && "sticky top-0 z-40", className)}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kb-blue-dark bg-gradient-to-b from-white to-[hsl(213_30%_88%)] shadow-md transition-transform hover:brightness-105 active:translate-y-px"
        >
          <ArrowLeft className="h-5 w-5 text-kb-blue-dark" strokeWidth={3} />
        </button>
      )}
      {title && (
        <span className="mr-2 truncate text-base font-bold text-white [text-shadow:0_1px_2px_rgba(0,40,90,0.55)]">
          {title}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {rightActions && <div className="ml-auto flex shrink-0 items-center gap-2">{rightActions}</div>}
    </div>
  );
}
