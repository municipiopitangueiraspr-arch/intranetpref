(() => {
  const appRoot = (() => {
    const path = window.location.pathname;
    const marker = "/painel-administrativo/";
    const index = path.indexOf(marker);
    return index >= 0 ? `${path.slice(0, index)}/` : "./";
  })();
  const root = (path) => `${appRoot}${path}`;
  const base = root("painel-administrativo/core/index.html");
  const links = [
    ["dashboard", "fa-gauge-high", "Visão geral"],
    ["auditoria", "fa-clock-rotate-left", "Segurança e auditoria"],
    ["usuarios", "fa-users", "Usuários", "navUsers"],
    ["estrutura", "fa-sitemap", "Estrutura organizacional"],
    ["orgaos", "fa-building", "Órgãos e unidades"],
    ["modulos", "fa-cubes", "Catálogo de módulos"],
    ["permissoes", "fa-key", "Perfis e permissões"],
    ["governanca", "fa-user-shield", "Solicitações e governança"],
  ];
  const currentView = new URL(window.location.href).searchParams.get("view") || "dashboard";

  function navMarkup() {
    const linksMarkup = links.map(([view, icon, label, id]) => {
      const selected = currentView === view;
      const href = `${base}?view=${encodeURIComponent(view)}`;
      return `<a href="${href}"${selected ? ' class="active" aria-current="page"' : ""}>` +
        `<i class="fas ${icon}" aria-hidden="true"></i><span>${label}</span>` +
        `${id ? `<em id="${id}">—</em>` : ""}</a>`;
    }).join("");

    return `<div class="sidebar-brand">
      <div class="brand-icon" aria-label="Brasão do Município">
        <img class="brasao-municipio" src="${root("brasao-pref.png")}" alt="Brasão do Município" loading="eager"
         >
        <i class="fas fa-shield-halved" aria-hidden="true"></i>
      </div>
      <div class="brand-text"><h2>Prefeitura Municipal de Pitangueiras</h2><span>Intranet Municipal</span></div>
    </div>
    <nav class="sidebar-nav" aria-label="Navegação do Painel Admin">
      <div class="nav-section" role="heading" aria-level="2">Painel administrativo</div>
      ${linksMarkup}
    </nav>
    <div class="sidebar-voltar"><a href="${root("intranet.html")}"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>Voltar à intranet</span></a></div>`;
  }

  function mountSidebar() {
    const sidebar = document.querySelector(".admin-sidebar, .saas-sidebar, aside.sidebar");
    if (!sidebar || sidebar.dataset.sharedNavigation === "true") return;
    sidebar.classList.add("sidebar", "shared-admin-sidebar");
    if (!sidebar.id) sidebar.id = "sidebar";
    sidebar.dataset.sharedNavigation = "true";
    sidebar.setAttribute("aria-label", "Navegação do Painel Admin");
    sidebar.innerHTML = navMarkup();
    sidebar.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => sidebar.classList.remove("aberta", "is-open"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSidebar, { once: true });
  } else {
    mountSidebar();
  }
})();
