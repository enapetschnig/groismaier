// ============================================================================
// Passwortmanager — Verschlüsselung (WebCrypto, läuft komplett im Browser)
// ----------------------------------------------------------------------------
// Der Zahlen-Code wird per PBKDF2-SHA256 (600.000 Iterationen) zu einem
// AES-256-GCM-Schlüssel gedehnt. In der Datenbank liegt ausschließlich
// Ciphertext (base64 von IV || Geheimtext) plus der Salt; der Code selbst
// verlässt das Gerät nie. Ob der eingegebene Code stimmt, prüft der Client,
// indem er den gespeicherten Prüfwert zu entschlüsseln versucht.
// ============================================================================

export const KDF_ITERATIONEN = 600_000;
/** Bekannter Klartext, dessen erfolgreiche Entschlüsselung den Code bestätigt. */
export const PRUEFWERT_KLARTEXT = "GROISMAIER-TRESOR-OK";

const enc = new TextEncoder();
const dec = new TextDecoder();

const toBase64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function neuerSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Dehnt den Zahlen-Code zum AES-Schlüssel (dauert absichtlich ~1 s). */
export async function schluesselAbleiten(
  pin: string,
  saltB64: string,
  iterationen: number = KDF_ITERATIONEN,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(saltB64), iterations: iterationen, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Verschlüsselt Text → base64(IV || Ciphertext). */
export async function verschluesseln(key: CryptoKey, klartext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(klartext));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return toBase64(out);
}

/** Entschlüsselt base64(IV || Ciphertext) → Text. Wirft bei falschem Schlüssel. */
export async function entschluesseln(key: CryptoKey, datenB64: string): Promise<string> {
  const daten = fromBase64(datenB64);
  const iv = daten.slice(0, 12);
  const ct = daten.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}

/** Zufälliges starkes Passwort für den „Vorschlag"-Knopf im Eintrag-Dialog. */
export function passwortVorschlag(laenge = 16): string {
  const zeichen = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%+?";
  const zufall = crypto.getRandomValues(new Uint32Array(laenge));
  let out = "";
  for (let i = 0; i < laenge; i++) out += zeichen[zufall[i] % zeichen.length];
  return out;
}
