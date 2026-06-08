/* Admin-Steuerzentrale: Ablauf/Runden, Buzzer, Gesamt- & Spielpunkte, Spiele, Geraete. */
(function () {
  const phasePill = document.getElementById('phase-pill');
  const roundBanner = document.getElementById('round-banner');
  const pickerArea = document.getElementById('picker-area');
  const buzzStateEl = document.getElementById('buzz-state');
  const buzzOrderEl = document.getElementById('buzz-order');
  const teamsEl = document.getElementById('teams');
  const gamesEl = document.getElementById('games');
  const activeGameEl = document.getElementById('active-game');
  const clientsEl = document.getElementById('clients');

  let games = [];

  App.socket.on('hello', (info) => {
    games = info.games || [];
    if (App.getState()) renderGames(App.getState());
  });

  const FLOW = {
    'show-start': 'admin:show-start',
    'open-kategorie': 'admin:open-kategorie',
    'stop-game': 'admin:stop-game',
    'next-round': 'admin:next-round',
    'goto-bonus': 'admin:goto-bonus',
    'goto-finale': 'admin:goto-finale',
    'reset-game-points': 'admin:reset-game-points',
  };

  document.querySelectorAll('[data-flow]').forEach((b) => {
    b.onclick = () => App.socket.emit(FLOW[b.dataset.flow]);
  });

  function renderAblauf(state) {
    phasePill.textContent = state.phase;
    const r = state.round;
    const picker = r.pickerTeamId && state.teams.find((t) => t.id === r.pickerTeamId);

    if (r.number < 1) {
      roundBanner.innerHTML = '<span class="muted">Show noch nicht gestartet.</span>';
    } else {
      roundBanner.innerHTML =
        `Runde <b>${r.number}/${r.total}</b> &middot; Modus: <b>${modeLabel(r.mode)}</b>` +
        ` &middot; Auswahl: <b style="color:${picker ? picker.color : '#fff'}">` +
        `${picker ? esc(picker.name) : '-'}</b>` +
        (r.category ? ` &middot; Kategorie: <b>${categoryLabel(r.category)}</b>` : '');
    }

    if (state.phase === 'kategorie-auswahl') {
      renderCategoryPick(r);
    } else if (state.phase === 'spiel-auswahl') {
      renderGamePick(r);
    } else if (state.phase === 'spiel-details') {
      renderGameDetails(r);
    } else if (state.phase === 'spielerauswahl') {
      renderPlayerSelection(state);
    } else {
      pickerArea.innerHTML = '';
    }
  }

  function renderCategoryPick(round) {
    const categories = round.availableCategories || [];
    pickerArea.innerHTML =
      '<div class="lbl">Kategorie stellvertretend waehlen:</div><div class="row">' +
      categories.map((k) => `<button data-pickkat="${k}">${categoryLabel(k)}</button>`).join('') +
      '</div>' +
      (!categories.length
        ? '<div class="muted">Keine Kategorie fuer diesen Modus verfuegbar.</div>'
        : '');

    pickerArea.querySelectorAll('[data-pickkat]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:pick-kategorie', { kategorie: b.dataset.pickkat });
    });
  }

  function renderGamePick(round) {
    if (!round.choices.length) {
      pickerArea.innerHTML =
        '<div class="lbl">Spielauswahl:</div>' +
        '<div class="muted">Alle Spiele in dieser Kategorie wurden bereits gespielt.</div>' +
        '<div class="row" style="margin-top:8px;"><button data-backcat>Zurueck zur Kategorie-Auswahl</button></div>';
      pickerArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('admin:back-to-categories');
      return;
    }

    pickerArea.innerHTML =
      '<div class="lbl">Spiel stellvertretend waehlen:</div><div class="row">' +
      round.choices
        .map((c, i) =>
          `<button data-pickgame="${c.gameId}">${i + 1}. ${esc(c.title || c.name)}` +
          `${c.hasBeenPlayed ? ' <span class="muted">(bereits gespielt)</span>' : ''}</button>`
        )
        .join('') +
      '</div>';

    pickerArea.querySelectorAll('[data-pickgame]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:pick-spiel', { gameId: b.dataset.pickgame });
    });
  }

  function renderGameDetails(round) {
    pickerArea.innerHTML =
      gameDetails(round.selectedGame) +
      '<div class="row" style="margin-top:10px;">' +
      '<button class="good" data-start-picked>Spiel starten</button>' +
      '<button data-backcat>Zurueck zur Kategorie-Auswahl</button>' +
      '</div>';
    pickerArea.querySelector('[data-start-picked]').onclick = () => App.socket.emit('admin:start-picked-game');
    pickerArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('admin:back-to-categories');
  }

  function renderPlayerSelection(state) {
    pickerArea.innerHTML = playerSelectionHtml(state, true);
    pickerArea.querySelectorAll('[data-pickplayer]').forEach((b) => {
      b.onclick = () =>
        App.socket.emit('admin:pick-spieler', {
          teamId: b.dataset.team,
          playerIndex: Number(b.dataset.pickplayer),
        });
    });
    const start = pickerArea.querySelector('[data-start-selected]');
    if (start) start.onclick = () => App.socket.emit('admin:start-selected-game');
  }

  document.querySelectorAll('[data-buzz]').forEach((b) => {
    b.onclick = () => App.socket.emit('admin:buzzer', { action: b.dataset.buzz });
  });

  function renderBuzzer(state) {
    buzzStateEl.textContent = '(' + state.buzzer.status + ')';
    if (!state.buzzer.presses.length) {
      buzzOrderEl.textContent = 'Noch keine Buzzes.';
      return;
    }
    const byId = Object.fromEntries(state.teams.map((t) => [t.id, t]));
    buzzOrderEl.innerHTML =
      'Reihenfolge: ' +
      state.buzzer.presses
        .map((p) => {
          const t = byId[p.teamId];
          return `<b style="color:${t ? t.color : '#fff'}">${p.order}. ${t ? esc(t.name) : p.teamId}</b>`;
        })
        .join(' &nbsp; ');
  }

  function renderTeams(state) {
    teamsEl.innerHTML = '';
    state.teams.forEach((t) => {
      const p0 = t.players && t.players[0] ? t.players[0] : { name: 'Spieler 1', einzelCount: 0 };
      const p1 = t.players && t.players[1] ? t.players[1] : { name: 'Spieler 2', einzelCount: 0 };
      const row = document.createElement('div');
      row.className = 'team-row';
      row.innerHTML = `
        <span class="dot" style="background:${t.color}"></span>
        <input type="text" value="${esc(t.name)}" data-rename="${t.id}" />
        <input type="text" value="${esc(p0.name)}" title="Spieler 1 (${p0.einzelCount}/2 Einzelspiele)" data-player="${t.id}" data-player-index="0" />
        <input type="text" value="${esc(p1.name)}" title="Spieler 2 (${p1.einzelCount}/2 Einzelspiele)" data-player="${t.id}" data-player-index="1" />
        <span class="ptbox">
          <span class="tag">Gesamt</span>
          <button class="bad" data-add="${t.id}" data-delta="-1">-1</button>
          <span class="sc">${t.score}</span>
          <button class="good" data-add="${t.id}" data-delta="1">+1</button>
        </span>
        <span class="ptbox game">
          <span class="tag">Spiel</span>
          <button class="bad" data-gadd="${t.id}" data-delta="-1">-1</button>
          <span class="sc">${t.gameScore}</span>
          <button class="good" data-gadd="${t.id}" data-delta="1">+1</button>
        </span>`;
      teamsEl.appendChild(row);
    });

    teamsEl.querySelectorAll('[data-add]').forEach((b) => {
      b.onclick = () =>
        App.socket.emit('admin:points', { teamId: b.dataset.add, delta: Number(b.dataset.delta) });
    });
    teamsEl.querySelectorAll('[data-gadd]').forEach((b) => {
      b.onclick = () =>
        App.socket.emit('admin:game-points', { teamId: b.dataset.gadd, delta: Number(b.dataset.delta) });
    });
    teamsEl.querySelectorAll('[data-rename]').forEach((inp) => {
      inp.onchange = () =>
        App.socket.emit('admin:rename-team', { teamId: inp.dataset.rename, name: inp.value });
    });
    teamsEl.querySelectorAll('[data-player]').forEach((inp) => {
      inp.onchange = () =>
        App.socket.emit('admin:rename-player', {
          teamId: inp.dataset.player,
          playerIndex: Number(inp.dataset.playerIndex),
          name: inp.value,
        });
    });
  }

  function renderGames(state) {
    const activeId = state.activeGame && state.activeGame.id;
    activeGameEl.innerHTML = state.activeGame
      ? `Aktiv: <b>${esc(state.activeGame.title || state.activeGame.name)}</b>`
      : 'Kein Spiel aktiv.';

    gamesEl.innerHTML =
      games
        .map((g) => `
      <div class="game-item">
        <div class="info">
          <div class="nm">${esc(g.title || g.name)}</div>
          <div class="mt">${categoryLabel(g.category)} &middot; ${(g.mode || []).map(modeLabel).join('/')} &middot; ${g.interaktionstyp}</div>
        </div>
        <button class="${activeId === g.id ? 'good' : 'primary'}" data-start="${g.id}">
          ${activeId === g.id ? 'laeuft' : 'Starten'}
        </button>
      </div>`)
        .join('') || '<div class="muted">Keine Spiele registriert.</div>';

    gamesEl.querySelectorAll('[data-start]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:start-game', { gameId: b.dataset.start });
    });
  }

  document.getElementById('reset-all').onclick = () => {
    if (confirm('Wirklich ALLE Punkte und den Ablauf zuruecksetzen? (Teamnamen bleiben)')) {
      App.socket.emit('admin:reset-all');
    }
  };

  function renderClients(state) {
    const byTeam = Object.fromEntries(state.teams.map((t) => [t.id, t]));
    const entries = Object.entries(state.clients);
    if (!entries.length) {
      clientsEl.innerHTML = '<span class="muted">keine</span>';
      return;
    }
    clientsEl.innerHTML = entries
      .map(([id, c]) => {
        const t = c.teamId && byTeam[c.teamId];
        const color = c.connected ? 'var(--good)' : 'var(--bad)';
        const label = t
          ? esc(t.name)
          : c.role === 'admin'
          ? 'Admin'
          : c.role === 'display'
          ? 'Display'
          : 'kein Team';
        return `<span class="client-pill">
        <span class="d" style="background:${color}"></span>
        ${label} <span class="muted">${id.slice(0, 6)}</span>
      </span>`;
      })
      .join('');
  }

  App.onState((state) => {
    renderAblauf(state);
    renderBuzzer(state);
    renderTeams(state);
    renderGames(state);
    renderClients(state);
  });

  function gameDetails(game) {
    if (!game) return '<div class="muted">Kein Spiel ausgewaehlt.</div>';
    return `
      <div class="lbl">Gewaehlt:</div>
      <div class="game-detail">
        <h3>${esc(game.title || game.name)}</h3>
        <div class="muted">${categoryLabel(game.category)}${game.responsiblePerson ? ' &middot; ' + esc(game.responsiblePerson) : ''}</div>
        ${detailRow('Kurzbeschreibung', game.description)}
        ${detailRow('Material', (game.materials || []).join(', '))}
        ${detailRow('Regeln', game.rules)}
      </div>`;
  }

  function playerSelectionHtml(state, withStartButton) {
    const selected = state.round.selectedPlayers || {};
    const rows = state.teams.map((t) => {
      const buttons = (t.players || []).map((p, i) => {
        const disabled = p.einzelCount >= 2;
        const active = selected[t.id] === i;
        return `<button ${disabled ? 'disabled' : ''} class="${active ? 'good' : ''}" data-team="${t.id}" data-pickplayer="${i}">
          ${esc(p.name)} <span class="muted">(${p.einzelCount}/2)</span>
        </button>`;
      }).join('');
      const chosen = selected[t.id] != null && t.players[selected[t.id]]
        ? ` gewaehlt: <b>${esc(t.players[selected[t.id]].name)}</b>`
        : ' noch offen';
      return `<div style="margin:8px 0;"><b style="color:${t.color}">${esc(t.name)}</b>${chosen}<div class="row" style="margin-top:5px;">${buttons}</div></div>`;
    }).join('');
    const complete = Object.keys(selected).length >= state.teams.length;
    return `<div class="lbl">Spielerauswahl fuer Einzelspiel:</div>${rows}` +
      (withStartButton
        ? `<div class="row" style="margin-top:10px;"><button class="good" ${complete ? '' : 'disabled'} data-start-selected>Spiel starten</button></div>`
        : '');
  }

  function detailRow(label, value) {
    return value ? `<div style="margin-top:8px;"><b>${label}:</b> ${esc(value)}</div>` : '';
  }

  function modeLabel(mode) { return mode === 'group' ? 'Gruppenspiel' : 'Einzelspiel'; }
  function categoryLabel(category) {
    return { sport: 'Sport', skill: 'Geschicklichkeit', quiz: 'Quiz' }[category] || category || '-';
  }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
