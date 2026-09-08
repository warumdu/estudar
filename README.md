# estudar

Meine Vokabelapp, um brasilianisches Portugiesisch offline mit Karteikarten zu lernen.
Eine installierbare Web-App (PWA): Sie liegt als Icon auf dem iPhone, läuft ohne
Internet und speichert allen Lernfortschritt nur auf dem Gerät.

**Stand: Phase 1 – nutzbarer Kern.** Karten anlegen, Decks verwalten, mit FSRS
terminierte Lernsessions, Sicherung als JSON-Datei. Import von Kartenstapeln (Phase 2)
und der Pendel-Modus mit Sprachausgabe (Phase 3) folgen; der vollständige Auftrag steht
in `AUFTRAG.md`, die Vorgaben dieser Phase in `docs/phase-1.md`.

Adresse der App: **https://warumdu.github.io/estudar/**

## Bedienung

Unten vier Reiter: **Heute · Decks · Karte · Einstellungen**. Die Lernsession öffnet
sich aus „Heute" und blendet die Reiter aus, bis sie beendet ist.

**Heute.** Die große Zahl ist, was heute zu lernen ist. „Lernen" startet die Session.
Darunter: wie viele Karten heute schon bewertet wurden und wann die nächste fällig wird.
Ist nichts fällig, steht das dort, und „Trotzdem üben" zeigt Karten ohne Wirkung auf
die Terminierung.

**Session.** Frage antippen (irgendwo) zeigt die Lösung. Dann vier Knöpfe:
**Nochmal · Schwer · Gut · Leicht**. Über jedem steht das Intervall, das er auslöst
(„in 10 Min.", „in 2 Tagen", „in 3 Wochen") – berechnet von ts-fsrs, nicht geschätzt.
Nach der Bewertung geht es sofort weiter. „Nochmal" und „Gut" bei neuen Karten sind
Lernschritte von 1 bzw. 10 Minuten: die Karte kommt in derselben Session noch einmal.
Bei Konjugationskarten (und auf Wunsch bei Vokabeln Deutsch→Portugiesisch) tippst du
die Antwort; über der Tastatur liegt eine Leiste mit **á à ã â é ê í ó ô õ ú ç**.
Akzente und Groß-/Kleinschreibung zählen nicht als Fehler, die Abweichung wird aber
rot markiert. Der Stift oben rechts öffnet die aktuelle Karte zum Bearbeiten, das ×
beendet die Session. Am Ende: Kartenzahl, Trefferquote, Dauer, „Sicherung jetzt".

**Decks.** Jedes Deck mit Kartenzahl und Fälligkeit. Antippen klappt die Karten auf;
dort: „+ Karte", „Umbenennen", „Löschen" (mit Rückfrage). Eine Karte antippen öffnet
sie zum Bearbeiten.

**Karte.** Deck, Typ (Vokabel, Lückentext, Konjugation, Satz), Vorder- und Rückseite,
optional Beispiel, Hinweis und Tags. Nach „Speichern" bleibt die Maske offen und leer,
Deck und Typ bleiben stehen – zehn Vokabeln am Stück, ohne zurückzunavigieren.
Bei Vokabeln erzeugt „beide Richtungen" zwei getrennt terminierte Karten, die nie am
selben Tag drankommen. Lückentexte schreibt man so: `Ontem eu {{c1::fui}} ao mercado.`
Im Deck-Auswahlfeld lässt sich mit „+ Neues Deck …" direkt ein Deck anlegen.

**Einstellungen.** Zielretention (Standard 0,90), Tageslimit für Wiederholungen
(Standard 40), Eingabefeld für Vokabeln DE→PT, Sicherung (Export/Import), Status der
App, Version und „Nach neuer Fassung suchen".

Beim ersten Start liegt ein Deck **„Probe (löschbar)"** mit 20 Karten bereit
(15 Vokabeln, 5 Lückentexte zum pretérito perfeito). Das ist Prüfmaterial. Nach dem
Löschen kommt es nicht wieder; der echte Wortschatz kommt in Phase 2 per Import.

### Terminierung

Der Wiederholungsalgorithmus ist **FSRS** über `ts-fsrs` 5.4.2 (unverändert unter
`vendor/`). Jede Bewertung landet mit Zeitstempel, Intervall davor und danach und Dauer
im Protokoll, damit die Parameter später auf meine Daten optimiert werden können.
Das Tageslimit gilt für Wiederholungen: Nach einer mehrtägigen Pause zeigt die App die
am längsten überfälligen zuerst und verteilt den Rest auf die Folgetage. Lernschritte
und neue Karten zählen nicht gegen das Limit.

## Wichtig zu wissen: iOS kann die Daten einer Web-App löschen

Eine Web-App speichert ihre Daten nur auf dem iPhone, im Speicherbereich der App
auf dem Home-Bildschirm. Drei Dinge können diese Daten löschen, jeweils ohne Warnung:

- **Speicherdruck.** Wird der Platz auf dem iPhone knapp, darf iOS die Daten von
  Web-Apps räumen.
- **Icon löschen.** Entfernst du das Icon vom Home-Bildschirm, sind alle Daten der
  App weg. Ein neues Icon startet leer.
- **Getrennte Speicher.** Die App vom Icon und dieselbe Seite im Safari-Tab haben
  jeweils eigene Daten. Was du in der App lernst, sieht Safari nicht, und umgekehrt.
  Deshalb immer nur die App vom Icon benutzen.

### Sicherungskonzept

„Sicherung exportieren" (Einstellungen) und „Sicherung jetzt" (Sessionende) schreiben
**eine JSON-Datei** mit allem: Decks, Karten, Lernzustände, Protokoll, Einstellungen.
Dateiname mit Datum, z. B. `estudar-sicherung-2026-09-08.json`. Auf dem iPhone öffnet
sich das Teilen-Blatt; wähle **„In Dateien sichern"** (iCloud Drive oder „Auf meinem
iPhone"). **Sichere nach jeder Lernsitzung, mindestens einmal pro Woche.**

„Sicherung importieren" liest so eine Datei, zeigt zuerst, wie viele Karten betroffen
sind, und bietet zwei Wege:

- **Zusammenführen** – Karten nach Kennung vereinigt, das jeweils Neuere gewinnt,
  Einstellungen bleiben. Für „Datei von gestern zurückspielen, ohne heute zu verlieren".
- **Ersetzen** – Decks, Karten, Zustände und Einstellungen kommen aus der Datei
  (mit Rückfrage). Für „Speicher war weg, alles wiederherstellen".

Das Protokoll wird in beiden Fällen nur ergänzt, nie gelöscht – auch nicht beim Löschen
einer Karte oder eines Decks.

## Was du auf dem iPad antippen musst

GitHub zeigt seine Oberfläche nur auf Englisch, deshalb stehen die Schaltflächen
hier im Original.

### A. Den Arbeitsstand in `main` übernehmen

1. Öffne https://github.com/warumdu/estudar in Safari.
2. Oben erscheint ein gelber Kasten „**claude/phase-1-core-o436z3** had recent pushes"
   mit dem Knopf **Compare & pull request**. Tippe darauf.
   Fehlt der Kasten: Reiter **Pull requests** → **New pull request** → bei
   „compare:" den Zweig `claude/phase-1-core-o436z3` wählen (bei „base:" bleibt `main`).
