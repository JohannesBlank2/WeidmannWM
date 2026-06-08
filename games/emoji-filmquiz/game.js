'use strict';

/**
 * Pool-Spiel (Platzhalter). Solange built:false, laedt die Auswahl das
 * Demo-Spiel (buzzer-test) als Platzhalter -> der Ablauf funktioniert komplett.
 *
 * FERTIGSTELLEN: built auf true setzen und in DIESEM Ordner display.js + play.js
 * anlegen (siehe games/buzzer-test/ als Vorlage). Optional interaktionstyp/
 * interaktionstyp anpassen. Kein Eingriff in den Kern noetig.
 */
module.exports = {
  id: 'emoji-filmquiz',
  mode: 'group',
  category: 'quiz',
  title: 'Emoji Filmquiz',
  responsiblePerson: 'TBD',
  description: 'Mehrere Filmtitel werden nur durch Emojis dargestellt. Die Teams muessen erraten, welcher Film gemeint ist.',
  rules: 'Teams nennen oder buzzern den gesuchten Filmtitel. Die genaue Wertung wird beim Ausbau des Spiels festgelegt.',
  materials: ['Emoji-Filmraetsel', 'Loesungsliste'],
  hasBeenPlayed: false,
  interaktionstyp: 'keine',
  built: false,
};
