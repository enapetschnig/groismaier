// E-Mail-Postfach in der App (Kundenwunsch): Proxy zur Microsoft-Graph-API.
// Die Graph-Zugangsdaten (Entra-App „Mailverbindung") bleiben serverseitig —
// der Browser bekommt sie nie zu sehen.
//
// Aktionen (POST-Body):
//   { aktion: "liste",   postfach, suche?, ordner?, skip? }   → Mail-Liste (25er-Seiten)
//   { aktion: "detail",  postfach, id }                       → Betreff/Body/Anhänge-Metadaten (+ als gelesen markieren)
//   { aktion: "anhang",  postfach, id, anhangId }             → ein Anhang mit Inhalt (base64)
//   { aktion: "ordner",  postfach }                           → Ordnerliste mit Ungelesen-Zählern
//   { aktion: "senden",  postfach, modus, an[], cc?, betreff?, text, bezugId?,
//                        anhaenge?: [{ name, inhaltBase64, typ? }] }
//       modus "neu" | "antwort" | "antwortAlle" | "weiterleiten" — Antworten/
//       Weiterleiten laufen über die Graph-Komfort-Endpunkte: Microsoft hängt
//       Zitat + Betreff (AW:/WG:) selbst an und legt die Mail in "Gesendete
//       Elemente" ab → Outlook bleibt automatisch synchron.
//   { aktion: "loeschen", postfach, id }                       → in den Papierkorb
//
// Zugriff NUR für angemeldete Administratoren — die Funktion prüft das
// Benutzer-Token und die Rolle selbst (verify_jwt ist projektweit aus).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MS_TENANT = Deno.env.get("MS_TENANT_ID")!;
const MS_CLIENT = Deno.env.get("MS_CLIENT_ID")!;
const MS_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;

/** Nur diese Postfächer darf die App anzeigen. */
const ERLAUBTE_POSTFAECHER = new Set([
  "christian.groismaier@cg-holzbau.at",
  "office@cg-holzbau.at",
  "buchhaltung@cg-holzbau.at",
]);

