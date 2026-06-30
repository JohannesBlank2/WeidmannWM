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
    joinQrEl.style.display = state.phase === 'lobby' ? 'block' : 'none';

    const r = state.round || {};
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);
    const pickerHtml = picker
      ? `<span style="color:${picker.color}">${escapeHtml(picker.name)}</span>`
      : '-';

    if (state.phase === 'runden-uebersicht') {
      contentEl.innerHTML = idle(
        `Runde ${r.number} / ${r.total}`,
        `${pickerHtml} waehlt die Kategorie`
      );
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
    } else if (state.phase === 'spiel-details') {
      contentEl.innerHTML = gameDetails(r.selectedGame, 'Jackpot. Dieses Spiel wurde ausgelost.', r.choices || []);
    } else if (state.phase === 'wetten') {
      contentEl.innerHTML = bettingStage(state);
    } else if (state.phase === 'auswertung') {
      contentEl.innerHTML = payoutStage(state);
    } else if (state.phase === 'finale') {
      contentEl.innerHTML = finale(state);
    } else {
      contentEl.innerHTML = idle('Willkommen', 'Spieler scannen den QR-Code und treten per Handy bei.');
    }
  }

  function renderSpin(state, spinning) {
    const r = state.round || {};
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);
    const choices = r.choices || [];
    const winner = gameById(choices, r.spin && r.spin.winnerGameId);
    const duration = (r.spin && r.spin.durationMs) || 4600;
    const status = spinning
      ? 'Die Walzen laufen ...'
      : `${picker ? escapeHtml(picker.name) : 'Der Spieler'} drueckt gleich auf Spin`;
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
        ${slotResult(r.selectedGame, r.choices || [])}
        <div class="game-head">
          <div class="title">Geheime Einsaetze</div>
          <div class="meta">${escapeHtml(r.selectedGame ? r.selectedGame.title || r.selectedGame.name : 'Spiel')}</div>
        </div>
        <div class="choice-card" style="max-width:760px;margin:24px auto;">
          <div class="cn">${count}/${total}</div>
          <div class="cm">Spieler haben ihren Einsatz bestaetigt</div>
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
    return idle('Auswertung', 'Admin traegt die Platzierungen ein.');
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

  App.onState((state) => {
    phaseEl.textContent = state.phase;
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
