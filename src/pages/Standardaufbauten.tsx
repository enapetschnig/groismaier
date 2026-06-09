import { Layers, FileText, Download, ExternalLink, Home, Building2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Standardaufbauten — Holzbau Groismaier
 *
 * Zentrale Übersicht der standardisierten Wand-, Dach- und Deckenaufbauten
 * (aus dem GROISMAIER-Ordner "4 Standard Aufbauten HBG"). Jeder Aufbau ist
 * als PDF hinterlegt und kann angesehen oder heruntergeladen werden — als
 * Referenz für Angebote, Kalkulation und Ausführung.
 */

interface Aufbau {
  title: string;
  spec: string;
  file: string;
}
interface Gruppe {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Aufbau[];
}

const GRUPPEN: Gruppe[] = [
  {
    label: "Außenwände — Riegelkonstruktion",
    icon: Building2,
    items: [
      { title: "Riegel 160 / 60 HF", spec: "Riegelkonstruktion 160 mm + 60 mm Holzfaser", file: "/standardaufbauten/aw-riegel-160-60hf.pdf" },
      { title: "Riegel 160 / 60 HF + Installationsebene", spec: "160 mm + 60 mm HF, 50 mm gedämmte Installationsebene", file: "/standardaufbauten/aw-riegel-160-60hf-installebene.pdf" },
      { title: "Riegel 200 / 60 HF", spec: "Riegelkonstruktion 200 mm + 60 mm Holzfaser", file: "/standardaufbauten/aw-riegel-200-60hf.pdf" },
      { title: "Riegel 240 / 60 HF", spec: "Riegelkonstruktion 240 mm + 60 mm Holzfaser", file: "/standardaufbauten/aw-riegel-240-60hf.pdf" },
      { title: "Riegel 240 + Bretter + Installationsebene", spec: "240 mm, 25 mm Bretter außen, gedämmte Installationsebene", file: "/standardaufbauten/aw-riegel-240-bretter-installebene.pdf" },
    ],
  },
  {
    label: "Dachaufbauten — CLT + Stroh",
    icon: Home,
    items: [
      { title: "Dach CLT 120 + 200 mm Stroh", spec: "CLT 120 mm, 200 mm Stroh-Dämmung", file: "/standardaufbauten/dach-clt-120-200stroh.pdf" },
      { title: "Dach CLT 120 + 240 mm Stroh", spec: "CLT 120 mm, 240 mm Stroh-Dämmung", file: "/standardaufbauten/dach-clt-120-240stroh.pdf" },
      { title: "Dach CLT 120 + 280 mm Stroh", spec: "CLT 120 mm, 280 mm Stroh-Dämmung", file: "/standardaufbauten/dach-clt-120-280stroh.pdf" },
    ],
  },
  {
    label: "Sparrendächer",
    icon: Layers,
    items: [
      { title: "Sparrendach 240 mm Stroh", spec: "Sparrendach mit 240 mm Stroh-Dämmung", file: "/standardaufbauten/sparrendach-240stroh.pdf" },
      { title: "Sparrendach 280 mm Stroh", spec: "Sparrendach mit 280 mm Stroh-Dämmung", file: "/standardaufbauten/sparrendach-280stroh.pdf" },
    ],
  },
  {
    label: "Bauphysik",
    icon: ShieldCheck,
    items: [
      { title: "Bauphysikalische Freigabe", spec: "Dach- und Deckenaufbauten mit Holzuntersicht", file: "/standardaufbauten/bauphysik-freigabe-dach-decke.pdf" },
    ],
  },
];

export default function Standardaufbauten() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Standardaufbauten" />

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-6xl">
        <p className="text-muted-foreground mb-6 flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary shrink-0" />
          Standardisierte Wand-, Dach- und Deckenaufbauten von Holzbau Groismaier — als Referenz für Angebote, Kalkulation und Ausführung.
        </p>

        <div className="space-y-8">
          {GRUPPEN.map((gruppe) => {
            const GIcon = gruppe.icon;
            return (
              <section key={gruppe.label}>
                <h2 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2 text-foreground">
                  <GIcon className="h-5 w-5 text-primary" />
                  {gruppe.label}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {gruppe.items.map((item) => (
                    <Card key={item.file} className="flex flex-col hover:shadow-md transition-shadow">
                      <CardHeader className="space-y-2 pb-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
                        <CardDescription className="text-xs">{item.spec}</CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto flex gap-2">
                        <Button size="sm" className="flex-1" asChild>
                          <a href={item.file} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1.5" /> Ansehen
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={item.file} download>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
