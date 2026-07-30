/**
 * PageHeader — KingBill-Kopfleiste für Masken, die (noch) keine eigene KBToolbar
 * bauen.
 *
 * Früher rendete diese Komponente eine weiße shadcn-Leiste (`border-b bg-card`),
 * wodurch Masken wie Zeiterfassung, Nachkalkulation, Berichte, Material,
 * Angebotspakete, Baustellen und Meine Dokumente optisch aus der App
 * herausfielen. Sie rendert jetzt die blaue KBToolbar — damit sehen ALLE Masken
 * gleich aus, ohne dass jede Seite einzeln umgebaut werden muss.
 *
 * Zusätzlich gibt es immer einen Home-Button zur Startmaske, damit keine Maske
 * eine Sackgasse ist.
 */
import * as React from "react";
import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { KBToolbar } from "@/components/kingbill";

interface PageHeaderProps {
  title?: string;
  showBackButton?: boolean;
  backPath?: string;
  /** Zusätzliche Aktionen rechts in der Leiste (vor dem Home-Button). */
  rightActions?: React.ReactNode;
  /** Aktions-Buttons in der Mitte der Leiste. */
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  showBackButton = true,
  backPath,
  rightActions,
  children,
}: PageHeaderProps) {
  const navigate = useNavigate();

  // App-weite Regel (Kundenwunsch): Zurück führt IMMER auf die zuvor
  // besuchte Seite (Browser-Verlauf). backPath ist nur noch der FALLBACK
  // für den Direkteinstieg per URL (kein In-App-Verlauf vorhanden).
  const handleBack = () => {
    const idx = (typeof window !== "undefined" && (window.history.state as any)?.idx) ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(backPath || "/");
  };

  return (
    <KBToolbar
      title={title}
      onBack={showBackButton ? handleBack : undefined}
      rightActions={rightActions}
    >
      {children}
    </KBToolbar>
  );
}
