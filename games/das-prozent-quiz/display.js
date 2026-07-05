GameRegistry.register('das-prozent-quiz', {
  mount(container, ctx) {
    injectPercentDisplayStyles();
    document.body.classList.add('percent-mode');
    if (window.__setGameMounted) window.__setGameMounted(true);
    container.innerHTML = '<div class="percent-display" id="percent-display"></div>';
  },

  update(state, ctx) {
    const root = document.getElementById('percent-display');
    if (!root) return;

    const game = percentState(state);
    const question = selectedQuestion(game);

    if (game.solutionVisible && game.solution && question && game.solution.questionId === question.id) {
      root.innerHTML = solutionHtml(game, question, state.players);
      stopPercentTimerLoop();
      return;
    }

    if (game.phase === 'betting' || game.phase === 'bettingLocked') {
      root.innerHTML = bettingStageHtml(game, state.players);
      stopPercentTimerLoop();
      return;
    }

    if (game.phase === 'results') {
      root.innerHTML = resultsHtml(game, state.players);
      stopPercentTimerLoop();
      return;
    }

    root.innerHTML = stageHtml(game, question, state.players);
    syncPercentTimer(game, ctx, state.players, question);
  },

  unmount(container) {
    document.body.classList.remove('percent-mode');
    if (window.__setGameMounted) window.__setGameMounted(false);
    stopPercentTimerLoop();
    container.innerHTML = '';
  },
});

/* ---------- Einsatzphase ---------- */

