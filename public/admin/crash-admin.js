/* Admin-Konsole für das optionale Mini-Casino-Spiel Crash. */
(function () {
  const root = document.getElementById('crash-admin');
  if (!root || !window.App) return;

  injectStyles();

  App.onState((state) => {
    render(state);
  });

  function render(state) {
    const crash = state.crashGame || { phase: 'idle', multiplier: 1, players: {} };
    const phase = crash.phase || 'idle';

    if (phase === 'idle' || phase === 'finished') {
      root.innerHTML = `
        <div class="crash-admin-panel">
          <div class="muted">Keine Crash-Runde vorbereitet.</div>
          <button class="primary" data-crash-prepare>Crash vorbereiten</button>
        </div>`;
      wireStaticActions();
      return;
    }

    const rows = state.players.map((player) => crashRow(state, player, crash)).join('');
    const activeCount = state.players.filter((player) => crashEntry(crash, player.id).stake > 0).length;
    const totalStake = state.players.reduce((sum, player) => sum + crashEntry(crash, player.id).stake, 0);
    const startedCopy = phase === 'running'
      ? `läuft bei ${formatMultiplier(crash.multiplier)}`
      : phase === 'crashed'
        ? `gecrasht bei ${formatMultiplier(crash.crashPoint || crash.multiplier)}`
        : 'bereit';

    root.innerHTML = `
      <div class="crash-admin-panel">
        <div class="crash-admin-top">
          <div>
            <div class="crash-admin-kicker">Status</div>
            <b>${esc(startedCopy)}</b>
          </div>
          <div>
            <div class="crash-admin-kicker">Aktive Spieler</div>
            <b>${activeCount}/${state.players.length}</b>
          </div>
          <div>
            <div class="crash-admin-kicker">Einsatz gesamt</div>
            <b>${totalStake} Chips</b>
          </div>
        </div>
        ${phase === 'crashed' ? crashedSummary(crash) : ''}
        <div class="crash-admin-table">
          ${rows}
        </div>
        <div class="row">
          ${phase === 'ready' ? `<button class="good" data-crash-start ${activeCount ? '' : 'disabled'}>Runde starten</button>` : ''}
          ${phase === 'crashed' ? '<button class="primary" data-crash-prepare>Neue Crash-Runde vorbereiten</button>' : ''}
          <button class="bad" data-crash-reset>${phase === 'running' ? 'Runde abbrechen' : 'Runde zurücksetzen'}</button>
        </div>
      </div>`;

    root.querySelectorAll('[data-crash-stake]').forEach((input) => {
      input.onchange = () => {
        const amount = clampStake(input.value);
        input.value = amount;
        App.socket.emit('admin:crash-set-stake', {
          playerId: input.dataset.player,
          amount,
        });
      };
      input.onkeydown = (event) => {
        if (event.key === 'Enter') input.blur();
      };
    });

    wireStaticActions();
  }

  function wireStaticActions() {
    root.querySelectorAll('[data-crash-prepare]').forEach((button) => {
      button.onclick = () => App.socket.emit('admin:crash-prepare');
    });

    const start = root.querySelector('[data-crash-start]');
    if (start) start.onclick = () => App.socket.emit('admin:crash-start');

    const reset = root.querySelector('[data-crash-reset]');
    if (reset) {
      reset.onclick = () => {
        const state = App.getState();
        const running = state && state.crashGame && state.crashGame.phase === 'running';
        if (!running || confirm('Laufende Crash-Runde wirklich abbrechen?')) {
          App.socket.emit('admin:crash-reset');
        }
      };
    }
  }

  function crashRow(state, player, crash) {
    const entry = crashEntry(crash, player.id);
    const phase = crash.phase || 'idle';
    const readonly = phase !== 'ready';
    const status = statusLabel(entry, phase);
    const cashout = entry.cashoutMultiplier ? formatMultiplier(entry.cashoutMultiplier) : '-';
    const payout = entry.stake > 0 ? `${entry.payout || 0} Chips` : '-';
    const net = entry.stake > 0 && phase === 'crashed'
      ? `${entry.netDelta >= 0 ? '+' : ''}${entry.netDelta}`
      : '-';

    return `
      <div class="crash-admin-row ${entry.stake > 0 ? 'active' : ''} ${entry.cashedOut ? 'won' : ''} ${entry.lost ? 'lost' : ''}">
        <div class="crash-admin-player">
          <span class="crash-dot" style="background:${player.color}"></span>
          <b>${esc(player.name)}</b>
        </div>
        <label>
          <span>Einsatz</span>
          <input type="number" min="0" max="100" step="5" value="${entry.stake}"
            data-crash-stake data-player="${player.id}" ${readonly ? 'disabled' : ''} />
        </label>
        <div>
          <span>Status</span>
          <b>${esc(status)}</b>
        </div>
        <div>
          <span>Cashout</span>
          <b>${cashout}</b>
        </div>
        <div>
          <span>Auszahlung</span>
          <b>${payout}</b>
        </div>
        <div>
          <span>Coins</span>
          <b>${net}</b>
        </div>
      </div>`;
  }

  function crashedSummary(crash) {
    return `
      <div class="crash-admin-result">
        <b>Crash bei ${formatMultiplier(crash.crashPoint || crash.multiplier)}</b>
        <span>Gewinner erhalten Auszahlung minus Einsatz. Auszahlungen werden auf 5er-Chips gerundet.</span>
      </div>`;
  }

  function statusLabel(entry, phase) {
    if (!entry || entry.stake <= 0) return 'nicht aktiv';
    if (phase === 'ready') return 'bereit';
    if (phase === 'running') return entry.cashedOut
      ? `raus bei ${formatMultiplier(entry.cashoutMultiplier)}`
      : 'drin';
    if (phase === 'crashed' || phase === 'finished') return entry.cashedOut ? 'gewonnen' : 'verloren';
    return '-';
  }

  function crashEntry(crash, playerId) {
    return (crash.players && crash.players[playerId]) || {
      playerId,
      stake: 0,
      cashedOut: false,
      cashoutMultiplier: null,
      payout: 0,
      netDelta: 0,
      lost: false,
    };
  }

  function clampStake(value) {
    const number = Math.round(Number(value) || 0);
    return Math.max(0, Math.min(100, Math.round(number / 5) * 5));
  }

  function formatMultiplier(value) {
    return `${(Number(value) || 1).toFixed(2)}x`;
  }

  function injectStyles() {
    if (document.getElementById('admin-crash-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-crash-styles';
    style.textContent = `
      .crash-admin-panel { display: grid; gap: 12px; }
      .crash-admin-top {
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
      }
      .crash-admin-top > div,
      .crash-admin-result {
        background: rgba(18, 7, 10, .58); border: 1px solid var(--line);
        border-radius: 8px; padding: 10px 12px;
      }
      .crash-admin-kicker,
      .crash-admin-row span {
        color: var(--muted); font-size: .75rem; font-weight: 800;
        text-transform: uppercase; letter-spacing: .04em;
      }
      .crash-admin-result { display: grid; gap: 4px; border-color: var(--bad); }
      .crash-admin-result b { color: #ff7a88; }
      .crash-admin-result span { color: var(--muted); font-size: .86rem; }
      .crash-admin-table { display: grid; gap: 8px; }
      .crash-admin-row {
        display: grid; grid-template-columns: minmax(104px, 1.15fr) 98px repeat(4, minmax(76px, 1fr));
        gap: 8px; align-items: center; padding: 10px;
        border: 1px solid var(--line); border-radius: 8px; background: rgba(18, 7, 10, .45);
      }
      .crash-admin-row.active { border-color: rgba(255,209,92,.55); }
      .crash-admin-row.won { border-color: var(--good); box-shadow: 0 0 0 1px rgba(17,140,79,.25) inset; }
      .crash-admin-row.lost { border-color: var(--bad); }
      .crash-admin-player { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .crash-admin-player b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .crash-dot { width: 13px; height: 13px; border-radius: 50%; flex: 0 0 auto; }
      .crash-admin-row label,
      .crash-admin-row > div:not(.crash-admin-player) { display: grid; gap: 4px; min-width: 0; }
      .crash-admin-row input {
        width: 100%; min-width: 0; background: var(--panel); border: 1px solid var(--line);
        color: var(--text); border-radius: 8px; padding: 9px 8px; font: inherit; font-weight: 900;
      }
      .crash-admin-row input:disabled { opacity: .65; }
      @media (max-width: 720px) {
        .crash-admin-top { grid-template-columns: 1fr; }
        .crash-admin-row { grid-template-columns: 1fr 92px; }
      }
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
