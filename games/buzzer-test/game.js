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
 *   3. Optional display.js / play.js fuer eigene TV-/iPad-Ansichten.
 *   -> Server beim Naechsten Start neu laden, fertig. Kein Kern-Eingriff.
 */
module.exports = {
  id: 'buzzer-test',
  name: 'Buzzer-Test',
  kategorie: 'quiz',
  schwierigkeit: 1,
  interaktionstyp: 'buzzer',
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
      // Beispiel: man koennte hier automatisch Punkte vergeben o.ae.
      // Wir lassen die Punktvergabe bewusst beim Admin.
    }
  },
};
