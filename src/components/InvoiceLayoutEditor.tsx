import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { FileText, Save, Wand2, Upload, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceLayout } from "@/hooks/useInvoiceLayout";
import { buildSenderLine, buildFooterLines } from "@/lib/invoiceLayoutTypes";
import type { InvoiceLayoutSettings } from "@/lib/invoiceLayoutTypes";
import { supabase } from "@/integrations/supabase/client";

export function InvoiceLayoutEditor() {
  const { toast } = useToast();
  const { layout, loading, save } = useInvoiceLayout();
  const [form, setForm] = useState<InvoiceLayoutSettings>(layout);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Sync form when layout loads from DB
  useEffect(() => {
    setForm(layout);
  }, [layout]);

  // Load existing logo URL
  useEffect(() => {
    const { data } = supabase.storage.from("logos").getPublicUrl("logo.png");
    if (data?.publicUrl) {
      setLogoUrl(data.publicUrl);
    }
  }, []);

  const updateCompany = (field: keyof InvoiceLayoutSettings["company"], value: string) => {
    setForm((prev) => ({ ...prev, company: { ...prev.company, [field]: value } }));
  };

  const updateLogo = <K extends keyof InvoiceLayoutSettings["logo"]>(
    field: K,
    value: InvoiceLayoutSettings["logo"][K]
  ) => {
    setForm((prev) => ({ ...prev, logo: { ...prev.logo, [field]: value } }));
  };

  const updateFooter = <K extends keyof InvoiceLayoutSettings["footer"]>(
    field: K,
    value: InvoiceLayoutSettings["footer"][K]
  ) => {
    setForm((prev) => ({ ...prev, footer: { ...prev.footer, [field]: value } }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Format prüfen
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Falsches Format", description: "Bitte PNG, JPG oder WebP verwenden.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    // Größe prüfen (max. 2 MB — mehr braucht ein Logo nicht)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "Datei zu groß", description: `Logo darf max. 2 MB groß sein (aktuell ${(file.size / 1024 / 1024).toFixed(1)} MB). Bitte komprimieren.`, variant: "destructive" });
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const filePath = `logo.${ext || "png"}`;

      const { error } = await supabase.storage
        .from("logos")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (error) throw error;

      const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
      setLogoUrl(data.publicUrl + "?t=" + Date.now());

      // Cache invalidieren damit das neue Logo sofort in allen PDFs verwendet wird
      const { clearLogoCache } = await import("@/lib/logoLoader");
      clearLogoCache();

      toast({ title: "Logo hochgeladen", description: "Das Logo wurde erfolgreich gespeichert und wird ab sofort in allen PDFs verwendet." });
    } catch (err: any) {
      toast({ title: "Fehler beim Upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateSenderLine = () => {
    setForm((prev) => ({ ...prev, sender_line: buildSenderLine(prev.company) }));
  };

  const handleGenerateFooterLine1 = () => {
    const lines = buildFooterLines(form.company);
    setForm((prev) => ({
      ...prev,
      footer: { ...prev.footer, line1: lines.line1, line2: lines.line2 },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(form);
      toast({ title: "Gespeichert", description: "Rechnungs-Layout wurde erfolgreich gespeichert." });
    } catch (err: any) {
      toast({ title: "Fehler beim Speichern", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Lade Layout-Einstellungen...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rechnungs- & Angebots-Layout
        </CardTitle>
        <CardDescription>
          Gestalte das Erscheinungsbild deiner Rechnungen und Angebote
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* ── Section 1: Firmendaten ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Firmendaten
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Firmenname</Label>
              <Input
                id="company_name"
                value={form.company.name}
                onChange={(e) => updateCompany("name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_slogan">Slogan / Zusatz</Label>
              <Input
                id="company_slogan"
                value={form.company.slogan}
                onChange={(e) => updateCompany("slogan", e.target.value)}
                placeholder="z.B. Ihr Montagetischler"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_address1">Adresszeile 1</Label>
              <Input
                id="company_address1"
                value={form.company.address_line1}
                onChange={(e) => updateCompany("address_line1", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_address2">PLZ / Ort</Label>
              <Input
                id="company_address2"
                value={form.company.address_line2}
                onChange={(e) => updateCompany("address_line2", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_phone">Telefon</Label>
              <Input
                id="company_phone"
                value={form.company.phone}
                onChange={(e) => updateCompany("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_email">E-Mail</Label>
              <Input
                id="company_email"
                type="email"
                value={form.company.email}
                onChange={(e) => updateCompany("email", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company_website">Website (optional)</Label>
              <Input
                id="company_website"
                value={form.company.website}
                onChange={(e) => updateCompany("website", e.target.value)}
                placeholder="www.beispiel.at"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Section 2: Logo ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Logo
          </h3>
          <div className="flex items-center gap-3">
            <Switch
              id="logo_enabled"
              checked={form.logo.enabled}
              onCheckedChange={(checked) => updateLogo("enabled", checked)}
            />
            <Label htmlFor="logo_enabled">Logo auf Dokumenten anzeigen</Label>
          </div>

          {form.logo.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="logo_position">Position</Label>
                <Select
                  value={form.logo.position}
                  onValueChange={(v) => updateLogo("position", v as "left" | "center" | "right")}
                >
                  <SelectTrigger id="logo_position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Links</SelectItem>
                    <SelectItem value="center">Mitte</SelectItem>
                    <SelectItem value="right">Rechts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="logo_width">Breite (mm)</Label>
                  <Input
                    id="logo_width"
                    type="number"
                    value={form.logo.width_mm}
                    onChange={(e) => updateLogo("width_mm", Number(e.target.value))}
                    min={5}
                    max={200}
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <Label htmlFor="logo_height">Höhe (mm)</Label>
                  <Input
                    id="logo_height"
                    type="number"
                    value={form.logo.height_mm}
                    onChange={(e) => updateLogo("height_mm", Number(e.target.value))}
                    min={5}
                    max={100}
                  />
                </div>
              </div>

              {form.logo.position === "left" && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="logo_offset_x">Logo nach rechts verschieben (mm)</Label>
                  <Input
                    id="logo_offset_x"
                    type="number"
                    value={form.logo.offset_x_mm ?? 0}
                    onChange={(e) => updateLogo("offset_x_mm", Number(e.target.value) || 0)}
                    min={0}
                    max={80}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = bündig zum Textblock. Positive Werte verschieben das Logo
                    nach rechts — nützlich, wenn das Logo-PNG links einen
                    transparenten Rand hat.
                  </p>
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Logo-Datei hochladen</Label>
                <div className="flex items-center gap-4">
                  <Button variant="outline" asChild disabled={uploading}>
                    <label className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Wird hochgeladen..." : "Datei auswählen"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </Button>
                  {logoUrl && (
                    <div className="border rounded-md p-2 bg-white">
                      <img
                        src={logoUrl}
                        alt="Logo-Vorschau"
                        className="max-h-12 max-w-[180px] object-contain"
                        onError={() => setLogoUrl(null)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* ── Section 3: Absenderzeile ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Absenderzeile
          </h3>
          <div className="space-y-2">
            <Label htmlFor="sender_line">Absenderzeile (kleine Zeile über Empfängeradresse)</Label>
            <div className="flex gap-2">
              <Input
                id="sender_line"
                value={form.sender_line}
                onChange={(e) => setForm((prev) => ({ ...prev, sender_line: e.target.value }))}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleGenerateSenderLine}>
                <Wand2 className="h-4 w-4 mr-2" />
                Aus Firmendaten generieren
              </Button>
            </div>
          </div>

        </div>

        <Separator />

        {/* ── Section 4: Fußzeile ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Fußzeile
          </h3>

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="footer_line1">Zeile 1</Label>
                <Input
                  id="footer_line1"
                  value={form.footer.line1}
                  onChange={(e) => updateFooter("line1", e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleGenerateFooterLine1}>
                <Wand2 className="h-4 w-4 mr-2" />
                Aus Firmendaten generieren
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer_line2">Zeile 2</Label>
            <Input
              id="footer_line2"
              value={form.footer.line2}
              onChange={(e) => updateFooter("line2", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer_line3">Zeile 3</Label>
            <Input
              id="footer_line3"
              value={form.footer.line3}
              onChange={(e) => updateFooter("line3", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <div className="flex items-center gap-3">
              <Switch
                id="show_bank"
                checked={form.footer.show_bank_in_footer}
                onCheckedChange={(checked) => updateFooter("show_bank_in_footer", checked)}
              />
              <Label htmlFor="show_bank">Bank in Fußzeile anzeigen</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="show_pages"
                checked={form.footer.show_page_numbers}
                onCheckedChange={(checked) => updateFooter("show_page_numbers", checked)}
              />
              <Label htmlFor="show_pages">Seitenzahlen anzeigen</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Section 5: Texte ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Texte
          </h3>

          <div className="space-y-2">
            <Label htmlFor="closing_invoice">Schlusstext Rechnung</Label>
            <Textarea
              id="closing_invoice"
              value={form.closing_text_invoice}
              onChange={(e) => setForm((prev) => ({ ...prev, closing_text_invoice: e.target.value }))}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Verwende <code className="bg-muted px-1 rounded">{"{{tage}}"}</code> als Platzhalter
              für die Zahlungsfrist
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closing_angebot">Schlusstext Angebot</Label>
            <Textarea
              id="closing_angebot"
              value={form.closing_text_angebot}
              onChange={(e) => setForm((prev) => ({ ...prev, closing_text_angebot: e.target.value }))}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Platzhalter: <code className="bg-muted px-1 rounded">{"{{gueltig_bis}}"}</code> für das
              Gültigkeitsdatum, <code className="bg-muted px-1 rounded">{"{{tage}}"}</code> für die
              Restlaufzeit in Tagen.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="danke_text">Danke-Text</Label>
            <Input
              id="danke_text"
              value={form.danke_text}
              onChange={(e) => setForm((prev) => ({ ...prev, danke_text: e.target.value }))}
            />
          </div>
        </div>

        <Separator />

        {/* ── Section 5b: Ansprechpartner (Sachbearbeiter) ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Ihr Ansprechpartner (erscheint rechts oben im PDF)
          </h3>
          <p className="text-xs text-muted-foreground">
            Diese Angaben erscheinen auf allen Angeboten und Rechnungen rechts oben als
            „Ihr Ansprechpartner" — also der Kontakt auf eurer Seite, an den der Kunde
            sich bei Rückfragen wenden kann.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="contact_name">Name</Label>
              <Input
                id="contact_name"
                value={form.contact?.name || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, contact: { ...(prev.contact || { name: "", phone: "", email: "" }), name: e.target.value } }))
                }
                placeholder="z.B. Max Mustermann"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_phone">Telefon</Label>
              <Input
                id="contact_phone"
                value={form.contact?.phone || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, contact: { ...(prev.contact || { name: "", phone: "", email: "" }), phone: e.target.value } }))
                }
                placeholder="+43 …"
                type="tel"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact_email">E-Mail</Label>
              <Input
                id="contact_email"
                value={form.contact?.email || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, contact: { ...(prev.contact || { name: "", phone: "", email: "" }), email: e.target.value } }))
                }
                placeholder="kontakt@…"
                type="email"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Section 6: Akzentfarbe ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Akzentfarbe
          </h3>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={form.accent_color}
              onChange={(e) => setForm((prev) => ({ ...prev, accent_color: e.target.value }))}
              className="h-10 w-14 rounded border cursor-pointer"
            />
            <Input
              value={form.accent_color}
              onChange={(e) => setForm((prev) => ({ ...prev, accent_color: e.target.value }))}
              className="w-32 font-mono"
              maxLength={7}
              placeholder="#1F3A5F"
            />
            <div
              className="h-10 w-10 rounded-md border shadow-sm"
              style={{ backgroundColor: form.accent_color }}
              title="Vorschau"
            />
          </div>
        </div>

        <Separator />

        {/* ── Save ── */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Wird gespeichert..." : "Einstellungen speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
