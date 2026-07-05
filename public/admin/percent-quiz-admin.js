/* Admin-Startpanel für das Bonusspiel Das Prozent-Quiz (1%-Quiz). */
(function () {
  const root = document.getElementById('percent-quiz-admin');
  if (!root || !window.App) return;

  const GAME_ID = 'das-prozent-quiz';

  injectStyles();

  App.onState((state) => {
    render(state);
  });

  function render(state) {
    const activeGame = state.activeGame || null;
    const isRunning = Boolean(activeGame && activeGame.id === GAME_ID);
    const otherGame = activeGame && activeGame.id !== GAME_ID ? activeGame : null;

    if (isRunning) {
      root.innerHTML = `
        <div class="percent-start-panel">
          <div class="percent-start-status running">
            <b>Bonusspiel läuft</b>
            <span>Die Steuerung (Fragen, Clips, Einsätze) findest du oben im Bereich „Ablauf" beim aktiven Spiel.</span>
          </div>
          <button class="bad" data-percent-stop>Bonusspiel beenden → Auswertung</button>
        </div>`;
    } else {
      root.innerHTML = `
        <div class="percent-start-panel">
          <div class="percent-start-status">
            <b>Das Prozent-Quiz (1%-Quiz)</b>
            <span>${otherGame
              ? `Achtung: „${esc(otherGame.title || otherGame.name)}" läuft noch und wird beim Start ersetzt.`
              : 'Bonusspiel mit Videoclips, Einsätzen und Handy-Antworten.'}</span>
          </div>
          <button class="good" data-percent-start>▶ Bonusspiel starten</button>
        </div>`;
    }

    const start = root.querySelector('[data-percent-start]');
    if (start) {
      start.onclick = () => {
        if (otherGame && !confirm(`„${otherGame.title || otherGame.name}" läuft noch. Trotzdem das Bonusspiel starten?`)) {
          return;
        }
        App.socket.emit('admin:start-game', { gameId: GAME_ID });
      };
    }

    const stop = root.querySelector('[data-percent-stop]');
    if (stop) {
      stop.onclick = () => {
        if (confirm('Bonusspiel wirklich beenden? Es geht danach zur Auswertung.')) {
          App.socket.emit('admin:stop-game');
        }
      };
    }
  }

  function injectStyles() {
    if (document.getElementById('admin-percent-start-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-percent-start-styles';
    style.textContent = `
      .percent-start-panel { display: grid; gap: 10px; }
      .percent-start-status {
        display: grid; gap: 4px;
        background: rgba(18, 7, 10, .58); border: 1px solid var(--line);
        border-radius: 8px; padding: 10px 12px;
      }
      .percent-start-status.running { border-color: var(--good); }
      .percent-start-status span { color: var(--muted); font-size: .86rem; }
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
