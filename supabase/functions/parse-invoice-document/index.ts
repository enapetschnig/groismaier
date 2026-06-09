// Parse incoming invoice (image) via OpenAI GPT-4o Vision (präziser als mini).
// Input: { imageBase64: "data:image/jpeg;base64,..." }
// Output: strukturierte Rechnungsdaten mit Plausi-Check.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Kategorien-Werte aus admin_config_options laden (zur Enum-Validierung im Prompt).
async function loadKategorieValues(): Promise<string[]> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_config_options?select=wert,sort_order&kategorie=eq.eingangsrechnung_kategorie&is_active=eq.true&order=sort_order`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.map((x: any) => x.wert).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildSystemPrompt(kategorieValues: string[]): string {
  const fallback = [
    "material", "verbrauchsmaterial", "werkzeug", "werkstatt", "fremdleistung",
    "miete", "treibstoff", "geschaeftsessen", "buero", "fortbildung",
    "versicherung", "reise", "sonstiges",
  ];
  const list = kategorieValues.length > 0 ? kategorieValues : fallback;
  const kategorieEnum = list.map((v) => `"${v}"`).join(" | ");
  return `Du bist ein hochpräziser OCR-Parser für österreichische Eingangsrechnungen und Belege.
Deine Aufgabe: exakte Werte aus dem Rechnungsbild extrahieren.

GIB NUR JSON ZURÜCK (kein Markdown, keine Erklärung), genau in diesem Schema:

{
  "lieferant": string,
  "rechnungsnummer": string | null,
  "rechnungsdatum": string | null,  // YYYY-MM-DD
  "faellig_am": string | null,      // YYYY-MM-DD
  "betrag_brutto": number,          // der ZU ZAHLENDE Endbetrag in Euro
  "betrag_netto": number | null,    // Netto-Summe (vor USt)
  "ust_betrag": number | null,      // ausgewiesene USt in Euro
  "ust_satz": 0 | 10 | 13 | 20,
  "kategorie": ${kategorieEnum},
  "notizen": string | null
}

══════════════════════════════════════════════════════════════
KRITISCHE REGELN FÜR BRUTTO-BETRAG (absolut wichtig):
══════════════════════════════════════════════════════════════
0. WENN MEHRERE SEITEN übergeben werden: Schau dir ALLE Seiten an, vor
   allem die LETZTE. Der Gesamtbetrag steht fast immer ganz unten auf
   der LETZTEN Seite — viele Rechnungen haben auf Seite 1 nur Positionen
   ohne Summen. Ignoriere Zwischensummen auf früheren Seiten.
1. betrag_brutto = der FINALE ZAHLBETRAG in Euro. Typische Beschriftungen:
   "Rechnungsbetrag", "Gesamtbetrag", "Summe Brutto", "Gesamt brutto",
   "Zu zahlen", "Zahlbetrag", "Endbetrag", "Total", "Gesamtbetrag inkl.
   USt", "Rechnungssumme". Typischerweise die GRÖSSTE Zahl, meist FETT
   gedruckt oder optisch hervorgehoben, am absoluten Ende.
2. NIEMALS eine Zwischensumme, einen Positionspreis, einen Rabatt, eine
   Skonto-Zeile oder eine USt-Zeile als Brutto verwenden. Wenn mehrere
   Zahlen zur Auswahl stehen, nimm die UNTERSTE/LETZTE.
3. Unterscheidung Netto vs Brutto: Brutto enthält die USt, Netto nicht.
   Wenn auf der Rechnung beides steht, ist Brutto die GRÖSSERE Zahl.
4. Bei Teilzahlungen: "Offener Betrag" bzw. "Zu zahlen" hat Vorrang vor
   "Rechnungsbetrag". Wenn beide existieren, nimm den finalen Zahlbetrag.
5. SELBSTKONTROLLE: Rechne nach: betrag_netto + ust_betrag ≈ betrag_brutto
   (Toleranz 0,02 €). Wenn nicht, hast du wahrscheinlich netto und brutto
   verwechselt – korrigiere, bevor du antwortest.

ZAHLENFORMATIERUNG (Österreich/Deutschland):
- Dezimaltrennzeichen ist das Komma: "1.234,56" → 1234.56
- Tausendertrennzeichen ist der Punkt oder Leerzeichen: "12 345,60" → 12345.60
- Niemals Punkt als Dezimaltrenner annehmen, außer bei englischen Formaten
- Entferne Währungszeichen (€, EUR) und Leerzeichen vor dem Parsen

PLAUSIBILITÄT:
- Wenn möglich, prüfe: betrag_netto + ust_betrag ≈ betrag_brutto (±0,02).
- Falls nur zwei von drei Werten erkennbar sind, berechne den dritten nach.
- ust_satz: nur 0, 10, 13 oder 20 (österreichische Sätze).
  * 20% = Standard (Material, Werkzeug, Dienstleistung)
  * 10% = ermäßigt (Lebensmittel, Bücher, Wohnung)
  * 13% = ermäßigt (Blumen, Kultur)
  * 0% = steuerfrei (Reverse Charge, innergem. Lieferung)

