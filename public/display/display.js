/* Display-Ansicht: rendert Punktetabelle, Phase, aktives Spiel + Buzzer-Effekte. */
(function () {
  const phaseEl = document.getElementById('phase');
  const scoreboardEl = document.getElementById('scoreboard');
  const contentEl = document.getElementById('content');
  const winnerEl = document.getElementById('winner');
  const joinQrEl = document.getElementById('join-qr');

  document.getElementById('qr-play').src =
    '/qr?data=' + encodeURIComponent(location.origin + '/play/');

  // ctx fuer Spiel-Module (Ansicht "display").
  const ctx = {
    socket: App.socket,
    clientId: App.clientId,
    role: 'display',
    view: 'display',
    sendAction: (a) => App.socket.emit('game:action', a),
  };
  const host = window.createGameHost(contentEl, ctx);

  function renderScoreboard(state) {
    scoreboardEl.innerHTML = state.teams.map((t) => `
      <div class="score-team" style="--tc:${t.color}">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="score">${t.score}</div>
      </div>`).join('');
  }

  function renderStage(state) {
    // Wenn ein Spiel aktiv ist, uebernimmt das Spiel-Modul den Content-Bereich.
    if (state.activeGame) {
      joinQrEl.style.display = 'none';
      // Falls das Modul noch nichts gerendert hat, zeige wenigstens den Titel.
      if (!contentEl.dataset.gameMounted) {
        const g = state.activeGame;
        contentEl.innerHTML = `
          <div class="game-head">
            <div class="title">${escapeHtml(g.name)}</div>
            <div class="meta">${g.kategorie} · ${stars(g.schwierigkeit)} · ${g.interaktionstyp}</div>
          </div>`;
      }
      return;
    }

    // Kein Spiel aktiv -> Phasen-abhaengiger Idle-Screen.
    contentEl.dataset.gameMounted = '';
    joinQrEl.style.display = 'block';
    const labels = {
      'lobby': ['Willkommen', 'Teams treten bei … (auf den iPads /play oeffnen)'],
      'kategorie-auswahl': ['Kategorie-Auswahl', 'Gleich geht es los'],
      'spiel-aktiv': ['Bereit', 'Warte auf Spielstart'],
      'auswertung': ['Auswertung', 'Punkte werden vergeben'],
    };
    const [big, sub] = labels[state.phase] || ['Weidmann WM', ''];
    contentEl.innerHTML = `<div class="idle"><div class="big">${big}</div><div>${sub}</div></div>`;
  }

  App.onState((state) => {
    phaseEl.textContent = state.phase;
    renderScoreboard(state);
    renderStage(state);
    host.sync(state); // Spiel-Modul (falls vorhanden) aktualisieren
  });

  // ---- Buzzer-Effekte ----
  App.socket.on('fx:buzzer-armed', () => beep(660, 0.12));

  App.socket.on('fx:buzzer-winner', (w) => {
    winnerEl.querySelector('.wname').textContent = w.teamName;
    winnerEl.querySelector('.wname').style.color = w.color || '#fff';
    winnerEl.classList.add('show');
    beep(880, 0.18);
    setTimeout(() => beep(1175, 0.22), 130);
    setTimeout(() => winnerEl.classList.remove('show'), 3500);
  });

  // ---- Helpers ----
  let audioCtx = null;
  function beep(freq, dur) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = freq;
      o.type = 'square';
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.18, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* Audio evtl. erst nach User-Geste erlaubt */ }
  }

  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Module melden ueber dieses Flag, dass sie den Content selbst fuellen.
  window.__setGameMounted = (v) => { contentEl.dataset.gameMounted = v ? '1' : ''; };
})();
