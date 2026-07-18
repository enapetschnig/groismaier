/**
 * KBToolbarButton — große Toolbar-Variante des KingBill-Buttons (~44px hoch).
 *
 * VERTRAG (für alle Agenten/Masken):
 *   <KBToolbarButton icon={Save} label="Speichern & Schließen" variant="green" onClick={…} />
 *
 * Props (identisch zu KBButton, aber size ist fix "lg"):
 *   icon?          LucideIcon
 *   label          string (Pflicht)
 *   variant?       "default" | "green" | "blue"
 *   badge?         number — roter Zähler-Kreis (nur > 0)
 *   iconClassName? string
 *   …alle nativen <button>-Props
 */
import * as React from "react";
import { KBButton, type KBButtonProps } from "./KBButton";

export type KBToolbarButtonProps = Omit<KBButtonProps, "size">;

export const KBToolbarButton = React.forwardRef<HTMLButtonElement, KBToolbarButtonProps>(
  (props, ref) => <KBButton ref={ref} size="lg" {...props} />
);
KBToolbarButton.displayName = "KBToolbarButton";
