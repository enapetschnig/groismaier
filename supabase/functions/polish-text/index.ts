// Polish/transcribe user text via OpenAI
// Modes:
//  - "transcribe": audio blob → text (Whisper)
//  - "polish": raw text → geschliffener Text (GPT-4o-mini)
//  - "append": existierender Text + neuer Input → zusammengefügter geschliffener Text

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const POLISH_SYSTEM_PROMPT = `Du bist ein Assistent für österreichische Handwerker, der diktierte Notizen in einen sauberen, professionellen Text umwandelt.

Regeln:
- Verwende korrektes Deutsch mit korrekter Grammatik und Rechtschreibung
- Behalte den Wortschatz und Stil des Diktanten bei (nicht zu formell, aber professionell)
- Korrigiere Füllwörter ("ähm", "also", "ich meine")
- Baue logische Sätze, setze Satzzeichen
- Wenn es eine Liste/Aufzählung ist, nutze Bullet Points
- Fachbegriffe aus dem Handwerk richtig schreiben (Fliese, Gewerk, Dämmung, Aufmaß, etc.)
- Keine Erklärungen oder Meta-Kommentare, nur der geschliffene Text
- Kürze nicht den Inhalt, erweitere nur leicht wenn sinnvoll für Verständlichkeit
- Gib KEIN Markdown zurück (keine Sterne, keine Headings)`;

const APPEND_SYSTEM_PROMPT = `Du bist ein Assistent für österreichische Handwerker. Du erhältst:
1. Einen bestehenden Text
2. Eine neue Ergänzung (diktiert)

Deine Aufgabe: Füge die Ergänzung sinnvoll und flüssig an den bestehenden Text an.

Regeln:
- Bestehenden Text NICHT ändern
- Neue Ergänzung als neuen Satz oder Absatz anhängen
- Absatz-Trennung wenn inhaltlich anderes Thema
- Gleicher Schreibstil wie bestehender Text
- Korrigiere Grammatik/Rechtschreibung der Ergänzung
- Nur das Endergebnis ausgeben, keine Erklärung`;

async function callChatCompletion(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob, "audio.webm");
  form.append("model", "whisper-1");
  form.append("language", "de");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper: ${res.status} ${await res.text()}`);
  return (await res.text()).trim();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY nicht konfiguriert" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    // --- Multipart: Audio-Datei (Transkription + optional Polish/Append) ---
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio") as File | null;
      const existingText = (form.get("existingText") as string | null) || "";
      const mode = (form.get("mode") as string | null) || "polish"; // "polish" | "append" | "raw"

      if (!audio) {
        return new Response(JSON.stringify({ error: "audio fehlt" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transcript = await transcribeAudio(audio);
      if (!transcript) {
        return new Response(JSON.stringify({ error: "Keine Sprache erkannt" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (mode === "raw") {
        return new Response(JSON.stringify({ success: true, text: transcript, transcript }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let polished: string;
      if (mode === "append" && existingText.trim()) {
        polished = await callChatCompletion(
          APPEND_SYSTEM_PROMPT,
          `Bestehender Text:\n${existingText}\n\nErgänzung (diktiert):\n${transcript}`
        );
      } else {
        polished = await callChatCompletion(POLISH_SYSTEM_PROMPT, transcript);
      }

      return new Response(JSON.stringify({ success: true, text: polished, transcript }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- JSON: nur Text-Polish/Append ---
    const body = await req.json();
    const mode = body.mode || "polish";
    const text = body.text || "";
    const existingText = body.existingText || "";

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "text fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let polished: string;
    if (mode === "append" && existingText.trim()) {
      polished = await callChatCompletion(
        APPEND_SYSTEM_PROMPT,
        `Bestehender Text:\n${existingText}\n\nErgänzung:\n${text}`
      );
    } else {
      polished = await callChatCompletion(POLISH_SYSTEM_PROMPT, text);
    }

    return new Response(JSON.stringify({ success: true, text: polished }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("polish-text error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
