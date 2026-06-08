'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp/
 * schwierigkeit anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'bottleflip',
  mode: 'single',
  category: 'skill',
  title: 'Bottleflip',
  responsiblePerson: 'TBD',
  difficulty: 1,
  description: 'Eine Flasche muss geworfen und stehend gelandet werden.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Flaschen', 'Markierung'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
