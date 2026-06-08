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
  id: 'wer-bin-ich',
  mode: 'single',
  category: 'quiz',
  title: 'Wer bin ich',
  responsiblePerson: 'TBD',
  difficulty: 1,
  description: 'Eine Person oder Figur muss durch Hinweise erraten werden.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Begriffe oder Karten'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
