/* TV-Ansicht: Wertung, Rundenstatus, Kategorie-Spin und Spielcontent. */
(function () {
  const phaseEl = document.getElementById('phase');
  const scoreboardEl = document.getElementById('scoreboard');
  const boardLabelEl = document.getElementById('board-label');
  const contentEl = document.getElementById('content');
  const winnerEl = document.getElementById('winner');
  const joinQrEl = document.getElementById('join-qr');
  const soundUnlockEl = document.getElementById('sound-unlock');
  const ambientPanelEl = document.getElementById('ambient-panel');
  const ambientPlayerEl = document.getElementById('ambient-player');
  const ambientStartEl = document.getElementById('ambient-start');
  const ambientTitleEl = document.getElementById('ambient-title');

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
  let audioCtx = null;
  let activeAnimationSoundKey = null;
  let animationSoundTimers = [];
  let ambientAudio = null;
  let ambientDesired = { enabled: false, trackId: 'pick-your-poison', volume: 32 };
  let ambientCurrentTrackId = null;
  let ambientBlocked = false;
  let crashMusicAudio = null;
  let crashExplosionAudio = null;
  let lastCrashPhase = null;
  const AMBIENT_TRACKS = [
    { id: 'pick-your-poison', label: 'Pick Your Poison', src: '/assets/audio/pick-your-poison.mp3' },
    { id: 'hide', label: 'Hide', src: '/assets/audio/hide.mp3' },
    { id: 'blind-spot', label: 'Blind Spot', src: '/assets/audio/blind-spot.mp3' },
    { id: 'poker-ambiente', label: 'Poker Ambiente (Finale)', src: '/assets/audio/poker-ambiente.mp3' },
  ];
  initDisplaySoundControls();
  initAmbientMusicControls();
  const ROULETTE_OPTION_LABELS = [
    'Ballon transportieren',
    'Blinder Eierlauf',
    'Bottleflip',
    'Dartringe',
    'How much is the fish',
    'Emoji Filmquiz',
    '2016?',
    'Ferngesteuerte Scharade',
    'Fußballbowling',
    'Labyrinth',
    'Shazam',
    'Papierflieger',
    'Partner Zielwurf',
    'Halbe Sachen',
    'Video (Hanni vs. Richi)',
    'Wer bin ich',
    'Wo liegt was',
  ];

  const ROULETTE_SHORT_LABELS = {
    'Ballon transportieren': 'Ballon',
    'Blinder Eierlauf': 'Eierlauf',
    Bottleflip: 'Bottle',
    Dartringe: 'Dart',
    'How much is the fish': 'Fish',
    'Emoji Filmquiz': 'Emoji',
    'Ferngesteuerte Scharade': 'Scharade',
    Fußballbowling: 'Bowling',
    Labyrinth: 'Labyr.',
    Papierflieger: 'Flieger',
    'Partner Zielwurf': 'Zielwurf',
    'Halbe Sachen': 'Halbe',
    'Video (Hanni vs. Richi)': 'Video',
    'Wer bin ich': 'Wer bin?',
    'Wo liegt was': 'Wo?',
  };

  injectCrashStyles();

  function isCrashActive(state) {
    const phase = state && state.crashGame && state.crashGame.phase;
    return phase === 'ready' || phase === 'running' || phase === 'crashed';
  }

  function renderCrashStage(state) {
    const crash = state.crashGame || { phase: 'idle', multiplier: 1, players: {} };
    const phase = crash.phase || 'idle';
    const crashed = phase === 'crashed';
    const multiplier = Number(crash.multiplier) || 1;
    const crashPoint = Number(crash.crashPoint || crash.multiplier) || multiplier;
    const headline = phase === 'ready'
      ? 'Warte auf Start'
      : crashed
        ? 'CRASHED'
        : 'RUNNING';
    const subline = phase === 'ready'
      ? 'Einsätze sind gesetzt'
      : crashed
        ? `Crash bei ${formatMultiplier(crashPoint)}`
        : 'Jetzt rechtzeitig rausgehen';

    joinQrEl.style.display = 'none';
    contentEl.innerHTML = `
      <div class="crash-display ${crashed ? 'crashed' : ''} ${phase === 'ready' ? 'ready' : ''}">
        <div class="crash-brand">WEIDMANN WM Poker Edition</div>
        <div class="crash-main">
          <div class="crash-copy">
            <div class="crash-kicker">Mini-Casino Crash</div>
            <div class="crash-multiplier">${formatMultiplier(multiplier)}</div>
            <div class="crash-status">${escapeHtml(headline)} · ${escapeHtml(subline)}</div>
          </div>
          ${crashSvg(multiplier, crashed)}
        </div>
        <div class="crash-roster">
          ${state.players.map((player) => crashPlayerRow(player, crash, phase)).join('')}
        </div>
      </div>`;
  }

  function crashSvg(multiplier, crashed) {
    const curve = crashCurve(multiplier);
    return `
      <svg class="crash-curve" viewBox="0 0 1000 420" aria-hidden="true">
        <defs>
          <linearGradient id="crash-curve-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${crashed ? '#7f1d2b' : '#16a86b'}"></stop>
            <stop offset="100%" stop-color="${crashed ? '#ff5268' : '#62d9ff'}"></stop>
          </linearGradient>
          <filter id="crash-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>
        <path class="crash-grid-line" d="M70 360 H940"></path>
        <path class="crash-grid-line" d="M70 280 H940"></path>
        <path class="crash-grid-line" d="M70 200 H940"></path>
        <path class="crash-grid-line" d="M70 120 H940"></path>
        <path class="crash-path-shadow" d="${curve.path}"></path>
        <path class="crash-path" d="${curve.path}"></path>
        <circle class="crash-dot-end" cx="${curve.end.x}" cy="${curve.end.y}" r="12"></circle>
      </svg>`;
  }

  function crashCurve(multiplier) {
    const progress = Math.max(0.04, Math.min(1, ((Number(multiplier) || 1) - 1) / 9));
    const startX = 70;
    const endX = startX + 860 * progress;
    const startY = 360;
    const height = 300 * Math.max(0.16, progress);
    const points = [];
    const segments = 24;

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const curve = (Math.exp(t * 2.2) - 1) / (Math.exp(2.2) - 1);
      const x = roundCoord(startX + (endX - startX) * t);
      const y = roundCoord(startY - height * curve);
      points.push({ x, y });
    }

    return {
      path: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
      end: points[points.length - 1],
    };
  }

  function crashPlayerRow(player, crash, phase) {
    const entry = crash.players && crash.players[player.id]
      ? crash.players[player.id]
      : { stake: 0, cashedOut: false, payout: 0, lost: false };
    const status = crashStatus(entry, phase);
    const payout = entry.stake > 0 && phase === 'crashed'
      ? `${formatCoins(entry.payout || 0)} Chips`
      : entry.cashedOut
        ? `${formatCoins(entry.payout || 0)} Chips`
        : '-';

    return `
      <div class="crash-player ${entry.cashedOut ? 'out' : ''} ${entry.lost ? 'lost' : ''}" style="--pc:${player.color}">
        <div class="crash-player-name">${escapeHtml(player.name)}</div>
        <div class="crash-player-stake">${formatCoins(entry.stake || 0)} Einsatz</div>
        <div class="crash-player-status">${escapeHtml(status)}</div>
        <div class="crash-player-payout">${escapeHtml(payout)}</div>
      </div>`;
  }

  function crashStatus(entry, phase) {
    if (!entry || entry.stake <= 0) return 'nicht dabei';
    if (phase === 'ready') return 'bereit';
    if (phase === 'running') return entry.cashedOut
      ? `raus bei ${formatMultiplier(entry.cashoutMultiplier)}`
      : 'drin';
    if (phase === 'crashed') return entry.cashedOut ? 'gewonnen' : 'verloren';
    return '-';
  }

  function formatMultiplier(value) {
    return `${(Number(value) || 1).toFixed(2)}x`;
  }

  function injectCrashStyles() {
    if (document.getElementById('display-crash-styles')) return;
    const style = document.createElement('style');
    style.id = 'display-crash-styles';
    style.textContent = `
      body.crash-mode main.stage {
        min-height: 100vh; padding: 18px;
        background:
          radial-gradient(circle at 50% 28%, rgba(41, 191, 132, .18), transparent 0 34%),
          linear-gradient(180deg, #090406 0%, #15070c 56%, #050203 100%);
      }
      body.crash-mode .qr-corner { display: none; }
      .crash-display {
        position: relative; width: min(1500px, 96vw); height: min(900px, 94vh);
        display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 16px;
      }
      .crash-brand {
        color: var(--accent); text-align: center; font-size: clamp(1.3rem, 2.4vw, 2.5rem);
        font-weight: 900; letter-spacing: .18em; text-shadow: 0 0 18px rgba(255,209,92,.42);
      }
      .crash-main {
        position: relative; min-height: 0; border: 1px solid rgba(255,209,92,.24);
        border-radius: 8px; overflow: hidden; background: rgba(9, 4, 6, .68);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.04), 0 26px 58px rgba(0,0,0,.42);
      }
      .crash-copy {
        position: absolute; z-index: 2; inset: 32px 34px auto 34px;
        display: grid; gap: 4px; justify-items: center; pointer-events: none;
      }
      .crash-kicker {
        color: var(--muted); font-size: clamp(1rem, 1.5vw, 1.35rem);
        text-transform: uppercase; letter-spacing: .18em; font-weight: 900;
      }
      .crash-multiplier {
        color: #fff8df; font-size: clamp(5.8rem, 15vw, 13rem); line-height: .92;
        font-weight: 900; text-shadow: 0 0 34px rgba(98,217,255,.28);
      }
      .crash-status {
        color: #d9fdeb; font-size: clamp(1.1rem, 2vw, 2rem); font-weight: 900;
        text-transform: uppercase; letter-spacing: .08em;
      }
      .crash-display.crashed .crash-status,
      .crash-display.crashed .crash-multiplier { color: #ff6a7d; text-shadow: 0 0 32px rgba(255,82,104,.35); }
      .crash-curve {
        position: absolute; inset: 0; width: 100%; height: 100%;
      }
      .crash-grid-line {
        fill: none; stroke: rgba(255,248,223,.09); stroke-width: 2;
      }
      .crash-path-shadow {
        fill: none; stroke: rgba(0,0,0,.62); stroke-width: 22; stroke-linecap: round; stroke-linejoin: round;
      }
      .crash-path {
        fill: none; stroke: url(#crash-curve-gradient); stroke-width: 12;
        stroke-linecap: round; stroke-linejoin: round; filter: url(#crash-glow);
      }
      .crash-dot-end {
        fill: #fff8df; stroke: var(--accent); stroke-width: 5;
        filter: drop-shadow(0 0 14px rgba(255,248,223,.75));
      }
      .crash-roster {
        display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px;
      }
      .crash-player {
        min-height: 112px; display: grid; gap: 3px; align-content: center; text-align: center;
        border-radius: 8px; border: 1px solid rgba(255,209,92,.25);
        background: rgba(18, 7, 10, .74); border-top: 5px solid var(--pc);
      }
      .crash-player.out { border-color: rgba(17,140,79,.82); box-shadow: 0 0 20px rgba(17,140,79,.22); }
      .crash-player.lost { border-color: rgba(196,25,50,.9); opacity: .72; }
      .crash-player-name { color: var(--pc); font-size: clamp(1rem, 1.4vw, 1.3rem); font-weight: 900; }
      .crash-player-stake,
      .crash-player-payout { color: var(--muted); font-weight: 800; }
      .crash-player-status { color: #fff8df; font-size: clamp(1.1rem, 1.8vw, 1.55rem); font-weight: 900; }
      @media (max-width: 900px) {
        .crash-roster { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .crash-copy { inset: 24px 18px auto 18px; }
      }
    `;
    document.head.appendChild(style);
  }

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
      contentEl.innerHTML = tableScene(state, {
        eyebrow: 'WEIDMANN WM Poker Edition',
        centerClass: 'game-bets',
        centerHtml: bettingTableCenter(state),
      });
    } else if (state.phase === 'auswertung') {
      contentEl.innerHTML = payoutStage(state);
    } else if (state.phase === 'finale') {
      contentEl.innerHTML = tableScene(state, {
        centerHtml: '<div class="table-kicker">Finale</div><div class="table-main">POKERRUNDE</div>',
      });
    } else {
      contentEl.innerHTML = tableScene(state, {
        eyebrow: 'WEIDMANN WM Poker Edition',
      });
    }
  }

  function tableScene(state, copy) {
    const connected = connectedPlayerIds(state);
    const centerHtml = copy.centerHtml || tableCenterCopy(copy);
    const centerClass = copy.centerClass ? ` ${copy.centerClass}` : '';
    return `
      <div class="table-scene">
        <div class="table-title">
          <div class="table-brand">
            <span>WEIDMANN WM</span>
            <small>Poker Edition</small>
          </div>
        </div>
        <div class="poker-table">
          ${centerHtml ? `<div class="table-center${centerClass}">${centerHtml}</div>` : ''}
        </div>
        ${state.players.map((player, index) => playerSeat(player, index, connected.has(player.id))).join('')}
      </div>`;
  }

  function tableCenterCopy(copy) {
    const kicker = copy.kicker
      ? `<div class="table-kicker">${escapeHtml(copy.kicker)}</div>`
      : '';
    const title = copy.title
      ? `<div class="table-main">${escapeHtml(copy.title)}</div>`
      : '';
    const status = copy.status
      ? `<div class="table-status"><span class="status-dot"></span>${escapeHtml(copy.status)}</div>`
      : '';
    return `${kicker}${title}${status}`;
  }

  function bettingTableCenter(state) {
    const r = state.round || {};
    const game = r.selectedGame;
    const title = game ? game.title || game.name : 'Spiel';
    const revealed = r.betsRevealed === true;
    const count = r.betCount || 0;
    const total = r.betTotal || state.players.length;

    return `
      <div class="table-game-name">${escapeHtml(title)}</div>
      ${revealed ? bettingRevealList(state) : `
        <div class="table-bet-hidden">
          <b>Einsätze verdeckt</b>
          <span>${count}/${total} haben gesetzt</span>
        </div>`}`;
  }

  function bettingRevealList(state) {
    const bets = (state.round && state.round.bets) || {};
    return `
      <div class="table-bet-list">
        ${state.players.map((player) => {
          const bet = bets[player.id] || {};
          const amount = bet.submitted ? Number(bet.amount) || 0 : 0;
          return `
            <div class="table-bet-chip" style="--pc:${player.color}">
              <span>${escapeHtml(player.name)}</span>
              <b>${formatCoins(amount)} Coins</b>
            </div>`;
        }).join('')}
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
    const title = game.title || game.name || 'Nächstes Spiel';
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
    const crashActive = isCrashActive(state);
    phaseEl.textContent = crashActive ? `crash-${state.crashGame.phase}` : state.phase;
    document.body.classList.toggle(
      'table-mode',
      crashActive ||
        state.phase === 'lobby' ||
        state.phase === 'runden-uebersicht' ||
        state.phase === 'spiel-intro' ||
        state.phase === 'wetten'
    );
    document.body.classList.toggle('crash-mode', crashActive);
    syncAmbientMusic(state);
    syncAnimationSound(state, crashActive);
    syncCrashSound(state, crashActive);

    if (crashActive) {
      host.sync({ ...state, activeGame: null });
      renderCrashStage(state);
      return;
    }

    renderScoreboard(state);
    if (state.activeGame) {
      joinQrEl.style.display = 'none';
      host.sync(state);
    } else {
      host.sync(state);
      renderStage(state);
    }
  });

  App.socket.on('fx:buzzer-armed', () => playBuzzerArmedSound());

  App.socket.on('fx:buzzer-winner', (w) => {
    winnerEl.querySelector('.wname').textContent = w.playerName || w.teamName || '';
    winnerEl.querySelector('.wname').style.color = w.color || '#fff';
    winnerEl.classList.add('show');
    playBuzzerWinnerSound();
    setTimeout(() => winnerEl.classList.remove('show'), 3500);
  });

  // Game-Show-Sound: Buzzer sind scharf - aufsteigender Sweep plus heller Ding.
  function playBuzzerArmedSound() {
    playSweep(392, 784, 0.22, 0, 'triangle', 0.09);
    playTone(1175, 0.14, 200, 'triangle', 0.1);
    playTone(1568, 0.2, 300, 'sine', 0.08);
  }

  // Erster Buzz: Buzzer-Sound als MP3.
  let buzzerWinnerAudio = null;
  function playBuzzerWinnerSound() {
    if (!buzzerWinnerAudio) {
      buzzerWinnerAudio = new Audio('/assets/audio/buzzer.mp3');
      buzzerWinnerAudio.preload = 'auto';
    }
    buzzerWinnerAudio.currentTime = 0;
    buzzerWinnerAudio.play().catch(() => {});
  }

  function initAmbientMusicControls() {
    if (ambientStartEl) {
      ambientStartEl.onclick = () => {
        ambientBlocked = false;
        applyAmbientMusic(true);
      };
    }
  }

  function syncAmbientMusic(state) {
    ambientDesired = normalizeAmbientMusic(state && state.ambientMusic);
    updateAmbientPanel();

    if (!ambientDesired.enabled) {
      if (ambientAudio) {
        ambientAudio.pause();
      }
      ambientCurrentTrackId = null;
      ambientBlocked = false;
      updateAmbientPanel();
      return;
    }

    ensureAmbientPlayer();
    applyAmbientMusic(false);
  }

  function normalizeAmbientMusic(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const trackId = AMBIENT_TRACKS.some((track) => track.id === value.trackId)
      ? value.trackId
      : AMBIENT_TRACKS[0].id;
    const volume = Math.max(0, Math.min(100, Math.round(Number(value.volume == null ? 32 : value.volume) || 0)));
    return {
      enabled: value.enabled === true,
      trackId,
      volume,
    };
  }

  function ensureAmbientPlayer() {
    if (ambientAudio || !ambientPlayerEl) return;

    ambientAudio = document.createElement('audio');
    ambientAudio.controls = true;
    ambientAudio.loop = true;
    ambientAudio.preload = 'auto';
    ambientAudio.playsInline = true;
    ambientAudio.addEventListener('playing', () => {
      ambientBlocked = false;
      updateAmbientPanel();
    });
    ambientAudio.addEventListener('pause', () => {
      if (ambientDesired.enabled) {
        ambientBlocked = true;
        updateAmbientPanel();
      }
    });
    ambientAudio.addEventListener('error', () => {
      ambientBlocked = true;
      updateAmbientPanel();
    });

    ambientPlayerEl.innerHTML = '';
    ambientPlayerEl.appendChild(ambientAudio);
  }

  function applyAmbientMusic(fromUserGesture) {
    if (!ambientDesired.enabled) return;
    if (!ambientAudio) {
      ensureAmbientPlayer();
      updateAmbientPanel();
      return;
    }

    const track = AMBIENT_TRACKS.find((entry) => entry.id === ambientDesired.trackId) || AMBIENT_TRACKS[0];
    try {
      ambientAudio.volume = ambientDesired.volume / 100;

      if (ambientCurrentTrackId !== ambientDesired.trackId) {
        ambientCurrentTrackId = ambientDesired.trackId;
        ambientAudio.src = track.src;
        ambientAudio.load();
      }

      const playPromise = ambientAudio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            ambientBlocked = false;
            updateAmbientPanel();
          })
          .catch(() => {
            ambientBlocked = true;
            updateAmbientPanel();
          });
      }

      window.setTimeout(() => {
        ambientBlocked = ambientDesired.enabled && ambientAudio.paused;
        if (fromUserGesture && ambientBlocked) {
          const retry = ambientAudio.play();
          if (retry && typeof retry.catch === 'function') {
            retry.catch(() => {
              ambientBlocked = true;
              updateAmbientPanel();
            });
          }
        }
        updateAmbientPanel();
      }, 700);
    } catch (e) {
      ambientBlocked = true;
      updateAmbientPanel();
    }
  }

  function updateAmbientPanel() {
    if (!ambientPanelEl) return;
    const track = AMBIENT_TRACKS.find((entry) => entry.id === ambientDesired.trackId) || AMBIENT_TRACKS[0];
    if (ambientTitleEl) ambientTitleEl.textContent = track.label;
    const active = ambientDesired.enabled;
    ambientPanelEl.classList.toggle('active', active);
    ambientPanelEl.classList.toggle('needs-start', active && ambientBlocked);
  }

  function initDisplaySoundControls() {
    refreshSoundUnlockButton();
    if (soundUnlockEl) {
      soundUnlockEl.onclick = () => unlockAudio(true);
    }
    window.addEventListener('pointerdown', () => unlockAudio(false), { once: true });
    window.addEventListener('keydown', () => unlockAudio(false), { once: true });
  }

  function syncCrashSound(state, crashActive) {
    const phase = crashActive && state.crashGame ? state.crashGame.phase : null;
    if (phase === lastCrashPhase) return;
    const previousPhase = lastCrashPhase;
    lastCrashPhase = phase;

    if (phase === 'running') {
      stopCrashExplosion();
      startCrashMusic();
      return;
    }

    stopCrashMusic();
    if (phase === 'crashed' && previousPhase === 'running') {
      playCrashExplosion();
    } else if (phase !== 'crashed') {
      stopCrashExplosion();
    }
  }

  function startCrashMusic() {
    if (!crashMusicAudio) {
      crashMusicAudio = new Audio('/assets/audio/crash-background.mp3');
      crashMusicAudio.loop = true;
      crashMusicAudio.preload = 'auto';
    }
    crashMusicAudio.currentTime = 0;
    crashMusicAudio.play().catch(() => {});
  }

  function stopCrashMusic() {
    if (crashMusicAudio && !crashMusicAudio.paused) {
      crashMusicAudio.pause();
    }
  }

  function playCrashExplosion() {
    if (!crashExplosionAudio) {
      crashExplosionAudio = new Audio('/assets/audio/crash-explosion.mp3');
      crashExplosionAudio.preload = 'auto';
    }
    crashExplosionAudio.currentTime = 0;
    crashExplosionAudio.play().catch(() => {});
  }

  function stopCrashExplosion() {
    if (crashExplosionAudio && !crashExplosionAudio.paused) {
      crashExplosionAudio.pause();
    }
  }

  function syncAnimationSound(state, crashActive) {
    const sound = animationSoundFromState(state, crashActive);
    if (!sound) {
      if (activeAnimationSoundKey) {
        clearAnimationSoundTimers();
        activeAnimationSoundKey = null;
      }
      return;
    }
    if (sound.key === activeAnimationSoundKey) return;

    clearAnimationSoundTimers();
    activeAnimationSoundKey = sound.key;
    playAnimationSound(sound.animation, sound.durationMs);
  }

  function animationSoundFromState(state, crashActive) {
    if (!state || crashActive) return null;
    if (state.ambientMusic && state.ambientMusic.enabled === true) return null;
    const round = state.round || {};
    const intro = round.intro || {};

    if (state.phase === 'spiel-intro' && intro.status === 'running') {
      return {
        key: [
          'intro',
          round.number || 0,
          intro.startedAt || 0,
          intro.animation || 'reveal',
          intro.targetGameId || round.gameId || '',
        ].join(':'),
        animation: isScratchIntro(round) ? 'scratch' : intro.animation || 'reveal',
        durationMs: intro.durationMs || 4600,
      };
    }

    if (state.phase === 'spin-laeuft' && round.spin && round.spin.status === 'spinning') {
      return {
        key: ['spin', round.spin.startedAt || 0, round.spin.winnerGameId || ''].join(':'),
        animation: 'roulette',
        durationMs: round.spin.durationMs || 4600,
      };
    }

    return null;
  }

  function playAnimationSound(animation, durationMs) {
    unlockAudio(false);
    const duration = Math.max(900, Number(durationMs) || 4600);
    const type = animation || 'reveal';

    if (type === 'slot') {
      playSlotSound(duration);
    } else if (type === 'roulette') {
      playRouletteSound(duration);
    } else if (type === 'cards') {
      playCardsSound(duration);
    } else if (type === 'wheel') {
      playWheelSound(duration);
    } else if (type === 'scratch') {
      playScratchSound(duration);
    } else {
      playRevealSound(duration);
    }
  }

  function playSlotSound(duration) {
    playThunk(0, 0.9);
    playSweep(110, 55, 0.38, 120, 'sawtooth', 0.07);
    timedTicks(180, Math.max(700, duration - 1050), 82, (delay, index) => {
      playTone(520 + (index % 5) * 90, 0.032, delay, 'square', 0.045);
    });
    [duration - 730, duration - 500, duration - 280].forEach((delay, index) => {
      scheduleSound(() => {
        playThunk(0, 0.68);
        playTone(760 + index * 140, 0.09, 40, 'triangle', 0.09);
      }, Math.max(120, delay));
    });
    playFanfare(Math.max(250, duration - 120));
  }

  function playRouletteSound(duration) {
    playNoise(0.35, 0, 0.09, 'bandpass', 1200, 0.7);
    playSweep(180, 520, Math.min(2.1, duration / 1000 * 0.55), 0, 'sawtooth', 0.055);
    timedTicks(120, Math.max(600, duration - 900), 72, (delay, index) => {
      const slow = delay / Math.max(1, duration);
      const step = 42 + slow * 95;
      if (index % Math.max(1, Math.round(step / 42)) === 0) {
        playTone(1250 + (index % 4) * 90, 0.024, delay, 'square', 0.042);
      }
    });
    timedTicks(240, Math.max(500, duration - 850), 260, (delay) => {
      playNoise(0.12, delay, 0.035, 'bandpass', 740, 0.9);
    });
    playTone(1760, 0.08, Math.max(180, duration - 360), 'triangle', 0.09);
    playFanfare(Math.max(260, duration - 140));
  }

  function playCardsSound(duration) {
    playNoise(0.28, 0, 0.08, 'highpass', 2200, 0.55);
    [340, 720].forEach((delay, index) => {
      playNoise(0.12, delay, 0.11, 'bandpass', 1850 + index * 320, 1.1);
      playTone(260 + index * 70, 0.08, delay + 28, 'triangle', 0.05);
    });
    [duration * 0.52, duration * 0.62].forEach((delay, index) => {
      playTone(740 + index * 210, 0.09, delay, 'square', 0.055);
      playNoise(0.08, delay + 18, 0.055, 'highpass', 2600, 0.8);
    });
    playFanfare(Math.max(380, duration - 420));
  }

  function playWheelSound(duration) {
    playSweep(95, 410, Math.max(0.8, duration / 1000 - 0.45), 0, 'sawtooth', 0.055);
    timedTicks(170, Math.max(600, duration - 780), 112, (delay, index) => {
      playTone(420 + (index % 3) * 110, 0.026, delay, 'square', 0.045);
    });
    playNoise(0.24, Math.max(200, duration - 520), 0.11, 'lowpass', 420, 0.8);
    playTone(130, 0.18, Math.max(250, duration - 500), 'triangle', 0.09);
    playFanfare(Math.max(340, duration - 170));
  }

  function playScratchSound(duration) {
    playTone(660, 0.08, 0, 'triangle', 0.055);
    timedTicks(520, Math.max(700, duration - 1250), 155, (delay, index) => {
      const freq = 1900 + (index % 5) * 260;
      playNoise(0.11, delay, 0.105, 'bandpass', freq, 1.6);
    });
    playNoise(0.3, Math.max(260, duration - 980), 0.08, 'highpass', 2600, 0.8);
    playFanfare(Math.max(360, duration - 360));
  }

  function playRevealSound(duration) {
    timedTicks(120, Math.max(300, duration - 850), 150, (delay, index) => {
      playTone(520 + index * 28, 0.04, delay, 'triangle', 0.035);
    });
    playFanfare(Math.max(260, duration - 220));
  }

  function playFanfare(delayMs) {
    const delay = Math.max(0, delayMs);
    playTone(880, 0.12, delay, 'triangle', 0.08);
    playTone(1175, 0.13, delay + 120, 'triangle', 0.08);
    playTone(1568, 0.22, delay + 245, 'triangle', 0.09);
    playTone(523, 0.26, delay + 250, 'sine', 0.045);
  }

  function timedTicks(startMs, durationMs, intervalMs, fn) {
    const end = startMs + Math.max(0, durationMs);
    let index = 0;
    for (let delay = startMs; delay <= end; delay += intervalMs) {
      fn(delay, index);
      index += 1;
    }
  }

  function clearAnimationSoundTimers() {
    animationSoundTimers.forEach((timer) => clearTimeout(timer));
    animationSoundTimers = [];
  }

  function scheduleSound(fn, delayMs = 0) {
    const delay = Math.max(0, Number(delayMs) || 0);
    if (!delay) {
      fn();
      return;
    }
    const timer = window.setTimeout(() => {
      animationSoundTimers = animationSoundTimers.filter((entry) => entry !== timer);
      fn();
    }, delay);
    animationSoundTimers.push(timer);
  }

  function beep(freq, dur) {
    playTone(freq, dur, 0, 'square', 0.18);
  }

  function playThunk(delayMs = 0, strength = 1) {
    playNoise(0.1, delayMs, 0.1 * strength, 'lowpass', 260, 0.8);
    playTone(82, 0.13, delayMs, 'sine', 0.08 * strength);
  }

  function playTone(freq, durationSec, delayMs = 0, type = 'sine', gainValue = 0.08) {
    scheduleSound(() => {
      const ctx = getRunningAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const duration = Math.max(0.02, Number(durationSec) || 0.08);

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, Number(freq) || 440), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }, delayMs);
  }

  function playSweep(startFreq, endFreq, durationSec, delayMs = 0, type = 'sine', gainValue = 0.055) {
    scheduleSound(() => {
      const ctx = getRunningAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const duration = Math.max(0.08, Number(durationSec) || 0.4);

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }, delayMs);
  }

  function playNoise(durationSec, delayMs = 0, gainValue = 0.08, filterType = 'bandpass', frequency = 1200, q = 1) {
    scheduleSound(() => {
      const ctx = getRunningAudioContext();
      if (!ctx) return;
      const duration = Math.max(0.03, Number(durationSec) || 0.08);
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const fade = 1 - i / length;
        data[i] = (Math.random() * 2 - 1) * fade;
      }

      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      source.buffer = buffer;
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(40, frequency), now);
      filter.Q.setValueAtTime(Math.max(0.1, q), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      source.stop(now + duration + 0.02);
    }, delayMs);
  }

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      audioCtx = new AudioContextCtor();
      audioCtx.onstatechange = refreshSoundUnlockButton;
      refreshSoundUnlockButton();
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function getRunningAudioContext() {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') {
      refreshSoundUnlockButton();
      return null;
    }
    return ctx;
  }

  function unlockAudio(playTestSound) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const done = () => {
      refreshSoundUnlockButton();
      if (playTestSound && ctx.state === 'running') {
        playTone(880, 0.08, 0, 'triangle', 0.07);
        playTone(1320, 0.11, 95, 'triangle', 0.07);
      }
    };

    try {
      const resume = ctx.state === 'suspended' ? ctx.resume() : null;
      if (resume && typeof resume.then === 'function') {
        resume.then(done).catch(refreshSoundUnlockButton);
      } else {
        done();
      }
    } catch (e) {
      refreshSoundUnlockButton();
    }
  }

  function refreshSoundUnlockButton() {
    if (!soundUnlockEl) return;
    const supported = !!(window.AudioContext || window.webkitAudioContext);
    soundUnlockEl.hidden = !supported;
    if (!supported) return;
    const ready = audioCtx && audioCtx.state === 'running';
    soundUnlockEl.classList.toggle('ready', ready);
    soundUnlockEl.textContent = ready ? 'Sound an' : 'Sound aktivieren';
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
