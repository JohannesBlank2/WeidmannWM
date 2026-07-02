GameRegistry.register('musik-erraten', {
  mount(container) {
    injectStyles();
    document.body.classList.add('musik-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = '<div class="musik-display" id="musik-display"></div>';
  },

  update(state) {
    const root = document.getElementById('musik-display');
    if (!root) return;

    const game = ensureGameState(state);
    const revealed = game.isSongRevealed && game.currentSongTitle;
    const winner = game.winnerPlayerId
      ? state.players.find((player) => player.id === game.winnerPlayerId)
      : null;
    const hasCover = Boolean(revealed && game.currentSongCoverImageUrl);
    const coverStyle = hasCover
      ? ` style="background-image:url('${cssUrl(game.currentSongCoverImageUrl)}')"`
      : '';

    root.innerHTML = `
      <div class="musik-stage">
        <div class="musik-brand">WEIDMANN WM Poker Edition</div>
        <div class="musik-main ${revealed ? 'revealed' : ''} ${hasCover ? 'has-cover' : ''}">
          ${hasCover ? `<div class="musik-cover-bg"${coverStyle}></div>` : ''}
          <div class="musik-main-content">
            ${hasCover ? `<img class="musik-cover-art" src="${escapeHtml(game.currentSongCoverImageUrl)}" alt="" />` : ''}
            <div class="musik-kicker">${revealed ? `Song ${game.currentSongIndex + 1}/${game.songs.length}` : 'Runde läuft'}</div>
            <div class="musik-title">${escapeHtml(revealed ? game.currentSongTitle : 'Musik läuft')}</div>
          </div>
          ${winner ? `<div class="musik-winner" style="--pc:${winner.color}">${escapeHtml(winner.name)} hat gewonnen</div>` : ''}
        </div>
        <div class="musik-score-grid">
          ${state.players.map((player) => scoreCard(player, game)).join('')}
        </div>
      </div>`;
  },

  unmount(container) {
    document.body.classList.remove('musik-mode');
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});

function scoreCard(player, game) {
  const target = game.targetScore || 5;
  const score = Math.max(0, Math.min(target, Number(game.playerScores[player.id]) || 0));
  const remaining = Math.max(0, target - score);
  const winner = game.winnerPlayerId === player.id;
  const boxes = Array.from({ length: target }, (_, index) => `
    <span class="musik-point-box ${index < score ? 'filled' : ''}">
      ${index < score ? '<span></span>' : ''}
    </span>`).join('');

  return `
    <div class="musik-score-card ${winner ? 'winner' : ''}" style="--pc:${player.color}">
      <div class="musik-player-name">${escapeHtml(player.name)}</div>
      <div class="musik-points">${boxes}</div>
      <div class="musik-remaining">${winner ? 'Gewonnen' : `noch ${remaining} bis Sieg`}</div>
    </div>`;
}

function ensureGameState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    currentSongTitle: String(raw.currentSongTitle || ''),
    currentSongIndex: Number(raw.currentSongIndex) || 0,
    currentSongCoverImageUrl: String(raw.currentSongCoverImageUrl || ''),
    isSongRevealed: raw.isSongRevealed === true,
    playerScores: raw.playerScores && typeof raw.playerScores === 'object' ? raw.playerScores : {},
    winnerPlayerId: raw.winnerPlayerId || null,
    targetScore: Number(raw.targetScore) || 5,
    songs: Array.isArray(raw.songs) && raw.songs.length ? raw.songs : [],
  };
}

