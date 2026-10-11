/* Sistema-mãe — comportamento compartilhado do shell e dos estados globais. */
(() => {
  const sidebarSelector = '.sidebar, .saas-sidebar, .admin-sidebar, #sidebar, .system-sidebar';
  const toggleSelector = '#btnToggleSidebar, .btn-toggle-sidebar, [data-sidebar-toggle]';
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  const boot = () => {
    document.body.classList.add('system-mother');
    const sidebar = document.querySelector(sidebarSelector);
    if (!sidebar) return;
    sidebar.classList.add('system-sidebar');
    sidebar.setAttribute('aria-label', sidebar.getAttribute('aria-label') || 'Navegação principal da intranet');

    let backdrop = document.querySelector('.system-sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'system-sidebar-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }

    const toggles = [...document.querySelectorAll(toggleSelector)];
    const setOpen = (open) => {
      sidebar.classList.toggle('is-open', open);
      sidebar.classList.toggle('aberta', open);
      backdrop.classList.toggle('is-visible', open);
      toggles.forEach((button) => {
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-controls', sidebar.id || 'sidebar');
      });
      if (open) sidebar.querySelector('a,button,[tabindex]:not([tabindex="-1"])')?.focus({preventScroll:true});
    };
    toggles.forEach((button) => button.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open'))));
    backdrop.addEventListener('click', () => setOpen(false));
    sidebar.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href') || '';
      try {
        const target = new URL(href, document.baseURI).pathname.replace(/\/+$/, '') || '/';
        if (target === path || (target !== '/' && path.endsWith(target))) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      } catch (_) { /* link externo ou placeholder: não interferir */ }
      link.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });

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
