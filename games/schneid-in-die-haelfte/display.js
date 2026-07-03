GameRegistry.register('schneid-in-die-haelfte', {
  mount(container) {
    injectStyles();
    document.body.classList.add('halbe-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = '<div class="halbe-display" id="halbe-display"></div>';
  },

  update(state) {
    const root = document.getElementById('halbe-display');
    if (!root) return;

    const game = ensureGameState(state);
    if (!['reveal', 'result'].includes(game.phase)) {
      root.innerHTML = `
        <div class="halbe-hidden">
          ${totalsBoard(state, game, true)}
        </div>`;
      return;
    }

    const winners = new Set(game.winnerPlayerIds || []);
    root.innerHTML = `
      <div class="halbe-stage">
        <div class="halbe-brand">WEIDMANN WM Poker Edition</div>
        <div class="halbe-head">
          <div>
            <div class="halbe-kicker">Halbe Sachen · ${escapeHtml(game.itemName)}</div>
            <div class="halbe-title">Auflösung</div>
          </div>
          <div class="halbe-best">${bestText(game)}</div>
        </div>
        <div class="halbe-scale-grid">
          ${state.players.map((player) => scaleCard(player, game, winners.has(player.id))).join('')}
        </div>
        ${totalsBoard(state, game, false)}
      </div>`;
  },

  unmount(container) {
    document.body.classList.remove('halbe-mode');
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});

function scaleCard(player, game, winner) {
  const result = (game.results || []).find((entry) => entry.playerId === player.id) || {};
  const complete = result.complete === true;
  const tilt = complete ? Math.max(-7, Math.min(7, (Number(result.left) - Number(result.right)) / 10)) : 0;
  const leftDrop = Math.max(-8, Math.min(8, tilt * 1.4));
  const rightDrop = -leftDrop;
  return `
    <div class="halbe-scale-card ${winner ? 'winner' : ''}" style="--pc:${player.color}; --tilt:${tilt}deg; --left-drop:${leftDrop}px; --right-drop:${rightDrop}px">
      <div class="halbe-player">${escapeHtml(player.name)}</div>
      <div class="halbe-scale">
        <div class="halbe-dial">
          <span>${complete ? formatGram(result.difference) : '-'}</span>
          <small>Unterschied</small>
        </div>
        <div class="halbe-beam"></div>
        <div class="halbe-post"></div>
        <div class="halbe-pan left">
          <div class="halbe-piece"></div>
          <b>${complete ? formatGram(result.left) : '-'}</b>
        </div>
        <div class="halbe-pan right">
          <div class="halbe-piece"></div>
          <b>${complete ? formatGram(result.right) : '-'}</b>
        </div>
        <div class="halbe-base"></div>
      </div>
      <div class="halbe-total">${complete ? `Gesamt ${formatGram(result.total)}` : 'Noch nicht gewogen'}</div>
    </div>`;
}

function totalsBoard(state, game, compact) {
  const scored = Number(game.scoredRounds) || 0;
  const totals = game.totals && typeof game.totals === 'object' ? game.totals : {};
  const ranked = [...state.players]
    .map((player) => ({
      player,
      total: Number.isFinite(Number(totals[player.id])) ? Number(totals[player.id]) : 0,
    }))
    .sort((a, b) => a.total - b.total);

  return `
    <div class="halbe-totals ${compact ? 'compact' : ''}">
      <div class="halbe-totals-title">Gesamtwertung${scored ? ` · ${scored} ${scored === 1 ? 'Runde' : 'Runden'} gewertet` : ''}</div>
      <div class="halbe-totals-grid">
        ${ranked.map((row, index) => `
          <div class="halbe-total-row ${index === 0 && scored ? 'leader' : ''}" style="--pc:${row.player.color}">
            <span>${index + 1}. ${escapeHtml(row.player.name)}</span>
            <b>${formatGram(row.total)}</b>
          </div>`).join('')}
      </div>
    </div>`;
}

function bestText(game) {
  const winnerIds = game.winnerPlayerIds || [];
  if (!winnerIds.length) return 'Keine vollständigen Werte';
  const winners = (game.results || [])
    .filter((result) => winnerIds.includes(result.playerId))
    .map((result) => result.playerName)
    .join(' & ');
  const best = (game.results || []).find((result) => winnerIds.includes(result.playerId));
  return `${escapeHtml(winners)} · ${formatGram(best && best.difference)}`;
}

function ensureGameState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    phase: ['reveal', 'result'].includes(raw.phase) ? raw.phase : 'cutting',
    itemName: String(raw.itemName || 'Runde'),
    results: Array.isArray(raw.results) ? raw.results : [],
    winnerPlayerIds: Array.isArray(raw.winnerPlayerIds) ? raw.winnerPlayerIds : [],
    totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {},
    scoredRounds: Number(raw.scoredRounds) || 0,
    resultConfirmed: raw.resultConfirmed === true,
  };
}

