let halbeDisplayTimerInterval = null;
let halbeDisplayTimerHideTimeout = null;

GameRegistry.register('schneid-in-die-haelfte', {
  mount(container) {
    injectStyles();
    document.body.classList.add('halbe-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = `
      <div class="halbe-display" id="halbe-display"></div>
      <div class="halbe-timer-popover" id="halbe-timer-popover" aria-live="polite" aria-hidden="true"></div>`;
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
      syncTimerOverlay(game);
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
          <div class="halbe-head-metrics">
            <div class="halbe-best">${bestText(game)}</div>
          </div>
        </div>
        <div class="halbe-scale-grid">
          ${state.players.map((player) => scaleCard(player, game, winners.has(player.id))).join('')}
        </div>
        ${totalsBoard(state, game, false)}
      </div>`;
    syncTimerOverlay(game);
  },

  unmount(container) {
    hideTimerOverlay();
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

function syncTimerOverlay(game) {
  const timer = game.timer || {};
  const endsAt = Number(timer.endsAt) || 0;
  if (!timer.running || !endsAt) {
    hideTimerOverlay();
    return;
  }

  const popover = document.getElementById('halbe-timer-popover');
  if (!popover) return;

  showTimerOverlay(popover, endsAt, Number(timer.durationSeconds) || 30);
}

function showTimerOverlay(popover, endsAt, durationSeconds) {
  clearTimerHandles();

  const totalMs = Math.max(1000, Number(durationSeconds) * 1000);
  popover.innerHTML = `
    <div class="halbe-timer-ring">
      <div class="halbe-timer-core">
        <span>Timer</span>
        <strong data-halbe-timer-value>30</strong>
        <small>Sekunden</small>
      </div>
    </div>`;
  popover.classList.add('visible');
  popover.classList.remove('done', 'urgent');
  popover.setAttribute('aria-hidden', 'false');

  const valueEl = popover.querySelector('[data-halbe-timer-value]');
  const update = () => {
    const remaining = Math.max(0, endsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const progress = Math.max(0, Math.min(1, remaining / totalMs));

    popover.style.setProperty('--timer-progress', `${progress * 360}deg`);
    popover.classList.toggle('urgent', remaining > 0 && remaining <= 5000);

    if (valueEl) valueEl.textContent = String(seconds);

    if (remaining <= 0) {
      popover.classList.add('done');
      popover.classList.remove('urgent');
      const label = popover.querySelector('span');
      const unit = popover.querySelector('small');
      if (label) label.textContent = 'Zeit!';
      if (unit) unit.textContent = 'abgelaufen';
      clearTimerHandles();
      halbeDisplayTimerHideTimeout = window.setTimeout(hideTimerOverlay, 1200);
    }
  };

  update();
  halbeDisplayTimerInterval = window.setInterval(update, 200);
}

function hideTimerOverlay() {
  clearTimerHandles();
  const popover = document.getElementById('halbe-timer-popover');
  if (!popover) return;

  popover.classList.remove('visible', 'done', 'urgent');
  popover.setAttribute('aria-hidden', 'true');
  popover.innerHTML = '';
  popover.style.removeProperty('--timer-progress');
}

function clearTimerHandles() {
  if (halbeDisplayTimerInterval) {
    clearInterval(halbeDisplayTimerInterval);
    halbeDisplayTimerInterval = null;
  }
  if (halbeDisplayTimerHideTimeout) {
    clearTimeout(halbeDisplayTimerHideTimeout);
    halbeDisplayTimerHideTimeout = null;
  }
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
    timer: normalizeTimer(raw.timer),
  };
}

function normalizeTimer(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const endsAt = Number(raw.endsAt) || null;
  return {
    running: raw.running === true && !!endsAt && endsAt > Date.now(),
    endsAt,
    durationSeconds: Math.max(1, Number(raw.durationSeconds) || 30),
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
    .halbe-head-metrics {
      display: grid;
      gap: 10px;
      justify-items: end;
      max-width: 46%;
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
      max-width: 100%;
    }
    .halbe-timer-popover {
      --timer-progress: 360deg;
      position: fixed;
      top: clamp(74px, 8vh, 112px);
      right: clamp(18px, 3vw, 44px);
      width: clamp(126px, 13vw, 188px);
      aspect-ratio: 1;
      border-radius: 50%;
      z-index: 1200;
      display: grid;
      place-items: center;
      pointer-events: none;
      opacity: 0;
      transform: scale(.72) translateY(-10px);
      transition: opacity .18s ease, transform .24s ease;
    }
    .halbe-timer-popover.visible {
      opacity: 1;
      transform: scale(1) translateY(0);
      animation: halbe-timer-pop .28s ease both;
    }
    .halbe-timer-ring {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      padding: 8px;
      background:
        conic-gradient(from -90deg, var(--accent) var(--timer-progress), rgba(255,248,223,.16) 0deg),
        radial-gradient(circle at 35% 25%, rgba(255,255,255,.2), transparent 42%),
        #201007;
      box-shadow: 0 12px 42px rgba(0,0,0,.52), 0 0 34px rgba(255,209,92,.28);
    }
    .halbe-timer-core {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 2px;
      border: 1px solid rgba(255,237,171,.36);
      background: radial-gradient(circle at 50% 35%, #2b1609, #090403 72%);
      box-shadow: inset 0 0 28px rgba(0,0,0,.68);
      text-align: center;
    }
    .halbe-timer-core span,
    .halbe-timer-core small {
      display: block;
      color: var(--muted);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    .halbe-timer-core span {
      font-size: clamp(.72rem, 1vw, .95rem);
    }
    .halbe-timer-core strong {
      display: block;
      color: #fff8df;
      font-size: clamp(3.15rem, 6vw, 5.7rem);
      line-height: .85;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 0 24px rgba(255,209,92,.42);
    }
    .halbe-timer-core small {
      font-size: clamp(.62rem, .8vw, .78rem);
    }
    .halbe-timer-popover.urgent .halbe-timer-ring {
      background:
        conic-gradient(from -90deg, #ff6a7d var(--timer-progress), rgba(255,248,223,.16) 0deg),
        radial-gradient(circle at 35% 25%, rgba(255,255,255,.2), transparent 42%),
        #25070d;
      box-shadow: 0 12px 42px rgba(0,0,0,.52), 0 0 36px rgba(255,106,125,.36);
    }
    .halbe-timer-popover.urgent .halbe-timer-core strong,
    .halbe-timer-popover.done .halbe-timer-core strong,
    .halbe-timer-popover.done .halbe-timer-core span {
      color: #ff8a9a;
    }
    .halbe-timer-popover.done .halbe-timer-ring {
      background:
        conic-gradient(from -90deg, #ff6a7d 360deg, rgba(255,248,223,.16) 0deg),
        radial-gradient(circle at 35% 25%, rgba(255,255,255,.2), transparent 42%),
        #25070d;
      animation: halbe-timer-done .55s ease both;
    }
    @keyframes halbe-timer-pop {
      0% { transform: scale(.68) translateY(-12px); }
      70% { transform: scale(1.08) translateY(0); }
      100% { transform: scale(1) translateY(0); }
    }
    @keyframes halbe-timer-done {
      0%, 100% { transform: scale(1); }
      45% { transform: scale(1.08); }
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
      .halbe-head-metrics { max-width: 52%; }
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
