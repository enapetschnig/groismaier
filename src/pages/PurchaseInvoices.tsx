import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { Upload, FileText, Image as ImageIcon, Search, Trash2, Calendar, Building2, CheckCircle2, Clock as ClockIcon, XCircle, Camera, Receipt, Lock, Pencil, Inbox, EyeOff, Loader2, Mail
} from "lucide-react";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PurchaseInvoiceUploadDialog } from "@/components/PurchaseInvoiceUploadDialog";
import { PurchaseInvoiceDetailDialog } from "@/components/PurchaseInvoiceDetailDialog";
import { heuteISO } from "@/lib/datum";

type PurchaseInvoice = {
  id: string;
  project_id: string | null;
  lieferant: string;
  rechnungsnummer: string | null;
  rechnungsdatum: string | null;
  faellig_am: string | null;
  bezahlt_am: string | null;
  betrag_brutto: number;
  betrag_netto: number | null;
  ust_satz: number | null;
  kategorie: string | null;
  status: string | null;
  pdf_path: string | null;
  mime_type: string | null;
  file_name: string | null;
  notizen: string | null;
  created_at: string;
  projects?: { name: string } | null;
  verrechnet_am?: string | null;
  verrechnet_in_invoice_id?: string | null;
  beleg_locked?: boolean | null;
};

