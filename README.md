# estudar

Meine Vokabelapp, um brasilianisches Portugiesisch offline mit Karteikarten zu lernen.
Eine installierbare Web-App (PWA): Sie liegt als Icon auf dem iPhone, läuft ohne
Internet und speichert allen Lernfortschritt nur auf dem Gerät.

**Stand: Phase 3, Teil A – Diagnose für den Fahrmodus, Nachmessung (0.2.3).** Bevor der
Fahrmodus gebaut wird, misst eine Prüfseite auf dem iPhone, was das Gerät kann: welche
Stimmen es gibt (pt-BR, de-DE), ob die Sprachausgabe im Auto über CarPlay läuft, ob das
Wake Lock den Bildschirm anlässt und ob die Ausgabe im Dauerbetrieb durchhält. Erste
Messung (iOS 18.7): je eine pt-BR- und de-DE-Stimme, beide nur „super-compact"; Dauertest
sauber; **der Ton kam aus dem Telefon, nicht aus CarPlay** – auch nicht mit stillem Audio
oder Audiositzung „playback". Fassung 0.2.3 misst deshalb nach: Stimmliste neu einlesen
und Stimme wählen (kommen die nachgeladenen enhanced/premium-Stimmen an?) und eine echte
Audiodatei über ein `<audio>`-Element (erreicht die das Auto, die Sprachsynthese aber
nicht?). Der Fahrmodus selbst (Teil B) kommt erst nach diesem Ergebnis. Alles aus den Phasen 1 und 2 bleibt: Lernen
mit FSRS, Decks, Import mit Vorschau, Sicherung. ZIP, XLSX und PDF sind bewusst nicht
eingebaut (Entscheidung zu `docs/phase-2.md`, Schritt 1). Der vollständige Auftrag steht
in `AUFTRAG.md`, die Vorgaben der Phasen in `docs/phase-1.md`, `docs/phase-2.md` und
`docs/phase-3.md`, das Dateiformat für Kartenstapel in `docs/deck-format.md`.

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

## Diagnose für den Fahrmodus (Phase 3, Teil A)

Der Fahrmodus soll Karten vorlesen, während das iPhone auf der Ladeschale liegt und der
Ton über CarPlay läuft. Ob das geht, entscheidet das Gerät, nicht der Code – deshalb
gibt es zuerst eine Prüfseite: **Einstellungen → „Diagnose für den Fahrmodus"** (oder
direkt https://warumdu.github.io/estudar/diagnose.html in Safari). Sie ändert nichts an
den Karten und zeigt, nummeriert wie in `docs/phase-3.md`:

1. **Stimmen** – alle pt-BR- und de-DE-Stimmen untereinander, jede mit vollständiger
   Kennung (an ihr erkennt man die Fassung: super-compact / compact / enhanced / premium),
   Auswahlknopf und ▶ Hörprobe. Die Wahl bleibt gespeichert und gilt für Testsätze,
   Dauertest und später den Fahrmodus; ★ ist die Stimme, die die App von sich aus nähme.
   Als letzte Wahl je Sprache „Systemstimme": keine Stimme setzen, nur die Sprache – iOS
   nimmt dann die unter Bedienungshilfen → Gesprochene Inhalte ausgewählte Stimme.
   **Stimmliste neu einlesen** ruft `getVoices()` erneut auf und protokolliert Anzahl und
   geänderte Kennungen; dasselbe passiert bei jedem `voiceschanged`-Ereignis und bei jeder
   Rückkehr in die Seite. Alle übrigen Stimmen stehen aufklappbar darunter. Fehlt pt-BR,
   steht dort, wie du die Stimme in den iOS-Einstellungen nachlädst.
2. **Testsätze** – ein portugiesischer Satz mit der gewählten pt-BR-Stimme, ein deutscher
   mit der gewählten de-DE-Stimme, Sprechtempo 0,8 / 0,9 / 1,0.
3. **Wake Lock** – anfordern; die Seite sagt, ob es geklappt hat. iOS gibt die Sperre beim
   Wechsel in den Hintergrund frei; die Seite fordert sie bei der Rückkehr automatisch
   neu an und protokolliert das Ergebnis.
4. **Zustand (live)** – Sprachausgabe (spricht / pausiert / wartet / beendet), sichtbare
   Höhe, Wake Lock, stilles Audio, Audiositzung.
5. **Dauertest** – zehn Sätze im Abstand von fünf Sekunden (oder sechzig, fünf Minuten),
   abwechselnd Deutsch und Portugiesisch, jeder mit seiner Nummer.
