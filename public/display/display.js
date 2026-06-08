/* Display-Ansicht (TV/Beamer). */
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
      boardLabelEl.textContent = `Spielpunkte - ${state.activeGame.title || state.activeGame.name}`;
      const max = Math.max(0, ...state.teams.map((t) => t.gameScore));
      scoreboardEl.innerHTML = state.teams
        .map((t) => {
          const leader = t.gameScore > 0 && t.gameScore === max;
          return `
        <div class="score-team ${leader ? 'leader' : ''}" style="--tc:${t.color}">
          <div class="name">${escapeHtml(t.name)}</div>
          <div class="score">${t.gameScore}</div>
          <div class="rank">${leader ? 'vorn' : '&nbsp;'}</div>
        </div>`;
        })
        .join('');
      return;
    }

    boardLabelEl.textContent = 'Gesamtwertung';
    const ranked = [...state.teams].sort((a, b) => b.score - a.score);
    scoreboardEl.innerHTML = ranked
      .map((t, i) => {
        const samePrev = i > 0 && ranked[i - 1].score === t.score;
        const shownPlace = samePrev ? rankOf(ranked, t.score) : i + 1;
        const leader = shownPlace === 1;
        return `
        <div class="score-team ${leader ? 'leader' : ''}" style="--tc:${t.color}">
          <div class="rank">${shownPlace}.</div>
          <div class="name">${escapeHtml(t.name)}</div>
          <div class="score">${t.score}</div>
        </div>`;
      })
      .join('');
  }

  function rankOf(ranked, score) {
    return ranked.findIndex((t) => t.score === score) + 1;
  }

  function renderStage(state) {
    if (state.activeGame) {
      joinQrEl.style.display = 'none';
      if (!contentEl.dataset.gameMounted) {
        const g = state.activeGame;
        contentEl.innerHTML = `
          <div class="game-head">
            <div class="title">${escapeHtml(g.title || g.name)}</div>
            <div class="meta">${categoryLabel(g.category)} - ${stars(g.difficulty || g.schwierigkeit)} - ${g.interaktionstyp}</div>
          </div>`;
      }
      return;
    }

    contentEl.dataset.gameMounted = '';
    joinQrEl.style.display = state.phase === 'lobby' ? 'block' : 'none';

    const r = state.round;
    const picker = r.pickerTeamId && state.teams.find((t) => t.id === r.pickerTeamId);
    const pickerHtml = picker
      ? `<span style="color:${picker.color}">${escapeHtml(picker.name)}</span>`
      : '-';

    if (state.phase === 'runden-uebersicht') {
      contentEl.innerHTML = idle(
        `Runde ${r.number} / ${r.total}`,
        `Modus: <b>${modeLabel(r.mode)}</b> &nbsp; Auswahl: ${pickerHtml}`
      );
    } else if (state.phase === 'kategorie-auswahl') {
      const cats = (r.availableCategories || []).map(categoryLabel).join(' &nbsp; ');
      contentEl.innerHTML = idle(
        'Kategorie-Auswahl',
        `${pickerHtml} waehlt eine Kategorie<br><span class="muted">${cats}</span>`
      );
    } else if (state.phase === 'spiel-auswahl') {
      if (!r.choices.length) {
        contentEl.innerHTML = idle(
          'Keine offenen Spiele',
          'Alle Spiele in dieser Kategorie wurden bereits gespielt.'
        );
        return;
      }
      const cards = r.choices
        .map((c) => `
        <div class="choice-card">
          <div class="cn">${escapeHtml(c.title || c.name)}</div>
          <div class="cm">${stars(c.difficulty || c.schwierigkeit)} - ${c.responsiblePerson ? escapeHtml(c.responsiblePerson) : 'offen'}</div>
        </div>`)
        .join('');
      contentEl.innerHTML = `
        <div class="choices-wrap">
          <div class="choices-title">${pickerHtml} waehlt ein Spiel - <b>${categoryLabel(r.category)}</b></div>
          <div class="choices">${cards}</div>
        </div>`;
    } else if (state.phase === 'spiel-details') {
      contentEl.innerHTML = gameDetails(r.selectedGame, 'Spiel starten, wenn alles bereit ist.');
    } else if (state.phase === 'spielerauswahl') {
      contentEl.innerHTML = playerSelection(state);
    } else if (state.phase === 'auswertung') {
      const max = Math.max(0, ...state.teams.map((t) => t.gameScore));
      const winners = state.teams.filter((t) => t.gameScore === max && max > 0);
      const sub = winners.length
        ? 'Spielpunkte-Sieger: ' +
          winners
            .map((t) => `<span style="color:${t.color}">${escapeHtml(t.name)}</span>`)
            .join(', ') +
          ` (${max})`
        : 'Admin vergibt die Gesamtpunkte.';
      contentEl.innerHTML = idle('Auswertung', sub);
    } else if (state.phase === 'bonus') {
      contentEl.innerHTML = idle('Bonus-Runde', 'Kommt spaeter.');
    } else if (state.phase === 'finale') {
      contentEl.innerHTML = idle('Finale', 'Kommt spaeter.');
    } else {
      contentEl.innerHTML = idle('Willkommen', 'Teams treten bei - /play auf den iPads oeffnen.');
    }
  }

  function gameDetails(game, sub) {
    if (!game) return idle('Spielauswahl', 'Kein Spiel ausgewaehlt.');
    return `
      <div class="choices-wrap">
        <div class="game-head">
          <div class="title">${escapeHtml(game.title || game.name)}</div>
          <div class="meta">${categoryLabel(game.category)} - ${stars(game.difficulty || game.schwierigkeit)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</div>
        </div>
        <div class="choice-card" style="max-width:760px;margin:24px auto;text-align:left;">
          ${detailRow('Kurzbeschreibung', game.description)}
          ${detailRow('Material', (game.materials || []).join(', '))}
          ${detailRow('Regeln', game.rules)}
        </div>
        <div class="muted">${sub || ''}</div>
      </div>`;
  }

  function playerSelection(state) {
    const selected = state.round.selectedPlayers || {};
    const rows = state.teams.map((t) => {
      const idx = selected[t.id];
      const name = idx != null && t.players[idx] ? t.players[idx].name : 'offen';
      return `<div class="choice-card"><div class="cn" style="color:${t.color}">${escapeHtml(t.name)}</div><div class="cm">${escapeHtml(name)}</div></div>`;
    }).join('');
    return `<div class="choices-wrap"><div class="choices-title">Spielerauswahl</div><div class="choices">${rows}</div></div>`;
  }

  function idle(big, sub) {
    return `<div class="idle"><div class="big">${big}</div><div>${sub || ''}</div></div>`;
  }

  App.onState((state) => {
    phaseEl.textContent = state.phase;
    renderScoreboard(state);
    renderStage(state);
    host.sync(state);
  });

  App.socket.on('fx:buzzer-armed', () => beep(660, 0.12));

  App.socket.on('fx:buzzer-winner', (w) => {
    winnerEl.querySelector('.wname').textContent = w.teamName;
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
  function modeLabel(mode) { return mode === 'group' ? 'Gruppenspiel' : 'Einzelspiel'; }
  function categoryLabel(category) {
    return { sport: 'Sport', skill: 'Geschicklichkeit', quiz: 'Quiz' }[category] || category || '-';
  }
  function stars(n) {
    const value = Math.min(3, Math.max(1, Number(n) || 1));
    return '*'.repeat(value) + '-'.repeat(3 - value);
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.__setGameMounted = (v) => { contentEl.dataset.gameMounted = v ? '1' : ''; };
})();
