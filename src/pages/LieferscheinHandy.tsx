// ============================================================================
// Lieferschein am Handy (Kundenwunsch 11.09.2026)
//
// „eine Möglichkeit (zumindest fürs Handy) schaffen, dass man einen neuen
//  Lieferschein anlegen kann, Fotos aufnehmen kann von zB verladenen
//  Holzpaketen … dass diese dann einem LKW mitgegeben werden können. Dazu
//  … ein Unterschrift-Feld, wo der Kunde oder Frächter unterschreiben kann."
//
// Der große Beleg-Editor (InvoiceDetail) ist für den Schreibtisch gebaut.
// Diese Seite ist das Gegenstück für den Hof: wenige große Felder, Kamera,
// Unterschrift. Sie schreibt dieselben Tabellen (invoices, invoice_items) —
// ein hier angelegter Lieferschein ist in der Belegliste und im Editor ein
// ganz normaler Beleg. Preise gibt es keine; die kommen erst in der Rechnung.
//
// Ablauf wie beim Regiebericht: erst speichern (Nummer wird gezogen), dann
// Fotos und Unterschrift. Mit der Unterschrift springt der Status auf
// „offen" — ab da zählt die Erinnerung (siehe lieferscheinUebergabe.ts).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, PenLine, FileDown, Plus, Trash2, Truck, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";
import { useInvoiceLayout } from "@/hooks/useInvoiceLayout";
import { CustomerSelect, type CustomerData } from "@/components/CustomerSelect";
import { BelegFotos } from "@/components/BelegFotos";
import { LieferscheinUnterschriftDialog } from "@/components/LieferscheinUnterschriftDialog";
import { belegPdfErzeugen, blobHerunterladen } from "@/lib/belegPdfLaden";
import {
  type LieferscheinZeile, gueltigeZeilen, mengeAusEingabe,
  statusNachUebergabe, darfUnterschreiben, seitWann,
} from "@/lib/lieferscheinUebergabe";

interface Beleg {
  id: string;
  nummer: string | null;
  status: string;
  kunde_name: string;
  customer_id: string | null;
  project_id: string | null;
  datum: string;
  lieferadresse: string | null;
  notizen: string | null;
  unterschrift_kunde: string | null;
  unterschrift_am: string | null;
  unterschrift_name: string | null;
}

const heuteISO = () => new Date().toISOString().slice(0, 10);
const leereZeile = (einheit: string): LieferscheinZeile => ({ menge: "", einheit, text: "" });

const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf — noch nicht übergeben",
  offen: "Übergeben — noch nicht verrechnet",
  verrechnet: "Verrechnet",
  storniert: "Storniert",
};

