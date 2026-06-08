/* Spieler-Ansicht (iPad): Team waehlen, Pick-Ablauf, Buzzer, Spiel-Modul. */
(function () {
  const whoEl = document.getElementById('who');
  const teamSelect = document.getElementById('team-select');
  const teamGrid = document.getElementById('team-grid');
  const playArea = document.getElementById('play-area');
  const pickArea = document.getElementById('pick-area');
  const gameArea = document.getElementById('game-area');
  const buzzerWrap = document.getElementById('buzzer-wrap');
  const buzzerBtn = document.getElementById('buzzer');
  const buzzStatus = document.getElementById('buzz-status');
  const phaseHint = document.getElementById('phase-hint');

  const ctx = {
    socket: App.socket,
    clientId: App.clientId,
    role: 'play',
    view: 'play',
    sendAction: (a) => App.socket.emit('game:action', a),
  };
  const host = window.createGameHost(gameArea, ctx);

  function renderTeams(state) {
    const me = App.me(state);
    const myTeam = me && me.teamId;
    teamGrid.innerHTML = state.teams
      .map((t) => `
      <button class="team-btn ${myTeam === t.id ? 'active' : ''}"
              style="--tc:${t.color}" data-team="${t.id}">${escapeHtml(t.name)}</button>`)
      .join('');
    teamGrid.querySelectorAll('[data-team]').forEach((btn) => {
      btn.onclick = () => App.socket.emit('join-team', { teamId: btn.dataset.team });
    });
  }

  function renderPick(state, myTeam) {
    const r = state.round;
    const isPicker = myTeam && myTeam === r.pickerTeamId;
    const pickerTeam = r.pickerTeamId && state.teams.find((t) => t.id === r.pickerTeamId);
    const pickerName = pickerTeam ? pickerTeam.name : '-';

    if (state.phase === 'kategorie-auswahl') {
      if (isPicker) {
        const categories = r.availableCategories || [];
        pickArea.innerHTML =
          `<div class="pick-title">Runde ${r.number}<br>Modus: ${modeLabel(r.mode)}<br>Auswahl durch: ${escapeHtml(pickerName)}</div>` +
          '<div class="pick-title">Waehle eine Kategorie:</div>' +
          '<div class="pick-grid">' +
          categories.map((k) => `<button class="pick-btn" data-kat="${k}">${categoryLabel(k)}</button>`).join('') +
          '</div>';
        pickArea.querySelectorAll('[data-kat]').forEach((b) => {
          b.onclick = () => App.socket.emit('pick:kategorie', { kategorie: b.dataset.kat });
        });
      } else {
        pickArea.innerHTML = waiting(`${escapeHtml(pickerName)} waehlt eine Kategorie ...`);
      }
      return true;
    }

    if (state.phase === 'spiel-auswahl') {
      if (isPicker) {
        if (!r.choices.length) {
          pickArea.innerHTML =
            `<div class="pick-title">Runde ${r.number}<br>Modus: ${modeLabel(r.mode)}<br>Gewaehlte Kategorie: ${categoryLabel(r.category)}</div>` +
            '<div class="waiting"><div class="big">Alle Spiele in dieser Kategorie wurden bereits gespielt.</div></div>' +
            '<button class="pick-btn" data-backcat>Zurueck zur Kategorie-Auswahl</button>';
          pickArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('pick:back-to-categories');
          return true;
        }

        pickArea.innerHTML =
          `<div class="pick-title">Runde ${r.number}<br>Modus: ${modeLabel(r.mode)}<br>Gewaehlte Kategorie: ${categoryLabel(r.category)}</div>` +
          '<div class="pick-title">Waehle ein Spiel:</div>' +
          '<div class="pick-grid">' +
          r.choices.map((c) => gameButton(c)).join('') +
          '</div>' +
          '<button class="pick-btn" data-backcat style="margin-top:12px;">Zurueck zur Kategorie-Auswahl</button>';
        pickArea.querySelectorAll('[data-game]').forEach((b) => {
          b.onclick = () => App.socket.emit('pick:spiel', { gameId: b.dataset.game });
        });
        pickArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('pick:back-to-categories');
      } else {
        pickArea.innerHTML = waiting(`${escapeHtml(pickerName)} waehlt ein Spiel ...`);
      }
      return true;
    }

    if (state.phase === 'spiel-details') {
      if (isPicker) {
        pickArea.innerHTML =
          gameDetails(r.selectedGame) +
          '<div class="pick-grid" style="margin-top:12px;">' +
          '<button class="pick-btn" data-start-picked>Spiel starten</button>' +
          '<button class="pick-btn" data-backcat>Zurueck zur Kategorie-Auswahl</button>' +
          '</div>';
        pickArea.querySelector('[data-start-picked]').onclick = () => App.socket.emit('pick:start-game');
        pickArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('pick:back-to-categories');
      } else {
        pickArea.innerHTML = waiting(`${escapeHtml(pickerName)} bereitet das Spiel vor ...`);
      }
      return true;
    }

    if (state.phase === 'spielerauswahl') {
      pickArea.innerHTML = playerSelectionHtml(state, myTeam, isPicker);
      pickArea.querySelectorAll('[data-player-index]').forEach((b) => {
        b.onclick = () => App.socket.emit('pick:spieler', { playerIndex: Number(b.dataset.playerIndex) });
      });
      const start = pickArea.querySelector('[data-start-selected]');
      if (start) start.onclick = () => App.socket.emit('pick:start-selected-game');
      return true;
    }

    if (state.phase === 'runden-uebersicht') {
      pickArea.innerHTML = waiting(
        `Runde ${r.number}/${r.total} - ${modeLabel(r.mode)}`,
        `${escapeHtml(pickerName)} waehlt gleich aus.`
      );
      return true;
    }

    if (state.phase === 'auswertung') {
      pickArea.innerHTML = waiting('Auswertung', 'Punkte werden vergeben ...');
      return true;
    }

    if (state.phase === 'bonus' || state.phase === 'finale') {
      pickArea.innerHTML = waiting(state.phase === 'bonus' ? 'Bonus' : 'Finale', '');
      return true;
    }

    pickArea.innerHTML = '';
    return false;
  }

  function gameButton(game) {
    return `<button class="pick-btn" data-game="${game.gameId}">
      ${escapeHtml(game.title || game.name)}
      <span class="sub">${categoryLabel(game.category)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</span>
    </button>`;
  }

  function gameDetails(game) {
    if (!game) return '<div class="waiting"><div class="big">Kein Spiel ausgewaehlt.</div></div>';
    return `
      <div class="card">
        <h2>${escapeHtml(game.title || game.name)}</h2>
        <div class="muted">${categoryLabel(game.category)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</div>
        ${detailRow('Kurzbeschreibung', game.description)}
        ${detailRow('Material', (game.materials || []).join(', '))}
        ${detailRow('Regeln', game.rules)}
      </div>`;
  }

  function playerSelectionHtml(state, myTeam, isPicker) {
    const team = state.teams.find((t) => t.id === myTeam);
    const selected = state.round.selectedPlayers || {};
    if (!team) return waiting('Team waehlen', '');

    const mySelected = selected[team.id];
    const buttons = (team.players || []).map((p, i) => {
      const disabled = p.einzelCount >= 2;
      const active = mySelected === i;
      return `<button class="pick-btn ${active ? 'good' : ''}" ${disabled ? 'disabled' : ''} data-player-index="${i}">
        ${escapeHtml(p.name)}
        <span class="sub">${p.einzelCount}/2 Einzelspiele${disabled ? ' - Limit erreicht' : ''}</span>
      </button>`;
    }).join('');
    const complete = Object.keys(selected).length >= state.teams.length;
    const status = state.teams.map((t) => {
      const idx = selected[t.id];
      return `<div>${escapeHtml(t.name)}: <b>${idx != null && t.players[idx] ? escapeHtml(t.players[idx].name) : 'offen'}</b></div>`;
    }).join('');

    return `
      <div class="pick-title">Wer spielt fuer ${escapeHtml(team.name)}?</div>
      <div class="pick-grid">${buttons}</div>
      <div class="waiting" style="padding:14px 8px;">${status}</div>
      ${isPicker ? `<button class="pick-btn" ${complete ? '' : 'disabled'} data-start-selected>Spiel starten</button>` : ''}`;
  }

  function waiting(big, sub) {
    return `<div class="waiting"><div class="big">${big}</div><div>${sub || ''}</div></div>`;
  }

  function renderBuzzer(state) {
    const me = App.me(state);
    const myTeam = me && me.teamId;
    const buzzer = state.buzzer;

    const myPress = buzzer.presses.find((p) => p.teamId === myTeam);
    const isArmed = buzzer.status === 'armed';

    buzzerBtn.disabled = !(isArmed && myTeam && !myPress);

    if (buzzer.status === 'locked') {
      buzzStatus.textContent = 'gesperrt';
      buzzStatus.style.color = 'var(--muted)';
    } else if (myPress) {
      buzzStatus.textContent = myPress.order === 1 ? 'Du warst zuerst!' : `Platz ${myPress.order}`;
      buzzStatus.style.color = myPress.order === 1 ? 'var(--good)' : 'var(--text)';
    } else if (isArmed) {
      buzzStatus.textContent = 'JETZT! Drueck den Buzzer!';
      buzzStatus.style.color = 'var(--accent)';
    } else {
      buzzStatus.textContent = '-';
    }
  }

  buzzerBtn.onclick = () => {
    App.socket.emit('buzz');
    if (navigator.vibrate) navigator.vibrate(40);
  };

  App.onState((state) => {
    const me = App.me(state);
    const myTeam = me && me.teamId;
    const team = myTeam && state.teams.find((t) => t.id === myTeam);

    whoEl.textContent = team ? `${team.name} - Gesamt ${team.score}` : 'Team waehlen';
    whoEl.style.color = team ? team.color : '';

    renderTeams(state);

    if (myTeam) {
      teamSelect.style.display = 'none';
      playArea.style.display = 'flex';
    } else {
      teamSelect.style.display = 'block';
      playArea.style.display = 'none';
    }

    renderPick(state, myTeam);

    const gameRunning = state.phase === 'spiel-aktiv' && state.activeGame;
    const usesBuzzer =
      gameRunning &&
      (state.activeGame.built === false ||
        !state.activeGame.interaktionstyp ||
        state.activeGame.interaktionstyp === 'buzzer');
    buzzerWrap.style.display = usesBuzzer ? 'flex' : 'none';

    phaseHint.textContent = gameRunning ? `Spiel: ${state.activeGame.title || state.activeGame.name}` : '';

    renderBuzzer(state);
    host.sync(state);
  });

  function detailRow(label, value) {
    return value ? `<div style="margin-top:8px;"><b>${label}:</b> ${escapeHtml(value)}</div>` : '';
  }

  function modeLabel(mode) { return mode === 'group' ? 'Gruppenspiel' : 'Einzelspiel'; }
  function categoryLabel(category) {
    return { sport: 'Sport', skill: 'Geschicklichkeit', quiz: 'Quiz' }[category] || category || '-';
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
