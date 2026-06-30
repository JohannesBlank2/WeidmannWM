/* Demo-Spiel "Buzzer-Test" — Handy-Modul.
 * Der zentrale Buzzer wird bereits von der Handy-Ansicht gerendert.
 * Dieses Modul ergaenzt nur einen kurzen Hinweis ueber dem Buzzer und
 * beweist, dass auch fuer /play modul-spezifischer Inhalt moeglich ist.
 */
GameRegistry.register('buzzer-test', {
  mount(container) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <b>🔔 Buzzer-Test</b><br/>
        <span class="muted">Sobald der Buzzer frei ist: so schnell wie moeglich druecken!</span>
      </div>`;
  },
  update() {},
  unmount(container) { container.innerHTML = ''; },
});
