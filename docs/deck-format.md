# Deckformat `flashdeck/1`

Das ist das eine kanonische Format, in dem die App **estudar** Kartenstapel
importiert und exportiert. Dieses Dokument ist so geschrieben, dass ein anderer
Chat daraus direkt gültige Dateien erzeugen kann. Halte dich exakt an die
Feldnamen; alles andere lehnt die Prüffunktion ab.

Zwei Dateiarten werden gelesen: **JSON** (empfohlen, alle Kartentypen, alle
Felder) und **CSV** (flache Tabelle, für Vokabellisten). Beide beschreiben
dieselben Karten. Zeichenkodierung ist immer **UTF-8**.

Die Sprache der Vorderseite ist Deutsch, die der Rückseite brasilianisches
Portugiesisch (pt-BR, nicht europäisches Portugiesisch: *ônibus*, *trem*,
*celular*, *a gente*, *café da manhã*).

---

## 1. JSON

### Aufbau

```json
{
  "schema": "flashdeck/1",
  "deck": {
    "name": "Módulo 2 · Dia 03",
    "front_lang": "de-DE",
    "back_lang": "pt-BR",
    "tags": ["modulo2", "dia03"]
  },
  "cards": [
    { "id": "m2d03-001", "type": "vocab", "front": "der Schlaf", "back": "o sono", "example": "O sono também é treino.", "tags": ["substantiv"] },
    { "id": "m2d03-002", "type": "cloze", "text": "Ontem eu {{c1::fui}} para o trabalho.", "note": "ir · pretérito perfeito" },
    { "id": "m2d03-003", "type": "conjugation", "prompt": "falar · pretérito perfeito · nós", "answer": "falamos" },
    { "id": "m2d03-004", "type": "sentence", "front": "Ich habe gestern keine Zeit gehabt.", "back": "Ontem eu não tive tempo." }
  ]
}
```

### Felder auf oberster Ebene

| Feld     | Pflicht | Typ    | Bedeutung |
|----------|---------|--------|-----------|
| `schema` | **ja**  | Text   | Muss exakt `"flashdeck/1"` sein. |
| `deck`   | nein    | Objekt | Angaben zum Deck, siehe unten. Fehlt es, heißt das Deck wie die Datei. |
| `cards`  | **ja**  | Liste  | Mindestens eine Karte. |

### Felder in `deck`

| Feld         | Pflicht | Typ         | Bedeutung |
|--------------|---------|-------------|-----------|
| `name`       | nein, aber dringend empfohlen | Text | Name des Decks in der App. Fehlt er, wird der Dateiname (ohne Endung) genommen. |
| `front_lang` | nein    | Text        | Sprache der Vorderseite, Standard `"de-DE"`. |
| `back_lang`  | nein    | Text        | Sprache der Rückseite, Standard `"pt-BR"`. |
| `tags`       | nein    | Liste Text  | Tags für das Deck, z. B. `["modulo2", "dia03"]`. |

### Felder einer Karte

Es gibt vier Kartentypen. `type` wählt den Typ; fehlt `type`, gilt `vocab`.

| Feld        | Pflicht bei | Typ        | Bedeutung |
|-------------|-------------|------------|-----------|
| `type`      | nein        | Text       | `vocab`, `cloze`, `conjugation` oder `sentence`. Standard `vocab`. |
| `front`     | `vocab`, `sentence` | Text | Vorderseite (Deutsch). |
| `back`      | `vocab`, `sentence` | Text | Rückseite (Portugiesisch). |
| `text`      | `cloze`     | Text       | Satz mit mindestens einer Lücke `{{c1::…}}`, siehe Abschnitt 3. |
| `prompt`    | `conjugation` | Text     | Aufgabe, z. B. `"falar · pretérito perfeito · nós"`. |
| `answer`    | `conjugation` | Text     | Erwartete Form, z. B. `"falamos"`. Wird in der App getippt. |
| `id`        | nein        | Text       | Eigene Kennung, z. B. `"m2d03-001"`. Wird gespeichert und beim Export wieder ausgegeben. Muss nicht eindeutig sein. |
| `example`   | nein        | Text       | Beispielsatz, erscheint mit der Lösung. |
| `hint`      | nein        | Text       | Hinweis, erscheint mit der Frage (z. B. `"Substantiv, feminin"`). |
| `note`      | nein        | Text       | Nur bei `cloze`: dasselbe wie `hint`. |
| `tags`      | nein        | Liste Text | Tags der Karte, siehe Abschnitt 4. |
| `direction` | nein        | Text       | Nur bei `vocab`: `"de-pt"` (Standard), `"pt-de"` oder `"both"`. `"both"` erzeugt zwei getrennt terminierte Karten (DE→PT und PT→DE), die nie am selben Tag drankommen. |

Regeln, die die Prüffunktion durchsetzt:

