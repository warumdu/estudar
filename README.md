# estudar

Meine Vokabelapp, um brasilianisches Portugiesisch offline mit Karteikarten zu lernen.
Eine installierbare Web-App (PWA): Sie liegt als Icon auf dem iPhone, läuft ohne
Internet und speichert allen Lernfortschritt nur auf dem Gerät.

**Stand: Phase 2 – Import.** Kartenstapel als JSON oder CSV importieren, mit Vorschau
und Dublettenprüfung; Tageslimit für neue Karten; Decks aktiv/inaktiv schalten; Karten
pausieren; ein Deck als Datei exportieren; Erinnerung an die Sicherung; mehrere Decks in
einer Sammeldatei; Decks nach Namen gruppiert. ZIP, XLSX und PDF sind bewusst nicht
eingebaut (Entscheidung zu `docs/phase-2.md`, Schritt 1: keine Bibliotheken, ZIP durch
die Sammeldatei ersetzt). Der Pendel-Modus
mit Sprachausgabe ist Phase 3. Der vollständige Auftrag steht in `AUFTRAG.md`, die
Vorgaben der Phasen in `docs/phase-1.md` und `docs/phase-2.md`, das Dateiformat für
Kartenstapel in `docs/deck-format.md`.

Adresse der App: **https://warumdu.github.io/estudar/**

## Bedienung

Unten vier Reiter: **Heute · Decks · Karte · Einstellungen**. Die Lernsession öffnet
sich aus „Heute" und blendet die Reiter aus, bis sie beendet ist.

**Heute.** Die große Zahl ist, was heute zu lernen ist. „Lernen" startet die Session.
Darunter getrennt: **fällige Wiederholungen** und **neue Karten** (jeweils „10 von 300",
wenn das Tageslimit greift), wie viele Karten heute schon bewertet wurden und wann die
nächste fällig wird. Ist nichts fällig, steht das dort, und „Trotzdem üben" zeigt Karten
ohne Wirkung auf die Terminierung. Liegt die letzte Sicherung mehr als sieben Tage
zurück, steht hier eine ruhige Zeile mit dem Knopf „Jetzt sichern".

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

**Decks.** Jedes Deck mit Kartenzahl und Fälligkeit und einem **Schalter aktiv/inaktiv**.
Ein inaktives Deck liefert keine Karten in die Session, behält aber seinen Lernzustand –
so bleibt Stoff, den du im Arbeitsbuch noch nicht hattest, außen vor. Beim Einschalten
steht ein ruhiger Satz, wenn mehr neue Karten drin sind als das Tageslimit: „300 neue
Karten, bei 10 pro Tag rund 30 Tage." Decks, deren Name ein „ · " enthält, stehen
**gruppiert** unter dem Teil davor („Módulo 2 · Dia 01" unter „Módulo 2"), zusammenklappbar,
mit Kartenzahl und Fälligkeit in der Kopfzeile und einem Schalter, der alle Decks der
Gruppe auf einmal ein- oder ausschaltet. Decks ohne Trennzeichen stehen einzeln darüber.
Antippen klappt
die Karten auf; dort: „+ Karte", „Umbenennen", „Exportieren", „Löschen" (mit Rückfrage).
Eine Karte antippen öffnet sie zum Bearbeiten; pausierte Karten sind durchgestrichen
mit ⏸. Oben rechts: **Importieren**.

