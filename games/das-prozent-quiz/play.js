GameRegistry.register('das-prozent-quiz', {
  mount(container) {
    injectPercentPlayStyles();
    container.innerHTML = '<div class="percent-play" id="percent-play"></div>';
  },

  update(state, ctx) {
    const root = document.getElementById('percent-play');
    if (!root) return;

    const game = percentState(state);
    const question = selectedQuestion(game);
    const me = window.App && window.App.me ? window.App.me(state) : null;
    const playerId = me && me.playerId;
    const player = playerId ? state.players.find((entry) => entry.id === playerId) : null;
    const answer = question && playerId ? answersFor(game, question.id)[playerId] : null;

    if (game.phase === 'betting' || game.phase === 'bettingLocked') {
      root.innerHTML = bettingHtml(game, player);
      wireBettingControls(root, game, player, ctx);
      return;
    }

    if (game.solutionVisible && question && game.solutionShownForQuestionId === question.id) {
      root.innerHTML = solutionNoticeHtml(question, answer);
      return;
    }

    root.innerHTML = playHtml(game, question, answer);
    wirePlayControls(root, game, question, answer, ctx);
  },

  unmount(container) {
    container.innerHTML = '';
  },
});

function solutionNoticeHtml(question, answer) {
  return `
    <div class="card percent-play-card locked">
      <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
      <h2>Die Lösung wird angezeigt.</h2>
      ${answer
        ? `<div class="muted">Deine Antwort:</div><div class="percent-locked-answer">${escapeHtml(formatAnswer(answer.answer))}</div>`
        : '<div class="muted">Keine Antwort eingeloggt.</div>'}
    </div>`;
}

function playHtml(game, question, answer) {
  if (!question) {
    return `
      <div class="card percent-play-card">
        <h2>Das Prozent-Quiz</h2>
        <div class="muted">Warte auf die Spielleitung.</div>
      </div>`;
  }

  if (answer) {
    return `
      <div class="card percent-play-card locked">
        <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
        <h2>Antwort eingeloggt</h2>
        ${currentBetInfo(game, question)}
        <div class="percent-locked-answer">${escapeHtml(formatAnswer(answer.answer))}</div>
      </div>`;
  }

  if (!game.answersOpen) {
    return `
      <div class="card percent-play-card">
        <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
        <h2>Warte auf die Spielleitung</h2>
        ${currentBetInfo(game, question)}
        <div class="muted">${escapeHtml(question.playerInstruction)}</div>
      </div>`;
  }

  return `
    <div class="card percent-play-card">
      <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
      <h2>${escapeHtml(question.playerInstruction)}</h2>
      ${currentBetInfo(game, question)}
      ${inputHtml(question)}
      <button class="percent-lock-btn" data-percent-lock disabled>Antwort einloggen</button>
    </div>`;
}

function bettingHtml(game, player) {
  if (!player) {
    return `
      <div class="card percent-play-card">
        <h2>Spieler wählen</h2>
        <div class="muted">Wähle zuerst deinen Namen aus.</div>
      </div>`;
  }

  const entry = game.betsByPlayerId[player.id] || { locked: false, bets: {} };
  const bets = entry.bets || {};
  const summary = betSummary(effectiveBettingBalance(player, game), game.questions, bets);
  const locked = entry.locked || game.phase === 'bettingLocked';

  return `
    <div class="card percent-play-card percent-bet-card ${locked ? 'locked' : ''}">
      <div class="percent-play-kicker">Das Prozent-Quiz</div>
      <h2>${locked ? 'Deine Einsätze' : 'Setze deine Chips'}</h2>
      <div class="percent-bet-summary" data-bet-summary>
        ${betSummaryHtml(summary)}
      </div>
      <div class="percent-bet-error" data-bet-error></div>
      <div class="percent-bet-list">
        ${game.questions.map((question) => `
          <label class="percent-bet-row">
            <span>
              <b>${escapeHtml(question.label)}</b>
              <em>Richtig: Einsatz x${formatMultiplier(question.multiplier)} · Falsch: Einsatz verloren</em>
            </span>
            <input type="number" min="0" step="1" inputmode="numeric"
              value="${Number(bets[question.id]) || 0}" data-bet-question="${escapeHtml(question.id)}" ${locked ? 'disabled' : ''} />
          </label>
        `).join('')}
      </div>
      ${locked
        ? '<div class="percent-locked-note">Einsätze eingeloggt.</div>'
        : '<button class="percent-lock-btn" data-bet-lock>Einsätze einloggen</button>'}
    </div>`;
}

function betSummaryHtml(summary) {
  return `
    <div><span>Aktueller Kontostand</span><b>${formatChips(summary.balance)} Chips</b></div>
    <div><span>Gesetzt</span><b>${formatChips(summary.total)} Chips</b></div>
    <div><span>Verbleibend</span><b>${formatChips(summary.remaining)} Chips</b></div>
    <div><span>Wenn alles richtig ist</span><b>${formatChips(summary.maxBalance)} Chips</b></div>`;
}

