'use strict';

/**
 * DEMO-SPIEL "Buzzer-Test".
 *
 * Beweist, dass das Modul-System funktioniert. Nutzt den zentralen Buzzer.
 * Server-Hooks sind optional — hier zeigen wir nur, wie man sie verwendet.
 *
 * So legt man ein NEUES Spiel an:
 *   1. Neuen Ordner unter /games/<meine-id>/ erstellen.
 *   2. game.js mit diesem Schema exportieren.
 *   3. Optional display.js / play.js für eigene TV-/Handy-Ansichten.
 *   -> Server beim Nächsten Start neu laden, fertig. Kein Kern-Eingriff.
 */
module.exports = {
  id: 'buzzer-test',
  mode: ['single', 'group'],
  category: 'quiz',
  title: 'Buzzer-Test',
  responsiblePerson: 'System',
  description: 'Demo- und Platzhalterspiel für noch nicht gebaute Spiele.',
  rules: 'Admin gibt den Buzzer frei. Der zuerst buzzernde Spieler wird erfasst.',
  materials: [],
  hasBeenPlayed: false,
  interaktionstyp: 'buzzer',
  built: true, // echtes Demo-Modul
  demo: true, // Platzhalter für alle built:false-Spiele; NICHT im Pick-Pool
  assets: null,

  // Wird aufgerufen, wenn der Admin das Spiel startet.
  onStart(ctx) {
    ctx.setGameState({ runde: 1, gestartet: Date.now() });
    // Buzzer bewusst gesperrt lassen — der Admin gibt ihn manuell frei.
    ctx.lockBuzzer();
  },

  // Wird beim Beenden aufgerufen.
  onStop(ctx) {
    ctx.resetBuzzer();
  },

  // Optionale Reaktion auf Aktionen (hier: Buzz protokollieren).
  onAction(ctx, client, action) {
    if (action.type === 'buzz') {
      // Beispiel: man könnte hier automatisch Punkte vergeben o. ä.
      // Wir lassen die Punktvergabe bewusst beim Admin.
    }
  },
};
