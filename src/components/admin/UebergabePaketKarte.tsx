// ============================================================================
// Das Übergabepaket herunterladen (Kundenwunsch 10.09.2026)
//
// „perfekt wäre wenn das backup zip direkt in der app wäre, dass ich gar nix
//  per wetransfer schicken muss"
//
// Einmal im Monat legt der Sicherungslauf hier das komplette Paket ab:
// Quellcode, Anleitungen und die Datensicherung. Damit hängt die Absicherung
// des Betriebs an keinem Menschen mehr — der Chef holt sie sich selbst.
//
// Nur für Administratoren sichtbar UND serverseitig abgesichert: Die Ablage
// ist nicht öffentlich, und die Zugriffsregel verlangt die Administrator-
// Rolle (siehe Migration 20260910120000). Im Paket stecken sämtliche
// Kunden- und Mitarbeiterdaten.
// ============================================================================
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Package, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ABLAGE = "uebergabe";
const DATEI = "Groismaier-App.zip";

interface PaketInfo {
  groesseMb: number;
  stand: Date;
}

/** Wie viele Tage ist das Paket alt? */
const tageAlt = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

export function UebergabePaketKarte() {
  const { toast } = useToast();
  const [paket, setPaket] = useState<PaketInfo | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [holt, setHolt] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.storage.from(ABLAGE).list("", { limit: 100 });
      setLaedt(false);
      if (error || !data) return;
      const eintrag = data.find((d) => d.name === DATEI);
      if (!eintrag) return;
      setPaket({
        groesseMb: (eintrag.metadata?.size ?? 0) / 1024 / 1024,
        stand: new Date(eintrag.updated_at ?? eintrag.created_at ?? Date.now()),
      });
    })();
  }, []);

  const herunterladen = async () => {
    setHolt(true);
    // Signierte URL statt öffentlichem Link: Die Ablage bleibt geschlossen,
    // der Link gilt nur fünf Minuten und nur für diesen Klick.
    const { data, error } = await supabase.storage.from(ABLAGE).createSignedUrl(DATEI, 300, {
      download: DATEI,
    });
    setHolt(false);
    if (error || !data?.signedUrl) {
      toast({
        variant: "destructive",
        title: "Download nicht möglich",
        description: error?.message ?? "Das Paket ist gerade nicht abrufbar.",
      });
      return;
    }
    window.location.href = data.signedUrl;
  };

  const alter = paket ? tageAlt(paket.stand) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Sicherheitskopie der App
        </CardTitle>
        <CardDescription>
          Alles, was zu dieser App gehört, in einer Datei: das Programm selbst, die
          Anleitungen und eine Sicherung aller Daten — Kunden, Angebote, Rechnungen,
          Stunden, Projekte. Wird automatisch jeden Monat neu erstellt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {laedt ? (
          <p className="text-sm text-muted-foreground">Wird geprüft …</p>
        ) : paket ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground">Stand: </span>
                {paket.stand.toLocaleDateString("de-AT", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
                {alter > 0 && (
                  <span className="text-muted-foreground"> ({alter} Tage alt)</span>
                )}
              </span>
              <span>
                <span className="text-muted-foreground">Größe: </span>
                {paket.groesseMb.toFixed(0)} MB
              </span>
            </div>

            {alter > 45 && (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Diese Kopie ist älter als gewöhnlich — der monatliche Lauf ist
                offenbar nicht durchgekommen. Bitte melden.
              </p>
            )}

            <Button onClick={herunterladen} disabled={holt}>
              <Download className="mr-2 h-4 w-4" />
              {holt ? "Wird vorbereitet …" : "Herunterladen"}
            </Button>

            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p className="mb-1.5 font-medium text-foreground">Wozu das gut ist</p>
              <p>
                Sollte einmal niemand mehr erreichbar sein, der die App betreut, genügt
                diese eine Datei: Jeder IT-Fachmann bringt die App damit wieder online.
                Die Anleitung dafür liegt im Paket ganz oben — <em>START-HIER</em> öffnen
                und der Techniker findet alles Weitere.
              </p>
              <p className="mt-2">
                Im Alltag brauchst du sie nicht. Am besten einmal herunterladen und an
                einem sicheren Ort verwahren — nicht offen in einer Cloud, es stehen
                alle Kunden- und Mitarbeiterdaten darin.
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Es liegt noch keine Kopie bereit. Sie wird beim nächsten monatlichen
            Sicherungslauf erstellt.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
