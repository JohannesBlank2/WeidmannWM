/* Client-seitiges Spiel-Modul-System.
 *
 * Jedes Spiel kann pro Ansicht eine Datei mitbringen:
 *   /games/<folder>/display.js   -> ruft GameRegistry.register(id, {...}) auf
 *   /games/<folder>/play.js      -> dito
 *
 * Ein Modul registriert ein Objekt mit Lifecycle-Methoden:
 *   {
 *     mount(container, ctx)   // einmal beim Start: DOM aufbauen
 *     update(state, ctx)      // bei jedem State-Update
 *     unmount(container, ctx) // beim Wechsel/Stop: aufräumen
 *   }
 *
 * ctx = { socket, clientId, role, view, sendAction(action) }
 *
 * Der Loader lädt die passende JS-Datei dynamisch nach, sobald ein Spiel
 * aktiv wird -> der Kern muss neue Spiele nicht kennen.
 */
(function () {
  const modules = new Map();      // id -> moduleDef
  const loadedScripts = new Set(); // bereits eingehängte script-URLs

  window.GameRegistry = {
    register(id, def) {
      modules.set(id, def);
    },
    get(id) {
      return modules.get(id) || null;
    },
  };

  function loadScript(url) {
    if (loadedScripts.has(url)) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => { loadedScripts.add(url); resolve(); };
      s.onerror = () => { console.warn('[game-loader] konnte nicht laden:', url); resolve(); };
      document.head.appendChild(s);
    });
  }

  /**
   * Verwaltet das aktive Spiel-Modul für eine Ansicht (display oder play).
   * Wird mit dem Container-Element und dem ctx erzeugt.
   */
  window.createGameHost = function (container, ctx) {
    let currentId = null;
    let currentDef = null;

    async function ensure(activeGame) {
      const id = activeGame ? activeGame.id : null;

      // Spielwechsel oder Spiel-Ende -> altes Modul aufräumen.
      if (currentId !== id) {
        if (currentDef && currentDef.unmount) {
          try { currentDef.unmount(container, ctx); } catch (e) { console.error(e); }
        }
        container.innerHTML = '';
        currentDef = null;
        currentId = id;

        if (id) {
          // built:false -> Demo-Spiel (buzzer-test) als Platzhalter laden.
          const isDemo = activeGame.built === false;
          const folder = isDemo ? 'buzzer-test' : activeGame.folder;
          const moduleId = isDemo ? 'buzzer-test' : id;
          const url = `/games/${folder}/${ctx.view}.js`;
          await loadScript(url);
          const def = window.GameRegistry.get(moduleId);
          if (def) {
            currentDef = def;
            if (def.mount) {
              try { def.mount(container, ctx); } catch (e) { console.error(e); }
            }
          } else {
            container.innerHTML =
              `<div class="game-fallback">Spiel "${activeGame.name}" `
              + `(${ctx.view}) bringt keine ${ctx.view}.js mit.</div>`;
          }
        }
      }
    }

    return {
      // Bei jedem State-Update aufrufen.
      sync(state) {
        const active = state.activeGame;
        ensure(active).then(() => {
          if (currentDef && currentDef.update) {
            try { currentDef.update(state, ctx); } catch (e) { console.error(e); }
          }
        });
      },
    };
  };
})();
