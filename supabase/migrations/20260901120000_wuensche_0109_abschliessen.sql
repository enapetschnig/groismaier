-- Die vier Meldungen vom 31.08./01.09. abschliessen.

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Im Fahrzeug-/Maschinen-Editor gibt es jetzt den Reiter "Dokumente" - beliebig viele Dateien hochladen (Schaltplaene, Anleitungen, Serviceberichte), per Klick oeffnen, loeschen. Alle Angemeldeten koennen die Dokumente oeffnen, verwalten bleibt Admin-Sache.'
 WHERE id::text LIKE 'b240a087%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: In der Artikelliste stehen Kopieren und Loeschen jetzt direkt rechts an jeder Zeile. Kopieren uebernimmt alles (auch Set-Komponenten), haengt "(Kopie)" an und oeffnet gleich den Bearbeiten-Dialog. (Die Toolbar-Knoepfe oben wirken weiterhin auf die markierte Zeile.)'
 WHERE id::text LIKE '5da3749c%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: In der Eingangsrechnung gibt es den Knopf "Rueckfrage an Chef" (mit Freitext). Du findest diese Rechnungen dann ueber den Status-Filter "Rueckfragen" in der ER-Liste (gelbes Badge an der Zeile); im Detail steht die Frage gelb direkt ueber der Rechnung, daneben teilst du wie gewohnt auf Projekte/Lager auf (auch 2/3 zu 1/3) und drueckst "Geklaert".'
 WHERE id::text LIKE 'dbcc135b%';

UPDATE public.aenderungswuensche SET status = 'umgesetzt', antwort =
  'Umgesetzt: Beim Verfassen, Antworten und Weiterleiten steht deine Signatur (Wortlaut aus deinen Mails) jetzt automatisch unter dem Text - beim Christian-Postfach mit deinem Namen, bei Office/Buchhaltung die Firmenvariante. Vor dem Senden frei aenderbar.'
 WHERE id::text LIKE '25f25bb8%';

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Fahrzeuge: Dokumente je Geraet',
   'Im Fahrzeug-/Maschinen-Editor: neuer Reiter "Dokumente" fuer Schaltplaene und Co.'),
  ('Artikel kopieren und loeschen',
   'In der Artikelliste direkt an jeder Zeile: Kopieren (mit Set-Komponenten) und Loeschen.'),
  ('Eingangsrechnung: Rueckfrage an Chef',
   'Die Buchhaltung stellt die Frage direkt an der Rechnung; du findest sie ueber den Filter "Rueckfragen", teilst auf und drueckst "Geklaert".'),
  ('Mail-Signatur automatisch',
   'Beim Verfassen und Antworten steht die Signatur automatisch unter dem Text.');
