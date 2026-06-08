/* Demo-Spiel "Buzzer-Test" — Display-Modul (TV/Beamer).
 * Registriert sich in der Client-GameRegistry. Der game-loader laedt diese
 * Datei automatisch, sobald das Spiel aktiv wird.
 */
GameRegistry.register('buzzer-test', {
  mount(container, ctx) {
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:2.6rem;font-weight:800;margin-bottom:6px;">🔔 Buzzer-Test</div>
        <div class="muted" style="font-size:1.2rem;margin-bottom:24px;">
          Admin gibt den Buzzer frei — wer zuerst drueckt, gewinnt.
        </div>
        <div id="bt-status" style="font-size:2rem;font-weight:700;"></div>
        <div id="bt-order" style="margin-top:20px;font-size:1.4rem;"></div>
      </div>`;
  },

  update(state, ctx) {
    const statusEl = document.getElementById('bt-status');
    const orderEl = document.getElementById('bt-order');
    if (!statusEl) return;

    const map = { locked: ['🔒 gesperrt', '#8b95a7'], armed: ['🟢 FREI — buzzern!', '#ffd60a'], resolved: ['Aufgeloest', '#8b95a7'] };
    const [txt, col] = map[state.buzzer.status] || ['—', '#fff'];
    statusEl.textContent = txt;
    statusEl.style.color = col;

    const byId = Object.fromEntries(state.teams.map((t) => [t.id, t]));
    orderEl.innerHTML = state.buzzer.presses.map((p) => {
      const t = byId[p.teamId];
      return `<div style="color:${t ? t.color : '#fff'}">${p.order}. ${t ? t.name : p.teamId}</div>`;
    }).join('');
  },

  unmount(container) {
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});
