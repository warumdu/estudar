Phase 3 — Fahrmodus. Committe diesen Text zuerst unverändert als `docs/phase-3.md`, dann arbeite ihn ab. Er ergänzt AUFTRAG.md und die Phasen davor. Alles gilt weiter: kein Build-Schritt, kein CDN, offline lauffähig, Oberfläche Deutsch.

# Zweck

Ich pendele täglich 45 bis 55 Minuten je Richtung mit dem Auto. Das Handy liegt auf der induktiven Ladeschale, Bildschirm an, Ton über Apple CarPlay. Ich will Karten hören und laut mitsprechen, ohne hinzusehen. Deutsch wird angesagt, ich spreche die portugiesische Lösung laut, danach lese die App sie mir vor, damit ich meine Aussprache vergleichen kann.

Betrieb bei gesperrtem Bildschirm ist ausdrücklich NICHT gefordert. Bau nichts dafür.

# TEIL A — messen, bevor du baust

Bau in dieser Phase zuerst nur eine kleine Prüfseite unter `/diagnose.html`, die ich auf dem iPhone öffne und die mir Folgendes anzeigt und protokolliert:

1. Alle verfügbaren Stimmen mit Name, Sprachkennung und ob sie lokal oder aus dem Netz kommen. Hebe die pt-BR- und de-DE-Stimmen hervor.
2. Je einen Testknopf: portugiesischer Satz mit der besten gefundenen pt-BR-Stimme, deutscher Satz mit der besten de-DE-Stimme.
3. Einen Knopf „Wake Lock anfordern", der anzeigt, ob es geklappt hat und ob die Sperre nach einem Wechsel in eine andere App und zurück noch steht.
4. Eine Anzeige des aktuellen Zustands der Sprachausgabe (spricht / pausiert / beendet) sowie der sichtbaren Höhe.
5. Einen Dauertest: zehn kurze Sätze im Abstand von fünf Sekunden, damit ich höre, ob die Ausgabe nach einer Weile abbricht.

Schreib mir dazu eine kurze Anleitung, was ich damit im stehenden Auto mit laufendem CarPlay prüfen soll. Die entscheidende Frage: Kommt der Ton aus den Autolautsprechern oder aus dem Telefon?

**Halt an dieser Stelle an und warte auf mein Ergebnis.** Bau Teil B erst danach.

Falls der Ton nicht über CarPlay läuft: Bevor du etwas Größeres vorschlägst, probiere in der Diagnoseseite die Variante, parallel ein stilles, in Schleife laufendes Audioelement abzuspielen, um die Audiositzung offen zu halten und die Ausgabe auf die Verbindung zu zwingen. Sag mir, ob das hilft.

# TEIL B — der Fahrmodus

## Einstieg

Ein eigener Bildschirm „Fahrmodus", erreichbar von „Heute". Vor dem Start zeigt er nur: wie viele Karten in der Warteschlange sind, aus welchen Decks, und einen einzigen sehr großen Startknopf. Kein Kleingedrucktes — das lese ich vor der Fahrt nicht.

## Ablauf je Karte

1. Die deutsche Vorderseite wird mit einer de-DE-Stimme angesagt.
2. Danach Stille, Standard 15 Sekunden, in den Einstellungen zwischen 5 und 30 einstellbar. In dieser Zeit spreche ich laut.
3. Die portugiesische Rückseite wird mit einer pt-BR-Stimme vorgelesen, danach eine kurze Pause, Standard 3 Sekunden, dann die nächste Karte.
4. Gibt es einen Beispielsatz, wird er nach der Lösung mitgelesen. In den Einstellungen abschaltbar.

Die Stillezeit beginnt erst, wenn die Ansage tatsächlich zu Ende ist, nicht wenn sie gestartet wurde. Nutze dafür das Ereignis am Ende der Äußerung und nicht einen geschätzten Zeitwert.

Der Bildschirm zeigt während der Fahrt nur sehr groß den Text der laufenden Karte, den Zähler und einen Fortschrittsbalken für die Stillezeit. Kein weiteres Bedienelement außer dem, was unten steht.

