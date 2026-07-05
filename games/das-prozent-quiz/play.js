GameRegistry.register('das-prozent-quiz', {
  mount(container) {
    injectPercentPlayStyles();
    container.innerHTML = '<div class="percent-play" id="percent-play"></div>';
  },

  update(state, ctx) {
    const root = document.getElementById('percent-play');
    if (!root) return;

    stopPercentPlayCountdown();

    const game = percentState(state);
    const question = selectedQuestion(game);
    const me = window.App && window.App.me ? window.App.me(state) : null;
    const playerId = me && me.playerId;
    const player = playerId ? state.players.find((entry) => entry.id === playerId) : null;
    const myBet = playerId ? game.betsByPlayerId[playerId] || null : null;
    const answer = question && playerId ? answersFor(game, question.id)[playerId] : null;

    if (game.phase === 'betting' || game.phase === 'bettingLocked') {
      root.innerHTML = bettingHtml(game, player, myBet);
      wireBettingControls(root, game, player, myBet, ctx);
      return;
    }

    if (game.solutionVisible && game.solution && question && game.solution.questionId === question.id) {
      root.innerHTML = solutionNoticeHtml(game, question, myBet, answer, playerId);
      return;
    }

    root.innerHTML = playHtml(game, question, myBet, answer);
    wirePlayControls(root, game, question, myBet, answer, ctx);
    startPercentPlayCountdown(game);
  },

  unmount(container) {
    stopPercentPlayCountdown();
    container.innerHTML = '';
  },
});

/* ---------- Ansichten ---------- */

function bettingHtml(game, player, myBet) {
  if (!player) {
    return `
      <div class="card percent-play-card">
        <h2>Spieler wählen</h2>
        <div class="muted">Wähle zuerst deinen Namen aus.</div>
      </div>`;
  }

  const locked = (myBet && myBet.locked) || game.phase === 'bettingLocked';
  const balance = effectiveBettingBalance(player, game);
  const chosen = myBet ? questionInState(game, myBet.questionId) : null;

  if (locked) {
    return `
      <div class="card percent-play-card locked">
        <div class="percent-play-kicker">Das 1% Quiz</div>
        <h2>Dein Einsatz steht</h2>
        ${chosen && myBet.amount > 0
          ? `<div class="percent-locked-answer">${escapeHtml(chosen.label)}</div>
             <div class="percent-current-bet">Einsatz: <b>${formatChips(myBet.amount)} Chips</b> ·
               Bei richtig: <b>${formatChips(chipPayout(myBet.amount * chosen.multiplier))} Chips</b></div>`
          : '<div class="muted">Kein Einsatz abgegeben.</div>'}
      </div>`;
  }

  return `
    <div class="card percent-play-card percent-bet-card">
      <div class="percent-play-kicker">Das 1% Quiz</div>
      <h2>Wähle EINE Frage und setze deine Chips</h2>
      <div class="percent-bet-summary" data-bet-summary></div>
      <div class="percent-bet-error" data-bet-error></div>
      <div class="percent-question-pick">
        ${game.questions.map((question) => `
          <button class="percent-pick-btn" data-bet-pick="${escapeHtml(question.id)}">
            <b>${escapeHtml(question.label)}</b>
            <span>x${formatMultiplier(question.multiplier)}</span>
          </button>
        `).join('')}
      </div>
      <label class="percent-amount-row">
        <span>Einsatz (max. ${formatChips(balance)} Chips)</span>
        <input type="number" min="1" step="1" inputmode="numeric" placeholder="0" data-bet-amount />
      </label>
      <button class="percent-lock-btn" data-bet-lock disabled>Einsatz einloggen</button>
    </div>`;
}

