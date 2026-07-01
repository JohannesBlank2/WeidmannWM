/* TV-Ansicht: Wertung, Rundenstatus, Kategorie-Spin und Spielcontent. */
(function () {
  const phaseEl = document.getElementById('phase');
  const scoreboardEl = document.getElementById('scoreboard');
  const boardLabelEl = document.getElementById('board-label');
  const contentEl = document.getElementById('content');
  const winnerEl = document.getElementById('winner');
  const joinQrEl = document.getElementById('join-qr');

  document.getElementById('qr-play').src =
    '/qr?data=' + encodeURIComponent(location.origin + '/play/');

  const ctx = {
    socket: App.socket,
    clientId: App.clientId,
    role: 'display',
    view: 'display',
    sendAction: (a) => App.socket.emit('game:action', a),
  };
  const host = window.createGameHost(contentEl, ctx);
  const ROULETTE_OPTION_LABELS = [
    'Ballon transportieren',
    'Blinder Eierlauf',
    'Bottleflip',
    'Cornhole',
    'Dart Ringe',
    'How much is the fish',
    'Emoji Filmquiz',
    '2016?',
    'Ferngesteuerte Scharade',
    'Fußballbowling',
    'Labyrinth',
    'Shazam',
    'Papierflieger',
    'Partner Zielwurf',
    'Halbe Sache',
    'Video (Hanni vs. Richi)',
    'Wer bin ich',
    'Wo liegt was',
  ];

  const ROULETTE_SHORT_LABELS = {
    'Ballon transportieren': 'Ballon',
    'Blinder Eierlauf': 'Eierlauf',
    Bottleflip: 'Bottle',
    'Dart Ringe': 'Dart',
    'How much is the fish': 'Fish',
    'Emoji Filmquiz': 'Emoji',
    'Ferngesteuerte Scharade': 'Scharade',
    Fußballbowling: 'Bowling',
    Labyrinth: 'Labyr.',
    Papierflieger: 'Flieger',
    'Partner Zielwurf': 'Zielwurf',
    'Halbe Sache': 'Halbe',
    'Video (Hanni vs. Richi)': 'Video',
    'Wer bin ich': 'Wer bin?',
    'Wo liegt was': 'Wo?',
  };

  function renderScoreboard(state) {
    const inGame = !!state.activeGame;

    if (inGame) {
      boardLabelEl.textContent = `Platzpunkte - ${state.activeGame.title || state.activeGame.name}`;
      const max = Math.max(0, ...state.players.map((p) => p.gameScore));
      scoreboardEl.innerHTML = state.players
        .map((p) => {
          const leader = p.gameScore > 0 && p.gameScore === max;
          return `
        <div class="score-team ${leader ? 'leader' : ''}" style="--tc:${p.color}">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="score">${p.gameScore}</div>
          <div class="rank">${leader ? 'vorn' : '&nbsp;'}</div>
        </div>`;
        })
        .join('');
      return;
    }

    boardLabelEl.textContent = 'Coin-Wertung';
    const ranked = [...state.players].sort((a, b) => b.score - a.score);
    scoreboardEl.innerHTML = ranked
      .map((p, i) => {
        const samePrev = i > 0 && ranked[i - 1].score === p.score;
        const shownPlace = samePrev ? rankOf(ranked, p.score) : i + 1;
        const leader = shownPlace === 1;
        return `
        <div class="score-team ${leader ? 'leader' : ''}" style="--tc:${p.color}">
          <div class="rank">${shownPlace}.</div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="score">${p.score}</div>
        </div>`;
      })
      .join('');
  }

  function rankOf(ranked, score) {
    return ranked.findIndex((p) => p.score === score) + 1;
  }

  function renderStage(state) {
    joinQrEl.style.display = 'none';

    const r = state.round || {};
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);
    const pickerHtml = picker
      ? `<span style="color:${picker.color}">${escapeHtml(picker.name)}</span>`
      : '-';

    if (state.phase === 'lobby') {
      contentEl.innerHTML = tableScene(state, {
        eyebrow: 'WEIDMANN WM Poker Edition',
        title: 'Lobby',
        status: 'Spieler treten per Handy bei',
      });
    } else if (state.phase === 'runden-uebersicht') {
      contentEl.innerHTML = tableScene(state, {
        eyebrow: 'Nächstes Spiel',
        title: `Runde ${r.number}`,
        status: `${stripTags(pickerHtml)} wählt die Kategorie`,
      });
    } else if (state.phase === 'kategorie-auswahl') {
      const cats = (r.availableCategories || []).map(categoryLabel).join(' &nbsp; ');
      contentEl.innerHTML = idle(
        'Kategorie-Auswahl',
        `${pickerHtml} ist dran<br><span class="muted">${cats}</span>`
      );
    } else if (state.phase === 'spin-bereit') {
      contentEl.innerHTML = renderSpin(state, false);
    } else if (state.phase === 'spin-laeuft') {
      contentEl.innerHTML = renderSpin(state, true);
    } else if (state.phase === 'spiel-intro') {
      contentEl.innerHTML = introStage(state);
    } else if (state.phase === 'spiel-details') {
      contentEl.innerHTML = gameDetails(r.selectedGame, 'Jackpot. Dieses Spiel wurde ausgelost.', r.choices || []);
    } else if (state.phase === 'wetten') {
      contentEl.innerHTML = bettingStage(state);
    } else if (state.phase === 'auswertung') {
      contentEl.innerHTML = payoutStage(state);
    } else if (state.phase === 'finale') {
      contentEl.innerHTML = finale(state);
    } else {
      contentEl.innerHTML = tableScene(state, {
        eyebrow: 'WEIDMANN WM Poker Edition',
        title: 'Lobby',
        status: 'Spieler treten per Handy bei',
      });
    }
  }

  function tableScene(state, copy) {
    const connected = connectedPlayerIds(state);
    return `
      <div class="table-scene">
        <div class="table-title">
          <div class="table-brand">♠ ${escapeHtml(copy.eyebrow)} ♠</div>
        </div>
        <div class="poker-table">
          <div class="table-center">
            <div class="table-kicker">EM Runde</div>
            <div class="table-main">${escapeHtml(copy.title)}</div>
            <div class="table-status">
              <span class="status-dot"></span>${escapeHtml(copy.status)}
            </div>
          </div>
        </div>
        ${state.players.map((player, index) => playerSeat(player, index, connected.has(player.id))).join('')}
      </div>`;
  }

  function playerSeat(player, index, connected) {
    return `
      <div class="table-seat seat-${index}">
        <div class="seat-avatar ${connected ? 'connected' : ''}" style="--pc:${player.color}">
          ${player.avatar
            ? `<img src="${escapeHtml(player.avatar)}" alt="${escapeHtml(player.name)}" />`
            : initials(player.name)}
        </div>
        <div class="seat-name">${escapeHtml(player.name)}</div>
        <div class="coin-pill"><span></span>${formatCoins(player.score)}</div>
      </div>`;
  }

  function connectedPlayerIds(state) {
    return new Set(
      Object.values(state.clients || {})
        .filter((client) => client.connected && client.playerId)
        .map((client) => client.playerId)
    );
  }

  function renderSpin(state, spinning) {
    const r = state.round || {};
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);
    const choices = r.choices || [];
    const winner = gameById(choices, r.spin && r.spin.winnerGameId);
    const duration = (r.spin && r.spin.durationMs) || 4600;
    const status = spinning
      ? 'Die Walzen laufen ...'
      : `${picker ? escapeHtml(picker.name) : 'Der Spieler'} drückt gleich auf Spin`;
    const reels = [0, 1, 2].map((reelIndex) =>
      reelHtml(choices, winner, reelIndex, spinning, duration)
    ).join('');

    return `
      <div class="slot-wrap">
        <div class="choices-title">${categoryLabel(r.category)} - ${status}</div>
        <div class="slot-machine">
          <div class="reels">
            ${reels}
          </div>
          ${nearMissRow(choices, winner)}
        </div>
      </div>`;
  }

  function reelHtml(choices, winner, reelIndex, spinning, duration) {
    const sequence = spinning
      ? buildReelSequence(choices, winner, reelIndex)
      : [choices[reelIndex % Math.max(choices.length, 1)]].filter(Boolean);
    const shift = Math.max(0, sequence.length - 1) * 148;
    const reelDuration = Math.max(1200, duration - 360 + reelIndex * 120);

    return `
      <div class="reel-window">
        <div class="reel-track ${spinning ? 'spinning' : ''}"
             style="--spin-duration:${reelDuration}ms; --reel-shift:${shift}px">
          ${sequence.map((game) => slotCard(game)).join('')}
        </div>
      </div>`;
  }

  function buildReelSequence(choices, winner, reelIndex) {
    if (!choices.length) return [];
    const finalGame = winner || choices[reelIndex % choices.length];
    const decoys = choices.filter((choice) => choice.gameId !== finalGame.gameId);
    const sequence = [];
    const loops = 7 + reelIndex;

    for (let loop = 0; loop < loops; loop += 1) {
      for (let i = 0; i < choices.length; i += 1) {
        sequence.push(choices[(i + reelIndex + loop) % choices.length]);
      }
    }

    if (decoys.length) {
      sequence.push(decoys[reelIndex % decoys.length]);
      sequence.push(decoys[(reelIndex + 1) % decoys.length]);
    }

    sequence.push({ ...finalGame, winner: true });
    return sequence;
  }

  function slotCard(game) {
    if (!game) return '';
    return `
      <div class="slot-card ${game.winner ? 'winner-card' : ''}">
        <div class="cn">${escapeHtml(game.title || game.name)}</div>
        <div class="cm">${categoryLabel(game.category)}</div>
      </div>`;
  }

  function nearMissRow(choices, winner) {
    if (!choices.length) return '';
    const otherGames = choices.filter((choice) => !winner || choice.gameId !== winner.gameId);
    const visible = fillToThree(otherGames.length ? otherGames : choices);
    return `
      <div class="near-miss-row">
        ${visible.map((game) => `<div class="near-miss-card">${escapeHtml(game.title || game.name)}</div>`).join('')}
      </div>`;
  }

  function slotResult(game, choices) {
    if (!game) return '';
    const winner = { ...game, winner: true };
    return `
      <div class="slot-result">
        <div class="slot-machine">
          <div class="reels">
            ${[0, 1, 2].map(() => `
              <div class="reel-window">
                <div class="reel-track">${slotCard(winner)}</div>
              </div>`).join('')}
          </div>
          ${nearMissRow(choices, winner)}
        </div>
      </div>`;
  }

  function fillToThree(items) {
    if (!items.length) return [];
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      out.push(items[i % items.length]);
    }
    return out;
  }

  function gameById(choices, gameId) {
    return choices.find((choice) => choice.gameId === gameId || choice.id === gameId) || null;
  }

  function introStage(state) {
    const round = state.round || {};
    const intro = round.intro || {};
    if (intro.status === 'ready') {
      return introPreview(round);
    }
    if (intro.animation === 'slot') {
      return banditMachine(round.selectedGame, round.choices || [], true, intro.durationMs || 6200, round.number);
    }
    if (intro.animation === 'roulette') {
      return rouletteReveal(round.selectedGame, round.choices || [], true, intro.durationMs || 4600, round.number);
    }
    if (intro.animation === 'cards') {
      return cornholeCardsReveal(round.selectedGame, round.choices || [], true, intro.durationMs || 4300, round.number);
    }
    if (intro.animation === 'wheel') {
      return wheelReveal(round.selectedGame, round.choices || [], true, intro.durationMs || 5200, round.number);
    }
    if (isScratchIntro(round)) {
      return scratchTicketReveal(round.selectedGame, round.choices || [], true, intro.durationMs || 5600, round.number);
    }
    return revealIntro(round);
  }

  /**
   * "Anzeigen"-Schritt: friert den ersten Frame der jeweiligen Animation ein,
   * statt eines leeren Textscreens - ohne das eigentliche Spiel zu verraten.
   */
  function introPreview(round) {
    const intro = round.intro || {};
    const game = round.selectedGame;
    if (intro.animation === 'slot') {
      return banditMachine(game, round.choices || [], false, 0, round.number, true);
    }
    if (intro.animation === 'roulette') {
      return rouletteReveal(null, round.choices || [], false, 0, round.number, true);
    }
    if (intro.animation === 'cards') {
      return cornholeCardsReveal(game, [], false, 0, round.number, true);
    }
    if (intro.animation === 'wheel') {
      return wheelReveal(null, round.choices || [], false, 0, round.number, true);
    }
    if (isScratchIntro(round)) {
      return scratchTicketReveal(game, round.choices || [], false, 0, round.number, true);
    }
    return revealPreview(round);
  }

  function introResult(game, choices, round) {
    if (round && round.intro && round.intro.animation === 'slot') {
      return banditMachine(game, choices, false, 0, round.number);
    }
    if (round && round.intro && round.intro.animation === 'roulette') {
      return rouletteReveal(game, choices, false, 0, round.number);
    }
    if (round && round.intro && round.intro.animation === 'cards') {
      return cornholeCardsReveal(game, [], false, 0, round.number);
    }
    if (round && round.intro && round.intro.animation === 'wheel') {
      return wheelReveal(game, choices, false, 0, round.number);
    }
    if (isScratchIntro(round)) {
      return scratchTicketReveal(game, choices, false, 0, round.number);
    }
    return slotResult(game, choices);
  }

  function cornholeCardsReveal(game, choices, spinning, duration, slotNumber, preview = false) {
    if (!game) return idle('Spielauswahl', 'Kein Spiel vorbereitet.');
    const title = game.title || game.name || 'Cornhole';
    const resolvedDuration = Math.max(1200, Number(duration) || 4300);
    const state = preview ? 'idle' : spinning ? 'dealing' : 'complete';
    const subtitle = preview ? 'Bereit' : slotNumber ? `Spiel ${slotNumber}` : 'Nächstes Spiel';
    const style = `--card-duration:${resolvedDuration}ms; --card-result-delay:${Math.max(0, resolvedDuration - 460)}ms`;
    const cardMode = preview ? 'empty' : spinning ? 'animate' : 'shown';
    const cards = [0, 1].map((index) => cornholeCardSlot(title, index, cardMode)).join('');

    return `
      <div class="cornhole-reveal ${state}" style="${style}">
        <div class="cornhole-copy">
          <div class="cornhole-kicker">Poker Draw</div>
          <div class="cornhole-sub">${escapeHtml(subtitle)}</div>
        </div>
        <div class="cornhole-table">
          <div class="cornhole-slots">${cards}</div>
        </div>
        ${preview ? '' : `
        <div class="cornhole-result">
          <div>Nächstes Spiel</div>
          <b>${escapeHtml(title)}</b>
        </div>`}
      </div>`;
  }

  /**
   * Ambient Marquee mit anderen Spieletiteln, damit die Auslosung zufällig
   * wirkt, obwohl das Zielspiel serverseitig fix vorgegeben ist. `fadeDelayMs`
   * blendet den Ticker kurz vor dem eigentlichen Reveal aus.
   */
  function decoyTicker(choices, targetGame, options = {}) {
    const targetId = targetGame && (targetGame.gameId || targetGame.id);
    const names = (choices || [])
      .filter((c) => (c.gameId || c.id) !== targetId)
      .map((c) => c.title || c.name)
      .filter(Boolean);
    if (!names.length) return '';
    const shuffled = shuffleArray(names);
    const loop = shuffled.length < 6 ? [...shuffled, ...shuffled, ...shuffled] : shuffled;
    const track = [...loop, ...loop];
    const style = options.fadeDelayMs != null
      ? `--ticker-fade-delay:${Math.max(0, options.fadeDelayMs)}ms`
      : '';
    return `
      <div class="decoy-ticker${options.static ? ' static' : ''}" style="${style}">
        <div class="decoy-ticker-label">${escapeHtml(options.label || 'Im Lostopf')}</div>
        <div class="decoy-ticker-track${options.static ? ' static' : ''}">
          ${track.map((name) => `<span>${escapeHtml(name)}</span>`).join('')}
        </div>
      </div>`;
  }

  function shuffleArray(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function cornholeCardSlot(title, index, mode) {
    if (mode === 'empty') {
      return `
      <div class="cornhole-slot">
        <div class="cornhole-slot-label">Slot ${index + 1}</div>
      </div>`;
    }
    return `
      <div class="cornhole-slot">
        <div class="cornhole-slot-label">Slot ${index + 1}</div>
        <div class="cornhole-card ${mode === 'animate' ? 'animate' : mode === 'shown' ? 'shown' : ''}" style="--card-index:${index}">
          <div class="cornhole-card-inner">
            <div class="cornhole-card-face back">
              <div class="cornhole-card-pattern">W</div>
            </div>
            <div class="cornhole-card-face front">
              <div class="cornhole-card-corner">W</div>
              <div class="cornhole-card-title">${escapeHtml(title)}</div>
              <div class="cornhole-card-suit">&spades;</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function banditMachine(game, choices, spinning, duration, slotNumber, frozen = false) {
    if (!game) return idle('Spielauswahl', 'Kein Spiel vorbereitet.');
    const reels = [0, 1, 2]
      .map((reelIndex) => banditReel(game, choices, reelIndex, spinning, duration, frozen))
      .join('');
    const lights = Array.from({ length: 13 }, (_, i) => `<span style="--i:${i}"></span>`).join('');
    const subtitle = slotNumber ? `Spiel ${slotNumber}` : 'Show-Spiel';
    const machineMode = frozen ? 'intro-mode' : spinning ? 'pulling intro-mode' : 'settled result-mode';
    const isRevealing = spinning && !frozen;
    const prizeLabel = frozen ? 'Bereit ...' : game.title || game.name;
    // Der Preis darf erst auftauchen, wenn auch die letzte (langsamste) Walze
    // wirklich gelandet ist - sonst verrät die Anzeige das Ergebnis, bevor
    // die Walzen überhaupt stehen.
    const lastReelDuration = Math.max(1400, (duration || 0) - 420 + 2 * 180);
    const prizeStyle = `--prize-reveal-delay:${Math.max(0, lastReelDuration - 100)}ms`;

    return `
      <div class="bandit-wrap">
        <div class="bandit-machine ${machineMode}">
          <div class="bandit-dome">
            <div class="bandit-stars">★ ★ ★</div>
            <div class="bandit-sign">WEIDMANN WM Poker Edition</div>
          </div>
          <div class="bandit-lights">${lights}</div>
          <div class="bandit-face">
            <div class="bandit-reels">${reels}</div>
          </div>
          <div class="bandit-console">
            <div class="bandit-button red"></div>
            <div class="bandit-button"></div>
            <div class="bandit-button"></div>
            <div class="bandit-plaque">${escapeHtml(subtitle)}</div>
          </div>
          <div class="bandit-base">
            <div class="bandit-prize ${isRevealing ? 'pending' : ''}" style="${isRevealing ? prizeStyle : ''}">${escapeHtml(prizeLabel)}</div>
          </div>
          <div class="bandit-lever">
            <div class="lever-stick"></div>
            <div class="lever-knob"></div>
          </div>
        </div>
      </div>`;
  }

  function banditReel(winner, choices, reelIndex, spinning, duration, frozen = false) {
    const buildFullSequence = spinning || frozen;
    const sequence = buildFullSequence
      ? buildBanditSequence(choices, winner, reelIndex)
      : [{ ...winner, winner: true }];
    const steps = Math.max(0, sequence.length - 1);
    const reelDuration = Math.max(1400, duration - 420 + reelIndex * 180);
    const isAnimating = spinning && !frozen;

    return `
      <div class="bandit-reel-window">
        <div class="bandit-reel-track ${isAnimating ? 'spinning' : ''}"
             style="--spin-duration:${reelDuration}ms; --reel-steps:${steps}">
          ${sequence.map((item) => banditCard(item)).join('')}
        </div>
      </div>`;
  }

  function buildBanditSequence(choices, winner, reelIndex) {
    const pool = (choices && choices.length ? choices : [winner]).filter(Boolean);
    const target = winner || pool[0];
    const decoys = pool.filter((choice) => (choice.gameId || choice.id) !== (target.gameId || target.id));
    const sequence = [];
    const loops = 6 + reelIndex;

    for (let loop = 0; loop < loops; loop += 1) {
      for (let i = 0; i < pool.length; i += 1) {
        sequence.push(pool[(i + loop + reelIndex) % pool.length]);
      }
    }

    if (decoys.length) {
      sequence.push(decoys[reelIndex % decoys.length]);
      sequence.push(decoys[(reelIndex + 1) % decoys.length]);
    }

    sequence.push({ ...target, winner: true });
    return sequence;
  }

  function banditCard(game) {
    if (!game) return '';
    return `
      <div class="bandit-symbol ${game.winner ? 'winner' : ''}">
        <span>${escapeHtml(game.title || game.name)}</span>
      </div>`;
  }

  function revealPreview(round) {
    const game = round.selectedGame;
    const ticker = decoyTicker(round.choices, game, {
      label: 'Wer ist als nächstes dran ...',
      static: true,
    });
    return `
      <div class="intro-reveal">
        <div class="intro-kicker">Spiel ${round.number || '-'}</div>
        ${ticker}
      </div>`;
  }

  function revealIntro(round) {
    const game = round.selectedGame;
    if (!game) return idle('Show-Spiel', 'Kein Spiel vorbereitet.');
    const duration = Math.max(900, Number(round.intro && round.intro.durationMs) || 2200);
    const revealDelay = Math.max(300, duration - 900);
    const ticker = decoyTicker(round.choices, game, {
      label: 'Wer ist als nächstes dran ...',
      fadeDelayMs: revealDelay,
    });
    return `
      <div class="intro-reveal" style="--reveal-delay:${revealDelay}ms">
        <div class="intro-kicker">Spiel ${round.number || '-'}</div>
        ${ticker}
        <div class="intro-title pending">${escapeHtml(game.title || game.name)}</div>
        <div class="intro-meta pending">${categoryLabel(game.category)}</div>
      </div>`;
  }

  function isScratchIntro(round) {
    const intro = round && round.intro;
    const game = round && round.selectedGame;
    const gameId = game && (game.gameId || game.id);
    return !!intro && (
      intro.animation === 'scratch' ||
      (intro.animation === 'reveal' && gameId === 'einkauf-schaetzen')
    );
  }

  function scratchTicketReveal(game, choices, scratching, duration, slotNumber, preview = false) {
    if (!game) return idle('Show-Spiel', 'Kein Spiel vorbereitet.');
    const title = game.title || game.name || 'Nächstes Spiel';
    const resolvedDuration = Math.max(1800, Number(duration) || 5600);
    const state = preview ? 'idle' : scratching ? 'scratching' : 'complete';
    const subtitle = preview ? 'Bereit' : slotNumber ? `Spiel ${slotNumber}` : 'Nächstes Spiel';
    const titleDelay = Math.max(0, resolvedDuration - 760);
    const promptDelay = Math.max(300, Math.round(resolvedDuration * 0.18));
    const style =
      `--scratch-duration:${resolvedDuration}ms; ` +
      `--scratch-title-delay:${titleDelay}ms; ` +
      `--scratch-prompt-delay:${promptDelay}ms`;

    return `
      <div class="scratch-reveal ${state}" style="${style}">
        <div class="scratch-copy">
          <div class="scratch-copy-kicker">Rubbelkarte</div>
          <div class="scratch-copy-sub">${escapeHtml(subtitle)}</div>
        </div>
        <div class="scratch-card-wrap">
          <div class="scratch-ticket">
            <div class="scratch-ticket-label">WEIDMANN WM Poker Edition</div>
            <div class="scratch-window">
              <div class="scratch-prize">
                <div>
                  <div class="scratch-prize-kicker">Nächstes Spiel</div>
                  <div class="scratch-prize-title">${escapeHtml(title)}</div>
                  <div class="scratch-prize-meta">${categoryLabel(game.category)}</div>
                </div>
              </div>
              <div class="scratch-foil" aria-hidden="true">
                ${scratchFoilStrips(resolvedDuration)}
                <div class="scratch-prompt">HIER RUBBELN</div>
              </div>
              <div class="scratch-coin" aria-hidden="true"></div>
              ${scratchDust(resolvedDuration)}
            </div>
          </div>
        </div>
      </div>`;
  }

  function scratchFoilStrips(duration) {
    const stripDuration = Math.round(duration * 0.24);
    const stripGap = Math.round(duration * 0.13);
    return Array.from({ length: 5 }, (_, index) => {
      const top = -1 + index * 19.8;
      const delay = 520 + index * stripGap;
      const direction = index % 2 === 0 ? 'from-left' : 'from-right';
      return `<span class="scratch-strip ${direction}" style="top:${top}%; --strip-delay:${delay}ms; --strip-duration:${stripDuration}ms"></span>`;
    }).join('');
  }

  function scratchDust(duration) {
    return Array.from({ length: 34 }, (_, index) => {
      const row = index % 5;
      const rowProgress = ((index * 37) % 100) / 100;
      const leftToRight = row % 2 === 0;
      const x = leftToRight ? 12 + rowProgress * 76 : 88 - rowProgress * 76;
      const y = 24 + row * 12.5 + Math.sin(rowProgress * Math.PI * 2) * 4.2;
      const delay = Math.round(520 + row * duration * 0.13 + rowProgress * duration * 0.13);
      const dx = Math.round(-36 + ((index * 19) % 72));
      const dy = Math.round(-34 + ((index * 29) % 68));
      const size = 4 + (index % 5);
      return `<span class="scratch-dust" style="--x:${roundCoord(x)}%; --y:${roundCoord(y)}%; --dx:${dx}px; --dy:${dy}px; --dust-delay:${delay}ms; --dust-size:${size}px"></span>`;
    }).join('');
  }

  const WHEEL_FACE_COUNT = 7;
  const WHEEL_FACE_HEIGHT = 150;
  const WHEEL_FACE_RADIUS = Math.round((WHEEL_FACE_HEIGHT / 2) / Math.tan(Math.PI / WHEEL_FACE_COUNT));
  const WHEEL_FACE_THEMES = [
    { bg: 'linear-gradient(180deg, #14151c, #06070a)', fg: '#fff8df', border: '#d8b75a' },
    { bg: 'linear-gradient(180deg, #17915f, #0a5138)', fg: '#f2fff6', border: '#d8b75a' },
    { bg: 'linear-gradient(180deg, #fff3d6, #f4d78a)', fg: '#a3121c', border: '#7c5a1e' },
  ];
  // Neutrale Füllfarben, sobald Gewinner-Hervorhebung aktiv ist - ohne Grün,
  // damit nur die echten Nachbarn des Zielspiels grün erscheinen.
  const WHEEL_FILLER_THEMES = [
    { bg: 'linear-gradient(180deg, #14151c, #06070a)', fg: '#fff8df', border: '#d8b75a' },
    { bg: 'linear-gradient(180deg, #fff3d6, #f4d78a)', fg: '#a3121c', border: '#7c5a1e' },
  ];
  const WHEEL_TARGET_THEME = { bg: 'linear-gradient(180deg, #fff7a8, #ffd15c)', fg: '#241104', border: '#fff3bd' };
  const WHEEL_NEIGHBOR_THEME = { bg: 'linear-gradient(180deg, #17915f, #0a5138)', fg: '#f2fff6', border: '#d8b75a' };

  /**
   * Vertikale Glücksrad-Trommel (Price-is-Right-Stil): statt Zahlen zeigt
   * jede Kammer einen Spieletitel, der Pfeil rechts markiert die aktuelle
   * Ausrichtung. Landet immer auf dem echten Zielspiel.
   */
  function wheelReveal(targetGame, choices, spinning, duration, slotNumber, preview = false) {
    const pool = (Array.isArray(choices) ? choices : []).filter(Boolean);
    const target = targetGame || pool[0];
    if (!target) return idle('Spielauswahl', 'Kein Spiel vorbereitet.');

    const decoys = pool.filter((game) => !sameGame(game, target));
    const faceGames = shuffleArray([target, ...decoys.slice(0, WHEEL_FACE_COUNT - 1)]);
    const count = faceGames.length;
    const faceAngle = 360 / count;
    const targetIndex = faceGames.findIndex((game) => sameGame(game, target));
    const fullSpins = 6;
    const finalRotation = preview ? 0 : roundCoord(-(fullSpins * 360 + targetIndex * faceAngle));
    const resolvedDuration = Math.max(900, Number(duration) || 5200);
    const isSpinning = spinning && !preview;
    const state = preview ? 'idle' : spinning ? 'spinning' : 'complete';
    const subtitle = preview ? 'Bereit' : slotNumber ? `Spiel ${slotNumber}` : 'Nächstes Spiel';
    // Gold für das Zielspiel und grün für seine direkten Nachbarn - aber
    // nur, sobald wirklich gedreht wird/das Ergebnis feststeht. Im "Bereit"-
    // Preview darf das nicht zu sehen sein, sonst verrät die Farbe das Spiel.
    const roles = preview ? null : wheelHighlightRoles(targetIndex, count);
    const fillerThemes = preview ? WHEEL_FACE_THEMES : WHEEL_FILLER_THEMES;
    const faces = faceGames
      .map((game, index) => wheelFace(game, index, faceAngle, roles && roles[index], fillerThemes))
      .join('');
    const drumStyle = `--wheel-final:${finalRotation}deg; --wheel-duration:${resolvedDuration}ms`;
    // Die Ergebnis-Box darf erst auftauchen, wenn die Trommel wirklich steht -
    // sonst verrät sie das Spiel, während oben noch gedreht wird.
    const resultRevealDelay = Math.max(0, resolvedDuration - 120);
    const lights = Array.from({ length: 10 }, (_, i) => `<span style="--i:${i}"></span>`).join('');

    return `
      <div class="wheel-reveal ${state}">
        <div class="wheel-copy">
          <div class="wheel-kicker">Glücksrad</div>
          <div class="wheel-sub">${escapeHtml(subtitle)}</div>
        </div>
        <div class="wheel-frame">
          <div class="wheel-lights">${lights}</div>
          <div class="wheel-display">SPIEL ${slotNumber || '-'}</div>
          <div class="wheel-pillar left"><span>★</span></div>
          <div class="wheel-stage">
            <div class="wheel-drum ${isSpinning ? 'spinning' : ''}" style="${drumStyle}">
              ${faces}
            </div>
          </div>
          <div class="wheel-pillar right">
            <span>★</span>
            <div class="wheel-arrow"></div>
          </div>
        </div>
        ${preview ? '' : `
        <div class="wheel-result ${isSpinning ? 'pending' : ''}" style="--result-reveal-delay:${resultRevealDelay}ms">
          <div>Nächstes Spiel</div>
          <b>${escapeHtml(target.title || target.name)}</b>
        </div>`}
      </div>`;
  }

  function wheelHighlightRoles(targetIndex, count) {
    const roles = new Array(count).fill(null);
    roles[targetIndex] = 'target';
    const prevIndex = (targetIndex - 1 + count) % count;
    const nextIndex = (targetIndex + 1) % count;
    if (prevIndex !== targetIndex) roles[prevIndex] = 'neighbor';
    if (nextIndex !== targetIndex) roles[nextIndex] = 'neighbor';
    return roles;
  }

  function wheelFace(game, index, faceAngle, role, fillerThemes) {
    const label = shortRouletteLabel(game.title || game.name || '');
    const angle = roundCoord(index * faceAngle);
    const themes = fillerThemes || WHEEL_FACE_THEMES;
    const theme =
      role === 'target' ? WHEEL_TARGET_THEME
      : role === 'neighbor' ? WHEEL_NEIGHBOR_THEME
      : themes[index % themes.length];
    const style =
      `transform: rotateX(${angle}deg) translateZ(${WHEEL_FACE_RADIUS}px); ` +
      `background:${theme.bg}; color:${theme.fg}; border-color:${theme.border};`;
    return `
      <div class="wheel-face" style="${style}">
        <span>${escapeHtml(label)}</span>
      </div>`;
  }

  function rouletteReveal(targetGame, choices, spinning, duration, slotNumber, preview = false) {
    const targetLabel = targetGame ? targetGame.title || targetGame.name || String(targetGame) : '';
    const games = rouletteLabels(targetLabel, rouletteGames(targetGame, choices));
    return GameRouletteReveal({
      games,
      targetGame: preview ? null : targetLabel || games[0],
      durationMs: duration || 4600,
      spinning,
      subtitle: preview ? 'Bereit' : slotNumber ? `Spiel ${slotNumber}` : 'Nächstes Spiel',
      preview,
    });
  }

  function GameRouletteReveal({
    games,
    targetGame,
    durationMs = 4600,
    spinning = true,
    subtitle = 'Nächstes Spiel',
    preview = false,
    onComplete,
  }) {
    const labels = Array.isArray(games)
      ? games.map((game) => String(game || '').trim()).filter(Boolean)
      : [];

    if (!labels.length) {
      return '<div class="roulette-empty">Keine Spiele für das Roulette vorbereitet.</div>';
    }

    const targetLabel = labels.includes(targetGame) ? targetGame : labels[0];
    const targetIndex = preview ? -1 : labels.indexOf(targetLabel);
    const count = labels.length;
    const segmentAngle = 360 / count;
    const targetSegmentCenterAngle = targetIndex * segmentAngle + segmentAngle / 2;
    const targetStopAngle = 90;
    const fullSpins = count === 1 ? 2 : 7;
    const finalRotation = preview ? 0 : fullSpins * 360 + targetStopAngle - targetSegmentCenterAngle;
    const ballRotation = preview ? 0 : -((fullSpins + 2) * 360) + targetStopAngle;
    const resolvedDuration = Math.max(900, Number(durationMs) || 4600);
    const state = preview ? 'idle' : spinning ? 'spinning' : 'complete';
    const revealId = `roulette-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const segments = labels
      .map((label, index) => rouletteSegment(label, index, count, index === targetIndex))
      .join('');
    const wheelStyle =
      `--wheel-final:${finalRotation}deg; ` +
      `--ball-final:${ballRotation}deg; ` +
      `--roulette-duration:${resolvedDuration}ms; ` +
      `--result-delay:${Math.max(0, resolvedDuration - 300)}ms; ` +
      `--glow-delay:${Math.max(0, resolvedDuration - 800)}ms`;

    queueRouletteComplete(revealId, spinning && !preview ? resolvedDuration : 0, onComplete);

    return `
      <div id="${revealId}" class="roulette-reveal ${state}" data-state="${state}" style="${wheelStyle}">
        <div class="roulette-copy">
          <div class="roulette-kicker">${preview ? 'Roulette' : 'Nächstes Spiel wird gezogen'}</div>
          <div class="roulette-sub">${escapeHtml(subtitle)}</div>
        </div>
        <div class="roulette-stage">
          <div class="roulette-pointer"></div>
          <div class="roulette-ball-layer">
            <div class="roulette-ball"></div>
          </div>
          <svg class="roulette-svg" viewBox="0 0 600 600" aria-hidden="true">
            <defs>
              <radialGradient id="roulette-hub-gradient" cx="45%" cy="35%" r="70%">
                <stop offset="0%" stop-color="#f4e2a0"></stop>
                <stop offset="54%" stop-color="#d8b75a"></stop>
                <stop offset="100%" stop-color="#8c6f2f"></stop>
              </radialGradient>
              <filter id="roulette-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="blur"></feGaussianBlur>
                <feMerge>
                  <feMergeNode in="blur"></feMergeNode>
                  <feMergeNode in="SourceGraphic"></feMergeNode>
                </feMerge>
              </filter>
            </defs>
            <circle class="roulette-outer" cx="300" cy="300" r="288"></circle>
            <circle class="roulette-rail" cx="300" cy="300" r="252"></circle>
            <g class="roulette-wheel-disc ${spinning && !preview ? 'spinning' : 'complete'}">
              ${segments}
              <circle class="roulette-pocket-ring" cx="300" cy="300" r="202"></circle>
              <circle class="roulette-inner-ring" cx="300" cy="300" r="116"></circle>
              <circle class="roulette-hub" cx="300" cy="300" r="72"></circle>
              <circle class="roulette-hub-dot" cx="300" cy="300" r="18"></circle>
            </g>
          </svg>
          ${preview ? '' : `
          <div class="roulette-result">
            <div>Nächstes Spiel</div>
            <b>${escapeHtml(targetLabel)}</b>
          </div>`}
        </div>
      </div>`;
  }

  window.GameRouletteReveal = GameRouletteReveal;

  function queueRouletteComplete(revealId, delayMs, onComplete) {
    if (!delayMs || typeof window === 'undefined') {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    window.setTimeout(() => {
      const reveal = document.getElementById(revealId);
      if (reveal) {
        reveal.classList.remove('spinning');
        reveal.classList.add('finished');
        reveal.dataset.state = 'complete';
      }
      if (typeof onComplete === 'function') onComplete();
    }, delayMs);
  }

  function rouletteGames(targetGame, choices) {
    const games = (Array.isArray(choices) ? choices : []).filter(Boolean);
    if (targetGame && !games.some((game) => sameGame(game, targetGame))) {
      games.unshift(targetGame);
    }
    return games;
  }

  function rouletteLabels(targetLabel, games) {
    const labels = [];
    const addLabel = (label) => {
      const text = String(label || '').trim();
      if (!text || labels.includes(text)) return;
      labels.push(text);
    };

    (Array.isArray(games) ? games : []).forEach((game) => addLabel(game.title || game.name || game));
    ROULETTE_OPTION_LABELS.forEach(addLabel);
    if (targetLabel && !labels.includes(targetLabel)) {
      labels.unshift(targetLabel);
    }
    return labels;
  }

  function sameGame(a, b) {
    if (!a || !b) return false;
    const aId = a.gameId || a.id;
    const bId = b.gameId || b.id;
    if (aId && bId) return aId === bId;
    return (a.title || a.name || String(a)) === (b.title || b.name || String(b));
  }

  function rouletteSegment(label, index, count, isTarget) {
    const segmentAngle = 360 / count;
    const start = index * segmentAngle;
    const end = start + segmentAngle;
    const mid = start + segmentAngle / 2;
    const placement = rouletteLabelPlacement(mid);
    const colorClass = `c${index % 2}`;

    return `
      <g class="roulette-segment ${colorClass} ${isTarget ? 'target' : ''}" data-label="${escapeHtml(label)}">
        <path class="roulette-sector" d="${annularSectorPath(300, 300, 116, 270, start, end)}"></path>
        <path class="roulette-pocket" d="${annularSectorPath(300, 300, 202, 248, start, end)}"></path>
        <text x="${placement.x}" y="${placement.y}" transform="rotate(${placement.rotation} ${placement.x} ${placement.y})"
              text-anchor="${placement.anchor}">
          ${escapeHtml(shortRouletteLabel(label))}
        </text>
      </g>`;
  }

  function rouletteLabelPlacement(angleDeg) {
    const leftSide = angleDeg > 180;
    const radius = 138;
    const point = polarTop(300, 300, radius, angleDeg);
    return {
      x: point.x,
      y: point.y,
      rotation: roundCoord(leftSide ? angleDeg + 90 : angleDeg - 90),
      anchor: leftSide ? 'end' : 'start',
    };
  }

  function shortRouletteLabel(value) {
    const text = String(value || '-');
    const mapped = ROULETTE_SHORT_LABELS[text] || text;
    const max = 10;
    if (text === '2016?') return text;
    const label = String(mapped || text);
    return label.length > max ? label.slice(0, max) : label;
  }

  function annularSectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
    const span = endAngle - startAngle;
    if (span >= 359.999) {
      return [
        `M ${cx} ${cy - outerRadius}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${cx - 0.001} ${cy - outerRadius}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${cx} ${cy - outerRadius}`,
        `M ${cx} ${cy - innerRadius}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${cx - 0.001} ${cy - innerRadius}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy - innerRadius}`,
        'Z',
      ].join(' ');
    }

    const outerStart = polarTop(cx, cy, outerRadius, startAngle);
    const outerEnd = polarTop(cx, cy, outerRadius, endAngle);
    const innerEnd = polarTop(cx, cy, innerRadius, endAngle);
    const innerStart = polarTop(cx, cy, innerRadius, startAngle);
    const largeArc = span > 180 ? 1 : 0;

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
      'Z',
    ].join(' ');
  }

  function polarTop(cx, cy, radius, angleDeg) {
    const angle = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: roundCoord(cx + Math.cos(angle) * radius),
      y: roundCoord(cy + Math.sin(angle) * radius),
    };
  }

  function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
  }

  function gameDetails(game, sub, choices = []) {
    if (!game) return idle('Spielauswahl', 'Kein Spiel ausgelost.');
    return `
      <div class="choices-wrap">
        ${slotResult(game, choices)}
        <div class="game-head">
          <div class="title">${escapeHtml(game.title || game.name)}</div>
          <div class="meta">${categoryLabel(game.category)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</div>
        </div>
        <div class="choice-card" style="max-width:760px;margin:24px auto;text-align:left;">
          ${detailRow('Kurzbeschreibung', game.description)}
          ${detailRow('Material', (game.materials || []).join(', '))}
          ${detailRow('Regeln', game.rules)}
        </div>
        <div class="muted">${sub || ''}</div>
      </div>`;
  }

  function bettingStage(state) {
    const r = state.round || {};
    const count = r.betCount || 0;
    const total = r.betTotal || state.players.length;
    return `
      <div class="choices-wrap">
        ${introResult(r.selectedGame, r.choices || [], r)}
        <div class="game-head">
          <div class="title">Geheime Einsätze</div>
          <div class="meta">${escapeHtml(r.selectedGame ? r.selectedGame.title || r.selectedGame.name : 'Spiel')}</div>
        </div>
        <div class="choice-card" style="max-width:760px;margin:24px auto;">
          <div class="cn">${count}/${total}</div>
          <div class="cm">Spieler haben ihren Einsatz bestätigt</div>
        </div>
      </div>`;
  }

  function payoutStage(state) {
    const summary = state.round && state.round.payoutSummary;
    if (Array.isArray(summary) && summary.length) {
      const cards = [...summary]
        .sort((a, b) => a.place - b.place)
        .map((row) => `
          <div class="choice-card">
            <div class="cn">${row.place}. ${escapeHtml(row.playerName)}</div>
            <div class="cm">+${row.award} Platz ${row.betDelta ? `${row.betDelta > 0 ? '+' : ''}${row.betDelta} Wette` : '+0 Wette'} = ${row.finalScore} Coins</div>
          </div>`)
        .join('');
      return `<div class="choices-wrap"><div class="choices-title">Auszahlung</div><div class="choices">${cards}</div></div>`;
    }
    return idle('Auswertung', 'Admin trägt die Platzierungen ein.');
  }

  function finale(state) {
    const ranked = [...state.players].sort((a, b) => b.score - a.score);
    const rows = ranked
      .map((p, i) => `
        <div class="choice-card">
          <div class="cn" style="color:${p.color}">${i + 1}. ${escapeHtml(p.name)}</div>
          <div class="cm">${p.score} Coins</div>
        </div>`)
      .join('');
    return `<div class="choices-wrap"><div class="choices-title">Finale Wertung</div><div class="choices">${rows}</div></div>`;
  }

  function idle(big, sub) {
    return `<div class="idle"><div class="big">${big}</div><div>${sub || ''}</div></div>`;
  }

  const rouletteDemoTarget = new URLSearchParams(location.search).get('rouletteDemo');
  if (rouletteDemoTarget) {
    const demoGames = ROULETTE_OPTION_LABELS;
    phaseEl.textContent = 'roulette-demo';
    document.body.classList.add('table-mode');
    joinQrEl.style.display = 'none';
    contentEl.innerHTML = GameRouletteReveal({
      games: demoGames,
      targetGame: rouletteDemoTarget,
      durationMs: 4600,
      spinning: true,
      subtitle: 'Demo',
    });
    return;
  }

  const cardsDemoTarget = new URLSearchParams(location.search).get('cardsDemo');
  if (cardsDemoTarget) {
    phaseEl.textContent = 'cards-demo';
    document.body.classList.add('table-mode');
    joinQrEl.style.display = 'none';
    contentEl.innerHTML = cornholeCardsReveal(
      { title: cardsDemoTarget, name: cardsDemoTarget },
      [],
      true,
      4300,
      3
    );
    return;
  }

  const scratchDemoTarget = new URLSearchParams(location.search).get('scratchDemo');
  if (scratchDemoTarget) {
    phaseEl.textContent = 'scratch-demo';
    document.body.classList.add('table-mode');
    joinQrEl.style.display = 'none';
    contentEl.innerHTML = scratchTicketReveal(
      { title: scratchDemoTarget, name: scratchDemoTarget, category: 'skill' },
      ROULETTE_OPTION_LABELS.map((title) => ({ title, name: title, category: 'skill' })),
      true,
      5600,
      5
    );
    return;
  }

  App.onState((state) => {
    phaseEl.textContent = state.phase;
    document.body.classList.toggle(
      'table-mode',
      state.phase === 'lobby' ||
        state.phase === 'runden-uebersicht' ||
        state.phase === 'spiel-intro'
    );
    renderScoreboard(state);

    if (state.activeGame) {
      joinQrEl.style.display = 'none';
      host.sync(state);
    } else {
      host.sync(state);
      renderStage(state);
    }
  });

  App.socket.on('fx:buzzer-armed', () => beep(660, 0.12));

  App.socket.on('fx:buzzer-winner', (w) => {
    winnerEl.querySelector('.wname').textContent = w.playerName || w.teamName || '';
    winnerEl.querySelector('.wname').style.color = w.color || '#fff';
    winnerEl.classList.add('show');
    beep(880, 0.18);
    setTimeout(() => beep(1175, 0.22), 130);
    setTimeout(() => winnerEl.classList.remove('show'), 3500);
  });

  let audioCtx = null;
  function beep(freq, dur) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = freq;
      o.type = 'square';
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.18, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch (e) {
      /* Audio evtl. erst nach User-Geste erlaubt */
    }
  }

  function detailRow(label, value) {
    return value ? `<div style="margin-top:10px;"><b>${label}:</b> ${escapeHtml(value)}</div>` : '';
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function formatCoins(value) {
    return String(Number(value) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function stripTags(value) {
    return String(value || '').replace(/<[^>]+>/g, '');
  }

  function categoryLabel(category) {
    return { sport: 'Sport', skill: 'Geschicklichkeit', quiz: 'Quiz' }[category] || category || '-';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.__setGameMounted = (v) => {
    contentEl.dataset.gameMounted = v ? '1' : '';
  };
})();
