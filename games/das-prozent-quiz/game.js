'use strict';

const fs = require('fs');
const path = require('path');
const { PERCENT_QUIZ_QUESTIONS } = require('./percentQuizQuestions');

const PUBLIC_ROOT = path.join(__dirname, '..', '..', 'public');

module.exports = {
  id: 'das-prozent-quiz',
  mode: 'single',
  category: 'quiz',
  title: 'Das Prozent-Quiz',
  responsiblePerson: 'Admin',
  description: 'Bonusspiel mit lokalen Videoclips und Handy-Antworten.',
  rules: 'Admin wählt eine Prozent-Frage, startet den Clip und öffnet die Antworten. Spieler loggen genau eine Antwort ein. Es gibt keine automatische Punktewertung.',
  materials: ['TV-Display', 'Spieler-Handys', 'lokale MP4-Clips'],
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

    if (action.type === 'percent:submit-bets') {
      submitBets(ctx, state, playerId, action);
      return;
    }

    if (action.type === 'percent:clip-ended') {
      if (!display && !admin) return;
      if (!state.selectedQuestionId) return;
      ctx.setGameState({
        ...state,
        phase: 'locked',
        answersOpen: false,
        clipPlayback: {
          ...state.clipPlayback,
          isPlaying: false,
          endedAt: Date.now(),
        },
      });
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
        solutionShownForQuestionId: null,
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

    if (action.type === 'percent:open-answers') {
      if (!state.selectedQuestionId) return;
      ctx.setGameState({
        ...state,
        phase: state.phase === 'playing' ? 'playing' : 'answering',
        answersOpen: true,
      });
      return;
    }

    if (action.type === 'percent:close-answers') {
      if (!state.selectedQuestionId) return;
      ctx.setGameState({
        ...state,
        phase: state.phase === 'results' ? 'results' : 'locked',
        answersOpen: false,
      });
      return;
    }

    if (action.type === 'percent:start-clip') {
      if (!state.selectedQuestionId) {
        ctx.setGameState({ ...state, adminWarning: 'Bitte zuerst eine Frage auswählen.' });
        return;
      }
      startClip(ctx, state, false);
      return;
    }

    if (action.type === 'percent:pause-clip') {
      if (!state.selectedQuestionId) return;
      ctx.setGameState({
        ...state,
        phase: state.answersOpen ? 'answering' : 'selected',
        clipPlayback: {
          ...state.clipPlayback,
          isPlaying: false,
          pausedAt: Date.now(),
          command: 'pause',
          commandId: state.clipPlayback.commandId + 1,
        },
      });
      return;
    }

    if (action.type === 'percent:restart-clip') {
      if (!state.selectedQuestionId) {
        ctx.setGameState({ ...state, adminWarning: 'Bitte zuerst eine Frage auswählen.' });
        return;
      }
      startClip(ctx, state, true);
      return;
    }

    if (action.type === 'percent:reset-answers') {
      if (!state.selectedQuestionId) return;
      const answersByQuestionId = { ...state.answersByQuestionId };
      answersByQuestionId[state.selectedQuestionId] = {};
      ctx.setGameState({
        ...state,
        answersByQuestionId,
        phase: state.phase === 'results' ? 'selected' : state.phase,
        solutionVisible: false,
        solutionShownForQuestionId: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:show-results') {
      if (!state.selectedQuestionId) return;
      ctx.setGameState({
        ...state,
        phase: 'results',
        answersOpen: false,
        solutionVisible: false,
        solutionShownForQuestionId: null,
        clipPlayback: {
          ...state.clipPlayback,
          isPlaying: false,
          command: 'pause',
          commandId: state.clipPlayback.commandId + 1,
        },
      });
      return;
    }

    if (action.type === 'percent:show-solution') {
      showSolution(ctx, state);
      return;
    }

    if (action.type === 'percent:hide-solution') {
      ctx.setGameState({
        ...state,
        solutionVisible: false,
        solutionShownForQuestionId: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'percent:evaluate-answer') {
      evaluateAnswer(ctx, state, action);
      return;
    }

    if (action.type === 'percent:back-to-selection') {
      ctx.setGameState({
        ...state,
        phase: state.selectedQuestionId ? 'selected' : 'idle',
        answersOpen: false,
        solutionVisible: false,
        solutionShownForQuestionId: null,
        clipPlayback: {
          ...state.clipPlayback,
          isPlaying: false,
          command: 'pause',
          commandId: state.clipPlayback.commandId + 1,
        },
      });
    }
  },
};

function defaultGameState() {
  return {
    selectedQuestionId: null,
    phase: 'idle',
    answersOpen: false,
    clipPlayback: defaultClipPlayback(),
    answersByQuestionId: {},
    betsByPlayerId: {},
    debitedBetsByPlayerId: {},
    payoutsByQuestionId: {},
    solutionVisible: false,
    solutionShownForQuestionId: null,
    questions: questionsWithClipStatus(),
    adminWarning: '',
  };
}

function defaultClipPlayback() {
  return {
    isPlaying: false,
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    currentTime: 0,
    command: 'idle',
    commandId: 0,
  };
}

function ensureGameState(value) {
  const base = defaultGameState();
  const saved = value && typeof value === 'object' ? value : {};
  const selectedQuestionId = questionById(saved.selectedQuestionId) ? saved.selectedQuestionId : null;
  const solutionShownForQuestionId = questionById(saved.solutionShownForQuestionId) ? saved.solutionShownForQuestionId : null;
  const phase = ['idle', 'betting', 'bettingLocked', 'selected', 'playing', 'answering', 'locked', 'results', 'payout'].includes(saved.phase)
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
    clipPlayback: normalizeClipPlayback(saved.clipPlayback),
    answersByQuestionId: normalizeAnswersByQuestionId(saved.answersByQuestionId),
    betsByPlayerId: normalizeBetsByPlayerId(saved.betsByPlayerId),
    debitedBetsByPlayerId: normalizeDebitedBets(saved.debitedBetsByPlayerId),
    payoutsByQuestionId: normalizePayoutsByQuestionId(saved.payoutsByQuestionId),
    solutionVisible: saved.solutionVisible === true && selectedQuestionId === solutionShownForQuestionId,
    solutionShownForQuestionId: selectedQuestionId === solutionShownForQuestionId ? solutionShownForQuestionId : null,
    questions: questionsWithClipStatus(),
    adminWarning: String(saved.adminWarning || '').slice(0, 160),
  };
}

function normalizeClipPlayback(value) {
  const base = defaultClipPlayback();
  const saved = value && typeof value === 'object' ? value : {};
  return {
    ...base,
    ...saved,
    isPlaying: saved.isPlaying === true,
    commandId: Number(saved.commandId) || 0,
    currentTime: Number(saved.currentTime) || 0,
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
    const bets = entry && entry.bets && typeof entry.bets === 'object' ? entry.bets : {};
    out[playerId] = {
      locked: entry && entry.locked === true,
      lockedAt: Number(entry && entry.lockedAt) || null,
      bets: normalizeQuestionBets(bets),
    };
  }
  return out;
}

function normalizeQuestionBets(value) {
  const out = {};
  for (const question of PERCENT_QUIZ_QUESTIONS) {
    out[question.id] = clampInt(value && value[question.id], 0, Number.MAX_SAFE_INTEGER);
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

function questionsWithClipStatus() {
  return PERCENT_QUIZ_QUESTIONS.map((question) => ({
    ...question,
    clipExists: clipExists(question.clipSrc),
    solutionExists: assetExists(question.solutionImageSrc),
  }));
}

function selectQuestion(ctx, state, questionId) {
  const question = questionById(questionId);
  if (!question) return;
  ctx.setGameState({
    ...state,
    selectedQuestionId: question.id,
    phase: 'selected',
    answersOpen: false,
    clipPlayback: defaultClipPlayback(),
    solutionVisible: false,
    solutionShownForQuestionId: null,
    questions: questionsWithClipStatus(),
    adminWarning: '',
  });
}

function startClip(ctx, state, restart) {
  ctx.setGameState({
    ...state,
    phase: 'playing',
    answersOpen: true,
    solutionVisible: false,
    solutionShownForQuestionId: null,
    clipPlayback: {
      ...state.clipPlayback,
      isPlaying: true,
      startedAt: Date.now(),
      pausedAt: null,
      endedAt: null,
      currentTime: restart ? 0 : state.clipPlayback.currentTime || 0,
      command: restart ? 'restart' : 'play',
      commandId: state.clipPlayback.commandId + 1,
    },
    questions: questionsWithClipStatus(),
    adminWarning: '',
  });
}

function submitAnswer(ctx, state, playerId, action) {
  if (!playerId || !state.selectedQuestionId || !state.answersOpen) return;
  const question = questionById(state.selectedQuestionId);
  if (!question) return;

  const existingAnswers = state.answersByQuestionId[state.selectedQuestionId] || {};
  if (existingAnswers[playerId]) return;

  const answer = normalizeAnswer(question, action.answer);
  if (!answer) return;

  const player = ctx.state.players.find((entry) => entry.id === playerId);
  ctx.setGameState({
    ...state,
    phase: state.phase === 'playing' ? 'playing' : 'answering',
    answersByQuestionId: {
      ...state.answersByQuestionId,
      [state.selectedQuestionId]: {
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

function submitBets(ctx, state, playerId, action) {
  if (!playerId || state.phase !== 'betting') return;
  const player = ctx.state.players.find((entry) => entry.id === playerId);
  if (!player) return;

  const existing = state.betsByPlayerId[playerId];
  if (existing && existing.locked) return;

  const bets = normalizeQuestionBets(action.bets || {});
  const total = totalBet(bets);
  const balance = Math.max(0, Number(player.score) || 0);
  if (total > balance) return;

  ctx.setGameState({
    ...state,
    betsByPlayerId: {
      ...state.betsByPlayerId,
      [playerId]: {
        locked: true,
        lockedAt: Date.now(),
        bets,
      },
    },
    adminWarning: '',
  });
}

function closeBetting(ctx, state) {
  const nextDebited = { ...state.debitedBetsByPlayerId };

  for (const player of ctx.state.players) {
    const entry = state.betsByPlayerId[player.id] || { locked: false, bets: {} };
    const amount = totalBet(entry.bets || {});
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

function evaluateAnswer(ctx, state, action) {
  const question = questionById(action.questionId || state.selectedQuestionId);
  const player = ctx.state.players.find((entry) => entry.id === action.playerId);
  if (!question || !player) return;

  const questionPayouts = state.payoutsByQuestionId[question.id] || {};
  if (questionPayouts[player.id] && questionPayouts[player.id].applied) return;

  const isCorrect = action.isCorrect === true;
  const betAmount = betForPlayerQuestion(state, player.id, question.id);
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
    phase: state.phase === 'results' ? 'results' : 'payout',
    adminWarning: '',
  });
}

function showSolution(ctx, state) {
  const question = questionById(state.selectedQuestionId);
  if (!question) {
    ctx.setGameState({
      ...state,
      adminWarning: 'Keine Frage ausgewählt.',
    });
    return;
  }

  ctx.setGameState({
    ...state,
    answersOpen: false,
    solutionVisible: true,
    solutionShownForQuestionId: question.id,
    clipPlayback: {
      ...state.clipPlayback,
      isPlaying: false,
      command: 'pause',
      commandId: state.clipPlayback.commandId + 1,
    },
    questions: questionsWithClipStatus(),
    adminWarning: '',
  });
}

function hasAppliedPayouts(state) {
  return Object.values(state.payoutsByQuestionId || {}).some((questionRows) =>
    Object.values(questionRows || {}).some((row) => row && row.applied)
  );
}

function betForPlayerQuestion(state, playerId, questionId) {
  const entry = state.betsByPlayerId[playerId];
  return clampInt(entry && entry.bets && entry.bets[questionId], 0, Number.MAX_SAFE_INTEGER);
}

function totalBet(bets) {
  return Object.values(bets || {}).reduce((sum, value) => sum + clampInt(value, 0, Number.MAX_SAFE_INTEGER), 0);
}

function roundChipPayout(value) {
  return Math.ceil(Number(value) || 0);
}

function normalizeAnswer(question, answer) {
  const value = String(answer == null ? '' : answer).trim();
  if (!value) return '';
  if (question.answerType === 'choice') {
    const upper = value.toUpperCase();
    return question.options.includes(upper) ? upper : '';
  }
  if (question.answerType === 'number') {
    return /^-?\d+(?:[,.]\d+)?$/.test(value) ? value.replace(',', '.') : '';
  }
  if (question.answerType === 'grid') {
    const match = /^R([1-4])C([1-3])$/.exec(value);
    if (!match) return '';
    const row = Number(match[1]);
    const col = Number(match[2]);
    return row <= question.gridRows && col <= question.gridCols ? value : '';
  }
  return '';
}

function questionById(questionId) {
  return PERCENT_QUIZ_QUESTIONS.find((question) => question.id === questionId) || null;
}

function clipExists(clipSrc) {
  return assetExists(clipSrc);
}

function assetExists(assetSrc) {
  const normalized = String(assetSrc || '').replace(/^\/+/, '');
  return fs.existsSync(path.join(PUBLIC_ROOT, normalized));
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
