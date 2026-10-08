/* Intranet Municipal · PWA install affordance */
(() => {
  const state = { deferred: null };
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');

  function createButton() {
    if (isStandalone || document.getElementById('pwaInstallButton')) return null;
    const button = document.createElement('button');
    button.id = 'pwaInstallButton';
    button.className = 'pwa-install-button';
    button.type = 'button';
    button.hidden = true;
    button.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i><span>Instalar aplicativo</span>';
    button.addEventListener('click', async () => {
      if (state.deferred) {
        state.deferred.prompt();
        const choice = await state.deferred.userChoice;
        if (choice?.outcome === 'accepted') state.deferred = null;
        button.hidden = true;
        return;
      }
      if (isIOS) {
        window.alert('No iPhone ou iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.');
      } else {
        window.alert('A instalação ficará disponível quando o navegador confirmar que este site pode ser instalado.');
      }
    });
    document.body.appendChild(button);
    return button;
  }

  function reveal(button) {
    if (button && !isStandalone) button.hidden = false;
  }

  function boot() {
    const button = createButton();
    if (!button) return;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferred = event;
      reveal(button);
    });
    window.addEventListener('appinstalled', () => {
      state.deferred = null;
      button.hidden = true;
    });
    if (isIOS) {
      button.querySelector('span').textContent = 'Adicionar à tela inicial';
      reveal(button);
    }
    const workerPath = document.body.dataset.pwaWorker;
    if ('serviceWorker' in navigator && workerPath) {
      navigator.serviceWorker.register(workerPath, { scope: workerPath.replace(/service-worker\.js.*$/, '') || './' })
        .catch((error) => console.warn('[PWA] service worker indisponível:', error));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
