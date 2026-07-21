// ============================================================================
// ProjektUebersicht — Kopf des Tabs "Aufbau Kalkulation":
// links die Summary-Tabelle (je Aufbau eine Zeile, adjustierte Werte, inkl.
// Marge-Spalte), rechts das Auswertungs-Panel (Gesamt / Optional / ohne
// Optional, wie Excel-Überblick N3) mit Material/Arbeit-Kreisdiagramm und
// darunter das Panel "Verdienst (Deckungsbeitrag)" — Erlös vs. Selbstkosten.
// ============================================================================
import { AlertTriangle } from "lucide-react";
import {
  ProjektErgebnis, VerdienstErgebnis, MargeAmpel,
  fmt, fmtEuro, margeAmpel, margeStatus,
} from "@/lib/kalkulationEngine";

/** Farbklassen der Marge-Ampel (grün ≥ Schwelle+10, gelb ≥ Schwelle, rot darunter). */
const AMPEL_TEXT: Record<MargeAmpel, string> = {
  gruen: "text-kb-green",
  gelb: "text-amber-600",
  rot: "text-destructive",
};
const AMPEL_BADGE: Record<MargeAmpel, string> = {
  gruen: "bg-kb-green/10 text-kb-green",
  gelb: "bg-amber-500/10 text-amber-700",
  rot: "bg-destructive/10 text-destructive font-bold",
};

/**
 * Marge als farbiges Badge.
 *
 * Edge-Case-Review 2026-07-21: Kosten ohne jeden Erlös (Erlös 0 €,
 * Selbstkosten 5.000 €) zeigten bloß ein unauffälliges "–". Dieser Fall ist
 * eine reine Verlustkalkulation und wird jetzt rot als "Verlust" ausgewiesen;
 * nur ein wirklich leerer Aufbau bleibt neutral.
 */
