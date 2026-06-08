/* Admin-Steuerzentrale: Phasen, Buzzer, Punkte, Teams, Spiele, Geraete. */
(function () {
  const PHASES = ['lobby', 'kategorie-auswahl', 'spiel-aktiv', 'auswertung'];
  const QUICK = [1, 2, 3, 5, 10];

  const phasesEl = document.getElementById('phases');
  const buzzStateEl = document.getElementById('buzz-state');
  const buzzOrderEl = document.getElementById('buzz-order');
  const teamsEl = document.getElementById('teams');
  const gamesEl = document.getElementById('games');
  const activeGameEl = document.getElementById('active-game');
  const clientsEl = document.getElementById('clients');

  let games = [];

  // Spielliste kommt mit 'hello' (oder per State, falls aktiv).
  App.socket.on('hello', (info) => {
    games = info.games || [];
    if (App.getState()) renderGames(App.getState());
  });

  // ---- Phasen ----
  function renderPhases(state) {
    phasesEl.innerHTML = PHASES.map((p) =>
      `<button data-phase="${p}" class="${state.phase === p ? 'active' : ''}">${p}</button>`
    ).join('');
    phasesEl.querySelectorAll('[data-phase]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:set-phase', { phase: b.dataset.phase });
    });
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
    buzzOrderEl.innerHTML = 'Reihenfolge: ' + state.buzzer.presses
      .map((p) => {
        const t = byId[p.teamId];
        return `<b style="color:${t ? t.color : '#fff'}">${p.order}. ${t ? esc(t.name) : p.teamId}</b>`;
      })
      .join(' &nbsp; ');
  }

  // ---- Teams & Punkte ----
  function renderTeams(state) {
    teamsEl.innerHTML = '';
    state.teams.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'team-row';
      row.innerHTML = `
        <span class="dot" style="background:${t.color}"></span>
        <input type="text" value="${esc(t.name)}" data-rename="${t.id}" />
        <span class="sc">${t.score}</span>
        <span class="pts row">
          ${QUICK.map((q) => `<button data-add="${t.id}" data-delta="${q}">+${q}</button>`).join('')}
          <button class="bad" data-add="${t.id}" data-delta="-1">−1</button>
          <button class="bad" data-add="${t.id}" data-delta="-5">−5</button>
        </span>`;
      teamsEl.appendChild(row);
    });

    teamsEl.querySelectorAll('[data-add]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:points',
        { teamId: b.dataset.add, delta: Number(b.dataset.delta) });
    });
    teamsEl.querySelectorAll('[data-rename]').forEach((inp) => {
      inp.onchange = () => App.socket.emit('admin:rename-team',
        { teamId: inp.dataset.rename, name: inp.value });
    });
  }

  // ---- Spiele ----
  function renderGames(state) {
    const activeId = state.activeGame && state.activeGame.id;
    activeGameEl.innerHTML = state.activeGame
      ? `Aktiv: <b>${esc(state.activeGame.name)}</b>`
      : 'Kein Spiel aktiv.';

    gamesEl.innerHTML = games.map((g) => `
      <div class="game-item">
        <div class="info">
          <div class="nm">${esc(g.name)}</div>
          <div class="mt">${g.kategorie} · <span class="stars">${stars(g.schwierigkeit)}</span> · ${g.interaktionstyp}</div>
        </div>
        <button class="${activeId === g.id ? 'good' : 'primary'}" data-start="${g.id}">
          ${activeId === g.id ? '▶ laeuft' : 'Starten'}
        </button>
      </div>`).join('') || '<div class="muted">Keine Spiele registriert.</div>';

    gamesEl.querySelectorAll('[data-start]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:start-game', { gameId: b.dataset.start });
    });
  }

  document.getElementById('stop-game').onclick =
    () => App.socket.emit('admin:stop-game');
  document.getElementById('reset-all').onclick = () => {
    if (confirm('Wirklich ALLE Punkte und Teamnamen zuruecksetzen?')) {
      App.socket.emit('admin:reset-all');
    }
  };

  // ---- Verbundene Geraete ----
  function renderClients(state) {
    const byTeam = Object.fromEntries(state.teams.map((t) => [t.id, t]));
    const entries = Object.entries(state.clients);
    if (!entries.length) { clientsEl.innerHTML = '<span class="muted">keine</span>'; return; }

    clientsEl.innerHTML = entries.map(([id, c]) => {
      const t = c.teamId && byTeam[c.teamId];
      const color = c.connected ? 'var(--good)' : 'var(--bad)';
      const label = t ? esc(t.name) : (c.role === 'admin' ? 'Admin' : c.role === 'display' ? 'Display' : 'kein Team');
      return `<span class="client-pill">
        <span class="d" style="background:${color}"></span>
        ${label} <span class="muted">${id.slice(0, 6)}</span>
      </span>`;
    }).join('');
  }

  App.onState((state) => {
    renderPhases(state);
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
