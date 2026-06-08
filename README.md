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

**Zwei getrennte Punktesysteme:**
- **Gesamtpunkte** (`team.score`) — persistent, im Admin nur per **+1/-1**, in der
  Übersicht auf `/display` als Rangliste (Erster = 👑).
- **Spielpunkte** (`team.gameScore`) — nur fürs laufende Spiel, starten bei **0**,
  im Admin per +1/-1 und „auf 0", **keine** automatische Verrechnung mit der
  Gesamtwertung. Werden im Spiel-Modus von `/display` angezeigt.

**Runden-/Pick-Ablauf:** 8 Spiele. Modus wechselt jede Runde (einzeln/gemeinsam,
Start einzeln), Pick-Reihenfolge ist eine Snake **1-2-3-4-4-3-2-1**. Phasen:
`lobby → runden-uebersicht → kategorie-auswahl → spiel-auswahl (3 Spiele) →
spiel-aktiv → auswertung → (nächste Runde) → … → bonus → finale`.
Das auswählende Team wird auf seinem `/play`-iPad zur Kategorie-/Spielauswahl
aufgefordert (Server prüft, dass nur dieses Team wählt), die anderen warten.
Der Admin steuert alle Übergänge und kann stellvertretend wählen.

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
     modus: 'beide',              // 'einzeln' | 'gemeinsam' | 'beide' | ['einzeln','gemeinsam']
     schwierigkeit: 2,            // 1–3 Sterne
     interaktionstyp: 'multiple-choice', // buzzer | multiple-choice | karte | schaetzen | keine
     onStart(ctx) {}, onStop(ctx) {}, onAction(ctx, client, action) {}, // optional
   };
   ```
3. Optional `display.js` (TV) und `play.js` (iPad), die sich via
   `GameRegistry.register('mein-spiel', { mount, update, unmount })` registrieren.
   Diese werden automatisch nachgeladen, sobald der Admin das Spiel startet.
4. Server neu starten → das Spiel erscheint im Admin und automatisch im Pick-Pool
   seiner `kategorie` + `modus` (der Pick-Ablauf filtert die Registry danach und
   zeigt 3 passende Spiele zur Auswahl). Fertig.

Siehe `games/buzzer-test/` als Vorlage. Solange noch nicht genug echte Spiele pro
Kategorie/Modus registriert sind, füllt der Server die 3 Auswahlkarten mit dem
Demo-Spiel als Platzhalter auf — der Ablauf funktioniert also schon jetzt komplett.
