// ============================================================================
// ArtikelKalkulationDialog — einen Artikel der Produktliste KALKULIEREN
// (Kundenwunsch 2026-08-19: „einzelne Positionen zu kalkulieren … dass dann
// der finale VK Preis daraus gezogen wird" — Beispiel Stroh: EK + Maschinen-
// kosten + Transport + Arbeitszeit + Aufschlag = VK).
//
// Wiederverwendet die KalkulationFields der Artikelmaske und speichert nach
// demselben Muster wie InvoiceTemplates.handleSave: ist_kalkuliert + die
// kalk-Felder, den berechneten Einzelpreis in vk_netto und die Spiegelfelder
// (netto_preis/einzelpreis/brutto_preis über den USt-Satz des Artikels).
// Damit rechnen Produktliste, Aufbau-Kalkulation und Belege mit demselben VK.
//
// Rechenregel (src/lib/kalkulation.ts, wie in der Artikelmaske):
//   Material = EK × (1 + Verschnitt %) × (1 + Aufschlag %)
//   VK = Material + Befestigung + Sonstiges + Kostenbausteine + AZ/60 × Satz
// Der Aufschlag wirkt also NUR auf den Material-EK — nicht auf Arbeitszeit
// oder Bausteine (Rückfrage an den Kunden läuft, ob er das anders will).
// ============================================================================
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { KalkulationFields } from "@/components/KalkulationFields";
import { calcEinzelpreis, DEFAULT_STUNDENSATZ, EMPTY_KALKULATION, type KalkulationInput } from "@/lib/kalkulation";
import { KatalogArtikel, mengenEinheit } from "./useKalkKatalog";

interface Props {
  /** Artikel aus dem Artikelstamm (quelle "template") — null: Dialog zu. */
  artikel: KatalogArtikel | null;
  onClose: (gespeichert: boolean) => void;
}

const fmt = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rund2 = (n: number): number => Math.round(n * 100) / 100;

