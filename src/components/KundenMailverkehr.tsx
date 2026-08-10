/**
 * Mail-Verkehr eines Kunden (Kundenwunsch): Was mit diesem Kunden geschrieben
 * wurde — gesucht in christian.groismaier@ und office@ über die Microsoft-
 * Volltextsuche (Kunde als Absender ODER Empfänger). Klick öffnet die Mail
 * im E-Mail-Bereich der App.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, ArrowUpRight, Loader2, Mail, Paperclip } from "lucide-react";

interface KundenMail {
  id: string;
  postfach: string;
  betreff: string;
  von: string;
  vonKunde: boolean;
  empfangen: string;
  hatAnhaenge: boolean;
}

export function KundenMailverkehr({ kundenEmail }: { kundenEmail: string }) {
  const navigate = useNavigate();
  const [mails, setMails] = useState<KundenMail[] | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("mail-postfach", {
          body: { aktion: "kundenmails", postfach: "office@cg-holzbau.at", kundenEmail },
        });
        if (error || data?.error) throw new Error(error?.message || data?.error);
        if (!abgebrochen) setMails(data.mails || []);
      } catch {
        if (!abgebrochen) { setFehler(true); setMails([]); }
      }
    })();
    return () => { abgebrochen = true; };
  }, [kundenEmail]);

  // Kein Mailverkehr und kein Fehler → Karte gar nicht zeigen (kein Leerlärm).
  if (mails !== null && mails.length === 0 && !fehler) return null;
  if (fehler) return null;

  return (
    <Card className="kb-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-kb-blue" /> E-Mail-Verkehr
          {mails === null && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {mails !== null && <span className="text-xs font-normal text-muted-foreground">({mails.length} aus christian.groismaier@ + office@)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {(mails || []).map((m) => (
            <button
              key={`${m.postfach}-${m.id}`}
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/50"
              title="Mail im E-Mail-Bereich öffnen"
              onClick={() => navigate(`/email?postfach=${encodeURIComponent(m.postfach)}&mail=${encodeURIComponent(m.id)}`)}
            >
              {m.vonKunde
                ? <ArrowDownLeft className="h-4 w-4 shrink-0 text-kb-blue" aria-label="vom Kunden" />
                : <ArrowUpRight className="h-4 w-4 shrink-0 text-green-600" aria-label="an den Kunden" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{m.betreff}</div>
                <div className="text-xs text-muted-foreground">
                  {m.vonKunde ? "vom Kunden" : "an den Kunden"} · {new Date(m.empfangen).toLocaleDateString("de-AT")}
                  {" · "}{m.postfach.split("@")[0]}
                </div>
              </div>
              {m.hatAnhaenge && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
