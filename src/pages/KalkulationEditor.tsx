// ============================================================================
// KalkulationEditor — NATIVES Kalkulationsmodul (ersetzt das frühere
// iframe-Tool public/auftragskalkulation-tool.html samt DOM-Scraping).
//
// Drei Tabs wie das Original: "Aufbau Kalkulation" (Projektübersicht,
// Auswertung, bis 20 Aufbau-Karten), "Oberflächenbeschichtung"
// (Lohnlackierung), "Einstellungen" (Betriebsdaten + Katalog-CRUD).
//
// Rechenlogik: src/lib/kalkulationEngine.ts (Excel-Letztstand gewinnt).
// Persistenz: kalkulationen.data (JSON-State) + summe, Autosave debounced.
// Alte data-Blobs (localStorage-Shape des iframe-Tools) werden per
// normalizeKalkulationState() konvertiert.
//
// "Als Angebot übernehmen": Payload-Vertrag wie bisher —
// sessionStorage["kalkulation_to_angebot"] = { betreff, customer_id, items }
// → /invoices/new?typ=angebot&from_kalkulation=1.
// NEU: der Payload trägt zusätzlich `kalkulation_id`. Damit merkt sich das
// Angebot seine Herkunft (invoices.kalkulation_id, Migration
// 20260722110000) und kann die Positionen später neu übernehmen; umgekehrt
// zeigt die Kalkulation, dass zu ihr bereits ein Angebot existiert.
//
// Außerdem trägt jede Gruppen-SAMMELZEILE ihre SELBSTKOSTEN in ek_preis
// (Material-EK + Lohn-Selbstkosten + Fahrten + Fremdleistungen des Aufbaus).
// Nur damit kann der Beleg-Editor den Deckungsbeitrag zeigen — die
// Detailzeilen tragen dort die VK-Aufschlüsselung, aus der sich keine Kosten
// ableiten lassen (sie summieren sich exakt zur Sammelzeile).
//
// KATALOG-ÜBERNAHME (Kundenwunsch 2026-07-22): In der Materialtabelle dürfen
// Kategorie und Artikel frei eingetippt werden. Beim Speichern — und jederzeit
// über den Knopf „In Katalog übernehmen" — wird gefragt, ob diese
// handgeschriebenen Positionen in die Stammdaten (kalkulation_kategorien /
// kalkulation_artikel) wandern sollen. Schreiben darf laut RLS nur ein
// Administrator; sonst erscheint eine verständliche Meldung und die Positionen
// bleiben unverändert in der Kalkulation.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { AlertTriangle, FileCheck2, FileText, History, LayoutTemplate, Loader2, PackagePlus, Plus, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { KBToolbar, KBButton, KBToolbarButton } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerSelect } from "@/components/CustomerSelect";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  KalkulationState, KalkModule, MaterialRow, PaintModule,
  normalizeKalkulationState, newModule, newPaintModule, newMaterialRow, nextId,
  resolveBetriebsdaten, resolveLackSaetze, calcProjekt, calcPaintProjekt,
  buildAngebotItems, globalFaktor, margeUnterSchwelle, margeStatus,
  LackPreisResolver, AufpreisResolver, AngebotItem, ProjektErgebnis,
  AUFSCHLAG_OPTIONEN, SKONTO_OPTIONEN, MAX_MODULE,
  fmt, fmtEuro, round2, num,
} from "@/lib/kalkulationEngine";
import { syncePreiseMitKatalog } from "@/lib/kalkKatalogSync";
import { usePermissions } from "@/hooks/usePermissions";
import { getDocConfig } from "@/lib/documentTypes";
import {
  FreiePosition, KatalogArtikel, artTable, findeArtikel, findeKategorie, katTable, mengenEinheit,
  normName, sammleFreiePositionen, useKalkKatalog,
} from "@/components/kalkulation/useKalkKatalog";
import { ArtikelKalkulationDialog } from "@/components/kalkulation/ArtikelKalkulationDialog";
import { NumInput } from "@/components/kalkulation/NumInput";
import { ProjektUebersicht } from "@/components/kalkulation/ProjektUebersicht";
import { AufbauKarte } from "@/components/kalkulation/AufbauKarte";
import { LackierungTab } from "@/components/kalkulation/LackierungTab";
import { EinstellungenTab } from "@/components/kalkulation/EinstellungenTab";

const kalkTable = () => (supabase.from("kalkulationen" as never) as any);

type TabId = "aufbau" | "lack" | "einstellungen";

/** Ziel-Kategorie im Übernahme-Dialog: „die eingetippte neu anlegen". */
const NEUE_KATEGORIE = "__neu__";

/**
 * Ergänzt die Angebots-Positionen um die SELBSTKOSTEN je Aufbau.
 *
 * buildAngebotItems liefert reine Verkaufszahlen: die Sammelzeile trägt den
 * Betrag, den der Kunde zahlt, die Detailzeilen dessen Aufschlüsselung (ihre
 * ek_preis-Beträge summieren sich exakt zur Sammelzeile — daraus lässt sich
 * KEIN Deckungsbeitrag rechnen). Für den internen Verdienst-Block im
 * Beleg-Editor bekommt deshalb jede Sammelzeile die echten Selbstkosten ihres
 * Aufbaus in ek_preis (das Feld ist auf Sammelzeilen sonst ungenutzt).
 *
 * Zuordnung über die Reihenfolge: buildAngebotItems erzeugt je Aufbau mit
 * Betrag > 0 genau eine Sammelzeile, in der Reihenfolge von projekt.zeilen.
 *
 * (Dieselbe Funktion steht in InvoiceDetail.tsx für „Positionen neu
 * übernehmen" — bewusst dupliziert, damit kalkulationEngine.ts unangetastet
 * bleibt.)
 */
function mitSelbstkosten(items: AngebotItem[], projekt: ProjektErgebnis): AngebotItem[] {
  const zeilenMitBetrag = projekt.zeilen.filter((z) => round2(z.gesamtAdj) > 0);
  let k = 0;
  return items.map((it) => {
    if (!it.ist_gruppensumme) return it;
    const zeile = zeilenMitBetrag[k];
    k += 1;
    return { ...it, ek_preis: round2(zeile?.verdienst.selbstkosten ?? 0) };
  });
}

/** Eine Zeile des Übernahme-Dialogs (Vorschlag aus der Kalkulation, editierbar). */
interface UebernahmeZeile extends FreiePosition {
  checked: boolean;
  /** Name einer bestehenden Kategorie, NEUE_KATEGORIE oder "" (noch offen). */
  ziel: string;
}

