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
  id: 'fussballbowling',
  mode: 'single',
  category: 'sport',
  title: 'Fussballbowling',
  responsiblePerson: 'TBD',
  difficulty: 1,
  description: 'Kegeln mit einem Fussball.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Fussball', 'Kegel oder Flaschen'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
