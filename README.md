# estudar

Meine Vokabelapp, um brasilianisches Portugiesisch offline mit Karteikarten zu lernen.
Eine installierbare Web-App (PWA): Sie liegt als Icon auf dem iPhone, läuft ohne
Internet und speichert allen Lernfortschritt nur auf dem Gerät.

**Stand: Phase 0** – die Seite zeigt „Hallo" und lässt sich auf dem Home-Bildschirm
ablegen. Lernen, Import und Pendel-Modus kommen in den nächsten Phasen
(siehe `AUFTRAG.md`).

Adresse der App: **https://warumdu.github.io/estudar/**

## Was du auf dem iPad antippen musst

GitHub zeigt seine Oberfläche nur auf Englisch, deshalb stehen die Schaltflächen
hier im Original.

### A. Den Arbeitsstand in `main` übernehmen

Laut Auftrag liefert GitHub Pages aus dem Zweig `main` aus. Die Arbeit liegt auf
einem eigenen Zweig und muss einmal hinüber.

1. Öffne https://github.com/warumdu/estudar in Safari.
2. Oben erscheint ein gelber Kasten „**claude/check-environment-setup-u71w8t** had recent pushes"
   mit dem Knopf **Compare & pull request**. Tippe darauf.
   Fehlt der Kasten: Reiter **Pull requests** → **New pull request** → bei
   „compare:" den Zweig `claude/check-environment-setup-u71w8t` wählen
   (bei „base:" bleibt `main`).
3. Tippe **Create pull request** (Titel kann bleiben). Erscheint danach ein
   Formular, dort noch einmal **Create pull request**.
4. Tippe **Merge pull request**, dann **Confirm merge**. Der Stand ist jetzt in `main`.

### B. GitHub Pages einschalten (einmalig)

5. Im Repository auf den Reiter **Settings** (Zahnrad). Ist er nicht zu sehen,
   steckt er hinter dem Menü **···** rechts neben den Reitern.
6. Links in der Liste unter „Code and automation" auf **Pages**.
7. Unter „Build and deployment" bei **Source** den Eintrag **Deploy from a branch** lassen.
8. Bei **Branch** den Zweig **main** wählen, daneben den Ordner **/ (root)**, dann **Save**.
9. Meist dauert es wenige Minuten, manchmal bis zu zehn. Dann die Seite neu laden:
   Oben steht „Your site is live at **https://warumdu.github.io/estudar/**" mit dem
   Knopf **Visit site**. Steht es noch nicht da, einfach später noch einmal laden.

### C. Auf dem iPhone zum Home-Bildschirm hinzufügen

10. Öffne https://warumdu.github.io/estudar/ **in Safari** auf dem iPhone
    (nicht in Chrome oder einer anderen App). Die Seite zeigt „Hallo".
11. Tippe auf **Teilen** (Quadrat mit Pfeil nach oben). Siehst du unten in der
    Leiste kein solches Symbol, tippe auf **···** rechts in der Adresszeile: Dort
    findest du **Teilen** und meist auch direkt **Zum Home-Bildschirm**.
12. Wähle **Zum Home-Bildschirm** (evtl. nach unten scrollen), dann oben rechts **Hinzufügen**.
13. Schließe Safari und tippe auf dem Home-Bildschirm auf das grüne Icon **estudar**.
    **Beim ersten Start vom Icon muss das iPhone Internet haben**, bis unten
    „Offline: bereit ✓" erscheint. Die App vom Home-Bildschirm hat nämlich ihren
    eigenen Speicher, getrennt vom Safari-Tab, und lädt sich beim ersten Start
    einmal komplett hinein.

### D. Prüfen, ob alles sitzt

Die Seite zeigt drei Zeilen. So sollen sie aussehen, wenn du die App vom Icon startest:

| Zeile     | Erwartet                                |
|-----------|-----------------------------------------|
| Gestartet | als App vom Home-Bildschirm ✓           |
| Offline   | bereit ✓                                |
| Version   | 0.0.1                                   |

14. Erst wenn „Offline: bereit ✓" da war: Flugmodus einschalten, die App schließen
    (nach oben wischen) und erneut vom Icon starten. Sie muss weiterhin „Hallo" und
    „Offline: bereit ✓" zeigen.
15. Gib mir Bescheid, dass das Icon liegt und Schritt 14 klappt. Erst dann geht es
    mit Phase 1 weiter.

Steht bei „Offline" dauerhaft „wird eingerichtet …": Flugmodus aus, App schließen
und mit Internet neu vom Icon starten. Steht dort „Fehler: …", schick mir den Text.

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

Deshalb bekommt die App ab Phase 1 eine **Sicherung als JSON-Datei**: bei Sitzungsende
und auf Knopfdruck, ablegbar in der iOS-Dateien-App oder iCloud Drive. Aus dieser Datei
lässt sich alles wiederherstellen. Wie oft du sichern solltest, steht dann in den
Einstellungen der App.

## Technik in Kürze

- **Kein Build-Schritt.** Die Dateien im Repository werden von GitHub Pages
  unverändert ausgeliefert: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`.
- **Kein CDN.** Bibliotheken liegen unter `vendor/` im Repository (siehe
  `vendor/README.md`); der Wiederholungsalgorithmus ist `ts-fsrs` 5.4.2, exakt gepinnt.
  Ein Test schlägt fehl, sobald irgendwo ein CDN-Verweis auftaucht.
- **Offline.** Der Service Worker (`sw.js`) legt die App beim ersten Laden im Cache ab
  und beantwortet alle Anfragen zuerst daraus. Eine neue Fassung erkennt die App beim
  nächsten Start und lädt sich einmal neu.
- **Tests** laufen nur in der Entwicklungs-VM mit Node (`npm test`): Manifest, Icons,
  Service Worker, Vendor-Prüfsummen, ein echter Offline-Test im Chromium und der
  CDN-Wächter. Die App selbst braucht kein Node.

## Dateien

```
index.html             Startseite (Phase 0: „Hallo" + Statusanzeige)
manifest.webmanifest   App-Beschreibung für die Installation
sw.js                  Service Worker (Offline-Cache)
icons/                 App-Icons (SVG-Quelle und PNG-Fassungen)
vendor/                Bibliotheken, aus npm kopiert und gepinnt
scripts/               Hilfsskripte für die VM (vendor kopieren, Icons rendern)
tests/                 Node- und Browser-Tests
AUFTRAG.md             Der vollständige Auftrag
```