function currentBetInfo(game, question) {
  if (!question) return '';
  const me = window.App && window.App.getState ? window.App.me(window.App.getState()) : null;
  const playerId = me && me.playerId;
  if (!playerId) return '';
  const bet = Number(game.betsByPlayerId[playerId] && game.betsByPlayerId[playerId].bets && game.betsByPlayerId[playerId].bets[question.id]) || 0;
  const payout = chipPayout(bet * Number(question.multiplier || 1));
  return `<div class="percent-current-bet">Dein Einsatz: <b>${formatChips(bet)} Chips</b> · Bei richtig: <b>${formatChips(payout)} Chips</b></div>`;
}

function inputHtml(question) {
  if (question.answerType === 'choice') {
    return `
      <div class="percent-choice-grid">
        ${question.options.map((option) => `
          <button class="percent-choice-btn" data-percent-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>
        `).join('')}
      </div>`;
  }
  if (question.answerType === 'number') {
    return '<input class="percent-number-input" inputmode="decimal" pattern="[0-9,.]*" placeholder="Deine Zahl" data-percent-number />';
  }
  if (question.answerType === 'grid') {
    const cells = [];
    for (let row = 1; row <= question.gridRows; row += 1) {
      for (let col = 1; col <= question.gridCols; col += 1) {
        cells.push(`<button class="percent-grid-cell" data-percent-answer="R${row}C${col}">${row}/${col}</button>`);
      }
    }
    return `<div class="percent-grid-select">${cells.join('')}</div>`;
  }
  return '';
}

function wirePlayControls(root, game, question, answer, ctx) {
  if (!question || answer || !game.answersOpen) return;
  let selected = '';
  const lock = root.querySelector('[data-percent-lock]');

  function setSelected(value) {
    selected = value;
    root.querySelectorAll('[data-percent-answer]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.percentAnswer === selected);
    });
    if (lock) lock.disabled = !selected;
  }

  root.querySelectorAll('[data-percent-answer]').forEach((button) => {
    button.onclick = () => setSelected(button.dataset.percentAnswer);
  });

  const numberInput = root.querySelector('[data-percent-number]');
  if (numberInput) {
    numberInput.oninput = () => {
      numberInput.value = numberInput.value.replace(/[^0-9,.-]/g, '');
      setSelected(numberInput.value.trim());
    };
  }

  if (lock) {
    lock.onclick = () => {
      if (!selected) return;
      lock.disabled = true;
      ctx.sendAction({ type: 'percent:submit-answer', answer: selected });
      if (navigator.vibrate) navigator.vibrate(35);
    };
  }
}

function wireBettingControls(root, game, player, ctx) {
  if (!player || game.phase !== 'betting') return;
  const inputs = Array.from(root.querySelectorAll('[data-bet-question]'));
  const lock = root.querySelector('[data-bet-lock]');
  const summaryEl = root.querySelector('[data-bet-summary]');
  const errorEl = root.querySelector('[data-bet-error]');

  function currentBets() {
    const bets = {};
    inputs.forEach((input) => {
      const raw = String(input.value || '').trim();
      bets[input.dataset.betQuestion] = raw ? Number(raw) : 0;
    });
    return bets;
  }

  function validate() {
    const bets = currentBets();
    const invalidInteger = Object.values(bets).some((value) => !Number.isInteger(value) || value < 0);
    const summary = betSummary(effectiveBettingBalance(player, game), game.questions, bets);
    const tooMuch = summary.total > summary.balance;
    if (summaryEl) summaryEl.innerHTML = betSummaryHtml(summary);
    if (errorEl) {
      errorEl.textContent = invalidInteger
        ? 'Bitte nur ganze, nicht negative Chipzahlen eingeben.'
        : tooMuch
          ? 'Du kannst nicht mehr Chips setzen, als du besitzt.'
          : '';
    }
    if (lock) lock.disabled = invalidInteger || tooMuch;
    return !(invalidInteger || tooMuch);
  }

  inputs.forEach((input) => {
    input.oninput = () => {
      input.value = input.value.replace(/[^0-9]/g, '');
      validate();
    };
  });
  validate();

  if (lock) {
    lock.onclick = () => {
      if (!validate()) return;
      lock.disabled = true;
      ctx.sendAction({ type: 'percent:submit-bets', bets: currentBets() });
      if (navigator.vibrate) navigator.vibrate(35);
    };
  }
}

function percentState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    selectedQuestionId: raw.selectedQuestionId || null,
    phase: raw.phase || 'idle',
    answersOpen: raw.answersOpen === true,
    answersByQuestionId: raw.answersByQuestionId || {},
    betsByPlayerId: raw.betsByPlayerId || {},
    debitedBetsByPlayerId: raw.debitedBetsByPlayerId || {},
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

