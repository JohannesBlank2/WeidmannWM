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
  id: "wo-liegt-was",
  name: "Wo liegt was",
  kategorie: "quiz",
  modus: "gemeinsam",
  interaktionstyp: 'keine', // TBD beim Bauen
  // schwierigkeit: 1-3 (TBD)
  built: false,
};
