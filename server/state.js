'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state.json');

// Phasen der Show-Statemaschine (Reihenfolge = grober Ablauf).
//   lobby            -> Teams treten bei
//   runden-uebersicht-> Runde X angekuendigt (Modus + auswaehlendes Team)
//   kategorie-auswahl-> auswaehlendes Team waehlt Kategorie
//   spiel-auswahl    -> ungespielte Spiele der Kategorie werden gezeigt, Team waehlt
//   spiel-details    -> gewaehltes Spiel wird mit Details gezeigt, Startbutton
//   spielerauswahl   -> NUR bei single: jedes Team waehlt seinen Spieler
//   spiel-aktiv      -> Spiel laeuft (Spielpunkte + Buzzer)
//   auswertung       -> Spielpunkte stehen, Admin vergibt Gesamtpunkte
//   bonus / finale   -> Sonderphasen (hier nur als Phase vorgesehen)
const PHASES = [
  'lobby',
  'runden-uebersicht',
  'kategorie-auswahl',
  'spiel-auswahl',
  'spiel-details',
  'spielerauswahl',
  'spiel-aktiv',
  'auswertung',
  'bonus',
  'finale',
];

// Buzzer-Status: locked = gesperrt, armed = freigegeben/scharf, resolved = aufgeloest.
const BUZZER = { LOCKED: 'locked', ARMED: 'armed', RESOLVED: 'resolved' };

const TEAM_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#4361ee'];

// Max. Anzahl Einzelspiele pro Spieler (4 Einzelrunden / 2 Spieler = je 2).
const MAX_EINZEL_PRO_SPIELER = 2;

// Runden-Plan: 8 Spiele. Modus wechselt (single/group, Start single),
// Pick-Reihenfolge ist eine "Snake" 1-2-3-4-4-3-2-1.
// picker = 1-basierte Teamposition (Team 1..4).
const ROUND_PLAN = [
  { mode: 'single', picker: 1 },
  { mode: 'group', picker: 2 },
  { mode: 'single', picker: 3 },
  { mode: 'group', picker: 4 },
  { mode: 'single', picker: 4 },
  { mode: 'group', picker: 3 },
  { mode: 'single', picker: 2 },
  { mode: 'group', picker: 1 },
];
const TOTAL_ROUNDS = ROUND_PLAN.length;

function defaultPlayers() {
  return [
    { name: 'Spieler 1', einzelCount: 0 },
    { name: 'Spieler 2', einzelCount: 0 },
  ];
}

function defaultTeams() {
  return [1, 2, 3, 4].map((n) => ({
    id: `team${n}`,
    name: `Team ${n}`,
    score: 0, // Gesamtpunktzahl (persistent)
    gameScore: 0, // Spielpunkte (nur fuer das aktuelle Spiel, getrennt)
    color: TEAM_COLORS[n - 1],
    players: defaultPlayers(), // 2 Spieler je Team (mit Einzelspiel-Zaehler)
  }));
}

function defaultRound() {
  return {
    number: 0, // 1..8, 0 = Show noch nicht gestartet
    index: -1, // 0-basierter Index in ROUND_PLAN
    total: TOTAL_ROUNDS,
    mode: null, // 'single' | 'group'
    modus: null, // Kompatibilitaet: 'einzeln' | 'gemeinsam'
    pickerTeamId: null, // welches Team gerade auswaehlt
    category: null, // 'sport' | 'skill' | 'quiz'
    kategorie: null, // Kompatibilitaet: 'sport' | 'quiz' | 'geschicklichkeit'
    availableCategories: [],
    availableKategorien: [], // Kategorien mit noch ungespielten Spielen (Modus)
    choices: [], // zur Auswahl stehende (ungespielte) Spiele
    gameId: null, // gewaehltes Spiel (vor/waehrend Spielerauswahl)
    selectedGame: null, // vollstaendige Details aus den Choices
    selectedPlayers: {}, // { teamId: playerIndex } bei Einzelspielen
  };
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
    // Runden-/Pick-Ablauf.
    round: defaultRound(),
    // Verbrauchte Spiele (id-Liste) -> tauchen in spaeteren Auswahlen nicht mehr auf.
    consumedGames: [],
    // Aktuell laufendes Spiel (aus der Registry); null = kein Spiel aktiv.
    activeGame: null,
    // Frei nutzbarer Zustand des aktiven Spiel-Moduls.
    gameState: {},
    // Reserviert fuer spaetere Mechaniken (Spielhistorie ...).
    meta: {
      history: [],
    },
  };
}