**Importieren.** Datei wählen (JSON oder CSV im Deckformat, siehe `docs/deck-format.md`).
Die App erkennt das Format am Inhalt, fragt bei unklarem Trennzeichen nach, prüft jede
Karte und zeigt **erst eine Vorschau**: Einträge in der Datei, davon neu, Dubletten,
fehlerhaft, dazu die ersten zehn Karten im Klartext und jede fehlerhafte Zeile mit Grund
(„Zeile 14: Feld back fehlt"). Fehlerhafte Zeilen werden übersprungen, sie brechen den
Import nicht ab. Zieldeck: neues Deck (Name aus der Datei vorbelegt) oder ein bestehendes.
Dubletten – gleiche Vorder- und Rückseite im Zieldeck, ohne Rücksicht auf Leerzeichen,
Groß-/Kleinschreibung und Akzente – werden übersprungen, nie überschrieben. Dazu steht,
wie viele der neuen Karten es schon in einem anderen Deck gibt (mit dessen Namen); die
werden trotzdem importiert. Eine **Sammeldatei** mit mehreren Decks (`decks`-Liste, siehe
`docs/deck-format.md`) zeigt je Deck eine Zeile und eine Gesamtsumme, eine Bestätigung,
eine Transaktion; alle Decks daraus starten inaktiv. Der
Schreibvorgang ist eine einzige Transaktion: bricht etwas ab, bleibt der Bestand wie er
war. Ein neu angelegtes Deck ist zunächst **inaktiv**; importierst du in ein bestehendes
aktives Deck, bleibt es aktiv.

**Exportieren.** In den Deck-Aktionen: ein einzelnes Deck als JSON im Deckformat über das
Teilen-Blatt, ohne Lernzustand – zum Weitergeben oder um es in einem Chat überarbeiten zu
lassen. Das ist **nicht** die Sicherung (die liegt in den Einstellungen und enthält alles).

**Karte.** Deck, Typ (Vokabel, Lückentext, Konjugation, Satz), Vorder- und Rückseite,
optional Beispiel, Hinweis und Tags. Nach „Speichern" bleibt die Maske offen und leer,
Deck und Typ bleiben stehen – zehn Vokabeln am Stück, ohne zurückzunavigieren.
Bei Vokabeln erzeugt „beide Richtungen" zwei getrennt terminierte Karten, die nie am
selben Tag drankommen. Lückentexte schreibt man so: `Ontem eu {{c1::fui}} ao mercado.`
Im Deck-Auswahlfeld lässt sich mit „+ Neues Deck …" direkt ein Deck anlegen. Beim
Bearbeiten gibt es „Karte pausiert": Die Karte kommt nicht mehr in die Session, bis du
den Haken entfernst; ihr Zustand bleibt.

**Einstellungen.** Zielretention (Standard 0,90), Tageslimit für Wiederholungen
(Standard 40), **neue Karten pro Tag** (Standard 10), Eingabefeld für Vokabeln DE→PT,
Sicherung (Export/Import), Status der App, Version und „Nach neuer Fassung suchen".

Beim ersten Start liegt ein Deck **„Probe (löschbar)"** mit 20 Karten bereit
(15 Vokabeln, 5 Lückentexte zum pretérito perfeito). Das ist Prüfmaterial. Nach dem
Löschen kommt es nicht wieder; der echte Wortschatz kommt per Import.

### Terminierung

Der Wiederholungsalgorithmus ist **FSRS** über `ts-fsrs` 5.4.2 (unverändert unter
`vendor/`). Jede Bewertung landet mit Zeitstempel, Intervall davor und danach und Dauer
im Protokoll, damit die Parameter später auf meine Daten optimiert werden können.
Das Tageslimit gilt für Wiederholungen: Nach einer mehrtägigen Pause zeigt die App die
am längsten überfälligen zuerst und verteilt den Rest auf die Folgetage. Lernschritte
zählen nicht gegen das Limit. **Neue Karten** haben ein eigenes Limit (Standard 10 pro
Tag) und kommen in Eingabe- bzw. Importreihenfolge, nie zufällig: Ein Import von
300 Karten zeigt am ersten Tag nur 10 davon.

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
2. Oben erscheint ein gelber Kasten „**claude/phase-2-import-obkclr** had recent pushes"
   mit dem Knopf **Compare & pull request**. Tippe darauf.
   Fehlt der Kasten: Reiter **Pull requests** → **New pull request** → bei
   „compare:" den Zweig `claude/phase-2-import-obkclr` wählen (bei „base:" bleibt `main`).
3. Tippe **Create pull request** (Titel kann bleiben). Erscheint danach ein
   Formular, dort noch einmal **Create pull request**.
