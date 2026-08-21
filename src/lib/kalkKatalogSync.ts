/**
 * Kalkulationszeilen den Stammdaten-Preisen nachführen (Kundenmeldung
 * 21.08.2026: "wenn ich den Preis in den Stammdaten ändere passt es wieder
 * nicht").
 *
 * Hintergrund: Beim Auswählen eines Katalog-Artikels KOPIERT die Zeile die
 * Preise — eine spätere Stammdaten-Änderung erreichte die Kalkulation nie.
 * Jetzt trägt jede Zeile den Katalogpreis der Übernahme als Vergleichswert
 * (katalogEk/katalogVk) und der Editor gleicht beim Laden und nach jeder
 * Stammdaten-Änderung ab:
 *
 *   - Zeile unverändert (Preis == Vergleichswert) → neuer Katalogpreis wird
 *     übernommen, Vergleichswert mitgezogen.
 *   - Zeile bewusst abweichend (Preis != Vergleichswert) → bleibt stehen;
 *     erst das erneute Auswählen des Artikels holt wieder den Katalogpreis.
 *   - Alt-Zeile ohne Vergleichswert (vor 21.08.2026) → Katalogpreis wird
 *     EINMALIG übernommen und der Vergleichswert gesetzt. Bewusste Abweichung
 *     ist dort nicht erkennbar — die Nachführung ist der Kundenwunsch.
 *
 * Manuelle Zeilen, "Holz berechnen"-Zeilen und frei eingetippte Artikel
 * (nicht im Katalog) bleiben unberührt.
 */
import type { KalkModule, MaterialRow } from "./kalkulationEngine";
import { num } from "./kalkulationEngine";

/** Struktur-Typen statt Import aus useKalkKatalog (das zöge den Supabase-Client in die Tests). */
export interface KatalogArtikelPreis { name: string; ek: number | null; vk: number | null; }
export interface KatalogKategoriePreise { name: string; artikel: KatalogArtikelPreis[]; }

const norm = (s: string | null | undefined): string => (s || "").trim().toLowerCase();
const gleich = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

function findePreis(
  kategorien: KatalogKategoriePreise[], kategorie: string, artikel: string,
): KatalogArtikelPreis | undefined {
  if (!norm(artikel)) return undefined;
  const kat = kategorien.find((k) => norm(k.name) === norm(kategorie));
  return kat?.artikel.find((a) => norm(a.name) === norm(artikel));
}

/** Eine Zeile abgleichen; liefert null, wenn nichts zu ändern ist. */
function syncZeile(row: MaterialRow, kategorien: KatalogKategoriePreise[]): MaterialRow | null {
  if (row.manual || row.calc) return null;
  const art = findePreis(kategorien, row.category, row.product);
  if (!art) return null;
  const ekNeu = num(art.ek);
  const vkNeu = num(art.vk);
  const patch: Partial<MaterialRow> = {};

  const feld = (
    preisFeld: "ekPrice" | "vkPrice", baselineFeld: "katalogEk" | "katalogVk", neu: number,
  ) => {
    const baseline = row[baselineFeld];
    if (baseline === undefined || baseline === null) {
      // Alt-Zeile: Katalogpreis einmalig übernehmen, Vergleichswert setzen.
      if (!gleich(row[preisFeld], neu)) patch[preisFeld] = neu;
      patch[baselineFeld] = neu;
    } else if (gleich(row[preisFeld], baseline)) {
      // Unveränderte Zeile folgt den Stammdaten.
      if (!gleich(baseline, neu)) { patch[preisFeld] = neu; patch[baselineFeld] = neu; }
    }
    // Bewusst abweichende Zeile: nichts anfassen.
  };
  feld("ekPrice", "katalogEk", ekNeu);
  feld("vkPrice", "katalogVk", vkNeu);

  // Nur echte Wert-Änderungen melden (das reine Setzen eines fehlenden
  // Vergleichswerts erzeugt sonst bei jedem Öffnen "Änderungen").
  const wertGeaendert = patch.ekPrice !== undefined || patch.vkPrice !== undefined;
  const baselineGesetzt = patch.katalogEk !== undefined || patch.katalogVk !== undefined;
  if (!wertGeaendert && !baselineGesetzt) return null;
  return { ...row, ...patch };
}

export interface KatalogSyncErgebnis {
  modules: KalkModule[];
  /** Zeilen, deren PREIS sich geändert hat (nicht nur der Vergleichswert). */
  preisZeilen: number;
}

export function syncePreiseMitKatalog(
  modules: KalkModule[], kategorien: KatalogKategoriePreise[],
): KatalogSyncErgebnis {
  let preisZeilen = 0;
  let irgendwasNeu = false;
  const neueModule = modules.map((m) => {
    let modulNeu = false;
    const rows = m.materialRows.map((row) => {
      const neu = syncZeile(row, kategorien);
      if (!neu) return row;
      modulNeu = true;
      if (!gleich(num(neu.ekPrice), num(row.ekPrice)) || !gleich(num(neu.vkPrice), num(row.vkPrice))) preisZeilen++;
      return neu;
    });
    if (!modulNeu) return m;
    irgendwasNeu = true;
    return { ...m, materialRows: rows };
  });
  return { modules: irgendwasNeu ? neueModule : modules, preisZeilen };
}
