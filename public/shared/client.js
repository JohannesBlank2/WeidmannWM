/* Gemeinsamer Client-Kern fuer alle drei Ansichten.
 * - Stabile clientId in localStorage (ueberlebt Reload & Standby -> Reconnect).
 * - Socket.IO-Verbindung mit Auto-Reconnect.
 * - Einheitliches State-Handling: window.App.onState(cb).
 */
(function () {
  const STORAGE_KEY = 'weidmann.clientId';

  function getClientId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  // role wird vom jeweiligen HTML gesetzt (window.APP_ROLE) bevor dies laedt.
  const role = window.APP_ROLE || 'play';
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
      try { cb(state); } catch (e) { console.error(e); }
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
    getState() { return lastState; },
    me,
  };
})();
