import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Save, Download, Copy, ArrowRightLeft, AlertTriangle, Package, Ban, FileDown, TrendingUp, Eye, EyeOff, Import, FileText, Printer, Star, ChevronUp, ChevronDown, ChevronRight, Layers, X, Pencil, Undo2, MapPin, Calculator, RefreshCw, CheckCircle2, Type, User, Percent } from "lucide-react";
import { KBToolbar, KBToolbarButton, KBButton } from "@/components/kingbill";
import { InvoicePdfPreview } from "@/components/InvoicePdfPreview";
import { InvoiceLivePreview } from "@/components/InvoiceLivePreview";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { KalkulationFields } from "@/components/KalkulationFields";
import { calcEinzelpreis, type KalkulationInput } from "@/lib/kalkulation";
import {
  buildAngebotItems, calcMargeProzent, calcProjekt, margeAmpel,
  normalizeKalkulationState, resolveBetriebsdaten,
  type AngebotItem, type ProjektErgebnis,
} from "@/lib/kalkulationEngine";
import { usePermissions } from "@/hooks/usePermissions";
import { ImportMaterialsDialog } from "@/components/ImportMaterialsDialog";
import { ImportFromProjectDialog } from "@/components/ImportFromProjectDialog";
import { ImportDisturbanceDialog } from "@/components/ImportDisturbanceDialog";
import { ImportFromOfferDialog } from "@/components/ImportFromOfferDialog";
import { useEinheiten } from "@/hooks/useEinheiten";
import { ImportDisturbanceToInvoiceDialog } from "@/components/ImportDisturbanceToInvoiceDialog";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { format, addMonths, parseISO } from "date-fns";
import { type InvoiceLayoutSettings, DEFAULT_LAYOUT, parseLayoutSettings } from "@/lib/invoiceLayoutTypes";
import { loadInvoiceLogo } from "@/lib/logoLoader";
import { CustomerSelect, type CustomerData } from "@/components/CustomerSelect";
import { CustomerEditDialog } from "@/components/CustomerEditDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDocConfig } from "@/lib/documentTypes";
import { PriceAdjustDialog } from "@/components/PriceAdjustDialog";
import { type AdjustLine } from "@/lib/priceAdjust";
import { EXECUTING_COMPANIES } from "@/lib/executingCompanies";
import { parseDecimal, toNumber, clamp, formatForInput } from "@/lib/num";

/** Geldbetrag auf Cent runden. */
const round2 = (v: number): number =>
  isFinite(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : 0;

/**
 * Geldbetrag in österreichischer Schreibweise: 1187.5 → "1.187,50".
 * Vorher stand im Editor überall `toFixed(2)`, also "1187.50" — direkt neben
 * der Beleg-Vorschau, die korrekt "1.187,50" zeigte. Wer Beträge im Komma-
 * Format eingibt, muss sie auch im Komma-Format zurückbekommen.
 */
const eur = (v: number | null | undefined): string => {
  const n = Number(v);
  if (!isFinite(n)) return "0,00";
  const teile = Math.abs(n).toFixed(2).split(".");
  teile[0] = teile[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + teile.join(",");
};
/** Menge auf 3 Nachkommastellen runden (mehr druckt kein Beleg). */
const round3 = (v: number): number =>
  isFinite(v) ? Math.round((v + Number.EPSILON) * 1000) / 1000 : 0;

/**
 * Belegarten, die wie eine Rechnung behandelt werden: sie sind nach dem
 * Ausstellen gesperrt, können Zahlungen erfassen und werden storniert
 * (statt gelöscht). Vorher hing all das an `typ === "rechnung"`, weshalb
 * Anzahlungs-, Schluss- und Gutschriftbelege nachträglich editierbar blieben
 * und keine Zahlung annehmen konnten.
 */
const RECHNUNGSARTIGE_TYPEN = new Set([
  "rechnung",
  "anzahlungsrechnung",
  "schlussrechnung",
  "gutschrift",
]);

/** Belegarten, auf die eine Zahlung gebucht werden kann. */
const ZAHLBARE_TYPEN = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);

/**
 * Belegarten, von denen es je Vorgänger-Beleg nur EINEN geben darf.
 * (Anzahlungsrechnungen und Lieferscheine sind bewusst NICHT dabei — davon
 * gibt es zu einem Auftrag legitim mehrere.)
 */
const EINMALIGE_FOLGETYPEN = new Set([
  "rechnung",
  "schlussrechnung",
  "auftragsbestaetigung",
]);

interface InvoiceItem {
  id?: string;
  position: number;
  beschreibung: string;
  kurztext?: string;
  langtext?: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabatt_prozent?: number;
  produktnummer?: string;
  gesamtpreis: number;
  // Wenn true, ist gesamtpreis bereits BRUTTO und wird aus der MwSt-
  // Berechnung ausgenommen (Anzahlungs-Abzüge in Schlussrechnungen).
  mwst_exempt?: boolean;
  // Set-Summary: wenn gesetzt, ist diese Zeile eine Material-Set-Summary.
  // Das PDF/HTML rendert weiterhin nur die Zeile — der Snapshot ist nur
  // für interne Nachkalkulation im Rechnungs-Editor sichtbar.
  set_template_id?: string | null;
  set_snapshot?: any;
  // Kalkulation (Excel-Modell): wenn ist_kalkuliert, wird einzelpreis aus
  // EK + Verschnitt + Aufschlag + Lohn + Zuschlägen berechnet und ist im
  // Angebot pro Position anpassbar (zusätzlich greift der Dokument-Override).
  ist_kalkuliert?: boolean;
  kalkulation_template_id?: string | null;
  ek_preis?: number;
  verschnitt_prozent?: number;
  aufschlag_prozent?: number;
  befestigung_preis?: number;
  sonstiges_preis?: number;
  arbeitszeit_minuten?: number;
  stundensatz?: number;
  // ── Gruppen (Aufbauten) + Sichtbarkeit im Kundendokument ──────────────────
  // gruppe            = Kapitelname, z.B. "Aufbau 1 — Dach". Leer = ungruppiert.
  // ist_gruppensumme  = preistragende Sammelzeile der Gruppe (Kunde sieht sie immer).
  // auf_pdf           = erscheint die Zeile im Kundendokument? Default true.
  // Detailzeilen einer Gruppe tragen gesamtpreis 0 (ihr interner Wert steht in
  // ek_preis), damit die Belegsumme nicht doppelt zählt.
  gruppe?: string | null;
  auf_pdf?: boolean;
  ist_gruppensumme?: boolean;
}

/** Kapitelname einer Position (getrimmt); "" = ungruppierte Position. */
const gruppeVon = (it: Pick<InvoiceItem, "gruppe">): string => String(it?.gruppe || "").trim();
/** Trägt die Zeile einen Betrag in der Belegsumme? (Cent-Toleranz) */
const traegtBetrag = (it: Pick<InvoiceItem, "gesamtpreis">): boolean =>
  Math.abs(Number(it?.gesamtpreis) || 0) > 0.004;
/**
 * Sieht der Kunde die Zeile? (auf_pdf undefined = ja — Bestandsschutz.)
 *
 * HARTE REGEL — identisch zu buildDruckplan in invoiceHtml.ts: Zeilen mit
 * Betrag sind IMMER sichtbar. Die Belegsumme zählt jede Position mit
 * gesamtpreis ≠ 0; fehlte eine davon im Kundendokument, ginge der Beleg
 * nicht auf. Ausblendbar sind genau die betragslosen Detail-/Textzeilen.
 */
const istSichtbar = (it: Pick<InvoiceItem, "auf_pdf" | "gesamtpreis">): boolean =>
  it?.auf_pdf !== false || traegtBetrag(it);
/** Eindeutiger Schlüssel „Gruppe + Beschreibung" (kollisionsfrei via JSON). */
const gruppeSchluessel = (gruppe: string, beschreibung: string): string =>
  JSON.stringify([gruppe, beschreibung]);

/** Detailzeile = Teil einer Gruppe, aber nicht deren Sammelzeile. */
const istDetailzeile = (it: Pick<InvoiceItem, "gruppe" | "ist_gruppensumme">): boolean =>
  !!gruppeVon(it) && !it?.ist_gruppensumme;

/**
 * Interne SELBSTKOSTEN einer Position in € (0 = keine Kostendaten bekannt).
 *
 * Drei Fälle — die Belegzeilen tragen ihre internen Werte historisch in
 * derselben Spalte (ek_preis), aber mit unterschiedlicher Bedeutung:
 *
 *  1. GRUPPEN-SAMMELZEILE aus der Auftragskalkulation: ek_preis = Selbstkosten
 *     des ganzen Aufbaus (Material-EK + Lohn-Selbstkosten + Fahrten +
 *     Fremdleistungen), gesetzt beim „Als Angebot übernehmen".
 *  2. DETAILZEILE einer Gruppe: ek_preis ist die VERKAUFS-Aufschlüsselung
 *     (Material-VK, Arbeitszeit, Fahrten …). Diese Beträge summieren sich
 *     exakt zur Sammelzeile — als Kosten gewertet ergäbe das immer einen
 *     Deckungsbeitrag von 0. Deshalb: keine Kosten.
 *  3. KLASSISCHE kalkulierte Position (Excel-Modell, KalkulationFields):
 *     ek_preis = Material-EK je Einheit. Selbstkosten = derselbe Einzelpreis
 *     OHNE Material-Aufschlag (also EK + Verschnitt + Befestigung +
 *     Sonstiges + Lohn) × Menge. Der Aufschlag ist genau der Verdienst.
 */
const selbstkostenVon = (it: InvoiceItem): number => {
  const ek = Number(it.ek_preis) || 0;
  if (ek <= 0) return 0;
  if (it.ist_gruppensumme) return round2(ek);
  if (istDetailzeile(it)) return 0;
  if (it.ist_kalkuliert) {
    const kosten = calcEinzelpreis({
      ek_preis: ek,
      verschnitt_prozent: Number(it.verschnitt_prozent) || 0,
      aufschlag_prozent: 0,
      befestigung_preis: Number(it.befestigung_preis) || 0,
      sonstiges_preis: Number(it.sonstiges_preis) || 0,
      arbeitszeit_minuten: Number(it.arbeitszeit_minuten) || 0,
      stundensatz: Number(it.stundensatz) || 52,
    });
    return round2(kosten * (Number(it.menge) || 0));
  }
  return 0;
};

/**
 * Ergänzt frisch gebaute Angebots-Positionen um die Selbstkosten je Aufbau
 * (siehe selbstkostenVon, Fall 1). Zuordnung über die Reihenfolge:
 * buildAngebotItems erzeugt je Aufbau mit Betrag > 0 genau eine Sammelzeile.
 *
 * (Identische Funktion in KalkulationEditor.tsx — bewusst dupliziert, damit
 * kalkulationEngine.ts unangetastet bleibt.)
 */
const mitSelbstkosten = (angebotItems: AngebotItem[], projekt: ProjektErgebnis): AngebotItem[] => {
  const zeilenMitBetrag = projekt.zeilen.filter(z => round2(z.gesamtAdj) > 0);
  let k = 0;
  return angebotItems.map(it => {
    if (!it.ist_gruppensumme) return it;
    const zeile = zeilenMitBetrag[k];
    k += 1;
    return { ...it, ek_preis: round2(zeile?.verdienst.selbstkosten ?? 0) };
  });
};

const GRUPPEN_SPALTEN = ["gruppe", "auf_pdf", "ist_gruppensumme"] as const;
/** Insert scheiterte NUR an den (noch) fehlenden Gruppen-Spalten? */
const isGruppenSpaltenFehlen = (err: any): boolean =>
  typeof err?.message === "string" &&
  GRUPPEN_SPALTEN.some((c) => err.message.includes(c)) &&
  /(schema cache|column .* does not exist)/i.test(err.message);
/** Payload ohne die Gruppen-Spalten (Fallback bei fehlender Migration). */
const ohneGruppenSpalten = (row: any): any => {
  const next = { ...row };
  for (const c of GRUPPEN_SPALTEN) delete next[c];
  return next;
};

interface InvoiceData {
  typ: string;
  nummer: string;
  laufnummer: number;
  jahr: number;
  status: string;
  kunde_name: string;
  kunde_anrede: string;
  kunde_titel: string;
  kunde_adresse: string;
  kunde_plz: string;
  kunde_ort: string;
  kunde_land: string;
  kunde_email: string;
  kunde_telefon: string;
  kunde_uid: string;
  kundennummer: string;
  reverse_charge: boolean;
  datum: string;
  faellig_am: string;
  leistungsdatum: string;
  leistungsdatum_bis: string;
  // Gutschrift-Verrechnung (Migration 20260511000000)
  verrechnet_mit_invoice_id: string | null;
  verrechnet_am: string;
  // Allgemeine Angaben (Angebot + AB) — siehe src/lib/allgemeineAngaben.ts.
  // Der Toggle steuert, ob die Tabelle im PDF/HTML überhaupt erscheint.
  // Felder werden auch bei aktiv=false weiter gespeichert, damit beim
  // erneuten Aktivieren die Werte noch da sind.
  allgemeine_angaben_aktiv: boolean;
  leistungsbeschreibung: string;
  ausfuehrungsort: string;
  ausfuehrungs_kw: string;
  ausfuehrende_firma: string;
  ausfuehrende_firma_freitext: string;
  zahlungsbedingungen: string;
  notizen: string;
  betreff: string;
  mwst_satz: number;
  project_id: string | null;
  bezahlt_betrag: number;
  customer_id: string | null;
  gueltig_bis: string;
  rabatt_prozent: number;
  rabatt_betrag: number;
  mahnstufe: number;
  skonto_prozent: number;
  skonto_tage: number;
  storno_nummer: string;
  storno_datum: string;
  storno_grund: string;
  // Dokument-Genealogie + Anzahlung
  parent_invoice_id?: string | null;
  anzahlung_prozent?: number | null;
  anzahlung_betrag?: number | null;
  // Ansprechpartner pro Dokument (Sachbearbeiter).
  // employee_id = Referenz auf employees, daraus wird Name/Tel/Email
  // als Snapshot in die Freitext-Felder geschrieben (stabile Historie).
  ansprechpartner_employee_id?: string | null;
  ansprechpartner_name?: string;
  ansprechpartner_telefon?: string;
  ansprechpartner_email?: string;
  // Dokumentweiter Aufschlag-Override: überschreibt den Material-Aufschlag
  // ALLER kalkulierten Positionen (NULL = jede Position nutzt ihren eigenen).
  kalkulation_aufschlag_override?: number | null;
}

interface TemplateItem {
  id: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  kategorie: string;
  ist_favorit?: boolean;
  ist_set?: boolean;
}

interface StoredPdf {
  name: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  entwurf: "bg-muted text-muted-foreground",
  offen: "bg-blue-100 text-blue-800",
  bezahlt: "bg-green-100 text-green-800",
  teilbezahlt: "bg-yellow-100 text-yellow-800",
  storniert: "bg-red-100 text-red-800",
  abgelehnt: "bg-red-100 text-red-800",
  angenommen: "bg-[#002337]/10 text-[#002337] border border-[#002337]/20",
  verrechnet: "bg-purple-100 text-purple-800",
};

const statusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  offen: "Offen",
  bezahlt: "Bezahlt",
  teilbezahlt: "Teilbezahlt",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt",
  angenommen: "Angenommen",
  verrechnet: "Verrechnet",
};

/**
 * Mappt einen Netto-Tage-Wert (aus customers.nettofrist) auf einen der
 * Dropdown-Werte. Treffer auf Standard-Optionen (0/7/14/30/60) werden
 * direkt übernommen; alles andere landet auf "individuell", sodass
 * faellig_am manuell gesetzt werden muss.
 */
function nettofristToDropdown(nettofrist: number): string {
  if (nettofrist <= 0) return "sofort";
  if ([7, 14, 30, 60].includes(nettofrist)) return `${nettofrist} Tage`;
  return "individuell";
}

/**
 * KingBill-Wizard: Der Beleg-Editor ist in drei nummerierte Schritte
 * gegliedert (1. Allgemein / 2. Kunde / 3. Artikel). Die drei großen
 * Wizard-Tab-Buttons sitzen wie im Original in der blauen Toolbar oben
 * (aktiver Tab gelb-orange umrandet) und springen per Klick zum Abschnitt;
 * der aktive Tab folgt der Scroll-Position (Scroll-Spy).
 */
const WIZARD_STEPS = [
  { id: "step-allgemein", num: 1, label: "Allgemein", icon: Type },
  { id: "step-kunde", num: 2, label: "Kunde", icon: User },
  { id: "step-positionen", num: 3, label: "Artikel", icon: Package },
] as const;

