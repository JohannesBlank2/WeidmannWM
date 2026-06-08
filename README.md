# Weidmann WM - Spieleshow-App

Lokale Spieleshow fuer 4 Teams. Ein Windows-Laptop ist Server, TV/Beamer zeigt
`/display`, jedes Team nutzt `/play` auf einem iPad, und die Show wird ueber
`/admin` gesteuert. Alles laeuft im lokalen WLAN ohne Build-Schritt.

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
| `/display/` | TV/Beamer: Rangliste, Spielinfos, Buzzer-Feedback |
| `/play/` | iPads: Team beitreten, Kategorie/Spiel waehlen, Buzzer, Eingaben |
| `/admin/` | Steuerung: Ablauf, Punkte, Buzzer, Teams, Spieler, Spiele |

## Architektur

```text
server/
  index.js     Express/Socket.IO-Start, statische Dateien, QR-Codes
  state.js     Zentrale State-Maschine, Rundenlogik, Persistenz
  registry.js  Laedt alle Spiele aus /games und normalisiert Metadaten
  sockets.js   Socket.IO-Events fuer Admin, Player, Buzzer und Spiele
  network.js   Lokale IP ermitteln
public/
  display/     TV-Ansicht
  play/        iPad-Ansicht
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

Die App bestimmt den Modus automatisch:

- Runde 1: `single`
- Runde 2: `group`
- Runde 3: `single`
- Runde 4: `group`
- usw.

Die Pick-Reihenfolge ist `1-2-3-4-4-3-2-1`. Der Ablauf pro Runde:

1. Runde, Modus und auswaehlendes Team werden angezeigt.
2. Das auswaehlende Team waehlt eine Kategorie: `sport`, `skill`, `quiz`.
3. Die Registry liefert bis zu drei ungespielte Spiele passend zu Modus und Kategorie.
4. Das Team waehlt ein Spiel.
5. Die Detailansicht zeigt Titel, Verantwortliche Person, Schwierigkeit, Beschreibung, Material und Regeln.
6. Der Startbutton startet das Spiel. Bei `single` kommt vorher die Spielerauswahl.
7. Beim Beenden wird das Spiel als gespielt markiert und spaeter nicht mehr vorgeschlagen, solange ungespielte Alternativen verfuegbar sind.

Phasen:

```text
lobby -> runden-uebersicht -> kategorie-auswahl -> spiel-auswahl
-> spiel-details -> spielerauswahl (nur single) -> spiel-aktiv
-> auswertung -> bonus -> finale
```

## Punkte

- `team.score`: persistente Gesamtpunkte, Admin vergibt sie per +1/-1.
- `team.gameScore`: temporaere Spielpunkte fuer das aktive Spiel, getrennt von der Gesamtwertung.

## Neues Spiel fertigstellen

1. Einen Ordner unter `games/<id>/` anlegen oder einen vorhandenen Platzhalter nutzen.
2. `game.js` mit der neuen Struktur exportieren:

```js
module.exports = {
  id: 'mein-spiel',
  mode: 'single', // 'single' | 'group' | ['single', 'group']
  category: 'sport', // 'sport' | 'skill' | 'quiz'
  title: 'Mein Spiel',
  responsiblePerson: 'Name',
  difficulty: 2,
  description: 'Kurze Beschreibung.',
  rules: 'Regeln fuer die Runde.',
  materials: ['Material 1', 'Material 2'],
  hasBeenPlayed: false,
  interaktionstyp: 'buzzer', // buzzer | multiple-choice | karte | schaetzen | keine
  built: true,
  onStart(ctx) {},
  onStop(ctx) {},
  onAction(ctx, client, action) {},
};
```

3. Optional `display.js` und `play.js` im selben Ordner anlegen. Sie registrieren
   sich mit `GameRegistry.register('<id>', { mount, update, unmount })`.
4. Server neu starten. Das Spiel erscheint automatisch im passenden Pool.

Solange `built: false` gesetzt ist, laedt die UI das Demo-Spiel `buzzer-test` als
Platzhalter. Der Kern muss fuer neue Spiele nicht angepasst werden.
