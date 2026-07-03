GameRegistry.register('dart-ringe', {
  mount(container) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <h2>Dartringe</h2>
        <p class="muted">Dieses Spiel wird über die Admin-Konsole gesteuert.</p>
      </div>`;
  },

  update() {},

  unmount(container) {
    container.innerHTML = '';
  },
});
