(() => {
  const appRoot = (() => {
    const path = window.location.pathname;
    const marker = "/core/";
    const index = path.indexOf(marker);
    return index >= 0 ? `${path.slice(0, index)}/` : "./";
  })();
  const root = (path) => `${appRoot}${path}`;
  // CSS is consolidated in shared/css/intranet-global.css.
const links = [
    [root("core/index.html"), "fa-gauge-high", "Visão geral"],
    [root("core/usuarios/index.html"), "fa-users", "Usuários", "navUsers"],
    [root("core/orgaos/index.html"), "fa-building", "Órgãos e unidades"],
    [root("core/modulos/index.html"), "fa-cubes", "Módulos"],
    [root("core/permissoes/index.html"), "fa-key", "Perfis e permissões"],
    [root("admin-acessos.html"), "fa-user-shield", "Governança de acesso"],
  ];
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const active = (href) => {
    const target = new URL(href, document.baseURI).pathname.replace(/\/+$/, "");
    return path === target;
  };
  const navMarkup = () => `<a class="shared-nav-brand" href="${root("core/index.html")}"><span class="shared-nav-mark"><i class="fas fa-shield-halved"></i></span><span><strong>Governança</strong><small>Administração central</small></span></a><div class="shared-nav-label">Workspace administrativo</div><nav class="shared-nav-links" aria-label="Navegação administrativa">${links.map(([href, icon, label, id]) => `<a href="${href}" class="${active(href) ? "active" : ""}"${active(href) ? ' aria-current="page"' : ""}><i class="fas ${icon}"></i><span>${label}</span>${id ? `<em id="${id}">—</em>` : ""}</a>`).join("")}</nav><div class="shared-nav-footer"><i class="fas fa-lock"></i> Ambiente protegido · perfil ADMIN</div>`;
  function loadCss() { /* CSS centralizado; mantém a interface chamada por boot. */ }
  function mountSidebar() {
    const sidebar = document.querySelector(".admin-sidebar, .saas-sidebar, aside.sidebar");
    if (!sidebar || sidebar.dataset.sharedNavigation === "true") return;
    sidebar.classList.remove("admin-sidebar", "saas-sidebar", "sidebar");
    sidebar.classList.add("shared-admin-sidebar");
    sidebar.dataset.sharedNavigation = "true";
    sidebar.innerHTML = navMarkup();
    const toggle = document.querySelector("#btnToggleSidebar, .btn-toggle-sidebar");
    toggle?.addEventListener("click", () => sidebar.classList.toggle("aberta"));
    sidebar.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => sidebar.classList.remove("aberta")));
  }
  function boot() { loadCss(); mountSidebar(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
