// ============================================================================
// Rechenweg — aufklappbarer Block unter der Zusammenfassung eines Aufbaus
// (Kundenwunsch 24.08.2026: "dass ich sehe bei der einzelnen Position wie
// gerechnet wurde mit den Schritten").
//
// Jede Position zeigt ihre Formel MIT eingesetzten Zahlen. Geändert wird in
// den vorhandenen Feldern (Zeile / Spalte B / Stammdaten) — der Rechenweg
// rechnet live mit, weil er dieselben Engine-Ergebnisse anzeigt.
// ============================================================================
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Betriebsdaten, KalkModule, ModulErgebnis, fmt, fmtEuro, num,
  istRiegelZeile, istDaemmstoffZeile, zeilenVkIstManuell,
} from "@/lib/kalkulationEngine";

interface Props {
  m: KalkModule;
  erg: ModulErgebnis;
  bd: Betriebsdaten;
  faktor: number;
}

/** Eine Rechenweg-Zeile: Beschriftung, Formel, Ergebnis. */
function Schritt({ titel, formel, betrag }: { titel: string; formel: string; betrag: number }) {
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{titel}</span>
        <b className="shrink-0 tabular-nums">{fmtEuro(betrag)}</b>
      </div>
      <div className="text-[10px] leading-snug text-muted-foreground">{formel}</div>
    </div>
  );
}

