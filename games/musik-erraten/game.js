'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'musik-erraten',
  mode: 'single',
  category: 'quiz',
  title: 'Shazam',
  responsiblePerson: 'TBD',
  description: 'Songs oder Ausschnitte muessen moeglichst schnell erkannt werden.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Musikclips', 'Lautsprecher'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
