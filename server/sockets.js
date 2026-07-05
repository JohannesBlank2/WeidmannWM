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
      addGamePoints: (playerId, delta) => gameState.addGamePoints(playerId, delta),
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

  function visibleAdminGames() {
    const featured = gameState.featuredGames();
    const allGames = registry.list();
    const byId = new Map(allGames.map((game) => [game.id, game]));
    const visible = featured
      .map((entry) => {
        const game = byId.get(entry.gameId);
        return game ? { ...game, name: entry.title, title: entry.title } : null;
      })
      .filter(Boolean);
    return visible.length ? visible : allGames;
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
        games: visibleAdminGames(),
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

    // Handy setzt nur noch den Tipp-Spieler. Der physische Einsatz wird IRL mit
    // Chips gelegt und in der Admin-Konsole als Betrag nachgetragen.
    socket.on('bet:set', ({ targetPlayerId } = {}) => {
      if (!clientId) return;
      setBetTarget(gameState, gameState.playerOfClient(clientId), targetPlayerId);
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

    socket.on('crash:cashout', () => {
      if (!clientId) return;
      gameState.cashOutCrash(gameState.playerOfClient(clientId));
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

    socket.on('admin:set-game-points', (payload = {}) =>
      gameState.setGamePoints(payloadPlayerId(payload), payload.value));

    socket.on('admin:reset-game-points', () => gameState.resetGameScores());

    socket.on('admin:ambient-music', (patch = {}) => {
      if (socket.data.role !== 'admin') return;
      gameState.setAmbientMusic(patch);
    });

    // Winner-Sound: Admin steuert, das Display spielt ab.
    socket.on('admin:winner-sound', ({ playing } = {}) => {
      if (socket.data.role !== 'admin') return;
      io.emit('fx:winner-sound', { playing: !!playing });
    });
    socket.on('display:winner-sound-ended', () => {
      io.emit('fx:winner-sound', { playing: false });
    });

    socket.on('admin:set-placement', ({ playerId, place } = {}) =>
      gameState.setPlacement(playerId, place));
    socket.on('admin:clear-placement', ({ playerId } = {}) =>
      gameState.clearPlacement(playerId));
    socket.on('admin:apply-payouts', () => gameState.applyPayouts());
    socket.on('admin:set-bets-revealed', ({ revealed } = {}) =>
      gameState.setBetsRevealed(revealed));
    socket.on('admin:set-bet-amount', ({ playerId, amount } = {}) => {
      if (socket.data.role !== 'admin') return;
      setBetAmount(gameState, playerId, amount);
    });
    socket.on('admin:set-bet-winner', ({ playerId } = {}) => {
      if (socket.data.role !== 'admin') return;
      setBetWinner(gameState, playerId);
    });
    socket.on('admin:apply-bet-payouts', () => {
      if (socket.data.role !== 'admin') return;
      applyBetPayouts(gameState);
    });

    socket.on('admin:crash-prepare', ({ stakes } = {}) => {
      if (socket.data.role !== 'admin') return;
      gameState.prepareCrashGame(stakes);
    });

    socket.on('admin:crash-set-stake', ({ playerId, amount } = {}) => {
      if (socket.data.role !== 'admin') return;
      gameState.setCrashStake(playerId, amount);
    });

    socket.on('admin:crash-set-settings', (settings = {}) => {
      if (socket.data.role !== 'admin') return;
      gameState.setCrashSettings(settings);
    });

    socket.on('admin:crash-start', () => {
      if (socket.data.role !== 'admin') return;
      gameState.startCrashGame();
    });

    socket.on('admin:crash-reset', () => {
      if (socket.data.role !== 'admin') return;
      gameState.resetCrashGame();
    });

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

function setBetTarget(gameState, playerId, targetPlayerId) {
  const state = gameState.get();
  if (state.phase !== 'wetten') return false;
  const player = state.players.find((entry) => entry.id === playerId);
  const target = state.players.find((entry) => entry.id === targetPlayerId);
  // Selbstwetten sind erlaubt: Wer von sich überzeugt ist, darf auf den eigenen Sieg setzen.
  if (!player || !target) return false;

  const existing = state.round.bets[player.id] || {};
  const amount = clampInt(existing.amount, 0, betMaxForPlayer(player));
  state.round.bets[player.id] = {
    playerId: player.id,
    targetPlayerId: target.id,
    amount,
    submittedAt: Date.now(),
    amountSetByAdminAt: existing.amountSetByAdminAt || null,
  };
  gameState.touch();
  return true;
}

function setBetAmount(gameState, playerId, amount) {
  const state = gameState.get();
  if (!['wetten', 'auswertung'].includes(state.phase)) return false;
  if (state.round.payoutApplied) return false;
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return false;

  const existing = state.round.bets[player.id] || {
    playerId: player.id,
    targetPlayerId: null,
    submittedAt: 0,
  };
  const parsedAmount = clampInt(amount, 0, betMaxForPlayer(player));

  // Ohne Handy-Tipp gibt es keinen Zielspieler. Positive Einsätze ohne Ziel
  // würden später als verlorene Wette zählen; deshalb ignorieren wir sie.
  if (parsedAmount > 0 && !existing.targetPlayerId) return false;

  state.round.bets[player.id] = {
    ...existing,
    playerId: player.id,
    amount: parsedAmount,
    submittedAt: existing.submittedAt || Date.now(),
    amountSetByAdminAt: Date.now(),
  };
  gameState.touch();
  return true;
}

function setBetWinner(gameState, playerId) {
  const state = gameState.get();
  if (!['auswertung', 'spiel-aktiv', 'wetten'].includes(state.phase)) return false;
  if (state.round.payoutApplied) return false;
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return false;

  state.round.betWinnerPlayerId = player.id;
  gameState.touch();
  return true;
}

function applyBetPayouts(gameState) {
  const state = gameState.get();
  if (state.phase !== 'auswertung') return false;
  if (state.round.payoutApplied) return false;

  const winner = state.players.find((player) => player.id === state.round.betWinnerPlayerId);
  if (!winner) return false;

  const byId = Object.fromEntries(state.players.map((player) => [player.id, player]));
  const summary = state.players.map((player) => {
    const rawBet = state.round.bets[player.id] || {};
    const amount = clampInt(rawBet.amount, 0, betMaxForPlayer(player));
    const targetPlayerId = rawBet.targetPlayerId || null;
    const betWon = amount > 0 && targetPlayerId === winner.id;
    const payoutReturn = betWon ? amount * 2 : 0;
    // Der Einsatz liegt IRL bereits im Pot. Für den digitalen Gesamtstand ist
    // korrekt = Einsatz zurück + Gewinn => netto +Einsatz; falsch = Einsatz weg => netto -Einsatz.
    const betDelta = amount > 0 ? (betWon ? amount : -amount) : 0;

    player.score += betDelta;

    return {
      playerId: player.id,
      playerName: player.name,
      place: player.id === winner.id ? 1 : null,
      award: 0,
      betTargetPlayerId: targetPlayerId,
      betTargetName: targetPlayerId && byId[targetPlayerId] ? byId[targetPlayerId].name : null,
      betWinnerPlayerId: winner.id,
      betWinnerName: winner.name,
      betAmount: amount,
      betWon,
      payoutReturn,
      betDelta,
      totalDelta: betDelta,
      finalScore: player.score,
    };
  });

  state.round.payoutApplied = true;
  state.round.payoutSummary = summary;
  gameState.touch();
  return true;
}

function betMaxForPlayer(player) {
  return Math.min(50, Math.max(0, Number(player.score) || 0));
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
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
  const betsRevealed = state.round && state.round.betsRevealed === true;
  const revealBets =
    (role === 'display' && betsRevealed) ||
    (role === 'admin' &&
      (state.phase === 'wetten' ||
        betsRevealed ||
        state.phase === 'auswertung' ||
        state.phase === 'finale' ||
        state.round.payoutApplied));

  out.round.bets = {};
  out.round.betStatus = state.players.map((player) => {
    const bet = bets[player.id] || null;
    const submitted = !!bet;
    if (revealBets) {
      out.round.bets[player.id] = visibleBetForRole(bet, player.id, role);
    } else if (player.id === playerId && bet) {
      out.round.bets[player.id] = bet;
    } else {
      out.round.bets[player.id] = { playerId: player.id, submitted };
    }
    return { playerId: player.id, submitted };
  });
  out.round.betCount = out.round.betStatus.filter((entry) => entry.submitted).length;
  out.round.betTotal = state.players.length;

  if (out.crashGame) {
    const crashPhase = out.crashGame.phase;
    if (!['crashed', 'finished'].includes(crashPhase)) {
      out.crashGame.crashPoint = null;
    }

    if (role === 'play') {
      out.crashGame.players = playerId && out.crashGame.players && out.crashGame.players[playerId]
        ? { [playerId]: out.crashGame.players[playerId] }
        : {};
    }
  }

  return out;
}

function visibleBetForRole(bet, playerId, role) {
  const normalized = bet || {
    playerId,
    targetPlayerId: null,
    amount: 0,
    submittedAt: 0,
  };

  if (role === 'display') {
    return {
      playerId: normalized.playerId || playerId,
      amount: Number(normalized.amount) || 0,
      submitted: !!bet,
    };
  }

  return normalized;
}

module.exports = { attachSockets };
