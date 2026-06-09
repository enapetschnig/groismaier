import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Phone, Users, FileText, Mail, MapPin, Plus, Trash2, MessageSquare, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type EntryType = "anruf" | "meeting" | "notiz" | "email" | "besichtigung";

interface ContactHistoryEntry {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  typ: EntryType;
  betreff: string;
  beschreibung: string | null;
  datum: string;
  dauer_minuten: number | null;
  kontaktperson: string | null;
  erstellt_von: string;
  created_at: string;
}

interface Props {
  customerId?: string;
  projectId?: string;
}

const TYPE_CONFIG: Record<EntryType, { label: string; icon: React.ElementType; color: string }> = {
  anruf: { label: "Anruf", icon: Phone, color: "bg-blue-100 text-blue-800" },
  meeting: { label: "Meeting", icon: Users, color: "bg-purple-100 text-purple-800" },
  notiz: { label: "Notiz", icon: FileText, color: "bg-gray-100 text-gray-800" },
  email: { label: "E-Mail", icon: Mail, color: "bg-green-100 text-green-800" },
  besichtigung: { label: "Besichtigung", icon: MapPin, color: "bg-orange-100 text-orange-800" },
};

const EMPTY_FORM = {
  typ: "anruf" as EntryType,
  betreff: "",
  beschreibung: "",
  datum: "",
  dauer_minuten: "",
  kontaktperson: "",
};

export function ContactHistoryTimeline({ customerId, projectId }: Props) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ContactHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    loadCurrentUser();
    loadEntries();
  }, [customerId, projectId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile && (profile as { role: string }).role === "admin") {
        setIsAdmin(true);
      }
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    let query = supabase
      .from("contact_history" as never)
      .select("*")
      .order("datum", { ascending: false });

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }
    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: "Fehler beim Laden", description: error.message, variant: "destructive" });
    } else {
      setEntries((data ?? []) as ContactHistoryEntry[]);
    }
    setLoading(false);
  };

  const openNewDialog = () => {
    const now = new Date();
    const localIso = format(now, "yyyy-MM-dd'T'HH:mm");
    setForm({ ...EMPTY_FORM, datum: localIso });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.betreff.trim()) {
      toast({ title: "Betreff erforderlich", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Nicht angemeldet", variant: "destructive" });
      setSaving(false);
      return;
    }

    const payload = {
      typ: form.typ,
      betreff: form.betreff.trim(),
      beschreibung: form.beschreibung.trim() || null,
      datum: form.datum ? new Date(form.datum).toISOString() : new Date().toISOString(),
      dauer_minuten: form.dauer_minuten ? parseInt(form.dauer_minuten, 10) : null,
      kontaktperson: form.kontaktperson.trim() || null,
      customer_id: customerId ?? null,
      project_id: projectId ?? null,
      erstellt_von: user.id,
    };

    const { error } = await supabase
      .from("contact_history" as never)
      .insert(payload as never);

    if (error) {
      toast({ title: "Fehler beim Speichern", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eintrag gespeichert" });
      setDialogOpen(false);
      loadEntries();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("contact_history" as never)
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Fehler beim Löschen", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eintrag gelöscht" });
      loadEntries();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          Kontakthistorie
        </CardTitle>
        <Button size="sm" onClick={openNewDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Neuer Eintrag
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Laden...</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">Noch keine Kontakthistorie vorhanden</p>
          </div>
        ) : (
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            {entries.map((entry) => {
              const config = TYPE_CONFIG[entry.typ] ?? TYPE_CONFIG.notiz;
              const Icon = config.icon;

              return (
                <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Icon circle */}
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={config.color}>
                        {config.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.datum), "dd.MM.yyyy HH:mm")}
                      </span>
                      {entry.dauer_minuten != null && (
                        <span className="text-xs text-muted-foreground">
                          {entry.dauer_minuten} Min.
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-medium leading-tight">{entry.betreff}</p>

                    {entry.beschreibung && (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {entry.beschreibung}
                      </p>
                    )}

                    {entry.kontaktperson && (
                      <p className="text-xs text-muted-foreground">
                        Kontakt: {entry.kontaktperson}
                      </p>
                    )}

                    {(isAdmin || entry.erstellt_von === currentUserId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Löschen
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* New entry dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Neuer Kontakthistorie-Eintrag</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="ch-typ">Typ</Label>
                <Select
                  value={form.typ}
                  onValueChange={(val) => setForm((f) => ({ ...f, typ: val as EntryType }))}
                >
                  <SelectTrigger id="ch-typ">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anruf">Anruf</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="notiz">Notiz</SelectItem>
                    <SelectItem value="email">E-Mail</SelectItem>
                    <SelectItem value="besichtigung">Besichtigung</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ch-betreff">Betreff *</Label>
                <Input
                  id="ch-betreff"
                  value={form.betreff}
                  onChange={(e) => setForm((f) => ({ ...f, betreff: e.target.value }))}
                  placeholder="Betreff eingeben"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ch-beschreibung">Beschreibung</Label>
                <Textarea
                  id="ch-beschreibung"
                  value={form.beschreibung}
                  onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))}
                  placeholder="Beschreibung eingeben"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ch-datum">Datum / Uhrzeit</Label>
                  <Input
                    id="ch-datum"
                    type="datetime-local"
                    value={form.datum}
                    onChange={(e) => setForm((f) => ({ ...f, datum: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ch-dauer">Dauer (Minuten)</Label>
                  <Input
                    id="ch-dauer"
                    type="number"
                    min={0}
                    value={form.dauer_minuten}
                    onChange={(e) => setForm((f) => ({ ...f, dauer_minuten: e.target.value }))}
                    placeholder="z.B. 30"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ch-kontakt">Kontaktperson</Label>
                <Input
                  id="ch-kontakt"
                  value={form.kontaktperson}
                  onChange={(e) => setForm((f) => ({ ...f, kontaktperson: e.target.value }))}
                  placeholder="Name der Kontaktperson"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Speichern..." : "Speichern"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
