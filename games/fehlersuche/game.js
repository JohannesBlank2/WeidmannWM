'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'fehlersuche',
  mode: 'single',
  category: 'quiz',
  title: '2016?',
  responsiblePerson: 'TBD',
  description: 'Quizrunde rund um das Jahr 2016.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Fragen zu 2016'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
