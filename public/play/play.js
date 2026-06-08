/* Spieler-Ansicht (iPad): Team waehlen, Buzzer, spielspezifischer Bereich. */
(function () {
  const whoEl = document.getElementById('who');
  const teamSelect = document.getElementById('team-select');
  const teamGrid = document.getElementById('team-grid');
  const playArea = document.getElementById('play-area');
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
    teamGrid.innerHTML = state.teams.map((t) => `
      <button class="team-btn ${myTeam === t.id ? 'active' : ''}"
              style="--tc:${t.color}" data-team="${t.id}">${escapeHtml(t.name)}</button>
    `).join('');
    teamGrid.querySelectorAll('[data-team]').forEach((btn) => {
      btn.onclick = () => App.socket.emit('join-team', { teamId: btn.dataset.team });
    });
  }

  // ---- Buzzer-Logik (rein aus State abgeleitet) ----
  function renderBuzzer(state) {
    const me = App.me(state);
    const myTeam = me && me.teamId;
    const buzzer = state.buzzer;

    // Reihenfolge meines Teams in den Presses ermitteln.
    const myPress = buzzer.presses.find((p) => p.teamId === myTeam);
    const isArmed = buzzer.status === 'armed';

    // Buzzer nur aktiv, wenn scharf UND mein Team noch nicht gebuzzert hat.
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
    // Haptisches Feedback auf iOS (sofern erlaubt).
    if (navigator.vibrate) navigator.vibrate(40);
  };

  App.onState((state) => {
    const me = App.me(state);
    const myTeam = me && me.teamId;
    const team = myTeam && state.teams.find((t) => t.id === myTeam);

    whoEl.textContent = team ? `${team.name} · ${team.score} Pkt` : 'Team waehlen';
    whoEl.style.color = team ? team.color : '';

    renderTeams(state);

    if (myTeam) {
      teamSelect.style.display = 'none';
      playArea.style.display = 'flex';
    } else {
      teamSelect.style.display = 'block';
      playArea.style.display = 'none';
    }

    // Buzzer nur zeigen, wenn das aktive Spiel den Buzzer nutzt (oder kein Spiel).
    const usesBuzzer = !state.activeGame || state.activeGame.interaktionstyp === 'buzzer';
    buzzerWrap.style.display = usesBuzzer ? 'flex' : 'none';

    phaseHint.textContent = state.activeGame
      ? `Spiel: ${state.activeGame.name}`
      : `Phase: ${state.phase}`;

    renderBuzzer(state);
    host.sync(state); // spielspezifischen Bereich aktualisieren
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
