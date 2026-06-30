'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'papierflieger',
  mode: 'group',
  category: 'skill',
  title: 'Papierflieger',
  responsiblePerson: 'TBD',
  description: 'Spieler bauen und werfen Papierflieger.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Papier', 'Messband oder Zielmarkierung'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
