-- VK-Formel-Verbindung im Kalkulations-Katalog (Kundenmeldung 21.08.2026:
-- "die Formeln dahinter rechnen nur beim ersten Anlegen"). Wie bei
-- invoice_templates merkt sich auch der Spezial-Katalog (Lack/Aufpreise),
-- ob der VK von Hand gesetzt wurde: Nur ein manuell gesetzter VK ist von
-- der automatischen Ableitung (EK x Faktor) ausgenommen.
ALTER TABLE kalkulation_artikel
  ADD COLUMN IF NOT EXISTS vk_preis_manuell boolean NOT NULL DEFAULT false;
