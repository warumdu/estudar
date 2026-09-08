# Phase 2 — Import

## Schritt 1: Machbarkeit klären, bevor du baust

Für ZIP und XLSX brauchst du Bibliotheken. Prüfe aus der npm-Registry, ob sie sich als fertiges ES-Modul nach `vendor/` legen lassen, ohne Build und ohne CDN:

- ZIP entpacken (z. B. `fflate`)
- XLSX lesen (z. B. `xlsx` / SheetJS)
- PDF-Textextraktion (z. B. `pdfjs-dist`)

Nenn mir je Bibliothek: geht es ohne Build, wie groß ist die Datei, und wie stark wächst der Offline-Cache. Bei PDF gilt zusätzlich: Meine Arbeitsbücher sind mit reportlab gesetzt, die Textextraktion wird unsauber. Wenn der Aufwand hoch und das Ergebnis unzuverlässig ist, sag mir das offen und schlag vor, PDF ganz zu streichen — ich kann die Dateien auch als JSON erzeugen lassen. Warte meine Entscheidung ab, bevor du eine dieser drei Bibliotheken einbaust. JSON und CSV baust du ohne Rückfrage, die brauchen nichts.

## Schritt 2: Tageslimit für neue Karten

Das ist der Grund, warum diese Phase überhaupt gefährlich ist. Ergänze in den Einstellungen ein zweites Limit „neue Karten pro Tag", Standard 10, getrennt vom Wiederholungslimit. Ein Import von 300 Karten darf am ersten Tag nur 10 davon zeigen. Die Reihenfolge neuer Karten folgt der Eingabe- bzw. Importreihenfolge, nicht dem Zufall.

Zeig auf dem Bildschirm „Heute" beide Zahlen getrennt: fällige Wiederholungen und neue Karten.

## Schritt 3: Deckformat festschreiben

Schreib `docs/deck-format.md` so, dass ich es einem anderen Chat vorlegen kann und der daraus gültige Dateien erzeugt. Es muss enthalten: das vollständige JSON-Schema mit allen Feldern und welche verpflichtend sind, die CSV-Spalten mit Trennzeichen und Kodierung, wie `cloze` notiert wird, wie Tags aussehen, und zwei vollständige Beispieldateien, die tatsächlich importierbar sind. Leg die Beispiele als echte Dateien unter `docs/beispiele/` ab.

Schreib dazu eine Prüffunktion, die eine Datei gegen das Schema validiert und verständliche Fehlermeldungen liefert — „Zeile 14: Feld back fehlt", nicht „undefined".

## Schritt 4: Importablauf

Ein Bildschirm „Importieren", erreichbar von Decks aus. Ablauf immer gleich, egal welches Format:

1. Datei über die iOS-Dateiauswahl wählen
2. Format automatisch erkennen, bei Mehrdeutigkeit fragen
3. Parsen und gegen das Schema prüfen
4. **Vorschau** — und zwar bevor irgendetwas geschrieben wird
5. Zieldeck wählen: bestehendes oder neues, Name aus der Datei vorbelegt
6. Bestätigen

Die Vorschau zeigt: wie viele Karten insgesamt, davon neu, wie viele Dubletten, wie viele fehlerhaft. Dazu die ersten zehn Karten im Klartext. Fehlerhafte Zeilen werden einzeln mit Grund aufgelistet und übersprungen, sie brechen den Import nicht ab.

Dublettenerkennung: gleiche Vorderseite und Rückseite im Zieldeck nach Normalisierung von Leerzeichen, Groß-/Kleinschreibung und Akzenten. Dubletten werden standardmäßig übersprungen, nicht überschrieben — der Lernfortschritt der vorhandenen Karte ist wertvoller als der Dateiinhalt.

Der eigentliche Schreibvorgang läuft in einer einzigen Transaktion. Bricht etwas ab, ist der Bestand unverändert. Das ist derselbe Punkt, den die Review in Phase 1 bei der Sicherung gefunden hat.

## Schritt 5: ZIP

Eine ZIP-Datei kann mehrere JSON- oder CSV-Dateien enthalten. Jede wird ein eigenes Deck, benannt nach dem Feld `deck.name` oder ersatzweise nach dem Dateinamen. Eine gemeinsame Vorschau über alle enthaltenen Dateien, eine gemeinsame Bestätigung. Unbekannte Dateien im Archiv werden stillschweigend ignoriert.

## Schritt 6: Decks aktivieren und pausieren

Ich arbeite mein Arbeitsbuch Tag für Tag durch. Karten zu Stoff, den ich noch nicht hatte, dürfen nicht auftauchen.

- Jedes Deck bekommt einen Schalter aktiv/inaktiv. Inaktive Decks liefern keine Karten in die Session, behalten aber ihren Zustand.
- Frisch importierte Decks sind standardmäßig inaktiv. Ausnahme: Der Import wurde ausdrücklich in ein bestehendes aktives Deck gemacht.
- Einzelne Karten lassen sich pausieren. Das Feld `suspended` gibt es bereits, es ist nur nicht bedienbar.

## Schritt 7: Deck exportieren

Umkehrung des Imports: ein einzelnes Deck als JSON im Deckformat über das Teilen-Blatt, ohne Lernzustand. Damit kann ich einen Stapel weitergeben oder ihn in einem Chat überarbeiten lassen. Das ist nicht dieselbe Funktion wie die Gesamtsicherung, verwechsle die beiden nicht.

## Schritt 8: Erinnerung an die Sicherung

Aus Phase 1 offen: Liegt die letzte Sicherung mehr als sieben Tage zurück, zeig auf „Heute" eine ruhige Zeile mit einem Knopf. Nicht während einer Session, kein Dialog, keine Farbe die schreit.

## Abnahme

Leg unter `docs/beispiele/` zusätzlich eine Testdatei mit 300 Karten an, damit ich das Verhalten unter Last selbst sehe. Schreib mir am Ende die Prüfliste zum Abarbeiten auf dem iPhone, dazu wie in den Phasen davor die Schritte in GitHub. Bau nichts weiter, bis ich bestätigt habe.

Die Prüfliste muss diese Punkte enthalten: Import einer JSON-Datei mit Vorschau; Import derselben Datei ein zweites Mal, alles wird als Dublette erkannt; Import einer absichtlich kaputten Datei, Bestand bleibt unverändert; Import der 300-Karten-Datei, danach zeigt „Heute" nur 10 neue Karten; ein inaktives Deck liefert keine Karten; Deckexport und Reimport.

## Umfang

Nur was hier steht. Keine Statistiken, keine Audioausgabe, keine Anbindung an Anki. Der Pendel-Modus ist Phase 3. Fällt dir etwas Sinnvolles auf, das fehlt, nenn es mir am Ende in drei Zeilen, statt es zu bauen.
