GameRegistry.register('einkauf-schaetzen', {
  mount(container) {
    injectFishDisplayStyles();
    document.body.classList.add('fish-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = '<div class="fish-display" id="fish-display"></div>';
  },

  update(state) {
    const root = document.getElementById('fish-display');
    if (!root) return;
    const game = fishState(state);
    const box = selectedBox(game);
    const answers = box ? game.answersByBoxId[box.id] || {} : {};
    const actual = boxTotalCents(box);

    root.innerHTML = `
      <div class="fish-stage">
        <div class="fish-brand">WEIDMANN WM Poker Edition</div>
        <div class="fish-main ${game.solutionRevealed ? 'solution' : ''}">
          <div class="fish-box-visual">
            <div class="fish-box-lid"></div>
            <div class="fish-box-body">${escapeHtml(box ? box.label : 'Box')}</div>
          </div>
          <div class="fish-copy">
            <div class="fish-kicker">How much is the fish</div>
            <div class="fish-title">${escapeHtml(box ? box.label : 'Box')}</div>
            ${game.solutionRevealed ? solutionHtml(box, actual) : statusHtml(state.players, answers, game)}
          </div>
        </div>
        ${game.guessesRevealed ? guessesHtml(state.players, game, answers, actual) : ''}
        ${totalsHtml(state.players, game)}
      </div>`;
  },

  unmount(container) {
    document.body.classList.remove('fish-mode');
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});

function statusHtml(players, answers, game) {
  const count = players.filter((player) => answers[player.id]).length;
  return `<div class="fish-status">${game.answersOpen ? 'Schätzungen offen' : 'Warte auf Auflösung'} · ${count}/${players.length} eingeloggt</div>`;
}

function solutionHtml(box, actual) {
  return `
    <div class="fish-solution">
      <span>Gesamtpreis</span>
      <b>${actual == null ? '-' : formatEuro(actual)}</b>
      <div class="fish-items">
        ${(box && box.items || []).map((item) => `
          <div><span>${escapeHtml(item.name)}</span><b>${item.priceCents == null ? '-' : formatEuro(item.priceCents)}</b></div>
        `).join('')}
      </div>
    </div>`;
}

function guessesHtml(players, game, answers, actual) {
  const winners = new Set(game.winnerPlayerIds || []);
  return `
    <div class="fish-guesses">
      ${players.map((player) => {
        const answer = answers[player.id] || null;
        const result = (game.results || []).find((row) => row.playerId === player.id) || {};
        return `
          <div class="fish-guess-card ${winners.has(player.id) && game.solutionRevealed ? 'winner' : ''}" style="--pc:${player.color}">
            <div class="fish-player">${escapeHtml(player.name)}</div>
            <div class="fish-answer">${answer ? formatEuro(answer.amountCents) : 'Keine Eingabe'}</div>
            ${game.solutionRevealed
              ? `<div class="fish-diff">${result.noAnswerPenalty ? 'Strafe' : 'Abweichung'} ${result.differenceCents == null ? '-' : formatEuro(result.differenceCents)}</div>`
              : '<div class="fish-diff">Tipp</div>'}
          </div>`;
      }).join('')}
    </div>`;
}

function totalsHtml(players, game) {
  const scored = Number(game.scoredRounds) || 0;
  const totals = game.totals || {};
  const ranked = [...players]
    .map((player) => ({ player, total: Number(totals[player.id]) || 0 }))
    .sort((a, b) => a.total - b.total);
  return `
    <div class="fish-totals">
      <div class="fish-totals-title">Gesamtwertung${scored ? ` · ${scored} ${scored === 1 ? 'Box' : 'Boxen'} gewertet` : ''}</div>
      <div class="fish-totals-grid">
        ${ranked.map((row, index) => `
          <div class="fish-total-row ${index === 0 && scored ? 'leader' : ''}" style="--pc:${row.player.color}">
            <span>${index + 1}. ${escapeHtml(row.player.name)}</span>
            <b>${formatEuro(row.total)}</b>
          </div>`).join('')}
      </div>
    </div>`;
}

function fishState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    selectedBoxId: raw.selectedBoxId || 'box1',
    boxes: Array.isArray(raw.boxes) ? raw.boxes : [],
    answersOpen: raw.answersOpen === true,
    guessesRevealed: raw.guessesRevealed === true,
    solutionRevealed: raw.solutionRevealed === true,
    answersByBoxId: raw.answersByBoxId && typeof raw.answersByBoxId === 'object' ? raw.answersByBoxId : {},
    results: Array.isArray(raw.results) ? raw.results : [],
    winnerPlayerIds: Array.isArray(raw.winnerPlayerIds) ? raw.winnerPlayerIds : [],
    totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {},
    scoredRounds: Number(raw.scoredRounds) || 0,
  };
}

function selectedBox(game) {
  return game.boxes.find((box) => box.id === game.selectedBoxId) || game.boxes[0] || null;
}

