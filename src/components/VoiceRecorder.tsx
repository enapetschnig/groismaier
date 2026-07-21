import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, Check, X, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEinheiten } from "@/hooks/useEinheiten";
import { parseDecimal, formatForInput } from "@/lib/num";

interface ParsedItem {
  material: string;
  menge: number;
  einheit: string;
  /** Roh-Eingabe des Mengenfelds — "2,5" muss tippbar bleiben. */
  mengeInput?: string;
}

/**
 * Mikrofon anfordern. Deckt die zwei Fälle ab, in denen der rote Knopf vorher
 * einfach tot war: kein HTTPS (navigator.mediaDevices fehlt) und eine
 * Freigabe-Abfrage, die nie beantwortet wird (Promise bleibt offen).
 */
async function requestMicrophone(timeoutMs = 20000): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error(
      window.isSecureContext === false
        ? "Sprachaufnahme braucht eine sichere Verbindung (https). Bitte die App über https:// öffnen."
        : "Dieser Browser unterstützt keine Sprachaufnahme."
    );
    err.name = "NotSupportedError";
    throw err;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            "Keine Antwort vom Mikrofon. Bitte die Mikrofon-Freigabe im Browser bestätigen und noch einmal versuchen."
          );
          err.name = "TimeoutError";
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mikrofonFehlerText(err: any): string {
  switch (err?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Mikrofon-Zugriff wurde blockiert. Bitte in den Browser-Einstellungen für diese Seite erlauben.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Kein Mikrofon gefunden. Bitte die Positionen von Hand erfassen.";
    case "NotSupportedError":
    case "TimeoutError":
      return err.message;
    default:
      return `Mikrofon konnte nicht gestartet werden: ${err?.message || "unbekannter Fehler"}`;
  }
}

interface ExistingItem {
  position: number;
  material: string;
  menge: string;
  einheit: string;
}

interface VoiceRecorderProps {
  typ: "entnahme" | "rueckgabe";
  existingItems?: ExistingItem[];
  onAccept: (items: ParsedItem[]) => void;
  onCancel: () => void;
}

type RecordingState = "idle" | "requesting" | "recording" | "processing" | "result" | "error";

