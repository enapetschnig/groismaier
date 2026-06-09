import { supabase } from "@/integrations/supabase/client";

let cachedLogoDataUri: string | null | undefined;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5min

/**
 * Lädt das Firmenlogo als Data-URI und trimmt automatisch leere
 * Ränder (links/rechts/oben/unten) weg. Ohne Trimming wirkt ein Logo-
 * PNG, das visuell bei 20 % der Bildbreite anfängt (wegen Padding im
 * Design), im PDF so, als stünde das Logo weiter links als der Rest
 * des Contents — obwohl die jsPDF-addImage-Koordinate exakt am Text-
 * Margin liegt. Trim-Schritt eliminiert diese optische Diskrepanz.
 *
 * Reihenfolge:
 *   1. Custom-Logo aus Supabase Storage (logos/logo.*)
 *   2. Fallback: Holzbau Groismaier Logo
 *
 * In-Memory-Cache für 5 Minuten um Netzwerk-Last zu reduzieren.
 */
export async function loadInvoiceLogo(forceRefresh = false): Promise<string | undefined> {
  const now = Date.now();
  if (!forceRefresh && cachedLogoDataUri !== undefined && (now - cachedAt) < CACHE_TTL) {
    return cachedLogoDataUri || undefined;
  }

  const asDataUri = async (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  // 1. Versuch: Custom-Logo aus Supabase Storage
  try {
    const extensions = ["png", "jpg", "jpeg", "webp"];
    for (const ext of extensions) {
      const { data } = supabase.storage.from("logos").getPublicUrl(`logo.${ext}`);
      if (!data?.publicUrl) continue;
      try {
        const res = await fetch(data.publicUrl, { cache: "no-cache" });
        if (res.ok) {
          const blob = await res.blob();
          // Minimal size check — Supabase liefert leeres blob wenn Datei nicht existiert (200 OK aber 0 bytes)
          if (blob.size > 100) {
            const raw = await asDataUri(blob);
            const trimmed = await trimLogoPadding(raw);
            cachedLogoDataUri = trimmed;
            cachedAt = now;
            return trimmed;
          }
        }
      } catch { /* try next extension */ }
    }
  } catch { /* fall through to default */ }

  // 2. Fallback: Holzbau Groismaier Logo
  try {
    const res = await fetch("/groismaier-logo.png");
    const blob = await res.blob();
    const raw = await asDataUri(blob);
    const trimmed = await trimLogoPadding(raw);
    cachedLogoDataUri = trimmed;
    cachedAt = now;
    return trimmed;
  } catch {
    cachedLogoDataUri = null;
    cachedAt = now;
    return undefined;
  }
}

/**
 * Schneidet transparente/nahezu-weiße Ränder eines Logos ab. Gibt den
 * neuen Data-URI (als PNG) zurück. Bei Fehlern / keine Randerkennung:
 * liefert das Original unverändert zurück.
 */
async function trimLogoPadding(dataUri: string): Promise<string> {
  try {
    const img = await loadImage(dataUri);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUri;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imgData;
    const w = canvas.width;
    const h = canvas.height;

    // "Leeres" Pixel: transparent ODER nahezu weiß (≥ 245 RGB).
    const isEmpty = (x: number, y: number): boolean => {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 15) return true;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      return r >= 245 && g >= 245 && b >= 245;
    };

    let left = 0, right = w - 1, top = 0, bottom = h - 1;

    // Links: erste Spalte mit mindestens einem "nicht-leeren" Pixel
    outerL: for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) if (!isEmpty(x, y)) { left = x; break outerL; }
    }
    // Rechts
    outerR: for (let x = w - 1; x >= 0; x--) {
      for (let y = 0; y < h; y++) if (!isEmpty(x, y)) { right = x; break outerR; }
    }
    // Oben
    outerT: for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (!isEmpty(x, y)) { top = y; break outerT; }
    }
    // Unten
    outerB: for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) if (!isEmpty(x, y)) { bottom = y; break outerB; }
    }

    const newW = right - left + 1;
    const newH = bottom - top + 1;
    // Sanity: wenn kaum geändert oder invalid → Original zurück
    if (newW <= 0 || newH <= 0 || (newW === w && newH === h)) return dataUri;

    const out = document.createElement("canvas");
    out.width = newW;
    out.height = newH;
    const octx = out.getContext("2d");
    if (!octx) return dataUri;
    octx.drawImage(canvas, left, top, newW, newH, 0, 0, newW, newH);
    return out.toDataURL("image/png");
  } catch {
    return dataUri;
  }
}

function loadImage(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo decode failed"));
    img.src = dataUri;
  });
}

/** Cache invalidieren — z.B. nach Logo-Upload im Admin */
export function clearLogoCache() {
  cachedLogoDataUri = undefined;
  cachedAt = 0;
}
