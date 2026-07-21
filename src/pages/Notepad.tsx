import { Navigate } from "react-router-dom";

/**
 * /notepad — Alt-Route.
 *
 * BEFUND (Restmasken-Test 2026-07-21): Eine Notizzettel-Funktion gibt es in
 * dieser App NICHT (mehr). Es existiert weder eine Tabelle für Notizen noch eine
 * Maske dafür; auch die Projektmasken haben kein Notizfeld. Die Route ist
 * zusätzlich von keinem Menü aus verlinkt und damit nur über einen alten
 * Lesezeichen-/Deep-Link erreichbar.
 *
 * Deshalb bleibt hier nur die Weiterleitung auf die Projektliste. Vorher lief
 * das über useEffect + navigate(), wodurch für einen Moment die weiße Meldung
 * „Weiterleitung zu Projekten..." aufblitzte. <Navigate replace/> leitet sofort
 * und ohne Zwischenbild um und hinterlässt keinen History-Eintrag (Zurück führt
 * damit nicht in eine Endlosschleife).
 */
export default function Notepad() {
  return <Navigate to="/projects" replace />;
}
