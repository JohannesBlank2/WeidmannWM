GameRegistry.register('das-prozent-quiz', {
  mount(container, ctx) {
    injectPercentDisplayStyles();
    document.body.classList.add('percent-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = '<div class="percent-display" id="percent-display"></div>';
    this.lastCommandId = -1;
  },

  update(state, ctx) {
    const root = document.getElementById('percent-display');
    if (!root) return;

    const game = percentState(state);
    const question = selectedQuestion(game);
    const answers = question ? answersFor(game, question.id) : {};

    if (game.solutionVisible && question && game.solutionShownForQuestionId === question.id) {
      root.innerHTML = solutionHtml(question);
      return;
    }

    if (game.phase === 'betting' || game.phase === 'bettingLocked') {
      root.innerHTML = bettingStageHtml(game, state.players);
      return;
    }

    root.innerHTML = stageHtml(game, question, state.players, answers);
    syncVideo(game, question, ctx, this);
  },

  unmount(container) {
    document.body.classList.remove('percent-mode');
    if (window.__setGameMounted) window.__setGameMounted(false);
    container.innerHTML = '';
  },
});

function bettingStageHtml(game, players) {
  const lockedCount = players.filter((player) => game.betsByPlayerId[player.id] && game.betsByPlayerId[player.id].locked).length;
  return `
    <div class="percent-betting-stage">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-betting-title">Bonusspiel: Das Prozent-Quiz</div>
      <div class="percent-betting-sub">Setzt eure Chips auf die Fragen</div>
      <div class="percent-multiplier-grid">
        ${game.questions.map((question) => `
          <div class="percent-multiplier-card">
            <b>${escapeHtml(question.label)}</b>
            <span>x${formatMultiplier(question.multiplier)}</span>
          </div>
        `).join('')}
      </div>
      <div class="percent-hint">${lockedCount} / ${players.length} Spieler haben gesetzt</div>
    </div>`;
}

function solutionHtml(question) {
  return `
    <div class="percent-solution-stage">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-solution-title">Lösung</div>
      <div class="percent-solution-sub">${escapeHtml(question.solutionTitle || question.label)}</div>
      ${question.solutionExists
        ? `<div class="percent-solution-frame"><img src="${escapeHtml(question.solutionImageSrc)}" alt="${escapeHtml(question.solutionTitle || 'Lösung')}" /></div>`
        : `<div class="percent-solution-missing">
            <b>Lösungsscreenshot fehlt</b>
            <span>${escapeHtml(question.solutionImageSrc)}</span>
          </div>`}
    </div>`;
}

function stageHtml(game, question, players, answers) {
  if (!question) {
    return `
      <div class="percent-idle">
        <div class="percent-brand">WEIDMANN WM Poker Edition</div>
        <div class="percent-big">Bonusspiel</div>
        <div class="percent-sub">Das Prozent-Quiz</div>
        <div class="percent-hint">Warte auf Auswahl durch die Spielleitung</div>
      </div>`;
  }

  if (game.phase === 'results') {
    return resultsHtml(game, question, players, answers);
  }

  if (game.phase === 'playing') {
    return clipHtml(game, question, players, answers);
  }

  if (game.phase === 'locked') {
    return `
      <div class="percent-idle selected">
        <div class="percent-brand">WEIDMANN WM Poker Edition</div>
        <div class="percent-big">${escapeHtml(question.label)}</div>
        <div class="percent-sub">Antworten sind eingeloggt</div>
        <div class="percent-hint">${answeredCount(players, answers)}/${players.length} Spieler haben geantwortet</div>
      </div>`;
  }

  return `
    <div class="percent-idle selected">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-big">${escapeHtml(question.label)}</div>
      <div class="percent-sub">Bereit?</div>
      <div class="percent-hint">${game.answersOpen ? 'Antworten offen' : 'Warte auf Start'}</div>
    </div>`;
}

function clipHtml(game, question, players, answers) {
  if (!question.clipExists) {
    return `
      <div class="percent-idle selected">
        <div class="percent-brand">WEIDMANN WM Poker Edition</div>
        <div class="percent-big">${escapeHtml(question.label)}</div>
        <div class="percent-error">Clip-Datei fehlt: ${escapeHtml(question.clipSrc)}</div>
        <div class="percent-hint">${game.answersOpen ? 'Antworten offen' : 'Antworten geschlossen'} · ${answeredCount(players, answers)}/${players.length} eingeloggt</div>
      </div>`;
  }

  return `
    <div class="percent-video-stage">
      <div class="percent-video-frame">
        <video id="percent-video" src="${escapeHtml(question.clipSrc)}" playsinline autoplay></video>
        <button class="percent-audio-unlock" data-percent-audio-unlock hidden>Ton aktivieren</button>
      </div>
      <div class="percent-video-bar">
        <b>${escapeHtml(question.label)}</b>
        <span>${game.answersOpen ? 'Antworten offen' : 'Antworten geschlossen'} · ${answeredCount(players, answers)}/${players.length} eingeloggt</span>
      </div>
    </div>`;
}

function resultsHtml(game, question, players, answers) {
  const payouts = (game.payoutsByQuestionId && game.payoutsByQuestionId[question.id]) || {};
  return `
    <div class="percent-results">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-results-title">${escapeHtml(question.label)} · Auswertung</div>
      <div class="percent-results-grid">
        ${players.map((player) => {
          const answer = answers[player.id];
          const payout = payouts[player.id];
          const bet = betFor(game, player.id, question.id);
          return `
            <div class="percent-result-card" style="--pc:${player.color}">
              <div class="percent-result-name">${escapeHtml(player.name)}</div>
              <div class="percent-result-answer">${answer ? escapeHtml(formatAnswer(answer.answer)) : 'Keine Antwort'}</div>
              <div class="percent-result-meta">
                ${payout ? (payout.isCorrect ? 'Richtig' : 'Falsch') : 'Nicht bewertet'} ·
                Einsatz ${formatChips(bet)} · x${formatMultiplier(question.multiplier)} ·
                Auszahlung ${formatChips(payout ? payout.payoutAmount : 0)}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function syncVideo(game, question, ctx, host) {
  const video = document.getElementById('percent-video');
  if (!video || !question || !question.clipExists) return;

  video.onended = () => ctx.sendAction({ type: 'percent:clip-ended' });
  const playback = game.clipPlayback || {};
  const isNewVideoElement = host.lastVideoElement !== video;
  if (host.lastCommandId === playback.commandId && !isNewVideoElement) return;
  host.lastVideoElement = video;
  host.lastCommandId = playback.commandId;

  let resumeAt = null;
  if (isNewVideoElement && playback.isPlaying && playback.startedAt) {
    const elapsedSeconds = Math.max(0, (Date.now() - Number(playback.startedAt)) / 1000);
    resumeAt = elapsedSeconds;
  }

  if (playback.command === 'restart') {
    if (!isNewVideoElement) video.currentTime = 0;
    playVideo(video, isNewVideoElement ? 0 : null);
    return;
  }
  if (playback.command === 'play') {
    playVideo(video, resumeAt);
    return;
  }
  if (playback.command === 'pause') {
    video.pause();
  }
}

function playVideo(video, targetTime) {
  const start = () => {
    hideAudioUnlock(video);
    video.muted = false;
    if (targetTime != null && Number.isFinite(targetTime)) {
      try {
        video.currentTime = targetTime;
      } catch (err) {
        // Einige Browser erlauben currentTime erst nach loadedmetadata.
      }
    }
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
        showAudioUnlock(video);
      });
    }
  };

  if (video.readyState >= 1) {
    start();
    return;
  }
  video.addEventListener('loadedmetadata', start, { once: true });
}

