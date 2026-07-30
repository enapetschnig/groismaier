/**
 * Plattform-Erkennung für den „App installieren"-Dialog.
 *
 * Der Dialog soll dem Anwender sofort die richtige Anleitung zeigen, statt
 * ihn zuerst „iOS oder Android?" raten zu lassen. Die Erkennung ist bewusst
 * eine reine Funktion über (userAgent, maxTouchPoints, standalone) — so ist
 * sie testbar, ohne einen Browser zu simulieren.
 *
 * Stolperfalle iPad: Seit iPadOS 13 meldet sich Safari am iPad als
 * „Macintosh". Unterscheiden lässt sich das nur über die Touch-Punkte —
 * ein echter Mac hat maxTouchPoints 0.
 */

export type Geraet = "ios" | "android" | "windows" | "macos" | "linux";
export type Browser = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "sonstiger";

export interface PlattformInfo {
  geraet: Geraet;
  browser: Browser;
}

export interface PlattformUmgebung {
  userAgent: string;
  /** navigator.maxTouchPoints — unterscheidet iPad von Mac. */
  maxTouchPoints?: number;
}

export function erkennePlattform(umgebung: PlattformUmgebung): PlattformInfo {
  const ua = umgebung.userAgent || "";
  const touch = umgebung.maxTouchPoints ?? 0;

  // ── Gerät ──
  let geraet: Geraet;
  if (/iPad|iPhone|iPod/.test(ua)) {
    geraet = "ios";
  } else if (/Macintosh/.test(ua) && touch > 1) {
    // iPadOS gibt sich als Mac aus; Macs haben keinen Touchscreen.
    geraet = "ios";
  } else if (/Android/i.test(ua)) {
    geraet = "android";
  } else if (/Windows/.test(ua)) {
    geraet = "windows";
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    geraet = "macos";
  } else {
    geraet = "linux";
  }

  // ── Browser ──
  // Reihenfolge ist wichtig: Edge und Samsung tragen auch „Chrome" im UA,
  // Chrome trägt auch „Safari". Auf iOS heißen sie CriOS/FxiOS/EdgiOS.
  let browser: Browser;
  if (/SamsungBrowser/i.test(ua)) {
    browser = "samsung";
  } else if (/Edg(e|iOS|A)?\//.test(ua)) {
    browser = "edge";
  } else if (/OPR\/|Opera/.test(ua)) {
    // Opera VOR Safari prüfen: jeder Chromium-UA trägt auch „Safari/" —
    // sonst bekäme Opera die Safari-Anleitung („Zum Dock hinzufügen").
    browser = "sonstiger";
  } else if (/CriOS\//.test(ua) || /Chrome\//.test(ua)) {
    browser = "chrome";
  } else if (/FxiOS\//.test(ua) || /Firefox\//.test(ua)) {
    browser = "firefox";
  } else if (/Safari\//.test(ua)) {
    browser = "safari";
  } else {
    browser = "sonstiger";
  }

  return { geraet, browser };
}

/** Lesbarer Name des erkannten Geräts („iPhone / iPad", „Windows-PC" …). */
export const geraetName = (g: Geraet): string =>
  ({ ios: "iPhone / iPad", android: "Android", windows: "Windows-PC", macos: "Mac", linux: "Linux-PC" }[g]);

export const browserName = (b: Browser): string =>
  ({ chrome: "Chrome", edge: "Edge", safari: "Safari", firefox: "Firefox", samsung: "Samsung Internet", sonstiger: "Browser" }[b]);

/**
 * Kann dieser Browser die App per Klick installieren (beforeinstallprompt)?
 * Nur Chromium-Browser feuern das Ereignis — und auch die nicht immer
 * (z. B. wenn die App schon installiert ist). Die Angabe hier steuert nur,
 * ob der Dialog auf den Direkt-Knopf wartet oder gleich die Anleitung zeigt.
 */
export const kannDirektInstallieren = (info: PlattformInfo): boolean => {
  if (info.geraet === "ios") return false; // iOS kennt nur „Zum Home-Bildschirm"
  return info.browser === "chrome" || info.browser === "edge" || info.browser === "samsung";
};