// Österreichische Geldformatierung (1.047,60) — wie im Rest der App.
const eur = (n: number) => `€ ${(Number(n) || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FALLBACK_LABELS: Record<string, string> = {
  material: "Material",
  verbrauchsmaterial: "Verbrauchsmaterial",
  fremdleistung: "Fremdleistung",
  werkzeug: "Werkzeug",
  werkstatt: "Werkstatt",
  miete: "Miete/Leasing",
  treibstoff: "Treibstoff",
  geschaeftsessen: "Geschäftsessen",
  buero: "Büro",
  fortbildung: "Fortbildung",
  versicherung: "Versicherung",
  reise: "Reise",
  sonstiges: "Sonstiges",
};

export default function PurchaseInvoices() {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const { toast } = useToast();
  const { isAdmin } = usePermissions();
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get("project");

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [cameraFile, setCameraFile] = useState<File | null>(null);

  // ── Beleg-Vorschläge aus dem Mail-Postfach (buchhaltung@/office@) ──
  type MailVorschlag = { id: string; postfach: string; betreff: string; von: string; vonAdresse: string; empfangen: string; vorschau: string };
  const [mailVorschlaege, setMailVorschlaege] = useState<MailVorschlag[]>([]);
  const [mailVorschlaegeLaedt, setMailVorschlaegeLaedt] = useState(false);
  const [mailDateien, setMailDateien] = useState<File[]>([]);
  const [mailNotiz, setMailNotiz] = useState("");
  const [mailUebernahme, setMailUebernahme] = useState<string | null>(null); // Mail-ID in Arbeit
  const aktiveMail = useRef<MailVorschlag | null>(null);

  const mailRufe = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("mail-postfach", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const ladeMailVorschlaege = useCallback(async () => {
    if (!isAdmin) return;
    setMailVorschlaegeLaedt(true);
    try {
      const d = await mailRufe({ aktion: "vorschlaege", postfach: "buchhaltung@cg-holzbau.at" });
      setMailVorschlaege(d.vorschlaege || []);
    } catch {
      setMailVorschlaege([]); // Postfach nicht erreichbar → Panel bleibt einfach leer
    } finally {
      setMailVorschlaegeLaedt(false);
    }
  }, [isAdmin, mailRufe]);

  useEffect(() => { ladeMailVorschlaege(); }, [ladeMailVorschlaege]);

  /** Ein-Klick-Übernahme: Anhänge der Mail holen → bekannter KI-Scan-Dialog. */
  const mailUebernehmen = async (v: MailVorschlag) => {
    setMailUebernahme(v.id);
    try {
      const det = await mailRufe({ aktion: "detail", postfach: v.postfach, id: v.id });
      const passend = (det.anhaenge || []).filter((a: { typ?: string; name?: string }) =>
        /pdf|image\//i.test(a.typ || "") || /\.(pdf|jpe?g|png|heic)$/i.test(a.name || ""));
      if (passend.length === 0) {
        toast({ title: "Kein passender Anhang", description: "Diese Mail hat keine PDF- oder Foto-Anhänge.", variant: "destructive" });
        return;
      }
      const dateien: File[] = [];
      for (const a of passend) {
        const inhalt = await mailRufe({ aktion: "anhang", postfach: v.postfach, id: v.id, anhangId: a.id });
        if (inhalt.inhaltBase64) {
          const bytes = Uint8Array.from(atob(inhalt.inhaltBase64), (c) => c.charCodeAt(0));
          dateien.push(new File([bytes], inhalt.name || "anhang", { type: inhalt.typ || "application/octet-stream" }));
        }
      }
      if (dateien.length === 0) throw new Error("Anhänge konnten nicht geladen werden");
      aktiveMail.current = v;
      setMailDateien(dateien);
      setMailNotiz(`Aus E-Mail: ${v.von} <${v.vonAdresse}> — „${v.betreff}" (${new Date(v.empfangen).toLocaleDateString("de-AT")})`);
      setCameraFile(null);
      setUploadOpen(true);
    } catch (e) {
      toast({ title: "Übernahme fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMailUebernahme(null);
    }
  };

  const mailAusblenden = async (v: MailVorschlag) => {
    setMailVorschlaege((alt2) => alt2.filter((x) => x.id !== v.id));
    try {
      await mailRufe({ aktion: "verarbeitet", postfach: v.postfach, id: v.id, mailAktion: "ausgeblendet" });
    } catch {
      /* schlimmstenfalls taucht er beim nächsten Laden wieder auf */
    }
  };
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [kategorieFilter, setKategorieFilter] = useState("alle");
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(projectFilter || "alle");
  const [kategorieLabels, setKategorieLabels] = useState<Record<string, string>>(FALLBACK_LABELS);

  useEffect(() => { loadData(); }, [selectedProject]);

  useEffect(() => {
    // Erweiterbare Kategorien aus admin_config_options laden
    (supabase.from("admin_config_options" as never) as any)
      .select("wert, label, sort_order")
      .eq("kategorie", "eingangsrechnung_kategorie")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          const map: Record<string, string> = {};
          data.forEach((r: any) => { map[r.wert] = r.label; });
          setKategorieLabels(map);
        }
      });
  }, []);

  const loadData = async () => {
    setLoading(true);
    let q = supabase
      .from("purchase_invoices")
      .select("*, projects(name)")
      .order("rechnungsdatum", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (selectedProject !== "alle") {
      q = q.eq("project_id", selectedProject);
    }

    const { data, error } = await q;
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else if (data) {
      setInvoices(data as PurchaseInvoice[]);
    }

    // Load projects for filter
    const { data: projs } = await supabase.from("projects").select("id, name").order("name");
    if (projs) setProjectOptions(projs);

    setLoading(false);
  };

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter === "verrechnet") {
        if (!inv.verrechnet_am) return false;
      } else if (statusFilter !== "alle") {
        if (inv.status !== statusFilter) return false;
      }
      if (kategorieFilter !== "alle" && inv.kategorie !== kategorieFilter) return false;
      if (search) {
        const match =
          matchesSearch(inv.lieferant, search) ||
          matchesSearch(inv.rechnungsnummer, search) ||
          matchesSearch(inv.projects?.name, search) ||
          matchesSearch(inv.notizen, search);
        if (!match) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter, kategorieFilter]);

  const stats = useMemo(() => {
    const offen = filtered.filter(i => i.status === "offen" && !i.verrechnet_am);
    const bezahlt = filtered.filter(i => i.status === "bezahlt");
    const verrechnet = filtered.filter(i => i.verrechnet_am);
    const offenSumme = offen.reduce((s, i) => s + Number(i.betrag_brutto), 0);
    const bezahltSumme = bezahlt.reduce((s, i) => s + Number(i.betrag_brutto), 0);
    const verrechnetSumme = verrechnet.reduce((s, i) => s + Number(i.betrag_brutto), 0);
    const gesamt = filtered.reduce((s, i) => s + Number(i.betrag_brutto), 0);
    return {
      offen: offen.length,
      bezahlt: bezahlt.length,
      verrechnet: verrechnet.length,
      offenSumme,
      bezahltSumme,
      verrechnetSumme,
      gesamt,
      count: filtered.length,
    };
  }, [filtered]);

  const openFile = async (inv: PurchaseInvoice) => {
    if (!inv.pdf_path) return;
    const { data } = await supabase.storage.from("purchase-invoices").createSignedUrl(inv.pdf_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const inv = invoices.find(i => i.id === deleteId);
    if (!inv) { setDeleteId(null); return; }
    // Guard: verrechnete Belege dürfen nie gelöscht werden — dafür zuerst
    // "Verrechnung aufheben" im Detail-Dialog (Admin) nötig.
    if (inv.verrechnet_am) {
      toast({
        variant: "destructive",
        title: "Verrechneter Beleg",
        description: "Hebe die Verrechnung auf, bevor du den Beleg löschst.",
      });
      setDeleteId(null);
      return;
    }
    if (inv.pdf_path) {
      await supabase.storage.from("purchase-invoices").remove([inv.pdf_path]);
    }
    const { error } = await supabase.from("purchase_invoices").delete().eq("id", deleteId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gelöscht" });
      loadData();
    }
    setDeleteId(null);
  };

  const toggleBezahlt = async (inv: PurchaseInvoice) => {
    const nowBezahlt = inv.status !== "bezahlt";
    await supabase.from("purchase_invoices").update({
      status: nowBezahlt ? "bezahlt" : "offen",
      bezahlt_am: nowBezahlt ? heuteISO() : null,
    }).eq("id", inv.id);
    loadData();
  };

  const statusBadge = (inv: PurchaseInvoice) => {
    const status = inv.status;
    const nodes: React.ReactNode[] = [];
    if (status === "bezahlt") nodes.push(<Badge key="bez" className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Bezahlt</Badge>);
    else if (status === "abgelehnt") nodes.push(<Badge key="ab" variant="destructive"><XCircle className="h-3 w-3 mr-1" />Abgelehnt</Badge>);
    else nodes.push(<Badge key="of" variant="outline" className="text-orange-700 border-orange-300"><ClockIcon className="h-3 w-3 mr-1" />Offen</Badge>);
    if (inv.verrechnet_am) {
      nodes.push(<Badge key="ver" className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Receipt className="h-3 w-3 mr-1" />Verrechnet</Badge>);
    }
    return <>{nodes}</>;
  };

  return (
    <div className="min-h-screen kb-page">
      <KBToolbar onBack={zurueck} title="Eingangsrechnungen & Belege">
        {/* Am Handy stehen die beiden Aktionen als große Buttons im Inhalt
            (sonst sprengen sie die schmale Toolbar). */}
        <KBToolbarButton
          icon={Camera}
          label="Foto aufnehmen"
          variant="blue"
          className="hidden sm:inline-flex"
          title="Rechnung mit der Handy-Kamera fotografieren"
          onClick={() => cameraInputRef.current?.click()}
        />
        <KBToolbarButton
          icon={Upload}
          label="Hochladen"
          className="hidden sm:inline-flex"
          onClick={() => { setCameraFile(null); setUploadOpen(true); }}
        />
      </KBToolbar>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="camera-input-list"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setCameraFile(f);
            setUploadOpen(true);
          }
          // reset so same file can be selected again
          if (cameraInputRef.current) cameraInputRef.current.value = "";
        }}
      />

      <main className="mx-auto w-full max-w-6xl px-3 sm:px-4 py-4 space-y-4">
        {/* Handy-Schnellaktionen: das Wichtigste am Bau — Beleg abfotografieren */}
        <div className="sm:hidden grid grid-cols-1 gap-2">
          <Button
            onClick={() => cameraInputRef.current?.click()}
            className="w-full h-14 gap-2 text-base font-semibold"
          >
            <Camera className="h-6 w-6" />
            Rechnung fotografieren
          </Button>
          <Button
            variant="outline"
            onClick={() => { setCameraFile(null); setUploadOpen(true); }}
            className="w-full h-12 gap-2 text-sm font-semibold"
          >
            <Upload className="h-4 w-4" />
            Datei hochladen (PDF/Foto)
          </Button>
        </div>
        {/* Beleg-Vorschläge aus dem Mail-Postfach — so einfach wie möglich:
            Mail sehen → „Übernehmen" → KI-Scan läuft wie beim Foto-Upload. */}
        {isAdmin && (mailVorschlaege.length > 0 || mailVorschlaegeLaedt) && (
          <div className="kb-panel overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-[hsl(210_60%_96%)] px-3 py-2">
              <Inbox className="h-4 w-4 text-kb-blue" />
              <span className="text-sm font-bold text-kb-blue-dark">Aus dem Postfach</span>
              <span className="text-xs text-muted-foreground">
                {mailVorschlaegeLaedt ? "prüfe buchhaltung@ und office@ …" : `${mailVorschlaege.length} Mail(s) mit Anhang — vermutlich Rechnungen`}
              </span>
            </div>
            <div className="divide-y">
              {mailVorschlaege.map((v) => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{v.von} <span className="font-normal text-muted-foreground">— {v.betreff}</span></div>
                    <div className="truncate text-xs text-muted-foreground">
                      {new Date(v.empfangen).toLocaleDateString("de-AT")} · {v.postfach.startsWith("buchhaltung") ? "Buchhaltung" : "Office"}
                    </div>
                  </div>
                  <Button size="sm" disabled={mailUebernahme === v.id} onClick={() => mailUebernehmen(v)}>
                    {mailUebernahme === v.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    Übernehmen
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Ausblenden (keine Rechnung)" onClick={() => mailAusblenden(v)}>
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Gesamt</p>
              <p className="text-xl font-bold">{stats.count}</p>
              <p className="text-xs text-muted-foreground">{eur(stats.gesamt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Offen</p>
              <p className="text-xl font-bold text-orange-600">{stats.offen}</p>
              <p className="text-xs text-orange-600">{eur(stats.offenSumme)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Bezahlt</p>
              <p className="text-xl font-bold text-green-600">{stats.bezahlt}</p>
              <p className="text-xs text-green-600">{eur(stats.bezahltSumme)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Verrechnet</p>
              <p className="text-xl font-bold text-blue-600">{stats.verrechnet}</p>
              <p className="text-xs text-blue-600">{eur(stats.verrechnetSumme)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Lieferant, Nummer, Notiz..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-11"
              />
            </div>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Projekt" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Projekte</SelectItem>
                {projectOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="bezahlt">Bezahlt</SelectItem>
                <SelectItem value="verrechnet">Verrechnet</SelectItem>
                <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kategorieFilter} onValueChange={setKategorieFilter}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Kategorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Kategorien</SelectItem>
                {Object.entries(kategorieLabels).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* List */}
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Lade...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground mb-3">
                {invoices.length === 0 ? "Noch keine Eingangsrechnungen hochgeladen" : "Keine Rechnungen gefunden"}
              </p>
              {invoices.length === 0 && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
                  <Button onClick={() => cameraInputRef.current?.click()} className="h-12 gap-2">
                    <Camera className="h-5 w-5" /> Rechnung fotografieren
                  </Button>
                  <Button variant="outline" onClick={() => { setCameraFile(null); setUploadOpen(true); }} className="h-12 gap-2">
                    <Upload className="h-4 w-4" /> Datei hochladen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => (
              <Card key={inv.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <button
                      onClick={() => openFile(inv)}
                      className="shrink-0 w-11 h-11 rounded-md bg-muted flex items-center justify-center hover:bg-primary/10 transition-colors"
                      title="Datei öffnen"
                      aria-label="Beleg öffnen"
                    >
                      {inv.mime_type === "application/pdf"
                        ? <FileText className="h-6 w-6 text-red-500" />
                        : <ImageIcon className="h-6 w-6 text-blue-500" />
                      }
                    </button>

                    {/* Main info */}
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setEditId(inv.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold break-words">{inv.lieferant}</span>
                        {inv.rechnungsnummer && (
                          <span className="text-xs text-muted-foreground">#{inv.rechnungsnummer}</span>
                        )}
                        {statusBadge(inv)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {inv.rechnungsdatum && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(inv.rechnungsdatum).toLocaleDateString("de-AT")}
                          </span>
                        )}
                        {inv.kategorie && (
                          <Badge variant="outline" className="text-[10px] py-0 h-4">
                            {kategorieLabels[inv.kategorie] || inv.kategorie}
                          </Badge>
                        )}
                        {inv.projects && (
                          <span className="flex items-center gap-1 min-w-0">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{inv.projects.name}</span>
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Amount */}
                    <div className="shrink-0 text-right">
                      <p className="font-semibold whitespace-nowrap tabular-nums">
                        {eur(Number(inv.betrag_brutto))}
                      </p>
                      {inv.betrag_netto !== null && (
                        <p className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">
                          netto {eur(Number(inv.betrag_netto))}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Aktionen — am Handy mit Beschriftung + 44px Touch-Ziel */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 gap-1.5 text-xs"
                      onClick={() => setEditId(inv.id)}
                    >
                      <Pencil className="h-4 w-4" /> Bearbeiten
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 gap-1.5 text-xs"
                      onClick={() => toggleBezahlt(inv)}
                      title={inv.status === "bezahlt" ? "Als offen markieren" : "Als bezahlt markieren"}
                    >
                      <CheckCircle2 className={`h-4 w-4 ${inv.status === "bezahlt" ? "text-green-600" : "text-muted-foreground"}`} />
                      {inv.status === "bezahlt" ? "Bezahlt" : "Als bezahlt"}
                    </Button>
                    <div className="ml-auto flex items-center gap-2">
                      {inv.verrechnet_am ? (
                        <span
                          className="flex h-11 items-center gap-1.5 px-2 text-xs text-muted-foreground/80"
                          title="Verrechneter Beleg — löschen nicht möglich"
                        >
                          <Lock className="h-4 w-4" /> gesperrt
                        </span>
                      ) : isAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-11 gap-1.5 text-xs text-destructive"
                          onClick={() => setDeleteId(inv.id)}
                        >
                          <Trash2 className="h-4 w-4" /> Löschen
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Upload */}
      <PurchaseInvoiceUploadDialog
        open={uploadOpen}
        onOpenChange={(o) => {
          setUploadOpen(o);
          if (!o) { setCameraFile(null); setMailDateien([]); aktiveMail.current = null; }
        }}
        onUploaded={() => {
          loadData();
          // Kam der Beleg aus einer Mail: abhaken, damit der Vorschlag verschwindet.
          const v = aktiveMail.current;
          if (v) {
            aktiveMail.current = null;
            mailRufe({ aktion: "verarbeitet", postfach: v.postfach, id: v.id, mailAktion: "uebernommen" })
              .then(ladeMailVorschlaege)
              .catch(() => {});
          }
        }}
        prefillProjectId={projectFilter}
        initialFile={cameraFile}
        initialFiles={mailDateien.length > 0 ? mailDateien : undefined}
        prefillNotiz={mailNotiz || undefined}
      />

      {/* Edit detail */}
      <PurchaseInvoiceDetailDialog
        invoiceId={editId}
        onClose={() => setEditId(null)}
        onUpdated={loadData}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Datei und alle Daten werden unwiederbringlich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
