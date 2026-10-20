import { supabase } from "../../shared/js/supabase.js";
import { initLayout } from "../../shared/js/layout.js?v=20261010-admin-shell-parity-1";
import { ADMIN_VIEW_TEMPLATES } from "./admin-view-templates.js?v=20261014-admin-shell-consolidated-1";

const VIEWS = {
  dashboard: { title: "Painel executivo", subtitle: "Visão central da governança administrativa", page: "core-index", icon: "fa-gauge-high" },
  auditoria: { title: "Segurança e auditoria", subtitle: "Governança administrativa · trilha de eventos", page: "core-auditoria-v2", icon: "fa-shield-halved" },
  usuarios: { title: "Usuários", subtitle: "Identidades, perfis e ciclo de acesso", page: "core-usuarios-index", icon: "fa-users" },
  orgaos: { title: "Órgãos e unidades", subtitle: "Cadastro institucional e gestores", page: "core-orgaos-index", icon: "fa-building" },
  modulos: { title: "Catálogo de módulos", subtitle: "Módulos disponíveis na Intranet", page: "core-modulos-index", icon: "fa-cubes" },
  permissoes: { title: "Perfis e permissões", subtitle: "Concessões de acesso por usuário", page: "core-permissoes-index", icon: "fa-key" },
  governanca: { title: "Solicitações e governança", subtitle: "Revisão de acessos, usuários e trilha administrativa", page: "admin-acessos", icon: "fa-user-shield" },
  estrutura: { title: "Estrutura organizacional", subtitle: "Árvore institucional, lotações e histórico", page: "core-estrutura-index", icon: "fa-sitemap" },
};
const ALIASES = { audit: "auditoria", logs: "auditoria", users: "usuarios", orgs: "orgaos", modules: "modulos", permissions: "permissoes", structure: "estrutura", organograma: "estrutura", acessos: "governanca", solicitacoes: "governanca", admin: "dashboard" };
const NAV = [
  { label: "VISÃO CENTRAL", items: [["dashboard", "Painel executivo"], ["auditoria", "Segurança e auditoria"]] },
  { label: "IDENTIDADES E ACESSO", items: [["usuarios", "Usuários"], ["estrutura", "Estrutura organizacional"], ["orgaos", "Órgãos e unidades"], ["permissoes", "Perfis e permissões"], ["modulos", "Catálogo de módulos"], ["governanca", "Solicitações e governança"]] },
];
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
const viewParam = new URLSearchParams(window.location.search).get("view") || "dashboard";
const view = VIEWS[viewParam] ? viewParam : (ALIASES[viewParam] || "dashboard");
const spec = VIEWS[view];

function viewUrl(key) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("view", key);
  return `${url.pathname}${url.search}`;
}

function buildSharedMenu() {
  return NAV.map((group) => ({
    section: group.label,
    itens: group.items.map(([key, label]) => ({
      id: key,
      rota: viewUrl(key),
      icone: VIEWS[key].icon,
      label,
    })),
  }));
}

function addUsersCountBadge() {
  const usersLink = document.querySelector('.sidebar-nav a[data-modulo="usuarios"]');
  if (!usersLink || document.getElementById("navUsers")) return;
  const badge = document.createElement("em");
  badge.id = "navUsers";
  badge.className = "admin-nav-count";
  badge.setAttribute("aria-label", "usuários ativos");
  badge.textContent = "—";
  usersLink.appendChild(badge);
}

function restoreHeaderCompatibilityIds() {
  const aliases = [
    [$("#topbar .topbar-info strong"), "topbarNome"],
    [$("#topbar .topbar-info span"), "topbarData"],
    [$("#topbar .avatar-usuario") || $("#topbar .avatar-btn > span"), "avatarIniciais"],
  ];
  aliases.forEach(([element, id]) => {
    if (element) element.id = id;
  });
}

