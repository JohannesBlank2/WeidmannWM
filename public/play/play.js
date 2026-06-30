/* Handy-Ansicht: Spieler waehlen, Kategorie aussuchen, Spin ausloesen, Spielcontent sehen. */
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
    const isPicker = myPlayerId && myPlayerId === r.pickerPlayerId;
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);
    const pickerName = picker ? picker.name : '-';

    if (state.phase === 'runden-uebersicht') {
      pickArea.innerHTML = waiting(
        `Runde ${r.number}/${r.total}`,
        `${escapeHtml(pickerName)} waehlt gleich eine Kategorie.`
      );
      return;
    }

    if (state.phase === 'kategorie-auswahl') {
      if (isPicker) {
        const categories = r.availableCategories || [];
        pickArea.innerHTML =
          `<div class="pick-title">Du bist dran: Runde ${r.number}/${r.total}</div>` +
          '<div class="pick-sub">Kategorie waehlen</div>' +
          '<div class="pick-grid">' +
          categories.map((k) => `<button class="pick-btn" data-kat="${k}">${categoryLabel(k)}</button>`).join('') +
          '</div>';
        pickArea.querySelectorAll('[data-kat]').forEach((b) => {
          b.onclick = () => App.socket.emit('pick:kategorie', { kategorie: b.dataset.kat });
        });
      } else {
        pickArea.innerHTML = waiting(`${escapeHtml(pickerName)} waehlt eine Kategorie ...`, '');
      }
      return;
    }

    if (state.phase === 'spin-bereit') {
      const choices = (r.choices || []).map(gameButton).join('');
      if (isPicker) {
        pickArea.innerHTML =
          `<div class="pick-title">${categoryLabel(r.category)} ist gesetzt</div>` +
          '<div class="pick-sub">Auf dem TV stehen diese Spiele im Spin.</div>' +
          `<div class="choice-list">${choices}</div>` +
          '<button class="spin-btn" data-spin>SPIN</button>';
        pickArea.querySelector('[data-spin]').onclick = () => App.socket.emit('pick:spin');
      } else {
        pickArea.innerHTML =
          waiting(`${escapeHtml(pickerName)} darf jetzt spinnen.`, '') +
          `<div class="choice-list">${choices}</div>`;
      }
      return;
    }

    if (state.phase === 'spin-laeuft') {
      pickArea.innerHTML =
        waiting('Spin laeuft auf dem TV ...', 'Das Spiel wird gerade ausgelost.') +
        spinChoiceList(r);
      return;
    }

    if (state.phase === 'spiel-details') {
      pickArea.innerHTML =
        gameDetails(r.selectedGame) +
        '<div class="waiting" style="padding-top:12px;">Admin startet das Spiel.</div>';
      return;
    }

    if (state.phase === 'wetten') {
      pickArea.innerHTML = bettingHtml(state, myPlayerId);
      const submit = pickArea.querySelector('[data-submit-bet]');
      if (submit) {
        submit.onclick = () => {
          const target = pickArea.querySelector('[data-bet-target]').value;
          const amount = Number(pickArea.querySelector('[data-bet-amount]').value);
          App.socket.emit('bet:set', { targetPlayerId: target || null, amount });
        };
      }
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

  function gameDetails(game) {
    if (!game) return '<div class="waiting"><div class="big">Kein Spiel ausgelost.</div></div>';
    return `
      <div class="card">
        <h2>${escapeHtml(game.title || game.name)}</h2>
        <div class="muted">${categoryLabel(game.category)}${game.responsiblePerson ? ' - ' + escapeHtml(game.responsiblePerson) : ''}</div>
        ${detailRow('Kurzbeschreibung', game.description)}
        ${detailRow('Material', (game.materials || []).join(', '))}
        ${detailRow('Regeln', game.rules)}
      </div>`;
  }

  function bettingHtml(state, myPlayerId) {
    const round = state.round || {};
    const player = state.players.find((p) => p.id === myPlayerId);
    if (!player) return waiting('Spieler waehlen', '');

    const myBet = round.bets && round.bets[myPlayerId] && round.bets[myPlayerId].amount != null
      ? round.bets[myPlayerId]
      : null;
    const targets = state.players.filter((p) => p.id !== myPlayerId);
    const maxBet = Math.min(50, Math.max(0, player.score));
    const selectedTarget = myBet && myBet.targetPlayerId
      ? myBet.targetPlayerId
      : targets[0] && targets[0].id;
    const amount = myBet ? myBet.amount : 0;

    return `
      ${gameDetails(round.selectedGame)}
      <div class="card" style="margin-top:12px;">
        <h2>Geheimer Einsatz</h2>
        <div class="muted">Setze 0-${maxBet} Coins auf einen Mitspieler. Trifft dein Tipp auf den Spielsieger, bekommst du den Einsatz als Gewinn. Sonst verlierst du ihn.</div>
        <label class="bet-label">Mitspieler</label>
        <select class="bet-input" data-bet-target>
          ${targets.map((p) => `<option value="${p.id}" ${selectedTarget === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
        <label class="bet-label">Einsatz</label>
        <input class="bet-input" data-bet-amount type="number" min="0" max="${maxBet}" step="1" value="${amount}" />
        <button class="spin-btn" style="margin-top:12px;" data-submit-bet>Einsatz bestaetigen</button>
        <div class="waiting" style="padding:12px 0 0;">
          ${myBet ? `Gesetzt: ${myBet.amount} Coins${myBet.targetPlayerId ? ' auf ' + escapeHtml(playerName(state, myBet.targetPlayerId)) : ''}` : 'Noch nicht gesetzt.'}
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
    const myPlayerId = me && me.playerId;
    const player = myPlayerId && state.players.find((p) => p.id === myPlayerId);

    whoEl.textContent = player ? `${player.name} - ${player.score} Coins` : 'Spieler waehlen';
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

  function detailRow(label, value) {
    return value ? `<div style="margin-top:8px;"><b>${label}:</b> ${escapeHtml(value)}</div>` : '';
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
