'use strict';

const { BUZZER } = require('./state');

/**
 * Verdrahtet alle Socket.IO-Events.
 *
 * Grundprinzip:
 *  - Der komplette State wird per 'state'-Event an ALLE Clients gebroadcastet.
 *    Clients rendern rein aus diesem State (Single Source of Truth).
 *  - Zusaetzlich gibt es schmale "Effekt"-Events (z.B. 'fx:buzzer-winner'),
 *    die Sound/Animation ausloesen, ohne State zu sein.
 *  - Admin-Events mutieren den State. Spiel-spezifische Aktionen werden an das
 *    aktive Spiel-Modul (Registry-Hook onAction) weitergereicht.
 */
function attachSockets(io, gameState, registry) {
  // Broadcast bei jeder State-Aenderung.
  gameState.setOnChange((state) => {
    io.emit('state', state);
  });

  // ctx-Objekt, das Spiel-Module in ihren Hooks bekommen.
  function gameCtx() {
    return {
      state: gameState.get(),
      setGameState: (partial) => gameState.setGameState(partial),
      armBuzzer: () => gameState.armBuzzer(),
      lockBuzzer: () => gameState.lockBuzzer(),
      resetBuzzer: () => gameState.resetBuzzer(),
      addPoints: (teamId, delta) => gameState.addPoints(teamId, delta),
      // Effekt an alle Clients schicken (Sound/Animation), kein State.
      emit: (event, payload) => io.emit(event, payload),
    };
  }

  function runActiveGameHook(hookName, ...args) {
    const active = gameState.get().activeGame;
    if (!active) return;
    const game = registry.get(active.id);
    if (game && game[hookName]) {
      try {
        game[hookName](gameCtx(), ...args);
      } catch (err) {
        console.error(`[game:${active.id}] ${hookName} Fehler:`, err.message);
      }
    }
  }

  io.on('connection', (socket) => {
    let clientId = null;

    // ---- Identifikation / Reconnect ----------------------------------------
    // Client meldet sich mit seiner in localStorage gespeicherten clientId.
    socket.on('identify', ({ clientId: cid, role } = {}) => {
      if (!cid) return;
      clientId = cid;
      socket.data.clientId = cid;

      gameState.upsertClient(cid, {
        role: role || 'play',
        connected: true,
        socketId: socket.id,
      });

      // Aktuellen State direkt an genau diesen Client (auch fuer Reconnect).
      socket.emit('state', gameState.get());
      socket.emit('hello', { clientId: cid, games: registry.list() });
    });

    // ---- Team beitreten -----------------------------------------------------
    socket.on('join-team', ({ teamId } = {}) => {
      if (!clientId) return;
      gameState.joinTeam(clientId, teamId);
    });

    // ---- Buzzer (Spieler) ---------------------------------------------------
    socket.on('buzz', () => {
      if (!clientId) return;
      const press = gameState.registerBuzz(clientId);
      if (!press) return;

      // Gewinner (erster Buzz) -> Effekt fuer Display (Sound + Highlight).
      if (press.order === 1) {
        const team = gameState.get().teams.find((t) => t.id === press.teamId);
        io.emit('fx:buzzer-winner', {
          teamId: press.teamId,
          teamName: team ? team.name : press.teamId,
          color: team ? team.color : '#fff',
        });
      }
      // Aktives Spiel ueber den Buzz informieren (optionaler Hook).
      runActiveGameHook('onAction', { clientId }, { type: 'buzz', press });
    });

    // ---- Generische Spiel-Aktion (Spieler oder Admin) ----------------------
    // Wird an das aktive Spiel-Modul weitergereicht. So koennen Spiele eigene
    // Interaktionen definieren, ohne den Kern zu aendern.
    socket.on('game:action', (action = {}) => {
      if (!clientId) return;
      runActiveGameHook('onAction', { clientId }, action);
    });

    // ---- Admin-Steuerung ----------------------------------------------------
    socket.on('admin:set-phase', ({ phase } = {}) => gameState.setPhase(phase));

    socket.on('admin:rename-team', ({ teamId, name } = {}) =>
      gameState.renameTeam(teamId, name));

    socket.on('admin:points', ({ teamId, delta } = {}) =>
      gameState.addPoints(teamId, delta));

    socket.on('admin:set-points', ({ teamId, value } = {}) =>
      gameState.setPoints(teamId, value));

    socket.on('admin:buzzer', ({ action } = {}) => {
      if (action === 'arm') {
        gameState.armBuzzer();
        io.emit('fx:buzzer-armed');
      } else if (action === 'lock') {
        gameState.lockBuzzer();
      } else if (action === 'reset') {
        gameState.resetBuzzer();
      }
    });

    socket.on('admin:start-game', ({ gameId } = {}) => {
      const meta = registry.meta(gameId);
      if (!meta) return;
      gameState.setActiveGame(meta);
      gameState.setPhase('spiel-aktiv');
      runActiveGameHook('onStart');
    });

    socket.on('admin:stop-game', () => {
      runActiveGameHook('onStop');
      gameState.clearActiveGame();
      gameState.resetBuzzer();
      gameState.setPhase('auswertung');
    });

    socket.on('admin:reset-all', () => {
      gameState.resetAll();
    });

    // ---- Trennung -----------------------------------------------------------
    socket.on('disconnect', () => {
      if (clientId) {
        gameState.setClientConnected(clientId, false);
      }
    });
  });
}

module.exports = { attachSockets };