function playHtml(game, question, myBet, answer) {
  if (!question) {
    return `
      <div class="card percent-play-card">
        <h2>Das 1% Quiz</h2>
        <div class="muted">Warte auf die Spielleitung.</div>
      </div>`;
  }

  const mine = myBet && myBet.questionId === question.id && myBet.amount > 0;

  if (!mine) {
    const chosen = myBet ? questionInState(game, myBet.questionId) : null;
    return `
      <div class="card percent-play-card">
        <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
        <h2>Du setzt diese Frage aus</h2>
        <div class="muted">${chosen && myBet.amount > 0
          ? `Deine Frage: ${escapeHtml(chosen.label)} · Einsatz ${formatChips(myBet.amount)} Chips`
          : 'Du hast keinen Einsatz abgegeben.'}</div>
      </div>`;
  }

  if (answer) {
    return `
      <div class="card percent-play-card locked">
        <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
        <h2>Antwort eingeloggt</h2>
        ${betInfoHtml(game, question, myBet)}
        <div class="percent-locked-answer">${escapeHtml(answerLabel(question, answer.answer))}</div>
        ${timerNoticeHtml(game)}
      </div>`;
  }

  if (!game.answersOpen) {
    return `
      <div class="card percent-play-card">
        <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
        <h2>${game.phase === 'locked' ? 'Antworten gesperrt' : 'Warte auf den Timer'}</h2>
        ${betInfoHtml(game, question, myBet)}
        <div class="muted">${escapeHtml(question.playerInstruction)}</div>
      </div>`;
  }

  return `
    <div class="card percent-play-card">
      <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
      ${timerNoticeHtml(game)}
      <h2>${escapeHtml(question.playerInstruction)}</h2>
      ${betInfoHtml(game, question, myBet)}
      ${inputHtml(question)}
      <button class="percent-lock-btn" data-percent-lock disabled>Antwort einloggen</button>
    </div>`;
}

function solutionNoticeHtml(game, question, myBet, answer, playerId) {
  const mine = myBet && myBet.questionId === question.id && myBet.amount > 0;
  const payout = playerId ? payoutsFor(game, question.id)[playerId] : null;

  // Solange die Spielleitung die Lösung noch schrittweise aufdeckt,
  // wird das Ergebnis am Handy zurückgehalten.
  if (game.solution.answerRevealed !== true) {
    return `
      <div class="card percent-play-card">
        <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
        <h2>Auflösung läuft …</h2>
        ${mine
          ? `<div class="muted">Deine Antwort:</div>
             <div class="percent-locked-answer">${answer ? escapeHtml(answerLabel(question, answer.answer)) : 'Keine Antwort'}</div>
             <div class="muted">Schau auf den Bildschirm!</div>`
          : '<div class="muted">Du hattest diese Frage nicht gewählt.</div>'}
      </div>`;
  }

  return `
    <div class="card percent-play-card ${payout && payout.isCorrect ? 'won' : 'locked'}">
      <div class="percent-play-kicker">${escapeHtml(question.label)}</div>
      <h2>Lösung: ${escapeHtml(game.solution.label)}</h2>
      ${mine
        ? `
          <div class="muted">Deine Antwort:</div>
          <div class="percent-locked-answer">${answer ? escapeHtml(answerLabel(question, answer.answer)) : 'Keine Antwort'}</div>
          ${payout
            ? `<div class="percent-payout-note ${payout.isCorrect ? 'good' : 'bad'}">
                ${payout.isCorrect
                  ? `Richtig! +${formatChips(payout.payoutAmount)} Chips`
                  : 'Leider falsch - Einsatz verloren.'}
              </div>`
            : '<div class="muted">Auswertung folgt.</div>'}`
        : '<div class="muted">Du hattest diese Frage nicht gewählt.</div>'}
    </div>`;
}

function betInfoHtml(game, question, myBet) {
  if (!myBet || myBet.questionId !== question.id) return '';
  const payout = chipPayout(myBet.amount * Number(question.multiplier || 1));
  return `<div class="percent-current-bet">Dein Einsatz: <b>${formatChips(myBet.amount)} Chips</b> · Bei richtig: <b>${formatChips(payout)} Chips</b></div>`;
}

function timerNoticeHtml(game) {
  if (!game.timer || !game.timer.running || !game.timer.endsAt) return '';
  const remaining = Math.max(0, Math.ceil((Number(game.timer.endsAt) - Date.now()) / 1000));
  return `<div class="percent-play-timer">⏱ <b data-percent-play-timer data-ends-at="${Number(game.timer.endsAt)}">${remaining}</b> Sekunden</div>`;
}