3. Tippe **Create pull request** (Titel kann bleiben). Erscheint danach ein
   Formular, dort noch einmal **Create pull request**.
4. Tippe **Merge pull request**, dann **Confirm merge**. Der Stand ist jetzt in `main`.
5. GitHub Pages ist seit Phase 0 eingeschaltet und baut die Seite in wenigen Minuten
   neu (Reiter **Actions** zeigt „pages build and deployment"; grüner Haken = fertig).

### B. Die neue Fassung aufs iPhone holen

6. Öffne die App vom Icon, **mit Internet**. Nach einigen Sekunden erscheint oben
   „Neue Fassung verfügbar – **Aktualisieren**". Tippe darauf; die App lädt einmal neu.
   Erscheint der Hinweis nicht: Einstellungen → **Nach neuer Fassung suchen**, oder
   die App schließen (nach oben wischen) und neu vom Icon starten.
7. In den Einstellungen muss bei **Version 0.1.0** stehen und bei **Offline: bereit ✓**.
   Erst dann ist die neue Fassung vollständig im Gerät und läuft auch im Flugmodus.

Liegt das Icon noch nicht auf dem iPhone: in Safari https://warumdu.github.io/estudar/
öffnen → **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**, dann die App einmal
mit Internet vom Icon starten, bis „Offline: bereit ✓" da steht.

### C. Prüfliste Phase 1 (auf dem iPhone, in der App vom Icon)

1. **Karte anlegen, App schließen, neu starten.** Reiter Karte → Deutsch und Português
   ausfüllen → Speichern. App nach oben wegwischen, vom Icon neu starten → Decks →
   Probe-Deck antippen: die Karte steht in der Liste.
2. **Session mit dem Probe-Deck bis zum Ende.** Heute → Lernen → jede Karte antippen,
   bewerten, bis die Zusammenfassung mit Kartenzahl, Trefferquote und Dauer erscheint.
   („Nochmal"/„Gut" bringen die Karte nach ein paar Karten noch einmal – das ist
   der Lernschritt, kein Fehler. „Leicht" schließt sie für heute ab.)
3. **Flugmodus.** Flugmodus an, App schließen, vom Icon starten, Heute → Lernen (oder
   „Trotzdem üben"), Lösung aufdecken, bewerten. Einstellungen zeigt „Offline: bereit ✓".
4. **Sicherung.** Einstellungen → Sicherung exportieren → im Teilen-Blatt „In Dateien
   sichern". Dann Decks → Probe-Deck → Löschen → bestätigen. Dann Einstellungen →
   Sicherung importieren → die Datei wählen → Vorschau lesen → **Ersetzen** →
   bestätigen. Decks zeigt das Probe-Deck wieder mit Lernfortschritt.
5. **Zielretention.** In einer Session das Intervall über „Gut" merken, Session beenden,
   Einstellungen → Zielretention auf 0,95 → Lernen: die Intervalle auf den Knöpfen sind
   kürzer.

Gib mir Bescheid, was klappt und was nicht. Bis dahin baue ich nicht weiter.

## Technik in Kürze

- **Kein Build-Schritt.** Die Dateien im Repository werden von GitHub Pages
  unverändert ausgeliefert. Vanilla JavaScript als ES-Module unter `app/`.
- **Kein CDN.** Bibliotheken liegen unter `vendor/` im Repository (siehe
  `vendor/README.md`); der Wiederholungsalgorithmus ist `ts-fsrs` 5.4.2, exakt gepinnt.
  Ein Test schlägt fehl, sobald irgendwo ein CDN-Verweis auftaucht.
- **Datenhaltung.** IndexedDB, Schema versioniert (`app/db.js`, `migrate()`), Speicher
  `cards`, `cardStates` (voller FSRS-Zustand), `reviews` (Protokoll), `settings`,
  dazu `decks` für die Decknamen.
- **Offline.** Der Service Worker (`sw.js`) legt die App-Hülle samt Modulen und ts-fsrs
  beim ersten Laden im Cache ab und beantwortet alle Anfragen zuerst daraus. Eine neue
  Fassung wird vorgeladen und erst nach Antippen von „Aktualisieren" aktiv – nie
  selbsttätig, nie während einer Session.
- **Tests** laufen nur in der Entwicklungs-VM mit Node (`npm test`): Scheduler,
  Antwortvergleich, Kartenmodell, Sicherung (Node), dazu die Bedienabläufe der
  Abnahmeliste, ein Offline-Test und der Update-Ablauf im Chromium, sowie Manifest,
  Service Worker, Vendor-Prüfsummen und der CDN-Wächter. Die App selbst braucht kein Node.

## Dateien

```
index.html             Die fünf Bildschirme (Heute, Session, Decks, Karte, Einstellungen)
app/main.js            Oberfläche, Session, Sicherung, Update-Hinweis
app/db.js              IndexedDB, Schema und Migration
app/scheduler.js       Anbindung an ts-fsrs, Klartext-Intervalle, Tagesliste
app/cards.js           Kartenmodell, Lückentext
app/compare.js         Toleranter Antwortvergleich
app/backup.js          Sicherung: Aufbau, Prüfung, Ersetzen/Zusammenführen
app/seed.js            Probe-Deck
app/style.css          Dunkles Design
manifest.webmanifest   App-Beschreibung für die Installation
sw.js                  Service Worker (Offline-Cache, Update auf Wunsch)
icons/                 App-Icons (SVG-Quelle und PNG-Fassungen)
vendor/                Bibliotheken, aus npm kopiert und gepinnt
scripts/               Hilfsskripte für die VM (vendor kopieren, Icons rendern)
tests/                 Node- und Browser-Tests
docs/phase-1.md        Vorgaben dieser Phase
AUFTRAG.md             Der vollständige Auftrag
```
