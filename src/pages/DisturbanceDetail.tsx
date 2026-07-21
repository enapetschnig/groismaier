import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Zap, Calendar, Clock, User, Mail, Phone, MapPin, Edit, Trash2, Plus, PenLine,
  Users, Receipt, Lock, Unlock, CheckCircle2, FileDown, FolderOpen, Loader2, Briefcase,
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
  const { toast } = useToast();
  const [disturbance, setDisturbance] = useState<Disturbance | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
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
  const buildReportPdfBlob = async (d: Disturbance): Promise<Blob> => {
    const [{ default: jsPDF }, { default: autoTable }, { loadDocumentLayout }, { loadInvoiceLogo }, letterhead] =
      await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        import("@/lib/loadLayout"),
        import("@/lib/logoLoader"),
        import("@/lib/pdfLetterhead"),
      ]);
    const { drawLetterhead, drawFooter, drawTitleBlock, LETTERHEAD_MARGIN } = letterhead;

    const { layout, firmenUid } = await loadDocumentLayout();
    const logoUri = await loadInvoiceLogo();

    // compress: true — sonst wird das PDF durch Logo + Unterschrift mehrere MB
    // groß, was am Handy/Baustellennetz spürbar ist.
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
    const ml = LETTERHEAD_MARGIN.left;
    const mr = LETTERHEAD_MARGIN.right;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const contentW = pageWidth - ml - mr;

    const { afterY } = drawLetterhead(pdf, layout, logoUri, firmenUid);
    let y = drawTitleBlock(
      pdf,
      layout,
      "Regiebericht",
      `${format(new Date(d.datum), "dd.MM.yyyy", { locale: de })} · ${d.kunde_name}`,
      afterY,
    );
    y += 2;

    const label = (text: string, value: string, yy: number): number => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(60, 60, 60);
      pdf.text(text, ml, yy);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      const lines = pdf.splitTextToSize(value || "-", contentW - 38);
      pdf.text(lines, ml + 38, yy);
      return yy + Math.max(5, lines.length * 4.4);
    };

    // Kundendaten
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Kunde", ml, y);
    y += 5.5;
    y = label("Name:", d.kunde_name, y);
    const adressLine = [d.kunde_adresse, [d.kunde_plz, d.kunde_ort].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    if (adressLine) y = label("Adresse:", adressLine, y);
    if (d.kunde_telefon) y = label("Telefon:", d.kunde_telefon, y);
    if (d.kunde_email) y = label("E-Mail:", d.kunde_email, y);
    y += 3;

    // Einsatzdaten
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Einsatz", ml, y);
    y += 5.5;
    y = label("Datum:", format(new Date(d.datum), "EEEE, dd. MMMM yyyy", { locale: de }), y);
    y = label("Arbeitszeit:", `${d.start_time.slice(0, 5)} – ${d.end_time.slice(0, 5)} Uhr`, y);
    if (d.pause_minutes > 0) y = label("Pause:", `${d.pause_minutes} Minuten`, y);
    y = label("Gesamtstunden:", `${Number(d.stunden).toFixed(2)} h`, y);
    if (workers.length > 0) {
      y = label("Mitarbeiter:", workers.map(w => `${w.vorname} ${w.nachname}`.trim()).filter(Boolean).join(", "), y);
    }
    y += 3;

    // Arbeiten
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Durchgeführte Arbeiten", ml, y);
    y += 5.5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    const bLines = pdf.splitTextToSize(d.beschreibung || "-", contentW);
    pdf.text(bLines, ml, y);
    y += bLines.length * 4.4 + 3;

    if (d.notizen) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.text("Notizen", ml, y);
      y += 4.5;
      pdf.setFont("helvetica", "normal");
      const nLines = pdf.splitTextToSize(d.notizen, contentW);
      pdf.text(nLines, ml, y);
      y += nLines.length * 4.4 + 3;
    }

    // Material
    const { data: mats } = await supabase
      .from("disturbance_materials")
      .select("material, menge, einheit, notizen")
      .eq("disturbance_id", d.id)
      .order("created_at", { ascending: true });

    if (mats && mats.length > 0) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Verwendetes Material", ml, y);
      y += 3;
      autoTable(pdf, {
        startY: y,
        head: [["Material", "Menge", "Einheit", "Notiz"]],
        body: mats.map((m: any) => [m.material || "", m.menge || "", m.einheit || "", m.notizen || ""]),
        theme: "plain",
        margin: { left: ml, right: mr, bottom: 26 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5 },
        bodyStyles: { fontSize: 9, textColor: [0, 0, 0], lineWidth: { bottom: 0.15 }, lineColor: [200, 200, 200] },
        columnStyles: { 1: { halign: "right", cellWidth: 20 }, 2: { cellWidth: 20 } },
      });
      y = (pdf as any).lastAutoTable.finalY + 6;
    }

    // Unterschrift
    const pageHeight = pdf.internal.pageSize.getHeight();
    if (y > pageHeight - 70) {
      pdf.addPage();
      y = LETTERHEAD_MARGIN.top;
    }
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Unterschrift Kunde", ml, y);
    y += 3;
    if (d.unterschrift_kunde) {
      try {
        pdf.addImage(d.unterschrift_kunde, "PNG", ml, y, 70, 26);
      } catch { /* Unterschrift optional */ }
      y += 28;
    } else {
      y += 26;
    }
    pdf.setDrawColor(120, 120, 120);
    pdf.setLineWidth(0.3);
    pdf.line(ml, y, ml + 75, y);
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(90, 90, 90);
    pdf.text(
      d.unterschrift_am
        ? `${d.kunde_name} · unterschrieben am ${format(new Date(d.unterschrift_am), "dd.MM.yyyy HH:mm", { locale: de })}`
        : `${d.kunde_name} · (ohne Unterschrift abgeschlossen)`,
      ml,
      y,
    );

    drawFooter(pdf, layout);
    return pdf.output("blob");
  };

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
    // Immer frisch erzeugen, damit das PDF den aktuellen Stand (inkl.
    // Unterschrift/Material) zeigt und im Projektordner landet.
    const path = await storeReportPdf(disturbance, { silent: true }) || disturbance.pdf_path;
    if (path) {
      const { data } = await supabase.storage.from("regiebericht-pdfs").createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      else toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht geöffnet werden" });
    } else {
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

  const handleToggleVerrechnet = async () => {
    if (!disturbance) return;

    const { error } = await supabase
      .from("disturbances")
      .update({ is_verrechnet: !disturbance.is_verrechnet })
      .eq("id", disturbance.id);

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
        <KBToolbar onBack={() => navigate("/disturbances")} title="Regiebericht nicht gefunden" />
        <main className="container mx-auto px-4 py-6 text-center">
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
      <KBToolbar onBack={() => navigate("/disturbances")} title="Regiebericht">
        {canEdit && (
          <KBToolbarButton icon={Edit} label="Bearbeiten" onClick={() => setShowEditForm(true)} />
        )}
        {canEdit && !disturbance.unterschrift_kunde && (
          <KBToolbarButton
            icon={PenLine}
            label="Zur Unterschrift"
            variant="blue"
            onClick={() => setShowSignatureDialog(true)}
          />
        )}
        {canEdit && disturbance.unterschrift_kunde && (
          <KBToolbarButton
            icon={PenLine}
            label="Neu unterschreiben"
            onClick={() => setShowSignatureDialog(true)}
          />
        )}
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
        {disturbance.project_id && (
          /* Projektübersicht statt /reports: nur dort ist die Karte
             „Regiebericht-PDFs" — die Ordneransicht listet keine Unterordner. */
          <KBToolbarButton
            icon={FolderOpen}
            label="Zum Projekt"
            onClick={() => navigate(`/projects/${disturbance.project_id}`)}
          />
        )}
      </KBToolbar>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl space-y-4">
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

            {/* Große Primär-Aktion für Handy (Toolbar-Buttons sind oben klein) */}
            <div className="flex flex-col gap-2 sm:hidden pt-1">
              {canEdit && !disturbance.unterschrift_kunde && (
                <Button className="h-12 text-base w-full" onClick={() => setShowSignatureDialog(true)}>
                  <PenLine className="h-5 w-5 mr-2" />
                  Zur Unterschrift
                </Button>
              )}
              {isOwnerOrAdmin && !isLocked && (
                <Button
                  variant="outline"
                  className="h-12 text-base w-full"
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
