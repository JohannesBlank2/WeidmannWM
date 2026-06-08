# 🏆 Weidmann WM — Spieleshow-App

Lokale Spieleshow für 4 Teams (Geburtstag). Ein Windows-Laptop ist Server,
TV/Beamer zeigt `/display`, jedes Team hat ein iPad auf `/play`, gesteuert über `/admin`.
Alles im lokalen WLAN, **kein Internet nötig**.

## Schnellstart

```
start.bat      → installiert (falls nötig) und startet den Server
stop.bat       → beendet den Server (Port 3000)
```

Beim Start zeigt das Terminal die **lokale IP**, die **URLs** und **QR-Codes**
für `/play` und `/admin`.

## Ansichten

| URL         | Gerät        | Zweck                                            |
|-------------|--------------|--------------------------------------------------|
| `/`         | beliebig     | Startseite mit Links + QR-Codes                  |
| `/display/` | TV / Beamer  | Punktetabelle, Content, Buzzer-Anzeige + Sound   |
| `/play/`    | iPads        | Team wählen, Buzzer, spielspezifische Eingaben   |
| `/admin/`   | Handy/iPad   | Phasen, Buzzer, Punkte, Teams, Spiele, Geräte    |

## Architektur (Kurzfassung)

```
server/        Node + Express + Socket.IO
  index.js     Start, statische Auslieferung, QR, Banner
  state.js     Zentrale State-Maschine + Persistenz (state.json)
  registry.js  Lädt automatisch alle Spiele aus /games
  sockets.js   Alle Echtzeit-Events (Buzzer, Punkte, Phasen, Spiele)
  network.js   Lokale IP ermitteln
public/
  display/ play/ admin/   die drei Ansichten (Vanilla HTML/CSS/JS, kein Build)
  shared/  client.js (Socket+clientId), game-loader.js (Modul-System), style.css
games/
  buzzer-test/  Demo-Spiel (game.js + display.js + play.js)
assets/        Medien (Videos/Bilder/Audio)
state.json     Persistierter Zustand (Crash-Schutz) — wird automatisch erzeugt
```

**Single Source of Truth:** Der Server hält den kompletten Zustand und sendet ihn
per `state`-Broadcast an alle Clients. Clients rendern nur aus diesem State.
Punkte/Teams werden gedrosselt atomar in `state.json` geschrieben.

**Buzzer:** Der Server vergibt den Timestamp beim Empfang (fair) und merkt sich die
Reihenfolge. Pro Team zählt nur der erste Buzz.

**Reconnect:** Jeder Client hat eine `clientId` in `localStorage`. Nach iPad-Standby
verbindet Socket.IO automatisch neu und stellt Team + Punktestand wieder her.

## Neues Spiel hinzufügen (ohne Kern-Eingriff)

1. Ordner `games/mein-spiel/` anlegen.
2. `game.js` exportieren:
   ```js
   module.exports = {
     id: 'mein-spiel',
     name: 'Mein Spiel',
     kategorie: 'sport',          // sport | quiz | geschicklichkeit | gruppe
     schwierigkeit: 2,            // 1–3 Sterne
     interaktionstyp: 'multiple-choice', // buzzer | multiple-choice | karte | schaetzen | keine
     onStart(ctx) {}, onStop(ctx) {}, onAction(ctx, client, action) {}, // optional
   };
   ```
3. Optional `display.js` (TV) und `play.js` (iPad), die sich via
   `GameRegistry.register('mein-spiel', { mount, update, unmount })` registrieren.
   Diese werden automatisch nachgeladen, sobald der Admin das Spiel startet.
4. Server neu starten → das Spiel erscheint im Admin. Fertig.

Siehe `games/buzzer-test/` als Vorlage.
