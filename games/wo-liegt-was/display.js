/* Spiel "WO LIEGT WAS?" — TV/Display-Modul. */
(function () {
  let lastState = null;
  let mapReady = false;

  GameRegistry.register('wo-liegt-was', {
    mount(container) {
      if (window.__setGameMounted) window.__setGameMounted(true);
      container.innerHTML = '<div class="idle"><div class="big">WO LIEGT WAS?</div><div>Karte wird geladen ...</div></div>';
      ensureMap().then(() => {
        mapReady = true;
        injectStyles();
        if (lastState) render(container, lastState);
      });
    },

    update(state) {
      lastState = state;
      if (!mapReady) return;
      render(document.getElementById('content'), state);
    },

    unmount(container) {
      if (window.__setGameMounted) window.__setGameMounted(false);
      container.innerHTML = '';
      lastState = null;
    },
  });

  function render(container, state) {
    if (!container) return;
    const game = normalizeGameState(state.gameState);
    const question = game.currentQuestion;
    const phase = game.phase || 'setup';
    const reveal = phase === 'reveal' || phase === 'result';
    const pinsRevealed = phase === 'reveal-pins' || reveal;
    const targetReady = hasValidTarget(question);
    const pins = pinsRevealed ? displayPins(state, game) : [];
    const target = reveal && question && targetReady
      ? {
          lat: question.targetLatitude,
          lng: question.targetLongitude,
          label: question.targetName,
        }
      : null;

    container.innerHTML = `
      <div class="wlw-root display">
        <div class="wlw-map-wrap">
          ${window.WoLiegtWasMap.renderMap({
            mapView: question ? currentMapView(question) : 'germany',
            playerPins: pins,
            targetPin: target,
            showPlayerPins: pinsRevealed,
            showTargetPin: reveal && targetReady,
            showLines: reveal && targetReady,
            isInteractive: false,
            locked: true,
            mapTypeId: 'satellite',
            fillRegion: true,
          })}
        </div>
        <div class="wlw-panel">
          ${question ? questionCopy(question, phase) : setupCopy(game)}
          ${reveal ? winnerBanner(state, game) : ''}
          ${reveal ? resultList(state, game) : totalsList(state, game)}
        </div>
      </div>`;
    sizeDisplayMap(container, question ? currentMapView(question) : 'germany');
    window.WoLiegtWasMap.mountRenderedMaps(container);
  }

  // Passt die Karten-Box an das Seitenverhältnis der Region an, damit die
  // Region den Kartenausschnitt ohne Letterbox-Ränder füllt.
  function sizeDisplayMap(container, regionId) {
    const wrap = container.querySelector('.wlw-map-wrap');
    const mapEl = container.querySelector('.wlw-map');
    if (!wrap || !mapEl || !window.WoLiegtWasMap.getRegionBounds) return;
    const bounds = window.WoLiegtWasMap.getRegionBounds(regionId);
    if (!bounds) return;
    const latFraction = mercatorLat(bounds.north) - mercatorLat(bounds.south);
    const lngFraction = (((bounds.east - bounds.west) % 360) + 360) % 360 / 180 * Math.PI;
    if (latFraction <= 0 || lngFraction <= 0) return;
    const aspect = lngFraction / latFraction;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    if (!availW || !availH) return;
    let width = availW;
    let height = width / aspect;
    if (height > availH) {
      height = availH;
      width = height * aspect;
    }
    mapEl.style.aspectRatio = 'auto';
    mapEl.style.width = `${Math.round(width)}px`;
    mapEl.style.height = `${Math.round(height)}px`;
  }

  function mercatorLat(lat) {
    const clamped = Math.max(-85, Math.min(85, Number(lat)));
    const rad = (clamped * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
  }

  function setupCopy(game) {
    return `
      <div class="wlw-game-title">WO LIEGT WAS?</div>
      <div class="wlw-kicker">WO LIEGT WAS?</div>
      <div class="wlw-title">Frage auswählen</div>
      <div class="wlw-sub">${game.questions.length} Fragen sind bereit.</div>`;
  }

  function questionCopy(question, phase) {
    const phaseText = {
      setup: 'Bereit',
      placing: 'Pins werden gesetzt',
      locked: 'Eingabe geschlossen',
      'reveal-pins': 'Die Pins sind aufgedeckt',
      reveal: 'Auflösung',
      result: 'Ergebnis',
    }[phase] || 'Bereit';
    return `
      <div class="wlw-game-title">WO LIEGT WAS?</div>
      <div class="wlw-kicker">${escapeHtml(phaseText)}</div>
      <div class="wlw-title">${escapeHtml(question.questionText)}</div>
      ${question.subtitle ? `<div class="wlw-sub">${escapeHtml(question.subtitle)}</div>` : ''}
      <div class="wlw-sub">${escapeHtml(question.mapLabel || mapLabel(currentMapView(question)))} · ${escapeHtml(question.category || 'Frage')} · ${escapeHtml(question.difficulty || 'offen')}</div>
      ${question.isTestQuestion ? '<div class="wlw-sub wlw-test-hint">Testfrage – zählt nicht zur Gesamtwertung</div>' : ''}`;
  }

  function resultList(state, game) {
    const results = game.results || [];
    if (!results.length) return '';
    const totals = game.totals && typeof game.totals === 'object' ? game.totals : {};
    const hasTotals = game.scoredRounds > 0 && Object.keys(totals).length > 0;
    const anyMissing = results.some((row) => row.distanceKm == null && !game.targetMissing);
    return `
      <div class="wlw-results" style="margin-top:14px;">
        ${results.map((row, index) => {
          const player = state.players.find((entry) => entry.id === row.playerId);
          const distance = row.distanceKm == null
            ? row.hasPin && game.targetMissing ? 'Keine Auswertung' : 'Keine Eingabe'
            : `${formatDistance(row.distanceKm)} km`;
          const total = hasTotals && Number.isFinite(Number(totals[row.playerId]))
            ? `<span class="total">Gesamt: ${formatDistance(totals[row.playerId])} km</span>`
            : '';
          return `
            <div class="wlw-result-row ${index === 0 && row.hasPin && !game.targetMissing ? 'winner' : ''}" style="color:${player ? player.color : '#fff'}">
              <b>${index + 1}. ${escapeHtml(row.playerName)}</b>
              <span class="wlw-result-right"><span class="km">${distance}</span>${total}</span>
            </div>`;
        }).join('')}
        ${anyMissing && !isTestQuestion(game.currentQuestion) ? '<div class="wlw-sub">Ohne Eingabe zählt die schlechteste Distanz der Runde.</div>' : ''}
      </div>`;
  }

  function totalsList(state, game) {
    if (!state.players.length) return '';
    const totals = game.totals && typeof game.totals === 'object' ? game.totals : {};
    const scored = Number(game.scoredRounds) || 0;
    const rows = state.players
      .map((player) => ({
        player,
        totalKm: Number.isFinite(Number(totals[player.id])) ? Number(totals[player.id]) : 0,
      }))
      .sort((a, b) => a.totalKm - b.totalKm);
    const bestTotal = rows[0].totalKm;
    return `
      <div class="wlw-totals-title">Gesamtwertung${scored ? ` · ${scored} ${scored === 1 ? 'Frage' : 'Fragen'} gewertet` : ''}</div>
      <div class="wlw-sub" style="margin-top:2px;">Die kleinste Gesamtentfernung gewinnt.</div>
      <div class="wlw-totals">
        ${rows.map((row, index) => `
          <div class="wlw-total-row ${scored && row.totalKm === bestTotal ? 'leader' : ''}" style="color:${row.player.color}">
            <b>${index + 1}. ${escapeHtml(row.player.name)}</b>
            <span class="km">${formatDistance(row.totalKm)} km</span>
          </div>`).join('')}
      </div>`;
  }

  function isTestQuestion(question) {
    return Boolean(question && question.isTestQuestion === true);
  }

  function winnerBanner(state, game) {
    if (game.targetMissing) {
      return '<div class="wlw-winner-banner tie">Zielkoordinaten fehlen – Auswertung nicht möglich.</div>';
    }
    const winnerIds = Array.isArray(game.winnerPlayerIds) ? game.winnerPlayerIds : [];
    if (!winnerIds.length) {
      return '<div class="wlw-winner-banner tie">Keine gültige Eingabe</div>';
    }
    if (game.tie || winnerIds.length > 1) {
      const names = winnerIds.map((id) => playerName(state, id)).join(' & ');
      return `<div class="wlw-winner-banner tie">Unentschieden: ${escapeHtml(names)}</div>`;
    }
    return `<div class="wlw-winner-banner">Rundensieger: ${escapeHtml(playerName(state, winnerIds[0]))}</div>`;
  }

  function displayPins(state, game) {
    const pins = game.pins || {};
    return state.players
      .map((player, index) => {
        const pin = pins[player.id];
        if (!pin) return null;
        return {
          lat: pin.lat != null ? pin.lat : pin.latitude,
          lng: pin.lng != null ? pin.lng : pin.longitude,
          x: pin.x,
          y: pin.y,
          color: player.color,
          label: String(index + 1),
          playerName: player.name,
          confirmed: pin.confirmed,
        };
      })
      .filter(Boolean);
  }

  function normalizeGameState(value) {
    return {
      phase: 'setup',
      questions: [],
      currentQuestion: null,
      pins: {},
      results: [],
      targetMissing: false,
      totals: {},
      scoredRounds: 0,
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

  function formatDistance(value) {
    // Tausenderpunkt für große Gesamtentfernungen, z. B. "1.234 km".
    return Math.round(Number(value) || 0).toLocaleString('de-DE');
  }

  function hasValidTarget(question) {
    return Boolean(
      question &&
        isFiniteCoordinate(question.targetLatitude) &&
        isFiniteCoordinate(question.targetLongitude),
    );
  }

  function isFiniteCoordinate(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function mapLabel(mapType) {
    if (!window.WoLiegtWasMap || !window.WoLiegtWasMap.getMapConfig) return 'Stumme Karte';
    const config = window.WoLiegtWasMap.getMapConfig(mapType);
    return config.label || 'Stumme Karte';
  }

  function currentMapView(question) {
    return question && (question.mapView || question.mapType) ? question.mapView || question.mapType : 'germany';
  }

  function playerName(state, playerId) {
    const player = state.players.find((entry) => entry.id === playerId);
    return player ? player.name : playerId;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
