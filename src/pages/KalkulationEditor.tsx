import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, FileText, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const LS_KEY = "auftragskalkulation";

/** Parst einen deutschen Euro-String ("10.200,00 €") in eine Zahl. */
function parseEuro(s: string | null | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Findet die Projektübersicht-Tabelle im Tool-DOM. */
function findUebersicht(doc: Document): HTMLTableElement | null {
  let table: HTMLTableElement | null = null;
  doc.querySelectorAll("table").forEach((t) => {
    const heads = Array.from(t.querySelectorAll("th")).map((th) => (th.textContent || "").trim().toLowerCase());
    if (heads.includes("aufbau") && heads.some((h) => h.includes("pro qm"))) table = t as HTMLTableElement;
  });
  return table;
}

interface KalkPosition { beschreibung: string; menge: number; einheit: string; einzelpreis: number; gesamtpreis: number; }

/** Liest Positionen + Projekt-Gesamtsumme aus der Tool-Tabelle. */
function scrapePositionen(doc: Document): { positions: KalkPosition[]; projektGesamt: number } {
  const table = findUebersicht(doc);
  const positions: KalkPosition[] = [];
  let projektGesamt = 0;
  if (!table) return { positions, projektGesamt };
  table.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
    if (cells.length < 6) return;
    const name = cells[0];
    const gesamt = parseEuro(cells[4]);
    const proQm = parseEuro(cells[5]);
    if (/gesamt\s*\(projekt\)/i.test(name)) { projektGesamt = gesamt; return; }
    if (gesamt <= 0) return;
    const beschreibung = cells[1] ? `${name}\n${cells[1]}` : name;
    if (proQm > 0) positions.push({ beschreibung, menge: round2(gesamt / proQm), einheit: "m²", einzelpreis: round2(proQm), gesamtpreis: round2(gesamt) });
    else positions.push({ beschreibung, menge: 1, einheit: "Pauschale", einzelpreis: round2(gesamt), gesamtpreis: round2(gesamt) });
  });
  return { positions, projektGesamt };
}

export default function KalkulationEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef<string>("");

  // Kalkulation laden → in localStorage schreiben → DANN Iframe rendern,
  // damit das Tool den Zustand beim Init übernimmt (same-origin localStorage).
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      if (!id) return;
      const { data } = await (supabase.from("kalkulationen" as never) as any)
        .select("id, name, customer_id, data").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (!data) { toast({ variant: "destructive", title: "Nicht gefunden", description: "Kalkulation existiert nicht (mehr)." }); navigate("/auftragskalkulation"); return; }
      setName((data as any).name || "");
      setCustomerId((data as any).customer_id || null);
      try {
        if ((data as any).data) {
          localStorage.setItem(LS_KEY, JSON.stringify((data as any).data));
          lastSaved.current = JSON.stringify((data as any).data);
        } else {
          localStorage.removeItem(LS_KEY); // neue Kalkulation → Tool startet leer
          lastSaved.current = "";
        }
      } catch { /* ignore */ }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [id, navigate, toast]);

  // Aktuellen Zustand aus localStorage + Summe aus dem Tool-DOM lesen.
  const readState = useCallback(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(LS_KEY); } catch { /* ignore */ }
    let summe = 0;
    const doc = iframeRef.current?.contentDocument;
    if (doc) summe = scrapePositionen(doc).projektGesamt;
    return { raw, summe };
  }, []);

  const persist = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id) return;
    const { raw, summe } = readState();
    if (!raw) return;
    if (raw === lastSaved.current && !opts?.silent) {
      toast({ title: "Gespeichert", description: "Kalkulation ist aktuell." });
      return;
    }
    if (raw === lastSaved.current) return;
    if (!opts?.silent) setSaving(true);
    const { error } = await (supabase.from("kalkulationen" as never) as any)
      .update({ data: JSON.parse(raw), summe }).eq("id", id);
    if (!opts?.silent) setSaving(false);
    if (error) { if (!opts?.silent) toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    lastSaved.current = raw;
    if (!opts?.silent) toast({ title: "Gespeichert", description: "Kalkulation gespeichert." });
  }, [id, readState, toast]);

  // Autosave alle 15s (still) + beim Verlassen.
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => { persist({ silent: true }); }, 15000);
    const onHide = () => { persist({ silent: true }); };
    window.addEventListener("beforeunload", onHide);
    return () => { clearInterval(t); window.removeEventListener("beforeunload", onHide); persist({ silent: true }); };
  }, [ready, persist]);

  // Projektname im Tool best-effort vorbefüllen (kosmetisch).
  const handleIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      const input = doc?.querySelector('input[placeholder*="Projektname"]') as HTMLInputElement | null;
      if (input && !input.value && name) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, name);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch { /* ignore */ }
  };

  const handleAngebot = async () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) { toast({ variant: "destructive", title: "Noch nicht bereit", description: "Bitte kurz warten, bis die Kalkulation geladen ist." }); return; }
    const { positions, projektGesamt } = scrapePositionen(doc);
    if (positions.length === 0) { toast({ variant: "destructive", title: "Noch nichts kalkuliert", description: "Es wurden keine Aufbauten mit Betrag gefunden." }); return; }
    const summe = positions.reduce((s, p) => s + p.gesamtpreis, 0);
    const nebenkosten = round2(projektGesamt - summe);
    if (nebenkosten > 0.5) positions.push({ beschreibung: "Transport, Kran & sonstige Nebenkosten (lt. Kalkulation)", menge: 1, einheit: "Pauschale", einzelpreis: nebenkosten, gesamtpreis: nebenkosten });
    await persist({ silent: true });
    sessionStorage.setItem("kalkulation_to_angebot", JSON.stringify({
      betreff: name ? `Angebot – ${name}` : "Angebot lt. Kalkulation",
      customer_id: customerId,
      items: positions,
    }));
    navigate("/invoices/new?typ=angebot&from_kalkulation=1");
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="border-b bg-card flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-2.5 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => { persist({ silent: true }); navigate("/auftragskalkulation"); }}>
          <ArrowLeft className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Zurück</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold truncate">{name || "Kalkulation"}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => persist()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <Save className="h-4 w-4 sm:mr-2" />}
          <span className="hidden sm:inline">Speichern</span>
        </Button>
        <Button size="sm" onClick={handleAngebot} title="Aufbauten als Positionen in ein neues Angebot übernehmen">
          <FileText className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Als Angebot übernehmen</span>
        </Button>
        <Button variant="ghost" size="icon" asChild title="Tool in neuem Tab öffnen">
          <a href="/auftragskalkulation-tool.html" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
        </Button>
      </header>

      <div className="flex-1 relative bg-white">
        {ready ? (
          <iframe
            key={id}
            ref={iframeRef}
            src="/auftragskalkulation-tool.html"
            title={`Auftragskalkulation ${name}`}
            onLoad={handleIframeLoad}
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Kalkulation wird geladen …
          </div>
        )}
      </div>
    </div>
  );
}
