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

/** Tägliche Datensicherung (Kundenwunsch 19.09.2026), Ordner sicherungen/. */
interface Tagessicherung { name: string; datum: string; groesseMb: number }
const SICHERUNGEN = "sicherungen";

/** Wie viele Tage ist das Paket alt? */
const tageAlt = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

export function UebergabePaketKarte() {
  const { toast } = useToast();
  const [paket, setPaket] = useState<PaketInfo | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [holt, setHolt] = useState(false);
  const [tages, setTages] = useState<Tagessicherung[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data, error }, { data: sich }] = await Promise.all([
        supabase.storage.from(ABLAGE).list("", { limit: 100 }),
        supabase.storage.from(ABLAGE).list(SICHERUNGEN, { limit: 200, sortBy: { column: "name", order: "desc" } }),
      ]);
      setTages(((sich || []) as any[])
        .filter((d) => /^sicherung_\d{4}-\d{2}-\d{2}\.tar\.gz$/.test(d.name))
        .map((d) => ({ name: d.name, datum: d.name.slice(10, 20), groesseMb: (d.metadata?.size ?? 0) / 1024 / 1024 })));
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

  const herunterladen = async (pfad: string = DATEI) => {
    setHolt(true);
    // Signierte URL statt öffentlichem Link: Die Ablage bleibt geschlossen,
    // der Link gilt nur fünf Minuten und nur für diesen Klick.
    const { data, error } = await supabase.storage.from(ABLAGE).createSignedUrl(pfad, 300, {
      download: pfad.split("/").pop() || pfad,
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
          Stunden, Projekte. Das Paket wird monatlich neu erstellt, die Datenbank
          zusätzlich jede Nacht gesichert (unten).
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

            <Button onClick={() => void herunterladen()} disabled={holt}>
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

        {/* Tägliche Datensicherung (Kundenwunsch 19.09.2026: „1 x pro 24 Stunden …
            die alten werden irgendwann überschrieben") */}
        <div className="space-y-2 border-t pt-4">
          <p className="font-medium">Tägliche Datensicherung</p>
          <p className="text-sm text-muted-foreground">
            Jede Nacht um 4 Uhr wird die komplette Datenbank gesichert (Kunden, Belege, Stunden, Projekte,
            Benutzer). Die letzten 60 Tage liegen hier, ältere werden automatisch gelöscht. Zusätzlich
            bewahrt GitHub jede Sicherung 90 Tage auf. Zum Aufheben auf der eigenen Platte: gewünschten
            Tag herunterladen. Fotos und PDFs sind nicht enthalten.
          </p>
          {tages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Tagessicherung — die erste kommt beim nächsten nächtlichen Lauf.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {tages.slice(0, 10).map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span>
                    {new Date(t.datum + "T12:00:00").toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                    <span className="ml-2 text-muted-foreground">{t.groesseMb.toFixed(1)} MB</span>
                  </span>
                  <Button size="sm" variant="outline" className="h-8" disabled={holt} onClick={() => void herunterladen(`${SICHERUNGEN}/${t.name}`)}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Laden
                  </Button>
                </li>
              ))}
              {tages.length > 10 && <li className="px-3 py-1.5 text-xs text-muted-foreground">… und {tages.length - 10} ältere (bis 60 Tage).</li>}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
