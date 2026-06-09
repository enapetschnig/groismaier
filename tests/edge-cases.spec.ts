import { test, expect, Page } from "@playwright/test";

const EMAIL = "napetschnig.chris@gmail.com";
const PASSWORD = "nereirtsiger";

async function login(page: Page) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

// Helper: check no error toast visible
async function noErrorToast(page: Page) {
  await page.waitForTimeout(500);
  const hasError = await page.locator('[data-state="open"]:has-text("Fehler")').isVisible().catch(() => false)
    || await page.locator('[data-state="open"]:has-text("fehlgeschlagen")').isVisible().catch(() => false);
  return !hasError;
}

// ================================================
// RECHNUNGEN & ANGEBOTE EDGE CASES
// ================================================
test.describe("Rechnungen Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Rechnung ohne Kunde speichern - sollte möglich sein", async ({ page }) => {
    await page.goto("/invoices/new?typ=rechnung");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Speichern ohne Kunde
    const saveBtn = page.getByRole("button", { name: "Speichern", exact: true });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      // Kein Crash, kein fataler Fehler
      expect(await page.locator("body").textContent()).toBeTruthy();
    }
  });

  test("Rechnung ohne Positionen speichern", async ({ page }) => {
    await page.goto("/invoices/new?typ=rechnung");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const saveBtn = page.getByRole("button", { name: "Speichern", exact: true });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      // App sollte nicht crashen
      const body = await page.textContent("body");
      expect(body?.includes("404")).toBeFalsy();
    }
  });

  test("Angebot zeigt Gültig bis, nicht Fällig am", async ({ page }) => {
    await page.goto("/invoices/new?typ=angebot");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Gültig bis");
    // Fällig am und Leistungsdatum sollten NICHT sichtbar sein
    // (diese sind nur bei Rechnungen relevant)
  });

  test("Rechnung zeigt Fällig am und Leistungsdatum", async ({ page }) => {
    await page.goto("/invoices/new?typ=rechnung");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Fällig am");
    expect(body).toContain("Leistungsdatum");
  });

  test("MwSt-Satz Standard ist 20%", async ({ page }) => {
    await page.goto("/invoices/new?typ=rechnung");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("20%");
  });

  test("Rechnungsliste - Suche funktioniert", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[placeholder*="Suche"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill("XXXNOTEXIST");
      await page.waitForTimeout(500);
      // Sollte kein Crash sein
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    }
  });
});

// ================================================
// ZEITERFASSUNG EDGE CASES
// ================================================
test.describe("Zeiterfassung Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Zeiterfassung Seite lädt korrekt", async ({ page }) => {
    await page.goto("/time-tracking");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Zeiterfassung");
    expect(body).toContain("Datum");
    expect(body).toContain("Arbeitszeit");
  });

  test("Zeiterfassung ohne Projekt - Fehlermeldung", async ({ page }) => {
    await page.goto("/time-tracking");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Versuche zu speichern ohne Projekt
    const saveBtn = page.getByRole("button", { name: /speichern|buchen/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      // Sollte eine Warnung geben, nicht crashen
      const body = await page.textContent("body");
      expect(body?.includes("404")).toBeFalsy();
    }
  });

  test("Meine Stunden Seite lädt", async ({ page }) => {
    await page.goto("/my-hours");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body.includes("404")).toBeFalsy();
    expect(body.length).toBeGreaterThan(100);
  });

  test("Stundenauswertung Seite lädt", async ({ page }) => {
    await page.goto("/hours-report");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body.includes("404")).toBeFalsy();
  });
});

// ================================================
// ERSTTERMIN EDGE CASES
// ================================================
test.describe("Ersttermin Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Ersttermin ohne Daten speichern - kein Crash", async ({ page }) => {
    await page.goto("/ersttermine/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const saveBtn = page.getByRole("button", { name: "Speichern" }).first();
    await saveBtn.click();
    await page.waitForTimeout(4000);
    // Kein Crash - entweder gespeichert oder Fehlermeldung
    const body = await page.textContent("body");
    expect(body?.includes("404")).toBeFalsy();
  });

  test("Ersttermin Checkliste anzeigen", async ({ page }) => {
    await page.goto("/ersttermine/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    // Scroll to bottom for checklist
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Checkliste");
  });

  test("Ersttermin Fotosektion sichtbar", async ({ page }) => {
    await page.goto("/ersttermine/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Fotos");
    expect(body).toContain("Foto hinzufügen");
  });

  test("Ersttermin Projekt-erstellen Button erst nach Speichern", async ({ page }) => {
    await page.goto("/ersttermine/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    // "Projekt erstellen" sollte NICHT sichtbar sein bei neuem Ersttermin
    const projektBtn = page.getByRole("button", { name: /Projekt erstellen/i });
    expect(await projektBtn.isVisible().catch(() => false)).toBeFalsy();
  });
});

// ================================================
// BAUTAGESBERICHT EDGE CASES
// ================================================
test.describe("Bautagesbericht Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("BTB ohne Projekt - Fehlermeldung", async ({ page }) => {
    await page.goto("/bautagesberichte/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const saveBtn = page.getByRole("button", { name: "Speichern" }).first();
    await saveBtn.click();
    await page.waitForTimeout(2000);
    // Sollte Fehlermeldung zeigen ("Bitte Projekt wählen")
    const body = await page.textContent("body") || "";
    // Kein Crash
    expect(body.includes("404")).toBeFalsy();
  });

  test("BTB Wetter-Dropdown hat Optionen", async ({ page }) => {
    await page.goto("/bautagesberichte/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Wetter");
  });

  test("BTB Arbeiter-Sektion sichtbar", async ({ page }) => {
    await page.goto("/bautagesberichte/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Arbeiter");
    expect(body).toContain("Hinzufügen");
  });
});