function formatAnswer(answer) {
  return /^R\dC\d$/.test(answer) ? answer.replace('R', 'Reihe ').replace('C', ', Spalte ') : answer;
}

function betSummary(balance, questions, bets) {
  const total = Object.values(bets || {}).reduce((sum, value) => sum + normalizedBet(value), 0);
  const maxPayout = questions.reduce((sum, question) => {
    const bet = normalizedBet(bets && bets[question.id]);
    return sum + chipPayout(bet * Number(question.multiplier || 1));
  }, 0);
  return {
    balance: Math.max(0, Number(balance) || 0),
    total,
    remaining: Math.max(0, (Number(balance) || 0) - total),
    maxBalance: chipPayout((Number(balance) || 0) - total + maxPayout),
  };
}

function effectiveBettingBalance(player, game) {
  const debit = game.debitedBetsByPlayerId && game.debitedBetsByPlayerId[player.id];
  return (Number(player.score) || 0) + (Number(debit && debit.amount) || 0);
}

function normalizedBet(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function chipPayout(value) {
  return Math.ceil(Number(value) || 0);
}

function formatMultiplier(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function formatChips(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function injectPercentPlayStyles() {
  if (document.getElementById('percent-play-styles')) return;
  const style = document.createElement('style');
  style.id = 'percent-play-styles';
  style.textContent = `
    .percent-play-card {
      display: grid;
      gap: 16px;
      text-align: center;
    }
    .percent-play-card h2 {
      font-size: 1.35rem;
      line-height: 1.12;
    }
    .percent-play-kicker {
      color: var(--accent);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .percent-choice-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .percent-choice-btn,
    .percent-grid-cell {
      min-height: 86px;
      font-size: 2rem;
      font-weight: 900;
      border: 2px solid rgba(255,209,92,.5);
    }
    .percent-choice-btn.selected,
    .percent-grid-cell.selected {
      background: linear-gradient(180deg, #ffe08a, var(--accent));
      color: #241104;
      border-color: #fff0b7;
      box-shadow: 0 0 0 3px rgba(255,209,92,.24), 0 0 28px rgba(255,209,92,.3);
    }
    .percent-number-input {
      width: 100%;
      min-height: 82px;
      border-radius: 8px;
      border: 2px solid rgba(255,209,92,.5);
      background: #13070a;
      color: var(--text);
      font: inherit;
      font-size: 2.2rem;
      font-weight: 900;
      text-align: center;
      padding: 10px 14px;
    }
    .percent-grid-select {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .percent-lock-btn {
      min-height: 82px;
      background: linear-gradient(180deg, #19a65f, var(--good));
      border-color: #2ec477;
      color: #fff;
      font-size: 1.4rem;
      font-weight: 900;
    }
    .percent-lock-btn:disabled {
      background: linear-gradient(180deg, #555, #333);
      border-color: #444;
    }
    .percent-play-card.locked {
      border-color: var(--good);
      box-shadow: 0 0 0 2px rgba(17,140,79,.35) inset, 0 0 28px rgba(17,140,79,.18);
    }
    .percent-locked-answer {
      color: var(--accent);
      font-size: 2.5rem;
      font-weight: 900;
    }
    .percent-current-bet {
      color: var(--muted);
      font-weight: 900;
      line-height: 1.35;
    }
    .percent-current-bet b { color: var(--accent); }
    .percent-bet-card {
      padding-bottom: 18px;
    }
    .percent-bet-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .percent-bet-summary div {
      min-height: 70px;
      display: grid;
      place-items: center;
      gap: 2px;
      border: 1px solid rgba(255,209,92,.25);
      border-radius: 8px;
      background: rgba(18,7,10,.6);
      padding: 8px;
    }
    .percent-bet-summary span {
      color: var(--muted);
      font-size: .78rem;
      font-weight: 900;
      text-transform: uppercase;
    }
    .percent-bet-summary b {
      color: #fff8df;
      font-size: 1.15rem;
      font-weight: 900;
    }
    .percent-bet-error {
      min-height: 1.4em;
      color: #ff7382;
      font-weight: 900;
    }
    .percent-bet-list {
      display: grid;
      gap: 10px;
    }
    .percent-bet-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 90px;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(18,7,10,.55);
      text-align: left;
    }
    .percent-bet-row b {
      color: #fff8df;
      display: block;
      font-size: 1.05rem;
    }
    .percent-bet-row em {
      color: var(--muted);
      font-style: normal;
      font-size: .82rem;
      font-weight: 800;
    }
    .percent-bet-row input {
      width: 100%;
      min-height: 54px;
      border-radius: 8px;
      border: 2px solid rgba(255,209,92,.42);
      background: #13070a;
      color: var(--text);
      font: inherit;
      font-size: 1.35rem;
      font-weight: 900;
      text-align: center;
    }
    .percent-locked-note {
      color: var(--good);
      font-size: 1.25rem;
      font-weight: 900;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
