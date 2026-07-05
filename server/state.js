'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, '..', 'state.json');
const STATE_SCHEMA_VERSION = 4;

// Phasen der Show-Statemaschine.
//   lobby              -> Spieler verbinden sich
//   runden-uebersicht  -> Runde X wird angekündigt
//   kategorie-auswahl  -> alter Fallback: aktueller Spieler wählt Sport/Skill/Quiz
//   spin-bereit        -> alter Fallback: drei geloste Spiele stehen bereit
//   spin-laeuft        -> alter Fallback: TV zeigt den Glücksrad-/Slot-Spin
//   spiel-intro        -> Admin hat eines der festen Show-Spiele vorgestellt
//   spiel-details      -> ausgelostes Spiel wird angezeigt
//   wetten             -> Spieler setzen geheim 0..50 Coins auf einen Mitspieler
//   spiel-aktiv        -> Spiel läuft
//   auswertung         -> Admin setzt Platzierungen und wendet Auszahlung an
//   finale             -> Show ist durch
const PHASES = [
  'lobby',
  'runden-uebersicht',
  'kategorie-auswahl',
  'spin-bereit',
  'spin-laeuft',
  'spiel-intro',
  'spiel-details',
  'wetten',
  'spiel-aktiv',
  'auswertung',
  'finale',
];

const BUZZER = { LOCKED: 'locked', ARMED: 'armed', RESOLVED: 'resolved' };

const PLAYER_PRESETS = [
  { name: 'Stephan', color: '#e63946', avatar: '/assets/avatars/Stephan.png' },
  { name: 'Sophie', color: '#2a9d8f', avatar: '/assets/avatars/Sophie.png' },
  { name: 'Danny', color: '#ffd166', avatar: '/assets/avatars/Danny.png' },
  { name: 'Flo', color: '#4361ee', avatar: '/assets/avatars/Flo.png' },
  { name: 'Maleen', color: '#9b5de5', avatar: '/assets/avatars/Maleen.png' },
];
const PLAYER_COUNT = 5;
const TOTAL_ROUNDS = 5;
const SPIN_DURATION_MS = 4600;
const STARTING_COINS = 50;
const MAX_BET = 50;
const CRASH_MIN_POINT = 120;
const CRASH_MAX_POINT = 1000;
const CRASH_TICK_MS = 75;
const CRASH_DEFAULT_SETTINGS = {
  minCrashPoint: CRASH_MIN_POINT / 100,
  maxCrashPoint: CRASH_MAX_POINT / 100,
  growthSpeed: 1,
};
const AMBIENT_TRACK_IDS = ['hide', 'pick-your-poison', 'blind-spot', 'poker-ambiente'];
const DEFAULT_AMBIENT_MUSIC = {
  enabled: false,
  trackId: AMBIENT_TRACK_IDS[0],
  volume: 32,
  updatedAt: null,
};
const FEATURED_GAMES = [
  { slot: 1, gameId: 'schneid-in-die-haelfte', title: 'Halbe Sachen', animation: 'slot', durationMs: 6200 },
  { slot: 2, gameId: 'musik-erraten', title: 'Shazam', animation: 'wheel', durationMs: 5200 },
  { slot: 3, gameId: 'wo-liegt-was', title: 'Wo liegt was?', animation: 'roulette', durationMs: 4600 },
  { slot: 4, gameId: 'dart-ringe', title: 'Dartringe', animation: 'cards', durationMs: 4300 },
  { slot: 5, gameId: 'einkauf-schaetzen', title: 'How much is the fish', animation: 'scratch', durationMs: 5600 },
];
const RANK_AWARDS = {
  1: 50,
  2: 40,
  3: 30,
  4: 20,
  5: 10,
};

function defaultPlayers() {
  return Array.from({ length: PLAYER_COUNT }, (_, i) => ({
    id: `player${i + 1}`,
    name: PLAYER_PRESETS[i].name,
    score: STARTING_COINS,
    gameScore: 0,
    color: PLAYER_PRESETS[i].color,
    avatar: PLAYER_PRESETS[i].avatar,
  }));
}

function defaultSpin() {
  return {
    status: 'idle',
    startedAt: null,
    durationMs: SPIN_DURATION_MS,
    winnerGameId: null,
    winnerIndex: null,
    sequence: [],
  };
}

function defaultRound() {
  return {
    number: 0,
    index: -1,
    total: TOTAL_ROUNDS,
    pickerPlayerId: null,
    category: null,
    kategorie: null,
    availableCategories: [],
    availableKategorien: [],
    choices: [],
    gameId: null,
    selectedGame: null,
    spin: defaultSpin(),
    intro: null,
    // bets: { [playerId]: { playerId, targetPlayerId, amount, submittedAt } }
    bets: {},
    betsRevealed: false,
    // placements: { [playerId]: 1..5 }
    placements: {},
    payoutApplied: false,
    payoutSummary: [],
  };
}

function defaultCrashGame(players = []) {
  return {
    phase: 'idle',
    multiplier: 1,
    crashPoint: null,
    startedAt: null,
    crashedAt: null,
    payoutApplied: false,
    settings: { ...CRASH_DEFAULT_SETTINGS },
    players: buildCrashPlayers(players),
  };
}

function defaultState() {
  const players = defaultPlayers();
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    phase: 'lobby',
    players,
    // clients: { [clientId]: { playerId, role, connected, lastSeen } }
    clients: {},
    buzzer: {
      status: BUZZER.LOCKED,
      // presses: [{ playerId, clientId, ts, order }]
      presses: [],
    },
    round: defaultRound(),
    consumedGames: [],
    activeGame: null,
    gameState: {},
    currentMiniGame: null,
    crashGame: defaultCrashGame(players),
    ambientMusic: { ...DEFAULT_AMBIENT_MUSIC },
    meta: {
      history: [],
      featuredGameTitles: {},
    },
  };
}

class GameState {
  constructor() {
    this.state = defaultState();
    this.registry = null;
    this._saveTimer = null;
    this._spinTimer = null;
    this._crashTimer = null;
    this._onChange = null;
  }

