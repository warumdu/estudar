# vendor/

Hier liegen die Bibliotheken, die die App zur Laufzeit lädt. Sie werden **einmal**
in der Entwicklungs-VM aus der npm-Registry geholt und ins Repository committet.
GitHub Pages liefert sie dann wie jede andere Datei aus.

Regeln:

- **Kein CDN.** Nirgends im Code darf eine Bibliothek von jsdelivr, unpkg,
  cdnjs, Google Fonts oder einem anderen fremden Server geladen werden. Die App
  muss im Flugmodus vollständig laufen. `tests/no-cdn.test.js` prüft das.
- **Exakt gepinnt.** Die Version steht ohne `^` oder `~` in `package.json`
  (`dependencies`) und wird von `package-lock.json` mit Prüfsumme festgeschrieben.
  `vendor/<name>/vendor.json` hält Version und SHA-256 der kopierten Dateien fest.
- **Nur fertige ES-Module.** Kopiert wird ausschließlich, was der Browser ohne
  Build-Schritt per `import` laden kann.

Aktualisieren (nur in der VM, nicht auf dem iPad nötig):

```
npm install ts-fsrs@<neue Version> --save-exact
npm run vendor
npm test
```

| Bibliothek | Version | Datei                      | Zweck                                  |
|------------|---------|----------------------------|----------------------------------------|
| ts-fsrs    | 5.4.2   | `vendor/ts-fsrs/index.js`  | FSRS-Wiederholungsalgorithmus (DSR)    |