function MargeBadge({ v, schwelle }: { v: VerdienstErgebnis; schwelle: number }) {
  const status = margeStatus(v, schwelle);
  if (status === "leer") return <span className="text-muted-foreground">–</span>;
  if (status === "keinErloes") {
    return (
      <span
        className="inline-block rounded bg-destructive/10 px-1.5 py-0.5 font-bold tabular-nums text-destructive"
        title={`Kein Erlös, aber ${fmtEuro(v.selbstkosten)} Kosten — reine Verlustkalkulation. Bitte Preise erfassen.`}
      >
        Verlust −{fmtEuro(v.selbstkosten)}
      </span>
    );
  }
  const ampel = margeAmpel(v.margeProzent, schwelle);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${AMPEL_BADGE[ampel]}`}
      title={
        `Deckungsbeitrag ${fmtEuro(v.deckungsbeitrag)} von ${fmtEuro(v.erloes)} Erlös` +
        (ampel === "rot" ? ` — unter der Warnschwelle von ${fmt(schwelle)} %` : "") +
        (v.unsicher ? " — enthält geschätzte Material-EK" : "")
      }
    >
      {fmt(v.margeProzent)} %{v.unsicher ? " *" : ""}
    </span>
  );
}

/** Panel "Verdienst (Deckungsbeitrag)" — die drei Sichten nebeneinander. */
function VerdienstPanel({ projekt }: { projekt: ProjektErgebnis }) {
  const schwelle = projekt.warnMargeProzent;
  const spalten: { label: string; v: VerdienstErgebnis }[] = [
    { label: "Gesamt", v: projekt.verdienst },
    { label: "Optional", v: projekt.verdienstOptional },
    { label: "ohne Optional", v: projekt.verdienstOhneOptional },
  ];
  const zeilen: { label: string; get: (v: VerdienstErgebnis) => number }[] = [
    { label: "Erlös", get: (v) => v.erloes },
    { label: "− Material-EK", get: (v) => v.materialEk },
    { label: "− Lohn-Selbstkosten", get: (v) => v.lohnSelbstkosten },
    { label: "− Fahrten", get: (v) => v.fahrtkosten },
    { label: "− Dienstleistungen", get: (v) => v.dienstleistungen },
  ];

  return (
    <div className="kb-panel min-w-0">
      <div className="border-b px-4 py-2.5 text-sm font-bold">Verdienst (Deckungsbeitrag)</div>
      <div className="p-3">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-1.5 text-left font-semibold" />
              {spalten.map((s) => (
                <th key={s.label} className="py-1.5 text-right font-semibold">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((r) => (
              <tr key={r.label} className="border-b">
                <td className="py-1.5 pr-2">{r.label}</td>
                {spalten.map((s) => (
                  <td key={s.label} className="py-1.5 text-right tabular-nums">{fmtEuro(r.get(s.v))}</td>
                ))}
              </tr>
            ))}
            <tr className="border-b-2 font-bold">
              <td className="py-1.5 pr-2">= Deckungsbeitrag</td>
              {spalten.map((s) => (
                <td
                  key={s.label}
                  className={`py-1.5 text-right tabular-nums ${s.v.deckungsbeitrag < 0 ? "text-destructive" : ""}`}
                >{fmtEuro(s.v.deckungsbeitrag)}</td>
              ))}
            </tr>
            <tr>
              <td className="py-1.5 pr-2 font-semibold">Marge</td>
              {spalten.map((s) => {
                const status = margeStatus(s.v, schwelle);
                return (
                  <td key={s.label} className="py-1.5 text-right font-bold tabular-nums">
                    {status === "leer" && <span className="text-muted-foreground">–</span>}
                    {status === "keinErloes" && (
                      <span className="text-destructive" title="Kosten ohne Erlös — reine Verlustkalkulation">
                        kein Erlös
                      </span>
                    )}
                    {status !== "leer" && status !== "keinErloes" && (
                      <span className={AMPEL_TEXT[margeAmpel(s.v.margeProzent, schwelle)]}>{fmt(s.v.margeProzent)} %</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
        </div>

        {/* Reine Verlustkalkulation: Kosten, aber kein Erlös. Früher stand hier
            nur ein "–" und nichts warnte. */}
        {margeStatus(projekt.verdienst, schwelle) === "keinErloes" && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 rounded border border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold leading-snug text-destructive">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Verlustkalkulation: {fmtEuro(projekt.verdienst.selbstkosten)} Kosten stehen 0,00 € Erlös
              gegenüber. Es fehlen Verkaufspreise (Material-VK bzw. Arbeitszeit).
            </span>
          </p>
        )}

        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Warnschwelle {fmt(schwelle)} % (Einstellungen). Lohn-Selbstkosten mit dem
          Selbstkostensatz, nicht mit dem verrechneten Mittellohn. Aufschlag/Skonto
          wirken nur auf den Erlös.
        </p>
        {projekt.verdienst.unsicher && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-700">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Unsicher: bei mindestens einer Materialzeile fehlt der EK — dort wurde der
              VK als EK angesetzt. Der echte Deckungsbeitrag liegt höher.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function Pie({ material, arbeit }: { material: number; arbeit: number }) {
  const total = material + arbeit;
  const size = 160, r = 70, cx = size / 2, cy = size / 2;
  if (total <= 0) {
    return (
      <svg width={size} height={size} className="mx-auto">
        <circle cx={cx} cy={cy} r={r} fill="hsl(213 20% 90%)" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-muted-foreground" fontSize="12">Keine Daten</text>
      </svg>
    );
  }
  const matPct = material / total;
  // Kreissegment für Material (ab 12 Uhr im Uhrzeigersinn), Rest = Arbeit.
  const angle = matPct * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const largeArc = matPct > 0.5 ? 1 : 0;
  return (
    <svg width={size} height={size} className="mx-auto" role="img" aria-label="Material-/Arbeit-Verteilung">
      <circle cx={cx} cy={cy} r={r} fill="#ED7D31" />
      {matPct >= 1 ? (
        <circle cx={cx} cy={cy} r={r} fill="#4472C4" />
      ) : matPct > 0 ? (
        <path d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`} fill="#4472C4" />
      ) : null}
      {matPct > 0.1 && (
        <text
          x={cx + (r / 1.8) * Math.sin(angle / 2)} y={cy - (r / 1.8) * Math.cos(angle / 2) + 4}
          textAnchor="middle" fill="#fff" fontSize="13" fontWeight={700}
        >{Math.round(matPct * 100)}%</text>
      )}
      {matPct < 0.9 && (
        <text
          x={cx - (r / 1.8) * Math.sin((2 * Math.PI - angle) / 2)}
          y={cy - (r / 1.8) * Math.cos(Math.PI + angle / 2) + 4}
          textAnchor="middle" fill="#fff" fontSize="13" fontWeight={700}
        >{Math.round((1 - matPct) * 100)}%</text>
      )}
    </svg>
  );
}

