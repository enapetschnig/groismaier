import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  /** Aktueller Text im Feld */
  value: string;
  /** Neuer Text nach Diktat (geschliffen + angehängt wenn bereits Text da war) */
  onResult: (text: string) => void;
  /** Optional: kleinere Variante (Icon-only) */
  compact?: boolean;
  /** Optional: Custom Label */
  label?: string;
  /** Disabled während Formular-Save */
  disabled?: boolean;
  className?: string;
}

/**
 * Diktier-Button mit Spracheingabe → Whisper-Transkription → GPT-4o-mini Polish.
 *
 * Erster Klick: Aufnahme starten (rotes Mic, pulsierend).
 * Zweiter Klick: Aufnahme stoppen → Text wird geschliffen und angehängt/ersetzt.
 */
/**
 * Mikrofon anfordern — mit den beiden Fällen, die im Baustellenalltag wirklich
 * auftreten und vorher zu einem toten Knopf führten:
 *  - Seite läuft nicht über HTTPS → navigator.mediaDevices ist undefined
 *  - Berechtigungsdialog wird nie beantwortet → Promise bleibt für immer offen
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

export function DictateButton({ value, onResult, compact, label = "Diktieren", disabled, className = "" }: Props) {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "processing">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    // Sofort sichtbares Feedback — vorher passierte beim Klick optisch nichts,
    // solange der Browser auf die Mikrofon-Freigabe wartete.
    setState("requesting");
    try {
      const stream = await requestMicrophone();
      streamRef.current = stream;
      chunksRef.current = [];

      // Prefer webm/opus (kleine Dateien, von Whisper unterstützt)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setState("processing");
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          if (blob.size < 1000) {
            toast({ variant: "destructive", title: "Zu kurz", description: "Bitte mindestens 2 Sekunden sprechen." });
            setState("idle");
            return;
          }

          const form = new FormData();
          form.append("audio", blob, "dictation.webm");
          form.append("existingText", value || "");
          form.append("mode", value.trim() ? "append" : "polish");

          const { data, error } = await supabase.functions.invoke("polish-text", {
            body: form,
          });

          if (error) throw new Error(error.message);
          if (data?.error) throw new Error(data.error);
          if (!data?.text) throw new Error("Keine Antwort");

          onResult(data.text);
          toast({ title: "Text übernommen", description: value.trim() ? "Ergänzt und geschliffen." : "Diktat wurde geschliffen." });
        } catch (err: any) {
          toast({ variant: "destructive", title: "Diktier-Fehler", description: err.message });
        } finally {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
          setState("idle");
        }
      };

      recorder.start();
      setState("recording");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        toast({
          variant: "destructive",
          title: "Mikrofon blockiert",
          description: "Bitte in den Browser-Einstellungen Mikrofon-Zugriff für diese Seite erlauben.",
        });
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        toast({
          variant: "destructive",
          title: "Kein Mikrofon gefunden",
          description: "An diesem Gerät ist kein Mikrofon angeschlossen. Text bitte tippen.",
        });
      } else if (err.name === "NotSupportedError" || err.name === "TimeoutError") {
        toast({ variant: "destructive", title: "Diktat nicht möglich", description: err.message });
      } else {
        toast({
          variant: "destructive",
          title: "Mikrofon-Fehler",
          description: err.message || "Aufnahme konnte nicht gestartet werden.",
        });
      }
      // Falls der Stream doch noch aufgeht (Timeout-Fall), nicht offen lassen
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setState("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleClick = () => {
    if (state === "idle") startRecording();
    else if (state === "recording") stopRecording();
  };

  const busy = state === "processing" || state === "requesting";

  if (compact) {
    return (
      <Button
        type="button"
        variant={state === "recording" ? "destructive" : "ghost"}
        size="icon"
        onClick={handleClick}
        disabled={disabled || busy}
        className={`h-11 w-11 sm:h-8 sm:w-8 ${state === "recording" ? "animate-pulse" : ""} ${className}`}
        title={
          state === "recording" ? "Aufnahme stoppen"
            : state === "requesting" ? "Warte auf Mikrofon-Freigabe..."
            : "Diktieren"
        }
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "recording" ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={state === "recording" ? "destructive" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={disabled || busy}
      className={`gap-1.5 min-h-[2.75rem] sm:min-h-0 ${state === "recording" ? "animate-pulse" : ""} ${className}`}
    >
      {state === "requesting" ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Mikrofon...</>
      ) : state === "processing" ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Verarbeite...</>
      ) : state === "recording" ? (
        <><MicOff className="h-4 w-4" /> Stop</>
      ) : (
        <><Sparkles className="h-3.5 w-3.5 text-orange-500" /> {label}</>
      )}
    </Button>
  );
}
