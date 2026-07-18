// ============================================================================
// ProjektUebersicht — Kopf des Tabs "Aufbau Kalkulation":
// links die Summary-Tabelle (je Aufbau eine Zeile, adjustierte Werte),
// rechts das Auswertungs-Panel (Gesamt / Optional / ohne Optional, wie
// Excel-Überblick N3) mit Material/Arbeit-Kreisdiagramm.
// ============================================================================
import { ProjektErgebnis, fmt, fmtEuro } from "@/lib/kalkulationEngine";

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
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      {/* Summary-Tabelle */}
      <div className="kb-panel overflow-x-auto">
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
            </tr>
          </thead>
          <tbody>
            {projekt.zeilen.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Noch kein Aufbau angelegt.</td></tr>
            )}
            {projekt.zeilen.map((z, i) => (
              <tr key={z.module.id} className={`border-b last:border-b-0 ${z.module.isOptional ? "italic text-muted-foreground" : ""}`}>
                <td className="px-3 py-1.5">{z.module.name || `Aufbau ${i + 1}`}{z.module.isOptional ? " (optional)" : ""}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{z.module.note}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtEuro(z.materialAdj)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtEuro(z.laborAdj)}</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtEuro(z.gesamtAdj)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtEuro(z.proQmAdj)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(z.pctMaterial)} %</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(z.pctArbeit)} %</td>
              </tr>
            ))}
          </tbody>
          {projekt.zeilen.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-bold">
                <td className="px-3 py-2" colSpan={2}>Gesamt (Projekt)</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(projekt.totalMaterial)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(projekt.totalArbeit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(projekt.totalGesamt)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{fmt(projekt.pctMaterial)} %</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(projekt.pctArbeit)} %</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Auswertung */}
      <div className="kb-panel">
        <div className="border-b px-4 py-2.5 font-bold text-sm">Auswertung</div>
        <div className="p-3">
          <table className="w-full text-xs">
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
    </div>
  );
}
