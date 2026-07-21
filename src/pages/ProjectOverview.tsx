import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileText, Camera, ImagePlus, Lock, Pencil, Check, Settings, Download, FileDown, Package, Plus } from "lucide-react";
import { getDocConfig } from "@/lib/documentTypes";
import { Separator } from "@/components/ui/separator";
import { ContactHistoryTimeline } from "@/components/ContactHistoryTimeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { countProjectFiles } from "@/lib/projectFiles";
import { istArbeitszeitZeile } from "@/lib/stunden";
import { useProjectStatuses } from "@/hooks/useProjectStatuses";
import { Badge } from "@/components/ui/badge";
import { ProjektNachkalkulation } from "@/components/project/ProjektNachkalkulation";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";

type DocumentCategory = {
  type: "plans" | "reports" | "photos" | "chef";
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  adminOnly?: boolean;
};

const ProjectOverview = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const { statuses: projectStatuses, findByName: findStatusByName } = useProjectStatuses();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", beschreibung: "",
    // Kunden-/Rechnungsadresse (gespeichert in customers)
    customer_id: null as string | null, kunde_name: "", kunde_anrede: "", kunde_titel: "",
    kunde_adresse: "", kunde_plz: "", kunde_ort: "", kunde_email: "", kunde_telefon: "", kunde_uid: "",
    // Projekt-/Leistungsort (gespeichert in projects)
    projekt_adresse: "", projekt_plz: "", projekt_ort: "",
    projekt_kontakt_name: "", projekt_kontakt_telefon: "",
  });
  const [customers, setCustomers] = useState<{ id: string; name: string; plz: string | null; ort: string | null }[]>([]);
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [regieCount, setRegieCount] = useState(0);
  // Regiestunden = EIGENER Topf (aus den Regieberichten) — zählt NICHT zu
  // den Projektstunden aus der Zeiterfassung.
  const [regieStunden, setRegieStunden] = useState(0);
  const [regiePdfs, setRegiePdfs] = useState<{id: string; datum: string; kunde_name: string; pdf_path: string}[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<{id: string; lieferant: string; rechnungsdatum: string | null; betrag_brutto: number; status: string; kategorie: string | null}[]>([]);
  const [projectData, setProjectData] = useState<any>(null);
  const [projectHours, setProjectHours] = useState<{user_id: string, name: string, total: number}[]>([]);
  // Gebuchte Stunden GESAMT (inkl. hidden User) — die sichtbare Personenliste
  // filtert hidden, die Abgleich-Zahl darf aber keine Stunden unterschlagen.
  const [gebuchtGesamt, setGebuchtGesamt] = useState(0);
  const [angebotPositionen, setAngebotPositionen] = useState<{position: number; beschreibung: string; menge: number; einheit: string; stunden?: number; stundenQuelle?: "stunden" | "kalkulation"}[]>([]);
  // Stundenabgleich: im Angebot kalkulierte Lohnstunden (Σ arbeitszeit_minuten × Menge)
  const [angeboteneStunden, setAngeboteneStunden] = useState<number | null>(null);
  const [categories, setCategories] = useState<DocumentCategory[]>([
    {
      type: "photos",
      title: "Fotos",
      description: "Baufortschritt und Dokumentationsfotos",
      icon: <Camera className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "plans",
      title: "Pläne",
      description: "Baupläne und technische Zeichnungen",
      icon: <FileText className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "chef",
      title: "🔒 Chefordner",
      description: "Vertrauliche Chef-Dokumente",
      icon: <Lock className="h-8 w-8" />,
      count: 0,
      adminOnly: true,
    },
  ]);

  useEffect(() => {
    if (projectId) {
      checkAdminStatus();
      fetchProjectName();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchFileCounts();
      fetchInvoiceCount();
      fetchAngebotPositionen();
    }
  }, [projectId, isAdmin]);

  const fetchAngebotPositionen = async () => {
    if (!projectId) return;
    // Referenz-Angebot: nicht einfach das neueste per Datum — ein abgelehntes
    // oder Entwurfs-Angebot darf das angenommene nicht verdrängen. Daher nach
    // Status priorisieren (angenommen > verrechnet > offen > entwurf),
    // innerhalb desselben Status das neueste Datum.
    const { data: angebote } = await supabase.from("invoices")
      .select("id, status, datum").eq("project_id", projectId).eq("typ", "angebot")
      .not("status", "in", '("storniert","abgelehnt")')
      // Archivierte Vorgänger-Revisionen (Original nach Preis-Update) ausschließen
      .or("archiviert.is.null,archiviert.eq.false")
      .order("datum", { ascending: false });
    const statusRang: Record<string, number> = { angenommen: 0, verrechnet: 1, offen: 2, entwurf: 3 };
    const referenz = ((angebote as any[]) || []).slice().sort((a, b) => {
      const diff = (statusRang[a.status] ?? 4) - (statusRang[b.status] ?? 4);
      if (diff !== 0) return diff;
      return String(b.datum || "").localeCompare(String(a.datum || ""));
    })[0];
    if (referenz) {
      const { data: items } = await supabase.from("invoice_items")
        .select("position, beschreibung, kurztext, menge, einheit, arbeitszeit_minuten")
        .eq("invoice_id", referenz.id).order("position");
      // Stunden-Soll = GESAMTE Arbeitszeit des Angebots:
      //   explizite Stunden-Positionen (Facharbeiterstunde × 44) PLUS die in
      //   den kalkulierten Positionen steckende Arbeitszeit (z.B. Baukran
      //   36 h/Pa). Die Aufschlüsselung unten zeigt je Position, woher die
      //   Stunden kommen.
      const zeilen = (items || []) as any[];
      const nameVon = (i: any) => (i.kurztext || i.beschreibung || "");
      setAngebotPositionen(zeilen.map(i => {
        const istStdZeile = istArbeitszeitZeile(nameVon(i), i.einheit);
        const stunden = istStdZeile
          ? Math.round((Number(i.menge) || 0) * 10) / 10
          : Math.round(((Number(i.arbeitszeit_minuten) || 0) * (Number(i.menge) || 0)) / 60 * 10) / 10;
        return {
          position: i.position, beschreibung: nameVon(i),
          menge: Number(i.menge), einheit: i.einheit || "Stk.",
          stunden,
          stundenQuelle: (istStdZeile ? "stunden" : "kalkulation") as "stunden" | "kalkulation",
        };
      }));
      const gesamt = zeilen.reduce((s, i) => {
        const istStdZeile = istArbeitszeitZeile(nameVon(i), i.einheit);
        return s + (istStdZeile
          ? (Number(i.menge) || 0)
          : ((Number(i.arbeitszeit_minuten) || 0) * (Number(i.menge) || 0)) / 60);
      }, 0);
      setAngeboteneStunden(Math.round(gesamt * 10) / 10);
    } else {
      setAngeboteneStunden(null);
    }
  };

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "administrator")
      .maybeSingle();

    setIsAdmin(!!data);

    // Fetch project hours for admins
    if (data && projectId) {
      const { data: entries } = await supabase
        .from("time_entries")
        .select("user_id, stunden")
        .eq("project_id", projectId);

      if (entries) {
        const grouped: Record<string, number> = {};
        entries.forEach((e: any) => { grouped[e.user_id] = (grouped[e.user_id] || 0) + Number(e.stunden); });

        const userIds = Object.keys(grouped);
        setGebuchtGesamt(Math.round(Object.values(grouped).reduce((s: number, v: any) => s + Number(v), 0) * 10) / 10);
        if (userIds.length > 0) {
          const { data: profiles } = await (supabase.from("profiles" as never) as any)
            .select("id, vorname, nachname, hidden").in("id", userIds);

          setProjectHours(
            userIds
              .filter((uid) => {
                const p = (profiles as any[])?.find((pr: any) => pr.id === uid);
                return !p || !p.hidden; // hidden User nicht in der Projekt-Stundenliste
              })
              .map(uid => {
                const p = (profiles as any[])?.find((pr: any) => pr.id === uid);
                return { user_id: uid, name: p ? `${p.vorname} ${p.nachname}` : "Unbekannt", total: grouped[uid] };
              }).sort((a, b) => b.total - a.total)
          );
        }
      }
    }
  };

  const openEditDialog = async () => {
    if (!projectId) return;
    // Load project
    const { data: proj } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (!proj) return;
    // Parse adresse (stored as "street, plz, city")
    const parts = (proj.adresse || "").split(",").map((s: string) => s.trim());
    // Load customer
    let kunde: any = {};
    if (proj.customer_id) {
      const { data: c } = await supabase.from("customers").select("*").eq("id", proj.customer_id).single();
      if (c) kunde = c;
    }
    // Load customer list
    const { data: custs } = await supabase.from("customers").select("id, name, plz, ort").order("name");
    setCustomers(custs || []);
    setEditForm({
      name: proj.name || "",
      beschreibung: proj.beschreibung || "",
      customer_id: proj.customer_id || null,
      // Kundenadresse (aus customers-Tabelle, für Rechnungsstellung)
      kunde_name: kunde.name || "",
      kunde_anrede: kunde.anrede || "",
      kunde_titel: kunde.titel || "",
      kunde_adresse: kunde.adresse || "",
      kunde_plz: kunde.plz || "",
      kunde_ort: kunde.ort || "",
      kunde_email: kunde.email || "",
      kunde_telefon: kunde.telefon || "",
      kunde_uid: kunde.uid_nummer || "",
      // Leistungsort / Durchführungsort (aus projects-Tabelle)
      projekt_adresse: proj.adresse || parts[0] || "",
      projekt_plz: proj.plz || parts[1] || "",
      projekt_ort: (proj as any).ort || parts[2] || "",
      projekt_kontakt_name: (proj as any).projekt_kontakt_name || "",
      projekt_kontakt_telefon: (proj as any).projekt_kontakt_telefon || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!projectId || !editForm.name.trim()) return;

    // E-Mail-Validierung wenn Kunde editiert wird
    if (editForm.kunde_email && editForm.kunde_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.kunde_email.trim())) {
      toast({ variant: "destructive", title: "Ungültige E-Mail" });
      return;
    }

    setEditSaving(true);
    // Update project — adresse/plz/ort = LEISTUNGSORT (NICHT die Kundenadresse!)
    await supabase.from("projects").update({
      name: editForm.name.trim(),
      beschreibung: editForm.beschreibung.trim() || null,
      adresse: editForm.projekt_adresse.trim() || null,
      plz: editForm.projekt_plz.trim() || null,
      ort: editForm.projekt_ort.trim() || null,
      projekt_kontakt_name: editForm.projekt_kontakt_name.trim() || null,
      projekt_kontakt_telefon: editForm.projekt_kontakt_telefon.trim() || null,
      customer_id: editForm.customer_id,
    } as any).eq("id", projectId);
    // Update or create customer
    if (editForm.customer_id && editForm.kunde_name.trim()) {
      await supabase.from("customers").update({
        name: editForm.kunde_name.trim(),
        anrede: editForm.kunde_anrede || null,
        titel: editForm.kunde_titel.trim() || null,
        adresse: editForm.kunde_adresse.trim() || null,
        plz: editForm.kunde_plz.trim() || null,
        ort: editForm.kunde_ort.trim() || null,
        email: editForm.kunde_email.trim() || null,
        telefon: editForm.kunde_telefon.trim() || null,
        uid_nummer: editForm.kunde_uid.trim() || null,
      }).eq("id", editForm.customer_id);
    } else if (!editForm.customer_id && editForm.kunde_name.trim()) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: newCust } = await supabase.from("customers").insert({
          user_id: user.id,
          name: editForm.kunde_name.trim(),
          anrede: editForm.kunde_anrede || null,
          titel: editForm.kunde_titel.trim() || null,
          adresse: editForm.kunde_adresse.trim() || null,
          plz: editForm.kunde_plz.trim() || null,
          ort: editForm.kunde_ort.trim() || null,
          email: editForm.kunde_email.trim() || null,
          telefon: editForm.kunde_telefon.trim() || null,
          uid_nummer: editForm.kunde_uid.trim() || null,
        }).select("id").single();
        if (newCust) {
          await supabase.from("projects").update({ customer_id: newCust.id }).eq("id", projectId);
        }
      }
    }
    setProjectName(editForm.name.trim());
    setEditSaving(false);
    setEditDialogOpen(false);
    toast({ title: "Projekt aktualisiert" });
  };

  const selectCustomerForEdit = (c: { id: string; name: string; plz: string | null; ort: string | null }) => {
    // Load full customer data
    supabase.from("customers").select("*").eq("id", c.id).single().then(({ data }) => {
      if (data) {
        setEditForm(f => ({
          ...f,
          customer_id: data.id,
          kunde_name: data.name,
          kunde_anrede: (data as any).anrede || "",
          kunde_titel: (data as any).titel || "",
          kunde_adresse: data.adresse || "",
          kunde_plz: data.plz || "",
          kunde_ort: data.ort || "",
          kunde_email: data.email || "",
          kunde_telefon: data.telefon || "",
          kunde_uid: data.uid_nummer || "",
        }));
      }
    });
    setCustomerPopoverOpen(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!projectId || !projectData || updatingStatus || newStatus === projectData.status) return;
    setUpdatingStatus(true);
    const { error } = await supabase
      .from("projects")
      .update({ status: newStatus })
      .eq("id", projectId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht gespeichert werden" });
    } else {
      setProjectData((prev: any) => prev ? { ...prev, status: newStatus } : prev);
      toast({ title: "Status aktualisiert", description: `${projectName} → ${newStatus}` });
    }
    setUpdatingStatus(false);
  };

  const fetchProjectName = async () => {
    if (!projectId) return;

    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (data) {
      setProjectName(data.name);
      setProjectData(data);

      // Kundendaten für Rechnungsadresse-Anzeige
      if ((data as any).customer_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("*")
          .eq("id", (data as any).customer_id)
          .maybeSingle();
        setCustomerData(cust || null);
      } else {
        setCustomerData(null);
      }
    }

    // Fetch Regie count + Regiestunden (filtered by project)
    (supabase.from("disturbances" as never) as any)
      .select("id, stunden")
      .eq("project_id", projectId)
      .then(({ data }: any) => {
        const rows = (data as any[]) || [];
        setRegieCount(rows.length);
        setRegieStunden(Math.round(rows.reduce((s: number, d: any) => s + (Number(d.stunden) || 0), 0) * 10) / 10);
      });

    // Fetch Regiebericht PDFs for this project
    (supabase.from("disturbances" as never) as any)
      .select("id, datum, kunde_name, pdf_path")
      .eq("project_id", projectId)
      .not("pdf_path", "is", null)
      .order("datum", { ascending: false })
      .then(({ data: pdfData }: any) => setRegiePdfs(pdfData || []));

    // Fetch Eingangsrechnungen for this project
    supabase.from("purchase_invoices")
      .select("id, lieferant, rechnungsdatum, betrag_brutto, status, kategorie")
      .eq("project_id", projectId)
      .order("rechnungsdatum", { ascending: false, nullsFirst: false })
      .then(({ data }) => setPurchaseInvoices(data || []));
  };

  const [projectInvoices, setProjectInvoices] = useState<{id: string; nummer: string; typ: string; datum: string; brutto_summe: number; kunde_name: string; status: string}[]>([]);

  const fetchInvoiceCount = async () => {
    if (!projectId) return;
    const { data, count } = await supabase
      .from("invoices")
      .select("id, nummer, typ, datum, brutto_summe, kunde_name, status", { count: "exact" })
      .eq("project_id", projectId)
      .order("datum", { ascending: false });
    setInvoiceCount(count || 0);
    if (data) setProjectInvoices(data);
  };

  const fetchFileCounts = async () => {
    if (!projectId) return;

    const bucketMap: Record<string, string> = {
      plans: "project-plans",
      reports: "project-reports",
      photos: "project-photos",
      chef: "project-chef",
    };

    const updatedCategories = await Promise.all(
      categories.map(async (category) => {
        // Skip chef bucket for non-admins
        if (category.type === "chef" && !isAdmin) {
          return { ...category, count: 0 };
        }
        
        const bucket = bucketMap[category.type];
        // Gleiche Filterlogik wie der Ordner (ohne Unterordner/Platzhalter),
        // damit die Zahl exakt mit dem übereinstimmt, was der Ordner zeigt.
        return {
          ...category,
          count: await countProjectFiles(projectId, bucket),
        };
      })
    );

    setCategories(updatedCategories);
  };

  const handleQuickPhotoUpload = () => {
    navigate(`/projects/${projectId}/photos`);
  };

  // Filter categories based on admin status
  const visibleCategories = categories.filter(
    (category) => !category.adminOnly || isAdmin
  );

  return (
    <div className="min-h-screen">
      {/* KingBill-Werkzeugleiste statt weißer shadcn-Kopfzeile. */}
      <KBToolbar onBack={() => navigate("/projects")} title="Projekt">
        <KBToolbarButton icon={Settings} label="Bearbeiten" onClick={openEditDialog} />
      </KBToolbar>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            {editingName ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!editNameValue.trim()) return;
                await supabase.from("projects").update({ name: editNameValue.trim() }).eq("id", projectId);
                setProjectName(editNameValue.trim());
                setEditingName(false);
                toast({ title: "Projektname geändert" });
              }} className="flex items-center gap-2 flex-1">
                <Input
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="text-2xl font-bold h-auto py-1"
                  autoFocus
                />
                <Button type="submit" size="icon" variant="ghost" className="shrink-0"><Check className="h-5 w-5 text-green-600" /></Button>
                <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => setEditingName(false)}>✕</Button>
              </form>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold">{projectName}</h1>
                {/* Stift = Schnell-Umbenennen. Das vollständige „Bearbeiten"
                    sitzt jetzt in der KBToolbar oben — nicht doppelt anbieten. */}
                <Button variant="ghost" size="icon" aria-label="Projektnamen bearbeiten" className="h-11 w-11 shrink-0" onClick={() => { setEditNameValue(projectName); setEditingName(true); }}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <p className="text-muted-foreground text-sm">Dokumentation und Dateien</p>
            {projectData && projectStatuses.length > 0 && (() => {
              const curStatus = (projectData as any).status || "";
              const sColor = findStatusByName(curStatus);
              return (
                <div className="flex items-center gap-2">
                  <Badge
                    className="border-0"
                    style={
                      sColor
                        ? { backgroundColor: sColor.farbe_bg, color: sColor.farbe_text }
                        : { backgroundColor: "#e5e7eb", color: "#374151" }
                    }
                  >
                    {curStatus || "–"}
                  </Badge>
                  {isAdmin && (
                    <Select
                      value={curStatus}
                      onValueChange={handleStatusChange}
                      disabled={updatingStatus}
                    >
                      <SelectTrigger className="h-8 w-[180px] text-xs">
                        <SelectValue placeholder="Status ändern..." />
                      </SelectTrigger>
                      <SelectContent>
                        {projectStatuses.map((s) => (
                          <SelectItem key={s.id} value={s.name}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.farbe_bg }} />
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Quick-Actions: neues Dokument mit vorbelegter project_id.
            Angebot/Rechnung nur für Admins — die Route /invoices/new ist
            feature-gated (rechnungen), Mitarbeiter liefen sonst auf "Kein Zugriff". */}
        <div className="flex flex-wrap gap-2 mb-4">
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/invoices/new?typ=angebot&project=${projectId}`)}>
              <FileText className="h-3.5 w-3.5" />Neues Angebot
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/invoices/new?typ=rechnung&project=${projectId}`)}>
              <FileDown className="h-3.5 w-3.5" />Neue Rechnung
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/disturbances?new=${projectId}`)}>
            <FileText className="h-3.5 w-3.5" />Neuer Regiebericht
          </Button>
        </div>

        {/* Projektinfos */}
        {projectData && (
          <Card className="mb-4">
            <CardContent className="p-4 space-y-2">
              {/* Leistungsort / Durchführungsort (aus projects-Tabelle) */}
              {(projectData.adresse || projectData.plz || (projectData as any).ort) && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Leistungsort:</span>{" "}
                  {[projectData.adresse, [projectData.plz, (projectData as any).ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                </div>
              )}
              {((projectData as any).projekt_kontakt_name || (projectData as any).projekt_kontakt_telefon) && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Kontakt vor Ort:</span>{" "}
                  {(projectData as any).projekt_kontakt_name || ""}
                  {(projectData as any).projekt_kontakt_telefon && (
                    <>
                      {" "}
                      <a className="text-primary underline" href={`tel:${(projectData as any).projekt_kontakt_telefon}`}>
                        {(projectData as any).projekt_kontakt_telefon}
                      </a>
                    </>
                  )}
                </div>
              )}
              {/* Rechnungsadresse (Kunde) */}
              {customerData && (customerData.adresse || customerData.plz || customerData.ort) && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Rechnungsadresse:</span>{" "}
                  {customerData.name}
                  {customerData.adresse ? `, ${customerData.adresse}` : ""}
                  {customerData.plz || customerData.ort ? `, ${[customerData.plz, customerData.ort].filter(Boolean).join(" ")}` : ""}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Nachkalkulation: Deckungsbeitrag der Baustelle (Admin only) */}
        {isAdmin && projectId && (
          <div className="mb-4">
            <ProjektNachkalkulation projectId={projectId} />
          </div>
        )}

        {/* Projektstunden + Stundenabgleich (Admin only) */}
        {isAdmin && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">⏱️ Stundenabgleich — Angebot vs. gebucht</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Stundenabgleich: Soll kommt AUTOMATISCH aus dem verknüpften
                  Angebot (Σ kalkulierte Lohnminuten × Menge je Position) —
                  drei große Zahlen + Ampel-Fortschrittsbalken. */}
              {(() => {
                const gebucht = gebuchtGesamt;
                if (angeboteneStunden === null || angeboteneStunden <= 0) {
                  return (
                    <p className="mb-4 text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2.5">
                      Kein Angebot mit kalkulierten Stunden verknüpft — sobald ein Angebot mit
                      Katalog-Positionen an diesem Projekt hängt, erscheint hier automatisch der
                      Soll/Ist-Vergleich.
                    </p>
                  );
                }
                const pctRaw = Math.round((gebucht / angeboteneStunden) * 100);
                const pct = Math.min(100, pctRaw);
                const ueber = gebucht > angeboteneStunden;
                const knapp = !ueber && pctRaw >= 80;
                const barFarbe = ueber ? "bg-destructive" : knapp ? "bg-amber-500" : "bg-green-600";
                const rest = angeboteneStunden - gebucht;
                return (
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <div className="text-xl font-bold tabular-nums">{angeboteneStunden.toFixed(1)}</div>
                        <div className="text-[11px] text-muted-foreground">Std. laut Angebot</div>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <div className={`text-xl font-bold tabular-nums ${ueber ? "text-destructive" : ""}`}>{gebucht.toFixed(1)}</div>
                        <div className="text-[11px] text-muted-foreground">Std. gebucht</div>
                      </div>
                      <div className={`rounded-lg border p-3 text-center ${ueber ? "border-destructive/50 bg-destructive/5" : knapp ? "border-amber-300 bg-amber-50" : "border-green-500/40 bg-green-50"}`}>
                        <div className={`text-xl font-bold tabular-nums ${ueber ? "text-destructive" : knapp ? "text-amber-700" : "text-green-700"}`}>
                          {ueber ? `+${(gebucht - angeboteneStunden).toFixed(1)}` : rest.toFixed(1)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{ueber ? "Std. ÜBER Angebot" : "Std. verbleibend"}</div>
                      </div>
                    </div>
                    <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barFarbe}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className={`text-xs ${ueber ? "text-destructive font-medium" : knapp ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>
                      {ueber
                        ? `⚠️ Angebotsstunden überschritten (${pctRaw}%) — Mehraufwand als Regie verrechnen oder Nachtrag stellen.`
                        : knapp
                          ? `⚠️ ${pctRaw}% der Angebotsstunden verbraucht — Reserve wird knapp.`
                          : `${pctRaw}% verbraucht.`}
                    </p>
                    {/* Aufschlüsselung: WOHER kommen die Angebotsstunden?
                        Jede Position trägt ihre einkalkulierte Arbeitszeit bei. */}
                    {angebotPositionen.some(p => (p.stunden || 0) > 0) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                          Woraus sich die {angeboteneStunden.toFixed(1)} Std. ergeben ▾
                        </summary>
                        <ul className="mt-1.5 space-y-0.5 rounded-md border bg-muted/20 p-2">
                          {angebotPositionen.filter(p => (p.stunden || 0) > 0).map(p => (
                            <li key={p.position} className="flex justify-between gap-2">
                              <span className="truncate text-muted-foreground">
                                {p.beschreibung.length > 55 ? p.beschreibung.slice(0, 55) + "…" : p.beschreibung}
                                <span className="opacity-70"> · {p.menge} {p.einheit}</span>
                                {p.stundenQuelle === "kalkulation" && (
                                  <span className="ml-1.5 text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground/80"
                                    title="Arbeitszeit aus der Kalkulation dieser Position (Std/Einheit × Menge)">
                                    aus Kalkulation
                                  </span>
                                )}
                              </span>
                              <span className="font-mono tabular-nums shrink-0">{(p.stunden || 0).toFixed(1)} h</span>
                            </li>
                          ))}
                          {(() => {
                            const std = angebotPositionen.filter(p => p.stundenQuelle === "stunden").reduce((s, p) => s + (p.stunden || 0), 0);
                            const kalk = angebotPositionen.filter(p => p.stundenQuelle === "kalkulation").reduce((s, p) => s + (p.stunden || 0), 0);
                            return (std > 0 || kalk > 0) ? (
                              <li className="flex justify-between gap-2 pt-1 mt-1 border-t border-border/50 font-medium">
                                <span className="text-muted-foreground">
                                  {std > 0 && <>Stunden-Positionen {std.toFixed(1)} h</>}
                                  {std > 0 && kalk > 0 && " · "}
                                  {kalk > 0 && <>aus Kalkulationen {kalk.toFixed(1)} h</>}
                                </span>
                                <span className="font-mono tabular-nums shrink-0">{(std + kalk).toFixed(1)} h</span>
                              </li>
                            ) : null;
                          })()}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })()}
              {projectHours.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Stunden gebucht</p>
              ) : (
                <div className="space-y-2">
                  {/* Stunden je Mitarbeiter: Balken relativ zum Spitzenreiter,
                      daneben die Zahlen (Stunden + Anteil an der Projektsumme). */}
                  <p className="text-xs font-medium text-muted-foreground">Stunden je Mitarbeiter</p>
                  {(() => {
                    const max = Math.max(...projectHours.map(h => h.total), 1);
                    const summe = projectHours.reduce((s, h) => s + h.total, 0);
                    return projectHours.map((h) => {
                      const anteil = summe > 0 ? (h.total / summe) * 100 : 0;
                      return (
                        <div key={h.user_id} className="text-sm">
                          <div className="flex justify-between gap-2 mb-0.5">
                            <span className="truncate">{h.name}</span>
                            <span className="whitespace-nowrap shrink-0">
                              <span className="font-medium tabular-nums">{h.total.toFixed(1)} Std.</span>
                              <span className="text-xs text-muted-foreground tabular-nums ml-1.5">
                                {anteil.toFixed(1).replace(".", ",")} %
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round((h.total / max) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <Separator />
                  <div className="flex justify-between gap-2 font-medium">
                    <span>Gesamt</span>
                    <span className="tabular-nums whitespace-nowrap">{projectHours.reduce((s, h) => s + h.total, 0).toFixed(1)} Std.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {visibleCategories.map((category) => (
            <Card 
              key={category.type}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/projects/${projectId}/${category.type}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Öffnen
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Materialliste: Entnahmen, Verbrauch & Rückgaben je Projekt */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/projects/${projectId}/materials`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-primary"><Package className="h-8 w-8" /></div>
              </div>
              <CardTitle className="text-xl">Materialliste</CardTitle>
              <CardDescription>Entnahmen, Verbrauch & Rückgaben</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Öffnen
              </Button>
            </CardContent>
          </Card>

          {/* Angebotspositionen — ohne Preise, für alle sichtbar */}
          {angebotPositionen.length > 0 && (
            <Card className="col-span-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Angebotspositionen ({angebotPositionen.length})
                </CardTitle>
                <CardDescription>Positionen aus dem Angebot — ohne Preise</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {angebotPositionen.map(p => (
                  <div key={p.position} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{String(p.position).padStart(2, "0")}</span>
                      <span className="truncate">{p.beschreibung}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{p.menge} {p.einheit}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Regieberichte */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/disturbances?project=${projectId}`)}>
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="h-5 w-5 text-yellow-600" />
              <div className="flex-1">
                <p className="font-medium">Regieberichte</p>
                <p className="text-xs text-muted-foreground">
                  {regieCount} Bericht{regieCount === 1 ? "" : "e"}
                  {regieStunden > 0 && <> · <b className="text-foreground">{regieStunden.toLocaleString("de-AT")} Regiestunden</b></>}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Regiebericht PDFs */}
          {regiePdfs.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="font-medium text-sm flex items-center gap-2">
                  <Download className="h-4 w-4 text-yellow-600" />
                  Regiebericht-PDFs
                </p>
                <div className="space-y-1">
                  {regiePdfs.map(pdf => (
                    <button
                      key={pdf.id}
                      className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted rounded px-2 py-1.5 transition-colors"
                      onClick={async () => {
                        const { data } = await supabase.storage.from("regiebericht-pdfs").createSignedUrl(pdf.pdf_path, 300);
                        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                      }}
                    >
                      <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="truncate">{pdf.kunde_name} - {new Date(pdf.datum).toLocaleDateString("de-AT")}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Eingangsrechnungen — nur Admin */}
          {isAdmin && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileDown className="h-5 w-5 text-purple-600" />
                    Eingangsrechnungen
                    {purchaseInvoices.length > 0 && (
                      <span className="text-xs text-muted-foreground font-normal">
                        · € {purchaseInvoices.reduce((s, i) => s + Number(i.betrag_brutto), 0).toFixed(2)}
                      </span>
                    )}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/eingangsrechnungen?project=${projectId}`)}>
                    {purchaseInvoices.length === 0 ? "Hinzufügen" : "Verwalten"}
                  </Button>
                </div>
              </CardHeader>
              {purchaseInvoices.length > 0 && (
                <CardContent className="space-y-1">
                  {purchaseInvoices.slice(0, 5).map(inv => (
                    <button
                      key={inv.id}
                      className="flex items-center gap-3 text-sm w-full text-left hover:bg-muted rounded px-2 py-2 transition-colors"
                      onClick={() => navigate(`/eingangsrechnungen?project=${projectId}`)}
                    >
                      <FileDown className="h-4 w-4 shrink-0 text-purple-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{inv.lieferant}</span>
                          {inv.status === "bezahlt" && <span className="text-[10px] text-green-600">✓ bezahlt</span>}
                          {inv.status === "offen" && <span className="text-[10px] text-orange-600">offen</span>}
                        </div>
                        {inv.rechnungsdatum && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(inv.rechnungsdatum).toLocaleDateString("de-AT")}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap">€ {Number(inv.betrag_brutto).toFixed(2)}</span>
                    </button>
                  ))}
                  {purchaseInvoices.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      +{purchaseInvoices.length - 5} weitere
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Angebote & Rechnungen — Liste mit PDF-Links */}
          {isAdmin && projectInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Angebote & Rechnungen
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/invoices?project=${projectId}`)}>
                    Alle anzeigen
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {projectInvoices.map(inv => {
                  const cfg = getDocConfig(inv.typ);
                  const iconColor = cfg.isAngebotLike ? "text-blue-500"
                    : cfg.typ === "lieferschein" ? "text-orange-500"
                    : cfg.typ === "gutschrift" ? "text-purple-500"
                    : "text-green-600";
                  return (
                    <button
                      key={inv.id}
                      className="flex items-center gap-3 text-sm w-full text-left hover:bg-muted rounded px-2 py-2 transition-colors"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <FileText className={`h-4 w-4 shrink-0 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{inv.nummer}</span>
                          <span className="text-xs text-muted-foreground">{cfg.label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {inv.kunde_name} · {new Date(inv.datum).toLocaleDateString("de-AT")}
                        </div>
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap">€ {Number(inv.brutto_summe).toFixed(2)}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
          {isAdmin && projectInvoices.length === 0 && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/invoices?project=${projectId}`)}>
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Angebote & Rechnungen</p>
                  <p className="text-xs text-muted-foreground">Keine zugeordneten Dokumente</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Floating Action Button für Fotos */}
        {/* Kontakthistorie */}
        {projectId && (
          <div className="mt-6">
            <ContactHistoryTimeline projectId={projectId} />
          </div>
        )}

        <Button
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={handleQuickPhotoUpload}
        >
          <ImagePlus className="h-6 w-6" />
        </Button>
      </main>

      {/* Projekt bearbeiten Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Projekt bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Projektname *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={editForm.beschreibung} onChange={(e) => setEditForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} />
            </div>


            {/* Leistungsort / Durchführungsort */}
            <div className="border-t pt-4">
              <div className="flex items-start justify-between mb-1">
                <Label className="text-base font-semibold block">Leistungsort / Durchführungsort</Label>
                {editForm.customer_id && (editForm.kunde_adresse || editForm.kunde_plz || editForm.kunde_ort) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditForm(f => ({
                      ...f,
                      projekt_adresse: f.kunde_adresse,
                      projekt_plz: f.kunde_plz,
                      projekt_ort: f.kunde_ort,
                      projekt_kontakt_name: f.projekt_kontakt_name || (f.kunde_name || ""),
                      projekt_kontakt_telefon: f.projekt_kontakt_telefon || (f.kunde_telefon || ""),
                    }))}
                  >
                    Kundenadresse übernehmen
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Adresse, wo die Arbeiten tatsächlich durchgeführt werden. Kann von der Kundenadresse abweichen.
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Straße + Hausnr.</Label>
                  <Input
                    value={editForm.projekt_adresse}
                    onChange={(e) => setEditForm(f => ({ ...f, projekt_adresse: e.target.value }))}
                    placeholder="z.B. Hinterleitenweg 19"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">PLZ</Label>
                    <Input
                      value={editForm.projekt_plz}
                      onChange={(e) => setEditForm(f => ({ ...f, projekt_plz: e.target.value }))}
                      placeholder="2733"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Ort</Label>
                    <Input
                      value={editForm.projekt_ort}
                      onChange={(e) => setEditForm(f => ({ ...f, projekt_ort: e.target.value }))}
                      placeholder="z.B. Schrattenbach"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <Label className="text-xs">Kontakt vor Ort</Label>
                    <Input
                      value={editForm.projekt_kontakt_name}
                      onChange={(e) => setEditForm(f => ({ ...f, projekt_kontakt_name: e.target.value }))}
                      placeholder="z.B. Frau Müller"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefon</Label>
                    <Input
                      type="tel"
                      value={editForm.projekt_kontakt_telefon}
                      onChange={(e) => setEditForm(f => ({ ...f, projekt_kontakt_telefon: e.target.value }))}
                      placeholder="+43 664 ..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Kunde */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Kunde</Label>
                {editForm.customer_id && <span className="text-xs text-green-600 font-medium">Verknüpft</span>}
              </div>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 mb-3">
                    <Pencil className="w-4 h-4" />
                    {editForm.kunde_name || "Kunde auswählen..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(350px,calc(100vw-2.5rem))] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Kunde suchen..." />
                    <CommandList>
                      {/*
                        „+ Neuer Kunde" IMMER als erster Eintrag ganz oben —
                        gleiches Verhalten wie in CustomerSelect. Setzt die
                        Verknüpfung zurück, damit die Felder darunter frisch
                        ausgefüllt werden können.
                      */}
                      <CommandGroup forceMount>
                        <CommandItem
                          forceMount
                          value="__neuer_kunde__"
                          onSelect={() => {
                            setCustomerPopoverOpen(false);
                            setEditForm(f => ({
                              ...f,
                              customer_id: null,
                              kunde_name: "", kunde_anrede: "", kunde_titel: "",
                              kunde_adresse: "", kunde_plz: "", kunde_ort: "",
                              kunde_email: "", kunde_telefon: "", kunde_uid: "",
                            }));
                          }}
                          className="font-medium text-primary aria-selected:text-primary"
                        >
                          <Plus className="w-4 h-4 mr-2 shrink-0" />
                          Neuer Kunde
                        </CommandItem>
                      </CommandGroup>
                      <CommandEmpty>Kein Kunde gefunden</CommandEmpty>
                      <CommandGroup>
                        {customers.map(c => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => selectCustomerForEdit(c)}>
                            <div>
                              <p className="font-medium text-sm">{c.name}</p>
                              {c.ort && <p className="text-xs text-muted-foreground">{c.plz} {c.ort}</p>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {editForm.customer_id && (
                <button className="text-xs text-muted-foreground underline mb-3" onClick={() => setEditForm(f => ({ ...f, customer_id: null, kunde_name: "", kunde_anrede: "", kunde_titel: "", kunde_adresse: "", kunde_plz: "", kunde_ort: "", kunde_email: "", kunde_telefon: "", kunde_uid: "" }))}>
                  Verknüpfung lösen
                </button>
              )}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Anrede</Label>
                    <Select value={editForm.kunde_anrede || "none"} onValueChange={(v) => setEditForm(f => ({ ...f, kunde_anrede: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="Herr">Herr</SelectItem>
                        <SelectItem value="Frau">Frau</SelectItem>
                        <SelectItem value="Firma">Firma</SelectItem>
                        <SelectItem value="Familie">Familie</SelectItem>
                        <SelectItem value="Divers">Divers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Titel</Label>
                    <Input value={editForm.kunde_titel} onChange={(e) => setEditForm(f => ({ ...f, kunde_titel: e.target.value }))} placeholder="Mag., Dr." />
                  </div>
                  <div>
                    <Label>Firma / Name</Label>
                    <Input value={editForm.kunde_name} onChange={(e) => setEditForm(f => ({ ...f, kunde_name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Adresse</Label>
                  <Input value={editForm.kunde_adresse} onChange={(e) => setEditForm(f => ({ ...f, kunde_adresse: e.target.value }))} placeholder="Straße + Hausnr." />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={editForm.kunde_plz} onChange={(e) => setEditForm(f => ({ ...f, kunde_plz: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label>Ort</Label>
                    <Input value={editForm.kunde_ort} onChange={(e) => setEditForm(f => ({ ...f, kunde_ort: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>E-Mail</Label>
                    <Input value={editForm.kunde_email} onChange={(e) => setEditForm(f => ({ ...f, kunde_email: e.target.value }))} type="email" />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={editForm.kunde_telefon} onChange={(e) => setEditForm(f => ({ ...f, kunde_telefon: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={editForm.kunde_uid} onChange={(e) => setEditForm(f => ({ ...f, kunde_uid: e.target.value }))} placeholder="ATU..." />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editForm.name.trim()}>
              {editSaving ? "Speichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectOverview;
