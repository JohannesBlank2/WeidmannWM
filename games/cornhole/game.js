'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'cornhole',
  mode: 'single',
  category: 'sport',
  title: 'Cornhole',
  responsiblePerson: 'TBD',
  description: 'Wurfspiel auf ein Zielbrett mit Loch.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Cornhole-Board', 'Wurfsaeckchen'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
