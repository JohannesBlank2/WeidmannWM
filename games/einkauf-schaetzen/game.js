'use strict';

const BOX_COUNT = 5;
const ITEMS_PER_BOX = 3;
const NO_ANSWER_PENALTY_CENTS = 1000;

module.exports = {
  id: 'einkauf-schaetzen',
  mode: 'single',
  category: 'skill',
  title: 'How much is the fish',
  responsiblePerson: 'Admin',
  description: 'Spieler schätzen den Gesamtpreis einer Box mit drei echten Einkaufsgegenständen möglichst centgenau.',
  rules: 'Pro Box werden drei Gegenstände gezeigt. Jeder Spieler gibt in der Player-Ansicht einen geschätzten Gesamtpreis ein. Der Admin trägt Gegenstände und Einzelpreise ein, deckt erst die Tipps und dann die Lösung auf. Die absolute Abweichung zur Lösung wird pro Box zur Gesamtwertung addiert.',
  materials: ['5 Boxen mit je 3 Gegenständen', 'Kassenbon oder Einzelpreise', 'Spieler-Handys', 'TV-Display'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'schaetzen',
  built: true,

  onStart(ctx) {
    ctx.setGameState(defaultGameState(ctx.state.players));
  },

  onStop(ctx) {
    ctx.setGameState({});
  },

  onAction(ctx, client, action = {}) {
    const state = ensureGameState(ctx.state.gameState, ctx.state.players);

    if (action.type === 'fish:submit-answer') {
      submitAnswer(ctx, state, client.clientId, action.amountCents != null ? action.amountCents : action.amount);
      return;
    }

    if (!isAdminClient(ctx.state, client.clientId)) return;

    if (action.type === 'fish:select-box') {
      ctx.setGameState(selectBox(state, ctx.state.players, action.boxId || action.boxIndex));
      return;
    }

    if (action.type === 'fish:set-item') {
      ctx.setGameState(setItem(state, ctx.state.players, action.boxId, action.itemIndex, action.patch || {}));
      return;
    }

    if (action.type === 'fish:set-total') {
      ctx.setGameState(setTotal(state, ctx.state.players, action.playerId, action.amount));
      return;
    }

    if (action.type === 'fish:set-answers-open') {
      ctx.setGameState({
        ...state,
        answersOpen: action.open === true,
        phase: action.open === true ? 'input' : state.phase,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'fish:reveal-guesses') {
      ctx.setGameState({
        ...withResults(state, ctx.state.players),
        phase: 'guesses',
        answersOpen: false,
        guessesRevealed: true,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'fish:reveal-solution') {
      ctx.setGameState({
        ...withResults(state, ctx.state.players),
        phase: 'solution',
        answersOpen: false,
        guessesRevealed: true,
        solutionRevealed: true,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'fish:confirm-result') {
      confirmResult(ctx, state, ctx.state.players);
      return;
    }

    if (action.type === 'fish:next-box') {
      ctx.setGameState(nextBoxState(state, ctx.state.players));
      return;
    }

    if (action.type === 'fish:reset-box') {
      ctx.setGameState(resetCurrentBox(state, ctx.state.players));
    }
  },
};

function defaultGameState(players = []) {
  return {
    phase: 'setup',
    selectedBoxId: 'box1',
    boxes: buildBoxes(),
    answersOpen: false,
    guessesRevealed: false,
    solutionRevealed: false,
    resultConfirmed: false,
    answersByBoxId: {},
    results: [],
    winnerPlayerIds: [],
    totals: Object.fromEntries(players.map((player) => [player.id, 0])),
    scoredRounds: 0,
    adminWarning: '',
  };
}

function ensureGameState(value, players = []) {
  const saved = value && typeof value === 'object' ? value : {};
  const boxes = normalizeBoxes(saved.boxes);
  const selectedBoxId = boxes.some((box) => box.id === saved.selectedBoxId)
    ? saved.selectedBoxId
    : boxes[0].id;
  const state = {
    ...defaultGameState(players),
    ...saved,
    phase: ['setup', 'input', 'guesses', 'solution', 'result'].includes(saved.phase) ? saved.phase : 'setup',
    selectedBoxId,
    boxes,
    answersOpen: saved.answersOpen === true,
    guessesRevealed: saved.guessesRevealed === true,
    solutionRevealed: saved.solutionRevealed === true,
    resultConfirmed: saved.resultConfirmed === true,
    answersByBoxId: saved.answersByBoxId && typeof saved.answersByBoxId === 'object' ? saved.answersByBoxId : {},
    totals: normalizeTotals(saved.totals, players),
    scoredRounds: Number.isInteger(saved.scoredRounds) ? saved.scoredRounds : 0,
    adminWarning: String(saved.adminWarning || '').slice(0, 160),
  };
  return withResults(state, players);
}

function buildBoxes() {
  return Array.from({ length: BOX_COUNT }, (_, index) => ({
    id: `box${index + 1}`,
    label: `Box ${index + 1}`,
    items: Array.from({ length: ITEMS_PER_BOX }, (_unused, itemIndex) => ({
      name: `Gegenstand ${itemIndex + 1}`,
      priceCents: null,
    })),
  }));
}

function normalizeBoxes(boxes) {
  const saved = Array.isArray(boxes) ? boxes : [];
  const defaults = buildBoxes();
  return defaults.map((box, boxIndex) => {
    const rawBox = saved.find((entry) => entry && entry.id === box.id) || saved[boxIndex] || {};
    const rawItems = Array.isArray(rawBox.items) ? rawBox.items : [];
    return {
      id: box.id,
      label: normalizeText(rawBox.label, 40) || box.label,
      items: box.items.map((item, itemIndex) => {
        const rawItem = rawItems[itemIndex] || {};
        return {
          name: normalizeText(rawItem.name, 80) || item.name,
          priceCents: normalizeStoredCents(rawItem.priceCents),
        };
      }),
    };
  });
}

function selectBox(state, players, boxIdOrIndex) {
  const boxes = normalizeBoxes(state.boxes);
  const byId = boxes.find((box) => box.id === boxIdOrIndex);
  const byIndex = boxes[clampInt(Number(boxIdOrIndex), 0, boxes.length - 1)];
  const selected = byId || byIndex || boxes[0];
  return withResults({
    ...state,
    selectedBoxId: selected.id,
    phase: state.resultConfirmed ? 'result' : state.phase,
    adminWarning: '',
  }, players);
}

function setItem(state, players, boxId, itemIndex, patch) {
  const boxes = normalizeBoxes(state.boxes);
  const box = boxes.find((entry) => entry.id === boxId) || boxes.find((entry) => entry.id === state.selectedBoxId);
  const index = clampInt(itemIndex, 0, ITEMS_PER_BOX - 1);
  if (!box) return state;

  box.items[index] = {
    ...box.items[index],
    name: patch.name != null ? normalizeText(patch.name, 80) : box.items[index].name,
    priceCents: patch.price != null || patch.priceCents != null
      ? normalizeCents(patch.priceCents != null ? patch.priceCents : patch.price)
      : box.items[index].priceCents,
  };

  return withResults({
    ...state,
    boxes,
    adminWarning: '',
  }, players);
}

function setTotal(state, players, playerId, amount) {
  const player = players.find((entry) => entry.id === playerId);
  if (!player) return state;
  const amountCents = normalizeCents(amount);
  if (amountCents == null) return state;
  return withResults({
    ...state,
    totals: {
      ...(state.totals || {}),
      [player.id]: amountCents,
    },
    adminWarning: '',
  }, players);
}

function submitAnswer(ctx, state, clientId, amount) {
  if (!state.answersOpen || !['input', 'setup'].includes(state.phase)) return;
  const clientState = ctx.state.clients && ctx.state.clients[clientId];
  const playerId = clientState && clientState.playerId;
  if (!playerId || !ctx.state.players.some((player) => player.id === playerId)) return;

  const amountCents = normalizeSubmittedCents(amount);
  if (amountCents == null) return;
  const boxAnswers = {
    ...((state.answersByBoxId && state.answersByBoxId[state.selectedBoxId]) || {}),
    [playerId]: {
      playerId,
      amountCents,
      submittedAt: Date.now(),
    },
  };

  ctx.setGameState(withResults({
    ...state,
    phase: 'input',
    answersByBoxId: {
      ...(state.answersByBoxId || {}),
      [state.selectedBoxId]: boxAnswers,
    },
    adminWarning: '',
  }, ctx.state.players));
}

function confirmResult(ctx, state, players) {
  const current = withResults(state, players);
  if (!['solution', 'result'].includes(current.phase)) return;
  if (current.resultConfirmed) return;
  if (!current.results.length || current.results.some((result) => result.differenceCents == null)) return;

  const totals = normalizeTotals(current.totals, players);
  current.results.forEach((result) => {
    totals[result.playerId] = (totals[result.playerId] || 0) + result.differenceCents;
  });

  ctx.setGameState({
    ...current,
    phase: 'result',
    totals,
    scoredRounds: (current.scoredRounds || 0) + 1,
    resultConfirmed: true,
    adminWarning: '',
  });
}

function nextBoxState(state, players) {
  const boxes = normalizeBoxes(state.boxes);
  const currentIndex = boxes.findIndex((box) => box.id === state.selectedBoxId);
  const nextIndex = Math.min(boxes.length - 1, Math.max(0, currentIndex + 1));
  return withResults({
    ...state,
    selectedBoxId: boxes[nextIndex].id,
    phase: 'setup',
    answersOpen: false,
    guessesRevealed: false,
    solutionRevealed: false,
    resultConfirmed: false,
    results: [],
    winnerPlayerIds: [],
    adminWarning: '',
  }, players);
}

function resetCurrentBox(state, players) {
  const answersByBoxId = { ...(state.answersByBoxId || {}) };
  delete answersByBoxId[state.selectedBoxId];
  return withResults({
    ...state,
    answersByBoxId,
    phase: 'setup',
    answersOpen: false,
    guessesRevealed: false,
    solutionRevealed: false,
    resultConfirmed: false,
    results: [],
    winnerPlayerIds: [],
    adminWarning: '',
  }, players);
}

function withResults(state, players = []) {
  const box = selectedBox(state);
  const actualCents = boxTotalCents(box);
  const answers = (state.answersByBoxId && state.answersByBoxId[state.selectedBoxId]) || {};
  const results = players.map((player) => {
    const answer = answers[player.id] || null;
    const amountCents = answer ? normalizeStoredCents(answer.amountCents) : null;
    const differenceCents = actualCents == null
      ? null
      : amountCents != null
        ? Math.abs(amountCents - actualCents)
        : NO_ANSWER_PENALTY_CENTS;
    return {
      playerId: player.id,
      playerName: player.name,
      amountCents,
      actualCents,
      differenceCents,
      noAnswerPenalty: amountCents == null && actualCents != null,
      submitted: amountCents != null,
    };
  });
  const valid = results.filter((result) => result.differenceCents != null);
  const best = valid.length ? Math.min(...valid.map((result) => result.differenceCents)) : null;
  return {
    ...state,
    boxes: normalizeBoxes(state.boxes),
    results,
    winnerPlayerIds: best == null
      ? []
      : valid.filter((result) => result.differenceCents === best).map((result) => result.playerId),
    totals: normalizeTotals(state.totals, players),
  };
}

function selectedBox(state) {
  const boxes = normalizeBoxes(state.boxes);
  return boxes.find((box) => box.id === state.selectedBoxId) || boxes[0];
}

function boxTotalCents(box) {
  if (!box || !Array.isArray(box.items)) return null;
  if (box.items.some((item) => item.priceCents == null)) return null;
  return box.items.reduce((sum, item) => sum + item.priceCents, 0);
}

function normalizeTotals(value, players) {
  const saved = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(players.map((player) => [
    player.id,
    Math.max(0, Math.round(Number(saved[player.id]) || 0)),
  ]));
}

function normalizeCents(value) {
  if (value === '' || value == null) return null;
  const raw = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function normalizeSubmittedCents(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function normalizeStoredCents(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function clampInt(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function isAdminClient(state, clientId) {
  const clientState = state.clients && state.clients[clientId];
  return clientState && clientState.role === 'admin';
}
