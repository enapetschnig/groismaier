/**
 * Baustellen-Übersicht.
 *
 * ACHTUNG / HISTORIE: Diese Maske zeigte drei FEST EINPROGRAMMIERTE Fantasie-
 * Baustellen („Einfamilienhaus Müller", „Dachsanierung Schmidt", „Carport Bau
 * Huber") samt erfundener Fortschritts-Prozente und Mitarbeiterzahlen. In einer
 * Firmen-App ist das gefährlich: Wer die Seite öffnet, hält die Daten für echt.
 *
 * Jetzt lädt die Maske die tatsächlichen Projekte aus der Datenbank (alles außer
 * „Abgeschlossen"), zeigt Adresse und Status und führt per Klick in die
 * Projektübersicht. Erfundene Kennzahlen (Fortschritt %, Mitarbeiter vor Ort)
 * gibt es bewusst NICHT — die Daten existieren im Modell nicht.
 *
 * Die Route /construction-sites ist derzeit über kein Menü verlinkt (der
 * frühere Einstieg Dashboard.tsx ist in App.tsx nicht mehr geroutet).
 */
import { useEffect, useState } from "react";
import { Building2, MapPin, Home, FolderKanban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";

type Site = {
  id: string;
  name: string;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  status: string | null;
  projektnummer: string | null;
};

const ConstructionSites = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, adresse, plz, ort, status, projektnummer")
        .not("status", "eq", "Abgeschlossen")
        .order("name");
      if (error) {
        console.error("Baustellen konnten nicht geladen werden:", error);
      }
      setSites((data as Site[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        title="Baustellen"
        onBack={() => navigate(-1)}
        rightActions={
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Zur Startmaske"
            title="Zur Startmaske"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kb-blue-dark bg-gradient-to-b from-white to-[hsl(213_30%_88%)] shadow-md transition-transform hover:brightness-105 active:translate-y-px"
          >
            <Home className="h-5 w-5 text-kb-blue-dark" strokeWidth={2.5} />
          </button>
        }
      >
        <KBToolbarButton icon={FolderKanban} label="Projekte" onClick={() => navigate("/projects")} />
      </KBToolbar>

      <main className="container mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        <p className="mb-3 text-sm text-muted-foreground">
          Alle laufenden Projekte mit Baustellen-Adresse. Antippen öffnet die Projektübersicht.
        </p>

        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Lädt...</p>
        ) : sites.length === 0 ? (
          <div className="kb-panel px-4 py-12 text-center">
            <Building2 className="mx-auto mb-3 h-12 w-12 text-kb-icon-gray" strokeWidth={1.75} />
            <p className="mb-1 font-semibold">Keine laufenden Baustellen</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Sobald ein Projekt angelegt und nicht abgeschlossen ist, erscheint es hier.
            </p>
            <button type="button" className="kb-btn mx-auto min-h-[44px]" onClick={() => navigate("/projects")}>
              <FolderKanban className="h-4 w-4 text-kb-blue-dark" /> Zu den Projekten
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sites.map((site) => {
              const adresse = [site.adresse, [site.plz, site.ort].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={site.id}>
                  <button
                    type="button"
                    className="kb-panel flex min-h-[44px] w-full items-start gap-3 p-3 text-left transition-shadow hover:shadow-md"
                    onClick={() => navigate(`/projects/${site.id}`)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-kb-blue/10 text-kb-blue-dark">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-bold">{site.name}</span>
                        {site.projektnummer && (
                          <span className="font-mono text-xs text-muted-foreground">{site.projektnummer}</span>
                        )}
                      </span>
                      {adresse && (
                        <span className="mt-0.5 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="break-words">{adresse}</span>
                        </span>
                      )}
                    </span>
                    {site.status && (
                      <span className="shrink-0 rounded bg-kb-blue/10 px-2 py-0.5 text-xs font-medium text-kb-blue-dark">
                        {site.status}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
};

export default ConstructionSites;
