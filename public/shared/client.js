/* Gemeinsamer Client-Kern für alle drei Ansichten.
 * - Stabile clientId in localStorage (überlebt Reload & Standby -> Reconnect).
 * - Wichtig: clientId ist rollengetrennt, damit Admin, TV und Handy im selben Browser
 *   nicht gegenseitig ihre Rolle überschreiben.
 * - Socket.IO-Verbindung mit Auto-Reconnect.
 * - Einheitliches State-Handling: window.App.onState(cb).
 */
(function () {
  const role = window.APP_ROLE || 'play';
  const LEGACY_STORAGE_KEY = 'weidmann.clientId';
  const STORAGE_KEY = `weidmann.clientId.${role}`;

  function createClientId() {
    return `${role}_` + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getClientId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (id) return id;

    // Nur die Spieler-Ansicht darf den alten Key übernehmen.
    // Grund: Früher hatten Admin, TV und Spieler denselben localStorage-Key.
    // Wenn Admin und TV im selben Browser geöffnet waren, hat ein Tab die Rolle des
    // anderen überschrieben. Dadurch wurden Admin-Aktionen serverseitig ignoriert.
    if (role === 'play') {
      const legacyId = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyId) {
        localStorage.setItem(STORAGE_KEY, legacyId);
        return legacyId;
      }
    }

    id = createClientId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  }

  const clientId = getClientId();

  // socket.io-Client wird per <script src="/socket.io/socket.io.js"> geladen.
  const socket = io({
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });

  const stateListeners = [];
  let lastState = null;

  socket.on('connect', () => {
    // Bei (Re)Connect immer neu identifizieren -> Server stellt Spieler/Rolle wieder her.
    socket.emit('identify', { clientId, role });
    setStatus(true);
  });

  socket.on('disconnect', () => setStatus(false));

  socket.on('state', (state) => {
    lastState = state;
    stateListeners.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error(e);
      }
    });
  });

  function setStatus(connected) {
    document.querySelectorAll('[data-conn]').forEach((el) => {
      el.textContent = connected ? 'verbunden' : 'getrennt';
      el.classList.toggle('online', connected);
      el.classList.toggle('offline', !connected);
    });
  }

  // Helfer: mein Client-Eintrag aus dem State.
  function me(state) {
    return (state && state.clients && state.clients[clientId]) || null;
  }

  window.App = {
    socket,
    clientId,
    role,
    onState(cb) {
      stateListeners.push(cb);
      if (lastState) cb(lastState);
    },
    getState() {
      return lastState;
    },
    me,
  };
})();
