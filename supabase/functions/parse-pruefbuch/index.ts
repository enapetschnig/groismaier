// Maschinen-Prüfbuch per KI auswerten (Kundenwunsch KFZ-Manager):
// Foto/PDF-Seiten des Prüfbuchs → Maschinendaten (Bezeichnung, Hersteller,
// Type, Seriennummer, Baujahr, letzte/nächste Überprüfung). Zuordnung übers
// normalisierte Serien-/Inventarnummern-Feld; geschrieben wird hier NICHTS —
// das Übernehmen macht der Client mit den Rechten des Benutzers.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function norm(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const SYSTEM_PROMPT = `Du bist ein hochpräziser OCR-Parser für Maschinen-Prüfbücher, Typenschilder und Prüfprotokolle (jährliche Überprüfungen von Baumaschinen, Kranen, Hebebühnen usw. nach AM-VO/Arbeitsmittelverordnung).
Extrahiere die Daten exakt so, wie sie am Dokument stehen.

GIB NUR JSON ZURÜCK (kein Markdown, keine Erklärung), genau in diesem Schema:
{
  "bezeichnung": string | null,       // Art der Maschine, z.B. "Anhänger-Arbeitsbühne", "Turmdrehkran"
  "hersteller": string | null,        // z.B. "Paus", "Liebherr"
  "type": string | null,              // Typenbezeichnung/Modell, z.B. "GT 26/13"
  "seriennummer": string | null,      // Serien-/Fabrikationsnummer
  "baujahr": string | null,           // vierstellig, z.B. "2018"
  "letzte_pruefung": string | null,   // Datum der letzten eingetragenen Überprüfung, YYYY-MM-DD
  "naechste_pruefung": string | null  // Datum der nächsten fälligen Überprüfung, YYYY-MM-DD (falls angegeben)
}

Regeln:
- Datumsangaben nach YYYY-MM-DD wandeln (am Dokument meist TT.MM.JJJJ).
- Bei mehreren eingetragenen Prüfungen: die JÜNGSTE als letzte_pruefung.
- Nicht lesbare Felder: null. NICHTS raten.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY fehlt");
    const { imagesBase64 } = await req.json();
    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      throw new Error("imagesBase64 fehlt");
    }

    const content: unknown[] = [
      { type: "text", text: "Extrahiere die Maschinendaten aus diesem Prüfbuch/Prüfprotokoll." },
      ...imagesBase64.slice(0, 4).map((url: string) => ({ type: "image_url", image_url: { url, detail: "high" } })),
    ];
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });
    if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}: ${(await aiRes.text()).slice(0, 200)}`);
    const erkannt = JSON.parse((await aiRes.json()).choices?.[0]?.message?.content || "{}");

    // Maschine über die Serien-/Inventarnummer suchen (Feld kennzeichen).
    let maschine: { id: string; bezeichnung: string; kennzeichen: string | null } | null = null;
    const sn = norm(erkannt.seriennummer);
    if (sn) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vehicles?select=id,bezeichnung,kennzeichen&art=eq.maschine`,
        { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
      );
      if (r.ok) {
        const rows = await r.json();
        maschine = (rows as any[]).find((v) => {
          const k = norm(v.kennzeichen);
          return k && (k === sn || k.includes(sn) || sn.includes(k));
        }) || null;
      }
    }

    return new Response(JSON.stringify({ erkannt, maschine }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