// Graph-Token mit kleinem Cache (Edge-Instanz lebt einige Minuten).
let tokenCache: { token: string; bis: number } | null = null;
async function graphToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.bis - 60_000) return tokenCache.token;
  const r = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT,
      client_secret: MS_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`Microsoft-Anmeldung fehlgeschlagen (${r.status})`);
  const j = await r.json();
  tokenCache = { token: j.access_token, bis: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function graph(pfad: string, init?: RequestInit): Promise<Response> {
  const token = await graphToken();
  return fetch(`https://graph.microsoft.com/v1.0${pfad}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

/** Anmeldung + Admin-Rolle des Aufrufers prüfen. */
async function pruefeAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  // Interner Wartungszugang (KI-Lernlauf per Service-Schlüssel): Beweis statt
  // String-Vergleich — nur ein Service-Token darf den GoTrue-Admin-Endpunkt.
  if (auth.slice(7) === SERVICE_ROLE) return "service";
  try {
    const probe = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
      headers: { Authorization: auth, apikey: auth.slice(7) },
    });
    if (probe.ok) return "service";
  } catch { /* keine Service-Berechtigung */ }
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: ANON_KEY },
  });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user?.id) return null;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${user.id}&role=eq.administrator`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  const rollen = r.ok ? await r.json() : [];
  return Array.isArray(rollen) && rollen.length > 0 ? user.id : null;
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

/**
 * KI-Lernlauf: unbekannte Absender-/Empfängeradressen aus den Postfächern mit
 * der Kundenliste abgleichen (Anzeigename, Ort, Betreffs) und sichere Treffer
 * in kunden_mail_adressen ablegen. Läuft höchstens 1× pro Tag, angestoßen im
 * Hintergrund über die ER-Vorschläge.
 */
async function adressLernlauf(): Promise<{ geprueft: number; gelernt: number }> {
  const sr = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

  // Kundenliste + bereits bekannte Adressen laden.
  const kundenRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=id,kundennummer,name,ort,email&limit=1000`, { headers: sr });
  const kunden = kundenRes.ok ? await kundenRes.json() : [];
  const bekanntRes = await fetch(`${SUPABASE_URL}/rest/v1/kunden_mail_adressen?select=adresse&limit=5000`, { headers: sr });
  const bekannt = new Set<string>(
    (bekanntRes.ok ? await bekanntRes.json() : []).map((x: { adresse: string }) => String(x.adresse).toLowerCase()),
  );
  for (const k of kunden) if (k.email) bekannt.add(String(k.email).toLowerCase());

  // Korrespondenz-Adressen der letzten Mails einsammeln (beide Postfächer).
  const kandidaten = new Map<string, { name: string; betreffs: string[] }>();
  for (const mbAdr of ["christian.groismaier@cg-holzbau.at", "office@cg-holzbau.at"]) {
    for (const seite of [0, 100]) {
      const r = await graph(
        `/users/${encodeURIComponent(mbAdr)}/messages?$top=100&$skip=${seite}&$select=subject,from,toRecipients&$orderby=receivedDateTime desc`,
      );
      if (!r.ok) continue;
      for (const m of ((await r.json()).value || []) as Record<string, any>[]) {
        const beteiligte = [
          m.from?.emailAddress,
          ...(m.toRecipients || []).map((t: Record<string, any>) => t.emailAddress),
        ].filter(Boolean);
        for (const p of beteiligte) {
          const adr = String(p.address || "").toLowerCase();
          if (!adr || adr.endsWith("@cg-holzbau.at") || bekannt.has(adr)) continue;
          if (/noreply|no-reply|newsletter|notification|mailer|automat/i.test(adr)) continue;
          const e = kandidaten.get(adr) || { name: String(p.name || ""), betreffs: [] };
          if (e.betreffs.length < 3 && m.subject) e.betreffs.push(String(m.subject).slice(0, 60));
          kandidaten.set(adr, e);
        }
      }
    }
  }
  const liste = [...kandidaten.entries()].slice(0, 80);
  if (liste.length === 0 || !OPENAI_API_KEY) return { geprueft: 0, gelernt: 0 };

  const kundenText = kunden
    .map((k: Record<string, unknown>) => `${k.kundennummer || "?"} | ${k.name} | ${k.ort || ""}`)
    .join("\n");
  const adressText = liste
    .map(([adr, e]) => `${adr} | ${e.name} | ${e.betreffs.join("; ")}`)
    .join("\n");

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Du ordnest E-Mail-Adressen den Kunden eines Holzbau-Betriebs zu.
Gegeben: Kundenliste (Nummer | Name | Ort) und Adressliste (Adresse | Anzeigename | Beispiel-Betreffs).
Ordne NUR zu, wenn der ANZEIGENAME oder die ADRESSE selbst eindeutig zum Kundennamen passt (Nachname, Firmenname).
Betreffzeilen sind höchstens Bestätigung, NIE alleinige Grundlage — ein Planer/Lieferant, der über das Projekt eines Kunden schreibt, ist NICHT der Kunde.
Lieferanten, Planer, Ämter, Banken, Werbung: NICHT zuordnen.
Antworte als JSON: {"zuordnungen":[{"adresse":"...","kunde_nummer":"...","sicherheit":0-100}]} — nur Treffer mit Sicherheit >= 80 aufnehmen.`,
        },
        { role: "user", content: `KUNDEN:\n${kundenText}\n\nADRESSEN:\n${adressText}` },
      ],
    }),
  });
  if (!aiRes.ok) return { geprueft: liste.length, gelernt: 0 };
  let zuordnungen: { adresse: string; kunde_nummer: string; sicherheit: number }[] = [];
  try {
    zuordnungen = JSON.parse((await aiRes.json()).choices?.[0]?.message?.content || "{}").zuordnungen || [];
  } catch { /* Ausgabe unbrauchbar → nichts lernen */ }

  const nummerZuId = new Map(kunden.map((k: Record<string, unknown>) => [String(k.kundennummer), k.id]));
  let gelernt = 0;
  for (const z of zuordnungen) {
    const kundeId = nummerZuId.get(String(z.kunde_nummer));
    const adr = String(z.adresse || "").toLowerCase();
    if (!kundeId || !adr || (z.sicherheit ?? 0) < 80 || bekannt.has(adr)) continue;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/kunden_mail_adressen`, {
      method: "POST",
      headers: { ...sr, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({
        customer_id: kundeId,
        adresse: adr,
        anzeigename: kandidaten.get(adr)?.name || null,
        quelle: "ki",
      }),
    });
    if (r.ok) gelernt++;
  }
  // Zeitstempel für die 1×-täglich-Drossel.
  await fetch(`${SUPABASE_URL}/rest/v1/app_settings`, {
    method: "POST",
    headers: { ...sr, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key: "mail_adress_lernlauf_am", value: new Date().toISOString() }),
  });
  return { geprueft: liste.length, gelernt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const antwort = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!(await pruefeAdmin(req))) return antwort({ error: "Nicht berechtigt" }, 401);

    const body = await req.json();
    const { aktion, postfach, id, anhangId, suche, ordner, skip } = body;
    if (!ERLAUBTE_POSTFAECHER.has(String(postfach || ""))) {
      return antwort({ error: "Unbekanntes Postfach" }, 400);
    }
    const mb = encodeURIComponent(postfach);

    if (aktion === "liste") {
      const felder = "id,subject,from,receivedDateTime,hasAttachments,bodyPreview,isRead";
      let pfad: string;
      if (suche && String(suche).trim()) {
        // Graph-Volltextsuche (Betreff, Absender, Inhalt). $search kann nicht
        // mit $orderby kombiniert werden — Graph sortiert nach Relevanz.
        const q = encodeURIComponent(`"${String(suche).replace(/"/g, "")}"`);
        pfad = `/users/${mb}/messages?$search=${q}&$select=${felder}&$top=25`;
      } else {
        const basis = ordner ? `/users/${mb}/mailFolders/${encodeURIComponent(ordner)}/messages` : `/users/${mb}/messages`;
        pfad = `${basis}?$select=${felder}&$orderby=receivedDateTime desc&$top=25&$skip=${Number(skip) || 0}`;
      }
      const r = await graph(pfad);
      if (!r.ok) return antwort({ error: `Graph ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
      const j = await r.json();
      return antwort({
        mails: (j.value || []).map((m: Record<string, unknown>) => ({
          id: m.id,
          betreff: m.subject || "(kein Betreff)",
          von: (m.from as any)?.emailAddress?.name || (m.from as any)?.emailAddress?.address || "?",
          vonAdresse: (m.from as any)?.emailAddress?.address || "",
          empfangen: m.receivedDateTime,
          hatAnhaenge: !!m.hasAttachments,
          vorschau: m.bodyPreview || "",
          gelesen: !!m.isRead,
        })),
        mehr: !!j["@odata.nextLink"],
      });
    }

    if (aktion === "detail") {
      const r = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments`);
      if (!r.ok) return antwort({ error: `Graph ${r.status}` }, 502);
      const m = await r.json();
      let anhaenge: unknown[] = [];
      // IMMER abfragen, nicht nur bei hasAttachments: Graph meldet
      // hasAttachments=false, wenn eine Mail AUSSCHLIESSLICH inline-Anhänge
      // hat — genau der Frischeis-Fall (Rechnung mit inline-Disposition),
      // für den der PDF-Durchlass unten gebaut ist.
      {
        const a = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline`);
        if (a.ok) {
          anhaenge = ((await a.json()).value || [])
            // Inline-Bilder (Signatur-Logos etc.) ausblenden — aber PDFs
            // durchlassen: e-Billing-Absender (z.B. Frischeis) hängen die
            // Rechnung teils mit inline-Disposition an, und die muss als
            // Anhang sichtbar bleiben, sonst geht "Als Eingangsrechnung" nicht.
            .filter((x: Record<string, unknown>) =>
              !x.isInline ||
              String(x.contentType || "").toLowerCase().includes("pdf") ||
              /\.pdf$/i.test(String(x.name || "")))
            .map((x: Record<string, unknown>) => ({ id: x.id, name: x.name, typ: x.contentType, groesse: x.size }));
        }
      }
      // Beim Öffnen als gelesen markieren (wie in jedem Mail-Programm).
      graph(`/users/${mb}/messages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ isRead: true }),
      }).catch(() => {});
      return antwort({
        id: m.id,
        betreff: m.subject || "(kein Betreff)",
        von: m.from?.emailAddress?.name || "?",
        vonAdresse: m.from?.emailAddress?.address || "",
        an: (m.toRecipients || []).map((t: Record<string, any>) => t.emailAddress?.address).filter(Boolean),
        empfangen: m.receivedDateTime,
        bodyHtml: m.body?.contentType === "html" ? m.body.content : null,
        bodyText: m.body?.contentType !== "html" ? m.body?.content || "" : null,
        anhaenge,
      });
    }

    if (aktion === "anhang") {
      const r = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(anhangId)}`);
      if (!r.ok) return antwort({ error: `Graph ${r.status}` }, 502);
      const a = await r.json();
      return antwort({ name: a.name, typ: a.contentType, inhaltBase64: a.contentBytes || null });
    }

    if (aktion === "ordner") {
      const r = await graph(`/users/${mb}/mailFolders?$select=id,displayName,unreadItemCount,totalItemCount&$top=20`);
      if (!r.ok) return antwort({ error: `Graph ${r.status}` }, 502);
      const j = await r.json();
      return antwort({
        ordner: (j.value || []).map((f: Record<string, unknown>) => ({
          id: f.id, name: f.displayName, ungelesen: f.unreadItemCount, gesamt: f.totalItemCount,
        })),
      });
    }

    if (aktion === "senden") {
      const { modus, an, cc, betreff, text, anhaenge } = body as {
        modus: string; an?: string[]; cc?: string[]; betreff?: string; text: string;
        anhaenge?: { name: string; inhaltBase64: string; typ?: string }[];
      };
      // Dateianhänge (z. B. die Rechnung als PDF) im Graph-Format.
      const graphAnhaenge = (anhaenge || [])
        .filter((a) => a && a.name && a.inhaltBase64)
        .map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.name,
          contentType: a.typ || "application/pdf",
          contentBytes: a.inhaltBase64,
        }));
      const empf = (liste?: string[]) =>
        (liste || []).map((a) => String(a).trim()).filter((a) => /.+@.+\..+/.test(a))
          .map((a) => ({ emailAddress: { address: a } }));
      // Klartext → einfaches HTML (Zeilenumbrüche erhalten, Rest escapen).
      const html = String(text || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      let r: Response;
      if (modus === "antwort" || modus === "antwortAlle") {
        // Graph hängt Zitat, AW:-Betreff und Empfänger selbst an und legt die
        // Mail in „Gesendete Elemente" ab — Outlook bleibt dadurch synchron.
        r = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}/${modus === "antwort" ? "reply" : "replyAll"}`, {
          method: "POST",
          body: JSON.stringify({ comment: html }),
        });
      } else if (modus === "weiterleiten") {
        const toRecipients = empf(an);
        if (toRecipients.length === 0) return antwort({ error: "Empfänger fehlt" }, 400);
        r = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}/forward`, {
          method: "POST",
          body: JSON.stringify({ comment: html, toRecipients }),
        });
      } else {
        const toRecipients = empf(an);
        if (toRecipients.length === 0) return antwort({ error: "Empfänger fehlt" }, 400);
        r = await graph(`/users/${mb}/sendMail`, {
          method: "POST",
          body: JSON.stringify({
            message: {
              subject: String(betreff || "").trim() || "(kein Betreff)",
              body: { contentType: "HTML", content: html },
              toRecipients,
              ccRecipients: empf(cc),
              ...(graphAnhaenge.length > 0 ? { attachments: graphAnhaenge } : {}),
            },
            saveToSentItems: true,
          }),
        });
      }
      if (!r.ok && r.status !== 202) {
        return antwort({ error: `Senden fehlgeschlagen (Graph ${r.status}): ${(await r.text()).slice(0, 200)}` }, 502);
      }
      return antwort({ ok: true });
    }

    if (aktion === "adressen-lernen") {
      // Manuell (oder per Service-Schlüssel) angestoßener Lernlauf.
      return antwort(await adressLernlauf());
    }

    if (aktion === "vorschlaege") {
      // Nebenbei: Adress-Lernlauf höchstens 1× pro Tag im Hintergrund.
      try {
        const sr = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };
        const r = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.mail_adress_lernlauf_am&select=value`, { headers: sr });
        const rows = r.ok ? await r.json() : [];
        const zuletzt = rows[0]?.value ? Date.parse(rows[0].value) : 0;
        if (Date.now() - zuletzt > 24 * 3600 * 1000) {
          // @ts-ignore — EdgeRuntime existiert in Supabase Edge Functions.
          (globalThis as any).EdgeRuntime?.waitUntil?.(adressLernlauf().catch(() => {}));
        }
      } catch { /* Drossel-Check darf nie die Vorschläge blockieren */ }

      // Beleg-Vorschläge für die ER-Maske: neueste Mails MIT Anhängen aus
      // buchhaltung@ und office@, abzüglich bereits übernommener/ausgeblendeter.
      const quellen = ["buchhaltung@cg-holzbau.at", "office@cg-holzbau.at"];
      const verarbeitetRes = await fetch(
        `${SUPABASE_URL}/rest/v1/mail_belege_verarbeitet?select=mail_id`,
        { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
      );
      const verarbeitet = new Set(
        (verarbeitetRes.ok ? await verarbeitetRes.json() : []).map((x: { mail_id: string }) => x.mail_id),
      );
      const alle: Record<string, unknown>[] = [];
      for (const quelle of quellen) {
        const r = await graph(
          `/users/${encodeURIComponent(quelle)}/mailFolders/inbox/messages?$filter=hasAttachments eq true&$orderby=receivedDateTime desc&$top=20&$select=id,subject,from,receivedDateTime,bodyPreview`,
        );
        if (!r.ok) continue;
        for (const m of ((await r.json()).value || []) as Record<string, unknown>[]) {
          if (verarbeitet.has(String(m.id))) continue;
          alle.push({
            id: m.id,
            postfach: quelle,
            betreff: m.subject || "(kein Betreff)",
            von: (m.from as any)?.emailAddress?.name || (m.from as any)?.emailAddress?.address || "?",
            vonAdresse: (m.from as any)?.emailAddress?.address || "",
            empfangen: m.receivedDateTime,
            vorschau: m.bodyPreview || "",
          });
        }
      }
      alle.sort((a, b) => String(b.empfangen).localeCompare(String(a.empfangen)));
      return antwort({ vorschlaege: alle.slice(0, 15) });
    }

    if (aktion === "verarbeitet") {
      // Vorschlag abhaken (übernommen oder ausgeblendet) — taucht nie wieder auf.
      const { mailAktion, purchaseInvoiceId } = body as { mailAktion?: string; purchaseInvoiceId?: string };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/mail_belege_verarbeitet`, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          mail_id: id, postfach,
          aktion: mailAktion === "ausgeblendet" ? "ausgeblendet" : "uebernommen",
          purchase_invoice_id: purchaseInvoiceId || null,
        }),
      });
      if (!r.ok) return antwort({ error: `Merken fehlgeschlagen (${r.status})` }, 500);
      return antwort({ ok: true });
    }

    if (aktion === "kundenmails") {
      // Mail-Verkehr mit einem Kunden — lernende Zuordnung: gesucht wird über
      // ALLE bekannten Adressen des Kunden (Stammsatz + KI-gelernt) UND über
      // den Namen (KQL "participants" matcht auch Anzeigenamen). So finden
      // sich Mails, obwohl der Kunde von einer fremden Adresse schreibt.
      const { kundenEmail, kundeId, kundenName } = body as { kundenEmail?: string; kundeId?: string; kundenName?: string };
      const adressen = new Set<string>();
      const stammAdr = String(kundenEmail || "").trim().toLowerCase();
      if (/.+@.+\..+/.test(stammAdr)) adressen.add(stammAdr);
      if (kundeId) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/kunden_mail_adressen?select=adresse&customer_id=eq.${kundeId}`,
          { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
        );
        if (r.ok) for (const x of await r.json()) adressen.add(String(x.adresse).toLowerCase());
      }
      // Markante Namens-Teile: letztes Wort (Nachname) und erstes Wort (Firma),
      // ohne Füllwörter — „Fam. Birgit und Herbert Kiennast" → „Kiennast".
      const stop = new Set(["fam", "fam.", "familie", "und", "u.", "herr", "frau", "dr.", "ing.", "gmbh", "kg", "og", "e.u.", "gesmbh", "die", "der"]);
      // Gängige Vornamen sind als Suchbegriff wertlos („Andrea" trifft jede
      // Andrea) — nur markante Namensteile (Nachname, Firmenwort) verwenden.
      const vornamen = new Set(["andrea","andreas","anna","alexander","barbara","bernhard","birgit","brigitte","christian","christine","christoph","claudia","daniel","david","elisabeth","erich","ernst","eva","florian","franz","friedrich","gabriele","georg","gerald","gerhard","gernot","gottfried","gudrun","harald","heinz","helga","herbert","hermann","horst","hubert","ingrid","johann","johannes","josef","juergen","jürgen","karin","karl","katrin","klaus","kurt","leopold","lukas","manfred","manuela","marcel","maria","marion","markus","marlies","martin","martina","matthias","michael","michaela","monika","nicole","norbert","patrick","peter","petra","philipp","rainer","renate","richard","robert","roland","rudolf","sabine","sandra","siegfried","silvia","simon","stefan","stefanie","susanne","thomas","tobias","ulrike","ursula","walter","werner","wolfgang"]);
      const woerter = String(kundenName || "").split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 3 && !stop.has(w.toLowerCase()));
      let namensSuchen = [...new Set([woerter[woerter.length - 1], woerter[0]].filter(Boolean))]
        .filter((w) => !vornamen.has(w.toLowerCase()))
        .slice(0, 2);
      // Besteht der Name NUR aus Vornamen („Helga Stefan"), ist das letzte
      // Wort der Nachname — dann lieber damit suchen als gar nicht.
      if (namensSuchen.length === 0 && woerter.length > 0) namensSuchen = [woerter[woerter.length - 1]];
      if (adressen.size === 0 && namensSuchen.length === 0) return antwort({ error: "Kunden-E-Mail fehlt" }, 400);

      const suchbegriffe = [
        ...[...adressen].slice(0, 4).map((a) => `participants:${a}`),
        ...namensSuchen.map((n) => `participants:"${n.replace(/"/g, "")}"`),
      ];
      const quellen = ["christian.groismaier@cg-holzbau.at", "office@cg-holzbau.at"];
      const alle: Record<string, unknown>[] = [];
      const idsGesehen = new Set<string>();
      for (const quelle of quellen) {
        for (const begriff of suchbegriffe) {
          const q = encodeURIComponent(`"${begriff}"`);
          const r = await graph(
            `/users/${encodeURIComponent(quelle)}/messages?$search=${q}&$select=id,subject,from,receivedDateTime,hasAttachments&$top=15`,
          );
          if (!r.ok) continue;
          for (const m of ((await r.json()).value || []) as Record<string, unknown>[]) {
            const schluessel = `${quelle}|${m.id}`;
            if (idsGesehen.has(schluessel)) continue;
            idsGesehen.add(schluessel);
            const vonAdr = String((m.from as any)?.emailAddress?.address || "").toLowerCase();
            alle.push({
              id: m.id,
              postfach: quelle,
              betreff: m.subject || "(kein Betreff)",
              von: (m.from as any)?.emailAddress?.name || vonAdr || "?",
              vonKunde: !vonAdr.endsWith("@cg-holzbau.at"),
              empfangen: m.receivedDateTime,
              hatAnhaenge: !!m.hasAttachments,
            });
          }
        }
      }
      // Duplikate (gleiche Mail in beiden Postfächern) über Betreff+Zeit eindampfen.
      const gesehen = new Set<string>();
      const einzig = alle.filter((m) => {
        const k = `${m.betreff}|${m.empfangen}`;
        if (gesehen.has(k)) return false;
        gesehen.add(k);
        return true;
      });
      einzig.sort((a, b) => String(b.empfangen).localeCompare(String(a.empfangen)));
      return antwort({ mails: einzig.slice(0, 20) });
    }

    if (aktion === "loeschen") {
      // In den Papierkorb verschieben (kein endgültiges Löschen) — taucht in
      // Outlook ganz normal unter „Gelöschte Elemente" auf.
      const r = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}/move`, {
        method: "POST",
        body: JSON.stringify({ destinationId: "deleteditems" }),
      });
      if (!r.ok) return antwort({ error: `Löschen fehlgeschlagen (Graph ${r.status})` }, 502);
      return antwort({ ok: true });
    }

    return antwort({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    return antwort({ error: (e as Error).message }, 500);
  }
});
