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
  const gameStartSelectEl = document.getElementById('game-start-select');
  const gameStartButtonEl = document.getElementById('game-start-btn');
  const activeGameEl = document.getElementById('active-game');
  const ambientMusicEl = document.getElementById('ambient-music-admin');
  const winnerSoundBtn = document.getElementById('winner-sound-btn');

  const DEFAULT_FEATURED_GAMES = [
    { slot: 1, gameId: 'schneid-in-die-haelfte', title: 'Halbe Sachen', defaultTitle: 'Halbe Sachen', animation: 'slot' },
    { slot: 2, gameId: 'musik-erraten', title: 'Shazam', defaultTitle: 'Shazam', animation: 'wheel' },
    { slot: 3, gameId: 'wo-liegt-was', title: 'Wo liegt was?', defaultTitle: 'Wo liegt was?', animation: 'roulette' },
    { slot: 4, gameId: 'dart-ringe', title: 'Dartringe', defaultTitle: 'Dartringe', animation: 'cards' },
    { slot: 5, gameId: 'einkauf-schaetzen', title: 'How much is the fish', defaultTitle: 'How much is the fish', animation: 'scratch' },
  ];
  const AMBIENT_TRACKS = [
    { id: 'hide', label: 'Sehr spannend', file: 'hide.mp3' },
    { id: 'pick-your-poison', label: 'Mittel', file: 'pick-your-poison.mp3' },
    { id: 'blind-spot', label: 'Chill', file: 'blind-spot.mp3' },
    { id: 'poker-ambiente', label: 'Poker Ambiente (Finale)', file: 'poker-ambiente.mp3' },
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

  if (winnerSoundBtn) {
    // Der Sound läuft auf dem Display; die Konsole sendet nur Steuer-Events.
    let winnerPlaying = false;
    const setWinnerBtn = (playing) => {
      winnerPlaying = playing;
      winnerSoundBtn.textContent = playing ? '■ Winner Sound stoppen' : '▶ Winner Sound abspielen';
      winnerSoundBtn.classList.toggle('bad', playing);
      winnerSoundBtn.classList.toggle('good', !playing);
    };
    App.socket.on('fx:winner-sound', ({ playing } = {}) => setWinnerBtn(!!playing));
    winnerSoundBtn.onclick = () => {
      App.socket.emit('admin:winner-sound', { playing: !winnerPlaying });
    };
  }

  if (ambientMusicEl) {
    ambientMusicEl.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const enabledButton = target.closest('[data-ambient-enabled]');
      if (enabledButton && ambientMusicEl.contains(enabledButton)) {
        const music = ambientMusicState(App.getState() || {});
        App.socket.emit('admin:ambient-music', {
          enabled: enabledButton.dataset.ambientEnabled === '1',
          trackId: music.trackId,
        });
        return;
      }

    });

    ambientMusicEl.addEventListener('change', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      if (target.matches('[data-ambient-volume]')) {
        App.socket.emit('admin:ambient-music', {
          volume: Number(target.value),
        });
      }

      if (target.matches('[data-ambient-track-select]')) {
        App.socket.emit('admin:ambient-music', {
          enabled: true,
          trackId: target.value,
        });
      }
    });
  }

  if (gameStartButtonEl && gameStartSelectEl) {
    gameStartButtonEl.onclick = () => {
      if (!gameStartSelectEl.value) return;
      App.socket.emit('admin:start-game', { gameId: gameStartSelectEl.value });
    };
  }

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

  function renderAmbientMusic(state) {
    if (!ambientMusicEl) return;
    const music = ambientMusicState(state);
    const selected = AMBIENT_TRACKS.find((track) => track.id === music.trackId) || AMBIENT_TRACKS[0];
    ambientMusicEl.innerHTML = `
      <div class="ambient-admin-status">
        Status: <b>${music.enabled ? 'läuft' : 'aus'}</b> · ${esc(selected.label)} · ${music.volume}%
      </div>
      <div class="ambient-admin-compact">
        <select class="admin-select" data-ambient-track-select>
          ${AMBIENT_TRACKS.map((track) => `
            <option value="${esc(track.id)}" ${track.id === selected.id ? 'selected' : ''}>
              ${esc(track.label)}
            </option>
          `).join('')}
        </select>
        <button class="${music.enabled ? 'bad' : 'good'}" data-ambient-enabled="${music.enabled ? '0' : '1'}">
          ${music.enabled ? 'Ausschalten' : 'Einschalten'}
        </button>
      </div>
      <label class="ambient-volume">
        <input type="range" min="0" max="100" step="1" value="${music.volume}" data-ambient-volume />
        <span>${music.volume}%</span>
      </label>`;
  }

  function ambientMusicState(state) {
    const raw = state.ambientMusic && typeof state.ambientMusic === 'object'
      ? state.ambientMusic
      : {};
    const trackId = AMBIENT_TRACKS.some((track) => track.id === raw.trackId)
      ? raw.trackId
      : AMBIENT_TRACKS[0].id;
    const volume = Math.max(0, Math.min(100, Math.round(Number(raw.volume == null ? 32 : raw.volume) || 0)));
    return {
      enabled: raw.enabled === true,
      trackId,
      volume,
    };
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
          <input class="score-input" type="number" step="1" value="${p.score}" data-set-score="${p.id}" />
          <button class="good" data-add="${p.id}" data-delta="5">+5</button>
        </span>
        <span class="ptbox game">
          <span class="tag">Spiel</span>
          <button class="bad" data-gadd="${p.id}" data-delta="-5">-5</button>
          <input class="score-input" type="number" step="1" value="${p.gameScore}" data-set-game-score="${p.id}" />
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
    playersEl.querySelectorAll('[data-set-score]').forEach((inp) => {
      inp.onchange = () =>
        App.socket.emit('admin:set-points', { playerId: inp.dataset.setScore, value: Number(inp.value) });
      inp.onkeydown = (event) => {
        if (event.key === 'Enter') inp.blur();
      };
    });
    playersEl.querySelectorAll('[data-set-game-score]').forEach((inp) => {
      inp.onchange = () =>
        App.socket.emit('admin:set-game-points', { playerId: inp.dataset.setGameScore, value: Number(inp.value) });
      inp.onkeydown = (event) => {
        if (event.key === 'Enter') inp.blur();
      };
    });
    playersEl.querySelectorAll('[data-rename]').forEach((inp) => {
      inp.onchange = () =>
        App.socket.emit('admin:rename-player', { playerId: inp.dataset.rename, name: inp.value });
    });
  }

  function renderGames(state) {
    const activeId = state.activeGame && state.activeGame.id;
    activeGameEl.innerHTML = state.activeGame
      ? `Aktiv: <b>${esc(state.activeGame.title || state.activeGame.name)}</b>${fishAdminControls(state)}${halbeSachenAdminControls(state)}${dartRingeAdminControls(state)}${woLiegtWasAdminControls(state)}${musikErratenPlaylistAdminControls(state)}${percentQuizAdminControls(state)}`
      : 'Kein Spiel aktiv.';

    if (gameStartSelectEl) {
      const previous = gameStartSelectEl.value;
      gameStartSelectEl.innerHTML =
        games
          .map((g) => `
            <option value="${esc(g.id)}">
              ${esc(g.title || g.name)} · ${esc(categoryLabel(g.category))}${g.built === false ? ' · Platzhalter' : ''}
            </option>`)
          .join('');
      const selectedId = games.some((g) => g.id === previous)
        ? previous
        : activeId && games.some((g) => g.id === activeId)
        ? activeId
        : games[0] && games[0].id;
      if (selectedId) gameStartSelectEl.value = selectedId;
      if (gameStartButtonEl) gameStartButtonEl.disabled = !games.length;
    }

    if (gamesEl) {
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
    }
    wireFishAdminControls();
    wireWoLiegtWasAdminControls();
    wireHalbeSachenAdminControls();
    wireDartRingeAdminControls();
    wireMusikErratenPlaylistAdminControls();
    wirePercentQuizAdminControls();
  }

  function fishAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'einkauf-schaetzen') return '';
    const game = fishState(state);
    const box = fishSelectedBox(game);
    const answers = box ? fishAnswersFor(game, box.id) : {};
    const answered = state.players.filter((player) => answers[player.id]).length;
    const total = fishBoxTotalCents(box);
    const completePrices = total != null;
    const revealed = game.guessesRevealed || game.solutionRevealed || game.phase === 'result';

    return `
      <div class="game-detail fish-admin" style="margin-top:10px;">
        <b>How much is the fish</b>
        <div class="muted">Status: ${fishPhaseLabel(game)} · ${answered}/${state.players.length} Schätzungen · Lösung ${completePrices ? fishFormatEuro(total) : 'unvollständig'}</div>
        <div class="row" style="margin-top:10px;">
          ${game.boxes.map((entry) => `
            <button class="${box && box.id === entry.id ? 'primary' : ''}" data-fish-box="${entry.id}">
              ${esc(entry.label)}
            </button>
          `).join('')}
        </div>
        ${box ? fishBoxAdmin(box) : '<div class="muted" style="margin-top:8px;">Keine Box vorbereitet.</div>'}
        <div class="row" style="margin-top:10px;">
          <button class="${game.answersOpen ? '' : 'good'}" data-fish-action="open-input">Eingabe öffnen</button>
          <button data-fish-action="close-input">Eingabe schließen</button>
          <button class="primary" data-fish-action="reveal-guesses" ${answered ? '' : 'disabled'}>Tipps anzeigen</button>
          <button class="primary" data-fish-action="reveal-solution" ${completePrices ? '' : 'disabled'}>Lösung aufdecken</button>
          <button class="good" data-fish-action="confirm-result" ${game.solutionRevealed && completePrices && !game.resultConfirmed ? '' : 'disabled'}>Box werten</button>
          <button data-fish-action="next-box">Nächste Box</button>
          <button class="bad" data-fish-action="reset-box">Box leeren</button>
        </div>
        ${revealed ? fishAnswersAdmin(state.players, game, box, answers) : ''}
        ${fishTotalsAdmin(state.players, game)}
      </div>`;
  }

  function fishBoxAdmin(box) {
    return `
      <div class="game-detail mini fish-box-admin" style="margin-top:10px;">
        <b>${esc(box.label)}</b>
        <div class="spin-admin-list" style="margin-top:8px;">
          ${(box.items || []).map((item, index) => `
            <div class="fish-item-admin">
              <label>
                <span>Gegenstand ${index + 1}</span>
                <input type="text" value="${esc(item.name)}" data-fish-item-name="${index}" data-fish-box-id="${box.id}" />
              </label>
              <label>
                <span>Preis</span>
                <input type="number" min="0" step="0.01" inputmode="decimal" value="${fishPriceInputValue(item.priceCents)}"
                  data-fish-item-price="${index}" data-fish-box-id="${box.id}" />
              </label>
            </div>
          `).join('')}
        </div>
        <div class="muted" style="margin-top:8px;">Gesamt: <b>${fishBoxTotalCents(box) == null ? '-' : fishFormatEuro(fishBoxTotalCents(box))}</b></div>
      </div>`;
  }

  function fishAnswersAdmin(players, game, box, answers) {
    const results = Array.isArray(game.results) ? game.results : [];
    return `
      <div class="spin-admin-list" style="margin-top:10px;">
        ${players.map((player) => {
          const answer = answers[player.id];
          const result = results.find((entry) => entry.playerId === player.id) || {};
          const winner = (game.winnerPlayerIds || []).includes(player.id) && game.solutionRevealed;
          return `
            <div class="game-detail mini ${winner ? 'fish-admin-winner' : ''}">
              <b style="color:${player.color}">${esc(player.name)}</b>
              <div class="muted">Tipp: ${answer ? fishFormatEuro(answer.amountCents) : 'Keine Eingabe'}</div>
              ${game.solutionRevealed ? `<div class="muted">${result.noAnswerPenalty ? 'Strafe' : 'Abweichung'}: ${result.differenceCents == null ? '-' : fishFormatEuro(result.differenceCents)}</div>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  }

  function fishTotalsAdmin(players, game) {
    const totals = game.totals || {};
    const scored = Number(game.scoredRounds) || 0;
    const rows = players
      .map((player) => ({ player, total: Number(totals[player.id]) || 0 }))
      .sort((a, b) => a.total - b.total);
    return `
      <div class="game-detail mini" style="margin-top:10px;">
        <b>Gesamtwertung (${scored} ${scored === 1 ? 'Box' : 'Boxen'} gewertet)</b>
        <div class="fish-total-admin-list">
          ${rows.map((row, index) => `
            <label class="fish-total-admin-row">
              <span>${index + 1}. ${esc(row.player.name)}</span>
              <input type="number" min="0" step="0.01" inputmode="decimal"
                value="${fishPriceInputValue(row.total)}" data-fish-total="${row.player.id}" />
            </label>
          `).join('')}
        </div>
        <div class="muted">Kleinste Gesamtabweichung gewinnt.</div>
      </div>`;
  }

  function wireFishAdminControls() {
    activeGameEl.querySelectorAll('[data-fish-box]').forEach((button) => {
      button.onclick = () => App.socket.emit('game:action', {
        type: 'fish:select-box',
        boxId: button.dataset.fishBox,
      });
    });

    activeGameEl.querySelectorAll('[data-fish-item-name]').forEach((input) => {
      input.onchange = () => App.socket.emit('game:action', {
        type: 'fish:set-item',
        boxId: input.dataset.fishBoxId,
        itemIndex: Number(input.dataset.fishItemName),
        patch: { name: input.value },
      });
      input.onkeydown = (event) => {
        if (event.key === 'Enter') input.blur();
      };
    });

    activeGameEl.querySelectorAll('[data-fish-item-price]').forEach((input) => {
      input.onchange = () => App.socket.emit('game:action', {
        type: 'fish:set-item',
        boxId: input.dataset.fishBoxId,
        itemIndex: Number(input.dataset.fishItemPrice),
        patch: { price: input.value },
      });
      input.onkeydown = (event) => {
        if (event.key === 'Enter') input.blur();
      };
    });

    activeGameEl.querySelectorAll('[data-fish-total]').forEach((input) => {
      input.onchange = () => App.socket.emit('game:action', {
        type: 'fish:set-total',
        playerId: input.dataset.fishTotal,
        amount: input.value,
      });
      input.onkeydown = (event) => {
        if (event.key === 'Enter') input.blur();
      };
    });

    activeGameEl.querySelectorAll('[data-fish-action]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.fishAction;
        if (action === 'open-input') {
          App.socket.emit('game:action', { type: 'fish:set-answers-open', open: true });
        } else if (action === 'close-input') {
          App.socket.emit('game:action', { type: 'fish:set-answers-open', open: false });
        } else {
          App.socket.emit('game:action', { type: `fish:${action}` });
        }
      };
    });
  }

  function fishState(state) {
    const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
    return {
      phase: raw.phase || 'setup',
      selectedBoxId: raw.selectedBoxId || 'box1',
      boxes: Array.isArray(raw.boxes) ? raw.boxes : [],
      answersOpen: raw.answersOpen === true,
      guessesRevealed: raw.guessesRevealed === true,
      solutionRevealed: raw.solutionRevealed === true,
      resultConfirmed: raw.resultConfirmed === true,
      answersByBoxId: raw.answersByBoxId && typeof raw.answersByBoxId === 'object' ? raw.answersByBoxId : {},
      results: Array.isArray(raw.results) ? raw.results : [],
      winnerPlayerIds: Array.isArray(raw.winnerPlayerIds) ? raw.winnerPlayerIds : [],
      totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {},
      scoredRounds: Number(raw.scoredRounds) || 0,
    };
  }

  function fishSelectedBox(game) {
    return game.boxes.find((box) => box.id === game.selectedBoxId) || game.boxes[0] || null;
  }

  function fishAnswersFor(game, boxId) {
    return (game.answersByBoxId && game.answersByBoxId[boxId]) || {};
  }

  function fishBoxTotalCents(box) {
    if (!box || !Array.isArray(box.items) || box.items.some((item) => item.priceCents == null)) return null;
    return box.items.reduce((sum, item) => sum + Number(item.priceCents || 0), 0);
  }

  function fishPriceInputValue(cents) {
    return cents == null ? '' : String(Math.round(Number(cents) || 0) / 100);
  }

  function fishFormatEuro(cents) {
    return `${(Number(cents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function fishPhaseLabel(game) {
    if (game.resultConfirmed) return 'Box gewertet';
    if (game.solutionRevealed) return 'Lösung sichtbar';
    if (game.guessesRevealed) return 'Tipps sichtbar';
    if (game.answersOpen) return 'Eingabe offen';
    return 'Vorbereitung';
  }

  function halbeSachenAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'schneid-in-die-haelfte') return '';
    const game = halbeSachenState(state);
    const complete = state.players.filter((player) => {
      const row = game.measurements[player.id] || {};
      return isFiniteWeight(row.left) && isFiniteWeight(row.right);
    }).length;
    const revealed = ['reveal', 'result'].includes(game.phase);
    const winnerText = halbeWinnerText(game);

    return `
      <div class="game-detail halbe-admin" style="margin-top:10px;">
        <b>Halbe Sachen</b>
        <div class="muted">Status: ${halbePhaseLabel(game)} · ${complete}/${state.players.length} vollständig gewogen</div>
        ${winnerText ? `<div style="margin-top:8px;color:var(--accent);font-weight:900;">${winnerText}${game.resultConfirmed ? ' · Runde gewertet' : ''}</div>` : ''}
        ${game.adminWarning ? `<div style="margin-top:8px;color:#ffd15c;font-weight:900;">${esc(game.adminWarning)}</div>` : ''}
        <label class="admin-field-label" for="halbe-item">Gegenstand oder Runde</label>
        <input id="halbe-item" class="admin-text-input" type="text" value="${esc(game.itemName)}" maxlength="80" data-halbe-item />
        <div class="spin-admin-list" style="margin-top:10px;">
          ${state.players.map((player) => halbePlayerAdminRow(player, game)).join('')}
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="${revealed ? '' : 'primary'}" data-halbe-action="reveal" ${complete ? '' : 'disabled'}>Waagen aufdecken</button>
          <button class="good" data-halbe-action="confirm-result" ${revealed && complete && !game.resultConfirmed ? '' : 'disabled'}>Runde werten</button>
          <button data-halbe-action="hide">TV verdecken</button>
          <button data-halbe-action="next-round">Nächste Runde</button>
          <button class="bad" data-halbe-action="reset-round">Runde leeren</button>
        </div>
        ${halbeTotalsAdmin(state.players, game)}
      </div>`;
  }

  function halbePlayerAdminRow(player, game) {
    const row = game.measurements[player.id] || {};
    const result = (game.results || []).find((entry) => entry.playerId === player.id) || {};
    const winner = (game.winnerPlayerIds || []).includes(player.id);
    return `
      <div class="game-detail mini ${winner ? 'halbe-admin-winner' : ''}">
        <div>
          <b style="color:${player.color}">${esc(player.name)}</b>
          ${result.complete ? ` · Unterschied <b>${formatGramAdmin(result.difference)}</b>` : ' · offen'}
        </div>
        <div class="row" style="margin-top:8px;">
          <label class="halbe-weight-field">
            <span>Links</span>
            <input type="number" min="0" step="0.1" inputmode="decimal" value="${weightInputValue(row.left)}"
              data-halbe-player="${player.id}" data-halbe-side="left" />
          </label>
          <label class="halbe-weight-field">
            <span>Rechts</span>
            <input type="number" min="0" step="0.1" inputmode="decimal" value="${weightInputValue(row.right)}"
              data-halbe-player="${player.id}" data-halbe-side="right" />
          </label>
        </div>
      </div>`;
  }

  function wireHalbeSachenAdminControls() {
    const itemInput = activeGameEl.querySelector('[data-halbe-item]');
    if (itemInput) {
      itemInput.onchange = () =>
        App.socket.emit('game:action', {
          type: 'halbe:set-item',
          itemName: itemInput.value,
        });
      itemInput.onkeydown = (event) => {
        if (event.key === 'Enter') itemInput.blur();
      };
    }

    activeGameEl.querySelectorAll('[data-halbe-player]').forEach((input) => {
      input.onchange = () =>
        App.socket.emit('game:action', {
          type: 'halbe:set-weight',
          playerId: input.dataset.halbePlayer,
          side: input.dataset.halbeSide,
          value: input.value,
        });
      input.onkeydown = (event) => {
        if (event.key === 'Enter') input.blur();
      };
    });

    activeGameEl.querySelectorAll('[data-halbe-action]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: `halbe:${button.dataset.halbeAction}`,
        });
    });
  }

  function halbeSachenState(state) {
    const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
    return {
      phase: ['reveal', 'result'].includes(raw.phase) ? raw.phase : 'cutting',
      itemName: String(raw.itemName || 'Runde 1'),
      measurements: raw.measurements && typeof raw.measurements === 'object' ? raw.measurements : {},
      results: Array.isArray(raw.results) ? raw.results : [],
      winnerPlayerIds: Array.isArray(raw.winnerPlayerIds) ? raw.winnerPlayerIds : [],
      totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {},
      scoredRounds: Number(raw.scoredRounds) || 0,
      resultConfirmed: raw.resultConfirmed === true,
      adminWarning: String(raw.adminWarning || ''),
    };
  }

  function halbeTotalsAdmin(players, game) {
    const scored = Number(game.scoredRounds) || 0;
    const totals = game.totals && typeof game.totals === 'object' ? game.totals : {};
    const rows = players
      .map((player) => ({
        player,
        total: Number.isFinite(Number(totals[player.id])) ? Number(totals[player.id]) : 0,
      }))
      .sort((a, b) => a.total - b.total);

    return `
      <div class="game-detail mini" style="margin-top:10px;">
        <b>Gesamtwertung (${scored} ${scored === 1 ? 'Runde' : 'Runden'} gewertet)</b>
        ${rows.map((row, index) => `
          <div class="muted">${index + 1}. ${esc(row.player.name)}: ${formatGramAdmin(row.total)}</div>
        `).join('')}
        <div class="muted">Kleinste Gesamtdifferenz gewinnt · jede Runde wird nur über „Runde werten“ addiert.</div>
      </div>`;
  }

  function halbePhaseLabel(game) {
    if (game.resultConfirmed) return 'Auflösung sichtbar, Runde gewertet';
    if (['reveal', 'result'].includes(game.phase)) return 'Auflösung sichtbar';
    return 'TV verdeckt, Gesamtwertung sichtbar';
  }

  function halbeWinnerText(game) {
    const winners = (game.results || []).filter((result) => (game.winnerPlayerIds || []).includes(result.playerId));
    if (!winners.length) return '';
    const names = winners.map((result) => esc(result.playerName)).join(' & ');
    return `Aktuell vorn: ${names} mit ${formatGramAdmin(winners[0].difference)} Unterschied`;
  }

  function isFiniteWeight(value) {
    return value !== '' && value != null && Number.isFinite(Number(value));
  }

  function weightInputValue(value) {
    return isFiniteWeight(value) ? String(value) : '';
  }

  function formatGramAdmin(value) {
    if (!Number.isFinite(Number(value))) return '-';
    return `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 })} g`;
  }

  function dartRingeAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'dart-ringe') return '';
    const game = dartRingeState(state);
    const finalCount = state.players.filter((player) => dartRingePlayerRing(game, player.id) === 4).length;

    return `
      <div class="game-detail dart-ringe-admin" style="margin-top:10px;">
        <b>Dartringe</b>
        <div class="muted">Status: ${finalCount}/${state.players.length} Spieler am Finalring. Der gewählte Ring ist immer das aktuelle Ziel.</div>
        <div class="spin-admin-list" style="margin-top:10px;">
          ${state.players.map((player) => dartRingePlayerAdminRow(player, game)).join('')}
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="bad" data-dart-ringe-action="reset">Alle auf Ring 1 zurücksetzen</button>
        </div>
      </div>`;
  }

  function dartRingePlayerAdminRow(player, game) {
    const current = dartRingePlayerRing(game, player.id);
    return `
      <div class="game-detail mini ${current === 4 ? 'dart-ringe-admin-finale' : ''}">
        <div>
          <b style="color:${player.color}">${esc(player.name)}</b>
          · aktuelles Ziel: <b>${dartRingeRingLabel(current)}</b>
        </div>
        <div class="row" style="margin-top:8px;">
          ${[1, 2, 3, 4].map((ring) => `
            <button class="${current === ring ? 'primary' : ''}"
              data-dart-ringe-player="${player.id}" data-dart-ringe-ring="${ring}">
              ${dartRingeRingButtonLabel(ring)}
            </button>
          `).join('')}
          <button class="good" data-dart-ringe-advance="${player.id}" ${current >= 4 ? 'disabled' : ''}>Treffer · weiter</button>
        </div>
      </div>`;
  }

  function wireDartRingeAdminControls() {
    activeGameEl.querySelectorAll('[data-dart-ringe-player]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: 'dart-ringe:set-ring',
          playerId: button.dataset.dartRingePlayer,
          ringIndex: Number(button.dataset.dartRingeRing),
        });
    });

    activeGameEl.querySelectorAll('[data-dart-ringe-advance]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: 'dart-ringe:advance-player',
          playerId: button.dataset.dartRingeAdvance,
        });
    });

    activeGameEl.querySelectorAll('[data-dart-ringe-action]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: `dart-ringe:${button.dataset.dartRingeAction}`,
        });
    });
  }

  function dartRingeState(state) {
    const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
    return {
      ringPositions: raw.ringPositions && typeof raw.ringPositions === 'object' ? raw.ringPositions : {},
    };
  }

  function dartRingePlayerRing(game, playerId) {
    const number = Math.round(Number(game.ringPositions[playerId]) || 1);
    return Math.max(1, Math.min(4, number));
  }

  function dartRingeRingLabel(ring) {
    if (ring === 1) return 'Ring 1 (Gelb)';
    if (ring === 2) return 'Ring 2 (Grün)';
    if (ring === 3) return 'Ring 3 (Blau)';
    return 'Ring 4 (Rot, Finale)';
  }

  function dartRingeRingButtonLabel(ring) {
    return ring === 4 ? 'Finale' : `Ring ${ring}`;
  }

  function percentQuizAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'das-prozent-quiz') return '';
    const game = percentQuizState(state);
    const selected = game.questions.find((question) => question.id === game.selectedQuestionId) || null;
    const answers = selected ? percentAnswersFor(game, selected.id) : {};

    return `
      <div class="game-detail percent-admin" style="margin-top:10px;">
        <b>Das 1% Quiz</b>
        <div class="muted">Status: ${percentPhaseLabel(game.phase)} · Antworten ${game.answersOpen ? 'offen' : 'geschlossen'}</div>
        ${game.adminWarning ? `<div style="margin-top:8px;color:#ffd15c;font-weight:900;">${esc(game.adminWarning)}</div>` : ''}
        ${percentBettingAdmin(game, state.players)}
        <div class="percent-question-list">
          ${game.questions.map((question) => percentQuestionAdminButton(question, game.selectedQuestionId)).join('')}
        </div>
        ${selected ? percentSelectedAdmin(selected, game, state.players, answers) : '<div class="muted" style="margin-top:8px;">Keine Frage ausgewählt.</div>'}
      </div>`;
  }

  function percentSelectedAdmin(question, game, players, answers) {
    const eligible = players.filter((player) => {
      const entry = game.betsByPlayerId[player.id];
      return entry && entry.questionId === question.id && entry.amount > 0;
    });
    const answered = eligible.filter((player) => answers[player.id]).length;
    const payouts = percentPayoutsFor(game, question.id);
    const totalSteps = (question.revealSteps || []).length;
    const nextStepLabel = game.revealStep < totalSteps ? question.revealSteps[game.revealStep] : null;
    const solutionShown = game.solutionVisible && game.solution && game.solution.questionId === question.id;
    const timerRunning = game.timer && game.timer.running === true;
    const timerRemaining = timerRunning
      ? Math.max(0, Math.ceil(((Number(game.timer.endsAt) || 0) - Date.now()) / 1000))
      : 0;

    return `
      <div class="game-detail mini percent-selected-admin" style="margin-top:10px;">
        <b>${esc(question.adminTitle || question.label)}</b>
        <div class="muted">${percentAnswerTypeLabel(question)} · x${percentFormatMultiplier(question.multiplier)} · ${answered}/${eligible.length} Antworten (nur Spieler mit Einsatz auf diese Frage)</div>
        ${question.imageSrc && !question.imageExists
          ? `<div style="margin-top:6px;color:#ffd15c;font-weight:900;">Foto fehlt: ${esc(question.imageSrc)} – solange wird die Zeichnung angezeigt.</div>`
          : ''}
        <div class="row" style="margin-top:10px;">
          <button class="primary" data-percent-action="reveal-step" ${nextStepLabel ? '' : 'disabled'}>
            ${nextStepLabel ? `Aufdecken: ${esc(nextStepLabel)} (${game.revealStep + 1}/${totalSteps})` : 'Alles aufgedeckt'}
          </button>
          <button data-percent-action="unreveal-step" ${game.revealStep > 0 ? '' : 'disabled'}>Schritt zurück</button>
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="good" data-percent-action="start-timer" ${timerRunning ? 'disabled' : ''}>▶ Timer starten (30 Sek., Antworten auf)</button>
          <button class="bad" data-percent-action="stop-timer" ${timerRunning ? '' : 'disabled'}>■ Timer stoppen</button>
          ${timerRunning ? `<span style="font-weight:900;color:var(--accent);" data-percent-admin-timer data-ends-at="${Number(game.timer.endsAt) || 0}">${timerRemaining}s</span>` : ''}
        </div>
        ${percentSolutionControls(question, game, solutionShown)}
        <div class="spin-admin-list" style="margin-top:10px;">
          ${players.map((player) => percentAnswerAdminRow(player, answers[player.id], question, game, payouts[player.id])).join('')}
        </div>
      </div>`;
  }

  function percentSolutionControls(question, game, solutionShown) {
    const overlayLabels = question.solutionStepLabels || [];
    const total = overlayLabels.length ? overlayLabels.length + 1 : 0;
    const showLabel = overlayLabels.length
      ? 'Lösung anzeigen (dann einzeln aufdecken)'
      : 'Lösung anzeigen + auto. auszahlen';

    let stepButtons = '';
    if (solutionShown && total) {
      const step = Number(game.solutionStep) || 0;
      const nextLabel = step < overlayLabels.length
        ? `Aufdecken: ${esc(overlayLabels[step])} (${step + 1}/${total})`
        : step < total
          ? `Ergebnis anzeigen + auszahlen (${total}/${total})`
          : 'Alles aufgedeckt';
      stepButtons = `
        <button class="primary" data-percent-action="solution-step" ${step >= total ? 'disabled' : ''}>${nextLabel}</button>
        <button data-percent-action="solution-unstep" ${step > 0 ? '' : 'disabled'}>Einblendung zurück</button>`;
    }

    return `
      <div class="row" style="margin-top:10px;">
        ${solutionShown ? '' : `<button class="primary" data-percent-action="show-solution" ${game.answersOpen ? 'data-percent-confirm-open="1"' : ''}>${showLabel}</button>`}
        ${stepButtons}
        <button data-percent-action="hide-solution" ${solutionShown ? '' : 'disabled'}>Lösung ausblenden</button>
        <button data-percent-action="reset-answers">Antworten zurücksetzen</button>
        <button data-percent-action="show-results">Gesamt-Auswertung</button>
        <button data-percent-action="back-to-selection">Zurück zur Frageauswahl</button>
      </div>`;
  }

  function percentBettingAdmin(game, players) {
    const lockedCount = players.filter((player) => {
      const entry = game.betsByPlayerId[player.id];
      return entry && entry.locked && entry.amount > 0;
    }).length;
    return `
      <div class="game-detail mini percent-betting-admin">
        <b>Einsatzphase (jeder Spieler wählt EINE Frage)</b>
        <div class="muted">${lockedCount}/${players.length} Spieler haben Einsätze eingeloggt.</div>
        <div class="row" style="margin-top:10px;">
          <button class="primary" data-percent-action="open-betting">Einsatzphase öffnen</button>
          <button data-percent-action="close-betting">Einsatzphase schließen</button>
          <button data-percent-action="reset-bets">Einsätze zurücksetzen</button>
          <button data-percent-action="unlock-bets">Einsätze entsperren</button>
          <button class="good" data-percent-action="continue-to-quiz">Weiter zum Quiz</button>
        </div>
        <div class="spin-admin-list" style="margin-top:10px;">
          ${players.map((player) => percentBetPlayerRow(player, game)).join('')}
        </div>
      </div>`;
  }

  function percentBetPlayerRow(player, game) {
    const entry = game.betsByPlayerId[player.id] || null;
    const debited = game.debitedBetsByPlayerId[player.id];
    const question = entry && entry.questionId
      ? game.questions.find((item) => item.id === entry.questionId) || null
      : null;
    const betText = question && entry.amount > 0
      ? `${esc(question.label)} · Einsatz ${percentFormatChips(entry.amount)} · bei richtig ${percentFormatChips(percentChipPayout(entry.amount * Number(question.multiplier || 1)))}`
      : 'Kein Einsatz';
    return `
      <div class="game-detail mini">
        <b style="color:${player.color}">${esc(player.name)}</b>
        <div class="muted">${betText} · Eingeloggt: ${entry && entry.locked ? 'Ja' : 'Nein'}${debited ? ` · abgezogen: ${percentFormatChips(debited.amount)}` : ''}</div>
        <div class="muted">Kontostand: ${percentFormatChips(player.score)}</div>
      </div>`;
  }

  function percentQuestionAdminButton(question, selectedQuestionId) {
    return `
      <button class="${question.id === selectedQuestionId ? 'primary' : ''}" data-percent-question="${esc(question.id)}">
        <b>${esc(question.label)}</b>
        <span>x${percentFormatMultiplier(question.multiplier)} · ${percentAnswerTypeLabel(question)}</span>
      </button>`;
  }

  function percentAnswerAdminRow(player, answer, question, game, payout) {
    const entry = game.betsByPlayerId[player.id] || null;
    const mine = entry && entry.questionId === question.id && entry.amount > 0;
    if (!mine) {
      return `
        <div class="game-detail mini">
          <b style="color:${player.color}">${esc(player.name)}</b>
          <div class="muted">Hat diese Frage nicht gewählt.</div>
        </div>`;
    }
    const bet = entry.amount;
    const potential = percentChipPayout(bet * Number(question.multiplier || 1));
    const locked = payout && payout.applied;
    return `
      <div class="game-detail mini">
        <b style="color:${player.color}">${esc(player.name)}</b>
        <div class="muted">Antwort: ${answer ? esc(percentAnswerLabel(question, answer.answer)) : 'noch offen'} · Einsatz: ${percentFormatChips(bet)} · x${percentFormatMultiplier(question.multiplier)} · Auszahlung: ${payout ? percentFormatChips(payout.payoutAmount) : `bis zu ${percentFormatChips(potential)}`}</div>
        <div class="row" style="margin-top:6px;">
          ${locked
            ? `<span class="muted">Bewertet: ${payout.isCorrect ? 'Richtig' : 'Falsch'} · ausgezahlt</span>`
            : `
              <span class="muted">Manuell (überschreibt Auto-Wertung):</span>
              <button class="good" data-percent-eval-player="${player.id}" data-percent-eval-question="${question.id}" data-percent-correct="1">Richtig</button>
              <button class="bad" data-percent-eval-player="${player.id}" data-percent-eval-question="${question.id}" data-percent-correct="0">Falsch</button>
            `}
        </div>
      </div>`;
  }

  function percentQuizState(state) {
    const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
    return {
      selectedQuestionId: raw.selectedQuestionId || null,
      phase: raw.phase || 'idle',
      answersOpen: raw.answersOpen === true,
      revealStep: Number(raw.revealStep) || 0,
      timer: raw.timer && typeof raw.timer === 'object' ? raw.timer : {},
      answersByQuestionId: raw.answersByQuestionId || {},
      betsByPlayerId: raw.betsByPlayerId || {},
      debitedBetsByPlayerId: raw.debitedBetsByPlayerId || {},
      payoutsByQuestionId: raw.payoutsByQuestionId || {},
      solutionVisible: raw.solutionVisible === true,
      solutionStep: Number(raw.solutionStep) || 0,
      solution: raw.solution && typeof raw.solution === 'object' ? raw.solution : null,
      questions: Array.isArray(raw.questions) ? raw.questions : [],
      adminWarning: String(raw.adminWarning || ''),
    };
  }

  function percentAnswersFor(game, questionId) {
    return (game.answersByQuestionId && game.answersByQuestionId[questionId]) || {};
  }

  function percentPayoutsFor(game, questionId) {
    return (game.payoutsByQuestionId && game.payoutsByQuestionId[questionId]) || {};
  }

  function percentPhaseLabel(phase) {
    return {
      idle: 'Keine Frage',
      betting: 'Einsatzphase offen',
      bettingLocked: 'Einsätze fixiert',
      selected: 'Frage ausgewählt (aufdecken)',
      answering: 'Timer läuft',
      locked: 'Antworten gesperrt',
      results: 'Auswertung',
    }[phase] || phase || '-';
  }

  function percentAnswerTypeLabel(question) {
    if (!question) return '-';
    if (question.answerType === 'choice') {
      return `Auswahl ${(question.options || []).map((option) => option.value).join('/')}`;
    }
    if (question.answerType === 'number') return 'Zahleneingabe';
    return question.answerType || '-';
  }

  function percentAnswerLabel(question, value) {
    if (question.answerType === 'choice') {
      const option = (question.options || []).find((entry) => entry.value === value);
      if (option && option.label !== option.value) return `${option.value} – ${option.label}`;
    }
    return String(value);
  }

  function percentChipPayout(value) {
    return Math.ceil(Number(value) || 0);
  }

  function percentFormatMultiplier(value) {
    return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  function percentFormatChips(value) {
    return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  function musikErratenPlaylistAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'musik-erraten') return '';
    const game = musikErratenState(state);
    const winner = game.winnerPlayerId ? playerName(state, game.winnerPlayerId) : '';
    const selectedSong = game.songs[game.currentSongIndex] || null;

    return `
      <div class="game-detail" style="margin-top:10px;">
        <b>Musik erraten</b>
        <div class="muted">Status: ${game.isSongRevealed ? 'Songtitel sichtbar' : 'Musik läuft'} · Song ${game.currentSongIndex + 1}/${game.songs.length} · Ziel: ${game.targetScore} Punkte</div>
        ${winner ? `<div style="margin-top:8px;color:var(--accent);font-weight:900;">Gewinner: ${esc(winner)}</div>` : ''}
        ${game.adminWarning ? `<div style="margin-top:8px;color:#ffd15c;font-weight:900;">${esc(game.adminWarning)}</div>` : ''}
        ${selectedSong && selectedSong.coverImageUrl ? `
          <div class="musik-admin-current">
            <img src="${esc(selectedSong.coverImageUrl)}" alt="" />
            <div>
              <b>${game.currentSongIndex + 1}. ${esc(selectedSong.title)}</b>
              <div class="muted">Cover wird beim Aufdecken auf dem TV-Hintergrund gezeigt.</div>
            </div>
          </div>` : ''}
        <label class="admin-field-label" for="musik-song-title">Songtitel</label>
        <input id="musik-song-title" class="admin-text-input" type="text" maxlength="120"
          placeholder="z. B. Bohemian Rhapsody" value="${esc(game.currentSongTitle)}" data-musik-title />
        <div class="row" style="margin-top:10px;">
          <button class="primary" data-musik-action="reveal-song">Songtitel aufdecken</button>
          <button data-musik-action="hide-song">Musik läuft anzeigen</button>
          <button data-musik-action="previous-song" ${game.currentSongIndex <= 0 ? 'disabled' : ''}>Vorheriger Song</button>
          <button data-musik-action="next-song" ${game.currentSongIndex >= game.songs.length - 1 ? 'disabled' : ''}>Nächster Song</button>
          <button data-musik-action="reset">Runde zurücksetzen</button>
        </div>
        <div class="musik-admin-song-list">
          ${game.songs.map((song, index) => `
            <button class="${index === game.currentSongIndex ? 'primary' : ''}" data-musik-song-index="${index}">
              <span>${index + 1}.</span> ${esc(song.title)}
            </button>
          `).join('')}
        </div>
        <div class="spin-admin-list" style="margin-top:10px;">
          ${state.players.map((player) => musikErratenPlayerRow(player, game)).join('')}
        </div>
      </div>`;
  }

  function musikErratenAdminControls(state) {
    if (!state.activeGame || state.activeGame.id !== 'musik-erraten') return '';
    const game = musikErratenState(state);
    const winner = game.winnerPlayerId ? playerName(state, game.winnerPlayerId) : '';

    return `
      <div class="game-detail" style="margin-top:10px;">
        <b>Musik erraten</b>
        <div class="muted">Status: ${game.isSongRevealed ? 'Songtitel sichtbar' : 'Musik läuft'} · Ziel: ${game.targetScore} Punkte</div>
        ${winner ? `<div style="margin-top:8px;color:var(--accent);font-weight:900;">Gewinner: ${esc(winner)}</div>` : ''}
        ${game.adminWarning ? `<div style="margin-top:8px;color:#ffd15c;font-weight:900;">${esc(game.adminWarning)}</div>` : ''}
        <label class="admin-field-label" for="musik-song-title">Songtitel</label>
        <input id="musik-song-title" class="admin-text-input" type="text" maxlength="120"
          placeholder="z. B. Bohemian Rhapsody" value="${esc(game.currentSongTitle)}" data-musik-title />
        <div class="row" style="margin-top:10px;">
          <button class="primary" data-musik-action="reveal-song">Songtitel aufdecken</button>
          <button data-musik-action="hide-song">Musik läuft anzeigen</button>
          <button data-musik-action="reset">Runde zurücksetzen</button>
        </div>
        <div class="spin-admin-list" style="margin-top:10px;">
          ${state.players.map((player) => musikErratenPlayerRow(player, game)).join('')}
        </div>
      </div>`;
  }

  function musikErratenPlayerRow(player, game) {
    const target = game.targetScore || 5;
    const score = Math.max(0, Math.min(target, Number(game.playerScores[player.id]) || 0));
    const winner = game.winnerPlayerId === player.id;
    return `
      <div class="game-detail mini">
        <div>
          <b style="color:${player.color}">${esc(player.name)}</b>
          · ${score}/${target} Punkte
          ${winner ? '<span style="color:var(--accent);font-weight:900;"> · Gewonnen</span>' : ''}
        </div>
        <div class="row" style="margin-top:6px;">
          <button class="bad" data-musik-player="${player.id}" data-musik-action="remove-point" ${score <= 0 ? 'disabled' : ''}>-1 Punkt</button>
          <button class="good" data-musik-player="${player.id}" data-musik-action="add-point" ${score >= target ? 'disabled' : ''}>+1 Punkt</button>
        </div>
      </div>`;
  }

  function musikErratenState(state) {
    const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
    return {
      currentSongTitle: String(raw.currentSongTitle || ''),
      currentSongIndex: Number(raw.currentSongIndex) || 0,
      currentSongCoverImageUrl: String(raw.currentSongCoverImageUrl || ''),
      isSongRevealed: raw.isSongRevealed === true,
      playerScores: raw.playerScores && typeof raw.playerScores === 'object' ? raw.playerScores : {},
      winnerPlayerId: raw.winnerPlayerId || null,
      targetScore: Number(raw.targetScore) || 5,
      adminWarning: String(raw.adminWarning || ''),
      songs: Array.isArray(raw.songs) && raw.songs.length ? raw.songs : [],
    };
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
    const isTest = current && current.isTestQuestion === true;
    const confirmLabel = isTest ? 'Testfrage bestätigen (ohne Wertung)' : 'Runde werten (Entfernungen addieren)';

    return `
      <div class="game-detail" style="margin-top:10px;">
        <b>WO LIEGT WAS?</b>
        <div class="muted">Status: ${phaseLabel(phase)} · ${placed}/${state.players.length} gesetzt · ${confirmed}/${state.players.length} bestätigt</div>
        ${['placing', 'locked'].includes(phase) ? `<div class="muted">${state.players.map((player) => {
          const pin = pins[player.id];
          const label = pin && pin.confirmed ? 'bestätigt' : pin ? 'gesetzt' : 'offen';
          return `${esc(player.name)}: ${label}`;
        }).join(' · ')}</div>` : ''}
        ${current ? `
          <div style="margin-top:8px;"><b>${esc(current.questionText)}</b></div>
          ${current.subtitle ? `<div class="muted">${esc(current.subtitle)}</div>` : ''}
          <div class="muted">${esc(current.mapLabel || 'Stumme Karte')} · ${esc(current.category || 'Frage')} · Ziel: ${esc(current.targetName || '-')}</div>
          ${isTest ? '<div style="margin-top:8px; color:#ffd15c; font-weight:900;">Testfrage – zählt nicht zur Gesamtwertung.</div>' : ''}
          ${targetMissing ? '<div style="margin-top:8px; color:#ffd15c; font-weight:900;">Diese Frage hat noch keine Zielkoordinaten.</div>' : ''}
        ` : '<div class="muted" style="margin-top:8px;">Noch keine Frage ausgewählt.</div>'}
        <div class="row" style="margin-top:10px;">
          <button data-wlw-action="random">Zufällige Frage</button>
          ${phase === 'setup' && current ? '<button class="good" data-wlw-action="start">Eingabe starten</button>' : ''}
          ${phase === 'placing' ? '<button data-wlw-action="lock">Eingabe schließen</button>' : ''}
          ${phase === 'locked' || phase === 'placing' ? '<button class="primary" data-wlw-action="reveal">Pins aufdecken</button>' : ''}
          ${phase === 'reveal-pins' ? '<button class="primary" data-wlw-action="reveal-target">Ziel & Ergebnis zeigen</button>' : ''}
          ${['reveal', 'result'].includes(phase) ? '<button class="good" data-wlw-action="confirm-result" ' + (game.resultConfirmed || game.targetMissing ? 'disabled' : '') + '>' + confirmLabel + '</button>' : ''}
          ${phase === 'reveal' ? '<button data-wlw-action="result">Ergebnis nur anzeigen</button>' : ''}
          ${current ? '<button data-wlw-action="reset">Runde zurücksetzen</button>' : ''}
          <button data-wlw-action="next">Nächste Frage</button>
          <button data-wlw-action="new-round">Neue Runde</button>
          <button data-wlw-action="menu">Zurück zum Spielmenü</button>
        </div>
        ${game.targetMissing && ['reveal', 'result'].includes(phase) ? '<div class="game-detail mini" style="margin-top:10px;"><b>Zielkoordinaten fehlen – Auswertung nicht möglich.</b></div>' : ''}
        ${winnerText ? `<div class="game-detail mini" style="margin-top:10px;"><b>${winnerText}</b>${game.resultConfirmed ? '<div class="muted">Runde wurde bereits gewertet.</div>' : ''}</div>` : ''}
        ${phase === 'setup' ? questionButtons(questions, current) : ''}
        ${woLiegtWasResults(state)}
        ${woLiegtWasTotals(state)}
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

  function woLiegtWasTotals(state) {
    const game = state.gameState || {};
    const totals = game.totals && typeof game.totals === 'object' ? game.totals : {};
    if (!game.scoredRounds || !Object.keys(totals).length) return '';
    const rows = state.players
      .map((player) => ({
        player,
        totalKm: Number.isFinite(Number(totals[player.id])) ? Number(totals[player.id]) : null,
      }))
      .sort((a, b) => {
        if (a.totalKm == null && b.totalKm == null) return 0;
        if (a.totalKm == null) return 1;
        if (b.totalKm == null) return -1;
        return a.totalKm - b.totalKm;
      });
    return `
      <div class="game-detail mini" style="margin-top:10px;">
        <b>Gesamtwertung (${game.scoredRounds} ${game.scoredRounds === 1 ? 'Frage' : 'Fragen'} gewertet)</b>
        ${rows.map((row, index) => `
          <div class="muted">${index + 1}. ${esc(row.player.name)}: ${row.totalKm == null ? '–' : `${Math.round(row.totalKm).toLocaleString('de-DE')} km`}</div>
        `).join('')}
        <div class="muted">Kleinste Gesamtentfernung gewinnt · Punkte werden manuell vergeben.</div>
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
          'reveal-target': 'wlw:reveal-target',
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

  function wireMusikErratenAdminControls() {
    const titleInput = activeGameEl.querySelector('[data-musik-title]');
    if (titleInput) {
      titleInput.onchange = () =>
        App.socket.emit('game:action', {
          type: 'musik:set-song-title',
          title: titleInput.value,
        });
      titleInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
          titleInput.blur();
        }
      };
    }

    activeGameEl.querySelectorAll('[data-musik-action]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.musikAction;
        const payload = {
          type: `musik:${action}`,
        };
        if (button.dataset.musikPlayer) {
          payload.playerId = button.dataset.musikPlayer;
        }
        if (action === 'reveal-song' || action === 'set-song-title') {
          payload.title = titleInput ? titleInput.value : '';
        }
        App.socket.emit('game:action', payload);
      };
    });
  }

  function wireMusikErratenPlaylistAdminControls() {
    const titleInput = activeGameEl.querySelector('[data-musik-title]');
    if (titleInput) {
      titleInput.onchange = () =>
        App.socket.emit('game:action', {
          type: 'musik:set-song-title',
          title: titleInput.value,
        });
      titleInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
          titleInput.blur();
        }
      };
    }

    activeGameEl.querySelectorAll('[data-musik-action]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.musikAction;
        const payload = {
          type: `musik:${action}`,
        };
        if (button.dataset.musikPlayer) {
          payload.playerId = button.dataset.musikPlayer;
        }
        if (action === 'reveal-song' || action === 'set-song-title') {
          payload.title = titleInput ? titleInput.value : '';
        }
        App.socket.emit('game:action', payload);
      };
    });

    activeGameEl.querySelectorAll('[data-musik-song-index]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: 'musik:select-song',
          index: Number(button.dataset.musikSongIndex),
        });
    });
  }

  function wirePercentQuizAdminControls() {
    activeGameEl.querySelectorAll('[data-percent-question]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: 'percent:select-question',
          questionId: button.dataset.percentQuestion,
        });
    });

    activeGameEl.querySelectorAll('[data-percent-action]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.percentAction;
        if (button.dataset.percentConfirmOpen === '1' && !confirm('Antworten sind noch offen. Lösung trotzdem anzeigen?')) return;
        App.socket.emit('game:action', { type: `percent:${action}` });
      };
    });

    activeGameEl.querySelectorAll('[data-percent-eval-player]').forEach((button) => {
      button.onclick = () =>
        App.socket.emit('game:action', {
          type: 'percent:evaluate-answer',
          playerId: button.dataset.percentEvalPlayer,
          questionId: button.dataset.percentEvalQuestion,
          isCorrect: button.dataset.percentCorrect === '1',
        });
    });

    // Restzeit-Anzeige tickt lokal weiter, weil der Server nur bei
    // State-Änderungen rendert.
    if (window.__percentAdminTimerInterval) {
      clearInterval(window.__percentAdminTimerInterval);
      window.__percentAdminTimerInterval = null;
    }
    const timerEl = activeGameEl.querySelector('[data-percent-admin-timer]');
    if (timerEl) {
      const endsAt = Number(timerEl.dataset.endsAt) || 0;
      window.__percentAdminTimerInterval = setInterval(() => {
        if (!document.body.contains(timerEl)) {
          clearInterval(window.__percentAdminTimerInterval);
          window.__percentAdminTimerInterval = null;
          return;
        }
        timerEl.textContent = `${Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))}s`;
      }, 500);
    }
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
      'reveal-pins': 'Pins aufgedeckt',
      reveal: 'Auflösung',
      result: 'Ergebnis',
    }[phase] || phase || '-';
  }

  function renderFeaturedGames(state) {
    const currentGameId = state.round && state.round.gameId;
    const currentActiveGameId = state.activeGame && state.activeGame.id;
    const introRunning = state.phase === 'spiel-intro';
    featuredGamesEl.innerHTML =
      '<div class="lbl">Feste Show-Reihenfolge:</div>' +
      featuredGames
        .map((game) => {
          const isCurrent = currentGameId === game.gameId &&
            ['spiel-intro', 'wetten', 'spiel-aktiv', 'auswertung'].includes(state.phase);
          const title = game.title || game.defaultTitle;
          return `
            <div class="featured-game-row ${isCurrent ? 'current' : ''}">
              <div class="featured-game-slot">Spiel ${game.slot}</div>
              <div class="featured-game-name">${esc(title)}</div>
              <button class="featured-game-action ${isCurrent ? 'primary' : ''}" data-featured-slot="${game.slot}">
                Anzeigen
              </button>
              <button class="featured-game-action ${currentActiveGameId === game.gameId ? 'good' : ''}" data-featured-start="${esc(game.gameId)}">
                ${currentActiveGameId === game.gameId ? 'läuft' : 'Starten'}
              </button>
              <div class="featured-game-meta">${animationLabel(game.animation)} &middot; ${esc(game.gameId)}</div>
            </div>`;
        })
        .join('');

    featuredGamesEl.querySelectorAll('[data-featured-slot]').forEach((btn) => {
      btn.disabled = introRunning;
      btn.onclick = () =>
        App.socket.emit('admin:prepare-featured-game', { slot: Number(btn.dataset.featuredSlot) });
    });
    featuredGamesEl.querySelectorAll('[data-featured-start]').forEach((btn) => {
      btn.onclick = () => App.socket.emit('admin:start-game', { gameId: btn.dataset.featuredStart });
    });
  }

  document.getElementById('reset-all').onclick = () => {
    if (confirm('Wirklich ALLE Coins und den Ablauf zurücksetzen? (Spielernamen bleiben)')) {
      App.socket.emit('admin:reset-all');
    }
  };

  App.onState((state) => {
    renderAblauf(state);
    renderBuzzer(state);
    renderAmbientMusic(state);
    renderPlayers(state);
    renderFeaturedGames(state);
    renderGames(state);
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