  setRegistry(registry) {
    this.registry = registry;
    const repairedChoices = this._repairRouletteChoices();
    const repairedTitles = this._applyFeaturedTitleOverridesToState();
    if (repairedChoices || repairedTitles) {
      this.saveNow();
    }
  }

  setOnChange(fn) {
    this._onChange = fn;
  }

  get() {
    return this.state;
  }

  load() {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const saved = JSON.parse(raw);
      const base = defaultState();

      if (saved.schemaVersion !== STATE_SCHEMA_VERSION || !Array.isArray(saved.players)) {
        this.state = base;
        this.state.clients = normalizeClients(saved.clients, this.state.players);
        console.log('[state] Alter Team-State erkannt, starte mit neuem Einzelspieler-State.');
        return;
      }

      const players = normalizePlayers(saved.players);

      this.state = {
        ...base,
        ...saved,
        schemaVersion: STATE_SCHEMA_VERSION,
        players,
        clients: normalizeClients(saved.clients, players),
        buzzer: normalizeBuzzer(saved.buzzer),
        round: normalizeRound(saved.round),
        consumedGames: Array.isArray(saved.consumedGames) ? saved.consumedGames : [],
        currentMiniGame: saved.currentMiniGame === 'crash' ? 'crash' : null,
        crashGame: normalizeCrashGame(saved.crashGame, players),
        ambientMusic: normalizeAmbientMusic(saved.ambientMusic),
        meta: normalizeMeta(saved.meta, base.meta),
      };

      for (const id of Object.keys(this.state.clients)) {
        this.state.clients[id].connected = false;
      }

      if (this.state.phase === 'spin-laeuft') {
        this._restoreSpinAfterLoad();
      } else if (this.state.phase === 'spiel-intro') {
        this._restoreIntroAfterLoad();
      }

      if (this.state.crashGame.phase === 'running') {
        this.state.currentMiniGame = 'crash';
        this._scheduleCrashTick(0);
      }

      console.log('[state] state.json geladen.');
    } catch (err) {
      console.error('[state] Konnte state.json nicht laden, nutze Default:', err.message);
      this.state = defaultState();
    }
  }

  _restoreSpinAfterLoad() {
    const spin = this.state.round.spin || defaultSpin();
    if (!spin.winnerGameId) {
      this.state.phase = 'spin-bereit';
      this.state.round.spin = defaultSpin();
      return;
    }

    const elapsed = Date.now() - Number(spin.startedAt || 0);
    const remaining = Math.max(0, Number(spin.durationMs || SPIN_DURATION_MS) - elapsed);
    this._scheduleSpinFinish(remaining);
  }

  _restoreIntroAfterLoad() {
    const intro = this.state.round.intro || null;
    if (!intro || !this.state.round.gameId) {
      this.state.phase = 'lobby';
      this.state.round.intro = null;
      return;
    }
    // Der Intro-Ablauf ist rein admin-gesteuert (kein Auto-Timer mehr) -
    // nach einem Neustart bleibt die Animation einfach in ihrem Status stehen,
    // bis der Admin per finishFeaturedIntro() weiterschaltet.
  }

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

  saveNow() {
    try {
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmp, STATE_FILE);
    } catch (err) {
      console.error('[state] Speichern fehlgeschlagen:', err.message);
    }
  }

  setPhase(phase) {
    if (!PHASES.includes(phase)) return;
    this.state.phase = phase;
    this.touch();
  }

  showLobby() {
    this._clearSpinTimer();
    this.clearActiveGame(false);
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.phase = 'lobby';
    this.touch();
  }

  featuredGames() {
    return FEATURED_GAMES.map((entry) => {
      const meta = this.registry && this.registry.meta(entry.gameId);
      return {
        slot: entry.slot,
        gameId: entry.gameId,
        title: this._featuredTitle(entry, meta),
        defaultTitle: meta ? meta.title : entry.title,
        animation: entry.animation,
      };
    });
  }

  _featuredTitle(entry, meta) {
    return entry.title || (meta ? meta.title : '');
  }

  _withFeaturedTitle(meta, entry) {
    if (!meta || !entry) return meta;
    const title = this._featuredTitle(entry, meta);
    return { ...meta, name: title, title };
  }

  setFeaturedGameTitle() {
    return false;
  }

  _applyFeaturedTitleOverridesToState() {
    let changed = false;

    for (const featured of FEATURED_GAMES) {
      const nextTitle = this._featuredTitle(featured, this.registry && this.registry.meta(featured.gameId));
      const applyTitle = (game) => {
        if (!game || game.id !== featured.gameId) return game;
        if (game.title === nextTitle && game.name === nextTitle) return game;
        changed = true;
        return { ...game, name: nextTitle, title: nextTitle };
      };

      this.state.round.selectedGame = applyTitle(this.state.round.selectedGame);
      this.state.activeGame = applyTitle(this.state.activeGame);
      this.state.round.choices = (this.state.round.choices || []).map((choice) => {
        const id = choice.gameId || choice.id;
        if (id !== featured.gameId || (choice.title === nextTitle && choice.name === nextTitle)) return choice;
        changed = true;
        return { ...choice, name: nextTitle, title: nextTitle };
      });
    }

    return changed;
  }

  _gamePoolChoices() {
    if (!this.registry) return [];
    return shuffle(
      this.registry
        .pool()
        .filter(Boolean)
        .map((meta) => ({
          ...this._withFeaturedTitle(meta, FEATURED_GAMES.find((entry) => entry.gameId === meta.id)),
          gameId: meta.id,
          selectable: true,
          hasBeenPlayed: this.state.consumedGames.includes(meta.id),
        }))
    );
  }

  _repairRouletteChoices() {
    const intro = this.state.round && this.state.round.intro;
    if (!intro) return false;
    const choices = this._gamePoolChoices();
    if (!choices.length) return false;
    const currentIds = new Set((this.state.round.choices || []).map((choice) => choice.gameId || choice.id));
    const nextIds = new Set(choices.map((choice) => choice.gameId || choice.id));
    const needsRepair =
      choices.length !== (this.state.round.choices || []).length ||
      choices.some((choice) => !currentIds.has(choice.gameId || choice.id)) ||
      (this.state.round.choices || []).some((choice) => !nextIds.has(choice.gameId || choice.id));
    if (!needsRepair) return false;
    this.state.round.choices = choices;
    return true;
  }

  // ---- Spieler & Punkte ----------------------------------------------------

  _player(playerId) {
    return this.state.players.find((p) => p.id === playerId) || null;
  }

  renamePlayer(playerId, name) {
    const player = this._player(playerId);
    if (!player || !name) return;
    player.name = String(name).slice(0, 40);
    this.touch();
  }

  addPoints(playerId, delta) {
    const player = this._player(playerId);
    if (!player) return;
    player.score += Number(delta) || 0;
    this.touch();
  }

  setPoints(playerId, value) {
    const player = this._player(playerId);
    if (!player) return;
    player.score = Number(value) || 0;
    this.touch();
  }

  addGamePoints(playerId, delta) {
    const player = this._player(playerId);
    if (!player) return;
    player.gameScore += Number(delta) || 0;
    this.touch();
  }

  setGamePoints(playerId, value) {
    const player = this._player(playerId);
    if (!player) return;
    player.gameScore = Number(value) || 0;
    this.touch();
  }

  resetGameScores() {
    this.state.players.forEach((p) => {
      p.gameScore = 0;
    });
    this.touch();
  }

  setBet(playerId, targetPlayerId, amount) {
    if (this.state.phase !== 'wetten') return false;
    const player = this._player(playerId);
    if (!player) return false;

    const parsedAmount = clampInt(amount, 0, Math.min(MAX_BET, Math.max(0, player.score)));
    const target = targetPlayerId ? this._player(targetPlayerId) : null;
    if (parsedAmount > 0 && (!target || target.id === player.id)) return false;

    this.state.round.bets[player.id] = {
      playerId: player.id,
      targetPlayerId: parsedAmount > 0 ? target.id : null,
      amount: parsedAmount,
      submittedAt: Date.now(),
    };
    this.touch();
    return true;
  }

  setBetsRevealed(revealed) {
    if (!['wetten', 'auswertung', 'finale'].includes(this.state.phase)) return false;
    this.state.round.betsRevealed = revealed === true;
    this.touch();
    return true;
  }

  setPlacement(playerId, place) {
    if (this.state.phase !== 'auswertung') return false;
    const player = this._player(playerId);
    const parsedPlace = Number(place);
    if (!player || !Number.isInteger(parsedPlace) || parsedPlace < 1 || parsedPlace > PLAYER_COUNT) {
      return false;
    }

    for (const id of Object.keys(this.state.round.placements)) {
      if (this.state.round.placements[id] === parsedPlace) {
        delete this.state.round.placements[id];
        const replaced = this._player(id);
        if (replaced) replaced.gameScore = 0;
      }
    }

    this.state.round.placements[player.id] = parsedPlace;
    player.gameScore = RANK_AWARDS[parsedPlace] || 0;
    this.touch();
    return true;
  }

  clearPlacement(playerId) {
    if (this.state.phase !== 'auswertung') return false;
    const player = this._player(playerId);
    if (!player) return false;
    delete this.state.round.placements[player.id];
    player.gameScore = 0;
    this.touch();
    return true;
  }

  setPlacementOrder(playerIds = []) {
    if (this.state.phase !== 'auswertung') return false;
    if (this.state.round.payoutApplied) return false;

    const uniqueIds = [];
    for (const playerId of Array.isArray(playerIds) ? playerIds : []) {
      const player = this._player(playerId);
      if (!player || uniqueIds.includes(player.id)) continue;
      uniqueIds.push(player.id);
      if (uniqueIds.length >= this.state.players.length - 1) break;
    }

    const placements = {};
    uniqueIds.forEach((playerId, index) => {
      placements[playerId] = index + 2;
    });

    if (uniqueIds.length === this.state.players.length - 1) {
      const winner = this.state.players.find((player) => !uniqueIds.includes(player.id));
      if (winner) placements[winner.id] = 1;
    }

    this.state.round.placements = placements;
    this.state.players.forEach((player) => {
      player.gameScore = RANK_AWARDS[placements[player.id]] || 0;
    });
    this.touch();
    return true;
  }

  applyPayouts() {
    if (this.state.phase !== 'auswertung') return false;
    if (this.state.round.payoutApplied) return false;
    if (!this._placementsComplete()) return false;

    const winnerId = Object.entries(this.state.round.placements)
      .find(([, place]) => place === 1)?.[0];
    if (!winnerId) return false;

    const byId = Object.fromEntries(this.state.players.map((p) => [p.id, p]));
    const summary = this.state.players.map((player) => {
      const place = this.state.round.placements[player.id];
      const award = RANK_AWARDS[place] || 0;
      const bet = this.state.round.bets[player.id] || {
        playerId: player.id,
        targetPlayerId: null,
        amount: 0,
      };
      const betWon = bet.amount > 0 && bet.targetPlayerId === winnerId;
      const betDelta = bet.amount > 0 ? (betWon ? bet.amount : -bet.amount) : 0;
      const totalDelta = award + betDelta;

      player.score += totalDelta;

      return {
        playerId: player.id,
        playerName: player.name,
        place,
        award,
        betTargetPlayerId: bet.targetPlayerId,
        betTargetName: bet.targetPlayerId && byId[bet.targetPlayerId]
          ? byId[bet.targetPlayerId].name
          : null,
        betAmount: bet.amount || 0,
        betWon,
        betDelta,
        totalDelta,
        finalScore: player.score,
      };
    });

    this.state.round.payoutApplied = true;
    this.state.round.payoutSummary = summary;
    this.touch();
    return true;
  }

  _placementsComplete() {
    const places = Object.values(this.state.round.placements);
    if (places.length !== this.state.players.length) return false;
    return [1, 2, 3, 4, 5].every((place) => places.includes(place));
  }

  // ---- Clients / Reconnect -------------------------------------------------

  upsertClient(clientId, patch) {
    const existing = this.state.clients[clientId] || {
      playerId: null,
      role: 'play',
      connected: false,
      lastSeen: 0,
    };
    this.state.clients[clientId] = normalizeClient(
      { ...existing, ...patch, lastSeen: Date.now() },
      this.state.players
    );
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

  joinPlayer(clientId, playerId) {
    const c = this.state.clients[clientId];
    if (!c) return;
    if (!this.state.players.some((p) => p.id === playerId)) return;
    c.playerId = playerId;
    this.touch();
  }

  playerOfClient(clientId) {
    const c = this.state.clients[clientId];
    return c ? c.playerId : null;
  }

  // ---- Buzzer --------------------------------------------------------------

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

  setAmbientMusic(patch = {}) {
    this.state.ambientMusic = normalizeAmbientMusic({
      ...(this.state.ambientMusic || DEFAULT_AMBIENT_MUSIC),
      ...(patch || {}),
      updatedAt: Date.now(),
    });
    this.touch();
    return true;
  }

  registerBuzz(clientId) {
    const buzzer = this.state.buzzer;
    if (buzzer.status !== BUZZER.ARMED) return null;

    const client = this.state.clients[clientId];
    if (!client || !client.playerId) return null;

    if (buzzer.presses.some((p) => p.playerId === client.playerId)) return null;

    const press = {
      playerId: client.playerId,
      clientId,
      ts: Date.now(),
      order: buzzer.presses.length + 1,
    };
    buzzer.presses.push(press);
    this.touch();
    return press;
  }

  // ---- Runden- & Spin-Ablauf ----------------------------------------------

  _applyRound(index) {
    const picker = this.state.players[index % this.state.players.length];
    this._clearSpinTimer();
    this.state.round = {
      ...defaultRound(),
      number: index + 1,
      index,
      pickerPlayerId: picker ? picker.id : null,
    };
  }

  startShow() {
    this.state.consumedGames = [];
    this.state.players.forEach((p) => {
      p.score = STARTING_COINS;
      p.gameScore = 0;
    });
    this._applyRound(0);
    this.clearActiveGame(false);
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.phase = 'runden-uebersicht';
    this.touch();
  }

  openKategorieAuswahl() {
    if (this.state.round.number < 1) this._applyRound(0);
    this._clearSpinTimer();
    this.state.round.category = null;
    this.state.round.kategorie = null;
    this.state.round.choices = [];
    this.state.round.gameId = null;
    this.state.round.selectedGame = null;
    this.state.round.spin = defaultSpin();
    this.state.round.bets = {};
    this.state.round.betsRevealed = false;
    this.state.round.placements = {};
    this.state.round.payoutApplied = false;
    this.state.round.payoutSummary = [];
    this.state.round.availableCategories = this.registry
      ? this.registry.availableCategories(this.state.consumedGames)
      : [];
    this.state.round.availableKategorien =
      this.state.round.availableCategories.map(categoryToGerman);
    this.state.phase = 'kategorie-auswahl';
    this.touch();
  }

  chooseKategorie(playerId, kategorie, force = false) {
    if (this.state.phase !== 'kategorie-auswahl') return false;
    if (!force && playerId !== this.state.round.pickerPlayerId) return false;
    if (!this.registry) return false;

    const category = normalizeCategory(kategorie);
    if (!this.state.round.availableCategories.includes(category)) return false;

    const choices = this.registry.buildSpinChoices(category, this.state.consumedGames);
    if (!choices.length) return false;

    this.state.round.category = category;
    this.state.round.kategorie = categoryToGerman(category);
    this.state.round.choices = choices;
    this.state.round.gameId = null;
    this.state.round.selectedGame = null;
    this.state.round.spin = defaultSpin();
    this.state.round.bets = {};
    this.state.round.betsRevealed = false;
    this.state.round.placements = {};
    this.state.round.payoutApplied = false;
    this.state.round.payoutSummary = [];
    this.state.phase = 'spin-bereit';
    this.touch();
    return true;
  }

  startSpin(playerId, force = false) {
    if (this.state.phase !== 'spin-bereit') return false;
    if (!force && playerId !== this.state.round.pickerPlayerId) return false;

    const choices = this.state.round.choices || [];
    const selectableChoices = choices.filter((choice) => choice.selectable === true);
    if (!selectableChoices.length) return false;

    const winner = selectableChoices[Math.floor(Math.random() * selectableChoices.length)];
    const winnerIndex = choices.findIndex((choice) => choice.gameId === winner.gameId);

    this.state.round.spin = {
      status: 'spinning',
      startedAt: Date.now(),
      durationMs: SPIN_DURATION_MS,
      winnerGameId: winner.gameId,
      winnerIndex,
      sequence: buildSpinSequence(choices, winnerIndex),
    };
    this.state.phase = 'spin-laeuft';
    this.touch();
    this._scheduleSpinFinish(SPIN_DURATION_MS);
    return true;
  }

  /**
   * Schritt 1: Show-Spiel für einen Slot vormerken. Die TV-Ansicht zeigt nur
   * einen neutralen "Bereit"-Screen, das eigentliche Spiel bleibt verdeckt, bis
   * der Admin die Animation explizit startet (startFeaturedIntro).
   */
  prepareFeaturedGame(slot) {
    if (!this.registry) return false;
    const featured = FEATURED_GAMES.find((entry) => entry.slot === Number(slot));
    if (!featured) return false;
    const game = this._withFeaturedTitle(this.registry.meta(featured.gameId), featured);
    if (!game) return false;

    // Alle Animationen (nicht nur Roulette) ziehen ihre Deko-Kandidaten aus dem
    // vollen Spiele-Pool, damit die Auslosung optisch zufällig aussieht, auch
    // wenn das tatsächliche Show-Spiel fest vorgegeben ist.
    const choices = this._gamePoolChoices();

    this._clearSpinTimer();
    this.clearActiveGame(false);
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.players.forEach((p) => {
      p.gameScore = 0;
    });
    this.state.round = {
      ...defaultRound(),
      number: featured.slot,
      index: featured.slot - 1,
      pickerPlayerId: null,
      category: game.category,
      kategorie: categoryToGerman(game.category),
      choices,
      gameId: game.id,
      selectedGame: game,
      intro: {
        status: 'ready',
        animation: featured.animation,
        startedAt: null,
        durationMs: featured.durationMs,
        targetGameId: game.id,
      },
    };
    this.state.phase = 'spiel-intro';
    this.touch();
    return true;
  }

  /**
   * Schritt 2: Die vorbereitete Animation tatsächlich abspielen. Es gibt
   * bewusst keinen Auto-Timer mehr auf einen Folgephase-Wechsel - der Admin
   * entscheidet per finishFeaturedIntro() (Schritt 3), wann es weitergeht.
   */
  startFeaturedIntro() {
    if (this.state.phase !== 'spiel-intro') return false;
    const intro = this.state.round.intro;
    if (!intro || intro.status !== 'ready') return false;
    this.state.round.intro = {
      ...intro,
      status: 'running',
      startedAt: Date.now(),
    };
    this.touch();
    return true;
  }

  finishSpin() {
    if (this.state.phase !== 'spin-laeuft') return false;
    const spin = this.state.round.spin || defaultSpin();
    const choice = this.state.round.choices.find((c) => c.gameId === spin.winnerGameId);
    if (!choice) return false;

    this._clearSpinTimer();
    this.state.round.gameId = choice.gameId;
    this.state.round.selectedGame = choice;
    this.state.round.spin = {
      ...spin,
      status: 'done',
    };
    this.state.round.bets = {};
    this.state.round.betsRevealed = false;
    this.state.round.placements = {};
    this.state.round.payoutApplied = false;
    this.state.round.payoutSummary = [];
    this.state.phase = 'wetten';
    this.touch();
    return true;
  }

  finishFeaturedIntro() {
    if (this.state.phase !== 'spiel-intro') return false;
    if (!this.state.round.gameId || !this.state.round.selectedGame) return false;
    this._clearSpinTimer();
    this.state.round.intro = {
      ...(this.state.round.intro || {}),
      status: 'done',
    };
    this.state.phase = 'wetten';
    this.touch();
    return true;
  }

  backToKategorieAuswahl(playerId, force = false) {
    if (!['spin-bereit', 'spiel-details', 'wetten'].includes(this.state.phase)) return false;
    if (!force && playerId !== this.state.round.pickerPlayerId) return false;
    this.openKategorieAuswahl();
    return true;
  }

  startPickedGame(playerId, force = false) {
    if (!['spiel-details', 'wetten'].includes(this.state.phase)) return false;
    if (!force && playerId !== this.state.round.pickerPlayerId) return false;
    const gameId = this.state.round.gameId;
    if (!gameId) return false;
    return this.startGame(gameId);
  }

  _consume(gameId) {
    if (gameId && !this.state.consumedGames.includes(gameId)) {
      this.state.consumedGames.push(gameId);
    }
  }

  startGame(gameId) {
    if (!this.registry) return false;
    const meta = this.registry.meta(gameId);
    if (!meta) return false;
    this._clearSpinTimer();
    this.state.activeGame = meta;
    this.state.gameState = {};
    this.state.players.forEach((p) => {
      p.gameScore = 0;
    });
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.phase = 'spiel-aktiv';
    this.touch();
    return true;
  }

  endGame() {
    if (this.state.activeGame && this.state.activeGame.id) {
      this._consume(this.state.activeGame.id);
    }
    this.state.activeGame = null;
    this.state.gameState = {};
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    this.state.players.forEach((p) => {
      p.gameScore = 0;
    });
    this.state.round.placements = {};
    this.state.round.payoutApplied = false;
    this.state.round.payoutSummary = [];
    this.state.phase = 'auswertung';
    this.touch();
  }

  clearActiveGame(shouldTouch = true) {
    this.state.activeGame = null;
    this.state.gameState = {};
    if (shouldTouch) this.touch();
  }

  setGameState(partial) {
    this.state.gameState = { ...this.state.gameState, ...partial };
    this.touch();
  }

  // ---- Mini-Casino: Crash --------------------------------------------------

  prepareCrashGame(stakes = {}) {
    if (this.state.crashGame && this.state.crashGame.phase === 'running') return false;
    this._clearCrashTimer();
    const settings = normalizeCrashSettings(this.state.crashGame && this.state.crashGame.settings);
    this.state.currentMiniGame = 'crash';
    this.state.crashGame = {
      ...defaultCrashGame(this.state.players),
      phase: 'ready',
      settings,
      players: buildCrashPlayers(this.state.players, stakes),
    };
    this.touch();
    return true;
  }

  setCrashSettings(settings = {}) {
    if (!this.state.crashGame || this.state.crashGame.phase === 'idle') {
      this.prepareCrashGame();
    }

    const crash = this.state.crashGame;
    if (!crash || crash.phase !== 'ready') return false;

    crash.settings = normalizeCrashSettings({
      ...(crash.settings || {}),
      ...(settings || {}),
    });
    this.touch();
    return true;
  }

  setCrashStake(playerId, stake) {
    const player = this._player(playerId);
    if (!player) return false;

    if (!this.state.crashGame || this.state.crashGame.phase === 'idle') {
      this.prepareCrashGame();
    }

    const crash = this.state.crashGame;
    if (!crash || crash.phase !== 'ready') return false;

    crash.players = crash.players || buildCrashPlayers(this.state.players);
    const entry = crash.players[player.id] || crashPlayer(player, 0);
    crash.players[player.id] = {
      ...entry,
      playerId: player.id,
      name: player.name,
      stake: clampCrashStake(stake, player.score),
      cashedOut: false,
      cashoutMultiplier: null,
      payout: 0,
      netDelta: 0,
      finalScore: player.score,
      lost: false,
    };
    this.touch();
    return true;
  }

  startCrashGame() {
    const crash = this.state.crashGame;
    if (!crash || crash.phase !== 'ready') return false;

    crash.players = normalizeCrashPlayers(crash.players, this.state.players);
    const activePlayers = Object.values(crash.players).filter((entry) => entry.stake > 0);
    if (!activePlayers.length) return false;

    this._clearCrashTimer();
    this.state.currentMiniGame = 'crash';
    this.state.crashGame = {
      ...crash,
      phase: 'running',
      multiplier: 1,
      settings: normalizeCrashSettings(crash.settings),
      crashPoint: randomCrashPoint(crash.settings),
      startedAt: Date.now(),
      crashedAt: null,
      payoutApplied: false,
      players: Object.fromEntries(
        Object.entries(crash.players).map(([playerId, entry]) => [
          playerId,
          {
            ...entry,
            cashedOut: false,
            cashoutMultiplier: null,
            payout: 0,
            netDelta: 0,
            finalScore: this._player(playerId)?.score ?? 0,
            lost: false,
          },
        ])
      ),
    };
    this.touch();
    this._scheduleCrashTick(this._crashTickMs(this.state.crashGame));
    return true;
  }

  cashOutCrash(playerId) {
    const crash = this.state.crashGame;
    if (!crash || crash.phase !== 'running') return false;
    const player = this._player(playerId);
    const entry = player && crash.players && crash.players[player.id];
    if (!player || !entry || entry.stake <= 0 || entry.cashedOut) return false;

    const liveMultiplier = this._liveCrashMultiplier(crash);
    if (liveMultiplier >= Number(crash.crashPoint)) {
      crash.multiplier = round2(Number(crash.crashPoint));
      this._finishCrashRound();
      return false;
    }

    const cashoutMultiplier = round2(liveMultiplier);
    entry.cashedOut = true;
    entry.cashoutMultiplier = cashoutMultiplier;
    entry.payout = roundToNearestFive(entry.stake * cashoutMultiplier);
    entry.netDelta = 0;
    entry.finalScore = player.score;
    entry.lost = false;
    crash.multiplier = cashoutMultiplier;
    this.touch();
    return true;
  }

  resetCrashGame() {
    this._clearCrashTimer();
    const settings = normalizeCrashSettings(this.state.crashGame && this.state.crashGame.settings);
    this.state.currentMiniGame = null;
    this.state.crashGame = {
      ...defaultCrashGame(this.state.players),
      settings,
    };
    this.touch();
    return true;
  }

  _scheduleCrashTick(delayMs = CRASH_TICK_MS) {
    this._clearCrashTimer();
    this._crashTimer = setTimeout(() => {
      this._crashTimer = null;
      this._tickCrashGame();
    }, Math.max(0, delayMs));
  }

  _tickCrashGame() {
    const crash = this.state.crashGame;
    if (!crash || crash.phase !== 'running') return;

    const nextMultiplier = this._liveCrashMultiplier(crash);
    if (nextMultiplier >= Number(crash.crashPoint)) {
      crash.multiplier = round2(Number(crash.crashPoint));
      this._finishCrashRound();
      return;
    }

    crash.multiplier = nextMultiplier;
    this.touch();
    this._scheduleCrashTick(this._crashTickMs(crash));
  }

  _liveCrashMultiplier(crash) {
    const startedAt = Number(crash && crash.startedAt) || Date.now();
    const settings = normalizeCrashSettings(crash && crash.settings);
    const elapsedSeconds = Math.max(0, ((Date.now() - startedAt) / 1000) * settings.growthSpeed);
    return round2(1 + 0.025 * elapsedSeconds + 0.006 * elapsedSeconds ** 2 + 0.0016 * elapsedSeconds ** 3);
  }

  _crashTickMs(crash) {
    const settings = normalizeCrashSettings(crash && crash.settings);
    return clampInt(CRASH_TICK_MS / Math.sqrt(settings.growthSpeed), 25, 180);
  }

  _finishCrashRound() {
    const crash = this.state.crashGame;
    if (!crash || crash.phase !== 'running') return;

    this._clearCrashTimer();
    crash.phase = 'crashed';
    crash.multiplier = round2(Number(crash.crashPoint) || crash.multiplier || 1);
    crash.crashedAt = Date.now();

    if (!crash.payoutApplied) {
      for (const entry of Object.values(crash.players || {})) {
        const player = this._player(entry.playerId);
        if (!player || entry.stake <= 0) continue;

        if (entry.cashedOut) {
          entry.payout = roundToNearestFive(entry.stake * Number(entry.cashoutMultiplier || 1));
          entry.lost = false;
        } else {
          entry.payout = 0;
          entry.lost = true;
        }

        entry.netDelta = entry.payout - entry.stake;
        player.score += entry.netDelta;
        entry.finalScore = player.score;
      }
      crash.payoutApplied = true;
    }

    this.state.currentMiniGame = 'crash';
    this.touch();
  }

  _clearCrashTimer() {
    if (this._crashTimer) {
      clearTimeout(this._crashTimer);
      this._crashTimer = null;
    }
  }

  nextRound() {
    const next = this.state.round.index + 1;
    this.clearActiveGame(false);
    this.state.buzzer = { status: BUZZER.LOCKED, presses: [] };
    if (next >= TOTAL_ROUNDS) {
      this._clearSpinTimer();
      this.state.phase = 'finale';
      this.touch();
      return;
    }
    this._applyRound(next);
    this.state.phase = 'runden-uebersicht';
    this.touch();
  }

  gotoFinale() {
    this._clearSpinTimer();
    this.clearActiveGame(false);
    this.state.phase = 'finale';
    this.touch();
  }

  resetAll() {
    const players = this.state.players.map((p) => ({
      ...p,
      score: STARTING_COINS,
      gameScore: 0,
    }));
    const clients = this.state.clients;
    const meta = this.state.meta;
    const ambientMusic = this.state.ambientMusic;
    this._clearSpinTimer();
    this._clearCrashTimer();
    this.state = defaultState();
    this.state.players = players;
    this.state.clients = clients;
    this.state.meta = normalizeMeta(meta, this.state.meta);
    this.state.ambientMusic = normalizeAmbientMusic(ambientMusic);
    this.touch();
  }

  _scheduleSpinFinish(delayMs) {
    this._clearSpinTimer();
    this._spinTimer = setTimeout(() => {
      this._spinTimer = null;
      this.finishSpin();
    }, Math.max(0, delayMs));
  }

  _clearSpinTimer() {
    if (this._spinTimer) {
      clearTimeout(this._spinTimer);
      this._spinTimer = null;
    }
  }
}

