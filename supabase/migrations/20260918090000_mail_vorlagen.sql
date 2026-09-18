-- Kundenwunsch 18.09.2026 (per Mail): Standardtext der Beleg-Mail und die
-- Signatur selbst einstellen. Ablage in document_texts (typ = Belegtyp oder
-- "mail", feld = mail_betreff / mail_text / signatur:<postfach>), keine
-- Schemaaenderung noetig.

INSERT INTO public.neuerungen (titel, text) VALUES
  ('Beleg-Mail: Text und Signatur selbst einstellen',
   'Admin > Rechnungs-Layout > Textbausteine: je Belegtyp (oder fuer alle) Betreff und Text der Mail, mit Platzhaltern fuer Anrede, Beleg, Nummer, Kunde, Datum und Signatur. Dazu die Signaturen fuer Christian, Office und Buchhaltung - sie gelten in der Beleg-Mail und beim Antworten im Mail-Bereich.');
