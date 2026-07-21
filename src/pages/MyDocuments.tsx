import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KBToolbar } from "@/components/kingbill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Eye, Trash2, Home, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FileViewer } from "@/components/FileViewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Document {
  name: string;
  path: string;
  created_at?: string;
}

type DocType = "lohnzettel" | "krankmeldung";

/**
 * „Meine Dokumente" — Mitarbeiter-Sicht auf den Storage-Ordner
 * employee-documents/<user-id>/…
 *   • lohnzettel   → nur ansehen (legt der Chef ab)
 *   • krankmeldung → selbst hochladen, ansehen, löschen
 *
 * Dateinamen enthalten technisch ein Zeitstempel-Präfix (1690000000000_datei.pdf);
 * angezeigt wird der lesbare Teil.
 */
export default function MyDocuments() {
  const navigate = useNavigate();
  const [payslips, setPayslips] = useState<Document[]>([]);
  const [sickNotes, setSickNotes] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string; bucketName: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUserAndDocuments();
  }, []);

  const fetchUserAndDocuments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setLoading(false);
      return;
    }

    setUserId(user.id);
    await Promise.all([
      fetchDocuments(user.id, "lohnzettel", setPayslips),
      fetchDocuments(user.id, "krankmeldung", setSickNotes),
    ]);
    setLoading(false);
  };

  const fetchDocuments = async (
    userId: string,
    type: DocType,
    setter: (docs: Document[]) => void
  ) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .list(`${userId}/${type}`);

    if (error) {
      console.error(`Fehler beim Laden von ${type}:`, error);
      return;
    }

    if (data) {
      const docs = data
        // Supabase legt in leeren Ordnern einen Platzhalter an — nicht anzeigen.
        .filter((file) => file.name !== ".emptyFolderPlaceholder")
        .map((file) => ({
          name: file.name,
          path: `${userId}/${type}/${file.name}`,
          created_at: file.created_at,
        }));
      setter(docs);
    }
  };

  /** 1690000000000_Krankmeldung.pdf → Krankmeldung.pdf */
  const displayName = (name: string) => name.replace(/^\d{10,}_/, "");

  const handleUpload = async (type: DocType, file: File | null) => {
    if (!file || !userId) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Fehler", description: "Datei ist zu groß (max. 50 MB)" });
      return;
    }

    setUploading(true);

    const filePath = `${userId}/${type}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from("employee-documents")
      .upload(filePath, file);

    if (error) {
      console.error("Upload-Fehler:", error);
      toast({ variant: "destructive", title: "Fehler", description: `Upload fehlgeschlagen: ${error.message}` });
    } else {
      toast({ title: "Erfolg", description: "Dokument hochgeladen" });
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes);
    }

    setUploading(false);
    // Gleiche Datei soll erneut wählbar sein → Input zurücksetzen.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleView = (doc: Document) => {
    setViewingFile({
      name: displayName(doc.name),
      path: doc.path,
      bucketName: "employee-documents",
    });
  };

  const handleDelete = async (doc: Document) => {
    const { error } = await supabase.storage
      .from("employee-documents")
      .remove([doc.path]);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Löschen fehlgeschlagen" });
    } else {
      toast({ title: "Erfolg", description: "Dokument gelöscht" });
      await fetchDocuments(userId, "krankmeldung", setSickNotes);
    }
  };

  const docRow = (doc: Document, withDelete: boolean) => (
    <li key={doc.path} className="flex items-center gap-2 rounded-md border border-border p-2">
      <FileText className="h-5 w-5 shrink-0 text-kb-blue-dark" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{displayName(doc.name)}</p>
        {doc.created_at && (
          <p className="text-xs text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString("de-DE")}
          </p>
        )}
      </div>
      <button
        type="button"
        className="kb-btn h-11 w-11 shrink-0 justify-center"
        aria-label={`${displayName(doc.name)} ansehen`}
        title="Ansehen"
        onClick={() => handleView(doc)}
      >
        <Eye className="h-4 w-4 text-kb-blue-dark" />
      </button>
      {withDelete && (
        <button
          type="button"
          className="kb-btn h-11 w-11 shrink-0 justify-center"
          aria-label={`${displayName(doc.name)} löschen`}
          title="Löschen"
          onClick={() => setDeleteTarget(doc)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      )}
    </li>
  );

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        title="Meine Dokumente"
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
      />

      <div className="container mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Lädt...</p>
        ) : (
          <Tabs defaultValue="payslips" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value="payslips" className="min-h-[44px]">
                <FileText className="mr-2 h-4 w-4" />
                Lohnzettel
              </TabsTrigger>
              <TabsTrigger value="sicknotes" className="min-h-[44px]">
                <FileText className="mr-2 h-4 w-4" />
                Krankmeldungen
              </TabsTrigger>
            </TabsList>

            <TabsContent value="payslips" className="mt-3">
              <section className="kb-panel p-4">
                <h2 className="font-bold">Meine Lohnzettel</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  Vom Büro hinterlegte Lohnzettel — nur zum Ansehen.
                </p>
                {payslips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Lohnzettel vorhanden</p>
                ) : (
                  <ul className="space-y-2">{payslips.map((doc) => docRow(doc, false))}</ul>
                )}
              </section>
            </TabsContent>

            <TabsContent value="sicknotes" className="mt-3 space-y-3">
              <section className="kb-panel p-4">
                <h2 className="font-bold">Krankmeldung hochladen</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  PDF oder Foto (max. 50 MB). Das Büro sieht die Datei sofort.
                </p>
                <input
                  ref={fileInputRef}
                  id="sicknote-upload"
                  type="file"
                  className="sr-only"
                  onChange={(e) => handleUpload("krankmeldung", e.target.files?.[0] || null)}
                  disabled={uploading}
                  accept=".pdf,.jpg,.jpeg,.png"
                />
                <button
                  type="button"
                  className="kb-btn min-h-[44px] w-full justify-center sm:w-auto"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 text-kb-blue-dark" />
                  {uploading ? "Lädt hoch…" : "Datei auswählen"}
                </button>
              </section>

              <section className="kb-panel p-4">
                <h2 className="mb-3 font-bold">Meine Krankmeldungen</h2>
                {sickNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Krankmeldungen vorhanden</p>
                ) : (
                  <ul className="space-y-2">{sickNotes.map((doc) => docRow(doc, true))}</ul>
                )}
              </section>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {viewingFile && (
        <FileViewer
          open={true}
          onClose={() => setViewingFile(null)}
          fileName={viewingFile.name}
          filePath={viewingFile.path}
          bucketName={viewingFile.bucketName}
        />
      )}

      {/* Löschen-Bestätigung (vorher window.confirm — am Handy leicht zu übersehen) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Krankmeldung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `„${displayName(deleteTarget.name)}" wird dauerhaft gelöscht.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