function inputHtml(question) {
  if (question.answerType === 'choice') {
    const compact = question.options.every((option) => option.label === option.value);
    return `
      <div class="percent-choice-grid ${compact ? 'compact' : ''}">
        ${question.options.map((option) => `
          <button class="percent-choice-btn" data-percent-answer="${escapeHtml(option.value)}">
            ${option.label === option.value
              ? escapeHtml(option.value)
              : `<b>${escapeHtml(option.value)}</b><span>${escapeHtml(option.label)}</span>`}
          </button>
        `).join('')}
      </div>`;
  }
  if (question.answerType === 'number') {
    return '<input class="percent-number-input" inputmode="decimal" pattern="[0-9,.]*" placeholder="Deine Zahl" data-percent-number />';
  }
  return '';
}

/* ---------- Steuerung ---------- */

function wirePlayControls(root, game, question, myBet, answer, ctx) {
  if (!question || answer || !game.answersOpen) return;
  if (!myBet || myBet.questionId !== question.id || myBet.amount <= 0) return;

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

function wireBettingControls(root, game, player, myBet, ctx) {
  if (!player || game.phase !== 'betting') return;
  if (myBet && myBet.locked) return;

  const balance = effectiveBettingBalance(player, game);
  const pickButtons = Array.from(root.querySelectorAll('[data-bet-pick]'));
  const amountInput = root.querySelector('[data-bet-amount]');
  const lock = root.querySelector('[data-bet-lock]');
  const summaryEl = root.querySelector('[data-bet-summary]');
  const errorEl = root.querySelector('[data-bet-error]');
  let pickedQuestionId = myBet && myBet.questionId ? myBet.questionId : '';

  if (amountInput && myBet && myBet.amount > 0) amountInput.value = String(myBet.amount);

  function currentAmount() {
    const raw = String(amountInput ? amountInput.value : '').trim();
    return raw ? Math.floor(Number(raw)) : 0;
  }

  function validate() {
    const amount = currentAmount();
    const question = questionInState(game, pickedQuestionId);
    const invalid = !Number.isInteger(amount) || amount < 0;
    const tooMuch = amount > balance;

    pickButtons.forEach((button) => {
      button.classList.toggle('selected', button.dataset.betPick === pickedQuestionId);
    });

    if (summaryEl) {
      const win = question ? chipPayout(amount * Number(question.multiplier || 1)) : 0;
      summaryEl.innerHTML = `
        <div><span>Kontostand</span><b>${formatChips(balance)} Chips</b></div>
        <div><span>Einsatz</span><b>${formatChips(amount)} Chips</b></div>
        <div><span>Frage</span><b>${question ? escapeHtml(question.label) : '-'}</b></div>
        <div><span>Bei richtig</span><b>${formatChips(win)} Chips</b></div>`;
    }

    if (errorEl) {
      errorEl.textContent = invalid
        ? 'Bitte eine ganze, nicht negative Chipzahl eingeben.'
        : tooMuch
          ? 'Du kannst nicht mehr Chips setzen, als du besitzt.'
          : '';
    }

    const ready = !invalid && !tooMuch && amount >= 1 && !!question;
    if (lock) lock.disabled = !ready;
    return ready;
  }

  pickButtons.forEach((button) => {
    button.onclick = () => {
      pickedQuestionId = button.dataset.betPick;
      validate();
    };
  });

  if (amountInput) {
    amountInput.oninput = () => {
      amountInput.value = amountInput.value.replace(/[^0-9]/g, '');
      validate();
    };
  }
  validate();

  if (lock) {
    lock.onclick = () => {
      if (!validate()) return;
      lock.disabled = true;
      ctx.sendAction({ type: 'percent:submit-bet', questionId: pickedQuestionId, amount: currentAmount() });
      if (navigator.vibrate) navigator.vibrate(35);
    };
  }
}

/* ---------- Countdown am Handy ---------- */

let percentPlayCountdownInterval = null;

function startPercentPlayCountdown(game) {
  const el = document.querySelector('[data-percent-play-timer]');
  if (!el || !game.timer || !game.timer.running) return;
  const endsAt = Number(el.dataset.endsAt) || 0;
  if (!endsAt) return;
  percentPlayCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    el.textContent = String(remaining);
    if (remaining <= 0) stopPercentPlayCountdown();
  }, 250);
}

