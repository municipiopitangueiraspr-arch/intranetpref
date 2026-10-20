import { initLayout } from "../shared/js/layout.js?v=20261018-library-cachefix-1";

const MENU_BIBLIOTECA = [
  {
    section: "Principal",
    itens: [
      { id: "dashboard", rota: "dashboard.html", icone: "fa-gauge-high", label: "Painel" },
    ],
  },
  {
    section: "Acervo",
    itens: [
      { id: "livros", rota: "livros.html", icone: "fa-book", label: "Livros" },
      { id: "exemplares", rota: "exemplares.html", icone: "fa-bookmark", label: "Exemplares" },
      { id: "prateleiras", rota: "prateleiras.html", icone: "fa-layer-group", label: "Prateleiras" },
      { id: "autores", rota: "autores.html", icone: "fa-feather", label: "Autores" },
      { id: "categorias", rota: "categorias.html", icone: "fa-tags", label: "Categorias" },
    ],
  },
  {
    section: "Circulação",
    itens: [
      { id: "editoras", rota: "editoras.html", icone: "fa-building-columns", label: "Editoras" },
      { id: "emprestimos", rota: "emprestimos.html", icone: "fa-hand-holding-heart", label: "Empréstimos" },
      { id: "devolucoes", rota: "devolucoes.html", icone: "fa-rotate-left", label: "Devoluções" },
    ],
  },
  {
    section: "Pessoas",
    itens: [
      { id: "leitores", rota: "leitores.html", icone: "fa-users", label: "Leitores" },
    ],
  },
  {
    section: "Gestão",
    itens: [
      { id: "relatorios", rota: "relatorios.html", icone: "fa-chart-column", label: "Relatórios" },
      { id: "config", rota: "config.html", icone: "fa-gear", label: "Configurações" },
      { id: "ajuda", rota: "ajuda.html", icone: "fa-circle-question", label: "Ajuda" },
    ],
  },
];

const ACTIVE_PAGE = {
  "biblioteca-dashboard": "dashboard",
  "biblioteca-livros": "livros",
  "biblioteca-exemplares": "exemplares",
  "biblioteca-prateleiras": "prateleiras",
  "biblioteca-autores": "autores",
  "biblioteca-categorias": "categorias",
  "biblioteca-editoras": "editoras",
  "biblioteca-emprestimos": "emprestimos",
  "biblioteca-devolucoes": "devolucoes",
  "biblioteca-leitores": "leitores",
  "biblioteca-relatorios": "relatorios",
  "biblioteca-config": "config",
  "biblioteca-ajuda": "ajuda",
};

export async function initBibliotecaLayout(supabase) {
  window.__INTRANET_SHARED_LAYOUT__ = true;
  const pageId = document.body?.dataset.intranetPage || "biblioteca-dashboard";
  prepararCabecalhoBiblioteca(pageId);
  const usuario = await initLayout({
    supabase,
    brand: {
      nome: "Biblioteca Municipal",
      subtitulo: "Pitangueiras",
      icone: "fa-layer-group",
    },
    iconeTitulo: "fa-layer-group",
    titulo: "Gestão da Biblioteca Municipal",
    menuUsuario: {
      rotaPerfil: "../perfil.html",
      rotaAjuda: "ajuda.html",
    },
    menu: MENU_BIBLIOTECA,
    moduloAtivo: ACTIVE_PAGE[pageId] || "dashboard",
    rotaVoltar: "../intranet.html",
    textoVoltar: "Voltar à intranet",
  });
  if (usuario) {
    aplicarIntroducaoSidebar();
    void import("./biblioteca-saas.js?v=20261019-pacote1-catalogo-2").catch((error) => {
      console.warn("[biblioteca] Recursos municipais indisponíveis:", error);
    });
  }
  return usuario;
}

const PAGE_META = {
  "biblioteca-dashboard": ["Painel", "Indicadores e visão geral do acervo, empréstimos e devoluções."],
  "biblioteca-livros": ["Livros", "Cadastro e consulta das obras do acervo bibliográfico."],
  "biblioteca-exemplares": ["Exemplares", "Controle dos exemplares, disponibilidade e situação física."],
  "biblioteca-prateleiras": ["Prateleiras", "Organização e localização física dos exemplares."],
  "biblioteca-autores": ["Autores", "Cadastro e manutenção dos autores do acervo."],
  "biblioteca-categorias": ["Categorias", "Classificação temática das obras da Biblioteca Municipal."],
  "biblioteca-editoras": ["Editoras", "Cadastro e consulta das editoras do acervo."],
  "biblioteca-emprestimos": ["Empréstimos", "Acompanhamento de empréstimos, prazos e situação dos exemplares."],
  "biblioteca-devolucoes": ["Devoluções", "Registro e consulta das devoluções do acervo."],
  "biblioteca-leitores": ["Leitores", "Cadastro e acompanhamento dos leitores da Biblioteca."],
  "biblioteca-relatorios": ["Relatórios", "Consultas gerenciais e relatórios da operação."],
  "biblioteca-config": ["Configurações", "Parâmetros de circulação e operação do módulo."],
  "biblioteca-ajuda": ["Como usar", "Orientações para os recursos da Biblioteca Municipal."],
};

function prepararCabecalhoBiblioteca(pageId) {
  const pageHead = document.getElementById("topbar");
  if (!pageHead) return;
  const [title, description] = PAGE_META[pageId] || ["Biblioteca", "Gestão do acervo e dos serviços bibliotecários municipais."];
  pageHead.className = "topbar biblioteca-page-head";
  pageHead.setAttribute("aria-labelledby", "bibliotecaPageTitle");
  pageHead.innerHTML = `
    <div class="biblioteca-page-head__content">
      <span class="biblioteca-page-head__eyebrow">Biblioteca Municipal</span>
      <h2 id="bibliotecaPageTitle">${title}</h2>
      <p>${description}</p>
    </div>
    <div class="topbar-direita biblioteca-page-head__actions">
      <button type="button" class="btn-toggle-sidebar" id="btnToggleSidebar" title="Abrir menu" aria-label="Abrir menu" aria-expanded="false">
        <i class="fas fa-bars" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

function aplicarIntroducaoSidebar() {
  const sidebar = document.getElementById("sidebar");
  const nav = sidebar?.querySelector(".sidebar-nav");
  if (nav && !sidebar.querySelector(".sidebar-module-intro")) {
    nav.insertAdjacentHTML("beforebegin", `
      <section class="sidebar-module-intro" aria-label="Sobre o módulo">
        <span class="sidebar-module-intro__eyebrow">Acervo municipal</span>
        <h1>Biblioteca Municipal</h1>
        <p>Gestão do acervo, dos leitores e dos serviços bibliotecários.</p>
      </section>
    `);
  }
}
