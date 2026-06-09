import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Building, User, CalendarPlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Einheitliche Kunden-Eingabemaske für alle drei Stellen:
 *   - Kunden-Hauptseite (src/pages/Customers.tsx)
 *   - Projekt anlegen (src/components/CreateProjectDialog.tsx)
 *   - Inline-Erstellung im Customer-Picker (src/components/CustomerSelect.tsx)
 *
 * Kernkonzept: Kundentyp-Toggle GANZ OBEN bestimmt, welche Identitäts-
 * Felder gezeigt werden:
 *   - Geschäftlich → "Firmenname"
 *   - Privat       → "Anrede" + "Titel" + "Vorname" + "Nachname"
 *
 * Die übrigen Felder (Adresse, Kontakt, etc.) sind bei beiden gleich.
 * Der Aufrufer entscheidet via `variant`:
 *   - "full"    : Hauptmaske mit Rechnungsadresse, Skonto, Herkunft, …
 *   - "minimal" : Nur Pflicht-/Kernfelder (für Inline-Erstellung)
 *
 * `composeCustomerName(form)` ist exportiert — der Aufrufer ruft das
 * vor dem DB-Insert/Update auf, damit die Legacy-Spalte `customers.name`
 * (FK-Referenz von Projekten/Rechnungen) konsistent gefüllt bleibt.
 */

export interface WichtigesDatum {
  label: string;
  datum: string;  // YYYY-MM-DD
  notiz?: string;
}

export interface CustomerFormData {
  name: string;
  kundennummer: string;
  anrede: string;
  titel: string;
  vorname: string;
  nachname: string;
  ansprechpartner: string;
  uid_nummer: string;
  adresse: string;
  plz: string;
  ort: string;
  land: string;
  email: string;
  telefon: string;
  telefon2: string;
  notizen: string;
  zahlungsbedingungen: string;
  skonto_prozent: number;
  skonto_tage: number;
  nettofrist: number;
  kundentyp: "geschaeftskunde" | "privatkunde";
  firmenname: string;
  branche: string;
  website: string;
  rechnungs_adresse: string;
  rechnungs_plz: string;
  rechnungs_ort: string;
  rechnungs_land: string;
  herkunft: string;
  wichtige_daten: WichtigesDatum[];
}

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  name: "",
  kundennummer: "",
  anrede: "",
  titel: "",
  vorname: "",
  nachname: "",
  ansprechpartner: "",
  uid_nummer: "",
  adresse: "",
  plz: "",
  ort: "",
  land: "Österreich",
  email: "",
  telefon: "",
  telefon2: "",
  notizen: "",
  zahlungsbedingungen: "",
  skonto_prozent: 0,
  skonto_tage: 0,
  nettofrist: 0,
  kundentyp: "geschaeftskunde",
  firmenname: "",
  branche: "",
  website: "",
  rechnungs_adresse: "",
  rechnungs_plz: "",
  rechnungs_ort: "",
  rechnungs_land: "",
  herkunft: "",
  wichtige_daten: [],
};

/**
 * Komponiert die Legacy-Spalte `customers.name` aus Kundentyp-Feldern.
 * Geschäftlich → Firmenname.
 * Privat       → "{Titel} {Vorname} {Nachname}" (getrimmt).
 *
 * Wird in Stable-Order zusammengebaut, damit Sortierung in Listen
 * konsistent bleibt (Vorname zuerst — wenn der User Liste nach
 * Nachname will, ist das ein separater Anzeige-Aspekt).
 */
export function composeCustomerName(form: CustomerFormData): string {
  if (form.kundentyp === "geschaeftskunde") {
    return form.firmenname.trim() || form.name.trim();
  }
  // Privatkunde
  const parts = [form.titel, form.vorname, form.nachname]
    .map((s) => (s || "").trim())
    .filter(Boolean);
  const composed = parts.join(" ");
  return composed || form.name.trim();
}

