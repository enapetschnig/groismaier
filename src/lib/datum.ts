/**
 * Datum → "JJJJ-MM-TT" in der ÖRTLICHEN Zeitzone.
 *
 * Warum es diese Datei gibt: `new Date(2026, 4, 1).toISOString().split("T")[0]`
 * liefert in Österreich (UTC+1/+2) den 30.04. statt des 01.05. — Mitternacht
 * lokal ist am Vortag in UTC. Genau daran hingen zwei bestätigte Fehler:
 * die Excel-Stundenliste wies Tagessummen und Überstunden dem VORTAG zu, und
 * die Zeitraum-Schnellwahl im Projektstunden-Bericht verschob jeden Bereich
 * um einen Tag (Monatsanfang fiel in den Vormonat, das Monatsende auf den
 * vorletzten Tag).
 *
 * Ebenso ist `new Date().toISOString()` als „heute" zwischen Mitternacht und
 * 02:00 Uhr falsch — der Monteur, der um 00:30 seine Stunden nachträgt,
 * bekäme das Datum von gestern vorgeschlagen.
 */

/** Lokales Datum als "JJJJ-MM-TT". */
export const alsISO = (d: Date): string => {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
};

/** Heutiges Datum als "JJJJ-MM-TT" (örtlich, nicht UTC). */
export const heuteISO = (): string => alsISO(new Date());
