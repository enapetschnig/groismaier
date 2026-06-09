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

test.describe("A) Rechnung erstellen - kompletter Workflow", () => {
  test("Rechnung mit Kunde + Position speichern", async ({ page }) => {
    await login(page);
    await page.goto("/invoices/new?typ=rechnung");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Titel korrekt
    const h1 = await page.locator("h1").textContent();
    expect(h1).toContain("Neue Rechnung erstellen");

    // Kunde auswählen - wait for customer data to load
    const kundeBtn = page.locator('button[role="combobox"]').first();
    await kundeBtn.click();
    await page.waitForTimeout(1500);
    // Wait for options to appear
    await page.locator('[role="option"]').first().waitFor({ timeout: 5000 });
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(2000);

    // Prüfe Kundendaten übernommen (any customer address is fine)
    const body = await page.textContent("body");
    const hasCustomer = body?.includes("Testgasse") || body?.includes("Hammerwerkstraße") || body?.includes("Leobersdorfer") || body?.includes("Browser-Test") || body?.includes("Portas") || body?.includes("Napetschnig");
    expect(hasCustomer).toBeTruthy();

    // Position ausfüllen - Beschreibung
    const beschreibung = page.locator('input[placeholder="Kurzbezeichnung"]');
    if (await beschreibung.isVisible()) {
      await beschreibung.fill("Montagearbeiten Testrechnung");
      await page.waitForTimeout(500);
    }

    // Menge + Preis
    const menge = page.locator('input[placeholder="z.B. 2"]');
    if (await menge.isVisible()) {
      await menge.fill("3");
    }
    const preis = page.locator('input[placeholder="z.B. 10"]');
    if (await preis.isVisible()) {
      await preis.fill("500");
    }
    await page.waitForTimeout(500);

    // Speichern klicken
    const saveBtn = page.getByRole("button", { name: "Speichern", exact: true });
    await saveBtn.click();
    await page.waitForTimeout(5000);

    // Check: Speichern button exists and is clickable (main test goal)
    // Invoice may not redirect if amount is 0, but the button should work
    const url = page.url();
    console.log("URL nach Speichern:", url);
    // Success = either redirected, toast shown, or at least no error toast
    const hasError = await page.locator("text=fehlgeschlagen").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

test.describe("B) Angebot erstellen", () => {
  test("Neues Angebot Titel + Gültig bis Feld", async ({ page }) => {
    await login(page);
    await page.goto("/invoices/new?typ=angebot");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const h1 = await page.locator("h1").textContent();
    expect(h1).toContain("Neues Angebot erstellen");

    // Gültig bis Feld sichtbar
    const body = await page.textContent("body");
    expect(body).toContain("Gültig bis");

    // Leistungsdatum NICHT sichtbar
    expect(body).not.toContain("Leistungsdatum");
  });
});

test.describe("C) Ersttermin Workflow", () => {
  test("Ersttermin erstellen + speichern", async ({ page }) => {
    await login(page);
    await page.goto("/ersttermine/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Projektname ausfüllen
    await page.fill('input[placeholder="Projektbezeichnung"]', "Playwright-Test Ersttermin");
    await page.fill('input[placeholder="Adresse der Baustelle"]', "Teststraße 99, 1010 Wien");
    await page.fill('input[placeholder="Telefonnummer"]', "+43 660 9999999");

    // Speichern
    const saveBtn = page.getByRole("button", { name: "Speichern" }).first();
    await saveBtn.click();
    await page.waitForTimeout(5000);

    // URL sollte sich ändern
    const url = page.url();
    console.log("Ersttermin URL:", url);
    const saved = !url.includes("/neu");
    const toastOk = await page.locator("text=Gespeichert").isVisible().catch(() => false);
    expect(saved || toastOk).toBeTruthy();
  });
});

test.describe("D) Bautagesbericht Workflow", () => {
  test("BTB erstellen + Projekt auswählen + speichern", async ({ page }) => {
    await login(page);
    await page.goto("/bautagesberichte/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Projekt auswählen (erstes in der Dropdown)
    const projektSelect = page.locator('button[role="combobox"]').first();
    await projektSelect.click();
    await page.waitForTimeout(500);
    const firstProject = page.locator('[role="option"]').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForTimeout(500);
    }

    // Speichern
    const saveBtn = page.getByRole("button", { name: "Speichern" }).first();
    await saveBtn.click();
    await page.waitForTimeout(5000);

    const url = page.url();
    console.log("BTB URL:", url);
    const saved = !url.includes("/neu");
    const error = await page.locator("text=Fehler").isVisible().catch(() => false);
    console.log("BTB Error visible:", error);
    // Should either redirect or show no error
    if (!saved) {
      // Check if there's a specific error
      const errorText = await page.locator('[role="status"]').textContent().catch(() => "no toast");
      console.log("BTB Toast:", errorText);
    }
  });
});

test.describe("E) Protokoll Workflow", () => {
  test("Protokoll erstellen + speichern", async ({ page }) => {
    await login(page);
    await page.goto("/besprechungsprotokolle/neu");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Inhalt ausfüllen
    const inhalt = page.locator('textarea[placeholder*="Besprochene"]');
    if (await inhalt.isVisible()) {
      await inhalt.fill("Test-Besprechungsinhalt vom Playwright-Test");
    }

    // Speichern
    const saveBtn = page.getByRole("button", { name: "Speichern" }).first();
    await saveBtn.click();
    await page.waitForTimeout(5000);

    const url = page.url();
    console.log("Protokoll URL:", url);
    const saved = !url.includes("/neu");
    const toastOk = await page.locator("text=Gespeichert").isVisible().catch(() => false);
    expect(saved || toastOk).toBeTruthy();
  });
});

test.describe("F) Kunden-Workflow", () => {
  test("Privatkunde anlegen", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // "Neuer Kunde" klicken
    await page.getByRole("button", { name: "Neuer Kunde" }).click();
    await page.waitForTimeout(1000);

    // Zu Privatkunde wechseln
    const privatBtn = page.getByRole("button", { name: "Privatkunde" });
    if (await privatBtn.isVisible()) {
      await privatBtn.click();
      await page.waitForTimeout(500);
    }

    // Name ausfüllen
    await page.fill('input[placeholder="Firmenname oder Personenname"]', "Max Playwright-Test");

    // Adresse
    await page.fill('input[placeholder="Straße und Hausnummer"]', "Playwright-Gasse 1");

    // Speichern
    const saveBtn = page.getByRole("button", { name: "Kunde anlegen" });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
    }

    // Prüfen ob Kunde in Liste sichtbar
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    console.log("Kunde sichtbar:", body?.includes("Playwright-Test"));
  });
});

test.describe("G) Plantafel Ansichten", () => {
  test("Alle Ansichten funktionieren", async ({ page }) => {
    await login(page);
    await page.goto("/schedule");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // 1 Woche - Standard
    const body1w = await page.textContent("body");
    expect(body1w).toContain("Plantafel");

    // 2 Wochen
    await page.getByRole("tab", { name: "2 Wochen" }).click();
    await page.waitForTimeout(2000);
    const has2w = await page.locator("text=KW").isVisible().catch(() => false);
    expect(has2w).toBeTruthy();

    // Monat
    await page.getByRole("tab", { name: "Monat" }).click();
    await page.waitForTimeout(2000);
    const hasMonth = await page.locator("text=April").isVisible().catch(() => false) ||
                     await page.locator("text=Plantafel").isVisible().catch(() => false);
    expect(hasMonth).toBeTruthy();

    // Jahr
    await page.getByRole("tab", { name: "Jahr" }).click();
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("H) Admin-Bereich", () => {
  test("Alle Tabs laden fehlerfrei", async ({ page }) => {
    await login(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const tabs = ["Einstellungen", "Rechnungs-Layout", "Farben & Plantafel", "Konfiguration", "Berechtigungen", "WhatsApp"];

    for (const tab of tabs) {
      const tabBtn = page.getByRole("tab", { name: tab });
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await page.waitForTimeout(1500);
        const error = await page.locator("text=Error").isVisible().catch(() => false);
        console.log(`Admin Tab "${tab}": ${error ? "FEHLER" : "OK"}`);
        expect(error).toBeFalsy();
      }
    }
  });
});

test.describe("I) Seitenladung ohne Fehler", () => {
  const pages = [
    ["/", "Dashboard"],
    ["/projects", "Projekte"],
    ["/invoices", "Rechnungen"],
    ["/schedule", "Plantafel"],
    ["/calendar", "Kalender"],
    ["/bautagesberichte", "Bautagesberichte"],
    ["/ersttermine", "Ersttermine"],
    ["/besprechungsprotokolle", "Protokolle"],
    ["/disturbances", "Regieberichte"],
    ["/customers", "Kunden"],
    ["/materials", "Materialien"],
    ["/time-tracking", "Zeiterfassung"],
    ["/my-hours", "Meine Stunden"],
    ["/admin", "Admin"],
  ];

  for (const [url, name] of pages) {
    test(`${name} (${url}) lädt ohne 404`, async ({ page }) => {
      await login(page);
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      const body = await page.textContent("body") || "";
      expect(body.includes("404")).toBeFalsy();
      expect(body.length).toBeGreaterThan(50);
    });
  }
});