function normalizePlayers(players) {
  const base = defaultPlayers();
  if (!Array.isArray(players)) return base;
  return base.map((def, i) => {
    const saved = players[i] || {};
    return {
      id: def.id,
      name: saved.name || def.name,
      score: Number.isFinite(Number(saved.score)) ? Number(saved.score) : STARTING_COINS,
      gameScore: Number(saved.gameScore) || 0,
      color: saved.color || def.color,
      avatar: saved.avatar || def.avatar,
    };
  });
}

function normalizeClients(clients, players) {
  if (!clients || typeof clients !== 'object') return {};
  return Object.fromEntries(
    Object.entries(clients).map(([id, client]) => [
      id,
      normalizeClient(client, players),
    ])
  );
}

function normalizeClient(client, players) {
  const ids = new Set(players.map((p) => p.id));
  const legacyPlayerId = legacyTeamIdToPlayerId(client && client.teamId);
  const playerId = ids.has(client && client.playerId)
    ? client.playerId
    : ids.has(legacyPlayerId)
    ? legacyPlayerId
    : null;
  return {
    playerId,
    role: (client && client.role) || 'play',
    connected: false,
    lastSeen: Number(client && client.lastSeen) || 0,
    socketId: client && client.socketId,
  };
}

function normalizeBuzzer(buzzer) {
  return {
    status: Object.values(BUZZER).includes(buzzer && buzzer.status)
      ? buzzer.status
      : BUZZER.LOCKED,
    presses: Array.isArray(buzzer && buzzer.presses)
      ? buzzer.presses
          .map((p, i) => ({
            playerId: p.playerId || legacyTeamIdToPlayerId(p.teamId),
            clientId: p.clientId,
            ts: Number(p.ts) || Date.now(),
            order: Number(p.order) || i + 1,
          }))
          .filter((p) => p.playerId)
      : [],
  };
}

