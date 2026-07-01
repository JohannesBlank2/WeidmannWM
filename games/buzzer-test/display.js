/* Demo-/Platzhalter-Modul — Display (TV/Beamer).
 * Wird für ALLE built:false-Spiele geladen und zeigt deren Namen dynamisch.
 * Beweist den End-to-End-Ablauf inkl. zentralem Buzzer.
 */
GameRegistry.register('buzzer-test', {
  mount(container, ctx) {
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = `
      <div style="text-align:center;">
        <div id="bt-name" style="font-size:2.6rem;font-weight:800;margin-bottom:4px;">Spiel</div>
        <div class="muted" style="font-size:1.1rem;margin-bottom:6px;">
          🚧 Platzhalter (Demo) — Spiel noch nicht gebaut. Buzzer funktioniert.
        </div>
        <div id="bt-status" style="font-size:2rem;font-weight:700;margin-top:16px;"></div>
        <div id="bt-order" style="margin-top:18px;font-size:1.4rem;"></div>
      </div>`;
  },

  update(state, ctx) {
    const nameEl = document.getElementById('bt-name');
    const statusEl = document.getElementById('bt-status');
    const orderEl = document.getElementById('bt-order');
    if (!statusEl) return;

    if (nameEl && state.activeGame) {
      nameEl.textContent = `🔔 ${state.activeGame.name}`;
    }

    const map = {
      locked: ['🔒 gesperrt', '#8b95a7'],
      armed: ['🟢 FREI — buzzern!', '#ffd60a'],
      resolved: ['Aufgelöst', '#8b95a7'],
    };
    const [txt, col] = map[state.buzzer.status] || ['—', '#fff'];
    statusEl.textContent = txt;
    statusEl.style.color = col;

    const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
    orderEl.innerHTML = state.buzzer.presses
      .map((p) => {
        const player = byId[p.playerId];
        return `<div style="color:${player ? player.color : '#fff'}">${p.order}. ${player ? player.name : p.playerId}</div>`;
      })
      .join('');
  },

  unmount(container) {
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});
