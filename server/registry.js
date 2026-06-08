'use strict';

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, '..', 'games');

const KATEGORIEN = ['sport', 'skill', 'quiz'];
const INTERAKTIONEN = ['buzzer', 'multiple-choice', 'karte', 'schaetzen', 'keine'];
const MODI = ['single', 'group'];

// Id des Demo-/Platzhalterspiels. built:false-Spiele laden dessen Module.
const DEMO_GAME_ID = 'buzzer-test';

/**
 * Normalisiert das modus-Feld zu einem Array gueltiger Modi.
 * Erlaubt: 'einzeln' | 'gemeinsam' | 'beide' | Array davon.
 * Fehlt das Feld, gilt das Spiel in BEIDEN Modi (sicherer Default fuer Demo).
 */
function normalizeModus(value) {
  if (value === 'beide' || value == null) return ['single', 'group'];
  const arr = Array.isArray(value) ? value : [value];
  const out = arr
    .map((m) => {
      if (m === 'einzeln') return 'single';
      if (m === 'gemeinsam') return 'group';
      return m;
    })
    .filter((m) => MODI.includes(m));
  return out.length ? out : ['single', 'group'];
}

function normalizeCategory(value) {
  if (value === 'geschicklichkeit') return 'skill';
  return KATEGORIEN.includes(value) ? value : 'quiz';
}

/**
 * Zentrale Spiel-Registry.
 *
 * Jedes Spiel ist ein Ordner unter /games mit einer game.js, die ein
 * Definition-Objekt exportiert. Beim Start werden alle Spiele automatisch
 * eingelesen -> neue Spiele = neuer Ordner, KEIN Eingriff in den Kern.
 *
 * Erwartetes Schema von game.js:
 *   {
 *     id,
 *     mode:            'single' | 'group' | ['single','group'],
 *     category:        'sport' | 'skill' | 'quiz',
 *     title,
 *     responsiblePerson,
 *     difficulty:      1 | 2 | 3,
 *     description,
 *     rules,
 *     materials:       string[],
 *     interaktionstyp: 'buzzer' | 'multiple-choice' | 'karte' | 'schaetzen' | 'keine',
 *     // optionale Server-Hooks (alle bekommen ein ctx-Objekt, siehe sockets.js):
 *     onStart(ctx)            {}
 *     onStop(ctx)             {}
 *     onAction(ctx, client, action) {}
 *   }
 *
 * Client-Logik (Display/Player) liegt als display.js / play.js im selben Ordner
 * und wird vom Frontend dynamisch nachgeladen (siehe public/shared/game-loader.js).
 */
class Registry {
  constructor() {
    this.games = new Map();
  }