function StepSectionHeader({ num, label, id }: { num: number; label: string; id: string }) {
  return (
    <div id={id} className="scroll-mt-32 flex items-center gap-2.5 pt-1">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {num}
      </span>
      <h2 className="text-lg font-semibold">{num}. {label}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * KingBill-Wizard-Tabs: die drei großen Tab-Buttons („1. Allgemein" /
 * „2. Kunde" / „3. Artikel") für die blaue Editor-Toolbar. Der aktive Tab
 * bekommt die gelb-orange Umrandung (.kb-tab-active).
 */
function KBWizardTabs({
  activeStep,
  onStepClick,
}: {
  activeStep: number;
  onStepClick: (step: (typeof WIZARD_STEPS)[number]) => void;
}) {
  return (
    <>
      {WIZARD_STEPS.map((s) => {
        const Icon = s.icon;
        const active = activeStep === s.num;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onStepClick(s)}
            /* min-w-[42px]: am Handy darf der Tab nicht unter die
               Lesbarkeit der Schrittnummer schrumpfen. */
            className={`${active ? "kb-tab-active" : "kb-tab"} min-w-[42px] justify-center sm:justify-start`}
            aria-current={active ? "step" : undefined}
          >
            {/* Am Handy nur die Schrittnummer — Icon + Text nebeneinander
                passen in 390 px nicht und würden beide abgeschnitten. */}
            <Icon className="hidden h-5 w-5 shrink-0 text-kb-blue-dark sm:block" />
            <span className="truncate font-bold sm:font-semibold">
              {s.num}.<span className="hidden sm:inline"> {s.label}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const einheiten = useEinheiten();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Warnung bei Schließen/Reload mit ungespeicherten Änderungen
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // KingBill: Dialog „Änderungen speichern?" beim Verlassen mit
  // ungespeicherten Änderungen (Zurück-Button der Toolbar / Abbrechen unten).
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const handleBackNav = () => {
    if (isDirty) {
      setLeaveDialogOpen(true);
      return;
    }
    navigate("/invoices");
  };

  // KingBill-Schrittleiste: aktiver Schritt folgt der Scroll-Position
  // (leichter Scroll-Spy — der oberste Abschnitt über der Marke gewinnt).
  const [activeStep, setActiveStep] = useState(1);
  useEffect(() => {
    if (loading) return;
    const onScroll = () => {
      let current = 1;
      WIZARD_STEPS.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 140) current = i + 1;
      });
      setActiveStep(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [loading]);

  const scrollToStep = (step: (typeof WIZARD_STEPS)[number]) => {
    setActiveStep(step.num);
    document.getElementById(step.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * Positionen: Tabelle oder Karten?
   *
   * Nicht am Viewport festgemacht, sondern am tatsächlich verfügbaren Platz —
   * am Handy ist es immer eng, am Desktop wird der Editor durch die
   * angedockte Live-Vorschau ebenfalls schmal (auf 1440 px bleiben nur ~770 px
   * übrig — die acht Tabellenspalten quetschen Mengen- und Preisfeld dann auf
   * ~46 px zusammen, unlesbar). Unter POS_TABLE_MIN_PX wechselt die Darstellung
   * deshalb auf eine Karte je Position. Praktische Faustregel: Live-Vorschau
   * offen → Karten, Vorschau zugeklappt → die gewohnte KingBill-Tabelle.
   */
  const POS_TABLE_MIN_PX = 960;
  const posWrapRef = useRef<HTMLDivElement>(null);
  const [posNarrow, setPosNarrow] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1000
  );
  // Handy-Erkennung für Toolbar-Beschriftungen (kurze Labels statt Umbruch).
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const el = posWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w > 0) setPosNarrow(w < POS_TABLE_MIN_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);
  const [invoiceId, setInvoiceId] = useState<string | null>(isNew ? null : id || null);
  /**
   * Optimistic Locking: der `updated_at`-Stand, den DIESER Tab geladen hat.
   * Beim Speichern wird er als Bedingung mitgeschickt — hat ein anderer Tab
   * den Beleg zwischenzeitlich geändert, trifft das Update 0 Zeilen und wir
   * überschreiben nichts, sondern melden es. Nach jedem eigenen Schreibvorgang
   * (Zahlung, Storno, Mahnung …) muss der Stand nachgezogen werden.
   */
  const [geladenerStand, setGeladenerStand] = useState<string | null>(null);
  const standNachziehen = useCallback(async (invId: string | null) => {
    if (!invId) return;
    const { data } = await supabase.from("invoices").select("updated_at").eq("id", invId).maybeSingle();
    if ((data as any)?.updated_at) setGeladenerStand((data as any).updated_at as string);
  }, []);
  const [items, setItems] = useState<InvoiceItem[]>([
    { position: 1, beschreibung: "", menge: 1, einheit: "Stk.", einzelpreis: 0, gesamtpreis: 0 },
  ]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  // Aktive Mitarbeiter als Pool für den Ansprechpartner-Picker
  const [employees, setEmployees] = useState<{ id: string; vorname: string; nachname: string; telefon: string | null; email: string | null; position: string | null }[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("alle");
  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null);
  /**
   * Aufgeklappte Aufbau-Gruppen (Key = Gruppenname). Detailzeilen sind
   * standardmäßig EINGEKLAPPT — sonst ertrinkt der Chef bei fünf Aufbauten
   * mit je 15 Materialzeilen in der Liste.
   */
  // Gruppen sind standardmäßig AUFGEKLAPPT: der Anwender soll sofort sehen,
  // woraus ein Aufbau besteht (Material, Arbeitszeit, Fahrten …). Nur explizit
  // zugeklappte Gruppen stehen hier auf false.
  const [gruppenOffen, setGruppenOffen] = useState<Record<string, boolean>>({});
  const istGruppeOffen = (g: string) => gruppenOffen[g] !== false;
  const toggleGruppe = (g: string) =>
    setGruppenOffen(prev => ({ ...prev, [g]: prev[g] === false }));
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templateMengen, setTemplateMengen] = useState<Record<string, number>>({});
  const [addedFromDialog, setAddedFromDialog] = useState<{ name: string; menge: number; einheit: string }[]>([]);
  const [storedPdfs, setStoredPdfs] = useState<StoredPdf[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSaved, setPreviewSaved] = useState(false);
  const [importMaterialsOpen, setImportMaterialsOpen] = useState(false);
  const [importDisturbanceOpen, setImportDisturbanceOpen] = useState(false);
  const [importRegieOpen, setImportRegieOpen] = useState(false);
  const [customerEditOpen, setCustomerEditOpen] = useState(false);
  // Bezugs-Picker bei Standalone-Gutschrift: Liste der bestehenden
  // Rechnungen für die Vorlagen-Auswahl. Lazy-loaded nur bei
  // isNew + typ=gutschrift, um den Initial-Fetch nicht zu verteuern.
  const [projectRechnungen, setProjectRechnungen] = useState<Array<{ id: string; nummer: string; kunde_name: string; datum: string }>>([]);
  // Bezugs-Info zur parent invoice — für PDF/Preview-Render der
  // Zeile "Bezug: Rechnung RE_2026_005 vom 27.04.2026". Wird bei
  // parent_invoice_id-Wechsel async nachgeladen.
  const [parentRefInfo, setParentRefInfo] = useState<{ nummer: string; datum: string } | null>(null);
  // Gutschrift-Verrechnungs-Dialog (Phase 1+4)
  const [verrechnungDialogOpen, setVerrechnungDialogOpen] = useState(false);
  const [verrechnungDate, setVerrechnungDate] = useState<string>("");
  const [verrechnungZielInvoice, setVerrechnungZielInvoice] = useState<string>("_none");
  const [verrechnungZielOptions, setVerrechnungZielOptions] = useState<Array<{ id: string; nummer: string; brutto_summe: number; bezahlt_betrag: number; status: string }>>([]);
  const [verrechnungSaving, setVerrechnungSaving] = useState(false);
  const [fromAngebotId, setFromAngebotId] = useState<string | null>(null);
  const [importOfferOpen, setImportOfferOpen] = useState(false);
  const [importTimeOpen, setImportTimeOpen] = useState(false);
  const [priceAdjustOpen, setPriceAdjustOpen] = useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [stornoDialogOpen, setStornoDialogOpen] = useState(false);
  const [stornoGrund, setStornoGrund] = useState("");
  const [stornoLaeuft, setStornoLaeuft] = useState(false);
  // Umwandlungs-Dialoge
  const [anzahlungDialogOpen, setAnzahlungDialogOpen] = useState(false);
  const [anzahlungProzentInput, setAnzahlungProzentInput] = useState<string>("30");
  const [anzahlungBetragInput, setAnzahlungBetragInput] = useState<string>("");
  // Welches Feld hat der User zuletzt angefasst? Bestimmt, ob wir mit
  // Prozent oder Fix-Betrag in die URL/Ladelogik gehen.
  const [anzahlungMode, setAnzahlungMode] = useState<"prozent" | "betrag">("prozent");
  // Summe bereits ausgestellter Anzahlungen zum gleichen Auftrag (für Kumulations-Check)
  const [bestehendeAnzahlungenNetto, setBestehendeAnzahlungenNetto] = useState<number>(0);
  // Dokumenten-Kette: Root (Angebot/AB) + alle abgeleiteten Dokumente. Zeigt
  // auf der Detailseite an, wo im Workflow wir sind, und macht Navigation
  // zwischen verknüpften Dokumenten möglich.
  interface ChainDoc { id: string; typ: string; nummer: string | null; datum: string | null; brutto_summe: number; status: string; }
  const [chainRoot, setChainRoot] = useState<ChainDoc | null>(null);
  const [chainChildren, setChainChildren] = useState<ChainDoc[]>([]);
  const [invoiceLayout, setInvoiceLayout] = useState<InvoiceLayoutSettings>(DEFAULT_LAYOUT);
  const [newProjectName, setNewProjectName] = useState("");

  // ── Herkunft Auftragskalkulation (Migration 20260722110000) ───────────────
  // invoices.kalkulation_id. Fehlt die Spalte noch, bleibt der Wert null und
  // sämtliche Kalkulations-Funktionen sind still deaktiviert.
  const [kalkulationId, setKalkulationId] = useState<string | null>(null);
  const [kalkulationName, setKalkulationName] = useState<string>("");
  /** Warnschwelle Marge aus app_settings.kalk_warn_marge_prozent (Default 35 %). */
  const [warnMargeProzent, setWarnMargeProzent] = useState<number>(35);
  const [kalkErsetzenOpen, setKalkErsetzenOpen] = useState(false);
  const [kalkErsetzenLaeuft, setKalkErsetzenLaeuft] = useState(false);
  const [kalkVerlassenOpen, setKalkVerlassenOpen] = useState(false);
  /** Nur Administratoren sehen den internen Verdienst-Block. */
  const { isAdmin } = usePermissions();

  // Payment tracking
  interface Payment { id: string; betrag: number; datum: string; notizen: string | null; }
  const [payments, setPayments] = useState<Payment[]>([]);
  const [mahnungen, setMahnungen] = useState<{ mahnstufe: number; created_at: string }[]>([]);
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentDate, setNewPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newPaymentNote, setNewPaymentNote] = useState("");
  const defaultTyp = searchParams.get("typ") || "rechnung";
  const defaultProjectId = searchParams.get("project") || null;

  const [form, setForm] = useState<InvoiceData>({
    typ: defaultTyp,
    nummer: "",
    laufnummer: 0,
    jahr: new Date().getFullYear(),
    status: defaultTyp === "rechnung" ? "offen" : "entwurf",
    kunde_name: "",
    kunde_anrede: "",
    kunde_titel: "",
    kunde_adresse: "",
    kunde_plz: "",
    kunde_ort: "",
    kunde_land: "Österreich",
    kunde_email: "",
    kunde_telefon: "",
    kunde_uid: "",
    kundennummer: "",
    reverse_charge: false,
    datum: format(new Date(), "yyyy-MM-dd"),
    faellig_am: format(new Date(Date.now() + 14 * 86400000), "yyyy-MM-dd"),
    leistungsdatum: format(new Date(), "yyyy-MM-dd"),
    leistungsdatum_bis: "",
    verrechnet_mit_invoice_id: null,
    verrechnet_am: "",
    allgemeine_angaben_aktiv: false,
    leistungsbeschreibung: "",
    ausfuehrungsort: "",
    ausfuehrungs_kw: "",
    ausfuehrende_firma: "",
    ausfuehrende_firma_freitext: "",
    zahlungsbedingungen: "14 Tage",
    notizen: "",
    betreff: "",
    mwst_satz: 20,
    project_id: defaultProjectId,
    bezahlt_betrag: 0,
    customer_id: null,
    gueltig_bis: defaultTyp === "angebot" ? format(addMonths(new Date(), 1), "yyyy-MM-dd") : "",
    rabatt_prozent: 0,
    rabatt_betrag: 0,
    kalkulation_aufschlag_override: null,
    mahnstufe: 0,
    skonto_prozent: 0,
    skonto_tage: 0,
    storno_nummer: "",
    storno_datum: "",
    storno_grund: "",
    ansprechpartner_employee_id: null,
    ansprechpartner_name: "",
    ansprechpartner_telefon: "",
    ansprechpartner_email: "",
  });

  // ── Zahleneingabe (deutsches Komma) ───────────────────────────────────────
  // Während des Tippens muss der ROHTEXT im Feld stehen bleiben ("12," oder
  // "12,5"), sonst kann man kein Komma eingeben. Erst beim Verlassen des
  // Feldes wird geparst, geklemmt und neu formatiert. Für Live-Summen wird
  // im onChange zusätzlich der Zahlenwert gesetzt — der Rohtext bleibt.
  const [rohTexte, setRohTexte] = useState<Record<string, string>>({});
  const setRoh = (key: string, text: string) =>
    setRohTexte((p) => ({ ...p, [key]: text }));
  const clearRoh = (key: string) =>
    setRohTexte((p) => {
      if (!(key in p)) return p;
      const n = { ...p };
      delete n[key];
      return n;
    });
  /** Positions-Rohtexte verwerfen — nötig, sobald sich Zeilen-Indizes verschieben. */
  const clearPosRoh = () =>
    setRohTexte((p) => {
      const e = Object.entries(p).filter(([k]) => !k.startsWith("pos:"));
      return e.length === Object.keys(p).length ? p : Object.fromEntries(e);
    });
  /** Anzeigewert eines Zahlenfeldes: Rohtext (beim Tippen) sonst formatierte Zahl. */
  const rohOderZahl = (
    key: string,
    wert: number,
    opts?: { nachkomma?: number; leerBeiNull?: boolean },
  ): string => {
    if (rohTexte[key] !== undefined) return rohTexte[key];
    if (opts?.leerBeiNull && !wert) return "";
    return formatForInput(wert, opts?.nachkomma);
  };

  // Ändert sich die Zeilenzahl (Position eingefügt/gelöscht/importiert),
  // verschieben sich die Indizes → Rohtext-Puffer der Positionen verwerfen.
  const posAnzahl = items.length;
  useEffect(() => { clearPosRoh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [posAnzahl]);

  // Locked = already saved (not draft) — can only view, download, storno/delete
  // Rechnungsartige Belege (Rechnung, Anzahlungs-, Schlussrechnung, Gutschrift)
  // sind nach dem Ausstellen gesperrt; Entwürfe und Angebote bleiben editierbar.
  const isLocked =
    !isNew && id !== "new" && !!invoiceId
    && RECHNUNGSARTIGE_TYPEN.has(form.typ)
    && form.status !== "entwurf";
  const isKundeLocked = isLocked;

  // Angebot→Rechnung Vergleichs-Dialog
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertItems, setConvertItems] = useState<{ beschreibung: string; kurztext: string; langtext: string; einheit: string; einzelpreis: number; angebotMenge: number; verbrauchtMenge: number; rechnungMenge: number; selected: boolean; isExtra: boolean }[]>([]);

  // Parent-Rechnung-Lookup für Bezugs-Block im PDF/Preview. Wird bei
  // jeder parent_invoice_id-Änderung getriggert. Speichert nummer+datum
  // (formatiert) im State, damit das InvoicePdfPreview-formData
  // synchron mit der Vorschau ist (sonst sähe die Vorschau den Bezug
  // nicht, weil sie nur den form-State spreaded).
  useEffect(() => {
    const pid = form.parent_invoice_id;
    if (!pid) {
      setParentRefInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("invoices").select("nummer, datum").eq("id", pid).maybeSingle();
      if (cancelled) return;
      if (data) {
        const datum = (data as any).datum
          ? new Date((data as any).datum + "T12:00:00").toLocaleDateString("de-AT")
          : "";
        setParentRefInfo({ nummer: (data as any).nummer || "", datum });
      } else {
        setParentRefInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [form.parent_invoice_id]);

  // Name der verknüpften Auftragskalkulation (für den Herkunfts-Hinweis).
  // Ist die Kalkulation gelöscht, bleibt der Name leer — der Hinweis zeigt
  // dann nur „Aus Kalkulation erstellt".
  useEffect(() => {
    if (!kalkulationId) { setKalkulationName(""); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("kalkulationen" as never) as any)
        .select("id, name").eq("id", kalkulationId).maybeSingle();
      if (cancelled) return;
      setKalkulationName(((data as any)?.name as string) || "");
    })();
    return () => { cancelled = true; };
  }, [kalkulationId]);

  /**
   * „Positionen neu übernehmen": lädt die verknüpfte Kalkulation frisch,
   * rechnet sie durch und ERSETZT die daraus entstandenen Positionen.
   *
   * Erhalten bleiben:
   *   - von Hand ergänzte Positionen (ohne Gruppe),
   *   - die Sichtbarkeits-Schalter (auf_pdf) der bisherigen Gruppenzeilen,
   *     zugeordnet über Gruppe + Beschreibung (Fallback: Beschreibung allein)
   *     — der Chef soll seine Auswahl nicht neu treffen müssen.
   */
  const positionenNeuUebernehmen = async () => {
    if (!kalkulationId) return;
    setKalkErsetzenLaeuft(true);
    try {
      const [kalkRes, settingsRes] = await Promise.all([
        (supabase.from("kalkulationen" as never) as any)
          .select("id, name, data").eq("id", kalkulationId).maybeSingle(),
        supabase.from("app_settings").select("key, value").like("key", "kalk\\_%"),
      ]);
      const kalk = (kalkRes as any)?.data;
      if (!kalk) {
        toast({ variant: "destructive", title: "Kalkulation nicht gefunden", description: "Die verknüpfte Kalkulation existiert nicht mehr." });
        return;
      }
      const settings: Record<string, string> = {};
      for (const row of (((settingsRes as any)?.data as any[]) || [])) settings[row.key] = row.value;

      const state = normalizeKalkulationState((kalk as any).data);
      const bd = resolveBetriebsdaten(state.settings.businessData, settings);
      const projekt = calcProjekt(state, bd);
      const { items: rohItems } = buildAngebotItems(projekt);
      if (rohItems.length === 0) {
        toast({ variant: "destructive", title: "Nichts zu übernehmen", description: "Die Kalkulation enthält keine Aufbauten mit Betrag." });
        return;
      }
      const neu = mitSelbstkosten(rohItems, projekt);

      // Bisherige Sichtbarkeits-Einstellungen merken.
      const sichtbarKeyExakt = new Map<string, boolean>();
      const sichtbarKeyText = new Map<string, boolean>();
      for (const it of items) {
        if (!gruppeVon(it)) continue;
        const text = (it.beschreibung || "").trim();
        sichtbarKeyExakt.set(gruppeSchluessel(gruppeVon(it), text), istSichtbar(it));
        if (!sichtbarKeyText.has(text)) sichtbarKeyText.set(text, istSichtbar(it));
      }

      // Ungruppierte Zeilen, die die Kalkulation selbst erzeugt (z.B. die
      // Nebenkosten-Pauschale), gehören ebenfalls zur Kalkulation — sonst
      // stünde sie nach jedem Neu-Übernehmen ein weiteres Mal im Beleg.
      const neueUngruppierteTexte = new Set(
        neu.filter(n => !n.gruppe).map(n => (n.beschreibung || "").trim())
      );
      const istKalkZeile = (it: InvoiceItem): boolean =>
        !!gruppeVon(it) || neueUngruppierteTexte.has((it.beschreibung || "").trim());

      const neuItems: InvoiceItem[] = neu.map((n, i) => {
        const text = (n.beschreibung || "").trim();
        const alt = n.gruppe
          ? sichtbarKeyExakt.get(gruppeSchluessel(String(n.gruppe), text)) ?? sichtbarKeyText.get(text)
          : undefined;
        return {
          position: i + 1,
          beschreibung: n.beschreibung,
          kurztext: n.beschreibung,
          langtext: "",
          menge: Number(n.menge) || 0,
          einheit: n.einheit || "Stk.",
          einzelpreis: Number(n.einzelpreis) || 0,
          rabatt_prozent: 0,
          gesamtpreis: Number(n.gesamtpreis) || 0,
          gruppe: n.gruppe ? String(n.gruppe) : null,
          // Sammelzeilen sind immer sichtbar; für Detailzeilen gewinnt die
          // bisherige Auswahl des Chefs vor dem Vorschlag der Kalkulation.
          auf_pdf: n.ist_gruppensumme ? true : (alt ?? n.auf_pdf !== false),
          ist_gruppensumme: !!n.ist_gruppensumme,
          ek_preis: Number(n.ek_preis) || 0,
        };
      });

      let eingefuegt = false;
      const zusammen: InvoiceItem[] = [];
      for (const it of items) {
        if (istKalkZeile(it)) {
          if (!eingefuegt) { zusammen.push(...neuItems); eingefuegt = true; }
          continue;
        }
        // Die leere Startzeile eines frischen Belegs nicht mitschleppen.
        if (!(it.beschreibung || "").trim() && !traegtBetrag(it)) continue;
        zusammen.push(it);
      }
      if (!eingefuegt) zusammen.push(...neuItems);

      setItemsDirty(zusammen.map((it, i) => ({ ...it, position: i + 1 })));
      setKalkErsetzenOpen(false);
      const manuell = zusammen.length - neuItems.length;
      toast({
        title: "Positionen neu übernommen",
        description: `${neuItems.length} Position(en) aus der Kalkulation ersetzt`
          + (manuell > 0 ? `, ${manuell} von Hand ergänzte Position(en) blieben erhalten` : "")
          + ". Nicht vergessen zu speichern.",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Übernahme fehlgeschlagen", description: String(err?.message || err) });
    } finally {
      setKalkErsetzenLaeuft(false);
    }
  };

  // Quelldokument (Rechnung/Angebot/AB) in den Form-State laden —
  // wird sowohl vom URL-`from_doc`-Pfad (useEffect bei Mount) als auch
  // vom Gutschrift-Bezugs-Picker aufgerufen. Single Source of Truth,
  // damit Kunde + Positionen + Bezug in BEIDEN Pfaden identisch
  // vorbefüllt werden. Anzahlungs-/Schlussrechnung-Spezialfälle nur
  // beim URL-Pfad (per opts) — beim Gutschrift-Picker nicht relevant.
  const loadFromSourceDoc = async (
    fromDocId: string,
    targetTyp: string,
    opts?: {
      anzahlungProzent?: number | null;
      anzahlungBetrag?: number | null;
      abzugIds?: string[];
    },
  ): Promise<boolean> => {
    try {
      const [invRes, itemsRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", fromDocId).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", fromDocId).order("position"),
      ]);
      const data: any = invRes.data;
      if (!data) return false;
      setForm(prev => ({
        ...prev,
        typ: targetTyp,
        kunde_name: data.kunde_name || "",
        kunde_adresse: data.kunde_adresse || "",
        kunde_plz: data.kunde_plz || "",
        kunde_ort: data.kunde_ort || "",
        kunde_land: data.kunde_land || "Österreich",
        kunde_email: data.kunde_email || "",
        kunde_telefon: data.kunde_telefon || "",
        kunde_uid: data.kunde_uid || "",
        customer_id: data.customer_id || null,
        project_id: data.project_id || null,
        leistungsdatum: data.leistungsdatum || "",
        leistungsdatum_bis: data.leistungsdatum_bis || "",
        allgemeine_angaben_aktiv: !!data.allgemeine_angaben_aktiv,
        leistungsbeschreibung: data.leistungsbeschreibung || "",
        ausfuehrungsort: data.ausfuehrungsort || "",
        ausfuehrungs_kw: data.ausfuehrungs_kw || "",
        ausfuehrende_firma: data.ausfuehrende_firma || "",
        ausfuehrende_firma_freitext: data.ausfuehrende_firma_freitext || "",
        zahlungsbedingungen: data.zahlungsbedingungen || "",
        notizen: data.notizen || "",
        betreff: data.betreff || "",
        mwst_satz: Number(data.mwst_satz) || 20,
        rabatt_prozent: Number(data.rabatt_prozent) || 0,
        rabatt_betrag: Number(data.rabatt_betrag) || 0,
        kalkulation_aufschlag_override: (data as any).kalkulation_aufschlag_override ?? null,
        skonto_prozent: Number(data.skonto_prozent) || 0,
        skonto_tage: Number(data.skonto_tage) || 0,
        kunde_anrede: data.kunde_anrede || "",
        kunde_titel: data.kunde_titel || "",
        reverse_charge: !!data.reverse_charge,
        kundennummer: data.kundennummer || "",
        ansprechpartner_employee_id: data.ansprechpartner_employee_id || null,
        ansprechpartner_name: data.ansprechpartner_name || "",
        ansprechpartner_telefon: data.ansprechpartner_telefon || "",
        ansprechpartner_email: data.ansprechpartner_email || "",
        anzahlung_prozent: opts?.anzahlungProzent ?? null,
        anzahlung_betrag: opts?.anzahlungBetrag ?? null,
        parent_invoice_id: fromDocId,
      } as any));

      const srcItems = (itemsRes.data || []) as any[];
      let nextItems: InvoiceItem[] = srcItems.map((it, idx) => ({
        position: idx + 1,
        beschreibung: it.beschreibung || "",
        kurztext: it.kurztext || it.beschreibung || "",
        langtext: it.langtext || "",
        menge: Number(it.menge) || 1,
        einheit: it.einheit || "Stk.",
        einzelpreis: Number(it.einzelpreis) || 0,
        rabatt_prozent: Number(it.rabatt_prozent) || 0,
        gesamtpreis: Number(it.gesamtpreis) || 0,
        produktnummer: (it as any).produktnummer || "",
        mwst_exempt: !!(it as any).mwst_exempt,
        set_template_id: it.set_template_id || null,
        set_snapshot: it.set_snapshot || null,
        // Kalkulations-Snapshot + Katalog-Verknüpfung mitnehmen, damit die
        // "Preise aktualisieren"-Funktion auch nach Angebot→Rechnung greift.
        ist_kalkuliert: !!(it as any).ist_kalkuliert,
        kalkulation_template_id: (it as any).kalkulation_template_id || null,
        ek_preis: Number((it as any).ek_preis) || 0,
        verschnitt_prozent: Number((it as any).verschnitt_prozent) || 0,
        aufschlag_prozent: Number((it as any).aufschlag_prozent) || 0,
        befestigung_preis: Number((it as any).befestigung_preis) || 0,
        sonstiges_preis: Number((it as any).sonstiges_preis) || 0,
        arbeitszeit_minuten: Number((it as any).arbeitszeit_minuten) || 0,
        stundensatz: Number((it as any).stundensatz) || 52,
        // Aufbau-Kapitel + Sichtbarkeit wandern mit: die Rechnung soll
        // genauso aussehen wie das Angebot, das der Kunde angenommen hat.
        gruppe: (it as any).gruppe || null,
        auf_pdf: (it as any).auf_pdf !== false,
        ist_gruppensumme: !!(it as any).ist_gruppensumme,
      }));

      // Anzahlungsrechnung: nur eine Zeile mit dem Anzahlungsbetrag.
      if (targetTyp === "anzahlungsrechnung" && (opts?.anzahlungBetrag || opts?.anzahlungProzent)) {
        const gesamtNetto = nextItems.reduce((s, it) => s + it.gesamtpreis, 0);
        const quellNummer = data.nummer || "Auftragsbestätigung";
        let anzBetrag: number;
        let labelKurz: string;
        let labelLang: string;
        if (opts?.anzahlungBetrag) {
          anzBetrag = Number(opts.anzahlungBetrag);
          labelKurz = "Anzahlung";
          labelLang = `Anzahlung gemäß ${quellNummer}`;
        } else {
          const prozent = Number(opts?.anzahlungProzent);
          anzBetrag = gesamtNetto * (prozent / 100);
          labelKurz = `Anzahlung ${prozent}%`;
          labelLang = `Anzahlung ${prozent}% gemäß ${quellNummer}`;
        }
        anzBetrag = Math.round(anzBetrag * 100) / 100;
        nextItems = [{
          position: 1,
          beschreibung: labelLang,
          kurztext: labelKurz,
          langtext: "",
          menge: 1,
          einheit: "pausch.",
          einzelpreis: anzBetrag,
          rabatt_prozent: 0,
          gesamtpreis: anzBetrag,
        }];
      }

      // Schlussrechnung: Anzahlungen als negative BRUTTO-Zeilen anhängen.
      if (targetTyp === "schlussrechnung" && opts?.abzugIds && opts.abzugIds.length > 0) {
        const { data: abzugInvs } = await supabase
          .from("invoices")
          .select("id, nummer, netto_summe, brutto_summe, datum")
          .in("id", opts.abzugIds);
        ((abzugInvs as any[]) || []).forEach((abz) => {
          const brutto = Number(abz.brutto_summe) || 0;
          nextItems.push({
            position: nextItems.length + 1,
            beschreibung: `Abzug Anzahlung ${abz.nummer} vom ${abz.datum} (brutto, MwSt-frei)`,
            kurztext: `Abzug ${abz.nummer}`,
            langtext: "",
            menge: 1,
            einheit: "pausch.",
            einzelpreis: -brutto,
            rabatt_prozent: 0,
            gesamtpreis: -brutto,
            mwst_exempt: true,
          });
        });
      }

      if (nextItems.length > 0) setItems(nextItems);
      setFromAngebotId(fromDocId);
      return true;
    } catch (err) {
      console.error("Konversion fehlgeschlagen:", err);
      toast({ variant: "destructive", title: "Konversion fehlgeschlagen", description: "Quelldokument konnte nicht geladen werden" });
      return false;
    }
  };

  // Lazy-Load der Rechnungen für den Bezugs-Picker — nur bei neuer
  // Standalone-Gutschrift. Bei Convert (form.parent_invoice_id gesetzt)
  // brauchen wir die Liste nicht.
  useEffect(() => {
    if (!isNew || form.typ !== "gutschrift" || form.parent_invoice_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, nummer, kunde_name, datum")
        .in("typ", ["rechnung", "anzahlungsrechnung", "schlussrechnung"])
        .neq("status", "storniert")
        .order("datum", { ascending: false })
        .limit(100);
      if (cancelled) return;
      setProjectRechnungen(((data as any[]) || []).map(d => ({
        id: d.id,
        nummer: d.nummer || "",
        kunde_name: d.kunde_name || "",
        datum: d.datum || "",
      })));
    })();
    return () => { cancelled = true; };
  }, [isNew, form.typ, form.parent_invoice_id]);

  useEffect(() => {
    fetchProjects();
    fetchTemplates();
    fetchEmployees();
    // Load invoice layout settings + default betreff
    supabase.from("app_settings").select("key, value").in("key", ["invoice_layout", "default_betreff_rechnung", "default_betreff_angebot", "kalk_warn_marge_prozent"]).then(({ data }) => {
      if (data) {
        for (const row of data) {
          if (row.key === "invoice_layout") setInvoiceLayout(parseLayoutSettings(row.value));
          if (row.key === "kalk_warn_marge_prozent") {
            const n = parseDecimal(String(row.value ?? ""));
            if (n !== null && n > 0) setWarnMargeProzent(n);
          }
          if (isNew && row.key === "default_betreff_rechnung" && defaultTyp === "rechnung" && row.value) {
            setForm(prev => prev.betreff ? prev : { ...prev, betreff: row.value });
          }
          if (isNew && row.key === "default_betreff_angebot" && defaultTyp === "angebot" && row.value) {
            setForm(prev => prev.betreff ? prev : { ...prev, betreff: row.value });
          }
        }
      }
    });
    if (!isNew && id) {
      loadInvoice(id);
      loadStoredPdfs(id);
      loadPayments(id);
      loadMahnungen();
    }
    // Auto-open regiebericht import if disturbance_id is in URL
    const distId = searchParams.get("disturbance_id");
    if (distId && isNew) {
      setImportRegieOpen(true);
    }

    // Prefill aus der Auftragskalkulation: die Wrapper-Seite legt die
    // berechneten Aufbauten als Positionen in sessionStorage ab und
    // navigiert mit ?from_kalkulation=1 hierher. Wir übernehmen die
    // Positionen + den Projektnamen als Betreff.
    if (isNew && searchParams.get("from_kalkulation")) {
      try {
        const raw = sessionStorage.getItem("kalkulation_to_angebot");
        if (raw) {
          const data = JSON.parse(raw);
          sessionStorage.removeItem("kalkulation_to_angebot");
          if (Array.isArray(data.items) && data.items.length > 0) {
            setItems(data.items.map((it: any, idx: number) => ({
              position: idx + 1,
              beschreibung: String(it.beschreibung || ""),
              menge: Number(it.menge) || 1,
              einheit: String(it.einheit || "Stk."),
              einzelpreis: Number(it.einzelpreis) || 0,
              gesamtpreis: Number(it.gesamtpreis) || 0,
              // Gruppen/Sichtbarkeit aus der Kalkulation unverändert übernehmen.
              // Detailzeilen kommen mit auf_pdf=false herein — der Chef sieht
              // sie im Editor, der Kunde erst nach dem Einschalten.
              gruppe: it.gruppe ? String(it.gruppe) : null,
              auf_pdf: it.auf_pdf !== false,
              ist_gruppensumme: !!it.ist_gruppensumme,
              // Interner Wert der Detailzeilen (Material-EK, Lohn, Fahrt …) —
              // steht in ek_preis, damit die Belegsumme unberührt bleibt.
              ek_preis: Number(it.ek_preis) || 0,
            })));
          }
          if (data.betreff) {
            setForm(prev => ({ ...prev, betreff: prev.betreff || String(data.betreff) }));
          }
          // Herkunft merken: aus welcher Kalkulation stammt dieser Beleg?
          // (wird beim Speichern in invoices.kalkulation_id geschrieben)
          if (data.kalkulation_id) setKalkulationId(String(data.kalkulation_id));
          // Wenn die Kalkulation einem Kunden zugeordnet war, diesen ins
          // Angebot übernehmen.
          if (data.customer_id) {
            (async () => {
              const { data: cust } = await supabase
                .from("customers")
                .select("id, name, anrede, titel, uid_nummer, adresse, plz, ort, land, email, telefon, kundennummer")
                .eq("id", data.customer_id)
                .maybeSingle();
              if (cust) {
                setForm(prev => ({
                  ...prev,
                  customer_id: cust.id,
                  kunde_name: cust.name,
                  kunde_adresse: cust.adresse || "",
                  kunde_plz: cust.plz || "",
                  kunde_ort: cust.ort || "",
                  kunde_land: cust.land || "Österreich",
                  kunde_email: cust.email || "",
                  kunde_telefon: cust.telefon || "",
                  kunde_uid: (cust as any).uid_nummer || "",
                  kunde_anrede: (cust as any).anrede || "",
                  kunde_titel: (cust as any).titel || "",
                  kundennummer: cust.kundennummer || "",
                } as any));
              }
            })();
          }
          toast({ title: "Aus Kalkulation übernommen", description: `${(data.items || []).length} Position(en) aus der Auftragskalkulation eingefügt.` });
        }
      } catch { /* ignore malformed payload */ }
    }

    // Load data from source document — unterstützt alte (`from_angebot`)
    // und neue (`from_doc`) URL-Parameter. Zusätzlich:
    //   anzahlung_prozent=<p>   → füllt anzahlung_prozent beim neuen Dokument
    //   abzug_ids=<id,id,…>    → zieht Anzahlungen als negative Positionen ab
    const fromDocId = searchParams.get("from_doc") || searchParams.get("from_angebot");
    const targetTyp = searchParams.get("typ") || "rechnung";
    const anzahlungProzentParam = searchParams.get("anzahlung_prozent");
    const anzahlungBetragParam = searchParams.get("anzahlung_betrag");
    const abzugIdsParam = searchParams.get("abzug_ids");
    // cancelled-Flag: wenn der Effect während eines async-Loads teardown wird
    // (z.B. Navigation / id-Wechsel), überschreiben wir nicht mehr den Form-State
    // und risikieren damit keinen User-Input wegzubügeln.
    let cancelled = false;
    if (isNew && fromDocId && fromDocId !== "true") {
      (async () => {
        if (cancelled) return;
        await loadFromSourceDoc(fromDocId, targetTyp, {
          anzahlungProzent: anzahlungProzentParam ? Number(anzahlungProzentParam) : null,
          anzahlungBetrag: anzahlungBetragParam ? Number(anzahlungBetragParam) : null,
          abzugIds: abzugIdsParam ? abzugIdsParam.split(",").filter(Boolean) : undefined,
        });
      })();
    } else if (isNew && defaultProjectId) {
      // Kein from_doc, aber ?project=... → Projekt + Kunden
      // automatisch ins Formular übernehmen (aus dem Projekt heraus gestartet).
      (async () => {
        try {
          const { data: projFull } = await (supabase.from("projects" as never) as any)
            .select("customer_id, adresse, plz, ort")
            .eq("id", defaultProjectId)
            .maybeSingle();
          if (cancelled) return;
          // Ausführungsort vorbefüllen aus der Projekt-Adresse — nur
          // wenn der User noch nichts eingetragen hat (überschreibt nichts).
          if (projFull) {
            const projAdresse = [
              (projFull as any).adresse,
              [(projFull as any).plz, (projFull as any).ort].filter(Boolean).join(" "),
            ].filter(Boolean).join("\n");
            if (projAdresse) {
              setForm(prev => prev.ausfuehrungsort
                ? prev
                : ({ ...prev, ausfuehrungsort: projAdresse } as any));
            }
          }
          if (!projFull?.customer_id) return;
          // Kundendaten laden
          const { data: cust } = await supabase
            .from("customers")
            .select("id, name, anrede, titel, uid_nummer, adresse, plz, ort, land, email, telefon, kundennummer, ansprechpartner, skonto_prozent, skonto_tage, nettofrist")
            .eq("id", projFull.customer_id)
            .maybeSingle();
          if (cancelled || !cust) return;
          setForm(prev => ({
            ...prev,
            customer_id: cust.id,
            kunde_name: cust.name,
            kunde_adresse: cust.adresse || "",
            kunde_plz: cust.plz || "",
            kunde_ort: cust.ort || "",
            kunde_land: cust.land || "Österreich",
            kunde_email: cust.email || "",
            kunde_telefon: cust.telefon || "",
            kunde_uid: cust.uid_nummer || "",
            kunde_anrede: (cust as any).anrede || "",
            kunde_titel: (cust as any).titel || "",
            kundennummer: cust.kundennummer || "",
            // Ansprechpartner wird NICHT mehr aus customers übernommen —
            // er ist seit der Umstellung der Sachbearbeiter und
            // wird im Dokument-Formular explizit aus der Mitarbeiter-
            // Liste gewählt.
            skonto_prozent: Number(cust.skonto_prozent) || 0,
            skonto_tage: Number(cust.skonto_tage) || 0,
          } as any));
          const nettofrist = Number((cust as any).nettofrist) || 0;
          if (defaultTyp === "rechnung") {
            const zb = nettofristToDropdown(nettofrist);
            setForm(prev => ({ ...prev, zahlungsbedingungen: zb }));
            // "individuell" fängt der useEffect nicht ab — faellig_am
            // hier direkt setzen, damit die Rechnung sofort konsistent ist.
            if (zb === "individuell" && nettofrist > 0) {
              const due = new Date(new Date().toISOString().split("T")[0] + "T12:00:00");
              due.setDate(due.getDate() + nettofrist);
              setForm(prev => ({ ...prev, faellig_am: format(due, "yyyy-MM-dd") }));
            }
          }
        } catch (err) {
          console.error("Projekt-Prefill fehlgeschlagen:", err);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [id]);


  const fetchEmployees = async () => {
    // Aktive Mitarbeiter laden für den Ansprechpartner-Dropdown. `aktiv`
    // ist die kanonische Quelle (wird per Trigger aus profiles.is_active
    // synchronisiert) — `austritt_datum` filtert nicht alle Fälle.
    const { data } = await supabase
      .from("employees")
      .select("id, vorname, nachname, telefon, email, position")
      .eq("aktiv", true)
      .order("vorname");
    setEmployees(((data as any[]) || []).map(e => ({
      id: e.id,
      vorname: e.vorname || "",
      nachname: e.nachname || "",
      telefon: e.telefon || null,
      email: e.email || null,
      position: e.position || null,
    })));
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name, customer_id").not("status", "eq", "Abgeschlossen").order("name");
    if (data) setProjects(data);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from("invoice_templates").select("*").order("kategorie, name").limit(5000);
    if (data) setTemplates(data.map(t => ({ ...t, einzelpreis: Number(t.einzelpreis), ist_favorit: (t as any).ist_favorit || false })));
  };

  const loadStoredPdfs = async (invId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.storage.from("invoice-pdfs").list(`${user.id}/${invId}`);
    if (data) setStoredPdfs(data.map(f => ({ name: f.name, created_at: f.created_at || "" })));
  };

  const loadInvoice = async (invoiceId: string) => {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnung nicht gefunden" });
      navigate("/invoices");
      return;
    }

    // Ausgangsstand für das Optimistic Locking merken (siehe handleSave).
    setGeladenerStand(((data as any).updated_at as string) || null);
    // Herkunft Auftragskalkulation. Fehlt die Spalte (Migration noch nicht
    // eingespielt), ist der Wert schlicht undefined → Feature bleibt aus.
    setKalkulationId(((data as any).kalkulation_id as string) || null);

    setForm({
      typ: data.typ,
      nummer: data.nummer,
      laufnummer: data.laufnummer,
      jahr: data.jahr,
      status: data.status,
      kunde_name: data.kunde_name,
      kunde_adresse: data.kunde_adresse || "",
      kunde_plz: data.kunde_plz || "",
      kunde_ort: data.kunde_ort || "",
      kunde_land: data.kunde_land || "Österreich",
      kunde_email: data.kunde_email || "",
      kunde_telefon: data.kunde_telefon || "",
      kunde_uid: data.kunde_uid || "",
      datum: data.datum,
      faellig_am: data.faellig_am || "",
      leistungsdatum: data.leistungsdatum || "",
      leistungsdatum_bis: (data as any).leistungsdatum_bis || "",
      verrechnet_mit_invoice_id: (data as any).verrechnet_mit_invoice_id || null,
      verrechnet_am: (data as any).verrechnet_am || "",
      allgemeine_angaben_aktiv: !!(data as any).allgemeine_angaben_aktiv,
      leistungsbeschreibung: (data as any).leistungsbeschreibung || "",
      ausfuehrungsort: (data as any).ausfuehrungsort || "",
      ausfuehrungs_kw: (data as any).ausfuehrungs_kw || "",
      ausfuehrende_firma: (data as any).ausfuehrende_firma || "",
      ausfuehrende_firma_freitext: (data as any).ausfuehrende_firma_freitext || "",
      // Altdaten auf die neuen Dropdown-Werte mappen. Sofort/prompt und
      // die Standard-Tage bleiben erhalten; alles andere (Freitext,
      // ungültige Werte, krumme Tage wie "20 Tage") landet auf
      // "individuell", damit der User die Altrechnung nicht aus
      // Versehen verfälscht.
      zahlungsbedingungen: (() => {
        const raw = (data.zahlungsbedingungen || "").trim();
        if (!raw) return "";
        if (/sofort|umgehend|prompt/i.test(raw)) return "sofort";
        const standard = ["7 Tage", "14 Tage", "30 Tage", "60 Tage"];
        if (standard.includes(raw)) return raw;
        return "individuell";
      })(),
      notizen: data.notizen || "",
      betreff: (data as any).betreff || "",
      mwst_satz: Number(data.mwst_satz),
      project_id: data.project_id,
      bezahlt_betrag: Number(data.bezahlt_betrag) || 0,
      customer_id: (data as any).customer_id || null,
      gueltig_bis: (data as any).gueltig_bis || "",
      rabatt_prozent: Number((data as any).rabatt_prozent) || 0,
      rabatt_betrag: Number((data as any).rabatt_betrag) || 0,
      mahnstufe: Number((data as any).mahnstufe) || 0,
      skonto_prozent: Number((data as any).skonto_prozent) || 0,
      skonto_tage: Number((data as any).skonto_tage) || 0,
      storno_nummer: (data as any).storno_nummer || "",
      storno_datum: (data as any).storno_datum || "",
      storno_grund: (data as any).storno_grund || "",
      kunde_anrede: (data as any).kunde_anrede || "",
      kunde_titel: (data as any).kunde_titel || "",
      reverse_charge: (data as any).reverse_charge || false,
      kundennummer: (data as any).kundennummer || "",
      ansprechpartner_employee_id: (data as any).ansprechpartner_employee_id || null,
      ansprechpartner_name: (data as any).ansprechpartner_name || "",
      ansprechpartner_telefon: (data as any).ansprechpartner_telefon || "",
      ansprechpartner_email: (data as any).ansprechpartner_email || "",
      // Wichtig für die Dokumenten-Genealogie: ohne das fällt der
      // Schlussrechnung-Loader auf die AR selbst zurück und die Original-
      // Positionen aus dem Angebot/AB werden nicht übernommen.
      parent_invoice_id: (data as any).parent_invoice_id || null,
      anzahlung_prozent: (data as any).anzahlung_prozent != null ? Number((data as any).anzahlung_prozent) : null,
      anzahlung_betrag: (data as any).anzahlung_betrag != null ? Number((data as any).anzahlung_betrag) : null,
    } as any);

    const { data: itemsData } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("position");

    if (itemsData && itemsData.length > 0) {
      setItems(itemsData.map(it => ({
        id: it.id,
        position: it.position,
        beschreibung: it.beschreibung,
        kurztext: (it as any).kurztext || it.beschreibung,
        langtext: (it as any).langtext || "",
        menge: Number(it.menge),
        einheit: it.einheit || "Stk.",
        einzelpreis: Number(it.einzelpreis),
        rabatt_prozent: Number((it as any).rabatt_prozent) || 0,
        produktnummer: (it as any).produktnummer || "",
        gesamtpreis: Number(it.gesamtpreis),
        mwst_exempt: !!(it as any).mwst_exempt,
        set_template_id: (it as any).set_template_id || null,
        set_snapshot: (it as any).set_snapshot || null,
        ist_kalkuliert: !!(it as any).ist_kalkuliert,
        kalkulation_template_id: (it as any).kalkulation_template_id || null,
        ek_preis: Number((it as any).ek_preis) || 0,
        verschnitt_prozent: Number((it as any).verschnitt_prozent) || 0,
        aufschlag_prozent: Number((it as any).aufschlag_prozent) || 0,
        befestigung_preis: Number((it as any).befestigung_preis) || 0,
        sonstiges_preis: Number((it as any).sonstiges_preis) || 0,
        arbeitszeit_minuten: Number((it as any).arbeitszeit_minuten) || 0,
        stundensatz: Number((it as any).stundensatz) || 52,
        // Gruppen + Sichtbarkeit (Migration 20260722100000). Fehlen die
        // Spalten (alte DB), bleibt es beim Bestandsverhalten: ungruppiert
        // und für den Kunden sichtbar.
        gruppe: (it as any).gruppe || null,
        auf_pdf: (it as any).auf_pdf !== false,
        ist_gruppensumme: !!(it as any).ist_gruppensumme,
      })));
    }

    // Defensiv: wenn auf der Rechnung keine UID gesetzt ist, aber ein
    // Customer verknüpft ist und dort eine UID hinterlegt ist, ziehen wir
    // sie nach. Greift typischerweise bei alten Rechnungen, bei denen die
    // UID damals beim Kunden fehlte und später ergänzt wurde.
    if (!((data as any).kunde_uid || "").trim() && (data as any).customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("uid_nummer, kundentyp")
        .eq("id", (data as any).customer_id)
        .maybeSingle();
      const liveUid = ((cust as any)?.uid_nummer || "").trim();
      if (liveUid) {
        setForm(prev => ({ ...prev, kunde_uid: liveUid } as any));
      }
    }

    // Dokumenten-Kette laden: zur Root-Ahnung (Angebot/AB) hochwandern,
    // dann alle direkten Kinder dieser Root laden. So sieht der User auf
    // jeder AR/SR, zu welchem Auftrag sie gehört und welche Geschwister
    // es gibt — und kann direkt dorthin navigieren.
    let rootId = invoiceId;
    let parentHop: string | null = (data as any).parent_invoice_id || null;
    // Hochwandern — begrenzt auf 5 Hops um Endlosschleifen durch inkonsistente
    // Daten (sollte nie passieren, aber Safety-Net) zu verhindern.
    for (let i = 0; i < 5 && parentHop; i++) {
      rootId = parentHop;
      const { data: hop } = await supabase
        .from("invoices")
        .select("parent_invoice_id")
        .eq("id", parentHop)
        .maybeSingle();
      parentHop = (hop as any)?.parent_invoice_id || null;
    }
    const { data: rootData } = await supabase
      .from("invoices")
      .select("id, typ, nummer, datum, brutto_summe, status")
      .eq("id", rootId)
      .maybeSingle();
    setChainRoot(rootData ? (rootData as ChainDoc) : null);

    // ALLE Nachfahren der Root einsammeln (Breitensuche, max. 6 Ebenen).
    // Vorher wurden nur die direkten Kinder geladen — bei der typischen Kette
    // Angebot → Auftragsbestätigung → Lieferschein → Rechnung fehlten damit
    // Lieferschein und Rechnung komplett, und der gerade geöffnete Beleg war
    // in seiner eigenen Kette nicht zu sehen.
    const alleKinder: ChainDoc[] = [];
    let ebene: string[] = [rootId];
    for (let tiefe = 0; tiefe < 6 && ebene.length > 0; tiefe++) {
      const { data: kinder } = await supabase
        .from("invoices")
        .select("id, typ, nummer, datum, brutto_summe, status")
        .in("parent_invoice_id", ebene)
        .order("datum", { ascending: true });
      const neu = (((kinder as any[]) || []) as ChainDoc[]).filter(
        k => k.id !== rootId && !alleKinder.some(a => a.id === k.id)
      );
      if (neu.length === 0) break;
      alleKinder.push(...neu);
      ebene = neu.map(k => k.id);
    }
    setChainChildren(alleKinder);

    setLoading(false);
  };

  const updateField = (field: keyof InvoiceData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (!loading) setIsDirty(true);
  };

  /**
   * Positionen ändern UND das Dokument als „ungespeichert" markieren.
   *
   * WICHTIG: alle Positions-Mutationen (Menge, Preis, Position hinzufügen /
   * löschen / verschieben, Import aus Katalog/Angebot/Regie) müssen hierüber
   * laufen. Sonst greift weder der „Änderungen speichern?"-Dialog beim Zurück
   * noch die beforeunload-Warnung — der Chef verliert seine Eingaben lautlos.
   * Nur die Lade-Pfade (loadInvoice / loadFromSourceDoc) setzen setItems direkt.
   */
  const setItemsDirty: typeof setItems = (updater) => {
    setItems(updater);
    if (!loading) setIsDirty(true);
  };

  // Helper: merge imported items into existing list, replacing empty first row
  const mergeItems = (prev: InvoiceItem[], newItems: InvoiceItem[]): InvoiceItem[] => {
    // Check if first row is empty (default state)
    const firstEmpty = prev.length === 1 && !prev[0].beschreibung.trim() && prev[0].einzelpreis === 0;
    const base = firstEmpty ? [] : prev;
    // (Der Rohtext-Puffer wird über den useEffect auf items.length verworfen —
    //  eine setState-Nebenwirkung in diesem reinen Updater wäre unsauber.)
    return [...base, ...newItems].map((item, idx) => ({ ...item, position: idx + 1 }));
  };

  const addItem = () => {
    setItemsDirty(prev => [...prev, {
      position: prev.length + 1,
      beschreibung: "",
      kurztext: "",
      langtext: "",
      menge: 1,
      einheit: "Stk.",
      einzelpreis: 0,
      rabatt_prozent: 0,
      gesamtpreis: 0,
    }]);
  };

  const addFromTemplate = async (t: TemplateItem) => {
    // Set (Stückliste) — Summary-Mode: EINE Zeile pro Set in der Rechnung,
    // mit dem Set-VK als Einzelpreis. Die Komponenten-Stückliste wird als
    // JSON-Snapshot gespeichert, damit sie später für interne Nach-
    // kalkulation noch verfügbar ist — auch wenn das Set im Katalog
    // geändert oder gelöscht wird.
    if ((t as any).ist_set) {
      const setMenge = Number(templateMengen[t.id]) > 0 ? Number(templateMengen[t.id]) : 1;
      const { data: comps } = await (supabase as any)
        .from("invoice_template_components")
        .select("menge, sort_order, component:invoice_templates!component_template_id(id, name, kurzbezeichnung, einheit, einzelpreis, ek_netto, vk_netto)")
        .eq("parent_template_id", t.id)
        .order("sort_order");
      const rows = ((comps as any[]) || []);
      if (rows.length === 0) {
        toast({ variant: "destructive", title: "Set ist leer", description: `${t.name} hat keine Komponenten.` });
        return;
      }
      const vkNetto = round2(Number((t as any).vk_netto ?? (t as any).netto_preis ?? t.einzelpreis) || 0);
      const bezugseinheit = (t as any).bezugseinheit || t.einheit || "Stk.";
      const aufschlag = Number((t as any).aufschlag_prozent) || 0;
      const komponenten = rows.map(r => {
        const c = r.component || {};
        const cvk = Number(c.vk_netto ?? c.einzelpreis) || 0;
        return {
          name: c.kurzbezeichnung || c.name || "?",
          einheit: c.einheit || "Stk.",
          menge: Number(r.menge) || 1,  // pro 1 Bezugseinheit
          ek: Number(c.ek_netto ?? cvk) || 0,
          vk: cvk,
        };
      });
      const summaryRow: InvoiceItem = {
        position: 1,
        beschreibung: (t as any).kurzbezeichnung || t.name,
        kurztext: (t as any).kurzbezeichnung || t.name,
        langtext: ((t as any).langbezeichnung && (t as any).langbezeichnung !== ((t as any).kurzbezeichnung || t.name))
          ? (t as any).langbezeichnung
          : "",
        menge: round3(setMenge),
        einheit: bezugseinheit,
        einzelpreis: vkNetto,
        rabatt_prozent: 0,
        produktnummer: (t as any).produktnummer || "",
        gesamtpreis: round2(round3(setMenge) * vkNetto),
        set_template_id: t.id,
        set_snapshot: {
          bezugseinheit,
          aufschlag_prozent: aufschlag,
          komponenten,
        },
      };
      setItemsDirty(prev => mergeItems(prev, [summaryRow]));
      toast({
        title: `Set hinzugefügt: ${t.name}`,
        description: `${setMenge} × ${bezugseinheit} (${komponenten.length} Komponenten im Snapshot).`,
      });
      return;
    }

    const netto = round2(Number((t as any).vk_netto ?? (t as any).netto_preis) || t.einzelpreis);
    // Kalkuliertes Material → Kalkulation in die Position übernehmen, damit
    // Aufschlag/Stundensatz im Angebot anpassbar sind (Excel-Modell).
    const isKalk = !!(t as any).ist_kalkuliert;
    const kalk: KalkulationInput | null = isKalk ? {
      ek_preis: Number((t as any).ek_netto) || 0,
      verschnitt_prozent: Number((t as any).verschnitt_prozent) || 0,
      aufschlag_prozent: Number((t as any).aufschlag_prozent) || 0,
      befestigung_preis: Number((t as any).befestigung_preis) || 0,
      sonstiges_preis: Number((t as any).sonstiges_preis) || 0,
      arbeitszeit_minuten: Number((t as any).arbeitszeit_minuten) || 0,
      stundensatz: Number((t as any).stundensatz) || 52,
    } : null;
    const einzelpreis = round2(kalk
      ? calcEinzelpreis({ ...kalk, aufschlag_prozent: docAufschlagOverride ?? kalk.aufschlag_prozent })
      : netto);
    const newItem: InvoiceItem = {
      position: 1,
      beschreibung: (t as any).kurzbezeichnung || t.name || t.beschreibung,
      kurztext: (t as any).kurzbezeichnung || t.name,
      langtext: ((t as any).langbezeichnung && (t as any).langbezeichnung !== ((t as any).kurzbezeichnung || t.name)) ? (t as any).langbezeichnung : "",
      menge: 1,
      einheit: t.einheit,
      einzelpreis,
      rabatt_prozent: 0,
      produktnummer: (t as any).produktnummer || "",
      gesamtpreis: einzelpreis,
      ist_kalkuliert: isKalk,
      kalkulation_template_id: isKalk ? t.id : null,
      ...(kalk || {}),
    };
    setItemsDirty(prev => mergeItems(prev, [newItem]));
    // Dialog bleibt offen
    toast({ title: "Position hinzugefügt", description: t.name });
  };

  const removeItem = (index: number) => {
    clearPosRoh();
    setItemsDirty(prev => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, position: i + 1 })));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    clearPosRoh();
    setItemsDirty(prev => {
      const arr = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= arr.length) return prev;
      [arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]];
      return arr.map((item, i) => ({ ...item, position: i + 1 }));
    });
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItemsDirty(prev => {
      const updated = [...prev];
      // Sanitize numeric fields: NaN, Infinity, negative → 0.
      // Menge auf 3 und Einzelpreis auf 2 Nachkommastellen runden — sonst
      // steht auf dem PDF eine Zeile, die man nicht nachrechnen kann
      // (gedruckt "7 × 1,11", gerechnet aber mit 1,1111).
      if (field === "menge") {
        const n = round3(Number(value));
        value = isFinite(n) && n >= 0 ? n : 0;
      }
      if (field === "einzelpreis") {
        const n = round2(Number(value));
        value = isFinite(n) && n >= 0 ? n : 0;
      }
      if (field === "rabatt_prozent") {
        const n = Number(value);
        value = isFinite(n) ? Math.max(0, Math.min(100, round2(n))) : 0;
      }
      (updated[index] as any)[field] = value;
      if (field === "menge" || field === "einzelpreis" || field === "rabatt_prozent") {
        const m = Number(updated[index].menge) || 0;
        const p = Number(updated[index].einzelpreis) || 0;
        const r = Number(updated[index].rabatt_prozent) || 0;
        const total = m * p * (1 - r / 100);
        updated[index].gesamtpreis = isFinite(total) ? round2(total) : 0;
      }
      return updated;
    });
  };

  // ── Gruppen: Sichtbarkeit im Kundendokument ───────────────────────────────
  /** Auge-Schalter einer Zeile: "Kunde sieht diese Zeile" an/aus. */
  const toggleZeileSichtbar = (index: number) => {
    setItemsDirty(prev => prev.map((it, i) =>
      i === index ? { ...it, auf_pdf: !istSichtbar(it) } : it));
  };

  /** Gruppenkopf-Schalter: alle Detailzeilen des Aufbaus ein-/ausblenden. */
  const setGruppenDetailsSichtbar = (gruppe: string, sichtbar: boolean) => {
    setItemsDirty(prev => prev.map(it =>
      gruppeVon(it) === gruppe && istDetailzeile(it) ? { ...it, auf_pdf: sichtbar } : it));
  };

  // ── Kalkulation ───────────────────────────────────────────────────────────
  // Effektiver Material-Aufschlag einer Position: greift der Dokument-Override,
  // gilt dieser, sonst der positionseigene Aufschlag.
  const docAufschlagOverride =
    form.kalkulation_aufschlag_override === null || form.kalkulation_aufschlag_override === undefined
      ? null : Number(form.kalkulation_aufschlag_override);

  const computeItemTotal = (it: InvoiceItem): number => {
    const m = Number(it.menge) || 0;
    const r = Number(it.rabatt_prozent) || 0;
    const t = m * (Number(it.einzelpreis) || 0) * (1 - r / 100);
    return isFinite(t) ? round2(t) : 0;
  };

  // ── Preise anpassen (Rabatt/Aufschlag + KI) ───────────────────────────────
  // Positionen, auf die eine Preisanpassung überhaupt wirken kann. Ausgenommen
  // sind mwst_exempt-Zeilen (Anzahlungs-Abzüge sind Brutto-Verrechnungszeilen
  // und dürfen nicht angefasst werden) sowie die Detailzeilen einer Gruppe:
  // sie tragen keinen Betrag (gesamtpreis 0) und dürfen keinen bekommen —
  // sonst würde der Aufbau doppelt verrechnet.
  const priceAdjustLines = useMemo<AdjustLine[]>(
    () =>
      items
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !it.mwst_exempt && !istDetailzeile(it))
        .map(({ it, idx }) => ({
          index: idx,
          beschreibung: it.beschreibung || it.kurztext || "",
          menge: Number(it.menge) || 0,
          einheit: it.einheit || "",
          einzelpreis: Number(it.einzelpreis) || 0,
          rabatt_prozent: Number(it.rabatt_prozent) || 0,
          gesamtpreis: Number(it.gesamtpreis) || 0,
        })),
    [items]
  );

  // Übernimmt neue Einzelpreise aus dem Dialog. Gesamtpreise laufen über
  // computeItemTotal (gleiche Formel wie überall im Editor), die Belegsummen
  // werden davon abgeleitet neu berechnet.
  const applyPriceAdjust = (neuePreise: Record<number, number>) => {
    setItemsDirty(prev =>
      prev.map((it, idx) => {
        const neu = neuePreise[idx];
        if (neu === undefined || !isFinite(neu)) return it;
        // Sicherheitsnetz: Detailzeilen einer Gruppe bleiben betragslos.
        if (istDetailzeile(it)) return it;
        const next = { ...it, einzelpreis: Math.max(0, Math.round(neu * 100) / 100) };
        next.gesamtpreis = computeItemTotal(next);
        return next;
      })
    );
    setIsDirty(true);
  };

  // Setzt die Kalkulationsfelder einer Position und berechnet Einzel-/Gesamtpreis neu.
  const applyItemKalkulation = (index: number, kalk: KalkulationInput) => {
    setItemsDirty(prev => {
      const updated = [...prev];
      const eff = docAufschlagOverride ?? kalk.aufschlag_prozent;
      const ep = round2(calcEinzelpreis({ ...kalk, aufschlag_prozent: eff }));
      updated[index] = {
        ...updated[index],
        ist_kalkuliert: true,
        ek_preis: kalk.ek_preis,
        verschnitt_prozent: kalk.verschnitt_prozent,
        aufschlag_prozent: kalk.aufschlag_prozent,
        befestigung_preis: kalk.befestigung_preis,
        sonstiges_preis: kalk.sonstiges_preis,
        arbeitszeit_minuten: kalk.arbeitszeit_minuten,
        stundensatz: kalk.stundensatz,
        einzelpreis: ep,
      };
      updated[index].gesamtpreis = computeItemTotal(updated[index]);
      return updated;
    });
  };

  // Dokumentweiter Aufschlag-Override: setzt den Wert und rechnet ALLE
  // kalkulierten Positionen neu (Ergebnis direkt im Angebot sichtbar).
  const setDocAufschlagOverride = (raw: string) => {
    // parseDecimal versteht "12,5" ebenso wie "12.5"; leer = kein Override.
    const val = raw.trim() === "" ? null : parseDecimal(raw);
    const override = val === null || !isFinite(val) ? null : clamp(val, 0);
    setForm(f => ({ ...f, kalkulation_aufschlag_override: override }));
    setItemsDirty(prev => prev.map(it => {
      if (!it.ist_kalkuliert) return it;
      const eff = override ?? (Number(it.aufschlag_prozent) || 0);
      const ep = round2(calcEinzelpreis({
        ek_preis: Number(it.ek_preis) || 0,
        verschnitt_prozent: Number(it.verschnitt_prozent) || 0,
        aufschlag_prozent: eff,
        befestigung_preis: Number(it.befestigung_preis) || 0,
        sonstiges_preis: Number(it.sonstiges_preis) || 0,
        arbeitszeit_minuten: Number(it.arbeitszeit_minuten) || 0,
        stundensatz: Number(it.stundensatz) || 52,
      }));
      const next = { ...it, einzelpreis: ep };
      next.gesamtpreis = computeItemTotal(next);
      return next;
    }));
  };

  // ── Kalkulation: Preise aus dem Materialkatalog aktualisieren ──────────────
  // Löst das "6-Monate-später"-Problem: ein Angebot speichert pro Position einen
  // Kalkulations-Snapshot (stabil). Steigt später der Material-EK im Katalog,
  // zieht dieser Knopf die AKTUELLE Material-Kalkulation je verknüpfter Position
  // (kalkulation_template_id) neu — explizit und nachvollziehbar (alt→neu).
  const [kalkRefreshing, setKalkRefreshing] = useState(false);
  const [staleKalkCount, setStaleKalkCount] = useState(0);

  const fetchCatalogKalk = useCallback(async (): Promise<Record<string, any>> => {
    const ids = Array.from(new Set(
      items.filter(it => it.ist_kalkuliert && it.kalkulation_template_id)
        .map(it => it.kalkulation_template_id as string)
    ));
    if (ids.length === 0) return {};
    const { data } = await supabase
      .from("invoice_templates")
      .select("id, ek_netto, verschnitt_prozent, aufschlag_prozent, befestigung_preis, sonstiges_preis, arbeitszeit_minuten, stundensatz, ist_kalkuliert")
      .in("id", ids);
    const map: Record<string, any> = {};
    for (const t of (data || [])) map[(t as any).id] = t;
    return map;
  }, [items]);

  const kalkFromTemplate = (t: any) => ({
    ek_preis: Number(t.ek_netto) || 0,
    verschnitt_prozent: Number(t.verschnitt_prozent) || 0,
    aufschlag_prozent: Number(t.aufschlag_prozent) || 0,
    befestigung_preis: Number(t.befestigung_preis) || 0,
    sonstiges_preis: Number(t.sonstiges_preis) || 0,
    arbeitszeit_minuten: Number(t.arbeitszeit_minuten) || 0,
    stundensatz: Number(t.stundensatz) || 52,
  });

  const refreshKalkulationFromCatalog = async () => {
    setKalkRefreshing(true);
    try {
      const map = await fetchCatalogKalk();
      if (Object.keys(map).length === 0) {
        toast({ title: "Keine verknüpften Materialien", description: "Es gibt keine kalkulierten Positionen mit Katalog-Verknüpfung." });
        return;
      }
      let changed = 0;
      let oldTotal = 0, newTotal = 0;
      const next = items.map(it => {
        if (!it.ist_kalkuliert || !it.kalkulation_template_id || !map[it.kalkulation_template_id]) return it;
        const k = kalkFromTemplate(map[it.kalkulation_template_id]);
        const eff = docAufschlagOverride ?? k.aufschlag_prozent;
        const ep = round2(calcEinzelpreis({ ...k, aufschlag_prozent: eff }));
        oldTotal += Number(it.einzelpreis) || 0;
        newTotal += ep;
        if (Math.abs(ep - (Number(it.einzelpreis) || 0)) > 0.005) changed++;
        const updated = { ...it, ...k, einzelpreis: ep };
        updated.gesamtpreis = computeItemTotal(updated);
        return updated;
      });
      setItemsDirty(next);
      setStaleKalkCount(0);
      if (changed === 0) {
        toast({ title: "Preise sind aktuell", description: "Alle kalkulierten Positionen entsprechen bereits dem Materialkatalog." });
      } else {
        toast({
          title: `${changed} Position(en) aktualisiert`,
          description: `Einzelpreise gesamt: € ${eur(oldTotal)} → € ${eur(newTotal)}. Zum Übernehmen speichern.`,
        });
      }
    } finally {
      setKalkRefreshing(false);
    }
  };

  // Stale-Check: beim Laden/Ändern der verknüpften Positionen prüfen, ob der
  // Materialkatalog inzwischen abweicht (Banner-Hinweis). Schlüssel ist die
  // Menge der verknüpften Template-IDs — läuft nicht bei jeder Preis-Eingabe.
  const linkedTemplateKey = useMemo(() => items
    .filter(it => it.ist_kalkuliert && it.kalkulation_template_id)
    .map(it => it.kalkulation_template_id).join(","), [items]);

  useEffect(() => {
    let cancelled = false;
    if (isLocked || !linkedTemplateKey) { setStaleKalkCount(0); return; }
    (async () => {
      const map = await fetchCatalogKalk();
      if (cancelled) return;
      let stale = 0;
      for (const it of items) {
        if (it.ist_kalkuliert && it.kalkulation_template_id && map[it.kalkulation_template_id]) {
          const k = kalkFromTemplate(map[it.kalkulation_template_id]);
          const eff = docAufschlagOverride ?? k.aufschlag_prozent;
          const ep = round2(calcEinzelpreis({ ...k, aufschlag_prozent: eff }));
          if (Math.abs(ep - (Number(it.einzelpreis) || 0)) > 0.005) stale++;
        }
      }
      setStaleKalkCount(stale);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTemplateKey, docAufschlagOverride, isLocked]);

  // Auto-Sync zahlungsbedingungen → faellig_am. Immer wenn der User die
  // Zahlungsfrist (Dropdown) oder das Rechnungsdatum ändert, rechnen wir
  // das Fälligkeitsdatum neu aus. Einzige Ausnahme: "individuell" — dort
  // darf der User das faellig_am-Feld direkt editieren und wir greifen
  // nicht ein.
  useEffect(() => {
    if (form.typ !== "rechnung") return;
    const zb = (form.zahlungsbedingungen || "").trim();
    if (!zb || zb === "individuell") return;
    if (!form.datum) return;
    let days: number | null = null;
    if (/sofort|umgehend|prompt/i.test(zb)) days = 0;
    else {
      const m = zb.match(/(\d+)/);
      if (m) days = parseInt(m[1]);
    }
    if (days === null) return;
    const due = new Date(form.datum + "T12:00:00");
    due.setDate(due.getDate() + days);
    const nextFaellig = format(due, "yyyy-MM-dd");
    if (nextFaellig !== form.faellig_am) {
      setForm(prev => ({ ...prev, faellig_am: nextFaellig }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.zahlungsbedingungen, form.datum, form.typ]);

  // Calculations with discount — round to 2 decimal places to avoid floating-point issues.
  // mwst_exempt-Zeilen enthalten bereits Brutto (z.B. Anzahlungs-Abzüge)
  // und werden separat verrechnet, damit die MwSt der Anzahlung nicht mit
  // dem aktuellen Satz neu berechnet wird.
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const exemptBrutto = r2(items.filter(it => it.mwst_exempt).reduce((sum, it) => sum + Number(it.gesamtpreis || 0), 0));
  const positionenNetto = r2(items.filter(it => !it.mwst_exempt).reduce((sum, it) => sum + Number(it.gesamtpreis || 0), 0));
  const rabattWert = r2(form.rabatt_prozent > 0
    ? positionenNetto * (form.rabatt_prozent / 100)
    : form.rabatt_betrag);
  const nettoSumme = r2(positionenNetto - rabattWert);
  // Bei Reverse Charge (§ 19 Abs. 1a) schuldet der Empfänger die USt — wir
  // weisen keine USt aus, der Rechnungsbetrag = Netto (konsistent mit dem PDF
  // und dem Zahlungsabgleich).
  const mwstBetrag = (form as any).reverse_charge ? 0 : r2(nettoSumme * (form.mwst_satz / 100));
  const bruttoSumme = r2(nettoSumme + mwstBetrag + exemptBrutto);
  const restBetrag = r2(bruttoSumme - form.bezahlt_betrag);

  // ── Verdienst (intern) ────────────────────────────────────────────────────
  // „Was verdiene ich an diesem Angebot?" — dieselbe Rechnung wie in der
  // Auftragskalkulation, aber mit dem TATSÄCHLICHEN Belegerlös: rabattiert der
  // Chef im Angebot nach, sinkt die Marge hier sofort mit.
  // NUR im Editor, NUR für Administratoren — niemals im Kundendokument
  // (PDF/Live-Vorschau bekommen diese Zahlen nirgends durchgereicht).
  const selbstkosten = round2(items.reduce((s, it) => s + selbstkostenVon(it), 0));
  /**
   * Angezeigt wird der Block nur bei echter KALKULATIONSHERKUNFT (mindestens
   * eine Sammelzeile mit Selbstkosten). Bei einem Beleg aus lauter
   * katalog-kalkulierten Einzelpositionen steckt der Verdienst allein im
   * Material-Aufschlag — dort ergäbe die 35-%-Warnschwelle der
   * Auftragskalkulation nur Dauerrot ohne Aussage.
   */
  const hatKostenDaten = items.some(it => it.ist_gruppensumme && (Number(it.ek_preis) || 0) > 0);
  /** Positionen mit Betrag, zu denen keine Kosten bekannt sind (z.B. von Hand ergänzt). */
  const positionenOhneKosten = items.filter(
    it => !it.mwst_exempt && traegtBetrag(it) && selbstkostenVon(it) <= 0
  ).length;
  const deckungsbeitrag = round2(nettoSumme - selbstkosten);
  const margeProzent = calcMargeProzent(deckungsbeitrag, nettoSumme);
  const margeUnterWarnschwelle = nettoSumme <= 0 || deckungsbeitrag < 0 || margeProzent < warnMargeProzent;
  const margeFarbe = deckungsbeitrag < 0 || nettoSumme <= 0
    ? "rot"
    : margeAmpel(margeProzent, warnMargeProzent);
  // Der Block gehört zum Verkaufsvorgang (Angebot / Auftragsbestätigung) —
  // auf Rechnungen ist der Preis längst vereinbart.
  const zeigeVerdienst =
    isAdmin
    && hatKostenDaten
    && !getDocConfig(form.typ).hidePrices
    && (form.typ === "angebot" || form.typ === "auftragsbestaetigung");

  const canDelete = form.typ === "angebot";
  // Stornieren ist für alle rechnungs-artigen Dokumente möglich
  // (Rechnung, Anzahlungsrechnung, Schlussrechnung, Gutschrift) —
  // AT-Rechtsvorschrift: ein Rechnungsbeleg muss stornierbar sein.
  const _cancelableTypes = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung", "gutschrift"]);
  const canCancel = !isNew && !!invoiceId && id !== "new" && _cancelableTypes.has(form.typ) && form.status !== "storniert";

  const handleSave = async (): Promise<boolean> => {
    // Double-click protection — SOFORT setzen um Race-Condition bei schnellen Klicks zu verhindern
    if (saving) return false;
    setSaving(true);
    try {

    if (!form.kunde_name.trim()) {
      setSaving(false);
      toast({ variant: "destructive", title: "Fehler", description: "Kundenname ist erforderlich" });
      return false;
    }
    // Validate ALL items, not just the first
    const validItems = items.filter(item => item.beschreibung.trim());
    if (validItems.length === 0) {
      toast({ variant: "destructive", title: "Fehler", description: "Mindestens eine Position mit Beschreibung ist erforderlich" });
      return false;
    }

    // Rechnungsbetrag muss > 0 sein (außer bei Entwürfen).
    // bruttoSumme ist die korrekt berechnete Anzeige-Summe: mwst_exempt-Zeilen
    // (z.B. Anzahlungs-Abzüge) bekommen KEINE MwSt und der Global-Rabatt ist
    // berücksichtigt — daher dieselbe Größe für die Validierung verwenden.
    const saveBrutto = bruttoSumme;
    // Lieferscheine (hidePrices) sind preislos — € 0,00 ist dort gültig.
    if (saveBrutto <= 0 && form.status !== "entwurf" && !getDocConfig(form.typ).hidePrices) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnungsbetrag muss größer als €0,00 sein" });
      return false;
    }

    // Skonto-Prozent muss zwischen 0 und 100 sein
    if (form.skonto_prozent < 0 || form.skonto_prozent > 100) {
      toast({ variant: "destructive", title: "Ungültiger Skonto", description: "Skonto muss zwischen 0% und 100% liegen" });
      return false;
    }

    // Rabatt-Prozent muss zwischen 0 und 100 sein
    if ((form.rabatt_prozent ?? 0) < 0 || (form.rabatt_prozent ?? 0) > 100) {
      toast({ variant: "destructive", title: "Ungültiger Rabatt", description: "Rabatt muss zwischen 0% und 100% liegen" });
      return false;
    }

    // Rabatt-Betrag (Global-Rabatt €) darf NICHT negativ sein. Ein negativer
    // Rabatt erhöhte die Belegsumme, wurde im PDF aber nicht ausgewiesen —
    // die gedruckten Positionen passten dann nicht zur Nettosumme.
    if ((form.rabatt_betrag ?? 0) < 0) {
      toast({ variant: "destructive", title: "Ungültiger Rabatt", description: "Ein Rabatt kann nicht negativ sein. Bitte 0 oder einen positiven Betrag eintragen." });
      return false;
    }

    // Rabatt-Betrag (Global-Rabatt €) darf die nicht-steuerbefreite Positions-
    // Netto-Summe nicht überschreiten. positionenNetto (oben) schließt
    // mwst_exempt-Zeilen bereits aus.
    if (form.rabatt_betrag > positionenNetto) {
      toast({ variant: "destructive", title: "Ungültiger Rabatt", description: `Rabatt-Betrag (€${eur(form.rabatt_betrag)}) darf die Netto-Summe (€${eur(positionenNetto)}) nicht überschreiten` });
      return false;
    }

    // Pro-Position Rabatt prüfen
    const invalidRabatt = items.find(i => (i.rabatt_prozent ?? 0) < 0 || (i.rabatt_prozent ?? 0) > 100);
    if (invalidRabatt) {
      toast({ variant: "destructive", title: "Ungültiger Positions-Rabatt", description: "Rabatt pro Position muss zwischen 0% und 100% liegen" });
      return false;
    }

    // Reverse Charge: UID-Nummer des Kunden ist Pflicht (§ 19 UStG)
    if ((form as any).reverse_charge && !form.kunde_uid?.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Bei Reverse Charge ist die UID-Nummer des Kunden Pflicht" });
      return false;
    }
    // Firmen-UID (§ 11 UStG): bei Reverse Charge zwingend, bei jeder Rechnung
    // > 400 € (keine Kleinbetragsrechnung) als Pflichtangabe stark empfohlen.
    {
      const docCfg = getDocConfig(form.typ);
      const isReverse = !!(form as any).reverse_charge;
      const needsUid = isReverse || (docCfg.isInvoiceLike && bruttoSumme > 400);
      if (needsUid) {
        const { data: firmenUidSetting } = await supabase.from("app_settings").select("value").eq("key", "firmen_uid").maybeSingle();
        if (!firmenUidSetting?.value?.trim()) {
          if (isReverse) {
            toast({ variant: "destructive", title: "Eigene UID fehlt", description: "Bei Reverse Charge ist die UID-Nummer des Ausstellers Pflicht. Bitte im Admin-Bereich → Rechnungslayout konfigurieren." });
            return false;
          }
          // Normale Rechnung: NICHT blockieren, aber deutlich auf die
          // finanzamtsrechtliche Pflichtangabe hinweisen. (Vorher scheiterte
          // jede Rechnung über 400 € hart an dieser fehlenden Einstellung.)
          toast({
            variant: "destructive",
            title: "Firmen-UID fehlt — Beleg wird trotzdem gespeichert",
            description: "Ab € 400 verlangt § 11 UStG die UID-Nummer des Ausstellers auf der Rechnung. Bitte unter Einstellungen → Admin-Bereich → Rechnungslayout die Firmen-UID hinterlegen und den Beleg danach erneut als PDF erzeugen.",
            duration: 10000,
          });
        }
      }
    }

    // § 11 UStG verlangt einen Leistungstag/-zeitraum auf der Rechnung.
    // Wenn der User nichts eingibt, fällt der Leistungszeitraum-von
    // automatisch auf das Rechnungsdatum (form.datum) — siehe Renderer.
    // Daher hier kein harter Pflicht-Check mehr.

    // Austrian UID requirements — die fehlende FIRMEN-UID darf das Speichern
    // NICHT blockieren: sonst lässt sich keine Rechnung über 400 € anlegen,
    // solange der Admin-Bereich nicht gepflegt ist, und der Betrieb steht.
    // Der Hinweis oben (needsUid-Block) weist deutlich darauf hin; hier wird
    // nur noch gewarnt, gespeichert wird trotzdem.
    if (form.typ === "rechnung" && saveBrutto > 10000 && !form.kunde_uid?.trim()) {
      toast({ variant: "destructive", title: "Kunden-UID fehlt", description: "Bei Rechnungen über €10.000 ist die UID-Nummer des Empfängers gesetzlich vorgeschrieben." });
      setSaving(false);
      return false;
    }

    // setSaving(true) bereits am Anfang gesetzt — kein erneuter Aufruf nötig
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Nicht angemeldet" });
      setSaving(false);
      return false;
    }

    try {
      let savedId = invoiceId;
      let customerId = form.customer_id;

      // Auto-create customer if no customer_id is set (never overwrite existing customer master data)
      if (form.kunde_name.trim()) {
        if (customerId) {
          // Customer already linked – keep as-is, invoice stores its own snapshot
        } else {
          // Check for existing customer with same name + PLZ (duplicate protection)
          let custQuery = supabase.from("customers").select("id").ilike("name", form.kunde_name.trim());
          if (form.kunde_plz?.trim()) custQuery = custQuery.eq("plz", form.kunde_plz.trim());
          const { data: existingCust } = await custQuery.limit(1).maybeSingle();

          if (existingCust) {
            customerId = existingCust.id;
          } else {
            const { data: newCust, error: custErr } = await supabase.from("customers").insert({
              user_id: user.id,
              name: form.kunde_name,
              adresse: form.kunde_adresse || null,
              plz: form.kunde_plz || null,
              ort: form.kunde_ort || null,
              land: form.kunde_land || null,
              email: form.kunde_email || null,
              telefon: form.kunde_telefon || null,
              uid_nummer: form.kunde_uid || null,
            }).select("id").single();
            if (custErr) {
              // Stammkunde konnte nicht angelegt werden — Rechnung/Angebot
              // trotzdem speichern (eigener Kunden-Snapshot bleibt erhalten).
              console.warn("Kunde nicht als Stammkunde angelegt:", custErr.message);
            } else if (newCust) {
              customerId = newCust.id;
            }
          }
          updateField("customer_id", customerId);
        }
      }

      // Rechnungsartige Belege (Rechnung, Anzahlungs-, Schlussrechnung,
      // Gutschrift) sind mit dem Speichern ausgestellt und damit mindestens
      // "offen" — sonst blieben sie ewig "entwurf", könnten keine Zahlung
      // annehmen und wären nachträglich beliebig editierbar.
      // Bereits gesetzte Zahlungs-/Storno-Stati bleiben unangetastet.
      const _behaltStatus = new Set(["teilbezahlt", "bezahlt", "storniert", "verrechnet"]);
      const saveStatus = RECHNUNGSARTIGE_TYPEN.has(form.typ)
        ? (_behaltStatus.has(form.status) ? form.status : "offen")
        : (form.status || "offen");

      // Defensive Parent-Normalisierung: für AR/SR muss parent_invoice_id
      // auf einen echten Positionsträger (Angebot oder AB) zeigen — niemals
      // auf eine andere Rechnung oder AR. Wenn der Form-State einen
      // "verkürzten" Parent hat (z.B. durch manuelle Manipulation oder
      // ältere Daten), wandern wir hoch und korrigieren das vor dem Save.
      let normalizedParentId: string | null = (form as any).parent_invoice_id || null;
      if (normalizedParentId && (form.typ === "anzahlungsrechnung" || form.typ === "schlussrechnung")) {
        let cursor: string | null = normalizedParentId;
        for (let i = 0; i < 5 && cursor; i++) {
          const { data: parentRow } = await supabase
            .from("invoices")
            .select("id, typ, parent_invoice_id")
            .eq("id", cursor)
            .maybeSingle();
          const pt = (parentRow as any)?.typ;
          if (pt === "angebot" || pt === "auftragsbestaetigung") {
            normalizedParentId = cursor;
            break;
          }
          cursor = (parentRow as any)?.parent_invoice_id || null;
        }
      }

      const invoicePayload: any = {
        status: saveStatus,
        kunde_name: form.kunde_name,
        kunde_adresse: form.kunde_adresse || null,
        kunde_plz: form.kunde_plz || null,
        kunde_ort: form.kunde_ort || null,
        kunde_land: form.kunde_land || null,
        kunde_email: form.kunde_email || null,
        kunde_telefon: form.kunde_telefon || null,
        kunde_uid: form.kunde_uid || null,
        kunde_anrede: (form as any).kunde_anrede || null,
        kunde_titel: (form as any).kunde_titel || null,
        reverse_charge: (form as any).reverse_charge || false,
        datum: form.datum,
        faellig_am: form.faellig_am || null,
        leistungsdatum: form.leistungsdatum || null,
        zahlungsbedingungen: form.zahlungsbedingungen || null,
        notizen: form.notizen || null,
        betreff: form.betreff || null,
        netto_summe: nettoSumme,
        mwst_satz: form.mwst_satz,
        mwst_betrag: mwstBetrag,
        brutto_summe: bruttoSumme,
        project_id: form.project_id || null,
        bezahlt_betrag: form.bezahlt_betrag,
        customer_id: customerId || null,
        gueltig_bis: form.gueltig_bis || null,
        rabatt_prozent: form.rabatt_prozent,
        rabatt_betrag: form.rabatt_betrag,
        kalkulation_aufschlag_override: form.kalkulation_aufschlag_override ?? null,
        mahnstufe: form.mahnstufe,
        skonto_prozent: form.skonto_prozent || 0,
        skonto_tage: form.skonto_tage || 0,
        kundennummer: (form as any).kundennummer || null,
        parent_invoice_id: normalizedParentId,
        anzahlung_prozent: (form as any).anzahlung_prozent ?? null,
        anzahlung_betrag: (form as any).anzahlung_betrag ?? null,
        ansprechpartner_employee_id: (form as any).ansprechpartner_employee_id || null,
        ansprechpartner_name: (form as any).ansprechpartner_name?.trim() || null,
        ansprechpartner_telefon: (form as any).ansprechpartner_telefon?.trim() || null,
        ansprechpartner_email: (form as any).ansprechpartner_email?.trim() || null,
      };

      // leistungsdatum_bis nur mitschicken, wenn der User es befüllt hat —
      // ältere DB-Stände ohne die Migration 20260503100000 haben die
      // Spalte nicht und PostgREST würde sonst mit Schema-Cache-Fehler
      // ablehnen. Bei vorhandener Spalte funktioniert es trotzdem.
      if (form.leistungsdatum_bis) {
        invoicePayload.leistungsdatum_bis = form.leistungsdatum_bis;
      }
      // Allgemeine Angaben (Migration 20260509100000) — gleiche Retry-
      // Logik. Nur befüllte Felder mitschicken, damit ältere DB-Stände
      // ohne die Spalten weiter funktionieren.
      const aaFields: Array<keyof InvoiceData> = [
        "leistungsbeschreibung",
        "ausfuehrungsort",
        "ausfuehrungs_kw",
        "ausfuehrende_firma",
        "ausfuehrende_firma_freitext",
      ];
      for (const f of aaFields) {
        const v = (form as any)[f];
        if (v && String(v).trim()) (invoicePayload as any)[f] = String(v).trim();
      }
      // Toggle (Migration 20260509200000) — boolean immer mitschicken
      // (auch false), damit beim Toggeln-und-Speichern der State
      // korrekt persistiert wird.
      (invoicePayload as any).allgemeine_angaben_aktiv = !!form.allgemeine_angaben_aktiv;

      // Herkunft Auftragskalkulation (Migration 20260722110000) — nur
      // mitschicken, wenn gesetzt. Fehlt die Spalte, greift der Retry unten.
      if (kalkulationId) {
        (invoicePayload as any).kalkulation_id = kalkulationId;
      }

      // Gutschrift-Verrechnung (Migration 20260511000000) — nur
      // mitschicken, wenn überhaupt gesetzt.
      if (form.verrechnet_mit_invoice_id) {
        (invoicePayload as any).verrechnet_mit_invoice_id = form.verrechnet_mit_invoice_id;
      }
      if (form.verrechnet_am) {
        (invoicePayload as any).verrechnet_am = form.verrechnet_am;
      }

      // Defensive Retry: wenn eine der neuen Spalten (noch) fehlt,
      // einmal ohne sie erneut speichern, damit der User trotz
      // fehlender Migration weiter arbeiten kann. Erfasst sowohl
      // leistungsdatum_bis als auch die Allgemeine-Angaben-Felder,
      // den allgemeine_angaben_aktiv-Toggle und die Gutschrift-
      // Verrechnungs-Felder.
      const allTolerantCols = [
        "leistungsdatum_bis", "allgemeine_angaben_aktiv",
        "verrechnet_mit_invoice_id", "verrechnet_am", "kalkulation_id",
        ...aaFields,
      ];
      const isSchemaCacheMiss = (err: any) =>
        typeof err?.message === "string" &&
        allTolerantCols.some((col) => err.message.includes(col)) &&
        /(schema cache|column .* does not exist)/i.test(err.message);
      /**
       * Entfernt die Spalten, die die Datenbank in ihrer Fehlermeldung
       * benennt — und nur diese. (Vorher flogen IMMER alle toleranten Spalten
       * raus: eine einzige fehlende Spalte hätte damit auch die Allgemeinen
       * Angaben und leistungsdatum_bis mit weggeworfen.) Benennt der Fehler
       * keine bekannte Spalte, bleibt es beim bisherigen Rundumschlag.
       */
      const stripTolerantCols = (payload: any, err?: any) => {
        const msg = typeof err?.message === "string" ? err.message : "";
        const betroffen = allTolerantCols.filter((col) => msg.includes(col));
        const next: any = { ...payload };
        for (const col of (betroffen.length > 0 ? betroffen : allTolerantCols)) delete next[col];
        return next;
      };

      if (isNew || !savedId) {
        // DOPPEL-BELEG-SPERRE: Ein Angebot lässt sich in zwei Tabs öffnen und
        // zweimal in eine Rechnung wandeln — der Kunde bekäme dieselbe
        // Leistung zweimal verrechnet. Deshalb unmittelbar vor dem Insert
        // gegen die DB prüfen, ob zum selben Vorgänger schon ein
        // nicht-stornierter Beleg dieses Typs existiert.
        // (Anzahlungsrechnungen und Lieferscheine sind ausgenommen — davon
        // gibt es zu einem Auftrag legitim mehrere.)
        if (normalizedParentId && EINMALIGE_FOLGETYPEN.has(form.typ)) {
          const { data: geschwister } = await supabase
            .from("invoices")
            .select("id, nummer, status")
            .eq("parent_invoice_id", normalizedParentId)
            .eq("typ", form.typ)
            .neq("status", "storniert")
            .limit(1);
          const vorhanden = ((geschwister as any[]) || [])[0];
          if (vorhanden) {
            const quelle = getDocConfig(form.typ).label;
            toast({
              variant: "destructive",
              title: `${quelle} existiert bereits`,
              description: `Zu diesem Vorgänger-Beleg existiert bereits ${quelle} ${vorhanden.nummer || ""}. Storniere sie zuerst, wenn du sie neu erstellen willst.`,
              duration: 10000,
            });
            setSaving(false);
            return false;
          }
        }

        const { data: numData, error: numError } = await supabase.rpc("next_document_number" as never, {
          p_typ: form.typ,
          p_jahr: form.jahr,
        } as never);

        if (numError) throw numError;
        const nummer = numData as string;
        const laufnummer = parseInt((nummer.match(/(\d+)$/) || ["", "1"])[1]) || 1;

        const insertOnce = async (payload: any) => supabase
          .from("invoices")
          .insert({ user_id: user.id, typ: form.typ, nummer, laufnummer, jahr: form.jahr, ...payload })
          .select("id, nummer, updated_at")
          .single();

        let { data: insertData, error: insertError } = await insertOnce(invoicePayload);
        if (insertError && isSchemaCacheMiss(insertError)) {
          ({ data: insertData, error: insertError } = await insertOnce(stripTolerantCols(invoicePayload, insertError)));
        }

        if (insertError) throw insertError;
        savedId = insertData!.id;
        setInvoiceId(savedId);
        setGeladenerStand(((insertData as any)?.updated_at as string) || null);
        updateField("nummer", insertData!.nummer);
      } else {
        // LOST UPDATE verhindern: nur schreiben, wenn der Beleg seit dem Laden
        // unverändert ist. Trifft das Update 0 Zeilen, hat ein anderer Tab /
        // Kollege zwischenzeitlich gespeichert — dann NICHTS überschreiben.
        const updateOnce = async (payload: any) => {
          let q = supabase.from("invoices").update(payload).eq("id", savedId);
          if (geladenerStand) q = q.eq("updated_at", geladenerStand);
          return q.select("id, updated_at");
        };

        let { data: updRows, error: updateError } = await updateOnce(invoicePayload);
        if (updateError && isSchemaCacheMiss(updateError)) {
          ({ data: updRows, error: updateError } = await updateOnce(stripTolerantCols(invoicePayload, updateError)));
        }

        if (updateError) throw updateError;
        if (geladenerStand && (!updRows || (updRows as any[]).length === 0)) {
          toast({
            variant: "destructive",
            title: "Beleg zwischenzeitlich geändert",
            description: "Der Beleg wurde zwischenzeitlich geändert. Bitte neu laden. Es wurde nichts überschrieben.",
            duration: 12000,
          });
          setSaving(false);
          return false;
        }
        setGeladenerStand(((updRows as any[])?.[0]?.updated_at as string) || null);
      }

      await supabase.from("invoice_items").delete().eq("invoice_id", savedId!);

      // Filter empty items before saving
      const validItems = items.filter(item => item.beschreibung.trim());
      const itemsToInsert = validItems.map((item, idx) => ({
        invoice_id: savedId!,
        position: idx + 1,
        beschreibung: item.beschreibung,
        kurztext: item.kurztext || item.beschreibung,
        langtext: item.langtext || null,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.gesamtpreis,
        produktnummer: item.produktnummer || null,
        rabatt_prozent: item.rabatt_prozent || 0,
        mwst_exempt: item.mwst_exempt || false,
        set_template_id: item.set_template_id || null,
        set_snapshot: item.set_snapshot || null,
        ist_kalkuliert: item.ist_kalkuliert || false,
        kalkulation_template_id: item.kalkulation_template_id || null,
        ek_preis: item.ek_preis || 0,
        verschnitt_prozent: item.verschnitt_prozent || 0,
        aufschlag_prozent: item.aufschlag_prozent || 0,
        befestigung_preis: item.befestigung_preis || 0,
        sonstiges_preis: item.sonstiges_preis || 0,
        arbeitszeit_minuten: item.arbeitszeit_minuten || 0,
        stundensatz: item.stundensatz || 52,
        // Gruppen + Sichtbarkeit
        gruppe: gruppeVon(item) || null,
        auf_pdf: istSichtbar(item),
        ist_gruppensumme: !!item.ist_gruppensumme,
      }));

      // Tolerant gegen eine (noch) fehlende Gruppen-Migration: schlägt der
      // Insert nur wegen der drei neuen Spalten fehl, speichern wir den Beleg
      // ohne sie — besser als ein verlorener Beleg.
      let { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert);
      if (itemsError && isGruppenSpaltenFehlen(itemsError)) {
        ({ error: itemsError } = await supabase
          .from("invoice_items")
          .insert(itemsToInsert.map(ohneGruppenSpalten)));
      }
      if (itemsError) throw itemsError;

      // Update form status to reflect saved state
      if (form.status === "entwurf") {
        updateField("status", saveStatus);
      }

      // Mark original Angebot as "verrechnet" when saving the converted Rechnung
      // Wenn eine rechnungs-artige Konvertierung gespeichert wurde
      // (Rechnung / AR / SR), alle Angebot-/AB-/Lieferschein-Vorfahren
      // in der Kette auf "verrechnet" setzen. Wir wandern per
      // parent_invoice_id hoch (max. 5 Hops als Safety-Net gegen
      // Datenfehler) und markieren jeden Angebot-/AB-/LS-Knoten.
      // Zwischenknoten vom Typ Rechnung oder AR werden dabei einfach
      // übersprungen (ihr Status behält seine eigene Bedeutung:
      // offen/teilbezahlt/bezahlt).
      const _invoiceLikeTypesForVerrechnet = new Set(["rechnung", "anzahlungsrechnung", "schlussrechnung"]);
      if (fromAngebotId && _invoiceLikeTypesForVerrechnet.has(form.typ)) {
        let hopCursor: string | null = fromAngebotId;
        for (let i = 0; i < 5 && hopCursor; i++) {
          const { data: hop } = await supabase
            .from("invoices")
            .select("id, typ, status, parent_invoice_id")
            .eq("id", hopCursor)
            .maybeSingle();
          const hopTyp = (hop as any)?.typ;
          if (hopTyp === "angebot" || hopTyp === "auftragsbestaetigung" || hopTyp === "lieferschein") {
            if ((hop as any)?.status !== "verrechnet" && (hop as any)?.status !== "storniert") {
              await supabase.from("invoices").update({ status: "verrechnet" }).eq("id", hopCursor);
            }
          }
          hopCursor = (hop as any)?.parent_invoice_id || null;
        }
        setFromAngebotId(null);
      }

      setIsDirty(false);
      toast({ title: "Gespeichert", description: `${getDocConfig(form.typ).label} wurde gespeichert` });

      // Wenn Projekt zugeordnet → PDF zusätzlich in den Projektordner ablegen
      if (savedId && form.project_id) {
        void uploadInvoicePdfToProjectFolder(savedId);
      }

      if (isNew && !previewOpen) {
        navigate(`/invoices/${savedId}`, { replace: true });
      } else if (isNew) {
        // Preview is open — don't navigate (would lose state), just update URL silently
        window.history.replaceState(null, "", `/invoices/${savedId}`);
      }

      setSaving(false);
      return true;
    } catch (err: any) {
      console.error("Fehler beim Speichern:", err);
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Speichern fehlgeschlagen" });
      setSaving(false);
      return false;
    }
    } finally {
      // Garantie: der Speichern-Button bleibt NIE hängen — auch wenn eine
      // Validierung oben früh mit `return false` abbricht.
      setSaving(false);
    }
  };

  /**
   * Erzeugt client-seitig das Rechnungs-/Angebots-PDF und legt es im Projekt-
   * Ordner ab (project-reports/<project_id>/rechnungen/ oder /angebote/).
   * Wird nach jedem Save aufgerufen, wenn die Rechnung/das Angebot einem
   * Projekt zugeordnet ist — non-blocking.
   */
  const uploadInvoicePdfToProjectFolder = async (invId: string) => {
    if (!form.project_id) return;
    try {
      const [{ generateInvoicePdf }, { loadInvoiceLogo }, { uploadProjectPdf }, { generateEpcQrCode }] =
        await Promise.all([
          import("@/lib/pdfGenerator"),
          import("@/lib/logoLoader"),
          import("@/lib/pdfUploader"),
          import("@/lib/invoiceHtml"),
        ]);

      // Bankdaten + UID aus Einstellungen laden
      const { data: bankSettings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]);
      const bank = { kontoinhaber: "", iban: "", bic: "" };
      let firmenUid = "";
      bankSettings?.forEach((s: any) => {
        if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
        if (s.key === "bank_iban") bank.iban = s.value;
        if (s.key === "bank_bic") bank.bic = s.value;
        if (s.key === "firmen_uid") firmenUid = s.value || "";
      });

      const logoUri = await loadInvoiceLogo();
      const invoiceForPdf = await buildInvoiceForPdf();
      // EPC-QR-Code (GiroCode) wie im Download-/Print-Pfad
      let qrDataUri: string | undefined;
      const isInvoiceLike = ["rechnung", "anzahlungsrechnung", "schlussrechnung"].includes(form.typ);
      if (isInvoiceLike && bank.iban && bank.bic && bank.kontoinhaber && bruttoSumme > 0) {
        try {
          qrDataUri = await generateEpcQrCode(bruttoSumme, form.nummer || "", bank);
        } catch { /* optional */ }
      }
      const pdfBlob = await generateInvoicePdf(
        invoiceForPdf,
        items as any,
        bank,
        logoUri,
        qrDataUri,
        firmenUid,
        invoiceLayout,
      );

      const basename = `${form.typ === "rechnung" ? "Rechnung" : "Angebot"}-${form.nummer || invId.slice(0, 8)}-${form.datum}`;
      await uploadProjectPdf({
        projectId: form.project_id,
        category: form.typ === "angebot" ? "angebote" : "rechnungen",
        basename,
        blob: pdfBlob,
      });
    } catch (err: any) {
      // Vite/Rollup Chunk-Hash-Mismatch nach Deploy → reload
      if (err?.message?.includes("Failed to fetch dynamically imported module")) {
        window.location.reload();
        return;
      }
      console.warn("PDF-Upload in Projektordner fehlgeschlagen:", err);
    }
  };

  const handlePreview = () => {
    // Open preview directly — don't save automatically
    setPreviewSaved(!isNew && !!invoiceId && RECHNUNGSARTIGE_TYPEN.has(form.typ) && form.status !== "entwurf");
    setPreviewOpen(true);
  };

  const handleSaveFromPreview = async () => {
    const success = await handleSave();
    if (success) {
      setPreviewSaved(true);
      toast({ title: "Gespeichert" });
    }
  };

  // Payment functions
  const loadPayments = async (invId: string) => {
    const { data } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", invId)
      .order("datum");
    if (data) setPayments(data);
  };

  const loadMahnungen = async () => {
    if (!invoiceId) return;
    const { data } = await supabase
      .from("mahnung_history")
      .select("mahnstufe, created_at")
      .eq("invoice_id", invoiceId)
      .order("created_at");
    if (data) setMahnungen(data);
  };

  const addPayment = async () => {
    if (!invoiceId) return;
    // WICHTIG: leeres Feld ≠ 0. Vorher stand hier `Number(x) || restBetrag` —
    // Number("0") ist falsy, also wurde bei der Eingabe "0" die KOMPLETTE
    // Rechnung als bezahlt verbucht. parseDecimal liefert bei leerer Eingabe
    // null (→ Rest als Vorschlag), bei "0" die Zahl 0 (→ Fehlermeldung).
    const eingabe = parseDecimal(newPaymentAmount);
    let betrag = round2(eingabe === null ? restBetrag : eingabe);

    if (!isFinite(betrag)) {
      toast({ variant: "destructive", title: "Ungültiger Betrag", description: "Bitte einen gültigen Zahlungsbetrag eingeben (z.B. 1.250,50)." });
      return;
    }
    // Negative oder 0-Zahlungen ablehnen mit Toast (nicht silent) — die
    // Datenbank lehnt sie seit Migration 20260721090000 ohnehin ab.
    if (betrag < 0) {
      toast({ variant: "destructive", title: "Ungültiger Betrag", description: "Der Zahlungsbetrag muss größer als € 0,00 sein." });
      return;
    }
    if (betrag === 0) {
      toast({
        variant: "destructive",
        title: "Betrag fehlt",
        description: eingabe === null
          ? "Bitte einen Zahlungsbetrag eingeben."
          : "€ 0,00 kann nicht verbucht werden. Bitte den tatsächlich bezahlten Betrag eingeben.",
      });
      return;
    }

    // M-6: Überzahlung ablehnen mit Toast
    const maxBetrag = round2(bruttoSumme - form.bezahlt_betrag);
    if (betrag > maxBetrag) {
      toast({ variant: "destructive", title: "Betrag zu hoch", description: `Maximal € ${eur(maxBetrag)} offen` });
      return;
    }

    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoiceId,
      betrag,
      datum: newPaymentDate,
      notizen: newPaymentNote.trim() || null,
    });

    if (error) {
      // Die DB-CHECK-Constraint (betrag > 0) darf nicht als roher
      // Postgres-Fehler beim Chef landen.
      const msg = String(error.message || "");
      toast({
        variant: "destructive",
        title: "Zahlung nicht gespeichert",
        description: /betrag/i.test(msg) && /check|constraint/i.test(msg)
          ? "Der Zahlungsbetrag muss größer als € 0,00 sein."
          : (msg || "Die Zahlung konnte nicht gespeichert werden."),
      });
      return;
    }

    // Update bezahlt_betrag on invoice
    const newTotal = round2(form.bezahlt_betrag + betrag);
    // Preserve storno status — don't override with payment status
    const newStatus = form.status === "storniert" ? "storniert" : (newTotal >= round2(bruttoSumme) ? "bezahlt" : "teilbezahlt");
    await supabase.from("invoices").update({ bezahlt_betrag: newTotal, status: newStatus }).eq("id", invoiceId);
    // Eigener Schreibvorgang → updated_at nachziehen, sonst scheitert das
    // nächste Speichern fälschlich am Optimistic Locking.
    await standNachziehen(invoiceId);
    updateField("bezahlt_betrag", newTotal);
    updateField("status", newStatus);

    setNewPaymentAmount("");
    clearRoh("zahlung:betrag");
    setNewPaymentNote("");
    setNewPaymentDate(format(new Date(), "yyyy-MM-dd"));
    loadPayments(invoiceId);
    toast({ title: "Zahlung erfasst", description: `€ ${eur(betrag)} am ${newPaymentDate}` });
  };

  const deletePayment = async (paymentId: string) => {
    if (!invoiceId) return;
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    await supabase.from("invoice_payments").delete().eq("id", paymentId);
    const newTotal = round2(Math.max(0, form.bezahlt_betrag - Number(payment.betrag)));
    // Don't overwrite storniert status
    const newStatus = form.status === "storniert" ? "storniert" : newTotal <= 0 ? "offen" : newTotal >= round2(bruttoSumme) ? "bezahlt" : "teilbezahlt";
    await supabase.from("invoices").update({ bezahlt_betrag: newTotal, status: newStatus }).eq("id", invoiceId);
    await standNachziehen(invoiceId);
    updateField("bezahlt_betrag", newTotal);
    updateField("status", newStatus);
    loadPayments(invoiceId);
    toast({ title: "Zahlung gelöscht" });
  };

  /**
   * Baut das Invoice-Objekt für die PDF/HTML-Generierung — mit allen
   * Override-Texten (custom_intro_text / custom_closing_text /
   * custom_anzahlung_hinweis) und mit den live-berechneten Summen
   * (brutto/netto/mwst). Der pure form-State enthält diese Werte
   * nicht; ohne diesen Helper landet im PDF "0,00 €" als Summe.
   */
  const buildInvoiceForPdf = async (): Promise<any> => {
    const { loadDocumentTexts, applyDocumentTextsToInvoice } = await import("@/lib/documentTextsLoader");
    const docTexts = await loadDocumentTexts(form.typ);
    const tageMatch = (form.zahlungsbedingungen || "").match(/\d+/);
    // Kundentyp für PDF-Renderer mitliefern — Geschäftskunden zeigen
    // keine "Anrede" über dem Firmennamen (verhindert "Firma\nFirma X"-
    // Doppelung in der Anschrift). Fallback: leerer String.
    let kundeKundentyp = "";
    if (form.customer_id) {
      try {
        const { data: cust } = await (supabase.from("customers" as any) as any)
          .select("kundentyp")
          .eq("id", form.customer_id)
          .maybeSingle();
        kundeKundentyp = (cust as any)?.kundentyp || "";
      } catch { /* ignore — heuristik im Renderer fängt das ab */ }
    }
    const enriched: any = {
      ...form,
      kunde_kundentyp: kundeKundentyp,
      netto_summe: nettoSumme,
      mwst_betrag: mwstBetrag,
      brutto_summe: bruttoSumme,
    };
    const extraVars: Record<string, string | number | null | undefined> = {
      tage: tageMatch ? Number(tageMatch[0]) : 14,
    };
    // Quell-Dokument für AB / Anzahlungs-/Schluss-Rechnung laden — die
    // Platzhalter {{angebot_nr}} / {{angebot_datum}} (in der AB-Vorlage)
    // bzw. {{rechnung_nr}} / {{rechnung_datum}} (analog für AR/SR)
    // sollen auf das parent invoice zeigen, NICHT auf das aktuelle
    // Dokument. parent_invoice_id wird beim Konvertieren in
    // setForm(...) gesetzt (siehe oben, fromDoc-Pfad).
    const parentId = (form as any).parent_invoice_id;
    if (parentId) {
      try {
        const { data: parent } = await supabase
          .from("invoices")
          .select("nummer, datum")
          .eq("id", parentId)
          .maybeSingle();
        if (parent) {
          const parentNr = (parent as any).nummer || "";
          const parentDatumIso = (parent as any).datum;
          const parentDatum = parentDatumIso
            ? new Date(parentDatumIso + "T12:00:00").toLocaleDateString("de-AT")
            : "";
          // Sowohl angebot_* als auch rechnung_* setzen — die jeweilige
          // Vorlage nutzt nur eine Variante, die andere bleibt unbenutzt.
          extraVars.angebot_nr = parentNr;
          extraVars.angebot_datum = parentDatum;
          extraVars.rechnung_nr = parentNr;
          extraVars.rechnung_datum = parentDatum;
          // Werte zusätzlich am enriched-Objekt anhängen, damit der
          // PDF-/HTML-Renderer einen sichtbaren Bezugs-Block für
          // Gutschriften rendern kann (ohne dass der User den
          // Platzhalter manuell in den Closing-Text packen muss).
          enriched._parent_nummer = parentNr;
          enriched._parent_datum = parentDatum;
        }
      } catch { /* tolerant — Default aus invoice.datum greift dann */ }
    }
    return applyDocumentTextsToInvoice(enriched, docTexts, extraVars);
  };

  /** Erzeugt das Rechnungs-PDF client-side (jsPDF). Lädt Bank+UID+Logo+Layout
   *  aus den Einstellungen. Liefert einen Blob zurück. */
  const buildInvoicePdfBlob = async (): Promise<Blob> => {
    const [{ generateInvoicePdf }, { loadInvoiceLogo }, { generateEpcQrCode }] = await Promise.all([
      import("@/lib/pdfGenerator"),
      import("@/lib/logoLoader"),
      import("@/lib/invoiceHtml"),
    ]);

    const { data: bankSettings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]);
    const bank = { kontoinhaber: "", iban: "", bic: "" };
    let firmenUid = "";
    bankSettings?.forEach((s: any) => {
      if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
      if (s.key === "bank_iban") bank.iban = s.value;
      if (s.key === "bank_bic") bank.bic = s.value;
      if (s.key === "firmen_uid") firmenUid = s.value || "";
    });

    const logoUri = await loadInvoiceLogo();
    const invoiceForPdf = await buildInvoiceForPdf();
    // EPC-QR-Code (GiroCode) nur für rechnungs-artige Dokumente, wenn Bank-
    // Daten vollständig sind. Verwendungszweck = Rechnungsnummer (kommt aus
    // dem Renderer als Unstructured Reference an die Banking-App).
    let qrDataUri: string | undefined;
    const isInvoiceLike = ["rechnung", "anzahlungsrechnung", "schlussrechnung"].includes(form.typ);
    if (isInvoiceLike && bank.iban && bank.bic && bank.kontoinhaber && bruttoSumme > 0) {
      try {
        qrDataUri = await generateEpcQrCode(bruttoSumme, form.nummer || "", bank);
      } catch { /* QR optional — Render geht ohne weiter */ }
    }
    return generateInvoicePdf(
      invoiceForPdf,
      items as any,
      bank,
      logoUri,
      qrDataUri,
      firmenUid,
      invoiceLayout,
    );
  };

  const handleDownloadPdf = async () => {
    if (!invoiceId) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte zuerst speichern" });
      return;
    }
    try {
      const pdfBlob = await buildInvoicePdfBlob();

      // Datei direkt herunterladen
      const fileName = `${form.nummer || "Dokument"}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Zusätzlich ins Archiv hochladen (best effort, blockiert den Download nicht)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.storage
            .from("invoice-pdfs")
            .upload(`${user.id}/${invoiceId}/${fileName}`, pdfBlob, { upsert: true, contentType: "application/pdf" });
          loadStoredPdfs(invoiceId);
        }
      } catch { /* ignore archive errors */ }

      toast({ title: "PDF erzeugt", description: fileName });
    } catch (err: any) {
      console.error("PDF-Fehler:", err);
      toast({ variant: "destructive", title: "PDF-Fehler", description: err.message || "PDF konnte nicht erstellt werden" });
    }
  };

  const handlePrintPdf = async () => {
    if (!invoiceId) return;
    try {
      const pdfBlob = await buildInvoicePdfBlob();
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, "_blank");
      // Browser öffnet das PDF direkt mit eingebautem Viewer → Druck via Ctrl/Cmd+P
      // URL erst nach 60s freigeben, damit der Tab Zeit zum Laden hat.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (!printWindow) {
        toast({ variant: "destructive", title: "Popup blockiert", description: "Bitte Popups für diese Seite erlauben." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Drucken fehlgeschlagen", description: err.message });
    }
  };

  const handleDownloadStoredPdf = async (fileName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !invoiceId) return;

    const { data } = await supabase.storage
      .from("invoice-pdfs")
      .download(`${user.id}/${invoiceId}/${fileName}`);

    if (data) {
      const text = await data.text();
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(text);
        printWindow.document.close();
      }
    }
  };

  const handleDuplicate = async () => {
    if (!invoiceId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data: numData, error: numError } = await supabase.rpc("next_document_number" as never, {
        p_typ: form.typ,
        p_jahr: new Date().getFullYear(),
      } as never);
      if (numError) throw numError;

      const nummer = numData as string;
      // Laufnummer aus den TRAILING Digits extrahieren — funktioniert für alle
      // Typ-Präfixe (AN, AB, AR, SR, LS, GS, TR, …) und Formate.
      const laufnummer = parseInt((nummer.match(/(\d+)$/) || ["", "1"])[1]) || 1;

      const { data: newInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          typ: form.typ,
          nummer,
          laufnummer,
          jahr: new Date().getFullYear(),
          status: form.typ === "rechnung" ? "offen" : "entwurf",
          kunde_name: form.kunde_name,
          kunde_adresse: form.kunde_adresse || null,
          kunde_plz: form.kunde_plz || null,
          kunde_ort: form.kunde_ort || null,
          kunde_land: form.kunde_land || null,
          kunde_email: form.kunde_email || null,
          kunde_telefon: form.kunde_telefon || null,
          kunde_uid: form.kunde_uid || null,
          datum: format(new Date(), "yyyy-MM-dd"),
          faellig_am: null,
          leistungsdatum: form.leistungsdatum || null,
          // leistungsdatum_bis bewusst weggelassen — die Spalte wird erst
          // mit Migration 20260503100000 angelegt; der Duplikat-Pfad
          // funktioniert auch ohne sie (Original-Wert wird hier nicht
          // übernommen, ist bei Duplikaten ohnehin selten relevant).
          zahlungsbedingungen: form.zahlungsbedingungen || null,
          notizen: form.notizen || null,
          netto_summe: nettoSumme,
          mwst_satz: form.mwst_satz,
          mwst_betrag: mwstBetrag,
          brutto_summe: bruttoSumme,
          project_id: form.project_id || null,
          rabatt_prozent: form.rabatt_prozent,
          rabatt_betrag: form.rabatt_betrag,
          kunde_anrede: (form as any).kunde_anrede || null,
          kunde_titel: (form as any).kunde_titel || null,
          reverse_charge: (form as any).reverse_charge || false,
          skonto_prozent: form.skonto_prozent || 0,
          skonto_tage: form.skonto_tage || 0,
          gueltig_bis: form.gueltig_bis || null,
          customer_id: form.customer_id || null,
          // Duplikate sind bewusst unabhängig — kein parent_invoice_id und
          // keine Anzahlungs-Felder, damit das Duplikat nicht versehentlich
          // in einer Schlussrechnung als Abzug auftaucht.
          parent_invoice_id: null,
          anzahlung_prozent: null,
          anzahlung_betrag: null,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const itemsToInsert = items.map((item, idx) => ({
        invoice_id: newInvoice.id,
        position: idx + 1,
        beschreibung: item.beschreibung,
        kurztext: (item as any).kurztext || item.beschreibung,
        langtext: (item as any).langtext || null,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.gesamtpreis,
        produktnummer: (item as any).produktnummer || null,
        rabatt_prozent: (item as any).rabatt_prozent || 0,
        mwst_exempt: (item as any).mwst_exempt || false,
        set_template_id: (item as any).set_template_id || null,
        set_snapshot: (item as any).set_snapshot || null,
        ist_kalkuliert: (item as any).ist_kalkuliert || false,
        kalkulation_template_id: (item as any).kalkulation_template_id || null,
        ek_preis: (item as any).ek_preis || 0,
        verschnitt_prozent: (item as any).verschnitt_prozent || 0,
        aufschlag_prozent: (item as any).aufschlag_prozent || 0,
        befestigung_preis: (item as any).befestigung_preis || 0,
        sonstiges_preis: (item as any).sonstiges_preis || 0,
        arbeitszeit_minuten: (item as any).arbeitszeit_minuten || 0,
        stundensatz: (item as any).stundensatz || 52,
        // Gruppen + Sichtbarkeit müssen mitkopiert werden, sonst verliert das
        // Duplikat die Aufbau-Kapitel und zeigt dem Kunden plötzlich alle
        // internen Detailzeilen.
        gruppe: gruppeVon(item) || null,
        auf_pdf: istSichtbar(item),
        ist_gruppensumme: !!(item as any).ist_gruppensumme,
      }));

      const { error: dupItemsError } = await supabase.from("invoice_items").insert(itemsToInsert);
      if (dupItemsError && isGruppenSpaltenFehlen(dupItemsError)) {
        await supabase.from("invoice_items").insert(itemsToInsert.map(ohneGruppenSpalten));
      }

      toast({ title: "Dupliziert", description: `${form.typ === "rechnung" ? "Rechnung" : "Angebot"} wurde dupliziert` });
      navigate(`/invoices/${newInvoice.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Duplizieren fehlgeschlagen" });
    }
  };

  const handleConvertToInvoice = async () => {
    if (!invoiceId) return;
    // Fallback: erzeuge immer eine normale Rechnung aus Angebot
    navigate(`/invoices/new?typ=rechnung&from_doc=${invoiceId}`);
  };

  // Umwandlung zu beliebigem Ziel-Dokumenttyp. options steuern Extras
  // (Anzahlungs-Prozent, Abzüge von Anzahlungen).
  const handleConvertTo = (
    targetTyp: string,
    options?: { anzahlung_prozent?: number; anzahlung_betrag?: number; abzug_ids?: string[]; from_doc_id?: string },
  ) => {
    const sourceId = options?.from_doc_id || invoiceId;
    if (!sourceId) return;
    const params = new URLSearchParams({ typ: targetTyp, from_doc: sourceId });
    if (options?.anzahlung_prozent != null) params.set("anzahlung_prozent", String(options.anzahlung_prozent));
    if (options?.anzahlung_betrag != null) params.set("anzahlung_betrag", String(options.anzahlung_betrag));
    if (options?.abzug_ids?.length) params.set("abzug_ids", options.abzug_ids.join(","));
    navigate(`/invoices/new?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!invoiceId) return;
    try {
      // Vorab prüfen, ob Folgedokumente (AB/AR/SR) auf dieses Dokument verweisen
      // — dann ist die Löschung durch FK RESTRICT eh blockiert, und wir können
      // einen aussagekräftigen Fehler statt generischer DB-Meldung zeigen.
      const { data: children, count } = await supabase
        .from("invoices")
        .select("nummer, typ", { count: "exact", head: false })
        .eq("parent_invoice_id", invoiceId)
        .limit(3);
      if ((count ?? 0) > 0) {
        const beispiele = (children as any[] || []).map(c => c.nummer).filter(Boolean).join(", ");
        toast({
          variant: "destructive",
          title: "Löschen nicht möglich",
          description: `Zu diesem Dokument existieren bereits Folgedokumente (${beispiele}${(count ?? 0) > 3 ? ", …" : ""}). Lösche oder storniere diese zuerst.`,
          duration: 9000,
        });
        return;
      }
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
      toast({ title: "Gelöscht", description: `${form.typ === "rechnung" ? "Rechnung" : "Angebot"} wurde gelöscht` });
      navigate("/invoices");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Löschen fehlgeschlagen" });
    }
  };

  // Gutschrift-Verrechnung: öffnet den Dialog, lädt vorab alle offenen
  // Rechnungen desselben Kunden, damit der User wählen kann, gegen
  // welche Rechnung verrechnet wird (optional). Bei Save Status auf
  // "verrechnet" + verrechnet_am + (optional) verrechnet_mit_invoice_id;
  // außerdem den bezahlt_betrag der Ziel-Rechnung entsprechend erhöhen.
  const openVerrechnungDialog = async () => {
    setVerrechnungDate(new Date().toISOString().slice(0, 10));
    // Vorauswahl: wenn die Gutschrift schon mit einer Rechnung verknüpft
    // ist (über Convert oder Picker), diese als Default im Dropdown.
    // Sonst "_none" (= Auszahlung).
    setVerrechnungZielInvoice(form.parent_invoice_id || "_none");
    setVerrechnungZielOptions([]);
    if (form.customer_id) {
      const { data } = await supabase
        .from("invoices")
        .select("id, nummer, brutto_summe, bezahlt_betrag, status")
        .eq("customer_id", form.customer_id)
        .in("typ", ["rechnung", "anzahlungsrechnung", "schlussrechnung"])
        .in("status", ["offen", "teilbezahlt"])
        .order("datum", { ascending: false });
      let options = ((data as any[]) || []).map(d => ({
        id: d.id,
        nummer: d.nummer || "",
        brutto_summe: Number(d.brutto_summe) || 0,
        bezahlt_betrag: Number(d.bezahlt_betrag) || 0,
        status: d.status,
      }));
      // Wenn parent_invoice_id existiert aber nicht in der offenen Liste
      // ist (z. B. weil schon bezahlt), trotzdem hinzufügen, damit die
      // Vorauswahl sichtbar bleibt.
      if (form.parent_invoice_id && !options.some(o => o.id === form.parent_invoice_id)) {
        const { data: parent } = await supabase
          .from("invoices")
          .select("id, nummer, brutto_summe, bezahlt_betrag, status")
          .eq("id", form.parent_invoice_id)
          .maybeSingle();
        if (parent) {
          options = [{
            id: (parent as any).id,
            nummer: (parent as any).nummer || "",
            brutto_summe: Number((parent as any).brutto_summe) || 0,
            bezahlt_betrag: Number((parent as any).bezahlt_betrag) || 0,
            status: (parent as any).status || "",
          }, ...options];
        }
      }
      setVerrechnungZielOptions(options);
    }
    setVerrechnungDialogOpen(true);
  };

  const handleVerrechnungSave = async () => {
    if (!invoiceId) return;
    setVerrechnungSaving(true);
    try {
      const zielId = verrechnungZielInvoice !== "_none" ? verrechnungZielInvoice : null;
      // Gutschrift selbst aktualisieren
      const { error: gErr } = await supabase
        .from("invoices")
        .update({
          status: "verrechnet",
          verrechnet_am: verrechnungDate || new Date().toISOString().slice(0, 10),
          verrechnet_mit_invoice_id: zielId,
        } as any)
        .eq("id", invoiceId);
      if (gErr) throw gErr;
      await standNachziehen(invoiceId);

      // Wenn eine Ziel-Rechnung gewählt wurde: bezahlt_betrag um Gutschrift-
      // Brutto erhöhen (capped auf brutto_summe der Rechnung).
      if (zielId) {
        const ziel = verrechnungZielOptions.find(o => o.id === zielId);
        if (ziel) {
          const gutschriftBrutto = Math.abs(Number(bruttoSumme) || Number((form as any).brutto_summe) || 0);
          const restRechnung = Math.max(0, ziel.brutto_summe - ziel.bezahlt_betrag);
          const angerechnet = Math.min(gutschriftBrutto, restRechnung);
          const neuerBezahlt = Math.round((ziel.bezahlt_betrag + angerechnet) * 100) / 100;
          const neuerStatus = neuerBezahlt >= Math.round(ziel.brutto_summe * 100) / 100
            ? "bezahlt"
            : neuerBezahlt > 0 ? "teilbezahlt" : "offen";
          await supabase
            .from("invoices")
            .update({ bezahlt_betrag: neuerBezahlt, status: neuerStatus })
            .eq("id", zielId);
        }
      }

      // Lokalen State aktualisieren, damit UI sofort den neuen Stand zeigt
      setForm(prev => ({
        ...prev,
        status: "verrechnet",
        verrechnet_am: verrechnungDate || new Date().toISOString().slice(0, 10),
        verrechnet_mit_invoice_id: zielId,
      } as any));
      setVerrechnungDialogOpen(false);
      toast({ title: "Gutschrift verrechnet", description: zielId ? "Mit Rechnung verknüpft." : "Auszahlung verbucht." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setVerrechnungSaving(false);
    }
  };

  /**
   * EINZIGER Storno-Weg für alle Belegarten (Rechnung, Anzahlungs-,
   * Schlussrechnung, Gutschrift, Auftragsbestätigung).
   *
   * Vorher gab es zwei Implementierungen mit widersprüchlichem Verhalten:
   * diese hier setzte bezahlt_betrag auf 0, der Storno-Dialog nicht — je
   * nachdem, welchen Knopf man erwischte, zeigte die Statistik andere Zahlen.
   * Ebenso wurde die Stornonummer einmal lokal gebastelt und einmal atomar
   * aus der DB gezogen. Jetzt läuft beides ausschließlich hier durch:
   * atomare Stornonummer, bezahlt_betrag = 0, Storno-PDF.
   * Der Zahlungsverlauf bleibt in der DB und wird im Storno-Bildschirm
   * weiterhin (read-only) angezeigt — das Geld darf nicht unsichtbar werden.
   */
  const handleCancel = async (opts?: { grund?: string; docTypeLabel?: string }): Promise<boolean> => {
    if (!invoiceId) return false;
    const stornoGrund = (opts?.grund?.trim()) || "Storniert durch Benutzer";
    const docTypeLabel = opts?.docTypeLabel || getDocConfig(form.typ).label;
    try {
      const stornoDatum = new Date().toISOString().split("T")[0];
      // Atomare Stornonummer aus der DB (race-safe). Fällt die Funktion aus,
      // greift der bisherige lokale Fallback, damit ein Storno nie am
      // Nummernkreis scheitert.
      let stornoNummer = "";
      try {
        const { data: nr, error: nrErr } = await supabase.rpc(
          "next_storno_nummer" as any,
          { p_jahr: form.jahr || new Date().getFullYear() },
        );
        if (!nrErr && nr) stornoNummer = String(nr);
      } catch { /* Fallback unten */ }
      if (!stornoNummer) stornoNummer = `S-${form.nummer || invoiceId.substring(0, 8)}`;

      // Wenn die zu stornierende Doku eine VERRECHNETE GUTSCHRIFT ist,
      // muss der bei der Verrechnung gebuchte Betrag auf der Ziel-
      // Rechnung wieder zurückgerollt werden — sonst zeigt die Rechnung
      // weiterhin den verrechneten Betrag als "bezahlt" obwohl die
      // Gutschrift weg ist (Branchenstandard: sevDesk/Lexoffice machen
      // den Rollback automatisch).
      if (form.typ === "gutschrift" && form.status === "verrechnet" && form.verrechnet_mit_invoice_id) {
        try {
          const { data: targetInv } = await supabase
            .from("invoices")
            .select("brutto_summe, bezahlt_betrag, status")
            .eq("id", form.verrechnet_mit_invoice_id)
            .maybeSingle();
          if (targetInv) {
            const gutschriftBrutto = Math.abs(Number(bruttoSumme) || 0);
            const altBezahlt = Number((targetInv as any).bezahlt_betrag) || 0;
            const neuBezahlt = Math.max(0, Math.round((altBezahlt - gutschriftBrutto) * 100) / 100);
            const targetBrutto = Number((targetInv as any).brutto_summe) || 0;
            const altStatus = (targetInv as any).status;
            // Status nur neu berechnen wenn nicht storniert
            const neuStatus = altStatus === "storniert"
              ? "storniert"
              : neuBezahlt <= 0
                ? "offen"
                : neuBezahlt >= Math.round(targetBrutto * 100) / 100
                  ? "bezahlt"
                  : "teilbezahlt";
            await supabase
              .from("invoices")
              .update({ bezahlt_betrag: neuBezahlt, status: neuStatus })
              .eq("id", form.verrechnet_mit_invoice_id);
          }
        } catch (rollbackErr: any) {
          // Rollback-Fehler nicht fatal — der Storno der Gutschrift soll
          // trotzdem laufen. User wird informiert.
          console.error("Rollback der Gutschrift-Verrechnung fehlgeschlagen:", rollbackErr);
          toast({ variant: "destructive", title: "Rollback-Warnung", description: "Verrechnung auf der Quell-Rechnung konnte nicht zurückgesetzt werden — bitte manuell prüfen." });
        }
      }

      // bezahlt_betrag beim Storno auf 0 — sonst bleibt der Teilzahlungs-
      // Wert stehen und verzerrt Umsatz-/Offen-Statistiken.
      const { error } = await supabase.from("invoices").update({
        status: "storniert",
        storno_nummer: stornoNummer,
        storno_datum: stornoDatum,
        storno_grund: stornoGrund,
        bezahlt_betrag: 0,
      }).eq("id", invoiceId);
      if (error) throw error;
      await standNachziehen(invoiceId);
      setForm(prev => ({ ...prev, status: "storniert", storno_nummer: stornoNummer, storno_datum: stornoDatum, storno_grund: stornoGrund, bezahlt_betrag: 0 }));

      // Stornobeleg sofort erstellen und herunterladen
      try {
        const { generateStornoPdf } = await import("@/lib/pdfGenerator");
        const logoUri = await loadInvoiceLogo();
        const { data: bankSettings1 } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
        const bank1 = { kontoinhaber: "", iban: "", bic: "" };
        bankSettings1?.forEach((s: any) => {
          if (s.key === "bank_kontoinhaber") bank1.kontoinhaber = s.value;
          if (s.key === "bank_iban") bank1.iban = s.value;
          if (s.key === "bank_bic") bank1.bic = s.value;
        });
        const pdfBlob = generateStornoPdf(
          { nummer: form.nummer, kunde_name: form.kunde_name, brutto_summe: bruttoSumme, datum: form.datum },
          stornoNummer, stornoDatum, stornoGrund,
          bank1, logoUri, invoiceLayout, docTypeLabel
        );
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a"); a.href = url; a.download = `Storno_${stornoNummer}.pdf`; a.click();
        URL.revokeObjectURL(url);
      } catch (pdfErr) {
        console.error("Storno-PDF Fehler:", pdfErr);
      }

      toast({ title: `${docTypeLabel} storniert`, description: `Stornobeleg ${stornoNummer} wurde erstellt` });
      return true;
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Stornierung fehlgeschlagen" });
      return false;
    }
  };

  // ========= AB-Aktion: Aufheben (Delete oder Storno, kontextabhängig) =========
  type FollowupDoc = { id: string; typ: string; nummer: string; status: string };

  const getFollowupDocs = async (parentId: string): Promise<FollowupDoc[]> => {
    const { data } = await supabase
      .from("invoices")
      .select("id, typ, nummer, status")
      .eq("parent_invoice_id", parentId)
      .neq("status", "storniert")
      .order("datum", { ascending: true });
    return (data as FollowupDoc[]) || [];
  };

  const [abActionOpen, setAbActionOpen] = useState(false);
  const [abActionLoading, setAbActionLoading] = useState(false);
  const [abCanHardDelete, setAbCanHardDelete] = useState(false);
  const [abFollowups, setAbFollowups] = useState<FollowupDoc[]>([]);
  const [abStornoGrund, setAbStornoGrund] = useState("Auftrag aufgehoben");

  const openAbActionDialog = async () => {
    if (!invoiceId) return;
    setAbActionLoading(true);
    try {
      const followups = await getFollowupDocs(invoiceId);
      const canHard = form.status === "entwurf" && followups.length === 0;
      setAbCanHardDelete(canHard);
      setAbFollowups(followups);
      setAbStornoGrund("Auftrag aufgehoben");
      setAbActionOpen(true);
    } finally {
      setAbActionLoading(false);
    }
  };

  const handleHardDeleteAb = async () => {
    if (!invoiceId) return;
    try {
      // invoice_items werden via ON DELETE CASCADE automatisch entfernt
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
      toast({ title: "Gelöscht", description: `${typLabel} ${form.nummer || ""} wurde endgültig entfernt.` });
      navigate("/invoices");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Löschen fehlgeschlagen" });
    }
  };

  const confirmAbAction = async () => {
    setAbActionOpen(false);
    if (abCanHardDelete) {
      await handleHardDeleteAb();
    } else {
      await handleCancel({ grund: abStornoGrund, docTypeLabel: "Auftragsbestätigung" });
    }
  };

  const canAbAction =
    !isNew && !!invoiceId && id !== "new"
    && form.typ === "auftragsbestaetigung"
    && form.status !== "storniert";

  const handleMahnstufeUp = async () => {
    if (!invoiceId) return;
    if (bruttoSumme <= 0) {
      toast({ variant: "destructive", title: "Nicht möglich", description: "Mahnung kann nicht für Rechnungen mit €0,00 erstellt werden" });
      return;
    }
    if (form.mahnstufe >= 3) {
      toast({ variant: "destructive", title: "Maximum erreicht", description: "Mahnstufe 3 (Letzte Mahnung) ist das Maximum" });
      return;
    }
    const newStufe = form.mahnstufe + 1;
    try {
      const { error } = await supabase.from("invoices").update({ mahnstufe: newStufe }).eq("id", invoiceId);
      if (error) throw error;
      await standNachziehen(invoiceId);
      updateField("mahnstufe", newStufe);
      toast({ title: "Mahnstufe erhöht", description: `Mahnstufe ist jetzt ${newStufe}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
  };

  if (loading) return <div className="kb-page min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;

  const typLabel = getDocConfig(form.typ).label;
  // Lieferschein: Preisdaten bleiben im State/DB vollständig erhalten
  // (verlustfreie Kette AB→LS→Rechnung), nur die UI blendet Preis-/
  // Rabatt-Spalten, Summenfuß und MwSt-/Rabatt-Felder aus.
  const hidePrices = getDocConfig(form.typ).hidePrices;
  // Grammatik-Artikel für "Neue/Neuer/Neues X erstellen":
  //   Neues Angebot | Neuer Lieferschein | sonst: Neue <typ>
  const typArticle = form.typ === "angebot" ? "Neues" : form.typ === "lieferschein" ? "Neuer" : "Neue";

  const groupedTemplates = templates.reduce<Record<string, TemplateItem[]>>((acc, t) => {
    (acc[t.kategorie] = acc[t.kategorie] || []).push(t);
    return acc;
  }, {});

  // Gemeinsame Vorschau-Daten: der Vorschau-Dialog (mobil / kleine Screens)
  // und die angedockte Live-Vorschau (xl+) erhalten exakt dieselben Daten.
  const previewFormData = {
    typ: form.typ,
    nummer: form.nummer,
    status: form.status,
    kunde_name: form.kunde_name,
    kunde_adresse: form.kunde_adresse,
    kunde_plz: form.kunde_plz,
    kunde_ort: form.kunde_ort,
    kunde_land: form.kunde_land,
    kunde_email: form.kunde_email,
    kunde_telefon: form.kunde_telefon,
    kunde_uid: form.kunde_uid,
    kunde_anrede: (form as any).kunde_anrede || "",
    kunde_titel: (form as any).kunde_titel || "",
    reverse_charge: (form as any).reverse_charge || false,
    datum: form.datum,
    faellig_am: form.faellig_am,
    leistungsdatum: form.leistungsdatum,
    leistungsdatum_bis: (form as any).leistungsdatum_bis || "",
    gueltig_bis: form.gueltig_bis,
    zahlungsbedingungen: form.zahlungsbedingungen,
    notizen: form.notizen,
    betreff: form.betreff,
    netto_summe: nettoSumme,
    mwst_satz: form.mwst_satz,
    mwst_betrag: mwstBetrag,
    brutto_summe: bruttoSumme,
    bezahlt_betrag: form.bezahlt_betrag,
    rabatt_prozent: form.rabatt_prozent,
    rabatt_betrag: form.rabatt_betrag,
    mahnstufe: form.mahnstufe,
    skonto_prozent: form.skonto_prozent,
    skonto_tage: form.skonto_tage,
    // Ohne diese Felder sieht die PDF-Vorschau weder den eingegebenen
    // Kunden-Ansprechpartner noch die Kundennummer / Anzahlungs-Prozent.
    // Eigene Typdeklaration von InvoiceHtmlData kennt sie nicht; wir
    // reichen sie als loose Props durch (pdfGenerator liest sie via
    // (invoice as any).ansprechpartner_*).
    kundennummer: (form as any).kundennummer || "",
    ansprechpartner_employee_id: (form as any).ansprechpartner_employee_id || null,
    ansprechpartner_name: (form as any).ansprechpartner_name || "",
    ansprechpartner_telefon: (form as any).ansprechpartner_telefon || "",
    ansprechpartner_email: (form as any).ansprechpartner_email || "",
    anzahlung_prozent: (form as any).anzahlung_prozent ?? null,
    anzahlung_betrag: (form as any).anzahlung_betrag ?? null,
    // Allgemeine Angaben (Angebot + AB) — Toggle + Felder müssen
    // an die Vorschau durchgereicht werden, sonst rendert die
    // Tabelle dort nicht (Renderer prüft auf allgemeine_angaben_aktiv).
    allgemeine_angaben_aktiv: !!(form as any).allgemeine_angaben_aktiv,
    leistungsbeschreibung: (form as any).leistungsbeschreibung || "",
    ausfuehrungsort: (form as any).ausfuehrungsort || "",
    ausfuehrungs_kw: (form as any).ausfuehrungs_kw || "",
    ausfuehrende_firma: (form as any).ausfuehrende_firma || "",
    ausfuehrende_firma_freitext: (form as any).ausfuehrende_firma_freitext || "",
    // Bezugs-Block bei verknüpften Gutschriften — wird sonst
    // in der Vorschau nicht gerendert (Renderer prüft auf
    // _parent_nummer/_parent_datum).
    _parent_nummer: parentRefInfo?.nummer || "",
    _parent_datum: parentRefInfo?.datum || "",
  } as any;

  const previewItems = items.map((item, idx) => ({
    position: idx + 1,
    beschreibung: item.beschreibung,
    kurztext: item.kurztext || item.beschreibung,
    langtext: item.langtext || "",
    menge: item.menge,
    einheit: item.einheit,
    einzelpreis: item.einzelpreis,
    gesamtpreis: item.gesamtpreis,
    mwst_exempt: !!(item as any).mwst_exempt,
    // Vorschau/PDF entscheiden anhand dieser Felder, was der Kunde sieht.
    gruppe: gruppeVon(item) || null,
    auf_pdf: istSichtbar(item),
    ist_gruppensumme: !!item.ist_gruppensumme,
  }));

  // Stornierte Rechnung: Nur Stornobeleg anzeigen
  if (form.status === "storniert" && !isNew && invoiceId) {
    return (
      <div className="kb-page min-h-screen">
        <KBToolbar onBack={() => navigate("/invoices")} title={`Storno: ${form.nummer}`} />
        <div className="container mx-auto px-4 py-6 max-w-[800px]">
          <div className="space-y-6">
            <Card className="kb-panel">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-2">
                  <Ban className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-red-700">{typLabel} storniert</h2>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Belegnummer: <strong>{form.nummer}</strong></p>
                  <p>Kunde: <strong>{form.kunde_name}</strong></p>
                  <p>Bruttobetrag: <strong>€ {eur(bruttoSumme)}</strong></p>
                  {form.storno_nummer && <p>Stornonummer: <strong>{form.storno_nummer}</strong></p>}
                  {form.storno_datum && <p>Storniert am: <strong>{new Date(form.storno_datum + "T12:00:00").toLocaleDateString("de-AT")}</strong></p>}
                  {form.storno_grund && <p>Grund: <strong>{form.storno_grund}</strong></p>}
                </div>
                <div className="flex justify-center gap-3 pt-4">
                  <Button variant="outline" onClick={() => navigate("/invoices")}>Zurück</Button>
                  <Button variant="default" className="gap-2" onClick={async () => {
                    try {
                      // Always load fresh from DB to ensure data is available
                      const { data: freshInv } = await supabase.from("invoices")
                        .select("storno_nummer, storno_datum, storno_grund, nummer, kunde_name, brutto_summe, datum")
                        .eq("id", invoiceId).single();
                      if (!freshInv?.storno_nummer) {
                        toast({ variant: "destructive", title: "Kein Stornobeleg vorhanden" });
                        return;
                      }
                      const { generateStornoPdf } = await import("@/lib/pdfGenerator");
                      const logoUri = await loadInvoiceLogo();
                      const { data: bankSettings2 } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
                      const bank2 = { kontoinhaber: "", iban: "", bic: "" };
                      bankSettings2?.forEach((s: any) => {
                        if (s.key === "bank_kontoinhaber") bank2.kontoinhaber = s.value;
                        if (s.key === "bank_iban") bank2.iban = s.value;
                        if (s.key === "bank_bic") bank2.bic = s.value;
                      });
                      const pdfBlob = generateStornoPdf(
                        { nummer: freshInv.nummer, kunde_name: freshInv.kunde_name, brutto_summe: Number(freshInv.brutto_summe), datum: freshInv.datum },
                        freshInv.storno_nummer, freshInv.storno_datum || freshInv.datum, freshInv.storno_grund || "",
                        bank2, logoUri, invoiceLayout
                      );
                      const url = URL.createObjectURL(pdfBlob);
                      const a = document.createElement("a"); a.href = url; a.download = `Storno_${freshInv.storno_nummer}.pdf`; a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) { console.error(e); toast({ variant: "destructive", title: "Fehler beim Erstellen" }); }
                  }}>
                    <Download className="w-4 h-4" />
                    Stornobeleg herunterladen
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Zahlungsverlauf bleibt auch nach dem Storno sichtbar (read-only).
                Vorher verschwand er komplett — das tatsächlich geflossene Geld
                war damit in der App nicht mehr auffindbar. */}
            {payments.length > 0 && (
              <Card className="kb-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Zahlungsverlauf vor dem Storno</CardTitle>
                  <CardDescription>
                    Diese Zahlungen wurden vor der Stornierung erfasst. Der Bezahlt-Betrag
                    des Belegs wurde beim Storno auf € 0,00 gesetzt, damit Umsatz- und
                    Offen-Statistiken stimmen. Eine allfällige Rückzahlung bitte mit der
                    Buchhaltung abstimmen.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border bg-muted/30 p-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm font-medium text-green-700">€ {eur(Number(p.betrag))}</span>
                          <span className="text-sm text-muted-foreground">{format(parseISO(p.datum), "dd.MM.yyyy")}</span>
                          {p.notizen && <span className="text-xs italic text-muted-foreground">{p.notizen}</span>}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-2 text-sm">
                      <span className="text-muted-foreground">Summe erfasster Zahlungen</span>
                      <strong>€ {eur(payments.reduce((s, p) => s + (Number(p.betrag) || 0), 0))}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      {/* KingBill-Editor-Toolbar: [Zurück] links, Wizard-Tabs Mitte,
          Speichern + grüner „Speichern & Schließen" rechts */}
      <KBToolbar
        onBack={handleBackNav}
        /* Am Handy einen kurzen Titel — der lange Titel drängt sonst die
           Wizard-Tabs in eine eigene Zeile und die Toolbar wird 4 Zeilen hoch. */
        title={isNew ? (isMobile ? typLabel : `${typArticle} ${typLabel} erstellen`) : `${typLabel} ${form.nummer}`}
        rightActions={
          !isLocked ? (
            <>
              <KBToolbarButton
                icon={Save}
                label="Speichern"
                className="hidden sm:inline-flex"
                onClick={async () => { const ok = await handleSave(); if (ok) toast({ title: "Gespeichert" }); }}
                disabled={saving}
                title="Speichern (bleibt geöffnet)"
              />
              <KBToolbarButton
                icon={CheckCircle2}
                variant="green"
                label={saving ? "Speichert..." : "Speichern & Schließen"}
                onClick={async () => { const ok = await handleSave(); if (ok) { toast({ title: "Gespeichert" }); navigate("/invoices"); } }}
                disabled={saving}
              />
            </>
          ) : undefined
        }
      >
        {/* Eigener Flex-Container: hält die 3 Wizard-Tabs am Handy in EINER
            Zeile statt sie einzeln umbrechen zu lassen. */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <KBWizardTabs activeStep={activeStep} onStepClick={scrollToStep} />
        </div>
      </KBToolbar>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-[1600px]">
        {/* KingBill-Layout: Editor links, permanente Beleg-Live-Vorschau rechts (xl+) */}
        <div className="xl:flex xl:items-start xl:gap-6">
        <div className="space-y-6 min-w-0 xl:flex-1">
          {/* Dokumenten-Kette: Root (Angebot/AB) + alle abgeleiteten Dokumente */}
          {!isNew && chainRoot && (chainRoot.id !== invoiceId || chainChildren.length > 0) && (
            <Card className="kb-panel border-blue-200 bg-blue-50/40">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs font-medium text-blue-900 uppercase tracking-wide mb-2">Auftrag</div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {/* Root */}
                  <button
                    type="button"
                    onClick={() => { if (chainRoot.id !== invoiceId) navigate(`/invoices/${chainRoot.id}`); }}
                    disabled={chainRoot.id === invoiceId}
                    className={`flex min-h-[40px] items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-xs transition-colors sm:min-h-0 sm:px-2 sm:py-1 ${
                      chainRoot.id === invoiceId
                        ? "border-blue-400 bg-blue-100 text-blue-900 ring-1 ring-blue-400"
                        : "border-blue-200 bg-white hover:bg-blue-100 text-blue-900"
                    }`}
                  >
                    <span className="text-[10px] uppercase text-blue-600">{getDocConfig(chainRoot.typ).shortLabel}</span>
                    <span>{chainRoot.nummer || "—"}</span>
                  </button>
                  {chainChildren.length > 0 && <span className="text-blue-600">→</span>}
                  {chainChildren.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { if (c.id !== invoiceId) navigate(`/invoices/${c.id}`); }}
                      disabled={c.id === invoiceId}
                      className={`flex min-h-[40px] items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-xs transition-colors sm:min-h-0 sm:px-2 sm:py-1 ${
                        c.id === invoiceId
                          ? "border-blue-400 bg-blue-100 text-blue-900 ring-1 ring-blue-400"
                          : c.status === "storniert"
                            ? "border-red-200 bg-white text-red-700 line-through opacity-70 hover:opacity-100"
                            : "border-blue-200 bg-white hover:bg-blue-100 text-blue-900"
                      }`}
                      title={`${getDocConfig(c.typ).label} ${c.nummer || ""} — € ${eur(Number(c.brutto_summe))} brutto, Status ${c.status}`}
                    >
                      <span className="text-[10px] uppercase text-blue-600">{getDocConfig(c.typ).shortLabel}</span>
                      <span>{c.nummer || "—"}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Herkunft Auftragskalkulation: Kalkulation öffnen / Positionen neu
              übernehmen. Erscheint nur, wenn der Beleg wirklich aus einer
              Kalkulation stammt (invoices.kalkulation_id). */}
          {kalkulationId && !isLocked && (
            <Card className="kb-panel border-blue-200 bg-blue-50/40" data-testid="kalk-herkunft">
              <CardContent className="flex flex-col gap-3 pt-4 pb-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-blue-900">Aus Kalkulation erstellt</div>
                    <div className="truncate text-xs text-blue-800/80">
                      {kalkulationName
                        ? `Auftragskalkulation „${kalkulationName}“`
                        : "Verknüpfte Auftragskalkulation"}
                      {" — Änderungen dort wirken erst nach „Positionen neu übernehmen“."}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    data-testid="kalk-oeffnen"
                    onClick={() => {
                      if (isDirty) { setKalkVerlassenOpen(true); return; }
                      navigate(`/auftragskalkulation/${kalkulationId}`);
                    }}
                  >
                    <Calculator className="h-4 w-4" />
                    Kalkulation öffnen
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    data-testid="kalk-neu-uebernehmen"
                    onClick={() => setKalkErsetzenOpen(true)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Positionen neu übernehmen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status & Actions */}
          {!isNew && (
            <Card className="kb-panel">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="text-lg px-4 py-1 font-mono">{form.nummer}</Badge>
                    <Badge className={statusColors[form.status] || ""}>
                      {statusLabels[form.status] || form.status}
                    </Badge>
                    {form.mahnstufe > 0 && (
                      <Badge variant="destructive">
                        {form.mahnstufe === 1 ? "Zahlungserinnerung" : `${form.mahnstufe}. Mahnung`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.typ === "rechnung" && (form.status === "offen" || form.status === "teilbezahlt") && bruttoSumme > 0 && (
                      <Select onValueChange={async (stufe) => {
                        const mahnstufe = parseInt(stufe);
                        // Warnung bei teilbezahlten Rechnungen — offener Restbetrag wird gemahnt
                        if (form.bezahlt_betrag > 0 && form.bezahlt_betrag < bruttoSumme) {
                          const offen = bruttoSumme - form.bezahlt_betrag;
                          const ok = window.confirm(
                            `⚠️ Diese Rechnung ist bereits teilbezahlt.\n\n` +
                            `Brutto: € ${eur(bruttoSumme)}\n` +
                            `Bezahlt: € ${eur(form.bezahlt_betrag)}\n` +
                            `Offen: € ${eur(offen)}\n\n` +
                            `Die Mahnung wird den OFFENEN Betrag (€ ${eur(offen)}) mahnen. Fortfahren?`
                          );
                          if (!ok) return;
                        }
                        try {
                          // Update mahnstufe in DB + save history
                          await supabase.from("invoices").update({ mahnstufe }).eq("id", invoiceId);
                          await standNachziehen(invoiceId);
                          await supabase.from("mahnung_history").insert({ invoice_id: invoiceId, mahnstufe });
                          updateField("mahnstufe", mahnstufe);
                          loadMahnungen();
                          // Generate Mahnung PDF
                          const logoUri = await loadInvoiceLogo();
                          const { data: bankSettings } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
                          const bank = { kontoinhaber: "", iban: "", bic: "" };
                          bankSettings?.forEach((s: any) => {
                            if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
                            if (s.key === "bank_iban") bank.iban = s.value;
                            if (s.key === "bank_bic") bank.bic = s.value;
                          });
                          const { generateMahnungPdf } = await import("@/lib/pdfGenerator");
                          const { loadMahnungSettings } = await import("@/lib/mahnungSettings");
                          const mahnSettings = await loadMahnungSettings();
                          const pdfBlob = generateMahnungPdf(
                            { nummer: form.nummer, datum: form.datum, faellig_am: form.faellig_am, kunde_name: form.kunde_name, kunde_adresse: form.kunde_adresse, kunde_plz: form.kunde_plz, kunde_ort: form.kunde_ort, brutto_summe: bruttoSumme, bezahlt_betrag: form.bezahlt_betrag },
                            mahnstufe, 0, bank, logoUri, invoiceLayout, mahnSettings
                          );
                          const url = URL.createObjectURL(pdfBlob);
                          const a = document.createElement("a"); a.href = url;
                          const stufeLabel = mahnSettings.stufen[Math.min(Math.max(mahnstufe, 1), 3) - 1].titel;
                          a.download = `${stufeLabel}_${form.nummer}.pdf`; a.click();
                          URL.revokeObjectURL(url);
                          toast({ title: `${stufeLabel} erstellt`, description: "PDF wurde heruntergeladen" });
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Fehler", description: err.message });
                        }
                      }}>
                        <SelectTrigger className="w-[220px] h-9 text-sm">
                          <SelectValue placeholder="Mahnung erstellen..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Zahlungserinnerung (1. Stufe)</SelectItem>
                          <SelectItem value="2">2. Mahnung</SelectItem>
                          <SelectItem value="3">3. Mahnung (Letzte)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {/* Umwandeln-Menü: zeigt basierend auf aktuellem typ die erlaubten Ziele */}
                    {!isNew && form.status !== "verrechnet" && form.status !== "abgelehnt" && form.status !== "storniert" && (() => {
                      const t = form.typ;
                      // Vom Angebot aus darf man direkt in jeden Rechnungstyp
                      // umwandeln — der Umweg über AB ist optional, nicht Pflicht.
                      const allow = {
                        auftragsbestaetigung: t === "angebot",
                        // Lieferschein (preislos) aus Angebot/AB. Die Positionen werden
                        // MIT Preisen kopiert (nur Anzeige/PDF blenden sie aus), damit
                        // die Kette LS→Rechnung verlustfrei bleibt.
                        lieferschein: t === "angebot" || t === "auftragsbestaetigung",
                        rechnung: t === "angebot" || t === "auftragsbestaetigung" || t === "lieferschein",
                        anzahlungsrechnung: t === "angebot" || t === "auftragsbestaetigung",
                        schlussrechnung: t === "angebot" || t === "auftragsbestaetigung" || t === "anzahlungsrechnung",
                        // Gutschrift kann zu jeder rechnungs-artigen Doku angelegt
                        // werden — Kunde + Items + parent_invoice_id werden via
                        // bestehendem from_doc-Pfad automatisch übernommen.
                        gutschrift: t === "rechnung" || t === "anzahlungsrechnung" || t === "schlussrechnung",
                      };
                      if (!Object.values(allow).some(Boolean)) return null;
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="default" size="sm" className="gap-1.5">
                              <ArrowRightLeft className="w-4 h-4" />
                              Umwandeln in...
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {allow.auftragsbestaetigung && (
                              <DropdownMenuItem onClick={() => handleConvertTo("auftragsbestaetigung")}>
                                Auftragsbestätigung
                              </DropdownMenuItem>
                            )}
                            {allow.lieferschein && (
                              <DropdownMenuItem onClick={() => handleConvertTo("lieferschein")}>
                                Lieferschein
                              </DropdownMenuItem>
                            )}
                            {allow.rechnung && (
                              <DropdownMenuItem onClick={() => handleConvertTo("rechnung")}>
                                Rechnung
                              </DropdownMenuItem>
                            )}
                            {allow.anzahlungsrechnung && (
                              <DropdownMenuItem onClick={async () => {
                                // Bereits bestehende nicht-stornierte Anzahlungen zum selben Auftrag
                                // laden, damit der Dialog die Rest-Basis kennt (Kumulations-Check).
                                if (invoiceId) {
                                  const { data: existingAnz } = await supabase
                                    .from("invoices")
                                    .select("netto_summe")
                                    .eq("parent_invoice_id", invoiceId)
                                    .eq("typ", "anzahlungsrechnung")
                                    .neq("status", "storniert");
                                  const sum = ((existingAnz as any[]) || []).reduce(
                                    (s, r) => s + (Number(r.netto_summe) || 0), 0);
                                  setBestehendeAnzahlungenNetto(sum);
                                } else {
                                  setBestehendeAnzahlungenNetto(0);
                                }
                                setAnzahlungProzentInput("30");
                                setAnzahlungBetragInput(formatForInput(round2(nettoSumme * 0.3), 2));
                                setAnzahlungMode("prozent");
                                setAnzahlungDialogOpen(true);
                              }}>
                                Anzahlungsrechnung…
                              </DropdownMenuItem>
                            )}
                            {allow.schlussrechnung && (
                              <DropdownMenuItem onClick={async () => {
                                // Schlussrechnung = ALLE Originalpositionen des Auftrags
                                // (Angebot/AB) + automatischer Abzug aller Anzahlungs-
                                // rechnungen zum selben Auftrag.
                                //
                                // Die Root (Positionsträger) ermitteln wir FRISCH aus der
                                // DB — unabhängig vom Form-State — indem wir von hier aus
                                // entlang parent_invoice_id hochwandern bis zum ersten
                                // Dokument, das KEIN "anzahlungsrechnung" ist (also
                                // Angebot oder AB). Das macht die Logik robust gegen
                                // stale Form-Daten und gegen verschachtelte Ketten.
                                if (!invoiceId) return;
                                let rootId = invoiceId;
                                let cursor: string | null = invoiceId;
                                let cursorTyp = form.typ;
                                for (let hops = 0; hops < 6 && cursorTyp === "anzahlungsrechnung" && cursor; hops++) {
                                  const { data: row } = await supabase
                                    .from("invoices")
                                    .select("parent_invoice_id")
                                    .eq("id", cursor)
                                    .maybeSingle();
                                  const parent = (row as any)?.parent_invoice_id || null;
                                  if (!parent) break;
                                  rootId = parent;
                                  cursor = parent;
                                  // Typ des Parents holen, um zu entscheiden, ob wir weiter hoch gehen
                                  const { data: parentRow } = await supabase
                                    .from("invoices")
                                    .select("typ")
                                    .eq("id", parent)
                                    .maybeSingle();
                                  cursorTyp = (parentRow as any)?.typ || "";
                                }

                                // Guard: existiert bereits eine nicht-stornierte Schlussrechnung
                                // zum selben Auftrag? Dann abbrechen — sonst hätten wir parallele
                                // SRs mit identischen Abzügen.
                                const { data: existingSR } = await supabase
                                  .from("invoices")
                                  .select("id, nummer, status")
                                  .eq("parent_invoice_id", rootId)
                                  .eq("typ", "schlussrechnung")
                                  .neq("status", "storniert")
                                  .limit(1);
                                if (existingSR && existingSR.length > 0) {
                                  toast({
                                    variant: "destructive",
                                    title: "Schlussrechnung existiert bereits",
                                    description: `Zu diesem Auftrag gibt es schon die Schlussrechnung ${(existingSR[0] as any).nummer || ""}. Storniere sie zuerst, falls du sie neu erstellen willst.`,
                                  });
                                  return;
                                }

                                // Alle nicht-stornierten Anzahlungen zum gleichen Auftrag finden
                                const { data } = await supabase
                                  .from("invoices")
                                  .select("id, status")
                                  .eq("parent_invoice_id", rootId)
                                  .eq("typ", "anzahlungsrechnung")
                                  .neq("status", "storniert");
                                const ids = ((data as any[]) || []).map(r => r.id);
                                // Sicherheitsnetz: aktuelles Dokument ist eine nicht-stornierte
                                // Anzahlungsrechnung, die (z.B. durch inkonsistente
                                // parent_invoice_id) nicht in der Liste steht → trotzdem abziehen.
                                if (form.typ === "anzahlungsrechnung" && form.status !== "storniert" && !ids.includes(invoiceId)) {
                                  ids.push(invoiceId);
                                }
                                handleConvertTo("schlussrechnung", { abzug_ids: ids, from_doc_id: rootId });
                              }}>
                                Schlussrechnung
                              </DropdownMenuItem>
                            )}
                            {allow.gutschrift && (
                              <DropdownMenuItem onClick={() => handleConvertTo("gutschrift")}>
                                <Undo2 className="w-4 h-4 mr-2" />
                                Gutschrift zu dieser Rechnung
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })()}
                    <Button onClick={handleDuplicate} variant="outline" size="sm" className="gap-1.5">
                      <Copy className="w-4 h-4" />
                      Duplizieren
                    </Button>
                    {/* Gutschrift: nur wenn noch nicht verrechnet/storniert */}
                    {!isNew && form.typ === "gutschrift" && form.status !== "verrechnet" && form.status !== "storniert" && (
                      <Button onClick={openVerrechnungDialog} variant="default" size="sm" className="gap-1.5">
                        <Undo2 className="w-4 h-4" />
                        Als verrechnet markieren
                      </Button>
                    )}
                    {/* EIN Storno-Weg für den ganzen Beleg: der Dialog weiter
                        unten fragt den Pflicht-Grund ab, warnt bei bereits
                        erfassten Zahlungen und zieht die Storno-Nummer atomar
                        aus der DB. Vorher gab es hier einen zweiten, gleich
                        aussehenden Knopf, der ohne Grund und ohne
                        Zahlungs-Warnung sofort stornierte. */}
                    {canCancel && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setStornoDialogOpen(true)}
                      >
                        <Ban className="w-4 h-4" />
                        Stornieren
                      </Button>
                    )}
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="gap-1.5">
                            <Trash2 className="w-4 h-4" />
                            Löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-destructive" />
                              {typLabel} löschen?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {typLabel} {form.nummer} und alle Positionen werden dauerhaft gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Endgültig löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {canAbAction && (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1.5"
                          onClick={openAbActionDialog}
                          disabled={abActionLoading}
                        >
                          <Ban className="w-4 h-4" />
                          Auftrag aufheben
                        </Button>
                        <AlertDialog open={abActionOpen} onOpenChange={setAbActionOpen}>
                          <AlertDialogContent className="max-w-lg">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                                {abCanHardDelete ? "Auftragsbestätigung endgültig löschen?" : "Auftrag stornieren?"}
                              </AlertDialogTitle>
                              <AlertDialogDescription asChild>
                                <div className="space-y-3">
                                  {abCanHardDelete ? (
                                    <p>
                                      Die Auftragsbestätigung {form.nummer} ist im Status „Entwurf" und hat keine
                                      Folgedokumente. Sie wird <b>unwiderruflich entfernt</b>, inkl. aller Positionen.
                                      Kein Storno-Beleg nötig.
                                    </p>
                                  ) : (
                                    <>
                                      <p>
                                        Die Auftragsbestätigung {form.nummer} wird als <b>storniert</b> markiert
                                        und ein Storno-PDF wird automatisch erzeugt & heruntergeladen.
                                      </p>
                                      {abFollowups.length > 0 && (
                                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                                          <p className="font-medium text-destructive mb-1">
                                            ⚠ Es existieren {abFollowups.length} Folgedokument{abFollowups.length === 1 ? "" : "e"}:
                                          </p>
                                          <ul className="text-foreground space-y-0.5">
                                            {abFollowups.map(f => (
                                              <li key={f.id} className="text-xs">
                                                • <span className="font-mono">{f.nummer}</span> ({f.typ} · {f.status})
                                              </li>
                                            ))}
                                          </ul>
                                          <p className="text-xs text-muted-foreground mt-2">
                                            Diese bleiben unberührt. Bei Bedarf musst du sie separat stornieren.
                                          </p>
                                        </div>
                                      )}
                                      <div className="space-y-1.5">
                                        <Label htmlFor="ab-storno-grund">Grund der Stornierung</Label>
                                        <Textarea
                                          id="ab-storno-grund"
                                          rows={2}
                                          value={abStornoGrund}
                                          onChange={(e) => setAbStornoGrund(e.target.value)}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={confirmAbAction}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {abCanHardDelete ? "Endgültig löschen" : "Stornieren & PDF erzeugen"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Zahlungsverlauf — für ALLE zahlbaren Belegarten (Rechnung,
              Anzahlungs- und Schlussrechnung). Vorher hing die Karte an
              typ === "rechnung", weshalb auf Anzahlungs-/Schlussrechnungen
              überhaupt keine Zahlung erfasst werden konnte. */}
          {!isNew && ZAHLBARE_TYPEN.has(form.typ) && form.status !== "storniert" && (
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Zahlungsverlauf</CardTitle>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span>Brutto: <strong>€ {eur(bruttoSumme)}</strong></span>
                    <span>Bezahlt: <strong className="text-green-600">€ {eur(form.bezahlt_betrag)}</strong></span>
                    <span>Offen: <strong className={restBetrag > 0 ? "text-orange-600" : "text-green-600"}>€ {eur(restBetrag)}</strong></span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Existing payments */}
                {payments.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-green-700">€ {eur(Number(p.betrag))}</span>
                          <span className="text-sm text-muted-foreground">{format(parseISO(p.datum), "dd.MM.yyyy")}</span>
                          {p.notizen && <span className="text-xs text-muted-foreground italic">{p.notizen}</span>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deletePayment(p.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add payment form */}
                {restBetrag > 0 && (
                  /* Am Handy untereinander mit vollen Feldbreiten — nebeneinander
                     ragten die drei fixen Breiten über den Bildschirmrand. */
                  <div className="flex flex-col gap-3 pt-2 border-t sm:flex-row sm:items-end">
                    <div className="w-full sm:w-32">
                      <Label className="text-xs">Betrag €</Label>
                      {/* Text statt number: "12,50" darf nicht zu 1250,00 € werden. */}
                      <Input
                        data-testid="zahlung-betrag"
                        type="text"
                        inputMode="decimal"
                        value={newPaymentAmount}
                        onChange={(e) => setNewPaymentAmount(e.target.value)}
                        onBlur={() => {
                          const n = parseDecimal(newPaymentAmount);
                          // Leeres Feld bleibt leer (= Vorschlag „Restbetrag"),
                          // eine eingegebene 0 bleibt eine 0 (→ Fehlermeldung).
                          if (n !== null) setNewPaymentAmount(formatForInput(clamp(n, 0), 2));
                        }}
                        placeholder={formatForInput(restBetrag, 2)}
                        className="h-11 sm:h-10"
                      />
                    </div>
                    <div className="w-full sm:w-40">
                      <Label className="text-xs">Datum</Label>
                      <Input
                        type="date"
                        value={newPaymentDate}
                        onChange={(e) => setNewPaymentDate(e.target.value)}
                        className="h-11 sm:h-10"
                      />
                    </div>
                    <div className="w-full sm:w-40">
                      <Label className="text-xs">Notiz (optional)</Label>
                      <Input
                        value={newPaymentNote}
                        onChange={(e) => setNewPaymentNote(e.target.value)}
                        placeholder="z.B. Überweisung"
                        className="h-11 sm:h-10"
                      />
                    </div>
                    <Button data-testid="zahlung-speichern" onClick={addPayment} className="h-11 w-full gap-1 sm:h-10 sm:w-auto">
                      <Plus className="w-4 h-4" />
                      Zahlung erfassen
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mahnungs-Übersicht */}
          {!isNew && form.typ === "rechnung" && mahnungen.length > 0 && (
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mahnungen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mahnungen.map((m, idx) => {
                    const label = m.mahnstufe === 1 ? "Zahlungserinnerung" : m.mahnstufe === 2 ? "2. Mahnung" : "3. Mahnung (Letzte)";
                    const dateTime = new Date(m.created_at);
                    const dateStr = dateTime.toLocaleDateString("de-AT");
                    const timeStr = dateTime.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-md border">
                        <div className="flex items-center gap-3">
                          <Badge variant={m.mahnstufe >= 3 ? "destructive" : "outline"} className="text-xs">
                            Stufe {m.mahnstufe}
                          </Badge>
                          <div>
                            <span className="text-sm font-medium">{label}</span>
                            <p className="text-xs text-muted-foreground">{dateStr} um {timeStr} Uhr</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1" onClick={async () => {
                          try {
                            const logoUri = await loadInvoiceLogo();
                            const { data: bankSettings } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
                            const bank = { kontoinhaber: "", iban: "", bic: "" };
                            bankSettings?.forEach((s: any) => {
                              if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
                              if (s.key === "bank_iban") bank.iban = s.value;
                              if (s.key === "bank_bic") bank.bic = s.value;
                            });
                            const { generateMahnungPdf } = await import("@/lib/pdfGenerator");
                            const { loadMahnungSettings } = await import("@/lib/mahnungSettings");
                            const mahnSettings = await loadMahnungSettings();
                            const pdfBlob = generateMahnungPdf(
                              { nummer: form.nummer, datum: form.datum, faellig_am: form.faellig_am, kunde_name: form.kunde_name, kunde_adresse: form.kunde_adresse, kunde_plz: form.kunde_plz, kunde_ort: form.kunde_ort, brutto_summe: bruttoSumme, bezahlt_betrag: form.bezahlt_betrag },
                              m.mahnstufe, 0, bank, logoUri, invoiceLayout, mahnSettings
                            );
                            const url = URL.createObjectURL(pdfBlob);
                            const a = document.createElement("a"); a.href = url; a.download = `${label}_${form.nummer}.pdf`; a.click();
                            URL.revokeObjectURL(url);
                          } catch {}
                        }}>
                          <Download className="w-4 h-4" />
                          PDF
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ===== Schritt 1: Allgemein — Betreff, Details, Angaben (KingBill-Wizard) ===== */}
          <StepSectionHeader num={1} label="Allgemein" id="step-allgemein" />

          {/* Betreff */}
          <Card className={`kb-panel ${isLocked ? "opacity-80" : ""}`}>
            <fieldset disabled={isLocked} className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Betreff</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.betreff}
                onChange={(e) => updateField("betreff", e.target.value)}
                placeholder="z.B. Badezimmer-Sanierung EG — Angebot gemäß Besprechung vom..."
                rows={2}
                className="resize-none"
              />
            </CardContent>
            </fieldset>
          </Card>

          {/* Rechnungsdetails */}
          <Card className={`kb-panel ${isLocked ? "opacity-80" : ""}`}>
            <fieldset disabled={isLocked} className="min-w-0">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={form.datum} onChange={(e) => updateField("datum", e.target.value)} />
                </div>
                {getDocConfig(form.typ).showLeistungsdatum && (
                  <div className="md:col-span-2">
                    <Label>Leistungszeitraum</Label>
                    {/* Am Handy untereinander: zwei native Datumsfelder
                        nebeneinander schneiden auf 390 px das Kalender-Icon ab. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="mb-0.5 block text-[10px] text-muted-foreground sm:hidden">von</span>
                        <Input
                          type="date"
                          value={form.leistungsdatum || form.datum}
                          onChange={(e) => updateField("leistungsdatum", e.target.value)}
                          placeholder="von"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-muted-foreground sm:hidden">bis (optional)</span>
                        <Input
                          type="date"
                          value={(form as any).leistungsdatum_bis || ""}
                          onChange={(e) => updateField("leistungsdatum_bis" as any, e.target.value)}
                          placeholder="bis (optional)"
                          min={form.leistungsdatum || form.datum || undefined}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Beginnt automatisch am Rechnungsdatum. Enddatum nur ausfüllen, wenn die Leistung über mehrere Tage erbracht wurde.
                    </p>
                  </div>
                )}
                {form.typ === "rechnung" && (
                  <div>
                    <Label>Fällig am</Label>
                    <Input
                      type="date"
                      value={form.faellig_am}
                      onChange={(e) => updateField("faellig_am", e.target.value)}
                      disabled={form.zahlungsbedingungen !== "individuell"}
                    />
                    {form.zahlungsbedingungen !== "individuell" && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Automatisch aus Rechnungsdatum + Zahlungsfrist berechnet.
                      </p>
                    )}
                  </div>
                )}
                {form.typ === "angebot" && (
                  <div>
                    <Label>Gültig bis</Label>
                    <Input type="date" value={form.gueltig_bis} onChange={(e) => updateField("gueltig_bis", e.target.value)} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.typ === "rechnung" && (
                  <div>
                    <Label>Zahlungsfrist</Label>
                    <Select
                      value={form.zahlungsbedingungen || "14 Tage"}
                      onValueChange={(v) => {
                        // Dropdown ist Single Source of Truth. "individuell"
                        // schaltet das faellig_am-Feld frei; alle anderen Werte
                        // rechnen faellig_am automatisch über den useEffect-
                        // Sync weiter unten aus.
                        updateField("zahlungsbedingungen", v);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sofort">Sofort fällig</SelectItem>
                        <SelectItem value="7 Tage">7 Tage</SelectItem>
                        <SelectItem value="14 Tage">14 Tage</SelectItem>
                        <SelectItem value="30 Tage">30 Tage</SelectItem>
                        <SelectItem value="60 Tage">60 Tage</SelectItem>
                        <SelectItem value="individuell">Individuelles Datum…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.typ === "rechnung" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Skonto %</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={rohOderZahl("form:skonto_prozent", form.skonto_prozent, { leerBeiNull: true })}
                        onChange={(e) => {
                          setRoh("form:skonto_prozent", e.target.value);
                          const n = parseDecimal(e.target.value);
                          updateField("skonto_prozent", n === null ? 0 : clamp(n, 0, 100));
                        }}
                        onBlur={() => {
                          const n = clamp(toNumber(rohTexte["form:skonto_prozent"], 0), 0, 100);
                          updateField("skonto_prozent", n);
                          clearRoh("form:skonto_prozent");
                        }}
                        placeholder="z.B. 2"
                      />
                    </div>
                    <div>
                      <Label>Skonto Tage</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={rohOderZahl("form:skonto_tage", form.skonto_tage, { leerBeiNull: true })}
                        onChange={(e) => {
                          setRoh("form:skonto_tage", e.target.value);
                          const n = parseDecimal(e.target.value);
                          updateField("skonto_tage", n === null ? 0 : Math.round(clamp(n, 0)));
                        }}
                        onBlur={() => {
                          const n = Math.round(clamp(toNumber(rohTexte["form:skonto_tage"], 0), 0));
                          updateField("skonto_tage", n);
                          clearRoh("form:skonto_tage");
                        }}
                        placeholder="z.B. 10"
                      />
                    </div>
                    {form.skonto_prozent > 0 && form.skonto_tage > 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Bei Zahlung bis {form.datum ? format(new Date(new Date(form.datum).getTime() + form.skonto_tage * 86400000), "dd.MM.yyyy") : "–"}:
                        {" "}€ {eur((bruttoSumme * (1 - form.skonto_prozent / 100)))} ({form.skonto_prozent}% Skonto)
                      </p>
                    )}
                  </div>
                )}
                {/* Projekt-Auswahl ist jetzt oben als eigene Card */}
              </div>
              {form.typ === "rechnung" && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <input
                    type="checkbox"
                    id="reverse_charge"
                    checked={(form as any).reverse_charge || false}
                    onChange={(e) => {
                      updateField("reverse_charge" as any, e.target.checked);
                      if (e.target.checked) {
                        updateField("mwst_satz", 0);
                      } else {
                        updateField("mwst_satz", 20);
                      }
                    }}
                    className="rounded"
                  />
                  <div>
                    <Label htmlFor="reverse_charge" className="cursor-pointer font-medium">Reverse Charge – Bauleistungen (§ 19 Abs. 1a UStG)</Label>
                    <p className="text-xs text-muted-foreground">Steuerschuld geht auf den Leistungsempfänger über – MwSt auf der Rechnung entfällt. UID des Kunden ist Pflicht.</p>
                  </div>
                </div>
              )}
              {(form as any).reverse_charge && !form.kunde_uid && (
                <p className="text-xs text-red-600 font-medium">UID-Nummer des Kunden ist bei Reverse Charge Pflicht!</p>
              )}
              {/* MwSt/Rabatt sind Preis-Felder → beim Lieferschein ausgeblendet
                  (Werte bleiben im State erhalten und werden mitgespeichert). */}
              {!hidePrices && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>MwSt-Satz (%)</Label>
                  <Select value={String(form.mwst_satz)} onValueChange={(v) => updateField("mwst_satz", Number(v))} disabled={(form as any).reverse_charge}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20% (Normalsteuersatz)</SelectItem>
                      <SelectItem value="13">13% (ermäßigt)</SelectItem>
                      <SelectItem value="10">10% (ermäßigt)</SelectItem>
                      <SelectItem value="0">0% (steuerfrei)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rabatt (%)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    data-testid="rabatt-prozent"
                    value={rohOderZahl("form:rabatt_prozent", form.rabatt_prozent, { leerBeiNull: true })}
                    onChange={(e) => {
                      setRoh("form:rabatt_prozent", e.target.value);
                      const n = parseDecimal(e.target.value);
                      const val = n === null ? 0 : clamp(n, 0, 100);
                      updateField("rabatt_prozent", val);
                      if (val > 0) updateField("rabatt_betrag", 0);
                    }}
                    onBlur={() => {
                      const val = clamp(toNumber(rohTexte["form:rabatt_prozent"], 0), 0, 100);
                      updateField("rabatt_prozent", val);
                      if (val > 0) updateField("rabatt_betrag", 0);
                      clearRoh("form:rabatt_prozent");
                    }}
                    placeholder="0"
                    className="w-32"
                  />
                </div>
                <div>
                  <Label>Rabatt (€)</Label>
                  {/* Ein Rabatt kann nie negativ sein und nie größer als die
                      Positionssumme — sonst erhöht er die Belegsumme bzw. dreht
                      sie ins Minus, und das PDF geht nicht mehr auf. */}
                  <Input
                    type="text"
                    inputMode="decimal"
                    data-testid="rabatt-betrag"
                    value={rohOderZahl("form:rabatt_betrag", form.rabatt_betrag, { nachkomma: 2, leerBeiNull: true })}
                    onChange={(e) => {
                      setRoh("form:rabatt_betrag", e.target.value);
                      const n = parseDecimal(e.target.value);
                      const val = n === null ? 0 : clamp(round2(n), 0);
                      updateField("rabatt_betrag", val);
                      if (val > 0) updateField("rabatt_prozent", 0);
                    }}
                    onBlur={() => {
                      const roh = clamp(round2(toNumber(rohTexte["form:rabatt_betrag"], 0)), 0);
                      const val = Math.min(roh, positionenNetto);
                      if (roh > positionenNetto) {
                        toast({
                          variant: "destructive",
                          title: "Rabatt zu hoch",
                          description: `Der Rabatt darf die Positionssumme (€ ${eur(positionenNetto)}) nicht übersteigen — auf € ${eur(val)} begrenzt.`,
                        });
                      }
                      updateField("rabatt_betrag", val);
                      if (val > 0) updateField("rabatt_prozent", 0);
                      clearRoh("form:rabatt_betrag");
                    }}
                    placeholder="0,00"
                    className="w-32"
                    disabled={form.rabatt_prozent > 0}
                  />
                </div>
                {items.some(it => it.ist_kalkuliert) && (
                  <div>
                    <Label className="flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5" /> Aufschlag-Override (%)
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={
                        rohTexte["form:aufschlag_override"] !== undefined
                          ? rohTexte["form:aufschlag_override"]
                          : (form.kalkulation_aufschlag_override ?? "") === ""
                            ? ""
                            : formatForInput(Number(form.kalkulation_aufschlag_override))
                      }
                      placeholder="je Position"
                      onChange={(e) => {
                        setRoh("form:aufschlag_override", e.target.value);
                        setDocAufschlagOverride(e.target.value);
                      }}
                      onBlur={() => {
                        const roh = rohTexte["form:aufschlag_override"];
                        if (roh !== undefined) setDocAufschlagOverride(roh);
                        clearRoh("form:aufschlag_override");
                      }}
                      className="w-32"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1 max-w-[16rem]">
                      Überschreibt den Material-Aufschlag aller kalkulierten Positionen — leer = jede Position nutzt ihren eigenen.
                    </p>
                  </div>
                )}
              </div>
              )}
            </CardContent>
            </fieldset>
          </Card>

          {/* Allgemeine Angaben — nur bei Angebot + Auftragsbestätigung.
              Toggle steuert, ob die Tabelle im PDF/HTML überhaupt
              erscheint. Felder bleiben in der DB persistiert auch wenn
              Toggle off — beim Wieder-Aktivieren sind die Werte da. */}
          {getDocConfig(form.typ).isAngebotLike && (
            <Card className={`kb-panel ${isLocked ? "opacity-80" : ""}`}>
              <fieldset disabled={isLocked} className="min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Allgemeine Angaben</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Switch
                    id="allgemeine-angaben-aktiv"
                    checked={form.allgemeine_angaben_aktiv}
                    onCheckedChange={(v) => updateField("allgemeine_angaben_aktiv", v)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="allgemeine-angaben-aktiv" className="cursor-pointer">
                      Allgemeine Angaben auf PDF anzeigen
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Wenn aktiv, erscheint zwischen Betreff und Positionen eine Tabelle
                      mit Leistungsbeschreibung, Ausführungsort, Ausführungszeitraum und
                      ausführender Firma.
                    </p>
                  </div>
                </div>

                {form.allgemeine_angaben_aktiv && (
                  <div className="space-y-3 pt-3 border-t">
                    <div>
                      <Label>Leistungsbeschreibung</Label>
                      <Textarea
                        rows={2}
                        value={form.leistungsbeschreibung}
                        onChange={(e) => updateField("leistungsbeschreibung", e.target.value)}
                        placeholder="z. B. Stiegenrenovierung lt. Besprechung"
                        className="resize-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label>Ausführungsort</Label>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!(form.kunde_adresse || form.kunde_plz || form.kunde_ort)}
                          title="Adresse des Kunden als Ausführungsort einfügen (überschreibt aktuellen Wert)"
                          onClick={() => {
                            const adr = [
                              form.kunde_adresse,
                              [form.kunde_plz, form.kunde_ort].filter(Boolean).join(" "),
                            ].filter(Boolean).join("\n");
                            if (!adr.trim()) { toast({ title: "Kunde hat keine Adresse hinterlegt" }); return; }
                            updateField("ausfuehrungsort", adr);
                            toast({ title: "Kundenadresse übernommen" });
                          }}
                        >
                          <MapPin className="h-3 w-3 mr-1" />
                          Kundenadresse übernehmen
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!form.project_id}
                          title={form.project_id
                            ? "Adresse aus zugeordnetem Projekt einfügen (überschreibt aktuellen Wert)"
                            : "Kein Projekt zugeordnet"}
                          onClick={async () => {
                            if (!form.project_id) return;
                            const { data: projFull } = await (supabase.from("projects" as never) as any)
                              .select("adresse, plz, ort")
                              .eq("id", form.project_id)
                              .maybeSingle();
                            if (!projFull) {
                              toast({ variant: "destructive", title: "Projekt nicht gefunden" });
                              return;
                            }
                            const projAdresse = [
                              (projFull as any).adresse,
                              [(projFull as any).plz, (projFull as any).ort].filter(Boolean).join(" "),
                            ].filter(Boolean).join("\n");
                            if (!projAdresse.trim()) {
                              toast({ title: "Projekt hat keine Adresse hinterlegt" });
                              return;
                            }
                            updateField("ausfuehrungsort", projAdresse);
                            toast({ title: "Adresse aus Projekt übernommen" });
                          }}
                        >
                          <MapPin className="h-3 w-3 mr-1" />
                          Aus Projekt übernehmen
                        </Button>
                        </div>
                      </div>
                      <Textarea
                        rows={2}
                        value={form.ausfuehrungsort}
                        onChange={(e) => updateField("ausfuehrungsort", e.target.value)}
                        placeholder="Adresse aus Projekt übernehmen oder manuell eintragen"
                        className="resize-none"
                      />
                    </div>
                    <div>
                      <Label>Ausführungszeitraum</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Datumsbereich (von – bis)</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="date"
                              value={form.leistungsdatum}
                              onChange={(e) => {
                                updateField("leistungsdatum", e.target.value);
                                if (e.target.value) updateField("ausfuehrungs_kw", "");
                              }}
                              placeholder="von"
                              disabled={!!form.ausfuehrungs_kw}
                            />
                            <Input
                              type="date"
                              value={form.leistungsdatum_bis || ""}
                              onChange={(e) => updateField("leistungsdatum_bis", e.target.value)}
                              placeholder="bis (optional)"
                              min={form.leistungsdatum || undefined}
                              disabled={!!form.ausfuehrungs_kw}
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">oder Kalenderwoche</p>
                          <Input
                            value={form.ausfuehrungs_kw}
                            onChange={(e) => updateField("ausfuehrungs_kw", e.target.value)}
                            placeholder="z. B. KW 19/2026"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Kalenderwoche hat Vorrang im PDF, sobald sie befüllt ist.
                      </p>
                    </div>
                    <div>
                      <Label>Ausführende Firma</Label>
                      <Select
                        value={form.ausfuehrende_firma || "_none"}
                        onValueChange={(v) => updateField("ausfuehrende_firma", v === "_none" ? "" : v)}
                      >
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— keine Angabe —</SelectItem>
                          {EXECUTING_COMPANIES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                          <SelectItem value="freitext">Andere Firma (Freitext)</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.ausfuehrende_firma === "freitext" && (
                        <Textarea
                          rows={3}
                          className="mt-2 resize-none"
                          value={form.ausfuehrende_firma_freitext}
                          onChange={(e) => updateField("ausfuehrende_firma_freitext", e.target.value)}
                          placeholder="Firmenname und Adresse mehrzeilig"
                        />
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
              </fieldset>
            </Card>
          )}

          {/* ===== Schritt 2: Kunde — Projekt-Übernahme, Kundensuche & -daten ===== */}
          <StepSectionHeader num={2} label="Kunde" id="step-kunde" />

          {/* Projekt-Auswahl: bei Rechnung + Angebot/AB + Lieferschein, vor den
              Kundendaten. Bei Angebot/AB nötig, damit der "Aus Projekt
              übernehmen"-Button in den Allgemeinen Angaben den Ausführungsort
              ziehen kann. Beim Lieferschein für die Projekt-Spalte der Liste. */}
          {!isLocked && (form.typ === "rechnung" || form.typ === "lieferschein" || getDocConfig(form.typ).isAngebotLike) && (
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Projekt (optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={form.project_id || "none"} onValueChange={async (v) => {
                  const projectId = v === "none" ? null : v;
                  updateField("project_id", projectId);
                  if (projectId) {
                    // Projekt-Details laden (nur für customer_id).
                    const { data: projFull } = await (supabase.from("projects" as never) as any)
                      .select("customer_id")
                      .eq("id", projectId)
                      .maybeSingle();
                    const custId = projFull?.customer_id || (projects.find(p => p.id === projectId) as any)?.customer_id;
                    if (custId) {
                      const { data: cust } = await supabase
                        .from("customers")
                        .select("id, name, anrede, titel, uid_nummer, adresse, plz, ort, land, email, telefon, kundennummer, ansprechpartner, skonto_prozent, skonto_tage, nettofrist")
                        .eq("id", custId)
                        .single();
                      if (cust) {
                        if (!loading) setIsDirty(true);
                        setForm(prev => ({
                          ...prev,
                          customer_id: cust.id,
                          kunde_name: cust.name,
                          kunde_adresse: cust.adresse || "",
                          kunde_plz: cust.plz || "",
                          kunde_ort: cust.ort || "",
                          kunde_land: cust.land || "Österreich",
                          kunde_email: cust.email || "",
                          kunde_telefon: cust.telefon || "",
                          kunde_uid: cust.uid_nummer || "",
                          kunde_anrede: cust.anrede || "",
                          kunde_titel: cust.titel || "",
                          kundennummer: cust.kundennummer || "",
                          // Ansprechpartner wird beim Kunden-Wechsel NICHT
                          // übernommen — er ist der Sachbearbeiter und
                          // wird separat im Formular gewählt.
                          skonto_prozent: Number(cust.skonto_prozent) || 0,
                          skonto_tage: Number(cust.skonto_tage) || 0,
                        } as any));
                        const custNettofrist = Number(cust.nettofrist) || 0;
                        const zb = nettofristToDropdown(custNettofrist);
                        updateField("zahlungsbedingungen", zb);
                        // Bei "individuell" muss faellig_am explizit gesetzt
                        // werden (der Sync-useEffect rührt "individuell" nicht
                        // an). Für Standard-Dropdown-Werte übernimmt der
                        // useEffect die Berechnung automatisch.
                        if (zb === "individuell" && custNettofrist > 0 && form.datum) {
                          const due = new Date(form.datum + "T12:00:00");
                          due.setDate(due.getDate() + custNettofrist);
                          updateField("faellig_am", due.toISOString().split("T")[0]);
                        }
                        toast({ title: "Projektdaten übernommen", description: cust.name });
                      }
                    }
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Projekt</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.project_id && form.customer_id && (
                  <p className="text-xs text-green-600 mt-2">Kundendaten wurden automatisch vom Projekt übernommen</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Projekt-Anzeige bei gespeicherten Dokumenten */}
          {form.project_id && (isLocked || isKundeLocked) && (() => {
            const proj = projects.find(p => p.id === form.project_id);
            return proj ? (
              <div className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 rounded-md p-2.5">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-muted-foreground">Projekt:</span>
                <span className="font-medium">{proj.name}</span>
              </div>
            ) : null;
          })()}

          {/* Gutschrift: optionaler Bezug auf bestehende Rechnung — nur bei
              neuer Standalone-Gutschrift sichtbar. Bei Convert-Pfad
              (from_doc) ist parent_invoice_id schon gesetzt und der
              Bezugs-Block versteckt sich. */}
          {isNew && form.typ === "gutschrift" && !form.parent_invoice_id && (
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Bezug auf Rechnung (optional)</CardTitle>
                <CardDescription>
                  Wählen Sie eine bestehende Rechnung, deren Daten als Vorlage
                  übernommen werden. Kundendaten und Positionen werden vorbefüllt;
                  Sie können danach Positionen löschen oder Mengen anpassen.
                  Wenn Sie nichts wählen, legen Sie eine eigenständige Gutschrift an.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  onValueChange={async (id) => {
                    if (id && id !== "_none") {
                      // Direkt in den Form-State laden — Kunde +
                      // Positionen + parent_invoice_id werden sofort
                      // gesetzt, ohne Navigation. Vorteil gegenüber
                      // navigate(...) mit ?from_doc=: das useEffect bei
                      // Mount feuert nicht erneut, weil sich `id`
                      // (Route-Param) nicht ändert.
                      await loadFromSourceDoc(id, "gutschrift");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rechnung wählen oder leer lassen für Standalone-Gutschrift" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectRechnungen.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nummer} · {r.kunde_name} · {new Date(r.datum + "T12:00:00").toLocaleDateString("de-AT")}
                      </SelectItem>
                    ))}
                    {projectRechnungen.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Lädt verfügbare Rechnungen…
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Kundendaten — locked nach Speichern nur bei Rechnungen, bei Angeboten editierbar */}
          <Card className={`kb-panel ${isKundeLocked ? "opacity-80" : ""}`}>
            <fieldset disabled={isKundeLocked} className="min-w-0">
            <CardHeader>
              {/* Am Handy untereinander — nebeneinander drückte die Karte über
                  den Bildschirmrand hinaus (horizontaler Body-Overflow). */}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="shrink-0">Kundendaten</CardTitle>
                <CustomerSelect
                  className="min-w-0 sm:w-64"
                  value={form.customer_id || null}
                  onChange={async (id, customer) => {
                    if (!customer) {
                      if (!loading) setIsDirty(true);
                      setForm(prev => ({
                        ...prev,
                        customer_id: null,
                        kunde_name: "",
                        kunde_adresse: "",
                        kunde_plz: "",
                        kunde_ort: "",
                        kunde_land: "Österreich",
                        kunde_email: "",
                        kunde_telefon: "",
                        kunde_uid: "",
                        kunde_anrede: "",
                        kunde_titel: "",
                        kundennummer: "",
                      } as any));
                      return;
                    }
                    const updates: any = {
                      customer_id: customer.id,
                      kunde_name: customer.name,
                      kunde_adresse: customer.adresse || "",
                      kunde_plz: customer.plz || "",
                      kunde_ort: customer.ort || "",
                      kunde_land: customer.land || "Österreich",
                      kunde_email: customer.email || "",
                      kunde_telefon: customer.telefon || "",
                      kunde_uid: customer.uid_nummer || "",
                      kunde_anrede: customer.anrede || "",
                      kunde_titel: customer.titel || "",
                      kundennummer: customer.kundennummer || "",
                      // Ansprechpartner wird NICHT aus den Kundendaten übernommen —
                      // er ist der Sachbearbeiter und wird pro Dokument aus
                      // der Mitarbeiter-Liste gewählt.
                    };
                    // Übernehme Skonto + Zahlungsfrist vom Kunden (nur bei Rechnungen)
                    const hints: string[] = [];
                    if (form.typ === "rechnung") {
                      const { data: fullCust } = await supabase.from("customers").select("skonto_prozent, skonto_tage, nettofrist").eq("id", customer.id).single();
                      if (fullCust) {
                        const custSkonto = Number(fullCust.skonto_prozent) || 0;
                        const custSkontoTage = Number(fullCust.skonto_tage) || 0;
                        const custNettofrist = Number(fullCust.nettofrist) || 0;
                        if (custSkonto > 0) {
                          updates.skonto_prozent = custSkonto;
                          updates.skonto_tage = custSkontoTage;
                          hints.push(`Skonto: ${custSkonto}% / ${custSkontoTage} Tage`);
                        }
                        const zb = nettofristToDropdown(custNettofrist);
                        updates.zahlungsbedingungen = zb;
                        if (zb === "individuell" && custNettofrist > 0 && form.datum) {
                          const due = new Date(form.datum + "T12:00:00");
                          due.setDate(due.getDate() + custNettofrist);
                          updates.faellig_am = due.toISOString().split("T")[0];
                        }
                        if (custNettofrist > 0) {
                          hints.push(`Zahlungsfrist: ${custNettofrist} Tage`);
                        }
                      }
                    }
                    if (!loading) setIsDirty(true);
                    setForm(prev => ({ ...prev, ...updates }));
                    if (hints.length > 0) {
                      toast({ title: "Kundeneinstellungen übernommen", description: hints.join(" · ") });
                    }
                    // Hinweis bei Geschäftskunde ohne UID — die UID ist für
                    // den Empfänger-Block am PDF wichtig (Reverse-Charge,
                    // B2B-Nachweis). Besser jetzt darauf hinweisen, als
                    // später eine UID-lose Rechnung zu drucken.
                    if ((customer as any).kundentyp === "geschaeftskunde" && !(customer.uid_nummer || "").trim()) {
                      toast({
                        variant: "destructive",
                        title: "UID fehlt",
                        description: `${customer.name} ist ein Geschäftskunde, hat aber keine UID-Nummer hinterlegt. Bitte im Kunden-Datensatz ergänzen — sie erscheint sonst nicht im Rechnungs-Adressfeld.`,
                        duration: 8000,
                      });
                    }
                  }}
                />
              </div>
              {form.customer_id && (
                <p className="text-xs text-muted-foreground mt-1">
                  Verknüpft mit bestehendem Kunden • <button className="underline" onClick={() => {
                    if (!loading) setIsDirty(true);
                    setForm(prev => ({
                      ...prev,
                      customer_id: null,
                      kunde_name: "",
                      kunde_adresse: "",
                      kunde_plz: "",
                      kunde_ort: "",
                      kunde_land: "Österreich",
                      kunde_email: "",
                      kunde_telefon: "",
                      kunde_uid: "",
                      kunde_anrede: "",
                      kunde_titel: "",
                      kundennummer: "",
                    } as any));
                  }}>Verknüpfung lösen</button>
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {form.kunde_name ? (
                <div className="rounded-lg border p-3 bg-muted/30 space-y-1 text-sm relative">
                  {!isKundeLocked && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {form.customer_id && (
                        <button
                          type="button"
                          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors sm:h-7 sm:w-7"
                          title="Kundendaten bearbeiten"
                          onClick={() => setCustomerEditOpen(true)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors sm:h-7 sm:w-7"
                        title="Kunde entfernen"
                        onClick={() => {
                          if (!loading) setIsDirty(true);
                          setForm(prev => ({
                            ...prev,
                            customer_id: null,
                            kunde_name: "",
                            kunde_adresse: "",
                            kunde_plz: "",
                            kunde_ort: "",
                            kunde_land: "Österreich",
                            kunde_email: "",
                            kunde_telefon: "",
                            kunde_uid: "",
                            kunde_anrede: "",
                            kunde_titel: "",
                            kundennummer: "",
                          } as any));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="font-medium text-base pr-16">
                    {(form as any).kunde_anrede && <span className="text-muted-foreground">{(form as any).kunde_anrede} </span>}
                    {(form as any).kunde_titel && <span className="text-muted-foreground">{(form as any).kunde_titel} </span>}
                    {form.kunde_name}
                  </div>
                  {form.kunde_adresse && <div className="text-muted-foreground">{form.kunde_adresse}</div>}
                  {(form.kunde_plz || form.kunde_ort) && <div className="text-muted-foreground">{form.kunde_plz} {form.kunde_ort} {form.kunde_land && form.kunde_land !== "Österreich" ? `· ${form.kunde_land}` : ""}</div>}
                  <div className="flex gap-4 mt-1">
                    {form.kunde_email && <span className="text-muted-foreground">{form.kunde_email}</span>}
                    {form.kunde_telefon && <span className="text-muted-foreground">{form.kunde_telefon}</span>}
                  </div>
                  {form.kunde_uid && <div className="text-muted-foreground">UID: {form.kunde_uid}</div>}
                  {(form as any).kundennummer && <div className="text-muted-foreground">Kundennr.: {(form as any).kundennummer}</div>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Kein Kunde ausgewählt. Wählen Sie oben einen Kunden aus.</p>
              )}
              {/* Ansprechpartner (Sachbearbeiter) pro Dokument */}
              <div className="mt-3 p-3 rounded-lg bg-muted/30 border space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Ihr Ansprechpartner (erscheint rechts oben im PDF)
                </p>
                <Select
                  value={(form as any).ansprechpartner_employee_id || "__none__"}
                  disabled={isLocked}
                  onValueChange={(val) => {
                    if (val === "__none__") {
                      // "Keiner" leert auch die Freitext-Felder, damit im
                      // PDF gar kein Ansprechpartner erscheint.
                      setForm(prev => ({
                        ...prev,
                        ansprechpartner_employee_id: null,
                        ansprechpartner_name: "",
                        ansprechpartner_telefon: "",
                        ansprechpartner_email: "",
                      } as any));
                      if (!loading) setIsDirty(true);
                      return;
                    }
                    if (val === "__manual__") {
                      // Manuelle Eingabe: Dropdown-Referenz löschen, aber
                      // Freitext-Felder lassen wie sie sind, sodass der
                      // User sie editieren kann.
                      setForm(prev => ({
                        ...prev,
                        ansprechpartner_employee_id: null,
                      } as any));
                      if (!loading) setIsDirty(true);
                      return;
                    }
                    const emp = employees.find(e => e.id === val);
                    if (!emp) return;
                    setForm(prev => ({
                      ...prev,
                      ansprechpartner_employee_id: emp.id,
                      ansprechpartner_name: `${emp.vorname} ${emp.nachname}`.trim(),
                      ansprechpartner_telefon: emp.telefon || "",
                      ansprechpartner_email: emp.email || "",
                    } as any));
                    if (!loading) setIsDirty(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mitarbeiter auswählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">— Keiner (im PDF ausblenden)</span>
                    </SelectItem>
                    <SelectItem value="__manual__">
                      <span className="text-muted-foreground">— Manuell eingeben…</span>
                    </SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.vorname} {emp.nachname}
                        {emp.position ? <span className="text-muted-foreground ml-1">— {emp.position}</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Freitext-Felder: immer editierbar (nur gesperrt, wenn die
                    ganze Rechnung locked ist). Bei Mitarbeiter-Auswahl werden
                    die Werte übernommen, können aber danach überschrieben
                    werden — die Employee-ID wird dabei automatisch gelöst,
                    damit später klar ist, dass es ein angepasster Snapshot
                    und keine Live-Referenz auf den Mitarbeiter mehr ist. */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input
                    value={(form as any).ansprechpartner_name || ""}
                    onChange={(e) => {
                      updateField("ansprechpartner_name" as any, e.target.value);
                      if ((form as any).ansprechpartner_employee_id) {
                        updateField("ansprechpartner_employee_id" as any, null);
                      }
                    }}
                    placeholder="Name"
                    disabled={isLocked}
                  />
                  <Input
                    value={(form as any).ansprechpartner_telefon || ""}
                    onChange={(e) => {
                      updateField("ansprechpartner_telefon" as any, e.target.value);
                      if ((form as any).ansprechpartner_employee_id) {
                        updateField("ansprechpartner_employee_id" as any, null);
                      }
                    }}
                    placeholder="Telefon"
                    type="tel"
                    disabled={isLocked}
                  />
                  <Input
                    value={(form as any).ansprechpartner_email || ""}
                    onChange={(e) => {
                      updateField("ansprechpartner_email" as any, e.target.value);
                      if ((form as any).ansprechpartner_employee_id) {
                        updateField("ansprechpartner_employee_id" as any, null);
                      }
                    }}
                    placeholder="E-Mail"
                    type="email"
                    disabled={isLocked}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Bei Mitarbeiter-Auswahl vorbefüllt, jederzeit editierbar. Leer lassen, wenn auf dem PDF kein Ansprechpartner erscheinen soll.
                </p>
              </div>

              {/* Zahlungseinstellungen (vom Kunden) */}
              {form.typ === "rechnung" && (form.skonto_prozent > 0 || form.skonto_tage > 0 || (form as any).zahlungsbedingungen) && (
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Zahlungseinstellungen vom Kunden</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
                    {form.skonto_prozent > 0 && (
                      <div><span className="text-muted-foreground">Skonto:</span> <strong>{form.skonto_prozent}%</strong></div>
                    )}
                    {form.skonto_tage > 0 && (
                      <div><span className="text-muted-foreground">Skonto-Tage:</span> <strong>{form.skonto_tage}</strong></div>
                    )}
                    {form.zahlungsbedingungen && (
                      <div><span className="text-muted-foreground">Zahlungsfrist:</span> <strong>{form.zahlungsbedingungen}</strong></div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
            </fieldset>
          </Card>

          {/* ===== Schritt 3: Positionen — Artikel, Mengen, Summen ===== */}
          <StepSectionHeader num={3} label="Artikel" id="step-positionen" />

          {/* Positionen */}
          <Card className={`kb-panel ${isLocked ? "opacity-80" : ""}`}>
            <CardHeader>
              {/* Handy: Überschrift oben, Werkzeug-Knöpfe darunter (vorher
                  schoben sich die Knöpfe über die Überschrift). */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="shrink-0">Positionen</CardTitle>
                {!isLocked && (
                <div className="flex gap-2 flex-wrap">
                  {form.typ === "rechnung" && (
                    <>
                      <Button onClick={() => setImportOfferOpen(true)} variant="outline" size="sm" className="gap-1">
                        <FileText className="w-4 h-4" />
                        Aus Angebot
                      </Button>
                      <Button onClick={() => setImportRegieOpen(true)} variant="outline" size="sm" className="gap-1">
                        <FileText className="w-4 h-4" />
                        Aus Regiebericht
                      </Button>
                    </>
                  )}
                  <Button onClick={() => setImportTimeOpen(true)} variant="outline" size="sm" className="gap-1">
                    <FileText className="w-4 h-4" />
                    Arbeitszeiten
                  </Button>
                  <Button onClick={() => setTemplateDialogOpen(true)} variant="outline" size="sm" className="gap-1">
                    <Package className="w-4 h-4" />
                    Materialien
                  </Button>
                  {items.some(it => it.ist_kalkuliert && it.kalkulation_template_id) && (
                    <Button onClick={refreshKalkulationFromCatalog} disabled={kalkRefreshing} variant="outline" size="sm"
                      className={`gap-1 ${staleKalkCount > 0 ? "border-amber-400 text-amber-700" : ""}`}
                      title="Kalkulierte Positionen mit den aktuellen Material-/EK-Preisen aus dem Katalog neu berechnen">
                      <RefreshCw className={`w-4 h-4 ${kalkRefreshing ? "animate-spin" : ""}`} />
                      Preise aktualisieren
                    </Button>
                  )}
                  {!hidePrices && (
                    <Button onClick={() => setPriceAdjustOpen(true)} disabled={isLocked} variant="outline" size="sm" className="gap-1"
                      title="Rabatt/Aufschlag auf ausgewählte Positionen — oder die KI eine Ziel-Differenz verteilen lassen">
                      <Percent className="w-4 h-4" />
                      Preise anpassen
                    </Button>
                  )}
                  <Button onClick={addItem} variant="outline" size="sm" className="gap-1">
                    <Plus className="w-4 h-4" />
                    Position
                  </Button>
                </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!isLocked && staleKalkCount > 0 && (
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-900 flex-1">
                    Bei <strong>{staleKalkCount}</strong> kalkulierten Position(en) haben sich die Material-/EK-Preise im Katalog seit dem Erstellen geändert.
                  </p>
                  <Button onClick={refreshKalkulationFromCatalog} disabled={kalkRefreshing} size="sm"
                    className="bg-amber-600 hover:bg-amber-700 gap-1 shrink-0">
                    <RefreshCw className={`w-4 h-4 ${kalkRefreshing ? "animate-spin" : ""}`} />
                    Jetzt aktualisieren
                  </Button>
                </div>
              )}
              <fieldset disabled={isLocked} className="min-w-0">
              <div ref={posWrapRef}>
                {(() => {
                  /* Positions-Zeilen werden EINMAL aufgebaut und je nach Platz
                     als KingBill-Tabelle (breit) oder als Karten (schmal:
                     Handy + eingeklappter Editor neben der Live-Vorschau)
                     ausgegeben. Beide Darstellungen nutzen exakt dieselben
                     Eingabefelder — kein zweiter Satz Logik, der auseinanderläuft. */
                  const rows = items.map((item, idx) => {
                    const acQuery = (autocompleteIdx === idx && item.beschreibung.length >= 2) ? item.beschreibung.toLowerCase() : "";
                    const acResults = acQuery ? templates.filter(t => {
                      const kb = ((t as any).kurzbezeichnung || t.name || "").toLowerCase();
                      const pn = ((t as any).produktnummer || "").toLowerCase();
                      const lb = ((t as any).langbezeichnung || t.beschreibung || "").toLowerCase();
                      const pg = ((t as any).produktgruppe || "").toLowerCase();
                      return kb.includes(acQuery) || pn.includes(acQuery) || lb.includes(acQuery) || pg.includes(acQuery);
                    }).slice(0, 20) : [];

                    const isExempt = !!(item as any).mwst_exempt;

                    const beschreibungFeld = (
                      <>
                        <div className="relative">
                          <Input
                            value={item.beschreibung}
                            onChange={(e) => {
                              updateItem(idx, "beschreibung", e.target.value);
                              updateItem(idx, "kurztext", e.target.value);
                              setAutocompleteIdx(idx);
                            }}
                            onFocus={() => setAutocompleteIdx(idx)}
                            onBlur={() => setTimeout(() => setAutocompleteIdx(null), 200)}
                            placeholder="Kurzbezeichnung"
                            className="h-10 md:h-9"
                            disabled={isExempt}
                            title={isExempt ? "Automatischer Anzahlungs-Abzug — nicht manuell editierbar. Entferne die Zeile, wenn die Anzahlung nicht abgezogen werden soll." : undefined}
                          />
                          {/* Autocomplete dropdown */}
                          {acResults.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
                              {acResults.map(t => (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between gap-2"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const netto = Number((t as any).netto_preis) || t.einzelpreis;
                                    updateItem(idx, "beschreibung", (t as any).kurzbezeichnung || t.name);
                                    updateItem(idx, "kurztext", (t as any).kurzbezeichnung || t.name);
                                    const lang = (t as any).langbezeichnung || "";
                                    const kurz = (t as any).kurzbezeichnung || t.name || "";
                                    // Langtext nur setzen wenn es eine echte Langbezeichnung gibt und sie sich vom Kurztext unterscheidet
                                    updateItem(idx, "langtext", lang && lang !== kurz ? lang : "");
                                    updateItem(idx, "einheit", t.einheit);
                                    updateItem(idx, "einzelpreis", netto);
                                    updateItem(idx, "produktnummer", (t as any).produktnummer || "");
                                    setAutocompleteIdx(null);
                                  }}
                                >
                                  <span className="truncate">{(t as any).kurzbezeichnung || t.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {(t as any).produktnummer && <span className="mr-2">{(t as any).produktnummer}</span>}
                                    € {eur((Number((t as any).netto_preis) || t.einzelpreis))}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {item.produktnummer && (
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">Prod.-Nr: {item.produktnummer}</span>
                        )}
                        {(item.langtext || !isLocked) && (
                          <textarea
                            value={item.langtext || ""}
                            onChange={(e) => {
                              updateItem(idx, "langtext", e.target.value);
                              e.target.style.height = "auto";
                              e.target.style.height = e.target.scrollHeight + "px";
                            }}
                            onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                            placeholder="Langtext / Details (optional, wird auf PDF angezeigt)"
                            className="mt-1 w-full text-xs border rounded px-2 py-1 resize-none bg-muted/30"
                            style={{ minHeight: "28px", height: item.langtext ? "auto" : "28px" }}
                            rows={item.langtext ? Math.max(2, item.langtext.split("\n").length) : 1}
                          />
                        )}
                      </>
                    );

                    /* Zahlenfelder: type="text" + Rohtext-Puffer, damit "12,50"
                       nicht als 1250 gelesen wird. Beim Tippen wird live geparst
                       (Summen aktualisieren sich sofort), der Rohtext bleibt
                       stehen; erst onBlur wird geklemmt und neu formatiert. */
                    const mengeKey = `pos:${idx}:menge`;
                    const preisKey = `pos:${idx}:preis`;
                    const rabattKey = `pos:${idx}:rabatt`;
                    const mengeFeld = (
                      <Input
                        data-testid="pos-menge"
                        type="text"
                        inputMode="decimal"
                        value={rohOderZahl(mengeKey, item.menge)}
                        onChange={(e) => {
                          setRoh(mengeKey, e.target.value);
                          const n = parseDecimal(e.target.value);
                          if (n !== null) updateItem(idx, "menge", clamp(n, 0));
                        }}
                        onBlur={() => {
                          const n = clamp(toNumber(rohTexte[mengeKey], item.menge), 0);
                          updateItem(idx, "menge", n);
                          clearRoh(mengeKey);
                        }}
                        className="text-right h-10 md:h-9"
                        disabled={isExempt}
                      />
                    );
                    const einheitFeld = (
                      <Select value={item.einheit || "Stk."} onValueChange={(v) => updateItem(idx, "einheit", v)} disabled={isExempt}>
                        <SelectTrigger data-testid="pos-einheit" className="w-full md:w-[90px] h-10 md:h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {einheiten.map(e => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                    const preisFeld = (
                      <Input
                        data-testid="pos-preis"
                        type="text"
                        inputMode="decimal"
                        value={rohOderZahl(preisKey, item.einzelpreis, { nachkomma: 2 })}
                        onChange={(e) => {
                          setRoh(preisKey, e.target.value);
                          const n = parseDecimal(e.target.value);
                          if (n !== null) updateItem(idx, "einzelpreis", clamp(n, 0));
                        }}
                        onBlur={() => {
                          const n = clamp(toNumber(rohTexte[preisKey], item.einzelpreis), 0);
                          updateItem(idx, "einzelpreis", n);
                          clearRoh(preisKey);
                        }}
                        className="text-right h-10 md:h-9"
                        disabled={isExempt || !!item.ist_kalkuliert}
                        title={item.ist_kalkuliert ? "Preis wird kalkuliert — über das Rechner-Symbol anpassen" : undefined}
                      />
                    );
                    const rabattFeld = (
                      <Input
                        data-testid="pos-rabatt"
                        type="text"
                        inputMode="decimal"
                        value={rohOderZahl(rabattKey, Number(item.rabatt_prozent) || 0, { leerBeiNull: true })}
                        onChange={(e) => {
                          setRoh(rabattKey, e.target.value);
                          const n = parseDecimal(e.target.value);
                          updateItem(idx, "rabatt_prozent", n === null ? 0 : clamp(n, 0, 100));
                        }}
                        onBlur={() => {
                          const n = clamp(toNumber(rohTexte[rabattKey], 0), 0, 100);
                          updateItem(idx, "rabatt_prozent", n);
                          clearRoh(rabattKey);
                        }}
                        className="text-right h-10 md:h-9"
                        placeholder="0"
                        disabled={isExempt}
                      />
                    );

                    const kalkButton = !isLocked && !hidePrices ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className={`h-11 w-11 md:h-8 md:w-8 ${item.ist_kalkuliert ? "text-primary" : "text-muted-foreground"}`} title="Kalkulation (EK, Verschnitt, Aufschlag, Lohn)">
                            <Calculator className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[420px] max-w-[92vw]" align="end">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">Kalkulation – Position {item.position}</p>
                              {item.ist_kalkuliert && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                                  onClick={() => updateItem(idx, "ist_kalkuliert", false)}>
                                  Kalkulation lösen
                                </Button>
                              )}
                            </div>
                            <KalkulationFields
                              einheit={item.einheit}
                              compact
                              aufschlagOverride={docAufschlagOverride}
                              value={{
                                ek_preis: Number(item.ek_preis) || 0,
                                verschnitt_prozent: Number(item.verschnitt_prozent) || 0,
                                aufschlag_prozent: Number(item.aufschlag_prozent) || 0,
                                befestigung_preis: Number(item.befestigung_preis) || 0,
                                sonstiges_preis: Number(item.sonstiges_preis) || 0,
                                arbeitszeit_minuten: Number(item.arbeitszeit_minuten) || 0,
                                stundensatz: Number(item.stundensatz) || 52,
                              }}
                              onChange={(v) => applyItemKalkulation(idx, v)}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null;

                    const moveButtons = !isLocked ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8" disabled={idx === 0} onClick={() => moveItem(idx, "up")} title="Nach oben">
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8" disabled={idx === items.length - 1} onClick={() => moveItem(idx, "down")} title="Nach unten">
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </>
                    ) : null;

                    const deleteButton = items.length > 1 && !isLocked ? (
                      <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8" onClick={() => removeItem(idx)} title="Position löschen">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    ) : null;

                    /* Auge = "Kunde sieht diese Zeile" (auf_pdf).
                       Gesperrt bei der Gruppen-Sammelzeile (die Kategorie sieht
                       der Kunde immer) und bei allen preistragenden Zeilen —
                       ein Beleg, auf dem ein verrechneter Betrag fehlt, geht
                       nicht auf. Frei schaltbar sind damit genau die
                       betragslosen Detail-/Textzeilen. */
                    const inGruppe = !!gruppeVon(item);
                    const istSumme = !!item.ist_gruppensumme;
                    const istDetail = istDetailzeile(item);
                    const sichtbar = istSichtbar(item);
                    const augeGesperrt = istSumme || traegtBetrag(item);
                    const augeTitel = istSumme
                      ? "Die Kategorie sieht der Kunde immer"
                      : traegtBetrag(item)
                        ? "Diese Position trägt einen Betrag — Beträge müssen im Kundendokument stehen"
                        : sichtbar
                          ? "Kunde sieht diese Zeile — klicken zum Ausblenden"
                          : "Kunde sieht diese Zeile NICHT — klicken zum Einblenden";
                    const eyeButton = (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-testid="pos-auge"
                        data-sichtbar={sichtbar ? "1" : "0"}
                        className={`h-11 w-11 md:h-8 md:w-8 ${sichtbar ? "text-primary" : "text-muted-foreground/50"}`}
                        disabled={isLocked || augeGesperrt}
                        title={augeTitel}
                        aria-label={augeTitel}
                        onClick={() => toggleZeileSichtbar(idx)}
                      >
                        {sichtbar ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </Button>
                    );

                    return { item, idx, isExempt, inGruppe, istSumme, istDetail, sichtbar, beschreibungFeld, mengeFeld, einheitFeld, preisFeld, rabattFeld, kalkButton, moveButtons, deleteButton, eyeButton };
                  });

                  /* ══ GRUPPEN-BLÖCKE ═══════════════════════════════════════
                     Aufeinanderfolgende Positionen mit derselben `gruppe`
                     bilden ein Kapitel (Aufbau). Ungruppierte Positionen
                     bleiben Einzelzeilen — Belege ohne Gruppen sehen deshalb
                     exakt aus wie bisher. */
                  type PosRow = typeof rows[number];
                  type PosBlock =
                    | { art: "einzel"; row: PosRow }
                    | { art: "gruppe"; gruppe: string; rows: PosRow[] };
                  const blocks: PosBlock[] = [];
                  for (const r of rows) {
                    const g = gruppeVon(r.item);
                    const last = blocks[blocks.length - 1];
                    if (!g) { blocks.push({ art: "einzel", row: r }); continue; }
                    if (last && last.art === "gruppe" && last.gruppe === g) last.rows.push(r);
                    else blocks.push({ art: "gruppe", gruppe: g, rows: [r] });
                  }

                  /**
                   * Auf-/Zuklappen einer Gruppe. BEWUSST kein <Button>: die
                   * Positionsliste steckt in <fieldset disabled> — bei einem
                   * gesperrten Beleg (angenommen/verrechnet) wären echte
                   * Form-Controls tot, und der Chef könnte die Aufbauten nicht
                   * mehr aufklappen. Das Aufklappen ist reine Ansicht.
                   */
                  const gruppenToggle = (gruppe: string, offen: boolean) => (
                    <span
                      role="button"
                      tabIndex={0}
                      data-testid="gruppe-toggle"
                      aria-expanded={offen}
                      title={offen ? "Details einklappen" : "Details anzeigen"}
                      onClick={() => toggleGruppe(gruppe)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGruppe(gruppe); }
                      }}
                      className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:h-8 md:w-8"
                    >
                      {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  );

                  /** Kennzahlen eines Aufbau-Blocks für den Gruppenkopf. */
                  const gruppenInfo = (b: Extract<PosBlock, { art: "gruppe" }>) => {
                    const details = b.rows.filter(r => r.istDetail);
                    return {
                      offen: istGruppeOffen(b.gruppe),
                      zwischensumme: b.rows.reduce((s, r) => s + (Number(r.item.gesamtpreis) || 0), 0),
                      details,
                      sichtbareDetails: details.filter(r => r.sichtbar).length,
                    };
                  };

                  /* ══ SCHMAL: Karten (Handy / schmaler Editor) ══════════════ */
                  if (posNarrow) {
                    const karte = (r: PosRow) => (
                      <div
                        key={r.idx}
                        data-testid="pos-row"
                        className={`rounded-lg border p-3 ${
                          r.isExempt ? "border-rose-300 bg-rose-50/60"
                            : r.istDetail ? "border-dashed border-l-4 border-l-primary/30 bg-background ml-1.5 sm:ml-3"
                            : "border-border bg-muted/20"
                        } ${r.istDetail && !r.sichtbar ? "opacity-70" : ""}`}
                      >
                        {/* flex-wrap: mit dem zusätzlichen Auge-Schalter sind es
                            5 Icon-Buttons — auf 390 px müssen sie umbrechen
                            dürfen, sonst schiebt die Karte die Seite auf. */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {r.idx + 1}
                          </span>
                          {r.isExempt && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-rose-300 text-rose-700 bg-white">
                              MwSt-frei
                            </Badge>
                          )}
                          {r.istSumme && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/40 text-primary bg-white">
                              Sammelzeile
                            </Badge>
                          )}
                          {r.istDetail && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-muted-foreground bg-white">
                              {r.sichtbar ? "Kunde sieht das" : "nur intern"}
                            </Badge>
                          )}
                          <div className="ml-auto flex flex-wrap items-center justify-end">
                            {r.eyeButton}
                            {r.kalkButton}
                            {r.moveButtons}
                            {r.deleteButton}
                          </div>
                        </div>

                        {r.beschreibungFeld}

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Menge</Label>
                            {r.mengeFeld}
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Einheit</Label>
                            {r.einheitFeld}
                          </div>
                          {!hidePrices && (
                            <>
                              <div>
                                <Label className="text-[11px] text-muted-foreground">Preis netto €</Label>
                                {r.preisFeld}
                              </div>
                              <div>
                                <Label className="text-[11px] text-muted-foreground">Rabatt %</Label>
                                {r.rabattFeld}
                              </div>
                            </>
                          )}
                        </div>

                        {!hidePrices && (
                          <div className="mt-2 flex items-center justify-between border-t pt-2">
                            <span className="text-xs text-muted-foreground">Gesamt (netto)</span>
                            {/* Detailzeilen tragen keinen Betrag — der steckt in der
                                Sammelzeile des Aufbaus. Kein "€ 0,00" anzeigen. */}
                            {r.istDetail ? (
                              <span className="text-sm text-muted-foreground">im Aufbau enthalten</span>
                            ) : (
                              <span className="text-base font-bold tabular-nums">€ {eur(r.item.gesamtpreis)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <div className="flex flex-col gap-3" data-testid="pos-cards">
                        {blocks.map((b, bi) => {
                          if (b.art === "einzel") return karte(b.row);
                          const g = gruppenInfo(b);
                          return (
                            <div key={`grp-${bi}-${b.gruppe}`} data-testid="pos-gruppe" className="min-w-0 rounded-lg border border-primary/30 bg-primary/5 p-1.5 sm:p-2">
                              {/* Der GANZE Kopf klappt auf/zu — vorher reagierte nur
                                  der kleine Pfeil, ein Klick auf den Namen tat nichts. */}
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={g.offen}
                                onClick={() => toggleGruppe(b.gruppe)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGruppe(b.gruppe); } }}
                                title={g.offen ? "Unterpositionen einklappen" : "Unterpositionen anzeigen"}
                                className="flex cursor-pointer items-center gap-1.5 flex-wrap rounded-md hover:bg-primary/10"
                              >
                                {gruppenToggle(b.gruppe, g.offen)}
                                <Layers className="w-4 h-4 text-primary shrink-0" />
                                <span className="font-semibold text-sm min-w-0 break-words">{b.gruppe}</span>
                                {!hidePrices && (
                                  <span className="ml-auto text-sm font-bold tabular-nums shrink-0">€ {eur(g.zwischensumme)}</span>
                                )}
                              </div>
                              {g.details.length > 0 && (
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap pl-1">
                                  <span className="text-[11px] text-muted-foreground">
                                    {g.details.length} Unterposition(en) · {g.sichtbareDetails} davon im Angebot sichtbar
                                  </span>
                                  {!isLocked && (
                                    /* min-h-[44px] + klickbares Label: der Schalter
                                       selbst ist 24 px hoch (KingBill-Look), die
                                       Trefferfläche mit Beschriftung aber 44 px. */
                                    <div className="ml-auto flex min-h-[44px] items-center gap-1.5">
                                      <Label htmlFor={`grp-sw-${bi}`} className="cursor-pointer py-3 text-[11px] text-muted-foreground">
                                        Alle im Angebot zeigen
                                      </Label>
                                      <Switch id={`grp-sw-${bi}`} data-testid="gruppe-alle-details"
                                        checked={g.sichtbareDetails === g.details.length}
                                        onCheckedChange={(v) => setGruppenDetailsSichtbar(b.gruppe, v)} />
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="mt-2 flex flex-col gap-2">
                                {b.rows.filter(r => !r.istDetail || g.offen).map(karte)}
                              </div>
                            </div>
                          );
                        })}

                        {!isLocked && (
                          <Button onClick={addItem} variant="outline" className="w-full h-11 gap-1.5">
                            <Plus className="w-4 h-4" />
                            Position hinzufügen
                          </Button>
                        )}

                        {/* Summen als Karte statt Tabellenfuß */}
                        {!hidePrices && (
                          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Positionen Netto</span>
                              <span className="font-medium tabular-nums">€ {eur(positionenNetto)}</span>
                            </div>
                            {rabattWert > 0 && (
                              <div className="flex justify-between text-orange-600">
                                <span>Rabatt {form.rabatt_prozent > 0 ? `(${form.rabatt_prozent}%)` : ""}</span>
                                <span className="tabular-nums">- € {eur(rabattWert)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Netto</span>
                              <span className="font-medium tabular-nums">€ {eur(nettoSumme)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">MwSt ({form.mwst_satz}%)</span>
                              <span className="tabular-nums">€ {eur(mwstBetrag)}</span>
                            </div>
                            {exemptBrutto !== 0 && (
                              <div className="flex justify-between text-red-600">
                                <span>Anzahlungs-Abzug (brutto, MwSt-frei)</span>
                                <span className="font-medium tabular-nums">€ {eur(exemptBrutto)}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t pt-1.5 text-lg font-bold">
                              <span>{exemptBrutto < 0 ? "Zu zahlen" : "Brutto"}</span>
                              <span className="tabular-nums">€ {eur(bruttoSumme)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  /* ══ BREIT: KingBill-Tabelle ══════════════════════════════ */
                  const tabellenZeile = (r: PosRow) => (
                    <TableRow
                      key={r.idx}
                      data-testid="pos-row"
                      className={
                        r.isExempt ? "bg-rose-50/60 border-l-4 border-l-rose-300"
                          : r.istSumme ? "bg-primary/[0.04] font-medium"
                          : r.istDetail ? `bg-muted/40 border-l-4 border-l-primary/20 ${r.sichtbar ? "" : "text-muted-foreground"}`
                          : ""
                      }
                    >
                      <TableCell className="text-muted-foreground text-xs align-top">
                        <div className="flex items-center gap-1">
                          <span>{r.idx + 1}</span>
                          {r.isExempt && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-rose-300 text-rose-700 bg-white">
                              MwSt-frei
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={r.istDetail ? "pl-6" : undefined}>
                        {r.istSumme && (
                          <span className="mb-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Sammelzeile — Betrag des Aufbaus
                          </span>
                        )}
                        {r.istDetail && (
                          <span className={`mb-1 inline-block text-[10px] uppercase tracking-wide ${r.sichtbar ? "text-primary" : "text-muted-foreground"}`}>
                            {r.sichtbar ? "Detail — Kunde sieht das" : "Detail — nur intern"}
                          </span>
                        )}
                        {r.beschreibungFeld}
                      </TableCell>
                      <TableCell>{r.mengeFeld}</TableCell>
                      <TableCell>{r.einheitFeld}</TableCell>
                      {!hidePrices && (
                        <>
                          <TableCell>{r.preisFeld}</TableCell>
                          <TableCell>{r.rabattFeld}</TableCell>
                          <TableCell className="text-right font-medium">
                            {r.istDetail ? <span className="text-muted-foreground">–</span> : <>€ {eur(r.item.gesamtpreis)}</>}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          {r.eyeButton}
                          {r.kalkButton}
                          {r.moveButtons}
                          {r.deleteButton}
                        </div>
                      </TableCell>
                    </TableRow>
                  );

                  return (
                /* Engere Zellen als shadcn-Standard (p-4): die acht Spalten
                   sparen so ~190 px Innenabstand — dadurch bleiben Mengen-,
                   Preis- und Summenfeld auch neben der Live-Vorschau lesbar. */
                <Table className="[&_td]:px-2 [&_th]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Pos.</TableHead>
                      <TableHead className="min-w-[220px]">Beschreibung</TableHead>
                      <TableHead className="w-28">Menge</TableHead>
                      <TableHead className="w-24">Einheit</TableHead>
                      {!hidePrices && (
                        <>
                          <TableHead className="w-32">Preis (netto) €</TableHead>
                          <TableHead className="w-20">Rabatt %</TableHead>
                          {/* nowrap: sonst bricht die Kopfzeile um, sobald die
                              Aktionsspalte (mit Auge-Schalter) breiter wird. */}
                          <TableHead className="w-28 text-right whitespace-nowrap">Gesamt (netto) €</TableHead>
                        </>
                      )}
                      {/* 5 Icon-Buttons: Auge, Kalkulation, hoch, runter, löschen */}
                      <TableHead className="w-[168px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocks.map((b, bi) => {
                      if (b.art === "einzel") return tabellenZeile(b.row);
                      const g = gruppenInfo(b);
                      return (
                        <Fragment key={`grp-${bi}-${b.gruppe}`}>
                          {/* Gruppen-Kopfzeile: Aufbauname + Zwischensumme +
                              Auf-/Zuklappen + "alle Details einblenden". */}
                          <TableRow data-testid="pos-gruppe" className="bg-primary/5 hover:bg-primary/5 border-t-2 border-t-primary/30">
                            <TableCell colSpan={hidePrices ? 5 : 8} className="py-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Name + Pfeil + Badge sind gemeinsam klickbar —
                                    vorher reagierte nur der kleine Pfeil. */}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={g.offen}
                                  onClick={() => toggleGruppe(b.gruppe)}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGruppe(b.gruppe); } }}
                                  title={g.offen ? "Unterpositionen einklappen" : "Unterpositionen anzeigen"}
                                  className="flex cursor-pointer items-center gap-2 rounded-md hover:bg-primary/10"
                                >
                                  {gruppenToggle(b.gruppe, g.offen)}
                                  <Layers className="w-4 h-4 text-primary shrink-0" />
                                  <span className="font-semibold min-w-0 break-words">{b.gruppe}</span>
                                  {g.details.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] bg-white shrink-0">
                                      {g.details.length} Unterposition{g.details.length === 1 ? "" : "en"} · {g.sichtbareDetails} im Angebot
                                    </Badge>
                                  )}
                                </span>
                                <div className="ml-auto flex items-center gap-3 shrink-0">
                                  {g.details.length > 0 && !isLocked && (
                                    <div className="flex items-center gap-1.5">
                                      <Label htmlFor={`grp-sw-w-${bi}`} className="text-[11px] text-muted-foreground cursor-pointer">
                                        Alle Details im Kundendokument
                                      </Label>
                                      <Switch id={`grp-sw-w-${bi}`} data-testid="gruppe-alle-details"
                                        checked={g.sichtbareDetails === g.details.length}
                                        onCheckedChange={(v) => setGruppenDetailsSichtbar(b.gruppe, v)} />
                                    </div>
                                  )}
                                  {!hidePrices && (
                                    <span className="font-bold tabular-nums">€ {eur(g.zwischensumme)}</span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                          {b.rows.filter(r => !r.istDetail || g.offen).map(tabellenZeile)}
                        </Fragment>
                      );
                    })}
                    {!isLocked && (
                      <TableRow>
                        <TableCell colSpan={hidePrices ? 5 : 8} className="py-1">
                          <Button onClick={addItem} variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                            <Plus className="w-3.5 h-3.5" />
                            Position hinzufügen
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {/* Summenfuß entfällt beim preislosen Lieferschein komplett */}
                  {!hidePrices && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">Positionen Netto</TableCell>
                      <TableCell className="text-right font-medium">€ {eur(positionenNetto)}</TableCell>
                      <TableCell />
                    </TableRow>
                    {rabattWert > 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-right text-orange-600">
                          Rabatt {form.rabatt_prozent > 0 ? `(${form.rabatt_prozent}%)` : ""}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">- € {eur(rabattWert)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">Netto</TableCell>
                      <TableCell className="text-right font-medium">€ {eur(nettoSumme)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">MwSt ({form.mwst_satz}%)</TableCell>
                      <TableCell className="text-right">€ {eur(mwstBetrag)}</TableCell>
                      <TableCell />
                    </TableRow>
                    {exemptBrutto !== 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-right text-red-600">
                          Anzahlungs-Abzug (brutto, MwSt-frei)
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          € {eur(exemptBrutto)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={6} className="text-right font-bold text-lg">
                        {exemptBrutto < 0 ? "Zu zahlen" : "Brutto"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg">€ {eur(bruttoSumme)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                  )}
                </Table>
                  );
                })()}
              </div>
              </fieldset>
            </CardContent>
          </Card>

          {/* ── Verdienst (intern) ──────────────────────────────────────────
              Was bleibt an diesem Angebot hängen? Nur für Administratoren und
              ausschließlich hier im Editor — die Zahlen werden weder an die
              Live-Vorschau noch an den PDF-Generator übergeben. */}
          {zeigeVerdienst && (
            <Card className="kb-panel border-dashed" data-testid="verdienst-intern">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Verdienst (intern)</CardTitle>
                  <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wide">
                    <EyeOff className="h-3 w-3" />
                    Nicht im Kundendokument
                  </Badge>
                </div>
                <CardDescription>
                  Selbstkosten laut Kalkulation gegen den tatsächlichen Belegerlös —
                  Rabatte und Preisanpassungen in diesem Beleg sind bereits berücksichtigt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Erlös netto</div>
                    <div className="text-base font-semibold tabular-nums">€ {eur(nettoSumme)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Selbstkosten</div>
                    <div className="text-base font-semibold tabular-nums">€ {eur(selbstkosten)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Deckungsbeitrag</div>
                    <div
                      data-testid="verdienst-db"
                      className={`text-base font-bold tabular-nums ${deckungsbeitrag < 0 ? "text-destructive" : "text-green-700"}`}
                    >
                      € {eur(deckungsbeitrag)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Marge</div>
                    <div
                      data-testid="verdienst-marge"
                      className={`text-base font-bold tabular-nums ${
                        margeFarbe === "gruen" ? "text-green-700"
                          : margeFarbe === "gelb" ? "text-amber-600"
                            : "text-destructive"
                      }`}
                    >
                      {nettoSumme > 0 ? `${eur(margeProzent)} %` : "—"}
                    </div>
                  </div>
                </div>
                {positionenOhneKosten > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Hinweis: {positionenOhneKosten} Position(en) mit Betrag haben keine
                    hinterlegten Kosten (z.B. von Hand ergänzt) — sie zählen nur auf der
                    Erlösseite, der Deckungsbeitrag ist insoweit optimistisch.
                  </p>
                )}
                {margeUnterWarnschwelle && (
                  <div
                    role="alert"
                    data-testid="verdienst-warnung"
                    className="flex items-start gap-2 rounded border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-bold">
                        {nettoSumme <= 0
                          ? `⚠ Verlust: € ${eur(selbstkosten)} Kosten, aber kein Erlös`
                          : deckungsbeitrag < 0
                            ? `⚠ Verlust: Deckungsbeitrag € ${eur(deckungsbeitrag)} — die Kosten übersteigen den Erlös`
                            : `⚠ Marge ${eur(margeProzent)} % liegt unter der Warnschwelle von ${eur(warnMargeProzent)} %`}
                      </div>
                      <div className="mt-0.5 text-xs">
                        Preise anpassen oder die Kalkulation überarbeiten, bevor das Angebot rausgeht.
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notizen */}
          <Card className={`kb-panel ${isLocked ? "opacity-80" : ""}`}>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notizen}
                onChange={(e) => updateField("notizen", e.target.value)}
                disabled={isLocked}
                placeholder="Zusätzliche Anmerkungen..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Archivierte PDFs */}
          {!isNew && storedPdfs.length > 0 && (
            <Card className="kb-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Archivierte PDFs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {storedPdfs.map((pdf) => (
                    <div key={pdf.name} className="flex items-center justify-between p-2 rounded-md border">
                      <span className="text-sm font-mono">{pdf.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadStoredPdf(pdf.name)} className="gap-1">
                        <FileDown className="w-4 h-4" />
                        Öffnen
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleBackNav}>
              {isLocked ? "Zurück" : "Abbrechen"}
            </Button>
            {canCancel && (
              <Button variant="destructive" onClick={() => setStornoDialogOpen(true)}>Stornieren</Button>
            )}
            {form.status === "storniert" && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
                try {
                  const { generateStornoPdf } = await import("@/lib/pdfGenerator");
                  const logoUri = await loadInvoiceLogo();
                  const { data: inv } = await supabase.from("invoices").select("storno_nummer, storno_datum, storno_grund").eq("id", invoiceId).single();
                  if (!inv?.storno_nummer) return;
                  const { data: bankSettings3 } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
                  const bank3 = { kontoinhaber: "", iban: "", bic: "" };
                  bankSettings3?.forEach((s: any) => {
                    if (s.key === "bank_kontoinhaber") bank3.kontoinhaber = s.value;
                    if (s.key === "bank_iban") bank3.iban = s.value;
                    if (s.key === "bank_bic") bank3.bic = s.value;
                  });
                  const blob = generateStornoPdf(
                    { nummer: form.nummer, kunde_name: form.kunde_name, brutto_summe: bruttoSumme, datum: form.datum },
                    inv.storno_nummer, inv.storno_datum || form.datum, inv.storno_grund || "",
                    bank3, logoUri, invoiceLayout
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `Storno_${inv.storno_nummer}.pdf`; a.click(); URL.revokeObjectURL(url);
                } catch (e) { console.error(e); }
              }}>
                <Download className="w-4 h-4" />
                Storno-Beleg
              </Button>
            )}
            {isLocked && form.typ === "angebot" && form.status !== "verrechnet" && (
              <Button variant="destructive" onClick={async () => {
                if (!confirm("Angebot wirklich löschen?")) return;
                await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
                await supabase.from("invoices").delete().eq("id", invoiceId);
                toast({ title: "Angebot gelöscht" });
                navigate("/invoices");
              }}>Löschen</Button>
            )}
            {isLocked ? (
              <>
                <Button onClick={handleDownloadPdf} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  PDF herunterladen
                </Button>
                <Button onClick={handlePrintPdf} variant="outline" className="gap-2">
                  <Printer className="w-4 h-4" />
                  Drucken
                </Button>
              </>
            ) : (
              <>
                {!isNew && invoiceId && (
                  <>
                    <Button onClick={handleDownloadPdf} variant="outline" className="gap-2">
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                    <Button onClick={handlePrintPdf} variant="outline" className="gap-2">
                      <Printer className="w-4 h-4" />
                      Drucken
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={async () => { const ok = await handleSave(); if (ok) toast({ title: "Gespeichert" }); }} disabled={saving} className="gap-2">
                  {saving ? "Speichert..." : "Speichern"}
                </Button>
                <Button onClick={handlePreview} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Vorschau
                </Button>
              </>
            )}
          </div>
        </div>
        {/* Permanente Live-Vorschau (KingBill-Stil) — nur xl+, sonst Vorschau-Dialog */}
        <InvoiceLivePreview
          formData={previewFormData}
          items={previewItems}
          netto={hidePrices ? undefined : nettoSumme}
          brutto={hidePrices ? undefined : bruttoSumme}
          fileName={form.nummer || typLabel}
        />
        </div>

        {/* Template Picker Dialog — Suche + Filter + Multi-Select */}
        <Dialog open={templateDialogOpen} onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) setTemplateSearch("");
          if (!open) setTemplateFilter("alle");
          if (!open) setSelectedTemplateIds([]);
          if (!open) setAddedFromDialog([]);
          if (!open) setTemplateMengen({});
        }}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Materialien einfügen</DialogTitle>
            </DialogHeader>
            <div className="flex gap-3 mb-3">
              <Input
                placeholder="Suchen..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="flex-1"
              />
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alle Gruppen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Gruppen</SelectItem>
                  {Object.keys(groupedTemplates).sort().map(k => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 border rounded-md p-2">
              {(() => {
                const s = templateSearch.toLowerCase();
                const filtered = templates.filter(t => {
                  const matchSearch = !s || t.name.toLowerCase().includes(s) || (t.beschreibung && t.beschreibung.toLowerCase().includes(s)) || ((t as any).kurzbezeichnung && (t as any).kurzbezeichnung.toLowerCase().includes(s));
                  const matchFilter = templateFilter === "alle" || t.kategorie === templateFilter;
                  return matchSearch && matchFilter;
                });
                if (filtered.length === 0) return <p className="text-center text-muted-foreground py-8">Keine Materialien gefunden</p>;

                const favoriten = filtered.filter(t => t.ist_favorit);
                const restliche = filtered.filter(t => !t.ist_favorit);

                const toggleFavorit = async (e: React.MouseEvent, templateId: string) => {
                  e.stopPropagation();
                  const tmpl = templates.find(t => t.id === templateId);
                  if (!tmpl) return;
                  const newVal = !tmpl.ist_favorit;
                  await supabase.from("invoice_templates").update({ ist_favorit: newVal } as any).eq("id", templateId);
                  setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, ist_favorit: newVal } : t));
                };

                const renderItem = (t: TemplateItem) => {
                  const isSelected = selectedTemplateIds.includes(t.id);
                  const netto = Number((t as any).netto_preis) || t.einzelpreis;
                  return (
                    <div key={t.id} className={`flex items-center gap-2 p-2 rounded hover:bg-accent text-sm ${isSelected ? "bg-primary/10" : ""}`}>
                      <button onClick={(e) => toggleFavorit(e, t.id)} className="shrink-0 p-0.5 hover:scale-110 transition-transform" title={t.ist_favorit ? "Favorit entfernen" : "Als Favorit markieren"}>
                        <Star className={`w-3.5 h-3.5 ${t.ist_favorit ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`} />
                      </button>
                      <input type="checkbox" checked={isSelected} onChange={() => {
                        setSelectedTemplateIds(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                        if (!isSelected) setTemplateMengen(prev => ({ ...prev, [t.id]: 1 }));
                      }} className="rounded cursor-pointer" />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                        setSelectedTemplateIds(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                        if (!isSelected) setTemplateMengen(prev => ({ ...prev, [t.id]: 1 }));
                      }}>
                        <p className="font-medium truncate flex items-center gap-1.5">
                          {(t as any).kurzbezeichnung || t.name}
                          {(t as any).ist_set && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/40 text-primary shrink-0">
                              Set
                            </Badge>
                          )}
                        </p>
                        {(t as any).langbezeichnung && <p className="text-xs text-muted-foreground truncate">{(t as any).langbezeichnung}</p>}
                      </div>
                      {isSelected && (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={rohOderZahl(`tmpl:${t.id}`, templateMengen[t.id] || 1)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setRoh(`tmpl:${t.id}`, e.target.value);
                            const n = parseDecimal(e.target.value);
                            if (n !== null && n > 0) setTemplateMengen(prev => ({ ...prev, [t.id]: round3(n) }));
                          }}
                          onBlur={() => {
                            const n = round3(toNumber(rohTexte[`tmpl:${t.id}`], templateMengen[t.id] || 1));
                            setTemplateMengen(prev => ({ ...prev, [t.id]: n > 0 ? n : 1 }));
                            clearRoh(`tmpl:${t.id}`);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 text-right text-xs h-7"
                        />
                      )}
                      <span className="text-xs text-muted-foreground shrink-0 w-12 text-center">{t.einheit}</span>
                      <span className="text-sm font-mono shrink-0 w-20 text-right">{netto > 0 ? `€ ${eur(netto)}` : "–"}</span>
                    </div>
                  );
                };

                return (
                  <>
                    {favoriten.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pt-1">⭐ Häufig verwendet</p>
                        {favoriten.map(renderItem)}
                        {restliche.length > 0 && <hr className="my-2 border-border" />}
                      </>
                    )}
                    {restliche.map(renderItem)}
                  </>
                );
              })()}
            </div>
            {addedFromDialog.length > 0 && (
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Bereits hinzugefügt ({addedFromDialog.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {addedFromDialog.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5">
                      {a.menge > 1 ? `${a.menge} ${a.einheit}` : ""} {a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">{selectedTemplateIds.length} ausgewählt</span>
              <div className="flex gap-2">
                {/* Nach dem Hinzufügen bleibt der Dialog offen (man fügt oft
                    mehrere Artikel ein). Dann darf der Knopf nicht mehr
                    „Abbrechen" heißen — das liest sich, als würde das schon
                    Eingefügte wieder verworfen. */}
                <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                  {addedFromDialog.length > 0 ? "Fertig" : "Abbrechen"}
                </Button>
                <Button disabled={selectedTemplateIds.length === 0} onClick={() => {
                  const selected = templates.filter(t => selectedTemplateIds.includes(t.id));
                  const newItems = selected.map(t => {
                    const menge = templateMengen[t.id] || 1;
                    // Kalkulierte Materialien: Snapshot + Katalog-Verknüpfung übernehmen,
                    // damit Aufschläge im Angebot anpassbar bleiben und "Preise aktualisieren" greift.
                    const isKalk = !!(t as any).ist_kalkuliert;
                    const kalk = isKalk ? {
                      ek_preis: Number((t as any).ek_netto) || 0,
                      verschnitt_prozent: Number((t as any).verschnitt_prozent) || 0,
                      aufschlag_prozent: Number((t as any).aufschlag_prozent) || 0,
                      befestigung_preis: Number((t as any).befestigung_preis) || 0,
                      sonstiges_preis: Number((t as any).sonstiges_preis) || 0,
                      arbeitszeit_minuten: Number((t as any).arbeitszeit_minuten) || 0,
                      stundensatz: Number((t as any).stundensatz) || 52,
                    } : null;
                    const netto = round2(kalk
                      ? calcEinzelpreis({ ...kalk, aufschlag_prozent: docAufschlagOverride ?? kalk.aufschlag_prozent })
                      : (Number((t as any).vk_netto ?? (t as any).netto_preis) || t.einzelpreis));
                    return {
                      position: 1,
                      beschreibung: (t as any).kurzbezeichnung || t.name || t.beschreibung,
                      kurztext: (t as any).kurzbezeichnung || t.name,
                      langtext: (t as any).langbezeichnung || t.beschreibung || "",
                      menge: round3(menge),
                      einheit: t.einheit,
                      einzelpreis: netto,
                      gesamtpreis: round2(netto * round3(menge)),
                      produktnummer: (t as any).produktnummer || "",
                      ist_kalkuliert: isKalk,
                      kalkulation_template_id: isKalk ? t.id : null,
                      ...(kalk || {}),
                    } as InvoiceItem;
                  });
                  setItemsDirty(prev => mergeItems(prev, newItems));
                  // Track was hinzugefügt wurde
                  setAddedFromDialog(prev => [...prev, ...newItems.map(i => ({ name: i.beschreibung, menge: i.menge, einheit: i.einheit }))]);
                  // Dialog bleibt offen — nur Auswahl zurücksetzen
                  setSelectedTemplateIds([]);
                  setTemplateMengen({});
                  toast({ title: `${newItems.length} Positionen hinzugefügt` });
                }} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {selectedTemplateIds.length > 0 ? `${selectedTemplateIds.length} hinzufügen` : "Hinzufügen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* KingBill: „Änderungen speichern?" beim Verlassen mit ungespeicherten
            Änderungen — [Zurück]=abbrechen, [Nein]=verwerfen+navigieren,
            [Speichern & Schließen]=speichern+navigieren */}
        <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Änderungen speichern?</DialogTitle>
              <DialogDescription>
                Dieser Beleg enthält ungespeicherte Änderungen. Sollen die Änderungen vor dem Verlassen gespeichert werden?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <KBButton label="Zurück" onClick={() => setLeaveDialogOpen(false)} />
              <KBButton
                label="Nein"
                onClick={() => { setLeaveDialogOpen(false); navigate("/invoices"); }}
              />
              <KBButton
                icon={CheckCircle2}
                variant="green"
                label={saving ? "Speichert..." : "Speichern & Schließen"}
                disabled={saving}
                onClick={async () => {
                  const ok = await handleSave();
                  if (ok) {
                    setLeaveDialogOpen(false);
                    toast({ title: "Gespeichert" });
                    navigate("/invoices");
                  }
                }}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Kalkulation öffnen, obwohl der Beleg ungespeicherte Änderungen hat */}
        <Dialog open={kalkVerlassenOpen} onOpenChange={setKalkVerlassenOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Zur Kalkulation wechseln?</DialogTitle>
              <DialogDescription>
                Dieser Beleg enthält ungespeicherte Änderungen. Sollen sie vor dem Wechsel
                in die Auftragskalkulation gespeichert werden?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <KBButton label="Zurück" onClick={() => setKalkVerlassenOpen(false)} />
              <KBButton
                label="Ohne Speichern"
                onClick={() => { setKalkVerlassenOpen(false); navigate(`/auftragskalkulation/${kalkulationId}`); }}
              />
              <KBButton
                icon={CheckCircle2}
                variant="green"
                label={saving ? "Speichert..." : "Speichern & wechseln"}
                disabled={saving}
                onClick={async () => {
                  const ok = await handleSave();
                  if (ok) {
                    setKalkVerlassenOpen(false);
                    navigate(`/auftragskalkulation/${kalkulationId}`);
                  }
                }}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Positionen aus der Kalkulation neu übernehmen — ersetzt Positionen,
            deshalb vorher deutlich warnen. */}
        <AlertDialog open={kalkErsetzenOpen} onOpenChange={setKalkErsetzenOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Positionen aus der Kalkulation neu übernehmen?</AlertDialogTitle>
              <AlertDialogDescription>
                Alle Positionen aus der Kalkulation werden ersetzt. Von Hand ergänzte
                Positionen bleiben erhalten. Die Einstellung, welche Unterpositionen der
                Kunde sieht, wird — soweit die Positionen gleich heißen — mitgenommen.
                Anschließend speichern nicht vergessen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={kalkErsetzenLaeuft}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                data-testid="kalk-ersetzen-bestaetigen"
                disabled={kalkErsetzenLaeuft}
                onClick={(e) => { e.preventDefault(); void positionenNeuUebernehmen(); }}
              >
                {kalkErsetzenLaeuft ? "Wird übernommen …" : "Positionen ersetzen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* PDF Preview Dialog — works both before and after saving */}
        <InvoicePdfPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onSave={handleSaveFromPreview}
          onSavedClose={() => navigate("/invoices")}
          saving={saving}
          saved={previewSaved}
          fileName={form.nummer || typLabel}
          formData={previewFormData}
          items={previewItems}
        />

        {/* Gutschrift-Verrechnungs-Dialog: setzt Status auf "verrechnet"
            und verknüpft optional mit einer offenen Rechnung. */}
        <Dialog open={verrechnungDialogOpen} onOpenChange={setVerrechnungDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Gutschrift als verrechnet markieren</DialogTitle>
              <DialogDescription>
                Bestätigt, dass die Gutschrift {form.nummer} ausgezahlt oder mit einer Rechnung verrechnet wurde.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="verrechnung-datum">Verrechnungs-Datum</Label>
                <Input
                  id="verrechnung-datum"
                  type="date"
                  value={verrechnungDate}
                  onChange={(e) => setVerrechnungDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verrechnung-ziel">Mit Rechnung verrechnen (optional)</Label>
                <Select value={verrechnungZielInvoice} onValueChange={setVerrechnungZielInvoice}>
                  <SelectTrigger id="verrechnung-ziel">
                    <SelectValue placeholder="Auszahlung ohne Verknüpfung" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Auszahlung (keine Rechnungs-Verknüpfung) —</SelectItem>
                    {verrechnungZielOptions.map((o) => {
                      const rest = Math.max(0, o.brutto_summe - o.bezahlt_betrag);
                      return (
                        <SelectItem key={o.id} value={o.id}>
                          {o.nummer} — offen: €&nbsp;{eur(rest)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {verrechnungZielInvoice !== "_none" && (
                  <p className="text-[11px] text-muted-foreground">
                    Der Gutschrift-Betrag wird automatisch dem bezahlten Betrag der Rechnung gutgeschrieben (gedeckelt auf den Restbetrag).
                  </p>
                )}
                {form.customer_id && verrechnungZielOptions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Keine offenen Rechnungen für diesen Kunden — wähle „Auszahlung" oder lasse das Feld leer.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerrechnungDialogOpen(false)} disabled={verrechnungSaving}>
                Abbrechen
              </Button>
              <Button onClick={handleVerrechnungSave} disabled={verrechnungSaving || !verrechnungDate}>
                {verrechnungSaving ? "Speichert..." : "Verrechnen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preise anpassen (Rabatt/Aufschlag + KI-Verteilung) */}
        {!hidePrices && (
          <PriceAdjustDialog
            open={priceAdjustOpen}
            onClose={() => setPriceAdjustOpen(false)}
            lines={priceAdjustLines}
            mwstSatz={(form as any).reverse_charge ? 0 : Number(form.mwst_satz) || 0}
            /* Ohne den Global-Rabatt zeigte der Dialog eine zu hohe
               Belegsumme und einen falschen Bruttobetrag an. */
            rabattProzent={Number(form.rabatt_prozent) || 0}
            rabattBetrag={Number(form.rabatt_betrag) || 0}
            exemptBrutto={exemptBrutto}
            onApply={applyPriceAdjust}
          />
        )}

        {/* Import Materials Dialog */}
        <ImportMaterialsDialog
          open={importMaterialsOpen}
          onClose={() => setImportMaterialsOpen(false)}
          projectId={form.project_id}
          onImport={(importedItems) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: round3(item.menge),
              einheit: item.einheit,
              einzelpreis: round2(item.einzelpreis),
              gesamtpreis: round2(round3(item.menge) * round2(item.einzelpreis)),
            }));
            setItemsDirty(prev => mergeItems(prev, newItems));
            setImportMaterialsOpen(false);
            toast({ title: "Materialien importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Import Disturbance Dialog */}
        <ImportDisturbanceDialog
          open={importDisturbanceOpen}
          onClose={() => setImportDisturbanceOpen(false)}
          onImport={(importedItems, kundeData) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: round3(item.menge),
              einheit: item.einheit,
              einzelpreis: round2(item.einzelpreis),
              gesamtpreis: round2(round3(item.menge) * round2(item.einzelpreis)),
            }));
            setItemsDirty(prev => mergeItems(prev, newItems));
            // Fill customer data if empty
            if (kundeData && !form.kunde_name) {
              setForm(prev => ({
                ...prev,
                kunde_name: kundeData.kunde_name || prev.kunde_name,
                kunde_adresse: kundeData.kunde_adresse || prev.kunde_adresse,
                kunde_telefon: kundeData.kunde_telefon || prev.kunde_telefon,
                kunde_email: kundeData.kunde_email || prev.kunde_email,
              }));
            }
            setImportDisturbanceOpen(false);
            toast({ title: "Regiebericht importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Import Time Dialog */}
        {/* Arbeitszeit-Import läuft ausschließlich über <ImportFromProjectDialog
            mode="zeit"/> (weiter unten). Der frühere zweite ImportTimeDialog war
            an dieselbe Variable gebunden und öffnete sich doppelt — entfernt. */}

        {/* Kunden-Bearbeiten Dialog */}
        <CustomerEditDialog
          open={customerEditOpen}
          onClose={() => setCustomerEditOpen(false)}
          customerId={form.customer_id}
          onSaved={(cust) => {
            // Aktualisierte Kundendaten in die Rechnung/Angebot übernehmen
            setForm(prev => ({
              ...prev,
              kunde_name: cust.name,
              kunde_anrede: cust.anrede || "",
              kunde_titel: cust.titel || "",
              kunde_adresse: cust.adresse || "",
              kunde_plz: cust.plz || "",
              kunde_ort: cust.ort || "",
              kunde_land: cust.land || "Österreich",
              kunde_email: cust.email || "",
              kunde_telefon: cust.telefon || "",
              kunde_uid: cust.uid_nummer || "",
              kundennummer: cust.kundennummer || "",
            } as any));
          }}
        />

        {/* Import from Regiebericht Dialog */}
        <ImportDisturbanceToInvoiceDialog
          open={importRegieOpen}
          onClose={() => setImportRegieOpen(false)}
          preselectedId={searchParams.get("disturbance_id")}
          onImport={(importedItems, kundeData) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: round3(item.menge),
              einheit: item.einheit,
              einzelpreis: round2(item.einzelpreis),
              gesamtpreis: round2(round3(item.menge) * round2(item.einzelpreis)),
            }));
            setItemsDirty(prev => mergeItems(prev, newItems));
            if (kundeData && !form.kunde_name) {
              setForm(prev => ({
                ...prev,
                kunde_name: (kundeData as any).kunde_name || prev.kunde_name,
                kunde_adresse: (kundeData as any).kunde_adresse || prev.kunde_adresse,
                kunde_plz: (kundeData as any).kunde_plz || prev.kunde_plz,
                kunde_ort: (kundeData as any).kunde_ort || prev.kunde_ort,
                kunde_land: (kundeData as any).kunde_land || prev.kunde_land,
                kunde_email: (kundeData as any).kunde_email || prev.kunde_email,
                kunde_telefon: (kundeData as any).kunde_telefon || prev.kunde_telefon,
                kunde_uid: (kundeData as any).kunde_uid || prev.kunde_uid,
                customer_id: (kundeData as any).customer_id || prev.customer_id,
              }));
            }
            setImportRegieOpen(false);
            toast({ title: "Aus Regiebericht importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Anzahlungsrechnung-Dialog: Prozent ODER fester Betrag */}
        <Dialog open={anzahlungDialogOpen} onOpenChange={setAnzahlungDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Anzahlungsrechnung erstellen</DialogTitle>
            </DialogHeader>
            {(() => {
              const basisNetto = nettoSumme;
              const basisBrutto = bruttoSumme;
              const restNetto = Math.max(0, basisNetto - bestehendeAnzahlungenNetto);
              // parseDecimal: "12,5" ist eine gültige Prozentangabe.
              const prozentNum = parseDecimal(anzahlungProzentInput);
              const betragNum = parseDecimal(anzahlungBetragInput);
              const anzNetto = round2(anzahlungMode === "prozent"
                ? (prozentNum === null ? 0 : basisNetto * prozentNum / 100)
                : (betragNum === null ? 0 : betragNum));
              const anzBrutto = anzNetto * (1 + (form.mwst_satz / 100));
              // Neue Anzahlung darf den noch offenen Rest (basisNetto abzüglich
              // bereits ausgestellter Anzahlungen) nicht überschreiten.
              const valid = anzNetto > 0 && anzNetto <= restNetto + 0.01;
              return (
                <>
                  <div className="space-y-4 py-2">
                    <div className="rounded border bg-muted/40 p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gesamtbetrag (Basis):</span>
                        <span className="font-mono font-medium">€ {eur(basisNetto)} netto</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                        <span>inkl. {form.mwst_satz}% MwSt.:</span>
                        <span className="font-mono">€ {eur(basisBrutto)} brutto</span>
                      </div>
                      {bestehendeAnzahlungenNetto > 0 && (
                        <>
                          <div className="flex justify-between text-xs text-orange-600 mt-1 pt-1 border-t">
                            <span>bereits angezahlt (netto):</span>
                            <span className="font-mono">- € {eur(bestehendeAnzahlungenNetto)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-medium mt-0.5">
                            <span>Rest verfügbar (netto):</span>
                            <span className="font-mono">€ {eur(restNetto)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Prozentsatz</Label>
                        <div className="flex items-center gap-1 mt-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={anzahlungProzentInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAnzahlungProzentInput(v);
                              setAnzahlungMode("prozent");
                              const p = parseDecimal(v);
                              if (p !== null && basisNetto > 0) {
                                setAnzahlungBetragInput(formatForInput(round2(basisNetto * p / 100), 2));
                              }
                            }}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div>
                        <Label>Fester Betrag (netto)</Label>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-sm text-muted-foreground">€</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={anzahlungBetragInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAnzahlungBetragInput(v);
                              setAnzahlungMode("betrag");
                              const b = parseDecimal(v);
                              if (b !== null && basisNetto > 0) {
                                setAnzahlungProzentInput(formatForInput(round2((b / basisNetto) * 100), 2));
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
                      <div className="flex justify-between font-medium">
                        <span>Anzahlung:</span>
                        <span className="font-mono">€ {eur(anzNetto)} netto</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                        <span>inkl. {form.mwst_satz}% MwSt.:</span>
                        <span className="font-mono">€ {eur(anzBrutto)} brutto</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Bei der Schlussrechnung wird diese Anzahlung automatisch als Abzug berücksichtigt.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAnzahlungDialogOpen(false)}>Abbrechen</Button>
                    <Button
                      disabled={!valid}
                      onClick={() => {
                        if (!valid) {
                          toast({ variant: "destructive", title: "Ungültiger Anzahlungsbetrag", description: `Der Betrag muss > 0 und ≤ dem noch offenen Rest (€ ${eur(restNetto)}) sein.` });
                          return;
                        }
                        setAnzahlungDialogOpen(false);
                        if (anzahlungMode === "betrag") {
                          handleConvertTo("anzahlungsrechnung", { anzahlung_betrag: round2(anzNetto) });
                        } else {
                          handleConvertTo("anzahlungsrechnung", { anzahlung_prozent: toNumber(anzahlungProzentInput, 0) });
                        }
                      }}
                    >
                      Anzahlungsrechnung erstellen
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Import from Offer Dialog */}
        <ImportFromOfferDialog
          open={importOfferOpen}
          onClose={() => setImportOfferOpen(false)}
          projectId={form.project_id}
          onImport={(importedItems, offer) => {
            // ALLE Positionsdaten übernehmen (Rabatt, Lang-/Kurztext,
            // MwSt-Befreiung, Produktnummer) — nicht nur Menge×Preis.
            const newItems = importedItems.map((item: any, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              kurztext: item.kurztext || item.beschreibung,
              langtext: item.langtext || "",
              menge: round3(item.menge),
              einheit: item.einheit,
              einzelpreis: round2(item.einzelpreis),
              rabatt_prozent: item.rabatt_prozent || 0,
              gesamtpreis: round2(item.gesamtpreis ?? (item.menge * item.einzelpreis)),
              produktnummer: item.produktnummer || "",
              mwst_exempt: !!item.mwst_exempt,
            }));
            setItemsDirty(prev => mergeItems(prev, newItems));
            // Quell-Angebot verknüpfen → wird beim Speichern als Rechnung auf
            // "verrechnet" gesetzt. Parent nur setzen, wenn noch keiner da ist
            // (kein Überschreiben bei Import aus mehreren Quellen).
            setFromAngebotId(offer.id);
            setForm(prev => ({
              ...prev,
              parent_invoice_id: (prev as any).parent_invoice_id || offer.id,
              ...(!prev.kunde_name ? {
                kunde_name: (offer as any).kunde_name || prev.kunde_name,
                kunde_adresse: (offer as any).kunde_adresse || prev.kunde_adresse,
                kunde_plz: (offer as any).kunde_plz || prev.kunde_plz,
                kunde_ort: (offer as any).kunde_ort || prev.kunde_ort,
                kunde_land: (offer as any).kunde_land || prev.kunde_land,
                kunde_email: (offer as any).kunde_email || prev.kunde_email,
                kunde_telefon: (offer as any).kunde_telefon || prev.kunde_telefon,
                kunde_uid: (offer as any).kunde_uid || prev.kunde_uid,
                customer_id: (offer as any).customer_id || prev.customer_id,
              } : {}),
            }));
            setImportOfferOpen(false);
            toast({ title: "Aus Angebot importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Import Arbeitszeiten aus Projekt */}
        <ImportFromProjectDialog
          open={importTimeOpen}
          onClose={() => setImportTimeOpen(false)}
          projectId={form.project_id || null}
          customerId={form.customer_id || null}
          mode="zeit"
          onImport={(importedItems) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: round3(item.menge),
              einheit: item.einheit,
              einzelpreis: round2(item.einzelpreis),
              gesamtpreis: round2(round3(item.menge) * round2(item.einzelpreis)),
            }));
            setItemsDirty(prev => mergeItems(prev, newItems));
            setImportTimeOpen(false);
            toast({
              title: "Arbeitszeiten importiert",
              description: `${newItems.length} Position${newItems.length === 1 ? "" : "en"} hinzugefügt`,
            });
          }}
        />

        {/* Storno Dialog — EINZIGER Storno-Weg, führt durch handleCancel().
            Vorher hatte dieser Dialog eine eigene, abweichende Storno-Logik
            (ließ bezahlt_betrag stehen) — daher gab es je nach Knopf zwei
            verschiedene Ergebnisse. */}
        <Dialog open={stornoDialogOpen} onOpenChange={setStornoDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{typLabel} stornieren</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {typLabel} {form.nummer} wird unwiderruflich storniert. Eine Storno-Bestätigung wird erstellt.
            </p>
            {form.bezahlt_betrag > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">Achtung: bereits € {eur(form.bezahlt_betrag)} bezahlt.</p>
                <p className="text-xs mt-1">
                  Beim Stornieren wird der Bezahlt-Betrag auf € 0,00 zurückgesetzt.
                  Der Zahlungsverlauf bleibt danach zur Dokumentation sichtbar —
                  eine allfällige Rückzahlung bitte mit der Buchhaltung klären.
                </p>
              </div>
            )}
            <div>
              <Label>Storno-Grund *</Label>
              <Textarea
                value={stornoGrund}
                onChange={(e) => setStornoGrund(e.target.value)}
                placeholder="z.B. Fehlerhafte Rechnung, Kundenreklamation, doppelt erstellt..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStornoDialogOpen(false)} disabled={stornoLaeuft}>Abbrechen</Button>
              <Button variant="destructive" disabled={!stornoGrund.trim() || stornoLaeuft} onClick={async () => {
                // Guard: bereits storniert
                if (form.status === "storniert") {
                  toast({ variant: "destructive", title: "Bereits storniert", description: `${typLabel} ${form.nummer} wurde bereits storniert.` });
                  setStornoDialogOpen(false);
                  return;
                }
                setStornoLaeuft(true);
                try {
                  const ok = await handleCancel({ grund: stornoGrund.trim(), docTypeLabel: typLabel });
                  if (!ok) return;
                  setStornoDialogOpen(false);
                  navigate("/invoices");
                } finally {
                  setStornoLaeuft(false);
                }
              }}>
                {stornoLaeuft ? "Storniert..." : `${typLabel} stornieren`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Project Dialog (when offer accepted) */}
        <CreateProjectDialog
          open={createProjectDialogOpen}
          onClose={() => setCreateProjectDialogOpen(false)}
          onCreated={async (newProject) => {
            updateField("project_id", newProject.id);
            const { data: projectsData } = await supabase
              .from("projects")
              .select("id, name")
              .not("status", "eq", "Abgeschlossen")
              .order("name");
            if (projectsData) setProjects(projectsData);
            setCreateProjectDialogOpen(false);
          }}
          defaultName={`${form.kunde_name} - ${form.nummer}`}
          defaultCustomerName={form.kunde_name}
          defaultAdresse={form.kunde_adresse}
          defaultPlz={form.kunde_plz}
          defaultOrt={form.kunde_ort}
        />
      </div>

    </div>
  );
}
