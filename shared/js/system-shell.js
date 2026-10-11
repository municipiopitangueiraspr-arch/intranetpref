/* Sistema-mãe — comportamento compartilhado do shell e dos estados globais. */
(() => {
  const sidebarSelector = '.sidebar, .saas-sidebar, .admin-sidebar, #sidebar, .system-sidebar';
  const toggleSelector = '#btnToggleSidebar, .btn-toggle-sidebar, [data-sidebar-toggle]';
  const currentUrl = new URL(window.location.href);
  const path = currentUrl.pathname.replace(/\/+$/, '') || '/';

  const boot = () => {
    document.body.classList.add('system-mother');
    const sidebar = document.querySelector(sidebarSelector);
    if (!sidebar) return;
    sidebar.classList.add('system-sidebar');
    sidebar.setAttribute('aria-label', sidebar.getAttribute('aria-label') || 'Navegação principal da intranet');

    const toggles = [...document.querySelectorAll(toggleSelector)];
    const toggleAlreadyBound = toggles.some((button) => button.dataset.sidebarToggleBound === 'true');
    let backdrop = document.querySelector('.system-sidebar-backdrop');
    if (!toggleAlreadyBound && !backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'system-sidebar-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }
    const setOpen = (open) => {
      sidebar.classList.toggle('is-open', open);
      sidebar.classList.toggle('aberta', open);
      backdrop?.classList.toggle('is-visible', open);
      toggles.forEach((button) => {
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-controls', sidebar.id || 'sidebar');
        button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        button.setAttribute('title', open ? 'Fechar menu' : 'Abrir menu');
      });
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) sidebar.querySelector('a,button,[tabindex]:not([tabindex="-1"])')?.focus({preventScroll:true});
    };
    if (!toggleAlreadyBound) {
      toggles.forEach((button) => {
        button.dataset.sidebarToggleBound = 'true';
        button.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
      });
      backdrop?.addEventListener('click', () => setOpen(false));
    }
    sidebar.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href') || '';
      try {
        const targetUrl = new URL(href, document.baseURI);
        const target = targetUrl.pathname.replace(/\/+$/, '') || '/';
        const samePath = target === path || (target !== '/' && path.endsWith(target));
        const hasViewRoute = currentUrl.searchParams.has('view') || targetUrl.searchParams.has('view');
        const hasHashRoute = Boolean(currentUrl.hash || targetUrl.hash);
        const matchesRoute = hasViewRoute
          ? samePath && (targetUrl.searchParams.get('view') || 'dashboard') === (currentUrl.searchParams.get('view') || 'dashboard')
          : hasHashRoute
            ? samePath && Boolean(targetUrl.hash) && targetUrl.hash === currentUrl.hash
            : samePath;
        if (matchesRoute) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      } catch (_) { /* link externo ou placeholder: não interferir */ }
      if (!toggleAlreadyBound) link.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
    const desktopQuery = window.matchMedia('(min-width: 1025px)');
    const closeOnDesktop = (event) => { if (event.matches) setOpen(false); };
    if (typeof desktopQuery.addEventListener === 'function') desktopQuery.addEventListener('change', closeOnDesktop);
    else if (typeof desktopQuery.addListener === 'function') desktopQuery.addListener(closeOnDesktop);

    document.querySelectorAll('.loading, .loading-state, [data-loading]').forEach((node) => {
      node.setAttribute('role', node.getAttribute('role') || 'status');
      node.setAttribute('aria-live', node.getAttribute('aria-live') || 'polite');
    });
    document.querySelectorAll('.toast, .notification-content, .notice-bar, [data-toast]').forEach((node) => {
      node.setAttribute('role', node.getAttribute('role') || 'status');
      node.setAttribute('aria-live', node.getAttribute('aria-live') || 'polite');
    });
    document.querySelectorAll('table').forEach((table) => {
      if (!table.querySelector('caption')) {
        const caption = document.createElement('caption');
        caption.className = 'sr-only';
        caption.textContent = table.getAttribute('aria-label') || 'Tabela de dados';
        table.prepend(caption);
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
