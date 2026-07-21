/**
 * 404-Maske im KingBill-Look.
 *
 * Vorher: englische Lovable-Standardseite („Oops! Page not found") auf grauem
 * Hintergrund, ohne Toolbar. Ein Mitarbeiter, der sich vertippt oder einem alten
 * Link folgt, landete in einer optisch fremden Sackgasse.
 *
 * Jetzt: blaue KBToolbar mit Zurück-Button, deutscher Text, und zwei klare Wege
 * heraus (zurück zur vorherigen Maske / zur Startmaske).
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, ArrowLeft, SearchX } from "lucide-react";
import { KBToolbar, KBToolbarButton } from "@/components/kingbill";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.warn("404: Aufgerufene Seite existiert nicht:", location.pathname);
  }, [location.pathname]);

  // history.length <= 1 → direkt aufgerufener Link, „Zurück" würde ins Leere
  // führen. Dann bleibt der Home-Button der einzige (und richtige) Weg.
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <div className="kb-page min-h-screen">
      <KBToolbar
        title="Seite nicht gefunden"
        onBack={canGoBack ? () => navigate(-1) : undefined}
        rightActions={
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Zur Startmaske"
            title="Zur Startmaske"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-kb-blue-dark bg-gradient-to-b from-white to-[hsl(213_30%_88%)] shadow-md transition-transform hover:brightness-105 active:translate-y-px"
          >
            <Home className="h-5 w-5 text-kb-blue-dark" strokeWidth={2.5} />
          </button>
        }
      />

      <div className="container mx-auto max-w-xl px-4 py-8">
        <div className="kb-panel p-6 text-center">
          <SearchX className="mx-auto mb-3 h-12 w-12 text-kb-icon-gray" strokeWidth={1.75} />
          <p className="text-3xl font-extrabold text-kb-blue-dark">404</p>
          <h1 className="mt-1 text-lg font-bold">Diese Seite gibt es nicht</h1>
          {/* break-all NUR auf den Pfad — sonst zerlegt der Umbruch am Handy
              auch normale Wörter („Vi elleicht"). */}
          <p className="mt-2 text-sm text-muted-foreground">
            Der Aufruf <span className="break-all font-mono">{location.pathname}</span> führt ins
            Leere. Vielleicht ein alter Link oder ein Tippfehler.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {canGoBack && (
              <KBToolbarButton
                icon={ArrowLeft}
                label="Zurück"
                className="w-full sm:w-auto"
                onClick={() => navigate(-1)}
              />
            )}
            <KBToolbarButton
              icon={Home}
              label="Zur Startmaske"
              variant="blue"
              className="w-full sm:w-auto"
              onClick={() => navigate("/")}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