export function ProjektUebersicht({ projekt }: { projekt: ProjektErgebnis }) {
  const auswertungZeilen: { label: string; get: (s: typeof projekt.gesamt) => string }[] = [
    { label: "Material", get: (s) => fmtEuro(s.material) },
    { label: "Arbeitszeit", get: (s) => `${fmt(s.arbeitszeitH)} h` },
    { label: "Bus-Fahrten", get: (s) => fmt(s.busFahrten) },
    { label: "LKW-Fahrten", get: (s) => fmt(s.lkwFahrten) },
    { label: "Kranstunden", get: (s) => `${fmt(s.kranstunden)} h` },
    { label: "Speditionskosten", get: (s) => fmtEuro(s.spedition) },
    { label: "Lohnabdunst Kosten", get: (s) => fmtEuro(s.lohnabdunst) },
    { label: "Sonstige Kosten", get: (s) => fmtEuro(s.sonstige) },
  ];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* Summary — am Handy Karten (Tabelle mit 9 Spalten ist dort unlesbar) */}
      <div className="kb-panel min-w-0 self-start sm:hidden">
        <div className="border-b px-4 py-2.5 text-sm font-bold">Projektübersicht</div>
        <div className="space-y-2 p-2">
          {projekt.zeilen.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Noch kein Aufbau angelegt.</p>
          )}
          {projekt.zeilen.map((z, i) => (
            <div key={z.module.id} className={`rounded border p-2 ${z.module.isOptional ? "border-dashed bg-muted/20" : ""}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">
                  {z.module.name || `Aufbau ${i + 1}`}{z.module.isOptional ? " (optional)" : ""}
                </span>
                <span className="whitespace-nowrap text-sm font-bold tabular-nums">{fmtEuro(z.gesamtAdj)}</span>
              </div>
              {z.module.note && <div className="mb-1 text-[11px] text-muted-foreground">{z.module.note}</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>Material <b className="tabular-nums text-foreground">{fmtEuro(z.materialAdj)}</b></span>
                <span>Arbeit <b className="tabular-nums text-foreground">{fmtEuro(z.laborAdj)}</b></span>
                <span>pro qm <b className="tabular-nums text-foreground">{fmtEuro(z.proQmAdj)}</b></span>
                <span className="flex items-center gap-1">Marge <MargeBadge v={z.verdienst} schwelle={projekt.warnMargeProzent} /></span>
              </div>
            </div>
          ))}
          {projekt.zeilen.length > 0 && (
            <div className="rounded border-2 bg-muted/40 p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold">Gesamt (Projekt)</span>
                <span className="whitespace-nowrap text-base font-bold tabular-nums">{fmtEuro(projekt.totalGesamt)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>Material <b className="tabular-nums text-foreground">{fmtEuro(projekt.totalMaterial)}</b></span>
                <span>Arbeit <b className="tabular-nums text-foreground">{fmtEuro(projekt.totalArbeit)}</b></span>
                <span className="flex items-center gap-1">Marge <MargeBadge v={projekt.verdienst} schwelle={projekt.warnMargeProzent} /></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary-Tabelle (ab sm) */}
      <div className="kb-panel hidden min-w-0 self-start overflow-x-auto sm:block">
        <div className="border-b px-4 py-2.5 font-bold text-sm">Projektübersicht</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Aufbau</th>
              <th className="px-3 py-2 font-semibold">Notiz</th>
              <th className="px-3 py-2 text-right font-semibold">Material</th>
              <th className="px-3 py-2 text-right font-semibold">Arbeit</th>
              <th className="px-3 py-2 text-right font-semibold">Gesamt</th>
              <th className="px-3 py-2 text-right font-semibold">pro qm</th>
              <th className="px-3 py-2 text-right font-semibold">% Material</th>
              <th className="px-3 py-2 text-right font-semibold">% Arbeit</th>
              <th className="px-3 py-2 text-right font-semibold" title="Deckungsbeitrag in % vom Erlös">Marge</th>
            </tr>
          </thead>
          <tbody>
            {projekt.zeilen.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Noch kein Aufbau angelegt.</td></tr>
            )}
            {projekt.zeilen.map((z, i) => (
              <tr key={z.module.id} className={`border-b last:border-b-0 ${z.module.isOptional ? "italic text-muted-foreground" : ""}`}>
                <td className="px-3 py-1.5">{z.module.name || `Aufbau ${i + 1}`}{z.module.isOptional ? " (optional)" : ""}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{z.module.note}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtEuro(z.materialAdj)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtEuro(z.laborAdj)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">{fmtEuro(z.gesamtAdj)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtEuro(z.proQmAdj)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmt(z.pctMaterial)} %</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmt(z.pctArbeit)} %</td>
                <td className="px-3 py-1.5 text-right">
                  <MargeBadge v={z.verdienst} schwelle={projekt.warnMargeProzent} />
                </td>
              </tr>
            ))}
          </tbody>
          {projekt.zeilen.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-bold">
                <td className="whitespace-nowrap px-3 py-2" colSpan={2}>Gesamt (Projekt)</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtEuro(projekt.totalMaterial)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtEuro(projekt.totalArbeit)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtEuro(projekt.totalGesamt)}</td>
                <td className="px-3 py-2" />
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmt(projekt.pctMaterial)} %</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmt(projekt.pctArbeit)} %</td>
                <td className="px-3 py-2 text-right">
                  <MargeBadge v={projekt.verdienst} schwelle={projekt.warnMargeProzent} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Auswertung + Verdienst */}
      <div className="min-w-0 space-y-4">
        <div className="kb-panel min-w-0">
          <div className="border-b px-4 py-2.5 font-bold text-sm">Auswertung</div>
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[300px] text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 text-left font-semibold" />
                  <th className="py-1.5 text-right font-semibold">Gesamt</th>
                  <th className="py-1.5 text-right font-semibold">Optional</th>
                  <th className="py-1.5 text-right font-semibold">ohne Optional</th>
                </tr>
              </thead>
              <tbody>
                {auswertungZeilen.map((r) => (
                  <tr key={r.label} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-2">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.get(projekt.gesamt)}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.get(projekt.optional)}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.get(projekt.ohneOptional)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3">
              <Pie material={projekt.totalMaterial} arbeit={projekt.totalArbeit} />
              <div className="mt-1 flex justify-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#4472C4" }} /> Material</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#ED7D31" }} /> Arbeit</span>
              </div>
            </div>
          </div>
        </div>

        <VerdienstPanel projekt={projekt} />
      </div>
    </div>
  );
}
