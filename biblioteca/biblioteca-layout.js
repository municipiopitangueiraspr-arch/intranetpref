import { initLayout } from "../shared/js/layout.js?v=20261010-shared-shell-1";

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
  const usuario = await initLayout({
    supabase,
    brand: {
      nome: "Prefeitura Municipal de Pitangueiras",
      subtitulo: "Intranet Municipal",
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
    void import("./biblioteca-saas.js?v=20261010-biblioteca-shared-shell-2").catch((error) => {
      console.warn("[biblioteca] Recursos SaaS indisponíveis:", error);
    });
  }
  return usuario;
}
