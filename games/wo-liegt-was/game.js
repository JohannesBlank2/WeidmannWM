'use strict';

const { QUESTIONS } = require('./whereIsWhatTestQuestions');
const {
  MAP_VIEWS,
  calculateDistanceKm,
  hasValidTarget,
  pinCoordinates,
} = require('./mapUtils');
const { isPointInsideRegion } = require('./geoUtils');

const INPUT_DURATION_MS = 60 * 1000;
const NO_INPUT_PENALTY_KM = 1000;
let inputTimerId = null;

module.exports = {
  id: 'wo-liegt-was',
  mode: 'group',
  category: 'quiz',
  title: 'WO LIEGT WAS?',
  responsiblePerson: 'Admin',
  description: 'Spieler setzen verdeckt Pins auf eine stumme Karte. Die Entfernungen aller Fragen werden addiert – die kleinste Gesamtentfernung gewinnt.',
  rules: 'Moderator wählt eine Frage. Jeder Spieler setzt und bestätigt genau einen Pin. Bei der Auflösung werden alle Pins und die echte Lösung angezeigt. Die Entfernung jeder Frage (außer der Testfrage) wird zur Gesamtwertung addiert. Ohne Eingabe zählt automatisch 1.000 km. Punkte werden am Ende manuell vergeben.',
  materials: ['TV-Display', 'Spieler-Handys'],
  hasBeenPlayed: false,
  selectable: true,
  interaktionstyp: 'karte',
  built: true,
  assets: {
    mapViews: MAP_VIEWS,
    questions: QUESTIONS,
  },

  onStart(ctx) {
    clearInputTimer();
    ctx.lockBuzzer();
    ctx.setGameState(defaultGameState());
  },

  onStop(ctx) {
    clearInputTimer();
    ctx.setGameState({});
  },

  onAction(ctx, client, action = {}) {
    const state = ensureGameState(ctx.state.gameState);
    const playerId = playerIdForClient(ctx.state, client.clientId);
    const admin = isAdminClient(ctx.state, client.clientId);

    if (action.type === 'wlw:select-question') {
      if (!admin) return;
      selectQuestion(ctx, state, action.questionId);
      return;
    }

    if (action.type === 'wlw:next-question') {
      if (!admin) return;
      selectNextQuestion(ctx, state);
      return;
    }

    if (action.type === 'wlw:start-placing') {
      if (!admin) return;
      if (!state.currentQuestionId) return;
      const now = Date.now();
      const nextState = {
        ...state,
        phase: 'placing',
        placingStartedAt: now,
        placingEndsAt: now + INPUT_DURATION_MS,
        inputDurationMs: INPUT_DURATION_MS,
        timerExpired: false,
        lockedAt: null,
      };
      ctx.setGameState(nextState);
      scheduleInputTimer(ctx, nextState);
      return;
    }

    if (action.type === 'wlw:random-question') {
      if (!admin) return;
      selectRandomQuestion(ctx, state);
      return;
    }

    if (action.type === 'wlw:set-pin') {
      setPlayerPin(ctx, state, playerId, action);
      return;
    }

    if (action.type === 'wlw:confirm-pin') {
      confirmPlayerPin(ctx, state, playerId);
      return;
    }

    if (action.type === 'wlw:lock') {
      if (!admin) return;
      lockRound(ctx, state, false);
      return;
    }

    if (action.type === 'wlw:reveal') {
      if (!admin) return;
      revealPins(ctx, state);
      return;
    }

    if (action.type === 'wlw:reveal-target') {
      if (!admin) return;
      revealRound(ctx, state);
      return;
    }

    if (action.type === 'wlw:show-result') {
      if (!admin) return;
      if (!state.results.length) return;
      ctx.setGameState({ ...state, phase: 'result' });
      return;
    }

    if (action.type === 'wlw:confirm-result') {
      if (!admin) return;
      confirmResult(ctx, state);
      return;
    }

    if (action.type === 'wlw:reset-round') {
      if (!admin) return;
      selectQuestion(ctx, state, action.questionId || state.currentQuestionId);
      return;
    }

    if (action.type === 'wlw:new-round') {
      if (!admin) return;
      clearInputTimer();
      ctx.setGameState(defaultGameState());
    }
  },
};

function defaultGameState() {
  return {
    phase: 'setup',
    questions: QUESTIONS,
    currentQuestionIndex: -1,
    currentQuestionId: null,
    currentQuestion: null,
    pins: {},
    results: [],
    winnerPlayerId: null,
    winnerPlayerIds: [],
    tie: false,
    targetMissing: false,
    resultConfirmed: false,
    revealedAt: null,
    inputDurationMs: INPUT_DURATION_MS,
    placingStartedAt: null,
    placingEndsAt: null,
    timerExpired: false,
    lockedAt: null,
    noInputPenaltyKm: NO_INPUT_PENALTY_KM,
    // Gesamtwertung: Summe der Entfernungen (km) pro Spieler über alle gewerteten Fragen.
    totals: {},
    scoredRounds: 0,
  };
}

