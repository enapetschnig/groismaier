import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { Zap, Plus, Calendar, Clock, User, MapPin, Filter, Search, Briefcase, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DisturbanceForm } from "@/components/DisturbanceForm";
import { parseDecimal } from "@/lib/num";

const eur = (n: number) => `€ ${n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Disturbance = {
  id: string;
  datum: string;
  start_time: string;
  end_time: string;
  pause_minutes: number;
  stunden: number;
  kunde_name: string;
  kunde_email: string | null;
  kunde_adresse: string | null;
  kunde_telefon: string | null;
  beschreibung: string;
  notizen: string | null;
  status: string;
  is_verrechnet: boolean;
  created_at: string;
  user_id: string;
  project_id: string | null;
  unterschrift_kunde: string | null;
  profile_vorname?: string;
  profile_nachname?: string;
  project_name?: string | null;
};

const Disturbances = () => {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [prefillProjectId, setPrefillProjectId] = useState<string | null>(null);
  const projectFilter = searchParams.get("project");
  // Sammelrechnung (Kundenwunsch 08/2026): mehrere Berichte anhaken und in
  // EINE Rechnung übernehmen.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Offene (nicht verrechnete) Beträge: Stunden × Regie-Stundensatz +
  // Material + Maschinen — für die Übersicht "offene Summe je Projekt".
  const [regieSatz, setRegieSatz] = useState(70);
  const [nebenSummen, setNebenSummen] = useState<Map<string, number>>(new Map());
  // Der Satz ist direkt hier editierbar (Kundenwunsch 18.08.: "68 Euro
  // hinterlegen" kam per Mail — das soll künftig ohne Entwickler gehen).
  const [satzText, setSatzText] = useState("");
  const [satzSpeichert, setSatzSpeichert] = useState(false);

  const speichereRegieSatz = async () => {
    const n = parseDecimal(satzText);
    if (n === null || n <= 0) {
      toast({ variant: "destructive", title: "Ungültiger Satz", description: "Bitte eine Zahl > 0 eingeben, z.B. 68." });
      return;
    }
    setSatzSpeichert(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "regie_stundensatz", value: String(n) }, { onConflict: "key" });
    setSatzSpeichert(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: `Satz konnte nicht gespeichert werden: ${error.message}` });
      return;
    }
    setRegieSatz(n);
    setSatzText(n.toLocaleString("de-AT"));
    toast({ title: "Regiestundensatz gespeichert", description: `Ab jetzt gelten € ${n.toLocaleString("de-AT")} je Stunde.` });
  };

  useEffect(() => {
    checkAuth();
    // Quick-Action aus Projekt: /disturbances?new=<project_id> → Dialog automatisch öffnen mit vorbelegtem Projekt
    const newProjectId = searchParams.get("new");
    if (newProjectId) {
      setPrefillProjectId(newProjectId);
      setShowForm(true);
    }
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Check if admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    setIsAdmin(roleData?.role === "administrator");
    fetchDisturbances();
  };

  const fetchDisturbances = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("disturbances")
      .select("*")
      .order("datum", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Regieberichte konnten nicht geladen werden",
      });
    } else {
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(d => d.user_id))];
        const projectIds = [...new Set(data.map((d: any) => d.project_id).filter(Boolean))] as string[];

        const [{ data: profiles }, { data: projects }] = await Promise.all([
          supabase.from("profiles").select("id, vorname, nachname").in("id", userIds),
          projectIds.length > 0
            ? supabase.from("projects").select("id, name").in("id", projectIds)
            : Promise.resolve({ data: [] as any[] } as any),
        ]);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const projectMap = new Map((projects || []).map((p: any) => [p.id, p.name]));

        const enrichedData = data.map((d: any) => ({
          ...d,
          profile_vorname: profileMap.get(d.user_id)?.vorname || "",
          profile_nachname: profileMap.get(d.user_id)?.nachname || "",
          project_name: d.project_id ? projectMap.get(d.project_id) || null : null,
        }));

        setDisturbances(enrichedData);
        void ladeOffeneNebensummen(enrichedData.filter((d: any) => !d.is_verrechnet).map((d: any) => d.id));
      } else {
        setDisturbances([]);
        setNebenSummen(new Map());
      }
    }
    setLoading(false);
  };

  /**
   * Material- und Maschinenbeträge der noch nicht verrechneten Berichte
   * (je Bericht aufsummiert) + Regie-Stundensatz aus den Einstellungen.
   * Tabellen/Spalten können in frischen Umgebungen fehlen → leer weiter.
   */
  const ladeOffeneNebensummen = async (ids: string[]) => {
    const summen = new Map<string, number>();
    if (ids.length > 0) {
      // In 100er-Blöcken abfragen — hunderte UUIDs in EINEM .in() sprengen
      // sonst die URL-Länge und die Summenkarte bliebe stumm unvollständig.
      const bloecke: string[][] = [];
      for (let i = 0; i < ids.length; i += 100) bloecke.push(ids.slice(i, i + 100));
      const [satzRes, ...blockRes] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "regie_stundensatz").maybeSingle(),
        ...bloecke.map((block) =>
          supabase.from("disturbance_materials").select("disturbance_id, menge, einzelpreis").in("disturbance_id", block)),
        ...bloecke.map((block) =>
          (supabase.from("disturbance_maschinen" as never) as any).select("disturbance_id, menge, einzelpreis").in("disturbance_id", block)),
      ]);
      const satz = parseDecimal(String(satzRes.data?.value ?? ""));
      if (satz !== null && satz > 0) {
        setRegieSatz(satz);
        // Eingabefeld einmalig vorbelegen — laufende Tipparbeit nicht überschreiben.
        setSatzText((alt) => (alt === "" ? satz.toLocaleString("de-AT") : alt));
      }
      for (const res of blockRes) {
        for (const z of (((res as any).data as any[]) || [])) {
          const menge = parseDecimal(String(z.menge ?? "")) ?? 0;
          const preis = Number(z.einzelpreis) || 0;
          if (menge > 0 && preis !== 0) {
            summen.set(z.disturbance_id, (summen.get(z.disturbance_id) || 0) + menge * preis);
          }
        }
      }
    }
    setNebenSummen(summen);
  };

  /** Offener (nicht verrechneter) Betrag eines Berichts. */
  const offenBetrag = (d: Disturbance): number =>
    d.is_verrechnet ? 0 : (Number(d.stunden) || 0) * regieSatz + (nebenSummen.get(d.id) || 0);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sammelrechnungErstellen = () => {
    const gewaehlt = disturbances.filter(d => selectedIds.has(d.id));
    if (gewaehlt.length === 0) return;
    const kunden = new Set(gewaehlt.map(d => (d.kunde_name || "").trim()).filter(Boolean));
    if (kunden.size > 1) {
      toast({
        title: "Verschiedene Kunden gewählt",
        description: "Die Kundendaten der Rechnung kommen aus dem ersten Bericht — bitte prüfen.",
      });
    }
    navigate(`/invoices/new?typ=rechnung&disturbance_ids=${gewaehlt.map(d => d.id).join(",")}`);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    fetchDisturbances();
  };

  /** Status-Ablauf: Entwurf/offen → Unterschrieben → Abgeschlossen. */
  const getStatusBadge = (d: Disturbance) => {
    if (d.status === "abgeschlossen") {
      return <Badge className="bg-green-600 text-white">Abgeschlossen</Badge>;
    }
    if (d.unterschrift_kunde) {
      return <Badge className="bg-blue-600 text-white">Unterschrieben</Badge>;
    }
    if (d.status === "offen") {
      return <Badge variant="secondary">Entwurf / offen</Badge>;
    }
    return <Badge variant="outline">{d.status}</Badge>;
  };

  const handleToggleVerrechnet = async (e: React.MouseEvent, disturbanceId: string, currentValue: boolean) => {
    e.stopPropagation();

    // Beim Umschalten von Hand auch den Beleg-Verweis löschen — sonst zeigt
    // ein wieder geöffneter Bericht auf eine Rechnung, die ihn nicht (mehr)
    // enthält. Fallback ohne die Spalte, solange die Migration fehlt.
    let { error } = await (supabase.from("disturbances") as any)
      .update({ is_verrechnet: !currentValue, verrechnet_in_invoice_id: null })
      .eq("id", disturbanceId);
    if (error) {
      ({ error } = await supabase
        .from("disturbances")
        .update({ is_verrechnet: !currentValue })
        .eq("id", disturbanceId));
    }

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Status konnte nicht geändert werden",
      });
    } else {
      fetchDisturbances();
    }
  };

  const filteredDisturbances = disturbances.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      d.kunde_name.toLowerCase().includes(q) ||
      d.beschreibung.toLowerCase().includes(q) ||
      (d.project_name?.toLowerCase().includes(q) ?? false) ||
      (d.kunde_adresse?.toLowerCase().includes(q) ?? false);

    let matchesStatus = true;
    if (statusFilter === "verrechnet") {
      matchesStatus = d.is_verrechnet === true;
    } else if (statusFilter === "nicht_verrechnet") {
      matchesStatus = d.is_verrechnet === false;
    } else if (statusFilter === "unterschrieben") {
      matchesStatus = !!d.unterschrift_kunde && d.status !== "abgeschlossen";
    } else if (statusFilter !== "alle") {
      matchesStatus = d.status === statusFilter;
    }

    const matchesProject = !projectFilter || d.project_id === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });

  const offeneAnzahl = disturbances.filter((d) => d.status !== "abgeschlossen").length;

  // Offene (nicht verrechnete) Summen — gesamt und je Projekt (Kundenwunsch
  // 08/2026: "Übersicht oben, wo die gesamt zu verrechnende offene Summe je
  // Projekt ist"). Nur für Admins sichtbar (Gelddaten).
  const offeneBerichte = disturbances.filter(
    (d) => !d.is_verrechnet && (!projectFilter || d.project_id === projectFilter),
  );
  const offeneGesamt = offeneBerichte.reduce((s, d) => s + offenBetrag(d), 0);
  const offeneJeProjekt = [...offeneBerichte
    .reduce((m, d) => {
      const name = d.project_name || "Ohne Projekt";
      m.set(name, (m.get(name) || 0) + offenBetrag(d));
      return m;
    }, new Map<string, number>())
    .entries()]
    .filter(([, betrag]) => betrag > 0.005)
    .sort((a, b) => b[1] - a[1]);

  if (loading) {
    return (
      <div className="kb-page min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="Regieberichte">
        {/* kurzes Label — „Neuer Regiebericht" sprengt am Handy die Leiste */}
        <KBToolbarButton
          icon={Plus}
          iconClassName="text-kb-green"
          label="Neu"
          onClick={() => setShowForm(true)}
        />
      </KBToolbar>

      <main className="mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 max-w-4xl">
        {/* Am Handy die wichtigste Aktion groß und unmissverständlich */}
        <Button
          className="sm:hidden w-full h-12 text-base mb-3"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Neuer Regiebericht
        </Button>

        {/* Filter */}
        <Card className="kb-panel mb-4">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Kunde, Projekt, Beschreibung…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-11">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  <SelectItem value="offen">Entwurf / offen</SelectItem>
                  <SelectItem value="unterschrieben">Unterschrieben</SelectItem>
                  <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                  <SelectItem value="verrechnet">Verrechnet</SelectItem>
                  <SelectItem value="nicht_verrechnet">Nicht verrechnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(projectFilter || disturbances.length > 0) && (
              <p className="text-xs text-muted-foreground mt-2">
                {filteredDisturbances.length} von {disturbances.length} Berichten
                {offeneAnzahl > 0 && ` · ${offeneAnzahl} noch nicht abgeschlossen`}
                {projectFilter && " · auf dieses Projekt gefiltert"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Offene Summe je Projekt + Regiestundensatz (nur Admin — Gelddaten).
            Die Karte bleibt AUCH ohne offene Berichte sichtbar, sonst wäre
            der Satz genau dann unerreichbar, wenn alles verrechnet ist
            (Review-Befund Runde 2). */}
        {isAdmin && (
          <Card className="kb-panel mb-4 border-amber-300 bg-amber-50">
            <CardContent className="p-3 sm:p-4 space-y-1.5">
              {offeneGesamt > 0.005 ? (
                <>
                  <p className="text-sm font-semibold text-amber-900">
                    Noch zu verrechnen: {eur(offeneGesamt)} · {offeneBerichte.length} Bericht{offeneBerichte.length === 1 ? "" : "e"}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-amber-800">
                    {offeneJeProjekt.map(([name, betrag]) => (
                      <span key={name} className="whitespace-nowrap">
                        {name}: <span className="font-medium tabular-nums">{eur(betrag)}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm font-semibold text-amber-900">Alle Regieberichte verrechnet. ✓</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-amber-700">
                <span>Regiestundensatz:</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={satzText}
                  onChange={(e) => setSatzText(e.target.value)}
                  aria-label="Regiestundensatz"
                  className="h-7 w-16 border-amber-300 bg-white px-1.5 text-right text-[11px] tabular-nums"
                />
                <span>€/h — gilt für offene Summen und den Rechnungs-Import (Material + Maschinen kommen dazu).</span>
                {parseDecimal(satzText) !== null && parseDecimal(satzText) !== regieSatz && (
                  <Button size="sm" className="h-7 px-2 text-[11px]" onClick={speichereRegieSatz} disabled={satzSpeichert}>
                    {satzSpeichert ? "Speichert…" : "Satz speichern"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sammelrechnung: Auswahl-Leiste */}
        {isAdmin && selectedIds.size > 0 && (
          <Card className="kb-panel mb-4 border-primary/40 bg-primary/5">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <span className="text-sm font-medium">
                {selectedIds.size} Bericht{selectedIds.size === 1 ? "" : "e"} ausgewählt
                {" · "}
                {eur(disturbances.filter(d => selectedIds.has(d.id)).reduce((s, d) => s + offenBetrag(d), 0))}
              </span>
              <span className="flex-1" />
              <Button size="sm" className="h-10 gap-1.5" onClick={sammelrechnungErstellen}>
                <Receipt className="h-4 w-4" />
                {selectedIds.size === 1 ? "Rechnung erstellen" : "Sammelrechnung erstellen"}
              </Button>
              <Button size="sm" variant="ghost" className="h-10" onClick={() => setSelectedIds(new Set())}>
                Auswahl aufheben
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Liste — Karten, damit es am Handy gut bedienbar bleibt */}
        {filteredDisturbances.length === 0 ? (
          <Card className="kb-panel">
            <CardContent className="py-12 text-center">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Einträge gefunden</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "alle"
                  ? "Keine Einträge entsprechen Ihren Filterkriterien"
                  : "Erstellen Sie Ihren ersten Regiebericht"}
              </p>
              {!searchQuery && statusFilter === "alle" && (
                <Button onClick={() => setShowForm(true)} variant="outline" className="h-12 text-base">
                  <Plus className="h-5 w-5 mr-2" />
                  Ersten Regiebericht erfassen
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredDisturbances.map((disturbance) => (
              <Card
                key={disturbance.id}
                className="kb-panel cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/disturbances/${disturbance.id}`)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        {/* Auswahl für die Sammelrechnung (nur Admin, nur
                            unverrechnete Berichte) */}
                        {isAdmin && !disturbance.is_verrechnet && (
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); toggleSelected(disturbance.id); }}
                          >
                            <Checkbox
                              checked={selectedIds.has(disturbance.id)}
                              aria-label={`Regiebericht ${disturbance.kunde_name} für Sammelrechnung auswählen`}
                            />
                          </span>
                        )}
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 break-words">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="min-w-0">{disturbance.kunde_name}</span>
                        </h3>
                        {isAdmin && (disturbance.profile_vorname || disturbance.profile_nachname) && (
                          <p className="text-xs text-muted-foreground">
                            Erstellt von: {disturbance.profile_vorname} {disturbance.profile_nachname}
                          </p>
                        )}
                      </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {getStatusBadge(disturbance)}
                        {disturbance.is_verrechnet && (
                          <Badge className="bg-emerald-600 text-white">Verrechnet</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 shrink-0" />
                        {format(new Date(disturbance.datum), "dd.MM.yyyy", { locale: de })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4 shrink-0" />
                        {disturbance.start_time.slice(0, 5)} - {disturbance.end_time.slice(0, 5)} ({disturbance.stunden.toFixed(1)}h)
                      </span>
                      {disturbance.project_name && (
                        <span className="flex items-center gap-1 min-w-0">
                          <Briefcase className="h-4 w-4 shrink-0" />
                          <span className="truncate">{disturbance.project_name}</span>
                        </span>
                      )}
                      {disturbance.kunde_adresse && (
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{disturbance.kunde_adresse}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-sm line-clamp-2 break-words">{disturbance.beschreibung}</p>

                    {isAdmin && disturbance.status !== "offen" && (
                      <div className="flex justify-end">
                        <Button
                          variant={disturbance.is_verrechnet ? "secondary" : "outline"}
                          size="sm"
                          className="h-10"
                          onClick={(e) => handleToggleVerrechnet(e, disturbance.id, disturbance.is_verrechnet)}
                        >
                          {disturbance.is_verrechnet ? "✓ Verrechnet" : "Verrechnen"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Disturbance Form Dialog */}
      <DisturbanceForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setPrefillProjectId(null);
        }}
        onSuccess={handleFormSuccess}
        editData={null}
        prefillProjectId={prefillProjectId}
      />
    </div>
  );
};

export default Disturbances;