function injectStyles() {
  if (document.getElementById('musik-display-styles')) return;
  const style = document.createElement('style');
  style.id = 'musik-display-styles';
  style.textContent = `
    body.musik-mode footer.scores { display: none; }
    body.musik-mode main.stage {
      min-height: 100vh;
      padding: 18px;
      background:
        radial-gradient(circle at 50% 42%, rgba(17, 140, 79, .22), transparent 0 34%),
        linear-gradient(180deg, #16070c 0%, #080304 100%);
    }
    .musik-display {
      width: min(1500px, 96vw);
      height: min(900px, 94vh);
      display: grid;
      place-items: center;
    }
    .musik-stage {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 18px;
    }
    .musik-brand {
      color: var(--accent);
      text-align: center;
      font-size: clamp(1.35rem, 2.5vw, 2.6rem);
      font-weight: 900;
      letter-spacing: .18em;
      text-shadow: 0 0 18px rgba(255,209,92,.42);
    }
    .musik-main {
      position: relative;
      min-height: 0;
      border: 1px solid rgba(255,209,92,.28);
      border-radius: 8px;
      overflow: hidden;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 18px;
      padding: 36px;
      text-align: center;
      background:
        linear-gradient(135deg, rgba(255,209,92,.08), transparent 34%),
        radial-gradient(circle at 50% 45%, rgba(255,47,79,.16), transparent 0 38%),
        rgba(18, 7, 10, .72);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.05), 0 26px 58px rgba(0,0,0,.42);
    }
    .musik-cover-bg {
      position: absolute;
      inset: 0;
      background-position: center;
      background-size: cover;
      opacity: .42;
      filter: saturate(1.18) contrast(1.08);
      transform: scale(1.04);
    }
    .musik-main::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 50% 44%, rgba(5, 3, 4, .18), rgba(5, 3, 4, .78) 68%),
        linear-gradient(180deg, rgba(8,3,4,.2), rgba(8,3,4,.84));
      pointer-events: none;
    }
    .musik-main-content {
      position: relative;
      z-index: 2;
      display: grid;
      gap: 14px;
      justify-items: center;
      max-width: 100%;
    }
    .musik-cover-art {
      width: min(240px, 22vh, 20vw);
      aspect-ratio: 1;
      border-radius: 8px;
      object-fit: cover;
      border: 2px solid rgba(255,209,92,.46);
      box-shadow: 0 18px 42px rgba(0,0,0,.48), 0 0 30px rgba(255,209,92,.16);
    }
    .musik-kicker {
      color: var(--muted);
      font-size: clamp(1rem, 1.5vw, 1.35rem);
      text-transform: uppercase;
      letter-spacing: .18em;
      font-weight: 900;
    }
    .musik-title {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(4rem, 10vw, 10.5rem);
      line-height: .92;
      font-weight: 900;
      max-width: 100%;
      overflow-wrap: anywhere;
      text-shadow: 0 5px 24px rgba(0,0,0,.62), 0 0 32px rgba(255,209,92,.18);
    }
    .musik-main.revealed .musik-title {
      color: #fff1ae;
      text-shadow: 0 5px 24px rgba(0,0,0,.62), 0 0 34px rgba(255,209,92,.34);
    }
    .musik-winner {
      position: relative;
      z-index: 2;
      padding: 10px 20px;
      border-radius: 999px;
      border: 1px solid var(--pc);
      color: #fff8df;
      background: rgba(5, 31, 22, .82);
      font-size: clamp(1.3rem, 2.5vw, 2.2rem);
      font-weight: 900;
      box-shadow: 0 0 24px color-mix(in srgb, var(--pc) 52%, transparent);
    }
    .musik-score-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }
    .musik-score-card {
      min-height: 134px;
      display: grid;
      align-content: center;
      gap: 8px;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.24);
      border-top: 5px solid var(--pc);
      background: rgba(18, 7, 10, .78);
      text-align: center;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .musik-score-card.winner {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(255,209,92,.22) inset, 0 0 28px color-mix(in srgb, var(--pc) 44%, transparent);
      background: linear-gradient(180deg, rgba(255,209,92,.18), rgba(18,7,10,.8));
    }
    .musik-player-name {
      color: var(--pc);
      font-size: clamp(1.05rem, 1.8vw, 1.55rem);
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .musik-points {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
    }
    .musik-point-box {
      height: 30px;
      border: 2px solid rgba(255,248,223,.62);
      border-radius: 3px;
      display: grid;
      place-items: center;
      background: rgba(0,0,0,.18);
    }
    .musik-point-box span {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      background: var(--pc);
      box-shadow: 0 0 14px color-mix(in srgb, var(--pc) 68%, transparent);
    }
    .musik-remaining {
      color: var(--muted);
      font-weight: 900;
      font-size: clamp(.88rem, 1.2vw, 1.02rem);
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .musik-score-card.winner .musik-remaining { color: var(--accent); }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cssUrl(value) {
  return String(value || '').replace(/['"\\\n\r]/g, '');
}