function normalizeRound(round) {
  const base = defaultRound();
  if (!round || typeof round !== 'object') return base;
  const category = round.category || (round.kategorie ? normalizeCategory(round.kategorie) : null);
  const pickerPlayerId = round.pickerPlayerId || legacyTeamIdToPlayerId(round.pickerTeamId);
  return {
    ...base,
    ...round,
    total: TOTAL_ROUNDS,
    pickerPlayerId: pickerPlayerId || null,
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
    choices: Array.isArray(round.choices) ? round.choices : [],
    selectedGame: round.selectedGame || null,
    spin: normalizeSpin(round.spin),
    bets: normalizeBets(round.bets),
    betsRevealed: round.betsRevealed === true,
    placements: normalizePlacements(round.placements),
    payoutApplied: round.payoutApplied === true,
    payoutSummary: Array.isArray(round.payoutSummary) ? round.payoutSummary : [],
  };
}

function normalizeCrashGame(crashGame, players) {
  if (!crashGame || typeof crashGame !== 'object') return defaultCrashGame(players);

  const phases = ['idle', 'ready', 'running', 'crashed', 'finished'];
  const phase = phases.includes(crashGame.phase) ? crashGame.phase : 'idle';
  const crashPoint = Number(crashGame.crashPoint);
  const hasCrashPoint = Number.isFinite(crashPoint) && crashPoint >= 1;

  if ((phase === 'running' || phase === 'crashed' || phase === 'finished') && !hasCrashPoint) {
    return defaultCrashGame(players);
  }

  const normalized = {
    ...defaultCrashGame(players),
    ...crashGame,
    phase,
    multiplier: round2(Math.max(1, Number(crashGame.multiplier) || 1)),
    crashPoint: hasCrashPoint ? round2(crashPoint) : null,
    startedAt: Number(crashGame.startedAt) || null,
    crashedAt: Number(crashGame.crashedAt) || null,
    payoutApplied: crashGame.payoutApplied === true,
    settings: normalizeCrashSettings(crashGame.settings),
    players: normalizeCrashPlayers(crashGame.players, players, phase === 'ready' || phase === 'running'),
  };

  if (phase === 'idle') {
    return {
      ...defaultCrashGame(players),
      settings: normalized.settings,
    };
  }

  if (phase === 'ready') {
    normalized.multiplier = 1;
    normalized.crashPoint = null;
    normalized.startedAt = null;
    normalized.crashedAt = null;
    normalized.payoutApplied = false;
  }

  if (phase === 'crashed' || phase === 'finished') {
    for (const entry of Object.values(normalized.players)) {
      if (entry.stake > 0 && !entry.cashedOut) {
        entry.lost = true;
        entry.payout = 0;
      }
    }
  }

  return normalized;
}

