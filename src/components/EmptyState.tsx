import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Einheitlicher Empty-State für leere Listen.
 * Verwendung:
 *   <EmptyState
 *     icon={<Receipt className="h-12 w-12" />}
 *     title="Keine Rechnungen"
 *     description="Erstelle deine erste Rechnung um loszulegen"
 *     action={{ label: "Neue Rechnung", onClick: () => navigate("/invoices/new"), icon: <Plus /> }}
 *   />
 */
export function EmptyState({ icon, title, description, action, secondaryAction, className = "" }: Props) {
  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      {icon && (
        <div className="flex justify-center mb-4 text-muted-foreground/40">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          {action && (
            <Button onClick={action.onClick} className="gap-2">
              {action.icon}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
