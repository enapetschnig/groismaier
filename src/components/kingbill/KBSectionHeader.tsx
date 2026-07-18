/**
 * KBSectionHeader — Bereichs-Kopf wie auf der KingBill-Startmaske:
 * großes graues Icon + großer grauer Titel („Dokumente", „Kunden", „Artikel",
 * „Finanzen") als halbtransparente Leiste direkt auf dem Blauverlauf.
 *
 * VERTRAG (für alle Agenten/Masken):
 *   <KBSectionHeader icon={FileText} title="Dokumente" />
 *
 * Props:
 *   icon        LucideIcon (Pflicht) — wird groß und grau gerendert
 *   title       string (Pflicht)
 *   className?  string
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KBSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  className?: string;
}

export function KBSectionHeader({ icon: Icon, title, className }: KBSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-white/60 bg-white/55 px-3 py-2 shadow-sm",
        className
      )}
    >
      <Icon className="h-9 w-9 shrink-0 text-kb-icon-gray" strokeWidth={1.75} />
      <h2 className="kb-section-title truncate">{title}</h2>
    </div>
  );
}