function injectStyles() {
  if (document.getElementById('halbe-display-styles')) return;
  const style = document.createElement('style');
  style.id = 'halbe-display-styles';
  style.textContent = `
    body.halbe-mode footer.scores { display: none; }
    body.halbe-mode main.stage {
      min-height: 100vh;
      padding: 18px;
      background: #050304;
    }
    .halbe-display {
      width: min(1560px, 97vw);
      height: min(900px, 94vh);
      display: grid;
      place-items: center;
    }
    .halbe-hidden {
      width: 100%;
      height: 100%;
      background: #050304;
      display: grid;
      align-items: end;
      padding: 20px;
    }
    .halbe-stage {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 14px;
    }
    .halbe-brand {
      color: var(--accent);
      text-align: center;
      font-size: clamp(1.25rem, 2.2vw, 2.35rem);
      font-weight: 900;
      letter-spacing: .18em;
      text-shadow: 0 0 18px rgba(255,209,92,.42);
    }
    .halbe-head {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 18px;
      padding: 0 8px;
    }
    .halbe-kicker {
      color: var(--muted);
      font-size: clamp(1rem, 1.5vw, 1.3rem);
      text-transform: uppercase;
      letter-spacing: .12em;
      font-weight: 900;
    }
    .halbe-title {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(3.8rem, 7vw, 7.5rem);
      line-height: .92;
      font-weight: 900;
    }
    .halbe-best {
      color: #241104;
      background: var(--accent);
      border: 1px solid #ffedab;
      border-radius: 8px;
      padding: 12px 16px;
      font-weight: 900;
      font-size: clamp(1rem, 1.7vw, 1.55rem);
      text-align: right;
      max-width: 44%;
    }
    .halbe-scale-grid {
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
    }
    .halbe-scale-card {
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 8px;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.24);
      border-top: 6px solid var(--pc);
      background:
        linear-gradient(180deg, rgba(255,248,223,.08), rgba(18,7,10,.82)),
        #16070c;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .halbe-scale-card.winner {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(255,209,92,.44) inset, 0 0 38px rgba(255,209,92,.34);
      background: linear-gradient(180deg, rgba(255,209,92,.22), rgba(18,7,10,.86));
    }
    .halbe-player {
      color: var(--pc);
      font-size: clamp(1.15rem, 1.75vw, 1.7rem);
      font-weight: 900;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .halbe-scale {
      position: relative;
      min-height: 330px;
    }
    .halbe-dial {
      position: absolute;
      top: 2px;
      left: 50%;
      transform: translateX(-50%);
      width: min(170px, 86%);
      aspect-ratio: 1.55;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 3px;
      border-radius: 8px;
      border: 2px solid rgba(255,209,92,.52);
      background: linear-gradient(180deg, #221c14, #080604);
      box-shadow: inset 0 -8px 18px rgba(0,0,0,.44);
      z-index: 3;
    }
    .halbe-dial span {
      color: var(--accent);
      font-size: clamp(1.7rem, 3vw, 3.2rem);
      line-height: .95;
      font-weight: 900;
    }
    .halbe-dial small {
      color: var(--muted);
      font-size: .78rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .07em;
    }
    .halbe-beam {
      position: absolute;
      top: 138px;
      left: 12%;
      right: 12%;
      height: 14px;
      border-radius: 999px;
      background: linear-gradient(180deg, #e7c066, #8d6829);
      transform: rotate(var(--tilt));
      transform-origin: center;
      box-shadow: 0 7px 12px rgba(0,0,0,.36);
      z-index: 2;
    }
    .halbe-post {
      position: absolute;
      top: 144px;
      left: 50%;
      width: 16px;
      height: 138px;
      transform: translateX(-50%);
      border-radius: 8px 8px 0 0;
      background: linear-gradient(90deg, #5e4521, #d7ad55, #5e4521);
    }
    .halbe-pan {
      position: absolute;
      top: 174px;
      width: 40%;
      display: grid;
      justify-items: center;
      gap: 8px;
      color: #fff8df;
      font-size: clamp(1rem, 1.7vw, 1.45rem);
      font-weight: 900;
    }
    .halbe-pan.left { left: 0; transform: translateY(var(--left-drop)); }
    .halbe-pan.right { right: 0; transform: translateY(var(--right-drop)); }
    .halbe-pan::before {
      content: "";
      width: 2px;
      height: 54px;
      background: rgba(255,248,223,.55);
    }
    .halbe-pan::after {
      content: "";
      width: 100%;
      height: 20px;
      border-radius: 0 0 80% 80%;
      background: linear-gradient(180deg, #b88f43, #563b18);
      border: 1px solid rgba(255,209,92,.38);
      order: 3;
    }
    .halbe-piece {
      width: 54px;
      height: 42px;
      border-radius: 48% 52% 42% 58%;
      background: linear-gradient(135deg, #f1cf87, #a84d37 58%, #5a221e);
      box-shadow: inset -8px -8px 12px rgba(0,0,0,.24), 0 5px 12px rgba(0,0,0,.28);
      order: 2;
    }
    .halbe-pan b { order: 4; }
    .halbe-base {
      position: absolute;
      left: 22%;
      right: 22%;
      bottom: 18px;
      height: 26px;
      border-radius: 999px 999px 8px 8px;
      background: linear-gradient(180deg, #d3a953, #4f3414);
      box-shadow: 0 10px 18px rgba(0,0,0,.34);
    }
    .halbe-total {
      min-height: 34px;
      color: var(--muted);
      text-align: center;
      font-weight: 900;
      font-size: clamp(.9rem, 1.2vw, 1.05rem);
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .halbe-totals {
      border: 1px solid rgba(255,209,92,.26);
      border-radius: 8px;
      padding: 12px;
      background: rgba(18, 7, 10, .82);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .halbe-totals.compact {
      width: min(980px, 100%);
      justify-self: center;
    }
    .halbe-totals-title {
      color: var(--accent);
      font-size: clamp(.9rem, 1.25vw, 1.1rem);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .12em;
      text-align: center;
      margin-bottom: 8px;
    }
    .halbe-totals-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
    }
    .halbe-total-row {
      min-height: 58px;
      display: grid;
      align-content: center;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.18);
      border-top: 4px solid var(--pc);
      background: rgba(5, 3, 4, .62);
      text-align: center;
    }
    .halbe-total-row.leader {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(255,209,92,.24) inset;
    }
    .halbe-total-row span {
      min-width: 0;
      color: var(--pc);
      font-size: clamp(.82rem, 1vw, .98rem);
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .halbe-total-row b {
      color: #fff8df;
      font-size: clamp(1.15rem, 1.7vw, 1.55rem);
      line-height: 1;
    }
    @media (max-width: 1150px) {
      .halbe-scale-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: auto; }
      .halbe-totals-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .halbe-best { max-width: 52%; }
    }
  `;
  document.head.appendChild(style);
}

function formatGram(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 })} g`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
