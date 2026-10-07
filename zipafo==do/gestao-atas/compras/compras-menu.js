// Contrato único de navegação do módulo Compras Públicas.
// Todas as telas importam este mesmo objeto para impedir menus divergentes.
export const COMPRAS_MENU = [
  {
    section: "Compras Públicas",
    itens: [
      { id: "compras-painel", rota: "index.html#painel", icone: "fa-gauge-high", label: "Visão geral" },
      { id: "compras-demandas", rota: "index.html#tab-demands", icone: "fa-inbox", label: "Necessidades" },
      { id: "compras-pca", rota: "index.html#tab-pca", icone: "fa-calendar-check", label: "Planejamento anual" },
      { id: "compras-processos", rota: "index.html#tab-processes", icone: "fa-folder-tree", label: "Processos" },
      { id: "compras-publicacoes", rota: "index.html#tab-publications", icone: "fa-bullhorn", label: "Publicações" },
      { id: "compras-contratos", rota: "index.html#tab-contracts", icone: "fa-file-contract", label: "Contratos" },
      { id: "compras-agenda", rota: "index.html#tab-agenda", icone: "fa-calendar", label: "Agenda" },
      { id: "compras-configuracao", rota: "index.html#tab-settings", icone: "fa-sliders", label: "Configuração" },
      { id: "compras-operacao", rota: "operacao.html", icone: "fa-layer-group", label: "Central operacional" },
      { id: "compras-artefatos", rota: "artefatos.html", icone: "fa-file-lines", label: "ETP, TR e documentos" },
      { id: "compras-decisoes", rota: "decisoes.html", icone: "fa-scale-balanced", label: "Decisões e atos" },
      { id: "compras-governanca", rota: "governanca.html", icone: "fa-book-bookmark", label: "Regras e fontes" },
      { id: "compras-auditoria", rota: "auditoria.html", icone: "fa-clipboard-check", label: "Trilha de auditoria" },
      { id: "compras-ajuda", rota: "ajuda.html", icone: "fa-circle-question", label: "Ajuda" },
    ],
  },
];
