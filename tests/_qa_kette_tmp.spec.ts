import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:8080";
const EMAIL = "napetschnig.chris@gmail.com";
const PASSWORD = "nereirtsiger";
const SHOT = "/private/tmp/claude-501/-Users-christophnapetschnig-groismaier/b9108ca9-94a1-4fe8-baea-38cbca4ef7f2/scratchpad";
const PDF = SHOT + "/qatest-rechnung.pdf";
const PROJEKT = "QATEST Zubau Huber";

test.use({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
test.setTimeout(120000);

function collectErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("[console] " + m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => errs.push("[pageerror] " + String(e).slice(0, 300)));
  return errs;
}

async function login(page: Page) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.fill('#email', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("auth"), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  // PWA-Dialog schließen falls vorhanden
  const fertig = page.getByRole("button", { name: "Fertig" });
  if (await fertig.isVisible().catch(() => false)) await fertig.click();
  const verstanden = page.getByRole("button", { name: "Verstanden" });
  if (await verstanden.isVisible().catch(() => false)) await verstanden.click();
}

function dump(errs: string[], label: string) {
  console.log(`=== CONSOLE ERRORS ${label}: ${errs.length} ===`);
  for (const e of errs.slice(0, 15)) console.log(e);
}

test("S1 Projekt anlegen + Projektuebersicht", async ({ page }) => {
  const errs = collectErrors(page);
  await login(page);
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Neues Projekt/ }).first().click();
  await page.waitForTimeout(800);
  await page.fill('input[placeholder="z.B. Badezimmer Sanierung Müller"]', PROJEKT);
  // Beschreibung
  await page.fill('textarea[placeholder="Kurze Projektbeschreibung..."]', "QATEST Zubau, QA-Testlauf Kette");
  // Kunde anlegen (minimal-Form im Dialog): Privatkunde Vorname/Nachname
  await page.getByRole("button", { name: "Privat" }).click();
  await page.waitForTimeout(400);
  await page.fill('input[placeholder="Vorname"]', "Josef");
  await page.fill('input[placeholder="Nachname"]', "QATEST-Huber");
  // Projektadresse
  await page.fill('input[placeholder="Straße + Hausnr. des Projekts"]', "QATEST-Weg 1");
  await page.fill('input[placeholder="8831"]', "8850");
  await page.fill('input[placeholder="z.B. Wien, Graz..."]', "Murau");
  await page.screenshot({ path: SHOT + "/qa-kette-02-projekt-dialog.png", fullPage: true });
  await page.getByRole("button", { name: "Projekt erstellen" }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOT + "/qa-kette-03-nach-anlegen.png", fullPage: true });
  // Projekt in Liste suchen und öffnen
  await page.fill('input[placeholder="Projekte durchsuchen..."]', "QATEST");
  await page.waitForTimeout(800);
  const card = page.getByText(PROJEKT).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT + "/qa-kette-04-projektuebersicht.png", fullPage: true });
  console.log("URL Projektübersicht:", page.url());
  dump(errs, "S1");
});

async function openProjekt(page: Page) {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.fill('input[placeholder="Projekte durchsuchen..."]', "QATEST");
  await page.waitForTimeout(800);
  await page.locator("div.cursor-pointer", { hasText: PROJEKT }).first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

test("S1b Projektuebersicht Sichtpruefung", async ({ page }) => {
  const errs = collectErrors(page);
  await login(page);
  await openProjekt(page);
  console.log("Projektübersicht URL:", page.url());
  await page.screenshot({ path: SHOT + "/qa-kette-04-projektuebersicht.png", fullPage: true });
  const body = (await page.textContent("body")) || "";
  for (const abschnitt of ["Nachkalkulation", "Stundenabgleich", "Materialliste", "Eingangsrechnungen", "Rechnungen", "Fotos", "Pläne", "Berichte", "Deckungsbeitrag"]) {
    console.log(`Abschnitt "${abschnitt}" sichtbar:`, body.includes(abschnitt));
  }
  dump(errs, "S1b");
});

test("S2 Zeiterfassung 8h auf QATEST-Projekt", async ({ page }) => {
  const errs = collectErrors(page);
  await login(page);
  await page.goto("/time-tracking");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  // Arbeitsort Baustelle ist Default? — explizit anklicken
  await page.getByText("🏗️ Baustelle").first().click();
  await page.waitForTimeout(300);
  // Projekt auswählen
  const projektTrigger = page.locator('button[role="combobox"]').first();
  await projektTrigger.click();
  await page.waitForTimeout(500);
  await page.getByRole("option", { name: new RegExp(PROJEKT) }).first().click();
  await page.waitForTimeout(300);
  // Tätigkeit
  const taetigkeit = page.locator('input[placeholder="z.B. Montage, Aufmaß..."]');
  if (await taetigkeit.isVisible().catch(() => false)) await taetigkeit.fill("QATEST Montage");
  // Beginn 07:00 / Ende 15:30, Pause 30 Min => 8,0 h
  const comboboxes = page.locator('button[role="combobox"]');
  const n = await comboboxes.count();
  console.log("Anzahl comboboxes:", n);
  // Beginn: combobox mit Text "Uhrzeit" (erste)
  const beginn = page.locator('button[role="combobox"]', { hasText: "Uhrzeit" }).first();
  await beginn.click();
  await page.getByRole("option", { name: "07:00", exact: true }).click();
  await page.waitForTimeout(300);
  const ende = page.locator('button[role="combobox"]', { hasText: "Uhrzeit" }).first();
  await ende.click();
  await page.getByRole("option", { name: "15:30", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "30 Min", exact: true }).click();
  await page.waitForTimeout(500);
  const gesamt = await page.getByText("Gesamt zu buchen").locator("..").textContent();
  console.log("Gesamt zu buchen:", gesamt);
  await page.screenshot({ path: SHOT + "/qa-kette-05-zeiterfassung.png", fullPage: true });
  await page.getByRole("button", { name: "Stunden erfassen", exact: true }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOT + "/qa-kette-06-zeit-gebucht.png", fullPage: true });
  // Im Projekt prüfen: Stundenabgleich "gebucht"
  await openProjekt(page);
  const body = (await page.textContent("body")) || "";
  console.log("Enthält '8.0 Std' o.ä.:", /8[.,]0\s*Std/.test(body));
  await page.screenshot({ path: SHOT + "/qa-kette-07-projekt-nach-zeit.png", fullPage: true });
  dump(errs, "S2");
});

test("S0 Recon: Login, Dashboard, Projektliste QATEST", async ({ page }) => {
  const errs = collectErrors(page);
  await login(page);
  await page.screenshot({ path: SHOT + "/qa-kette-00-dashboard.png", fullPage: true });
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Projekte durchsuchen..."]', "QATEST");
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOT + "/qa-kette-01-projekte-suche.png", fullPage: true });
  const body = (await page.textContent("body")) || "";
  console.log("QATEST Zubau Huber bereits vorhanden:", body.includes(PROJEKT));
  dump(errs, "S0");
});
