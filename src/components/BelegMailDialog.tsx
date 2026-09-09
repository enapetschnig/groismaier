/**
 * Beleg per E-Mail senden (Kundenwunsch: „das mit dem Rechnung senden kannst
 * du ja jetzt mit der Mail verknüpfen").
 *
 * Gesendet wird über das ECHTE Firmenpostfach (Microsoft 365, Edge Function
 * mail-postfach) — nicht über einen Fremdversender. Die Mail liegt dadurch
 * anschließend in Outlook unter „Gesendete Elemente", genau wie eine von Hand
 * geschriebene. Das PDF hängt automatisch an; der frühere Weg war ein
 * mailto:-Link, bei dem der Anwender das PDF selbst anhängen musste.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, FileCode2, Loader2, Paperclip, Send } from "lucide-react";

/**
 * Obergrenze für alle Anhänge zusammen.
 *
 * Größere Anhänge lädt die Mail-Funktion seit 09.09.2026 über eine
 * Graph-Upload-Session hoch (sonst wären bei ~3 MB Schluss). Die Grenze hier
 * ist die des Postfachs: Exchange nimmt üblicherweise 25–35 MB je Nachricht,
 * und beim Empfänger scheitert es oft schon früher. 20 MB sind eine Größe,
 * die zuverlässig ankommt.
 */
const MAX_ANHANG_BYTES = 20 * 1024 * 1024;