export default function KalkulationEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const zurueck = useZurueck("/auftragskalkulation");
  const { toast } = useToast();
  const katalog = useKalkKatalog();
  // Schreibrechte auf den Katalog hat laut RLS nur der Administrator. Solange
  // die Rolle noch lädt, wird NICHT gesperrt (sonst wäre der Knopf beim
  // schnellen Öffnen grundlos tot) — im Zweifel antwortet die Datenbank.
  const { isAdmin, loading: rolleLaedt } = usePermissions();
  const darfKatalogSchreiben = isAdmin || rolleLaedt;

  const [state, setState] = useState<KalkulationState>(() => normalizeKalkulationState(null));
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabId>("aufbau");
  /**
   * Optimistisches Sperren gegen Lost Updates (Handy + PC gleichzeitig offen):
   * Der beim Laden gesehene updated_at-Stand. Jedes Update läuft mit
   * `.eq("updated_at", stand)` — trifft es 0 Zeilen, hat inzwischen jemand
   * anderer gespeichert; dann wird NICHT überschrieben, sondern der Autosave
   * gestoppt und der Konflikt angezeigt.
   */
  const standRef = useRef<string | null>(null);
  const [konflikt, setKonflikt] = useState(false);
  const konfliktRef = useRef(false); konfliktRef.current = konflikt;

  // Aufbau-Vorlagen (einzelner Aufbau als Baustein, Kundenwunsch)
  const [aufbauVorlagenOpen, setAufbauVorlagenOpen] = useState(false);
  const [aufbauVorlagen, setAufbauVorlagen] = useState<{ id: string; name: string; daten: unknown }[]>([]);
  const [aufbauVorlageName, setAufbauVorlageName] = useState("");
  /** Aufbau, für den der „Als Vorlage speichern"-Dialog offen ist (Karte). */
  const [aufbauVorlageModulId, setAufbauVorlageModulId] = useState<number | null>(null);
  /** Zeilen-Taschenrechner (Kundenwunsch 24.08.2026): Artikel, dessen
   *  Kalkulations-Dialog aus einer Materialzeile heraus offen ist. */
  const [zeilenKalkArtikel, setZeilenKalkArtikel] = useState<KatalogArtikel | null>(null);

  const ladeAufbauVorlagen = async () => {
    const { data } = await (supabase.from("aufbau_vorlagen" as never) as any)
      .select("id, name, daten").order("name");
    setAufbauVorlagen(((data as any[]) || []));
  };

  const oeffneAufbauVorlagen = () => {
    setAufbauVorlagenOpen(true);
    void ladeAufbauVorlagen();
  };

  /** Karten-Knopf „Als Vorlage": Dialog mit vorbefülltem Namen öffnen. */
  const oeffneAufbauVorlageSpeichern = (modulId: number) => {
    const m = state.modules.find((x) => x.id === modulId);
    if (!m) return;
    const index = state.modules.findIndex((x) => x.id === modulId);
    setAufbauVorlageName((m.name || "").trim() || `Aufbau ${index + 1}`);
    setAufbauVorlageModulId(modulId);
  };

  const speichereAufbauVorlage = async () => {
    const quelle = state.modules.find((x) => x.id === aufbauVorlageModulId);
    const name = aufbauVorlageName.trim() || quelle?.name?.trim();
    if (!quelle || !name) {
      toast({ variant: "destructive", title: "Angaben fehlen", description: "Bitte einen Namen für die Vorlage vergeben." });
      return;
    }
    // Tiefe Kopie ohne Projekt-Reste: laufende id vergibt das Einfügen neu,
    // Nachkalkulations-Istwerte gehören zum Projekt, nicht zur Vorlage.
    const daten = JSON.parse(JSON.stringify({
      ...quelle,
      id: 0,
      nachkalk: { actualDays: null },
      materialRows: quelle.materialRows.map((r) => ({ ...r, actualVK: null })),
    }));
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from("aufbau_vorlagen" as never) as any)
      .insert({ name, daten, created_by: user?.id || null });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Aufbau-Vorlage gespeichert", description: `„${name}“ steht jetzt in jeder Kalkulation über »Aufbau-Vorlagen« zum Einfügen bereit.` });
    setAufbauVorlageModulId(null);
    setAufbauVorlageName("");
    void ladeAufbauVorlagen();
  };

  const fuegeAufbauVorlageEin = (vorlage: { name: string; daten: unknown }) => {
    if (state.modules.length >= MAX_MODULE) {
      toast({ variant: "destructive", title: "Maximum erreicht", description: `Maximal ${MAX_MODULE} Aufbauten.` });
      return;
    }
    update((s) => {
      // Über die Lade-Normalisierung ziehen: Vorlagen aus älteren Ständen
      // bekommen so fehlende Felder mit Vorgabewerten aufgefüllt.
      const basis = newModule(nextId(s.modules));
      const roh = (vorlage.daten || {}) as Record<string, unknown>;
      s.modules.push({
        ...basis,
        ...JSON.parse(JSON.stringify(roh)),
        id: basis.id,
        // Projekt-spezifisches gehört nicht zur Vorlage: Die Fläche kommt vom
        // NEUEN Projekt (eine übernommene Alt-Fläche rechnete sonst unbemerkt
        // mit), Nachkalkulations-Istwerte sowieso.
        area: 0,
        nachkalk: { actualDays: null },
        collapsed: false,
      });
      for (const r of s.modules[s.modules.length - 1].materialRows) r.actualVK = null;
    });
    setAufbauVorlagenOpen(false);
    toast({ title: "Aufbau eingefügt", description: `„${vorlage.name}“ — bitte die Fläche in m² eintragen, der Rest ist übernommen.` });
  };

  const loescheAufbauVorlage = async (id: string, name: string) => {
    if (!window.confirm(`Aufbau-Vorlage „${name}“ löschen?`)) return;
    const { error } = await (supabase.from("aufbau_vorlagen" as never) as any).delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    void ladeAufbauVorlagen();
  };

  // Vorlage-Dialog
  const [vorlageOpen, setVorlageOpen] = useState(false);
  const [vorlageName, setVorlageName] = useState("");
  const [savingVorlage, setSavingVorlage] = useState(false);

  /**
   * Bereits aus dieser Kalkulation erstelltes Angebot (nicht storniert).
   * NULL = keines / Spalte kalkulation_id noch nicht eingespielt (dann bleibt
   * das Feature still deaktiviert, statt eine Fehlermeldung zu werfen).
   */
  const [bestehendesAngebot, setBestehendesAngebot] = useState<{ id: string; nummer: string; typ: string } | null>(null);
  const [angebotWarnOpen, setAngebotWarnOpen] = useState(false);

  // Katalog-Übernahme
  const [katalogOpen, setKatalogOpen] = useState(false);
  const [uebernahme, setUebernahme] = useState<UebernahmeZeile[]>([]);
  const [uebernahmeSaving, setUebernahmeSaving] = useState(false);
  /** Zuletzt weggeklickte Positionsmenge — danach beim Speichern nicht erneut fragen. */
  const abgelehntRef = useRef("");
  // Fortsetzung nach dem Katalog-Dialog (z. B. „Als Angebot übernehmen"):
  // wird nach Übernahme ODER Ablehnen genau einmal ausgeführt.
  const nachUebernahmeRef = useRef<null | (() => void)>(null);
  const laufeNachUebernahme = () => {
    const weiter = nachUebernahmeRef.current;
    nachUebernahmeRef.current = null;
    weiter?.();
  };

  const dragIndexRef = useRef<number | null>(null);

  // ---------------------------------------------------------------- Laden
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      if (!id) return;
      const { data } = await kalkTable()
        .select("id, name, customer_id, data, summe, updated_at").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (!data) {
        toast({ variant: "destructive", title: "Nicht gefunden", description: "Kalkulation existiert nicht (mehr)." });
        navigate("/auftragskalkulation");
        return;
      }
      setName((data as any).name || "");
      setCustomerId((data as any).customer_id || null);
      standRef.current = (data as any).updated_at ?? null;
      setKonflikt(false);
      lastSavedRef.current = "";
      // Konverter: alter iframe-localStorage-Shape ODER neuer nativer State.
      const st = normalizeKalkulationState((data as any).data);
      // Neue, leere Kalkulation: direkt mit einem Aufbau starten.
      if (!(data as any).data && st.modules.length === 0) st.modules.push(newModule(1));
      setState(st);
      setLoaded(true);
      setDirty(false);
      // Rückgängig-Stapel gehören zur Sitzung dieser Kalkulation.
      undoStackRef.current = [];
      redoStackRef.current = [];
      letzterPushRef.current = 0;
      // Verlauf: den vorgefundenen Stand sichern (falls noch nicht drin) —
      // so ist der Stand VOR der heutigen Bearbeitung immer wiederherstellbar.
      if ((data as any).data) {
        void sichereOeffnungsstand((data as any).data, (data as any).name || "", (data as any).summe ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate, toast]);

  // ------------------------------------------- Bereits übernommenes Angebot
  /**
   * Existiert zu dieser Kalkulation schon ein Angebot/eine AB? Dann soll der
   * Chef nicht versehentlich ein zweites anlegen (zwei Angebote mit derselben
   * Leistung beim selben Kunden).
   *
   * DEFENSIV: Solange die Migration 20260722110000 nicht eingespielt ist, gibt
   * es die Spalte kalkulation_id nicht — PostgREST antwortet dann mit einem
   * Fehler. Der wird geschluckt, das Feature bleibt einfach aus.
   */
  const ladeBestehendesAngebot = useCallback(async () => {
    if (!id) return;
    // Auch Sammelangebote zählen (kalkulation_ids enthält diese Kalkulation
    // als Bereich). Schlägt die or-Abfrage fehl (Spalte fehlt noch), greift
    // der bisherige Weg über kalkulation_id.
    let res = await supabase
      .from("invoices")
      .select("id, nummer, typ, datum")
      .or(`kalkulation_id.eq.${id},kalkulation_ids.cs.["${id}"]` as never)
      .neq("status", "storniert")
      .order("datum", { ascending: false })
      .limit(1);
    if (res.error) {
      res = await supabase
        .from("invoices")
        .select("id, nummer, typ, datum")
        .eq("kalkulation_id" as never, id as never)
        .neq("status", "storniert")
        .order("datum", { ascending: false })
        .limit(1);
    }
    const { data, error } = res;
    if (error) { setBestehendesAngebot(null); return; }
    const treffer = ((data as any[]) || [])[0];
    setBestehendesAngebot(treffer ? { id: treffer.id, nummer: treffer.nummer || "", typ: treffer.typ || "angebot" } : null);
  }, [id]);

  useEffect(() => { void ladeBestehendesAngebot(); }, [ladeBestehendesAngebot]);

  // -------------------------------------- Stammdaten-Preise nachführen
  /**
   * Kundenmeldung 21.08.2026: "wenn ich den Preis in den Stammdaten ändere
   * passt es wieder nicht". Zeilen kopieren den Katalogpreis beim Auswählen —
   * dieser Abgleich zieht sie beim Laden UND nach jeder Stammdaten-Änderung
   * (katalog.reload über den Einstellungen-Tab) nach. Bewusst editierte
   * Zeilenpreise (≠ Vergleichswert) bleiben stehen; Details im Helfer.
   * Stabil: Nach der Übernahme findet der zweite Lauf nichts mehr.
   */
  useEffect(() => {
    if (!loaded || katalog.loading) return;
    const r = syncePreiseMitKatalog(state.modules, katalog.materialKategorien);
    if (r.modules === state.modules) return;
    setState((prev) => ({ ...prev, modules: r.modules }));
    if (r.preisZeilen > 0) {
      setDirty(true);
      toast({
        title: "Preise aus den Stammdaten übernommen",
        description: `${r.preisZeilen} Materialzeile${r.preisZeilen === 1 ? " wurde" : "n wurden"} an die aktuellen Katalogpreise angepasst.`,
      });
    }
  }, [loaded, katalog.loading, katalog.materialKategorien, state.modules, toast]);

  // ---------------------------------------------------------- Berechnungen
  const bd = useMemo(
    () => resolveBetriebsdaten(state.settings.businessData, katalog.settings),
    [state.settings.businessData, katalog.settings],
  );
  const saetze = useMemo(() => resolveLackSaetze(katalog.settings), [katalog.settings]);
  const projekt = useMemo(() => calcProjekt(state, bd), [state, bd]);

  // Lack-Preise: DB-Katalog zuerst, Fallback auf Legacy-Preise aus Alt-Blobs.
  const resolveLackPreis = useCallback<LackPreisResolver>((cat, prod) => {
    const art = katalog.lackKategorien.find((k) => k.name === cat)?.artikel.find((a) => a.name === prod);
    if (art) return { p3: art.ek, p4: art.vk };
    const legacy = state.settings.paintPrices?.[cat]?.find((r) => r[0] === prod);
    if (legacy) return { p3: legacy[1] ?? null, p4: legacy[2] ?? null };
    return null;
  }, [katalog.lackKategorien, state.settings.paintPrices]);

  const resolveAufpreis = useCallback<AufpreisResolver>((aufpreisName) => {
    const art = katalog.aufpreise.find((a) => a.name === aufpreisName);
    if (art) return Number(art.vk) || 0;
    const legacy = state.settings.paintSurcharges?.[aufpreisName];
    return legacy !== undefined ? legacy : null;
  }, [katalog.aufpreise, state.settings.paintSurcharges]);

  const paintProjekt = useMemo(
    () => calcPaintProjekt(state, resolveLackPreis, resolveAufpreis, saetze),
    [state, resolveLackPreis, resolveAufpreis, saetze],
  );

  // ------------------------------------------------------------ Persistenz
  const stateRef = useRef(state); stateRef.current = state;
  const nameRef = useRef(name); nameRef.current = name;
  const customerIdRef = useRef(customerId); customerIdRef.current = customerId;
  const summeRef = useRef(0); summeRef.current = round2(projekt.totalGesamt);
  const loadedRef = useRef(loaded); loadedRef.current = loaded;
  const lastSavedRef = useRef<string>("");

  // ── Rückgängig / Wiederholen (Kundenwunsch 24.08.2026) ────────────────────
  // Snapshots des KalkulationState; schnelle Folge-Änderungen (Tippen)
  // verschmelzen zu EINEM Schritt (Koaleszenz-Fenster 800 ms). Der
  // Katalog-Preisabgleich läuft bewusst NICHT über den Stack.
  const undoStackRef = useRef<KalkulationState[]>([]);
  const redoStackRef = useRef<KalkulationState[]>([]);
  const letzterPushRef = useRef(0);

  // ── Verlauf (kalkulation_versionen) ───────────────────────────────────────
  // Stand beim Öffnen + höchstens alle 10 Minuten eine Version; max. 40.
  const letzteVersionRef = useRef<{ zeit: number; fp: string }>({ zeit: 0, fp: "" });
  const [verlaufOpen, setVerlaufOpen] = useState(false);
  const [verlauf, setVerlauf] = useState<{ id: string; created_at: string; name: string | null; summe: number | null }[]>([]);
  const [verlaufLaedt, setVerlaufLaedt] = useState(false);

  /** Kompakter Inhalts-Fingerabdruck (djb2 + Länge) — nur für „gleich/ungleich". */
  const hashFp = (t: string): string => {
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return `${h}:${t.length}`;
  };

  const versionAnlegen = useCallback(async (data: unknown, nm: string, summe: number | null) => {
    if (!id) return;
    const fp = hashFp(JSON.stringify(data));
    if (fp === letzteVersionRef.current.fp) return;
    const { error } = await (supabase.from("kalkulation_versionen" as never) as any)
      .insert({ kalkulation_id: id, name: nm || null, summe, data, fingerprint: fp });
    if (error) return; // Verlauf ist Komfort — er darf den Editor nie stören
    letzteVersionRef.current = { zeit: Date.now(), fp };
    // Aufräumen: nur die neuesten 40 Versionen je Kalkulation behalten.
    const { data: alte } = await (supabase.from("kalkulation_versionen" as never) as any)
      .select("id").eq("kalkulation_id", id)
      .order("created_at", { ascending: false }).range(40, 300);
    const ids = ((alte as any[]) || []).map((r) => r.id);
    if (ids.length > 0) {
      await (supabase.from("kalkulation_versionen" as never) as any).delete().in("id", ids);
    }
  }, [id]);

  /** Beim Öffnen: den vorgefundenen Stand sichern, falls noch nicht im Verlauf. */
  const sichereOeffnungsstand = useCallback(async (data: unknown, nm: string, summe: number | null) => {
    if (!id || !data) return;
    const { data: letzte } = await (supabase.from("kalkulation_versionen" as never) as any)
      .select("fingerprint, created_at").eq("kalkulation_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (letzte?.fingerprint) {
      letzteVersionRef.current = { zeit: new Date(letzte.created_at).getTime(), fp: letzte.fingerprint };
    }
    await versionAnlegen(data, nm, summe);
  }, [id, versionAnlegen]);

  const ladeVerlauf = useCallback(async () => {
    if (!id) return;
    setVerlaufLaedt(true);
    const { data } = await (supabase.from("kalkulation_versionen" as never) as any)
      .select("id, created_at, name, summe").eq("kalkulation_id", id)
      .order("created_at", { ascending: false }).limit(40);
    setVerlauf(((data as any[]) || []));
    setVerlaufLaedt(false);
  }, [id]);

  const versionWiederherstellen = useCallback(async (versionId: string, zeitpunkt: string) => {
    const { data, error } = await (supabase.from("kalkulation_versionen" as never) as any)
      .select("data, name").eq("id", versionId).maybeSingle();
    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: "Version konnte nicht geladen werden." });
      return;
    }
    setState((prev) => {
      undoStackRef.current.push(prev);
      redoStackRef.current = [];
      letzterPushRef.current = 0;
      return normalizeKalkulationState((data as any).data);
    });
    if ((data as any).name) setName(String((data as any).name));
    setVerlaufOpen(false);
    toast({
      title: "Stand wiederhergestellt",
      description: `Version vom ${new Date(zeitpunkt).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — der vorherige Stand ist über Rückgängig erreichbar.`,
    });
  }, [toast]);

  const undo = useCallback(() => {
    setState((prev) => {
      const alt = undoStackRef.current.pop();
      if (!alt) return prev;
      redoStackRef.current.push(prev);
      letzterPushRef.current = 0;
      return alt;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const wieder = redoStackRef.current.pop();
      if (!wieder) return prev;
      undoStackRef.current.push(prev);
      letzterPushRef.current = 0;
      return wieder;
    });
  }, []);

  // Strg/Cmd+Z bzw. +Shift+Z — nicht in Eingabefeldern (dort gilt das
  // Text-Undo des Browsers).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo]);

  const persist = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id || !loadedRef.current) return;
    // Nach einem erkannten Konflikt wird NICHTS mehr geschrieben, bis der
    // Anwender neu geladen hat — sonst überschriebe dieser Tab doch noch die
    // fremden Änderungen.
    if (konfliktRef.current) {
      if (!opts?.silent) {
        toast({
          variant: "destructive",
          title: "Speichern gesperrt",
          description: "Die Kalkulation wurde anderswo geändert — bitte die Seite neu laden.",
        });
      }
      return;
    }
    // projectName im Blob mitführen (Kompatibilität zum alten Shape; Name
    // führt weiterhin die Supabase-Spalte `name`).
    const data = { ...stateRef.current, projectName: nameRef.current };
    const fingerprint = JSON.stringify({ data, name: nameRef.current, customer: customerIdRef.current });
    if (fingerprint === lastSavedRef.current) {
      if (!opts?.silent) toast({ title: "Gespeichert", description: "Kalkulation ist aktuell." });
      setDirty(false);
      return;
    }
    if (!opts?.silent) setSaving(true);
    // Optimistisches Sperren: nur schreiben, wenn der Datensatz noch auf dem
    // Stand ist, den dieser Tab geladen/zuletzt geschrieben hat.
    let q = kalkTable()
      .update({
        name: nameRef.current || "Kalkulation",
        customer_id: customerIdRef.current,
        data,
        summe: summeRef.current,
      })
      .eq("id", id);
    if (standRef.current) q = q.eq("updated_at", standRef.current);
    const { data: rows, error } = await q.select("updated_at");
    if (!opts?.silent) setSaving(false);
    if (error) {
      if (!opts?.silent) toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    if (standRef.current && (!rows || (rows as unknown[]).length === 0)) {
      // 0 Treffer trotz vorhandener Zeile = jemand anderer hat gespeichert.
      setKonflikt(true);
      setDirty(true);
      toast({
        variant: "destructive",
        title: "Kalkulation wurde anderswo geändert",
        description: "Es wurde nichts überschrieben. Bitte die Seite neu laden.",
      });
      return;
    }
    standRef.current = (rows as any[])?.[0]?.updated_at ?? standRef.current;
    lastSavedRef.current = fingerprint;
    // Verlauf: höchstens alle 10 Minuten eine Version (Autosave läuft alle
    // 1,2 s — ungedrosselt gäbe das Versions-Spam).
    if (Date.now() - letzteVersionRef.current.zeit > 10 * 60 * 1000) {
      void versionAnlegen(data, nameRef.current, summeRef.current);
    }
    setDirty(false);
    if (!opts?.silent) toast({ title: "Gespeichert", description: "Kalkulation gespeichert." });
  }, [id, toast, versionAnlegen]);
  const persistRef = useRef(persist); persistRef.current = persist;

  // Autosave: debounced nach jeder Änderung + beim Verlassen.
  useEffect(() => {
    if (!loaded) return;
    setDirty(true);
    const t = setTimeout(() => { persistRef.current({ silent: true }); }, 1200);
    return () => clearTimeout(t);
  }, [state, name, customerId, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const onHide = () => { persistRef.current({ silent: true }); };
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      persistRef.current({ silent: true });
    };
  }, [loaded]);

  // ------------------------------------------------------- State-Mutationen
  const update = useCallback((fn: (s: KalkulationState) => void) => {
    setState((prev) => {
      // Rückgängig-Schritt sichern; schnelle Folge-Edits verschmelzen.
      const jetzt = Date.now();
      if (jetzt - letzterPushRef.current > 800) {
        undoStackRef.current.push(prev);
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
      }
      letzterPushRef.current = jetzt;
      redoStackRef.current = [];
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const patchModule = (moduleId: number, patch: Partial<KalkModule>) =>
    update((s) => { const m = s.modules.find((x) => x.id === moduleId); if (m) Object.assign(m, patch); });

  const patchRow = (moduleId: number, idx: number, patch: Partial<MaterialRow>) =>
    update((s) => { const m = s.modules.find((x) => x.id === moduleId); if (m?.materialRows[idx]) Object.assign(m.materialRows[idx], patch); });

  const replaceRow = (moduleId: number, idx: number, row: MaterialRow) =>
    update((s) => { const m = s.modules.find((x) => x.id === moduleId); if (m && m.materialRows[idx]) m.materialRows[idx] = row; });

  const addRow = (moduleId: number) =>
    update((s) => { const m = s.modules.find((x) => x.id === moduleId); if (m) m.materialRows.push(newMaterialRow()); });

  const removeRow = (moduleId: number, idx: number) =>
    update((s) => { const m = s.modules.find((x) => x.id === moduleId); if (m) m.materialRows.splice(idx, 1); });

  // Materialzeilen umsortieren (Kundenwunsch 2026-08-19: „die einzelnen
  // Schichten in der Reihenfolge verschieben") — Desktop per Drag-Griff,
  // Handy per Pfeiltasten; beides landet hier.
  const moveRow = (moduleId: number, from: number, to: number) =>
    update((s) => {
      const m = s.modules.find((x) => x.id === moduleId);
      if (!m) return;
      const n = m.materialRows.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
      const [r] = m.materialRows.splice(from, 1);
      m.materialRows.splice(to, 0, r);
    });

  const addModule = () => {
    if (state.modules.length >= MAX_MODULE) {
      toast({ variant: "destructive", title: "Maximum erreicht", description: `Maximal ${MAX_MODULE} Aufbauten.` });
      return;
    }
    update((s) => { s.modules.push(newModule(nextId(s.modules))); });
  };

  const cloneModule = (moduleId: number) => {
    if (state.modules.length >= MAX_MODULE) {
      toast({ variant: "destructive", title: "Maximum erreicht", description: `Maximal ${MAX_MODULE} Aufbauten.` });
      return;
    }
    update((s) => {
      const i = s.modules.findIndex((x) => x.id === moduleId);
      if (i < 0) return;
      const kopie = structuredClone(s.modules[i]);
      kopie.id = nextId(s.modules);
      kopie.name = `${s.modules[i].name || "Aufbau"} (Kopie)`;
      kopie.nachkalk = { actualDays: null };
      kopie.materialRows.forEach((r) => { r.actualVK = null; });
      s.modules.splice(i + 1, 0, kopie);
    });
  };

  const removeModule = (moduleId: number) => {
    const m = state.modules.find((x) => x.id === moduleId);
    if (!window.confirm(`Aufbau „${m?.name || "ohne Namen"}“ entfernen?`)) return;
    update((s) => { s.modules = s.modules.filter((x) => x.id !== moduleId); });
  };

  const moveModule = (from: number, to: number) =>
    update((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.modules.length || to >= s.modules.length) return;
      const [m] = s.modules.splice(from, 1);
      s.modules.splice(to, 0, m);
    });

  const patchPaint = (paintId: number, patch: Partial<PaintModule>) =>
    update((s) => { const p = s.paintModules.find((x) => x.id === paintId); if (p) Object.assign(p, patch); });

  const addPaint = () =>
    update((s) => { s.paintModules.push(newPaintModule(nextId(s.paintModules))); });

  const removePaint = (paintId: number) => {
    if (!window.confirm("Lackier-Position entfernen?")) return;
    update((s) => { s.paintModules = s.paintModules.filter((x) => x.id !== paintId); });
  };

  const patchState = (patch: Partial<KalkulationState>) =>
    update((s) => { Object.assign(s, patch); });

  const setMittellohn = (n: number | null) =>
    update((s) => {
      if (n === null || n <= 0) delete s.settings.businessData["Mittellohn"];
      else s.settings.businessData["Mittellohn"] = n;
    });

  // ------------------------------------------------------- Katalog-Übernahme
  /** Alle handgeschriebenen Positionen, die noch nicht im Katalog stehen. */
  const freiePositionen = useMemo(
    () => sammleFreiePositionen(state.modules, katalog.materialKategorien),
    [state.modules, katalog.materialKategorien],
  );
  const freiSignatur = freiePositionen.map((p) => p.key).sort().join(";");

  /** Zielkategorie einer Dialogzeile (aufgelöster Name). */
  const zielName = (z: UebernahmeZeile) => (z.ziel === NEUE_KATEGORIE ? z.kategorie.trim() : z.ziel);

  const oeffneUebernahme = () => {
    if (freiePositionen.length === 0) {
      toast({ title: "Nichts zu übernehmen", description: "Alle Positionen dieser Kalkulation stehen bereits im Katalog." });
      return;
    }
    setUebernahme(freiePositionen.map((p) => ({
      ...p,
      checked: true,
      ziel: p.kategorieFrei
        ? NEUE_KATEGORIE
        : findeKategorie(katalog.materialKategorien, p.kategorie)?.name ?? "",
    })));
    setKatalogOpen(true);
  };

  /** Dialog ohne Übernahme schließen: bis zur nächsten Änderung nicht mehr fragen. */
  const schliesseUebernahme = () => {
    abgelehntRef.current = freiSignatur;
    setKatalogOpen(false);
    laufeNachUebernahme();
  };

  const patchUebernahme = (i: number, patch: Partial<UebernahmeZeile>) =>
    setUebernahme((prev) => prev.map((z, k) => (k === i ? { ...z, ...patch } : z)));

  const katalogFehler = (message: string) =>
    toast({
      variant: "destructive",
      title: "Übernahme nicht möglich",
      description: /row-level security|permission denied|42501/i.test(message)
        ? "Nur Administratoren dürfen Katalog-Stammdaten anlegen. Die Positionen bleiben in der Kalkulation erhalten — bitte einen Administrator um die Aufnahme in die Stammdaten bitten."
        : message,
    });

  const handleUebernahme = async () => {
    const gewaehlt = uebernahme.filter((z) => z.checked);
    if (gewaehlt.length === 0) {
      toast({ variant: "destructive", title: "Nichts ausgewählt", description: "Bitte mindestens eine Position ankreuzen." });
      return;
    }
    const ohneZiel = gewaehlt.find((z) => !zielName(z));
    if (ohneZiel) {
      toast({ variant: "destructive", title: "Kategorie fehlt", description: `Bitte für „${ohneZiel.name}“ eine Ziel-Kategorie wählen.` });
      return;
    }
    setUebernahmeSaving(true);

    // 1. Fehlende Kategorien anlegen (jede nur einmal).
    const katIds = new Map<string, string>();
    for (const k of katalog.materialKategorien) katIds.set(normName(k.name), k.id);
    let katSort = Math.max(0, ...katalog.kategorien.map((k) => Number(k.sort) || 0));
    const neueKategorien: string[] = [];
    for (const z of gewaehlt) {
      const name = zielName(z);
      if (katIds.has(normName(name))) continue;
      katSort += 10;
      const { data, error } = await katTable()
        .insert({ name, typ: "material", einheit: z.einheit || "", sort: katSort })
        .select("id").single();
      if (error) { katalogFehler(error.message); setUebernahmeSaving(false); return; }
      katIds.set(normName(name), (data as any).id);
      neueKategorien.push(name);
    }

    // 2. Artikel anlegen — in den ARTIKELSTAMM (invoice_templates), die EINE
    //    Quelle für Produkte (EIN-Katalog-Umbau, Kundenwunsch 2026-07-24).
    //    Die Position steht damit sofort unter „Produkte" der Aufbau-
    //    Kalkulation UND in der Artikelliste der App. Bereits vorhandene
    //    Namen werden übersprungen (keine Dubletten bei Doppel-Bestätigung).
    const { data: { user: aktuellerUser } } = await supabase.auth.getUser();
    const rows: Record<string, unknown>[] = [];
    const uebersprungen: string[] = [];
    for (const z of gewaehlt) {
      const gruppe = zielName(z);
      const doppelt = findeArtikel(katalog.materialKategorien, gruppe, z.name)
        || rows.some((r) => normName(String(r.produktgruppe)) === normName(gruppe) && normName(String(r.kurzbezeichnung)) === normName(z.name));
      if (doppelt) { uebersprungen.push(z.name); continue; }
      rows.push({
        user_id: aktuellerUser?.id,
        name: z.name.trim(),
        beschreibung: z.name.trim(),
        kurzbezeichnung: z.name.trim(),
        produktgruppe: gruppe.trim(),
        // kategorie = produktgruppe: der Artikel-Auswahldialog im Beleg-Editor
        // gruppiert nach kategorie — ohne diese Spiegelung landete alles
        // unter dem DB-Default „Allgemein".
        kategorie: gruppe.trim(),
        // Mengeneinheit („m³"), nicht Preis-Einheit („€ / m³") — die Einheit
        // landet 1:1 in Angebots-/Rechnungszeilen.
        einheit: mengenEinheit(z.einheit) || "m²",
        // 2 NK: vk_netto/ek_netto sind numeric(12,2) — ungerundet liefen
        // die Spiegelfelder (netto_preis/einzelpreis) auseinander.
        ek_netto: z.ek === null ? null : Math.round(z.ek * 100) / 100,
        vk_netto: z.vk === null ? null : Math.round(z.vk * 100) / 100,
        netto_preis: z.vk === null ? null : Math.round(z.vk * 100) / 100,
        einzelpreis: z.vk === null ? null : Math.round(z.vk * 100) / 100,
        ist_aktiv: true,
      });
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("invoice_templates").insert(rows as any);
      if (error) { katalogFehler(error.message); setUebernahmeSaving(false); return; }
    }

    setUebernahmeSaving(false);
    setKatalogOpen(false);
    abgelehntRef.current = "";
    await katalog.reload();
    laufeNachUebernahme();
    toast({
      title: "In den Katalog übernommen",
      description:
        `${rows.length} Artikel gespeichert`
        + (neueKategorien.length ? `, neue Kategorie(n): ${neueKategorien.join(", ")}` : "")
        + (uebersprungen.length ? ` — bereits vorhanden: ${uebersprungen.join(", ")}` : "") + ".",
    });
  };

  /** Speichern-Knopf: speichert und fragt danach nach neuen Katalog-Positionen. */
  const handleSpeichern = async () => {
    await persist();
    if (freiePositionen.length > 0 && freiSignatur !== abgelehntRef.current) oeffneUebernahme();
  };

  // --------------------------------------------------------------- Aktionen
  /**
   * „Als Angebot übernehmen".
   *
   * Existiert zu dieser Kalkulation bereits ein Angebot, wird zuerst
   * rückgefragt (Alternative: das bestehende öffnen). `trotzdem` überspringt
   * die Rückfrage, wenn der Anwender sie bereits bestätigt hat.
   */
  const handleAngebot = async (trotzdem = false) => {
    if (bestehendesAngebot && !trotzdem) {
      setAngebotWarnOpen(true);
      return;
    }
    const { items: rohItems } = buildAngebotItems(projekt);
    if (rohItems.length === 0) {
      toast({ variant: "destructive", title: "Noch nichts kalkuliert", description: "Es wurden keine Aufbauten mit Betrag gefunden." });
      return;
    }
    setAngebotWarnOpen(false);
    await persist({ silent: true });
    sessionStorage.setItem("kalkulation_to_angebot", JSON.stringify({
      // KEIN "Angebot – "-Präfix: der Dokumenttitel heißt bereits
      // „Angebot – ‹Betreff›" — sonst stünde „Angebot" doppelt am PDF.
      betreff: name || "lt. Kalkulation",
      customer_id: customerId,
      // Herkunft: das Angebot merkt sich, aus welcher Kalkulation es stammt.
      kalkulation_id: id ?? null,
      items: mitSelbstkosten(rohItems, projekt),
    }));
    // Kundenwunsch: VOR dem Wechsel ins Angebot fragen, ob neu angelegte
    // Positionen in den Katalog übernommen werden sollen. Danach (Übernahme
    // oder Nein) geht es automatisch weiter ins Angebot.
    const weiterInsAngebot = () => navigate("/invoices/new?typ=angebot&from_kalkulation=1");
    if (freiePositionen.length > 0 && freiSignatur !== abgelehntRef.current) {
      nachUebernahmeRef.current = weiterInsAngebot;
      oeffneUebernahme();
    } else {
      weiterInsAngebot();
    }
  };

  const handleSaveVorlage = async () => {
    if (!vorlageName.trim()) {
      toast({ variant: "destructive", title: "Name fehlt", description: "Bitte einen Namen für die Vorlage angeben." });
      return;
    }
    setSavingVorlage(true);
    await persist({ silent: true });
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await kalkTable().insert({
      user_id: user?.id,
      name: vorlageName.trim(),
      customer_id: null,
      project_id: null,
      data: { ...stateRef.current, projectName: nameRef.current },
      summe: summeRef.current,
      ist_vorlage: true,
    });
    setSavingVorlage(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    setVorlageOpen(false);
    toast({ title: "Vorlage gespeichert", description: `Vorlage „${vorlageName.trim()}“ wurde angelegt.` });
  };

  // ----------------------------------------------------------------- Render
  if (!loaded || katalog.loading) {
    return (
      <div className="kb-page flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Kalkulation wird geladen …
      </div>
    );
  }

  const faktor = globalFaktor(state.surchargePercent, state.discontPercent);
  const margeWarnung = margeUnterSchwelle(projekt.verdienst, projekt.warnMargeProzent);
  const status = margeStatus(projekt.verdienst, projekt.warnMargeProzent);

  return (
    <div className="kb-page min-h-screen pb-10">
      <KBToolbar
        onBack={() => { persist({ silent: true }); zurueck(); }}
        onHome={() => { persist({ silent: true }); navigate("/"); }}
        title={name || "Kalkulation"}
        rightActions={
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="hidden text-xs text-white/85 md:block">
              {saving ? "Speichert …" : dirty ? "Ungespeicherte Änderungen" : "Gespeichert"}
            </span>
            {/* Rückgängig / Wiederholen / Verlauf (Kundenwunsch 24.08.2026) */}
            <button type="button" onClick={undo} disabled={undoStackRef.current.length === 0}
              title="Rückgängig (Strg+Z)" aria-label="Rückgängig"
              className="flex h-9 w-9 items-center justify-center rounded text-white/90 hover:bg-white/15 disabled:opacity-30">
              <Undo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={redo} disabled={redoStackRef.current.length === 0}
              title="Wiederholen (Strg+Shift+Z)" aria-label="Wiederholen"
              className="flex h-9 w-9 items-center justify-center rounded text-white/90 hover:bg-white/15 disabled:opacity-30">
              <Redo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { setVerlaufOpen(true); void ladeVerlauf(); }}
              title="Verlauf: frühere Stände ansehen und wiederherstellen" aria-label="Verlauf"
              className="flex h-9 w-9 items-center justify-center rounded text-white/90 hover:bg-white/15">
              <History className="h-4 w-4" />
            </button>
            <KBToolbarButton icon={Save} label="Speichern" variant="green" onClick={handleSpeichern} disabled={saving} />
          </div>
        }
      >
        {/* Am Handy passen diese Labels nicht in die Toolbar (sie würde über den
            Bildschirmrand laufen) — dort steht stattdessen die Aktionsleiste
            unter der Toolbar. */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <KBButton icon={LayoutTemplate} label="Als Vorlage speichern"
            onClick={() => { setVorlageName(name); setVorlageOpen(true); }} />
          <KBButton icon={PackagePlus} label="In Katalog übernehmen" badge={freiePositionen.length}
            onClick={oeffneUebernahme}
            title="Frei eingetippte Positionen in die Stammdaten (Katalog) übernehmen" />
          <KBButton icon={FileText} label="Als Angebot übernehmen" variant="blue" onClick={() => handleAngebot()}
            title="Aufbauten als Positionen in ein neues Angebot übernehmen" />
        </div>
      </KBToolbar>

      <div className="mx-auto w-full space-y-4 px-3 py-4 sm:px-4">
        {/* Handy-Aktionsleiste: große Flächen zum Antippen */}
        <div className="flex gap-2 sm:hidden">
          <KBButton className="h-11 min-w-0 flex-1 justify-center" icon={FileText} label="Angebot"
            variant="blue" onClick={() => handleAngebot()} />
          <KBButton className="h-11 min-w-0 flex-1 justify-center" icon={PackagePlus} label="Katalog"
            badge={freiePositionen.length} onClick={oeffneUebernahme} />
          <KBButton className="h-11 min-w-0 flex-1 justify-center" icon={LayoutTemplate} label="Vorlage"
            onClick={() => { setVorlageName(name); setVorlageOpen(true); }} />
        </div>
        {/* Global-Settings-Bar */}
        <div className="kb-panel flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="block min-w-[200px] flex-1 text-xs">
            <span className="mb-0.5 block text-muted-foreground">Projektname</span>
            <input className="kb-input h-11 min-h-0 px-2 py-1 text-sm font-semibold sm:h-9" value={name}
              placeholder="Projektname" onChange={(e) => setName(e.target.value)} />
          </label>
          {/* Kunde direkt hier änderbar — sonst kann ein vergessener Kunde nur
              durch Neuanlage der Kalkulation nachgetragen werden, und die
              Angebots-Übernahme bliebe ohne Empfänger. */}
          <label className="block min-w-[200px] flex-1 text-xs">
            <span className="mb-0.5 block text-muted-foreground">Kunde</span>
            <CustomerSelect value={customerId} onChange={(cid) => { setCustomerId(cid); setDirty(true); }}
              className="h-11 sm:h-9" />
          </label>
          <label className="block w-28 text-xs sm:w-32">
            <span className="mb-0.5 block text-muted-foreground">Aufschlag %</span>
            <select className="kb-input h-11 min-h-0 w-full px-2 py-1 text-sm sm:h-9"
              value={state.surchargePercent === null ? "" : String(state.surchargePercent)}
              onChange={(e) => patchState({ surchargePercent: e.target.value === "" ? null : num(e.target.value) })}>
              <option value="">—</option>
              {AUFSCHLAG_OPTIONEN.map((p) => <option key={p} value={String(p)}>{p} %</option>)}
            </select>
          </label>
          <label className="block w-28 text-xs sm:w-32">
            <span className="mb-0.5 block text-muted-foreground">Skonto %</span>
            <select className="kb-input h-11 min-h-0 w-full px-2 py-1 text-sm sm:h-9"
              value={state.discontPercent === null ? "" : String(state.discontPercent)}
              onChange={(e) => patchState({ discontPercent: e.target.value === "" ? null : num(e.target.value) })}>
              <option value="">—</option>
              {SKONTO_OPTIONEN.map((p) => <option key={p} value={String(p)}>{p} %</option>)}
            </select>
          </label>
          <label className="block w-32 text-xs sm:w-36">
            <span className="mb-0.5 block text-muted-foreground">Mittellohn €/h</span>
            <NumInput min={0} value={num(state.settings.businessData["Mittellohn"]) || bd.mittellohn}
              onCommit={setMittellohn} className="h-11 sm:h-9"
              title="Gilt für diese Kalkulation; Standard aus den Betriebsdaten (Excel: 65 €/h)" />
          </label>
          {faktor !== 1 && (
            <span className="pb-2 text-xs text-muted-foreground">
              Faktor {fmt(faktor)} (additiv: 1 + Aufschlag − Skonto)
            </span>
          )}
          {/* Beide Summen bleiben zusammen (sonst rutscht der Deckungsbeitrag
              beim Umbrechen allein in die nächste Zeile). */}
          <div className="ml-auto flex flex-wrap items-end justify-end gap-x-6 gap-y-1">
            <div className="pb-1 text-right">
              <div className="text-xs text-muted-foreground">Projektsumme (netto)</div>
              <div className="text-lg font-bold tabular-nums text-kb-blue-dark">{fmtEuro(projekt.totalGesamt)}</div>
            </div>
            <div className="pb-1 text-right">
              <div className="text-xs text-muted-foreground">Deckungsbeitrag</div>
              <div className={`text-lg font-bold tabular-nums ${margeWarnung ? "text-destructive" : "text-kb-green"}`}>
                {fmtEuro(projekt.verdienst.deckungsbeitrag)}
                {projekt.verdienst.erloes > 0 && (
                  <span className="ml-1.5 text-xs font-semibold">({fmt(projekt.verdienst.margeProzent)} %)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bereits übernommen: verhindert, dass zur selben Kalkulation
            versehentlich ein zweites Angebot entsteht. Der Weg zurück zum
            bestehenden Beleg ist ein Klick entfernt. */}
        {bestehendesAngebot && (
          <div
            data-testid="kalk-bereits-angebot"
            className="flex flex-wrap items-center gap-2.5 rounded border-2 border-kb-blue-dark/30 bg-kb-blue-dark/5 px-4 py-3 text-sm"
          >
            <FileCheck2 className="h-5 w-5 shrink-0 text-kb-blue-dark" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-kb-blue-dark">
                Wurde bereits als {getDocConfig(bestehendesAngebot.typ).label} übernommen
                {bestehendesAngebot.nummer ? ` (${bestehendesAngebot.nummer})` : ""}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Änderungen an dieser Kalkulation wirken nicht automatisch im Beleg — dort auf
                „Positionen neu übernehmen" klicken.
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-9"
              onClick={() => { persist({ silent: true }); navigate(`/invoices/${bestehendesAngebot.id}`); }}>
              {getDocConfig(bestehendesAngebot.typ).label} öffnen
            </Button>
          </div>
        )}

        {/* Konflikt-Hinweis: zwei Geräte/Tabs haben dieselbe Kalkulation offen.
            Der Autosave ist gestoppt, damit nichts überschrieben wird. */}
        {konflikt && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2.5 rounded border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Kalkulation wurde anderswo geändert — bitte neu laden</div>
              <div className="mt-0.5 text-xs">
                Jemand hat diese Kalkulation zwischenzeitlich gespeichert (anderes Gerät oder zweiter Tab).
                Automatisches Speichern ist gestoppt; es wurde nichts überschrieben.
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => window.location.reload()}>Neu laden</Button>
          </div>
        )}

        {/* Margen-Warnung — der Chef soll sie nicht übersehen können. */}
        {margeWarnung && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              {/* Kosten ohne Erlös sind keine "zu kleine Marge", sondern eine
                  reine Verlustkalkulation — sie braucht einen eigenen Text
                  (früher blieb dieser Fall komplett unbeanstandet). */}
              <div className="font-bold">
                {status === "keinErloes"
                  ? `⚠ Verlustkalkulation: ${fmtEuro(projekt.verdienst.selbstkosten)} Kosten, aber 0,00 € Erlös`
                  : status === "verlust"
                    ? `⚠ Verlust: Deckungsbeitrag ${fmtEuro(projekt.verdienst.deckungsbeitrag)} — die Kosten übersteigen den Erlös`
                    : `⚠ Marge ${fmt(projekt.verdienst.margeProzent)} % liegt unter der Warnschwelle von ${fmt(projekt.warnMargeProzent)} %`}
              </div>
              <div className="mt-0.5 text-xs">
                {status === "keinErloes"
                  ? "Es sind keine Verkaufspreise hinterlegt (Material-VK bzw. Arbeitszeit). So wandert die Position mit 0 € ins Angebot."
                  : <>Deckungsbeitrag {fmtEuro(projekt.verdienst.deckungsbeitrag)} bei {fmtEuro(projekt.verdienst.erloes)} Erlös</>}
                {projekt.verdienst.unsicher && " (enthält geschätzte Material-EK)"}
                {" — "}Details im Panel „Verdienst (Deckungsbeitrag)“.
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tab === "aufbau" ? "kb-tab-active" : "kb-tab"} onClick={() => setTab("aufbau")}>
            Aufbau Kalkulation
          </button>
          <button type="button" className={tab === "lack" ? "kb-tab-active" : "kb-tab"} onClick={() => setTab("lack")}>
            Oberflächenbeschichtung
          </button>
          <button type="button" className={tab === "einstellungen" ? "kb-tab-active" : "kb-tab"} onClick={() => setTab("einstellungen")}>
            Einstellungen
          </button>
        </div>

        {tab === "aufbau" && (
          <div className="space-y-4">
            <ProjektUebersicht projekt={projekt} />

            {projekt.zeilen.map((z, index) => (
              <AufbauKarte
                key={z.module.id}
                module={z.module}
                index={index}
                ergebnis={z.ergebnis}
                faktor={projekt.faktor}
                bd={bd}
                kategorien={katalog.materialKategorien}
                onPatch={(patch) => patchModule(z.module.id, patch)}
                onPatchRow={(idx, patch) => patchRow(z.module.id, idx, patch)}
                onReplaceRow={(idx, row) => replaceRow(z.module.id, idx, row)}
                onAddRow={() => addRow(z.module.id)}
                onRemoveRow={(idx) => removeRow(z.module.id, idx)}
                onMoveRow={(from, to) => moveRow(z.module.id, from, to)}
                onClone={() => cloneModule(z.module.id)}
                onArtikelKalkulieren={(a) => setZeilenKalkArtikel(a)}
                onSaveVorlage={() => oeffneAufbauVorlageSpeichern(z.module.id)}
                onRemove={() => removeModule(z.module.id)}
                dragProps={{
                  draggable: true,
                  onDragStart: (e) => { dragIndexRef.current = index; e.dataTransfer.effectAllowed = "move"; },
                  onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; },
                  onDrop: (e) => {
                    e.preventDefault();
                    if (dragIndexRef.current !== null) moveModule(dragIndexRef.current, index);
                    dragIndexRef.current = null;
                  },
                  onDragEnd: () => { dragIndexRef.current = null; },
                }}
              />
            ))}

            <div className="flex flex-col gap-2 sm:flex-row">
              <KBButton className="h-11 w-full justify-center sm:h-9 sm:w-auto sm:justify-start"
                icon={Plus} label="Aufbau hinzufügen" iconClassName="text-kb-green"
                onClick={addModule} disabled={state.modules.length >= MAX_MODULE} />
              {/* Vorgespeicherte Aufbauten einfügen (Kundenwunsch); gespeichert
                  wird direkt an der Aufbau-Karte („Als Vorlage"). */}
              <KBButton className="h-11 w-full justify-center sm:h-9 sm:w-auto sm:justify-start"
                icon={LayoutTemplate} label="Aufbau-Vorlagen"
                title="Gespeicherte Aufbauten (z. B. »AW 1«) in diese Kalkulation einfügen"
                onClick={oeffneAufbauVorlagen} />
            </div>
          </div>
        )}

        {tab === "lack" && (
          <LackierungTab
            state={state}
            paintProjekt={paintProjekt}
            lackKategorien={katalog.lackKategorien}
            aufpreise={katalog.aufpreise}
            saetze={saetze}
            onPatchState={patchState}
            onPatchPaint={patchPaint}
            onAddPaint={addPaint}
            onRemovePaint={removePaint}
          />
        )}

        {tab === "einstellungen" && <EinstellungenTab katalog={katalog} />}
      </div>

      {/* Handgeschriebene Positionen in den Katalog übernehmen */}
      <Dialog open={katalogOpen} onOpenChange={(o) => { if (o) setKatalogOpen(true); else schliesseUebernahme(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {uebernahme.length} neue Position{uebernahme.length === 1 ? "" : "en"} in den Katalog übernehmen?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Diese Artikel wurden von Hand eingetippt und stehen noch nicht in den Stammdaten.
            Nicht übernommene Positionen bleiben unverändert in der Kalkulation.
          </p>
          {!darfKatalogSchreiben && (
            <div className="rounded border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Katalog-Stammdaten dürfen nur Administratoren anlegen. Die Positionen bleiben in dieser
              Kalkulation erhalten — bitte einen Administrator um die Aufnahme in die Stammdaten bitten.
            </div>
          )}
          <div className="space-y-2">
            {uebernahme.map((z, i) => (
              <div key={z.key} className="rounded border bg-muted/20 p-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={z.checked}
                    aria-label={`„${z.name}“ übernehmen`}
                    onChange={(e) => patchUebernahme(i, { checked: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{z.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      aus {z.aufbauten.join(", ")}
                      {z.kategorie ? ` · eingetippte Kategorie „${z.kategorie}“` : " · ohne Kategorie erfasst"}
                    </span>
                  </span>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="col-span-2 block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Ziel-Kategorie</span>
                    <select className="kb-input h-11 min-h-0 w-full px-2 py-1 text-sm sm:h-9"
                      value={z.ziel} aria-label={`Ziel-Kategorie für ${z.name}`}
                      onChange={(e) => {
                        const ziel = e.target.value;
                        // Einheit aus der Zielgruppe vorbelegen, solange der
                        // Anwender selbst noch keine eingetragen hat.
                        const zielKat = findeKategorie(katalog.materialKategorien, ziel === NEUE_KATEGORIE ? z.kategorie : ziel);
                        patchUebernahme(i, z.einheit.trim()
                          ? { ziel }
                          : { ziel, einheit: mengenEinheit(zielKat?.einheit) });
                      }}>
                      <option value="">— bitte wählen —</option>
                      {z.kategorieFrei && <option value={NEUE_KATEGORIE}>Neu anlegen: „{z.kategorie}“</option>}
                      {katalog.materialKategorien.map((k) => <option key={k.id} value={k.name}>{k.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">EK (€)</span>
                    <NumInput value={z.ek} nullable onCommit={(n) => patchUebernahme(i, { ek: n })} className="h-11 sm:h-9" />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">VK (€)</span>
                    <NumInput value={z.vk} nullable onCommit={(n) => patchUebernahme(i, { vk: n })} className="h-11 sm:h-9" />
                  </label>
                  <label className="col-span-2 block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Einheit</span>
                    <input className="kb-input h-11 min-h-0 px-2 py-1 text-sm sm:h-9" value={z.einheit}
                      placeholder="z.B. m³" aria-label={`Einheit für ${z.name}`}
                      onChange={(e) => patchUebernahme(i, { einheit: e.target.value })} />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={schliesseUebernahme}>Nicht übernehmen</Button>
            <Button onClick={handleUebernahme} disabled={uebernahmeSaving || !darfKatalogSchreiben}>
              {uebernahmeSaving ? "Wird übernommen …" : "In Katalog übernehmen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rückfrage: zu dieser Kalkulation existiert schon ein Beleg */}
      <Dialog open={angebotWarnOpen} onOpenChange={setAngebotWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {getDocConfig(bestehendesAngebot?.typ || "angebot").label} existiert bereits
            </DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm">
            Zu dieser Kalkulation existiert bereits{" "}
            {getDocConfig(bestehendesAngebot?.typ || "angebot").label}
            {bestehendesAngebot?.nummer ? ` ${bestehendesAngebot.nummer}` : ""}.
            Trotzdem ein NEUES Angebot anlegen?
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAngebotWarnOpen(false)}>Abbrechen</Button>
            <Button
              variant="outline"
              onClick={() => {
                setAngebotWarnOpen(false);
                persist({ silent: true });
                if (bestehendesAngebot) navigate(`/invoices/${bestehendesAngebot.id}`);
              }}
            >
              Bestehendes öffnen
            </Button>
            <Button onClick={() => handleAngebot(true)}>Neues Angebot anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Als Vorlage speichern */}
      {/* ── Aufbau-Vorlagen: einfügen + speichern ── */}
      <Dialog open={aufbauVorlagenOpen} onOpenChange={setAufbauVorlagenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aufbau-Vorlagen</DialogTitle>
            <DialogDescription>
              Gespeicherte Aufbauten in diese Kalkulation einfügen. Die Fläche
              wird beim Einfügen geleert, Preise gleichen sich automatisch mit
              den Stammdaten ab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {aufbauVorlagen.length === 0 ? (
              <p className="rounded border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                Noch keine Aufbau-Vorlagen gespeichert. Speichern geht direkt am
                Aufbau: Knopf <b>„Als Vorlage“</b> unten auf jeder Aufbau-Karte.
              </p>
            ) : (
              <div className="max-h-72 divide-y overflow-y-auto rounded border">
                {aufbauVorlagen.map((v) => {
                  const d = (v.daten || {}) as Record<string, unknown>;
                  const zeilen = Array.isArray(d.materialRows)
                    ? (d.materialRows as unknown[]).filter((r) => (r as Record<string, unknown>)?.product || (r as Record<string, unknown>)?.category).length
                    : 0;
                  const meta = [d.aufbauKategorie, zeilen > 0 ? `${zeilen} Materialzeile${zeilen === 1 ? "" : "n"}` : null]
                    .filter(Boolean).join(" · ");
                  return (
                    <div key={v.id} className="flex items-center gap-2 px-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{v.name}</span>
                        {meta && <span className="block text-[11px] text-muted-foreground">{meta}</span>}
                      </span>
                      <Button size="sm" className="h-9" onClick={() => fuegeAufbauVorlageEin(v)}>Einfügen</Button>
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Vorlage löschen"
                        aria-label={`Vorlage ${v.name} löschen`}
                        onClick={() => void loescheAufbauVorlage(v.id, v.name)}
                      ><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Neue Vorlage speichern: Knopf „Als Vorlage“ direkt am jeweiligen Aufbau.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verlauf: frühere Stände ansehen + wiederherstellen */}
      <Dialog open={verlaufOpen} onOpenChange={setVerlaufOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verlauf dieser Kalkulation</DialogTitle>
            <DialogDescription>
              Gesicherte Stände (beim Öffnen und höchstens alle 10 Minuten,
              die letzten 40). Wiederherstellen ersetzt den aktuellen Stand —
              er bleibt über Rückgängig erreichbar.
            </DialogDescription>
          </DialogHeader>
          {verlaufLaedt ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : verlauf.length === 0 ? (
            <p className="rounded border border-dashed px-3 py-3 text-sm text-muted-foreground">
              Noch keine gesicherten Stände — sie entstehen ab jetzt automatisch beim Arbeiten.
            </p>
          ) : (
            <div className="max-h-80 divide-y overflow-y-auto rounded border">
              {verlauf.map((v, i) => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {new Date(v.created_at).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {i === 0 ? " · neueste" : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {v.name || "—"}{v.summe != null ? ` · ${new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(v.summe))}` : ""}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" className="h-9 shrink-0"
                    onClick={() => void versionWiederherstellen(v.id, v.created_at)}>
                    Wiederherstellen
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Zeilen-Taschenrechner (Kundenwunsch 24.08.2026): Artikel aus einer
          Materialzeile heraus kalkulieren — schreibt in die Stammdaten; der
          Katalog-Abgleich zieht die Zeile danach automatisch nach. */}
      <ArtikelKalkulationDialog
        artikel={zeilenKalkArtikel}
        onClose={(gespeichert) => {
          setZeilenKalkArtikel(null);
          if (gespeichert) void katalog.reload();
        }}
      />

      {/* Aufbau als Vorlage speichern (Karten-Knopf, Kundenwunsch 22.08.2026:
          "Ich muss einzelne Aufbauten als z. B. AW 1 speichern können …
          eine Datenbank mit den verschiedenen Aufbauten muss mir wachsen") */}
      <Dialog open={aufbauVorlageModulId !== null} onOpenChange={(o) => { if (!o) setAufbauVorlageModulId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aufbau als Vorlage speichern</DialogTitle>
            <DialogDescription>
              Die Vorlage steht danach in jeder Kalkulation über
              »Aufbau-Vorlagen« zum Einfügen bereit — mit allen Materialzeilen,
              Dämmstärke und Arbeitszeit, ohne Fläche und Ist-Werte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>Name der Vorlage</Label>
              <Input
                value={aufbauVorlageName}
                onChange={(e) => setAufbauVorlageName(e.target.value)}
                placeholder="z. B. AW 1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void speichereAufbauVorlage(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAufbauVorlageModulId(null)}>Abbrechen</Button>
              <Button onClick={() => void speichereAufbauVorlage()}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={vorlageOpen} onOpenChange={setVorlageOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Als Vorlage speichern</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Es wird eine Kopie dieser Kalkulation als Vorlage gespeichert. Kunde und Projekt werden dabei nicht übernommen.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="kalk-vorlage-name">Vorlagenname *</Label>
              <Input id="kalk-vorlage-name" autoFocus value={vorlageName}
                onChange={(e) => setVorlageName(e.target.value)}
                placeholder="z.B. Vorlage Carport"
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveVorlage(); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVorlageOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveVorlage} disabled={savingVorlage}>
              {savingVorlage ? "Wird gespeichert …" : "Vorlage speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
