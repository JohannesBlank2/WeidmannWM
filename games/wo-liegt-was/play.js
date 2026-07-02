/* Spiel "WO LIEGT WAS?" — Handy-Modul. */
(function () {
  let lastState = null;
  let lastCtx = null;
  let mapReady = false;
  let moduleContainer = null;
  let lastRenderKey = null;
  let lastQuestionId = null;
  let localPinDraft = null;
  let localConfirmed = false;

  GameRegistry.register('wo-liegt-was', {
    mount(container) {
      moduleContainer = container;
      lastRenderKey = null;
      lastQuestionId = null;
      localPinDraft = null;
      localConfirmed = false;
      container.innerHTML = '<div class="waiting"><div class="big">WO LIEGT WAS?</div><div>Karte wird geladen ...</div></div>';
      ensureMap().then(() => {
        mapReady = true;
        injectStyles();
        if (lastState && lastCtx) updateOrRender(container, lastState, lastCtx);
      });
    },

    update(state, ctx) {
      lastState = state;
      lastCtx = ctx;
      if (!mapReady || !moduleContainer) return;
      updateOrRender(moduleContainer, state, ctx);
    },

    unmount(container) {
      container.innerHTML = '';
      lastState = null;
      lastCtx = null;
      moduleContainer = null;
      lastRenderKey = null;
      lastQuestionId = null;
      localPinDraft = null;
      localConfirmed = false;
    },
  });

  function updateOrRender(container, state, ctx) {
    const key = renderKey(state, ctx);
    const existingRoot = container.querySelector('.wlw-root.play');

    // Wichtig: Wenn nur ein anderer Spieler seinen Pin setzt, ändert sich zwar der
    // globale Game-State, aber Frage/Phase bleiben gleich. Dann wird hier NICHT
    // neu gerendert. Dadurch bleibt der aktuelle Zoom/Pan der Google Map erhalten.
    // Neu gerendert wird erst bei admin-/rundenrelevanten Änderungen wie Frage,
    // Eingabe starten, Eingabe schließen oder Reveal.
    if (existingRoot && key === lastRenderKey) {
      patchPlayerUi(container, state, ctx);
      return;
    }

    lastRenderKey = key;
    render(container, state, ctx);
  }

  function render(container, state, ctx) {
    const game = normalizeGameState(state.gameState);
    const question = game.currentQuestion;
    const playerId = currentPlayerId(state, ctx.clientId);
    const myPin = playerId && game.pins ? game.pins[playerId] : null;
    const phase = game.phase || 'setup';

    if (!question) {
      lastQuestionId = null;
      localPinDraft = null;
      localConfirmed = false;
      container.innerHTML = `
        <div class="wlw-root play">
          <div class="wlw-play-card">
            <div class="wlw-play-title">Warten auf die Frage</div>
            <div class="wlw-play-meta">Der Moderator wählt gleich eine Frage aus.</div>
          </div>
        </div>`;
      return;
    }

    if (question.id !== lastQuestionId) {
      lastQuestionId = question.id;
      localPinDraft = null;
      localConfirmed = false;
    }

    if (phase !== 'placing') {
      localConfirmed = Boolean(myPin && myPin.confirmed);
    }

    const hasLocalOrServerPin = Boolean(myPin || localPinDraft);
    const pinConfirmed = Boolean((myPin && myPin.confirmed) || localConfirmed);
    const canPlace = phase === 'placing' && playerId && !pinConfirmed;
    const ownPin = myPin
      ? ownPinFromServer(state, playerId, myPin)
      : localPinDraft
        ? ownPinFromLocal(state, playerId, localPinDraft)
        : null;

    container.innerHTML = `
      <div class="wlw-root play">
        <div class="wlw-play-card">
          <div class="wlw-kicker">WO LIEGT WAS?</div>
          <div class="wlw-play-title">${escapeHtml(question.questionText)}</div>
          ${question.subtitle ? `<div class="wlw-play-meta">${escapeHtml(question.subtitle)}</div>` : ''}
          <div class="wlw-play-meta">${escapeHtml(question.mapLabel || mapLabel(currentMapView(question)))}</div>
          <div class="wlw-play-meta" data-wlw-status>${statusText(phase, myPin, localConfirmed)}</div>
        </div>
        ${window.WoLiegtWasMap.renderMap({
          mapView: currentMapView(question),
          ownPin,
          showPlayerPins: false,
          showTargetPin: false,
          isInteractive: canPlace,
          locked: !canPlace,
          compact: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          draggable: true,
          mapTypeId: 'satellite',
          onPinChange: (pin) => {
            localPinDraft = pin;
            localConfirmed = false;
            ctx.sendAction({
              type: 'wlw:set-pin',
              lat: pin.lat,
              lng: pin.lng,
            });
            patchPlayerUi(container, state, ctx, { forceHasPin: true });
          },
        })}
        ${controlsHtml(phase, myPin, hasLocalOrServerPin, pinConfirmed)}
      </div>`;
    window.WoLiegtWasMap.mountRenderedMaps(container);
    wireConfirmButton(container, state, ctx, { forceHasPin: hasLocalOrServerPin, forceConfirmed: pinConfirmed });
  }

  function patchPlayerUi(container, state, ctx, options = {}) {
    const game = normalizeGameState(state.gameState);
    const question = game.currentQuestion;
    const playerId = currentPlayerId(state, ctx.clientId);
    const myPin = playerId && game.pins ? game.pins[playerId] : null;
    const phase = game.phase || 'setup';

    if (!question) return;
    if (myPin && myPin.confirmed) localConfirmed = true;

    const status = container.querySelector('[data-wlw-status]');
    if (status) status.textContent = statusText(phase, myPin, localConfirmed);
    wireConfirmButton(container, state, ctx, options);
  }

  function wireConfirmButton(container, state, ctx, options = {}) {
    const game = normalizeGameState(state.gameState);
    const playerId = currentPlayerId(state, ctx.clientId);
    const myPin = playerId && game.pins ? game.pins[playerId] : null;
    const phase = game.phase || 'setup';
    const confirm = container.querySelector('[data-wlw-confirm]');
    if (!confirm) return;

    const hasPin = options.forceHasPin || Boolean(myPin || localPinDraft);
    const confirmed = options.forceConfirmed || Boolean((myPin && myPin.confirmed) || localConfirmed);
    const canConfirm = phase === 'placing' && hasPin && !confirmed;

    confirm.disabled = !canConfirm;
    confirm.textContent = confirmed ? 'Pin bestätigt' : 'Pin bestätigen';
    confirm.onclick = canConfirm
      ? () => {
          localConfirmed = true;
          confirm.disabled = true;
          confirm.textContent = 'Pin bestätigt';
          const status = container.querySelector('[data-wlw-status]');
          if (status) status.textContent = 'Pin gesetzt – warte auf Auflösung.';
          ctx.sendAction({ type: 'wlw:confirm-pin' });
        }
      : null;
  }

  function controlsHtml(phase, myPin, hasPin, confirmed) {
    if (phase === 'placing') {
      const disabled = !hasPin || confirmed ? 'disabled' : '';
      const label = confirmed ? 'Pin bestätigt' : 'Pin bestätigen';
      return `<button class="primary wlw-confirm" data-wlw-confirm ${disabled}>${label}</button>`;
    }
    if (phase === 'locked') {
      const copy = myPin && myPin.confirmed
        ? 'Pin gesetzt – warte auf Auflösung.'
        : 'Eingabe geschlossen';
      return `<div class="wlw-play-card"><b>${copy}</b><div class="wlw-play-meta">Schau auf den TV.</div></div>`;
    }
    if (phase === 'reveal-pins' || phase === 'reveal' || phase === 'result') {
      return '<div class="wlw-play-card"><b>Auflösung läuft</b><div class="wlw-play-meta">Schau auf den TV.</div></div>';
    }
    return '<div class="wlw-play-card"><b>Noch nicht gestartet</b><div class="wlw-play-meta">Warte auf den Moderator.</div></div>';
  }

  function statusText(phase, myPin, confirmed = false) {
    if (phase === 'placing') {
      if ((myPin && myPin.confirmed) || confirmed) return 'Pin gesetzt – warte auf Auflösung.';
      return 'Tippe auf die Karte, um deinen Pin zu setzen. Vor dem Bestätigen kannst du ihn ändern.';
    }
    if (phase === 'locked') return myPin && myPin.confirmed
      ? 'Pin gesetzt – warte auf Auflösung.'
      : 'Die Eingabe ist geschlossen.';
    if (phase === 'reveal-pins' || phase === 'reveal' || phase === 'result') return 'Die Lösung wird auf dem TV angezeigt.';
    return 'Der Moderator startet gleich die Eingabe.';
  }

  function renderKey(state, ctx) {
    const game = normalizeGameState(state.gameState);
    const question = game.currentQuestion;
    const phase = game.phase || 'setup';
    const playerId = currentPlayerId(state, ctx.clientId) || 'no-player';
    return [
      playerId,
      question ? question.id : 'no-question',
      phase,
      game.placingStartedAt || '',
      game.lockedAt || '',
      game.revealedAt || '',
      game.resultConfirmed ? 'result-confirmed' : '',
    ].join('|');
  }

  function ownPinFromServer(state, playerId, myPin) {
    return {
      lat: myPin.lat != null ? myPin.lat : myPin.latitude,
      lng: myPin.lng != null ? myPin.lng : myPin.longitude,
      x: myPin.x,
      y: myPin.y,
      color: playerColor(state, playerId),
      label: 'Du',
      playerName: playerName(state, playerId),
      confirmed: myPin.confirmed,
    };
  }

  function ownPinFromLocal(state, playerId, pin) {
    return {
      lat: pin.lat,
      lng: pin.lng,
      color: playerColor(state, playerId),
      label: 'Du',
      playerName: playerName(state, playerId),
      confirmed: false,
    };
  }

  function currentPlayerId(state, clientId) {
    const client = state.clients && state.clients[clientId];
    return client ? client.playerId : null;
  }

  function playerColor(state, playerId) {
    const player = state.players.find((entry) => entry.id === playerId);
    return player ? player.color : '#ffd15c';
  }

  function playerName(state, playerId) {
    const player = state.players.find((entry) => entry.id === playerId);
    return player ? player.name : playerId;
  }

  function mapLabel(mapType) {
    if (!window.WoLiegtWasMap || !window.WoLiegtWasMap.getMapConfig) return 'Stumme Karte';
    const config = window.WoLiegtWasMap.getMapConfig(mapType);
    return config.label || 'Stumme Karte';
  }

  function normalizeGameState(value) {
    return {
      phase: 'setup',
      questions: [],
      currentQuestion: null,
      pins: {},
      results: [],
      placingStartedAt: null,
      lockedAt: null,
      revealedAt: null,
      resultConfirmed: false,
      ...(value && typeof value === 'object' ? value : {}),
    };
  }

  function ensureMap() {
    if (window.WoLiegtWasMap && window.WlwGeoUtils && window.WlwRegionMask) return Promise.resolve();
    return loadScript('/games/wo-liegt-was/regionConfigs.js', 'wlw-region-configs-script')
      .then(() => loadScript('/games/wo-liegt-was/whereIsWhatMapViews.js', 'wlw-map-views-script'))
      .then(() => loadScript('/games/wo-liegt-was/geoUtils.js', 'wlw-geo-utils-script'))
      .then(() => loadScript('/games/wo-liegt-was/regionMask.js', 'wlw-region-mask-script'))
      .then(() => loadScript('/games/wo-liegt-was/map.js', 'wlw-map-script'));
  }

  function loadScript(src, marker) {
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[data-${marker}]`);
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
        } else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', resolve, { once: true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset[marker.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = '1';
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  function injectStyles() {
    if (!window.WoLiegtWasMap || document.getElementById('wlw-map-styles')) return;
    const style = document.createElement('style');
    style.id = 'wlw-map-styles';
    style.textContent = window.WoLiegtWasMap.styles();
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function currentMapView(question) {
    return question && (question.mapView || question.mapType) ? question.mapView || question.mapType : 'germany';
  }
})();
