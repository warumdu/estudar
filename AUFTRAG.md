# Auftrag

Baue eine installierbare Offline-Karteikarten-App (PWA) für brasilianisches Portugiesisch. Sie liegt als Icon auf meinem iPhone, funktioniert ohne Internet, speichert allen Lernfortschritt lokal und importiert Kartenstapel aus Dateien.

# Ausgangslage — lies das zuerst, es bestimmt die gesamte Architektur

Ich habe keinen Computer. Nur ein iPad und ein iPhone. Ich kann kein Terminal öffnen, kein npm ausführen, keinen Entwicklungsserver starten und keine Datei lokal ansehen. Du arbeitest in Claude Code im Web gegen dieses GitHub-Repository, ich prüfe ausschließlich über die GitHub-Weboberfläche auf dem iPad und über die ausgelieferte Seite auf dem iPhone.

Daraus folgt zwingend:

- **Kein Build-Schritt.** Die App besteht aus Dateien, die GitHub Pages unverändert ausliefert. Kein Vite, kein Webpack, kein Bundler, keine TypeScript-Kompilierung, kein React mit JSX. Vanilla JavaScript als ES-Module, direkt im Browser lauffähig.
- **Keine CDN-Abhängigkeit zur Laufzeit.** Lade benötigte Bibliotheken einmal in der VM herunter und committe sie nach `vendor/`. Die App muss im Flugmodus vollständig laufen.
- **Auslieferung über GitHub Pages** aus `main`, Wurzelverzeichnis. `index.html` liegt im Repo-Stamm.
- Tests dürfen Node in deiner VM nutzen. Die App selbst darf es nicht brauchen.

