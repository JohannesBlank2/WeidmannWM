'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, lädt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp anpassen. Kein Eingriff in den Kern nötig.
 */
module.exports = {
  id: 'wo-liegt-was',
  mode: 'group',
  category: 'quiz',
  title: 'Wo liegt was',
  responsiblePerson: 'TBD',
  description: 'Orte oder Begriffe müssen auf einer Karte oder Skala eingeordnet werden.',
  rules: 'Die genaue Regelversion wird beim Ausbau des Spiels festgelegt.',
  materials: ['Karte oder Anzeige', 'Lösungen'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine', // TBD beim Bauen
  built: false,
};