6. **Falls der Ton nicht über CarPlay kommt** – zwei Schalter zum Ausprobieren: ein
   stilles Audioelement in Schleife (hält die Audiositzung offen) und, wo iOS es anbietet,
   die Audiositzung auf „playback". (Erste Messung: beides ohne Wirkung.)
7. **Ton im Auto: Datei über `<audio>`** – prüft die Hypothese, dass iOS die
   Sprachsynthese nicht nach CarPlay leitet, eine echte Audiodatei über ein
   `<audio>`-Element aber schon. Die Datei `audio/testton.wav` (drei Töne und ein
   Akkord, 3 s) ist in der VM ohne Bibliothek erzeugt (`npm run tone`,
   `scripts/make-tone.js`) und liegt im Offline-Cache. **Datei über `<audio>` abspielen**
   protokolliert `play()`, die Ereignisse (playing, pause, ended, error) und die
   Zustandsangaben des Elements; die Media-Session-Angaben (Titel „estudar Testton",
   Interpret „estudar Diagnose") sind gesetzt, damit die App in der Wiedergabeansicht
   von CarPlay erscheint – Play/Pause von dort steht im Protokoll als „vom System".
   **Beides nacheinander** spielt erst die Datei und spricht dann denselben Inhalt
   („Eins, zwei, drei") mit der gewählten de-DE-Stimme.

Alles landet mit Zeitstempel im **Protokoll** unten auf der Seite. Es bleibt auf dem
Gerät gespeichert, auch wenn die Seite neu lädt; „Teilen" schickt es als Text (z. B. in
Notizen), „Kopieren" legt es in die Zwischenablage.

Was dahinter steckt: Jede Äußerung wartet auf das end-Ereignis der Sprachausgabe.
Bleibt es aus, geht es nach einer Frist trotzdem weiter (Watchdog, im Protokoll
sichtbar). Der Dauertest rechnet mit Zeitstempeln, nicht mit aufaddierten Pausen, und
zeigt je Satz die Abweichung vom Plan. Beides sind die Bausteine, die der Fahrmodus in
Teil B braucht.

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
sich das Teilen-Blatt mit genau dieser einen Datei; wähle **„In Dateien sichern"**
(iCloud Drive oder „Auf meinem iPhone"). **Sichere nach jeder Lernsitzung, mindestens
einmal pro Woche.**

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
2. Oben erscheint ein gelber Kasten „**claude/modest-heisenberg-y07o0e** had recent pushes"
   mit dem Knopf **Compare & pull request**. Tippe darauf.
   Fehlt der Kasten: Reiter **Pull requests** → **New pull request** → bei
   „compare:" den Zweig `claude/modest-heisenberg-y07o0e` wählen (bei „base:" bleibt `main`).
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
7. In den Einstellungen muss bei **Version 0.2.3** stehen und bei **Offline: bereit ✓**.
   Darunter steht der Knopf **Diagnose für den Fahrmodus**. Dein Bestand bleibt
   unverändert.

### C. Die Beispieldateien auf das iPhone holen

Die Dateien liegen im Repository unter `docs/beispiele/` und werden von GitHub Pages
mit ausgeliefert. Je Datei in **Safari auf dem iPhone**:

8. Adresse öffnen, z. B. https://warumdu.github.io/estudar/docs/beispiele/beispiel-vokabeln.json
   (ebenso `beispiel-sammeldatei.json`, `test-300-karten.json`, `kaputt.json`,
   `teils-fehlerhaft.csv`, `beispiel-vokabeln.csv`).
9. Safari fragt „Möchtest du … laden?" → **Laden**. Die Datei liegt danach in
   **Dateien → Downloads**. Zeigt Safari den Text stattdessen direkt an: Teilen-Symbol →
   **In Dateien sichern**.

### D. Nachmessung: Stimmen und Ton im Auto (Phase 3, Teil A, Fassung 0.2.3)

Die erste Messung ist erledigt (Ergebnis oben unter „Stand"). Jetzt zwei Fragen, in der
App vom Icon (Einstellungen → „Diagnose für den Fahrmodus"):

**Zu Hause, zwei Minuten – Stimmen:**

1. Diagnose öffnen, unter **1 · Stimmen** auf **Stimmliste neu einlesen** tippen. Im
   Protokoll steht je pt-BR- und de-DE-Stimme eine Zeile mit der vollständigen Kennung.
2. Steht dort eine Kennung mit `enhanced` oder `premium` (z. B.
   `com.apple.voice.enhanced.pt-BR.Luciana`)? Dann diese Fassung antippen (Häkchen),
   ▶ Hörprobe, fertig – die Wahl bleibt gespeichert.
3. Steht nur `super-compact`: einmal die Zeile **Systemstimme für pt-BR** mit ▶ anhören
   (iOS wählt dann die Stimme aus Bedienungshilfen → Gesprochene Inhalte selbst). Klingt
   sie deutlich besser als Luciana super-compact, wähle sie. Dann in die iOS-Einstellungen
   (Bedienungshilfen → Gesprochene Inhalte → Stimmen → Portugiesisch), prüfen, dass
   Luciana (Enhanced) dort als geladen und ausgewählt steht, zurück in die App,
   **Stimmliste neu einlesen** – die Rückkehr liest ohnehin nach, das Protokoll sagt
   „Kennungen unverändert" oder „GEÄNDERT".
4. Mir schicken: die Protokollzeilen der pt-BR- und de-DE-Stimmen (Kennungen) und ob die
   Systemstimme anders klang.

**Im stehenden Auto, vier Fälle in dieser Reihenfolge – je Fall: Woher kam der Ton?**

- **A) CarPlay verbunden, Sprachausgabe:** unter 2 **Portugiesisch sprechen**.
  Auto oder Telefon?
- **B) CarPlay verbunden, Datei über `<audio>`:** unter 7 **Datei über `<audio>`
  abspielen** (drei Töne). Auto oder Telefon? Erscheint „estudar Testton" in der
  CarPlay-Wiedergabeansicht? Danach **Beides nacheinander**: kommen Töne und Sprache
  aus derselben Quelle?
- **C) CarPlay getrennt (Kabel ab bzw. CarPlay am Auto aus), iPhone nur als
  Bluetooth-Audiogerät verbunden, Sprachausgabe:** wieder **Portugiesisch sprechen**.
  Auto oder Telefon?
