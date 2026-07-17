import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

type GeschaeftsbereichTileProps = {
  nummer: number;
  title: string;
  description: string;
  icon: LucideIcon;
  buttonLabel: string;
  onClick: () => void;
};

/** Nummerierte Kachel für den Abschnitt „Geschäftsbereiche" (Badge ①…⑤ laut Kundenskizze). */
export function GeschaeftsbereichTile({ nummer, title, description, icon: Icon, buttonLabel, onClick }: GeschaeftsbereichTileProps) {
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={onClick}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-6 w-6 text-primary" /></div>
          <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0" aria-hidden="true">
            {nummer}
          </span>
        </div>
        <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent><Button className="w-full" size="sm">{buttonLabel}</Button></CardContent>
    </Card>
  );
}