DATUMSFORMAT:
- Deutsches Format erkennen: "24.03.2026" → "2026-03-24"
- Falls Datum zweifelhaft, lieber null setzen.

KATEGORIE (intelligent raten anhand Lieferant + Positionen):
- Baumärkte/Großhandel (Hornbach, Bauhaus, Quester, Obi) → "material" oder "verbrauchsmaterial"
- Werkzeug-Spezialisten (Würth, Hilti, Festool) → "werkzeug"
- Kfz-Werkstatt / Autoteile-Händler → "werkstatt"
- Tankstellen (OMV, Shell, BP, Eni, Jet) → "treibstoff"
- Restaurants, Gasthäuser, Caterer → "geschaeftsessen"
- Hotels, ÖBB, Taxi, Flug → "reise"
- Versicherungen, Behördengebühren, Kammerumlage → "versicherung"
- Fortbildung, Kurse, Seminare → "fortbildung"
- Büromaterial, Software-Abos, Drucker → "buero"
- Sonst → "sonstiges"

Wenn du ein Feld nicht eindeutig erkennen kannst, setze es auf null.
Nimm dir Zeit und lies alle Zahlen genau. Präzision vor Geschwindigkeit.
Antworte ausschließlich mit dem JSON-Objekt.`;
}

/** Parst "1.234,56" oder "1234,56" oder "1,234.56" oder "1234.56" → number. */
function parseEuroAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/[€$\s]/g, "").replace(/EUR/gi, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // EU: "1.234,56" → 1234.56  /  US: "1,234.56" → 1234.56
    // Heuristik: das zuletzt auftretende Zeichen ist der Dezimaltrenner.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Validiert und korrigiert das Rechnungsobjekt aus GPT. */
function validateInvoice(raw: any): {
  lieferant: string;
  rechnungsnummer: string | null;
  rechnungsdatum: string | null;
  faellig_am: string | null;
  betrag_brutto: number | null;
  betrag_netto: number | null;
  ust_satz: number;
  kategorie: string;
  notizen: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const lieferant = typeof raw?.lieferant === "string" ? raw.lieferant.trim() : "";
  const rechnungsnummer = typeof raw?.rechnungsnummer === "string" && raw.rechnungsnummer.trim()
    ? raw.rechnungsnummer.trim()
    : null;
  const rechnungsdatum = typeof raw?.rechnungsdatum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.rechnungsdatum)
    ? raw.rechnungsdatum
    : null;
  const faellig_am = typeof raw?.faellig_am === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.faellig_am)
    ? raw.faellig_am
    : null;

  let brutto = parseEuroAmount(raw?.betrag_brutto);
  let netto = parseEuroAmount(raw?.betrag_netto);
  const ust = parseEuroAmount(raw?.ust_betrag);
  let ustSatz = Number(raw?.ust_satz);
  if (![0, 10, 13, 20].includes(ustSatz)) ustSatz = 20;

  // Plausi-Check: brutto ≈ netto + ust. Falls Abweichung > 0,02 € und wir
  // nur zwei Werte haben, rechnen wir den dritten nach.
  if (brutto == null && netto != null && ust != null) {
    brutto = Math.round((netto + ust) * 100) / 100;
  } else if (netto == null && brutto != null && ust != null) {
    netto = Math.round((brutto - ust) * 100) / 100;
  } else if (brutto != null && netto != null && ust != null) {
    const expected = Math.round((netto + ust) * 100) / 100;
    if (Math.abs(expected - brutto) > 0.05) {
      // Inkonsistent → Brutto hat Priorität (das ist der zu zahlende Betrag);
      // Netto wird aus Brutto + USt-Satz neu berechnet.
      warnings.push(`Betrag-Diskrepanz: ${netto}+${ust} ≠ ${brutto} → Netto neu berechnet`);
      if (ustSatz > 0) {
        netto = Math.round((brutto / (1 + ustSatz / 100)) * 100) / 100;
      }
    }
  } else if (brutto != null && netto == null && ust == null && ustSatz > 0) {
    // Nur Brutto vorhanden → Netto aus USt-Satz ableiten.
    netto = Math.round((brutto / (1 + ustSatz / 100)) * 100) / 100;
  }

  if (brutto != null && brutto < 0) brutto = Math.abs(brutto);
  if (netto != null && netto < 0) netto = Math.abs(netto);

  // Hardening: wenn Brutto immer noch fehlt oder 0, ist das ein klares Fail.
  if (brutto == null || brutto <= 0) {
    warnings.push("Brutto-Betrag konnte nicht sicher erkannt werden – bitte manuell prüfen.");
  }

  const kategorie = typeof raw?.kategorie === "string" && raw.kategorie.trim()
    ? raw.kategorie.trim()
    : "sonstiges";

  const notizen = typeof raw?.notizen === "string" && raw.notizen.trim()
    ? raw.notizen.trim()
    : null;

  return {
    lieferant,
    rechnungsnummer,
    rechnungsdatum,
    faellig_am,
    betrag_brutto: brutto,
    betrag_netto: netto,
    ust_satz: ustSatz,
    kategorie,
    notizen,
    warnings,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY nicht konfiguriert" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    // Akzeptiere sowohl einzelnes Bild als auch Array (mehrseitige PDFs)
    const rawImages: string[] = Array.isArray(body?.imagesBase64)
      ? body.imagesBase64.filter((x: any) => typeof x === "string" && x.length > 0)
      : typeof body?.imageBase64 === "string" && body.imageBase64.length > 0
        ? [body.imageBase64]
        : [];

    if (rawImages.length === 0) {
      return new Response(JSON.stringify({ error: "imageBase64 oder imagesBase64 erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrls = rawImages.map((s) =>
      s.startsWith("data:") ? s : `data:image/jpeg;base64,${s}`
    );

    const kategorieValues = await loadKategorieValues();
    const systemPrompt = buildSystemPrompt(kategorieValues);

    const userContent: any[] = [
      {
        type: "text",
        text: dataUrls.length > 1
          ? `Extrahiere die Rechnungsdaten aus den folgenden ${dataUrls.length} Rechnungs-Seiten. Der Brutto-Gesamtbetrag steht meist auf der LETZTEN Seite (als "Gesamtbetrag", "Rechnungsbetrag" oder "Zu zahlen") – schau dir ALLE Seiten an und nimm den finalen Endbetrag.`
          : "Extrahiere die Rechnungsdaten aus diesem Bild. Achte besonders auf den Brutto-Gesamtbetrag (den zu zahlenden Endbetrag) – dieser ist am wichtigsten und muss exakt stimmen.",
      },
      ...dataUrls.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // gpt-4o hat deutlich präzisere OCR-Genauigkeit als gpt-4o-mini.
        // Bei mehrseitigen PDFs werden alle Seiten in einem Call analysiert.
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", errText);
      return new Response(JSON.stringify({ error: "OpenAI-Fehler", details: errText.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Keine Antwort von OpenAI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // JSON robust parsen (JSON-Mode ist aktiv → sollte direkt JSON sein,
    // aber sicherheitshalber trotzdem Markdown-Fences entfernen).
    let jsonText = content.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    let parsedRaw: any;
    try {
      parsedRaw = JSON.parse(jsonText);
    } catch {
      return new Response(JSON.stringify({ error: "Antwort konnte nicht geparst werden", raw: content.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof parsedRaw !== "object" || parsedRaw === null) {
      return new Response(JSON.stringify({ error: "Ungültige AI-Antwort" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let validated = validateInvoice(parsedRaw);

    // Zweiter Durchgang, wenn das erste Ergebnis verdächtig ist:
    //   - kein Brutto-Betrag erkannt, oder
    //   - Plausi-Check ausgelöst (netto + ust ≠ brutto), oder
    //   - Brutto unrealistisch klein (< 1 €).
    // Wir fragen gezielt nach dem Gesamtbetrag und übergeben dasselbe
    // Bild-Set + die vorherige Antwort zur Kontrolle.
    const needsSecondPass =
      !validated.betrag_brutto ||
      validated.betrag_brutto < 1 ||
      validated.warnings.length > 0;

    if (needsSecondPass) {
      try {
        const followUpPrompt = `Du hast gerade folgendes JSON extrahiert:\n${JSON.stringify(parsedRaw)}\n\nBitte überprüfe den Brutto-Gesamtbetrag NOCHMAL anhand der Bilder. Besonders wichtig: der zu zahlende Endbetrag (nicht Netto, nicht Zwischensumme). Schau nochmal auf die LETZTE Seite, ganz unten. Antworte erneut im selben JSON-Schema mit KORREKTEN Werten.`;
        const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
              { role: "assistant", content: JSON.stringify(parsedRaw) },
              {
                role: "user",
                content: [
                  { type: "text", text: followUpPrompt },
                  ...dataUrls.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
                ] as any,
              },
            ],
            temperature: 0,
            max_tokens: 1500,
            response_format: { type: "json_object" },
          }),
        });
        if (res2.ok) {
          const d2 = await res2.json();
          const c2 = d2.choices?.[0]?.message?.content;
          if (c2) {
            let j2t = c2.trim();
            const m2 = j2t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (m2) j2t = m2[1];
            try {
              const parsed2 = JSON.parse(j2t);
              const v2 = validateInvoice(parsed2);
              // Zweiten Versuch nur übernehmen, wenn er mindestens so
              // konsistent ist (keine Warnings) oder einen plausiblen
              // Brutto-Betrag liefert, wo vorher keiner war.
              if (
                (v2.warnings.length < validated.warnings.length && v2.betrag_brutto) ||
                (!validated.betrag_brutto && v2.betrag_brutto) ||
                (v2.betrag_brutto && validated.betrag_brutto && v2.betrag_brutto > validated.betrag_brutto && v2.warnings.length === 0)
              ) {
                validated = v2;
              }
            } catch { /* keep first result */ }
          }
        }
      } catch (e) { console.error("Second-pass failed:", e); }
    }

    return new Response(JSON.stringify({ success: true, data: validated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Parse error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
