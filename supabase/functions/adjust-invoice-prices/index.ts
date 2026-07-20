// KI-Preisanpassung für Beleg-Positionen (Angebot / Rechnung).
//
// Der Nutzer gibt eine Zielvorgabe an ("ich brauche 20.000 € mehr" bzw. eine
// Zielsumme netto) und optional einen Hinweis ("Montage nicht anfassen").
// Die KI verteilt die Differenz kaufmännisch sinnvoll auf die Positionen.
//
// Input (JSON):
//   {
//     positionen: [{ index, beschreibung, menge, einheit, einzelpreis, gesamtpreis }],
//     ziel_delta_netto?: number,   // ± € auf die aktuelle Summe
//     ziel_summe_netto?: number,   // absolute Zielsumme netto
//     hinweis?: string
//   }
//   Genau eine der beiden Zielangaben muss gesetzt sein.
//
// Output (JSON):
//   200 { success: true, positionen: [{ index, neuer_einzelpreis }], begruendung,
//         ziel_summe_netto, erreichte_summe_netto }
//   4xx/5xx { error: string }
//
// Der Client rundet und zieht die Restdifferenz centgenau nach
// (src/lib/priceAdjust.ts) — diese Function liefert nur den Vorschlag.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

/** Maximal erlaubte Abweichung der KI-Summe von der Zielsumme. */
const MAX_ABWEICHUNG = 0.02; // 2 %

const SYSTEM_PROMPT = `Du bist ein erfahrener Kalkulant in einem österreichischen Holzbau-Betrieb.

Du bekommst die Positionen eines Angebots bzw. einer Rechnung und eine Zielvorgabe:
Die Netto-Summe soll um einen bestimmten Betrag steigen oder sinken.

Deine Aufgabe: Verteile die Differenz kaufmännisch sinnvoll auf die Positionen,
indem du NEUE EINZELPREISE vorschlägst.

Regeln:
- Die Summe aus (menge × neuer_einzelpreis) über ALLE Positionen muss die
  Zielsumme möglichst exakt treffen (Abweichung deutlich unter 1 %).
- Verteile NICHT stur proportional. Denke wie ein Kalkulant:
  * Material-, Holz-, Beschlags- und Fremdleistungspositionen vertragen
    Preisanpassungen am besten — dort sind Einkaufspreise und Zuschläge
    ohnehin schwankend.
  * Lohn-, Montage-, Arbeitszeit- und Regiepositionen eher schonen: die sind
    gegenüber dem Kunden gut begründet und werden oft geprüft. Nur anfassen,
    wenn es anders nicht aufgeht oder der Nutzer es ausdrücklich wünscht.
  * Pauschalen, Anfahrten, Kleinmaterial und Nebenleistungen sind gute
    Stellschrauben für kleinere Restbeträge.
- Bevorzuge runde, verkaufbare Preise (z.B. 145,00 statt 144,37; bei großen
  Positionen auch 2.500,00 statt 2.487,12). Runde Preise wirken kalkuliert,
  krumme wirken wie nachträglich hochgerechnet.
- KEINE negativen Einzelpreise. Minimum ist 0.
- Bei einer Preissenkung: senke dort, wo Luft ist (Material/Aufschlag), nicht
  bei den Lohnpositionen.
- Beachte den Hinweis des Nutzers IMMER vorrangig, auch wenn er den obigen
  Regeln widerspricht.
- Positionen mit Einzelpreis 0 (z.B. Textzeilen, Titel, inkludierte
  Leistungen) NICHT verändern — gib für sie 0 zurück.

Antworte AUSSCHLIESSLICH mit gültigem JSON in exakt dieser Form, ohne
Markdown-Codeblock und ohne weiteren Text:
{"positionen":[{"index":0,"neuer_einzelpreis":123.45}],"begruendung":"..."}

- "positionen" muss GENAU die gleichen index-Werte enthalten wie die Eingabe,
  vollständig und ohne Duplikate.
- "begruendung" ist 2-4 Sätze auf Deutsch: welche Positionen du warum wie
  angefasst hast. Für den Betriebsinhaber lesbar, keine Floskeln.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface EingabePosition {
  index: number;
  beschreibung?: string;
  menge?: number;
  einheit?: string;
  einzelpreis?: number;
  gesamtpreis?: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Extrahiert das JSON-Objekt aus der Modellantwort (robust gegen ```json-Fences). */
