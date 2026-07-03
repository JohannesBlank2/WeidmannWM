GameRegistry.register('dart-ringe', {
  mount(container) {
    injectStyles();
    document.body.classList.add('dart-ringe-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = '<div class="dart-ringe-display" id="dart-ringe-display"></div>';
  },

  update(state) {
    const root = document.getElementById('dart-ringe-display');
    if (!root) return;

    const game = dartRingeState(state);
    root.innerHTML = `
      <div class="dart-ringe-stage">
        <div class="dart-ringe-brand">WEIDMANN WM Poker Edition</div>
        <div class="dart-ringe-head">
          <div>
            <div class="dart-ringe-kicker">Dartringe</div>
            <div class="dart-ringe-title">Von groß nach klein</div>
          </div>
          <div class="dart-ringe-status">${progressText(state, game)}</div>
        </div>
        <div class="dart-ringe-track">
          ${rings().map((ring) => ringColumn(ring, state.players, game)).join('')}
        </div>
      </div>`;
  },

  unmount(container) {
    document.body.classList.remove('dart-ringe-mode');
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});

function ringColumn(ring, players, game) {
  const playersAtRing = players.filter((player) => playerRing(game, player.id) === ring.index);
  return `
    <div class="dart-ringe-column ${ring.index === 4 ? 'finale' : ''}" style="--ring-size:${ring.size}px; --ring-color:${ring.color}; --ring-dark:${ring.dark}; --ring-soft:${ring.soft}">
      <div class="dart-ringe-ring-wrap">
        <div class="dart-ringe-ring">
          <span>${ring.index}</span>
        </div>
      </div>
      <div class="dart-ringe-label">${escapeHtml(ring.label)}</div>
      <div class="dart-ringe-players">
        ${playersAtRing.length
          ? playersAtRing.map((player) => playerChip(player)).join('')
          : '<div class="dart-ringe-empty">frei</div>'}
      </div>
    </div>`;
}

function playerChip(player) {
  return `
    <div class="dart-ringe-player" style="--pc:${player.color}">
      <span></span>
      <b>${escapeHtml(player.name)}</b>
    </div>`;
}

function progressText(state, game) {
  const finalCount = state.players.filter((player) => playerRing(game, player.id) === 4).length;
  if (finalCount) return `${finalCount}/${state.players.length} im Finale`;
  return 'Alle auf dem Weg zum kleinsten Ring';
}

function dartRingeState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    ringPositions: raw.ringPositions && typeof raw.ringPositions === 'object' ? raw.ringPositions : {},
  };
}

function playerRing(game, playerId) {
  const number = Math.round(Number(game.ringPositions[playerId]) || 1);
  return Math.max(1, Math.min(4, number));
}

function rings() {
  return [
    { index: 1, label: 'Ring 1 · Gelb', size: 188, color: '#ffd84f', dark: '#8a6418', soft: 'rgba(255,216,79,.24)' },
    { index: 2, label: 'Ring 2 · Grün', size: 158, color: '#31d06b', dark: '#0d6f36', soft: 'rgba(49,208,107,.22)' },
    { index: 3, label: 'Ring 3 · Blau', size: 128, color: '#3f7cff', dark: '#143f9c', soft: 'rgba(63,124,255,.22)' },
    { index: 4, label: 'Finale · Rot', size: 104, color: '#ff4056', dark: '#8f1525', soft: 'rgba(255,64,86,.24)' },
  ];
}

