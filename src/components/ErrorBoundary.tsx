import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * App-weiter Error-Fallback — verhindert weiße Screens bei unbehandelten
 * Render-Fehlern. Zeigt dem Nutzer eine klare Fehlermeldung + Reset-Knopf.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  goHome = () => {
    this.setState({ error: null, errorInfo: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-card border rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <h2 className="text-xl font-semibold">Hoppla — ein Fehler</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Da ist etwas schiefgelaufen. Kein Datenverlust — versuche es einfach nochmal.
            </p>
            <details className="text-xs text-muted-foreground/80 mb-5 bg-muted/30 rounded p-2">
              <summary className="cursor-pointer select-none">Technische Details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack?.slice(0, 400)}
              </pre>
            </details>
            <div className="flex gap-2">
              <Button onClick={this.reset} variant="outline" className="flex-1 gap-2">
                <RotateCcw className="w-4 h-4" /> Nochmal versuchen
              </Button>
              <Button onClick={this.goHome} className="flex-1 gap-2">
                <Home className="w-4 h-4" /> Zur Startseite
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