- Pflichtfelder dürfen nicht fehlen und nicht leer sein (`""` zählt als fehlend).
- Alle Textfelder müssen Zeichenketten sein, keine Zahlen oder Objekte.
- `tags` muss eine Liste von Zeichenketten sein.
- `direction` ist nur bei `vocab` erlaubt.
- Bei `cloze` muss `text` mindestens eine Lücke `{{c1::…}}` enthalten.
- Bei `cloze` und `conjugation` sind ersatzweise `front`/`back` erlaubt (`front` = `text` bzw. `prompt`, `back` = `answer`), damit CSV-Dateien dieselben Spalten nutzen können. Für JSON nimm die Namen aus der Tabelle.

Fehlerhafte Karten werden beim Import einzeln mit Grund aufgelistet und
übersprungen; die übrigen Karten werden importiert. Ist die Datei als Ganzes
unbrauchbar (kein gültiges JSON, falsches `schema`, `cards` fehlt), wird nichts
importiert.

### Sammelform: mehrere Decks in einer Datei

Statt `deck` und `cards` auf oberster Ebene steht eine Liste `decks`; jedes
Element hat genau den Aufbau der Einzelform (`deck` + `cards`):

```json
{
  "schema": "flashdeck/1",
  "decks": [
    { "deck": { "name": "Módulo 2 · Dia 01", "tags": ["modulo2", "dia01"] }, "cards": [ { "front": "der Kaffee", "back": "o café" } ] },
    { "deck": { "name": "Módulo 2 · Dia 02", "tags": ["modulo2", "dia02"] }, "cards": [ { "front": "der Regen", "back": "a chuva" } ] }
  ]
}
```

- `decks` muss mindestens ein Element haben; jedes Element braucht eine nicht
  leere Liste `cards`. Fehlt `deck.name`, heißt das Deck „Dateiname n".
- Eine Datei hat entweder `decks` **oder** `deck` + `cards`, nicht beides. Der
  Import erkennt beides am Inhalt; die Einzelform bleibt vollständig gültig.
- Jedes Element wird ein eigenes, neues Deck – alle zunächst **inaktiv**. Die
  Vorschau zeigt je Deck eine Zeile (Name, neue Karten, Dubletten, Fehler) und
  eine Gesamtsumme; eine Bestätigung, eine Transaktion für alles.
- Fehlermeldungen nennen das Deck: `Deck 2, Karte 3: Feld back fehlt`.

**Gruppen im Deckbildschirm.** Enthält ein Deckname ` · ` (Leerzeichen,
Mittelpunkt, Leerzeichen), gilt der Teil davor als Gruppe: „Módulo 2 · Dia 01"
und „Módulo 2 · Dia 02" erscheinen zusammengeklappt unter „Módulo 2" mit einem
gemeinsamen Schalter aktiv/inaktiv. Das ist reine Namenskonvention, kein
eigenes Feld – benenne die Decks eines Moduls also einheitlich.

---

## 2. CSV

Eine Karte je Zeile, erste Zeile sind die Spaltennamen.

- **Trennzeichen:** Semikolon `;` (empfohlen). Tabulator (TSV) und Komma werden
  ebenfalls erkannt; ist es nicht eindeutig, fragt die App nach.
- **Kodierung:** UTF-8, mit oder ohne BOM. Zeilenenden `\n` oder `\r\n`.
- **Anführungszeichen:** Enthält ein Feld das Trennzeichen, einen Zeilenumbruch
  oder ein Anführungszeichen, wird es in doppelte Anführungszeichen gesetzt;
  ein Anführungszeichen im Feld wird verdoppelt (`""`). Das ist RFC 4180.
- **Kopfzeile:** Spaltennamen in Kleinbuchstaben, in beliebiger Reihenfolge.
  Nur `front` ist Pflicht. Erlaubte Spalten:

```
front;back;type;tags;example;hint;direction;id
```

| Spalte      | Bedeutung |
|-------------|-----------|
| `front`     | Vorderseite. Bei `cloze` der Satz mit Lücke, bei `conjugation` die Aufgabe. |
| `back`      | Rückseite. Bei `cloze` leer lassen, bei `conjugation` die erwartete Form. |
| `type`      | `vocab`, `cloze`, `conjugation`, `sentence`. Leer = `vocab`. |
| `tags`      | Tags durch Leerzeichen oder Komma getrennt: `substantiv tier`. |
| `example`   | Beispielsatz. |
| `hint`      | Hinweis zur Frage (bei `cloze` das, was in JSON `note` heißt). |
| `direction` | Nur `vocab`: `de-pt`, `pt-de`, `both`. Leer = `de-pt`. |
| `id`        | Eigene Kennung. |

Unbekannte Spalten werden ignoriert. Leere Zeilen werden übersprungen. Der
Deckname ist der Dateiname ohne Endung (in der Vorschau änderbar).

Beispiel (`front;back;type;tags;example;hint`):

