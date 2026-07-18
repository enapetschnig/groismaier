/**
 * KBButton — boxiger KingBill-Button (Verlauf, 1px grauer Rand, Icon links + Label).
 *
 * VERTRAG (für alle Agenten/Masken):
 *   <KBButton icon={Plus} label="Neues Angebot" onClick={…} />
 *
 * Props:
 *   icon?          LucideIcon — wird links vom Label gerendert
 *   label          string — Beschriftung (Pflicht)
 *   variant?       "default" | "green" | "blue" — alle drei sind HELLE Boxen (wie
 *                  KingBill): green = Grünstich + grünes Icon („Speichern & Schließen"),
 *                  blue = Blaustich + Text/Icon im Titelleisten-Blau
 *   size?          "default" (~36px, Listen-Button) | "lg" (~44-48px, Toolbar)
 *   badge?         number — roter Zähler-Kreis OBEN RECHTS am Button (nur wenn > 0)
 *   iconClassName? string — z. B. "text-kb-green" für das grüne Plus-Icon,
 *                  "text-kb-yellow" für die gelbe Such-Lupe
 *   …alle nativen <button>-Props (onClick, disabled, type, …)
 *
 * type ist standardmäßig "button" (kein versehentliches Form-Submit).
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KBButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label: string;
  variant?: "default" | "green" | "blue";
  size?: "default" | "lg";
  badge?: number;
  iconClassName?: string;
}

const VARIANT_CLASS: Record<NonNullable<KBButtonProps["variant"]>, string> = {
  default: "",
  green: "kb-btn-primary-green",
  blue: "kb-btn-blue",
};

export const KBButton = React.forwardRef<HTMLButtonElement, KBButtonProps>(
  (
    { icon: Icon, label, variant = "default", size = "default", badge, iconClassName, className, type = "button", ...rest },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("kb-btn", size === "lg" && "kb-btn-lg", VARIANT_CLASS[variant], className)}
        {...rest}
      >
        {Icon && (
          <Icon
            className={cn(
              size === "lg" ? "h-5 w-5" : "h-4 w-4",
              "shrink-0",
              variant === "green" ? "text-kb-green" : "text-kb-blue-dark",
              iconClassName
            )}
          />
        )}
        <span className="truncate">{label}</span>
        {typeof badge === "number" && badge > 0 && (
          <span className="kb-badge absolute -right-1.5 -top-1.5">{badge > 99 ? "99+" : badge}</span>
        )}
      </button>
    );
  }
);
KBButton.displayName = "KBButton";