function bettingStageHtml(game, players) {
  const lockedCount = players.filter((player) => {
    const entry = game.betsByPlayerId[player.id];
    return entry && entry.locked && entry.amount > 0;
  }).length;

  if (game.phase === 'bettingLocked') {
    return `
      <div class="percent-betting-stage">
        <div class="percent-brand">WEIDMANN WM Poker Edition</div>
        <div class="percent-betting-title">Die Einsätze stehen!</div>
        <div class="percent-bet-overview">
          ${players.map((player) => {
            const entry = game.betsByPlayerId[player.id];
            const question = entry ? questionInState(game, entry.questionId) : null;
            return `
              <div class="percent-bet-overview-card" style="--pc:${player.color}">
                <b>${escapeHtml(player.name)}</b>
                ${question && entry.amount > 0
                  ? `<span class="percent-bet-q">${escapeHtml(question.label)}</span>
                     <span class="percent-bet-amount">${formatChips(entry.amount)} Chips · x${formatMultiplier(question.multiplier)}</span>`
                  : '<span class="percent-bet-q muted-line">Kein Einsatz</span>'}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="percent-betting-stage">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-betting-title">Bonusspiel: Das 1% Quiz</div>
      <div class="percent-betting-sub">Wähle EINE Frage und setze deine Chips</div>
      <div class="percent-multiplier-grid">
        ${game.questions.map((question) => `
          <div class="percent-multiplier-card">
            <b>${escapeHtml(question.label)}</b>
            <span>x${formatMultiplier(question.multiplier)}</span>
            <em>Richtig: Einsatz x${formatMultiplier(question.multiplier)} · Falsch: Einsatz weg</em>
          </div>
        `).join('')}
      </div>
      <div class="percent-hint">${lockedCount} / ${players.length} Spieler haben gesetzt</div>
    </div>`;
}

/* ---------- Fragen-Ansicht ---------- */

function stageHtml(game, question, players) {
  if (!question) {
    return `
      <div class="percent-idle">
        <div class="percent-brand">WEIDMANN WM Poker Edition</div>
        <div class="percent-big">Bonusspiel</div>
        <div class="percent-sub">Das 1% Quiz</div>
        <div class="percent-hint">Warte auf Auswahl durch die Spielleitung</div>
      </div>`;
  }

  if (game.revealStep <= 0) {
    return `
      <div class="percent-idle selected">
        <div class="percent-brand">WEIDMANN WM Poker Edition</div>
        <div class="percent-big">${escapeHtml(question.label)}</div>
        <div class="percent-sub">x${formatMultiplier(question.multiplier)}</div>
        <div class="percent-hint">Die Frage wird gleich aufgedeckt …</div>
      </div>`;
  }

  return `
    <div class="percent-question-stage">
      <div class="percent-stage-head">
        <span class="percent-stage-chip">${escapeHtml(question.label)}</span>
        <span class="percent-stage-chip gold">x${formatMultiplier(question.multiplier)}</span>
      </div>
      ${questionPartsHtml(game, question)}
      ${timerBarHtml(game, question, players)}
    </div>`;
}

function questionPartsHtml(game, question) {
  if (question.visual === 'note') {
    const parts = [];
    parts.push(`
      <div class="percent-panel-row">
        <div class="percent-text-panel">${escapeHtml(question.questionText)}</div>
        <div class="percent-image-panel percent-note-panel">${questionNoteHtml(question)}</div>
      </div>`);
    if (game.revealStep >= 2) {
      parts.push(`
        <div class="percent-panel-row">
          <div class="percent-text-panel percent-subquestion">${escapeHtml(question.subQuestionText)}</div>
          <div class="percent-options-grid">
            ${(question.options || []).map((option) => `
              <div class="percent-option-plate">
                <span class="percent-option-letter">${escapeHtml(option.value)}</span>
                <span class="percent-option-name">${escapeHtml(option.label)}</span>
              </div>
            `).join('')}
          </div>
        </div>`);
    }
    return parts.join('');
  }

  const textPanel = `<div class="percent-text-panel percent-text-wide">${escapeHtml(question.questionText)}</div>`;
  if (game.revealStep < 2) return textPanel;

  const imagePanel = questionImagePanelHtml(question);
  if (imagePanel) {
    return `
      <div class="percent-media-row">
        <div class="percent-text-panel percent-question-copy">${escapeHtml(question.questionText)}</div>
        ${imagePanel}
      </div>`;
  }
  return textPanel;
}

function questionImagePanelHtml(question) {
  if (question.visual === 'diagram') {
    return `<div class="percent-image-panel percent-diagram-panel">${diagramSvg()}</div>`;
  }
  if (question.visual === 'dice') {
    return `<div class="percent-image-panel percent-dice-panel">${diceSvg()}</div>`;
  }
  if (question.visual === 'photo') {
    return `<div class="percent-image-panel percent-photo-panel">${questionPhotoHtml(question)}</div>`;
  }
  return '';
}

function questionNoteHtml(question) {
  if (question.imageSrc && question.imageExists) {
    return `<img class="percent-note-photo" src="${escapeHtml(question.imageSrc)}" alt="" />`;
  }
  if (question.id === 'percent-10') {
    return '<img class="percent-note-photo" src="/assets/games/prozentquiz/10-note.png" alt="" />';
  }
  return noteSvg();
}

function questionPhotoHtml(question) {
  const imageSrc = questionPhotoSrc(question);
  if (imageSrc) return `<img class="percent-photo" src="${escapeHtml(imageSrc)}" alt="" />`;
  if (question.fallbackVisual === 'diagram') return diagramSvg();
  if (question.fallbackVisual === 'dice') return diceSvg();
  // Fallback, solange die Fotodatei noch nicht abgelegt wurde.
  return diceSvg();
}

function questionPhotoSrc(question) {
  if (question && question.imageSrc && question.imageExists) return question.imageSrc;
  if (question && question.id === 'percent-1') return '/assets/games/prozentquiz/1-question.png';
  return '';
}

function timerBarHtml(game, question, players) {
  const eligible = eligiblePlayers(game, question, players);
  const answers = answersFor(game, question.id);
  const answered = eligible.filter((player) => answers[player.id]).length;
  const countText = `${answered}/${eligible.length} Antworten eingeloggt`;

  if (game.timer.running && game.timer.endsAt) {
    const remaining = Math.max(0, Math.ceil((game.timer.endsAt - Date.now()) / 1000));
    return `
      <div class="percent-timer running">
        <span class="percent-timer-value" id="percent-timer-remaining">${remaining}</span>
        <div class="percent-timer-track"><div class="percent-timer-fill" id="percent-timer-fill"></div></div>
        <span class="percent-timer-meta" id="percent-timer-meta">${escapeHtml(countText)}</span>
      </div>`;
  }

  if (game.phase === 'locked') {
    return `
      <div class="percent-timer stopped">
        <span class="percent-timer-value">⏱</span>
        <span class="percent-timer-locked">Antworten gesperrt</span>
        <span class="percent-timer-meta">${escapeHtml(countText)}</span>
      </div>`;
  }

  return `
    <div class="percent-timer idle">
      <span class="percent-timer-meta">Timer noch nicht gestartet · ${escapeHtml(countText)}</span>
    </div>`;
}

/* ---------- Lösung + Auswertung ---------- */

function solutionHtml(game, question, players) {
  if (game.solution.overlayCount > 0) {
    return steppedSolutionHtml(game, question, players);
  }
  if (question.id === 'percent-10') {
    return commissarSolutionHtml(game, question, players);
  }
  const solutionImage = solutionImageHtml(game.solution, question);
  const answerHtml = solutionImage
    ? `<div class="percent-solution-main-row">${solutionImage}</div>`
    : `<div class="percent-solution-answer">${escapeHtml(game.solution.label)}</div>`;

  return `
    <div class="percent-solution-stage${solutionImage ? ' with-image' : ''}">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-solution-title">Lösung · ${escapeHtml(question.label)}</div>
      ${answerHtml}
      ${game.solution.explanation
        ? `<div class="percent-solution-explain">${escapeHtml(game.solution.explanation)}</div>`
        : ''}
      ${solutionResultCardsHtml(game, question, players)}
    </div>`;
}

function solutionImageHtml(solution, question) {
  const imageSrc = solutionImageSrc(solution, question);
  if (!imageSrc) return '';
  return `
    <div class="percent-solution-image">
      <img src="${escapeHtml(imageSrc)}" alt="" />
    </div>`;
}

function solutionImageSrc(solution, question) {
  if (solution && solution.imageSrc && solution.imageExists) return solution.imageSrc;
  if (question && question.id === 'percent-25') return '/assets/games/prozentquiz/25-solution.png';
  return '';
}

function commissarSolutionHtml(game, question, players) {
  const correctValue = game.solution && game.solution.value ? game.solution.value : 'B';
  return `
    <div class="percent-solution-stage percent-commissar-solution">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-solution-title">Lösung · ${escapeHtml(question.label)}</div>
      <div class="percent-commissar-board">
        <div class="percent-commissar-top">
          <div class="percent-text-panel percent-commissar-story">${escapeHtml(question.questionText)}</div>
          <div class="percent-commissar-note-box">
            <div class="percent-commissar-note">${questionNoteHtml(question)}</div>
            <div class="percent-bert-log">BERT LOG</div>
          </div>
        </div>
        <div class="percent-commissar-bottom">
          <div class="percent-text-panel percent-commissar-question">${escapeHtml(question.subQuestionText)}</div>
          <div class="percent-commissar-options">
            ${(question.options || []).map((option) => `
              <div class="percent-option-plate ${option.value === correctValue ? 'correct' : ''}">
                <span class="percent-option-letter">${escapeHtml(option.value)}</span>
                <span class="percent-option-name">${escapeHtml(option.label)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${game.solution.explanation
        ? `<div class="percent-solution-explain percent-commissar-explain">${escapeHtml(game.solution.explanation)}</div>`
        : ''}
      ${solutionResultCardsHtml(game, question, players)}
    </div>`;
}

// Lösung wie im Original: Foto mit einzeln aufgedeckten Einblendungen und
// goldener Ergebnis-Box rechts.
function steppedSolutionHtml(game, question, players) {
  const solution = game.solution;
  const revealed = solution.answerRevealed === true;
  const imageSrc = solutionPhotoSrc(solution, question);
  const overlays = solutionOverlays(solution, question);
  return `
    <div class="percent-solution-stage stepped">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-solution-title">Lösung · ${escapeHtml(question.label)}</div>
      <div class="percent-solution-photo-row">
        <div class="percent-photo-frame">
          ${imageSrc
            ? `<img src="${escapeHtml(imageSrc)}" alt="" />`
            : diceSvg()}
          ${overlays.map((overlay) => `
            <div class="percent-photo-overlay" style="left:${Number(overlay.x) || 0}%;top:${Number(overlay.y) || 0}%;">
              ${(overlay.lines || []).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
            </div>
          `).join('')}
        </div>
        <div class="percent-answer-box ${revealed ? 'revealed' : ''}">${revealed ? escapeHtml(solution.value) : '?'}</div>
      </div>
      ${revealed && solution.explanation
        ? `<div class="percent-solution-explain">${escapeHtml(solution.explanation)}</div>`
        : ''}
      ${revealed ? solutionResultCardsHtml(game, question, players) : ''}
    </div>`;
}

function solutionPhotoSrc(solution, question) {
  if (solution && solution.imageSrc && solution.imageExists) return solution.imageSrc;
  if (question && question.id === 'percent-1') return '/assets/games/prozentquiz/1-question.png';
  return '';
}

function solutionOverlays(solution, question) {
  const overlays = (solution && solution.revealedOverlays) || [];
  if (!question || question.id !== 'percent-1') return overlays;
  const percentOnePositions = {
    'die-left': { x: 0, y: 70 },
    'die-right': { x: 48, y: 85 },
    eyes: { x: 43, y: 29 },
  };
  return overlays.map((overlay) => ({
    ...overlay,
    ...(percentOnePositions[overlay.id] || {}),
  }));
}

function solutionResultCardsHtml(game, question, players) {
  const answers = answersFor(game, question.id);
  const payouts = payoutsFor(game, question.id);
  const eligible = eligiblePlayers(game, question, players);
  return `
    <div class="percent-results-grid">
      ${eligible.map((player) => {
        const answer = answers[player.id];
        const payout = payouts[player.id];
        const bet = betEntry(game, player.id);
        const correct = payout && payout.isCorrect;
        return `
          <div class="percent-result-card ${payout ? (correct ? 'won' : 'lost') : ''}" style="--pc:${player.color}">
            <div class="percent-result-name">${escapeHtml(player.name)}</div>
            <div class="percent-result-answer">${answer ? escapeHtml(answer.answer) : 'Keine Antwort'}</div>
            <div class="percent-result-meta">
              ${payout ? (correct ? '✔ Richtig' : '✘ Falsch') : 'Nicht bewertet'} ·
              Einsatz ${formatChips(bet ? bet.amount : 0)} ·
              Auszahlung ${formatChips(payout ? payout.payoutAmount : 0)}
            </div>
          </div>`;
      }).join('') || '<div class="percent-hint">Niemand hat diese Frage gewählt.</div>'}
    </div>`;
}

function resultsHtml(game, players) {
  return `
    <div class="percent-results">
      <div class="percent-brand">WEIDMANN WM Poker Edition</div>
      <div class="percent-results-title">Das 1% Quiz · Auswertung</div>
      <div class="percent-results-grid">
        ${players.map((player) => {
          const bet = betEntry(game, player.id);
          const question = bet ? questionInState(game, bet.questionId) : null;
          if (!question || !bet || bet.amount <= 0) {
            return `
              <div class="percent-result-card" style="--pc:${player.color}">
                <div class="percent-result-name">${escapeHtml(player.name)}</div>
                <div class="percent-result-answer">–</div>
                <div class="percent-result-meta">Kein Einsatz</div>
              </div>`;
          }
          const answer = answersFor(game, question.id)[player.id];
          const payout = payoutsFor(game, question.id)[player.id];
          const correct = payout && payout.isCorrect;
          return `
            <div class="percent-result-card ${payout ? (correct ? 'won' : 'lost') : ''}" style="--pc:${player.color}">
              <div class="percent-result-name">${escapeHtml(player.name)}</div>
              <div class="percent-result-answer">${answer ? escapeHtml(answer.answer) : 'Keine Antwort'}</div>
              <div class="percent-result-meta">
                ${escapeHtml(question.label)} ·
                ${payout ? (correct ? '✔ Richtig' : '✘ Falsch') : 'Nicht bewertet'} ·
                Einsatz ${formatChips(bet.amount)} · x${formatMultiplier(question.multiplier)} ·
                Auszahlung ${formatChips(payout ? payout.payoutAmount : 0)}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* ---------- Grafiken (nachgebaut wie im Original) ---------- */

// 25% Frage: Kreuz aus fünf Kreisen, Mitte blau, Plus-Zeichen dazwischen.
function diagramSvg() {
  const circle = (x, y, blue) => `
    <circle cx="${x}" cy="${y}" r="52" fill="rgba(6,10,22,.55)"
      stroke="${blue ? '#4fb3ff' : '#e7edf6'}" stroke-width="${blue ? 7 : 5}"
      ${blue ? 'filter="url(#percentGlow)"' : ''} />`;
  const plus = (x, y) => `
    <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
      fill="#e7edf6" font-size="40" font-weight="900" font-family="inherit">+</text>`;
  return `
    <svg viewBox="0 0 420 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagramm mit fünf Kreisen">
      <defs>
        <filter id="percentGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${circle(210, 80, false)}
      ${circle(80, 210, false)}
      ${circle(210, 210, true)}
      ${circle(340, 210, false)}
      ${circle(210, 340, false)}
      ${plus(145, 210)}
      ${plus(275, 210)}
      ${plus(210, 145)}
      ${plus(210, 275)}
    </svg>`;
}

// 10% Frage: Zettel mit rotem und gelbem Farbfleck auf liniertem Papier.
function noteSvg() {
  const scribble = (cx, cy, color) => {
    const strokes = [];
    for (let i = 0; i < 5; i += 1) {
      const y = cy - 18 + i * 9;
      strokes.push(`
        <path d="M ${cx - 38} ${y}
          q 10 ${i % 2 ? -8 : 8} 20 0
          q 10 ${i % 2 ? 8 : -8} 20 0
          q 10 ${i % 2 ? -8 : 8} 20 0
          q 10 ${i % 2 ? 8 : -8} 18 0"
          fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" opacity=".92" />`);
    }
    return strokes.join('');
  };
  return `
    <svg viewBox="0 0 380 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zettel mit rotem und gelbem Farbfleck">
      <g transform="rotate(-3 190 125)">
        <rect x="18" y="26" width="344" height="202" rx="10" fill="rgba(0,0,0,.4)" />
        <rect x="12" y="18" width="344" height="202" rx="10" fill="#f6f7f4" stroke="#d8dbd2" stroke-width="2" />
        ${[58, 86, 114, 142, 170, 198].map((y) => `
          <line x1="26" y1="${y}" x2="342" y2="${y}" stroke="#b9c8e0" stroke-width="2" />
        `).join('')}
        ${scribble(110, 112, '#d9251d')}
        ${scribble(262, 112, '#f0b91d')}
      </g>
    </svg>`;
}

// 1% Frage: Zwei Würfel - links die 4, rechts die 6 mit 3 oben.
// Sichtbare Augen: 4 + 6 + 3 = 13 (fuer die Lösung relevant).
function diceSvg() {
  const pip = (x, y, r = 13) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#181a20" />`;
  const topPip = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="10" fill="#181a20" />`;
  return `
    <svg viewBox="0 0 760 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zwei Würfel">
      <ellipse cx="240" cy="345" rx="130" ry="22" fill="rgba(0,0,0,.45)" />
      <ellipse cx="540" cy="360" rx="150" ry="24" fill="rgba(0,0,0,.45)" />

      <!-- Würfel links: die 4 -->
      <g transform="translate(140 120) rotate(-9)">
        <rect x="0" y="0" width="185" height="185" rx="26" fill="#f4f4f7" stroke="#c9c9d4" stroke-width="3" />
        ${pip(55, 55, 17)}
        ${pip(130, 55, 17)}
        ${pip(55, 130, 17)}
        ${pip(130, 130, 17)}
      </g>

      <!-- Würfel rechts: vorne die 6, oben die 3 -->
      <g transform="translate(430 90) rotate(3)">
        <polygon points="4,74 52,4 240,4 192,74" fill="#e2e2ea" stroke="#c9c9d4" stroke-width="3" />
        <rect x="0" y="66" width="190" height="190" rx="12" fill="#f4f4f7" stroke="#c9c9d4" stroke-width="3" />
        ${topPip(60, 56)}
        ${topPip(122, 39)}
        ${topPip(184, 22)}
        ${pip(52, 113)}
        ${pip(138, 113)}
        ${pip(52, 161)}
        ${pip(138, 161)}
        ${pip(52, 209)}
        ${pip(138, 209)}
      </g>
    </svg>`;
}

/* ---------- Timer-Loop (läuft nur auf dem Display) ---------- */

let percentTimerInterval = null;
let percentTimerExpireSentFor = 0;
let percentTimerLastBeepSecond = null;
let percentAudioCtx = null;

function syncPercentTimer(game, ctx, players, question) {
  stopPercentTimerLoop();
  if (!question || !game.timer.running || !game.timer.endsAt) return;

  const endsAt = Number(game.timer.endsAt);
  const durationMs = Math.max(1, (Number(game.timer.durationSeconds) || 30) * 1000);

  const tick = () => {
    const remainingMs = endsAt - Date.now();
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

    const valueEl = document.getElementById('percent-timer-remaining');
    if (valueEl) valueEl.textContent = String(remaining);
    const fillEl = document.getElementById('percent-timer-fill');
    if (fillEl) fillEl.style.width = `${Math.max(0, Math.min(100, (remainingMs / durationMs) * 100))}%`;

    if (remaining <= 5 && remaining > 0 && percentTimerLastBeepSecond !== remaining) {
      percentTimerLastBeepSecond = remaining;
      percentBeep(880, 0.09);
    }

    if (remainingMs <= 0) {
      if (percentTimerExpireSentFor !== endsAt) {
        percentTimerExpireSentFor = endsAt;
        percentBeep(392, 0.5);
        ctx.sendAction({ type: 'percent:timer-expired' });
      }
      stopPercentTimerLoop();
    }
  };

  percentTimerInterval = setInterval(tick, 200);
  tick();
}

function stopPercentTimerLoop() {
  if (percentTimerInterval) {
    clearInterval(percentTimerInterval);
    percentTimerInterval = null;
  }
}

function percentBeep(freq, duration) {
  try {
    if (!percentAudioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      percentAudioCtx = new Ctor();
    }
    const ctx = percentAudioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch (e) {
    // Ohne Sound weiterspielen.
  }
}

/* ---------- State-Helfer ---------- */

function percentState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    selectedQuestionId: raw.selectedQuestionId || null,
    phase: raw.phase || 'idle',
    answersOpen: raw.answersOpen === true,
    revealStep: Number(raw.revealStep) || 0,
    timer: raw.timer && typeof raw.timer === 'object' ? raw.timer : {},
    answersByQuestionId: raw.answersByQuestionId || {},
    betsByPlayerId: raw.betsByPlayerId || {},
    payoutsByQuestionId: raw.payoutsByQuestionId || {},
    solutionVisible: raw.solutionVisible === true,
    solution: raw.solution && typeof raw.solution === 'object' ? raw.solution : null,
    questions: Array.isArray(raw.questions) ? raw.questions : [],
  };
}

function selectedQuestion(game) {
  return game.questions.find((question) => question.id === game.selectedQuestionId) || null;
}

function questionInState(game, questionId) {
  return game.questions.find((question) => question.id === questionId) || null;
}

function answersFor(game, questionId) {
  return (game.answersByQuestionId && game.answersByQuestionId[questionId]) || {};
}

function payoutsFor(game, questionId) {
  return (game.payoutsByQuestionId && game.payoutsByQuestionId[questionId]) || {};
}

function betEntry(game, playerId) {
  return (game.betsByPlayerId && game.betsByPlayerId[playerId]) || null;
}

function eligiblePlayers(game, question, players) {
  return players.filter((player) => {
    const entry = betEntry(game, player.id);
    return entry && entry.questionId === question.id && entry.amount > 0;
  });
}

function formatMultiplier(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function formatChips(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/* ---------- Styles ---------- */

function injectPercentDisplayStyles() {
  if (document.getElementById('percent-display-styles')) return;
  const style = document.createElement('style');
  style.id = 'percent-display-styles';
  style.textContent = `
    body.percent-mode footer.scores { display: none; }
    body.percent-mode main.stage {
      min-height: 0;
      padding: 14px 18px 16px;
      background:
        radial-gradient(circle at 50% 42%, rgba(255, 209, 92, .18), transparent 0 36%),
        linear-gradient(180deg, #18070d 0%, #080304 100%);
    }
    body.percent-mode #content {
      min-height: 0;
    }
    .percent-display {
      width: min(1500px, 96vw);
      height: 100%;
      max-height: 100%;
      display: grid;
      place-items: center;
      min-height: 0;
    }
    .percent-idle,
    .percent-results,
    .percent-betting-stage,
    .percent-solution-stage {
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }
    .percent-multiplier-card {
      min-height: 190px;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 6px;
      border-radius: 12px;
      border: 2px solid rgba(255,209,92,.4);
      background: linear-gradient(180deg, rgba(255,209,92,.16), rgba(18,7,10,.82));
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.05), 0 14px 28px rgba(0,0,0,.28);
      padding: 14px;
    }
    .percent-multiplier-card b {
      color: #fff8df;
      font-size: clamp(1.4rem, 2.4vw, 2.2rem);
      font-weight: 900;
    }
    .percent-multiplier-card span {
      color: var(--accent);
      font-size: clamp(2.8rem, 5.4vw, 5.6rem);
      font-weight: 900;
      line-height: .9;
      text-shadow: 0 0 22px rgba(255,209,92,.34);
    }
    .percent-multiplier-card em {
      color: var(--muted);
      font-style: normal;
      font-size: clamp(.85rem, 1.4vw, 1.15rem);
      font-weight: 800;
    }
    .percent-bet-overview {
      width: min(1240px, 94vw);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
    }
    .percent-bet-overview-card {
      min-height: 140px;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 6px;
      border-radius: 10px;
      border: 1px solid rgba(255,209,92,.3);
      border-top: 6px solid var(--pc);
      background: rgba(18,7,10,.8);
      padding: 14px;
    }
    .percent-bet-overview-card b {
      color: var(--pc);
      font-size: clamp(1.2rem, 2vw, 1.7rem);
      font-weight: 900;
    }
    .percent-bet-q {
      color: #fff8df;
      font-size: clamp(1.3rem, 2.4vw, 2.2rem);
      font-weight: 900;
    }
    .percent-bet-q.muted-line { color: var(--muted); }
    .percent-bet-amount {
      color: var(--accent);
      font-size: clamp(1rem, 1.7vw, 1.4rem);
      font-weight: 900;
    }
    .percent-hint {
      color: var(--muted);
      font-size: clamp(1.1rem, 2vw, 1.8rem);
      font-weight: 800;
    }

    /* Fragen-Ansicht im Show-Look */
    .percent-question-stage {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-content: stretch;
      gap: 12px;
      min-height: 0;
      overflow: hidden;
    }
    .percent-question-stage:has(.percent-panel-row + .percent-panel-row) {
      grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr) auto;
    }
    .percent-stage-head {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    .percent-stage-chip {
      padding: 6px 20px;
      border-radius: 999px;
      border: 2px solid rgba(255,209,92,.5);
      background: rgba(18,7,10,.8);
      color: #fff8df;
      font-size: clamp(1rem, 1.8vw, 1.6rem);
      font-weight: 900;
      letter-spacing: .06em;
    }
    .percent-stage-chip.gold { color: var(--accent); }
    .percent-text-panel {
      border-radius: 16px;
      border: 3px solid rgba(255,209,92,.62);
      background: linear-gradient(180deg, rgba(24,14,26,.94), rgba(8,4,8,.94));
      box-shadow: 0 18px 44px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.05);
      color: #fdfdff;
      font-size: 2.2rem;
      font-weight: 900;
      line-height: 1.22;
      text-align: left;
      padding: 22px 28px;
      animation: percentPartIn .35s ease-out both;
      min-height: 0;
      overflow: hidden;
    }
    .percent-text-panel.percent-text-wide { width: 100%; }
    .percent-text-panel.percent-question-copy {
      display: flex;
      align-items: center;
      height: 100%;
      font-size: 2.05rem;
      line-height: 1.22;
    }
    .percent-text-panel.percent-subquestion { align-self: center; }
    .percent-media-row {
      display: grid;
      grid-template-columns: minmax(0, .86fr) minmax(0, 1.14fr);
      gap: 12px;
      align-items: stretch;
      min-height: 0;
      height: 100%;
    }
    .percent-panel-row {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
      gap: 12px;
      align-items: stretch;
      min-height: 0;
    }
    .percent-image-panel {
      display: grid;
      place-items: center;
      border-radius: 16px;
      border: 3px solid rgba(255,209,92,.62);
      background: rgba(6,3,5,.85);
      box-shadow: 0 18px 44px rgba(0,0,0,.5);
      padding: 12px;
      min-height: 0;
      overflow: hidden;
      animation: percentPartIn .35s ease-out both;
    }
    .percent-image-panel svg {
      width: 100%;
      height: 100%;
      max-height: 100%;
    }
    .percent-diagram-panel svg { max-width: min(100%, 620px); }
    .percent-dice-panel svg { max-width: min(100%, 980px); }
    .percent-note-panel svg { max-width: 460px; }
    .percent-note-panel img {
      display: block;
      width: 100%;
      max-width: min(100%, 620px);
      max-height: 100%;
      object-fit: contain;
      border-radius: 10px;
    }
    .percent-photo-panel img {
      max-width: 100%;
      max-height: 100%;
      height: auto;
      object-fit: contain;
      border-radius: 10px;
      display: block;
    }
    .percent-options-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      align-content: center;
    }
    .percent-option-plate {
      position: relative;
      min-height: 92px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      border: 3px solid rgba(255,209,92,.62);
      background: linear-gradient(180deg, rgba(24,14,26,.94), rgba(8,4,8,.94));
      box-shadow: 0 12px 26px rgba(0,0,0,.4);
      padding: 14px 12px 10px;
    }
    .percent-option-letter {
      position: absolute;
      top: -16px;
      left: 14px;
      min-width: 34px;
      padding: 3px 9px;
      border-radius: 8px;
      border: 2px solid rgba(255,209,92,.7);
      background: #12070a;
      color: var(--accent);
      font-size: clamp(1rem, 1.6vw, 1.4rem);
      font-weight: 900;
      text-align: center;
    }
    .percent-option-name {
      color: #fff8df;
      font-size: clamp(1.3rem, 2.3vw, 2.2rem);
      font-weight: 900;
    }
    @keyframes percentPartIn {
      from { opacity: 0; transform: translateY(14px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Timer */
    .percent-timer {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 14px;
      border-radius: 14px;
      border: 2px solid rgba(255,209,92,.45);
      background: rgba(10,4,7,.85);
      padding: 9px 18px;
      min-height: 70px;
    }
    .percent-timer.idle { grid-template-columns: 1fr; text-align: center; }
    .percent-timer-value {
      color: var(--accent);
      font-size: 3.6rem;
      font-weight: 900;
      line-height: 1;
      min-width: 2ch;
      text-align: center;
      text-shadow: 0 0 22px rgba(255,209,92,.4);
    }
    .percent-timer-track {
      height: 18px;
      border-radius: 999px;
      background: rgba(255,255,255,.1);
      overflow: hidden;
    }
    .percent-timer-fill {
      height: 100%;
      width: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #ffe08a, var(--accent));
      transition: width .2s linear;
    }
    .percent-timer-locked {
      color: #ff7382;
      font-size: 2rem;
      font-weight: 900;
    }
    .percent-timer-meta {
      color: var(--muted);
      font-size: 1.25rem;
      font-weight: 800;
      white-space: nowrap;
    }

    /* Lösung + Auswertung */
    .percent-solution-stage { animation: percentPartIn .32s ease-out both; }
    .percent-solution-stage.with-image {
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      align-content: stretch;
      place-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .percent-solution-stage.with-image .percent-brand {
      font-size: 2rem;
      line-height: 1;
    }
    .percent-solution-stage.with-image .percent-solution-title {
      font-size: 2.8rem;
      line-height: 1;
    }
    .percent-solution-main-row {
      width: min(1360px, 94vw);
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      align-items: center;
      justify-items: center;
    }
    .percent-solution-image {
      height: 100%;
      max-width: 100%;
      border-radius: 16px;
      border: 3px solid rgba(255,209,92,.62);
      overflow: hidden;
      background: #000;
      box-shadow: 0 18px 44px rgba(0,0,0,.5);
    }
    .percent-solution-image img {
      display: block;
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .percent-solution-stage.with-image .percent-solution-explain {
      width: min(1120px, 92vw);
      font-size: 1.55rem;
      line-height: 1.18;
    }
    .percent-solution-stage.with-image .percent-results-grid {
      width: min(1260px, 94vw);
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 10px;
    }
    .percent-solution-stage.with-image .percent-result-card {
      min-height: 118px;
      gap: 4px;
      padding: 10px 12px;
    }
    .percent-solution-stage.with-image .percent-result-name {
      font-size: 1.25rem;
    }
    .percent-solution-stage.with-image .percent-result-answer {
      font-size: 2.8rem;
      line-height: 1;
    }
    .percent-solution-stage.with-image .percent-result-meta {
      font-size: .95rem;
      line-height: 1.15;
    }
    .percent-commissar-solution {
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      align-content: stretch;
      gap: 8px;
      overflow: hidden;
    }
    .percent-commissar-solution .percent-brand {
      font-size: 1.9rem;
      line-height: 1;
    }
    .percent-commissar-solution .percent-solution-title {
      font-size: 2.6rem;
      line-height: 1;
    }
    .percent-commissar-board {
      width: min(1260px, 94vw);
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1.2fr) minmax(0, .8fr);
      gap: 10px;
    }
    .percent-commissar-top,
    .percent-commissar-bottom {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      gap: 10px;
      min-height: 0;
    }
    .percent-commissar-story,
    .percent-commissar-question {
      display: flex;
      align-items: center;
      height: 100%;
      font-size: 2rem;
      line-height: 1.18;
      padding: 18px 22px;
    }
    .percent-commissar-question {
      justify-content: center;
      text-align: center;
    }
    .percent-commissar-note-box {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 4px;
      min-height: 0;
      border-radius: 16px;
      border: 3px solid rgba(255,209,92,.62);
      background: rgba(6,3,5,.85);
      box-shadow: 0 18px 44px rgba(0,0,0,.5);
      padding: 10px;
    }
    .percent-commissar-note {
      display: grid;
      place-items: center;
      min-height: 0;
      overflow: hidden;
    }
    .percent-commissar-note img,
    .percent-commissar-note svg {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 10px;
    }
    .percent-bert-log {
      color: #ffd15c;
      font-size: 2.4rem;
      font-weight: 900;
      line-height: 1;
      text-shadow: 0 0 22px rgba(255,209,92,.48);
      letter-spacing: .06em;
    }
    .percent-commissar-options {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      align-content: center;
      min-height: 0;
    }
    .percent-option-plate.correct {
      border-color: #fff1ae;
      background: linear-gradient(180deg, rgba(255,209,92,.32), rgba(15, 38, 27, .92));
      box-shadow:
        0 0 0 3px rgba(255,209,92,.35),
        0 0 30px rgba(255,209,92,.28),
        inset 0 0 0 1px rgba(255,255,255,.1);
    }
    .percent-option-plate.correct .percent-option-name {
      color: #28e58b;
      text-shadow: 0 0 18px rgba(40,229,139,.32);
    }
    .percent-commissar-explain {
      font-size: 1.4rem;
      line-height: 1.16;
    }
    .percent-commissar-solution .percent-results-grid {
      width: min(1260px, 94vw);
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 10px;
    }
    .percent-commissar-solution .percent-result-card {
      min-height: 112px;
      gap: 4px;
      padding: 10px 12px;
    }
    .percent-commissar-solution .percent-result-name {
      font-size: 1.2rem;
    }
    .percent-commissar-solution .percent-result-answer {
      font-size: 2.6rem;
      line-height: 1;
    }
    .percent-commissar-solution .percent-result-meta {
      font-size: .92rem;
      line-height: 1.15;
    }
    .percent-solution-stage.stepped {
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      align-content: stretch;
      place-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .percent-solution-stage.stepped .percent-brand {
      font-size: 1.9rem;
      line-height: 1;
    }
    .percent-solution-stage.stepped .percent-solution-title {
      font-size: 2.7rem;
      line-height: 1;
    }
    .percent-solution-photo-row {
      width: min(1360px, 94vw);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: center;
      justify-items: center;
    }
    .percent-solution-stage.stepped .percent-solution-photo-row {
      width: min(1260px, 94vw);
      height: 100%;
      min-height: 0;
      gap: 18px;
    }
    .percent-photo-frame {
      position: relative;
      max-width: 100%;
      border-radius: 16px;
      border: 3px solid rgba(255,209,92,.62);
      overflow: hidden;
      background: #000;
      box-shadow: 0 18px 44px rgba(0,0,0,.5);
    }
    .percent-photo-frame img {
      display: block;
      max-width: 100%;
      max-height: 62vh;
      object-fit: contain;
    }
    .percent-solution-stage.stepped .percent-photo-frame {
      max-height: 100%;
    }
    .percent-solution-stage.stepped .percent-photo-frame img {
      max-height: 52vh;
    }
    .percent-photo-frame svg {
      display: block;
      width: min(900px, 80vw);
      max-height: 62vh;
    }
    .percent-photo-overlay {
      position: absolute;
      transform: translateX(-50%);
      display: grid;
      gap: 2px;
      text-align: center;
      animation: percentPartIn .3s ease-out both;
      pointer-events: none;
    }
    .percent-photo-overlay span {
      color: #ffd15c;
      font-weight: 900;
      font-size: clamp(1.05rem, 2.2vw, 2.1rem);
      line-height: 1.15;
      white-space: nowrap;
      text-shadow:
        0 2px 5px #000,
        0 -2px 5px #000,
        2px 0 5px #000,
        -2px 0 5px #000,
        0 0 14px rgba(0,0,0,.95);
    }
    .percent-solution-stage.stepped .percent-photo-overlay span {
      font-size: clamp(1rem, 1.8vw, 1.75rem);
    }
    .percent-answer-box {
      min-width: 180px;
      min-height: 120px;
      display: grid;
      place-items: center;
      padding: 12px 26px;
      border-radius: 16px;
      border: 3px solid rgba(255,209,92,.75);
      background: linear-gradient(180deg, rgba(32,19,7,.96), rgba(10,5,2,.96));
      color: rgba(255,209,92,.35);
      font-size: clamp(3rem, 6vw, 5.5rem);
      font-weight: 900;
      box-shadow: 0 14px 34px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.06);
    }
    .percent-answer-box.revealed {
      color: var(--accent);
      text-shadow: 0 0 26px rgba(255,209,92,.5);
      animation: percentPartIn .3s ease-out both;
    }
    .percent-solution-title {
      color: #fff1ae;
      font-size: clamp(1.8rem, 3.4vw, 3.4rem);
      font-weight: 900;
    }
    .percent-solution-answer {
      color: #fff8df;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(4rem, 9vw, 9rem);
      line-height: .95;
      font-weight: 900;
      text-shadow: 0 8px 28px rgba(0,0,0,.62), 0 0 34px rgba(255,209,92,.35);
    }
    .percent-solution-explain {
      width: min(1100px, 92vw);
      color: #fff1ae;
      font-size: clamp(1.2rem, 2.2vw, 2rem);
      font-weight: 800;
      line-height: 1.35;
    }
    .percent-results-title {
      color: #fff8df;
      font-size: clamp(2.2rem, 4.8vw, 5rem);
      font-weight: 900;
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
      align-content: center;
      gap: 8px;
      border-radius: 10px;
      border: 1px solid rgba(255,209,92,.28);
      border-top: 6px solid var(--pc);
      background: rgba(18, 7, 10, .8);
      padding: 18px;
    }
    .percent-result-card.won { box-shadow: 0 0 0 2px rgba(46,196,119,.5) inset, 0 0 26px rgba(46,196,119,.18); }
    .percent-result-card.lost { opacity: .82; }
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
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
