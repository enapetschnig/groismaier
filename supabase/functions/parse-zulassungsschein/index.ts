// Zulassungsschein per KI auswerten und dem Fahrzeug zuordnen (Kundenwunsch).
// Input:  { imagesBase64: ["data:image/jpeg;base64,...", ...] }  — 1 Schein,
//         ggf. Vorder-/Rückseite bzw. mehrere PDF-Seiten.
// Output: { erkannt: {kennzeichen, marke, handelsbezeichnung, fahrgestellnummer,
//           erstzulassung, halter}, fahrzeug: {id, bezeichnung, kennzeichen} | null }
// Die Zuordnung passiert über das normalisierte Kennzeichen; geschrieben wird
// hier NICHTS — das Übernehmen macht der Client (mit den Rechten des Benutzers).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Kennzeichen vergleichbar machen: Großschrift, nur Buchstaben+Ziffern. */
function normKennzeichen(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const SYSTEM_PROMPT = `Du bist ein hochpräziser OCR-Parser für österreichische KFZ-Zulassungsbescheinigungen (Zulassungsschein, Teil I, auch Scheckkartenformat).
Extrahiere die Daten exakt so, wie sie am Dokument stehen.

GIB NUR JSON ZURÜCK (kein Markdown, keine Erklärung), genau in diesem Schema:
{
  "kennzeichen": string | null,        // amtliches Kennzeichen, z.B. "LI-123AB"
  "marke": string | null,              // Feld D.1 Marke, z.B. "Volkswagen"
  "handelsbezeichnung": string | null, // Feld D.3, z.B. "Crafter 35 Kasten"
  "fahrgestellnummer": string | null,  // Feld E, 17-stellige FIN
  "erstzulassung": string | null,      // Feld B, als YYYY-MM-DD
  "halter": string | null              // Name des Zulassungsbesitzers (C.1.1)
}

Regeln:
- Kennzeichen exakt inkl. Bezirkskürzel übernehmen (Bindestrich zwischen Kürzel und Rest, wenn erkennbar).
- Die FIN hat 17 Zeichen ohne I, O, Q — prüfe darauf; bei Unsicherheit null.
- Datumsangaben nach YYYY-MM-DD wandeln (österreichisches Format am Schein: TT.MM.JJJJ).
- Nicht lesbare Felder: null. NICHTS raten.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY fehlt");
    const { imagesBase64 } = await req.json();
    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      throw new Error("imagesBase64 fehlt");
    }

    // ── KI-Auswertung ──
    const content: unknown[] = [
      { type: "text", text: "Extrahiere die Daten dieses Zulassungsscheins." },
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
    const aiJson = await aiRes.json();
    const erkannt = JSON.parse(aiJson.choices?.[0]?.message?.content || "{}");

    // ── Fahrzeug über das Kennzeichen finden ──
    let fahrzeug: { id: string; bezeichnung: string; kennzeichen: string | null } | null = null;
    const kz = normKennzeichen(erkannt.kennzeichen);
    if (kz) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vehicles?select=id,bezeichnung,kennzeichen`,
        { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
      );
      if (r.ok) {
        const rows = await r.json();
        fahrzeug = (rows as any[]).find((v) => normKennzeichen(v.kennzeichen) === kz) || null;
      }
    }

    return new Response(JSON.stringify({ erkannt, fahrzeug }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