function buildCrashPlayers(players, stakes = {}) {
  return Object.fromEntries(
    players.map((player) => [
      player.id,
      crashPlayer(player, stakes[player.id]),
    ])
  );
}

function normalizeCrashPlayers(savedPlayers, players, clampToScore = true) {
  const saved = savedPlayers && typeof savedPlayers === 'object' ? savedPlayers : {};
  return Object.fromEntries(
    players.map((player) => {
      const entry = saved[player.id] || {};
      const maxStake = clampToScore ? player.score : Number.MAX_SAFE_INTEGER;
      const stake = clampCrashStake(entry.stake, maxStake);
      const cashoutMultiplier = Number(entry.cashoutMultiplier);
      const payout = clampInt(entry.payout, 0, Number.MAX_SAFE_INTEGER);
      return [
        player.id,
        {
          playerId: player.id,
          name: entry.name || player.name,
          stake,
          cashedOut: entry.cashedOut === true,
          cashoutMultiplier: Number.isFinite(cashoutMultiplier) ? round2(cashoutMultiplier) : null,
          payout,
          netDelta: Number.isFinite(Number(entry.netDelta)) ? Number(entry.netDelta) : 0,
          finalScore: Number.isFinite(Number(entry.finalScore)) ? Number(entry.finalScore) : player.score,
          lost: entry.lost === true,
        },
      ];
    })
  );
}

