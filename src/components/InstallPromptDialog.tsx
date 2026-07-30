/**
 * „App installieren" — erkennt das Gerät selbst und zeigt sofort den
 * passenden Weg, statt den Anwender zuerst raten zu lassen.
 *
 * Aufbau:
 *   1. Läuft die Seite schon als installierte App → grüner Bestätigungskasten.
 *   2. Chromium (Chrome/Edge/Samsung): großer „Jetzt installieren"-Knopf,
 *      sobald der Browser das beforeinstallprompt-Ereignis geliefert hat.
 *   3. Darunter immer die Schritt-für-Schritt-Anleitung für das ERKANNTE
 *      Gerät — plus Umschalter auf die anderen Geräte, damit der Chef einem
 *      Mitarbeiter den Weg für dessen Handy zeigen kann.
 *
 * Der Dialog wird an zwei Stellen geöffnet: automatisch nach dem ersten
 * Login (OnboardingContext, vor allem am Handy) und über den
 * „App installieren"-Knopf rechts oben auf der Startseite.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, MonitorDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  erkennePlattform, anleitungFuer, kannDirektInstallieren,
  geraetName, browserName, type Geraet, type PlattformInfo,
} from "@/lib/plattform";

interface InstallPromptDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Läuft die Seite bereits als installierte App? (iOS setzt navigator.standalone) */
const laeuftAlsApp = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** Umschalter-Reihenfolge: das erkannte Gerät kommt zuerst. */
const GERAETE_WAHL: Geraet[] = ["ios", "android", "windows", "macos"];

export function InstallPromptDialog({ open, onClose }: InstallPromptDialogProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(laeuftAlsApp());
  // Das erkannte Gerät ist die Vorauswahl; der Anwender kann umschalten.
  const [erkannt] = useState<PlattformInfo>(() =>
    erkennePlattform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints })
  );
  // Linux hat keinen eigenen Umschalter-Chip — es teilt sich die
  // Windows-Anleitung. Direkt-Knopf und „(dein Gerät)" müssen deshalb gegen
  // DIESEN Wert geprüft werden, nicht gegen erkannt.geraet.
  const erkanntChip: Geraet = erkannt.geraet === "linux" ? "windows" : erkannt.geraet;
  const [gewaehlt, setGewaehlt] = useState<Geraet>(erkanntChip);

  // Beim (Wieder-)Öffnen auf das erkannte Gerät zurückstellen — die
  // Komponente bleibt dauerhaft gemountet, sonst klebt die letzte Auswahl.
  useEffect(() => {
    if (open) setGewaehlt(erkanntChip);
  }, [open, erkanntChip]);

  useEffect(() => {
    const promptHandler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const installedHandler = () => {
      setIsInstalled(true);
      toast({
        title: "App installiert!",
        description: "Die App wurde erfolgreich auf deinem Gerät installiert.",
      });
    };
    window.addEventListener("beforeinstallprompt", promptHandler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      onClose();
    }
    // Der Browser erlaubt nur einen prompt()-Aufruf je Ereignis.
    setDeferredPrompt(null);
  };

  // Direkt-Knopf nur, wenn der Anwender das ERKANNTE Gerät ansieht — die
  // Anleitung für ein fremdes Handy braucht keinen Installieren-Knopf.
  const zeigeDirektKnopf =
    !isInstalled && gewaehlt === erkanntChip && kannDirektInstallieren(erkannt);

  // Anleitung: für das erkannte Gerät mit dem erkannten Browser, für die
  // anderen Geräte mit deren üblichem Browser.
  const anleitung = gewaehlt === erkanntChip
    ? anleitungFuer(erkannt.geraet, erkannt.browser)
    : anleitungFuer(gewaehlt, gewaehlt === "macos" ? "safari" : "chrome");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isInstalled ? "App bereits installiert" : "App installieren"}
          </DialogTitle>
          <DialogDescription>
            {isInstalled
              ? "Die App liegt schon auf diesem Gerät — du kannst sie direkt vom Startbildschirm öffnen."
              : `Erkannt: ${geraetName(erkannt.geraet)} mit ${browserName(erkannt.browser)}. Die Anleitung unten passt zu deinem Gerät.`}
          </DialogDescription>
        </DialogHeader>

        {isInstalled ? (
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-primary shrink-0" />
            <p className="text-sm">
              Du findest „Holzbau Groismaier“ am Startbildschirm bzw. in deinen Apps.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Direkt installieren — nur wo der Browser das kann */}
            {zeigeDirektKnopf && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                <p className="text-sm font-medium">Am schnellsten geht es direkt:</p>
                <Button className="w-full h-11" onClick={handleInstallClick} disabled={!deferredPrompt}>
                  <Download className="mr-2 h-4 w-4" />
                  {deferredPrompt ? "Jetzt installieren" : "Installation wird vorbereitet…"}
                </Button>
                {!deferredPrompt && (
                  <p className="text-xs text-muted-foreground">
                    Wenn der Knopf nicht aktiv wird, nutze die Schritte unten — das
                    Ergebnis ist dasselbe.
                  </p>
                )}
              </div>
            )}

            {/* Geräte-Umschalter: erkanntes Gerät zuerst */}
            <div className="flex flex-wrap gap-1.5">
              {[...GERAETE_WAHL].sort((a, b) =>
                (a === erkanntChip ? -1 : 0) - (b === erkanntChip ? -1 : 0)
              ).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={gewaehlt === g}
                  onClick={() => setGewaehlt(g)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    gewaehlt === g
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  {geraetName(g)}
                  {g === erkanntChip ? " (dein Gerät)" : ""}
                </button>
              ))}
            </div>

            {/* Schritt-für-Schritt */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                <MonitorDown className="h-4 w-4 text-primary" />
                {anleitung.titel}
              </h3>
              <ol className="list-decimal pl-5 space-y-2 text-sm">
                {anleitung.schritte.map((schritt, i) => (
                  <li key={i}>{schritt}</li>
                ))}
              </ol>
              {anleitung.hinweis && (
                <p className="mt-3 text-xs text-muted-foreground">{anleitung.hinweis}</p>
              )}
            </div>

            <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm">
                Danach liegt die App wie eine normale App am Startbildschirm — mit
                Anmeldung, die erhalten bleibt.
              </p>
            </div>
          </div>
        )}

        <Button onClick={onClose} className="w-full">
          {isInstalled ? "Fertig" : "Verstanden"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
