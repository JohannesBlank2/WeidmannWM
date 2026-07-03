'use strict';

const RING_COUNT = 4;

module.exports = {
  id: 'dart-ringe',
  mode: 'single',
  category: 'sport',
  title: 'Dartringe',
  responsiblePerson: 'Admin',
  description: 'Spieler werfen sich mit einem Dart von großen zu kleinen Dartringen durch.',
  rules: 'Alle starten am größten gelben Ring. Bei einem Treffer stellt der Admin den Spieler auf den nächsten kleineren Ring. Ring 4 ist das rote Finale.',
  materials: ['Vier Dartringe', 'Dart'],
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

    if (action.type === 'dart-ringe:set-ring') {
      ctx.setGameState(setPlayerRing(state, ctx.state.players, action.playerId, action.ringIndex));
      return;
    }

    if (action.type === 'dart-ringe:advance-player') {
      const current = state.ringPositions[action.playerId] || 1;
      ctx.setGameState(setPlayerRing(state, ctx.state.players, action.playerId, current + 1));
      return;
    }

    if (action.type === 'dart-ringe:reset') {
      ctx.setGameState(defaultGameState(ctx.state.players));
    }
  },
};

function defaultGameState(players = []) {
  return {
    phase: 'playing',
    ringCount: RING_COUNT,
    ringPositions: Object.fromEntries(players.map((player) => [player.id, 1])),
    updatedAt: Date.now(),
  };
}

function ensureGameState(value, players = []) {
  const saved = value && typeof value === 'object' ? value : {};
  const positions = saved.ringPositions && typeof saved.ringPositions === 'object'
    ? saved.ringPositions
    : {};

  return {
    phase: 'playing',
    ringCount: RING_COUNT,
    ringPositions: Object.fromEntries(players.map((player) => [
      player.id,
      normalizeRing(positions[player.id]),
    ])),
    updatedAt: Number(saved.updatedAt) || Date.now(),
  };
}

function setPlayerRing(state, players, playerId, ringIndex) {
  if (!players.some((player) => player.id === playerId)) return state;
  return {
    ...state,
    ringPositions: {
      ...state.ringPositions,
      [playerId]: normalizeRing(ringIndex),
    },
    updatedAt: Date.now(),
  };
}

function normalizeRing(value) {
  const number = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(RING_COUNT, number));
}

function isAdminClient(state, clientId) {
  const clientState = state.clients && state.clients[clientId];
  return clientState && clientState.role === 'admin';
}
