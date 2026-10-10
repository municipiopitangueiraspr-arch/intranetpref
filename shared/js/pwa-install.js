/* Intranet Municipal · instalação PWA somente em dispositivos móveis */
(() => {
  const state = { deferred: null };
  const ua = String(window.navigator.userAgent || "");
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && Number(window.navigator.maxTouchPoints || 0) > 1);
  const isMobile = window.__INTRANET_MOBILE_PWA__ === true
    || window.navigator.userAgentData?.mobile === true
    || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)
    || isIOS;
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function workerUrl(workerPath) {
    try { return new URL(workerPath, document.baseURI).href; }
    catch { return ""; }
  }

  function disableDesktopPwa() {
    // Evita prompts automáticos e remove registros antigos deste PWA no desktop.
    window.addEventListener('beforeinstallprompt', (event) => event.preventDefault());
    const workerPath = document.body?.dataset.pwaWorker;
    if (!('serviceWorker' in navigator) || !workerPath) return;
    const expectedScript = workerUrl(workerPath);
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration || !expectedScript) return;
      const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
      const expected = new URL(expectedScript);
      const ownsRegistration = workers.some((worker) => {
        try {
          const script = new URL(worker.scriptURL);
          return script.origin === expected.origin && script.pathname === expected.pathname;
        } catch { return false; }
      });
      if (ownsRegistration) return registration.unregister();
      return undefined;
    }).catch((error) => console.warn('[PWA] não foi possível desativar o service worker no desktop:', error));
  }

  function createButton() {
    if (!isMobile || isStandalone || document.getElementById('pwaInstallButton')) return null;
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
    if (button && isMobile && !isStandalone) button.hidden = false;
  }

  function boot() {
    if (!isMobile) {
      disableDesktopPwa();
      return;
    }
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