Zum Nutzer: deutscher Muttersprachler, lernt brasilianisches Portugiesisch, Niveau A2, kein Entwickler. Bedienoberfläche Deutsch, Lerninhalte pt-BR. Es existieren zwei druckbare Arbeitsbuch-Module (A1 und A2 „O Passado"), je 14 Tage à zwei Seiten, je 10 Vokabeln pro Tag, plus nummerierte Fehlermuster und eine Fehlerliste. Die App ergänzt das Papier, sie ersetzt es nicht.

Nutzungsfenster: abends rund 25 Minuten, Autopendeln 45–55 Minuten je Richtung mit Händen am Lenkrad, Wachtage mit langen Leerläufen. Im Dienst ist das Handy oft nicht nutzbar. Mehrtägige Lücken sind der Normalfall, nicht die Ausnahme. Rein privater Gebrauch, kein Konto, keine weiteren Nutzer.

# Phase 0 — zuerst, bevor irgendetwas gebaut wird

Lege eine minimale `index.html`, `manifest.webmanifest`, `sw.js` und ein Icon-Set an, sodass eine Seite mit dem Wort „Hallo" auf dem iPhone zum Home-Bildschirm hinzugefügt werden kann. Schreib mir dann in nummerierten Schritten, was ich in der GitHub-Weboberfläche antippen muss, um GitHub Pages zu aktivieren, und nenne mir die entstehende Adresse. Warte auf meine Bestätigung, dass das Icon auf dem iPhone liegt. Baue nicht weiter, bevor das steht.

# Terminierung

Schreib den Wiederholungsalgorithmus nicht selbst. Nutze FSRS (DSR-Modell aus Difficulty, Stability, Retrievability) über `ts-fsrs` in einer Fassung, die als ES-Modul ohne Build lauffähig ist; ist das nicht möglich, nenn mir die Alternative, bevor du sie einbaust. Vier Bewertungsknöpfe (Again / Hard / Good / Easy), Zielretention 0,90 als änderbarer Standard. Schreib jede Bewertung mit Zeitstempel in ein Review-Log, damit die Parameter später auf meine Daten nachoptimiert werden können.

# Datenformat

Lege genau ein kanonisches Importformat fest und dokumentiere es in `docs/deck-format.md`, damit ich in einem anderen Chat passende Dateien erzeugen lassen kann:

```json
{
  "schema": "flashdeck/1",
  "deck": { "name": "Módulo 2 · Dia 03", "front_lang": "de-DE", "back_lang": "pt-BR", "tags": ["modulo2", "dia03"] },
  "cards": [
    { "id": "m2d03-001", "type": "vocab", "front": "der Schlaf", "back": "o sono", "example": "O sono também é treino.", "tags": ["substantiv"] },
    { "id": "m2d03-002", "type": "cloze", "text": "Ontem eu {{c1::fui}} para o trabalho.", "note": "ir · pretérito perfeito" },
    { "id": "m2d03-003", "type": "conjugation", "prompt": "falar · pretérito perfeito · nós", "answer": "falamos" }
  ]
}
```

Unterstützte Uploads über die iOS-Dateiauswahl: dieses JSON, CSV/TSV (`front;back;type;tags;example`), XLSX (erste Tabelle, gleiche Spalten), ZIP (mehrere der genannten Dateien). PDF nur als Notlösung mit reiner Textextraktion und Pflichtvorschau, kein Deuten von Layout. Jeder Import zeigt zuerst eine Vorschau, prüft Dubletten gegen den Bestand und speichert erst danach.

# Kartentypen

`vocab` (DE↔PT, beide Richtungen getrennt anlegbar) · `cloze` (Lücke mit `{{c1::…}}`) · `conjugation` (Verb + Zeit + Person → Form, Tastatureingabe) · `sentence` (ganzer Satz aus meinen eigenen Texten). Bei Tastatureingabe Akzente und Groß-/Kleinschreibung tolerant vergleichen, die Abweichung aber farbig markieren (`está` gegen `esta`).

# Weitere Phasen

**Phase 1 — nutzbarer Kern.** Datenmodell in IndexedDB, FSRS angebunden, Lernsession, Karten anlegen und bearbeiten, Decks, vollständiger JSON-Export und -Import als Sicherung.

**Phase 2 — Import.** JSON, CSV, XLSX, ZIP mit Vorschau und Dublettenprüfung.

**Phase 3 — Pendel-Modus.** Audio-Session ohne Hinsehen: Karte wird vorgelesen, einstellbare Pause, dann die Lösung. Bewertung über eine bildschirmfüllende Trefferfläche oder automatisch „Good", wenn nichts kommt. **Prüfe zu Beginn dieser Phase zwei Dinge und berichte mir das Ergebnis, bevor du baust:** ob auf iOS eine pt-BR-Stimme verfügbar ist, und ob die Sprachausgabe bei gesperrtem Bildschirm weiterläuft. Läuft sie nicht weiter, schlag mir genau eine Alternative vor. Diese Phase ist der eigentliche Hebel der App, kein Beiwerk.

**Phase 4 — Auswertung.** Fälligkeitsvorschau für 14 Tage, Trefferquote, Leech-Erkennung bei mehrfachem „Again", Export der Leeches als Textdatei für den Arbeitsbuch-Chat.

Arbeite Phase für Phase. Nach jeder Phase: Branch schieben, Tests ausführen und Ergebnis nennen, mir in nummerierten Schritten sagen, was ich auf dem iPad antippen muss, und auf meine Bestätigung warten.

# Qualitätskriterien

- Datenverlust ist der einzige nicht hinnehmbare Fehler. Sicherung als JSON-Datei bei Sessionende und auf Knopfdruck, ablegbar über die iOS-Dateiauswahl, dazu in den Einstellungen ein klarer Hinweis, wie oft ich sichern soll und warum.
- Nach dem ersten Laden vollständig offline lauffähig, auch im Flugmodus.
- Nach mehrtägiger Pause keine Lawine: Tageslimit für Wiederholungen, Standard 40, Rückstand über mehrere Tage verteilt.
- Einhändig bedienbar, große Trefferflächen, dunkles Design als Standard.
- Unter 100 ms Antwortzeit pro Karte bei 5.000 Karten im Bestand.

# Nicht-Ziele

Kein Konto, kein Login, keine Cloud-Synchronisation, kein Server, keine Werbung, kein App-Store-Paket, keine `.apkg`-Erzeugung, keine KI-Anbindung in der App selbst, keine Analytics. Baue keine Funktion, die oben nicht steht.

# Risiken, ausdrücklich behandeln

- iOS kann den Speicher einer Web-App verwerfen. Erklär mir im README in einfachen Worten, was das konkret bedeutet und wie die Sicherung dagegen wirkt.
- Kommt eine Bibliothek nicht ohne Build aus, halt an und nenn mir die Alternative. Bau nicht heimlich einen Build-Schritt ein.

# Abbruchbedingung

Trifft eine Annahme nicht zu, halt an, sag es mir in einem Satz und schlag genau eine Alternative vor. Bau nicht auf einer falschen Annahme weiter.

# Ausgabe

`README.md` mit Bedienung, Sicherungskonzept und den Schritten, die ich auf dem iPad selbst ausführen muss. `docs/deck-format.md`. Tests für Scheduler und Import. Alles auf Deutsch.