/** Absender-Postfächer (identisch zur Allowlist der Edge Function). */
const POSTFAECHER = [
  { adresse: "office@cg-holzbau.at", kurz: "Office" },
  { adresse: "christian.groismaier@cg-holzbau.at", kurz: "Christian" },
  { adresse: "buchhaltung@cg-holzbau.at", kurz: "Buchhaltung" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fertiges Beleg-PDF. */
  pdfBlob: Blob | null;
  dateiname: string;
  /** E-Rechnung (ebInterface-XML) — nur bei rechnungsartigen Belegen. */
  xmlBlob?: Blob | null;
  xmlDateiname?: string;
  /** Warum konnte die E-Rechnung nicht erzeugt werden (z. B. UID fehlt). */
  xmlFehler?: string;
  /** Vorbelegung aus dem Beleg. */
  empfaenger: string;
  belegBezeichnung: string;
  belegNummer: string;
  kundeAnrede?: string;
  kundeName?: string;
  /**
   * Bezüge für das Sendeprotokoll (Kundenwunsch 27.08.2026): Nach jedem
   * erfolgreichen Versand wird eine Sendebestätigung mit Datum und Uhrzeit
   * gespeichert — im Projekt auffindbar und gesammelt unter /sendeprotokoll.
   */
  protokoll?: {
    invoiceId?: string | null;
    projectId?: string | null;
    customerId?: string | null;
    belegTyp?: string;
  };
  /** Nach erfolgreichem Versand (z. B. Nachfrage-Termin anbieten). */
  onGesendet?: () => void;
  /**
   * Der Beleg ist noch ein ENTWURF (Kundenwunsch 09.09.2026: Entwürfe dürfen
   * per Mail raus). Der Dialog sagt das deutlich — das PDF trägt „ENTWURF"
   * und noch keine endgültige Belegnummer.
   */
  istEntwurf?: boolean;
  /**
   * Regieberichte, die in diesem Beleg verrechnet sind — ihre Original-PDFs
   * können mitgeschickt werden (Kundenwunsch 01.09.2026: „Regieberichte
   * müssen im Original an die Rechnung angehängt … oder als eigenes PDF
   * per Mail mitgeschickt werden").
   */
  regieberichtIds?: string[];
}

export function BelegMailDialog({
  open, onOpenChange, pdfBlob, dateiname, xmlBlob, xmlDateiname, xmlFehler,
  empfaenger, belegBezeichnung, belegNummer, kundeAnrede, kundeName, protokoll, onGesendet,
  istEntwurf = false, regieberichtIds,
}: Props) {
  const { toast } = useToast();
  const [von, setVon] = useState(POSTFAECHER[0].adresse);
  const [an, setAn] = useState("");
  const [cc, setCc] = useState("");
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [sendet, setSendet] = useState(false);
  /** Was hängt an? „pdf" ist voreingestellt (Kundenwunsch). */
  const [anhangWahl, setAnhangWahl] = useState<"pdf" | "beides" | "xml">("pdf");
  /** Regieberichte im Original mitschicken (Kundenwunsch 01.09.2026). */
  const [regieMitschicken, setRegieMitschicken] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAn(empfaenger || "");
    setCc("");
    setAnhangWahl("pdf");
    setBetreff(`${belegBezeichnung} ${belegNummer}`.trim());
    // Anrede aus den Kundendaten ableiten — „Frau Salat" statt „Damen und Herren".
    const nachname = (kundeName || "").trim().split(/\s+/).slice(-1)[0] || "";
    const anrede = kundeAnrede === "Frau" && nachname
      ? `Sehr geehrte Frau ${nachname},`
      : kundeAnrede === "Herr" && nachname
        ? `Sehr geehrter Herr ${nachname},`
        : "Sehr geehrte Damen und Herren,";
    // BEWUSST ohne Artikel ("unser/unsere/unseren"): Die Bezeichnung ist
    // Freitext des Anwenders ("Teilrechnung 1", "Anzahlung 30 %") — jede
    // Artikel-Heuristik produziert dort früher oder später falsches Deutsch.
    // "anbei erhalten Sie Anzahlungsrechnung 2026-044" ist immer korrekt.
    setText(
      `${anrede}\n\n` +
      `anbei erhalten Sie ${belegBezeichnung} ${belegNummer}.\n\n` +
      `Bei Fragen stehen wir Ihnen gerne zur Verfügung.\n\n` +
      `Mit freundlichen Grüßen\nHolzbau Groismaier GmbH`,
    );
  }, [open, empfaenger, belegBezeichnung, belegNummer, kundeAnrede, kundeName]);

  const senden = async () => {
    const empfaengerListe = an.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    if (empfaengerListe.length === 0) {
      toast({ title: "Empfänger fehlt", description: "Bitte eine E-Mail-Adresse eintragen.", variant: "destructive" });
      return;
    }
    if (anhangWahl !== "xml" && !pdfBlob) {
      toast({ title: "Kein PDF", description: "Der Beleg konnte nicht erzeugt werden.", variant: "destructive" });
      return;
    }
    if (anhangWahl !== "pdf" && !xmlBlob) {
      toast({ title: "Keine E-Rechnung", description: xmlFehler || "Die E-Rechnung konnte nicht erzeugt werden.", variant: "destructive" });
      return;
    }
    setSendet(true);
    try {
      // Dateien als base64 (ohne data:-Präfix) — so erwartet es Microsoft Graph.
      const alsBase64 = (b: Blob): Promise<string> => new Promise((auf, ab) => {
        const r = new FileReader();
        r.onload = () => auf(String(r.result).split(",")[1] || "");
        r.onerror = () => ab(new Error("Datei konnte nicht gelesen werden"));
        r.readAsDataURL(b);
      });

      const anhaenge: { name: string; inhaltBase64: string; typ: string }[] = [];
      if (anhangWahl !== "xml") {
        anhaenge.push({ name: dateiname, inhaltBase64: await alsBase64(pdfBlob), typ: "application/pdf" });
      }
      if (anhangWahl !== "pdf" && xmlBlob) {
        anhaenge.push({
          name: xmlDateiname || "E-Rechnung.xml",
          inhaltBase64: await alsBase64(xmlBlob),
          typ: "application/xml",
        });
      }
      // Regieberichte als EIN Sammel-PDF anhängen (Kundenwunsch 07.09.2026:
      // „25 Regieberichte … alle Berichte gesammelt in ein PDF als Anhang").
      // Ein einzelner Bericht heißt weiterhin „Regiebericht <Datum>.pdf".
      if (regieMitschicken && (regieberichtIds?.length || 0) > 0) {
        const { regieberichteSammelPdf, regieberichtPdfNachId } = await import("@/lib/regieberichtPdf");
        if (regieberichtIds!.length === 1) {
          const ergebnis = await regieberichtPdfNachId(regieberichtIds![0]);
          if (ergebnis) {
            const datum = ergebnis.bericht.datum
              ? new Date(ergebnis.bericht.datum).toLocaleDateString("de-AT").replace(/\./g, "-")
              : regieberichtIds![0].slice(0, 8);
            anhaenge.push({ name: `Regiebericht ${datum}.pdf`, inhaltBase64: await alsBase64(ergebnis.blob), typ: "application/pdf" });
          }
        } else {
          const sammel = await regieberichteSammelPdf(regieberichtIds!);
          if (sammel) {
            anhaenge.push({
              name: `Regieberichte (${sammel.anzahl}).pdf`,
              inhaltBase64: await alsBase64(sammel.blob),
              typ: "application/pdf",
            });
          }
        }
      }

      if (anhaenge.length === 0) throw new Error("Kein Anhang gewählt");

      /**
       * Größenwächter (Kundenmeldung 09.09.2026: „Rechnungsversand hat nicht
       * geklappt, da ist eine Fehlermeldung gekommen — sind das die vielen
       * Regieberichte?"). Genau das war es: 25 Berichte ergaben 120 MB.
       * Der Postfach-Weg (Microsoft Graph) nimmt rund 4 MB je Nachricht.
       * Statt eines technischen Fehlers sagen wir klar, was zu tun ist.
       */
      const groesse = anhaenge.reduce((s, a) => s + a.inhaltBase64.length * 0.75, 0);
      const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
      if (groesse > MAX_ANHANG_BYTES) {
        const groesster = [...anhaenge].sort((a, b) => b.inhaltBase64.length - a.inhaltBase64.length)[0];
        throw new Error(
          `Die Anhänge sind mit ${mb(groesse)} zu groß für eine E-Mail (üblich sind höchstens ${mb(MAX_ANHANG_BYTES)}). `
          + `Der größte ist „${groesster.name}" mit ${mb(groesster.inhaltBase64.length * 0.75)}. `
          + (regieMitschicken && (regieberichtIds?.length || 0) > 1
            ? "Schick die Rechnung ohne die Regieberichte und die Berichte getrennt nach — in der Regieberichte-Liste wählst du sie aus und öffnest sie als PDF."
            : "Bitte einen kleineren Anhang wählen."),
        );
      }

      const { data, error } = await supabase.functions.invoke("mail-postfach", {
        body: {
          aktion: "senden",
          postfach: von,
          modus: "neu",
          an: empfaengerListe,
          cc: cc.split(/[;,]/).map((x) => x.trim()).filter(Boolean),
          betreff,
          text,
          anhaenge,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Sendebestätigung festhalten (Kundenwunsch 27.08.2026) — der Versand
      // ist geglückt, das Protokoll darf ihn nachträglich nicht "zurückholen":
      // Fehler hier nur melden, nicht den Erfolg verwerfen.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: protokollFehler } = await (supabase.from("beleg_sendeprotokoll" as never) as any).insert({
          gesendet_von: user?.id,
          invoice_id: protokoll?.invoiceId || null,
          project_id: protokoll?.projectId || null,
          customer_id: protokoll?.customerId || null,
          beleg_typ: protokoll?.belegTyp || null,
          beleg_nummer: belegNummer || null,
          beleg_bezeichnung: belegBezeichnung || null,
          kunde_name: kundeName || null,
          von_adresse: von,
          an_adressen: empfaengerListe,
          cc_adressen: cc.split(/[;,]/).map((x) => x.trim()).filter(Boolean),
          betreff,
          anhaenge: anhaenge.map((a) => a.name),
        });
        if (protokollFehler) throw protokollFehler;
      } catch (pe) {
        console.error("Sendeprotokoll konnte nicht gespeichert werden:", pe);
        toast({
          title: "Hinweis",
          description: "Die Mail ging raus, aber die Sendebestätigung konnte nicht gespeichert werden.",
        });
      }

      toast({
        title: "Beleg versendet",
        description: `${belegBezeichnung} ${belegNummer} ging an ${empfaengerListe.join(", ")} — die Mail liegt in Outlook unter »Gesendete Elemente«.`,
      });
      onOpenChange(false);
      onGesendet?.();
    } catch (e) {
      toast({ title: "Senden fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSendet(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Der Dialog ist länger als ein kleiner Bildschirm hoch (Anhang-Optionen,
          Entwurfs-Hinweis, Regieberichte) — deshalb scrollt der INHALT, während
          Titel und die Knöpfe „Abbrechen/Senden" immer sichtbar bleiben.
          Kundenmeldung 09.09.2026: „ich kann nicht runterscrollen". */}
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{belegBezeichnung} {belegNummer} per E-Mail senden</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1">
            <Label>Absender</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={von}
              onChange={(e) => setVon(e.target.value)}
            >
              {POSTFAECHER.map((p) => (
                <option key={p.adresse} value={p.adresse}>{p.adresse}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>An</Label>
            <Input
              value={an}
              onChange={(e) => setAn(e.target.value)}
              placeholder="kunde@firma.at — mehrere mit Beistrich"
              autoFocus={!empfaenger}
            />
            {!empfaenger && (
              <p className="text-[11px] text-amber-600">
                Beim Kunden ist keine E-Mail hinterlegt — bitte eintragen.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>CC (optional)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Betreff</Label>
            <Input value={betreff} onChange={(e) => setBetreff(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nachricht</Label>
            <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {/* Anhang wählen — „nur PDF" ist voreingestellt (Kundenwunsch).
              Die E-Rechnung erscheint nur bei rechnungsartigen Belegen. */}
          <div className="space-y-1.5">
            <Label>Anhang</Label>
            {(xmlBlob || xmlFehler) ? (
              <div className="grid gap-1.5">
                {([
                  { wert: "pdf", titel: "Nur PDF", hinweis: "Das gewohnte Rechnungs-PDF" },
                  { wert: "beides", titel: "PDF und E-Rechnung", hinweis: "Für Kunden, die beides brauchen" },
                  { wert: "xml", titel: "Nur E-Rechnung", hinweis: "ebInterface-XML, z. B. für Behörden" },
                ] as const).map((o) => {
                  const gesperrt = o.wert !== "pdf" && !xmlBlob;
                  return (
                    <label
                      key={o.wert}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                        anhangWahl === o.wert ? "border-kb-blue bg-[hsl(210_60%_97%)]" : "bg-background"
                      } ${gesperrt ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name="anhangWahl"
                        className="mt-0.5 h-3.5 w-3.5 accent-kb-blue-dark"
                        checked={anhangWahl === o.wert}
                        disabled={gesperrt}
                        onChange={() => setAnhangWahl(o.wert)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{o.titel}</span>
                        <span className="block text-[11px] text-muted-foreground">{o.hinweis}</span>
                      </span>
                    </label>
                  );
                })}
                {xmlFehler && (
                  <p className="text-[11px] text-amber-600">
                    E-Rechnung nicht möglich: {xmlFehler}
                  </p>
                )}
              </div>
            ) : null}

            {/* Entwurf: unmissverständlich sagen, was der Empfänger bekommt. */}
            {istEntwurf && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <b>Das ist ein Entwurf.</b> Das PDF trägt „ENTWURF" und noch keine endgültige
                  Belegnummer — für die fertige Rechnung zuerst „Rechnung erstellen".
                </span>
              </div>
            )}

            {/* Regieberichte im Original mitschicken (Kundenwunsch 01.09.2026) */}
            {(regieberichtIds?.length || 0) > 0 && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-kb-blue/40 bg-[hsl(210_60%_97%)] px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={regieMitschicken}
                  onChange={(e) => setRegieMitschicken(e.target.checked)}
                />
                <span className="text-xs">
                  <span className="block font-medium">
                    {regieberichtIds!.length} Regiebericht{regieberichtIds!.length === 1 ? "" : "e"} im Original anhängen
                  </span>
                  <span className="text-muted-foreground">
                    {regieberichtIds!.length === 1
                      ? "Der Bericht geht als eigenes PDF mit — so sieht der Kunde, was verrechnet wird."
                      : "Alle Berichte gesammelt in EINER PDF-Datei (nach Datum sortiert) — so sieht der Kunde, was verrechnet wird."}
                  </span>
                </span>
              </label>
            )}

            {/* Was tatsächlich mitgeht */}
            <div className="space-y-1">
              {anhangWahl !== "xml" && (
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-kb-blue" />
                  <span className="truncate">{dateiname}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {pdfBlob ? `${Math.max(1, Math.round(pdfBlob.size / 1024))} KB` : "wird erzeugt…"}
                  </span>
                </div>
              )}
              {anhangWahl !== "pdf" && xmlBlob && (
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-kb-blue" />
                  <span className="truncate">{xmlDateiname || "E-Rechnung.xml"}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {`${Math.max(1, Math.round(xmlBlob.size / 1024))} KB`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={senden} disabled={sendet || !pdfBlob}>
            {sendet ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Senden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