function setGate() {
  const gate = $("#adminGate");
  if (!gate) return;
  gate.hidden = false;
  const title = gate.querySelector("h1");
  const copy = $("#adminGateMessage");
  if (title) title.textContent = "Painel Admin indisponível";
  if (copy) copy.textContent = "Não foi possível abrir esta área. Volte à Intranet e tente novamente.";
}

async function getAdmin() {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const session = authData?.session;
  if (!session) return { denied: true };
  const { data: user, error } = await supabase.from("usuarios")
    .select("id,uuid,nome,email,perfil,ativo,orgao_id,foto_url")
    .eq("uuid", session.user.id).maybeSingle();
  if (error) throw error;
  if (!user || user.ativo !== true || user.perfil !== "ADMIN") {
    return { denied: true };
  }
  return { session, user };
}

async function loadController() {
  if (view === "dashboard") return import("./admin-central.js?v=20261010-admin-no-validation-ui-1");
  if (view === "auditoria") {
    const module = await import("./auditoria-panel.js?v=20261010-admin-no-validation-ui-1");
    await module.initializeAdminView();
    return module;
  }
  const controllers = {
    usuarios: () => import("./usuarios/admin-view.js?v=20261010-logout-unify-1"),
    orgaos: () => import("./orgaos/admin-view.js?v=20261010-admin-onepage-2"),
    modulos: () => import("./modulos/admin-view.js?v=20261010-admin-onepage-2"),
    permissoes: () => import("./permissoes/admin-view.js?v=20261010-logout-unify-1"),
    governanca: () => import("./admin-governance.js?v=20261010-admin-onepage-2"),
    estrutura: () => import("./estrutura/admin-view.js?v=20261015-org-tree-1"),
  };
  const module = await controllers[view]();
  if (typeof module.initializeAdminView === "function") await module.initializeAdminView();
  return module;
}

async function start() {
  document.body.dataset.intranetPage = spec.page;
  try {
    const result = await getAdmin();
    if (result.denied) {
      setGate();
      return;
    }

    window.ADMIN_SINGLE_PAGE = true;
    window.adminCurrentUser = result.user;
    window.usuarioLogado = result.user;

    await initLayout({
      supabase,
      usuarioInicial: result.user,
      brand: {
        nome: "Prefeitura Municipal de Pitangueiras",
        subtitulo: "Intranet Municipal",
        icone: "fa-layer-group",
        imagem: "../../brasao-pref.png",
      },
      iconeTitulo: spec.icon,
      titulo: spec.title,
      subtitulo: spec.subtitle,
      menuUsuario: {
        rotaPerfil: "../../perfil.html",
        rotaAjuda: "../../controle-de-saldos/gestao-atas.html#faq",
      },
      moduloAtivo: view,
      menu: buildSharedMenu(),
      rotaVoltar: "../../intranet.html",
      textoVoltar: "Voltar à intranet",
      rotaIntranet: "../../intranet.html",
      presencaOnline: false,
      logoutHandledExternally: true,
    });

    const logout = $("#menuSair") || $("#btnSair");
    if (logout?.id === "menuSair") logout.id = "btnSair";
    if (view === "governanca" && logout) logout.id = "logout";
    addUsersCountBadge();
    restoreHeaderCompatibilityIds();

    const host = $("#adminViewHost");
    host.innerHTML = ADMIN_VIEW_TEMPLATES[view] || '<div class="admin-empty">Esta área não está disponível.</div>';
    $("#mainSystem").hidden = false;
    $("#adminGate").hidden = true;

    try {
      await loadController();
    } catch (error) {
      console.error("[admin-panel] falha ao inicializar a view", error);
      host.insertAdjacentHTML("afterbegin", '<section class="admin-load-error" role="alert"><h2>Não foi possível carregar esta área</h2><p>Falha temporária ao inicializar o módulo.</p><button id="adminRetry" type="button">Tentar novamente</button></section>');
      $("#adminRetry")?.addEventListener("click", () => window.location.reload());
    }
  } catch (error) {
    console.error("[admin-panel] falha ao iniciar o painel", error);
    $("#mainSystem").hidden = true;
    setGate();
  }
}

void start();
