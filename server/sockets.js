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

    // ---- Pick-Ablauf (auswaehlendes Team auf seinem iPad) ------------------
    // Nur das in der aktuellen Runde auswaehlende Team darf waehlen (Server prueft).
    socket.on('pick:kategorie', ({ kategorie } = {}) => {
      if (!clientId) return;
      gameState.chooseKategorie(gameState.teamOfClient(clientId), kategorie);
    });

    socket.on('pick:spiel', ({ gameId } = {}) => {
      if (!clientId) return;
      // einzeln -> Spielerauswahl (false), gemeinsam -> Start sofort (true).
      const started = gameState.chooseSpiel(gameState.teamOfClient(clientId), gameId);
      if (started) runActiveGameHook('onStart');
    });

    // Spielerauswahl (nur Einzelspiele): jedes Team waehlt seinen Spieler.
    socket.on('pick:spieler', ({ playerIndex } = {}) => {
      if (!clientId) return;
      gameState.selectPlayer(gameState.teamOfClient(clientId), playerIndex);
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

    socket.on('admin:rename-player', ({ teamId, playerIndex, name } = {}) =>
      gameState.renamePlayer(teamId, playerIndex, name));

    // Gesamtpunkte (persistent) — bewusst nur +1 / -1.
    socket.on('admin:points', ({ teamId, delta } = {}) =>
      gameState.addPoints(teamId, delta));

    socket.on('admin:set-points', ({ teamId, value } = {}) =>
      gameState.setPoints(teamId, value));

    // Spielpunkte (temporaer, getrennt von der Gesamtpunktzahl).
    socket.on('admin:game-points', ({ teamId, delta } = {}) =>
      gameState.addGamePoints(teamId, delta));

    socket.on('admin:reset-game-points', () => gameState.resetGameScores());

    // ---- Admin: Runden-/Pick-Ablauf ----------------------------------------
    socket.on('admin:show-start', () => gameState.startShow());
    socket.on('admin:open-kategorie', () => gameState.openKategorieAuswahl());
    socket.on('admin:next-round', () => gameState.nextRound());
    socket.on('admin:goto-bonus', () => gameState.gotoBonus());
    socket.on('admin:goto-finale', () => gameState.gotoFinale());

    // Admin kann Kategorie/Spiel/Spieler stellvertretend waehlen (Override).
    socket.on('admin:pick-kategorie', ({ kategorie } = {}) =>
      gameState.chooseKategorie(null, kategorie, true));

    socket.on('admin:pick-spiel', ({ gameId } = {}) => {
      if (gameState.chooseSpiel(null, gameId, true)) runActiveGameHook('onStart');
    });

    socket.on('admin:pick-spieler', ({ teamId, playerIndex } = {}) =>
      gameState.selectPlayer(teamId, playerIndex));

    // Nach der Spielerauswahl: Einzelspiel starten (Zaehler hochzaehlen).
    socket.on('admin:start-selected-game', () => {
      if (gameState.startSelectedGame()) runActiveGameHook('onStart');
    });

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

    // Spiel direkt starten (Override/Test, ausserhalb des Pick-Ablaufs).
    socket.on('admin:start-game', ({ gameId } = {}) => {
      if (gameState.startGame(gameId)) runActiveGameHook('onStart');
    });

    // Spiel beenden -> Auswertung (Spielpunkte bleiben sichtbar).
    socket.on('admin:stop-game', () => {
      runActiveGameHook('onStop');
      gameState.endGame();
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
