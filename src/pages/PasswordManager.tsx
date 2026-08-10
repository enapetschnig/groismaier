/**
 * /passwoerter — Passwortmanager (Kundenwunsch: „Menüpunkt Passwortmanager,
 * vielleicht mit eigenem Zahlen-Code als Zugang — dann wäre das auch einmal
 * digital").
 *
 * Zugang nur für Administratoren UND nur mit dem Zahlen-Code des Tresors.
 * Ver-/Entschlüsselung passiert komplett im Browser (siehe lib/tresorCrypto);
 * der Schlüssel lebt nur im Arbeitsspeicher und verfällt nach 5 Minuten ohne
 * Aktivität, beim Sperren und beim Verlassen der Maske.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useZurueck } from "@/hooks/useZurueck";
import { supabase } from "@/integrations/supabase/client";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, Dices, Eye, EyeOff, KeyRound, Lock, LockOpen, Pencil, Plus, Search, Trash2,
} from "lucide-react";
import {
  KDF_ITERATIONEN, PRUEFWERT_KLARTEXT, entschluesseln, neuerSalt,
  passwortVorschlag, schluesselAbleiten, verschluesseln,
} from "@/lib/tresorCrypto";

type TresorConfig = { id: string; pin_salt: string; pin_check: string; kdf_iterationen: number };
type Eintrag = {
  id: string;
  titel: string;
  benutzername: string | null;
  url: string | null;
  daten_verschluesselt: string;
};

const AUTOLOCK_MS = 5 * 60 * 1000;

export default function PasswordManager() {
  const zurueck = useZurueck("/");
  const { toast } = useToast();

  const [config, setConfig] = useState<TresorConfig | null | undefined>(undefined); // undefined = lädt
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [suche, setSuche] = useState("");

  // Schlüssel nur im Speicher — nie in localStorage/sessionStorage.
  const keyRef = useRef<CryptoKey | null>(null);
  const [entsperrt, setEntsperrt] = useState(false);
  const [pruefe, setPruefe] = useState(false);

  // PIN-Eingabe (Sperrbildschirm bzw. Einrichtung)
  const [pin, setPin] = useState("");
  const [pinNeu2, setPinNeu2] = useState("");
  const [fehlversuche, setFehlversuche] = useState(0);

  // Eintrag-Dialog
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState({ titel: "", benutzername: "", url: "", passwort: "", notiz: "" });
  const [passwortSichtbar, setPasswortSichtbar] = useState(false);

  // Entschlüsselte Passwörter je Eintrag (nur solange sichtbar geschaltet)
  const [sichtbar, setSichtbar] = useState<Map<string, string>>(new Map());

  // PIN ändern
  const [pinDialogOffen, setPinDialogOffen] = useState(false);
  const [pinAlt, setPinAlt] = useState("");
  const [pinChange1, setPinChange1] = useState("");
  const [pinChange2, setPinChange2] = useState("");

  const sperren = () => {
    keyRef.current = null;
    setEntsperrt(false);
    setSichtbar(new Map());
    setPin("");
  };

  // Auto-Sperre nach 5 Minuten ohne Interaktion.
  const autolockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aktivitaet = () => {
    if (autolockTimer.current) clearTimeout(autolockTimer.current);
    if (entsperrt) autolockTimer.current = setTimeout(sperren, AUTOLOCK_MS);
  };
  useEffect(() => {
    aktivitaet();
    return () => { if (autolockTimer.current) clearTimeout(autolockTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entsperrt]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("passwort_tresor" as any).select("*").maybeSingle();
      setConfig((data as any) || null);
    })();
  }, []);

  const ladeEintraege = async () => {
    const { data } = await supabase
      .from("passwort_eintraege" as any)
      .select("id, titel, benutzername, url, daten_verschluesselt")
      .order("titel");
    setEintraege(((data as any) || []) as Eintrag[]);
  };

  // ── Einrichtung: ersten Zahlen-Code festlegen ──
  const einrichten = async () => {
    if (pin.length < 6) { toast({ title: "Mindestens 6 Ziffern", variant: "destructive" }); return; }
    if (pin !== pinNeu2) { toast({ title: "Die Codes stimmen nicht überein", variant: "destructive" }); return; }
    setPruefe(true);
    try {
      const salt = neuerSalt();
      const key = await schluesselAbleiten(pin, salt);
      const check = await verschluesseln(key, PRUEFWERT_KLARTEXT);
      const { data, error } = await supabase
        .from("passwort_tresor" as any)
        .insert({ pin_salt: salt, pin_check: check, kdf_iterationen: KDF_ITERATIONEN })
        .select()
        .single();
      if (error) throw error;
      setConfig(data as any);
      keyRef.current = key;
      setEntsperrt(true);
      setPin(""); setPinNeu2("");
      await ladeEintraege();
      toast({ title: "Tresor eingerichtet", description: "Merk dir den Zahlen-Code gut — ohne ihn sind die Passwörter nicht lesbar." });
    } catch (e: any) {
      toast({ title: "Einrichtung fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setPruefe(false);
    }
  };

  // ── Entsperren ──
  const entsperren = async () => {
    if (!config || pin.length === 0) return;
    setPruefe(true);
    try {
      const key = await schluesselAbleiten(pin, config.pin_salt, config.kdf_iterationen);
      await entschluesseln(key, config.pin_check); // wirft bei falschem Code
      keyRef.current = key;
      setEntsperrt(true);
      setFehlversuche(0);
      setPin("");
      await ladeEintraege();
    } catch {
      setFehlversuche((n) => n + 1);
      setPin("");
      toast({ title: "Falscher Zahlen-Code", variant: "destructive" });
    } finally {
      setPruefe(false);
    }
  };

  // ── Eintrag anzeigen/kopieren ──
  const passwortHolen = async (e: Eintrag): Promise<string | null> => {
    if (!keyRef.current) return null;
    try {
      const json = JSON.parse(await entschluesseln(keyRef.current, e.daten_verschluesselt));
      return String(json.passwort || "");
    } catch {
      toast({ title: "Entschlüsselung fehlgeschlagen", variant: "destructive" });
      return null;
    }
  };

  const augeUmschalten = async (e: Eintrag) => {
    aktivitaet();
    if (sichtbar.has(e.id)) {
      setSichtbar((m) => { const n = new Map(m); n.delete(e.id); return n; });
      return;
    }
    const pw = await passwortHolen(e);
    if (pw !== null) setSichtbar((m) => new Map(m).set(e.id, pw));
  };

  const kopieren = async (text: string, was: string) => {
    aktivitaet();
    await navigator.clipboard.writeText(text);
    toast({ title: `${was} kopiert` });
  };

  // ── Anlegen/Bearbeiten/Löschen ──
  const dialogOeffnen = async (e?: Eintrag) => {
    aktivitaet();
    setPasswortSichtbar(false);
    if (!e) {
      setBearbeiteId(null);
      setForm({ titel: "", benutzername: "", url: "", passwort: "", notiz: "" });
    } else {
      if (!keyRef.current) return;
      try {
        const json = JSON.parse(await entschluesseln(keyRef.current, e.daten_verschluesselt));
        setBearbeiteId(e.id);
        setForm({
          titel: e.titel, benutzername: e.benutzername || "", url: e.url || "",
          passwort: String(json.passwort || ""), notiz: String(json.notiz || ""),
        });
      } catch {
        toast({ title: "Entschlüsselung fehlgeschlagen", variant: "destructive" });
        return;
      }
    }
    setDialogOffen(true);
  };

  const speichern = async () => {
    if (!keyRef.current) return;
    if (!form.titel.trim()) { toast({ title: "Titel fehlt", variant: "destructive" }); return; }
    try {
      const daten = await verschluesseln(keyRef.current, JSON.stringify({ passwort: form.passwort, notiz: form.notiz }));
      const satz = {
        titel: form.titel.trim(),
        benutzername: form.benutzername.trim() || null,
        url: form.url.trim() || null,
        daten_verschluesselt: daten,
      };
      const { error } = bearbeiteId
        ? await supabase.from("passwort_eintraege" as any).update(satz).eq("id", bearbeiteId)
        : await supabase.from("passwort_eintraege" as any).insert(satz);
      if (error) throw error;
      setDialogOffen(false);
      setSichtbar((m) => { const n = new Map(m); if (bearbeiteId) n.delete(bearbeiteId); return n; });
      await ladeEintraege();
      toast({ title: "Gespeichert" });
    } catch (e: any) {
      toast({ title: "Speichern fehlgeschlagen", description: e.message, variant: "destructive" });
    }
  };

  const loeschen = async (e: Eintrag) => {
    if (!confirm(`„${e.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from("passwort_eintraege" as any).delete().eq("id", e.id);
    if (error) { toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" }); return; }
    await ladeEintraege();
  };

  // ── Zahlen-Code ändern: alles mit neuem Schlüssel neu verschlüsseln ──
  const pinAendern = async () => {
    if (!config) return;
    if (pinChange1.length < 6) { toast({ title: "Mindestens 6 Ziffern", variant: "destructive" }); return; }
    if (pinChange1 !== pinChange2) { toast({ title: "Die neuen Codes stimmen nicht überein", variant: "destructive" }); return; }
    setPruefe(true);
    try {
      const altKey = await schluesselAbleiten(pinAlt, config.pin_salt, config.kdf_iterationen);
      await entschluesseln(altKey, config.pin_check); // alten Code prüfen
      const saltNeu = neuerSalt();
      const neuKey = await schluesselAbleiten(pinChange1, saltNeu);
      const { data: alle } = await supabase
        .from("passwort_eintraege" as any)
        .select("id, daten_verschluesselt");
      for (const e of ((alle as any) || []) as { id: string; daten_verschluesselt: string }[]) {
        const klartext = await entschluesseln(altKey, e.daten_verschluesselt);
        const neu = await verschluesseln(neuKey, klartext);
        const { error } = await supabase
          .from("passwort_eintraege" as any)
          .update({ daten_verschluesselt: neu })
          .eq("id", e.id);
        if (error) throw error;
      }
      const checkNeu = await verschluesseln(neuKey, PRUEFWERT_KLARTEXT);
      const { error } = await supabase
        .from("passwort_tresor" as any)
        .update({ pin_salt: saltNeu, pin_check: checkNeu, kdf_iterationen: KDF_ITERATIONEN, updated_at: new Date().toISOString() })
        .eq("id", config.id);
      if (error) throw error;
      setConfig({ ...config, pin_salt: saltNeu, pin_check: checkNeu, kdf_iterationen: KDF_ITERATIONEN });
      keyRef.current = neuKey;
      setSichtbar(new Map());
      setPinDialogOffen(false);
      setPinAlt(""); setPinChange1(""); setPinChange2("");
      await ladeEintraege();
      toast({ title: "Zahlen-Code geändert", description: "Alle Einträge wurden neu verschlüsselt." });
    } catch (e: any) {
      toast({
        title: "Ändern fehlgeschlagen",
        description: e?.message?.includes("decrypt") || e?.name === "OperationError" ? "Der alte Code stimmt nicht." : e.message,
        variant: "destructive",
      });
    } finally {
      setPruefe(false);
    }
  };

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return eintraege;
    return eintraege.filter((e) =>
      e.titel.toLowerCase().includes(q) ||
      (e.benutzername || "").toLowerCase().includes(q) ||
      (e.url || "").toLowerCase().includes(q),
    );
  }, [eintraege, suche]);

  // ── Sperrbildschirm / Einrichtung ──
  if (!entsperrt) {
    const einrichtung = config === null;
    return (
      <div className="min-h-screen">
        <KBToolbar onBack={zurueck} title="Passwörter" />
        <main className="mx-auto flex max-w-md flex-col items-center px-4 py-12">
          <div className="kb-panel w-full p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-kb-blue/10">
              <Lock className="h-7 w-7 text-kb-blue" />
            </div>
            {config === undefined ? (
              <p className="text-sm text-muted-foreground">Lade…</p>
            ) : einrichtung ? (
              <>
                <h1 className="mb-1 text-lg font-bold">Tresor einrichten</h1>
                <p className="mb-4 text-sm text-muted-foreground">
                  Leg einen Zahlen-Code fest (mindestens 6 Ziffern). Die Passwörter werden
                  damit direkt am Gerät verschlüsselt — ohne den Code kann sie niemand lesen,
                  auch wir nicht. Darum: gut merken!
                </p>
                <div className="space-y-2 text-left">
                  <Label>Zahlen-Code</Label>
                  <Input
                    type="password" inputMode="numeric" autoFocus value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="mind. 6 Ziffern"
                  />
                  <Label>Zahlen-Code wiederholen</Label>
                  <Input
                    type="password" inputMode="numeric" value={pinNeu2}
                    onChange={(e) => setPinNeu2(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && einrichten()}
                  />
                </div>
                <Button className="mt-4 w-full" onClick={einrichten} disabled={pruefe}>
                  {pruefe ? "Richte ein…" : "Tresor anlegen"}
                </Button>
              </>
            ) : (
              <>
                <h1 className="mb-1 text-lg font-bold">Tresor gesperrt</h1>
                <p className="mb-4 text-sm text-muted-foreground">Zahlen-Code eingeben, um die Passwörter zu öffnen.</p>
                <Input
                  type="password" inputMode="numeric" autoFocus value={pin}
                  className="text-center text-xl tracking-[0.5em]"
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && entsperren()}
                />
                {fehlversuche > 0 && (
                  <p className="mt-2 text-xs text-destructive">Falscher Code ({fehlversuche}. Versuch)</p>
                )}
                <Button className="mt-4 w-full" onClick={entsperren} disabled={pruefe || pin.length === 0}>
                  <LockOpen className="mr-2 h-4 w-4" />
                  {pruefe ? "Prüfe…" : "Entsperren"}
                </Button>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Entsperrte Liste ──
  return (
    <div className="min-h-screen" onClick={aktivitaet} onKeyDown={aktivitaet}>
      <KBToolbar onBack={zurueck} title="Passwörter">
        <KBToolbarButton icon={Plus} label="Neuer Eintrag" onClick={() => dialogOeffnen()} />
        <KBToolbarButton icon={KeyRound} label="Code ändern" onClick={() => { setPinAlt(""); setPinChange1(""); setPinChange2(""); setPinDialogOffen(true); }} />
        <KBToolbarButton icon={Lock} label="Sperren" onClick={sperren} />
      </KBToolbar>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Suchen (Titel, Benutzer, Adresse)…" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>

        <div className="kb-panel divide-y">
          {gefiltert.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {eintraege.length === 0 ? "Noch keine Einträge — leg den ersten mit »Neuer Eintrag« an." : "Nichts gefunden."}
            </div>
          )}
          {gefiltert.map((e) => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{e.titel}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {e.benutzername && <span className="truncate">{e.benutzername}</span>}
                  {e.url && (
                    <a
                      href={/^https?:\/\//.test(e.url) ? e.url : `https://${e.url}`}
                      target="_blank" rel="noreferrer" className="truncate text-kb-blue hover:underline"
                    >
                      {e.url}
                    </a>
                  )}
                </div>
                {sichtbar.has(e.id) && (
                  <div className="mt-0.5 font-mono text-sm">{sichtbar.get(e.id)}</div>
                )}
              </div>
              {e.benutzername && (
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Benutzername kopieren"
                  onClick={() => kopieren(e.benutzername!, "Benutzername")}>
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8"
                title={sichtbar.has(e.id) ? "Passwort verbergen" : "Passwort anzeigen"}
                onClick={() => augeUmschalten(e)}>
                {sichtbar.has(e.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Passwort kopieren"
                onClick={async () => { const pw = await passwortHolen(e); if (pw !== null) kopieren(pw, "Passwort"); }}>
                <KeyRound className="h-4 w-4 text-kb-blue" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Bearbeiten" onClick={() => dialogOeffnen(e)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Löschen" onClick={() => loeschen(e)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Verschlüsselt am Gerät (AES-256) · sperrt sich nach 5 Minuten ohne Aktivität von selbst
        </p>
      </main>

      {/* Eintrag anlegen/bearbeiten */}
      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bearbeiteId ? "Eintrag bearbeiten" : "Neuer Eintrag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Titel *</Label>
              <Input value={form.titel} onChange={(e) => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z. B. Datev / Bank / Lieferantenportal" autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Benutzername / E-Mail</Label>
              <Input value={form.benutzername} onChange={(e) => setForm(f => ({ ...f, benutzername: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Passwort</Label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    type={passwortSichtbar ? "text" : "password"}
                    value={form.passwort}
                    onChange={(e) => setForm(f => ({ ...f, passwort: e.target.value }))}
                    className="pr-9 font-mono"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setPasswortSichtbar(v => !v)}
                    aria-label="Passwort anzeigen/verbergen"
                  >
                    {passwortSichtbar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" title="Starkes Passwort vorschlagen"
                  onClick={() => { setForm(f => ({ ...f, passwort: passwortVorschlag() })); setPasswortSichtbar(true); }}>
                  <Dices className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Internet-Adresse</Label>
              <Input value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} placeholder="z. B. portal.lieferant.at" />
            </div>
            <div className="space-y-1">
              <Label>Notiz</Label>
              <Textarea rows={2} value={form.notiz} onChange={(e) => setForm(f => ({ ...f, notiz: e.target.value }))} placeholder="z. B. Kundennummer, Sicherheitsfragen" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOffen(false)}>Abbrechen</Button>
              <Button onClick={speichern}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zahlen-Code ändern */}
      <Dialog open={pinDialogOffen} onOpenChange={setPinDialogOffen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Zahlen-Code ändern</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Aktueller Code</Label>
              <Input type="password" inputMode="numeric" value={pinAlt} onChange={(e) => setPinAlt(e.target.value.replace(/\D/g, ""))} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Neuer Code (mind. 6 Ziffern)</Label>
              <Input type="password" inputMode="numeric" value={pinChange1} onChange={(e) => setPinChange1(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1">
              <Label>Neuer Code wiederholen</Label>
              <Input type="password" inputMode="numeric" value={pinChange2} onChange={(e) => setPinChange2(e.target.value.replace(/\D/g, ""))} />
            </div>
            <p className="text-xs text-muted-foreground">Alle Einträge werden dabei mit dem neuen Code neu verschlüsselt.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setPinDialogOffen(false)}>Abbrechen</Button>
              <Button onClick={pinAendern} disabled={pruefe}>{pruefe ? "Verschlüssle neu…" : "Ändern"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
