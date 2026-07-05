'use strict';

const fs = require('fs');
const path = require('path');
const { PERCENT_QUIZ_QUESTIONS, DEFAULT_TIMER_SECONDS } = require('./percentQuizQuestions');

// /assets wird vom Server aus dem Repo-Root ausgeliefert.
const REPO_ROOT = path.join(__dirname, '..', '..');

// Kulanzfenster: Antworten, die knapp nach Timer-Ende eintreffen, zählen noch.
const ANSWER_GRACE_MS = 1500;
// Der Timer gilt als abgelaufen, sobald die Restzeit unter dieser Schwelle liegt.
const EXPIRE_TOLERANCE_MS = 400;

module.exports = {
  id: 'das-prozent-quiz',
  mode: 'single',
  category: 'quiz',
  title: 'Das Prozent-Quiz',
  responsiblePerson: 'Admin',
  description: 'Bonusspiel mit nachgebauten 1%-Quiz-Fragen, Timer und Handy-Antworten.',
  rules:
    'Spieler wählen zu Beginn genau eine Frage (25%, 10% oder 1%) und setzen Chips. ' +
    'Die Spielleitung deckt die Frage Schritt für Schritt auf, liest sie vor und startet den Timer. ' +
    'Während der Timer läuft, loggen die Spieler ihre Antwort am Handy ein. ' +
    'Richtige Antwort: Einsatz x2 (25%), x3 (10%) oder x4 (1%). ' +
    'Die Auszahlung erfolgt automatisch beim Aufdecken der Lösung.',
  materials: ['TV-Display', 'Spieler-Handys'],
  hasBeenPlayed: false,
  selectable: false,
  interaktionstyp: 'keine',
  built: true,

  onStart(ctx) {
    ctx.lockBuzzer();
    ctx.setGameState({
      ...defaultGameState(),
      phase: 'betting',
    });
  },

  onStop(ctx) {
    ctx.resetBuzzer();
    ctx.setGameState({});
  },

  onAction(ctx, client, action = {}) {
    const state = ensureGameState(ctx.state.gameState);
    const admin = isAdminClient(ctx.state, client.clientId);
    const display = isDisplayClient(ctx.state, client.clientId);
    const playerId = playerIdForClient(ctx.state, client.clientId);

    if (action.type === 'percent:submit-answer') {
      submitAnswer(ctx, state, playerId, action);
      return;
    }

    if (action.type === 'percent:submit-bet') {
      submitBet(ctx, state, playerId, action);
      return;
    }

    if (action.type === 'percent:timer-expired') {
      if (!display && !admin) return;
      expireTimer(ctx, state);
      return;
    }

    if (!admin) return;

    if (action.type === 'percent:select-question') {
      selectQuestion(ctx, state, action.questionId);
      return;
    }

    if (action.type === 'percent:open-betting') {
      ctx.setGameState({
        ...state,
        phase: 'betting',
        answersOpen: false,
        solutionVisible: false,
        solutionStep: 0,
        solution: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:close-betting') {
      closeBetting(ctx, state);
      return;
    }

    if (action.type === 'percent:reset-bets') {
      resetBets(ctx, state);
      return;
    }

    if (action.type === 'percent:unlock-bets') {
      unlockBets(ctx, state);
      return;
    }

    if (action.type === 'percent:continue-to-quiz') {
      ctx.setGameState({
        ...state,
        phase: state.selectedQuestionId ? 'selected' : 'idle',
        answersOpen: false,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:reveal-step') {
      changeRevealStep(ctx, state, 1);
      return;
    }

    if (action.type === 'percent:unreveal-step') {
      changeRevealStep(ctx, state, -1);
      return;
    }

    if (action.type === 'percent:start-timer') {
      startTimer(ctx, state, action.seconds);
      return;
    }

    if (action.type === 'percent:stop-timer') {
      stopTimer(ctx, state);
      return;
    }

    if (action.type === 'percent:reset-answers') {
      if (!state.selectedQuestionId) return;
      const answersByQuestionId = { ...state.answersByQuestionId };
      answersByQuestionId[state.selectedQuestionId] = {};
      ctx.setGameState({
        ...state,
        answersByQuestionId,
        phase: 'selected',
        answersOpen: false,
        timer: resetTimer(state.timer),
        solutionVisible: false,
        solutionStep: 0,
        solution: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:show-solution') {
      showSolution(ctx, state);
      return;
    }

    if (action.type === 'percent:solution-step') {
      changeSolutionStep(ctx, state, 1);
      return;
    }

    if (action.type === 'percent:solution-unstep') {
      changeSolutionStep(ctx, state, -1);
      return;
    }

    if (action.type === 'percent:hide-solution') {
      ctx.setGameState({
        ...state,
        solutionVisible: false,
        solutionStep: 0,
        solution: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:show-results') {
      ctx.setGameState({
        ...state,
        phase: 'results',
        answersOpen: false,
        timer: resetTimer(state.timer),
        solutionVisible: false,
        solutionStep: 0,
        solution: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:evaluate-answer') {
      evaluateAnswerManually(ctx, state, action);
      return;
    }

    if (action.type === 'percent:back-to-selection') {
      ctx.setGameState({
        ...state,
        phase: state.selectedQuestionId ? 'selected' : 'idle',
        answersOpen: false,
        timer: resetTimer(state.timer),
        solutionVisible: false,
        solutionStep: 0,
        solution: null,
        adminWarning: '',
      });
    }
  },
};

function defaultGameState() {
  return {
    selectedQuestionId: null,
    phase: 'idle',
    answersOpen: false,
    revealStep: 0,
    timer: defaultTimer(),
    answersByQuestionId: {},
    betsByPlayerId: {},
    debitedBetsByPlayerId: {},
    payoutsByQuestionId: {},
    solutionVisible: false,
    solutionStep: 0,
    solution: null,
    questions: questionsForClients(),
    adminWarning: '',
  };
}

function defaultTimer() {
  return {
    durationSeconds: DEFAULT_TIMER_SECONDS,
    startedAt: null,
    endsAt: null,
    running: false,
  };
}

function resetTimer(timer) {
  return {
    ...defaultTimer(),
    durationSeconds: DEFAULT_TIMER_SECONDS,
  };
}

function ensureGameState(value) {
  const base = defaultGameState();
  const saved = value && typeof value === 'object' ? value : {};
  const selectedQuestionId = questionById(saved.selectedQuestionId) ? saved.selectedQuestionId : null;
  const phase = ['idle', 'betting', 'bettingLocked', 'selected', 'answering', 'locked', 'results'].includes(saved.phase)
    ? saved.phase
    : selectedQuestionId
      ? 'selected'
      : 'idle';

  return {
    ...base,
    ...saved,
    selectedQuestionId,
    phase,
    answersOpen: saved.answersOpen === true,
    revealStep: clampInt(saved.revealStep, 0, maxRevealStep(selectedQuestionId)),
    timer: normalizeTimer(saved.timer),
    answersByQuestionId: normalizeAnswersByQuestionId(saved.answersByQuestionId),
    betsByPlayerId: normalizeBetsByPlayerId(saved.betsByPlayerId),
    debitedBetsByPlayerId: normalizeDebitedBets(saved.debitedBetsByPlayerId),
    payoutsByQuestionId: normalizePayoutsByQuestionId(saved.payoutsByQuestionId),
    solutionVisible: saved.solutionVisible === true,
    solutionStep: clampInt(saved.solutionStep, 0, maxSolutionStep(selectedQuestionId)),
    solution: normalizeSolution(saved.solution),
    questions: questionsForClients(),
    adminWarning: String(saved.adminWarning || '').slice(0, 160),
  };
}

function normalizeTimer(value) {
  const base = defaultTimer();
  const saved = value && typeof value === 'object' ? value : {};
  return {
    durationSeconds: base.durationSeconds,
    startedAt: Number(saved.startedAt) || null,
    endsAt: Number(saved.endsAt) || null,
    running: saved.running === true,
  };
}

function normalizeSolution(value) {
  if (!value || typeof value !== 'object') return null;
  if (!questionById(value.questionId)) return null;
  const imageSrc = String(value.imageSrc || '');
  return {
    questionId: value.questionId,
    value: String(value.value || ''),
    label: String(value.label || ''),
    explanation: String(value.explanation || ''),
    imageSrc,
    imageExists: imageSrc ? assetExists(imageSrc) : false,
    answerRevealed: value.answerRevealed === true,
    overlayCount: Math.max(0, Number(value.overlayCount) || 0),
    revealedOverlays: Array.isArray(value.revealedOverlays) ? value.revealedOverlays : [],
  };
}

function normalizeAnswersByQuestionId(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const question of PERCENT_QUIZ_QUESTIONS) {
    const answers = value[question.id];
    out[question.id] = answers && typeof answers === 'object' ? answers : {};
  }
  return out;
}

function normalizeBetsByPlayerId(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [playerId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object') continue;
    out[playerId] = {
      locked: entry.locked === true,
      lockedAt: Number(entry.lockedAt) || null,
      questionId: questionById(entry.questionId) ? entry.questionId : null,
      amount: clampInt(entry.amount, 0, Number.MAX_SAFE_INTEGER),
    };
  }
  return out;
}

function normalizeDebitedBets(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [playerId, entry] of Object.entries(value)) {
    out[playerId] = {
      amount: clampInt(entry && entry.amount, 0, Number.MAX_SAFE_INTEGER),
      debitedAt: Number(entry && entry.debitedAt) || null,
    };
  }
  return out;
}

function normalizePayoutsByQuestionId(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const question of PERCENT_QUIZ_QUESTIONS) {
    const rows = value[question.id] && typeof value[question.id] === 'object' ? value[question.id] : {};
    out[question.id] = {};
    for (const [playerId, row] of Object.entries(rows)) {
      out[question.id][playerId] = {
        evaluated: row && row.evaluated === true,
        isCorrect: row && row.isCorrect === true,
        betAmount: clampInt(row && row.betAmount, 0, Number.MAX_SAFE_INTEGER),
        multiplier: Number(row && row.multiplier) || question.multiplier,
        payoutAmount: Math.max(0, Number(row && row.payoutAmount) || 0),
        applied: row && row.applied === true,
        appliedAt: Number(row && row.appliedAt) || null,
      };
    }
  }
  return out;
}

// Die Fragen gehen an alle Clients (auch Spieler-Handys). Lösung, Erklärung
// und die Lösungs-Einblendungen bleiben deshalb serverseitig, bis sie
// aufgedeckt werden. Für die Admin-Buttons gehen nur neutrale Labels raus.
function questionsForClients() {
  return PERCENT_QUIZ_QUESTIONS.map(({ correctAnswer, explanation, solutionImageSrc, solutionSteps, ...question }) => ({
    ...question,
    imageExists: question.imageSrc ? assetExists(question.imageSrc) : false,
    solutionStepLabels: (solutionSteps || []).map((step) => step.adminLabel),
  }));
}

function assetExists(assetSrc) {
  const normalized = String(assetSrc || '').replace(/^\/+/, '');
  return fs.existsSync(path.join(REPO_ROOT, normalized));
}

function maxRevealStep(questionId) {
  const question = questionById(questionId);
  return question ? question.revealSteps.length : 0;
}

// Lösungs-Schritte: alle Einblendungen + 1 finaler Ergebnis-Schritt.
function maxSolutionStep(questionId) {
  const question = questionById(questionId);
  if (!question) return 0;
  const overlays = question.solutionSteps || [];
  return overlays.length ? overlays.length + 1 : 0;
}

function selectQuestion(ctx, state, questionId) {
  const question = questionById(questionId);
  if (!question) return;
  ctx.setGameState({
    ...state,
    selectedQuestionId: question.id,
    phase: 'selected',
    answersOpen: false,
    revealStep: 0,
    timer: resetTimer(state.timer),
    solutionVisible: false,
    solutionStep: 0,
    solution: null,
    adminWarning: '',
  });
}

function changeRevealStep(ctx, state, delta) {
  if (!state.selectedQuestionId) return;
  const next = clampInt(state.revealStep + delta, 0, maxRevealStep(state.selectedQuestionId));
  if (next === state.revealStep) return;
  ctx.setGameState({
    ...state,
    revealStep: next,
    adminWarning: '',
  });
}

function startTimer(ctx, state) {
  if (!state.selectedQuestionId) {
    ctx.setGameState({ ...state, adminWarning: 'Bitte zuerst eine Frage auswählen.' });
    return;
  }
  const durationSeconds = DEFAULT_TIMER_SECONDS;
  const now = Date.now();
  ctx.setGameState({
    ...state,
    phase: 'answering',
    answersOpen: true,
    revealStep: maxRevealStep(state.selectedQuestionId),
    timer: {
      durationSeconds,
      startedAt: now,
      endsAt: now + durationSeconds * 1000,
      running: true,
    },
    solutionVisible: false,
    solutionStep: 0,
    solution: null,
    adminWarning: '',
  });
}

function stopTimer(ctx, state) {
  if (!state.selectedQuestionId) return;
  ctx.setGameState({
    ...state,
    phase: 'locked',
    answersOpen: false,
    timer: {
      ...state.timer,
      running: false,
    },
    adminWarning: '',
  });
}

function expireTimer(ctx, state) {
  if (!state.timer.running || !state.timer.endsAt) return;
  if (Date.now() < state.timer.endsAt - EXPIRE_TOLERANCE_MS) return;
  ctx.setGameState({
    ...state,
    phase: 'locked',
    answersOpen: false,
    timer: {
      ...state.timer,
      running: false,
    },
  });
}

function submitAnswer(ctx, state, playerId, action) {
  if (!playerId || !state.selectedQuestionId || !state.answersOpen) return;
  const question = questionById(state.selectedQuestionId);
  if (!question) return;

  if (state.timer.running && state.timer.endsAt && Date.now() > state.timer.endsAt + ANSWER_GRACE_MS) return;

  // Nur wer diese Frage gewählt und Chips gesetzt hat, darf antworten.
  const bet = state.betsByPlayerId[playerId];
  if (!bet || bet.questionId !== question.id || bet.amount <= 0) return;

  const existingAnswers = state.answersByQuestionId[question.id] || {};
  if (existingAnswers[playerId]) return;

  const answer = normalizeAnswer(question, action.answer);
  if (!answer) return;

  const player = ctx.state.players.find((entry) => entry.id === playerId);
  ctx.setGameState({
    ...state,
    answersByQuestionId: {
      ...state.answersByQuestionId,
      [question.id]: {
        ...existingAnswers,
        [playerId]: {
          playerId,
          playerName: player ? player.name : playerId,
          answer,
          answerType: question.answerType,
          lockedAt: Date.now(),
        },
      },
    },
  });
}

function submitBet(ctx, state, playerId, action) {
  if (!playerId || state.phase !== 'betting') return;
  const player = ctx.state.players.find((entry) => entry.id === playerId);
  if (!player) return;

  const existing = state.betsByPlayerId[playerId];
  if (existing && existing.locked) return;

  const question = questionById(action.questionId);
  if (!question) return;

  const amount = clampInt(action.amount, 0, Number.MAX_SAFE_INTEGER);
  if (amount <= 0) return;
  const balance = Math.max(0, Number(player.score) || 0);
  if (amount > balance) return;

  ctx.setGameState({
    ...state,
    betsByPlayerId: {
      ...state.betsByPlayerId,
      [playerId]: {
        locked: true,
        lockedAt: Date.now(),
        questionId: question.id,
        amount,
      },
    },
    adminWarning: '',
  });
}

function closeBetting(ctx, state) {
  const nextDebited = { ...state.debitedBetsByPlayerId };

  for (const player of ctx.state.players) {
    const entry = state.betsByPlayerId[player.id];
    const amount = entry ? entry.amount : 0;
    if (nextDebited[player.id]) continue;
    if (amount > 0) {
      ctx.addPoints(player.id, -amount);
    }
    nextDebited[player.id] = {
      amount,
      debitedAt: Date.now(),
    };
  }

  ctx.setGameState({
    ...state,
    phase: 'bettingLocked',
    answersOpen: false,
    debitedBetsByPlayerId: nextDebited,
    adminWarning: '',
  });
}

function resetBets(ctx, state) {
  if (hasAppliedPayouts(state)) {
    ctx.setGameState({
      ...state,
      adminWarning: 'Einsätze können nicht zurückgesetzt werden, weil bereits Auszahlungen angewendet wurden.',
    });
    return;
  }

  refundDebitedBets(ctx, state);
  ctx.setGameState({
    ...state,
    phase: 'betting',
    betsByPlayerId: {},
    debitedBetsByPlayerId: {},
    payoutsByQuestionId: {},
    adminWarning: '',
  });
}

function unlockBets(ctx, state) {
  if (hasAppliedPayouts(state)) {
    ctx.setGameState({
      ...state,
      adminWarning: 'Einsätze können nicht entsperrt werden, weil bereits Auszahlungen angewendet wurden.',
    });
    return;
  }

  refundDebitedBets(ctx, state);
  const betsByPlayerId = {};
  for (const [playerId, entry] of Object.entries(state.betsByPlayerId)) {
    betsByPlayerId[playerId] = {
      ...entry,
      locked: false,
      lockedAt: null,
    };
  }
  ctx.setGameState({
    ...state,
    phase: 'betting',
    betsByPlayerId,
    debitedBetsByPlayerId: {},
    payoutsByQuestionId: {},
    adminWarning: '',
  });
}

function refundDebitedBets(ctx, state) {
  for (const [playerId, debit] of Object.entries(state.debitedBetsByPlayerId || {})) {
    const amount = Number(debit && debit.amount) || 0;
    if (amount > 0) ctx.addPoints(playerId, amount);
  }
}

function showSolution(ctx, state) {
  const question = fullQuestionById(state.selectedQuestionId);
  if (!question) {
    ctx.setGameState({
      ...state,
      adminWarning: 'Keine Frage ausgewählt.',
    });
    return;
  }

  const hasOverlays = (question.solutionSteps || []).length > 0;

  // Ohne Einblendungen wird die Antwort sofort gezeigt und ausgezahlt.
  // Mit Einblendungen (z. B. 1% Frage) passiert das erst beim Ergebnis-Schritt.
  const payoutsByQuestionId = hasOverlays
    ? state.payoutsByQuestionId
    : autoEvaluate(ctx, state, question);

  ctx.setGameState({
    ...state,
    phase: 'locked',
    answersOpen: false,
    timer: {
      ...state.timer,
      running: false,
    },
    payoutsByQuestionId,
    solutionVisible: true,
    solutionStep: 0,
    solution: buildSolutionPayload(question, 0),
    adminWarning: '',
  });
}

function changeSolutionStep(ctx, state, delta) {
  const question = fullQuestionById(state.selectedQuestionId);
  if (!question || !state.solutionVisible) return;
  const total = maxSolutionStep(question.id);
  if (!total) return;

  const next = clampInt(state.solutionStep + delta, 0, total);
  if (next === state.solutionStep) return;

  const wasRevealed = solutionAnswerRevealed(question, state.solutionStep);
  const nowRevealed = solutionAnswerRevealed(question, next);

  // Beim Aufdecken des Ergebnis-Schritts automatisch auszahlen (idempotent).
  const payoutsByQuestionId = !wasRevealed && nowRevealed
    ? autoEvaluate(ctx, state, question)
    : state.payoutsByQuestionId;

  ctx.setGameState({
    ...state,
    solutionStep: next,
    payoutsByQuestionId,
    solution: buildSolutionPayload(question, next),
    adminWarning: '',
  });
}

function solutionAnswerRevealed(question, solutionStep) {
  const overlays = question.solutionSteps || [];
  if (!overlays.length) return true;
  return solutionStep >= overlays.length + 1;
}

function buildSolutionPayload(question, solutionStep) {
  const overlays = question.solutionSteps || [];
  const answerRevealed = solutionAnswerRevealed(question, solutionStep);
  const imageSrc = question.solutionImageSrc || question.imageSrc || '';
  return {
    questionId: question.id,
    imageSrc,
    imageExists: imageSrc ? assetExists(imageSrc) : false,
    overlayCount: overlays.length,
    revealedOverlays: overlays.slice(0, Math.min(solutionStep, overlays.length)).map((step) => ({
      id: step.id,
      lines: step.lines,
      x: step.x,
      y: step.y,
    })),
    answerRevealed,
    value: answerRevealed ? question.correctAnswer : '',
    label: answerRevealed ? solutionLabel(question) : '',
    explanation: answerRevealed ? question.explanation : '',
  };
}

// Automatische Auszahlung: Nur Spieler, die diese Frage gewählt haben.
// Bereits angewendete Bewertungen bleiben unangetastet (idempotent).
function autoEvaluate(ctx, state, question) {
  const questionPayouts = { ...(state.payoutsByQuestionId[question.id] || {}) };
  const answers = state.answersByQuestionId[question.id] || {};

  for (const player of ctx.state.players) {
    const bet = state.betsByPlayerId[player.id];
    if (!bet || bet.questionId !== question.id || bet.amount <= 0) continue;
    if (questionPayouts[player.id] && questionPayouts[player.id].applied) continue;

    const answerRow = answers[player.id];
    const isCorrect = answerRow ? isAnswerCorrect(question, answerRow.answer) : false;
    const multiplier = Number(question.multiplier) || 1;
    const payoutAmount = isCorrect ? roundChipPayout(bet.amount * multiplier) : 0;

    if (payoutAmount > 0) {
      ctx.addPoints(player.id, payoutAmount);
    }

    questionPayouts[player.id] = {
      evaluated: true,
      isCorrect,
      betAmount: bet.amount,
      multiplier,
      payoutAmount,
      applied: true,
      appliedAt: Date.now(),
    };
  }

  return {
    ...state.payoutsByQuestionId,
    [question.id]: questionPayouts,
  };
}

// Manuelle Korrektur durch die Spielleitung, solange noch nichts angewendet ist.
function evaluateAnswerManually(ctx, state, action) {
  const question = fullQuestionById(action.questionId || state.selectedQuestionId);
  const player = ctx.state.players.find((entry) => entry.id === action.playerId);
  if (!question || !player) return;

  const questionPayouts = state.payoutsByQuestionId[question.id] || {};
  if (questionPayouts[player.id] && questionPayouts[player.id].applied) return;

  const bet = state.betsByPlayerId[player.id];
  const betAmount = bet && bet.questionId === question.id ? bet.amount : 0;
  const isCorrect = action.isCorrect === true;
  const multiplier = Number(question.multiplier) || 1;
  const payoutAmount = isCorrect ? roundChipPayout(betAmount * multiplier) : 0;

  if (payoutAmount > 0) {
    ctx.addPoints(player.id, payoutAmount);
  }

  ctx.setGameState({
    ...state,
    payoutsByQuestionId: {
      ...state.payoutsByQuestionId,
      [question.id]: {
        ...questionPayouts,
        [player.id]: {
          evaluated: true,
          isCorrect,
          betAmount,
          multiplier,
          payoutAmount,
          applied: true,
          appliedAt: Date.now(),
        },
      },
    },
    adminWarning: '',
  });
}

function isAnswerCorrect(question, answer) {
  const given = String(answer == null ? '' : answer).trim();
  const expected = String(question.correctAnswer == null ? '' : question.correctAnswer).trim();
  if (!given || !expected) return false;
  if (question.answerType === 'number') {
    const givenNumber = Number(given.replace(',', '.'));
    const expectedNumber = Number(expected.replace(',', '.'));
    if (!Number.isFinite(givenNumber) || !Number.isFinite(expectedNumber)) return false;
    return Math.abs(givenNumber - expectedNumber) < 1e-9;
  }
  return given.toUpperCase() === expected.toUpperCase();
}

function solutionLabel(question) {
  if (question.answerType === 'choice') {
    const option = (question.options || []).find((entry) => entry.value === question.correctAnswer);
    if (option && option.label !== option.value) {
      return `${option.value} – ${option.label}`;
    }
  }
  return String(question.correctAnswer);
}

function hasAppliedPayouts(state) {
  return Object.values(state.payoutsByQuestionId || {}).some((questionRows) =>
    Object.values(questionRows || {}).some((row) => row && row.applied)
  );
}

function roundChipPayout(value) {
  return Math.ceil(Number(value) || 0);
}

function normalizeAnswer(question, answer) {
  const value = String(answer == null ? '' : answer).trim();
  if (!value) return '';
  if (question.answerType === 'choice') {
    const upper = value.toUpperCase();
    return question.options.some((option) => option.value === upper) ? upper : '';
  }
  if (question.answerType === 'number') {
    return /^-?\d+(?:[,.]\d+)?$/.test(value) ? value.replace(',', '.') : '';
  }
  return '';
}

function questionById(questionId) {
  return PERCENT_QUIZ_QUESTIONS.find((question) => question.id === questionId) || null;
}

// Inklusive correctAnswer/explanation - nur serverseitig verwenden.
function fullQuestionById(questionId) {
  return questionById(questionId);
}

function clampInt(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function playerIdForClient(state, clientId) {
  const client = state.clients && state.clients[clientId];
  return client ? client.playerId : null;
}

function isAdminClient(state, clientId) {
  const client = state.clients && state.clients[clientId];
  return client && client.role === 'admin';
}

function isDisplayClient(state, clientId) {
  const client = state.clients && state.clients[clientId];
  return client && client.role === 'display';
}
