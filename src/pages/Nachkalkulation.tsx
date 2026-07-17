import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { ProjektNachkalkulation } from "@/components/nachkalkulation/ProjektNachkalkulation";
import { Firmenzahlen } from "@/components/nachkalkulation/Firmenzahlen";

/**
 * Nachkalkulation & Firmenzahlen (Auswertung).
 *
 * Tab 1: Soll/Ist-Vergleich je Projekt (Auftragssumme, Verrechnet, Stunden,
 *        Lohn- und Fremdkosten, Deckungsbeitrag + Marge-Ampel).
 * Tab 2: Firmen-KPIs (bezahlter Umsatz, offene Posten, Überfälliges,
 *        Angebotsvolumen) und Monats-Charts.
 */
export default function Nachkalkulation() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Nachkalkulation & Firmenzahlen" backPath="/" />

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        <Tabs defaultValue="projekte">
          <TabsList>
            <TabsTrigger value="projekte">Projekt-Nachkalkulation</TabsTrigger>
            <TabsTrigger value="firma">Firmenzahlen</TabsTrigger>
          </TabsList>
          <TabsContent value="projekte" className="mt-4">
            <ProjektNachkalkulation />
          </TabsContent>
          <TabsContent value="firma" className="mt-4">
            <Firmenzahlen />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
