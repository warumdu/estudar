# Phase 1 — nutzbarer Kern

## Datenhaltung

IndexedDB, vier Speicher:

- `cards` — id, noteId, deckId, type, front, back, example, hint, tags[], createdAt, updatedAt, suspended
- `cardStates` — cardId plus den vollständigen FSRS-Zustand der vendorierten Fassung (due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review). Lies die tatsächliche API in `vendor/ts-fsrs/` aus, statt sie aus dem Gedächtnis anzunehmen.
- `reviews` — Protokoll: cardId, Zeitstempel, Bewertung, Intervall davor, Intervall danach, Dauer in ms. Wird nie gelöscht, auch nicht beim Löschen der Karte.
- `settings` — Zielretention (0,90), Tageslimit (40), Schemaversion

Versioniere das Schema von Anfang an und schreib eine Migrationsfunktion, auch wenn sie in Version 1 leer bleibt.

## Bildschirme

Fünf, mehr nicht:

1. **Heute** — Einstieg. Große Zahl fälliger Karten, ein Knopf „Lernen". Darunter zwei Zeilen: heute gelernt, nächste Fälligkeit. Ist nichts fällig, sag das klar und biete „Trotzdem üben" an, ohne Terminierung.
2. **Session** — siehe unten.
3. **Decks** — Liste mit Kartenzahl und Fälligkeit je Deck; anlegen, umbenennen, löschen mit Rückfrage.
4. **Karte** — anlegen und bearbeiten. Nach dem Speichern bleibt die Maske offen und leer für die nächste Karte, damit ich zehn Vokabeln am Stück eingeben kann, ohne zurückzunavigieren.
5. **Einstellungen** — Zielretention, Tageslimit, Sicherung, Version, Update-Knopf.

## Lernsession

Frage groß in der Bildschirmmitte. Antippen an beliebiger Stelle zeigt die Lösung. Dann vier Knöpfe am unteren Rand, daumenbreit: Nochmal · Schwer · Gut · Leicht. Über jedem steht in Klartext das Intervall, das er auslöst („in 2 Tagen", „in 3 Wochen") — aus ts-fsrs berechnet, nicht geschätzt.

Bei `conjugation` und wahlweise bei `vocab` in Richtung DE→PT: Eingabefeld statt Antippen. Der Vergleich normalisiert Akzente und Groß-/Kleinschreibung; eine nur in den Akzenten falsche Antwort gilt als richtig, die Lösung wird aber mit farbig markierter Abweichung gezeigt. Über der Tastatur eine antippbare Leiste mit á à ã â é ê í ó ô õ ú ç.

Nach jeder Bewertung sofort weiter, keine Bestätigung. Am Sessionende: Kartenzahl, Trefferquote, Dauer und ein Knopf „Sicherung jetzt".

Das Tageslimit gilt für Wiederholungen. Ist der Rückstand größer, nimm die am längsten überfälligen zuerst und verteil den Rest auf die Folgetage, statt alles an einem Tag zu zeigen.

## Karteneingabe

`vocab` und `cloze` müssen vollständig funktionieren. `conjugation` und `sentence` dürfen als Typ existieren und anlegbar sein, brauchen in der Session aber noch keine Sonderbehandlung.

Bei `vocab` eine Ankreuzoption „beide Richtungen": erzeugt zwei getrennt terminierte Karten mit gemeinsamer `noteId`, die nie am selben Tag hintereinander drankommen.

## Sicherung

Export schreibt eine einzige JSON-Datei mit Karten, Zuständen, Protokoll und Einstellungen, Dateiname mit Datum, auf iOS über das Teilen-Blatt, damit ich sie in „Dateien" oder iCloud legen kann. Import derselben Datei mit Auswahl ersetzen oder zusammenführen, vorher anzeigen, wie viele Karten betroffen sind.

In den Einstellungen ein Satz in einfachen Worten, warum das nötig ist und wie oft ich es tun soll.

## Startinhalt

Leg ein Deck „Probe (löschbar)" mit 20 Karten brasilianischem Portugiesisch auf A2-Niveau an, damit ich sofort testen kann, ohne selbst zu tippen: 15 `vocab`, 5 `cloze` zum pretérito perfeito. Das ist Prüfmaterial, kein Lernstoff. Der echte Wortschatz kommt in Phase 2 als Importdatei.

## Update-Knopf

Aus Phase 0 offen: Eine neue Fassung darf die Seite nicht mehr selbsttätig neu laden. Erkennt der Service Worker eine neue Fassung, zeig einen unaufdringlichen Hinweis, der erst nach Antippen aktualisiert. Während einer laufenden Session nie anzeigen.

## Abnahme

Schreib mir am Ende diese Prüfliste zum Abarbeiten auf dem iPhone und bau nichts weiter, bis ich bestätigt habe:

1. Karte anlegen, App schließen, vom Icon neu starten — Karte ist noch da.
2. Session mit dem Probe-Deck bis zum Ende durchlaufen.
3. Flugmodus an, App starten, lernen, bewerten — alles funktioniert.
4. Export in „Dateien" ablegen, Deck löschen, Import — Bestand ist wieder da.
5. Zielretention auf 0,95 stellen — die Intervallanzeige auf den Knöpfen ändert sich.

Nenn mir dazu wie in Phase 0 die Schritte, die ich in GitHub antippen muss, um den Branch nach main zu bringen.

## Umfang

Nur was hier steht. Keine Statistiken, keine Diagramme, keine Streaks, keine Audioausgabe, kein Import von CSV oder ZIP — das sind Phase 2 und 3. Fällt dir etwas Sinnvolles auf, das hier fehlt, nenn es mir am Ende in drei Zeilen, statt es zu bauen.
