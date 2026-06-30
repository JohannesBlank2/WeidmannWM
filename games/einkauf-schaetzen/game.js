'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'einkauf-schaetzen',
  mode: 'single',
  category: 'skill',
  title: 'How much is the fish',
  responsiblePerson: 'TBD',
  description: 'Preise oder Werte muessen moeglichst genau geschaetzt werden.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Schaetzobjekte', 'Preisloesung'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
