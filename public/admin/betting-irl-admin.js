/* Admin-Overlay für IRL-Chip-Einsätze.
 *
 * Grundidee:
 * - Spieler wählen am Handy nur noch, AUF WEN sie setzen.
 * - Die echten Chips werden vor den Spielern gelegt.
 * - Der Admin trägt hier nur den real gelegten Betrag ein.
 *
 * Diese Datei rendert bewusst nur in Phase "wetten" über den normalen
 * Admin-Wettbereich drüber. Dadurch bleibt admin.js unverändert.
 */
(function () {
  const pickerArea = document.getElementById('picker-area');
  if (!pickerArea || !window.App) return;

  injectStyles();

  App.onState((state) => {
    if (!state || state.phase !== 'wetten') return;
    renderIrlBettingAdmin(state);
  });

  function renderIrlBettingAdmin(state) {
    const round = state.round || {};
    const bets = round.bets || {};
    const betCount = round.betCount || 0;
    const betTotal = round.betTotal || state.players.length;
    const betsRevealed = round.betsRevealed === true;
    const game = round.selectedGame;
    const gameTitle = game ? game.title || game.name : 'Spiel';

    pickerArea.innerHTML = `
      <div class="game-detail">
        <div class="lbl">IRL-Chip-Einsätze</div>
        <h3 style="margin:6px 0 4px;">${esc(gameTitle)}</h3>
        <div class="muted">
          Handy: Spieler wählen nur den Tipp-Spieler. Chips liegen IRL vor ihnen.
          Hier trägst du den tatsächlich gesetzten Betrag ein.
        </div>
      </div>
      <div class="game-detail" style="margin-top:10px;">
        <b>Wettschein-Status</b>
        <div class="muted">${betCount}/${betTotal} Spieler haben einen Tipp gewählt. Betrag 0 zählt als kein Einsatz.</div>
        <div class="spin-admin-list">
          ${state.players.map((player) => betRow(state, player, bets[player.id])).join('')}
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <button class="${betsRevealed ? '' : 'primary'}" data-toggle-bets-revealed>
          ${betsRevealed ? 'Einsätze wieder verdecken' : 'Einsätze auf TV aufdecken'}
        </button>
        <button class="good" data-start-picked>Spiel starten</button>
        <button data-backcat>Zurück zur Kategorie-Auswahl</button>
      </div>`;

    pickerArea.querySelectorAll('[data-admin-bet-amount]').forEach((input) => {
      input.onchange = () => {
        App.socket.emit('admin:set-bet-amount', {
          playerId: input.dataset.player,
          amount: Number(input.value) || 0,
        });
      };
    });

    pickerArea.querySelector('[data-toggle-bets-revealed]').onclick = () =>
      App.socket.emit('admin:set-bets-revealed', { revealed: !betsRevealed });
    pickerArea.querySelector('[data-start-picked]').onclick = () => App.socket.emit('admin:start-picked-game');
    pickerArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('admin:back-to-categories');
  }

  function betRow(state, player, bet) {
    const target = bet && bet.targetPlayerId ? playerById(state, bet.targetPlayerId) : null;
    const max = Math.min(50, Math.max(0, Number(player.score) || 0));
    const amount = bet && Number.isFinite(Number(bet.amount)) ? Number(bet.amount) : 0;
    const targetCopy = target
      ? `<span class="admin-bet-target goodish">Tipp: <b style="color:${target.color}">${esc(target.name)}</b></span>`
      : '<span class="admin-bet-target open">noch kein Tipp vom Handy</span>';
    const disabled = target ? '' : 'disabled';

    return `
      <div class="game-detail mini admin-bet-row">
        <div class="admin-bet-row-head">
          <b style="color:${player.color}">${esc(player.name)}</b>
          ${targetCopy}
        </div>
        <label class="admin-bet-input-label">IRL-Einsatz</label>
        <div class="admin-bet-input-line">
          <input
            type="number"
            min="0"
            max="${max}"
            step="1"
            value="${amount}"
            data-admin-bet-amount
            data-player="${player.id}"
            ${disabled}
          />
          <span>Coins</span>
          <span class="muted">max. ${max}</span>
        </div>
      </div>`;
  }

  function playerById(state, playerId) {
    return state.players.find((player) => player.id === playerId) || null;
  }

  function injectStyles() {
    if (document.getElementById('admin-irl-betting-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-irl-betting-styles';
    style.textContent = `
      .admin-bet-row { display: grid; gap: 8px; }
      .admin-bet-row-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .admin-bet-target { font-weight: 800; }
      .admin-bet-target.goodish { color: var(--good); }
      .admin-bet-target.open { color: var(--muted); }
      .admin-bet-input-label { color: var(--muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
      .admin-bet-input-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .admin-bet-input-line input {
        width: 105px; background: var(--panel); border: 1px solid var(--line);
        color: var(--text); border-radius: 8px; padding: 10px; font: inherit; font-weight: 900;
      }
      .admin-bet-input-line input:disabled { opacity: .45; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