function parseModelJson(raw: string): any {
  let text = (raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Antwort der KI war kein gültiges JSON");
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY nicht konfiguriert" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const positionen: EingabePosition[] = Array.isArray(body?.positionen) ? body.positionen : [];

    if (positionen.length === 0) {
      return json({ error: "positionen fehlt oder ist leer" }, 400);
    }
    if (positionen.length > 200) {
      return json({ error: "Zu viele Positionen (max. 200)" }, 400);
    }

    // Indizes normalisieren + auf Eindeutigkeit prüfen.
    const eingabeIndizes: number[] = [];
    for (const p of positionen) {
      const idx = Number(p?.index);
      if (!Number.isInteger(idx)) {
        return json({ error: "Jede Position braucht einen ganzzahligen index" }, 400);
      }
      if (eingabeIndizes.includes(idx)) {
        return json({ error: `Doppelter index ${idx} in der Eingabe` }, 400);
      }
      eingabeIndizes.push(idx);
    }

    const summeAktuell = r2(
      positionen.reduce((s, p) => {
        const g = Number(p?.gesamtpreis);
        if (isFinite(g)) return s + g;
        return s + (Number(p?.menge) || 0) * (Number(p?.einzelpreis) || 0);
      }, 0)
    );

    const hatDelta = body?.ziel_delta_netto !== undefined && body?.ziel_delta_netto !== null;
    const hatSumme = body?.ziel_summe_netto !== undefined && body?.ziel_summe_netto !== null;
    if (!hatDelta && !hatSumme) {
      return json({ error: "ziel_delta_netto oder ziel_summe_netto muss angegeben werden" }, 400);
    }

    const zielSumme = hatSumme
      ? Number(body.ziel_summe_netto)
      : r2(summeAktuell + Number(body.ziel_delta_netto));

    if (!isFinite(zielSumme)) {
      return json({ error: "Zielvorgabe ist keine gültige Zahl" }, 400);
    }
    if (zielSumme < 0) {
      return json({ error: "Zielsumme darf nicht negativ sein" }, 400);
    }

    const hinweis = typeof body?.hinweis === "string" ? body.hinweis.trim().slice(0, 2000) : "";
    const delta = r2(zielSumme - summeAktuell);

    const userMessage = [
      `Aktuelle Netto-Summe: ${summeAktuell.toFixed(2)} EUR`,
      `Ziel-Netto-Summe: ${zielSumme.toFixed(2)} EUR`,
      `Zu verteilende Differenz: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} EUR`,
      "",
      "Positionen:",
      ...positionen.map(p => {
        const menge = Number(p?.menge) || 0;
        const ep = Number(p?.einzelpreis) || 0;
        const gp = isFinite(Number(p?.gesamtpreis)) ? Number(p.gesamtpreis) : menge * ep;
        return `- index ${p.index}: "${(p?.beschreibung || "(ohne Beschreibung)").slice(0, 300)}" | ` +
          `Menge ${menge} ${p?.einheit || ""} | Einzelpreis ${ep.toFixed(2)} EUR | Gesamt ${r2(gp).toFixed(2)} EUR`;
      }),
      "",
      hinweis ? `Hinweis des Nutzers (hat Vorrang): ${hinweis}` : "Kein besonderer Hinweis des Nutzers.",
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 8000,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("OpenAI error:", res.status, detail);
      return json({ error: `OpenAI-Fehler (${res.status})` }, 502);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    let parsed: any;
    try {
      parsed = parseModelJson(raw);
    } catch (e: any) {
      console.error("JSON-Parse fehlgeschlagen:", raw?.slice?.(0, 500));
      return json({ error: e.message || "Antwort der KI war kein gültiges JSON" }, 422);
    }

    const vorschlaege = Array.isArray(parsed?.positionen) ? parsed.positionen : null;
    if (!vorschlaege) {
      return json({ error: "Antwort der KI enthielt kein positionen-Array" }, 422);
    }

    // ── Serverseitige Validierung ────────────────────────────────────────────
    if (vorschlaege.length !== positionen.length) {
      return json({
        error: `KI lieferte ${vorschlaege.length} Positionen, erwartet waren ${positionen.length}`,
      }, 422);
    }

    const preisProIndex = new Map<number, number>();
    for (const v of vorschlaege) {
      const idx = Number(v?.index);
      const preis = Number(v?.neuer_einzelpreis);
      if (!Number.isInteger(idx) || !eingabeIndizes.includes(idx)) {
        return json({ error: `KI lieferte unbekannten index ${v?.index}` }, 422);
      }
      if (preisProIndex.has(idx)) {
        return json({ error: `KI lieferte index ${idx} doppelt` }, 422);
      }
      if (!isFinite(preis)) {
        return json({ error: `Ungültiger Preis für index ${idx}` }, 422);
      }
      if (preis < 0) {
        return json({ error: `Negativer Preis (${preis}) für index ${idx}` }, 422);
      }
      preisProIndex.set(idx, r2(preis));
    }

    // Vollständigkeit (Anzahl stimmt + keine Duplikate ⇒ hier nur noch Sicherheitsnetz).
    for (const idx of eingabeIndizes) {
      if (!preisProIndex.has(idx)) {
        return json({ error: `KI-Antwort fehlt index ${idx}` }, 422);
      }
    }

    // Erreichte Summe gegen die Zielsumme prüfen.
    const erreichteSumme = r2(
      positionen.reduce((s, p) => {
        const menge = Number(p?.menge) || 0;
        const rabattFaktor =
          isFinite(Number(p?.gesamtpreis)) && menge > 0 && Number(p?.einzelpreis) > 0
            ? Number(p.gesamtpreis) / (menge * Number(p.einzelpreis))
            : 1;
        const f = isFinite(rabattFaktor) && rabattFaktor > 0 ? rabattFaktor : 1;
        return s + menge * (preisProIndex.get(Number(p.index)) ?? 0) * f;
      }, 0)
    );

    const bezug = Math.max(Math.abs(zielSumme), 1);
    const abweichung = Math.abs(erreichteSumme - zielSumme) / bezug;
    if (abweichung >= MAX_ABWEICHUNG) {
      return json({
        error:
          `KI-Ergebnis verfehlt die Zielsumme: ${erreichteSumme.toFixed(2)} EUR statt ` +
          `${zielSumme.toFixed(2)} EUR (${(abweichung * 100).toFixed(1)} % Abweichung)`,
      }, 422);
    }

    const begruendung =
      typeof parsed?.begruendung === "string" && parsed.begruendung.trim()
        ? parsed.begruendung.trim()
        : "Die Differenz wurde auf die Positionen mit dem größten Spielraum verteilt.";

    return json({
      success: true,
      positionen: eingabeIndizes.map(idx => ({
        index: idx,
        neuer_einzelpreis: preisProIndex.get(idx),
      })),
      begruendung,
      ziel_summe_netto: zielSumme,
      erreichte_summe_netto: erreichteSumme,
    });
  } catch (err: any) {
    console.error("adjust-invoice-prices error:", err);
    return json({ error: err?.message || "Unbekannter Fehler" }, 500);
  }
});
