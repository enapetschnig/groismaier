import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Plus, Pencil, Trash2, Save, Package, Filter, Upload, Star, TrendingUp, Percent, Euro, ImagePlus, X, Boxes, Printer, ChevronDown, ChevronUp } from "lucide-react";
import { MaterialFileImport } from "@/components/MaterialFileImport";
import { Textarea } from "@/components/ui/textarea";
import { useEinheiten } from "@/hooks/useEinheiten";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { MaterialSetEditor, type SetComponent } from "@/components/MaterialSetEditor";
import { BulkPriceDialog } from "@/components/BulkPriceDialog";
import { KalkulationFields } from "@/components/KalkulationFields";
import { calcEinzelpreis } from "@/lib/kalkulation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Template {
  id: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  kategorie: string;
  artikelnummer: string | null;
  produktnummer: string | null;
  produktgruppe: string | null;
  kurzbezeichnung: string | null;
  langbezeichnung: string | null;
  netto_preis: number;
  brutto_preis: number;
  ust_satz: number;
  ist_aktiv: boolean;
  ist_lagerartikel: boolean;
  lieferant: string | null;
  ist_favorit: boolean;
  foto_path: string | null;
  ist_set: boolean;
  ek_netto: number;
  vk_netto: number;
  bezugseinheit: string | null;
  aufschlag_prozent: number;
  vk_preis_manuell: boolean;
  ist_kalkuliert: boolean;
  verschnitt_prozent: number;
  befestigung_preis: number;
  sonstiges_preis: number;
  arbeitszeit_minuten: number;
  stundensatz: number;
}