function showAudioUnlock(video) {
  const button = video.parentElement && video.parentElement.querySelector('[data-percent-audio-unlock]');
  if (!button) return;
  button.hidden = false;
  button.onclick = () => {
    video.muted = false;
    video.play().then(() => {
      button.hidden = true;
    }).catch(() => {
      button.textContent = 'TV anklicken für Ton';
    });
  };
}

function hideAudioUnlock(video) {
  const button = video.parentElement && video.parentElement.querySelector('[data-percent-audio-unlock]');
  if (button) button.hidden = true;
}

function percentState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    selectedQuestionId: raw.selectedQuestionId || null,
    phase: raw.phase || 'idle',
    answersOpen: raw.answersOpen === true,
    clipPlayback: raw.clipPlayback || {},
    answersByQuestionId: raw.answersByQuestionId || {},
    betsByPlayerId: raw.betsByPlayerId || {},
    payoutsByQuestionId: raw.payoutsByQuestionId || {},
    solutionVisible: raw.solutionVisible === true,
    solutionShownForQuestionId: raw.solutionShownForQuestionId || null,
    questions: Array.isArray(raw.questions) ? raw.questions : [],
  };
}

function selectedQuestion(game) {
  return game.questions.find((question) => question.id === game.selectedQuestionId) || null;
}

