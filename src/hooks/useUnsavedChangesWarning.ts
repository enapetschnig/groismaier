import { useEffect } from "react";

/**
 * Warnt den User vor dem Schließen / Navigieren bei ungespeicherten Änderungen.
 * Verwendet die native beforeunload-API (Browser zeigt Standard-Warnung).
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Der Text wird von modernen Browsern ignoriert, aber required
      e.returnValue = "Sie haben ungespeicherte Änderungen. Wirklich verlassen?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}
