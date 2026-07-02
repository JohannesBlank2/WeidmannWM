GameRegistry.register('musik-erraten', {
  mount(container) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <b>Musik erraten</b><br/>
        <span class="muted">Wenn der Buzzer freigegeben ist, kannst du deine Antwort sichern.</span>
        <div id="musik-play-score" class="muted" style="margin-top:10px;font-weight:800;"></div>
      </div>`;
  },

  update(state) {
    const scoreEl = document.getElementById('musik-play-score');
    if (!scoreEl) return;
    const me = window.App && window.App.me ? window.App.me(state) : null;
    const playerId = me && me.playerId;
    const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
    const scores = raw.playerScores && typeof raw.playerScores === 'object' ? raw.playerScores : {};
    const score = playerId ? Number(scores[playerId]) || 0 : 0;
    const target = Number(raw.targetScore) || 5;
    scoreEl.textContent = playerId ? `Dein Stand: ${score}/${target}` : '';
  },

  unmount(container) {
    container.innerHTML = '';
  },
});
