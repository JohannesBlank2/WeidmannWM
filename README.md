# Weidmann WM - Spieleshow-App

Lokale Spieleshow fuer 5 Einzelspieler. Ein Windows-Laptop ist Server,
TV/Beamer zeigt `/display`, jeder Spieler nutzt `/play` auf dem Handy, und die
Show wird ueber `/admin` gesteuert. Alles laeuft im lokalen WLAN ohne
Build-Schritt.

## Schnellstart

```bat
start.bat
stop.bat
```

Beim Start zeigt das Terminal lokale IP, fertige URLs und QR-Codes fuer `/play`
und `/admin`.

## Ansichten

| URL | Zweck |
| --- | --- |
| `/` | Startseite mit Links und QR-Codes |
| `/display/` | TV/Beamer: Rangliste, Rundenstatus, Spin, Spielinfos, Buzzer-Feedback |
| `/play/` | Handy-Ansicht: Spieler beitreten, Kategorie waehlen, Spin ausloesen, Spielcontent |
| `/admin/` | Steuerung: Ablauf, Coins, Buzzer, Spieler, Spiele |

## Architektur

```text
server/
  index.js     Express/Socket.IO-Start, statische Dateien, QR-Codes
  state.js     Zentrale State-Maschine, Rundenlogik, Spin, Persistenz
  registry.js  Laedt alle Spiele aus /games und normalisiert Metadaten
  sockets.js   Socket.IO-Events fuer Admin, Handy, Buzzer und Spiele
  network.js   Lokale IP ermitteln
public/
  display/     TV-Ansicht
  play/        Handy-Ansicht
  admin/       Admin-Ansicht
  shared/      Gemeinsamer Socket-Client, Game-Loader, CSS
games/
  buzzer-test/ Demo-/Platzhalterspiel
  ...          Ein Ordner pro Spiel
assets/        Medien
state.json     Persistenter Runtime-State, wird automatisch erzeugt
```

Der Server ist die Single Source of Truth. Jede Aenderung am State wird per
Socket.IO als `state` an alle Clients gesendet und regelmaessig in `state.json`
geschrieben.

## Rundenablauf

Es gibt 5 Runden fuer 5 Einzelspieler. In Runde 1 ist Spieler 1 dran, in Runde 2
Spieler 2, usw. Jeder Spieler waehlt einmal eine Kategorie.

Kategorien:

- `sport`
- `skill` / Geschicklichkeit
- `quiz`

Der Ablauf pro Runde:

1. Runde und auswaehlender Spieler werden auf dem TV angezeigt.
2. Admin oeffnet die Kategorie-Auswahl.
3. Der auswaehlende Spieler waehlt auf dem Handy eine Kategorie.
4. Die Registry legt bis zu drei ungespielte Spiele dieser Kategorie in den Spin.
5. Der Spieler drueckt auf dem Handy `SPIN`.
6. Die TV-Ansicht zeigt den Gluecksrad-/Slot-Spin und lost serverseitig ein Spiel aus.
7. Nach der Auslosung setzen die Spieler auf dem Handy geheim 0 bis 50 Coins auf
   einen Mitspieler.
8. Admin startet das ausgeloste Spiel.
9. Beim Beenden wird das Spiel als gespielt markiert und spaeter nicht mehr vorgeschlagen.
10. Admin traegt die Platzierungen 1 bis 5 ein und wendet die Auszahlung an.

Phasen:

```text
lobby -> runden-uebersicht -> kategorie-auswahl -> spin-bereit
-> spin-laeuft -> wetten -> spiel-aktiv -> auswertung -> finale
```

## Coins

- Jeder Spieler startet mit `50` Coins.
- Nach jedem Spiel vergibt die Platzierung Coins:
  - 1. Platz: `50`
  - 2. Platz: `40`
  - 3. Platz: `30`
  - 4. Platz: `20`
  - 5. Platz: `10`
- Vor dem Spiel setzt jeder Spieler geheim `0` bis `50` Coins auf einen
  Mitspieler. Der Einsatz ist maximal der aktuelle Coinstand und maximal `50`.
- Trifft der Tipp auf den Spielsieger, gibt es den Einsatz als Gewinn dazu.
  Liegt der Tipp falsch, wird der Einsatz abgezogen.
- `player.score`: persistenter Coinstand.
- `player.gameScore`: temporaere Platzpunkte fuer die aktive Auswertung.

## Neues Spiel fertigstellen

1. Einen Ordner unter `games/<id>/` anlegen oder einen vorhandenen Platzhalter nutzen.
2. `game.js` mit der Struktur exportieren:

```js
module.exports = {
  id: 'mein-spiel',
  mode: 'single', // Legacy-Metadatum; wird im neuen Spin-Ablauf nicht gefiltert
  category: 'sport', // 'sport' | 'skill' | 'quiz'
  title: 'Mein Spiel',
  responsiblePerson: 'Name',
  description: 'Kurze Beschreibung.',
  rules: 'Regeln fuer die Runde.',
  materials: ['Material 1', 'Material 2'],
  hasBeenPlayed: false,
  selectable: true, // true = kann wirklich ausgelost werden; fehlt/false = nur Decoy im Rad
  interaktionstyp: 'buzzer', // buzzer | multiple-choice | karte | schaetzen | keine
  built: true,
  onStart(ctx) {},
  onStop(ctx) {},
  onAction(ctx, client, action) {},
};
```

3. Optional `display.js` und `play.js` im selben Ordner anlegen. Sie registrieren
   sich mit `GameRegistry.register('<id>', { mount, update, unmount })`.
4. Server neu starten. Das Spiel erscheint automatisch im passenden Kategorie-Pool.

Solange `built: false` gesetzt ist, laedt die UI das Demo-Spiel `buzzer-test` als
Platzhalter. Nur Spiele mit `selectable: true` koennen vom Spin wirklich
ausgelost werden; alle anderen bleiben als Decoys im Rad sichtbar. Der Kern muss
fuer neue Spiele nicht angepasst werden.
