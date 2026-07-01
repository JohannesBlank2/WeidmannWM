'use strict';

/**
 * Verdrahtet alle Socket.IO-Events.
 *
 * Der komplette State wird per 'state' an alle Clients gebroadcastet.
 * Admin, Handy und TV rendern daraus ihre jeweilige Sicht. Spielmodule
 * bekommen optionale Hooks über ctx und können weiterhin eigene Aktionen
 * senden, ohne den Kern anfassen zu müssen.
 */
function attachSockets(io, gameState, registry) {
  gameState.setOnChange((state) => {
    broadcastState(state);
  });

  function broadcastState(state) {
    for (const [, socket] of io.sockets.sockets) {
      socket.emit('state', clientState(state, socket.data.clientId, socket.data.role));
    }
  }

  function emitState(socket) {
    socket.emit('state', clientState(gameState.get(), socket.data.clientId, socket.data.role));
  }

  function gameCtx() {
    return {
      state: gameState.get(),
      setGameState: (partial) => gameState.setGameState(partial),
      armBuzzer: () => gameState.armBuzzer(),
      lockBuzzer: () => gameState.lockBuzzer(),
      resetBuzzer: () => gameState.resetBuzzer(),
      addPoints: (playerId, delta) => gameState.addPoints(playerId, delta),
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

  function payloadPlayerId(payload = {}) {
    return payload.playerId || legacyTeamIdToPlayerId(payload.teamId);
  }

  io.on('connection', (socket) => {
    let clientId = null;

    socket.on('identify', ({ clientId: cid, role } = {}) => {
      if (!cid) return;
      clientId = cid;
      socket.data.clientId = cid;
      socket.data.role = role || 'play';

      gameState.upsertClient(cid, {
        role: socket.data.role,
        connected: true,
        socketId: socket.id,
      });

      emitState(socket);
      socket.emit('hello', {
        clientId: cid,
        games: registry.list(),
        featuredGames: gameState.featuredGames(),
      });
    });

    // ---- Spieler beitreten -------------------------------------------------
    socket.on('join-player', ({ playerId } = {}) => {
      if (!clientId) return;
      gameState.joinPlayer(clientId, playerId);
    });

    // Alias für alte Clients während der Migration.
    socket.on('join-team', ({ teamId } = {}) => {
      if (!clientId) return;
      gameState.joinPlayer(clientId, legacyTeamIdToPlayerId(teamId));
    });

    // ---- Handy: Kategorie und Spin -----------------------------------------
    socket.on('pick:kategorie', ({ kategorie } = {}) => {
      if (!clientId) return;
      gameState.chooseKategorie(gameState.playerOfClient(clientId), kategorie);
    });

    socket.on('pick:spin', () => {
      if (!clientId) return;
      gameState.startSpin(gameState.playerOfClient(clientId));
    });

    socket.on('pick:back-to-categories', () => {
      if (!clientId) return;
      gameState.backToKategorieAuswahl(gameState.playerOfClient(clientId));
    });

    socket.on('bet:set', ({ targetPlayerId, amount } = {}) => {
      if (!clientId) return;
      gameState.setBet(gameState.playerOfClient(clientId), targetPlayerId, amount);
    });

    // Start vom Handy bleibt erlaubt, falls man ohne Admin testen will.
    socket.on('pick:start-game', () => {
      if (!clientId) return;
      const started = gameState.startPickedGame(gameState.playerOfClient(clientId));
      if (started) runActiveGameHook('onStart');
    });

    // ---- Buzzer ------------------------------------------------------------
    socket.on('buzz', () => {
      if (!clientId) return;
      const press = gameState.registerBuzz(clientId);
      if (!press) return;

      if (press.order === 1) {
        const player = gameState.get().players.find((p) => p.id === press.playerId);
        io.emit('fx:buzzer-winner', {
          playerId: press.playerId,
          playerName: player ? player.name : press.playerId,
          color: player ? player.color : '#fff',
        });
      }

      runActiveGameHook('onAction', { clientId }, { type: 'buzz', press });
    });

    socket.on('game:action', (action = {}) => {
      if (!clientId) return;
      runActiveGameHook('onAction', { clientId }, action);
    });

    // ---- Admin-Steuerung ---------------------------------------------------
    socket.on('admin:set-phase', ({ phase } = {}) => gameState.setPhase(phase));

    socket.on('admin:rename-player', ({ playerId, teamId, name } = {}) =>
      gameState.renamePlayer(playerId || legacyTeamIdToPlayerId(teamId), name));

    socket.on('admin:rename-team', ({ teamId, name } = {}) =>
      gameState.renamePlayer(legacyTeamIdToPlayerId(teamId), name));

    socket.on('admin:points', (payload = {}) =>
      gameState.addPoints(payloadPlayerId(payload), payload.delta));

    socket.on('admin:set-points', (payload = {}) =>
      gameState.setPoints(payloadPlayerId(payload), payload.value));

    socket.on('admin:game-points', (payload = {}) =>
      gameState.addGamePoints(payloadPlayerId(payload), payload.delta));

    socket.on('admin:reset-game-points', () => gameState.resetGameScores());
    socket.on('admin:set-placement', ({ playerId, place } = {}) =>
      gameState.setPlacement(playerId, place));
    socket.on('admin:clear-placement', ({ playerId } = {}) =>
      gameState.clearPlacement(playerId));
    socket.on('admin:apply-payouts', () => gameState.applyPayouts());

    socket.on('admin:show-lobby', () => {
      runActiveGameHook('onStop');
      gameState.showLobby();
    });

    socket.on('admin:show-start', () => gameState.startShow());
    socket.on('admin:open-kategorie', () => gameState.openKategorieAuswahl());
    socket.on('admin:next-round', () => gameState.nextRound());
    socket.on('admin:goto-finale', () => gameState.gotoFinale());

    socket.on('admin:prepare-featured-game', ({ slot } = {}) => {
      runActiveGameHook('onStop');
      gameState.prepareFeaturedGame(slot);
    });

    socket.on('admin:set-featured-title', ({ slot, title } = {}) =>
      gameState.setFeaturedGameTitle(slot, title));

    socket.on('admin:start-featured-intro', () => gameState.startFeaturedIntro());
    socket.on('admin:finish-featured-intro', () => gameState.finishFeaturedIntro());

    socket.on('admin:pick-kategorie', ({ kategorie } = {}) =>
      gameState.chooseKategorie(null, kategorie, true));

    socket.on('admin:start-spin', () => gameState.startSpin(null, true));
    socket.on('admin:finish-spin', () => gameState.finishSpin());

    socket.on('admin:back-to-categories', () => {
      gameState.backToKategorieAuswahl(null, true);
    });

    socket.on('admin:start-picked-game', () => {
      if (gameState.startPickedGame(null, true)) runActiveGameHook('onStart');
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

    socket.on('admin:start-game', ({ gameId } = {}) => {
      if (gameState.startGame(gameId)) runActiveGameHook('onStart');
    });

    socket.on('admin:stop-game', () => {
      runActiveGameHook('onStop');
      gameState.endGame();
    });

    socket.on('admin:reset-all', () => {
      gameState.resetAll();
    });

    socket.on('disconnect', () => {
      if (clientId) {
        gameState.setClientConnected(clientId, false);
      }
    });
  });
}

function legacyTeamIdToPlayerId(teamId) {
  const match = /^team([1-5])$/.exec(String(teamId || ''));
  return match ? `player${match[1]}` : null;
}

function clientState(state, clientId, role) {
  const out = JSON.parse(JSON.stringify(state));
  const playerId = state.clients && state.clients[clientId]
    ? state.clients[clientId].playerId
    : null;
  const bets = (state.round && state.round.bets) || {};
  const revealBets =
    role === 'admin' &&
    (state.phase === 'auswertung' || state.phase === 'finale' || state.round.payoutApplied);

  out.round.bets = {};
  out.round.betStatus = state.players.map((player) => {
    const bet = bets[player.id] || null;
    const submitted = !!bet;
    if (revealBets) {
      out.round.bets[player.id] = bet;
    } else if (player.id === playerId && bet) {
      out.round.bets[player.id] = bet;
    } else {
      out.round.bets[player.id] = { playerId: player.id, submitted };
    }
    return { playerId: player.id, submitted };
  });
  out.round.betCount = out.round.betStatus.filter((entry) => entry.submitted).length;
  out.round.betTotal = state.players.length;
  return out;
}

module.exports = { attachSockets };