function answersFor(game, questionId) {
  return (game.answersByQuestionId && game.answersByQuestionId[questionId]) || {};
}

function answeredCount(players, answers) {
  return players.filter((player) => answers[player.id]).length;
}

function formatAnswer(answer) {
  return /^R\dC\d$/.test(answer) ? answer.replace('R', 'Reihe ').replace('C', ', Spalte ') : answer;
}

function formatMultiplier(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function betFor(game, playerId, questionId) {
  const entry = game.betsByPlayerId && game.betsByPlayerId[playerId];
  return Number(entry && entry.bets && entry.bets[questionId]) || 0;
}

function formatChips(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function injectPercentDisplayStyles() {
  if (document.getElementById('percent-display-styles')) return;
  const style = document.createElement('style');
  style.id = 'percent-display-styles';
  style.textContent = `
    body.percent-mode footer.scores { display: none; }
    body.percent-mode main.stage {
      min-height: 100vh;
      padding: 18px;
      background:
        radial-gradient(circle at 50% 42%, rgba(255, 209, 92, .18), transparent 0 36%),
        linear-gradient(180deg, #18070d 0%, #080304 100%);
    }
    .percent-display {
      width: min(1500px, 96vw);
      height: min(900px, 94vh);
      display: grid;
      place-items: center;
    }
    .percent-idle,
    .percent-results,
    .percent-betting-stage,
    .percent-solution-stage,
    .percent-video-stage {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 18px;
      text-align: center;
    }
    .percent-brand {
      color: var(--accent);
      font-size: clamp(1.35rem, 2.5vw, 2.5rem);
      font-weight: 900;
      letter-spacing: .18em;
      text-shadow: 0 0 18px rgba(255,209,92,.42);
    }
    .percent-big {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(5rem, 12vw, 12rem);
      line-height: .9;
      font-weight: 900;
      text-shadow: 0 8px 28px rgba(0,0,0,.62), 0 0 34px rgba(255,209,92,.25);
    }
    .percent-sub {
      color: #fff1ae;
      font-size: clamp(1.8rem, 4vw, 4rem);
      font-weight: 900;
    }
    .percent-betting-title {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(3.2rem, 7vw, 7rem);
      line-height: .95;
      font-weight: 900;
      text-shadow: 0 8px 28px rgba(0,0,0,.62), 0 0 34px rgba(255,209,92,.25);
    }
    .percent-betting-sub {
      color: #fff1ae;
      font-size: clamp(1.5rem, 3vw, 3rem);
      font-weight: 900;
    }
    .percent-multiplier-grid {
      width: min(1240px, 94vw);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
    }
    .percent-multiplier-card {
      min-height: 132px;
      display: grid;
      place-items: center;
      gap: 4px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.32);
      background: linear-gradient(180deg, rgba(255,209,92,.16), rgba(18,7,10,.82));
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.05), 0 14px 28px rgba(0,0,0,.28);
    }
    .percent-multiplier-card b {
      color: #fff8df;
      font-size: clamp(1.25rem, 2vw, 1.8rem);
      font-weight: 900;
    }
    .percent-multiplier-card span {
      color: var(--accent);
      font-size: clamp(2.4rem, 4.6vw, 4.8rem);
      font-weight: 900;
      line-height: .9;
      text-shadow: 0 0 22px rgba(255,209,92,.34);
    }
    .percent-hint {
      color: var(--muted);
      font-size: clamp(1.1rem, 2vw, 1.8rem);
      font-weight: 800;
    }
    .percent-error {
      color: #ff7382;
      font-size: clamp(1.4rem, 2.8vw, 2.8rem);
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .percent-video-stage {
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 14px;
    }
    .percent-video-frame {
      position: relative;
      width: min(1380px, 94vw);
      aspect-ratio: 16 / 9;
      max-height: 78vh;
      border: 1px solid rgba(255,209,92,.35);
      border-radius: 8px;
      overflow: hidden;
      background: #050203;
      box-shadow: 0 24px 54px rgba(0,0,0,.48), 0 0 0 1px rgba(255,255,255,.05) inset;
    }
    .percent-video-frame video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      background: #000;
    }
    .percent-audio-unlock {
      position: absolute;
      left: 50%;
      bottom: 22px;
      transform: translateX(-50%);
      padding: 14px 24px;
      border-radius: 8px;
      border: 2px solid rgba(255,209,92,.78);
      background: linear-gradient(180deg, #ffe08a, var(--accent));
      color: #241104;
      font-size: clamp(1rem, 1.8vw, 1.6rem);
      font-weight: 900;
      box-shadow: 0 14px 32px rgba(0,0,0,.38), 0 0 24px rgba(255,209,92,.28);
      z-index: 3;
    }
    .percent-audio-unlock[hidden] {
      display: none;
    }
    .percent-video-bar {
      width: min(1380px, 94vw);
      display: flex;
      justify-content: space-between;
      gap: 18px;
      color: #fff8df;
      font-size: clamp(1.2rem, 2vw, 2rem);
      font-weight: 900;
    }
    .percent-video-bar span { color: var(--muted); }
    .percent-results-title {
      color: #fff8df;
      font-size: clamp(2.2rem, 4.8vw, 5rem);
      font-weight: 900;
    }
    .percent-solution-stage {
      animation: percentSolutionIn .32s ease-out both;
    }
    .percent-solution-title {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(4rem, 9vw, 9rem);
      line-height: .9;
      font-weight: 900;
      text-shadow: 0 8px 28px rgba(0,0,0,.62), 0 0 34px rgba(255,209,92,.25);
    }
    .percent-solution-sub {
      color: #fff1ae;
      font-size: clamp(1.5rem, 2.7vw, 2.8rem);
      font-weight: 900;
    }
    .percent-solution-frame {
      width: min(1320px, 94vw);
      max-height: 68vh;
      display: grid;
      place-items: center;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.45);
      background: rgba(5, 2, 3, .76);
      box-shadow: 0 26px 64px rgba(0,0,0,.52), 0 0 40px rgba(255,209,92,.14);
    }
    .percent-solution-frame img {
      max-width: 100%;
      max-height: calc(68vh - 24px);
      object-fit: contain;
      display: block;
      border-radius: 6px;
    }
    .percent-solution-missing {
      width: min(1180px, 94vw);
      display: grid;
      gap: 14px;
      padding: 34px;
      border-radius: 8px;
      border: 1px solid rgba(255,115,130,.52);
      background: rgba(64, 11, 20, .55);
      color: #ffd6dc;
      font-size: clamp(1.3rem, 2.5vw, 2.6rem);
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .percent-solution-missing span {
      color: #ffb3bd;
      font-size: clamp(1rem, 1.6vw, 1.6rem);
    }
    @keyframes percentSolutionIn {
      from { opacity: 0; transform: translateY(10px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .percent-results-grid {
      width: min(1260px, 94vw);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .percent-result-card {
      min-height: 150px;
      display: grid;
      place-items: center;
      gap: 8px;
      border-radius: 8px;
      border: 1px solid rgba(255,209,92,.28);
      border-top: 6px solid var(--pc);
      background: rgba(18, 7, 10, .8);
      padding: 18px;
    }
    .percent-result-name {
      color: var(--pc);
      font-size: clamp(1.2rem, 2vw, 1.8rem);
      font-weight: 900;
    }
    .percent-result-answer {
      color: #fff8df;
      font-size: clamp(2rem, 4vw, 4rem);
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .percent-result-meta {
      color: var(--muted);
      font-size: clamp(.9rem, 1.4vw, 1.15rem);
      font-weight: 900;
      line-height: 1.3;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