function crashPlayer(player, stake = 0) {
  return {
    playerId: player.id,
    name: player.name,
    stake: clampCrashStake(stake, player.score),
    cashedOut: false,
    cashoutMultiplier: null,
    payout: 0,
    netDelta: 0,
    finalScore: player.score,
    lost: false,
  };
}

function normalizeBets(bets) {
  if (!bets || typeof bets !== 'object') return {};
  return Object.fromEntries(
    Object.entries(bets)
      .map(([playerId, bet]) => [
        playerId,
        {
          playerId: bet.playerId || playerId,
          targetPlayerId: bet.targetPlayerId || null,
          amount: clampInt(bet.amount, 0, MAX_BET),
          submittedAt: Number(bet.submittedAt) || 0,
        },
      ])
      .filter(([, bet]) => bet.playerId)
  );
}

function normalizePlacements(placements) {
  if (!placements || typeof placements !== 'object') return {};
  return Object.fromEntries(
    Object.entries(placements)
      .map(([playerId, place]) => [playerId, clampInt(place, 1, PLAYER_COUNT)])
      .filter(([, place]) => place >= 1 && place <= PLAYER_COUNT)
  );
}

function normalizeSpin(spin) {
  if (!spin || typeof spin !== 'object') return defaultSpin();
  return {
    ...defaultSpin(),
    ...spin,
    durationMs: Number(spin.durationMs) || SPIN_DURATION_MS,
    sequence: Array.isArray(spin.sequence) ? spin.sequence : [],
  };
}