```
front;back;type;tags;example;hint
der Hund;o cachorro;vocab;substantiv tier;O cachorro late à noite.;
"die Rechnung (im Restaurant)";a conta;vocab;substantiv essen;"A conta, por favor!";im Restaurant
Ontem eu {{c1::fui}} ao mercado.;;cloze;preterito-perfeito;;ir · pretérito perfeito · eu
chegar · pretérito perfeito · eu;cheguei;conjugation;verb;;Achtung: g → gu vor e
```

Fehlermeldungen nennen die Zeilennummer der Datei, z. B. `Zeile 14: Feld back fehlt`.

---

## 3. Lückentext (`cloze`)

Eine Lücke wird so notiert:

```
{{c1::Lösung}}
{{c1::Lösung::Hinweis}}
```

- `c1`, `c2`, … nummeriert die Lücken. Mehrere Lücken in einem Satz sind
  erlaubt; sie gehören zu **einer** Karte und werden zusammen abgefragt.
- Der optionale `Hinweis` hinter dem zweiten `::` erscheint in der Lücke
  (z. B. der Infinitiv): `{{c1::fez::fazer}}` zeigt `[fazer]`.
- Die Frage zeigt den Satz mit Lücke, die Lösung füllt sie farbig aus.
- `note` (JSON) bzw. `hint` (CSV) steht als Hinweis unter der Frage, z. B.
  `"ir · pretérito perfeito · eu"`.

Beispiel:

```json
{ "type": "cloze", "text": "Nós {{c1::comemos}} feijoada e {{c2::dormimos}} a tarde toda.", "note": "comer, dormir · pretérito perfeito · nós" }
```

---

## 4. Tags

- Kleinbuchstaben, Ziffern und Bindestrich, keine Leerzeichen, keine Akzente:
  `substantiv`, `verb`, `preterito-perfeito`, `modulo2`, `dia03`, `fehler-07`.
- In JSON eine Liste: `"tags": ["verb", "dia03"]`. In CSV durch Leerzeichen
  oder Komma getrennt: `verb dia03`.
- Tags sind Beschriftung, keine Steuerung: Sie ändern nichts an der Terminierung.

---

## 5. Was beim Import passiert

1. Format wird am Inhalt erkannt (JSON, CSV), bei unklarem Trennzeichen fragt die App.
2. Prüfung gegen dieses Schema; fehlerhafte Karten werden mit Grund aufgelistet und übersprungen.
3. **Vorschau**, bevor etwas geschrieben wird: Zahl der Einträge, davon neu, Dubletten, fehlerhaft, dazu die ersten zehn Karten.
4. Zieldeck wählen: neues Deck (Name aus `deck.name` bzw. Dateiname) oder ein bestehendes.
5. **Dubletten** = gleiche Vorder- und Rückseite wie eine Karte im Zieldeck, verglichen ohne Rücksicht auf Groß-/Kleinschreibung, Akzente und mehrfache Leerzeichen. Sie werden übersprungen, nie überschrieben – der Lernfortschritt der vorhandenen Karte bleibt. Zusätzlich nennt die Vorschau, wie viele der neuen Karten es schon in einem **anderen** Deck gibt (mit dem Namen des ersten betroffenen Decks); diese werden trotzdem importiert, das ist nur ein Hinweis.
6. Der Schreibvorgang läuft in einer Transaktion: Bricht etwas ab, ist der Bestand unverändert.
7. Ein frisch angelegtes Deck ist **inaktiv**, bis es unter „Decks" eingeschaltet wird. Neue Karten kommen danach in Dateireihenfolge, höchstens „neue Karten pro Tag" (Standard 10).

Der **Export** eines Decks erzeugt genau dieses Format wieder (ohne Lernzustand).
Vokabelpaare, die als beide Richtungen angelegt wurden, werden als eine Karte
mit `"direction": "both"` ausgegeben.

---

## 6. Beispieldateien

Unter `docs/beispiele/` liegen echte, importierbare Dateien:

| Datei | Inhalt |
|-------|--------|
| `beispiel-vokabeln.json` | 14 Karten, alle vier Typen, mit `direction: "both"`, mehreren Lücken und Hinweis in der Lücke. |
| `beispiel-vokabeln.csv`  | 12 Karten als CSV mit Semikolon, BOM, Anführungszeichen, Lückentext und Konjugation. |
| `beispiel-sammeldatei.json` | Sammelform: drei kleine Decks „Beispiel-Modul · Dia 01–03", ergeben eine Gruppe. |
| `test-300-karten.json`   | 300 Vokabeln A1/A2 nach Themen, zum Prüfen des Tageslimits. |
| `teils-fehlerhaft.csv`   | 6 Zeilen, 4 davon absichtlich fehlerhaft – zeigt die Fehlerliste; 2 Karten werden importiert. |
| `kaputt.json`            | Abgeschnittenes JSON – wird als Ganzes abgelehnt, nichts wird geschrieben. |

Die Prüffunktion selbst steht in `app/deckformat.js` (`validateCard`,
`parseDeckJson`, `parseDeckCsv`); `tests/deckformat.test.js` prüft die
Beispieldateien bei jedem Testlauf.
