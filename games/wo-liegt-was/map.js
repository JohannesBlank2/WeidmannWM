(function () {
  const mapViewsApi = window.WhereIsWhatMapViews || {
    MAP_VIEWS: {
      germany: {
        id: 'germany',
        label: 'Ganz Deutschland',
        geoJsonPath: '/assets/maps/germany.geojson',
        center: { lat: 51.1657, lng: 10.4515 },
        zoom: 6,
        mobileZoom: 6,
        bounds: { south: 47.25, west: 5.84, north: 55.12, east: 15.06 },
        mapTypeId: 'satellite',
      },
    },
    getMapView(mapView) {
      return this.MAP_VIEWS[mapView] || this.MAP_VIEWS.germany;
    },
  };
  const MAP_VIEWS = mapViewsApi.MAP_VIEWS;
  const pendingOptions = new Map();
  let googleMapsPromise = null;
  let mapIdCounter = 0;

  const silentMapStyle = [
    { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'landscape', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  ];

  class WhereIsWhatGoogleMap {
    constructor(element, options = {}) {
      this.element = element;
      this.options = normalizeOptions(options);
      this.map = null;
      this.markers = [];
      this.lines = [];
      this.clickListener = null;
      this.regionId = this.options.mapView || 'germany';
      this.noticeTimer = null;
    }

    async mount() {
      this.element.innerHTML = '<div class="wlw-map-loading">Karte wird geladen ...</div>';
      let google;
      try {
        google = await loadGoogleMaps();
      } catch (err) {
        this.element.innerHTML = `<div class="wlw-map-error">${escapeHtml(err.message || 'Google Maps konnte nicht geladen werden.')}</div>`;
        return;
      }

      const canvas = document.createElement('div');
      canvas.className = 'wlw-google-map-canvas';
      this.element.innerHTML = '';
      this.element.appendChild(canvas);

      const view = getMapView(this.options.mapView);
      this.regionId = view.id || this.options.mapView || 'germany';
      const mapTypeId = this.options.mapTypeId || view.mapTypeId || 'satellite';
      this.map = new google.maps.Map(canvas, {
        center: this.options.initialCenter || view.center,
        zoom: this.options.initialZoom || (this.options.compact ? view.mobileZoom || view.zoom : view.zoom),
        mapTypeId,
        styles: mapTypeId === 'roadmap' ? silentMapStyle : undefined,
        disableDefaultUI: true,
        clickableIcons: false,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        zoomControl: this.options.zoomControl === true,
        gestureHandling: this.options.gestureHandling || (this.options.compact ? 'greedy' : 'none'),
        draggable: this.options.draggable === true || this.options.isInteractive === true,
        keyboardShortcuts: false,
        isFractionalZoomEnabled: this.options.fillRegion === true ? true : undefined,
      });

      if (view.bounds) {
        const bounds = new google.maps.LatLngBounds(
          { lat: view.bounds.south, lng: view.bounds.west },
          { lat: view.bounds.north, lng: view.bounds.east },
        );
        this.map.fitBounds(bounds, this.options.compact ? 16 : this.options.fillRegion ? 0 : 28);
        // Region bleibt beim Pannen im Bild; weiter herauszoomen als die
        // eingepasste Ansicht ist gesperrt (minZoom nach dem Fit).
        this.map.setOptions({
          restriction: {
            latLngBounds: {
              south: view.bounds.south,
              west: view.bounds.west,
              north: view.bounds.north,
              east: view.bounds.east,
            },
            strictBounds: false,
          },
        });
        google.maps.event.addListenerOnce(this.map, 'idle', () => {
          if (!this.map) return;
          if (this.options.fillRegion) {
            // fitBounds rastet auf ganze Zoomstufen ein und lässt Ränder frei –
            // mit fraktionalem Zoom die Region exakt in den Ausschnitt einpassen.
            const zoom = boundsZoom(view.bounds, canvas.clientWidth, canvas.clientHeight);
            if (Number.isFinite(zoom) && zoom > this.map.getZoom()) {
              this.map.setZoom(zoom);
              this.map.setCenter(bounds.getCenter());
            }
          }
          this.map.setOptions({ minZoom: this.map.getZoom() });
        });
      }

      this.applyRegionOverlay();

      this.renderPins();
      if (this.options.isInteractive && !this.options.locked) {
        this.clickListener = this.map.addListener('click', (event) => {
          if (!event.latLng) return;
          const pin = {
            lat: event.latLng.lat(),
            lng: event.latLng.lng(),
          };
          if (window.WlwGeoUtils && !window.WlwGeoUtils.isPointInsideRegion(pin.lat, pin.lng, this.regionId)) {
            this.showNotice('Bitte innerhalb des Umrisses tippen.');
            return;
          }
          this.options.ownPin = {
            ...(this.options.ownPin || {}),
            ...pin,
            label: this.options.ownPin && this.options.ownPin.label ? this.options.ownPin.label : 'Du',
            color: this.options.ownPin && this.options.ownPin.color ? this.options.ownPin.color : '#ffd15c',
          };
          this.renderPins();
          if (typeof this.options.onPinChange === 'function') {
            this.options.onPinChange(pin);
          }
        });
      }
    }

    applyRegionOverlay() {
      if (!window.WlwGeoUtils || !window.WlwRegionMask) {
        console.error('[wo-liegt-was] Region-Module (geoUtils/regionMask) fehlen — Karte läuft ohne Umriss-Maske.');
        return;
      }
      window.WlwGeoUtils.loadRegionGeoJson(this.regionId)
        .then((geoJson) => {
          if (!this.map) return;
          window.WlwRegionMask.applyRegionMask(this.map, this.regionId, geoJson);
        })
        .catch((err) => {
          console.error(`[wo-liegt-was] Umriss für Region "${this.regionId}" konnte nicht geladen werden:`, err);
          this.showNotice('Region-Umriss konnte nicht geladen werden – es gilt nur der Kartenausschnitt.');
        });
    }

    showNotice(message) {
      if (!this.element) return;
      let notice = this.element.querySelector('.wlw-map-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'wlw-map-notice';
        this.element.appendChild(notice);
      }
      notice.textContent = message;
      notice.classList.add('visible');
      clearTimeout(this.noticeTimer);
      this.noticeTimer = setTimeout(() => notice.classList.remove('visible'), 2400);
    }

    renderPins() {
      if (!this.map || !window.google || !window.google.maps) return;
      this.clearOverlays();
      const google = window.google;
      const pins = [];

      if (this.options.showPlayerPins) {
        pins.push(...this.options.playerPins);
      }
      if (this.options.ownPin) {
        pins.push(this.options.ownPin);
      }

      pins.forEach((pin) => {
        if (!pin || !isFiniteCoordinate(pin.lat) || !isFiniteCoordinate(pin.lng)) return;
        const marker = new google.maps.Marker({
          position: { lat: Number(pin.lat), lng: Number(pin.lng) },
          map: this.map,
          icon: playerPinIcon(pin.color || '#ffd15c'),
          label: pin.label
            ? {
                text: String(pin.label).slice(0, 2),
                color: '#12070a',
                fontWeight: '900',
                fontSize: '12px',
              }
            : undefined,
          title: pin.playerName || pin.label || '',
          optimized: false,
          zIndex: 4,
        });
        this.markers.push(marker);
      });

      const target = this.options.targetPin;
      if (this.options.showTargetPin && target && isFiniteCoordinate(target.lat) && isFiniteCoordinate(target.lng)) {
        const marker = new google.maps.Marker({
          position: { lat: Number(target.lat), lng: Number(target.lng) },
          map: this.map,
          icon: targetPinIcon(),
          title: target.label || 'Lösung',
          optimized: false,
          zIndex: 6,
        });
        this.markers.push(marker);

        if (this.options.showLines) {
          pins.forEach((pin) => {
            if (!pin || !isFiniteCoordinate(pin.lat) || !isFiniteCoordinate(pin.lng)) return;
            const line = new google.maps.Polyline({
              path: [
                { lat: Number(pin.lat), lng: Number(pin.lng) },
                { lat: Number(target.lat), lng: Number(target.lng) },
              ],
              map: this.map,
              strokeColor: pin.color || '#ffd15c',
              strokeOpacity: 0.72,
              strokeWeight: 2,
              clickable: false,
              zIndex: 3,
            });
            this.lines.push(line);
          });
        }
      }
    }

    clearOverlays() {
      this.markers.forEach((marker) => marker.setMap(null));
      this.lines.forEach((line) => line.setMap(null));
      this.markers = [];
      this.lines = [];
    }
  }

  function renderMap(options = {}) {
    const normalized = normalizeOptions(options);
    const id = `wlw-google-map-${++mapIdCounter}`;
    pendingOptions.set(id, normalized);
    const classes = [
      'wlw-map',
      `wlw-map-${normalized.mapView}`,
      normalized.isInteractive ? 'interactive' : '',
      normalized.compact ? 'compact' : '',
    ].filter(Boolean).join(' ');

    return `
      <div class="${classes}" data-wlw-map="${escapeHtml(normalized.mapView)}" data-wlw-map-id="${id}">
        <div class="wlw-map-loading">Karte wird geladen ...</div>
      </div>`;
  }

  function mountRenderedMaps(root = document) {
    const maps = root.querySelectorAll('[data-wlw-map-id]');
    maps.forEach((element) => {
      const id = element.dataset.wlwMapId;
      const options = pendingOptions.get(id);
      if (!options) return;
      pendingOptions.delete(id);
      const component = new WhereIsWhatGoogleMap(element, options);
      element.__whereIsWhatGoogleMap = component;
      component.mount();
    });
  }

  function normalizeOptions(options = {}) {
    const mapView = options.mapView || options.mapType || 'germany';
    const ownPin = normalizePin(options.ownPin || (options.pins && options.pins.length === 1 ? options.pins[0] : null), mapView);
    const playerPins = Array.isArray(options.playerPins)
      ? options.playerPins.map((pin) => normalizePin(pin, mapView)).filter(Boolean)
      : Array.isArray(options.pins)
        ? options.pins.map((pin) => normalizePin(pin, mapView)).filter(Boolean)
        : [];
    const targetPin = normalizeTarget(options.targetPin || options.target, mapView);

    return {
      mapView,
      initialCenter: options.initialCenter || null,
      initialZoom: options.initialZoom || null,
      mapTypeId: options.mapTypeId || 'satellite',
      isInteractive: options.isInteractive === true || options.interactive === true,
      ownPin,
      playerPins,
      targetPin,
      showPlayerPins: options.showPlayerPins === true || (options.showPlayerPins !== false && Array.isArray(options.pins) && options.showPlayerPins !== false),
      showTargetPin: options.showTargetPin === true || !!options.target,
      showLines: options.showLines === true,
      onPinChange: options.onPinChange,
      onPinConfirm: options.onPinConfirm,
      locked: options.locked === true,
      compact: options.compact === true,
      zoomControl: options.zoomControl === true,
      gestureHandling: options.gestureHandling,
      draggable: options.draggable,
      fillRegion: options.fillRegion === true,
    };
  }

  function normalizePin(pin, mapView = 'germany') {
    if (!pin) return null;
    if (isFiniteCoordinate(pin.lat) && isFiniteCoordinate(pin.lng)) {
      return {
        ...pin,
        lat: Number(pin.lat),
        lng: Number(pin.lng),
      };
    }
    if (isFiniteCoordinate(pin.latitude) && isFiniteCoordinate(pin.longitude)) {
      return {
        ...pin,
        lat: Number(pin.latitude),
        lng: Number(pin.longitude),
      };
    }
    if (pin.x != null && pin.y != null) {
      const coords = mapPositionToLatLon(pin.x, pin.y, mapView);
      return {
        ...pin,
        lat: coords.lat,
        lng: coords.lng,
      };
    }
    return null;
  }

  function normalizeTarget(target, mapView = 'germany') {
    if (!target) return null;
    return normalizePin({
      ...target,
      lat: target.lat != null ? target.lat : target.targetLatitude != null ? target.targetLatitude : target.latitude,
      lng: target.lng != null ? target.lng : target.targetLongitude != null ? target.targetLongitude : target.longitude,
    }, mapView);
  }

  async function loadGoogleMaps() {
    if (window.google && window.google.maps) return window.google;
    if (googleMapsPromise) return googleMapsPromise;

    googleMapsPromise = fetch('/api/config')
      .then((response) => response.ok ? response.json() : {})
      .then((config) => {
        const apiKey = config.googleMapsApiKey || '';
        if (!apiKey) throw new Error('Google Maps API Key fehlt.');
        return new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-google-maps-api]');
          if (existing) {
            existing.addEventListener('load', () => resolve(window.google), { once: true });
            existing.addEventListener('error', () => reject(new Error('Google Maps konnte nicht geladen werden.')), { once: true });
            return;
          }
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
          script.async = true;
          script.defer = true;
          script.dataset.googleMapsApi = '1';
          script.onload = () => resolve(window.google);
          script.onerror = () => reject(new Error('Google Maps konnte nicht geladen werden.'));
          document.head.appendChild(script);
        });
      });

    return googleMapsPromise;
  }

  function getMapView(mapView = 'germany') {
    return mapViewsApi.getMapView ? mapViewsApi.getMapView(mapView) : MAP_VIEWS[mapView] || MAP_VIEWS.germany;
  }

  function getMapConfig(mapView = 'germany') {
    return getMapView(mapView);
  }

  function getRegionConfig(regionId = 'germany') {
    return getMapView(regionId);
  }

  function getRegionBounds(regionId = 'germany') {
    if (window.WlwGeoUtils) return window.WlwGeoUtils.getRegionBounds(regionId);
    const view = getMapView(regionId);
    return view ? view.bounds || null : null;
  }

  function loadRegionGeoJson(regionId = 'germany') {
    if (!window.WlwGeoUtils) return Promise.reject(new Error('WlwGeoUtils ist nicht geladen.'));
    return window.WlwGeoUtils.loadRegionGeoJson(regionId);
  }

  function isPointInsideRegion(lat, lng, regionId = 'germany') {
    if (!window.WlwGeoUtils) return true;
    return window.WlwGeoUtils.isPointInsideRegion(lat, lng, regionId);
  }

  function fitMapToRegion(map, regionId = 'germany') {
    if (!map || !window.google || !window.google.maps) return;
    const bounds = getRegionBounds(regionId);
    if (!bounds) return;
    map.fitBounds(new window.google.maps.LatLngBounds(
      { lat: bounds.south, lng: bounds.west },
      { lat: bounds.north, lng: bounds.east },
    ));
    map.setOptions({
      restriction: {
        latLngBounds: { south: bounds.south, west: bounds.west, north: bounds.north, east: bounds.east },
        strictBounds: false,
      },
    });
    window.google.maps.event.addListenerOnce(map, 'idle', () => {
      map.setOptions({ minZoom: map.getZoom() });
    });
  }

  function applyRegionMask(map, regionId, geoJson) {
    if (!window.WlwRegionMask) return null;
    return window.WlwRegionMask.applyRegionMask(map, regionId, geoJson);
  }

  function clearRegionMask(map) {
    if (!window.WlwRegionMask) return;
    window.WlwRegionMask.clearRegionMask(map);
  }

  function latLonToMapPosition(latitude, longitude, mapView = 'germany') {
    const bounds = legacyBounds(getMapView(mapView));
    return {
      x: clamp(((Number(longitude) - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * 100, 0, 100),
      y: clamp(((bounds.latMax - Number(latitude)) / (bounds.latMax - bounds.latMin)) * 100, 0, 100),
    };
  }

  function mapPositionToLatLon(xPercent, yPercent, mapView = 'germany') {
    const bounds = legacyBounds(getMapView(mapView));
    const x = clamp(Number(xPercent), 0, 100);
    const y = clamp(Number(yPercent), 0, 100);
    const lng = bounds.lonMin + (x / 100) * (bounds.lonMax - bounds.lonMin);
    const lat = bounds.latMax - (y / 100) * (bounds.latMax - bounds.latMin);
    return { lat, lng, latitude: lat, longitude: lng };
  }

  // Zoomstufe (fraktional), bei der die Bounds den Ausschnitt exakt füllen.
  function boundsZoom(bounds, widthPx, heightPx) {
    if (!bounds || !widthPx || !heightPx) return NaN;
    const WORLD = 256;
    const latFraction = (mercatorLat(bounds.north) - mercatorLat(bounds.south)) / (2 * Math.PI);
    const lngFraction = ((((bounds.east - bounds.west) % 360) + 360) % 360) / 360;
    if (latFraction <= 0 || lngFraction <= 0) return NaN;
    const latZoom = Math.log2(heightPx / WORLD / latFraction);
    const lngZoom = Math.log2(widthPx / WORLD / lngFraction);
    return Math.min(latZoom, lngZoom);
  }

  function mercatorLat(lat) {
    const clamped = Math.max(-85, Math.min(85, Number(lat)));
    const rad = (clamped * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
  }

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const rawValues = [lat1, lon1, lat2, lon2];
    if (rawValues.some((value) => !isFiniteCoordinate(value))) return null;
    const values = rawValues.map(Number);
    const earthRadiusKm = 6371;
    const dLat = toRadians(values[2] - values[0]);
    const dLon = toRadians(values[3] - values[1]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(values[0])) *
        Math.cos(toRadians(values[2])) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getRoundWinner(pins, target, mapView = 'germany') {
    const targetPin = normalizeTarget(target, mapView);
    if (!targetPin) return { winnerPlayerIds: [], tie: false, results: [] };
    const entries = Array.isArray(pins) ? pins : Object.values(pins || {});
    const results = entries
      .map((pin) => normalizePin(pin, mapView))
      .filter((pin) => pin && pin.playerId)
      .map((pin) => ({
        playerId: pin.playerId,
        distanceKm: Math.round(calculateDistanceKm(pin.lat, pin.lng, targetPin.lat, targetPin.lng)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (!results.length) return { winnerPlayerIds: [], tie: false, results };
    const bestDistance = results[0].distanceKm;
    const winnerPlayerIds = results.filter((row) => row.distanceKm === bestDistance).map((row) => row.playerId);
    return { winnerPlayerIds, tie: winnerPlayerIds.length > 1, results };
  }

  function geocodeQuestionAddress(question) {
    return loadGoogleMaps().then((google) => new Promise((resolve, reject) => {
      if (!question || !question.targetAddress) {
        reject(new Error('Keine Adresse vorhanden.'));
        return;
      }
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: question.targetAddress }, (results, status) => {
        if (status !== 'OK' || !results || !results[0]) {
          reject(new Error(`Geocoding fehlgeschlagen: ${status}`));
          return;
        }
        const location = results[0].geometry.location;
        resolve({
          ...question,
          targetLatitude: location.lat(),
          targetLongitude: location.lng(),
        });
      });
    }));
  }

  function playerPinIcon(color) {
    const safeColor = color || '#ffd15c';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">
        <path d="M20 50C14 39 5 30 5 19A15 15 0 0 1 35 19C35 30 26 39 20 50Z" fill="${safeColor}" stroke="#fff8df" stroke-width="3"/>
        <circle cx="20" cy="19" r="7" fill="#12070a" opacity=".72"/>
      </svg>`;
    return {
      url: svgDataUrl(svg),
      scaledSize: new window.google.maps.Size(34, 44),
      anchor: new window.google.maps.Point(17, 43),
      labelOrigin: new window.google.maps.Point(20, 19),
    };
  }

  function targetPinIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="19" fill="#ff3b4f" stroke="#fff8df" stroke-width="4"/>
        <circle cx="24" cy="24" r="10" fill="#fff8df"/>
        <circle cx="24" cy="24" r="4" fill="#ff3b4f"/>
      </svg>`;
    return {
      url: svgDataUrl(svg),
      scaledSize: new window.google.maps.Size(42, 42),
      anchor: new window.google.maps.Point(21, 21),
    };
  }

  function svgDataUrl(svg) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
  }

  function styles() {
    return `
      .wlw-root { width: min(1500px, 96vw); height: min(880px, 92vh); display: grid; gap: 18px; align-content: center; color: var(--text); }
      .wlw-root.display { grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); align-items: stretch; }
      .wlw-root.play { width: 100%; height: auto; min-height: 0; display: grid; gap: 12px; }
      .wlw-panel { border: 1px solid rgba(255,209,92,.24); border-radius: 8px; background: rgba(18, 7, 10, .72); box-shadow: 0 18px 42px rgba(0,0,0,.34); padding: 18px; min-height: 0; overflow-y: auto; }
      .wlw-game-title { color: var(--accent); font-size: clamp(1.1rem, 2vw, 1.8rem); font-weight: 900; letter-spacing: .14em; text-transform: uppercase; text-shadow: 0 0 16px rgba(255,209,92,.35); }
      .wlw-kicker { color: var(--accent); font-weight: 900; letter-spacing: .18em; text-transform: uppercase; font-size: .86rem; }
      .wlw-title { font-family: Georgia, 'Times New Roman', serif; color: #fff8df; font-size: clamp(2rem, 4vw, 4.4rem); line-height: 1.02; font-weight: 900; margin-top: 8px; text-shadow: 0 4px 18px rgba(0,0,0,.5); }
      .wlw-sub { color: var(--muted); font-weight: 800; margin-top: 8px; }
      .wlw-actions, .wlw-question-list, .wlw-status-grid, .wlw-results { display: grid; gap: 10px; }
      .wlw-question-list { margin-top: 10px; }
      .wlw-question-btn { width: 100%; text-align: left; }
      .wlw-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
      .wlw-status, .wlw-result-row { border: 1px solid rgba(255,209,92,.2); border-radius: 8px; background: rgba(5, 31, 22, .7); padding: 10px 12px; font-weight: 900; }
      .wlw-status span { display: block; color: var(--muted); font-size: .78rem; font-weight: 800; margin-top: 2px; }
      .wlw-result-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 1.08rem; }
      .wlw-result-right { display: flex; flex-direction: column; align-items: flex-end; }
      .wlw-result-right .km { color: #fff8df; font-size: 1.08rem; font-weight: 900; white-space: nowrap; }
      .wlw-result-right .total { color: var(--muted); font-size: .82rem; font-weight: 800; white-space: nowrap; }
      .wlw-result-row.winner { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(255,209,92,.18) inset; animation: wlw-winner-pulse 1.8s ease-in-out infinite; }
      .wlw-test-hint { color: var(--accent); }
      .wlw-totals-title { color: var(--accent); font-weight: 900; letter-spacing: .14em; text-transform: uppercase; font-size: .92rem; margin-top: 12px; }
      .wlw-totals { display: grid; gap: 8px; margin-top: 6px; }
      .wlw-total-row {
        display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
        border: 1px solid rgba(255,209,92,.2); border-radius: 8px; background: rgba(5, 31, 22, .7);
        padding: 10px 12px; font-weight: 900; font-size: 1.08rem;
      }
      .wlw-total-row .km { color: #fff8df; font-size: 1.16rem; font-weight: 900; white-space: nowrap; }
      .wlw-total-row.leader { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(255,209,92,.18) inset; }
      .wlw-winner-banner {
        margin-top: 14px; padding: 14px 16px; border-radius: 8px;
        border: 1px solid rgba(255,209,92,.5); background: linear-gradient(180deg, rgba(255,209,92,.2), rgba(82,41,9,.38));
        color: #fff8df; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1.5rem, 2.2vw, 2.3rem);
        font-weight: 900; text-shadow: 0 3px 14px rgba(0,0,0,.42);
        box-shadow: 0 0 24px rgba(255,209,92,.14), inset 0 0 0 1px rgba(255,248,223,.08);
      }
      .wlw-winner-banner.tie { color: #ffd15c; }
      .wlw-map-wrap { display: grid; min-height: 0; place-items: center; }
      .wlw-map {
        position: relative; overflow: hidden; width: 100%; aspect-ratio: 1.02 / 1;
        border: 2px solid rgba(255,209,92,.48); border-radius: 8px;
        background: linear-gradient(145deg, #10291f, #07130f 66%, #020604);
        box-shadow: inset 0 0 0 5px rgba(0,0,0,.22), 0 18px 44px rgba(0,0,0,.42);
      }
      .wlw-map.compact { aspect-ratio: 1 / .92; max-height: 58vh; min-height: 340px; }
      .wlw-map.interactive { cursor: crosshair; touch-action: none; }
      .wlw-google-map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; background: #07130f; }
      .wlw-map::after {
        content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2;
        box-shadow: inset 0 0 0 5px rgba(0,0,0,.22), inset 0 0 80px rgba(0,0,0,.35);
      }
      .wlw-map-loading, .wlw-map-error {
        position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center;
        color: #fff8df; font-weight: 900; background: linear-gradient(145deg, #10291f, #020604);
      }
      .wlw-map-error { color: #ffd15c; }
      .wlw-map-notice {
        position: absolute; left: 50%; bottom: 14px; z-index: 5; max-width: 92%;
        transform: translateX(-50%) translateY(6px);
        padding: 8px 16px; border-radius: 999px; text-align: center;
        border: 1px solid rgba(255,209,92,.55); background: rgba(18,7,10,.92);
        color: #fff8df; font-weight: 800; font-size: .85rem;
        opacity: 0; pointer-events: none;
        transition: opacity .25s ease, transform .25s ease;
      }
      .wlw-map-notice.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
      .wlw-play-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 14px; }
      .wlw-play-title { font-size: 1.35rem; font-weight: 900; color: #fff8df; line-height: 1.12; }
      .wlw-play-meta { color: var(--muted); margin-top: 6px; font-weight: 800; }
      .wlw-confirm { width: 100%; margin-top: 12px; padding: 16px; font-weight: 900; }
      .wlw-confirm:disabled { opacity: .45; }
      @keyframes wlw-winner-pulse {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }
      @media (max-width: 900px) {
        .wlw-root.display { grid-template-columns: 1fr; height: auto; align-content: start; }
        .wlw-status-grid { grid-template-columns: 1fr; }
      }
    `;
  }

  function legacyBounds(view) {
    const bounds = view && view.bounds ? view.bounds : MAP_VIEWS.germany.bounds;
    return {
      latMin: bounds.south,
      latMax: bounds.north,
      lonMin: bounds.west,
      lonMax: bounds.east,
    };
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function isFiniteCoordinate(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function toRadians(value) {
    return (Number(value) * Math.PI) / 180;
  }

  window.WhereIsWhatGoogleMap = WhereIsWhatGoogleMap;
  window.WoLiegtWasMap = {
    MAP_VIEWS,
    silentMapStyle,
    getMapView,
    getMapConfig,
    getRegionConfig,
    getRegionBounds,
    loadRegionGeoJson,
    isPointInsideRegion,
    fitMapToRegion,
    applyRegionMask,
    clearRegionMask,
    latLonToMapPosition,
    mapPositionToLatLon,
    calculateDistanceKm,
    getRoundWinner,
    geocodeQuestionAddress,
    renderMap,
    mountRenderedMaps,
    styles,
  };
})();
