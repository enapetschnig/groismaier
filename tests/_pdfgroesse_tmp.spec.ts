import { test, Page } from "@playwright/test";
const EMAIL = "napetschnig.chris@gmail.com";
const PASSWORD = "nereirtsiger";
const INVOICE = "11a57eb6-ec7c-4c68-ab42-4650f994a1c0";
test.use({ viewport: { width: 1400, height: 900 }, channel: "chrome", headless: false });

async function login(page: Page) {
  await page.goto("/"); await page.waitForLoadState("networkidle");
  const pw = page.locator('input[type="password"]').first();
  if (await pw.isVisible().catch(() => false)) {
    await page.locator('input[placeholder*="benutzername" i], input[type="email"]').first().fill(EMAIL);
    await pw.fill(PASSWORD);
    await page.locator("button", { hasText: /^Anmelden$/ }).last().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
    await page.waitForLoadState("networkidle");
  }
}

test("Groesse des Sammel-PDFs der 25 Regieberichte", async ({ page }) => {
  await login(page);
  await page.goto("/disturbances");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
  const ergebnis = await page.evaluate(async (invoiceId) => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const { regieberichteSammelPdf, regieberichtPdfNachId } = await import("/src/lib/regieberichtPdf.ts");
    const { data } = await (supabase.from("disturbances") as any)
      .select("id").eq("verrechnet_in_invoice_id", invoiceId);
    const ids = ((data as any[]) || []).map((d: any) => d.id);
    const t0 = Date.now();
    const einzel = ids.length > 0 ? await regieberichtPdfNachId(ids[0]) : null;
    const sammel = await regieberichteSammelPdf(ids);
    return {
      anzahl: ids.length,
      einzelBytes: einzel ? einzel.blob.size : 0,
      sammelBytes: sammel ? sammel.blob.size : 0,
      sekunden: Math.round((Date.now() - t0) / 1000),
    };
  }, INVOICE);
  console.log(`[Berichte] ${ergebnis.anzahl}`);
  console.log(`[Ein Bericht] ${(ergebnis.einzelBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[Sammel-PDF] ${(ergebnis.sammelBytes / 1024 / 1024).toFixed(2)} MB in ${ergebnis.sekunden}s`);
});
