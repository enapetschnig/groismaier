import { Info } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiquiditaetsVorschau } from "@/components/finanzplanung/LiquiditaetsVorschau";
import { FixkostenVerwaltung } from "@/components/finanzplanung/FixkostenVerwaltung";

export default function Finanzplanung() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Finanzplanung" backPath="/" />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Vorschau, keine Buchhaltung</AlertTitle>
          <AlertDescription>
            Die Liquiditätsvorschau basiert ausschließlich auf offenen Ausgangs- und
            Eingangsrechnungen sowie den erfassten Fixkosten. Steuern, Lohnabgaben und
            sonstige nicht erfasste Zahlungen sind nicht berücksichtigt.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="vorschau">
          <TabsList>
            <TabsTrigger value="vorschau">Liquiditätsvorschau</TabsTrigger>
            <TabsTrigger value="fixkosten">Fixkosten</TabsTrigger>
          </TabsList>
          <TabsContent value="vorschau" className="mt-4">
            <LiquiditaetsVorschau />
          </TabsContent>
          <TabsContent value="fixkosten" className="mt-4">
            <FixkostenVerwaltung />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
