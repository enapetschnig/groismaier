import { useMemo, useState } from "react";
import { Tag, FileText, Download, ExternalLink, Search, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PREISLISTEN, PREISLISTEN_KATEGORIEN, type UnterlageItem } from "@/lib/unterlagenData";

/**
 * Preislisten — Holzbau Groismaier
 *
 * Lieferanten-Preislisten (Holz, BSH, Dämmung, Stroh, Schraubfundamente,
 * Kran, Transport, Abbund …) aus dem GROISMAIER-Ordner, nach Kategorie
 * gruppiert und durchsuchbar. PDFs/Bilder lassen sich ansehen, Word-/
 * Excel-Dateien herunterladen — als Referenz für Kalkulation & Einkauf.
 */
export default function Preislisten() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? PREISLISTEN.filter((p) =>
          [p.title, p.supplier, p.category, String(p.year ?? "")].join(" ").toLowerCase().includes(q))
      : PREISLISTEN;
    const byCat = new Map<string, UnterlageItem[]>();
    for (const p of filtered) {
      if (!byCat.has(p.category)) byCat.set(p.category, []);
      byCat.get(p.category)!.push(p);
    }
    const ordered = [...PREISLISTEN_KATEGORIEN, ...Array.from(byCat.keys()).filter((c) => !PREISLISTEN_KATEGORIEN.includes(c))];
    return ordered.filter((c) => byCat.has(c)).map((c) => ({ category: c, items: byCat.get(c)! }));
  }, [query]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Preislisten" />

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-6xl">
        <p className="text-muted-foreground mb-4 flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary shrink-0" />
          Lieferanten-Preislisten als Referenz für Kalkulation &amp; Einkauf.
        </p>

        <div className="relative mb-6 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suchen (Lieferant, Titel, Jahr) …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {total === 0 ? (
          <p className="text-muted-foreground py-12 text-center">Keine Preisliste gefunden für „{query}".</p>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.category}>
                <h2 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2 text-foreground">
                  <Tag className="h-4 w-4 text-primary" />
                  {group.category}
                  <span className="text-sm font-normal text-muted-foreground">({group.items.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.items.map((item) => {
                    const Icon = item.viewable ? FileText : FileSpreadsheet;
                    return (
                      <Card key={item.file} className="flex flex-col hover:shadow-md transition-shadow">
                        <CardHeader className="space-y-2 pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            {item.year && (
                              <span className="text-xs font-semibold text-primary bg-primary/10 rounded px-2 py-0.5">{item.year}</span>
                            )}
                          </div>
                          <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
                          {item.supplier && (
                            <p className="text-xs font-medium text-foreground/70">{item.supplier}</p>
                          )}
                          <CardDescription className="text-xs line-clamp-3">{item.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="mt-auto flex gap-2">
                          {item.viewable ? (
                            <Button size="sm" className="flex-1" asChild>
                              <a href={item.file} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-1.5" /> Ansehen
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" className="flex-1" variant="secondary" asChild>
                              <a href={item.file} download>
                                <Download className="h-4 w-4 mr-1.5" /> Download ({item.ext.toUpperCase()})
                              </a>
                            </Button>
                          )}
                          {item.viewable && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={item.file} download>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
