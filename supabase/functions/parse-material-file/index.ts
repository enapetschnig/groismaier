const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileType }: { fileContent: string; fileType: string } = await req.json();

    if (!fileContent) {
      return new Response(
        JSON.stringify({ error: "File content required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing material file, type: ${fileType}, content length: ${fileContent.length}`);

    const systemPrompt = `Du bist ein Assistent für Materialverwaltung in einem Handwerksbetrieb (Montagetischlerei).
Der Benutzer hat eine Datei (${fileType}) mit Materialien hochgeladen.
Extrahiere aus dem Inhalt eine Liste von Materialien mit folgenden Feldern:
- name: Materialname (z.B. "Fliesen 30x60 anthrazit")
- beschreibung: Kurze Beschreibung (optional)
- einheit: Eine der folgenden: Stk., m², lfm, kg, Sack, Eimer, Pkg.
- einzelpreis: Preis pro Einheit als Zahl (0 wenn nicht erkennbar)

Antworte NUR mit validem JSON in diesem Format:
{"materials": [{"name": "Fliesen 30x60", "beschreibung": "Anthrazit matt", "einheit": "m²", "einzelpreis": 25.90}]}

Wenn du keine Materialien erkennen kannst, antworte: {"materials": []}
Keine zusätzlichen Erklärungen, nur JSON.`;

    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: fileContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!chatResponse.ok) {
      const err = await chatResponse.text();
      console.error("GPT error:", err);
      return new Response(
        JSON.stringify({ error: "KI-Verarbeitung fehlgeschlagen" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const chatData = await chatResponse.json();
    const content = chatData.choices?.[0]?.message?.content || "{}";
    console.log("GPT response:", content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { materials: [] };
    }

    return new Response(
      JSON.stringify({ materials: parsed.materials || [] }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
