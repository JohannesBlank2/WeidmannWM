'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state.json');

// Phasen der Show-Statemaschine. Bewusst als Konstanten, damit Tippfehler auffallen.
const PHASES = ['lobby', 'kategorie-auswahl', 'spiel-aktiv', 'auswertung'];

// Buzzer-Status: locked = gesperrt, armed = freigegeben/scharf, resolved = aufgeloest.
const BUZZER = { LOCKED: 'locked', ARMED: 'armed', RESOLVED: 'resolved' };

const TEAM_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#4361ee'];

function defaultTeams() {
  return [1, 2, 3, 4].map((n) => ({
    id: `team${n}`,
    name: `Team ${n}`,
    score: 0,
    color: TEAM_COLORS[n - 1],
  }));
}

function defaultState() {
  return {
    phase: 'lobby',
    teams: defaultTeams(),
    // clients: { [clientId]: { teamId, role, connected, lastSeen } }
    // Persistiert, damit Reconnect (iPad aus Standby) Team & Rolle behaelt.
    clients: {},
    buzzer: {
      status: BUZZER.LOCKED,
      // presses: [{ teamId, clientId, ts, order }] -> Reihenfolge der Buzzes
      presses: [],
    },
    // Aktuell laufendes Spiel (aus der Registry); null = kein Spiel aktiv.
    activeGame: null,
    // Frei nutzbarer Zustand des aktiven Spiel-Moduls.
    gameState: {},
    // Reserviert fuer spaetere Mechaniken (Kategorie-Auswahl, Spielhistorie,
    // wer-hat-schon-gespielt, Einsaetze ...). Jetzt leer, aber nicht verbaut.
    meta: {
      round: 0,
      history: [],
    },
  };
}

class GameState {
  constructor() {
    this.state = defaultState();
    this._saveTimer = null;
    this._onChange = null;
  }

  /** Callback, der nach jeder Aenderung gefeuert wird (z.B. Broadcast). */
  setOnChange(fn) {
    this._onChange = fn;
  }

  get() {
    return this.state;
  }

  /**
   * Laedt persistierten State von der Platte (Crash-Schutz).
   * Merged auf den Default, damit neue Felder nach Updates nicht fehlen.
   */
  load() {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const saved = JSON.parse(raw);
      const base = defaultState();

      this.state = {
        ...base,
        ...saved,
        teams: Array.isArray(saved.teams) && saved.teams.length ? saved.teams : base.teams,
        buzzer: { ...base.buzzer, ...(saved.buzzer || {}) },
        meta: { ...base.meta, ...(saved.meta || {}) },
        clients: saved.clients || {},
      };

      // Beim Start sind noch keine Sockets verbunden -> alle als getrennt markieren.
      for (const id of Object.keys(this.state.clients)) {
        this.state.clients[id].connected = false;
      }
      console.log('[state] state.json geladen.');
    } catch (err) {
      console.error('[state] Konnte state.json nicht laden, nutze Default:', err.message);
      this.state = defaultState();
    }
  }

  /** Markiert State als geaendert: Broadcast + (debounced) Persistenz. */
  touch() {
    if (this._onChange) this._onChange(this.state);
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveNow();
    }, 400);
  }

  /** Schreibt sofort & atomar (tmp + rename), damit state.json nie halb ist. */
  saveNow() {
    try {
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmp, STATE_FILE);
    } catch (err) {
      console.error('[state] Speichern fehlgeschlagen:', err.message);
    }
  }

  // ---- Mutationen -----------------------------------------------------------

  setPhase(phase) {
    if (!PHASES.includes(phase)) return;
    this.state.phase = phase;
    this.touch();
  }

  renameTeam(teamId, name) {
    const team = this.state.teams.find((t) => t.id === teamId);
    if (!team || !name) return;
    team.name = String(name).slice(0, 40);
    this.touch();
  }

  addPoints(teamId, delta) {
    const team = this.state.teams.find((t) => t.id === teamId);
    if (!team) return;
    team.score += Number(delta) || 0;
    this.touch();
  }

  setPoints(teamId, value) {
    const team = this.state.teams.find((t) => t.id === teamId);
    if (!team) return;
    team.score = Number(value) || 0;
    this.touch();
  }

  // ---- Clients / Reconnect --------------------------------------------------

  upsertClient(clientId, patch) {
    const existing = this.state.clients[clientId] || {
      teamId: null,
      role: 'play',
      connected: false,
      lastSeen: 0,
    };
    this.state.clients[clientId] = { ...existing, ...patch, lastSeen: Date.now() };
    this.touch();
    return this.state.clients[clientId];
  }

  setClientConnected(clientId, connected) {
    const c = this.state.clients[clientId];
    if (!c) return;
    c.connected = connected;
    c.lastSeen = Date.now();
    this.touch();
  }

  joinTeam(clientId, teamId) {
    const c = this.state.clients[clientId];
    if (!c) return;
    if (!this.state.teams.some((t) => t.id === teamId)) return;
    c.teamId = teamId;
    this.touch();
  }

  // ---- Buzzer ---------------------------------------------------------------

  armBuzzer() {
    this.state.buzzer.status = BUZZER.ARMED;
    this.state.buzzer.presses = [];
    this.touch();
  }

  lockBuzzer() {
    this.state.buzzer.status = BUZZER.LOCKED;
    this.touch();
  }

  resetBuzzer() {
    this.state.buzzer.status = BUZZER.LOCKED;
    this.state.buzzer.presses = [];
    this.touch();
  }

  /**
   * Verarbeitet einen Buzz. Server-Timestamp = Wahrheit (fair, kein Client-Cheat).
   * Pro Team zaehlt nur der erste Buzz. Gibt das Press-Objekt zurueck oder null.
   */
  registerBuzz(clientId) {
    const buzzer = this.state.buzzer;
    if (buzzer.status !== BUZZER.ARMED) return null;

    const client = this.state.clients[clientId];
    if (!client || !client.teamId) return null;

    // Team schon dabei? Dann ignorieren (erster Buzz zaehlt).
    if (buzzer.presses.some((p) => p.teamId === client.teamId)) return null;

    const press = {
      teamId: client.teamId,
      clientId,
      ts: Date.now(),
      order: buzzer.presses.length + 1,
    };
    buzzer.presses.push(press);
    this.touch();
    return press;
  }

  // ---- Spiele ---------------------------------------------------------------

  setActiveGame(gameMeta) {
    this.state.activeGame = gameMeta;
    this.state.gameState = {};
    this.touch();
  }

  clearActiveGame() {
    this.state.activeGame = null;
    this.state.gameState = {};
    this.touch();
  }

  setGameState(partial) {
    this.state.gameState = { ...this.state.gameState, ...partial };
    this.touch();
  }

  resetAll() {
    const teams = this.state.teams.map((t) => ({ ...t, score: 0 }));
    this.state = defaultState();
    this.state.teams = teams.map((t) => ({ ...t, score: 0 }));
    this.touch();
  }
}

module.exports = { GameState, PHASES, BUZZER };
