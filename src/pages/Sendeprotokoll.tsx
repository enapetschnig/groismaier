/**
 * Sendeprotokoll (Kundenwunsch 27.08.2026): Jede aus dem Programm versendete
 * Rechnung / jedes Angebot hinterlässt eine Sendebestätigung mit Datum und
 * Uhrzeit. Diese Seite sammelt ALLE Bestätigungen — auch die ohne Projekt
 * ("wenn noch kein Projekt angelegt wurde ... braucht es auch eine
 * Möglichkeit das gesammelt zu finden"). Mit ?project=<id> zeigt sie nur die
 * Sendungen eines Projekts (Einstieg über die Projekt-Kategorie).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { MailCheck, Paperclip, Search } from "lucide-react";
import { KBToolbar } from "@/components/kingbill";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface ProtokollZeile {
  id: string;
  gesendet_am: string;
  invoice_id: string | null;
  project_id: string | null;
  beleg_typ: string | null;
  beleg_nummer: string | null;
  beleg_bezeichnung: string | null;
  kunde_name: string | null;
  von_adresse: string;
  an_adressen: string[];
  cc_adressen: string[];
  betreff: string | null;
  anhaenge: string[];
  projects?: { name: string } | null;
}

const fmtZeit = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("de-AT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

export default function Sendeprotokoll() {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get("project");
  const [zeilen, setZeilen] = useState<ProtokollZeile[]>([]);
  const [loading, setLoading] = useState(true);
  const [suche, setSuche] = useState("");
  const [projektName, setProjektName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Tabelle fehlt in den generierten Supabase-Typen → cast wie bei
    // `kalkulationen` (siehe KalkulationHub).
    let q = (supabase.from("beleg_sendeprotokoll" as never) as any)
      .select("id, gesendet_am, invoice_id, project_id, beleg_typ, beleg_nummer, beleg_bezeichnung, kunde_name, von_adresse, an_adressen, cc_adressen, betreff, anhaenge, projects(name)")
      .order("gesendet_am", { ascending: false })
      .limit(500);
    if (projectFilter) q = q.eq("project_id", projectFilter);
    const { data, error } = await q;
    setZeilen(error ? [] : ((data as ProtokollZeile[]) || []));
    setLoading(false);
  }, [projectFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!projectFilter) { setProjektName(null); return; }
    supabase.from("projects").select("name").eq("id", projectFilter).maybeSingle()
      .then(({ data }) => setProjektName(data?.name || null));
  }, [projectFilter]);

  const q = suche.toLowerCase();
  const gefiltert = zeilen.filter((z) =>
    !q ||
    (z.kunde_name || "").toLowerCase().includes(q) ||
    (z.beleg_nummer || "").toLowerCase().includes(q) ||
    (z.beleg_bezeichnung || "").toLowerCase().includes(q) ||
    (z.betreff || "").toLowerCase().includes(q) ||
    z.an_adressen.some((a) => a.toLowerCase().includes(q)) ||
    (z.projects?.name || "").toLowerCase().includes(q));

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title={projektName ? `Sendeprotokoll — ${projektName}` : "Sendeprotokoll"} />

      <main className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        <Card className="kb-panel mb-4">
          <CardContent className="p-3 sm:p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Suche nach Kunde, Belegnummer, Empfänger, Projekt…"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                className="h-11 pl-10"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Jeder Versand aus dem Programm landet hier automatisch mit Datum und Uhrzeit
              {projectFilter ? " — gefiltert auf dieses Projekt." : " — auch Belege ohne Projekt."}
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Lädt …</p>
        ) : gefiltert.length === 0 ? (
          <Card className="kb-panel">
            <CardContent className="py-12 text-center">
              <MailCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">Noch keine Sendebestätigungen</h3>
              <p className="text-muted-foreground">
                Sobald ein Beleg über „Per E-Mail senden" verschickt wird, erscheint hier die Bestätigung.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {gefiltert.map((z) => (
              <Card
                key={z.id}
                className={`kb-panel ${z.invoice_id ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
                onClick={() => z.invoice_id && navigate(`/invoices/${z.invoice_id}`)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <MailCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                        {(z.beleg_bezeichnung || z.beleg_typ || "Beleg")} {z.beleg_nummer || ""}
                        {z.kunde_name && <span className="font-normal text-muted-foreground">· {z.kunde_name}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        An: {z.an_adressen.join(", ")}
                        {z.cc_adressen.length > 0 && ` · CC: ${z.cc_adressen.join(", ")}`}
                        {" "}· Von: {z.von_adresse}
                      </p>
                      {z.betreff && <p className="mt-0.5 truncate text-xs text-muted-foreground">Betreff: {z.betreff}</p>}
                      {z.anhaenge.length > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3 shrink-0" /> {z.anhaenge.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="secondary" className="tabular-nums text-xs">{fmtZeit(z.gesendet_am)}</Badge>
                      {z.projects?.name
                        ? <span className="text-[11px] text-muted-foreground">{z.projects.name}</span>
                        : <span className="text-[11px] text-muted-foreground">Ohne Projekt</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
