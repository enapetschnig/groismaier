import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  calcKalkulation,
  type KalkBaustein,
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

  const set = (key: Exclude<keyof KalkulationInput, "bausteine">, raw: string) => {
    const n = raw === "" ? 0 : parseFloat(raw.replace(",", "."));
    onChange({ ...value, [key]: Number.isFinite(n) ? n : 0 });
  };

  const field = (
    key: Exclude<keyof KalkulationInput, "bausteine">,
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

      {/* Freie Kostenbausteine (Kundenwunsch 3.4): Rohware, Transport,
          Handling, Helfer, Entsorgung, Maschinenkosten … je Einheit. */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Kostenbausteine je {einheit} (Transport, Handling, Maschine …)
          </Label>
          <Button
            type="button" variant="outline" size="sm" className="h-8"
            disabled={disabled}
            onClick={() => onChange({ ...value, bausteine: [...(value.bausteine || []), { bezeichnung: "", betrag: 0 }] })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Baustein
          </Button>
        </div>
        {(value.bausteine || []).length > 0 && (
          <div className="space-y-1.5">
            {(value.bausteine || []).map((b: KalkBaustein, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] items-center gap-1.5">
                <Input
                  className="h-9"
                  placeholder="z. B. Transport ins Lager"
                  list="kalk-baustein-vorschlaege"
                  value={b.bezeichnung}
                  disabled={disabled}
                  onChange={(e) => onChange({
                    ...value,
                    bausteine: (value.bausteine || []).map((x, j) => j === i ? { ...x, bezeichnung: e.target.value } : x),
                  })}
                />
                <div className="relative">
                  <Input
                    type="number" inputMode="decimal" step="any" className="h-9 pr-7"
                    placeholder="0"
                    value={b.betrag === 0 ? "" : b.betrag}
                    disabled={disabled}
                    onChange={(e) => {
                      const n = e.target.value === "" ? 0 : parseFloat(e.target.value.replace(",", "."));
                      onChange({
                        ...value,
                        bausteine: (value.bausteine || []).map((x, j) => j === i ? { ...x, betrag: Number.isFinite(n) ? n : 0 } : x),
                      });
                    }}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                </div>
                <Button
                  type="button" variant="ghost" size="icon" className="h-9 w-9"
                  aria-label="Baustein entfernen" disabled={disabled}
                  onClick={() => onChange({ ...value, bausteine: (value.bausteine || []).filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <datalist id="kalk-baustein-vorschlaege">
          <option value="Rohware" /><option value="Transport ins Lager" /><option value="Handling" />
          <option value="Helfer Maschine" /><option value="Müllentsorgung" /><option value="Maschinenkosten" />
        </datalist>
      </div>

      {/* Kalkulations-Aufschlüsselung */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Materialkosten</span>
          <span className="text-right tabular-nums">{fmt(result.materialkosten)} €</span>
          <span className="text-muted-foreground">Lohnkosten</span>
          <span className="text-right tabular-nums">{fmt(result.lohnkosten)} €</span>
          {result.bausteineSumme > 0 && (
            <>
              <span className="text-muted-foreground">Kostenbausteine</span>
              <span className="text-right tabular-nums">{fmt(result.bausteineSumme)} €</span>
            </>
          )}
          {result.zuschlaege - result.bausteineSumme > 0 && (
            <>
              <span className="text-muted-foreground">Befestigung + Sonstiges</span>
              <span className="text-right tabular-nums">{fmt(result.zuschlaege - result.bausteineSumme)} €</span>
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