- **D) CarPlay getrennt, Bluetooth, Datei über `<audio>`:** wieder **Datei über
  `<audio>` abspielen**. Auto oder Telefon?

Danach **Protokoll → Teilen** und mir je Fall ein Wort: Auto oder Telefon. Bis dahin
baue ich Teil B nicht.

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
- **Sprachausgabe.** Web Speech API des Browsers (`speechSynthesis`), keine Bibliothek.
  `app/speech.js` bewertet Stimmen (genaue Region, lokal, Qualität, Spaßstimmen zuletzt),
  merkt sich eine gewählte Kennung, vergleicht Stimmenlisten, spricht mit Promise auf das
  end-Ereignis plus Watchdog und plant Folgen aus Zeitstempeln. Die Diagnoseseite
  (`diagnose.html`, `app/diagnose.js`) nutzt das und liegt mit im Offline-Cache. Die
  einzige Audiodatei ist der Testton `audio/testton.wav`, in der VM erzeugt.
- **Tests** laufen nur in der Entwicklungs-VM mit Node (`npm test`): Scheduler,
  Antwortvergleich, Kartenmodell, Sicherung, Deckformat samt Beispieldateien und
  Sprachausgabe mit nachgestellter Uhr (Node), dazu die Bedienabläufe der Abnahmelisten
  aus Phase 1 und 2, die Diagnoseseite mit nachgestellter Sprachausgabe und echtem
  Testton, ein Offline-Test
  und der Update-Ablauf im Chromium, sowie Manifest, Service Worker, Vendor-Prüfsummen
  und der CDN-Wächter. Die App selbst braucht kein Node.

## Dateien

```
index.html             Die Bildschirme (Heute, Session, Decks, Importieren, Karte, Einstellungen)
diagnose.html          Prüfseite für den Fahrmodus (Phase 3, Teil A)
app/main.js            Oberfläche, Session, Import, Export, Sicherung, Update-Hinweis
app/diagnose.js        Ablauf der Prüfseite: Stimmen und Stimmwahl, Testsätze, Wake Lock, Dauertest, Testton, Protokoll
audio/testton.wav      Testton der Prüfseite (drei Töne, 3 s), erzeugt mit scripts/make-tone.js
app/speech.js          Sprachausgabe: Stimmen bewerten, sprechen mit end-Ereignis und Watchdog, Zeitplan
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
scripts/               Hilfsskripte für die VM (vendor kopieren, Icons rendern, Testton erzeugen)
tests/                 Node- und Browser-Tests
docs/deck-format.md    Das Dateiformat für Kartenstapel – für andere Chats gedacht
docs/beispiele/        Importierbare Beispieldateien, Sammeldatei, 300-Karten-Testdatei, zwei kaputte
docs/phase-1.md        Vorgaben der Phase 1
docs/phase-2.md        Vorgaben der Phase 2
docs/phase-3.md        Vorgaben der Phase 3 (Fahrmodus)
AUFTRAG.md             Der vollständige Auftrag
```