function ensureGameState(value) {
  return {
    ...defaultGameState(),
    ...(value && typeof value === 'object' ? value : {}),
    questions: QUESTIONS,
    pins: value && value.pins && typeof value.pins === 'object' ? value.pins : {},
    results: Array.isArray(value && value.results) ? value.results : [],
    totals: value && value.totals && typeof value.totals === 'object' ? value.totals : {},
    scoredRounds: value && Number.isInteger(value.scoredRounds) ? value.scoredRounds : 0,
  };
}

function selectQuestion(ctx, state, questionId) {
  clearInputTimer();
  const index = QUESTIONS.findIndex((question) => question.id === questionId);
  const selectedIndex = index >= 0 ? index : 0;
  const selected = QUESTIONS[selectedIndex];
  // Rundenfelder zurücksetzen, Gesamtwertung (totals/scoredRounds) bleibt erhalten.
  ctx.setGameState({
    ...state,
    phase: 'setup',
    currentQuestionIndex: selectedIndex,
    currentQuestionId: selected.id,
    currentQuestion: selected,
    pins: {},
    results: [],
    winnerPlayerId: null,
    winnerPlayerIds: [],
    tie: false,
    targetMissing: !hasValidTarget(selected),
    resultConfirmed: false,
    revealedAt: null,
    placingStartedAt: null,
    placingEndsAt: null,
    inputDurationMs: INPUT_DURATION_MS,
    timerExpired: false,
    lockedAt: null,
    noInputPenaltyKm: NO_INPUT_PENALTY_KM,
  });
}

