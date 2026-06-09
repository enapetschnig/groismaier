import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChangePasswordDialogProps {
  /** Erzwungener Modus: nicht abbrechbar, kein Dropdown-Trigger, setzt
   *  profiles.must_change_password nach Erfolg auf false. */
  forced?: boolean;
  onSuccess?: () => void;
}

export default function ChangePasswordDialog({ forced = false, onSuccess }: ChangePasswordDialogProps = {}) {
  const [open, setOpen] = useState(forced);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("new-password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setError(error.message);
    } else {
      // Pflicht-Flag zurücksetzen, damit beim nächsten Login nicht erneut gezwungen wird.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      }
      toast({
        title: "Passwort geändert",
        description: "Ihr Passwort wurde erfolgreich aktualisiert.",
      });
      setOpen(false);
      setError(null);
      (e.target as HTMLFormElement).reset();
      onSuccess?.();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (forced) return; setOpen(o); if (!o) setError(null); }}>
      {!forced && (
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => {
            e.preventDefault();
            setOpen(true);
          }}>
            <Key className="mr-2 h-4 w-4" />
            <span>Passwort ändern</span>
          </DropdownMenuItem>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => forced && e.preventDefault()} onEscapeKeyDown={(e) => forced && e.preventDefault()} hideClose={forced}>
        <DialogHeader>
          <DialogTitle>{forced ? "Passwort festlegen" : "Passwort ändern"}</DialogTitle>
          <DialogDescription>
            {forced
              ? "Bitte vergib zunächst ein eigenes Passwort, um fortzufahren. Mindestens 6 Zeichen."
              : "Geben Sie Ihr neues Passwort ein. Es muss mindestens 6 Zeichen lang sein."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">Neues Passwort</Label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              required
              minLength={6}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Passwort bestätigen</Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              required
              minLength={6}
              placeholder="Passwort wiederholen"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Lädt..." : forced ? "Passwort festlegen" : "Passwort ändern"}
            </Button>
            {!forced && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Abbrechen
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