interface CustomerFormProps {
  value: CustomerFormData;
  onChange: (next: CustomerFormData) => void;
  variant?: "full" | "minimal";
  onSave?: () => void;
  saving?: boolean;
  editId?: string | null;
  /** Wenn true, zeigen wir keinen "Speichern"-Button (Aufrufer hat eigenen). */
  hideSaveButton?: boolean;
}

const ANREDE_OPTIONS = ["Herr", "Frau", "Divers", "Familie"];

export function CustomerForm({
  value: form,
  onChange,
  variant = "full",
  onSave,
  saving = false,
  editId = null,
  hideSaveButton = false,
}: CustomerFormProps) {
  const { toast } = useToast();
  const [vatChecking, setVatChecking] = useState(false);
  const [vatResult, setVatResult] = useState<{ valid: boolean; name?: string; address?: string; error?: string } | null>(null);
  const [herkunftOptions, setHerkunftOptions] = useState<Array<{ wert: string; label: string }>>([]);

  useEffect(() => {
    if (variant !== "full") return;
    (async () => {
      const { data } = await (supabase.from("admin_config_options" as never) as any)
        .select("wert, label")
        .eq("kategorie", "kunde_herkunft")
        .eq("is_active", true)
        .order("sort_order");
      setHerkunftOptions(((data as any[]) || []).map((o: any) => ({ wert: o.wert, label: o.label })));
    })();
  }, [variant]);

  const update = <K extends keyof CustomerFormData>(key: K, val: CustomerFormData[K]) => {
    onChange({ ...form, [key]: val });
  };

  const setKundentyp = (typ: "geschaeftskunde" | "privatkunde") => {
    onChange({
      ...form,
      kundentyp: typ,
      // Anrede defaultet bei Privat auf Herr/Frau, bei Geschäftlich kein Default
      anrede: typ === "privatkunde" && form.anrede === "Firma" ? "" : form.anrede,
    });
  };

  const isGeschaeftlich = form.kundentyp === "geschaeftskunde";

  return (
    <div className="space-y-4">
      {/* Kundentyp Toggle — IMMER ZUERST */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={isGeschaeftlich ? "default" : "outline"}
          onClick={() => setKundentyp("geschaeftskunde")}
          className="gap-2 h-11"
        >
          <Building className="w-4 h-4" />
          Geschäftlich
        </Button>
        <Button
          type="button"
          variant={!isGeschaeftlich ? "default" : "outline"}
          onClick={() => setKundentyp("privatkunde")}
          className="gap-2 h-11"
        >
          <User className="w-4 h-4" />
          Privat
        </Button>
      </div>

      {/* Identitäts-Felder je nach Kundentyp */}
      {isGeschaeftlich ? (
        <div className="space-y-3">
          <div>
            <Label>Firmenname *</Label>
            <Input
              value={form.firmenname}
              onChange={(e) => update("firmenname", e.target.value)}
              placeholder="z. B. Hobinger GmbH"
              autoFocus
            />
          </div>
          {variant === "full" && (
            <div>
              <Label>UID-Nummer</Label>
              <div className="flex gap-2">
                <Input
                  value={form.uid_nummer}
                  onChange={(e) => update("uid_nummer", e.target.value)}
                  placeholder="ATU12345678"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.uid_nummer || form.uid_nummer.length < 4 || vatChecking}
                  onClick={async () => {
                    setVatChecking(true);
                    setVatResult(null);
                    try {
                      const { data, error } = await supabase.functions.invoke("check-vat", {
                        body: { vatNumber: form.uid_nummer.replace(/\s/g, "") },
                      });
                      if (error) throw error;
                      setVatResult(data);
                      if (data.valid) {
                        toast({ title: "UID gültig", description: data.name ? `${data.name}` : "UID-Nummer ist gültig" });
                        if (data.name && !form.firmenname.trim()) {
                          onChange({ ...form, firmenname: data.name.trim() });
                        }
                        if (data.address && !form.adresse.trim()) {
                          onChange({ ...form, adresse: data.address.trim() });
                        }
                      } else {
                        toast({ variant: "destructive", title: "UID ungültig", description: data.error || "UID-Nummer konnte nicht verifiziert werden" });
                      }
                    } catch (err: any) {
                      toast({ variant: "destructive", title: "Prüfung fehlgeschlagen", description: err.message });
                    } finally {
                      setVatChecking(false);
                    }
                  }}
                >
                  {vatChecking ? "..." : "Prüfen"}
                </Button>
              </div>
              {vatResult && (
                <p className={`text-xs mt-1 ${vatResult.valid ? "text-green-600" : "text-red-600"}`}>
                  {vatResult.valid ? `✓ Gültig${vatResult.name ? `: ${vatResult.name}` : ""}` : `✗ ${vatResult.error || "Ungültig"}`}
                </p>
              )}
            </div>
          )}
          {variant === "full" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Branche</Label>
                <Input
                  value={form.branche}
                  onChange={(e) => update("branche", e.target.value)}
                  placeholder="z. B. Bau, IT, Handel"
                />
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                  placeholder="https://www.beispiel.at"
                />
              </div>
            </div>
          )}
          {variant === "full" && (
            <div>
              <Label>Ansprechpartner (optional)</Label>
              <Input
                value={form.ansprechpartner}
                onChange={(e) => update("ansprechpartner", e.target.value)}
                placeholder="z. B. Max Mustermann"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Anrede</Label>
              <Select
                value={form.anrede || "none"}
                onValueChange={(v) => update("anrede", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {ANREDE_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titel</Label>
              <Input
                value={form.titel}
                onChange={(e) => update("titel", e.target.value)}
                placeholder="Mag., Dr., Ing."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vorname *</Label>
              <Input
                value={form.vorname}
                onChange={(e) => update("vorname", e.target.value)}
                placeholder="Vorname"
                autoFocus
              />
            </div>
            <div>
              <Label>Nachname *</Label>
              <Input
                value={form.nachname}
                onChange={(e) => update("nachname", e.target.value)}
                placeholder="Nachname"
              />
            </div>
          </div>
        </div>
      )}

      {/* Adresse */}
      <div className="space-y-3 pt-2 border-t">
        <AddressAutocomplete
          label="Adresse"
          value={form.adresse}
          onChange={(v) => update("adresse", v)}
          onSelect={(addr) =>
            onChange({
              ...form,
              adresse: addr.street,
              plz: addr.plz,
              ort: addr.ort,
              land: addr.land || form.land,
            })
          }
          placeholder="Straße und Hausnummer"
        />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>PLZ</Label>
            <Input value={form.plz} onChange={(e) => update("plz", e.target.value)} />
          </div>
          <div>
            <Label>Ort</Label>
            <Input value={form.ort} onChange={(e) => update("ort", e.target.value)} />
          </div>
          <div>
            <Label>Land</Label>
            <Input value={form.land} onChange={(e) => update("land", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Kontakt */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>E-Mail</Label>
          <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input value={form.telefon} onChange={(e) => update("telefon", e.target.value)} />
        </div>
      </div>

      {variant === "full" && (
        <>
          <div>
            <Label>Telefon (zusätzlich)</Label>
            <Input value={form.telefon2} onChange={(e) => update("telefon2", e.target.value)} />
          </div>

          {/* Rechnungsadresse abweichend */}
          <div className="border-t pt-3">
            <Label className="text-sm font-medium">Rechnungsadresse (falls abweichend)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <Input
                placeholder="Straße"
                value={form.rechnungs_adresse}
                onChange={(e) => update("rechnungs_adresse", e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="PLZ"
                  className="w-24"
                  value={form.rechnungs_plz}
                  onChange={(e) => update("rechnungs_plz", e.target.value)}
                />
                <Input
                  placeholder="Ort"
                  className="flex-1"
                  value={form.rechnungs_ort}
                  onChange={(e) => update("rechnungs_ort", e.target.value)}
                />
              </div>
              <Input
                placeholder="Land"
                value={form.rechnungs_land}
                onChange={(e) => update("rechnungs_land", e.target.value)}
              />
            </div>
          </div>

          {/* Zahlungsbedingungen */}
          <div className="grid grid-cols-3 gap-3 border-t pt-3">
            <div>
              <Label>Zahlungsfrist (Tage)</Label>
              <Input
                type="number"
                value={form.nettofrist || ""}
                onChange={(e) => update("nettofrist", Number(e.target.value))}
                min={0}
                max={365}
              />
            </div>
            <div>
              <Label>Skonto %</Label>
              <Input
                type="number"
                value={form.skonto_prozent || ""}
                onChange={(e) => update("skonto_prozent", Number(e.target.value))}
                min={0}
                max={20}
                step={0.5}
              />
            </div>
            <div>
              <Label>Skonto Tage</Label>
              <Input
                type="number"
                value={form.skonto_tage || ""}
                onChange={(e) => update("skonto_tage", Number(e.target.value))}
                min={0}
                max={form.nettofrist || 365}
              />
            </div>
          </div>

          <div>
            <Label>Kundennummer</Label>
            {editId ? (
              <>
                <Input
                  value={form.kundennummer}
                  onChange={(e) => update("kundennummer", e.target.value)}
                  placeholder="z. B. 10001"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Manuelle Änderung nur bei Bedarf — Duplikate werden geprüft.
                </p>
              </>
            ) : (
              <>
                <Input
                  value=""
                  disabled
                  placeholder="Wird automatisch vergeben"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Nummer wird beim Speichern fortlaufend zugewiesen.
                </p>
              </>
            )}
          </div>

          <div>
            <Label>Herkunft / Referenz</Label>
            <Select
              value={form.herkunft || "_none"}
              onValueChange={(v) => update("herkunft", v === "_none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Woher kam der Kunde?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— keine Angabe —</SelectItem>
                {herkunftOptions.map((o) => (
                  <SelectItem key={o.wert} value={o.label}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Liste erweiterbar unter Admin → Konfiguration → <em>kunde_herkunft</em>.
            </p>
          </div>

          {/* Wichtige Daten */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Wichtige Daten</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1"
                onClick={() => {
                  const next: WichtigesDatum[] = [
                    ...(form.wichtige_daten || []),
                    { label: "", datum: "", notiz: "" },
                  ];
                  update("wichtige_daten", next);
                }}
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Datum hinzufügen
              </Button>
            </div>
            {(form.wichtige_daten || []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Z. B. Geburtstag, Tag der Projektübergabe, Garantie-Ende, …
              </p>
            ) : (
              <div className="space-y-2">
                {(form.wichtige_daten || []).map((entry, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_140px_28px] gap-2 items-end">
                    <div>
                      <Label className="text-[10px]">Bezeichnung</Label>
                      <Input
                        value={entry.label}
                        onChange={(e) => {
                          const next = [...form.wichtige_daten];
                          next[idx] = { ...entry, label: e.target.value };
                          update("wichtige_daten", next);
                        }}
                        placeholder="z. B. Geburtstag"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Datum</Label>
                      <Input
                        type="date"
                        value={entry.datum}
                        onChange={(e) => {
                          const next = [...form.wichtige_daten];
                          next[idx] = { ...entry, datum: e.target.value };
                          update("wichtige_daten", next);
                        }}
                        className="h-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const next = form.wichtige_daten.filter((_, i) => i !== idx);
                        update("wichtige_daten", next);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Notizen</Label>
            <Textarea
              value={form.notizen}
              onChange={(e) => update("notizen", e.target.value)}
              rows={2}
            />
          </div>
        </>
      )}

      {!hideSaveButton && onSave && (
        <Button onClick={onSave} disabled={saving} className="w-full">
          {saving ? "Speichert..." : editId ? "Speichern" : "Kunde anlegen"}
        </Button>
      )}
    </div>
  );
}
