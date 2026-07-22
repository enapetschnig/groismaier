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
// "Als Angebot übernehmen": Payload-Vertrag EXAKT wie bisher —
// sessionStorage["kalkulation_to_angebot"] = { betreff, customer_id, items }
// → /invoices/new?typ=angebot&from_kalkulation=1 (InvoiceDetail unverändert).
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
import { AlertTriangle, FileText, Home, LayoutTemplate, Loader2, PackagePlus, Plus, Save } from "lucide-react";
import { KBToolbar, KBButton, KBToolbarButton } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerSelect } from "@/components/CustomerSelect";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  KalkulationState, KalkModule, MaterialRow, PaintModule,
  normalizeKalkulationState, newModule, newPaintModule, newMaterialRow, nextId,
  resolveBetriebsdaten, resolveLackSaetze, calcProjekt, calcPaintProjekt,
  buildAngebotItems, globalFaktor, margeUnterSchwelle, margeStatus,
  LackPreisResolver, AufpreisResolver,
  AUFSCHLAG_OPTIONEN, SKONTO_OPTIONEN, MAX_MODULE,
  fmt, fmtEuro, round2, num,
} from "@/lib/kalkulationEngine";
import { usePermissions } from "@/hooks/usePermissions";
import {
  FreiePosition, artTable, findeArtikel, findeKategorie, katTable, normName,
  sammleFreiePositionen, useKalkKatalog,
} from "@/components/kalkulation/useKalkKatalog";
import { NumInput } from "@/components/kalkulation/NumInput";
import { ProjektUebersicht } from "@/components/kalkulation/ProjektUebersicht";
import { AufbauKarte } from "@/components/kalkulation/AufbauKarte";
import { LackierungTab } from "@/components/kalkulation/LackierungTab";
import { EinstellungenTab } from "@/components/kalkulation/EinstellungenTab";

const kalkTable = () => (supabase.from("kalkulationen" as never) as any);

type TabId = "aufbau" | "lack" | "einstellungen";

/** Ziel-Kategorie im Übernahme-Dialog: „die eingetippte neu anlegen". */
const NEUE_KATEGORIE = "__neu__";

/** Eine Zeile des Übernahme-Dialogs (Vorschlag aus der Kalkulation, editierbar). */
interface UebernahmeZeile extends FreiePosition {
  checked: boolean;
  /** Name einer bestehenden Kategorie, NEUE_KATEGORIE oder "" (noch offen). */
  ziel: string;
}