class GameState {
  constructor() {
    this.state = defaultState();
    this.registry = null; // wird per setRegistry injiziert (fuer Spielauswahl)
    this._saveTimer = null;
    this._onChange = null;
  }

  /** Registry injizieren, damit der Pick-Ablauf Spiele zusammenstellen kann. */
  setRegistry(registry) {
    this.registry = registry;
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

      const teams =
        Array.isArray(saved.teams) && saved.teams.length ? saved.teams : base.teams;

      this.state = {
        ...base,
        ...saved,
        // Teams normalisieren: neue Felder (gameScore, players) sicherstellen.
        teams: teams.map((t, i) => ({
          id: t.id || `team${i + 1}`,
          name: t.name || `Team ${i + 1}`,
          score: Number(t.score) || 0,
          gameScore: Number(t.gameScore) || 0,
          color: t.color || TEAM_COLORS[i % TEAM_COLORS.length],
          players: normalizePlayers(t.players),
        })),
        buzzer: { ...base.buzzer, ...(saved.buzzer || {}) },
        round: normalizeRound({ ...base.round, ...(saved.round || {}) }),
        consumedGames: Array.isArray(saved.consumedGames) ? saved.consumedGames : [],
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

  // ---- Phasen ---------------------------------------------------------------

  setPhase(phase) {
    if (!PHASES.includes(phase)) return;
    this.state.phase = phase;
    this.touch();
  }

  // ---- Teams, Spieler & Gesamtpunkte ----------------------------------------

  _team(teamId) {
    return this.state.teams.find((t) => t.id === teamId) || null;
  }

  renameTeam(teamId, name) {
    const team = this._team(teamId);
    if (!team || !name) return;
    team.name = String(name).slice(0, 40);
    this.touch();
  }

  renamePlayer(teamId, playerIndex, name) {
    const team = this._team(teamId);
    const i = Number(playerIndex);
    if (!team || !team.players[i] || !name) return;
    team.players[i].name = String(name).slice(0, 40);
    this.touch();
  }

  addPoints(teamId, delta) {
    const team = this._team(teamId);
    if (!team) return;
    team.score += Number(delta) || 0;
    this.touch();
  }

  setPoints(teamId, value) {
    const team = this._team(teamId);
    if (!team) return;
    team.score = Number(value) || 0;
    this.touch();
  }

  // ---- Spielpunkte (getrennt von der Gesamtpunktzahl) -----------------------

  addGamePoints(teamId, delta) {
    const team = this._team(teamId);
    if (!team) return;
    team.gameScore += Number(delta) || 0;
    this.touch();
  }

  setGamePoints(teamId, value) {
    const team = this._team(teamId);
    if (!team) return;
    team.gameScore = Number(value) || 0;
    this.touch();
  }

  resetGameScores() {
    this.state.teams.forEach((t) => {
      t.gameScore = 0;
    });
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

  teamOfClient(clientId) {
    const c = this.state.clients[clientId];
    return c ? c.teamId : null;
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

  // ---- Runden- & Pick-Ablauf ------------------------------------------------

  /** Setzt die Runden-Felder gemaess ROUND_PLAN fuer einen 0-basierten Index. */
  _applyRound(index) {
    const plan = ROUND_PLAN[index];
    if (!plan) return;
    const pickerTeam = this.state.teams[plan.picker - 1];
    const mode = plan.mode || germanToMode(plan.modus);
    this.state.round = {
      ...defaultRound(),
      number: index + 1,
      index,
      mode,
      modus: modeToGerman(mode),
      pickerTeamId: pickerTeam ? pickerTeam.id : null,
    };
  }

  /** Startet die Show: Runde 1, Phase "runden-uebersicht". */
  startShow() {
    this.state.consumedGames = [];
    this._applyRound(0);
    this.clearActiveGame();
    this.state.phase = 'runden-uebersicht';
    this.touch();
  }

  /** Zur Kategorie-Auswahl: verfuegbare Kategorien (Modus) ermitteln. */
  openKategorieAuswahl() {
    if (this.state.round.number < 1) this._applyRound(0);
    this.state.round.kategorie = null;
    this.state.round.category = null;
    this.state.round.choices = [];
    this.state.round.gameId = null;
    this.state.round.selectedGame = null;
    this.state.round.selectedPlayers = {};
    this.state.round.availableCategories = this.registry
      ? this.registry.availableKategorien(this.state.round.mode, this.state.consumedGames)
      : [];
    this.state.round.availableKategorien = this.state.round.availableCategories.map(categoryToGerman);
    this.state.phase = 'kategorie-auswahl';
    this.touch();
  }

  /**
   * Eine Kategorie wurde gewaehlt -> ungespielte Spiele zusammenstellen.
   * teamId = waehlendes Team (Validierung), force = Admin-Override.
   */
  chooseKategorie(teamId, kategorie, force = false) {
    if (this.state.phase !== 'kategorie-auswahl') return false;
    if (!force && teamId !== this.state.round.pickerTeamId) return false;
    if (!this.registry) return false;
    const category = normalizeCategory(kategorie);
    if (!this.state.round.availableCategories.includes(category)) return false;

    const choices = this.registry.buildChoices(
      this.state.round.mode,
      category,
      this.state.consumedGames
    );

    this.state.round.category = category;
    this.state.round.kategorie = categoryToGerman(category);
    this.state.round.choices = choices;
    this.state.round.gameId = null;
    this.state.round.selectedGame = null;
    this.state.phase = 'spiel-auswahl';
    this.touch();
    return true;
  }

  /**
   * Ein Spiel aus den Choices wurde gewaehlt. Es startet noch nicht sofort,
   * sondern wird zuerst in der Detailansicht bestaetigt.
   */
  chooseSpiel(teamId, gameId, force = false) {
    if (this.state.phase !== 'spiel-auswahl') return false;
    if (!force && teamId !== this.state.round.pickerTeamId) return false;
    const choice = this.state.round.choices.find((c) => c.gameId === gameId);
    if (!choice) return false;

    this.state.round.gameId = gameId;
    this.state.round.selectedGame = choice;
    this.state.phase = 'spiel-details';
    this.touch();
    return true;
  }

  /** Zurueck zur Kategorie-Auswahl, z.B. wenn die Vorschlaege nicht passen. */
  backToKategorieAuswahl(teamId, force = false) {
    if (!['spiel-auswahl', 'spiel-details'].includes(this.state.phase)) return false;
    if (!force && teamId !== this.state.round.pickerTeamId) return false;
    this.openKategorieAuswahl();
    return true;
  }

  /**
   * Startbutton nach der Detailansicht.
   *  - single -> zuerst Spielerwahl
   *  - group  -> Spiel startet direkt
   */
  startPickedGame(teamId, force = false) {
    if (this.state.phase !== 'spiel-details') return false;
    if (!force && teamId !== this.state.round.pickerTeamId) return false;
    const gameId = this.state.round.gameId;
    if (!gameId) return false;

    if (this.state.round.mode === 'single') {
      this.state.round.selectedPlayers = {};
      this.state.phase = 'spielerauswahl';
      this.touch();
      return false;
    }

    return this.startGame(gameId);
  }

  /** Ein Team waehlt seinen Spieler (nur Einzelspiele, Limit-geprueft). */
  selectPlayer(teamId, playerIndex) {
    if (this.state.phase !== 'spielerauswahl') return false;
    const team = this._team(teamId);
    const i = Number(playerIndex);
    if (!team || !team.players[i]) return false;
    if (team.players[i].einzelCount >= MAX_EINZEL_PRO_SPIELER) return false;
    this.state.round.selectedPlayers[teamId] = i;
    this.touch();
    return true;
  }

  /**
   * Startet das in der Spielerauswahl gewaehlte Einzelspiel.
   * Zaehlt die Einzelspiele der gewaehlten Spieler hoch. Gibt true bei Start.
   */
  startSelectedGame() {
    if (this.state.phase !== 'spielerauswahl') return false;
    const gameId = this.state.round.gameId;
    if (!gameId) return false;
    const selectedTeamCount = Object.keys(this.state.round.selectedPlayers).length;
    if (selectedTeamCount < this.state.teams.length) return false;

    // Einzelspiel-Zaehler der gewaehlten Spieler erhoehen.
    for (const [teamId, idx] of Object.entries(this.state.round.selectedPlayers)) {
      const team = this._team(teamId);
      if (team && team.players[idx]) team.players[idx].einzelCount += 1;
    }
    return this.startGame(gameId);
  }

  _consume(gameId) {
    if (gameId && !this.state.consumedGames.includes(gameId)) {
      this.state.consumedGames.push(gameId);
    }
  }

  // ---- Spiele ---------------------------------------------------------------

  /** Startet ein Spiel (Spielpunkte -> 0). Verbrauch wird vom Aufrufer gesetzt. */
  startGame(gameId) {
    if (!this.registry) return false;
    const meta = this.registry.meta(gameId);
    if (!meta) return false;
    this.state.activeGame = meta;
    this.state.gameState = {};
    this.state.teams.forEach((t) => {
      t.gameScore = 0;
    });
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.phase = 'spiel-aktiv';
    this.touch();
    return true;
  }

  /** Beendet das laufende Spiel -> Auswertung (Spielpunkte bleiben sichtbar). */
  endGame() {
    if (this.state.activeGame && this.state.activeGame.id) {
      this._consume(this.state.activeGame.id);
    }
    this.state.activeGame = null;
    this.state.gameState = {};
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.phase = 'auswertung';
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

  /** Naechste Runde. Nach Runde 8 geht es in die Bonus-Phase. */
  nextRound() {
    const next = this.state.round.index + 1;
    this.clearActiveGame();
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    if (next >= TOTAL_ROUNDS) {
      this.state.phase = 'bonus';
      this.touch();
      return;
    }
    this._applyRound(next);
    this.state.phase = 'runden-uebersicht';
    this.touch();
  }

  gotoBonus() {
    this.clearActiveGame();
    this.state.phase = 'bonus';
    this.touch();
  }

  gotoFinale() {
    this.clearActiveGame();
    this.state.phase = 'finale';
    this.touch();
  }

  resetAll() {
    // Teamnamen, Spielernamen & Farben behalten; alle Punkte/Zaehler/Ablauf -> 0.
    const teams = this.state.teams.map((t) => ({
      ...t,
      score: 0,
      gameScore: 0,
      players: (t.players || defaultPlayers()).map((p) => ({ name: p.name, einzelCount: 0 })),
    }));
    const clients = this.state.clients;
    this.state = defaultState();
    this.state.teams = teams;
    this.state.clients = clients;
    this.touch();
  }
}

/** Stellt sicher, dass ein Team genau 2 Spieler mit name + einzelCount hat. */
function normalizePlayers(players) {
  const base = defaultPlayers();
  if (!Array.isArray(players)) return base;
  return base.map((def, i) => ({
    name: (players[i] && players[i].name) || def.name,
    einzelCount: Number(players[i] && players[i].einzelCount) || 0,
  }));
}

function germanToMode(value) {
  if (value === 'einzeln') return 'single';
  if (value === 'gemeinsam') return 'group';
  if (value === 'single' || value === 'group') return value;
  return null;
}

function modeToGerman(value) {
  return value === 'group' ? 'gemeinsam' : 'einzeln';
}

function normalizeCategory(value) {
  if (value === 'geschicklichkeit') return 'skill';
  if (value === 'skill') return 'skill';
  if (value === 'sport') return 'sport';
  return 'quiz';
}

function categoryToGerman(value) {
  return value === 'skill' ? 'geschicklichkeit' : value;
}

function normalizeRound(round) {
  const mode = round.mode || germanToMode(round.modus);
  const category = round.category || (round.kategorie ? normalizeCategory(round.kategorie) : null);
  return {
    ...defaultRound(),
    ...round,
    mode,
    modus: mode ? modeToGerman(mode) : null,
    category,
    kategorie: category ? categoryToGerman(category) : null,
    availableCategories: Array.isArray(round.availableCategories)
      ? round.availableCategories.map(normalizeCategory)
      : Array.isArray(round.availableKategorien)
      ? round.availableKategorien.map(normalizeCategory)
      : [],
    availableKategorien: Array.isArray(round.availableKategorien)
      ? round.availableKategorien
      : Array.isArray(round.availableCategories)
      ? round.availableCategories.map(categoryToGerman)
      : [],
    selectedGame: round.selectedGame || null,
  };
}

module.exports = {
  GameState,
  PHASES,
  BUZZER,
  ROUND_PLAN,
  TOTAL_ROUNDS,
  MAX_EINZEL_PRO_SPIELER,
};
