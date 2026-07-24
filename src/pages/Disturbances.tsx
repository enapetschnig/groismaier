import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useZurueck } from "@/hooks/useZurueck";
import { Zap, Plus, Calendar, Clock, User, MapPin, Filter, Search, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DisturbanceForm } from "@/components/DisturbanceForm";

type Disturbance = {
  id: string;
  datum: string;
  start_time: string;
  end_time: string;
  pause_minutes: number;
  stunden: number;
  kunde_name: string;
  kunde_email: string | null;
  kunde_adresse: string | null;
  kunde_telefon: string | null;
  beschreibung: string;
  notizen: string | null;
  status: string;
  is_verrechnet: boolean;
  created_at: string;
  user_id: string;
  project_id: string | null;
  unterschrift_kunde: string | null;
  profile_vorname?: string;
  profile_nachname?: string;
  project_name?: string | null;
};

const Disturbances = () => {
  const navigate = useNavigate();
  const zurueck = useZurueck("/");
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [disturbances, setDisturbances] = useState<Disturbance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [prefillProjectId, setPrefillProjectId] = useState<string | null>(null);
  const projectFilter = searchParams.get("project");

  useEffect(() => {
    checkAuth();
    // Quick-Action aus Projekt: /disturbances?new=<project_id> → Dialog automatisch öffnen mit vorbelegtem Projekt
    const newProjectId = searchParams.get("new");
    if (newProjectId) {
      setPrefillProjectId(newProjectId);
      setShowForm(true);
    }
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Check if admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    setIsAdmin(roleData?.role === "administrator");
    fetchDisturbances();
  };

  const fetchDisturbances = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("disturbances")
      .select("*")
      .order("datum", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Regieberichte konnten nicht geladen werden",
      });
    } else {
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(d => d.user_id))];
        const projectIds = [...new Set(data.map((d: any) => d.project_id).filter(Boolean))] as string[];

        const [{ data: profiles }, { data: projects }] = await Promise.all([
          supabase.from("profiles").select("id, vorname, nachname").in("id", userIds),
          projectIds.length > 0
            ? supabase.from("projects").select("id, name").in("id", projectIds)
            : Promise.resolve({ data: [] as any[] } as any),
        ]);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const projectMap = new Map((projects || []).map((p: any) => [p.id, p.name]));

        const enrichedData = data.map((d: any) => ({
          ...d,
          profile_vorname: profileMap.get(d.user_id)?.vorname || "",
          profile_nachname: profileMap.get(d.user_id)?.nachname || "",
          project_name: d.project_id ? projectMap.get(d.project_id) || null : null,
        }));

        setDisturbances(enrichedData);
      } else {
        setDisturbances([]);
      }
    }
    setLoading(false);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    fetchDisturbances();
  };

  /** Status-Ablauf: Entwurf/offen → Unterschrieben → Abgeschlossen. */
  const getStatusBadge = (d: Disturbance) => {
    if (d.status === "abgeschlossen") {
      return <Badge className="bg-green-600 text-white">Abgeschlossen</Badge>;
    }
    if (d.unterschrift_kunde) {
      return <Badge className="bg-blue-600 text-white">Unterschrieben</Badge>;
    }
    if (d.status === "offen") {
      return <Badge variant="secondary">Entwurf / offen</Badge>;
    }
    return <Badge variant="outline">{d.status}</Badge>;
  };

  const handleToggleVerrechnet = async (e: React.MouseEvent, disturbanceId: string, currentValue: boolean) => {
    e.stopPropagation();

    const { error } = await supabase
      .from("disturbances")
      .update({ is_verrechnet: !currentValue })
      .eq("id", disturbanceId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Status konnte nicht geändert werden",
      });
    } else {
      fetchDisturbances();
    }
  };

  const filteredDisturbances = disturbances.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      d.kunde_name.toLowerCase().includes(q) ||
      d.beschreibung.toLowerCase().includes(q) ||
      (d.project_name?.toLowerCase().includes(q) ?? false) ||
      (d.kunde_adresse?.toLowerCase().includes(q) ?? false);

    let matchesStatus = true;
    if (statusFilter === "verrechnet") {
      matchesStatus = d.is_verrechnet === true;
    } else if (statusFilter === "nicht_verrechnet") {
      matchesStatus = d.is_verrechnet === false;
    } else if (statusFilter === "unterschrieben") {
      matchesStatus = !!d.unterschrift_kunde && d.status !== "abgeschlossen";
    } else if (statusFilter !== "alle") {
      matchesStatus = d.status === statusFilter;
    }

    const matchesProject = !projectFilter || d.project_id === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });

  const offeneAnzahl = disturbances.filter((d) => d.status !== "abgeschlossen").length;

  if (loading) {
    return (
      <div className="kb-page min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar onBack={zurueck} title="Regieberichte">
        {/* kurzes Label — „Neuer Regiebericht" sprengt am Handy die Leiste */}
        <KBToolbarButton
          icon={Plus}
          iconClassName="text-kb-green"
          label="Neu"
          onClick={() => setShowForm(true)}
        />
      </KBToolbar>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl">
        {/* Am Handy die wichtigste Aktion groß und unmissverständlich */}
        <Button
          className="sm:hidden w-full h-12 text-base mb-3"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Neuer Regiebericht
        </Button>

        {/* Filter */}
        <Card className="kb-panel mb-4">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche nach Kunde, Projekt, Beschreibung…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-11">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  <SelectItem value="offen">Entwurf / offen</SelectItem>
                  <SelectItem value="unterschrieben">Unterschrieben</SelectItem>
                  <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                  <SelectItem value="verrechnet">Verrechnet</SelectItem>
                  <SelectItem value="nicht_verrechnet">Nicht verrechnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(projectFilter || disturbances.length > 0) && (
              <p className="text-xs text-muted-foreground mt-2">
                {filteredDisturbances.length} von {disturbances.length} Berichten
                {offeneAnzahl > 0 && ` · ${offeneAnzahl} noch nicht abgeschlossen`}
                {projectFilter && " · auf dieses Projekt gefiltert"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Liste — Karten, damit es am Handy gut bedienbar bleibt */}
        {filteredDisturbances.length === 0 ? (
          <Card className="kb-panel">
            <CardContent className="py-12 text-center">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Einträge gefunden</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "alle"
                  ? "Keine Einträge entsprechen Ihren Filterkriterien"
                  : "Erstellen Sie Ihren ersten Regiebericht"}
              </p>
              {!searchQuery && statusFilter === "alle" && (
                <Button onClick={() => setShowForm(true)} variant="outline" className="h-12 text-base">
                  <Plus className="h-5 w-5 mr-2" />
                  Ersten Regiebericht erfassen
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredDisturbances.map((disturbance) => (
              <Card
                key={disturbance.id}
                className="kb-panel cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/disturbances/${disturbance.id}`)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 break-words">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="min-w-0">{disturbance.kunde_name}</span>
                        </h3>
                        {isAdmin && (disturbance.profile_vorname || disturbance.profile_nachname) && (
                          <p className="text-xs text-muted-foreground">
                            Erstellt von: {disturbance.profile_vorname} {disturbance.profile_nachname}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {getStatusBadge(disturbance)}
                        {disturbance.is_verrechnet && (
                          <Badge className="bg-emerald-600 text-white">Verrechnet</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 shrink-0" />
                        {format(new Date(disturbance.datum), "dd.MM.yyyy", { locale: de })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4 shrink-0" />
                        {disturbance.start_time.slice(0, 5)} - {disturbance.end_time.slice(0, 5)} ({disturbance.stunden.toFixed(1)}h)
                      </span>
                      {disturbance.project_name && (
                        <span className="flex items-center gap-1 min-w-0">
                          <Briefcase className="h-4 w-4 shrink-0" />
                          <span className="truncate">{disturbance.project_name}</span>
                        </span>
                      )}
                      {disturbance.kunde_adresse && (
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{disturbance.kunde_adresse}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-sm line-clamp-2 break-words">{disturbance.beschreibung}</p>

                    {isAdmin && disturbance.status !== "offen" && (
                      <div className="flex justify-end">
                        <Button
                          variant={disturbance.is_verrechnet ? "secondary" : "outline"}
                          size="sm"
                          className="h-10"
                          onClick={(e) => handleToggleVerrechnet(e, disturbance.id, disturbance.is_verrechnet)}
                        >
                          {disturbance.is_verrechnet ? "✓ Verrechnet" : "Verrechnen"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Disturbance Form Dialog */}
      <DisturbanceForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setPrefillProjectId(null);
        }}
        onSuccess={handleFormSuccess}
        editData={null}
        prefillProjectId={prefillProjectId}
      />
    </div>
  );
};

export default Disturbances;
