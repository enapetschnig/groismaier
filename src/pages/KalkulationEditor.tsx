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
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileText, LayoutTemplate, Loader2, Plus, Save } from "lucide-react";
import { KBToolbar, KBButton } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  KalkulationState, KalkModule, MaterialRow, PaintModule,
  normalizeKalkulationState, newModule, newPaintModule, newMaterialRow, nextId,
  resolveBetriebsdaten, resolveLackSaetze, calcProjekt, calcPaintProjekt,
  buildAngebotItems, globalFaktor,
  LackPreisResolver, AufpreisResolver,
  AUFSCHLAG_OPTIONEN, SKONTO_OPTIONEN, MAX_MODULE,
  fmt, fmtEuro, round2, num,
} from "@/lib/kalkulationEngine";
import { useKalkKatalog } from "@/components/kalkulation/useKalkKatalog";
import { NumInput } from "@/components/kalkulation/NumInput";
import { ProjektUebersicht } from "@/components/kalkulation/ProjektUebersicht";
import { AufbauKarte } from "@/components/kalkulation/AufbauKarte";
import { LackierungTab } from "@/components/kalkulation/LackierungTab";
import { EinstellungenTab } from "@/components/kalkulation/EinstellungenTab";

const kalkTable = () => (supabase.from("kalkulationen" as never) as any);

type TabId = "aufbau" | "lack" | "einstellungen";

export default function KalkulationEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const katalog = useKalkKatalog();

  const [state, setState] = useState<KalkulationState>(() => normalizeKalkulationState(null));
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabId>("aufbau");

  // Vorlage-Dialog
  const [vorlageOpen, setVorlageOpen] = useState(false);
  const [vorlageName, setVorlageName] = useState("");
  const [savingVorlage, setSavingVorlage] = useState(false);

  const dragIndexRef = useRef<number | null>(null);

  // ---------------------------------------------------------------- Laden
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      if (!id) return;
      const { data } = await kalkTable()
        .select("id, name, customer_id, data").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (!data) {
        toast({ variant: "destructive", title: "Nicht gefunden", description: "Kalkulation existiert nicht (mehr)." });
        navigate("/auftragskalkulation");
        return;
      }
      setName((data as any).name || "");
      setCustomerId((data as any).customer_id || null);
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
  const summeRef = useRef(0); summeRef.current = round2(projekt.totalGesamt);
  const loadedRef = useRef(loaded); loadedRef.current = loaded;
  const lastSavedRef = useRef<string>("");

  const persist = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id || !loadedRef.current) return;
    // projectName im Blob mitführen (Kompatibilität zum alten Shape; Name
    // führt weiterhin die Supabase-Spalte `name`).
    const data = { ...stateRef.current, projectName: nameRef.current };
    const fingerprint = JSON.stringify({ data, name: nameRef.current });
    if (fingerprint === lastSavedRef.current) {
      if (!opts?.silent) toast({ title: "Gespeichert", description: "Kalkulation ist aktuell." });
      setDirty(false);
      return;
    }
    if (!opts?.silent) setSaving(true);
    const { error } = await kalkTable()
      .update({ name: nameRef.current || "Kalkulation", data, summe: summeRef.current })
      .eq("id", id);
    if (!opts?.silent) setSaving(false);
    if (error) {
      if (!opts?.silent) toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
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
  }, [state, name, loaded]);

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
            <KBButton icon={Save} label="Speichern" variant="green" onClick={() => persist()} disabled={saving} />
          </div>
        }
      >
        <KBButton icon={LayoutTemplate} label="Als Vorlage speichern"
          onClick={() => { setVorlageName(name); setVorlageOpen(true); }} />
        <KBButton icon={FileText} label="Als Angebot übernehmen" variant="blue" onClick={handleAngebot}
          title="Aufbauten als Positionen in ein neues Angebot übernehmen" />
      </KBToolbar>

      <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 sm:px-4">
        {/* Global-Settings-Bar */}
        <div className="kb-panel flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="block min-w-[220px] flex-1 text-xs">
            <span className="mb-0.5 block text-muted-foreground">Projektname</span>
            <input className="kb-input h-9 min-h-0 px-2 py-1 text-sm font-semibold" value={name}
              placeholder="Projektname" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block w-32 text-xs">
            <span className="mb-0.5 block text-muted-foreground">Aufschlag %</span>
            <select className="kb-input h-9 min-h-0 px-2 py-1 text-sm"
              value={state.surchargePercent === null ? "" : String(state.surchargePercent)}
              onChange={(e) => patchState({ surchargePercent: e.target.value === "" ? null : num(e.target.value) })}>
              <option value="">—</option>
              {AUFSCHLAG_OPTIONEN.map((p) => <option key={p} value={String(p)}>{p} %</option>)}
            </select>
          </label>
          <label className="block w-32 text-xs">
            <span className="mb-0.5 block text-muted-foreground">Skonto %</span>
            <select className="kb-input h-9 min-h-0 px-2 py-1 text-sm"
              value={state.discontPercent === null ? "" : String(state.discontPercent)}
              onChange={(e) => patchState({ discontPercent: e.target.value === "" ? null : num(e.target.value) })}>
              <option value="">—</option>
              {SKONTO_OPTIONEN.map((p) => <option key={p} value={String(p)}>{p} %</option>)}
            </select>
          </label>
          <label className="block w-36 text-xs">
            <span className="mb-0.5 block text-muted-foreground">Mittellohn €/h</span>
            <NumInput value={num(state.settings.businessData["Mittellohn"]) || bd.mittellohn}
              onCommit={setMittellohn} className="h-9"
              title="Gilt für diese Kalkulation; Standard aus den Betriebsdaten (Excel: 65 €/h)" />
          </label>
          {faktor !== 1 && (
            <span className="pb-2 text-xs text-muted-foreground">
              Faktor {fmt(faktor)} (additiv: 1 + Aufschlag − Skonto)
            </span>
          )}
          <span className="flex-1" />
          <div className="pb-1 text-right">
            <div className="text-xs text-muted-foreground">Projektsumme (netto)</div>
            <div className="text-lg font-bold tabular-nums text-kb-blue-dark">{fmtEuro(projekt.totalGesamt)}</div>
          </div>
        </div>

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

            <KBButton icon={Plus} label="Aufbau hinzufügen" iconClassName="text-kb-green"
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