## Die eine Geste

Ein Tippen an beliebiger Stelle des Bildschirms markiert die laufende Karte als „saß nicht". Kurze Rückmeldung durch Vibration, falls verfügbar, und eine deutlich sichtbare Markierung — aber ich muss nicht hinsehen. Nochmaliges Tippen nimmt die Markierung zurück.

Es wird während der Fahrt NICHTS bewertet und NICHTS terminiert. Der FSRS-Zustand der Karten bleibt unverändert, bis ich nachtrage. Fahre auf keinen Fall eine automatische Bewertung ein — erfundene Daten verderben den Algorithmus.

Anhalten und Fortsetzen über einen bildschirmfüllenden Bereich am unteren Rand, Beenden über einen Knopf oben.

## Warteschlange

Standardmäßig fällige Karten aus aktiven Decks, in derselben Reihenfolge wie die normale Session. Nur die Typen `vocab` und `sentence` — eine Konjugationsaufgabe vorgelesen ergibt keinen Sinn. `cloze` ist in den Einstellungen zuschaltbar, Lücke wird dabei als „Lücke" gesprochen.

Sind die fälligen Karten durch, bevor ich ankomme: Einstellung mit drei Möglichkeiten — von vorn wiederholen, mit bereits gelernten Karten auffüllen, oder beenden. Standard: von vorn wiederholen.

## Nachtragen

Nach dem Beenden — und ebenso beim nächsten Öffnen der App, wenn eine Fahrt offen ist — erscheint „Fahrt nachtragen": alle Karten der Fahrt untereinander, jede mit vier Knöpfen. Die markierten stehen auf *Nochmal*, alle übrigen auf *Gut*. Ich ändere nur die Ausnahmen und bestätige unten einmal. Erst dieser Knopf schreibt die Bewertungen nach FSRS, in einer Transaktion.

Die offene Fahrt überlebt das Schließen der App. Verwerfen ist möglich, aber nur mit Rückfrage.

## Bildschirm anlassen

Fordere beim Start des Fahrmodus eine Wake-Lock-Sperre an und fordere sie nach jedem Wechsel in den Vordergrund erneut an. Scheitert das, sag es mir vor dem Start in einem Satz und starte trotzdem.

## Stimmen

Wähle die Stimmen einmal beim ersten Start aus dem, was das Gerät bietet, bevorzugt eine lokale pt-BR- und eine lokale de-DE-Stimme, und lass mich beide in den Einstellungen mit Hörprobe ändern. Merke die Wahl. Gibt es keine pt-BR-Stimme, sag mir das auf dem Fahrmodus-Bildschirm mit dem Hinweis, wie ich sie in den iOS-Einstellungen nachlade — und starte nicht.

Sprechtempo einstellbar, Standard etwas langsamer als normal.

# Qualitätskriterien

- Während der Fahrt darf die Ausgabe nie stumm hängen bleiben. Baue eine Absicherung ein: Kommt nach einer angemessenen Frist kein Ende-Ereignis, geht es trotzdem weiter.
- Timer dürfen nicht driften. Rechne mit Zeitstempeln, nicht mit aufaddierten Intervallen.
- Kein Datenverlust: Die offene Fahrt liegt in IndexedDB, nicht nur im Arbeitsspeicher.
- Kommt ein Anruf oder unterbricht die Navigationsansage, muss der Fahrmodus danach weiterlaufen oder sauber pausieren — nicht abstürzen.

# Nicht-Ziele

Keine Spracherkennung, keine Bewertung per Stimme, kein Betrieb bei gesperrtem Bildschirm, keine Aufnahme meiner Aussprache, keine vorerzeugten Audiodateien, keine neue Bibliothek. Baue nichts, was oben nicht steht.

# Abnahme

Nenn mir die Schritte in GitHub und eine Prüfliste, die ich zweigeteilt abarbeite: was ich im Stand vor der Abfahrt prüfe und was während der ersten Fahrt. Eine Review-Runde am Ende genügt.