export default function InvoiceTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKategorie, setFilterKategorie] = useState<string>("alle");
  const [form, setForm] = useState({
    name: "", beschreibung: "", einheit: "Stk.", einzelpreis: 0, kategorie: "Allgemein", artikelnummer: "",
    produktnummer: "", kurzbezeichnung: "", langbezeichnung: "", netto_preis: 0, brutto_preis: 0, ust_satz: 20,
    ist_lagerartikel: false, lieferant: "", produktgruppe: "",
    foto_path: null as string | null,
    ist_set: false,
    ek_netto: 0,
    vk_netto: 0,
    bezugseinheit: "" as string,
    aufschlag_prozent: 0,
    vk_preis_manuell: false,
    ist_kalkuliert: false,
    verschnitt_prozent: 0,
    befestigung_preis: 0,
    sonstiges_preis: 0,
    arbeitszeit_minuten: 0,
    stundensatz: 52,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [priceAdjustMode, setPriceAdjustMode] = useState<"prozent" | "euro">("prozent");
  const [priceAdjustValue, setPriceAdjustValue] = useState("");
  // Foto-Vorschau-URLs (signed) für Katalog-Liste + Edit-Dialog
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  // Komponenten des aktuell editierten Sets (im Dialog lokal gehalten, wird
  // beim Save synchron in invoice_template_components geschrieben)
  const [setComponents, setSetComponents] = useState<SetComponent[]>([]);
  // Merker: welche Komponenten-Row-IDs waren beim Öffnen da? Für Diff beim Save.
  const [originalComponentIds, setOriginalComponentIds] = useState<string[]>([]);
  const [fotoUploading, setFotoUploading] = useState(false);
  const [editFotoUrl, setEditFotoUrl] = useState<string | null>(null);
  // KingBill-Listenmaske: markierte Zeile (Toolbar-Bearbeiten/-Löschen wirken darauf)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile: linke Filterspalte auf-/zuklappbar (auf lg+ immer sichtbar)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const einheiten = useEinheiten();

  useEffect(() => { fetchTemplates(); }, []);

  // Deep-Links von der KingBill-Hauptmaske: ?q=<Suche>, ?neu=1 (Anlege-Dialog)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearch(q);
    if (searchParams.get("neu") === "1") openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("invoice_templates")
      .select("*")
      .order("kategorie, name")
      .limit(5000);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Artikel konnten nicht geladen werden" });
    } else {
      const rows = (data || []).map(t => {
        const nettoPreis = Number((t as any).netto_preis) || Number(t.einzelpreis);
        return {
          ...t,
          einzelpreis: Number(t.einzelpreis),
          netto_preis: nettoPreis,
          brutto_preis: Number((t as any).brutto_preis) || 0,
          ust_satz: Number((t as any).ust_satz) || 20,
          ist_aktiv: (t as any).ist_aktiv !== false,
          ist_lagerartikel: (t as any).ist_lagerartikel || false,
          artikelnummer: (t as any).artikelnummer || null,
          produktnummer: (t as any).produktnummer || null,
          produktgruppe: (t as any).produktgruppe || null,
          kurzbezeichnung: (t as any).kurzbezeichnung || null,
          langbezeichnung: (t as any).langbezeichnung || null,
          lieferant: (t as any).lieferant || null,
          ist_favorit: (t as any).ist_favorit || false,
          foto_path: (t as any).foto_path || null,
          ist_set: !!(t as any).ist_set,
          ek_netto: Number((t as any).ek_netto ?? nettoPreis) || 0,
          vk_netto: Number((t as any).vk_netto ?? nettoPreis) || 0,
          bezugseinheit: (t as any).bezugseinheit || null,
          aufschlag_prozent: Number((t as any).aufschlag_prozent) || 0,
          vk_preis_manuell: !!(t as any).vk_preis_manuell,
          ist_kalkuliert: !!(t as any).ist_kalkuliert,
          verschnitt_prozent: Number((t as any).verschnitt_prozent) || 0,
          befestigung_preis: Number((t as any).befestigung_preis) || 0,
          sonstiges_preis: Number((t as any).sonstiges_preis) || 0,
          arbeitszeit_minuten: Number((t as any).arbeitszeit_minuten) || 0,
          stundensatz: Number((t as any).stundensatz) || 52,
        };
      }) as Template[];
      setTemplates(rows);

      // Signed URLs für alle Fotos parallel generieren (1h gültig)
      const withFotos = rows.filter(r => r.foto_path);
      if (withFotos.length > 0) {
        const urls: Record<string, string> = {};
        await Promise.all(withFotos.map(async (r) => {
          try {
            const { data: signed } = await supabase.storage
              .from("project-materials")
              .createSignedUrl(r.foto_path!, 3600);
            if (signed?.signedUrl) urls[r.id] = signed.signedUrl;
          } catch {}
        }));
        setFotoUrls(urls);
      } else {
        setFotoUrls({});
      }
    }
    setLoading(false);
  };

  const kategorien = [...new Set(templates.map(t => t.kategorie))].sort();
  const produktgruppen = [...new Set(templates.map(t => t.produktgruppe).filter(Boolean))].sort() as string[];
  const lieferanten = [...new Set(templates.map(t => t.lieferant).filter(Boolean))].sort() as string[];

  const filtered = templates.filter(t => {
    const s = search.toLowerCase();
    const matchesSearch = !search ||
      t.name.toLowerCase().includes(s) ||
      t.beschreibung.toLowerCase().includes(s) ||
      (t.artikelnummer && t.artikelnummer.toLowerCase().includes(s)) ||
      (t.produktnummer && t.produktnummer.toLowerCase().includes(s)) ||
      (t.kurzbezeichnung && t.kurzbezeichnung.toLowerCase().includes(s)) ||
      (t.langbezeichnung && t.langbezeichnung.toLowerCase().includes(s)) ||
      (t.lieferant && t.lieferant.toLowerCase().includes(s));
    const matchesKategorie = filterKategorie === "alle" || t.kategorie === filterKategorie;
    return matchesSearch && matchesKategorie;
  });

  // Markierte Zeile (für Toolbar-Bearbeiten/-Löschen)
  const selectedRow = templates.find(t => t.id === selectedId) || null;

  const openNew = () => {
    setEditId(null);
    setForm({
      name: "", beschreibung: "", einheit: "Stk.", einzelpreis: 0, kategorie: "Allgemein", artikelnummer: "",
      produktnummer: "", kurzbezeichnung: "", langbezeichnung: "", netto_preis: 0, brutto_preis: 0, ust_satz: 20,
      ist_lagerartikel: false, lieferant: "", produktgruppe: "",
      foto_path: null, ist_set: false,
      ek_netto: 0, vk_netto: 0, bezugseinheit: "", aufschlag_prozent: 0, vk_preis_manuell: false,
      ist_kalkuliert: false, verschnitt_prozent: 0, befestigung_preis: 0, sonstiges_preis: 0, arbeitszeit_minuten: 0, stundensatz: 52,
    });
    setSetComponents([]);
    setOriginalComponentIds([]);
    setEditFotoUrl(null);
    setDialogOpen(true);
  };

  const openEdit = async (t: Template) => {
    setEditId(t.id);
    setForm({
      name: t.name, beschreibung: t.beschreibung, einheit: t.einheit, einzelpreis: t.einzelpreis,
      kategorie: t.kategorie, artikelnummer: t.artikelnummer || "",
      produktnummer: t.produktnummer || "", kurzbezeichnung: t.kurzbezeichnung || t.name,
      langbezeichnung: t.langbezeichnung || t.beschreibung, netto_preis: t.netto_preis,
      brutto_preis: t.brutto_preis, ust_satz: t.ust_satz, ist_lagerartikel: t.ist_lagerartikel,
      lieferant: t.lieferant || "", produktgruppe: t.produktgruppe || t.kategorie,
      foto_path: t.foto_path,
      ist_set: t.ist_set,
      ek_netto: t.ek_netto,
      vk_netto: t.vk_netto || t.netto_preis,
      bezugseinheit: t.bezugseinheit || "",
      aufschlag_prozent: t.aufschlag_prozent,
      vk_preis_manuell: t.vk_preis_manuell,
      ist_kalkuliert: t.ist_kalkuliert,
      verschnitt_prozent: t.verschnitt_prozent,
      befestigung_preis: t.befestigung_preis,
      sonstiges_preis: t.sonstiges_preis,
      arbeitszeit_minuten: t.arbeitszeit_minuten,
      stundensatz: t.stundensatz || 52,
    });
    setPriceAdjustValue("");
    setEditFotoUrl(t.foto_path ? (fotoUrls[t.id] || null) : null);
    setDialogOpen(true);

    // Komponenten für Sets laden
    if (t.ist_set) {
      const { data } = await (supabase as any)
        .from("invoice_template_components")
        .select("id, component_template_id, menge, sort_order, component:invoice_templates!component_template_id(id, name, kurzbezeichnung, einheit, einzelpreis, ek_netto, vk_netto)")
        .eq("parent_template_id", t.id)
        .order("sort_order");
      const rows = ((data as any[]) || []).map(r => {
        const nettoFallback = Number(r.component?.einzelpreis) || 0;
        return {
          id: r.id,
          component_template_id: r.component_template_id,
          component_name: r.component?.kurzbezeichnung || r.component?.name || "?",
          component_einheit: r.component?.einheit || "Stk.",
          component_netto_preis: Number(r.component?.vk_netto ?? nettoFallback) || 0,
          component_ek_netto: Number(r.component?.ek_netto ?? nettoFallback) || 0,
          menge: Number(r.menge) || 1,
          sort_order: Number(r.sort_order) || 0,
        };
      }) as SetComponent[];
      setSetComponents(rows);
      setOriginalComponentIds(rows.map(r => r.id!).filter(Boolean));
    } else {
      setSetComponents([]);
      setOriginalComponentIds([]);
    }
  };

  // Foto-Upload in den bestehenden project-materials-Bucket. Pfad ist
  // material-fotos/<templateId>.<ext>. Bei neuem Material gibt es noch
  // keine ID — wir erzeugen daher eine temporäre uuid, die wir beim Save
  // in foto_path speichern.
  const handleFotoSelect = async (file: File) => {
    setFotoUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      // Eindeutiger Pfad: template-ID wenn vorhanden, sonst zufällige UUID
      const base = editId || crypto.randomUUID();
      const path = `material-fotos/${base}.${ext}`;
      const { error } = await supabase.storage.from("project-materials")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (error) throw error;
      setForm(f => ({ ...f, foto_path: path }));
      const { data: signed } = await supabase.storage
        .from("project-materials").createSignedUrl(path, 3600);
      setEditFotoUrl(signed?.signedUrl || null);
      toast({ title: "Foto hochgeladen" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: err.message });
    } finally {
      setFotoUploading(false);
    }
  };

  const handleFotoRemove = async () => {
    if (form.foto_path) {
      try { await supabase.storage.from("project-materials").remove([form.foto_path]); } catch {}
    }
    setForm(f => ({ ...f, foto_path: null }));
    setEditFotoUrl(null);
  };

  const handleSave = async () => {
    const effectiveName = (form.kurzbezeichnung || form.name || "").trim();
    if (!effectiveName) {
      toast({ variant: "destructive", title: "Fehler", description: "Kurzbezeichnung ist erforderlich" });
      return;
    }

    // H-4: Preise dürfen nicht negativ sein (DB-Constraint wirft sonst nur technische Meldung)
    const ek = Number(form.ek_netto) || 0;
    const vk = Number(form.vk_netto) || 0;
    if (ek < 0 || vk < 0) {
      toast({ variant: "destructive", title: "Preis ungültig", description: "EK und VK dürfen nicht negativ sein." });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // VK ist der Primärwert für Rechnungen; netto_preis und einzelpreis werden
    // daraus gespiegelt für Abwärtskompatibilität mit Altcode.
    // Im Kalkulations-Modus wird der VK aus EK + Verschnitt + Aufschlag + Lohn berechnet.
    const kalkVk = calcEinzelpreis({
      ek_preis: Number(form.ek_netto) || 0,
      verschnitt_prozent: Number(form.verschnitt_prozent) || 0,
      aufschlag_prozent: Number(form.aufschlag_prozent) || 0,
      befestigung_preis: Number(form.befestigung_preis) || 0,
      sonstiges_preis: Number(form.sonstiges_preis) || 0,
      arbeitszeit_minuten: Number(form.arbeitszeit_minuten) || 0,
      stundensatz: Number(form.stundensatz) || 52,
    });
    const vkEffective = form.ist_kalkuliert ? kalkVk : (Number(form.vk_netto) || Number(form.netto_preis) || 0);
    const ekEffective = Number(form.ek_netto) || vkEffective;
    const bruttoEffective = Math.round(vkEffective * (1 + Number(form.ust_satz) / 100) * 100) / 100;

    const payload: any = {
      name: form.kurzbezeichnung || form.name,
      beschreibung: form.langbezeichnung || form.beschreibung || form.kurzbezeichnung || form.name,
      einheit: form.ist_set && form.bezugseinheit ? form.bezugseinheit : form.einheit,
      einzelpreis: vkEffective,
      kategorie: form.produktgruppe || form.kategorie,
      artikelnummer: form.produktnummer || form.artikelnummer || null,
      produktnummer: form.produktnummer || null,
      produktgruppe: form.produktgruppe || null,
      kurzbezeichnung: form.kurzbezeichnung || form.name,
      langbezeichnung: form.langbezeichnung || null,
      netto_preis: vkEffective,
      brutto_preis: bruttoEffective,
      ust_satz: form.ust_satz,
      ist_lagerartikel: form.ist_lagerartikel,
      lieferant: form.lieferant || null,
      foto_path: form.foto_path,
      ist_set: form.ist_set,
      ek_netto: ekEffective,
      vk_netto: vkEffective,
      bezugseinheit: form.ist_set ? (form.bezugseinheit || null) : null,
      aufschlag_prozent: (form.ist_set || form.ist_kalkuliert) ? Number(form.aufschlag_prozent) || 0 : 0,
      vk_preis_manuell: form.ist_set ? form.vk_preis_manuell : false,
      ist_kalkuliert: form.ist_kalkuliert,
      verschnitt_prozent: form.ist_kalkuliert ? Number(form.verschnitt_prozent) || 0 : 0,
      befestigung_preis: form.ist_kalkuliert ? Number(form.befestigung_preis) || 0 : 0,
      sonstiges_preis: form.ist_kalkuliert ? Number(form.sonstiges_preis) || 0 : 0,
      arbeitszeit_minuten: form.ist_kalkuliert ? Number(form.arbeitszeit_minuten) || 0 : 0,
      stundensatz: Number(form.stundensatz) || 52,
    };

    let templateId = editId;
    if (editId) {
      const { error } = await supabase.from("invoice_templates").update(payload).eq("id", editId);
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    } else {
      const { data, error } = await supabase.from("invoice_templates")
        .insert({ ...payload, user_id: user.id })
        .select("id")
        .single();
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
      templateId = (data as any)?.id || null;
    }

    // Komponenten-Diff synchronisieren (nur relevant für Sets)
    if (form.ist_set && templateId) {
      // Alte Rows entfernen, die nicht mehr in setComponents vorhanden sind
      const currentIds = setComponents.map(c => c.id).filter(Boolean) as string[];
      const toDelete = originalComponentIds.filter(id => !currentIds.includes(id));
      if (toDelete.length > 0) {
        await (supabase as any).from("invoice_template_components")
          .delete().in("id", toDelete);
      }
      // Insert / Update pro Komponente
      for (const c of setComponents) {
        if (c.id) {
          await (supabase as any).from("invoice_template_components")
            .update({ menge: c.menge, sort_order: c.sort_order })
            .eq("id", c.id);
        } else {
          await (supabase as any).from("invoice_template_components")
            .insert({
              parent_template_id: templateId,
              component_template_id: c.component_template_id,
              menge: c.menge,
              sort_order: c.sort_order,
            });
        }
      }
    } else if (!form.ist_set && originalComponentIds.length > 0 && templateId) {
      // Vom Set zum normalen Material zurück → alle Komponenten löschen
      await (supabase as any).from("invoice_template_components")
        .delete().eq("parent_template_id", templateId);
    }

    toast({ title: editId ? "Gespeichert" : "Erstellt" });
    setDialogOpen(false);
    fetchTemplates();
  };

  const handleInlinePrice = async (id: string, newPrice: number) => {
    const { error } = await supabase.from("invoice_templates").update({ einzelpreis: newPrice }).eq("id", id);
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, einzelpreis: newPrice } : t));
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("invoice_templates").delete().eq("id", id);
    if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Gelöscht" });
    fetchTemplates();
  };

  // Toolbar-Aktionen wirken auf die markierte Zeile
  const editSelected = () => {
    if (selectedRow) openEdit(selectedRow);
  };

  const deleteSelected = () => {
    if (!selectedRow) return;
    if (!confirm(`Artikel „${selectedRow.kurzbezeichnung || selectedRow.name}" wirklich löschen?`)) return;
    handleDelete(selectedRow.id);
  };

  return (
    <div className="kb-page min-h-screen">
      {/* Print-CSS: „Liste drucken" druckt nur das Artikel-Grid */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kb-print-area, #kb-print-area * { visibility: visible; }
          #kb-print-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; border-radius: 0; }
          #kb-print-area .overflow-x-auto { overflow: visible !important; }
        }
      `}</style>

      {/* KingBill-Toolbar: [Zurück] [+ Neuer Artikel] [Bearbeiten] [Löschen] [Import] [Preise] [Liste drucken] */}
      <KBToolbar onBack={zurueck} title="Artikel">
        <KBToolbarButton icon={Plus} iconClassName="text-kb-green" label="Neuer Artikel" onClick={openNew} />
        {/*
          Zeilenabhängige + Büro-Aktionen am Handy ausgeblendet — dort wird über
          die Karten bearbeitet, sonst wäre die Toolbar 6 Zeilen hoch.
        */}
        <KBToolbarButton
          className="hidden md:inline-flex"
          icon={Pencil}
          label="Bearbeiten"
          onClick={editSelected}
          disabled={!selectedRow}
          title={selectedRow ? `${selectedRow.kurzbezeichnung || selectedRow.name} bearbeiten` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton
          className="hidden md:inline-flex"
          icon={Trash2}
          label="Löschen"
          onClick={deleteSelected}
          disabled={!selectedRow}
          title={selectedRow ? `${selectedRow.kurzbezeichnung || selectedRow.name} löschen` : "Zuerst eine Zeile markieren"}
        />
        <KBToolbarButton className="hidden md:inline-flex" icon={Upload} label="Import" onClick={() => setImportOpen(true)} />
        <KBToolbarButton className="hidden md:inline-flex" icon={TrendingUp} label="Preise anpassen" onClick={() => setBulkPriceOpen(true)} />
        <KBToolbarButton className="hidden md:inline-flex" icon={Printer} label="Liste drucken" onClick={() => window.print()} />
      </KBToolbar>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-[1600px]">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">

          {/* ── Linke KingBill-Filterspalte ── */}
          <aside className="kb-panel w-full lg:w-64 shrink-0 p-3 print:hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            {/* Mobile: Filterspalte auf-/zuklappen */}
            <button
              type="button"
              className="kb-btn min-h-[44px] w-full justify-between lg:hidden"
              onClick={() => setFiltersOpen(o => !o)}
              aria-expanded={filtersOpen}
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-kb-blue-dark" />
                Filter & Suche
              </span>
              {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            <div className={`${filtersOpen ? "flex" : "hidden"} lg:flex flex-col gap-3 mt-3 lg:mt-0`}>
              {/* Suche */}
              <input
                type="search"
                className="kb-input"
                placeholder="Suche… (Name, Nummer, Lieferant)"
                aria-label="Artikel durchsuchen"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* Kategorie filtern */}
              <Select value={filterKategorie} onValueChange={setFilterKategorie}>
                <SelectTrigger className="w-full h-9" aria-label="Kategorie filtern">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Kategorien</SelectItem>
                  {kategorien.map(k => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Anzahl-Zähler wie im KingBill-Original */}
              <div className="border-t border-border pt-2 text-sm font-bold">
                Anzahl Artikel: {loading ? "…" : filtered.length}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Zeile anklicken = markieren, Doppelklick = bearbeiten.
              </p>
            </div>
          </aside>

          {/* ── Artikel-Grid rechts (zugleich Druckbereich) ── */}
          <section id="kb-print-area" className="kb-panel flex-1 min-w-0 overflow-hidden">
            {/* Druck-Kopf: nur beim „Liste drucken" sichtbar */}
            <div className="hidden print:block px-4 pt-4">
              <h2 className="text-lg font-bold">Artikelliste</h2>
              <p className="text-xs text-muted-foreground">Anzahl Artikel: {filtered.length}</p>
            </div>
            <div className="p-2 sm:p-3">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Lädt...</p>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{search || filterKategorie !== "alle" ? "Keine Artikel gefunden" : "Noch keine Artikel angelegt"}</p>
                  {!search && filterKategorie === "alle" && (
                    <button type="button" className="kb-btn mx-auto mt-4" onClick={openNew}>
                      <Plus className="w-4 h-4 text-kb-green" /> Ersten Artikel anlegen
                    </button>
                  )}
                </div>
              ) : (
                <>
                {/*
                  ── Mobil (< md): Karten statt Tabelle ──
                  Am Handy ist die Tabelle zu schmal (Preis/Nummer werden
                  abgeschnitten). Tippen = bearbeiten, wie der Doppelklick am
                  Desktop.
                */}
                <ul className="flex flex-col gap-2 md:hidden print:hidden">
                  {filtered.map(t => {
                    const vk = t.vk_netto || t.einzelpreis;
                    return (
                      <li key={t.id}>
                        <div className="kb-panel flex items-start gap-2 p-3">
                          <button
                            type="button"
                            aria-label={t.ist_favorit ? "Favorit entfernen" : "Als Favorit merken"}
                            className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newVal = !t.ist_favorit;
                              await supabase.from("invoice_templates").update({ ist_favorit: newVal } as any).eq("id", t.id);
                              setTemplates(prev => prev.map(item => item.id === t.id ? { ...item, ist_favorit: newVal } : item));
                            }}
                          >
                            <Star className={`h-5 w-5 ${t.ist_favorit ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                          </button>
                          <button
                            type="button"
                            className="min-h-[44px] min-w-0 flex-1 text-left"
                            onClick={() => { setSelectedId(t.id); openEdit(t); }}
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold leading-tight break-words">
                                  {t.kurzbezeichnung || t.name}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {t.kategorie}
                                  {(t.produktnummer || t.artikelnummer) && (
                                    <span className="font-mono"> · {t.produktnummer || t.artikelnummer}</span>
                                  )}
                                </p>
                              </div>
                              <span className="shrink-0 font-mono text-sm font-bold">
                                {vk > 0 ? `€ ${vk.toFixed(2)}` : "–"}
                              </span>
                            </div>
                            {(t.ist_set || t.ist_lagerartikel) && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {t.ist_set && (
                                  <Badge variant="outline" className="h-5 gap-1 border-primary/40 px-1.5 text-[10px] text-primary">
                                    <Boxes className="h-3 w-3" /> Set
                                  </Badge>
                                )}
                                {t.ist_lagerartikel && (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Lager</Badge>
                                )}
                              </div>
                            )}
                          </button>
                          {/* Löschen klein rechts — mit Sicherheitsabfrage wie am Desktop. */}
                          <button
                            type="button"
                            aria-label={`${t.kurzbezeichnung || t.name} löschen`}
                            title={`${t.kurzbezeichnung || t.name} löschen`}
                            className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center"
                            onClick={() => {
                              if (!confirm(`Artikel „${t.kurzbezeichnung || t.name}" wirklich löschen?`)) return;
                              handleDelete(t.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="hidden overflow-x-auto md:block print:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 print:hidden"><span className="sr-only">Favorit</span></TableHead>
                        <TableHead>Gruppe</TableHead>
                        <TableHead>Nummer</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="text-right">Verkaufspreis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(t => {
                        const isSelected = selectedId === t.id;
                        const vk = t.vk_netto || t.einzelpreis;
                        return (
                          <TableRow
                            key={t.id}
                            aria-selected={isSelected}
                            className={`cursor-pointer ${isSelected ? "bg-kb-blue/15 hover:bg-kb-blue/20" : "hover:bg-muted/50"}`}
                            onClick={() => setSelectedId(t.id)}
                            onDoubleClick={() => openEdit(t)}
                          >
                            <TableCell className="print:hidden">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async (e) => {
                                e.stopPropagation();
                                const newVal = !t.ist_favorit;
                                await supabase.from("invoice_templates").update({ ist_favorit: newVal } as any).eq("id", t.id);
                                setTemplates(prev => prev.map(item => item.id === t.id ? { ...item, ist_favorit: newVal } : item));
                              }}>
                                <Star className={`w-4 h-4 ${t.ist_favorit ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                              </Button>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{t.kategorie}</TableCell>
                            <TableCell className="font-mono text-xs whitespace-nowrap">{t.produktnummer || t.artikelnummer || "–"}</TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {t.foto_path && fotoUrls[t.id] ? (
                                  <img
                                    src={fotoUrls[t.id]}
                                    alt=""
                                    className="w-8 h-8 object-cover rounded border shrink-0 print:hidden"
                                    loading="lazy"
                                  />
                                ) : null}
                                <span className="truncate max-w-[340px]" title={t.langbezeichnung || t.beschreibung || undefined}>
                                  {t.kurzbezeichnung || t.name}
                                </span>
                                {t.ist_set && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-1 border-primary/40 text-primary shrink-0">
                                    <Boxes className="w-3 h-3" />
                                    Set
                                  </Badge>
                                )}
                                {t.ist_lagerartikel && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">Lager</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                              {vk > 0 ? `€ ${vk.toFixed(2)}` : "–"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </div>
          </section>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Artikel bearbeiten" : "Neuer Artikel"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Produktnummer</Label>
                  <Input value={form.produktnummer} onChange={(e) => setForm(f => ({ ...f, produktnummer: e.target.value }))} placeholder="z.B. 0050-PCI" />
                </div>
                <div>
                  <Label>Produktgruppe</Label>
                  <Select value={form.produktgruppe || "none"} onValueChange={(v) => {
                    if (v === "_new") {
                      const newGrp = prompt("Neue Produktgruppe:");
                      if (newGrp?.trim()) setForm(f => ({ ...f, produktgruppe: newGrp.trim() }));
                    } else {
                      setForm(f => ({ ...f, produktgruppe: v === "none" ? "" : v }));
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {produktgruppen.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      <SelectItem value="_new" className="text-primary font-medium">+ Neue Gruppe...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lieferant</Label>
                  <Select value={form.lieferant || "none"} onValueChange={(v) => {
                    if (v === "_new") {
                      const newLief = prompt("Neuer Lieferant:");
                      if (newLief?.trim()) setForm(f => ({ ...f, lieferant: newLief.trim() }));
                    } else {
                      setForm(f => ({ ...f, lieferant: v === "none" ? "" : v }));
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {lieferanten.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      <SelectItem value="_new" className="text-primary font-medium">+ Neuer Lieferant...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Kurzbezeichnung *</Label>
                <Input value={form.kurzbezeichnung} onChange={(e) => setForm(f => ({ ...f, kurzbezeichnung: e.target.value }))} placeholder="Kurzname des Artikels" />
              </div>
              <div>
                <Label>Langbezeichnung</Label>
                <Textarea
                  value={form.langbezeichnung}
                  onChange={(e) => setForm(f => ({ ...f, langbezeichnung: e.target.value }))}
                  placeholder="Detaillierte Beschreibung für Angebot/Rechnung (Plain-Text, Zeilenumbrüche erlaubt)"
                  rows={6}
                />
              </div>

              {/* Foto-Upload */}
              <div className="border rounded-lg p-3 bg-muted/20">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <ImagePlus className="w-4 h-4" /> Foto (optional)
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  Wird nur im Katalog + diesem Dialog angezeigt, nicht auf dem PDF.
                </p>
                <div className="flex items-center gap-3">
                  {editFotoUrl ? (
                    <img
                      src={editFotoUrl}
                      alt="Material-Foto"
                      className="w-20 h-20 object-cover rounded border shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded border bg-background flex items-center justify-center shrink-0">
                      <ImagePlus className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFotoSelect(file);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" disabled={fotoUploading} asChild>
                        <span className="cursor-pointer">
                          {fotoUploading ? "Lädt..." : (editFotoUrl ? "Foto austauschen" : "Foto hochladen")}
                        </span>
                      </Button>
                    </label>
                    {editFotoUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleFotoRemove}>
                        <X className="w-4 h-4 mr-1" /> Entfernen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {/* Kalkulation — prominent über den Preisfeldern (nach Excel-Vorlage) */}
              {!form.ist_set && (
                <div className="border-2 border-primary/30 bg-primary/5 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="font-semibold text-primary text-base">🧮 Kalkulation</Label>
                      <p className="text-xs text-muted-foreground">Verkaufspreis automatisch aus EK + Verschnitt + Aufschlag + Lohn berechnen (nach deiner Excel)</p>
                    </div>
                    <Switch
                      checked={form.ist_kalkuliert}
                      onCheckedChange={(c) => setForm(f => {
                        const next = { ...f, ist_kalkuliert: !!c };
                        if (c) {
                          const vk = calcEinzelpreis({
                            ek_preis: f.ek_netto, verschnitt_prozent: f.verschnitt_prozent,
                            aufschlag_prozent: f.aufschlag_prozent, befestigung_preis: f.befestigung_preis,
                            sonstiges_preis: f.sonstiges_preis, arbeitszeit_minuten: f.arbeitszeit_minuten,
                            stundensatz: f.stundensatz || 52,
                          });
                          next.vk_netto = vk; next.netto_preis = vk;
                          next.brutto_preis = Math.round(vk * (1 + f.ust_satz / 100) * 100) / 100;
                        }
                        return next;
                      })}
                    />
                  </div>
                  {form.ist_kalkuliert && (
                    <KalkulationFields
                      einheit={form.einheit}
                      value={{
                        ek_preis: form.ek_netto, verschnitt_prozent: form.verschnitt_prozent,
                        aufschlag_prozent: form.aufschlag_prozent, befestigung_preis: form.befestigung_preis,
                        sonstiges_preis: form.sonstiges_preis, arbeitszeit_minuten: form.arbeitszeit_minuten,
                        stundensatz: form.stundensatz || 52,
                      }}
                      onChange={(v) => setForm(f => {
                        const vk = calcEinzelpreis(v);
                        return {
                          ...f,
                          ek_netto: v.ek_preis, verschnitt_prozent: v.verschnitt_prozent,
                          aufschlag_prozent: v.aufschlag_prozent, befestigung_preis: v.befestigung_preis,
                          sonstiges_preis: v.sonstiges_preis, arbeitszeit_minuten: v.arbeitszeit_minuten,
                          stundensatz: v.stundensatz,
                          vk_netto: vk, netto_preis: vk,
                          brutto_preis: Math.round(vk * (1 + f.ust_satz / 100) * 100) / 100,
                        };
                      })}
                    />
                  )}
                  {form.ist_kalkuliert && (
                    <p className="text-xs text-muted-foreground">Der berechnete Verkaufspreis steht unten als „VK netto".</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label>Einheit</Label>
                  <Select value={form.einheit} onValueChange={(v) => setForm(f => ({ ...f, einheit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {einheiten.map(e => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>EK netto (€)</Label>
                  <Input type="number" value={form.ek_netto || ""} onChange={(e) => {
                    const ek = Number(e.target.value);
                    setForm(f => ({ ...f, ek_netto: ek }));
                  }} min={0} step={0.01} />
                </div>
                <div>
                  <Label>VK netto (€)</Label>
                  <Input
                    type="number"
                    value={form.vk_netto || ""}
                    onChange={(e) => {
                      const vk = Number(e.target.value);
                      setForm(f => ({
                        ...f,
                        vk_netto: vk,
                        netto_preis: vk,
                        brutto_preis: Math.round(vk * (1 + f.ust_satz / 100) * 100) / 100,
                        vk_preis_manuell: f.ist_set ? true : f.vk_preis_manuell,
                      }));
                    }}
                    min={0}
                    step={0.01}
                    disabled={(form.ist_set && !form.vk_preis_manuell) || form.ist_kalkuliert}
                  />
                </div>
                <div>
                  <Label>USt-Satz (%)</Label>
                  <Select value={String(form.ust_satz)} onValueChange={(v) => {
                    const ust = Number(v);
                    setForm(f => ({ ...f, ust_satz: ust, brutto_preis: Math.round((f.vk_netto || f.netto_preis) * (1 + ust / 100) * 100) / 100 }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="10">10%</SelectItem>
                      <SelectItem value="13">13%</SelectItem>
                      <SelectItem value="20">20%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Brutto (€)</Label>
                  <Input
                    type="number"
                    value={Math.round((form.vk_netto || 0) * (1 + form.ust_satz / 100) * 100) / 100 || ""}
                    onChange={(e) => {
                      const brutto = Number(e.target.value);
                      const vk = form.ust_satz > 0 ? Math.round(brutto / (1 + form.ust_satz / 100) * 100) / 100 : brutto;
                      setForm(f => ({
                        ...f,
                        vk_netto: vk,
                        netto_preis: vk,
                        brutto_preis: brutto,
                        vk_preis_manuell: f.ist_set ? true : f.vk_preis_manuell,
                      }));
                    }}
                    min={0}
                    step={0.01}
                    disabled={(form.ist_set && !form.vk_preis_manuell) || form.ist_kalkuliert}
                  />
                </div>
              </div>
              {/* Marge-Anzeige */}
              {form.vk_netto > 0 && (
                <div className="text-xs text-muted-foreground -mt-2">
                  {form.ek_netto > 0 ? (
                    <>Marge: <span className={`font-mono ${form.vk_netto >= form.ek_netto ? "text-green-600" : "text-destructive"}`}>
                      {(((form.vk_netto - form.ek_netto) / form.ek_netto) * 100).toFixed(1)} %
                    </span> (€ {(form.vk_netto - form.ek_netto).toFixed(2)} Aufschlag)</>
                  ) : (
                    <>Kein EK hinterlegt — Marge nicht berechenbar.</>
                  )}
                </div>
              )}
              {/* Preisanpassung — nur bei bestehendem Material */}
              {editId && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    Preisanpassung
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex border rounded-md overflow-hidden h-9">
                      <button
                        type="button"
                        className={`px-3 text-sm flex items-center gap-1 transition-colors ${priceAdjustMode === "prozent" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setPriceAdjustMode("prozent")}
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={`px-3 text-sm flex items-center gap-1 transition-colors ${priceAdjustMode === "euro" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setPriceAdjustMode("euro")}
                      >
                        <Euro className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <Input
                        type="number"
                        step={priceAdjustMode === "prozent" ? "0.1" : "0.01"}
                        placeholder={priceAdjustMode === "prozent" ? "z.B. 5 für +5%" : "z.B. 2.50 für +€2,50"}
                        value={priceAdjustValue}
                        onChange={(e) => setPriceAdjustValue(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={!priceAdjustValue || Number(priceAdjustValue) === 0}
                      onClick={() => {
                        const val = Number(priceAdjustValue);
                        if (!val) return;
                        setForm(f => {
                          const baseVk = f.vk_netto || f.netto_preis;
                          let newVk: number;
                          if (priceAdjustMode === "prozent") {
                            newVk = Math.round(baseVk * (1 + val / 100) * 100) / 100;
                          } else {
                            newVk = Math.round((baseVk + val) * 100) / 100;
                          }
                          if (newVk < 0) newVk = 0;
                          return {
                            ...f,
                            vk_netto: newVk,
                            netto_preis: newVk,
                            brutto_preis: Math.round(newVk * (1 + f.ust_satz / 100) * 100) / 100,
                            vk_preis_manuell: f.ist_set ? true : f.vk_preis_manuell,
                          };
                        });
                        const val2 = Number(priceAdjustValue);
                        const label = priceAdjustMode === "prozent" ? `${val2 > 0 ? "+" : ""}${val2}%` : `${val2 > 0 ? "+" : ""}€${Math.abs(val2).toFixed(2)}`;
                        toast({ title: `VK angepasst: ${label}` });
                        setPriceAdjustValue("");
                      }}
                    >
                      Anwenden
                    </Button>
                  </div>
                  {priceAdjustValue && Number(priceAdjustValue) !== 0 && (
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const val = Number(priceAdjustValue);
                        const baseVk = form.vk_netto || form.netto_preis;
                        let newVk: number;
                        if (priceAdjustMode === "prozent") {
                          newVk = Math.round(baseVk * (1 + val / 100) * 100) / 100;
                        } else {
                          newVk = Math.round((baseVk + val) * 100) / 100;
                        }
                        if (newVk < 0) newVk = 0;
                        const diff = newVk - baseVk;
                        return `VK: € ${baseVk.toFixed(2)} → € ${newVk.toFixed(2)} (${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`;
                      })()}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Checkbox id="lagerartikel" checked={form.ist_lagerartikel} onCheckedChange={(c) => setForm(f => ({ ...f, ist_lagerartikel: !!c }))} />
                  <Label htmlFor="lagerartikel" className="cursor-pointer">Lagerartikel</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="ist_set" checked={form.ist_set} onCheckedChange={(c) => setForm(f => ({ ...f, ist_set: !!c }))} />
                  <Label htmlFor="ist_set" className="cursor-pointer flex items-center gap-1.5">
                    <Boxes className="w-4 h-4" />
                    Dies ist ein Set / Stückliste
                  </Label>
                </div>
              </div>

              {/* Set-Editor: nur sichtbar wenn ist_set=true */}
              {form.ist_set && (
                <MaterialSetEditor
                  components={setComponents}
                  onChange={setSetComponents}
                  bezugseinheit={form.bezugseinheit}
                  onBezugseinheitChange={(v) =>
                    setForm(f => ({ ...f, bezugseinheit: v, einheit: v || f.einheit }))
                  }
                  aufschlag_prozent={form.aufschlag_prozent}
                  onAufschlagChange={(v) =>
                    setForm(f => ({ ...f, aufschlag_prozent: v }))
                  }
                  currentVk={form.vk_netto}
                  vk_preis_manuell={form.vk_preis_manuell}
                  onAcceptAutoVk={(autoVk) => {
                    setForm(f => ({
                      ...f,
                      vk_netto: autoVk,
                      netto_preis: autoVk,
                      brutto_preis: Math.round(autoVk * (1 + f.ust_satz / 100) * 100) / 100,
                      vk_preis_manuell: false,
                    }));
                    toast({ title: "Set-VK übernommen", description: `Auto-Kalkulation: € ${autoVk.toFixed(2)} netto.` });
                  }}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={!form.kurzbezeichnung?.trim()} className="gap-2">
                <Save className="w-4 h-4" />
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MaterialFileImport
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); fetchTemplates(); }}
        />

        <BulkPriceDialog
          open={bulkPriceOpen}
          onClose={() => setBulkPriceOpen(false)}
          onApplied={fetchTemplates}
          kategorien={kategorien}
          lieferanten={lieferanten}
        />
      </div>
    </div>
  );
}