/** Ein Anleitungsschritt für die Schritt-für-Schritt-Liste im Dialog. */
export interface Anleitung {
  titel: string;
  schritte: string[];
  /** Hinweis unter den Schritten, z. B. „geht nur in Safari". */
  hinweis?: string;
}

/**
 * Die passende Anleitung je Gerät + Browser.
 *
 * Die Texte nennen die deutschen Menübezeichnungen der jeweiligen Browser —
 * der Zimmerer am Bau sucht wortwörtlich nach dem Menüpunkt.
 */
export function anleitungFuer(geraet: Geraet, browser: Browser): Anleitung {
  if (geraet === "ios") {
    return {
      titel: "iPhone / iPad",
      schritte: [
        "Öffne diese Seite in Safari.",
        "Tippe auf das Teilen-Symbol (Quadrat mit Pfeil nach oben) — am iPhone unten in der Mitte, am iPad oben rechts.",
        "Scrolle nach unten und tippe auf „Zum Home-Bildschirm“.",
        "Tippe rechts oben auf „Hinzufügen“.",
      ],
      hinweis:
        browser === "safari" || browser === "sonstiger"
          ? undefined
          : "Du bist gerade nicht in Safari — das Teilen-Menü gibt es dort auch, am zuverlässigsten klappt es aber in Safari.",
    };
  }

  if (geraet === "android") {
    if (browser === "samsung") {
      return {
        titel: "Android (Samsung Internet)",
        schritte: [
          "Tippe unten rechts auf das Menü (drei Striche).",
          "Wähle „Seite hinzufügen zu“ und dann „Startbildschirm“.",
          "Bestätige mit „Hinzufügen“.",
        ],
      };
    }
    if (browser === "firefox") {
      return {
        titel: "Android (Firefox)",
        schritte: [
          "Tippe oben rechts auf das Menü (drei Punkte).",
          "Wähle „Zum Startbildschirm hinzufügen“.",
          "Bestätige mit „Hinzufügen“.",
        ],
      };
    }
    if (browser === "sonstiger") {
      return {
        titel: "Android",
        schritte: [
          "Öffne das Menü deines Browsers.",
          "Wähle „Zum Startbildschirm hinzufügen“ (je nach Browser auch „App installieren“).",
          "Bestätige mit „Hinzufügen“.",
        ],
        hinweis: "Am zuverlässigsten klappt es in Chrome.",
      };
    }
    return {
      titel: "Android (Chrome / Edge)",
      schritte: [
        "Tippe oben rechts auf das Menü (drei Punkte).",
        "Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
        "Bestätige mit „Installieren“.",
      ],
    };
  }

  if (geraet === "macos" && browser === "safari") {
    return {
      titel: "Mac (Safari)",
      schritte: [
        "Klicke in der Symbolleiste auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).",
        "Wähle „Zum Dock hinzufügen“.",
        "Bestätige mit „Hinzufügen“ — die App liegt danach im Dock.",
      ],
      hinweis: "Ab macOS Sonoma (Safari 17). Bei älteren Versionen: Chrome verwenden.",
    };
  }

  if (browser === "firefox" || browser === "sonstiger") {
    // Firefox und Opera können Web-Apps am Computer nicht installieren.
    return {
      titel: `${geraetName(geraet)} (${browserName(browser)})`,
      schritte: [
        "Dieser Browser kann Web-Apps am Computer leider nicht installieren.",
        "Öffne https://groismaier.handwerkapp.at in Chrome oder Edge.",
        "Dort erscheint rechts in der Adressleiste ein Installieren-Symbol.",
      ],
    };
  }

  // Windows / macOS / Linux mit Chrome oder Edge. Die Menüpfade der beiden
  // unterscheiden sich — das Adressleisten-Symbol ist der gemeinsame Weg.
  return {
    titel: `${geraetName(geraet)} (Chrome / Edge)`,
    schritte: [
      "Schau rechts in die Adressleiste: Dort sitzt ein Installieren-Symbol (Bildschirm mit Pfeil nach unten).",
      "Klicke darauf und bestätige mit „Installieren“.",
      "Falls das Symbol fehlt — im Menü (drei Punkte): Chrome unter „Cast, Speichern und Teilen“ → „Seite installieren als…“, Edge unter „Apps“ → „Diese Website als App installieren“.",
    ],
  };
}