function boxTotalCents(box) {
  if (!box || !Array.isArray(box.items) || box.items.some((item) => item.priceCents == null)) return null;
  return box.items.reduce((sum, item) => sum + Number(item.priceCents || 0), 0);
}

function formatEuro(cents) {
  return `${(Number(cents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function injectFishDisplayStyles() {
  if (document.getElementById('fish-display-styles')) return;
  const style = document.createElement('style');
  style.id = 'fish-display-styles';
  style.textContent = `
    body.fish-mode footer.scores { display: none; }
    body.fish-mode main.stage {
      min-height: 100vh; padding: 18px;
      background: linear-gradient(180deg, #13070a 0%, #050203 100%);
    }
    .fish-display { width: min(1540px, 97vw); height: min(900px, 94vh); display: grid; place-items: center; }
    .fish-stage { width: 100%; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; gap: 12px; }
    .fish-brand {
      color: var(--accent); text-align: center; font-size: clamp(1.25rem, 2.2vw, 2.35rem);
      font-weight: 900; letter-spacing: .18em; text-shadow: 0 0 18px rgba(255,209,92,.42);
    }
    .fish-main {
      min-height: 0; display: grid; grid-template-columns: minmax(280px, .8fr) minmax(0, 1.2fr);
      gap: 22px; align-items: center; padding: 26px;
      border: 1px solid rgba(255,209,92,.26); border-radius: 8px; background: rgba(18,7,10,.72);
    }
    .fish-box-visual { display: grid; place-items: center; perspective: 900px; }
    .fish-box-lid {
      width: min(360px, 28vw); height: 64px; border-radius: 8px 8px 3px 3px;
      background: linear-gradient(180deg, #ffe08a, #bb8732); transform: rotateX(16deg);
      box-shadow: 0 16px 28px rgba(0,0,0,.32);
    }
    .fish-box-body {
      width: min(430px, 32vw); min-height: 260px; display: grid; place-items: center;
      margin-top: -10px; border-radius: 8px; border: 4px solid #8d5a22;
      background: linear-gradient(145deg, #c98a36, #714216); color: #fff8df;
      font-size: clamp(3rem, 7vw, 7rem); font-weight: 900; text-shadow: 0 5px 18px rgba(0,0,0,.45);
    }
    .fish-copy { display: grid; gap: 12px; text-align: center; justify-items: center; }
    .fish-kicker { color: var(--muted); font-size: clamp(1rem, 1.5vw, 1.35rem); font-weight: 900; text-transform: uppercase; letter-spacing: .14em; }
    .fish-title { color: #fff8df; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(5rem, 12vw, 12rem); line-height: .9; font-weight: 900; }
    .fish-status { color: var(--accent); font-size: clamp(1.5rem, 3vw, 3rem); font-weight: 900; }
    .fish-solution { display: grid; gap: 10px; justify-items: center; }
    .fish-solution > span { color: var(--muted); font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
    .fish-solution > b { color: var(--accent); font-size: clamp(4rem, 9vw, 9rem); line-height: .9; font-weight: 900; }
    .fish-items { display: grid; gap: 7px; width: min(620px, 100%); }
    .fish-items div { display: flex; justify-content: space-between; gap: 14px; color: #fff8df; font-size: clamp(1rem, 1.45vw, 1.45rem); font-weight: 900; }
    .fish-items span { color: var(--muted); }
    .fish-guesses { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .fish-guess-card {
      display: grid; gap: 5px; align-content: center; min-height: 116px; padding: 12px;
      border-radius: 8px; border: 1px solid rgba(255,209,92,.24); border-top: 5px solid var(--pc);
      background: rgba(18,7,10,.78); text-align: center;
    }
    .fish-guess-card.winner { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255,209,92,.28) inset; }
    .fish-player { color: var(--pc); font-size: clamp(1rem, 1.45vw, 1.35rem); font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fish-answer { color: #fff8df; font-size: clamp(1.8rem, 3vw, 3.1rem); font-weight: 900; }
    .fish-diff { color: var(--muted); font-weight: 900; }
    .fish-totals { border: 1px solid rgba(255,209,92,.24); border-radius: 8px; padding: 10px; background: rgba(18,7,10,.82); }
    .fish-totals-title { color: var(--accent); text-align: center; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 7px; }
    .fish-totals-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .fish-total-row { display: grid; gap: 2px; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,209,92,.18); border-top: 4px solid var(--pc); background: rgba(5,3,4,.62); text-align: center; }
    .fish-total-row.leader { border-color: var(--accent); }
    .fish-total-row span { color: var(--pc); font-size: .92rem; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fish-total-row b { color: #fff8df; font-size: clamp(1.05rem, 1.45vw, 1.4rem); }
    @media (max-width: 1050px) {
      .fish-main { grid-template-columns: 1fr; }
      .fish-guesses, .fish-totals-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
