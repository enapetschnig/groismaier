/**
 * Bildideen — KI-Bildgenerierung (Kundenwunsch 02.09.2026)
 *
 *   { prompt, groesse?, bilder?: [{ name, mime, base64 }] }
 *     → { base64, mime: "image/png" }
 *
 * Mit Fotos: Bild-BEARBEITUNG (das Foto bleibt die Grundlage, der Wunsch
 * kommt dazu). Ohne Fotos: Bild-ERZEUGUNG aus dem Text.
 * Läuft über das OpenAI-Bildmodell mit dem bereits hinterlegten Schlüssel.
 * Der Aufruf kommt nur mit gültigem Login durch (JWT-Prüfung am Gateway).
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MODELL = "gpt-image-1";
const ERLAUBTE_GROESSEN = new Set(["1024x1024", "1536x1024", "1024x1536"]);

const antwort = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function base64ZuBytes(b64: string): Uint8Array {
  const rein = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(rein);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!OPENAI_API_KEY) return antwort({ error: "Die Bildgenerierung ist nicht eingerichtet (OPENAI_API_KEY fehlt)." }, 500);

  try {
    const body = await req.json();
    const prompt = String(body?.prompt || "").trim();
    if (prompt.length < 5) return antwort({ error: "Bitte beschreiben, was ins Bild soll." }, 400);
    const groesse = ERLAUBTE_GROESSEN.has(String(body?.groesse)) ? String(body.groesse) : "1536x1024";
    const bilder: { name?: string; mime?: string; base64?: string }[] = Array.isArray(body?.bilder) ? body.bilder : [];

    let res: Response;
    if (bilder.length > 0) {
      // Bearbeitung: Fotos als Grundlage mitgeben (bis zu 4).
      const form = new FormData();
      form.append("model", MODELL);
      form.append("prompt", prompt);
      form.append("size", groesse);
      form.append("quality", "medium");
      form.append("n", "1");
      for (const [i, b] of bilder.slice(0, 4).entries()) {
        if (!b?.base64) continue;
        const bytes = base64ZuBytes(b.base64);
        if (bytes.byteLength > 20 * 1024 * 1024) return antwort({ error: `Foto ${i + 1} ist größer als 20 MB.` }, 400);
        const mime = b.mime && /^image\//.test(b.mime) ? b.mime : "image/jpeg";
        form.append("image[]", new Blob([bytes], { type: mime }), b.name || `foto-${i + 1}.jpg`);
      }
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
    } else {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELL, prompt, size: groesse, quality: "medium", n: 1 }),
      });
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("bild-generieren:", res.status, text.slice(0, 500));
      // Die OpenAI-Fehlermeldung ist für den Anwender meist verständlich
      // genug (z. B. Sicherheitsfilter) — durchreichen, gekürzt.
      let meldung = `Bildmodell antwortet mit ${res.status}.`;
      try { meldung = JSON.parse(text)?.error?.message || meldung; } catch { /* Rohtext */ }
      return antwort({ error: meldung.slice(0, 300) }, 502);
    }
    const daten = await res.json();
    const b64 = daten?.data?.[0]?.b64_json;
    if (!b64) return antwort({ error: "Das Bildmodell hat kein Bild geliefert." }, 502);
    return antwort({ base64: b64, mime: "image/png" });
  } catch (e) {
    console.error("bild-generieren:", e);
    return antwort({ error: (e as Error).message || "Unbekannter Fehler" }, 500);
  }
});
