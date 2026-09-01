import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { baueRegieberichtPdf } from "@/lib/regieberichtPdf";
import { useZurueck } from "@/hooks/useZurueck";
import {
  Zap, Calendar, Clock, User, Mail, Phone, MapPin, Edit, Trash2, Plus, PenLine,
  Users, Receipt, Lock, Unlock, CheckCircle2, FileDown, Loader2, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DisturbanceForm } from "@/components/DisturbanceForm";
import { DisturbanceMaterials } from "@/components/DisturbanceMaterials";
import { DisturbanceMaschinen } from "@/components/DisturbanceMaschinen";
import { parseDecimal } from "@/lib/num";
import { DisturbancePhotos } from "@/components/DisturbancePhotos";
import { SignatureDialog } from "@/components/SignatureDialog";

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
  kunde_plz: string | null;
  kunde_ort: string | null;
  kunde_telefon: string | null;
  beschreibung: string;
  notizen: string | null;
  status: string;
  is_verrechnet: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  project_id: string | null;
  customer_id: string | null;
  pdf_path: string | null;
  unterschrift_kunde: string | null;
  unterschrift_am: string | null;
  profile_vorname?: string;
  profile_nachname?: string;
};

type Worker = {
  user_id: string;
  is_main: boolean;
  vorname: string;
  nachname: string;
};

/** Fachlicher Status-Ablauf: offen (Entwurf) → gesendet (unterschrieben) → abgeschlossen. */
const STATUS_ABGESCHLOSSEN = "abgeschlossen";

const DisturbanceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const zurueck = useZurueck("/disturbances");
  const { toast } = useToast();
  const [disturbance, setDisturbance] = useState<Disturbance | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  /** Zwingt die Maschinen-Karte nach dem Bearbeiten zum Neuladen. */
  const [maschinenReload, setMaschinenReload] = useState(0);
  /** Beleg, der diesen Bericht verrechnet hat (disturbances.verrechnet_in_invoice_id). */
  const [verrechnetBeleg, setVerrechnetBeleg] = useState<{ id: string; nummer: string } | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [autoOpenSignatureHandled, setAutoOpenSignatureHandled] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    checkAuthAndFetch();
  }, [id]);

  const checkAuthAndFetch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    setCurrentUserId(session.user.id);

    // Check if admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    setIsAdmin(roleData?.role === "administrator");
    fetchDisturbance();
  };

  /** Lädt den Bericht neu und liefert den frischen Datensatz zurück. */
  const fetchDisturbance = async (): Promise<Disturbance | null> => {
    if (!id) return null;

    setLoading(true);
    const { data, error } = await supabase
      .from("disturbances")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Regiebericht konnte nicht geladen werden",
      });
      navigate("/disturbances");
      setLoading(false);
      return null;
    } else {
      // Fetch profile name
      const { data: profile } = await supabase
        .from("profiles")
        .select("vorname, nachname")
        .eq("id", data.user_id)
        .single();

      setDisturbance({
        ...(data as any),
        profile_vorname: profile?.vorname || "",
        profile_nachname: profile?.nachname || "",
      });

      // Projektname (für den Hinweis „liegt im Projektordner")
      if ((data as any).project_id) {
        const { data: proj } = await supabase
          .from("projects")
          .select("name")
          .eq("id", (data as any).project_id)
          .single();
        setProjectName(proj?.name || null);
      } else {
        setProjectName(null);
      }

      // Fetch workers
      const { data: workersData } = await supabase
        .from("disturbance_workers")
        .select("user_id, is_main")
        .eq("disturbance_id", id);

      if (workersData && workersData.length > 0) {
        const workerIds = workersData.map(w => w.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, vorname, nachname")
          .in("id", workerIds);

        const workersWithNames: Worker[] = workersData.map(w => {
          const profile = profiles?.find(p => p.id === w.user_id);
          return {
            user_id: w.user_id,
            is_main: w.is_main,
            vorname: profile?.vorname || "",
            nachname: profile?.nachname || "",
          };
        });
        setWorkers(workersWithNames);
      } else {
        setWorkers([]);
      }

      // Legacy-Deeplink (?openSignature=true) weiterhin unterstützen — das
      // Formular selbst öffnet den Dialog aber NICHT mehr automatisch.
      if (searchParams.get('openSignature') === 'true' && !autoOpenSignatureHandled) {
        setAutoOpenSignatureHandled(true);
        searchParams.delete('openSignature');
        setSearchParams(searchParams, { replace: true });
        if (data.status === 'offen') {
          setShowSignatureDialog(true);
        }
      }
      setLoading(false);
      return data as any as Disturbance;
    }
  };

  const handleDelete = async () => {
    if (!disturbance) return;

    setDeleting(true);

    // Delete the disturbance (materials will cascade)
    const { error } = await supabase
      .from("disturbances")
      .delete()
      .eq("id", disturbance.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Regiebericht konnte nicht gelöscht werden",
      });
    } else {
      toast({
        title: "Erfolg",
        description: "Regiebericht wurde gelöscht",
      });
      navigate("/disturbances");
    }
    setDeleting(false);
  };

  const handleEditSuccess = () => {
    setShowEditForm(false);
    fetchDisturbance();
    // Maschinen werden im Bearbeiten-Dialog gepflegt — die read-only-Karte
    // unten muss danach neu laden, sonst zeigt sie den alten Stand bis F5.
    setMaschinenReload((n) => n + 1);
  };

  const handleSignatureSuccess = async () => {
    setShowSignatureDialog(false);
    // Erst die Maske aktualisieren (schnell), danach das PDF im Hintergrund
    // ablegen — sonst starrt der Monteur sekundenlang auf veraltete Daten.
    const fresh = await fetchDisturbance();
    if (fresh) {
      setPdfBusy(true);
      await storeReportPdf(fresh, { silent: true });
      setPdfBusy(false);
      fetchDisturbance();
    }
  };

  // ---------------------------------------------------------------------------
  // PDF: Regiebericht als PDF erzeugen und im PROJEKTORDNER ablegen
  // (project-reports/<project_id>/regieberichte/…) — gleiches Muster wie
  // Rechnungen/Angebote in InvoiceDetail.tsx. Zusätzlich in regiebericht-pdfs/,
  // damit die Projektübersicht (pdf_path) den Bericht direkt öffnen kann.
  // ---------------------------------------------------------------------------
  // Der PDF-Aufbau liegt jetzt in src/lib/regieberichtPdf.ts — dieselbe
  // Quelle nutzen die Regiebericht-Liste (Sammeldruck) und der
  // Rechnungsversand (Kundenwunsch 01.09.2026).
  const buildReportPdfBlob = (d: Disturbance): Promise<Blob> =>
    baueRegieberichtPdf(d as any, workers as any);

  /** Erzeugt das PDF und legt es im Projektordner + PDF-Bucket ab. */
  const storeReportPdf = async (
    d: Disturbance,
    opts?: { silent?: boolean },
  ): Promise<string | null> => {
    try {
      const blob = await buildReportPdfBlob(d);
      const { safeStorageName } = await import("@/lib/projectFiles");
      const basename = safeStorageName(
        `Regiebericht_${d.kunde_name}_${format(new Date(d.datum), "yyyy-MM-dd")}`,
      ).slice(0, 120);

      // 1) Bucket regiebericht-pdfs (pdf_path → Projektübersicht + Direktzugriff)
      const ownPath = `${d.id}/${basename}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("regiebericht-pdfs")
        .upload(ownPath, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;

      await supabase.from("disturbances").update({ pdf_path: ownPath }).eq("id", d.id);

      // 2) Projektordner (project-reports/<project_id>/regieberichte/…)
      if (d.project_id) {
        const { uploadProjectPdf } = await import("@/lib/pdfUploader");
        await uploadProjectPdf({
          projectId: d.project_id,
          category: "regieberichte",
          basename,
          blob,
        });
      }

      if (!opts?.silent) {
        toast({
          title: "PDF gespeichert",
          description: d.project_id
            ? "Der Regiebericht liegt jetzt im Projektordner (Berichte)."
            : "PDF gespeichert. Ohne Projektzuordnung liegt es nur beim Regiebericht.",
        });
      }
      return ownPath;
    } catch (err: any) {
      if (err?.message?.includes("Failed to fetch dynamically imported module")) {
        window.location.reload();
        return null;
      }
      console.warn("Regiebericht-PDF konnte nicht abgelegt werden:", err);
      if (!opts?.silent) {
        toast({
          variant: "destructive",
          title: "PDF-Fehler",
          description: err?.message || "PDF konnte nicht erzeugt werden",
        });
      }
      return null;
    }
  };

  /** Abschließen: Status sperren (sofort) + PDF im Projektordner ablegen. */
  const handleAbschliessen = async () => {
    if (!disturbance) return;
    setFinishing(true);

    const { error } = await supabase
      .from("disturbances")
      .update({ status: STATUS_ABGESCHLOSSEN })
      .eq("id", disturbance.id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht gesetzt werden" });
      setFinishing(false);
      return;
    }

    toast({
      title: "Regiebericht abgeschlossen",
      description: disturbance.project_id
        ? "Bericht gesperrt. Das PDF wird im Projektordner abgelegt…"
        : "Bericht gesperrt. Das PDF wird erzeugt…",
    });
    const fresh = await fetchDisturbance();
    setFinishing(false);

    if (fresh) {
      setPdfBusy(true);
      await storeReportPdf(fresh);
      setPdfBusy(false);
      fetchDisturbance();
    }
  };

  /** Wieder öffnen — nur Administrator. */
  const handleWiederOeffnen = async () => {
    if (!disturbance) return;
    const { error } = await supabase
      .from("disturbances")
      .update({ status: disturbance.unterschrift_kunde ? "gesendet" : "offen" })
      .eq("id", disturbance.id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht wieder geöffnet werden" });
    } else {
      toast({ title: "Wieder geöffnet", description: "Der Regiebericht kann wieder bearbeitet werden." });
      fetchDisturbance();
    }
  };

  const handleOpenPdf = async () => {
    if (!disturbance) return;
    setOpeningPdf(true);
    // Fenster SYNCHRON im Klick öffnen: Das PDF wird erst erzeugt und
    // signiert, und ein window.open nach mehreren await-Schritten gilt am
    // Handy nicht mehr als Nutzeraktion — Safari und Chrome blocken es
    // wortlos, der Knopf wirkte wirkungslos.
    const fenster = window.open("", "_blank");
    // Immer frisch erzeugen, damit das PDF den aktuellen Stand (inkl.
    // Unterschrift/Material) zeigt und im Projektordner landet.
    const path = await storeReportPdf(disturbance, { silent: true }) || disturbance.pdf_path;
    if (path) {
      const { data } = await supabase.storage.from("regiebericht-pdfs").createSignedUrl(path, 300);
      if (data?.signedUrl) {
        if (fenster) fenster.location.href = data.signedUrl;
        else window.open(data.signedUrl, "_blank");
      } else {
        fenster?.close();
        toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht geöffnet werden" });
      }
    } else {
      fenster?.close();
      toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht erzeugt werden" });
    }
    setOpeningPdf(false);
  };

  const getStatusBadge = (d: Disturbance) => {
    if (d.status === STATUS_ABGESCHLOSSEN) {
      return <Badge className="bg-green-600 text-white text-base px-3 py-1">Abgeschlossen</Badge>;
    }
    if (d.unterschrift_kunde) {
      return <Badge className="bg-blue-600 text-white text-base px-3 py-1">Unterschrieben</Badge>;
    }
    if (d.status === "offen") {
      return <Badge variant="secondary" className="text-base px-3 py-1">Entwurf / offen</Badge>;
    }
    return <Badge variant="outline" className="text-base px-3 py-1">{d.status}</Badge>;
  };

  // Verrechnenden Beleg (Nummer) nachladen — die Spalte wird beim Speichern
  // der Rechnung gesetzt und war bisher nirgends sichtbar.
  useEffect(() => {
    const verId = (disturbance as any)?.verrechnet_in_invoice_id as string | undefined;
    if (!verId) { setVerrechnetBeleg(null); return; }
    let cancelled = false;
    supabase.from("invoices").select("id, nummer").eq("id", verId).maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setVerrechnetBeleg(data ? { id: data.id, nummer: data.nummer } : null);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(disturbance as any)?.verrechnet_in_invoice_id]);

  const handleToggleVerrechnet = async () => {
    if (!disturbance) return;

    // Hand-Umschalten löscht auch den Beleg-Verweis (verrechnet_in_invoice_id)
    // — sonst bleibt ein Verweis auf eine Rechnung stehen, die den Bericht
    // nicht (mehr) deckt. Fallback ohne die Spalte, solange die Migration fehlt.
    let { error } = await (supabase.from("disturbances") as any)
      .update({ is_verrechnet: !disturbance.is_verrechnet, verrechnet_in_invoice_id: null })
      .eq("id", disturbance.id);
    if (error) {
      ({ error } = await supabase
        .from("disturbances")
        .update({ is_verrechnet: !disturbance.is_verrechnet })
        .eq("id", disturbance.id));
    }

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Status konnte nicht geändert werden",
      });
    } else {
      fetchDisturbance();
    }
  };

  const isLocked = disturbance?.status === STATUS_ABGESCHLOSSEN;
  const isOwnerOrAdmin = !!disturbance && (currentUserId === disturbance.user_id || isAdmin);
  const canEdit = isOwnerOrAdmin && !isLocked;

  if (loading) {
    return (
      <div className="kb-page min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!disturbance) {
    return (
      <div className="kb-page min-h-screen">
        <KBToolbar onBack={zurueck} title="Regiebericht nicht gefunden" />
        <main className="mx-auto w-full px-4 py-6 text-center">
          <p>Der angeforderte Regiebericht konnte nicht gefunden werden.</p>
          <Button onClick={() => navigate("/disturbances")} className="mt-4">
            Zurück zur Übersicht
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="Regiebericht">
        {canEdit && (
          <KBToolbarButton icon={Edit} label="Bearbeiten" onClick={() => setShowEditForm(true)} />
        )}
        {/* „Zur Unterschrift" steht als große Aktion unten auf der Seite
            (Kundenwunsch: oben nicht doppelt). */}
        {isOwnerOrAdmin && !isLocked && (
          <KBToolbarButton
            icon={CheckCircle2}
            label={finishing ? "Wird abgeschlossen…" : "Abschließen"}
            variant="green"
            disabled={finishing}
            onClick={handleAbschliessen}
          />
        )}
        {isAdmin && isLocked && (
          <KBToolbarButton icon={Unlock} label="Wieder öffnen" onClick={handleWiederOeffnen} />
        )}
        <KBToolbarButton
          icon={FileDown}
          label={openingPdf ? "PDF…" : "PDF öffnen"}
          disabled={openingPdf}
          onClick={handleOpenPdf}
        />
      </KBToolbar>

      <main className="mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 max-w-4xl space-y-4">
        {/* Kopf: Kunde + Status */}
        <Card className="kb-panel">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <Zap className="h-7 w-7 text-primary shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold break-words">{disturbance.kunde_name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(disturbance.datum), "EEEE, dd. MMMM yyyy", { locale: de })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {getStatusBadge(disturbance)}
                {disturbance.is_verrechnet && (
                  <Badge className="bg-emerald-600 text-white text-base px-3 py-1">Verrechnet</Badge>
                )}
              </div>
            </div>

            {pdfBusy && (
              <div className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                PDF wird erzeugt und im Projektordner abgelegt…
              </div>
            )}

            {isLocked && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Dieser Regiebericht ist abgeschlossen und gesperrt.
                  {isAdmin ? " Als Administrator können Sie ihn oben wieder öffnen." : " Wieder öffnen kann nur ein Administrator."}
                </span>
              </div>
            )}

            {projectName && (
              <div className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Projekt:</span>
                <button
                  className="font-medium text-primary hover:underline truncate"
                  onClick={() => navigate(`/projects/${disturbance.project_id}`)}
                >
                  {projectName}
                </button>
              </div>
            )}
            {!disturbance.project_id && (
              <p className="text-xs text-muted-foreground">
                Kein Projekt zugeordnet — das PDF landet dann in keinem Projektordner.
                Über „Bearbeiten" ein Projekt wählen.
              </p>
            )}

            {/* Aktionen für Admin: Verrechnung / Rechnung */}
            {isAdmin && disturbance.status !== "offen" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {!disturbance.is_verrechnet && (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1 h-10"
                    onClick={() => navigate(`/invoices/new?typ=rechnung&disturbance_id=${disturbance.id}`)}
                  >
                    <Receipt className="h-4 w-4" />
                    Rechnung erstellen
                  </Button>
                )}
                <Button
                  variant={disturbance.is_verrechnet ? "secondary" : "outline"}
                  size="sm"
                  className="h-10"
                  onClick={handleToggleVerrechnet}
                >
                  {disturbance.is_verrechnet ? "✓ Verrechnet" : "Als verrechnet markieren"}
                </Button>
              </div>
            )}

            {/* Welcher Beleg deckt diesen Bericht ab? (Sammelrechnung) */}
            {isAdmin && disturbance.is_verrechnet && verrechnetBeleg && (
              <div className="flex items-center gap-2 text-sm">
                <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Verrechnet mit:</span>
                <button
                  className="font-medium text-primary hover:underline"
                  onClick={() => navigate(`/invoices/${verrechnetBeleg.id}`)}
                >
                  Rechnung {verrechnetBeleg.nummer}
                </button>
              </div>
            )}

            {/* Große Primär-Aktionen — auf ALLEN Größen, weil die Unterschrift
                aus der Kopfzeile entfernt wurde (Kundenwunsch: nicht doppelt). */}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              {canEdit && !disturbance.unterschrift_kunde && (
                <Button className="h-12 text-base w-full sm:w-auto" onClick={() => setShowSignatureDialog(true)}>
                  <PenLine className="h-5 w-5 mr-2" />
                  Zur Unterschrift
                </Button>
              )}
              {canEdit && disturbance.unterschrift_kunde && !isLocked && (
                <Button variant="outline" className="h-12 text-base w-full sm:w-auto" onClick={() => setShowSignatureDialog(true)}>
                  <PenLine className="h-5 w-5 mr-2" />
                  Neu unterschreiben
                </Button>
              )}
              {isOwnerOrAdmin && !isLocked && (
                <Button
                  variant="outline"
                  className="h-12 text-base w-full sm:w-auto"
                  disabled={finishing}
                  onClick={handleAbschliessen}
                >
                  {finishing ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                  {finishing ? "Wird abgeschlossen…" : "Regiebericht abschließen"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer Information */}
        <Card className="kb-panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5" />
              Kundendaten
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium break-words">{disturbance.kunde_name}</p>
            </div>
            {disturbance.kunde_email && (
              <div className="space-y-1 min-w-0">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-4 w-4" /> E-Mail
                </p>
                <a href={`mailto:${disturbance.kunde_email}`} className="font-medium text-primary hover:underline break-all">
                  {disturbance.kunde_email}
                </a>
              </div>
            )}
            {disturbance.kunde_telefon && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-4 w-4" /> Telefon
                </p>
                <a href={`tel:${disturbance.kunde_telefon}`} className="font-medium text-primary hover:underline">
                  {disturbance.kunde_telefon}
                </a>
              </div>
            )}
            {(disturbance.kunde_adresse || disturbance.kunde_ort) && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> Adresse
                </p>
                <p className="font-medium break-words">
                  {[disturbance.kunde_adresse, [disturbance.kunde_plz, disturbance.kunde_ort].filter(Boolean).join(" ")]
                    .filter(Boolean).join(", ")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time Information */}
        <Card className="kb-panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5" />
              Arbeitszeit
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Datum</p>
              <p className="font-medium">
                {format(new Date(disturbance.datum), "dd.MM.yyyy", { locale: de })}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Arbeitszeit</p>
              <p className="font-medium">
                {disturbance.start_time.slice(0, 5)} - {disturbance.end_time.slice(0, 5)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Gesamtstunden</p>
              <p className="font-medium text-lg text-primary">{disturbance.stunden.toFixed(2)} h</p>
            </div>
            {disturbance.pause_minutes > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pause</p>
                <p className="font-medium">{disturbance.pause_minutes} Minuten</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Work Description */}
        <Card className="kb-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Durchgeführte Arbeiten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="whitespace-pre-wrap break-words">{disturbance.beschreibung}</p>
            </div>
            {disturbance.notizen && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notizen</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{disturbance.notizen}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Workers Section */}
        {workers.length > 0 && (
          <Card className="kb-panel">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Beteiligte Mitarbeiter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {workers.map((worker) => (
                  <Badge
                    key={worker.user_id}
                    variant={worker.is_main ? "default" : "secondary"}
                    className="text-sm py-1 px-3"
                  >
                    {worker.vorname} {worker.nachname}
                    {worker.is_main && " (Ersteller)"}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unterschrift */}
        {disturbance.unterschrift_kunde && (
          <Card className="kb-panel">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenLine className="h-5 w-5" />
                Unterschrift Kunde
              </CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={disturbance.unterschrift_kunde}
                alt="Unterschrift des Kunden"
                className="max-w-full h-24 object-contain bg-white rounded border"
              />
              {disturbance.unterschrift_am && (
                <p className="text-xs text-muted-foreground mt-2">
                  Unterschrieben am {format(new Date(disturbance.unterschrift_am), "dd.MM.yyyy HH:mm", { locale: de })}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Photos Section */}
        <DisturbancePhotos
          disturbanceId={disturbance.id}
          canEdit={canEdit}
        />

        {/* Materials Section */}
        <DisturbanceMaterials
          disturbanceId={disturbance.id}
          canEdit={canEdit}
        />

        {/* Maschinen / Werkzeug — bisher nur im PDF sichtbar */}
        <DisturbanceMaschinen disturbanceId={disturbance.id} reloadKey={maschinenReload} />

        {/* Löschen (nur wenn nicht gesperrt) */}
        {canEdit && (
          <div className="flex justify-end pb-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-11" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Regiebericht löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regiebericht löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden. Der Regiebericht und alle zugehörigen Materialien werden endgültig gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Metadata */}
        {isAdmin && (disturbance.profile_vorname || disturbance.profile_nachname) && (
          <Card className="kb-panel">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>Erfasst von: {disturbance.profile_vorname} {disturbance.profile_nachname}</span>
                <span>Erstellt: {format(new Date(disturbance.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
                <span>Zuletzt aktualisiert: {format(new Date(disturbance.updated_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Edit Form Dialog */}
      <DisturbanceForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        onSuccess={handleEditSuccess}
        editData={disturbance}
      />

      {/* Signature Dialog */}
      <SignatureDialog
        open={showSignatureDialog}
        onOpenChange={setShowSignatureDialog}
        disturbance={disturbance}
        onSuccess={handleSignatureSuccess}
      />
    </div>
  );
};

export default DisturbanceDetail;
