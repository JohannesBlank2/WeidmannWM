/* Admin-Overlay für IRL-Chip-Einsätze.
 *
 * Grundidee:
 * - Spieler wählen am Handy nur noch, AUF WEN sie setzen.
 * - Die echten Chips werden vor den Spielern gelegt.
 * - Der Admin trägt hier nur den real gelegten Betrag ein.
 * - Nach dem Spiel wählt der Admin den Spielsieger für die Tipp-Auszahlung.
 */
(function () {
  const pickerArea = document.getElementById('picker-area');
  if (!pickerArea || !window.App) return;

  injectStyles();

  App.onState((state) => {
    if (!state) return;
    if (state.phase === 'wetten') {
      renderIrlBettingAdmin(state);
    }
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

  function renderWinnerPayoutAdmin(state) {
    const round = state.round || {};
    const bets = round.bets || {};
    const game = round.selectedGame;
    const gameTitle = game ? game.title || game.name : 'Spiel';
    const winnerId = round.betWinnerPlayerId || null;
    const payoutApplied = round.payoutApplied === true;
    const summary = Array.isArray(round.payoutSummary) ? round.payoutSummary : [];

    pickerArea.innerHTML = `
      <div class="game-detail">
        <div class="lbl">Tipp-Auszahlung</div>
        <h3 style="margin:6px 0 4px;">${esc(gameTitle)}</h3>
        <div class="muted">Wähle den Spielsieger. Richtige Tipps bekommen den Einsatz × 2 zurück. Falsche Tipps bekommen nichts zurück.</div>
      </div>
      <div class="game-detail" style="margin-top:10px;">
        <b>Wer hat das Spiel gewonnen?</b>
        <div class="admin-winner-grid">
          ${state.players.map((player) => `
            <button class="admin-winner-btn ${winnerId === player.id ? 'selected' : ''}" style="--pc:${player.color}" data-bet-winner="${player.id}" ${payoutApplied ? 'disabled' : ''}>
              ${esc(player.name)}
            </button>`).join('')}
        </div>
      </div>
      <div class="game-detail" style="margin-top:10px;">
        <b>Tipps & Auszahlung</b>
        <div class="muted">Netto bedeutet: Einsatz aus dem digitalen Stand raus/rein. Beispiel 40 gesetzt und richtig = 80 zurück, netto +40.</div>
        <div class="spin-admin-list">
          ${state.players.map((player) => payoutPreviewRow(state, player, bets[player.id], winnerId, payoutApplied, summary)).join('')}
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <button class="good" data-apply-bet-payouts ${winnerId && !payoutApplied ? '' : 'disabled'}>
          ${payoutApplied ? 'Auszahlung angewendet' : 'Tipp-Auszahlung anwenden'}
        </button>
        <button data-next-round>Weiter zur nächsten Runde</button>
      </div>`;

    pickerArea.querySelectorAll('[data-bet-winner]').forEach((button) => {
      button.onclick = () => App.socket.emit('admin:set-bet-winner', { playerId: button.dataset.betWinner });
    });
    const apply = pickerArea.querySelector('[data-apply-bet-payouts]');
    if (apply) apply.onclick = () => App.socket.emit('admin:apply-bet-payouts');
    const next = pickerArea.querySelector('[data-next-round]');
    if (next) next.onclick = () => App.socket.emit('admin:next-round');
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

  function payoutPreviewRow(state, player, bet, winnerId, payoutApplied, summary) {
    const target = bet && bet.targetPlayerId ? playerById(state, bet.targetPlayerId) : null;
    const amount = bet && Number.isFinite(Number(bet.amount)) ? Number(bet.amount) : 0;
    const summaryRow = summary.find((row) => row.playerId === player.id);
    const won = payoutApplied
      ? Boolean(summaryRow && summaryRow.betWon)
      : Boolean(winnerId && target && target.id === winnerId && amount > 0);
    const payoutReturn = payoutApplied && summaryRow
      ? Number(summaryRow.payoutReturn) || 0
      : won ? amount * 2 : 0;
    const net = payoutApplied && summaryRow
      ? Number(summaryRow.betDelta) || 0
      : amount > 0 ? (won ? amount : -amount) : 0;
    const status = !target
      ? 'kein Tipp'
      : !winnerId
        ? 'wartet auf Sieger'
        : won
          ? `richtig · ${payoutReturn} zurück`
          : 'falsch · 0 zurück';

    return `
      <div class="game-detail mini admin-bet-row ${won ? 'won' : ''}">
        <div class="admin-bet-row-head">
          <b style="color:${player.color}">${esc(player.name)}</b>
          <span class="admin-bet-target ${won ? 'goodish' : 'open'}">${esc(status)}</span>
        </div>
        <div class="admin-bet-input-line">
          <span>Tipp: <b>${target ? esc(target.name) : '-'}</b></span>
          <span>Einsatz: <b>${amount}</b></span>
          <span>Netto: <b>${net >= 0 ? '+' : ''}${net}</b></span>
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
      .admin-bet-row.won { border-color: var(--good); box-shadow: 0 0 0 1px rgba(56,176,0,.22) inset; }
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
      .admin-winner-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
      .admin-winner-btn {
        border: 1px solid var(--line); background: var(--panel); color: var(--text);
        border-radius: 8px; padding: 12px; font: inherit; font-weight: 900;
      }
      .admin-winner-btn.selected {
        border-color: var(--pc); color: #fff8df;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--pc) 55%, transparent), 0 0 22px color-mix(in srgb, var(--pc) 45%, transparent);
        background: linear-gradient(180deg, rgba(255,209,92,.18), rgba(18,7,10,.8));
      }
      @media (max-width: 560px) { .admin-winner-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
