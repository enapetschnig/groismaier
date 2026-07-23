/**
 * KBSubTabs — KingBill-Ordner-Reiter für Unter-Bereiche einer Maske
 * (z. B. „Zahlungsbedingungen | Projekt | Vortext | Schlusstext" im
 * Allgemein-Schritt oder „Artikelliste | Artikel im Dokument" im Artikel-
 * Schritt). Optisch die kleinen Karteireiter, die auf dem Inhaltsbereich
 * darunter „aufsitzen" — nicht die großen Wizard-Tabs (das ist KBWizardTabs).
 *
 * VERTRAG:
 *   <KBSubTabs
 *     items={[{ id: "zahlung", label: "Zahlungsbedingungen" }, …]}
 *     activeId={sub}
 *     onSelect={setSub}
 *   />
 *   {sub === "zahlung" && <…/>}
 *
 * Bewusst KEINE Radix/shadcn-Tabs: der Inhalt wird vom Aufrufer per
 * conditional render gesteuert (State liegt gehoben im Editor-Body), damit
 * er beim Umschalten nicht verloren geht und schwere Panels nicht unsichtbar
 * mitlaufen. Reine, „dumme" Reiterleiste.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KBSubTabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Roter Zähler-Kreis am Reiter (nur wenn > 0). */
  badge?: number;
}

export interface KBSubTabsProps {
  items: KBSubTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function KBSubTabs({ items, activeId, onSelect, className }: KBSubTabsProps) {
  return (
    // -mb-px lässt den aktiven Reiter mit dem Border des Inhaltsbereichs
    // darunter verschmelzen (Ordner-Optik).
    <div className={cn("flex flex-wrap items-end gap-1 -mb-px", className)} role="tablist">
      {items.map((it) => {
        const Icon = it.icon;
        const active = activeId === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(it.id)}
            className={cn(
              "relative inline-flex min-h-[36px] items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "z-10 border-b-transparent bg-white text-kb-blue-dark border-[hsl(var(--kb-panel-border))]"
                : "border-transparent bg-[hsl(var(--kb-blue-light)/0.18)] text-muted-foreground hover:bg-[hsl(var(--kb-blue-light)/0.32)] hover:text-kb-blue-dark",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="truncate">{it.label}</span>
            {typeof it.badge === "number" && it.badge > 0 && (
              <span className="kb-badge ml-0.5">{it.badge > 99 ? "99+" : it.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
