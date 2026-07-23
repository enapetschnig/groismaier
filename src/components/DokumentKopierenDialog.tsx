import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KBButton } from "@/components/kingbill";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";

/**
 * KingBill „Dokument kopieren" — „Was soll kopiert werden?"
 *
 * Erscheint beim „Kopieren in …"-Fluss der Belegliste. Die Häkchen steuern,
 * welche Teile des Quellbelegs in den neuen Beleg übernommen werden; die
 * Auswahl wandert als sessionStorage["dokument_kopieren_optionen"] in den
 * from_doc-Ladepfad (loadFromSourceDoc in InvoiceDetail), der sie einmalig
 * konsumiert. Optik 1:1 wie das Original (blauer Verlauf, Häkchenliste links,
 * Kundendaten-Radios rechts, großer grüner Kopieren-Knopf).
 */

export interface KopierOptionen {
  zahlungsbedingungen: boolean;
  projekt: boolean;
  vortext: boolean;
  schlusstext: boolean;
  lieferadresse: boolean;
  referenz: boolean;
  preise_neu_laden: boolean;
  mwst_neu_laden: boolean;
  kundendaten: "neu" | "dokument" | "nicht";
}

export const KOPIER_OPTIONEN_KEY = "dokument_kopieren_optionen";

const DEFAULT_OPTIONEN: KopierOptionen = {
  zahlungsbedingungen: true,
  projekt: true,
  vortext: true,
  schlusstext: true,
  lieferadresse: true,
  referenz: true,
  preise_neu_laden: true,
  mwst_neu_laden: true,
  kundendaten: "neu",
};

interface DokumentKopierenDialogProps {
  open: boolean;
  onClose: () => void;
  /** Wird mit den gewählten Optionen aufgerufen — der Aufrufer navigiert. */
  onKopieren: (optionen: KopierOptionen) => void;
}

const HAKEN: { key: keyof Omit<KopierOptionen, "kundendaten">; label: string }[] = [
  { key: "zahlungsbedingungen", label: "Zahlungsbedingungen" },
  { key: "projekt", label: "Projekt" },
  { key: "vortext", label: "Vortext" },
  { key: "schlusstext", label: "Schlusstext" },
  { key: "lieferadresse", label: "Lieferadresse" },
  { key: "referenz", label: "Referenz" },
  { key: "preise_neu_laden", label: "Preise neu laden" },
  { key: "mwst_neu_laden", label: "MwSt. neu laden" },
];

export function DokumentKopierenDialog({ open, onClose, onKopieren }: DokumentKopierenDialogProps) {
  const [opt, setOpt] = useState<KopierOptionen>({ ...DEFAULT_OPTIONEN });

  const toggle = (key: keyof Omit<KopierOptionen, "kundendaten">) =>
    setOpt((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0" hideClose>
        <DialogHeader className="sr-only">
          <DialogTitle>Dokument kopieren</DialogTitle>
        </DialogHeader>
        {/* Fenster-Titelzeile wie im Original */}
        <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
          <span className="text-sm font-semibold">Dokument kopieren</span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded bg-red-600 text-xs font-bold text-white hover:bg-red-700"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        {/* Blauer Verlaufs-Body wie im Original */}
        <div className="bg-gradient-to-b from-[#cfe3f6] via-[#a8c9e8] to-[#7fb0dd] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <KBButton icon={ArrowLeft} label="Zurück" onClick={onClose} />
            <h2 className="flex-1 text-center text-3xl font-light text-white [text-shadow:0_1px_3px_rgba(0,40,90,0.45)]">
              Was soll kopiert werden?
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr_auto]">
            {/* Dokument-Symbol links */}
            <div className="hidden items-center sm:flex">
              <FileText className="h-28 w-28 text-white/70" strokeWidth={1} />
            </div>
            {/* Häkchenliste */}
            <div className="space-y-2">
              {HAKEN.map((h) => (
                <label key={h.key} className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-kb-blue-dark"
                    checked={opt[h.key]}
                    onChange={() => toggle(h.key)}
                  />
                  {h.label}
                </label>
              ))}
            </div>
            {/* Kundendaten-Radios + Kopieren-Knopf */}
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                {([
                  ["neu", "Kundendaten neu laden"],
                  ["dokument", "Kundendaten aus Dokument kopieren"],
                  ["nicht", "Kundendaten nicht kopieren"],
                ] as const).map(([val, label]) => (
                  <label key={val} className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
                    <input
                      type="radio"
                      name="kundendaten"
                      className="h-4 w-4 accent-kb-blue-dark"
                      checked={opt.kundendaten === val}
                      onChange={() => setOpt((prev) => ({ ...prev, kundendaten: val }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="kb-btn kb-btn-primary-green mx-auto flex h-28 w-40 flex-col items-center justify-center gap-2 text-base font-semibold"
                onClick={() => onKopieren(opt)}
              >
                <CheckCircle2 className="h-10 w-10 text-kb-green" />
                Kopieren
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
