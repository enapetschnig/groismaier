import { PageHeader } from "@/components/PageHeader";
import { ProjektNachkalkulation } from "@/components/nachkalkulation/ProjektNachkalkulation";

/**
 * Nachkalkulation (Auswertung): Soll/Ist-Vergleich je Projekt —
 * Auftragssumme, Verrechnet, Stunden, Lohn- (Mitarbeiter-Stundenlohn ×
 * Lohnnebenkosten-Faktor), Material- und Fremdkosten, Deckungsbeitrag +
 * Marge-Ampel. Je Projekt aufklappbar: alle Angebots-/Rechnungspositionen
 * mit Soll-Stunden sowie Belege und Eingangsrechnungen.
 */
export default function Nachkalkulation() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Nachkalkulation" backPath="/" />

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        <ProjektNachkalkulation />
      </main>
    </div>
  );
}
