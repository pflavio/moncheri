# MonChéri · Vereinskleidung

Vereinskleidung für MonChéri Pétanque Groß-Zimmern: Mitglieder stellen ihre Bestellung zusammen und sehen ihren Überweisungsbetrag. Die Orga behält Zahlungen und Sammelbestellung im Blick.

Die mobile Bestellseite läuft auf GitHub Pages. Das Mitgliederformular schreibt über eine Google Apps Script Web-App in eine private Google-Tabelle. Die Vereinsdomain ist `moncheri.pflavio.com`. Die öffentliche Vorschau zeigt die fünf schwarzen Modelle aus [katalog.json](docs/katalog.json) mit vorläufigen Preisen. Nur der vollständige Einladungslink öffnet die echte Bestellrunde.

## Einrichtung · Google

1. Die vorbereitete private Verwaltungstabelle öffnen. Unter **Extensions → Apps Script** den Inhalt von [Code.gs](apps-script/Code.gs) in den Skripteditor kopieren und speichern. Das Formular ist bereits darin enthalten.
2. **Deploy → New deployment → Web app**. Bei **Execute as** den eigenen Account und bei **Who has access** **Anyone** wählen. Die Bereitstellung mit dem Tabellenkonto autorisieren. Falls der Verein ein Workspace-Konto verwendet, kann dessen Administration den anonymen Zugriff einschränken.
3. Die erzeugte Web-App-URL mit der Endung `/exec` in **Einrichtung → B10** und im Repository in [konfiguration.json](docs/konfiguration.json) als Wert von `webApp` eintragen. Die URL selbst darf öffentlich sein. Den kompletten Mitgliederlink nur innerhalb des Vereins verteilen.
4. Tabelle neu laden. **MonChéri → Mitgliederlink erstellen** wählen. **B8** enthält den Mitgliederlink für die Vereinsdomain. **B9** funktioniert als direkter Zugang auch vor der DNS-Einrichtung. Mitglieder brauchen kein Google-Konto. Die Google-Tabelle bleibt in Google Drive auf **Restricted**.
5. Im Blatt **Artikel** die Stückkosten (H) und die Stickkosten (I) je Variante pflegen. C addiert beide Kosten. Bei „Nur Stick“ berechnet das Formular ausschließlich I. Gleiche Modellgruppen in J erscheinen als eine Karte. K enthält den Schnitt, L das Produktfoto, M die Produktseite und N bei Bedarf ein Ersatzfoto. Varianten durch Kommas trennen. Die Artikel-ID ist eine eindeutige Bezeichnung ohne Leerzeichen. Eine weitere Zeile darf ein neues Modell enthalten. Die Kontrollkästchen wählen Sticktext und Sichtbarkeit. Für die Runde den Überweisungshinweis in **Einrichtung → B6** und die Datenschutzinformation des Vereins in **B7** ergänzen. **B5** öffnet und schließt die Bestellannahme.
6. Beide Links im privaten Browserfenster testen. Mit der öffentlichen Vorschau lässt sich die Bedienung vorab ausprobieren. Eine Testbestellung über den echten Mitgliederlink geht dagegen in die Verwaltung ein.
   
Bei Änderungen am HTML vorab `python3 tools/formular_einbetten.py` ausführen und die aktualisierte `Code.gs` in den Editor kopieren. Änderungen am Apps Script über **Deploy → Manage deployments → Edit → New version → Deploy** veröffentlichen. So bleibt die URL erhalten.

## Einrichtung · GitHub Pages und Domain

1. Im separaten Repo **Settings → Pages → Build and deployment → Source → Deploy from a branch** wählen. **main** und **/docs** speichern.
2. Unter **Custom domain** den Wert `moncheri.pflavio.com` speichern. [CNAME](docs/CNAME) enthält diesen Hostnamen bereits. GitHub empfiehlt, den Domainbesitz vor der Verknüpfung zu verifizieren.
3. Im DNS der Domain einen **CNAME** mit Namen **moncheri** und Ziel **pflavio.github.io** anlegen. Bei einem bereits belegten Host den vorhandenen Eintrag zuerst prüfen. Sobald GitHub die Domain und das Zertifikat bestätigt, **Enforce HTTPS** aktivieren.

## Am Bestellabend

- **Bestellungen** zeigt eine Zeile je Bestellung mit Referenz, Zeit, Name, Auswahl und Gesamtbetrag. In Spalte **E** den vollständigen Zahlungseingang abhaken. Für eine Bestellung aus zwei Überweisungen das Häkchen nach Eingang der ganzen Summe setzen.
- **MonChéri → Auswertungen aktualisieren** erzeugt **Personensummen** und **Stickerei** aus allen gespeicherten Bestellungen. Änderungen am Zahlungshäkchen aktualisieren diese Ansichten ebenfalls. Unterschiedliche Personen mit demselben Spitznamen lassen sich anhand der Referenz zuordnen. Für die Namenssummen sollten sie unterscheidbare Namen wählen.
- Für den Besticker das Blatt **Stickerei** öffnen und **File → Download → Comma-separated values (.csv, current sheet)** wählen. Es enthält Artikel, Farbe, Größe, Stückzahl, optional den gewünschten Sticktext und die Beschaffung. Für den Einkauf nur „Über den Verein bestellen“ auswählen. „Selbstabgabe bei Philip“ zählt zur Stickerei. Namen der Bestellenden und Zahlungsstatus stehen nur in der Verwaltung.
- Zum Bestellschluss das Häkchen in **Einrichtung → B5** entfernen und die Auswertungen aktualisieren. Bereits abgegebene Bestellungen behalten den bei Abgabe bestätigten Preis. Änderungen an einer Bestellung laufen über die Orga. Die Spalten **G/H** im Bestellblatt enthalten die ursprünglichen Positionen und die Vorgangs-ID. Sie dienen der Auswertung und dem Schutz vor doppelter Übermittlung.

## Datenschutz und Vereinsdesign

Der Einladungslink enthält einen zufälligen Schlüssel. Der Server prüft ihn beim Lesen des Katalogs und beim Bestellen. Jeder, an den der Link weitergegeben wird, kann während der offenen Runde bestellen. Die Mitgliederoberfläche hat keinen Lesezugriff auf die Bestellliste. Die Orga ergänzt vor der Freigabe ihre Angaben zur konkreten Verarbeitung, zu den verwendeten Diensten, zur Aufbewahrung und zur Kontaktstelle. Die Suchmaschinenanweisung lautet `noindex`.

Vereinsname und Logo stammen von der [Vereinsseite](https://www.moncheri-petanque.de/). Das Vereinslogo ist für diesen Vereinsauftritt eingebunden. Die öffentliche Vorschau verwendet die hinterlegten Einzelpreise und zunächst 10 € Stickkosten je Stück. Die private Bestellrunde verwendet die aktuellen Werte der Verwaltungstabelle.
