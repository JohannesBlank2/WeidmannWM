/* Handy-Ansicht: Spieler wählen, Einsätze/Buzzer nutzen, Spielcontent sehen. */
(function () {
  const whoEl = document.getElementById('who');
  const playerSelect = document.getElementById('player-select');
  const playerGrid = document.getElementById('player-grid');
  const playArea = document.getElementById('play-area');
  const pickArea = document.getElementById('pick-area');
  const gameArea = document.getElementById('game-area');
  const buzzerWrap = document.getElementById('buzzer-wrap');
  const buzzerBtn = document.getElementById('buzzer');
  const buzzStatus = document.getElementById('buzz-status');
  const phaseHint = document.getElementById('phase-hint');

  injectBetStyles();

  const ctx = {
    socket: App.socket,
    clientId: App.clientId,
    role: 'play',
    view: 'play',
    sendAction: (a) => App.socket.emit('game:action', a),
  };
  const host = window.createGameHost(gameArea, ctx);

  function renderPlayers(state) {
    const me = App.me(state);
    const myPlayer = me && me.playerId;
    playerGrid.innerHTML = state.players
      .map((p) => `
      <button class="player-btn ${myPlayer === p.id ? 'active' : ''}"
              style="--pc:${p.color}" data-player="${p.id}">
        ${escapeHtml(p.name)}
        <span>${p.score} Coins</span>
      </button>`)
      .join('');
    playerGrid.querySelectorAll('[data-player]').forEach((btn) => {
      btn.onclick = () => App.socket.emit('join-player', { playerId: btn.dataset.player });
    });
  }

  function renderPick(state, myPlayerId) {
    const r = state.round || {};
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);
    const pickerName = picker ? picker.name : '-';

    if (state.phase === 'runden-uebersicht') {
      pickArea.innerHTML = waiting(
        `Runde ${r.number}/${r.total}`,
        'Admin stellt gleich das nächste Spiel vor.'
      );
      return;
    }

    if (state.phase === 'kategorie-auswahl') {
      pickArea.innerHTML = waiting('Spielauswahl', 'Admin wählt das nächste Show-Spiel.');
      return;
    }

    if (state.phase === 'spin-bereit') {
      const choices = (r.choices || []).map(gameButton).join('');
      pickArea.innerHTML =
        waiting('Spielauswahl', 'Admin startet die Vorstellung auf dem TV.') +
        `<div class="choice-list">${choices}</div>`;
      return;
    }

    if (state.phase === 'spin-laeuft') {
      pickArea.innerHTML =
        waiting('Spin läuft auf dem TV ...', 'Das Spiel wird gerade ausgelost.') +
        spinChoiceList(r);
      return;
    }

    if (state.phase === 'spiel-intro') {
      pickArea.innerHTML = r.intro && r.intro.status === 'ready'
        ? waiting('Gleich geht es los ...', 'Schau auf den TV.')
        : waiting('Spiel wird vorgestellt ...', 'Schau auf den TV.') + gameTitleOnly(r.selectedGame);
      return;
    }

    if (state.phase === 'spiel-details') {
      pickArea.innerHTML =
        gameTitleOnly(r.selectedGame) +
        '<div class="waiting" style="padding-top:12px;">Admin startet das Spiel.</div>';
      return;
    }

    if (state.phase === 'wetten') {
      pickArea.innerHTML = bettingHtml(state, myPlayerId);
      pickArea.querySelectorAll('[data-bet-target]').forEach((btn) => {
        btn.onclick = () => {
          App.socket.emit('bet:set', { targetPlayerId: btn.dataset.betTarget });
          if (navigator.vibrate) navigator.vibrate(30);
        };
      });
      return;
    }

    if (state.phase === 'auswertung') {
      pickArea.innerHTML = waiting('Auswertung', 'Coins werden ausgezahlt ...');
      return;
    }

    if (state.phase === 'finale') {
      pickArea.innerHTML = waiting('Finale', 'Die Show ist durch.');
      return;
    }

    pickArea.innerHTML = '';
  }

  function gameButton(game) {
    return `<div class="choice-pill">
      <b>${escapeHtml(game.title || game.name)}</b>
      <span>${categoryLabel(game.category)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</span>
    </div>`;
  }

  function spinChoiceList(round) {
    return `<div class="choice-list">${(round.choices || []).map(gameButton).join('')}</div>`;
  }

  function gameTitleOnly(game) {
    if (!game) return '<div class="waiting"><div class="big">Kein Spiel ausgelost.</div></div>';
    return `
      <div class="card">
        <h2>${escapeHtml(game.title || game.name)}</h2>
        <div class="muted">${categoryLabel(game.category)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</div>
      </div>`;
  }

  function bettingHtml(state, myPlayerId) {
    const round = state.round || {};
    const player = state.players.find((p) => p.id === myPlayerId);
    if (!player) return waiting('Spieler wählen', '');

    const myBet = round.bets && round.bets[myPlayerId] && round.bets[myPlayerId].targetPlayerId
      ? round.bets[myPlayerId]
      : null;
    const targets = state.players;
    const selectedTarget = myBet ? myBet.targetPlayerId : null;

    return `
      <div class="card">
        <div class="muted">Ausgewähltes Spiel</div>
        <h2>${escapeHtml(round.selectedGame ? round.selectedGame.title || round.selectedGame.name : 'Spiel')}</h2>
      </div>
      <div class="card" style="margin-top:12px;">
        <h2>Auf wen setzt du?</h2>
        <div class="muted">Du kannst auch auf dich selbst setzen, wenn du von dir überzeugt bist. Deine Chips legst du IRL vor dich; den Betrag trägt der Admin ein.</div>
        <div class="choice-list" style="margin-top:12px;">
          ${targets.map((p) => {
            const selected = selectedTarget === p.id;
            const self = p.id === myPlayerId;
            return `
              <button class="choice-pill bet-target-btn ${selected ? 'selected' : ''} ${self ? 'self' : ''}" style="--pc:${p.color}" data-bet-target="${p.id}">
                <b style="color:${p.color}">${selected ? '✓ ' : ''}${escapeHtml(p.name)}${self ? ' (du)' : ''}</b>
                <span>${selected ? (self ? 'AUSGEWÄHLT · EIGENSIEG' : 'AUSGEWÄHLT') : 'antippen zum Auswählen'}</span>
              </button>`;
          }).join('')}
        </div>
        <div class="waiting" style="padding:12px 0 0;">
          ${selectedTarget ? `Ausgewählt: ${escapeHtml(playerName(state, selectedTarget))}${selectedTarget === myPlayerId ? ' (du selbst)' : ''}` : 'Noch kein Spieler ausgewählt.'}
        </div>
      </div>`;
  }

  function waiting(big, sub) {
    return `<div class="waiting"><div class="big">${big}</div><div>${sub || ''}</div></div>`;
  }

  function renderBuzzer(state) {
    const me = App.me(state);
    const myPlayer = me && me.playerId;
    const buzzer = state.buzzer;

    const myPress = buzzer.presses.find((p) => p.playerId === myPlayer);
    const isArmed = buzzer.status === 'armed';

    buzzerBtn.disabled = !(isArmed && myPlayer && !myPress);

    if (buzzer.status === 'locked') {
      buzzStatus.textContent = 'gesperrt';
      buzzStatus.style.color = 'var(--muted)';
    } else if (myPress) {
      buzzStatus.textContent = myPress.order === 1 ? 'Du warst zuerst!' : `Platz ${myPress.order}`;
      buzzStatus.style.color = myPress.order === 1 ? 'var(--good)' : 'var(--text)';
    } else if (isArmed) {
      buzzStatus.textContent = 'JETZT! Drück den Buzzer!';
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
    const myPlayerId = me && me.playerId;
    const player = myPlayerId && state.players.find((p) => p.id === myPlayerId);

    whoEl.textContent = player ? `${player.name} - ${player.score} Coins` : 'Spieler wählen';
    whoEl.style.color = player ? player.color : '';

    renderPlayers(state);

    if (myPlayerId) {
      playerSelect.style.display = 'none';
      playArea.style.display = 'flex';
    } else {
      playerSelect.style.display = 'block';
      playArea.style.display = 'none';
    }

    renderPick(state, myPlayerId);

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

  function injectBetStyles() {
    if (document.getElementById('play-bet-target-styles')) return;
    const style = document.createElement('style');
    style.id = 'play-bet-target-styles';
    style.textContent = `
      .bet-target-btn {
        border: 1px solid var(--line);
        transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease;
      }
      .bet-target-btn.self {
        border-style: dashed;
      }
      .bet-target-btn.selected {
        border-color: var(--pc) !important;
        border-width: 2px;
        background: linear-gradient(180deg, rgba(255,209,92,.22), rgba(18,7,10,.84));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--pc) 62%, transparent), 0 0 26px color-mix(in srgb, var(--pc) 56%, transparent);
        transform: scale(1.025);
      }
      .bet-target-btn.selected span {
        color: #fff8df;
        font-weight: 900;
        letter-spacing: .06em;
      }
    `;
    document.head.appendChild(style);
  }

  function categoryLabel(category) {
    return { sport: 'Sport', skill: 'Geschicklichkeit', quiz: 'Quiz' }[category] || category || '-';
  }

  function playerName(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    return player ? player.name : '-';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