function selectNextQuestion(ctx, state) {
  const currentIndex = Number.isInteger(state.currentQuestionIndex)
    ? state.currentQuestionIndex
    : QUESTIONS.findIndex((question) => question.id === state.currentQuestionId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % QUESTIONS.length : 0;
  selectQuestion(ctx, state, QUESTIONS[nextIndex].id);
}

function selectRandomQuestion(ctx, state) {
  const currentId = state.currentQuestionId;
  const candidates = QUESTIONS.filter((question) => question.id !== currentId);
  const pool = candidates.length ? candidates : QUESTIONS;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  selectQuestion(ctx, state, selected.id);
}

function setPlayerPin(ctx, state, playerId, action) {
  if (state.phase !== 'placing') return;
  if (isInputExpired(state)) {
    lockRound(ctx, state, true);
    return;
  }
  if (!playerId) return;
  const existing = state.pins[playerId];
  if (existing && existing.confirmed) return;

  const player = ctx.state.players.find((entry) => entry.id === playerId);
  const regionId = currentMapView(state.currentQuestion);
  const coords = pinCoordinates({
    lat: action.lat,
    lng: action.lng,
    latitude: action.latitude,
    longitude: action.longitude,
    x: action.x,
    y: action.y,
  }, regionId);
  if (!coords) return;
  // Pins außerhalb des aktiven Regions-Umrisses werden ignoriert.
  if (!isPointInsideRegion(coords.lat, coords.lng, regionId)) return;

  ctx.setGameState({
    ...state,
    pins: {
      ...state.pins,
      [playerId]: {
        playerId,
        playerName: player ? player.name : playerId,
        lat: coords.lat,
        lng: coords.lng,
        color: player ? player.color : undefined,
        confirmed: false,
        placedAt: Date.now(),
      },
    },
  });
}

function confirmPlayerPin(ctx, state, playerId) {
  if (state.phase !== 'placing') return;
  if (isInputExpired(state)) {
    lockRound(ctx, state, true);
    return;
  }
  if (!playerId || !state.pins[playerId]) return;

  const nextPins = {
    ...state.pins,
    [playerId]: {
      ...state.pins[playerId],
      confirmed: true,
      confirmedAt: Date.now(),
    },
  };
  const allConfirmed = ctx.state.players.every((player) => nextPins[player.id] && nextPins[player.id].confirmed);

  if (allConfirmed) clearInputTimer();

  ctx.setGameState({
    ...state,
    phase: allConfirmed ? 'locked' : 'placing',
    pins: nextPins,
    timerExpired: false,
    lockedAt: allConfirmed ? Date.now() : state.lockedAt,
  });
}

function lockRound(ctx, state, timerExpired) {
  clearInputTimer();
  ctx.setGameState({
    ...state,
    phase: 'locked',
    timerExpired: timerExpired === true,
    lockedAt: Date.now(),
  });
}

function scheduleInputTimer(ctx, state) {
  clearInputTimer();
  const remaining = Math.max(0, Number(state.placingEndsAt || 0) - Date.now());
  inputTimerId = setTimeout(() => {
    inputTimerId = null;
    const live = ensureGameState(ctx.state.gameState);
    const sameRound = live.currentQuestionId === state.currentQuestionId && Number(live.placingEndsAt) === Number(state.placingEndsAt);
    if (sameRound && live.phase === 'placing') {
      lockRound(ctx, live, true);
    }
  }, remaining);
}

function clearInputTimer() {
  if (inputTimerId) {
    clearTimeout(inputTimerId);
    inputTimerId = null;
  }
}

function isInputExpired(state) {
  return state.phase === 'placing' && Number.isFinite(Number(state.placingEndsAt)) && Date.now() >= Number(state.placingEndsAt);
}

// Stufe 1 der Auflösung: nur die Spieler-Pins zeigen, Ziel bleibt verdeckt.
function revealPins(ctx, state) {
  if (!state.currentQuestion) return;
  clearInputTimer();
  ctx.setGameState({
    ...state,
    phase: 'reveal-pins',
    revealedAt: Date.now(),
  });
}

// Stufe 2 der Auflösung: Ziel und Entfernungen zeigen.
function revealRound(ctx, state) {
  const question = state.currentQuestion;
  if (!question) return;
  clearInputTimer();

  const targetMissing = !hasValidTarget(question);
  const results = buildResults(ctx.state.players, state.pins, question);
  const winner = getWinnerFromResults(results);

  ctx.setGameState({
    ...state,
    phase: 'reveal',
    results,
    winnerPlayerId: winner.winnerPlayerIds.length === 1 ? winner.winnerPlayerIds[0] : null,
    winnerPlayerIds: winner.winnerPlayerIds,
    tie: winner.tie,
    targetMissing,
    revealedAt: Date.now(),
  });
}

function confirmResult(ctx, state) {
  if (!['reveal', 'result'].includes(state.phase)) return;
  if (state.resultConfirmed) return;
  if (state.targetMissing) return;
  if (!state.results.length) return;

  // Testfrage wird bestätigt, aber nicht zur Gesamtwertung addiert.
  // Punkte werden am Ende manuell vergeben – hier zählen nur Entfernungen.
  if (isTestQuestion(state.currentQuestion)) {
    ctx.setGameState({
      ...state,
      phase: 'result',
      resultConfirmed: true,
    });
    return;
  }

  const valid = state.results.filter((row) => row.distanceKm != null);
  if (!valid.length) return;
  const totals = { ...(state.totals || {}) };
  state.results.forEach((row) => {
    if (row.distanceKm == null) return;
    totals[row.playerId] = (totals[row.playerId] || 0) + row.distanceKm;
  });

  ctx.setGameState({
    ...state,
    phase: 'result',
    totals,
    scoredRounds: (state.scoredRounds || 0) + 1,
    resultConfirmed: true,
  });
}

function isTestQuestion(question) {
  return Boolean(question && question.isTestQuestion === true);
}

function buildResults(players, pins, question) {
  const targetMissing = !hasValidTarget(question);
  return players
    .map((player) => {
      const pin = pins[player.id];
      const coords = pinCoordinates(pin, currentMapView(question));
      const noInput = !pin;
      const invalidInput = !!pin && !coords;
      let distanceKm = null;

      if (!targetMissing) {
        if (coords) {
          distanceKm = calculateDistanceKm(coords.lat, coords.lng, question.targetLatitude, question.targetLongitude);
        } else {
          distanceKm = NO_INPUT_PENALTY_KM;
        }
      }

      return {
        playerId: player.id,
        playerName: player.name,
        distanceKm: distanceKm == null ? null : Math.round(distanceKm),
        hasPin: !!pin,
        noInput,
        invalidInput,
        penaltyKm: noInput || invalidInput ? NO_INPUT_PENALTY_KM : 0,
        targetMissing,
      };
    })
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) {
        if (a.hasPin === b.hasPin) return 0;
        return a.hasPin ? -1 : 1;
      }
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

function getWinnerFromResults(results) {
  const valid = results.filter((row) => row.hasPin && row.distanceKm != null && !row.invalidInput);
  if (!valid.length) return { winnerPlayerIds: [], tie: false };
  const bestDistance = valid[0].distanceKm;
  const winners = valid.filter((row) => row.distanceKm === bestDistance).map((row) => row.playerId);
  return {
    winnerPlayerIds: winners,
    tie: winners.length > 1,
  };
}

function playerIdForClient(state, clientId) {
  const client = state.clients && state.clients[clientId];
  return client ? client.playerId : null;
}

function isAdminClient(state, clientId) {
  const client = state.clients && state.clients[clientId];
  return client && client.role === 'admin';
}

function currentMapView(question) {
  return question && (question.mapView || question.mapType) ? question.mapView || question.mapType : 'germany';
}
