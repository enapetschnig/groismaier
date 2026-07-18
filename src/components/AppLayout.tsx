import { Outlet } from "react-router-dom";

/**
 * KingBill-Menüführung: KEINE ständige Seitenleiste.
 * Navigation läuft wie im Original über die Startmaske (Hub) und die
 * Zurück-Buttons der einzelnen Masken (KBToolbar bzw. PageHeader).
 * Die Systemleiste (Beenden / Einstellungen) sitzt im Kopf der Startmaske.
 * Mobile verhält sich identisch (Seiten sind mobile-first eigenständig).
 */
export function AppLayout() {
  return (
    <div className="kb-page min-h-screen">
      <Outlet />
    </div>
  );
}
