/**
 * /email — E-Mail-Postfächer in der App (Kundenwunsch):
 * christian.groismaier@ als Haupt-Postfach, dazu office@ und buchhaltung@.
 * Lesen, suchen (Microsoft-Volltextsuche), Anhänge herunterladen — und aus
 * jeder Mail mit Anhang per Klick eine Eingangsrechnung übernehmen: Die
 * Anhänge wandern direkt in den bekannten KI-Scan-Dialog (gleicher Weg wie
 * beim Foto-Upload), inklusive Absender/Betreff als Notiz.
 *
 * Die Microsoft-Zugangsdaten bleiben serverseitig (Edge Function
 * mail-postfach, nur für Admins) — der Browser sieht sie nie. Mail-Inhalte
 * werden in einer Sandbox-iframe gerendert (kein Skript läuft mit).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { KBToolbar } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { PurchaseInvoiceUploadDialog } from "@/components/PurchaseInvoiceUploadDialog";
import {
  ArrowLeft, Download, FileText, Loader2, Mail, MailOpen, Paperclip, ReceiptText, RefreshCw, Search, X,
} from "lucide-react";

const POSTFAECHER = [
  { adresse: "christian.groismaier@cg-holzbau.at", kurz: "Christian" },
  { adresse: "office@cg-holzbau.at", kurz: "Office" },
  { adresse: "buchhaltung@cg-holzbau.at", kurz: "Buchhaltung" },
];

interface MailZeile {
  id: string;
  betreff: string;
  von: string;
  vonAdresse: string;
  empfangen: string;
  hatAnhaenge: boolean;
  vorschau: string;
  gelesen: boolean;
}

interface MailDetail {
  id: string;
  betreff: string;
  von: string;
  vonAdresse: string;
  an: string[];
  empfangen: string;
  bodyHtml: string | null;
  bodyText: string | null;
  anhaenge: { id: string; name: string; typ: string; groesse: number }[];
}

const datumKurz = (iso: string) => {
  const d = new Date(iso);
  const heute = new Date();
  return d.toDateString() === heute.toDateString()
    ? d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const groesseText = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function Email() {
  const zurueck = useZurueck("/");
  const { toast } = useToast();

  const [postfach, setPostfach] = useState(POSTFAECHER[0].adresse);
  const [mails, setMails] = useState<MailZeile[]>([]);
  const [mehrDa, setMehrDa] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [laedtMehr, setLaedtMehr] = useState(false);
  const [suche, setSuche] = useState("");
  const sucheAktiv = useRef("");
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [detailLaedt, setDetailLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // ER-Übernahme
  const [erDialogOffen, setErDialogOffen] = useState(false);
  const [erDateien, setErDateien] = useState<File[]>([]);
  const [erNotiz, setErNotiz] = useState("");
  const [uebernehmeLaeuft, setUebernehmeLaeuft] = useState(false);

  const rufe = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("mail-postfach", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const lade = useCallback(async (pf: string, such: string, anhaengen = false, skip = 0) => {
    anhaengen ? setLaedtMehr(true) : setLaedt(true);
    setFehler(null);
    try {
      const d = await rufe({ aktion: "liste", postfach: pf, suche: such || undefined, skip });
      setMails((alt) => (anhaengen ? [...alt, ...d.mails] : d.mails));
      setMehrDa(!!d.mehr && !such);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
      setLaedtMehr(false);
    }
  }, [rufe]);

  useEffect(() => {
    setDetail(null);
    setMails([]);
    sucheAktiv.current = "";
    setSuche("");
    lade(postfach, "");
  }, [postfach, lade]);

  const suchen = () => {
    sucheAktiv.current = suche.trim();
    setDetail(null);
    lade(postfach, sucheAktiv.current);
  };

  const oeffne = async (m: MailZeile) => {
    setDetailLaedt(true);
    try {
      const d = await rufe({ aktion: "detail", postfach, id: m.id });
      setDetail(d);
      setMails((alt) => alt.map((x) => (x.id === m.id ? { ...x, gelesen: true } : x)));
    } catch (e) {
      toast({ title: "Mail konnte nicht geladen werden", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDetailLaedt(false);
    }
  };

  const anhangHolen = async (anhangId: string): Promise<File | null> => {
    const a = await rufe({ aktion: "anhang", postfach, id: detail!.id, anhangId });
    if (!a.inhaltBase64) return null;
    const bytes = Uint8Array.from(atob(a.inhaltBase64), (c) => c.charCodeAt(0));
    return new File([bytes], a.name || "anhang", { type: a.typ || "application/octet-stream" });
  };

  const anhangLaden = async (anhang: MailDetail["anhaenge"][number]) => {
    try {
      const f = await anhangHolen(anhang.id);
      if (!f) return;
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url; a.download = f.name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    }
  };

  /** Kern des Kundenwunschs: Mail-Anhänge mit einem Klick in den ER-Scan. */
  const alsEingangsrechnung = async () => {
    if (!detail) return;
    setUebernehmeLaeuft(true);
    try {
      const passend = detail.anhaenge.filter((a) =>
        /pdf|image\//i.test(a.typ || "") || /\.(pdf|jpe?g|png|heic)$/i.test(a.name || ""));
      if (passend.length === 0) {
        toast({ title: "Kein passender Anhang", description: "Diese Mail hat keine PDF- oder Foto-Anhänge." });
        return;
      }
      const dateien: File[] = [];
      for (const a of passend) {
        const f = await anhangHolen(a.id);
        if (f) dateien.push(f);
      }
      if (dateien.length === 0) throw new Error("Anhänge konnten nicht geladen werden");
      setErDateien(dateien);
      setErNotiz(`Aus E-Mail: ${detail.von} <${detail.vonAdresse}> — „${detail.betreff}" (${new Date(detail.empfangen).toLocaleDateString("de-AT")})`);
      setErDialogOffen(true);
    } catch (e) {
      toast({ title: "Übernahme fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUebernehmeLaeuft(false);
    }
  };

  const listeSichtbar = !detail || typeof window === "undefined" || window.innerWidth >= 1024;

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="E-Mail" />

      <div className="container mx-auto max-w-[1500px] px-3 py-4 sm:px-4">
        {/* Postfach-Reiter */}
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {POSTFAECHER.map((p) => (
            <button
              key={p.adresse}
              type="button"
              className={postfach === p.adresse ? "kb-tab-active" : "kb-tab"}
              title={p.adresse}
              onClick={() => setPostfach(p.adresse)}
            >
              <Mail className="mr-1.5 inline h-3.5 w-3.5" />
              {p.kurz}
            </button>
          ))}
          <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{postfach}</span>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" title="Aktualisieren"
            onClick={() => lade(postfach, sucheAktiv.current)}>
            <RefreshCw className={`h-4 w-4 ${laedt ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Suche */}
        <div className="mb-3 flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Postfach durchsuchen (Absender, Betreff, Inhalt)…"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && suchen()}
            />
            {sucheAktiv.current && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                title="Suche löschen"
                onClick={() => { setSuche(""); sucheAktiv.current = ""; setDetail(null); lade(postfach, ""); }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={suchen} disabled={laedt}>Suchen</Button>
        </div>

        <div className="flex gap-3">
          {/* Liste */}
          {listeSichtbar && (
            <div className={`kb-panel ${detail ? "hidden lg:block lg:w-[420px] lg:shrink-0" : "w-full"}`}>
              {fehler && (
                <div className="px-4 py-6 text-center text-sm text-destructive">
                  {fehler}
                  <div className="mt-2">
                    <Button variant="outline" size="sm" onClick={() => lade(postfach, sucheAktiv.current)}>Nochmal versuchen</Button>
                  </div>
                </div>
              )}
              {laedt && mails.length === 0 && (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lade Postfach…
                </div>
              )}
              {!laedt && !fehler && mails.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {sucheAktiv.current ? "Nichts gefunden." : "Keine Mails."}
                </div>
              )}
              <div className="divide-y">
                {mails.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left transition-colors hover:bg-muted/50 ${detail?.id === m.id ? "bg-[hsl(210_50%_96%)]" : ""}`}
                    onClick={() => oeffne(m)}
                  >
                    <div className="flex items-center gap-2">
                      {m.gelesen
                        ? <MailOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <Mail className="h-3.5 w-3.5 shrink-0 text-kb-blue" />}
                      <span className={`min-w-0 flex-1 truncate text-sm ${m.gelesen ? "" : "font-bold"}`}>{m.von}</span>
                      {m.hatAnhaenge && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{datumKurz(m.empfangen)}</span>
                    </div>
                    <div className={`truncate text-sm ${m.gelesen ? "text-muted-foreground" : "font-semibold"}`}>{m.betreff}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.vorschau}</div>
                  </button>
                ))}
              </div>
              {mehrDa && (
                <div className="p-2 text-center">
                  <Button variant="outline" size="sm" disabled={laedtMehr}
                    onClick={() => lade(postfach, "", true, mails.length)}>
                    {laedtMehr ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Ältere Mails laden
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Detail */}
          {(detail || detailLaedt) && (
            <div className="kb-panel min-w-0 flex-1">
              {detailLaedt && !detail && (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lade Mail…
                </div>
              )}
              {detail && (
                <div className="flex h-full flex-col">
                  <div className="border-b px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={() => setDetail(null)} title="Zurück zur Liste">
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base font-bold leading-snug">{detail.betreff}</h2>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{detail.von}</span> &lt;{detail.vonAdresse}&gt;
                          {" · "}{new Date(detail.empfangen).toLocaleString("de-AT")}
                        </div>
                      </div>
                      <Button
                        className="shrink-0"
                        size="sm"
                        disabled={uebernehmeLaeuft || detail.anhaenge.length === 0}
                        title={detail.anhaenge.length === 0 ? "Diese Mail hat keine Anhänge" : "Anhänge in den Eingangsrechnungs-Scan übernehmen"}
                        onClick={alsEingangsrechnung}
                      >
                        {uebernehmeLaeuft ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-1.5 h-4 w-4" />}
                        Als Eingangsrechnung
                      </Button>
                    </div>
                    {detail.anhaenge.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {detail.anhaenge.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs hover:bg-muted"
                            title={`${a.name} herunterladen`}
                            onClick={() => anhangLaden(a)}
                          >
                            <FileText className="h-3.5 w-3.5 text-kb-blue" />
                            <span className="max-w-[220px] truncate">{a.name}</span>
                            <span className="text-muted-foreground">({groesseText(a.groesse)})</span>
                            <Download className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="min-h-[300px] flex-1">
                    {detail.bodyHtml ? (
                      /* Sandbox ohne Skripte/Formulare — Mail-HTML kann nichts anrichten. */
                      <iframe
                        title="Mail-Inhalt"
                        sandbox=""
                        srcDoc={detail.bodyHtml}
                        className="h-[60vh] w-full border-0 bg-white"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-sm">{detail.bodyText}</pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Direkt verbunden mit Microsoft 365 · Öffnen markiert als gelesen · „Als Eingangsrechnung" schickt die Anhänge in den bekannten KI-Scan
        </p>
      </div>

      {/* Der bewährte ER-Scan-Dialog, gefüttert mit den Mail-Anhängen. */}
      <PurchaseInvoiceUploadDialog
        open={erDialogOffen}
        onOpenChange={(o) => { setErDialogOffen(o); if (!o) setErDateien([]); }}
        onUploaded={() => toast({ title: "Eingangsrechnung angelegt", description: "Zu finden unter Eingangsrechnungen." })}
        initialFiles={erDateien}
        prefillNotiz={erNotiz}
      />
    </div>
  );
}