4. Tippe **Merge pull request**, dann **Confirm merge**. Der Stand ist jetzt in `main`.
5. GitHub Pages baut die Seite in wenigen Minuten neu (Reiter **Actions** zeigt
   „pages build and deployment"; grüner Haken = fertig).

### B. Die neue Fassung aufs iPhone holen

6. Öffne die App vom Icon, **mit Internet**. Nach einigen Sekunden erscheint oben
   „Neue Fassung verfügbar – **Aktualisieren**". Tippe darauf; die App lädt einmal neu.
   Erscheint der Hinweis nicht: Einstellungen → **Nach neuer Fassung suchen**, oder
   die App schließen (nach oben wischen) und neu vom Icon starten.
7. In den Einstellungen muss bei **Version 0.2.0** stehen und bei **Offline: bereit ✓**.
   Erst dann ist die neue Fassung vollständig im Gerät und läuft auch im Flugmodus.
   Dein Bestand aus Phase 1 bleibt dabei erhalten; die neue Einstellung „neue Karten
   pro Tag" steht auf 10.

### C. Die Beispieldateien auf das iPhone holen

Die Dateien liegen im Repository unter `docs/beispiele/` und werden von GitHub Pages
mit ausgeliefert. Je Datei in **Safari auf dem iPhone**:

8. Adresse öffnen, z. B. https://warumdu.github.io/estudar/docs/beispiele/beispiel-vokabeln.json
   (ebenso `beispiel-sammeldatei.json`, `test-300-karten.json`, `kaputt.json`,
   `teils-fehlerhaft.csv`, `beispiel-vokabeln.csv`).
9. Safari fragt „Möchtest du … laden?" → **Laden**. Die Datei liegt danach in
   **Dateien → Downloads**. Zeigt Safari den Text stattdessen direkt an: Teilen-Symbol →
   **In Dateien sichern**.

### D. Prüfliste Phase 2 (auf dem iPhone, in der App vom Icon)

1. **Import einer JSON-Datei mit Vorschau.** Decks → Importieren → Datei wählen →
   `beispiel-vokabeln.json`. Die Vorschau zeigt 14 Einträge, 16 neue Karten (zwei sind
   in beide Richtungen), 0 Dubletten, 0 fehlerhaft, die ersten zehn Karten im Klartext,
   Zieldeck „Neues Deck" mit dem Namen „Beispiel · Módulo 2 · Dia 03". Tippe
   **16 Karten importieren**. Unter Decks steht das Deck mit „16 Karten · inaktiv" und
   ausgeschaltetem Schalter. „Heute" hat sich nicht verändert.
2. **Dieselbe Datei ein zweites Mal.** Importieren → dieselbe Datei → bei Zieldeck
   „Beispiel · Módulo 2 · Dia 03" wählen: 0 neue, 16 Dubletten, der Knopf sagt
   „Nichts zu importieren". Abbrechen.
3. **Absichtlich kaputte Datei.** Importieren → `kaputt.json`: rote Meldung „kein gültiges
   JSON – vermutlich abgeschnitten", keine Vorschau, nichts wurde geschrieben (Decks
   unverändert). Dann `teils-fehlerhaft.csv`: Vorschau mit 6 Einträgen, 2 neue,
   4 fehlerhaft, jede Fehlerzeile mit Grund („Zeile 3: Feld back fehlt" …). Import legt
   ein Deck „teils-fehlerhaft" mit 2 Karten an.
4. **300 Karten.** Importieren → `test-300-karten.json` → 300 neue → importieren. Decks →
   Schalter bei „Test · 300 Karten (löschbar)" einschalten; alle anderen Decks für diesen
   Test ausschalten (sonst kommen deren neue Karten zuerst, weil sie älter sind). Heute
   zeigt bei „Neue Karten" **10 von 300**. Lernen: die erste Karte ist „der Montag", dann
   „der Dienstag" – Dateireihenfolge, nicht Zufall. Einstellungen → „Neue Karten pro Tag"
   auf 25: Heute zeigt 25 (minus die heute schon bewerteten). Wieder auf 10 stellen,
   die anderen Decks wieder einschalten.
5. **Inaktives Deck.** Decks → Schalter bei „Test · 300 Karten" ausschalten → Heute zeigt
   die Karten dieses Decks nicht mehr (bei sonst leerem Bestand: „Nichts fällig", ohne
   „Trotzdem üben"). Einschalten → sie sind wieder da, der Fortschritt der schon
   bewerteten Karten ist erhalten.
6. **Deckexport und Reimport.** Decks → „Beispiel · Módulo 2 · Dia 03" antippen →
   **Exportieren** → im Teilen-Blatt „In Dateien sichern" (Datei
   `deck-beispiel-modulo-2-dia-03.json`). Dann Importieren → diese Datei wählen: 14
   Einträge, 16 neue gegen ein neues Deck; wählst du als Zieldeck das Beispiel-Deck, sind
   es 16 Dubletten. Importiere in ein neues Deck „Kopie" – 16 Karten, inaktiv.
7. **Karte pausieren.** Decks → ein Deck aufklappen → Karte antippen → „Karte pausiert"
   ankreuzen → Speichern. In der Liste ist sie durchgestrichen mit ⏸, in der Session
   kommt sie nicht. Haken entfernen → sie ist wieder dabei.
8. **Erinnerung an die Sicherung.** Sie erscheint auf „Heute" als ruhige Zeile mit „Jetzt
   sichern", sobald die letzte Sicherung mehr als sieben Tage zurückliegt (oder es noch
   nie eine gab und schon Bewertungen vorliegen). Zum Prüfen jetzt: Ist deine letzte
   Sicherung aus Phase 1 älter als sieben Tage, steht die Zeile schon da; „Jetzt sichern"
   → Teilen-Blatt → die Zeile verschwindet.