export default function KalkulationEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  // Vorlage-Dialog
  const [vorlageOpen, setVorlageOpen] = useState(false);
  const [vorlageName, setVorlageName] = useState("");
  const [savingVorlage, setSavingVorlage] = useState(false);

  // Katalog-Übernahme
  const [katalogOpen, setKatalogOpen] = useState(false);
  const [uebernahme, setUebernahme] = useState<UebernahmeZeile[]>([]);
  const [uebernahmeSaving, setUebernahmeSaving] = useState(false);
  /** Zuletzt weggeklickte Positionsmenge — danach beim Speichern nicht erneut fragen. */
  const abgelehntRef = useRef("");

  const dragIndexRef = useRef<number | null>(null);

  // ---------------------------------------------------------------- Laden
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      if (!id) return;
      const { data } = await kalkTable()
        .select("id, name, customer_id, data, updated_at").eq("id", id).maybeSingle();
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
    })();
    return () => { cancelled = true; };
  }, [id, navigate, toast]);

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
    setDirty(false);
    if (!opts?.silent) toast({ title: "Gespeichert", description: "Kalkulation gespeichert." });
  }, [id, toast]);
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

    // 2. Artikel anlegen — bereits vorhandene Namen werden übersprungen, sonst
    //    entstehen Dubletten, sobald jemand den Dialog zweimal bestätigt.
    const artSort = new Map<string, number>();
    for (const k of katalog.materialKategorien) {
      artSort.set(normName(k.name), Math.max(0, ...k.artikel.map((a) => Number(a.sort) || 0)));
    }
    const rows: Record<string, unknown>[] = [];
    const uebersprungen: string[] = [];
    for (const z of gewaehlt) {
      const name = zielName(z);
      const doppelt = findeArtikel(katalog.materialKategorien, name, z.name)
        || rows.some((r) => r.kategorie_id === katIds.get(normName(name)) && normName(String(r.name)) === normName(z.name));
      if (doppelt) { uebersprungen.push(z.name); continue; }
      const sort = (artSort.get(normName(name)) ?? 0) + 10;
      artSort.set(normName(name), sort);
      rows.push({
        kategorie_id: katIds.get(normName(name)),
        name: z.name.trim(),
        ek: z.ek,
        vk: z.vk,
        einheit: z.einheit || "",
        sort,
      });
    }
    if (rows.length > 0) {
      const { error } = await artTable().insert(rows);
      if (error) { katalogFehler(error.message); setUebernahmeSaving(false); return; }
    }

    setUebernahmeSaving(false);
    setKatalogOpen(false);
    abgelehntRef.current = "";
    await katalog.reload();
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
  const handleAngebot = async () => {
    const { items } = buildAngebotItems(projekt);
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Noch nichts kalkuliert", description: "Es wurden keine Aufbauten mit Betrag gefunden." });
      return;
    }
    await persist({ silent: true });
    sessionStorage.setItem("kalkulation_to_angebot", JSON.stringify({
      betreff: name ? `Angebot – ${name}` : "Angebot lt. Kalkulation",
      customer_id: customerId,
      items,
    }));
    navigate("/invoices/new?typ=angebot&from_kalkulation=1");
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
        onBack={() => { persist({ silent: true }); navigate("/auftragskalkulation"); }}
        title={name || "Kalkulation"}
        rightActions={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/85 md:block">
              {saving ? "Speichert …" : dirty ? "Ungespeicherte Änderungen" : "Gespeichert"}
            </span>
            <KBToolbarButton icon={Save} label="Speichern" variant="green" onClick={handleSpeichern} disabled={saving} />
          </div>
        }
      >
        {/* Am Handy passen diese Labels nicht in die Toolbar (sie würde über den
            Bildschirmrand laufen) — dort steht stattdessen die Aktionsleiste
            unter der Toolbar. */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <KBButton icon={Home} label="Hauptmenü"
            onClick={() => { persist({ silent: true }); navigate("/"); }}
            title="Speichert und wechselt zur Startmaske" />
          <KBButton icon={LayoutTemplate} label="Als Vorlage speichern"
            onClick={() => { setVorlageName(name); setVorlageOpen(true); }} />
          <KBButton icon={PackagePlus} label="In Katalog übernehmen" badge={freiePositionen.length}
            onClick={oeffneUebernahme}
            title="Frei eingetippte Positionen in die Stammdaten (Katalog) übernehmen" />
          <KBButton icon={FileText} label="Als Angebot übernehmen" variant="blue" onClick={handleAngebot}
            title="Aufbauten als Positionen in ein neues Angebot übernehmen" />
        </div>
      </KBToolbar>

      <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 sm:px-4">
        {/* Handy-Aktionsleiste: große Flächen zum Antippen */}
        <div className="flex gap-2 sm:hidden">
          <KBButton className="h-11 min-w-0 flex-1 justify-center" icon={FileText} label="Angebot"
            variant="blue" onClick={handleAngebot} />
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
                onClone={() => cloneModule(z.module.id)}
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

            <KBButton className="h-11 w-full justify-center sm:h-9 sm:w-auto sm:justify-start"
              icon={Plus} label="Aufbau hinzufügen" iconClassName="text-kb-green"
              onClick={addModule} disabled={state.modules.length >= MAX_MODULE} />
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
                      onChange={(e) => patchUebernahme(i, { ziel: e.target.value })}>
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
                      placeholder="z.B. € / m³" aria-label={`Einheit für ${z.name}`}
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

      {/* Als Vorlage speichern */}
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