export default function LieferscheinHandy() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const { layout } = useInvoiceLayout();

  const [beleg, setBeleg] = useState<Beleg | null>(null);
  const [laedt, setLaedt] = useState(!!id);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [kunde, setKunde] = useState<CustomerData | null>(null);
  const [kundeFrei, setKundeFrei] = useState("");
  const [projekte, setProjekte] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);
  const [projektId, setProjektId] = useState<string>("");
  const [datum, setDatum] = useState(heuteISO());
  const [lieferadresse, setLieferadresse] = useState("");
  const [notiz, setNotiz] = useState("");
  const [zeilen, setZeilen] = useState<LieferscheinZeile[]>([leereZeile("Stk")]);
  const [speichert, setSpeichert] = useState(false);
  const [unterschriftOffen, setUnterschriftOffen] = useState(false);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);

  const gesperrt = beleg?.status === "verrechnet" || beleg?.status === "storniert";

  useEffect(() => {
    (supabase.from("projects") as any)
      .select("id, name, customer_id")
      .not("status", "eq", "Abgeschlossen")
      .order("name")
      .then(({ data }: any) => setProjekte(data || []));
  }, []);

  // Vorhandenen Lieferschein laden (Unterschrift nachholen, Fotos ergänzen).
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: b }, { data: items }] = await Promise.all([
        (supabase.from("invoices") as any)
          .select("id, nummer, status, typ, kunde_name, customer_id, project_id, datum, lieferadresse, notizen, unterschrift_kunde, unterschrift_am, unterschrift_name")
          .eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("menge, einheit, kurztext, beschreibung, position").eq("invoice_id", id).order("position"),
      ]);
      if (!b || b.typ !== "lieferschein") {
        toast({ variant: "destructive", title: "Kein Lieferschein", description: "Dieser Beleg ist kein Lieferschein." });
        navigate("/invoices?tab=lieferschein");
        return;
      }
      setBeleg(b);
      setCustomerId(b.customer_id);
      setKundeFrei(b.customer_id ? "" : b.kunde_name || "");
      setProjektId(b.project_id || "");
      setDatum(b.datum || heuteISO());
      setLieferadresse(b.lieferadresse || "");
      setNotiz(b.notizen || "");
      const z = (items || []).map((it: any) => ({
        menge: String(Number(it.menge) || 1).replace(".", ","),
        einheit: it.einheit || "Stk",
        text: it.kurztext || it.beschreibung || "",
      }));
      setZeilen(z.length ? z : [leereZeile("Stk")]);
      setLaedt(false);
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Projekt gewählt und noch kein Kunde? Dann den Projektkunden vorschlagen.
  const projektKundeId = useMemo(() => projekte.find((p) => p.id === projektId)?.customer_id || null, [projekte, projektId]);
  useEffect(() => {
    if (projektKundeId && !customerId && !kundeFrei) setCustomerId(projektKundeId);
  }, [projektKundeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const zeileAendern = (i: number, patch: Partial<LieferscheinZeile>) =>
    setZeilen((alt) => alt.map((z, k) => (k === i ? { ...z, ...patch } : z)));

  const kundeName = kunde?.name || (customerId ? beleg?.kunde_name || "" : kundeFrei.trim());

  const speichern = async (): Promise<Beleg | null> => {
    if (!kundeName) {
      toast({ variant: "destructive", title: "Kunde fehlt", description: "Bitte einen Kunden wählen oder den Namen eintippen." });
      return null;
    }
    const positionen = gueltigeZeilen(zeilen);
    if (positionen.length === 0) {
      toast({ variant: "destructive", title: "Keine Position", description: "Was wird geliefert? Mindestens eine Zeile mit Text." });
      return null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    setSpeichert(true);
    try {
      const jahr = Number(datum.slice(0, 4)) || new Date().getFullYear();
      const kopf: Record<string, unknown> = {
        kunde_name: kundeName,
        kunde_adresse: kunde?.adresse ?? undefined,
        kunde_plz: kunde?.plz ?? undefined,
        kunde_ort: kunde?.ort ?? undefined,
        kunde_email: kunde?.email ?? undefined,
        kunde_telefon: kunde?.telefon ?? undefined,
        kundennummer: kunde?.kundennummer ?? undefined,
        customer_id: customerId,
        project_id: projektId || null,
        datum,
        leistungsdatum: datum,
        lieferadresse: lieferadresse.trim() || null,
        notizen: notiz.trim() || null,
      };
      Object.keys(kopf).forEach((k) => kopf[k] === undefined && delete kopf[k]);

      let belegId = beleg?.id;
      let gespeichert: Beleg;
      if (!belegId) {
        // Lieferscheine ziehen die Nummer sofort — sie kennen keinen
        // Erstellen-Schritt wie Rechnungen (siehe belegEntwurf.ts).
        const { data: numData, error: numError } = await supabase.rpc("next_document_number" as never, {
          p_typ: "lieferschein", p_jahr: jahr,
        } as never);
        if (numError) throw numError;
        const nummer = numData as string;
        const laufnummer = parseInt((nummer.match(/(\d+)$/) || ["", "1"])[1]) || 1;
        const { data: ins, error } = await (supabase.from("invoices") as any)
          .insert({
            user_id: user.id, typ: "lieferschein", status: "entwurf", nummer, laufnummer, jahr,
            netto_summe: 0, mwst_satz: 20, mwst_betrag: 0, brutto_summe: 0,
            ...kopf,
          })
          .select("id, nummer, status, kunde_name, customer_id, project_id, datum, lieferadresse, notizen, unterschrift_kunde, unterschrift_am, unterschrift_name")
          .single();
        if (error) throw error;
        belegId = ins.id;
        gespeichert = ins;
      } else {
        const { data: upd, error } = await (supabase.from("invoices") as any)
          .update(kopf).eq("id", belegId)
          .select("id, nummer, status, kunde_name, customer_id, project_id, datum, lieferadresse, notizen, unterschrift_kunde, unterschrift_am, unterschrift_name")
          .single();
        if (error) throw error;
        gespeichert = upd;
      }

      await supabase.from("invoice_items").delete().eq("invoice_id", belegId!);
      const { error: itemsError } = await (supabase.from("invoice_items") as any).insert(
        positionen.map((z, i) => ({
          invoice_id: belegId, position: i + 1,
          beschreibung: z.text.trim(), kurztext: z.text.trim(),
          menge: mengeAusEingabe(z.menge), einheit: z.einheit || "Stk",
          einzelpreis: 0, gesamtpreis: 0, auf_pdf: true,
        })),
      );
      if (itemsError) throw itemsError;

      setBeleg(gespeichert);
      if (!id) navigate(`/lieferschein/${belegId}`, { replace: true });
      toast({ title: "Gespeichert", description: `Lieferschein ${gespeichert.nummer} — jetzt Fotos und Unterschrift.` });
      return gespeichert;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Nicht gespeichert", description: e?.message || String(e) });
      return null;
    } finally {
      setSpeichert(false);
    }
  };

  const unterschreiben = async (unterschrift: string, name: string) => {
    if (!beleg) return;
    const { data, error } = await (supabase.from("invoices") as any)
      .update({
        unterschrift_kunde: unterschrift,
        unterschrift_am: new Date().toISOString(),
        unterschrift_name: name,
        status: statusNachUebergabe(beleg.status),
      })
      .eq("id", beleg.id)
      .select("id, nummer, status, kunde_name, customer_id, project_id, datum, lieferadresse, notizen, unterschrift_kunde, unterschrift_am, unterschrift_name")
      .single();
    if (error) { toast({ variant: "destructive", title: "Unterschrift nicht gespeichert", description: error.message }); throw error; }
    setBeleg(data);
    toast({ title: "Übernahme bestätigt", description: `${name} hat unterschrieben. Der Lieferschein gilt jetzt als übergeben.` });
  };

  const uebergebenOhne = async () => {
    if (!beleg) return;
    if (!window.confirm("Ohne Unterschrift als übergeben markieren?")) return;
    const { data, error } = await (supabase.from("invoices") as any)
      .update({ status: statusNachUebergabe(beleg.status) }).eq("id", beleg.id)
      .select("id, nummer, status, kunde_name, customer_id, project_id, datum, lieferadresse, notizen, unterschrift_kunde, unterschrift_am, unterschrift_name")
      .single();
    if (error) { toast({ variant: "destructive", title: "Nicht möglich", description: error.message }); return; }
    setBeleg(data);
  };

  const pdf = async () => {
    if (!beleg) return;
    setPdfLaeuft(true);
    try {
      const { blob, nummer } = await belegPdfErzeugen(beleg.id, layout);
      blobHerunterladen(blob, `${nummer}.pdf`);
    } catch (e: any) {
      toast({ variant: "destructive", title: "PDF nicht erstellt", description: e?.message || String(e) });
    } finally {
      setPdfLaeuft(false);
    }
  };

  if (laedt) {
    return (
      <div className="min-h-screen bg-background">
        <KBToolbar onBack={() => navigate(-1)} title="Lieferschein" />
        <p className="p-6 text-muted-foreground">Wird geladen …</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <KBToolbar onBack={() => navigate(beleg ? "/invoices?tab=lieferschein" : -1 as any)} title={beleg ? `Lieferschein ${beleg.nummer || ""}` : "Neuer Lieferschein"}>
        <KBToolbarButton icon={ArrowLeft} label="Zur Liste" onClick={() => navigate("/invoices?tab=lieferschein")} />
      </KBToolbar>

      <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 sm:px-4">
        {beleg && (
          <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            beleg.status === "offen" ? "border-orange-300 bg-orange-50 text-orange-900"
            : beleg.status === "verrechnet" ? "border-blue-300 bg-blue-50 text-blue-900"
            : "border-border bg-muted"}`}>
            {beleg.status === "offen" || beleg.status === "verrechnet"
              ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Truck className="h-4 w-4 shrink-0" />}
            <span className="font-medium">{STATUS_TEXT[beleg.status] || beleg.status}</span>
            {beleg.unterschrift_am && (
              <span className="ml-auto text-xs opacity-80">
                unterschrieben von {beleg.unterschrift_name || "—"} · {seitWann(beleg.unterschrift_am)}
              </span>
            )}
          </div>
        )}

        {/* ── Kunde & Lieferung ── */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Kunde & Lieferung</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kunde</Label>
              <CustomerSelect value={customerId} onChange={(cid, c) => { setCustomerId(cid); setKunde(c); if (cid) setKundeFrei(""); }} />
            </div>
            {!customerId && (
              <div className="space-y-1.5">
                <Label htmlFor="ls-kunde-frei">… oder Name eintippen (Kunde noch nicht angelegt)</Label>
                <Input id="ls-kunde-frei" className="h-11" value={kundeFrei} onChange={(e) => setKundeFrei(e.target.value)} placeholder="z. B. Fa. Huber Transporte" />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ls-datum">Datum</Label>
                <Input id="ls-datum" type="date" className="h-11" value={datum} onChange={(e) => setDatum(e.target.value)} disabled={gesperrt} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls-projekt">Projekt (optional)</Label>
                <select id="ls-projekt" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={projektId} onChange={(e) => setProjektId(e.target.value)} disabled={gesperrt}>
                  <option value="">— kein Projekt —</option>
                  {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ls-adresse">Lieferadresse (wenn nicht die Kundenadresse)</Label>
              <Input id="ls-adresse" className="h-11" value={lieferadresse} onChange={(e) => setLieferadresse(e.target.value)} placeholder="Baustelle, Straße, Ort" disabled={gesperrt} />
            </div>
          </CardContent>
        </Card>

        {/* ── Positionen ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Was wird geliefert?</CardTitle>
            <p className="text-xs text-muted-foreground">Ohne Preise — die kommen erst in der Rechnung.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {zeilen.map((z, i) => (
              <div key={i} className="grid grid-cols-[4.5rem_5.5rem_1fr_2.5rem] items-center gap-1.5">
                <Input inputMode="decimal" className="h-11 text-right" value={z.menge} placeholder="1"
                  onChange={(e) => zeileAendern(i, { menge: e.target.value })} disabled={gesperrt} aria-label="Menge" />
                <select className="h-11 rounded-md border border-input bg-background px-2 text-sm" value={z.einheit}
                  onChange={(e) => zeileAendern(i, { einheit: e.target.value })} disabled={gesperrt} aria-label="Einheit">
                  {[z.einheit, ...einheiten].filter((v, k, a) => v && a.indexOf(v) === k).map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <Input className="h-11" value={z.text} placeholder="z. B. Holzpaket KVH 12/12"
                  onChange={(e) => zeileAendern(i, { text: e.target.value })} disabled={gesperrt} aria-label="Bezeichnung" />
                <Button type="button" variant="ghost" size="icon" className="h-11 w-10 text-muted-foreground" title="Zeile entfernen"
                  onClick={() => setZeilen((alt) => alt.length > 1 ? alt.filter((_, k) => k !== i) : alt)} disabled={gesperrt}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!gesperrt && (
              <Button type="button" variant="outline" className="h-11 w-full gap-2"
                onClick={() => setZeilen((alt) => [...alt, leereZeile(alt[alt.length - 1]?.einheit || "Stk")])}>
                <Plus className="h-4 w-4" /> Zeile
              </Button>
            )}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="ls-notiz">Notiz (optional)</Label>
              <Textarea id="ls-notiz" rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Abholung durch Frächter Müller, LKW W-12345" disabled={gesperrt} />
            </div>
          </CardContent>
        </Card>

        {/* ── Fotos (erst nach dem Speichern — sie hängen an der Beleg-ID) ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4" /> Fotos vom Verladen</CardTitle>
          </CardHeader>
          <CardContent>
            {beleg ? (
              <BelegFotos invoiceId={beleg.id} canEdit={!gesperrt} />
            ) : (
              <p className="text-sm text-muted-foreground">Zuerst speichern — dann kannst du hier fotografieren.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Unterschrift ── */}
        {beleg && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4" /> Übernahme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {beleg.unterschrift_kunde ? (
                <div className="flex flex-wrap items-center gap-4">
                  <img src={beleg.unterschrift_kunde} alt="Unterschrift" className="h-20 rounded border bg-white" />
                  <div className="text-sm">
                    <div className="font-medium">{beleg.unterschrift_name || "—"}</div>
                    <div className="text-muted-foreground">
                      {beleg.unterschrift_am ? new Date(beleg.unterschrift_am).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" }) : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Noch nicht unterschrieben. Ohne Unterschrift druckt das PDF zwei Linien zum Unterschreiben von Hand.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Feste Aktionsleiste unten ── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
          {!gesperrt && (
            <Button className="h-12 flex-1 min-w-[10rem]" variant={beleg ? "outline" : "default"} onClick={() => void speichern()} disabled={speichert}>
              {speichert ? "Speichert …" : beleg ? "Änderungen speichern" : "Speichern"}
            </Button>
          )}
          {beleg && darfUnterschreiben(beleg.status, beleg.unterschrift_kunde) && (
            <Button className="h-12 flex-1 min-w-[10rem] gap-2" onClick={() => setUnterschriftOffen(true)}>
              <PenLine className="h-5 w-5" /> Unterschreiben
            </Button>
          )}
          {beleg && beleg.status === "entwurf" && !beleg.unterschrift_kunde && (
            <Button className="h-12 gap-2" variant="outline" onClick={() => void uebergebenOhne()} title="Ohne Unterschrift als übergeben markieren">
              <CheckCircle2 className="h-5 w-5" /> Übergeben
            </Button>
          )}
          {beleg && (
            <Button className="h-12 gap-2" variant="outline" onClick={() => void pdf()} disabled={pdfLaeuft}>
              <FileDown className="h-5 w-5" /> {pdfLaeuft ? "PDF …" : "PDF"}
            </Button>
          )}
        </div>
      </div>

      {beleg && (
        <LieferscheinUnterschriftDialog
          open={unterschriftOffen}
          onOpenChange={setUnterschriftOffen}
          vorschlagName={beleg.kunde_name}
          onBestaetigen={unterschreiben}
        />
      )}
    </div>
  );
}