export function VoiceRecorder({ typ, existingItems, onAccept, onCancel }: VoiceRecorderProps) {
  const einheiten = useEinheiten();
  const [state, setState] = useState<RecordingState>("idle");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setState("requesting"); // sofort sichtbares Feedback beim Klick
    try {
      const stream = await requestMicrophone();
      // Nicht jedes Gerät kann webm/opus (iOS/Safari!) — sonst warf der
      // Konstruktor und der Knopf blieb ohne Erklärung stehen.
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        if (blob.size < 1000) {
          setErrorMsg("Aufnahme war zu kurz — bitte mindestens 2 Sekunden sprechen.");
          setState("error");
          return;
        }
        await processAudio(blob);
      };

      mediaRecorder.start();
      setState("recording");
    } catch (err: any) {
      console.error("Microphone error:", err);
      setErrorMsg(mikrofonFehlerText(err));
      setState("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setState("processing");
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      // Convert blob to base64
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const audioBase64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-voice-material", {
        body: {
          audioBase64,
          typ,
          existingItems: existingItems || undefined,
        },
      });

      if (error) throw error;

      if (data.error && !data.items) {
        setErrorMsg(data.error);
        setState("error");
        return;
      }

      setTranscript(data.transcript || "");
      setItems(((data.items || []) as ParsedItem[]).map(it => ({
        ...it,
        menge: Number(it.menge) || 0,
        mengeInput: formatForInput(Number(it.menge) || 0),
      })));
      setState(data.items?.length > 0 ? "result" : "error");
      if (!data.items?.length) {
        setErrorMsg("Keine Materialien erkannt. Bitte nochmal versuchen.");
      }
    } catch (err: any) {
      console.error("Processing error:", err);
      const msg = err?.message || err?.context?.body?.message || "Unbekannter Fehler";
      setErrorMsg(`Verarbeitung fehlgeschlagen: ${msg}`);
      setState("error");
    }
  };

  const updateItem = (idx: number, field: keyof ParsedItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setState("idle");
    setItems([]);
    setTranscript("");
    setErrorMsg("");
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm">
            {typ === "entnahme" ? "Material per Sprache entnehmen" : "Material per Sprache zurückgeben"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Info - always show hint and positions during idle/recording/processing */}
      {(state === "idle" || state === "requesting" || state === "recording" || state === "processing") && (
        <div className="space-y-2">
          {(state === "idle" || state === "requesting" || state === "recording") && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
              {typ === "entnahme" ? (
                <>Sag z.B.: <strong>"Position 1, 2 Stück"</strong> oder <strong>"40 Quadratmeter Fliesen 60x60 mitgenommen"</strong></>
              ) : (
                <>Sag z.B.: <strong>"Position 1, 10 Stück zurück"</strong> oder <strong>"5 Quadratmeter Fliesen zurückgeben"</strong></>
              )}
            </div>
          )}

          {/* Show positions reference - for BOTH entnahme and rueckgabe */}
          {existingItems && existingItems.length > 0 && (
            <div className={`rounded p-3 space-y-1 ${typ === "entnahme" ? "bg-orange-50 border border-orange-200" : "bg-green-50 border border-green-200"}`}>
              <p className={`text-xs font-medium ${typ === "entnahme" ? "text-orange-800" : "text-green-800"}`}>
                {typ === "entnahme" ? "Angebotspositionen:" : "Entnommene Positionen:"}
              </p>
              {existingItems.map((item) => (
                <div key={item.position} className={`text-xs flex gap-2 ${typ === "entnahme" ? "text-orange-700" : "text-green-700"}`}>
                  <span className="font-bold min-w-[40px]">Pos {item.position}:</span>
                  <span className="flex-1">{item.material}</span>
                  <span className={typ === "entnahme" ? "text-orange-500" : "text-green-500"}>({item.menge} {item.einheit})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recording Button */}
      {(state === "idle" || state === "requesting" || state === "recording") && (
        <div className="flex justify-center py-4">
          {state === "recording" ? (
            <button
              onClick={stopRecording}
              aria-label="Aufnahme stoppen"
              className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center animate-pulse shadow-lg"
            >
              <MicOff className="h-8 w-8" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={state === "requesting"}
              aria-label="Aufnahme starten"
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-70 text-white flex items-center justify-center transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
              {state === "requesting"
                ? <Loader2 className="h-8 w-8 animate-spin" />
                : <Mic className="h-8 w-8" />}
            </button>
          )}
        </div>
      )}
      {state === "requesting" && (
        <p className="text-center text-sm text-muted-foreground">Warte auf Mikrofon-Freigabe...</p>
      )}
      {state === "recording" && (
        <p className="text-center text-sm text-red-600 font-medium">Aufnahme läuft... Drücke zum Stoppen</p>
      )}

      {/* Processing */}
      {state === "processing" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">KI verarbeitet Sprache...</p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="space-y-3">
          <p className="text-sm text-destructive text-center">{errorMsg}</p>
          {transcript && (
            <p className="text-xs text-muted-foreground text-center">Erkannter Text: "{transcript}"</p>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" />
              Nochmal
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Results — mobile-optimized cards */}
      {state === "result" && items.length > 0 && (
        <div className="space-y-3">
          {transcript && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
              Erkannt: "{transcript}"
            </div>
          )}

          <p className="text-xs font-medium text-muted-foreground">{items.length} {items.length === 1 ? "Position" : "Positionen"} erkannt — prüfen & übernehmen:</p>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground">Pos {idx + 1}</span>
                    <Input
                      value={item.material}
                      onChange={(e) => updateItem(idx, "material", e.target.value)}
                      className="h-8 text-sm mt-0.5"
                      placeholder="Material"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-7 w-7 p-0 mt-3 shrink-0">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.mengeInput ?? formatForInput(item.menge)}
                    onChange={(e) => setItems(prev => prev.map((it, i) => i === idx
                      ? { ...it, mengeInput: e.target.value, menge: parseDecimal(e.target.value) ?? 0 }
                      : it))}
                    onBlur={() => setItems(prev => prev.map((it, i) => i === idx
                      ? { ...it, mengeInput: formatForInput(it.menge) }
                      : it))}
                    className="h-11 sm:h-9 text-sm flex-1"
                    placeholder="Menge"
                    aria-label="Menge"
                  />
                  <Select value={item.einheit} onValueChange={(v) => updateItem(idx, "einheit", v)}>
                    <SelectTrigger className="w-24 h-11 sm:h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {/* Die KI liefert auch Einheiten, die nicht im Stamm
                          stehen ("Packungen") — sonst bliebe das Feld leer. */}
                      {item.einheit && !einheiten.includes(item.einheit) && (
                        <SelectItem value={item.einheit}>{item.einheit}</SelectItem>
                      )}
                      {einheiten.map(e => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1 h-10">
              <RotateCcw className="h-3.5 w-3.5" />
              Nochmal
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} className="h-10">
              Verwerfen
            </Button>
            <Button
              size="sm"
              onClick={() => onAccept(items.filter(i => i.material.trim() && i.menge > 0))}
              className="gap-1 h-10 bg-orange-600 hover:bg-orange-700"
            >
              <Check className="h-3.5 w-3.5" />
              Übernehmen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
