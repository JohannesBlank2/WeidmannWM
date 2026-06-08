/* Spieler-Ansicht (iPad): Team waehlen, Pick-Ablauf, Buzzer, Spiel-Modul. */
(function () {
  const KATEGORIEN = ['sport', 'quiz', 'geschicklichkeit', 'gruppe'];

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

  // ctx fuer Spiel-Module (Ansicht "play").
  const ctx = {
    socket: App.socket,
    clientId: App.clientId,
    role: 'play',
    view: 'play',
    sendAction: (a) => App.socket.emit('game:action', a),
  };
  const host = window.createGameHost(gameArea, ctx);

  // ---- Team-Auswahl ----
  function renderTeams(state) {
    const me = App.me(state);
    const myTeam = me && me.teamId;
    teamGrid.innerHTML = state.teams
      .map(
        (t) => `
      <button class="team-btn ${myTeam === t.id ? 'active' : ''}"
              style="--tc:${t.color}" data-team="${t.id}">${escapeHtml(t.name)}</button>`
      )
      .join('');
    teamGrid.querySelectorAll('[data-team]').forEach((btn) => {
      btn.onclick = () => App.socket.emit('join-team', { teamId: btn.dataset.team });
    });
  }

  // ---- Pick-Ablauf (Kategorie / Spiel) + Warten ----
  function renderPick(state, myTeam) {
    const r = state.round;
    const isPicker = myTeam && myTeam === r.pickerTeamId;
    const pickerTeam = r.pickerTeamId && state.teams.find((t) => t.id === r.pickerTeamId);
    const pickerName = pickerTeam ? pickerTeam.name : '—';

    if (state.phase === 'kategorie-auswahl') {
      if (isPicker) {
        pickArea.innerHTML =
          `<div class="pick-title">🎯 Waehle eine Kategorie (Modus: ${r.modus})</div>` +
          '<div class="pick-grid">' +
          KATEGORIEN.map((k) => `<button class="pick-btn" data-kat="${k}">${k}</button>`).join('') +
          '</div>';
        pickArea.querySelectorAll('[data-kat]').forEach((b) => {
          b.onclick = () => App.socket.emit('pick:kategorie', { kategorie: b.dataset.kat });
        });
      } else {
        pickArea.innerHTML = waiting(`${escapeHtml(pickerName)} waehlt eine Kategorie …`);
      }
      return true;
    }

    if (state.phase === 'spiel-auswahl') {
      if (isPicker) {
        pickArea.innerHTML =
          `<div class="pick-title">🎮 Waehle ein Spiel (${r.kategorie})</div>` +
          '<div class="pick-grid">' +
          r.choices
            .map(
              (c) =>
                `<button class="pick-btn" data-game="${c.gameId}">${escapeHtml(c.name)}` +
                `<span class="sub">${stars(c.schwierigkeit)} · ${c.interaktionstyp}</span></button>`
            )
            .join('') +
          '</div>';
        pickArea.querySelectorAll('[data-game]').forEach((b) => {
          b.onclick = () => App.socket.emit('pick:spiel', { gameId: b.dataset.game });
        });
      } else {
        pickArea.innerHTML = waiting(`${escapeHtml(pickerName)} waehlt ein Spiel …`);
      }
      return true;
    }

    if (state.phase === 'runden-uebersicht') {
      pickArea.innerHTML = waiting(
        `Runde ${r.number}/${r.total} · Modus ${r.modus}`,
        `${escapeHtml(pickerName)} waehlt gleich aus.`
      );
      return true;
    }

    if (state.phase === 'auswertung') {
      pickArea.innerHTML = waiting('Auswertung', 'Punkte werden vergeben …');
      return true;
    }

    if (state.phase === 'bonus' || state.phase === 'finale') {
      pickArea.innerHTML = waiting(state.phase === 'bonus' ? '⭐ Bonus' : '🏁 Finale', '');
      return true;
    }

    pickArea.innerHTML = '';
    return false;
  }

  function waiting(big, sub) {
    return `<div class="waiting"><div class="big">${big}</div><div>${sub || ''}</div></div>`;
  }

  // ---- Buzzer-Logik (rein aus State abgeleitet) ----
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
      buzzStatus.textContent = myPress.order === 1 ? '🏆 Du warst zuerst!' : `Platz ${myPress.order}`;
      buzzStatus.style.color = myPress.order === 1 ? 'var(--good)' : 'var(--text)';
    } else if (isArmed) {
      buzzStatus.textContent = 'JETZT! Drueck den Buzzer!';
      buzzStatus.style.color = 'var(--accent)';
    } else {
      buzzStatus.textContent = '—';
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

    whoEl.textContent = team ? `${team.name} · Gesamt ${team.score}` : 'Team waehlen';
    whoEl.style.color = team ? team.color : '';

    renderTeams(state);

    if (myTeam) {
      teamSelect.style.display = 'none';
      playArea.style.display = 'flex';
    } else {
      teamSelect.style.display = 'block';
      playArea.style.display = 'none';
    }

    // Pick-/Warte-Bereich rendern (alle Phasen ausser spiel-aktiv).
    renderPick(state, myTeam);

    // Spiel-Modul nur im aktiven Spiel; sonst Bereich leeren lassen.
    const gameRunning = state.phase === 'spiel-aktiv' && state.activeGame;

    // Buzzer nur im aktiven Spiel und wenn das Spiel den Buzzer nutzt.
    const usesBuzzer =
      gameRunning && (!state.activeGame.interaktionstyp || state.activeGame.interaktionstyp === 'buzzer');
    buzzerWrap.style.display = usesBuzzer ? 'flex' : 'none';

    phaseHint.textContent = gameRunning ? `Spiel: ${state.activeGame.name}` : '';

    renderBuzzer(state);
    host.sync(state); // Spiel-Modul (nur aktiv, wenn activeGame gesetzt)
  });

  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
