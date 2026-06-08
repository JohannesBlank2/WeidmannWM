/* Admin-Steuerzentrale: Ablauf/Runden, Buzzer, Gesamt- & Spielpunkte, Spiele, Geraete. */
(function () {
  const KATEGORIEN = ['sport', 'quiz', 'geschicklichkeit', 'gruppe'];

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

  // ---- Ablauf-Buttons ----
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
        `Runde <b>${r.number}/${r.total}</b> &nbsp;·&nbsp; Modus: <b>${r.modus}</b>` +
        `&nbsp;·&nbsp; Auswahl: <b style="color:${picker ? picker.color : '#fff'}">` +
        `${picker ? esc(picker.name) : '—'}</b>` +
        (r.kategorie ? `&nbsp;·&nbsp; Kategorie: <b>${r.kategorie}</b>` : '');
    }

    // Kontextabhaengiger Auswahlbereich (Admin kann stellvertretend waehlen).
    if (state.phase === 'kategorie-auswahl') {
      pickerArea.innerHTML =
        '<div class="lbl">Kategorie stellvertretend waehlen:</div><div class="row">' +
        KATEGORIEN.map((k) => `<button data-pickkat="${k}">${k}</button>`).join('') +
        '</div>';
      pickerArea.querySelectorAll('[data-pickkat]').forEach((b) => {
        b.onclick = () =>
          App.socket.emit('admin:pick-kategorie', { kategorie: b.dataset.pickkat });
      });
    } else if (state.phase === 'spiel-auswahl') {
      pickerArea.innerHTML =
        '<div class="lbl">Spiel stellvertretend waehlen:</div><div class="row">' +
        r.choices
          .map(
            (c, i) =>
              `<button data-pickgame="${c.gameId}">${i + 1}. ${esc(c.name)}` +
              `${c.placeholder ? ' <span class="muted">(Demo)</span>' : ''}</button>`
          )
          .join('') +
        '</div>';
      pickerArea.querySelectorAll('[data-pickgame]').forEach((b) => {
        b.onclick = () =>
          App.socket.emit('admin:pick-spiel', { gameId: b.dataset.pickgame });
      });
    } else {
      pickerArea.innerHTML = '';
    }
  }

  // ---- Buzzer ----
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

  // ---- Teams: Gesamtpunkte (+1/-1) und Spielpunkte (+1/-1) ----
  function renderTeams(state) {
    teamsEl.innerHTML = '';
    state.teams.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'team-row';
      row.innerHTML = `
        <span class="dot" style="background:${t.color}"></span>
        <input type="text" value="${esc(t.name)}" data-rename="${t.id}" />
        <span class="ptbox">
          <span class="tag">Gesamt</span>
          <button class="bad" data-add="${t.id}" data-delta="-1">−1</button>
          <span class="sc">${t.score}</span>
          <button class="good" data-add="${t.id}" data-delta="1">+1</button>
        </span>
        <span class="ptbox game">
          <span class="tag">Spiel</span>
          <button class="bad" data-gadd="${t.id}" data-delta="-1">−1</button>
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
  }

  // ---- Spiele (Direktstart) ----
  function renderGames(state) {
    const activeId = state.activeGame && state.activeGame.id;
    activeGameEl.innerHTML = state.activeGame
      ? `Aktiv: <b>${esc(state.activeGame.name)}</b>`
      : 'Kein Spiel aktiv.';

    gamesEl.innerHTML =
      games
        .map(
          (g) => `
      <div class="game-item">
        <div class="info">
          <div class="nm">${esc(g.name)}</div>
          <div class="mt">${g.kategorie} · ${(g.modus || []).join('/')} · <span class="stars">${stars(g.schwierigkeit)}</span> · ${g.interaktionstyp}</div>
        </div>
        <button class="${activeId === g.id ? 'good' : 'primary'}" data-start="${g.id}">
          ${activeId === g.id ? '▶ laeuft' : 'Starten'}
        </button>
      </div>`
        )
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

  // ---- Verbundene Geraete ----
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

  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
