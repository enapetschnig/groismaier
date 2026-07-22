import { test } from "@playwright/test";
const BASE = "http://localhost:8080";
const SHOT = "/private/tmp/claude-501/-Users-christophnapetschnig-groismaier/b9108ca9-94a1-4fe8-baea-38cbca4ef7f2/scratchpad";
test("Kalkulation -> Angebot mit Gruppen und Details", async ({ page }) => {
  test.setTimeout(300000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 90)));
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.getByLabel(/Benutzername oder E-Mail/i).fill("napetschnig.chris@gmail.com");
  await page.locator('input[name="password"]').first().fill("nereirtsiger");
  await page.getByRole("button", { name: /anmelden|login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/auth"), { timeout: 20000 });
  try { await page.getByRole("button", { name: /^Fertig$/ }).click({ timeout: 3500 }); } catch {}

  // Kalkulation anlegen
  await page.goto(`${BASE}/auftragskalkulation`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /neue kalkulation/i }).first().click();
  await page.waitForTimeout(1000);
  await page.locator("input:visible").first().fill("KETTE Test");
  await page.getByRole("button", { name: /anlegen|erstellen/i }).first().click();
  await page.waitForURL(/auftragskalkulation\/.+/, { timeout: 15000 });
  await page.waitForTimeout(2500);

  // Fläche + Arbeitszeit + Fahrten
  await page.getByLabel(/Fläche in qm/i).first().fill("100");
  await page.getByLabel(/Anzahl Arbeiter/i).first().fill("2");
  await page.getByLabel(/Dauer in Tagen/i).first().fill("2");
  await page.getByLabel(/Entfernung zur Baustelle/i).first().fill("40");
  await page.getByLabel(/Busfahrten/i).first().fill("1");
  await page.waitForTimeout(2000);
  const k = await page.locator("body").innerText();
  console.log("RESULT kalk: nachkalk_weg=" + !/Nachkalkulation \(Ist-Kosten\)|Tatsächliche Dauer/.test(k) + " istvk_weg=" + !/Ist VK/.test(k));
  await page.screenshot({ path: `${SHOT}/kette-1-kalk.png`, fullPage: true });

  // Als Angebot übernehmen
  await page.getByRole("button", { name: /als angebot übernehmen/i }).first().click();
  await page.waitForTimeout(1500);
  try { await page.getByRole("button", { name: /^(übernehmen|weiter|ok|ja)$/i }).first().click({ timeout: 2500 }); } catch {}
  await page.waitForURL(/invoices\/new/, { timeout: 15000 });
  await page.waitForTimeout(3500);
  const a = await page.locator("body").innerText();
  console.log("RESULT angebot: gruppe=" + /Aufbau 1/.test(a) + " summe2404=" + /2\s?404,00|2\.404,00/.test(a) + " details=" + /Arbeitszeit|Fahrten|Bus/i.test(a));
  await page.screenshot({ path: `${SHOT}/kette-2-angebot.png`, fullPage: true });
  console.log("RESULT pageerrors=" + errs.length + (errs.length ? " :: " + errs.slice(0,2).join(" | ") : ""));
});
