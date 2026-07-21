import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, UserPlus, Building, Upload, Trash2, CheckCircle, FileText, Image, Map, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildProjectFilePath } from "@/lib/projectFiles";
import { useToast } from "@/hooks/use-toast";
import {
  CustomerForm,
  EMPTY_CUSTOMER_FORM,
  composeCustomerName,
  type CustomerFormData,
} from "@/components/CustomerForm";

interface CustomerOption {
  id: string;
  name: string;
  ansprechpartner: string | null;
  uid_nummer: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  email: string | null;
  telefon: string | null;
  kundentyp: string | null;
  firmenname: string | null;
  vorname: string | null;
  nachname: string | null;
  anrede: string | null;
  titel: string | null;
}

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: { id: string; name: string }) => void;
  defaultName?: string;
  defaultCustomerId?: string | null;
  defaultCustomerName?: string;
  defaultAdresse?: string;
  defaultPlz?: string;
  defaultOrt?: string;
  defaultEmail?: string;
  defaultTelefon?: string;
  defaultUidNummer?: string;
  defaultAnrede?: string;
  defaultTitel?: string;
}

interface UploadedFile {
  name: string;
  bucket: string;
  path: string;
}

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  defaultName = "",
  defaultCustomerId = null,
  defaultCustomerName = "",
  defaultAdresse = "",
  defaultPlz = "",
  defaultOrt = "",
  defaultEmail = "",
  defaultTelefon = "",
  defaultUidNummer = "",
  defaultAnrede = "",
  defaultTitel = "",
}: CreateProjectDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerTab, setCustomerTab] = useState<"existing" | "new">("existing");

  // Statuses
  const [projectStatuses, setProjectStatuses] = useState<{ id: string; name: string; is_default: boolean }[]>([]);

  // --- Section 1: Projektdaten ---
  const [projectName, setProjectName] = useState(defaultName);
  const [status, setStatus] = useState("");
  const [erfassungsDatum, setErfassungsDatum] = useState(new Date().toISOString().split("T")[0]);
  const [beschreibung, setBeschreibung] = useState("");

  // --- Section 2: Kunde ---
  // Einheitliche Eingabemaske: customerForm bündelt ALLE Kundendaten (Identität +
  // Kontakt + Adresse + Kundentyp). Dieselbe Datenstruktur wie in Customers.tsx und
  // CustomerSelect.tsx — über `<CustomerForm variant="minimal">` gerendert.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(defaultCustomerId);
  const [customerForm, setCustomerForm] = useState<CustomerFormData>(() => ({
    ...EMPTY_CUSTOMER_FORM,
    name: defaultCustomerName,
    firmenname: defaultCustomerName,
    adresse: defaultAdresse,
    plz: defaultPlz,
    ort: defaultOrt,
    email: defaultEmail,
    telefon: defaultTelefon,
    uid_nummer: defaultUidNummer,
    anrede: defaultAnrede,
    titel: defaultTitel,
  }));

  // --- Section 3: Projektadresse / Leistungsort ---
  const [projektAdresse, setProjektAdresse] = useState("");
  const [projektPlz, setProjektPlz] = useState("");
  const [projektOrt, setProjektOrt] = useState("");
  const [projektLand, setProjektLand] = useState("Österreich");
  const [projektKontaktName, setProjektKontaktName] = useState("");
  const [projektKontaktTelefon, setProjektKontaktTelefon] = useState("");
  const [zusatzinfos, setZusatzinfos] = useState("");
  const [wegbeschreibung, setWegbeschreibung] = useState("");

  // --- Section 4: Fotos & Dokumente (post-save) ---
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdProjectName, setCreatedProjectName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const planInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Load data on open
  useEffect(() => {
    if (open) {
      // Reset form
      setProjectName(defaultName);
      setStatus("");
      setErfassungsDatum(new Date().toISOString().split("T")[0]);
      setBeschreibung("");
      setSelectedCustomerId(defaultCustomerId);
      setCustomerForm({
        ...EMPTY_CUSTOMER_FORM,
        name: defaultCustomerName,
        firmenname: defaultCustomerName,
        adresse: defaultAdresse,
        plz: defaultPlz,
        ort: defaultOrt,
        email: defaultEmail,
        telefon: defaultTelefon,
        uid_nummer: defaultUidNummer,
        anrede: defaultAnrede,
        titel: defaultTitel,
      });
      setProjektAdresse("");
      setProjektPlz("");
      setProjektOrt("");
      setProjektLand("Österreich");
      setProjektKontaktName("");
      setProjektKontaktTelefon("");
      setZusatzinfos("");
      setWegbeschreibung("");
      setCreatedProjectId(null);
      setCreatedProjectName("");
      setUploadedFiles([]);
      setUploading(null);
      setCustomerTab(defaultCustomerId ? "existing" : "existing");

      // Load customers
      supabase
        .from("customers")
        .select("id, name, ansprechpartner, uid_nummer, adresse, plz, ort, land, email, telefon, kundentyp, firmenname, vorname, nachname, anrede, titel")
        .order("name")
        .then(({ data }) => {
          if (data) setCustomers(data as CustomerOption[]);
        });

      // Load project statuses
      (supabase.from("project_statuses" as never) as any)
        .select("id, name, is_default")
        .order("sort_order")
        .then(({ data }: any) => {
          if (data && data.length > 0) {
            setProjectStatuses(data);
            const defaultStatus = data.find((s: any) => s.is_default);
            setStatus(defaultStatus ? defaultStatus.name : data[0].name);
          } else {
            setProjectStatuses([]);
            setStatus("Anfrage");
          }
        });
    }
  }, [open]);

  const selectCustomer = (c: CustomerOption) => {
    setSelectedCustomerId(c.id);
    const typ: "geschaeftskunde" | "privatkunde" =
      c.kundentyp === "privatkunde" ? "privatkunde" : "geschaeftskunde";
    setCustomerForm({
      ...EMPTY_CUSTOMER_FORM,
      name: c.name || "",
      kundentyp: typ,
      firmenname: c.firmenname || (typ === "geschaeftskunde" ? c.name || "" : ""),
      vorname: c.vorname || "",
      nachname: c.nachname || "",
      anrede: c.anrede || "",
      titel: c.titel || "",
      ansprechpartner: c.ansprechpartner || "",
      adresse: c.adresse || "",
      plz: c.plz || "",
      ort: c.ort || "",
      land: c.land || "Österreich",
      email: c.email || "",
      telefon: c.telefon || "",
      uid_nummer: c.uid_nummer || "",
    });
    setCustomerPopoverOpen(false);
    if (!projectName) setProjectName(c.name);
  };

  const handleSave = async () => {
    if (!projectName.trim()) {
      toast({ variant: "destructive", title: "Projektname erforderlich" });
      return;
    }

    // H-3: Projekt ohne Kunde — erlaubt (z.B. interne Projekte), aber mit Hinweis
    const composedCustomerName = composeCustomerName(customerForm);
    if (!selectedCustomerId && !composedCustomerName) {
      const ok = window.confirm("Dieses Projekt hat keinen Kunden. Wirklich ohne Kunde anlegen?");
      if (!ok) return;
    }

    // E-Mail-Validierung wenn gesetzt
    if (customerForm.email && customerForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email.trim())) {
      toast({ variant: "destructive", title: "Ungültige E-Mail", description: "Bitte gültige E-Mail-Adresse eingeben" });
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      let customerId = selectedCustomerId;
      const isGeschaeftlich = customerForm.kundentyp === "geschaeftskunde";

      // Find or create customer (duplicate protection by name)
      if (!customerId && composedCustomerName) {
        let query = supabase.from("customers").select("id").ilike("name", composedCustomerName);
        if (customerForm.plz.trim()) query = query.eq("plz", customerForm.plz.trim());
        const { data: existing } = await query.limit(1).maybeSingle();

        if (existing) {
          customerId = existing.id;
          await supabase
            .from("customers")
            .update({
              adresse: customerForm.adresse.trim() || undefined,
              plz: customerForm.plz.trim() || undefined,
              ort: customerForm.ort.trim() || undefined,
              email: customerForm.email.trim() || undefined,
              telefon: customerForm.telefon.trim() || undefined,
              uid_nummer: isGeschaeftlich ? (customerForm.uid_nummer.trim() || undefined) : undefined,
              anrede: customerForm.anrede || undefined,
              titel: customerForm.titel.trim() || undefined,
            })
            .eq("id", existing.id);
        } else {
          const { data: newCustomer, error: custErr } = await supabase
            .from("customers")
            .insert({
              user_id: user.id,
              name: composedCustomerName,
              kundentyp: customerForm.kundentyp,
              firmenname: isGeschaeftlich ? (customerForm.firmenname.trim() || null) : null,
              vorname: !isGeschaeftlich ? (customerForm.vorname.trim() || null) : null,
              nachname: !isGeschaeftlich ? (customerForm.nachname.trim() || null) : null,
              ansprechpartner: isGeschaeftlich ? (customerForm.ansprechpartner.trim() || null) : null,
              adresse: customerForm.adresse.trim() || null,
              plz: customerForm.plz.trim() || null,
              ort: customerForm.ort.trim() || null,
              land: customerForm.land.trim() || null,
              email: customerForm.email.trim() || null,
              telefon: customerForm.telefon.trim() || null,
              uid_nummer: isGeschaeftlich ? (customerForm.uid_nummer.trim() || null) : null,
              anrede: customerForm.anrede || null,
              titel: customerForm.titel.trim() || null,
            })
            .select("id")
            .single();
          if (custErr) throw custErr;
          customerId = newCustomer.id;
        }
      }

      // Duplicate-Check: gleiches Projekt für diesen Kunden?
      // Verhindert dass beim Ersttermin-Anlegen versehentlich ein zweites
      // Projekt mit gleichem Namen erzeugt wird.
      if (customerId) {
        const { data: existing } = await supabase
          .from("projects")
          .select("id, name")
          .ilike("name", projectName.trim())
          .eq("customer_id", customerId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          toast({
            title: "Projekt bereits vorhanden",
            description: `"${existing.name}" existiert schon für diesen Kunden und wurde verknüpft.`,
          });
          onCreated(existing as { id: string; name: string });
          setSaving(false);
          return;
        }
      }

      // Get next project number
      const { data: projektNummer } = await supabase.rpc("next_document_number" as never, {
        p_typ: "projekt",
      } as never);

      const { data: newProject, error } = await supabase
        .from("projects")
        .insert({
          name: projectName.trim(),
          beschreibung: beschreibung.trim() || null,
          status: status || "Anfrage",
          erfassungsdatum: erfassungsDatum || null,
          projektnummer: projektNummer || null,
          // Kunde
          customer_id: customerId,
          // Projektadresse / Leistungsort
          adresse: projektAdresse.trim() || null,
          plz: projektPlz.trim() || null,
          ort: projektOrt.trim() || null,
          land: projektLand.trim() || null,
          projekt_kontakt_name: projektKontaktName.trim() || null,
          projekt_kontakt_telefon: projektKontaktTelefon.trim() || null,
          zusatzinfos: zusatzinfos.trim() || null,
          wegbeschreibung: wegbeschreibung.trim() || null,
        } as any)
        .select("id, name")
        .single();

      if (error) throw error;

      setCreatedProjectId(newProject.id);
      setCreatedProjectName(newProject.name);

      toast({
        title: "Projekt erstellt",
        description: `"${newProject.name}" wurde angelegt. Sie können jetzt Dateien hochladen.`,
      });

      // Notify parent so it can refresh lists etc.
      onCreated(newProject);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // --- File upload helpers ---
  const handleFileUpload = async (
    files: FileList | null,
    bucket: string,
    bucketLabel: string
  ) => {
    if (!files || files.length === 0 || !createdProjectId) return;

    setUploading(bucket);
    try {
      const newFiles: UploadedFile[] = [];

      for (const file of Array.from(files)) {
        // Storage-sicherer Pfad (Umlaute/Sonderzeichen); Originalname für die Anzeige behalten
        const filePath = buildProjectFilePath(createdProjectId, file.name);

        const { error } = await supabase.storage.from(bucket).upload(filePath, file);
        if (error) throw error;

        newFiles.push({ name: file.name, bucket, path: filePath });
      }

      setUploadedFiles((prev) => [...prev, ...newFiles]);
      toast({
        title: "Hochgeladen",
        description: `${files.length} ${bucketLabel} hochgeladen.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload-Fehler", description: err.message });
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteFile = async (file: UploadedFile) => {
    try {
      const { error } = await supabase.storage.from(file.bucket).remove([file.path]);
      if (error) throw error;

      setUploadedFiles((prev) => prev.filter((f) => f.path !== file.path));
      toast({ title: "Gelöscht", description: `"${file.name}" wurde entfernt.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
  };

  const handleClose = () => {
    setCreatedProjectId(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            {createdProjectId ? (
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Projekt erstellt - Dateien hochladen
              </span>
            ) : (
              "Neues Projekt erstellen"
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ============================================================ */}
        {/* POST-SAVE: Upload section                                     */}
        {/* ============================================================ */}
        {createdProjectId ? (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium">
                Projekt "{createdProjectName}" wurde erfolgreich erstellt.
              </p>
              <p className="text-xs text-green-600 mt-1">
                Sie können jetzt Fotos, Pläne und Dokumente hochladen.
              </p>
            </div>

            {/* Fotos */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Image className="w-4 h-4" />
                Fotos hochladen
              </Label>
              <input
                ref={photoInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  handleFileUpload(e.target.files, "project-photos", "Foto(s)")
                }
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={uploading === "project-photos"}
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading === "project-photos" ? "Lädt hoch..." : "Fotos auswählen"}
              </Button>
              {uploadedFiles
                .filter((f) => f.bucket === "project-photos")
                .map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center justify-between text-sm bg-muted rounded px-3 py-1.5"
                  >
                    <span className="truncate">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleDeleteFile(f)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
            </div>

            {/* Pläne */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Map className="w-4 h-4" />
                Pläne hochladen
              </Label>
              <input
                ref={planInputRef}
                type="file"
                multiple
                accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) =>
                  handleFileUpload(e.target.files, "project-plans", "Plan/Pläne")
                }
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={uploading === "project-plans"}
                onClick={() => planInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading === "project-plans" ? "Lädt hoch..." : "Pläne auswählen"}
              </Button>
              {uploadedFiles
                .filter((f) => f.bucket === "project-plans")
                .map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center justify-between text-sm bg-muted rounded px-3 py-1.5"
                  >
                    <span className="truncate">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleDeleteFile(f)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
            </div>

            {/* Dokumente */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Dokumente hochladen
              </Label>
              <input
                ref={docInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) =>
                  handleFileUpload(e.target.files, "project-reports", "Dokument(e)")
                }
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={uploading === "project-reports"}
                onClick={() => docInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading === "project-reports" ? "Lädt hoch..." : "Dokumente auswählen"}
              </Button>
              {uploadedFiles
                .filter((f) => f.bucket === "project-reports")
                .map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center justify-between text-sm bg-muted rounded px-3 py-1.5"
                  >
                    <span className="truncate">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleDeleteFile(f)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleClose}>Fertig</Button>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* PRE-SAVE: Full project creation form                          */
          /* ============================================================ */
          <div className="space-y-6">
            {/* ======== Section 1: Projektdaten ======== */}
            <div className="space-y-3">
              <Label className="text-base font-semibold border-b pb-1 block">
                Projektdaten
              </Label>
              <div>
                <Label>Projektname *</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="z.B. Badezimmer Sanierung Müller"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Projektnummer</Label>
                  <Input
                    disabled
                    value="(wird automatisch vergeben)"
                    className="text-muted-foreground"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={status || "none"}
                    onValueChange={(v) => setStatus(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectStatuses.length > 0 ? (
                        projectStatuses.map((s) => (
                          <SelectItem key={s.id} value={s.name}>
                            {s.name}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="Anfrage">Anfrage</SelectItem>
                          <SelectItem value="In Arbeit">In Arbeit</SelectItem>
                          <SelectItem value="Abgeschlossen">Abgeschlossen</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Datum der Erfassung</Label>
                <Input
                  type="date"
                  value={erfassungsDatum}
                  onChange={(e) => setErfassungsDatum(e.target.value)}
                />
              </div>
              <div>
                <Label>Beschreibung / Kurzbeschreibung</Label>
                <Textarea
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  placeholder="Kurze Projektbeschreibung..."
                  rows={3}
                />
              </div>
            </div>

            {/* ======== Section 2: Kunde ======== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold border-b pb-1 block">
                  Kunde
                </Label>
                {selectedCustomerId && (
                  <span className="text-xs text-green-600 font-medium">
                    Kunde ausgewählt
                  </span>
                )}
              </div>

              <Tabs value={customerTab} onValueChange={(v) => {
                setCustomerTab(v as any);
                if (v === "new") {
                  // Beim Wechsel auf "Neu" — bestehende Kundenwahl lösen,
                  // Form leer für eine frische Eingabe.
                  setSelectedCustomerId(null);
                  setCustomerForm(EMPTY_CUSTOMER_FORM);
                }
              }}>
                <TabsList className="w-full mb-3">
                  <TabsTrigger value="existing" className="flex-1 gap-1">
                    <Search className="w-3.5 h-3.5" />
                    Bestehender Kunde
                  </TabsTrigger>
                  <TabsTrigger value="new" className="flex-1 gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    Neuer Kunde
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="existing">
                  <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <Search className="w-4 h-4" />
                        {composeCustomerName(customerForm) || customerForm.name || "Kunde suchen..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(350px,calc(100vw-2.5rem))] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Kunde suchen..." />
                        <CommandList>
                          {/*
                            „+ Neuer Kunde" IMMER als erster Eintrag ganz oben —
                            gleiches Verhalten wie in CustomerSelect. forceMount hält
                            den Eintrag auch beim Tippen/Filtern sichtbar.
                          */}
                          <CommandGroup forceMount>
                            <CommandItem
                              forceMount
                              value="__neuer_kunde__"
                              onSelect={() => {
                                setCustomerPopoverOpen(false);
                                setSelectedCustomerId(null);
                                setCustomerForm(EMPTY_CUSTOMER_FORM);
                                setCustomerTab("new");
                              }}
                              className="font-medium text-primary aria-selected:text-primary"
                            >
                              <Plus className="w-4 h-4 mr-2 shrink-0" />
                              Neuer Kunde
                            </CommandItem>
                          </CommandGroup>
                          <CommandEmpty>Kein Kunde gefunden</CommandEmpty>
                          <CommandGroup>
                            {customers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => selectCustomer(c)}
                              >
                                <div>
                                  <p className="font-medium text-sm">{c.name}</p>
                                  {c.ort && (
                                    <p className="text-xs text-muted-foreground">
                                      {c.plz} {c.ort}
                                    </p>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </TabsContent>

                <TabsContent value="new" />
              </Tabs>

              {/* Einheitliche Kunden-Eingabemaske — gleiche wie Customers.tsx + CustomerSelect */}
              <CustomerForm
                value={customerForm}
                onChange={(next) => {
                  setCustomerForm(next);
                  // Wenn der User Felder ändert während ein bestehender Kunde gewählt
                  // ist, bleibt der Link bestehen — der Customer-Datensatz wird beim
                  // Speichern via UPDATE angepasst (siehe handleSave).
                }}
                variant="minimal"
                hideSaveButton
              />
            </div>

            {/* ======== Section 3: Projektadresse / Leistungsort ======== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-1">
                <Label className="text-base font-semibold block">
                  Projektadresse / Leistungsort
                </Label>
                {(customerForm.adresse || customerForm.plz || customerForm.ort) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setProjektAdresse(customerForm.adresse);
                      setProjektPlz(customerForm.plz);
                      setProjektOrt(customerForm.ort);
                      if (!projektKontaktName) setProjektKontaktName(composeCustomerName(customerForm));
                      if (!projektKontaktTelefon) setProjektKontaktTelefon(customerForm.telefon);
                    }}
                  >
                    Kundenadresse übernehmen
                  </Button>
                )}
              </div>
              <AddressAutocomplete
                label="Adresse"
                value={projektAdresse}
                onChange={setProjektAdresse}
                onSelect={(addr) => { setProjektAdresse(addr.street); setProjektPlz(addr.plz); setProjektOrt(addr.ort); }}
                placeholder="Straße + Hausnr. des Projekts"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>PLZ</Label>
                  <Input value={projektPlz} onChange={(e) => setProjektPlz(e.target.value)} placeholder="8831" />
                </div>
                <div className="col-span-2">
                  <Label>Ort</Label>
                  <Input value={projektOrt} onChange={(e) => setProjektOrt(e.target.value)} placeholder="z.B. Wien, Graz..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Kontakt vor Ort</Label>
                  <Input value={projektKontaktName} onChange={(e) => setProjektKontaktName(e.target.value)} placeholder="z.B. Frau Müller" />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input type="tel" value={projektKontaktTelefon} onChange={(e) => setProjektKontaktTelefon(e.target.value)} placeholder="+43 664 ..." />
                </div>
              </div>
              <div>
                <Label>Land</Label>
                <Input
                  value={projektLand}
                  onChange={(e) => setProjektLand(e.target.value)}
                  placeholder="Österreich"
                />
              </div>
              <div>
                <Label>Zusatzinfos</Label>
                <Textarea
                  value={zusatzinfos}
                  onChange={(e) => setZusatzinfos(e.target.value)}
                  placeholder="Schlüsselstandort, Zugang, Besonderheiten..."
                  rows={2}
                />
              </div>
              <div>
                <Label>Wegbeschreibung</Label>
                <Textarea
                  value={wegbeschreibung}
                  onChange={(e) => setWegbeschreibung(e.target.value)}
                  placeholder="Anfahrt, Google Maps Link..."
                  rows={2}
                />
              </div>
            </div>

            {/* ======== Actions ======== */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Erstellt..." : "Projekt erstellen"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
