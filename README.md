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

GitHub Pages liefert nur aus dem Zweig `main` aus. Die Arbeit liegt auf einem
eigenen Zweig und muss einmal hinüber.

1. Öffne https://github.com/warumdu/estudar in Safari.
2. Oben erscheint ein gelber Kasten „**claude/check-environment-setup-u71w8t** had recent pushes"
   mit dem Knopf **Compare & pull request**. Tippe darauf.
   Fehlt der Kasten: Reiter **Pull requests** → **New pull request** → bei
   „compare:" den Zweig `claude/check-environment-setup-u71w8t` wählen
   (bei „base:" bleibt `main`).
3. Tippe **Create pull request** (Titel kann bleiben) und auf der nächsten Seite
   noch einmal **Create pull request**.
4. Tippe **Merge pull request**, dann **Confirm merge**. Der Stand ist jetzt in `main`.

### B. GitHub Pages einschalten (einmalig)

5. Im Repository auf den Reiter **Settings** (Zahnrad). Ist er nicht zu sehen,
   steckt er hinter dem Menü **···** rechts neben den Reitern.
6. Links in der Liste unter „Code and automation" auf **Pages**.
7. Unter „Build and deployment" bei **Source** den Eintrag **Deploy from a branch** lassen.
8. Bei **Branch** den Zweig **main** wählen, daneben den Ordner **/ (root)**, dann **Save**.
9. Ein bis drei Minuten warten, dann die Seite neu laden. Oben steht dann
   „Your site is live at **https://warumdu.github.io/estudar/**" mit dem Knopf **Visit site**.

### C. Auf dem iPhone zum Home-Bildschirm hinzufügen

10. Öffne https://warumdu.github.io/estudar/ **in Safari** auf dem iPhone
    (nicht in Chrome oder einer anderen App). Die Seite zeigt „Hallo".
11. Tippe unten auf **Teilen** (Quadrat mit Pfeil nach oben).
12. Wähle **Zum Home-Bildschirm** (evtl. nach unten scrollen), dann oben rechts **Hinzufügen**.
13. Schließe Safari und tippe auf dem Home-Bildschirm auf das grüne Icon **estudar**.

### D. Prüfen, ob alles sitzt

Die Seite zeigt drei Zeilen. So sollen sie aussehen, wenn du die App vom Icon startest:

| Zeile     | Erwartet                                |
|-----------|-----------------------------------------|
| Gestartet | als App vom Home-Bildschirm ✓           |
| Offline   | bereit ✓                                |
| Version   | 0.0.1                                   |

14. Flugmodus einschalten, die App schließen (nach oben wischen) und erneut vom
    Icon starten. Sie muss weiterhin „Hallo" und „Offline: bereit ✓" zeigen.
15. Gib mir Bescheid, dass das Icon liegt und Schritt 14 klappt. Erst dann geht es
    mit Phase 1 weiter.

Steht bei „Offline" dauerhaft „wird eingerichtet …", einmal Safari-Seite neu laden;
steht dort „Fehler: …", schick mir den Text.

## Wichtig zu wissen: iOS kann die Daten einer Web-App löschen

Eine Web-App speichert ihre Daten im Browser-Speicher des iPhones. iOS darf diesen
Speicher räumen, wenn der Platz knapp wird oder die App sehr lange nicht benutzt
wurde. Dann sind Karten und Lernfortschritt weg – ohne Warnung. Deshalb bekommt die
App ab Phase 1 eine **Sicherung als JSON-Datei**: bei Sitzungsende und auf Knopfdruck,
ablegbar in der iOS-Dateien-App oder iCloud Drive. Aus dieser Datei lässt sich alles
wiederherstellen. Wie oft du sichern solltest, steht dann in den Einstellungen der App.

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
