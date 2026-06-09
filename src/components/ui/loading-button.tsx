import { forwardRef, ReactNode } from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
}

/**
 * Standard-Button mit Loading-State.
 * Zeigt Spinner + optionalen loadingText während `loading=true`,
 * blockiert dabei Klicks.
 *
 * Verwendung:
 *   <LoadingButton loading={saving} loadingText="Speichert...">
 *     Speichern
 *   </LoadingButton>
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, loadingText, children, disabled, ...props }, ref) => {
    return (
      <Button ref={ref} disabled={disabled || loading} {...props}>
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {loading && loadingText ? loadingText : children}
      </Button>
    );
  }
);

LoadingButton.displayName = "LoadingButton";