function buildSpinSequence(choices, winnerIndex) {
  const sequence = [];
  const loops = 9;
  for (let i = 0; i < loops; i += 1) {
    choices.forEach((choice, index) => {
      sequence.push({ ...choice, spinIndex: i * choices.length + index });
    });
  }
  sequence.push({ ...choices[winnerIndex], spinIndex: sequence.length, winner: true });
  return sequence;
}

function normalizeMeta(meta, baseMeta = { history: [], featuredGameTitles: {} }) {
  const featuredGameTitles = {};
  const savedTitles = meta && typeof meta.featuredGameTitles === 'object'
    ? meta.featuredGameTitles
    : {};

  for (const [key, value] of Object.entries(savedTitles)) {
    const title = String(value || '').trim().slice(0, 80);
    if (title) featuredGameTitles[key] = title;
  }

  return {
    ...baseMeta,
    ...(meta || {}),
    featuredGameTitles,
  };
}

function normalizeAmbientMusic(value) {
  const saved = value && typeof value === 'object' ? value : {};
  const trackId = AMBIENT_TRACK_IDS.includes(String(saved.trackId || ''))
    ? String(saved.trackId)
    : DEFAULT_AMBIENT_MUSIC.trackId;
  const volume = clampInt(
    saved.volume == null ? DEFAULT_AMBIENT_MUSIC.volume : saved.volume,
    0,
    100
  );

  return {
    enabled: saved.enabled === true,
    trackId,
    volume: Number.isFinite(volume) ? volume : DEFAULT_AMBIENT_MUSIC.volume,
    updatedAt: Number(saved.updatedAt) || null,
  };
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeCrashSettings(settings) {
  const saved = settings && typeof settings === 'object' ? settings : {};
  const minCrashPoint = clampNumber(
    saved.minCrashPoint,
    1.01,
    50,
    CRASH_DEFAULT_SETTINGS.minCrashPoint
  );
  const maxCrashPoint = clampNumber(
    saved.maxCrashPoint,
    minCrashPoint,
    50,
    CRASH_DEFAULT_SETTINGS.maxCrashPoint
  );
  const growthSpeed = clampNumber(
    saved.growthSpeed,
    0.2,
    5,
    CRASH_DEFAULT_SETTINGS.growthSpeed
  );

  return {
    minCrashPoint: round2(minCrashPoint),
    maxCrashPoint: round2(Math.max(maxCrashPoint, minCrashPoint)),
    growthSpeed: round2(growthSpeed),
  };
}

function randomCrashPoint(settings) {
  const normalized = normalizeCrashSettings(settings);
  const min = Math.round(normalized.minCrashPoint * 100);
  const max = Math.round(normalized.maxCrashPoint * 100);
  return round2(crypto.randomInt(min, max + 1) / 100);
}

function clampCrashStake(value, maxStake = Number.MAX_SAFE_INTEGER) {
  const max = Math.max(0, Math.floor(Number(maxStake) || 0));
  return Math.min(max, roundToNearestFive(clampInt(value, 0, max)));
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundToNearestFive(value) {
  return Math.max(0, Math.round((Number(value) || 0) / 5) * 5);
}

function legacyTeamIdToPlayerId(teamId) {
  const match = /^team([1-5])$/.exec(String(teamId || ''));
  return match ? `player${match[1]}` : null;
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

module.exports = {
  GameState,
  PHASES,
  BUZZER,
  PLAYER_COUNT,
  TOTAL_ROUNDS,
  SPIN_DURATION_MS,
  STARTING_COINS,
  MAX_BET,
  CRASH_TICK_MS,
  FEATURED_GAMES,
  RANK_AWARDS,
};
