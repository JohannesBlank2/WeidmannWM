/* Demo-Spiel "Buzzer-Test" — Handy-Modul.
 * Der zentrale Buzzer wird bereits von der Handy-Ansicht gerendert.
 * Dieses Modul ergänzt nur einen kurzen Hinweis über dem Buzzer und
 * beweist, dass auch für /play modul-spezifischer Inhalt möglich ist.
 */
GameRegistry.register('buzzer-test', {
  mount(container) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <b>🔔 Buzzer-Test</b><br/>
        <span class="muted">Sobald der Buzzer frei ist: so schnell wie möglich drücken!</span>
      </div>`;
  },
  update() {},
  unmount(container) { container.innerHTML = ''; },
});
