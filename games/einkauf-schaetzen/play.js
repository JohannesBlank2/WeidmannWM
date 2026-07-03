GameRegistry.register('einkauf-schaetzen', {
  mount(container) {
    injectFishPlayStyles();
    container.innerHTML = '<div class="fish-play" id="fish-play"></div>';
  },

  update(state, ctx) {
    const root = document.getElementById('fish-play');
    if (!root) return;

    const game = fishState(state);
    const box = selectedBox(game);
    const me = window.App && window.App.me ? window.App.me(state) : null;
    const playerId = me && me.playerId;
    const answer = playerId && game.answersByBoxId[game.selectedBoxId]
      ? game.answersByBoxId[game.selectedBoxId][playerId]
      : null;

    if (!playerId) {
      root.innerHTML = cardHtml('Spieler wählen', 'Wähle zuerst deinen Namen aus.');
      return;
    }

    if (!box) {
      root.innerHTML = cardHtml('How much is the fish', 'Warte auf die Spielleitung.');
      return;
    }

    if (answer) {
      root.innerHTML = `
        <div class="card fish-play-card locked">
          <div class="fish-kicker">${escapeHtml(box.label)}</div>
          <h2>Schätzung eingeloggt</h2>
          <div class="fish-locked-price">${formatEuro(answer.amountCents)}</div>
          <div class="muted">Schau auf den TV, sobald aufgedeckt wird.</div>
        </div>`;
      return;
    }

    if (!game.answersOpen) {
      root.innerHTML = `
        <div class="card fish-play-card">
          <div class="fish-kicker">${escapeHtml(box.label)}</div>
          <h2>Warte auf die Box</h2>
          <div class="muted">Die Spielleitung öffnet gleich die Eingabe.</div>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="card fish-play-card">
        <div class="fish-kicker">${escapeHtml(box.label)}</div>
        <h2>Was kosten die 3 Gegenstände zusammen?</h2>
        <input class="fish-price-input" inputmode="decimal" pattern="[0-9,.]*" placeholder="0,00 €" data-fish-answer />
        <button class="fish-submit" data-fish-submit disabled>Schätzung einloggen</button>
      </div>`;

    const input = root.querySelector('[data-fish-answer]');
    const submit = root.querySelector('[data-fish-submit]');
    if (!input || !submit) return;
    input.oninput = () => {
      input.value = input.value.replace(/[^0-9,.]/g, '');
      submit.disabled = parseCents(input.value) == null;
    };
    submit.onclick = () => {
      const amount = parseCents(input.value);
      if (amount == null) return;
      submit.disabled = true;
      ctx.sendAction({ type: 'fish:submit-answer', amountCents: amount });
      if (navigator.vibrate) navigator.vibrate(35);
    };
  },

  unmount(container) {
    container.innerHTML = '';
  },
});

function cardHtml(title, sub) {
  return `<div class="card fish-play-card"><h2>${escapeHtml(title)}</h2><div class="muted">${escapeHtml(sub)}</div></div>`;
}

function fishState(state) {
  const raw = state.gameState && typeof state.gameState === 'object' ? state.gameState : {};
  return {
    selectedBoxId: raw.selectedBoxId || 'box1',
    boxes: Array.isArray(raw.boxes) ? raw.boxes : [],
    answersOpen: raw.answersOpen === true,
    answersByBoxId: raw.answersByBoxId && typeof raw.answersByBoxId === 'object' ? raw.answersByBoxId : {},
  };
}

function selectedBox(game) {
  return game.boxes.find((box) => box.id === game.selectedBoxId) || game.boxes[0] || null;
}

function parseCents(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function formatEuro(cents) {
  return `${(Number(cents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function injectFishPlayStyles() {
  if (document.getElementById('fish-play-styles')) return;
  const style = document.createElement('style');
  style.id = 'fish-play-styles';
  style.textContent = `
    .fish-play-card { display: grid; gap: 16px; text-align: center; }
    .fish-kicker {
      color: var(--accent); font-weight: 900; text-transform: uppercase;
      letter-spacing: .1em;
    }
    .fish-price-input {
      width: 100%; min-height: 84px; border-radius: 8px;
      border: 2px solid rgba(255,209,92,.55); background: #13070a;
      color: var(--text); font: inherit; font-size: 2.4rem; font-weight: 900;
      text-align: center; padding: 10px 14px;
    }
    .fish-submit {
      min-height: 82px; background: linear-gradient(180deg, #19a65f, var(--good));
      border-color: #2ec477; color: #fff; font-size: 1.35rem; font-weight: 900;
    }
    .fish-submit:disabled { background: linear-gradient(180deg, #555, #333); border-color: #444; }
    .fish-play-card.locked {
      border-color: var(--good);
      box-shadow: 0 0 0 2px rgba(17,140,79,.35) inset;
    }
    .fish-locked-price { color: var(--accent); font-size: 3rem; font-weight: 900; }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
