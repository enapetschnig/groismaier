import type { PointerEvent as ReactPointerEvent } from "react";
import type { Einsatz } from "./scheduleTypes";

interface Props {
  einsatz: Einsatz;
  projectName: string;
  color: string;
  startCol: number;
  endCol: number;
  totalDays: number;
  onClick?: () => void;
  /** Wenn true, kann der User die Bar greifen und auf eine andere
   *  Zelle ziehen. Sonst nur klickbar. */
  draggable?: boolean;
  /** Wird beim PointerDown auf der Bar aufgerufen — der Aufrufer
   *  startet die Drag-Session und captured weitere Pointer-Events. */
  onDragStart?: (einsatzId: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Während aktiver Drag-Session: Bar wird halbtransparent und
   *  empfängt keine weiteren Pointer-Events (damit die darunter
   *  liegenden Zellen den Hover bekommen). */
  isDragging?: boolean;
}

/**
 * Darken a hex color by a given amount (0–1).
 * Used to derive a subtle border color from the background.
 */
function darkenHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  const num = parseInt(raw, 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export function EinsatzBar({
  einsatz,
  projectName,
  color,
  startCol,
  endCol,
  totalDays,
  onClick,
  draggable = false,
  onDragStart,
  isDragging = false,
}: Props) {
  const leftPct = (startCol / totalDays) * 100;
  const widthPct = ((endCol - startCol + 1) / totalDays) * 100;
  const borderColor = darkenHex(color, 0.15);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || !onDragStart) return;
    // Nur primäre Maustaste / Touch akzeptieren — sonst ignorieren.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();   // verhindert dass drag-to-select auf der Zelle anspringt
    onDragStart(einsatz.id, e);
  };

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 rounded-md flex items-center px-2 text-xs font-medium truncate transition-shadow ${
        onClick ? "hover:shadow-md" : ""
      }`}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        height: 28,
        backgroundColor: color,
        border: `1px solid ${borderColor}`,
        color: "#1e293b",
        minWidth: 0,
        cursor: draggable ? (isDragging ? "grabbing" : "grab") : (onClick ? "pointer" : "default"),
        opacity: isDragging ? 0.5 : 1,
        // Während des Drags die Bar für Pointer-Events freigeben, damit
        // die darunter liegenden Tageszellen den Hover empfangen.
        pointerEvents: isDragging ? "none" : undefined,
        // Touch-Geräte: verhindert dass der Browser die Bar als
        // Scroll-Trigger interpretiert.
        touchAction: draggable ? "none" : undefined,
      }}
      title={`${projectName}${einsatz.name ? ` — ${einsatz.name}` : ""}`}
      onClick={onClick}
      onPointerDown={handlePointerDown}
    >
      <span className="truncate">{projectName}</span>
    </div>
  );
}
