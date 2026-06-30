'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'ferngesteuerte-scharade',
  mode: 'group',
  category: 'skill',
  title: 'Ferngesteuerte Scharade',
  responsiblePerson: 'TBD',
  description: 'Ein Spieler wird angeleitet und stellt Begriffe dar.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Begriffskarten'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
