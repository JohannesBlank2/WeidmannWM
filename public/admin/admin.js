/* Admin-Konsole: Ablauf, Spin, Buzzer, Punkte, Spieler und Spiele. */
(function () {
  const phasePill = document.getElementById('phase-pill');
  const roundBanner = document.getElementById('round-banner');
  const pickerArea = document.getElementById('picker-area');
  const buzzStateEl = document.getElementById('buzz-state');
  const buzzOrderEl = document.getElementById('buzz-order');
  const playersEl = document.getElementById('players') || document.getElementById('teams');
  const featuredGamesEl = document.getElementById('featured-games');
  const gamesEl = document.getElementById('games');
  const activeGameEl = document.getElementById('active-game');
  const clientsEl = document.getElementById('clients');

  const DEFAULT_FEATURED_GAMES = [
    { slot: 1, gameId: 'schneid-in-die-haelfte', title: 'Halbe Sache', defaultTitle: 'Halbe Sache', animation: 'slot' },
    { slot: 2, gameId: 'fehlersuche', title: '2016?', defaultTitle: '2016?', animation: 'roulette' },
    { slot: 3, gameId: 'cornhole', title: 'Cornhole', defaultTitle: 'Cornhole', animation: 'cards' },
    { slot: 4, gameId: 'musik-erraten', title: 'Shazam', defaultTitle: 'Shazam', animation: 'wheel' },
    { slot: 5, gameId: 'einkauf-schaetzen', title: 'How much is the fish', defaultTitle: 'How much is the fish', animation: 'scratch' },
  ];

  let games = [];
  let featuredGames = DEFAULT_FEATURED_GAMES;

  App.socket.on('hello', (info) => {
    games = info.games || [];
    featuredGames = Array.isArray(info.featuredGames) && info.featuredGames.length
      ? info.featuredGames
      : DEFAULT_FEATURED_GAMES;
    if (App.getState()) renderGames(App.getState());
    if (App.getState()) renderFeaturedGames(App.getState());
  });

  const FLOW = {
    'show-lobby': 'admin:show-lobby',
    'stop-game': 'admin:stop-game',
    'goto-finale': 'admin:goto-finale',
    'reset-game-points': 'admin:reset-game-points',
  };

  document.querySelectorAll('[data-flow]').forEach((b) => {
    b.onclick = () => {
      const event = FLOW[b.dataset.flow];
      if (event) App.socket.emit(event);
    };
  });

  function renderAblauf(state) {
    phasePill.textContent = state.phase;
    const r = state.round || {};
    const picker = r.pickerPlayerId && state.players.find((p) => p.id === r.pickerPlayerId);

    if (state.phase === 'lobby') {
      roundBanner.innerHTML = '<span class="muted">Tisch wird angezeigt.</span>';
    } else if (r.number < 1) {
      roundBanner.innerHTML = '<span class="muted">Show noch nicht gestartet.</span>';
    } else if (r.selectedGame) {
      roundBanner.innerHTML =
        `Spiel <b>${r.number}/${r.total}</b>` +
        ` &middot; <b>${esc(r.selectedGame.title || r.selectedGame.name)}</b>`;
    } else {
      roundBanner.innerHTML =
        `Runde <b>${r.number}/${r.total}</b>` +
        ` &middot; Auswahl: <b style="color:${picker ? picker.color : '#fff'}">` +
        `${picker ? esc(picker.name) : '-'}</b>` +
        (r.category ? ` &middot; Kategorie: <b>${categoryLabel(r.category)}</b>` : '');
    }

    if (state.phase === 'kategorie-auswahl') {
      renderCategoryPick(r);
    } else if (state.phase === 'spin-bereit') {
      renderSpinReady(r);
    } else if (state.phase === 'spin-laeuft') {
      renderSpinRunning(r);
    } else if (state.phase === 'spiel-intro') {
      renderFeaturedIntro(r);
    } else if (state.phase === 'spiel-details') {
      renderGameDetails(r);
    } else if (state.phase === 'wetten') {
      renderBetting(state);
    } else if (state.phase === 'auswertung') {
      renderAuswertung(state);
    } else {
      pickerArea.innerHTML = '';
    }
  }

  function renderFeaturedIntro(round) {
    const game = round.selectedGame;
    const intro = round.intro || {};

    if (intro.status === 'ready') {
      pickerArea.innerHTML =
        '<div class="lbl">Vorbereitet (auf dem TV noch verdeckt):</div>' +
        `<div class="game-detail">
          <h3>${esc(game ? game.title || game.name : 'Show-Spiel')}</h3>
          <div class="muted">${introLabel(intro, game)} bereit zum Start.</div>
        </div>` +
        '<div class="row" style="margin-top:10px;">' +
        '<button class="good bigbtn" data-start-featured-intro>▶ Animation starten</button>' +
        '</div>';
      pickerArea.querySelector('[data-start-featured-intro]').onclick = () =>
        App.socket.emit('admin:start-featured-intro');
      return;
    }

    pickerArea.innerHTML =
      '<div class="lbl">Spiel wird vorgestellt:</div>' +
      `<div class="game-detail">
        <h3>${esc(game ? game.title || game.name : 'Show-Spiel')}</h3>
        <div class="muted">${introLabel(intro, game)} läuft auf dem TV.</div>
      </div>` +
      '<div class="row" style="margin-top:10px;">' +
      '<button class="good bigbtn" data-finish-featured-intro>Zurück zum Tisch</button>' +
      '</div>';
    pickerArea.querySelector('[data-finish-featured-intro]').onclick = () =>
      App.socket.emit('admin:finish-featured-intro');
  }

  function renderCategoryPick(round) {
    const categories = round.availableCategories || [];
    pickerArea.innerHTML =
      '<div class="lbl">Kategorie stellvertretend wählen:</div><div class="row">' +
      categories.map((k) => `<button data-pickkat="${k}">${categoryLabel(k)}</button>`).join('') +
      '</div>' +
      (!categories.length
        ? '<div class="muted">Keine Kategorie mit offenen Spielen verfügbar.</div>'
        : '');

    pickerArea.querySelectorAll('[data-pickkat]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:pick-kategorie', { kategorie: b.dataset.pickkat });
    });
  }

  function renderSpinReady(round) {
    pickerArea.innerHTML =
      '<div class="lbl">Spin bereit:</div>' +
      choicesHtml(round.choices || []) +
      '<div class="row" style="margin-top:10px;">' +
      '<button class="good" data-start-spin>Spin starten</button>' +
      '<button data-backcat>Zurück zur Kategorie-Auswahl</button>' +
      '</div>';
    pickerArea.querySelector('[data-start-spin]').onclick = () => App.socket.emit('admin:start-spin');
    pickerArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('admin:back-to-categories');
  }

  function renderSpinRunning(round) {
    const spin = round.spin || {};
    pickerArea.innerHTML =
      '<div class="lbl">Spin läuft:</div>' +
      choicesHtml(round.choices || []) +
      `<div class="muted" style="margin-top:8px;">Gewinner wird nach ${Math.round((spin.durationMs || 0) / 1000)}s angezeigt.</div>` +
      '<div class="row" style="margin-top:10px;"><button data-finish-spin>Sofort auflösen</button></div>';
    pickerArea.querySelector('[data-finish-spin]').onclick = () => App.socket.emit('admin:finish-spin');
  }

  function renderGameDetails(round) {
    pickerArea.innerHTML =
      gameDetails(round.selectedGame) +
      '<div class="row" style="margin-top:10px;">' +
      '<button class="good" data-start-picked>Spiel starten</button>' +
      '<button data-backcat>Zurück zur Kategorie-Auswahl</button>' +
      '</div>';
    pickerArea.querySelector('[data-start-picked]').onclick = () => App.socket.emit('admin:start-picked-game');
    pickerArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('admin:back-to-categories');
  }

  function renderBetting(state) {
    const round = state.round || {};
    const betCount = round.betCount || 0;
    const betTotal = round.betTotal || state.players.length;
    const betsRevealed = round.betsRevealed === true;
    pickerArea.innerHTML =
      gameDetails(round.selectedGame) +
      `<div class="game-detail" style="margin-top:10px;">
        <b>Geheime Einsätze</b>
        <div class="muted">${betCount}/${betTotal} Spieler haben gesetzt. Nicht gesetzte Einsätze zählen als 0. TV: ${betsRevealed ? 'sichtbar' : 'verdeckt'}.</div>
        <div class="spin-admin-list">${state.players.map((p) => {
          const status = (round.betStatus || []).find((entry) => entry.playerId === p.id);
          return `<div class="game-detail mini"><b style="color:${p.color}">${esc(p.name)}</b> ${status && status.submitted ? 'gesetzt' : 'offen'}</div>`;
        }).join('')}</div>
      </div>` +
      '<div class="row" style="margin-top:10px;">' +
      `<button class="${betsRevealed ? '' : 'primary'}" data-toggle-bets-revealed>${betsRevealed ? 'Einsätze wieder verdecken' : 'Einsätze auf TV aufdecken'}</button>` +
      '<button class="good" data-start-picked>Spiel starten</button>' +
      '<button data-backcat>Zurück zur Kategorie-Auswahl</button>' +
      '</div>';
    pickerArea.querySelector('[data-toggle-bets-revealed]').onclick = () =>
      App.socket.emit('admin:set-bets-revealed', { revealed: !betsRevealed });
    pickerArea.querySelector('[data-start-picked]').onclick = () => App.socket.emit('admin:start-picked-game');
    pickerArea.querySelector('[data-backcat]').onclick = () => App.socket.emit('admin:back-to-categories');
  }

  function renderAuswertung(state) {
    const round = state.round || {};
    const placements = round.placements || {};
    const complete = state.players.every((p) => placements[p.id] != null);
    pickerArea.innerHTML =
      `<div class="lbl">Auswertung: ${round.selectedGame ? esc(round.selectedGame.title || round.selectedGame.name) : 'Spiel'}</div>` +
      '<div class="muted" style="margin-bottom:8px;">Platzpunkte: 1.=50, 2.=40, 3.=30, 4.=20, 5.=10. Danach werden die geheimen Einsätze verrechnet.</div>' +
      '<div class="spin-admin-list">' +
      state.players.map((p) => placementRow(p, placements[p.id])).join('') +
      '</div>' +
      '<div class="row" style="margin-top:10px;">' +
      `<button class="good" ${complete && !round.payoutApplied ? '' : 'disabled'} data-apply-payouts>Auszahlung anwenden</button>` +
      '</div>' +
      payoutSummaryHtml(state);

    pickerArea.querySelectorAll('[data-place]').forEach((btn) => {
      btn.onclick = () =>
        App.socket.emit('admin:set-placement', {
          playerId: btn.dataset.player,
          place: Number(btn.dataset.place),
        });
    });
    const apply = pickerArea.querySelector('[data-apply-payouts]');
    if (apply) apply.onclick = () => App.socket.emit('admin:apply-payouts');
  }

  function placementRow(player, place) {
    return `
      <div class="game-detail mini">
        <div><b style="color:${player.color}">${esc(player.name)}</b> ${place ? `&middot; ${place}. Platz (${placeAward(place)} Coins)` : '&middot; noch offen'}</div>
        <div class="row" style="margin-top:6px;">
          ${[1, 2, 3, 4, 5].map((n) =>
            `<button class="${place === n ? 'primary' : ''}" data-player="${player.id}" data-place="${n}">${n}</button>`
          ).join('')}
        </div>
      </div>`;
  }

  function payoutSummaryHtml(state) {
    const summary = state.round && state.round.payoutSummary;
    if (!Array.isArray(summary) || !summary.length) return '';
    return '<div class="game-detail" style="margin-top:10px;"><b>Auszahlung</b>' +
      summary
        .sort((a, b) => a.place - b.place)
        .map((row) => `
          <div style="margin-top:8px;">
            <b>${row.place}. ${esc(row.playerName)}</b>:
            +${row.award} Platz
            ${row.betAmount ? ` ${row.betWon ? '+' : ''}${row.betDelta} Wette auf ${esc(row.betTargetName || '-')}` : ' +0 Wette'}
            = <b>${row.finalScore}</b> Coins
          </div>`)
        .join('') +
      '</div>';
  }

  function choicesHtml(choices) {
    if (!choices.length) return '<div class="muted">Keine Spiele im Spin.</div>';
    return '<div class="spin-admin-list">' +
      choices
        .map((c, i) => `
          <div class="game-detail mini">
            <b>${i + 1}. ${esc(c.title || c.name)}</b>
            <div class="muted">${categoryLabel(c.category)}${c.responsiblePerson ? ' - ' + esc(c.responsiblePerson) : ''}</div>
          </div>`)
        .join('') +
      '</div>';
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
    const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
    buzzOrderEl.innerHTML =
      'Reihenfolge: ' +
      state.buzzer.presses
        .map((press) => {
          const player = byId[press.playerId];
          return `<b style="color:${player ? player.color : '#fff'}">${press.order}. ${player ? esc(player.name) : press.playerId}</b>`;
        })
        .join(' &nbsp; ');
  }

  function renderPlayers(state) {
    playersEl.innerHTML = '';
    state.players.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <span class="dot" style="background:${p.color}"></span>
        <input type="text" value="${esc(p.name)}" data-rename="${p.id}" />
        <span class="ptbox">
          <span class="tag">Coins</span>
          <button class="bad" data-add="${p.id}" data-delta="-5">-5</button>
          <span class="sc">${p.score}</span>
          <button class="good" data-add="${p.id}" data-delta="5">+5</button>
        </span>
        <span class="ptbox game">
          <span class="tag">Spiel</span>
          <button class="bad" data-gadd="${p.id}" data-delta="-5">-5</button>
          <span class="sc">${p.gameScore}</span>
          <button class="good" data-gadd="${p.id}" data-delta="5">+5</button>
        </span>`;
      playersEl.appendChild(row);
    });

    playersEl.querySelectorAll('[data-add]').forEach((b) => {
      b.onclick = () =>
        App.socket.emit('admin:points', { playerId: b.dataset.add, delta: Number(b.dataset.delta) });
    });
    playersEl.querySelectorAll('[data-gadd]').forEach((b) => {
      b.onclick = () =>
        App.socket.emit('admin:game-points', { playerId: b.dataset.gadd, delta: Number(b.dataset.delta) });
    });
    playersEl.querySelectorAll('[data-rename]').forEach((inp) => {
      inp.onchange = () =>
        App.socket.emit('admin:rename-player', { playerId: inp.dataset.rename, name: inp.value });
    });
  }

  function renderGames(state) {
    const activeId = state.activeGame && state.activeGame.id;
    activeGameEl.innerHTML = state.activeGame
      ? `Aktiv: <b>${esc(state.activeGame.title || state.activeGame.name)}</b>${woLiegtWasAdminControls(state)}`
      : 'Kein Spiel aktiv.';

    gamesEl.innerHTML =
      games
        .map((g) => `
      <div class="game-item">
        <div class="info">
          <div class="nm">${esc(g.title || g.name)}</div>
          <div class="mt">${categoryLabel(g.category)} &middot; ${g.interaktionstyp}${g.built === false ? ' &middot; Platzhalter' : ''}</div>
        </div>
        <button class="${activeId === g.id ? 'good' : 'primary'}" data-start="${g.id}">
          ${activeId === g.id ? 'läuft' : 'Starten'}
        </button>
      </div>`)
        .join('') || '<div class="muted">Keine Spiele registriert.</div>';

    gamesEl.querySelectorAll('[data-start]').forEach((b) => {
      b.onclick = () => App.socket.emit('admin:start-game', { gameId: b.dataset.start });
    });
    wireWoLiegtWasAdminControls();
  }

  function woLiegtWasAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'wo-liegt-was') return '';
    const game = state.gameState || {};
    const questions = Array.isArray(game.questions) ? game.questions : [];
    const current = game.currentQuestion;
    const phase = game.phase || 'setup';
    const pins = game.pins || {};
    const confirmed = state.players.filter((player) => pins[player.id] && pins[player.id].confirmed).length;
    const placed = state.players.filter((player) => pins[player.id]).length;
    const winnerText = woLiegtWasWinnerText(state);
    const targetMissing = current && !woLiegtWasHasTarget(current);

    return `
      <div class="game-detail" style="margin-top:10px;">
        <b>WO LIEGT WAS?</b>
        <div class="muted">Status: ${phaseLabel(phase)} · ${placed}/${state.players.length} gesetzt · ${confirmed}/${state.players.length} bestätigt</div>
        ${current ? `
          <div style="margin-top:8px;"><b>${esc(current.questionText)}</b></div>
          ${current.subtitle ? `<div class="muted">${esc(current.subtitle)}</div>` : ''}
          <div class="muted">${esc(current.mapLabel || 'Stumme Karte')} · ${esc(current.category || 'Frage')} · Ziel: ${esc(current.targetName || '-')}</div>
          ${targetMissing ? '<div style="margin-top:8px; color:#ffd15c; font-weight:900;">Diese Frage hat noch keine Zielkoordinaten.</div>' : ''}
        ` : '<div class="muted" style="margin-top:8px;">Noch keine Frage ausgewählt.</div>'}
        <div class="row" style="margin-top:10px;">
          <button data-wlw-action="random">Zufällige Frage</button>
          ${phase === 'setup' && current ? '<button class="good" data-wlw-action="start">Eingabe starten</button>' : ''}
          ${phase === 'placing' ? '<button data-wlw-action="lock">Eingabe schließen</button>' : ''}
          ${phase === 'locked' || phase === 'placing' ? '<button class="primary" data-wlw-action="reveal">Auflösen</button>' : ''}
          ${['reveal', 'result'].includes(phase) ? '<button class="good" data-wlw-action="confirm-result" ' + (game.pointsAwarded || game.tie || game.targetMissing ? 'disabled' : '') + '>Punkt vergeben / Ergebnis bestätigen</button>' : ''}
          ${phase === 'reveal' ? '<button data-wlw-action="result">Ergebnis nur anzeigen</button>' : ''}
          ${current ? '<button data-wlw-action="reset">Runde zurücksetzen</button>' : ''}
          <button data-wlw-action="next">Nächste Frage</button>
          <button data-wlw-action="new-round">Neue Runde</button>
          <button data-wlw-action="menu">Zurück zum Spielmenü</button>
        </div>
        ${game.targetMissing && ['reveal', 'result'].includes(phase) ? '<div class="game-detail mini" style="margin-top:10px;"><b>Zielkoordinaten fehlen – Auswertung nicht möglich.</b></div>' : ''}
        ${winnerText ? `<div class="game-detail mini" style="margin-top:10px;"><b>${winnerText}</b>${game.pointsAwarded ? '<div class="muted">Punkt wurde bereits vergeben.</div>' : ''}</div>` : ''}
        ${phase === 'setup' ? questionButtons(questions, current) : ''}
        ${woLiegtWasResults(state)}
      </div>`;
  }

  function questionButtons(questions, current) {
    if (!questions.length) return '<div class="muted" style="margin-top:8px;">Keine Fragen geladen.</div>';
    return `
      <div class="spin-admin-list" style="margin-top:10px;">
        ${questions.map((question) => `
          <button class="${current && current.id === question.id ? 'primary' : ''}" data-wlw-question="${esc(question.id)}">
            ${esc(question.questionText)}
            <span>${esc(question.mapLabel || 'Stumme Karte')}${woLiegtWasHasTarget(question) ? '' : ' · Zielkoordinaten fehlen'}</span>
          </button>
        `).join('')}
      </div>`;
  }

  function woLiegtWasResults(state) {
    const results = state.gameState && Array.isArray(state.gameState.results)
      ? state.gameState.results
      : [];
    if (!results.length) return '';
    return `
      <div class="spin-admin-list" style="margin-top:10px;">
        ${results.map((row, index) => `
          <div class="game-detail mini">
            <b>${index + 1}. ${esc(row.playerName)}</b>
            <div class="muted">${row.distanceKm == null ? (row.hasPin && row.targetMissing ? 'Keine Auswertung' : 'Keine Eingabe') : `${String(Math.round(row.distanceKm)).replace('.', ',')} km entfernt`}</div>
          </div>
        `).join('')}
      </div>`;
  }

  function woLiegtWasWinnerText(state) {
    const game = state.gameState || {};
    if (game.targetMissing && ['reveal', 'result'].includes(game.phase)) return '';
    const winnerIds = Array.isArray(game.winnerPlayerIds) ? game.winnerPlayerIds : [];
    if (!winnerIds.length) return '';
    if (game.tie || winnerIds.length > 1) {
      return `Unentschieden: ${winnerIds.map((id) => playerName(state, id)).join(' & ')}`;
    }
    return `Rundensieger: ${playerName(state, winnerIds[0])}`;
  }

  function woLiegtWasHasTarget(question) {
    return Boolean(
      question &&
        isFiniteCoordinate(question.targetLatitude) &&
        isFiniteCoordinate(question.targetLongitude),
    );
  }

  function isFiniteCoordinate(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function wireWoLiegtWasAdminControls() {
    activeGameEl.querySelectorAll('[data-wlw-question]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: 'wlw:select-question',
          questionId: button.dataset.wlwQuestion,
        });
    });
    activeGameEl.querySelectorAll('[data-wlw-action]').forEach((button) => {
      button.onclick = () => {
        const type = {
          random: 'wlw:random-question',
          start: 'wlw:start-placing',
          lock: 'wlw:lock',
          reveal: 'wlw:reveal',
          result: 'wlw:show-result',
          'confirm-result': 'wlw:confirm-result',
          reset: 'wlw:reset-round',
          next: 'wlw:next-question',
          'new-round': 'wlw:new-round',
        }[button.dataset.wlwAction];
        if (button.dataset.wlwAction === 'menu') {
          App.socket.emit('admin:stop-game');
        } else if (type) {
          App.socket.emit('game:action', { type });
        }
      };
    });
  }

  function playerName(state, playerId) {
    const player = state.players.find((entry) => entry.id === playerId);
    return player ? player.name : playerId;
  }

  function phaseLabel(phase) {
    return {
      setup: 'Frage wählen',
      placing: 'Pins setzen',
      locked: 'Eingabe geschlossen',
      reveal: 'Auflösung',
      result: 'Ergebnis',
    }[phase] || phase || '-';
  }

  function renderFeaturedGames(state) {
    const currentGameId = state.round && state.round.gameId;
    const introRunning = state.phase === 'spiel-intro';
    const titleOverrides = state.meta && state.meta.featuredGameTitles
      ? state.meta.featuredGameTitles
      : {};
    featuredGamesEl.innerHTML =
      '<div class="lbl">Feste Show-Spiele:</div>' +
      featuredGames
        .map((game) => {
          const isCurrent = currentGameId === game.gameId &&
            ['spiel-intro', 'wetten', 'spiel-aktiv', 'auswertung'].includes(state.phase);
          const title = titleOverrides[String(game.slot)] || titleOverrides[game.gameId] || game.defaultTitle || game.title;
          return `
            <div class="featured-game-row ${isCurrent ? 'current' : ''}">
              <div class="featured-game-title">
                <label for="featured-title-${game.slot}">Spiel ${game.slot}</label>
                <input id="featured-title-${game.slot}" type="text" value="${esc(title)}"
                  maxlength="80" data-featured-title="${game.slot}" />
              </div>
              <button class="featured-game-action ${isCurrent ? 'primary' : ''}" data-featured-slot="${game.slot}">
                Anzeigen
              </button>
              <div class="featured-game-meta">${animationLabel(game.animation)} &middot; ${esc(game.gameId)}</div>
            </div>`;
        })
        .join('');

    featuredGamesEl.querySelectorAll('[data-featured-title]').forEach((input) => {
      input.onchange = () =>
        App.socket.emit('admin:set-featured-title', {
          slot: Number(input.dataset.featuredTitle),
          title: input.value,
        });
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          input.blur();
        }
      };
    });

    featuredGamesEl.querySelectorAll('[data-featured-slot]').forEach((btn) => {
      btn.disabled = introRunning;
      btn.onclick = () =>
        App.socket.emit('admin:prepare-featured-game', { slot: Number(btn.dataset.featuredSlot) });
    });
  }

  document.getElementById('reset-all').onclick = () => {
    if (confirm('Wirklich ALLE Coins und den Ablauf zurücksetzen? (Spielernamen bleiben)')) {
      App.socket.emit('admin:reset-all');
    }
  };

  function renderClients(state) {
    const byPlayer = Object.fromEntries(state.players.map((p) => [p.id, p]));
    const entries = Object.entries(state.clients);
    if (!entries.length) {
      clientsEl.innerHTML = '<span class="muted">keine</span>';
      return;
    }
    clientsEl.innerHTML = entries
      .map(([id, c]) => {
        const player = c.playerId && byPlayer[c.playerId];
        const color = c.connected ? 'var(--good)' : 'var(--bad)';
        const label = player
          ? esc(player.name)
          : c.role === 'admin'
          ? 'Admin'
          : c.role === 'display'
          ? 'TV'
          : 'kein Spieler';
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
    renderPlayers(state);
    renderFeaturedGames(state);
    renderGames(state);
    renderClients(state);
  });

  function gameDetails(game) {
    if (!game) return '<div class="muted">Kein Spiel ausgelost.</div>';
    return `
      <div class="lbl">Ausgelost:</div>
      <div class="game-detail">
        <h3>${esc(game.title || game.name)}</h3>
        <div class="muted">${categoryLabel(game.category)}${game.responsiblePerson ? ' &middot; ' + esc(game.responsiblePerson) : ''}</div>
        ${detailRow('Kurzbeschreibung', game.description)}
        ${detailRow('Material', (game.materials || []).join(', '))}
        ${detailRow('Regeln', game.rules)}
      </div>`;
  }

  function detailRow(label, value) {
    return value ? `<div style="margin-top:8px;"><b>${label}:</b> ${esc(value)}</div>` : '';
  }

  function categoryLabel(category) {
    return { sport: 'Sport', skill: 'Geschicklichkeit', quiz: 'Quiz' }[category] || category || '-';
  }

  function introLabel(intro, game) {
    if (!intro) return 'Animation';
    if (intro.animation === 'scratch' || (intro.animation === 'reveal' && game && game.id === 'einkauf-schaetzen')) return 'Rubbelkarte';
    if (intro.animation === 'roulette') return 'Roulette';
    if (intro.animation === 'cards') return 'Poker-Karten';
    if (intro.animation === 'wheel') return 'Glücksrad';
    return intro.animation === 'slot' ? 'Einarmiger Bandit' : 'Spiel-Reveal';
  }

  function animationLabel(animation) {
    if (animation === 'slot') return 'Einarmiger Bandit';
    if (animation === 'roulette') return 'Roulette';
    if (animation === 'cards') return 'Poker-Karten';
    if (animation === 'wheel') return 'Glücksrad';
    if (animation === 'scratch') return 'Rubbelkarte';
    return 'Reveal';
  }

  function placeAward(place) {
    return { 1: 50, 2: 40, 3: 30, 4: 20, 5: 10 }[place] || 0;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