export function ArtikelKalkulationDialog({ artikel, onClose }: Props) {
  const { toast } = useToast();
  const [input, setInput] = useState<KalkulationInput>({ ...EMPTY_KALKULATION });
  const [ust, setUst] = useState(20);
  const [warKalkuliert, setWarKalkuliert] = useState(false);
  const [laden, setLaden] = useState(false);
  const [speichern, setSpeichern] = useState(false);

  // Beim Öffnen frisch aus der DB lesen — der Katalog-Snapshot kennt die
  // kalk-Felder (Verschnitt, Bausteine …) nicht, nur EK/VK.
  useEffect(() => {
    if (!artikel) return;
    let aktiv = true;
    setLaden(true);
    (async () => {
      const { data, error } = (await supabase
        .from("invoice_templates")
        .select("ek_netto, verschnitt_prozent, aufschlag_prozent, befestigung_preis, sonstiges_preis, arbeitszeit_minuten, stundensatz, kalk_bausteine, ist_kalkuliert, ust_satz")
        .eq("id", artikel.id)
        .maybeSingle()) as { data: Record<string, unknown> | null; error: { message: string } | null };
      if (!aktiv) return;
      setLaden(false);
      if (error || !data) {
        toast({ variant: "destructive", title: "Fehler", description: error?.message || "Artikel nicht gefunden." });
        onClose(false);
        return;
      }
      setInput({
        ek_preis: Number(data.ek_netto) || 0,
        verschnitt_prozent: Number(data.verschnitt_prozent) || 0,
        aufschlag_prozent: Number(data.aufschlag_prozent) || 0,
        befestigung_preis: Number(data.befestigung_preis) || 0,
        sonstiges_preis: Number(data.sonstiges_preis) || 0,
        arbeitszeit_minuten: Number(data.arbeitszeit_minuten) || 0,
        stundensatz: Number(data.stundensatz) || DEFAULT_STUNDENSATZ,
        bausteine: Array.isArray(data.kalk_bausteine) ? (data.kalk_bausteine as KalkulationInput["bausteine"]) : [],
      });
      // USt 0 ist ein gueltiger Satz (z.B. Reverse Charge) — nur bei fehlendem
      // Wert auf den Standard 20 zurueckfallen, nicht bei 0.
      setUst(data.ust_satz === null || data.ust_satz === undefined ? 20 : Number(data.ust_satz));
      setWarKalkuliert(!!data.ist_kalkuliert);
    })();
    return () => { aktiv = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artikel?.id]);

  /**
   * Speichern — kalkuliert=true: VK ab jetzt aus der Kalkulation;
   * kalkuliert=false („Kalkulation lösen"): der aktuell berechnete Preis
   * bleibt als fester VK stehen, die kalk-Felder werden geleert (gleiches
   * Muster wie die Artikelmaske, damit beide Wege identisch speichern).
   */
  const speichere = async (kalkuliert: boolean) => {
    if (!artikel) return;
    const bausteine = (input.bausteine || []).filter((b) => b.bezeichnung.trim() || Number(b.betrag));
    const vk = calcEinzelpreis({ ...input, bausteine });
    // Schutz vor dem Preis-Wipe: Eine leere Kalkulation ergibt 0 € und würde
    // beim Speichern einen manuell gepflegten VK stillschweigend auf "kein
    // Preis" setzen. Nachfragen statt löschen.
    if (vk === 0 && !window.confirm(
      `Die Kalkulation ergibt 0 € — „${artikel.name}" würde ohne Preis gespeichert (ein vorhandener VK geht verloren). Trotzdem speichern?`,
    )) return;
    const vkOderNull = vk === 0 ? null : vk;
    const ek = rund2(Number(input.ek_preis) || 0);
    const payload = {
      ist_kalkuliert: kalkuliert,
      ek_netto: ek === 0 ? null : ek,
      verschnitt_prozent: kalkuliert ? Number(input.verschnitt_prozent) || 0 : 0,
      aufschlag_prozent: kalkuliert ? Number(input.aufschlag_prozent) || 0 : 0,
      befestigung_preis: kalkuliert ? Number(input.befestigung_preis) || 0 : 0,
      sonstiges_preis: kalkuliert ? Number(input.sonstiges_preis) || 0 : 0,
      arbeitszeit_minuten: kalkuliert ? Number(input.arbeitszeit_minuten) || 0 : 0,
      stundensatz: Number(input.stundensatz) || DEFAULT_STUNDENSATZ,
      kalk_bausteine: kalkuliert ? bausteine : [],
      vk_netto: vkOderNull,
      netto_preis: vkOderNull,
      einzelpreis: vkOderNull,
      brutto_preis: vkOderNull === null ? null : rund2(vk * (1 + ust / 100)),
    };
    setSpeichern(true);
    const { error } = await supabase.from("invoice_templates").update(payload as never).eq("id", artikel.id);
    setSpeichern(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({
      title: kalkuliert ? "Kalkulation gespeichert" : "Kalkulation gelöst",
      description: kalkuliert
        ? `„${artikel.name}": VK ${fmt(vk)} € wird ab jetzt aus der Kalkulation berechnet.`
        : `„${artikel.name}": VK ${fmt(vk)} € bleibt als fester Preis stehen.`,
    });
    onClose(true);
  };

  return (
    <Dialog open={!!artikel} onOpenChange={(o) => { if (!o) onClose(false); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Artikel kalkulieren — {artikel?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          EK + Verschnitt/Aufschlag + Kostenbausteine (Maschine, Transport …) + Arbeitszeit
          ergeben den Einzelpreis — er wird als VK des Artikels gespeichert und gilt überall
          (Produktliste, Aufbau-Kalkulation, Angebote/Rechnungen). Der Aufschlag wirkt auf den
          Material-EK, nicht auf Arbeitszeit oder Bausteine.
        </p>
        {laden ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Wird geladen …</div>
        ) : (
          <KalkulationFields
            value={input}
            onChange={setInput}
            einheit={mengenEinheit(artikel?.einheit) || "EH"}
          />
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          {warKalkuliert && (
            <Button
              type="button" variant="outline" disabled={laden || speichern}
              onClick={() => speichere(false)}
              title="Der aktuell berechnete VK bleibt als fester Preis stehen; EK/VK sind danach wieder direkt editierbar."
            >
              Kalkulation lösen
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onClose(false)}>Abbrechen</Button>
          <Button type="button" disabled={laden || speichern} onClick={() => speichere(true)}>
            {speichern ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