9. **Sammeldatei mit drei Decks.** Importieren → `beispiel-sammeldatei.json`. Die
   Vorschau zeigt „Decks in der Datei" mit drei Zeilen (Dia 01: 5 neue, Dia 02: 3, Dia 03: 3)
   und der Summe 11 neue Karten, kein Zieldeck zur Auswahl. Bestätigen → unter Decks steht
   eine Gruppe „Beispiel-Modul" mit „3 Decks · 11 Karten · 0 fällig · inaktiv"; aufklappen
   zeigt „Dia 01", „Dia 02", „Dia 03", alle inaktiv.
10. **Gruppe per Schalter aktivieren.** Schalter in der Kopfzeile „Beispiel-Modul" → alle
    drei Decks werden aktiv, die Kopfzeile zeigt „11 fällig". Wieder ausschalten → alle
    drei inaktiv. Ein einzelnes Deck darin einschalten → Kopfzeile „1 von 3 aktiv".
11. **Einzeldatei unverändert.** Importieren → `beispiel-vokabeln.json` noch einmal in ein
    neues Deck „Einzel": Vorschau wie in Punkt 1, dazu die Zeile „Schon in einem anderen
    Deck: 16 (zuerst in „Beispiel · Módulo 2 · Dia 03")" – die Karten werden trotzdem
    importiert.

Danach Aufräumen nach Belieben: Die Decks „Test · 300 Karten (löschbar)", „Kopie",
„Einzel", „teils-fehlerhaft" und die Gruppe „Beispiel-Modul" kannst du löschen.

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
- **Deckformat.** `flashdeck/1`, beschrieben in `docs/deck-format.md`; Prüffunktion,
  CSV-Leser, Dublettenerkennung und Export in `app/deckformat.js`. Importe schreiben
  mit `add()` in einer Transaktion: ein Schlüssel, den es schon gibt, lässt den ganzen
  Import scheitern statt etwas zu überschreiben.
- **Tests** laufen nur in der Entwicklungs-VM mit Node (`npm test`): Scheduler,
  Antwortvergleich, Kartenmodell, Sicherung, Deckformat samt Beispieldateien (Node), dazu
  die Bedienabläufe der Abnahmelisten aus Phase 1 und 2, ein Offline-Test und der
  Update-Ablauf im Chromium, sowie Manifest, Service Worker, Vendor-Prüfsummen und der
  CDN-Wächter. Die App selbst braucht kein Node.

## Dateien

```
index.html             Die Bildschirme (Heute, Session, Decks, Importieren, Karte, Einstellungen)
app/main.js            Oberfläche, Session, Import, Export, Sicherung, Update-Hinweis
app/db.js              IndexedDB, Schema und Migration
app/scheduler.js       Anbindung an ts-fsrs, Klartext-Intervalle, Tagesliste, beide Tageslimits
app/cards.js           Kartenmodell, Lückentext
app/compare.js         Toleranter Antwortvergleich
app/backup.js          Sicherung: Aufbau, Prüfung, Ersetzen/Zusammenführen, Erinnerung
app/deckformat.js      Deckformat flashdeck/1: Prüfen, JSON/CSV lesen, Dubletten, Export
app/seed.js            Probe-Deck
app/style.css          Dunkles Design
manifest.webmanifest   App-Beschreibung für die Installation
sw.js                  Service Worker (Offline-Cache, Update auf Wunsch)
icons/                 App-Icons (SVG-Quelle und PNG-Fassungen)
vendor/                Bibliotheken, aus npm kopiert und gepinnt
scripts/               Hilfsskripte für die VM (vendor kopieren, Icons rendern)
tests/                 Node- und Browser-Tests
docs/deck-format.md    Das Dateiformat für Kartenstapel – für andere Chats gedacht
docs/beispiele/        Importierbare Beispieldateien, Sammeldatei, 300-Karten-Testdatei, zwei kaputte
docs/phase-1.md        Vorgaben der Phase 1
docs/phase-2.md        Vorgaben der Phase 2
AUFTRAG.md             Der vollständige Auftrag
```
