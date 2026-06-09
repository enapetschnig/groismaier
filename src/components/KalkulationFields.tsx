import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcKalkulation,
  type KalkulationInput,
  DEFAULT_STUNDENSATZ,
} from "@/lib/kalkulation";

interface KalkulationFieldsProps {
  value: KalkulationInput;
  onChange: (next: KalkulationInput) => void;
  /** Einheit (z.B. "m2", "Stk.") — für die Preisanzeige. */
  einheit?: string;
  /** Kompakte Darstellung (z.B. im Positions-Popover). */
  compact?: boolean;
  /**
   * Dokumentweiter Aufschlag-Override (Angebot). Wenn gesetzt, wird er
   * statt des Positions-Aufschlags zur Berechnung verwendet und angezeigt.
   */
  aufschlagOverride?: number | null;
  disabled?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function KalkulationFields({
  value,
  onChange,
  einheit = "EH",
  compact = false,
  aufschlagOverride,
  disabled = false,
}: KalkulationFieldsProps) {
  const overrideActive =
    aufschlagOverride !== null && aufschlagOverride !== undefined && !Number.isNaN(Number(aufschlagOverride));
  const effectiveAufschlag = overrideActive ? Number(aufschlagOverride) : value.aufschlag_prozent;

  const result = calcKalkulation({ ...value, aufschlag_prozent: effectiveAufschlag });

  const set = (key: keyof KalkulationInput, raw: string) => {
    const n = raw === "" ? 0 : parseFloat(raw.replace(",", "."));
    onChange({ ...value, [key]: Number.isFinite(n) ? n : 0 });
  };

  const field = (
    key: keyof KalkulationInput,
    label: string,
    suffix?: string,
    readOnly = false,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={value[key] === 0 ? "" : value[key]}
          placeholder="0"
          disabled={disabled || readOnly}
          onChange={(e) => set(key, e.target.value)}
          className={suffix ? "pr-9" : ""}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        {field("ek_preis", "EK-Preis", "€")}
        {field("verschnitt_prozent", "Verschnitt", "%")}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Aufschlag {overrideActive && <span className="text-amber-600">(Angebot)</span>}
          </Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={value.aufschlag_prozent === 0 ? "" : value.aufschlag_prozent}
              placeholder="0"
              disabled={disabled || overrideActive}
              onChange={(e) => set("aufschlag_prozent", e.target.value)}
              className="pr-9"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              %
            </span>
          </div>
          {overrideActive && (
            <p className="text-[10px] text-amber-600">Override: {fmt(effectiveAufschlag)} %</p>
          )}
        </div>
        {field("befestigung_preis", "Befestigung", "€")}
        {field("sonstiges_preis", "Sonstiges", "€")}
        {field("arbeitszeit_minuten", "Arbeitszeit", "min")}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground" title="Standard: 52 €/h (Mittellohn) · Regie: 50 €/h">
            Stundensatz
          </Label>
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={value.stundensatz === 0 ? "" : value.stundensatz}
              placeholder={String(DEFAULT_STUNDENSATZ)}
              disabled={disabled}
              title="Standard: 52 €/h (Mittellohn) · Regie: 50 €/h"
              onChange={(e) => set("stundensatz", e.target.value)}
              className="pr-9"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              €/h
            </span>
          </div>
        </div>
      </div>

      {/* Kalkulations-Aufschlüsselung */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Materialkosten</span>
          <span className="text-right tabular-nums">{fmt(result.materialkosten)} €</span>
          <span className="text-muted-foreground">Lohnkosten</span>
          <span className="text-right tabular-nums">{fmt(result.lohnkosten)} €</span>
          {result.zuschlaege > 0 && (
            <>
              <span className="text-muted-foreground">Befestigung + Sonstiges</span>
              <span className="text-right tabular-nums">{fmt(result.zuschlaege)} €</span>
            </>
          )}
          <span className="font-semibold border-t pt-1 mt-1">Einzelpreis / {einheit}</span>
          <span className="text-right font-semibold tabular-nums border-t pt-1 mt-1 text-primary">
            {fmt(result.einzelpreis)} €
          </span>
        </div>
      </div>
    </div>
  );
}
