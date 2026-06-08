'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'schneid-in-die-haelfte',
  mode: 'single',
  category: 'skill',
  title: 'Schneid in die Haelfte',
  responsiblePerson: 'TBD',
  description: 'Ein Objekt oder eine Vorlage soll moeglichst genau halbiert werden.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Vorlage', 'Schneidewerkzeug'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