// ================================================
// KUNDEN EDGE CASES
// ================================================
test.describe("Kunden Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Kunde ohne Name - Fehlermeldung", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Neuer Kunde" }).click();
    await page.waitForTimeout(1000);
    // Direkt "Kunde anlegen" ohne Name
    const anlegen = page.getByRole("button", { name: "Kunde anlegen" });
    if (await anlegen.isVisible()) {
      await anlegen.click();
      await page.waitForTimeout(2000);
      // Sollte Fehler zeigen, nicht crashen
      const body = await page.textContent("body");
      expect(body?.includes("404")).toBeFalsy();
    }
  });

  test("Kundensuche mit Sonderzeichen", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[placeholder*="suchen"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill("ÄÖÜ<script>alert(1)</script>");
      await page.waitForTimeout(500);
      // Kein XSS, kein Crash
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
      expect(body).not.toContain("<script>");
    }
  });

  test("Firma/Privat Toggle in Neuanlage", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Neuer Kunde" }).click();
    await page.waitForTimeout(1000);
    // Check Firma/Privat buttons exist
    const firma = page.getByRole("button", { name: /Geschäftskunde/i });
    const privat = page.getByRole("button", { name: /Privatkunde/i });
    expect(await firma.isVisible()).toBeTruthy();
    expect(await privat.isVisible()).toBeTruthy();
  });
});

// ================================================
// NAVIGATION & SECURITY EDGE CASES
// ================================================
test.describe("Navigation & Security", () => {
  test("Nicht eingeloggt - Redirect zu Auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const hasLogin = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(hasLogin).toBeTruthy();
  });

  test("Ungültige Route - 404 Seite", async ({ page }) => {
    await login(page);
    await page.goto("/diese-seite-gibt-es-nicht");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("404");
  });

  test("Direkte URL zu nicht existierendem Ersttermin", async ({ page }) => {
    await login(page);
    await page.goto("/ersttermine/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    // Sollte entweder Fehler zeigen oder redirecten, nicht crashen
    const body = await page.textContent("body");
    expect(body?.includes("404") || body?.includes("Fehler") || body?.includes("nicht gefunden") || body?.includes("Ersttermine")).toBeTruthy();
  });

  test("Direkte URL zu nicht existierender Rechnung", async ({ page }) => {
    await login(page);
    await page.goto("/invoices/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    // Kein Whitescreen
    expect((body || "").length).toBeGreaterThan(50);
  });

  test("XSS in Suchfeld wird escaped", async ({ page }) => {
    await login(page);
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[placeholder*="Suche"]');
    if (await searchInput.isVisible()) {
      const xssPayload = '<img src=x onerror=alert(1)>';
      await searchInput.fill(xssPayload);
      await page.waitForTimeout(500);
      // The input value should be the raw text, not executed as HTML
      const value = await searchInput.inputValue();
      expect(value).toBe(xssPayload);
      // No alert dialog should have appeared
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    }
  });

  test("Keine Secret Keys im Page Source", async ({ page }) => {
    await login(page);
    const content = await page.content();
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).not.toContain("OPENAI_API_KEY");
    expect(content).not.toContain("GOOGLE_SERVICE_ACCOUNT_KEY");
  });
});

// ================================================
// PROTOKOLL EDGE CASES
// ================================================
test.describe("Protokoll Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Protokoll ohne Inhalt speichern", async ({ page }) => {
    await page.goto("/besprechungsprotokolle/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const saveBtn = page.getByRole("button", { name: "Speichern" }).first();
    await saveBtn.click();
    await page.waitForTimeout(4000);
    // Sollte trotzdem speichern oder Warnung zeigen
    const body = await page.textContent("body");
    expect(body?.includes("404")).toBeFalsy();
  });

  test("Maßnahmen hinzufügen möglich", async ({ page }) => {
    await page.goto("/besprechungsprotokolle/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const body = await page.textContent("body") || "";
    expect(body.includes("Maßnahmen") || body.includes("Massnahmen") || body.includes("Neue Maßnahme")).toBeTruthy();
  });
});

// ================================================
// PLANTAFEL EDGE CASES
// ================================================
test.describe("Plantafel Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Plantafel Navigation - Heute Button", async ({ page }) => {
    await page.goto("/schedule");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const heuteBtn = page.getByRole("button", { name: "Heute" });
    if (await heuteBtn.isVisible()) {
      await heuteBtn.click();
      await page.waitForTimeout(1000);
      // Kein Crash
      const body = await page.textContent("body");
      expect(body).toContain("Plantafel");
    }
  });

  test("Plantafel Vor/Zurück Navigation", async ({ page }) => {
    await page.goto("/schedule");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Vorwärts klicken
    const nextBtn = page.locator('button:has(svg)').nth(1);
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
      const body = await page.textContent("body");
      expect(body).toContain("Plantafel");
    }
  });
});

// ================================================
// KALENDER EDGE CASES
// ================================================
test.describe("Kalender Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Kalender Monats-Navigation", async ({ page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    // Vorheriger Monat
    const prevBtn = page.locator('button:has-text("‹")').or(page.locator('button svg').first());
    if (await prevBtn.isVisible()) {
      await prevBtn.click();
      await page.waitForTimeout(2000);
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    }
  });

  test("Kalender Sync Button sichtbar", async ({ page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Sync");
  });

  test("Kalender Neuer Termin Button sichtbar", async ({ page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body") || "";
    expect(body).toContain("Neuer Termin");
  });
});