export function Rechenweg({ m, erg, bd, faktor }: Props) {
  const [offen, setOffen] = useState(false);
  const area = num(m.area);
  const vkFaktor = bd.vkFaktor > 0 ? bd.vkFaktor : 1;

  /** Formeltext einer Materialzeile mit eingesetzten Zahlen. */
  const materialFormel = (z: ModulErgebnis["material"]["zeilen"][number]): string => {
    const row = z.row;
    const r = z.ergebnis;
    if (row.manual) {
      return r.vkAbgeleitet
        ? `Pauschale: EK ${fmt(num(row.ekPrice))} € × ${fmt(vkFaktor)} = ${fmt(r.vkAbsolut)} € gesamt (ohne × Fläche)`
        : `Pauschale ${fmt(r.vkAbsolut)} € gesamt (ohne × Fläche)`;
    }
    if (row.calc) {
      return `${fmt(area)} m² × ${fmt(num(row.lmPerQm))} lfm/m² × ${fmt(num(row.dimension))} cm × ${fmt(num(row.dimension2))} cm × ${fmt(num(row.ekPrice))} €/m³ = ${fmt(r.vkAbsolut)} € (EK = VK, ohne Aufschlag)`;
    }
    const manuellerVk = zeilenVkIstManuell(row, bd);
    if (istRiegelZeile(row)) {
      const basis = manuellerVk
        ? `VK ${fmt(num(row.vkPrice))} €/m³`
        : `${fmt(num(row.ekPrice))} €/m³ × ${fmt(vkFaktor)}`;
      return `${fmt(bd.riegelLfmProM2)} lfm/m² × ${fmt(bd.riegelBrettDicke)} cm × ${fmt(num(m.insulationThickness))} cm Wanddicke × ${basis} = ${fmt(r.vkProM2)} €/m² × ${fmt(area)} m²`;
    }
    if (istDaemmstoffZeile(row)) {
      const basis = manuellerVk
        ? `VK ${fmt(num(row.vkPrice))} €/m³`
        : `${fmt(num(row.ekPrice))} €/m³ × ${fmt(vkFaktor)}`;
      return `${basis} × ${fmt(num(m.insulationThickness) / 100)} m Dämmstärke = ${fmt(r.vkProM2)} €/m² × ${fmt(area)} m²`;
    }
    const basis = manuellerVk
      ? `VK ${fmt(r.vkProM2)} €/m²`
      : `EK ${fmt(num(row.ekPrice))} €/m² × ${fmt(vkFaktor)} = ${fmt(r.vkProM2)} €/m²`;
    return `${basis} × ${fmt(area)} m²`;
  };

  /** Fahrten-Formel: Staffel mit Maut ab bd.mautFreiKm, ×2 = hin+retour. */
  const fahrtFormel = (anzahl: number, satz: number, satzMaut: number): string => {
    const km = num(m.distanceKM);
    const frei = Math.min(km, bd.mautFreiKm);
    const maut = km - frei;
    const teil = maut > 0
      ? `(${fmt(frei)} km × ${fmt(satz)} € + ${fmt(maut)} km × ${fmt(satzMaut)} € Maut)`
      : `${fmt(km)} km × ${fmt(satz)} €`;
    return `${teil} × 2 (hin+retour) × ${fmt(anzahl)} Fahrten`;
  };

  const zeilenMitInhalt = erg.material.zeilen.filter((z) => z.vkBetrag > 0 || z.ekBetrag > 0);
  const zwischensumme = erg.grandTotal;

  return (
    <div className="rounded border">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        className="flex min-h-[40px] w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-semibold text-kb-blue-dark hover:bg-muted/50"
        aria-expanded={offen}
      >
        {offen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        Rechenweg anzeigen
      </button>
      {offen && (
        <div className="divide-y border-t px-2 pb-2 text-xs">
          {zeilenMitInhalt.map((z, i) => (
            <Schritt key={i} titel={z.bezeichnung || "Materialzeile"} formel={materialFormel(z)} betrag={z.vkBetrag} />
          ))}
          {erg.laborCosts > 0 && (
            <Schritt
              titel="Arbeitszeit"
              formel={`${fmt(num(m.days))} Tage × ${fmt(bd.stundenProTag)} h × ${fmt(num(m.workers))} Arbeiter × ${fmt(bd.mittellohn)} €/h`}
              betrag={erg.laborCosts}
            />
          )}
          {erg.transport.bus > 0 && (
            <Schritt titel="Busfahrten" formel={fahrtFormel(num(m.busTrips), bd.busKm, bd.busKmMaut)} betrag={erg.transport.bus} />
          )}
          {erg.transport.lkw > 0 && (
            <Schritt titel="LKW-Fahrten" formel={fahrtFormel(num(m.lkwTrips), bd.lkwKm, bd.lkwKmMaut)} betrag={erg.transport.lkw} />
          )}
          {erg.craneCosts > 0 && (
            <Schritt titel="Kranarbeiten" formel={`${fmt(num(m.craneHours))} h × ${fmt(bd.kranSatz)} €/h`} betrag={erg.craneCosts} />
          )}
          {num(m.shippingCosts) > 0 && <Schritt titel="Spedition" formel="fester Betrag" betrag={num(m.shippingCosts)} />}
          {num(m.paintCosts) > 0 && <Schritt titel="Lohnabdunst" formel="fester Betrag" betrag={num(m.paintCosts)} />}
          {num(m.miscCosts) > 0 && <Schritt titel="Sonstige Kosten" formel="fester Betrag" betrag={num(m.miscCosts)} />}

          <div className="pt-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">Zwischensumme</span>
              <b className="tabular-nums">{fmtEuro(zwischensumme)}</b>
            </div>
            {faktor !== 1 && (
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">× Faktor {fmt(faktor)} (1 + Aufschlag − Skonto)</span>
                <b className="tabular-nums">{fmtEuro(zwischensumme * faktor)}</b>
              </div>
            )}
          </div>

          <p className="pt-1.5 text-[10px] leading-snug text-muted-foreground">
            Ändern: direkt in den Feldern der Materialzeile bzw. bei „Arbeitszeit
            und Sonstiges" — der Rechenweg rechnet sofort mit. Die Sätze
            (Mittellohn, Fahrt-Sätze, Aufschlag {fmt(vkFaktor)}, {fmt(bd.riegelLfmProM2)} lfm/m²)
            stehen im Tab „Einstellungen &amp; Stammdaten".
          </p>
        </div>
      )}
    </div>
  );
}
