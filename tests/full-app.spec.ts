import { test, expect, Page } from "@playwright/test";

const EMAIL = "napetschnig.chris@gmail.com";
const PASSWORD = "nereirtsiger";

async function login(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (await page.locator('input[type="email"]').isVisible().catch(() => false)) {
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 15000 });
  }
}

async function expectPageLoads(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  // Page should not be 404 and should have content
  const body = await page.textContent("body") || "";
  expect(body.includes("404")).toBeFalsy();
  expect(body.length).toBeGreaterThan(50);
}

// ========== AUTH ==========
test.describe("Authentication", () => {
  test("login works", async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/auth/);
  });

  test("invalid credentials stay on auth", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");
    if (await page.locator('input[type="email"]').isVisible().catch(() => false)) {
      await page.fill('input[type="email"]', "fake@test.com");
      await page.fill('input[type="password"]', "wrong");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      expect(page.url().includes("auth") || await page.locator("text=Fehler").isVisible().catch(() => false)).toBeTruthy();
    }
  });
});

// ========== NAVIGATION - all pages load without 404 ==========
test.describe("Page Loading", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("Dashboard /", async ({ page }) => { await expectPageLoads(page, "/"); });
  test("Projekte /projects", async ({ page }) => { await expectPageLoads(page, "/projects"); });
  test("Rechnungen /invoices", async ({ page }) => { await expectPageLoads(page, "/invoices"); });
  test("Zeiterfassung /time-tracking", async ({ page }) => { await expectPageLoads(page, "/time-tracking"); });
  test("Plantafel /schedule", async ({ page }) => { await expectPageLoads(page, "/schedule"); });
  test("Kalender /calendar", async ({ page }) => { await expectPageLoads(page, "/calendar"); });
  test("Bautagesberichte /bautagesberichte", async ({ page }) => { await expectPageLoads(page, "/bautagesberichte"); });
  test("Bautagesbericht neu /bautagesberichte/neu", async ({ page }) => { await expectPageLoads(page, "/bautagesberichte/neu"); });
  test("Ersttermine /ersttermine", async ({ page }) => { await expectPageLoads(page, "/ersttermine"); });
  test("Ersttermin neu /ersttermine/neu", async ({ page }) => { await expectPageLoads(page, "/ersttermine/neu"); });
  test("Besprechungsprotokolle /besprechungsprotokolle", async ({ page }) => { await expectPageLoads(page, "/besprechungsprotokolle"); });
  test("Besprechungsprotokoll neu", async ({ page }) => { await expectPageLoads(page, "/besprechungsprotokolle/neu"); });
  test("Kunden /customers", async ({ page }) => { await expectPageLoads(page, "/customers"); });
  test("Materialien /materials", async ({ page }) => { await expectPageLoads(page, "/materials"); });
  test("Admin /admin", async ({ page }) => { await expectPageLoads(page, "/admin"); });
  test("Regieberichte /disturbances", async ({ page }) => { await expectPageLoads(page, "/disturbances"); });
  test("Meine Stunden /my-hours", async ({ page }) => { await expectPageLoads(page, "/my-hours"); });
  test("Neue Rechnung /invoices/new", async ({ page }) => { await expectPageLoads(page, "/invoices/new"); });
  test("Neues Angebot /invoices/new?typ=angebot", async ({ page }) => { await expectPageLoads(page, "/invoices/new?typ=angebot"); });
});

// ========== INVOICES WORKFLOW ==========
test.describe("Rechnungen Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  });

  test("invoice list has content", async ({ page }) => {
    const body = await page.textContent("body") || "";
    expect(body.includes("Rechnungen") || body.includes("Angebote")).toBeTruthy();
  });

  test("new Rechnung button works", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Neue Rechnung/i });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("invoices/new");
    }
  });
});

// ========== SECURITY ==========
test.describe("Security", () => {
  test("unauthenticated redirects to auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    expect(await page.locator('input[type="email"]').isVisible().catch(() => false)).toBeTruthy();
  });

  test("no secret keys in page source", async ({ page }) => {
    await login(page);
    const content = await page.content();
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).not.toContain("OPENAI_API_KEY");
  });
});