function stopPercentPlayCountdown() {
  if (percentPlayCountdownInterval) {
    clearInterval(percentPlayCountdownInterval);
    percentPlayCountdownInterval = null;
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
    debitedBetsByPlayerId: raw.debitedBetsByPlayerId || {},
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

function answerLabel(question, value) {
  if (question.answerType === 'choice') {
    const option = (question.options || []).find((entry) => entry.value === value);
    if (option && option.label !== option.value) return `${option.value} – ${option.label}`;
  }
  return String(value);
}

function effectiveBettingBalance(player, game) {
  const debit = game.debitedBetsByPlayerId && game.debitedBetsByPlayerId[player.id];
  return Math.max(0, (Number(player.score) || 0) + (Number(debit && debit.amount) || 0));
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

/* ---------- Styles ---------- */

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
    .percent-play-timer {
      color: #fff8df;
      font-size: 1.3rem;
      font-weight: 900;
    }
    .percent-play-timer b { color: var(--accent); font-size: 1.6rem; }
    .percent-question-pick {
      display: grid;
      gap: 10px;
    }
    .percent-pick-btn {
      min-height: 76px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      font-weight: 900;
      border: 2px solid rgba(255,209,92,.5);
      text-align: left;
    }
    .percent-pick-btn b { font-size: 1.2rem; }
    .percent-pick-btn span { color: var(--accent); font-size: 1.5rem; }
    .percent-pick-btn.selected {
      background: linear-gradient(180deg, #ffe08a, var(--accent));
      color: #241104;
      border-color: #fff0b7;
      box-shadow: 0 0 0 3px rgba(255,209,92,.24), 0 0 28px rgba(255,209,92,.3);
    }
    .percent-pick-btn.selected span { color: #241104; }
    .percent-amount-row {
      display: grid;
      gap: 6px;
      text-align: left;
    }
    .percent-amount-row span {
      color: var(--muted);
      font-size: .85rem;
      font-weight: 900;
      text-transform: uppercase;
    }
    .percent-amount-row input {
      width: 100%;
      min-height: 64px;
      border-radius: 8px;
      border: 2px solid rgba(255,209,92,.42);
      background: #13070a;
      color: var(--text);
      font: inherit;
      font-size: 1.6rem;
      font-weight: 900;
      text-align: center;
    }
    .percent-choice-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .percent-choice-grid.compact {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .percent-choice-btn {
      min-height: 86px;
      display: grid;
      place-items: center;
      gap: 2px;
      font-size: 1.6rem;
      font-weight: 900;
      border: 2px solid rgba(255,209,92,.5);
    }
    .percent-choice-btn b { font-size: 1.4rem; }
    .percent-choice-btn span { font-size: 1rem; font-weight: 900; }
    .percent-choice-btn.selected {
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
    .percent-play-card.won {
      border-color: var(--good);
      box-shadow: 0 0 0 2px rgba(46,196,119,.55) inset, 0 0 34px rgba(46,196,119,.28);
    }
    .percent-locked-answer {
      color: var(--accent);
      font-size: 2.2rem;
      font-weight: 900;
    }
    .percent-payout-note {
      font-size: 1.3rem;
      font-weight: 900;
    }
    .percent-payout-note.good { color: var(--good); }
    .percent-payout-note.bad { color: #ff7382; }
    .percent-current-bet {
      color: var(--muted);
      font-weight: 900;
      line-height: 1.35;
    }
    .percent-current-bet b { color: var(--accent); }
    .percent-bet-card { padding-bottom: 18px; }
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
      font-size: 1.1rem;
      font-weight: 900;
    }
    .percent-bet-error {
      min-height: 1.4em;
      color: #ff7382;
      font-weight: 900;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