function injectStyles() {
  if (document.getElementById('dart-ringe-display-styles')) return;
  const style = document.createElement('style');
  style.id = 'dart-ringe-display-styles';
  style.textContent = `
    body.dart-ringe-mode footer.scores { display: none; }
    body.dart-ringe-mode main.stage {
      min-height: 100vh;
      padding: 18px;
      background:
        radial-gradient(circle at 50% 32%, rgba(255,209,92,.16), transparent 0 32%),
        linear-gradient(180deg, #0d0507 0%, #18080d 56%, #050304 100%);
    }
    body.dart-ringe-mode #content {
      align-items: flex-start;
    }
    .dart-ringe-display {
      width: min(1560px, 97vw);
      height: min(850px, 80vh);
      display: grid;
      place-items: start center;
    }
    .dart-ringe-stage {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 10px;
    }
    .dart-ringe-brand {
      color: var(--accent);
      text-align: center;
      font-size: 1.6rem;
      font-weight: 900;
      letter-spacing: .18em;
      text-shadow: 0 0 18px rgba(255,209,92,.42);
    }
    .dart-ringe-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 0 8px;
    }
    .dart-ringe-kicker {
      color: var(--muted);
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: .12em;
      font-weight: 900;
    }
    .dart-ringe-title {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 4rem;
      line-height: .92;
      font-weight: 900;
      white-space: nowrap;
    }
    .dart-ringe-status {
      max-width: 32%;
      color: #241104;
      background: var(--accent);
      border: 1px solid #ffedab;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 900;
      font-size: 1.1rem;
      text-align: right;
    }
    .dart-ringe-track {
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .dart-ringe-column {
      min-width: 0;
      display: grid;
      grid-template-rows: 185px auto minmax(0, 1fr);
      gap: 8px;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--ring-color) 54%, transparent);
      background:
        linear-gradient(180deg, var(--ring-soft), rgba(18,7,10,.84)),
        #16070c;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .dart-ringe-column.finale {
      border-color: color-mix(in srgb, var(--ring-color) 76%, transparent);
      box-shadow: inset 0 0 0 1px var(--ring-soft), 0 0 34px var(--ring-soft);
    }
    .dart-ringe-ring-wrap {
      display: grid;
      place-items: center;
      min-width: 0;
    }
    .dart-ringe-ring {
      width: min(var(--ring-size), 100%);
      aspect-ratio: 1;
      position: relative;
      display: block;
      border-radius: 50%;
      border: 16px solid var(--ring-color);
      background: rgba(5,3,4,.42);
      box-shadow:
        inset 0 0 0 4px rgba(255,255,255,.18),
        0 18px 34px rgba(0,0,0,.38),
        0 0 24px var(--ring-soft);
    }
    .dart-ringe-ring::before {
      content: "";
      position: absolute;
      inset: 18%;
      border-radius: 50%;
      border: 5px solid color-mix(in srgb, var(--ring-color) 72%, #fff);
      background: color-mix(in srgb, var(--ring-dark) 50%, #050304);
      box-shadow:
        inset 0 0 0 5px color-mix(in srgb, var(--ring-color) 26%, transparent),
        0 0 16px var(--ring-soft);
    }
    .dart-ringe-ring span {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 42%;
      height: 42%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      justify-content: center;
      place-items: center;
      border-radius: 50%;
      background: #090406;
      border: 2px solid var(--ring-color);
      color: var(--ring-color);
      font-size: calc(var(--ring-size) * .22);
      line-height: 1;
      font-weight: 900;
      text-shadow: 0 0 14px var(--ring-soft);
      z-index: 1;
    }
    .dart-ringe-label {
      min-height: 34px;
      display: grid;
      align-items: center;
      color: #fff8df;
      text-align: center;
      font-size: .92rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .dart-ringe-players {
      min-height: 0;
      display: grid;
      align-content: start;
      gap: 8px;
      overflow: hidden;
    }
    .dart-ringe-player {
      min-width: 0;
      min-height: 35px;
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.22);
      border-left: 5px solid var(--pc);
      background: rgba(5,3,4,.72);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .dart-ringe-player span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--pc);
      box-shadow: 0 0 14px var(--pc);
    }
    .dart-ringe-player b {
      min-width: 0;
      color: var(--pc);
      font-size: 1rem;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dart-ringe-empty {
      min-height: 35px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      border: 1px dashed color-mix(in srgb, var(--ring-color) 32%, transparent);
      color: color-mix(in srgb, var(--ring-color) 58%, #16070c);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    @media (max-width: 1150px) {
      .dart-ringe-track { grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: auto; }
      .dart-ringe-status { max-width: 46%; }
      .dart-ringe-column { grid-template-rows: 190px auto minmax(0, 1fr); }
      .dart-ringe-title { font-size: 3.2rem; white-space: normal; }
      .dart-ringe-brand { font-size: 1.35rem; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