  loadAll() {
    this.games.clear();
    if (!fs.existsSync(GAMES_DIR)) {
      console.warn('[registry] /games existiert nicht.');
      return;
    }

    const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameFile = path.join(GAMES_DIR, entry.name, 'game.js');
      if (!fs.existsSync(gameFile)) continue;

      try {
        delete require.cache[require.resolve(gameFile)];
        const def = require(gameFile);
        const game = this._normalize(def, entry.name);
        if (game) {
          this.games.set(game.id, game);
          console.log(`[registry] Spiel geladen: ${game.id} (${game.name})`);
        }
      } catch (err) {
        console.error(`[registry] Fehler beim Laden von ${entry.name}:`, err.message);
      }
    }
    console.log(`[registry] ${this.games.size} Spiel(e) registriert.`);
  }

  _normalize(def, folderName) {
    if (!def || !def.id) {
      console.warn(`[registry] ${folderName}/game.js hat keine id -> uebersprungen.`);
      return null;
    }
    const kategorie = normalizeCategory(def.category || def.kategorie);
    const interaktionstyp = INTERAKTIONEN.includes(def.interaktionstyp)
      ? def.interaktionstyp
      : 'keine';
    const schwierigkeit = Math.min(3, Math.max(1, Number(def.difficulty || def.schwierigkeit) || 1));
    const modus = normalizeModus(def.mode || def.modus);
    // built default true; nur explizit built:false ist ein Platzhalter.
    const built = def.built !== false;
    // demo = das Platzhalterspiel selbst (nicht im Pick-Pool).
    const demo = def.demo === true || def.id === DEMO_GAME_ID;

    return {
      id: def.id,
      name: def.title || def.name || def.id,
      title: def.title || def.name || def.id,
      kategorie,
      category: kategorie,
      modus,
      mode: modus,
      schwierigkeit,
      difficulty: schwierigkeit,
      responsiblePerson: def.responsiblePerson || '',
      description: def.description || '',
      rules: def.rules || '',
      materials: Array.isArray(def.materials) ? def.materials : [],
      hasBeenPlayed: def.hasBeenPlayed === true,
      interaktionstyp,
      built,
      demo,
      folder: folderName,
      assets: def.assets || null,
      // Hooks (no-ops, falls das Spiel sie nicht definiert)
      onStart: typeof def.onStart === 'function' ? def.onStart : null,
      onStop: typeof def.onStop === 'function' ? def.onStop : null,
      onAction: typeof def.onAction === 'function' ? def.onAction : null,
    };
  }

  get(id) {
    return this.games.get(id) || null;
  }

  /** Serialisierbare Liste fuer den Admin (ohne Funktions-Hooks). */
  list() {
    return Array.from(this.games.values()).map((g) => ({
      id: g.id,
      name: g.name,
      title: g.title,
      kategorie: g.kategorie,
      category: g.category,
      modus: g.modus,
      mode: g.mode,
      schwierigkeit: g.schwierigkeit,
      difficulty: g.difficulty,
      responsiblePerson: g.responsiblePerson,
      description: g.description,
      rules: g.rules,
      materials: g.materials,
      hasBeenPlayed: g.hasBeenPlayed,
      interaktionstyp: g.interaktionstyp,
      built: g.built,
      demo: g.demo,
      folder: g.folder,
    }));
  }

  /** Kompakte Meta fuer den State (was Display/Player zum Rendern brauchen). */
  meta(id) {
    const g = this.get(id);
    if (!g) return null;
    return {
      id: g.id,
      name: g.name,
      title: g.title,
      kategorie: g.kategorie,
      category: g.category,
      modus: g.modus,
      mode: g.mode,
      schwierigkeit: g.schwierigkeit,
      difficulty: g.difficulty,
      responsiblePerson: g.responsiblePerson,
      description: g.description,
      rules: g.rules,
      materials: g.materials,
      hasBeenPlayed: g.hasBeenPlayed,
      interaktionstyp: g.interaktionstyp,
      built: g.built,
      folder: g.folder,
    };
  }

  /** Pool-Spiele (alle ausser dem Demo-Platzhalter). */
  pool() {
    return this.list().filter((g) => !g.demo);
  }

  /**
   * Spiele zur Auswahl fuer den Pick-Ablauf: passender modus + kategorie,
   * nicht das Demo, noch nicht verbraucht. Normal 3, weniger falls verbraucht.
   */
  buildChoices(modus, kategorie, consumed = [], options = {}) {
    const mode = normalizeModus(modus)[0];
    const category = normalizeCategory(kategorie);
    const includePlayed = options.includePlayed === true;
    const candidates = this.pool()
      .filter(
        (g) =>
          g.mode.includes(mode) &&
          g.category === category &&
          (includePlayed || !consumed.includes(g.id))
      );

    return candidates
      .slice(0, 3)
      .map((g) => ({
        gameId: g.id,
        id: g.id,
        name: g.name,
        title: g.title,
        kategorie: g.kategorie,
        category: g.category,
        modus: g.modus,
        mode: g.mode,
        schwierigkeit: g.schwierigkeit,
        difficulty: g.difficulty,
        responsiblePerson: g.responsiblePerson,
        description: g.description,
        rules: g.rules,
        materials: g.materials,
        interaktionstyp: g.interaktionstyp,
        built: g.built,
        hasBeenPlayed: consumed.includes(g.id),
      }));
  }

  /** Kategorien, die fuer den Modus noch >=1 ungespieltes Spiel haben. */
  availableKategorien(modus, consumed = []) {
    const mode = normalizeModus(modus)[0];
    return KATEGORIEN.filter((k) =>
      this.pool().some((g) => g.mode.includes(mode) && g.category === k)
    );
  }
}

module.exports = { Registry, KATEGORIEN, INTERAKTIONEN, MODI, DEMO_GAME_ID };
