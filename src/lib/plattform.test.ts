/**
 * Plattform-Erkennung — mit echten User-Agent-Strings der jeweiligen Geräte.
 * Der Dialog verlässt sich darauf, dass hier das richtige Gerät herauskommt;
 * eine falsche Erkennung zeigt dem Zimmerer am iPhone eine Windows-Anleitung.
 */
import { describe, it, expect } from "vitest";
import { erkennePlattform, kannDirektInstallieren, anleitungFuer } from "./plattform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  // iPadOS gibt sich als Macintosh aus — Unterscheidung nur über Touch.
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.67",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
};

describe("Geräte-Erkennung", () => {
  it("iPhone mit Safari", () => {
    expect(erkennePlattform({ userAgent: UA.iphoneSafari })).toEqual({ geraet: "ios", browser: "safari" });
  });

  it("iPhone mit Chrome (CriOS)", () => {
    expect(erkennePlattform({ userAgent: UA.iphoneChrome })).toEqual({ geraet: "ios", browser: "chrome" });
  });

  it("iPad, das sich als Mac ausgibt, wird über die Touch-Punkte erkannt", () => {
    // Der Kernfall: iPadOS 13+ meldet „Macintosh". Ohne Touch-Prüfung
    // bekäme der iPad-Nutzer die Mac-Anleitung mit „Zum Dock hinzufügen".
    expect(erkennePlattform({ userAgent: UA.ipadOs, maxTouchPoints: 5 }).geraet).toBe("ios");
    expect(erkennePlattform({ userAgent: UA.ipadOs, maxTouchPoints: 0 }).geraet).toBe("macos");
  });

  it("Android: Chrome, Samsung Internet und Firefox auseinanderhalten", () => {
    expect(erkennePlattform({ userAgent: UA.androidChrome })).toEqual({ geraet: "android", browser: "chrome" });
    // Samsung trägt auch „Chrome" im UA — SamsungBrowser muss gewinnen.
    expect(erkennePlattform({ userAgent: UA.androidSamsung })).toEqual({ geraet: "android", browser: "samsung" });
    expect(erkennePlattform({ userAgent: UA.androidFirefox })).toEqual({ geraet: "android", browser: "firefox" });
  });

  it("Windows: Edge gewinnt über das mitgeführte Chrome-Token", () => {
    expect(erkennePlattform({ userAgent: UA.windowsEdge })).toEqual({ geraet: "windows", browser: "edge" });
    expect(erkennePlattform({ userAgent: UA.windowsChrome })).toEqual({ geraet: "windows", browser: "chrome" });
    expect(erkennePlattform({ userAgent: UA.windowsFirefox })).toEqual({ geraet: "windows", browser: "firefox" });
  });

  it("Mac: Safari und Chrome", () => {
    expect(erkennePlattform({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toEqual({ geraet: "macos", browser: "safari" });
    expect(erkennePlattform({ userAgent: UA.macChrome, maxTouchPoints: 0 })).toEqual({ geraet: "macos", browser: "chrome" });
  });
});

describe("Direkt-Installation", () => {
  it("nur Chromium-Browser außerhalb von iOS", () => {
    expect(kannDirektInstallieren({ geraet: "android", browser: "chrome" })).toBe(true);
    expect(kannDirektInstallieren({ geraet: "windows", browser: "edge" })).toBe(true);
    expect(kannDirektInstallieren({ geraet: "android", browser: "samsung" })).toBe(true);
    // iOS hat kein beforeinstallprompt — auch nicht in Chrome.
    expect(kannDirektInstallieren({ geraet: "ios", browser: "chrome" })).toBe(false);
    expect(kannDirektInstallieren({ geraet: "macos", browser: "safari" })).toBe(false);
    expect(kannDirektInstallieren({ geraet: "windows", browser: "firefox" })).toBe(false);
  });
});

describe("Anleitungen", () => {
  it("jede Gerät/Browser-Kombination liefert eine Anleitung mit Schritten", () => {
    const geraete = ["ios", "android", "windows", "macos", "linux"] as const;
    const browser = ["chrome", "edge", "safari", "firefox", "samsung", "sonstiger"] as const;
    for (const g of geraete) {
      for (const b of browser) {
        const a = anleitungFuer(g, b);
        expect(a.titel.length).toBeGreaterThan(0);
        expect(a.schritte.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("iOS bekommt den Home-Bildschirm-Weg, nicht die Adressleiste", () => {
    const a = anleitungFuer("ios", "safari");
    expect(a.schritte.join(" ")).toContain("Home-Bildschirm");
  });

  it("iOS in Chrome bekommt den Safari-Hinweis", () => {
    expect(anleitungFuer("ios", "chrome").hinweis).toContain("Safari");
    expect(anleitungFuer("ios", "safari").hinweis).toBeUndefined();
  });

  it("Firefox am Computer wird zu Chrome/Edge geschickt", () => {
    expect(anleitungFuer("windows", "firefox").schritte.join(" ")).toContain("Chrome oder Edge");
  });

  it("Mac-Safari bekommt „Zum Dock hinzufügen“", () => {
    expect(anleitungFuer("macos", "safari").schritte.join(" ")).toContain("Dock");
  });
});
