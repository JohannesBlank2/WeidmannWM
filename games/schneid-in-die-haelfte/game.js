'use strict';

const DEFAULT_ITEM = 'Runde 1';

module.exports = {
  id: 'schneid-in-die-haelfte',
  mode: 'single',
  category: 'skill',
  title: 'Halbe Sachen',
  responsiblePerson: 'Admin',
  description: 'Alle Spieler schneiden denselben Gegenstand in zwei möglichst gleich schwere Hälften.',
  rules: 'Nacheinander schneiden alle Spieler denselben Gegenstand. Die Hälften werden extern gewogen und in der Admin-Konsole eingetragen. Am TV bleibt die Runde verdeckt, bis der Admin die Waagen-Auflösung zeigt. Kleinster Gewichtsunterschied gewinnt die Runde.',
  materials: ['Gegenstände zum Schneiden', 'Messer oder Schneidewerkzeug', 'Waage'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'keine',
  built: true,

  onStart(ctx) {
    ctx.setGameState(defaultGameState(ctx.state.players));
  },

  onStop(ctx) {
    ctx.setGameState({});
  },

  onAction(ctx, client, action = {}) {
    if (!isAdminClient(ctx.state, client.clientId)) return;

    const state = ensureGameState(ctx.state.gameState, ctx.state.players);

    if (action.type === 'halbe:set-item') {
      ctx.setGameState({
        ...state,
        itemName: normalizeText(action.itemName, 80) || DEFAULT_ITEM,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'halbe:set-weight') {
      const next = setWeight(state, ctx.state.players, action.playerId, action.side, action.value);
      ctx.setGameState(next);
      return;
    }

    if (action.type === 'halbe:start-timer') {
      const seconds = Math.max(1, Math.min(600, Number(action.seconds) || 30));
      const startedAt = Date.now();
      ctx.setGameState({
        ...state,
        timer: {
          running: true,
          durationSeconds: seconds,
          startedAt,
          endsAt: startedAt + (seconds * 1000),
        },
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'halbe:stop-timer') {
      ctx.setGameState({
        ...state,
        timer: defaultTimerState(),
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'halbe:reveal') {
      ctx.setGameState({
        ...withResults(state, ctx.state.players),
        phase: 'reveal',
        revealedAt: Date.now(),
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'halbe:confirm-result') {
      confirmResult(ctx, state, ctx.state.players);
      return;
    }

    if (action.type === 'halbe:hide') {
      ctx.setGameState({
        ...state,
        phase: 'cutting',
        revealedAt: null,
        adminWarning: '',
      });
      return;
    }

    if (action.type === 'halbe:next-round') {
      ctx.setGameState(nextRoundState(ctx.state.players, state, state.roundNumber + 1));
      return;
    }

    if (action.type === 'halbe:reset-round') {
      ctx.setGameState(nextRoundState(ctx.state.players, state, state.roundNumber));
    }
  },
};

function defaultGameState(players = [], roundNumber = 1) {
  return {
    phase: 'cutting',
    roundNumber: Math.max(1, Number(roundNumber) || 1),
    itemName: roundNumber > 1 ? `Runde ${roundNumber}` : DEFAULT_ITEM,
    measurements: Object.fromEntries(players.map((player) => [
      player.id,
      { playerId: player.id, left: null, right: null },
    ])),
    results: [],
    winnerPlayerIds: [],
    resultConfirmed: false,
    totals: Object.fromEntries(players.map((player) => [player.id, 0])),
    scoredRounds: 0,
    revealedAt: null,
    timer: defaultTimerState(),
    adminWarning: '',
  };
}

function ensureGameState(value, players = []) {
  const saved = value && typeof value === 'object' ? value : {};
  const base = defaultGameState(players, saved.roundNumber);
  const savedMeasurements = saved.measurements && typeof saved.measurements === 'object'
    ? saved.measurements
    : {};

  const measurements = Object.fromEntries(players.map((player) => {
    const entry = savedMeasurements[player.id] || {};
    return [
      player.id,
      {
        playerId: player.id,
        left: normalizeWeight(entry.left),
        right: normalizeWeight(entry.right),
      },
    ];
  }));

  const state = {
    ...base,
    ...saved,
    phase: ['reveal', 'result'].includes(saved.phase) ? saved.phase : 'cutting',
    roundNumber: Math.max(1, Number(saved.roundNumber) || 1),
    itemName: normalizeText(saved.itemName, 80) || base.itemName,
    measurements,
    results: [],
    winnerPlayerIds: [],
    resultConfirmed: saved.resultConfirmed === true,
    totals: normalizeTotals(saved.totals, players),
    scoredRounds: Number.isInteger(saved.scoredRounds) ? saved.scoredRounds : 0,
    revealedAt: Number(saved.revealedAt) || null,
    timer: normalizeTimer(saved.timer),
    adminWarning: normalizeText(saved.adminWarning, 160),
  };

  return withResults(state, players);
}

function setWeight(state, players, playerId, side, value) {
  const player = players.find((entry) => entry.id === playerId);
  if (!player || !['left', 'right'].includes(side)) return state;

  const measurements = {
    ...state.measurements,
    [player.id]: {
      ...(state.measurements[player.id] || { playerId: player.id, left: null, right: null }),
      playerId: player.id,
      [side]: normalizeWeight(value),
    },
  };

  return withResults({
    ...state,
    measurements,
    adminWarning: '',
  }, players);
}

function confirmResult(ctx, state, players) {
  const current = withResults(state, players);
  if (!['reveal', 'result'].includes(current.phase)) return;
  if (current.resultConfirmed) return;
  if (!current.results.every((result) => result.complete)) return;

  const totals = normalizeTotals(current.totals, players);
  current.results.forEach((result) => {
    totals[result.playerId] = roundWeight((totals[result.playerId] || 0) + result.difference);
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

function nextRoundState(players, previousState, roundNumber) {
  const state = defaultGameState(players, roundNumber);
  return {
    ...state,
    totals: normalizeTotals(previousState && previousState.totals, players),
    scoredRounds: Number.isInteger(previousState && previousState.scoredRounds)
      ? previousState.scoredRounds
      : 0,
  };
}

function withResults(state, players) {
  const results = players.map((player) => {
    const measurement = state.measurements[player.id] || {};
    const left = normalizeWeight(measurement.left);
    const right = normalizeWeight(measurement.right);
    const complete = left !== null && right !== null;
    const difference = complete ? roundWeight(Math.abs(left - right)) : null;
    const total = complete ? roundWeight(left + right) : null;
    return {
      playerId: player.id,
      playerName: player.name,
      left,
      right,
      total,
      difference,
      complete,
    };
  });

  const completeResults = results.filter((result) => result.complete);
  const bestDifference = completeResults.length
    ? Math.min(...completeResults.map((result) => result.difference))
    : null;
  const winnerPlayerIds = bestDifference == null
    ? []
    : completeResults
        .filter((result) => result.difference === bestDifference)
        .map((result) => result.playerId);

  return {
    ...state,
    results,
    winnerPlayerIds,
    totals: normalizeTotals(state.totals, players),
  };
}

function normalizeTotals(value, players = []) {
  const saved = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(players.map((player) => [
    player.id,
    roundWeight(Math.max(0, Number(saved[player.id]) || 0)),
  ]));
}

function defaultTimerState() {
  return {
    running: false,
    durationSeconds: 30,
    startedAt: null,
    endsAt: null,
  };
}

function normalizeTimer(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const endsAt = Number(raw.endsAt) || null;
  const startedAt = Number(raw.startedAt) || null;
  const durationSeconds = Math.max(1, Math.min(600, Number(raw.durationSeconds) || 30));
  const running = raw.running === true && endsAt && endsAt > Date.now();

  return {
    running,
    durationSeconds,
    startedAt: running ? startedAt : null,
    endsAt: running ? endsAt : null,
  };
}

function normalizeWeight(value) {
  if (value === '' || value == null) return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) return null;
  return roundWeight(number);
}

function roundWeight(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function isAdminClient(state, clientId) {
  const clientState = state.clients && state.clients[clientId];
  return clientState && clientState.role === 'admin';
}
