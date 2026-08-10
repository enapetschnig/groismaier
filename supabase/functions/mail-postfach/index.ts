// E-Mail-Postfach in der App (Kundenwunsch): Proxy zur Microsoft-Graph-API.
// Die Graph-Zugangsdaten (Entra-App „Mailverbindung") bleiben serverseitig —
// der Browser bekommt sie nie zu sehen.
//
// Aktionen (POST-Body):
//   { aktion: "liste",   postfach, suche?, ordner?, skip? }   → Mail-Liste (25er-Seiten)
//   { aktion: "detail",  postfach, id }                       → Betreff/Body/Anhänge-Metadaten (+ als gelesen markieren)
//   { aktion: "anhang",  postfach, id, anhangId }             → ein Anhang mit Inhalt (base64)
//   { aktion: "ordner",  postfach }                           → Ordnerliste mit Ungelesen-Zählern
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const antwort = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!(await pruefeAdmin(req))) return antwort({ error: "Nicht berechtigt" }, 401);

    const { aktion, postfach, id, anhangId, suche, ordner, skip } = await req.json();
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
      if (m.hasAttachments) {
        const a = await graph(`/users/${mb}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline`);
        if (a.ok) {
          anhaenge = ((await a.json()).value || [])
            .filter((x: Record<string, unknown>) => !x.isInline)
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

    return antwort({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    return antwort({ error: (e as Error).message }, 500);
  }
});
