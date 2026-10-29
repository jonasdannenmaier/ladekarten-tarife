# Ladekarten-Tarife

Preise von Ladekarten und Lade-Apps für Elektroautos in Deutschland, als offene Daten. Gesammelt von Ampena, dem Ladeagenten fürs E-Auto, ausschließlich von den Preisseiten der Anbieter selbst.

<!-- stand-de -->Stand: 29. Oktober 2026 (ältester Wert vom 22. Oktober 2026) · 32 Tarife von 19 Anbietern<!-- /stand-de -->

## Dateien

- `data/ladekarten-tarife.csv`: eine Zeile je Tarif. Komma als Trennzeichen, Punkt als Dezimalzeichen, UTF-8. In Excel über „Daten > Aus Text/CSV“ öffnen.
- `data/ladekarten-tarife.json`: dieselben Zeilen unter `tarife`, dazu Stand, Lizenz und Namensnennung.
- `data/pruefung-JJJJ-MM-TT.json`: Prüfungen von Hand, je Tarif mit dem Wortlaut der Anbieterseite.
- `tools/export.mjs`: erzeugt und prüft die Dateien.

## Felder

Alle Preise in Euro inklusive Mehrwertsteuer, wie auf der Seite des Anbieters genannt. Ein leeres Feld heißt: Die Seite nennt den Wert nicht.

| Feld | Bedeutung |
|---|---|
| `id` | fester Schlüssel aus Anbieter und Tarif |
| `anbieter` | Anbieter der Karte oder App |
| `tarif` | Name des Tarifs |
| `grundgebuehr_eur_monat` | Grundgebühr in € im Monat, 0 = keine |
| `ac_eur_kwh` | Preis beim Normalladen (AC) in €/kWh |
| `dc_eur_kwh` | Preis beim Schnellladen (DC) in €/kWh |
| `hpc_eur_kwh` | Preis an Schnellladern mit höherer Leistung, wenn der Anbieter ihn getrennt nennt (Grenze steht im Hinweis) |
| `preise_gelten_bei` | Die Preise in `ac_eur_kwh`, `dc_eur_kwh` und `hpc_eur_kwh` gelten nur an Säulen dieses Betreibers |
| `andere_betreiber_ac_eur_kwh`, `andere_betreiber_dc_eur_kwh` | Preis an Säulen anderer Betreiber. Nennt der Anbieter eine Spanne, steht hier der höchste Wert und die Spanne im Hinweis. Leer: dort nicht nutzbar oder nicht genannt |
| `blockiergebuehr_eur_min` | Blockiergebühr in € je Minute |
| `blockiergebuehr` | Bedingungen der Blockiergebühr: ab wann, wo, Obergrenze |
| `gueltig_bis` | Ende eines Aktionspreises, wenn der Anbieter eines nennt |
| `stand` | Tag, an dem wir den Preis auf der Seite des Anbieters gelesen und geprüft haben |
| `quelle_url` | Preisseite des Anbieters |
| `hinweis` | Bedingungen und Ausnahmen, z. B. Mitgliedschaft, einmalige Kartengebühr, Preise bei Partnern |

## Was enthalten ist

Tarife mit festen Preisen, die der Anbieter auf seiner eigenen Seite nennt. Nennt ein Anbieter nur einen Rabatt auf seinen eigenen Preis, ist der Preis daraus berechnet; das steht im Hinweis.

Nicht enthalten sind Tarife, deren Preis je Säule oder Betreiber wechselt (z. B. Tesla, Plugsurfing, Shell Recharge), Preise ohne Vertrag (Ad-hoc-Laden) und Werte aus Vergleichsportalen.

## Fehler melden

Ein Preis stimmt nicht mehr oder ein Tarif fehlt? Bitte unter „Issues“ ein neues Issue anlegen, mit Anbieter, Tarif, richtigem Wert und dem Link auf die Seite des Anbieters. Wir prüfen den Wert dort und passen die Daten an.

## Ohne Gewähr

Die Daten sind sorgfältig gesammelt, aber ohne Gewähr. Preise ändern sich oft und ohne Ankündigung. Maßgeblich ist immer die Seite des Anbieters (`quelle_url`) und der Preis, den App oder Säule vor dem Laden anzeigt. Anbieter- und Tarifnamen dienen nur der Kennzeichnung; ihre Nennung ist keine Empfehlung.

## So entstehen die Daten

Ampena pflegt die Liste für die eigene App. `tools/export.mjs` erzeugt daraus die beiden Dateien und prüft sie: Pflichtfelder, plausible Wertebereiche, `https`-Quelle auf der Domain des Anbieters, keine abgelaufenen Aktionen. Was wir von Hand nachprüfen, steht mit dem Wortlaut der Seite in `data/pruefung-JJJJ-MM-TT.json`. Weicht die Seite ab oder ist sie widersprüchlich, bleibt der Tarif draußen, bis er geklärt ist. Die Dateien ohne die App prüfen: `node tools/export.mjs --pruefen` (Node.js 22.13 oder neuer).

## Lizenz

Daten (`data/`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de), Volltext in `LICENSE`. Nutzung auch kommerziell erlaubt, mit dieser Namensnennung:

> Ladekarten-Tarife (Ampena), https://github.com/jonasdannenmaier/ladekarten-tarife, Lizenz: CC BY 4.0

Code (`tools/`): MIT, siehe `LICENSE-CODE`.

---

## English

Prices of charging cards and charging apps for electric cars in Germany, as open data. Collected by Ampena from the providers' own price pages only.

<!-- stand-en -->As of 29 October 2026 (oldest value 22 October 2026): 32 tariffs from 19 providers.<!-- /stand-en -->

All prices in euros including VAT, as stated on the provider's page; an empty field means the page does not state the value. Field names are German: `grundgebuehr_eur_monat` monthly fee, `ac_eur_kwh` / `dc_eur_kwh` / `hpc_eur_kwh` price per kWh for AC, DC and higher-power DC, `preise_gelten_bei` these prices apply only at this operator's stations, `andere_betreiber_*` price at other operators (highest value if the provider states a range), `blockiergebuehr` idle fee, `gueltig_bis` end of a promotional price, `stand` date we read and checked the price on the provider's page, `quelle_url` provider's price page, `hinweis` notes.

Not included: tariffs whose price varies by station or operator, prices without a contract (ad hoc), values from comparison sites.

No guarantee. Prices change often; the provider's page and the price shown before charging are authoritative. Found an error? Please open a GitHub issue with provider, tariff, correct value and a link to the provider's page.

Licence: data under CC BY 4.0 (`LICENSE`), attribution: „Ladekarten-Tarife (Ampena), https://github.com/jonasdannenmaier/ladekarten-tarife, Lizenz: CC BY 4.0“. Code under MIT (`LICENSE-CODE`).
