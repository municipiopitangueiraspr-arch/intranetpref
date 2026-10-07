// ============================================================
// controle-de-saldos/js/modules/relatorios.js
// Módulo de Relatórios — 26 relatórios completos
// ------------------------------------------------------------
// ESTRUTURA:
//
//   📊 VISÃO GERAL (4)
//     01. Atas Vencendo em X Dias
//     02. Execução por Ata
//     03. Projeção de Esgotamento
//     04. Saldo Consolidado por Ata
//
//   📦 CONSUMO (6)
//     05. Consumo por Órgão
//     06. Consumo por Categoria
//     07. Curva ABC de Itens
//     08. Consumo por Item (Analítico)
//     09. Consumo por Solicitante
//     10. Consumo por Período
//
//   🧾 PEDIDOS (6)
//     11. Pedidos por Status
//     12. Pedidos Pendentes há X Dias
//     13. Tempo Médio de Aprovação
//     14. Pedidos Detalhado (Analítico)
//     15. Pedidos Reprovados / Cancelados
//     16. Estoque Zerado com Pedido Pendente
//
//   🏢 FORNECEDORES (3)
//     17. Ranking de Fornecedores
//     18. Saldo por Fornecedor
//     19. Diferença de Preços
//
//   📋 AUDITORIA (7)
//     20. Histórico de Alterações
//     21. Divergências de Saldo
//     22. Comparativo Ano a Ano
//     23. Auditoria Completa (Timeline)
//     24. Concentração de Fornecedores
//     25. Pedidos por Órgão
//     26. Execução Média por Categoria
//
// PADRÕES REAPROVEITADOS:
//   · UI.mostrarToast()             → feedback
//   · UI.formatarMoeda()            → R$ 0,00
//   · UI.formatarData()             → dd/mm/aaaa
//   · Chart.js (window.Chart)       → gráficos
//   · jsPDF + jspdf-autotable       → PDF
//   · Blob + BOM UTF-8              → CSV
//   · fetch("templates/...")        → HTML externo
//
// DECISÕES DE UX CONSOLIDADAS:
//   · Cores dos cards: padrão (verde primário); alertas só nas células
//   · Curva ABC: 80/15/5
//   · Projeção de Esgotamento: só itens com consumo na janela
//   · Comparativo Ano a Ano: dropdown de ano base
//   · Divergências de Saldo: lógica autocontida (não chama gestao.js)
//   · Consumo por Período: agregação dia/semana/mês
//   · Concentração de Fornecedores: Top N concentra X% do gasto
//   · Pedidos por Órgão: cruzamento órgão × pedidos
//   · Execução Média por Categoria: % média de execução por categoria
//
// ⚠️ NOTA IMPORTANTE SOBRE O SCHEMA:
//   A tabela `consumos` usa a coluna `orgao_solicitante_id`
//   (não `orgao_id`). Todos os relatórios abaixo usam a coluna
//   correta. A tela de Gestão que usava `orgao_id` está
//   obsoleta e não é referenciada aqui.
// ============================================================

import { supabase } from "../supabase.js";

export class Relatorios {
  constructor(sistema) {
    this.sistema = sistema;

    // ============================================================
    // ESTADO DO MÓDULO
    // ============================================================
    this.relatorioAtivo = null;
    this.filtrosAtivos = {};
    this.dadosAtuais = []; // resultado da última query (para export)
    this.colunasAtuais = []; // definição de colunas p/ export
    this.graficoAtual = null; // instância Chart.js ativa
    this._carregando = false;
    this._htmlCarregado = false;

    // ============================================================
    // DEFINIÇÃO DOS GRUPOS
    // ============================================================
    this.GRUPOS = [
      {
        id: "visao_geral",
        titulo: "Visão Geral",
        icone: "fa-chart-pie",
        cor: "#1a3a6b",
      },
      {
        id: "consumo",
        titulo: "Consumo",
        icone: "fa-boxes",
        cor: "#059669",
      },
      {
        id: "pedidos",
        titulo: "Pedidos",
        icone: "fa-file-invoice",
        cor: "#d97706",
      },
      {
        id: "fornecedores",
        titulo: "Fornecedores",
        icone: "fa-truck",
        cor: "#7c3aed",
      },
      {
        id: "auditoria",
        titulo: "Auditoria",
        icone: "fa-shield-halved",
        cor: "#dc2626",
      },
    ];

    // ============================================================
    // METADADOS DOS 26 RELATÓRIOS
    // ------------------------------------------------------------
    // Tipos possíveis:
    //   · "periodo"             → data início + fim
    //   · "dias"                → input numérico de X dias
    //   · "periodo_ordenacao"   → data início/fim + select ordenação
    //   · "snapshot"            → só botão Atualizar (sem filtro)
    //   · "ano_base"            → select de ano
    //   · "periodo_agrupamento" → datas + select (dia/semana/mês)
    //   · "periodo_top"         → datas + top N
    // ============================================================
    this.RELATORIOS = [
      // ----------------------------------------------------------
      // GRUPO · VISÃO GERAL
      // ----------------------------------------------------------
      {
        id: "atas_vencendo",
        titulo: "Atas Vencendo em X Dias",
        descricao:
          "Atas ativas ou próximas cuja vigência se encerra nos próximos X dias.",
        icone: "fa-calendar-times",
        tipo: "dias",
        grupo: "visao_geral",
      },
      {
        id: "execucao_por_ata",
        titulo: "Execução por Ata",
        descricao:
          "Percentual executado (consumido) do valor contratado de cada ata.",
        icone: "fa-tasks",
        tipo: "periodo",
        grupo: "visao_geral",
      },
      {
        id: "projecao_esgotamento",
        titulo: "Projeção de Esgotamento",
        descricao:
          "Estimativa de quando cada item da ata vai esgotar com base no consumo recente.",
        icone: "fa-hourglass-end",
        tipo: "dias",
        grupo: "visao_geral",
      },
      {
        id: "saldo_consolidado_ata",
        titulo: "Saldo Consolidado por Ata",
        descricao:
          "Visão executiva do saldo atual, contratado, consumido e % de execução de cada ata.",
        icone: "fa-wallet",
        tipo: "snapshot",
        grupo: "visao_geral",
      },

      // ----------------------------------------------------------
      // GRUPO · CONSUMO
      // ----------------------------------------------------------
      {
        id: "consumo_por_orgao",
        titulo: "Consumo por Órgão",
        descricao:
          "Ranking de órgãos pelo valor total consumido no período selecionado.",
        icone: "fa-university",
        tipo: "periodo",
        grupo: "consumo",
      },
      {
        id: "consumo_por_categoria",
        titulo: "Consumo por Categoria",
        descricao:
          "Distribuição do consumo entre as categorias das atas no período.",
        icone: "fa-layer-group",
        tipo: "periodo",
        grupo: "consumo",
      },
      {
        id: "curva_abc_itens",
        titulo: "Curva ABC de Itens",
        descricao:
          "Classificação de itens por representatividade no consumo (80/15/5).",
        icone: "fa-chart-area",
        tipo: "periodo",
        grupo: "consumo",
      },
      {
        id: "consumo_por_item",
        titulo: "Consumo por Item (Analítico)",
        descricao:
          "Item a item: quanto foi consumido, qual o saldo atual e o percentual de execução.",
        icone: "fa-cubes",
        tipo: "periodo",
        grupo: "consumo",
      },
      {
        id: "consumo_por_solicitante",
        titulo: "Consumo por Solicitante",
        descricao:
          "Servidores ordenados pelo valor total consumido no período.",
        icone: "fa-user-tie",
        tipo: "periodo",
        grupo: "consumo",
      },
      {
        id: "consumo_por_periodo",
        titulo: "Consumo por Período",
        descricao:
          "Evolução do consumo com agregação configurável (dia, semana ou mês).",
        icone: "fa-chart-line",
        tipo: "periodo_agrupamento",
        grupo: "consumo",
      },

      // ----------------------------------------------------------
      // GRUPO · PEDIDOS
      // ----------------------------------------------------------
      {
        id: "pedidos_por_status",
        titulo: "Pedidos por Status",
        descricao:
          "Quantidade e valor de pedidos agrupados por status de aprovação.",
        icone: "fa-file-invoice",
        tipo: "periodo",
        grupo: "pedidos",
      },
      {
        id: "pedidos_pendentes",
        titulo: "Pedidos Pendentes há X Dias",
        descricao:
          "Pedidos aguardando aprovação há mais de X dias (gargalo operacional).",
        icone: "fa-hourglass-half",
        tipo: "dias",
        grupo: "pedidos",
      },
      {
        id: "tempo_medio_aprovacao",
        titulo: "Tempo Médio de Aprovação",
        descricao:
          "Tempo médio entre a solicitação e a aprovação (ou rejeição) dos pedidos.",
        icone: "fa-stopwatch",
        tipo: "periodo",
        grupo: "pedidos",
      },
      {
        id: "pedidos_detalhado",
        titulo: "Pedidos Detalhado (Analítico)",
        descricao:
          "Lista completa de pedidos com filtros de período para análise operacional.",
        icone: "fa-list-alt",
        tipo: "periodo",
        grupo: "pedidos",
      },
      {
        id: "pedidos_reprovados",
        titulo: "Pedidos Reprovados / Cancelados",
        descricao:
          "Análise dos pedidos rejeitados, motivos mais comuns e tempo até rejeição.",
        icone: "fa-times-circle",
        tipo: "periodo",
        grupo: "pedidos",
      },
      {
        id: "estoque_zerado_pendente",
        titulo: "Estoque Zerado c/ Pedido Pendente",
        descricao:
          "Itens sem saldo que já possuem pedido aguardando aprovação (risco de duplicidade).",
        icone: "fa-exclamation-circle",
        tipo: "snapshot",
        grupo: "pedidos",
      },

      // ----------------------------------------------------------
      // GRUPO · FORNECEDORES
      // ----------------------------------------------------------
      {
        id: "ranking_fornecedores",
        titulo: "Ranking de Fornecedores",
        descricao:
          "Fornecedores ordenados por valor contratado e valor consumido no período.",
        icone: "fa-trophy",
        tipo: "periodo_ordenacao",
        grupo: "fornecedores",
      },
      {
        id: "saldo_por_fornecedor",
        titulo: "Saldo por Fornecedor",
        descricao:
          "Quanto cada fornecedor ainda tem disponível para compra (saldo consolidado).",
        icone: "fa-hand-holding-usd",
        tipo: "snapshot",
        grupo: "fornecedores",
      },
      {
        id: "diferenca_precos",
        titulo: "Diferença de Preços",
        descricao:
          "Mesmo item em atas diferentes com preços divergentes (economia potencial).",
        icone: "fa-balance-scale",
        tipo: "snapshot",
        grupo: "fornecedores",
      },

      // ----------------------------------------------------------
      // GRUPO · AUDITORIA
      // ----------------------------------------------------------
      {
        id: "historico_alteracoes",
        titulo: "Histórico de Alterações",
        descricao:
          "Registro de alterações feitas em atas (auditoria de mudanças).",
        icone: "fa-history",
        tipo: "periodo",
        grupo: "auditoria",
      },
      {
        id: "divergencias_saldo",
        titulo: "Divergências de Saldo",
        descricao:
          "Itens cujo saldo real diverge do saldo esperado (contratado - consumido).",
        icone: "fa-exclamation-triangle",
        tipo: "snapshot",
        grupo: "auditoria",
      },
      {
        id: "comparativo_ano_a_ano",
        titulo: "Comparativo Ano a Ano",
        descricao:
          "Comparativo mensal do consumo entre o ano base e o ano anterior.",
        icone: "fa-calendar-alt",
        tipo: "ano_base",
        grupo: "auditoria",
      },
      {
        id: "auditoria_completa",
        titulo: "Auditoria Completa (Timeline)",
        descricao:
          "Timeline unificada de pedidos, aprovações, consumos e alterações.",
        icone: "fa-stream",
        tipo: "periodo",
        grupo: "auditoria",
      },
      {
        id: "concentracao_fornecedores",
        titulo: "Concentração de Fornecedores",
        descricao:
          "Análise de concentração: quantos fornecedores respondem por X% do gasto.",
        icone: "fa-chart-pie",
        tipo: "periodo",
        grupo: "auditoria",
      },
      {
        id: "pedidos_por_orgao",
        titulo: "Pedidos por Órgão",
        descricao:
          "Cruzamento órgão × pedidos: quantidade, valor e ticket médio por órgão.",
        icone: "fa-sitemap",
        tipo: "periodo",
        grupo: "auditoria",
      },
      {
        id: "execucao_media_categoria",
        titulo: "Execução Média por Categoria",
        descricao:
          "Percentual médio de execução das atas, agrupado por categoria.",
        icone: "fa-percentage",
        tipo: "snapshot",
        grupo: "auditoria",
      },
    ];
  }

  // ============================================================
  // CARREGAR CONTEÚDO DA VIEW
  // ============================================================
  async carregarConteudo() {
    const container = document.getElementById("relatoriosContent");
    if (!container) {
      console.warn("[Relatorios] #relatoriosContent não encontrado.");
      return;
    }

    if (!this._htmlCarregado) {
      this.sistema.ui.mostrarSpinner(
        "relatoriosContent",
        "Carregando relatórios...",
      );

      try {
        const response = await fetch("templates/relatorios.html");
        if (!response.ok) {
          throw new Error(
            `Falha ao carregar o template (HTTP ${response.status}).`,
          );
        }
        const html = await response.text();
        container.innerHTML = html;
        this._htmlCarregado = true;
      } catch (err) {
        console.error("[Relatorios] Erro ao carregar template:", err);
        container.innerHTML = `
          <div class="relatorios-empty" style="margin-top: 40px;">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>Não foi possível carregar os relatórios</h4>
            <p>${this._escapeHtml(err.message || "Erro desconhecido.")}</p>
            <p style="margin-top: 10px; font-size: 0.8rem;">
              Verifique se <code>templates/relatorios.html</code> existe e
              se o servidor está rodando.
            </p>
          </div>
        `;
        return;
      }
    }

    if (this.relatorioAtivo) {
      await this._renderizarRelatorio(this.relatorioAtivo);
    } else {
      this.renderizarIndice();
    }

    this._configurarEventosGlobais();
  }

  // ============================================================
  // CONFIGURAR EVENTOS GLOBAIS
  // ============================================================
  _configurarEventosGlobais() {
    const container = document.getElementById("relatoriosContent");
    if (!container || container.dataset.relatoriosInit === "1") return;
    container.dataset.relatoriosInit = "1";

    container.addEventListener("click", async (e) => {
      const card = e.target.closest(".relatorio-card");
      if (card) {
        const id = card.dataset.relatorio;
        if (id) {
          e.preventDefault();
          await this.abrirRelatorio(id);
        }
        return;
      }

      const btnVoltar = e.target.closest(
        "[data-action='voltar-indice'], #btnVoltarRelatorio",
      );
      if (btnVoltar) {
        e.preventDefault();
        this.voltarParaIndice();
        return;
      }

      const btnAplicar = e.target.closest("#btnAplicarRelatorio");
      if (btnAplicar) {
        e.preventDefault();
        this._coletarFiltros();
        await this._renderizarRelatorio(this.relatorioAtivo);
        return;
      }

      const btnCSV = e.target.closest("#btnExportarRelatorioCSV");
      if (btnCSV) {
        e.preventDefault();
        this.exportarCSV();
        return;
      }

      const btnPDF = e.target.closest("#btnExportarRelatorioPDF");
      if (btnPDF) {
        e.preventDefault();
        this.exportarPDF();
        return;
      }
    });
  }

  // ============================================================
  // RENDERIZAR ÍNDICE (cards agrupados)
  // ============================================================
  renderizarIndice() {
    this.relatorioAtivo = null;
    this._destruirGrafico();

    const blocoIndice = document.getElementById("relatoriosIndice");
    const blocoAtivo = document.getElementById("relatoriosAtivo");
    const grid = document.getElementById("relatoriosIndiceGrid");

    if (blocoAtivo) blocoAtivo.style.display = "none";
    if (blocoIndice) blocoIndice.style.display = "block";
    if (!grid) return;

    const gruposHtml = this.GRUPOS.map((grupo) => {
      const relatoriosDoGrupo = this.RELATORIOS.filter(
        (r) => r.grupo === grupo.id,
      );

      if (relatoriosDoGrupo.length === 0) return "";

      const cardsHtml = relatoriosDoGrupo
        .map(
          (r) => `
          <div
            class="relatorio-card"
            data-relatorio="${r.id}"
            data-grupo="${r.grupo}"
            role="button"
            tabindex="0"
            aria-label="Abrir relatório: ${this._escapeHtml(r.titulo)}"
          >
            <div class="relatorio-card-icon">
              <i class="fas ${r.icone}"></i>
            </div>
            <h3 class="relatorio-card-titulo">${this._escapeHtml(r.titulo)}</h3>
            <p class="relatorio-card-descricao">${this._escapeHtml(r.descricao)}</p>
            <i class="fas fa-arrow-right relatorio-card-arrow"></i>
          </div>
        `,
        )
        .join("");

      return `
        <div class="relatorios-grupo" data-grupo="${grupo.id}">
          <div class="relatorios-grupo-header" style="--grupo-cor: ${grupo.cor};">
            <div class="relatorios-grupo-titulo">
              <span class="relatorios-grupo-icone">
                <i class="fas ${grupo.icone}"></i>
              </span>
              <h3>${this._escapeHtml(grupo.titulo)}</h3>
            </div>
            <span class="relatorios-grupo-count">
              ${relatoriosDoGrupo.length}
              ${relatoriosDoGrupo.length === 1 ? "relatório" : "relatórios"}
            </span>
          </div>
          <div class="relatorios-indice-grid">
            ${cardsHtml}
          </div>
        </div>
      `;
    }).join("");

    grid.innerHTML = gruposHtml;

    grid.querySelectorAll(".relatorio-card").forEach((card) => {
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const id = card.dataset.relatorio;
          if (id) this.abrirRelatorio(id);
        }
      });
    });
  }

  // ============================================================
  // ABRIR UM RELATÓRIO
  // ============================================================
  async abrirRelatorio(id) {
    const meta = this.RELATORIOS.find((r) => r.id === id);
    if (!meta) {
      console.warn(`[Relatorios] Relatório desconhecido: ${id}`);
      return;
    }

    this.relatorioAtivo = id;
    this.filtrosAtivos = {};
    this._inicializarFiltrosPadrao(meta);
    await this._renderizarRelatorio(id);
  }

  // ============================================================
  // VOLTAR PARA O ÍNDICE
  // ============================================================
  voltarParaIndice() {
    this.relatorioAtivo = null;
    this.filtrosAtivos = {};
    this.dadosAtuais = [];
    this.colunasAtuais = [];
    this._destruirGrafico();
    this.renderizarIndice();
  }

  // ============================================================
  // INICIALIZAR FILTROS COM VALORES PADRÃO
  // ============================================================
  _inicializarFiltrosPadrao(meta) {
    if (
      meta.tipo === "periodo" ||
      meta.tipo === "periodo_ordenacao" ||
      meta.tipo === "periodo_top"
    ) {
      const { inicio, fim } = this._ultimos30Dias();
      this.filtrosAtivos.dataInicio = inicio;
      this.filtrosAtivos.dataFim = fim;
    } else if (meta.tipo === "dias") {
      this.filtrosAtivos.dias = meta.id === "pedidos_pendentes" ? 7 : 30;
    } else if (meta.tipo === "ano_base") {
      this.filtrosAtivos.anoBase = new Date().getFullYear();
    } else if (meta.tipo === "periodo_agrupamento") {
      const { inicio, fim } = this._ultimos30Dias();
      this.filtrosAtivos.dataInicio = inicio;
      this.filtrosAtivos.dataFim = fim;
      this.filtrosAtivos.agrupamento = "dia";
    }

    if (meta.tipo === "periodo_ordenacao") {
      this.filtrosAtivos.ordenacao = "contratado";
    }
    if (meta.tipo === "periodo_top") {
      this.filtrosAtivos.topo = 10;
    }
  }

  // ============================================================
  // RENDERIZAR UM RELATÓRIO ESPECÍFICO
  // ============================================================
  async _renderizarRelatorio(id) {
    const meta = this.RELATORIOS.find((r) => r.id === id);
    if (!meta) return;

    const blocoIndice = document.getElementById("relatoriosIndice");
    const blocoAtivo = document.getElementById("relatoriosAtivo");
    if (blocoIndice) blocoIndice.style.display = "none";
    if (blocoAtivo) blocoAtivo.style.display = "block";

    const tituloEl = document.getElementById("relatoriosAtivoTitulo");
    if (tituloEl) {
      tituloEl.innerHTML = `
        <i class="fas ${meta.icone}"></i>
        <span class="relatorios-ativo-titulo-texto">${this._escapeHtml(meta.titulo)}</span>
      `;
    }
    const subEl = document.getElementById("relatoriosAtivoSubtitulo");
    if (subEl) subEl.textContent = meta.descricao;

    this._renderizarFiltros(meta);

    const kpisEl = document.getElementById("relatoriosKpis");
    const graficoWrapper = document.getElementById("relatoriosGraficoWrapper");
    const tabelaContainer = document.getElementById(
      "relatoriosTabelaContainer",
    );
    const contador = document.getElementById("relatoriosContador");

    if (kpisEl) kpisEl.style.display = "none";
    if (graficoWrapper) graficoWrapper.style.display = "none";
    if (contador) contador.textContent = "Carregando...";
    if (tabelaContainer) {
      tabelaContainer.innerHTML = `
        <div class="relatorios-loading">
          <i class="fas fa-spinner"></i>
          <p>Carregando resultados...</p>
        </div>
      `;
    }

    this._destruirGrafico();
    this._setExportButtonsEnabled(false);

    try {
      switch (id) {
        // -------- Visão Geral --------
        case "atas_vencendo":
          await this._relAtasVencendo(meta);
          break;
        case "execucao_por_ata":
          await this._relExecucaoPorAta(meta);
          break;
        case "projecao_esgotamento":
          await this._relProjecaoEsgotamento(meta);
          break;
        case "saldo_consolidado_ata":
          await this._relSaldoConsolidadoAta(meta);
          break;

        // -------- Consumo --------
        case "consumo_por_orgao":
          await this._relConsumoPorOrgao(meta);
          break;
        case "consumo_por_categoria":
          await this._relConsumoPorCategoria(meta);
          break;
        case "curva_abc_itens":
          await this._relCurvaAbcItens(meta);
          break;
        case "consumo_por_item":
          await this._relConsumoPorItem(meta);
          break;
        case "consumo_por_solicitante":
          await this._relConsumoPorSolicitante(meta);
          break;
        case "consumo_por_periodo":
          await this._relConsumoPorPeriodo(meta);
          break;

        // -------- Pedidos --------
        case "pedidos_por_status":
          await this._relPedidosPorStatus(meta);
          break;
        case "pedidos_pendentes":
          await this._relPedidosPendentes(meta);
          break;
        case "tempo_medio_aprovacao":
          await this._relTempoMedioAprovacao(meta);
          break;
        case "pedidos_detalhado":
          await this._relPedidosDetalhado(meta);
          break;
        case "pedidos_reprovados":
          await this._relPedidosReprovados(meta);
          break;
        case "estoque_zerado_pendente":
          await this._relEstoqueZeradoPendente(meta);
          break;

        // -------- Fornecedores --------
        case "ranking_fornecedores":
          await this._relRankingFornecedores(meta);
          break;
        case "saldo_por_fornecedor":
          await this._relSaldoPorFornecedor(meta);
          break;
        case "diferenca_precos":
          await this._relDiferencaPrecos(meta);
          break;

        // -------- Auditoria --------
        case "historico_alteracoes":
          await this._relHistoricoAlteracoes(meta);
          break;
        case "divergencias_saldo":
          await this._relDivergenciasSaldo(meta);
          break;
        case "comparativo_ano_a_ano":
          await this._relComparativoAnoAno(meta);
          break;
        case "auditoria_completa":
          await this._relAuditoriaCompleta(meta);
          break;
        case "concentracao_fornecedores":
          await this._relConcentracaoFornecedores(meta);
          break;
        case "pedidos_por_orgao":
          await this._relPedidosPorOrgao(meta);
          break;
        case "execucao_media_categoria":
          await this._relExecucaoMediaCategoria(meta);
          break;

        default:
          throw new Error(`Relatório não implementado: ${id}`);
      }

      this._setExportButtonsEnabled(this.dadosAtuais.length > 0);
    } catch (err) {
      console.error(`[Relatorios] Erro ao carregar "${id}":`, err);
      if (tabelaContainer) {
        tabelaContainer.innerHTML = `
          <div class="relatorios-empty">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>Erro ao carregar relatório</h4>
            <p>${this._escapeHtml(err.message || "Erro desconhecido.")}</p>
          </div>
        `;
      }
      if (contador) contador.textContent = "Erro";
      this._setExportButtonsEnabled(false);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro no relatório",
        err.message || "Não foi possível carregar o relatório.",
      );
    }
  }

  // ============================================================
  // RENDERIZAR FILTROS
  // ============================================================
  _renderizarFiltros(meta) {
    const wrap = document.getElementById("relatoriosFiltros");
    if (!wrap) return;

    let html = "";

    if (
      meta.tipo === "periodo" ||
      meta.tipo === "periodo_ordenacao" ||
      meta.tipo === "periodo_agrupamento" ||
      meta.tipo === "periodo_top"
    ) {
      html += `
        <div class="filtro-grupo">
          <label class="filtro-label">
            <i class="fas fa-calendar-alt"></i> Período
          </label>
          <div class="relatorio-filtro-datas">
            <input
              type="date"
              id="relatorioFiltroDataInicio"
              value="${this.filtrosAtivos.dataInicio || ""}"
            />
            <span class="filtro-data-separador">até</span>
            <input
              type="date"
              id="relatorioFiltroDataFim"
              value="${this.filtrosAtivos.dataFim || ""}"
            />
          </div>
        </div>
      `;
    }

    if (meta.tipo === "dias") {
      let sufixo = "dias";
      if (meta.id === "pedidos_pendentes") sufixo = "dias parado";
      else if (meta.id === "projecao_esgotamento")
        sufixo = "dias (janela de cálculo)";

      html += `
        <div class="filtro-grupo">
          <label class="filtro-label">
            <i class="fas fa-clock"></i> Filtro
          </label>
          <div class="relatorio-filtro-dias">
            <input
              type="number"
              id="relatorioFiltroDias"
              min="1"
              max="9999"
              step="1"
              value="${this.filtrosAtivos.dias || 30}"
            />
            <span class="relatorio-filtro-sufixo">${sufixo}</span>
          </div>
        </div>
      `;
    }

    if (meta.tipo === "periodo_ordenacao") {
      html += `
        <div class="filtro-grupo">
          <label class="filtro-label">
            <i class="fas fa-sort"></i> Ordenar por
          </label>
          <select id="relatorioFiltroOrdenacao">
            <option value="contratado" ${
              this.filtrosAtivos.ordenacao === "contratado" ? "selected" : ""
            }>Valor contratado</option>
            <option value="consumido" ${
              this.filtrosAtivos.ordenacao === "consumido" ? "selected" : ""
            }>Valor consumido</option>
            <option value="atas" ${
              this.filtrosAtivos.ordenacao === "atas" ? "selected" : ""
            }>Nº de atas</option>
          </select>
        </div>
      `;
    }

    if (meta.tipo === "ano_base") {
      const anoAtual = new Date().getFullYear();
      const anoBase = this.filtrosAtivos.anoBase || anoAtual;
      let options = "";
      for (let i = 0; i < 6; i++) {
        const ano = anoAtual - i;
        options += `<option value="${ano}" ${
          ano === anoBase ? "selected" : ""
        }>${ano}</option>`;
      }

      html += `
        <div class="filtro-grupo">
          <label class="filtro-label">
            <i class="fas fa-calendar-check"></i> Ano base
          </label>
          <select id="relatorioFiltroAnoBase">
            ${options}
          </select>
        </div>
      `;
    }

    if (meta.tipo === "periodo_agrupamento") {
      html += `
        <div class="filtro-grupo">
          <label class="filtro-label">
            <i class="fas fa-layer-group"></i> Agrupar por
          </label>
          <select id="relatorioFiltroAgrupamento">
            <option value="dia" ${
              this.filtrosAtivos.agrupamento === "dia" ? "selected" : ""
            }>Dia</option>
            <option value="semana" ${
              this.filtrosAtivos.agrupamento === "semana" ? "selected" : ""
            }>Semana</option>
            <option value="mes" ${
              this.filtrosAtivos.agrupamento === "mes" ? "selected" : ""
            }>Mês</option>
          </select>
        </div>
      `;
    }

    if (meta.tipo === "periodo_top") {
      html += `
        <div class="filtro-grupo">
          <label class="filtro-label">
            <i class="fas fa-list-ol"></i> Top
          </label>
          <select id="relatorioFiltroTopo">
            <option value="5" ${
              this.filtrosAtivos.topo === 5 ? "selected" : ""
            }>Top 5</option>
            <option value="10" ${
              this.filtrosAtivos.topo === 10 ? "selected" : ""
            }>Top 10</option>
            <option value="15" ${
              this.filtrosAtivos.topo === 15 ? "selected" : ""
            }>Top 15</option>
            <option value="20" ${
              this.filtrosAtivos.topo === 20 ? "selected" : ""
            }>Top 20</option>
          </select>
        </div>
      `;
    }

    if (meta.tipo === "snapshot") {
      html += `
        <div class="filtro-grupo" style="flex: 1; min-width: 200px;">
          <label class="filtro-label">
            <i class="fas fa-info-circle"></i> Info
          </label>
          <div style="font-size: 0.8rem; color: var(--neutral-500); padding: 8px 0;">
            Este relatório é um <strong>snapshot atual</strong> — não usa filtro de data.
            Clique em <strong>Atualizar</strong> para recalcular.
          </div>
        </div>
      `;
    }

    html += `
      <div class="relatorio-filtro-acoes">
        <button
          type="button"
          class="btn-aplicar-relatorio"
          id="btnAplicarRelatorio"
        >
          <i class="fas fa-sync-alt"></i>
          <span>Atualizar</span>
        </button>
      </div>
    `;

    wrap.innerHTML = html;

    wrap.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._coletarFiltros();
          this._renderizarRelatorio(this.relatorioAtivo);
        }
      });
    });
  }

  // ============================================================
  // COLETAR FILTROS DO DOM
  // ============================================================
  _coletarFiltros() {
    const dataInicio = document.getElementById("relatorioFiltroDataInicio");
    const dataFim = document.getElementById("relatorioFiltroDataFim");
    const dias = document.getElementById("relatorioFiltroDias");
    const ordenacao = document.getElementById("relatorioFiltroOrdenacao");
    const anoBase = document.getElementById("relatorioFiltroAnoBase");
    const agrupamento = document.getElementById("relatorioFiltroAgrupamento");
    const topo = document.getElementById("relatorioFiltroTopo");

    if (dataInicio) this.filtrosAtivos.dataInicio = dataInicio.value || null;
    if (dataFim) this.filtrosAtivos.dataFim = dataFim.value || null;
    if (dias) {
      const v = parseInt(dias.value);
      this.filtrosAtivos.dias = isNaN(v) || v <= 0 ? 30 : v;
    }
    if (ordenacao)
      this.filtrosAtivos.ordenacao = ordenacao.value || "contratado";
    if (anoBase) {
      const v = parseInt(anoBase.value);
      if (!isNaN(v)) this.filtrosAtivos.anoBase = v;
    }
    if (agrupamento)
      this.filtrosAtivos.agrupamento = agrupamento.value || "dia";
    if (topo) {
      const v = parseInt(topo.value);
      if (!isNaN(v)) this.filtrosAtivos.topo = v;
    }
  }

  // ============================================================
  // HELPERS · DATAS
  // ============================================================
  _hoje() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  _ultimos30Dias() {
    const fim = this._hoje();
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - 30);
    return {
      inicio: this._toISODate(inicio),
      fim: this._toISODate(fim),
    };
  }

  _toISODate(d) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  _diffDias(dataISO) {
    if (!dataISO) return null;
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    const ms = d.getTime() - this._hoje().getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  // ============================================================
  // HELPERS · ESCAPE HTML
  // ============================================================
  _escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============================================================
  // HELPERS · KPIs / GRÁFICO / TABELA
  // ============================================================
  _renderizarKpis(kpis) {
    const wrap = document.getElementById("relatoriosKpis");
    if (!wrap) return;

    if (!kpis || kpis.length === 0) {
      wrap.style.display = "none";
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = kpis
      .map(
        (k) => `
        <div class="kpi-relatorio kpi-${k.cor || "info"}">
          <span class="kpi-relatorio-valor">${k.valor}</span>
          <span class="kpi-relatorio-label">${this._escapeHtml(k.label)}</span>
        </div>
      `,
      )
      .join("");

    wrap.style.display = "grid";
  }

  _destruirGrafico() {
    if (this.graficoAtual) {
      try {
        this.graficoAtual.destroy();
      } catch (e) {
        /* silencioso */
      }
      this.graficoAtual = null;
    }
  }

  _renderizarGrafico(opts) {
    const wrapper = document.getElementById("relatoriosGraficoWrapper");
    const body = document.getElementById("relatoriosGraficoBody");
    const tituloEl = document.getElementById("relatoriosGraficoTitulo");
    if (!wrapper || !body) return;

    if (!opts || !opts.labels || opts.labels.length === 0) {
      wrapper.style.display = "none";
      body.innerHTML = "";
      return;
    }

    if (tituloEl) {
      tituloEl.innerHTML = `<i class="fas fa-chart-pie"></i> ${this._escapeHtml(
        opts.titulo || "Visualização",
      )}`;
    }

    wrapper.style.display = "block";
    body.innerHTML = `<canvas id="relatoriosGraficoCanvas"></canvas>`;

    if (typeof window.Chart === "undefined") {
      body.innerHTML = `
        <div class="relatorios-empty">
          <i class="fas fa-chart-bar"></i>
          <h4>Chart.js não carregado</h4>
          <p>Recarregue a página (Ctrl+F5) para visualizar o gráfico.</p>
        </div>
      `;
      return;
    }

    const canvas = document.getElementById("relatoriosGraficoCanvas");
    if (!canvas) return;

    const cores =
      opts.cores && opts.cores.length
        ? opts.cores
        : [
            "#0d5e3a",
            "#1a3a6b",
            "#059669",
            "#d97706",
            "#dc2626",
            "#7c3aed",
            "#0891b2",
            "#b45309",
            "#be185d",
            "#65a30d",
          ];

    const isHorizontal = opts.tipo === "bar-horizontal";
    const isDoughnut = opts.tipo === "doughnut";
    const isLine = opts.tipo === "line";
    const chartType = isDoughnut ? "doughnut" : isLine ? "line" : "bar";

    const ctx = canvas.getContext("2d");
    const self = this;
    const formatter = opts.tooltipFormatter || ((v) => v);

    let datasets;
    if (opts.datasets && Array.isArray(opts.datasets)) {
      datasets = opts.datasets;
    } else {
      datasets = [
        {
          data: opts.dados,
          backgroundColor: isDoughnut
            ? opts.labels.map((_, i) => cores[i % cores.length])
            : isHorizontal
              ? opts.labels.map((_, i) => cores[i % cores.length])
              : isLine
                ? "rgba(13, 94, 58, 0.1)"
                : ["#0d5e3a"],
          borderColor: isDoughnut
            ? "white"
            : isLine
              ? "#0d5e3a"
              : "transparent",
          borderWidth: isDoughnut ? 2 : isLine ? 2 : 0,
          borderRadius: isDoughnut ? 4 : isLine ? 0 : 6,
          borderSkipped: false,
          fill: isLine,
          tension: isLine ? 0.3 : undefined,
          pointBackgroundColor: isLine ? "#0d5e3a" : undefined,
          pointBorderColor: isLine ? "white" : undefined,
          pointBorderWidth: isLine ? 2 : undefined,
          pointRadius: isLine ? 4 : undefined,
        },
      ];
    }

    this.graficoAtual = new window.Chart(ctx, {
      type: chartType,
      data: {
        labels: opts.labels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHorizontal ? "y" : "x",
        cutout: isDoughnut ? "55%" : undefined,
        plugins: {
          legend: {
            display: isDoughnut || isLine,
            position: "bottom",
            labels: {
              padding: 12,
              usePointStyle: true,
              pointStyle: "circle",
              font: { size: 11, weight: "600" },
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let value;
                if (isDoughnut) value = context.parsed;
                else if (isLine) value = context.parsed.y;
                else value = context.parsed[isHorizontal ? "x" : "y"];
                return formatter(value);
              },
            },
          },
        },
        scales: isDoughnut
          ? {}
          : {
              x: {
                beginAtZero: true,
                ticks: {
                  callback: function (value) {
                    return isHorizontal
                      ? self._abreviarNumero(value)
                      : self._truncarLabel(value);
                  },
                  font: { size: 10 },
                },
                grid: { display: false },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function (value) {
                    return isHorizontal || isLine
                      ? self._abreviarNumero(value)
                      : self._truncarLabel(value);
                  },
                  font: { size: 10 },
                },
                grid: { color: "rgba(0,0,0,0.04)" },
              },
            },
      },
    });
  }

  _abreviarNumero(v) {
    if (typeof v !== "number") return v;
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (abs >= 1_000) return (v / 1_000).toFixed(1) + "k";
    return v;
  }

  _truncarLabel(v) {
    const s = String(v);
    return s.length > 20 ? s.slice(0, 18) + "…" : s;
  }

  _renderizarTabela(linhas, colunas) {
    const container = document.getElementById("relatoriosTabelaContainer");
    const contador = document.getElementById("relatoriosContador");

    if (!container) return;

    if (!linhas || linhas.length === 0) {
      container.innerHTML = `
        <div class="relatorios-empty">
          <i class="fas fa-inbox"></i>
          <h4>Nenhum registro encontrado</h4>
          <p>Não há dados para os filtros selecionados.</p>
        </div>
      `;
      if (contador) contador.textContent = "Nenhum registro encontrado";
      return;
    }

    const headHtml = colunas
      .map(
        (c) =>
          `<th style="text-align:${
            c.align === "right"
              ? "right"
              : c.align === "center"
                ? "center"
                : "left"
          }">${this._escapeHtml(c.label)}</th>`,
      )
      .join("");

    const bodyHtml = linhas
      .map((linha) => {
        const tds = colunas
          .map((c) => {
            const raw = linha[c.key];
            const rendered = c.formato
              ? c.formato(raw, linha)
              : this._escapeHtml(raw ?? "");
            const align =
              c.align === "right"
                ? "right"
                : c.align === "center"
                  ? "center"
                  : "left";
            const cls = c.classe ? ` ${c.classe}` : "";
            return `<td style="text-align:${align}" class="${cls.trim()}">${rendered}</td>`;
          })
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");

    container.innerHTML = `
      <table class="tabela-itens">
        <thead>
          <tr>${headHtml}</tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    `;

    if (contador) {
      contador.innerHTML = `<strong>${linhas.length}</strong> ${
        linhas.length === 1 ? "registro encontrado" : "registros encontrados"
      }`;
    }
  }

  _setExportButtonsEnabled(enabled) {
    const btnCSV = document.getElementById("btnExportarRelatorioCSV");
    const btnPDF = document.getElementById("btnExportarRelatorioPDF");
    if (btnCSV) btnCSV.disabled = !enabled;
    if (btnPDF) btnPDF.disabled = !enabled;
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 01 · ATAS VENCENDO EM X DIAS
  // ============================================================
  // ============================================================
  async _relAtasVencendo(meta) {
    const dias = this.filtrosAtivos.dias || 30;

    const hoje = this._hoje();
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + dias);

    const { data: atas, error } = await supabase
      .from("atas")
      .select(
        `
        id,
        numero_ata,
        modalidade,
        processo_administrativo,
        data_fim_vigencia,
        valor_global,
        situacao,
        fornecedor:fornecedores(razao_social, cnpj)
      `,
      )
      .gte("data_fim_vigencia", this._toISODate(hoje))
      .lte("data_fim_vigencia", this._toISODate(limite))
      .in("situacao", ["ATIVA", "PROXIMA"])
      .order("data_fim_vigencia", { ascending: true });

    if (error) throw error;

    const atasIds = (atas || []).map((a) => a.id);
    let saldoPorAta = {};

    if (atasIds.length > 0) {
      const [itensRes, consumosRes] = await Promise.all([
        supabase
          .from("itens_ata")
          .select("ata_id, valor_total")
          .in("ata_id", atasIds),
        supabase
          .from("consumos")
          .select("ata_id, valor_total")
          .in("ata_id", atasIds),
      ]);

      const contratadoPorAta = {};
      (itensRes.data || []).forEach((i) => {
        contratadoPorAta[i.ata_id] =
          (contratadoPorAta[i.ata_id] || 0) + (i.valor_total || 0);
      });

      const consumidoPorAta = {};
      (consumosRes.data || []).forEach((c) => {
        consumidoPorAta[c.ata_id] =
          (consumidoPorAta[c.ata_id] || 0) + (c.valor_total || 0);
      });

      saldoPorAta = {};
      atasIds.forEach((id) => {
        const contratado = contratadoPorAta[id] || 0;
        const consumido = consumidoPorAta[id] || 0;
        saldoPorAta[id] = Math.max(0, contratado - consumido);
      });
    }

    const linhas = (atas || []).map((a) => {
      const diasRestantes = this._diffDias(a.data_fim_vigencia);
      return {
        id: a.id,
        numero_ata: a.numero_ata || "N/I",
        modalidade: a.modalidade || "N/I",
        fornecedor: a.fornecedor?.razao_social || "N/I",
        cnpj: this.sistema.ui.formatarDocumento(a.fornecedor?.cnpj || ""),
        data_fim_vigencia: a.data_fim_vigencia,
        dias_restantes: diasRestantes,
        valor_global: a.valor_global || 0,
        saldo: saldoPorAta[a.id] || 0,
        situacao: a.situacao || "ATIVA",
      };
    });

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_ata", label: "Ata" },
      { key: "modalidade", label: "Modalidade" },
      { key: "fornecedor", label: "Fornecedor" },
      {
        key: "data_fim_vigencia",
        label: "Vigência Fim",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
      {
        key: "dias_restantes",
        label: "Dias Restantes",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n <= 15 ? "destaque-erro" : n <= 30 ? "destaque-aviso" : "";
          return `<span class="${cls}">${n}</span>`;
        },
      },
      {
        key: "valor_global",
        label: "Valor Global",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "saldo",
        label: "Saldo",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "situacao",
        label: "Situação",
        align: "center",
        formato: (v) => {
          const cls =
            v === "ATIVA"
              ? "status-ativa"
              : v === "PROXIMA"
                ? "status-proxima"
                : "status-vencida";
          return `<span class="status-badge ${cls}">${v}</span>`;
        },
      },
    ];

    const totalAtas = linhas.length;
    const valorTotal = linhas.reduce((s, l) => s + l.valor_global, 0);
    const saldoTotal = linhas.reduce((s, l) => s + l.saldo, 0);
    const mediaDias = totalAtas
      ? Math.round(
          linhas.reduce((s, l) => s + (l.dias_restantes || 0), 0) / totalAtas,
        )
      : 0;

    this._renderizarKpis([
      { label: "Atas no Período", valor: totalAtas, cor: "aviso" },
      {
        label: "Valor Global Somado",
        valor: this.sistema.ui.formatarMoeda(valorTotal),
        cor: "info",
      },
      {
        label: "Saldo Disponível",
        valor: this.sistema.ui.formatarMoeda(saldoTotal),
        cor: "sucesso",
      },
      {
        label: "Média de Dias Restantes",
        valor: mediaDias + " dias",
        cor: "erro",
      },
    ]);

    const topUrgentes = [...linhas]
      .sort((a, b) => (a.dias_restantes || 0) - (b.dias_restantes || 0))
      .slice(0, 5);

    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 5 · Mais Urgentes",
      labels: topUrgentes.map((l) => l.numero_ata),
      dados: topUrgentes.map((l) => l.dias_restantes || 0),
      cores: ["#dc2626", "#ea580c", "#d97706", "#f59e0b", "#fbbf24"],
      tooltipFormatter: (v) => `${v} dias restantes`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 02 · EXECUÇÃO POR ATA
  // ============================================================
  // ============================================================
  async _relExecucaoPorAta(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let atasQuery = supabase.from("atas").select(
      `
        id,
        numero_ata,
        modalidade,
        valor_global,
        data_inicio_vigencia,
        data_fim_vigencia,
        situacao,
        fornecedor:fornecedores(razao_social)
      `,
    );

    if (inicio) atasQuery = atasQuery.gte("data_inicio_vigencia", inicio);
    if (fim) atasQuery = atasQuery.lte("data_inicio_vigencia", fim);

    const { data: atas, error: atasErr } = await atasQuery;
    if (atasErr) throw atasErr;

    const atasIds = (atas || []).map((a) => a.id);
    if (atasIds.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const [itensRes, consumosRes] = await Promise.all([
      supabase
        .from("itens_ata")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
      supabase
        .from("consumos")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
    ]);

    const contratadoPorAta = {};
    (itensRes.data || []).forEach((i) => {
      contratadoPorAta[i.ata_id] =
        (contratadoPorAta[i.ata_id] || 0) + (i.valor_total || 0);
    });

    const consumidoPorAta = {};
    (consumosRes.data || []).forEach((c) => {
      consumidoPorAta[c.ata_id] =
        (consumidoPorAta[c.ata_id] || 0) + (c.valor_total || 0);
    });

    const linhas = (atas || [])
      .map((a) => {
        const contratado = contratadoPorAta[a.id] || 0;
        const consumido = consumidoPorAta[a.id] || 0;
        const saldo = Math.max(0, contratado - consumido);
        const percentual = contratado > 0 ? (consumido / contratado) * 100 : 0;
        return {
          id: a.id,
          numero_ata: a.numero_ata || "N/I",
          modalidade: a.modalidade || "N/I",
          fornecedor: a.fornecedor?.razao_social || "N/I",
          situacao: a.situacao || "ATIVA",
          data_inicio_vigencia: a.data_inicio_vigencia,
          data_fim_vigencia: a.data_fim_vigencia,
          valor_contratado: contratado,
          valor_consumido: consumido,
          saldo,
          percentual_execucao: percentual,
        };
      })
      .filter((l) => l.valor_contratado > 0)
      .sort((a, b) => b.percentual_execucao - a.percentual_execucao);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_ata", label: "Ata" },
      { key: "modalidade", label: "Modalidade" },
      { key: "fornecedor", label: "Fornecedor" },
      {
        key: "valor_contratado",
        label: "Contratado",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "valor_consumido",
        label: "Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "saldo",
        label: "Saldo",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual_execucao",
        label: "% Execução",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 90
              ? "destaque-erro"
              : n >= 70
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
      {
        key: "situacao",
        label: "Situação",
        align: "center",
        formato: (v) => {
          const cls =
            v === "ATIVA"
              ? "status-ativa"
              : v === "PROXIMA"
                ? "status-proxima"
                : "status-vencida";
          return `<span class="status-badge ${cls}">${v}</span>`;
        },
      },
    ];

    const totalAtas = linhas.length;
    const totalContratado = linhas.reduce((s, l) => s + l.valor_contratado, 0);
    const totalConsumido = linhas.reduce((s, l) => s + l.valor_consumido, 0);
    const percentualGeral =
      totalContratado > 0 ? (totalConsumido / totalContratado) * 100 : 0;

    this._renderizarKpis([
      { label: "Atas no Período", valor: totalAtas, cor: "info" },
      {
        label: "Total Contratado",
        valor: this.sistema.ui.formatarMoeda(totalContratado),
        cor: "sucesso",
      },
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalConsumido),
        cor: "aviso",
      },
      {
        label: "Execução Geral",
        valor: `${percentualGeral.toFixed(1)}%`,
        cor: percentualGeral >= 80 ? "erro" : "info",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Atas mais Executadas",
      labels: top10.map((l) => l.numero_ata),
      dados: top10.map((l) => l.percentual_execucao),
      cores: top10.map((l) =>
        l.percentual_execucao >= 90
          ? "#dc2626"
          : l.percentual_execucao >= 70
            ? "#d97706"
            : "#059669",
      ),
      tooltipFormatter: (v) => `${Number(v).toFixed(1)}% executado`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 03 · PROJEÇÃO DE ESGOTAMENTO
  // ============================================================
  // ============================================================
  async _relProjecaoEsgotamento(meta) {
    const dias = this.filtrosAtivos.dias || 30;

    const dataInicio = new Date(this._hoje());
    dataInicio.setDate(dataInicio.getDate() - dias);
    const dataInicioISO = this._toISODate(dataInicio);

    const { data: consumos, error: consErr } = await supabase
      .from("consumos")
      .select("item_ata_id, quantidade")
      .gte("data_consumo", dataInicioISO);

    if (consErr) throw consErr;

    const consumoPorItem = {};
    (consumos || []).forEach((c) => {
      if (!c.item_ata_id) return;
      consumoPorItem[c.item_ata_id] =
        (consumoPorItem[c.item_ata_id] || 0) + (c.quantidade || 0);
    });

    const itensComConsumo = Object.keys(consumoPorItem);
    if (itensComConsumo.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const { data: itens, error: itensErr } = await supabase
      .from("itens_ata")
      .select(
        `
        id,
        item_numero,
        descricao,
        saldo_quantidade,
        valor_unitario,
        ata_id,
        ata:atas(numero_ata, modalidade, situacao)
      `,
      )
      .in("id", itensComConsumo)
      .gt("saldo_quantidade", 0);

    if (itensErr) throw itensErr;

    const hoje = this._hoje();
    const linhas = (itens || [])
      .map((item) => {
        const consumidoNaJanela = consumoPorItem[item.id] || 0;
        const mediaDiaria = consumidoNaJanela / dias;
        const saldo = item.saldo_quantidade || 0;

        if (mediaDiaria <= 0 || saldo <= 0) return null;

        const diasAteEsgotar = Math.round(saldo / mediaDiaria);
        const dataEsgotamento = new Date(hoje);
        dataEsgotamento.setDate(dataEsgotamento.getDate() + diasAteEsgotar);

        return {
          id: item.id,
          ata: item.ata?.numero_ata || "N/I",
          item_numero: item.item_numero || "—",
          descricao: item.descricao || "—",
          saldo_atual: saldo,
          consumo_janela: consumidoNaJanela,
          media_diaria: mediaDiaria,
          dias_ate_esgotar: diasAteEsgotar,
          data_prevista: this._toISODate(dataEsgotamento),
          valor_unitario: item.valor_unitario || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dias_ate_esgotar - b.dias_ate_esgotar);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "ata", label: "Ata", align: "center" },
      { key: "item_numero", label: "Item", align: "center" },
      {
        key: "descricao",
        label: "Descrição",
        formato: (v) => this._escapeHtml((v || "").slice(0, 60)),
      },
      {
        key: "saldo_atual",
        label: "Saldo Atual",
        align: "right",
      },
      {
        key: "consumo_janela",
        label: `Consumo ${dias}d`,
        align: "right",
      },
      {
        key: "media_diaria",
        label: "Média/dia",
        align: "right",
        formato: (v) => Number(v).toFixed(2),
      },
      {
        key: "dias_ate_esgotar",
        label: "Dias até Esgotar",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n <= 15
              ? "destaque-erro"
              : n <= 30
                ? "destaque-aviso"
                : n <= 90
                  ? "destaque-info"
                  : "destaque-sucesso";
          return `<span class="${cls}">${n} dias</span>`;
        },
      },
      {
        key: "data_prevista",
        label: "Data Prevista",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
    ];

    const totalItens = linhas.length;
    const esgota30 = linhas.filter((l) => l.dias_ate_esgotar <= 30).length;
    const esgota60 = linhas.filter(
      (l) => l.dias_ate_esgotar > 30 && l.dias_ate_esgotar <= 60,
    ).length;
    const esgota90 = linhas.filter(
      (l) => l.dias_ate_esgotar > 60 && l.dias_ate_esgotar <= 90,
    ).length;

    this._renderizarKpis([
      { label: "Itens Analisados", valor: totalItens, cor: "info" },
      { label: "Esgotam em 30d", valor: esgota30, cor: "erro" },
      { label: "Entre 31 e 60d", valor: esgota60, cor: "aviso" },
      { label: "Entre 61 e 90d", valor: esgota90, cor: "sucesso" },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Urgência de Esgotamento",
      labels: top10.map((l) => `${l.ata} · ${l.item_numero}`),
      dados: top10.map((l) => l.dias_ate_esgotar),
      cores: top10.map((l) =>
        l.dias_ate_esgotar <= 15
          ? "#dc2626"
          : l.dias_ate_esgotar <= 30
            ? "#ea580c"
            : l.dias_ate_esgotar <= 60
              ? "#d97706"
              : "#f59e0b",
      ),
      tooltipFormatter: (v) => `${v} dias até esgotar`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 04 · SALDO CONSOLIDADO POR ATA
  // ============================================================
  // ============================================================
  async _relSaldoConsolidadoAta(meta) {
    const { data: atas, error: atasErr } = await supabase
      .from("atas")
      .select(
        `
        id,
        numero_ata,
        modalidade,
        valor_global,
        data_inicio_vigencia,
        data_fim_vigencia,
        situacao,
        fornecedor:fornecedores(razao_social)
      `,
      )
      .in("situacao", ["ATIVA", "PROXIMA"])
      .order("numero_ata");

    if (atasErr) throw atasErr;

    const atasIds = (atas || []).map((a) => a.id);
    if (atasIds.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const [itensRes, consumosRes] = await Promise.all([
      supabase
        .from("itens_ata")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
      supabase
        .from("consumos")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
    ]);

    const contratadoPorAta = {};
    (itensRes.data || []).forEach((i) => {
      contratadoPorAta[i.ata_id] =
        (contratadoPorAta[i.ata_id] || 0) + (i.valor_total || 0);
    });

    const consumidoPorAta = {};
    (consumosRes.data || []).forEach((c) => {
      consumidoPorAta[c.ata_id] =
        (consumidoPorAta[c.ata_id] || 0) + (c.valor_total || 0);
    });

    const linhas = (atas || []).map((a) => {
      const contratado = contratadoPorAta[a.id] || 0;
      const consumido = consumidoPorAta[a.id] || 0;
      const saldo = Math.max(0, contratado - consumido);
      const percentual = contratado > 0 ? (consumido / contratado) * 100 : 0;

      const diasRestantes = this._diffDias(a.data_fim_vigencia);

      return {
        id: a.id,
        numero_ata: a.numero_ata || "N/I",
        modalidade: a.modalidade || "N/I",
        fornecedor: a.fornecedor?.razao_social || "N/I",
        situacao: a.situacao || "ATIVA",
        valor_contratado: contratado,
        valor_consumido: consumido,
        saldo,
        percentual_execucao: percentual,
        dias_restantes: diasRestantes,
      };
    });

    linhas.sort((a, b) => b.saldo - a.saldo);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_ata", label: "Ata" },
      { key: "modalidade", label: "Modalidade" },
      { key: "fornecedor", label: "Fornecedor" },
      {
        key: "valor_contratado",
        label: "Contratado",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "valor_consumido",
        label: "Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "saldo",
        label: "Saldo",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual_execucao",
        label: "% Execução",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 90
              ? "destaque-erro"
              : n >= 70
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
      {
        key: "dias_restantes",
        label: "Dias Restantes",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n <= 15 ? "destaque-erro" : n <= 30 ? "destaque-aviso" : "";
          return `<span class="${cls}">${n}</span>`;
        },
      },
      {
        key: "situacao",
        label: "Situação",
        align: "center",
        formato: (v) => {
          const cls =
            v === "ATIVA"
              ? "status-ativa"
              : v === "PROXIMA"
                ? "status-proxima"
                : "status-vencida";
          return `<span class="status-badge ${cls}">${v}</span>`;
        },
      },
    ];

    const totalAtas = linhas.length;
    const totalContratado = linhas.reduce((s, l) => s + l.valor_contratado, 0);
    const totalConsumido = linhas.reduce((s, l) => s + l.valor_consumido, 0);
    const saldoGeral = linhas.reduce((s, l) => s + l.saldo, 0);
    const percentualGeral =
      totalContratado > 0 ? (totalConsumido / totalContratado) * 100 : 0;

    this._renderizarKpis([
      { label: "Atas Ativas", valor: totalAtas, cor: "info" },
      {
        label: "Total Contratado",
        valor: this.sistema.ui.formatarMoeda(totalContratado),
        cor: "sucesso",
      },
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalConsumido),
        cor: "aviso",
      },
      {
        label: "Saldo Consolidado",
        valor: this.sistema.ui.formatarMoeda(saldoGeral),
        cor: percentualGeral >= 80 ? "erro" : "sucesso",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Maiores Saldos",
      labels: top10.map((l) => l.numero_ata),
      dados: top10.map((l) => l.saldo),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 05 · CONSUMO POR ÓRGÃO
  // ============================================================
  // ============================================================
  async _relConsumoPorOrgao(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("consumos")
      .select(
        `
        quantidade,
        valor_total,
        orgao_solicitante_id,
        orgaos:orgao_solicitante_id(id, nome, sigla, cnpj)
      `,
      )
      .order("data_consumo", { ascending: false });

    if (inicio) query = query.gte("data_consumo", inicio);
    if (fim) query = query.lte("data_consumo", fim);

    const { data: consumos, error } = await query;
    if (error) throw error;

    const agrupado = {};
    (consumos || []).forEach((c) => {
      const org = c.orgaos;
      const id = c.orgao_solicitante_id;
      if (!id) return;
      if (!agrupado[id]) {
        agrupado[id] = {
          id,
          nome: org?.nome || "Órgão não identificado",
          sigla: org?.sigla || "",
          qtd_consumos: 0,
          valor_consumido: 0,
        };
      }
      agrupado[id].qtd_consumos += 1;
      agrupado[id].valor_consumido += c.valor_total || 0;
    });

    const linhasBrutas = Object.values(agrupado).sort(
      (a, b) => b.valor_consumido - a.valor_consumido,
    );

    const totalGeral = linhasBrutas.reduce((s, l) => s + l.valor_consumido, 0);

    const linhas = linhasBrutas.map((l) => ({
      ...l,
      percentual: totalGeral > 0 ? (l.valor_consumido / totalGeral) * 100 : 0,
    }));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "nome", label: "Órgão" },
      { key: "sigla", label: "Sigla", align: "center" },
      {
        key: "qtd_consumos",
        label: "Qtd Consumos",
        align: "right",
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual",
        label: "% do Total",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
    ];

    const totalOrgaos = linhas.length;
    const ticketMedio = totalOrgaos > 0 ? totalGeral / totalOrgaos : 0;
    const topOrgao = linhas[0];

    this._renderizarKpis([
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalGeral),
        cor: "info",
      },
      { label: "Órgãos Envolvidos", valor: totalOrgaos, cor: "sucesso" },
      {
        label: "Ticket Médio por Órgão",
        valor: this.sistema.ui.formatarMoeda(ticketMedio),
        cor: "aviso",
      },
      {
        label: "Maior Consumidor",
        valor: topOrgao ? topOrgao.sigla || topOrgao.nome : "—",
        cor: "erro",
      },
    ]);

    const top8 = linhas.slice(0, 8);
    this._renderizarGrafico({
      tipo: "doughnut",
      titulo: "Distribuição por Órgão (Top 8)",
      labels: top8.map((l) => l.sigla || l.nome),
      dados: top8.map((l) => l.valor_consumido),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 06 · CONSUMO POR CATEGORIA
  // ============================================================
  // ============================================================
  async _relConsumoPorCategoria(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("consumos")
      .select(
        `
        valor_total,
        ata:atas(
          id,
          categoria:categorias(id, nome)
        )
      `,
      )
      .order("data_consumo", { ascending: false });

    if (inicio) query = query.gte("data_consumo", inicio);
    if (fim) query = query.lte("data_consumo", fim);

    const { data: consumos, error } = await query;
    if (error) throw error;

    const agrupado = {};
    (consumos || []).forEach((c) => {
      const catNome = c.ata?.categoria?.nome || "Sem categoria";
      const catId = c.ata?.categoria?.id || "__sem__";
      if (!agrupado[catId]) {
        agrupado[catId] = {
          id: catId,
          nome: catNome,
          qtd_consumos: 0,
          valor_consumido: 0,
        };
      }
      agrupado[catId].qtd_consumos += 1;
      agrupado[catId].valor_consumido += c.valor_total || 0;
    });

    const linhasBrutas = Object.values(agrupado).sort(
      (a, b) => b.valor_consumido - a.valor_consumido,
    );

    const totalGeral = linhasBrutas.reduce((s, l) => s + l.valor_consumido, 0);

    const linhas = linhasBrutas.map((l) => ({
      ...l,
      percentual: totalGeral > 0 ? (l.valor_consumido / totalGeral) * 100 : 0,
    }));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "nome", label: "Categoria" },
      {
        key: "qtd_consumos",
        label: "Qtd Consumos",
        align: "right",
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual",
        label: "% do Total",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
    ];

    const totalCategorias = linhas.length;
    const topCat = linhas[0];

    this._renderizarKpis([
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalGeral),
        cor: "info",
      },
      { label: "Categorias Ativas", valor: totalCategorias, cor: "sucesso" },
      {
        label: "Categoria Líder",
        valor: topCat ? topCat.nome : "—",
        cor: "aviso",
      },
      {
        label: "% da Líder",
        valor: topCat ? `${topCat.percentual.toFixed(1)}%` : "—",
        cor: "erro",
      },
    ]);

    const top8 = linhas.slice(0, 8);
    this._renderizarGrafico({
      tipo: "bar",
      titulo: "Top 8 Categorias por Consumo",
      labels: top8.map((l) => l.nome),
      dados: top8.map((l) => l.valor_consumido),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 07 · CURVA ABC DE ITENS
  // ============================================================
  // ============================================================
  async _relCurvaAbcItens(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase.from("consumos").select(
      `
        quantidade,
        valor_total,
        item_ata_id,
        item:itens_ata(
          item_numero,
          descricao,
          ata:atas(numero_ata)
        )
      `,
    );

    if (inicio) query = query.gte("data_consumo", inicio);
    if (fim) query = query.lte("data_consumo", fim);

    const { data: consumos, error } = await query;
    if (error) throw error;

    const agrupado = {};
    (consumos || []).forEach((c) => {
      const id = c.item_ata_id;
      if (!id) return;
      if (!agrupado[id]) {
        agrupado[id] = {
          id,
          item_numero: c.item?.item_numero || "—",
          descricao: c.item?.descricao || "—",
          ata: c.item?.ata?.numero_ata || "N/I",
          qtd_consumida: 0,
          valor_consumido: 0,
        };
      }
      agrupado[id].qtd_consumida += c.quantidade || 0;
      agrupado[id].valor_consumido += c.valor_total || 0;
    });

    const linhasBrutas = Object.values(agrupado)
      .filter((l) => l.valor_consumido > 0)
      .sort((a, b) => b.valor_consumido - a.valor_consumido);

    const totalGeral = linhasBrutas.reduce((s, l) => s + l.valor_consumido, 0);

    if (totalGeral === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    let acumulado = 0;
    const linhas = linhasBrutas.map((l) => {
      const percentual = (l.valor_consumido / totalGeral) * 100;
      acumulado += percentual;

      let classe;
      if (acumulado <= 80) classe = "A";
      else if (acumulado <= 95) classe = "B";
      else classe = "C";

      return {
        ...l,
        percentual,
        percentual_acumulado: acumulado,
        classe,
        rank: 0,
      };
    });

    linhas.forEach((l, i) => (l.rank = i + 1));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "rank", label: "#", align: "center" },
      { key: "ata", label: "Ata", align: "center" },
      { key: "item_numero", label: "Item", align: "center" },
      {
        key: "descricao",
        label: "Descrição",
        formato: (v) => this._escapeHtml((v || "").slice(0, 60)),
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual",
        label: "% do Total",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
      {
        key: "percentual_acumulado",
        label: "% Acumulado",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
      {
        key: "classe",
        label: "Classe",
        align: "center",
        formato: (v) => {
          const cls =
            v === "A"
              ? "destaque-erro"
              : v === "B"
                ? "destaque-aviso"
                : "destaque-info";
          return `<span class="${cls}"><strong>${v}</strong></span>`;
        },
      },
    ];

    const classeA = linhas.filter((l) => l.classe === "A");
    const classeB = linhas.filter((l) => l.classe === "B");
    const classeC = linhas.filter((l) => l.classe === "C");
    const valorA = classeA.reduce((s, l) => s + l.valor_consumido, 0);
    const pctA = totalGeral > 0 ? (valorA / totalGeral) * 100 : 0;

    this._renderizarKpis([
      {
        label: "Classe A (80%)",
        valor: `${classeA.length} itens`,
        cor: "erro",
      },
      {
        label: "Classe B (15%)",
        valor: `${classeB.length} itens`,
        cor: "aviso",
      },
      {
        label: "Classe C (5%)",
        valor: `${classeC.length} itens`,
        cor: "info",
      },
      {
        label: "% do Valor nas A",
        valor: `${pctA.toFixed(1)}%`,
        cor: "sucesso",
      },
    ]);

    const top15 = linhas.slice(0, 15);
    this._renderizarGrafico({
      tipo: "bar",
      titulo: "Top 15 Itens · Valor e % Acumulado",
      labels: top15.map((l) => `${l.item_numero}`),
      datasets: [
        {
          label: "Valor Consumido (R$)",
          data: top15.map((l) => l.valor_consumido),
          backgroundColor: top15.map((l) =>
            l.classe === "A"
              ? "#dc2626"
              : l.classe === "B"
                ? "#d97706"
                : "#0891b2",
          ),
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: "y",
        },
        {
          label: "% Acumulado",
          data: top15.map((l) => l.percentual_acumulado),
          type: "line",
          borderColor: "#1a3a6b",
          backgroundColor: "rgba(26, 58, 107, 0.1)",
          borderWidth: 2,
          tension: 0.3,
          pointBackgroundColor: "#1a3a6b",
          pointBorderColor: "white",
          pointBorderWidth: 2,
          pointRadius: 4,
          fill: false,
          yAxisID: "y1",
        },
      ],
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 08 · CONSUMO POR ITEM (ANALÍTICO)
  // ============================================================
  // ============================================================
  async _relConsumoPorItem(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    const { data: itens, error: itensErr } = await supabase
      .from("itens_ata")
      .select(
        `
        id,
        item_numero,
        descricao,
        quantidade_contratada,
        saldo_quantidade,
        valor_unitario,
        valor_total,
        unidade_medida,
        ata:atas(numero_ata, modalidade, situacao)
      `,
      )
      .in("ata.situacao", ["ATIVA", "PROXIMA"]);

    if (itensErr) throw itensErr;

    if (!itens || itens.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const itemIds = itens.map((i) => i.id);

    let consQuery = supabase
      .from("consumos")
      .select("item_ata_id, quantidade, valor_total")
      .in("item_ata_id", itemIds);

    if (inicio) consQuery = consQuery.gte("data_consumo", inicio);
    if (fim) consQuery = consQuery.lte("data_consumo", fim);

    const { data: consumos, error: consErr } = await consQuery;
    if (consErr) throw consErr;

    const consumidoPorItem = {};
    (consumos || []).forEach((c) => {
      if (!consumidoPorItem[c.item_ata_id]) {
        consumidoPorItem[c.item_ata_id] = { quantidade: 0, valor: 0 };
      }
      consumidoPorItem[c.item_ata_id].quantidade += c.quantidade || 0;
      consumidoPorItem[c.item_ata_id].valor += c.valor_total || 0;
    });

    const linhas = itens
      .map((item) => {
        const contratado = item.quantidade_contratada || 0;
        const consumido = consumidoPorItem[item.id]?.quantidade || 0;
        const valorConsumido = consumidoPorItem[item.id]?.valor || 0;
        const saldo = item.saldo_quantidade || 0;
        const percentual = contratado > 0 ? (consumido / contratado) * 100 : 0;
        const valorContratado =
          item.valor_total || contratado * (item.valor_unitario || 0);

        return {
          id: item.id,
          ata: item.ata?.numero_ata || "N/I",
          item_numero: item.item_numero || "—",
          descricao: item.descricao || "—",
          unidade_medida: item.unidade_medida || "UN",
          contratado,
          consumido,
          saldo,
          valor_contratado: valorContratado,
          valor_consumido: valorConsumido,
          percentual_execucao: percentual,
        };
      })
      .filter((l) => l.consumido > 0 || l.saldo > 0)
      .sort((a, b) => b.percentual_execucao - a.percentual_execucao);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "ata", label: "Ata", align: "center" },
      { key: "item_numero", label: "Item", align: "center" },
      {
        key: "descricao",
        label: "Descrição",
        formato: (v) => this._escapeHtml((v || "").slice(0, 70)),
      },
      {
        key: "unidade_medida",
        label: "Un.",
        align: "center",
      },
      {
        key: "contratado",
        label: "Contratado",
        align: "right",
      },
      {
        key: "consumido",
        label: "Consumido",
        align: "right",
      },
      {
        key: "saldo",
        label: "Saldo",
        align: "right",
      },
      {
        key: "percentual_execucao",
        label: "% Exec.",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 90
              ? "destaque-erro"
              : n >= 70
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
    ];

    const totalItens = linhas.length;
    const totalContratado = linhas.reduce((s, l) => s + l.valor_contratado, 0);
    const totalConsumido = linhas.reduce((s, l) => s + l.valor_consumido, 0);
    const percentualGeral =
      totalContratado > 0 ? (totalConsumido / totalContratado) * 100 : 0;

    this._renderizarKpis([
      { label: "Itens Analisados", valor: totalItens, cor: "info" },
      {
        label: "Valor Contratado",
        valor: this.sistema.ui.formatarMoeda(totalContratado),
        cor: "sucesso",
      },
      {
        label: "Valor Consumido",
        valor: this.sistema.ui.formatarMoeda(totalConsumido),
        cor: "aviso",
      },
      {
        label: "Execução Geral",
        valor: `${percentualGeral.toFixed(1)}%`,
        cor: percentualGeral >= 80 ? "erro" : "info",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Mais Consumidos (% execução)",
      labels: top10.map((l) => `${l.ata} · ${l.item_numero}`),
      dados: top10.map((l) => l.percentual_execucao),
      cores: top10.map((l) =>
        l.percentual_execucao >= 90
          ? "#dc2626"
          : l.percentual_execucao >= 70
            ? "#d97706"
            : "#059669",
      ),
      tooltipFormatter: (v) => `${Number(v).toFixed(1)}% executado`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 09 · CONSUMO POR SOLICITANTE
  // ============================================================
  // ============================================================
  async _relConsumoPorSolicitante(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("consumos")
      .select(
        `
        valor_total,
        quantidade,
        usuario_id,
        usuario:usuarios(id, nome, perfil)
      `,
      )
      .order("data_consumo", { ascending: false });

    if (inicio) query = query.gte("data_consumo", inicio);
    if (fim) query = query.lte("data_consumo", fim);

    const { data: consumos, error } = await query;
    if (error) throw error;

    const agrupado = {};
    (consumos || []).forEach((c) => {
      const id = c.usuario_id;
      if (!id) return;
      if (!agrupado[id]) {
        agrupado[id] = {
          id,
          nome: c.usuario?.nome || "Usuário não identificado",
          perfil: c.usuario?.perfil || "—",
          qtd_consumos: 0,
          valor_consumido: 0,
        };
      }
      agrupado[id].qtd_consumos += 1;
      agrupado[id].valor_consumido += c.valor_total || 0;
    });

    const linhasBrutas = Object.values(agrupado).sort(
      (a, b) => b.valor_consumido - a.valor_consumido,
    );

    const totalGeral = linhasBrutas.reduce((s, l) => s + l.valor_consumido, 0);

    const linhas = linhasBrutas.map((l) => ({
      ...l,
      percentual: totalGeral > 0 ? (l.valor_consumido / totalGeral) * 100 : 0,
    }));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "nome", label: "Solicitante" },
      {
        key: "perfil",
        label: "Perfil",
        align: "center",
        formato: (v) => {
          const cores = {
            ADMIN: "perfil-admin",
            SECRETARIO: "perfil-secretario",
            SOLICITANTE: "perfil-solicitante",
            ESTAGIARIO: "perfil-estagiario",
          };
          return `<span class="badge-perfil ${cores[v] || ""}">${v}</span>`;
        },
      },
      {
        key: "qtd_consumos",
        label: "Qtd Consumos",
        align: "right",
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual",
        label: "% do Total",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
    ];

    const totalServidores = linhas.length;
    const ticketMedio = totalServidores > 0 ? totalGeral / totalServidores : 0;
    const topServ = linhas[0];

    this._renderizarKpis([
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalGeral),
        cor: "info",
      },
      { label: "Servidores Ativos", valor: totalServidores, cor: "sucesso" },
      {
        label: "Ticket Médio",
        valor: this.sistema.ui.formatarMoeda(ticketMedio),
        cor: "aviso",
      },
      {
        label: "Maior Consumidor",
        valor: topServ ? topServ.nome.split(" ")[0] : "—",
        cor: "erro",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Maiores Consumidores",
      labels: top10.map((l) => l.nome),
      dados: top10.map((l) => l.valor_consumido),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 10 · CONSUMO POR PERÍODO
  // ============================================================
  // ============================================================
  async _relConsumoPorPeriodo(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;
    const agrupamento = this.filtrosAtivos.agrupamento || "dia";

    let query = supabase
      .from("consumos")
      .select("data_consumo, valor_total, quantidade")
      .order("data_consumo", { ascending: true });

    if (inicio) query = query.gte("data_consumo", inicio);
    if (fim) query = query.lte("data_consumo", fim);

    const { data: consumos, error } = await query;
    if (error) throw error;

    const bucket = {};
    (consumos || []).forEach((c) => {
      if (!c.data_consumo) return;
      const key = this._bucketKey(c.data_consumo, agrupamento);
      if (!bucket[key]) {
        bucket[key] = { chave: key, qtd_consumos: 0, valor_consumido: 0 };
      }
      bucket[key].qtd_consumos += 1;
      bucket[key].valor_consumido += c.valor_total || 0;
    });

    const linhas = Object.values(bucket).sort((a, b) =>
      a.chave.localeCompare(b.chave),
    );

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      {
        key: "chave",
        label: this._labelAgrupamento(agrupamento),
        formato: (v) => this._formatarChave(v, agrupamento),
      },
      {
        key: "qtd_consumos",
        label: "Qtd Consumos",
        align: "right",
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
    ];

    const totalGeral = linhas.reduce((s, l) => s + l.valor_consumido, 0);
    const media = linhas.length > 0 ? totalGeral / linhas.length : 0;
    const pico = [...linhas].sort(
      (a, b) => b.valor_consumido - a.valor_consumido,
    )[0];

    this._renderizarKpis([
      { label: "Total de Pontos", valor: linhas.length, cor: "info" },
      {
        label: "Valor Total",
        valor: this.sistema.ui.formatarMoeda(totalGeral),
        cor: "sucesso",
      },
      {
        label: "Média por Período",
        valor: this.sistema.ui.formatarMoeda(media),
        cor: "aviso",
      },
      {
        label: "Pico",
        valor: pico ? this._formatarChave(pico.chave, agrupamento) : "—",
        cor: "erro",
      },
    ]);

    this._renderizarGrafico({
      tipo: "line",
      titulo: `Evolução do Consumo (${agrupamento})`,
      labels: linhas.map((l) => this._formatarChave(l.chave, agrupamento)),
      dados: linhas.map((l) => l.valor_consumido),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // HELPERS · AGRUPAMENTO DE PERÍODO
  // ============================================================
  _bucketKey(dataISO, agrupamento) {
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return "N/I";
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");

    if (agrupamento === "mes") return `${ano}-${mes}`;
    if (agrupamento === "semana") {
      const primeiraSegunda = new Date(ano, 0, 1);
      const diff = d.getTime() - primeiraSegunda.getTime();
      const semana = Math.ceil((diff / (1000 * 60 * 60 * 24) + 1) / 7);
      return `${ano}-S${String(semana).padStart(2, "0")}`;
    }
    return `${ano}-${mes}-${dia}`;
  }

  _formatarChave(chave, agrupamento) {
    if (!chave || chave === "N/I") return "N/I";
    if (agrupamento === "mes") {
      const [ano, mes] = chave.split("-");
      return `${mes}/${ano}`;
    }
    if (agrupamento === "semana") return chave.replace("-S", " · Sem ");
    const [ano, mes, dia] = chave.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  _labelAgrupamento(agrupamento) {
    if (agrupamento === "mes") return "Mês";
    if (agrupamento === "semana") return "Semana";
    return "Dia";
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 11 · PEDIDOS POR STATUS
  // ============================================================
  // ============================================================
  async _relPedidosPorStatus(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("pedidos")
      .select("id, status_aprovacao, valor_total, data_solicitacao")
      .order("created_at", { ascending: false });

    if (inicio) query = query.gte("data_solicitacao", inicio);
    if (fim) query = query.lte("data_solicitacao", fim);

    const { data: pedidos, error } = await query;
    if (error) throw error;

    const rotulos = {
      AGUARDANDO_APROVACAO: "Aguardando Aprovação",
      APROVADO: "Aprovado",
      REPROVADO: "Rejeitado",
      PEDIDO_REALIZADO: "Realizado",
    };

    const agrupado = {};
    (pedidos || []).forEach((p) => {
      const s = p.status_aprovacao || "PEDIDO_REALIZADO";
      if (!agrupado[s]) {
        agrupado[s] = { status: s, qtd: 0, valor: 0 };
      }
      agrupado[s].qtd += 1;
      agrupado[s].valor += p.valor_total || 0;
    });

    const linhas = Object.values(agrupado).sort((a, b) => b.qtd - a.qtd);
    const totalPedidos = linhas.reduce((s, l) => s + l.qtd, 0);
    const totalValor = linhas.reduce((s, l) => s + l.valor, 0);

    linhas.forEach((l) => {
      l.rotulo = rotulos[l.status] || l.status;
      l.percentual = totalPedidos > 0 ? (l.qtd / totalPedidos) * 100 : 0;
    });

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "rotulo", label: "Status" },
      { key: "qtd", label: "Qtd Pedidos", align: "right" },
      {
        key: "valor",
        label: "Valor Total",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual",
        label: "% do Total",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
    ];

    const aprovados = agrupado["APROVADO"]?.qtd || 0;
    const rejeitados = agrupado["REPROVADO"]?.qtd || 0;
    const taxa = totalPedidos > 0 ? (aprovados / totalPedidos) * 100 : 0;

    this._renderizarKpis([
      { label: "Total de Pedidos", valor: totalPedidos, cor: "info" },
      {
        label: "Valor Total",
        valor: this.sistema.ui.formatarMoeda(totalValor),
        cor: "sucesso",
      },
      { label: "Aprovados", valor: aprovados, cor: "sucesso" },
      { label: "Rejeitados", valor: rejeitados, cor: "erro" },
      {
        label: "Taxa de Aprovação",
        valor: `${taxa.toFixed(1)}%`,
        cor: "aviso",
      },
    ]);

    const coresPorStatus = {
      APROVADO: "#059669",
      REPROVADO: "#dc2626",
      AGUARDANDO_APROVACAO: "#d97706",
      PEDIDO_REALIZADO: "#2563eb",
    };

    this._renderizarGrafico({
      tipo: "doughnut",
      titulo: "Distribuição por Status",
      labels: linhas.map((l) => l.rotulo),
      dados: linhas.map((l) => l.qtd),
      cores: linhas.map((l) => coresPorStatus[l.status] || "#94a3b8"),
      tooltipFormatter: (v) => `${v} pedido(s)`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 12 · PEDIDOS PENDENTES HÁ X DIAS
  // ============================================================
  // ============================================================
  async _relPedidosPendentes(meta) {
    const dias = this.filtrosAtivos.dias || 7;

    const corte = new Date(this._hoje());
    corte.setDate(corte.getDate() - dias);

    const { data: pedidos, error } = await supabase
      .from("pedidos")
      .select(
        `
        id,
        numero_pedido,
        valor_total,
        created_at,
        data_solicitacao,
        status_aprovacao,
        usuario:usuarios(nome),
        orgao:orgaos(nome, sigla),
        ata:atas(numero_ata)
      `,
      )
      .eq("status_aprovacao", "AGUARDANDO_APROVACAO")
      .lt("created_at", corte.toISOString())
      .order("created_at", { ascending: true });

    if (error) throw error;

    const linhas = (pedidos || []).map((p) => {
      const dataRef = p.data_solicitacao || p.created_at;
      const diff = this._diffDias(dataRef);
      return {
        id: p.id,
        numero_pedido: p.numero_pedido || "N/I",
        solicitante: p.usuario?.nome || "N/I",
        orgao: p.orgao?.sigla || p.orgao?.nome || "N/I",
        ata: p.ata?.numero_ata || "N/I",
        data_solicitacao: dataRef,
        dias_parado: diff !== null ? Math.abs(diff) : 0,
        valor_total: p.valor_total || 0,
      };
    });

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_pedido", label: "Pedido" },
      { key: "solicitante", label: "Solicitante" },
      { key: "orgao", label: "Órgão", align: "center" },
      { key: "ata", label: "Ata", align: "center" },
      {
        key: "data_solicitacao",
        label: "Solicitado em",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
      {
        key: "dias_parado",
        label: "Dias Parado",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 30
              ? "destaque-erro"
              : n >= 15
                ? "destaque-aviso"
                : "destaque-info";
          return `<span class="${cls}">${n}</span>`;
        },
      },
      {
        key: "valor_total",
        label: "Valor",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
    ];

    const total = linhas.length;
    const valorTotal = linhas.reduce((s, l) => s + l.valor_total, 0);
    const maisAntigo = linhas[0];
    const media =
      total > 0
        ? Math.round(linhas.reduce((s, l) => s + l.dias_parado, 0) / total)
        : 0;

    this._renderizarKpis([
      { label: "Pedidos Parados", valor: total, cor: "erro" },
      {
        label: "Valor Total Parado",
        valor: this.sistema.ui.formatarMoeda(valorTotal),
        cor: "aviso",
      },
      { label: "Média de Dias", valor: media + " dias", cor: "info" },
      {
        label: "Mais Antigo",
        valor: maisAntigo ? maisAntigo.numero_pedido : "—",
        cor: "erro",
      },
    ]);

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 13 · TEMPO MÉDIO DE APROVAÇÃO
  // ============================================================
  // ============================================================
  async _relTempoMedioAprovacao(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("pedidos")
      .select(
        `
        id,
        numero_pedido,
        data_solicitacao,
        data_aprovacao,
        status_aprovacao,
        valor_total,
        usuario:usuarios(nome),
        orgao:orgaos(nome, sigla),
        ata:atas(numero_ata)
      `,
      )
      .not("data_aprovacao", "is", null)
      .order("data_aprovacao", { ascending: false });

    if (inicio) query = query.gte("data_aprovacao", inicio);
    if (fim) query = query.lte("data_aprovacao", fim);

    const { data: pedidos, error } = await query;
    if (error) throw error;

    const linhas = (pedidos || [])
      .map((p) => {
        const dSol = p.data_solicitacao ? new Date(p.data_solicitacao) : null;
        const dApr = p.data_aprovacao ? new Date(p.data_aprovacao) : null;
        if (!dSol || !dApr) return null;

        dSol.setHours(0, 0, 0, 0);
        dApr.setHours(0, 0, 0, 0);
        const dias = Math.max(
          0,
          Math.round((dApr.getTime() - dSol.getTime()) / (1000 * 60 * 60 * 24)),
        );

        return {
          id: p.id,
          numero_pedido: p.numero_pedido || "N/I",
          solicitante: p.usuario?.nome || "N/I",
          orgao: p.orgao?.sigla || p.orgao?.nome || "N/I",
          ata: p.ata?.numero_ata || "N/I",
          data_solicitacao: p.data_solicitacao,
          data_aprovacao: p.data_aprovacao,
          dias_para_aprovar: dias,
          status_aprovacao: p.status_aprovacao || "—",
          valor_total: p.valor_total || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.dias_para_aprovar - a.dias_para_aprovar);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_pedido", label: "Pedido" },
      { key: "solicitante", label: "Solicitante" },
      { key: "orgao", label: "Órgão", align: "center" },
      { key: "ata", label: "Ata", align: "center" },
      {
        key: "data_solicitacao",
        label: "Solicitado em",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
      {
        key: "data_aprovacao",
        label: "Aprovado em",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
      {
        key: "dias_para_aprovar",
        label: "Dias",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 15
              ? "destaque-erro"
              : n >= 7
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n}</span>`;
        },
      },
      {
        key: "status_aprovacao",
        label: "Status",
        align: "center",
        formato: (v) => {
          const cls =
            v === "APROVADO"
              ? "status-aprovado"
              : v === "REPROVADO"
                ? "status-rejeitado"
                : "status-aguardando";
          return `<span class="status-badge ${cls}">${v}</span>`;
        },
      },
    ];

    const total = linhas.length;
    const somaDias = linhas.reduce((s, l) => s + l.dias_para_aprovar, 0);
    const media = total > 0 ? somaDias / total : 0;
    const maisRapido = linhas[linhas.length - 1];
    const maisLento = linhas[0];

    this._renderizarKpis([
      { label: "Pedidos Analisados", valor: total, cor: "info" },
      {
        label: "Tempo Médio",
        valor: `${media.toFixed(1)} dias`,
        cor: media >= 7 ? "aviso" : "sucesso",
      },
      {
        label: "Mais Rápido",
        valor: maisRapido ? `${maisRapido.dias_para_aprovar} dias` : "—",
        cor: "sucesso",
      },
      {
        label: "Mais Lento",
        valor: maisLento ? `${maisLento.dias_para_aprovar} dias` : "—",
        cor: "erro",
      },
    ]);

    const faixas = [
      { label: "0-1 dias", min: 0, max: 1 },
      { label: "2-3 dias", min: 2, max: 3 },
      { label: "4-7 dias", min: 4, max: 7 },
      { label: "8-15 dias", min: 8, max: 15 },
      { label: "16+ dias", min: 16, max: Infinity },
    ];
    const dadosFaixas = faixas.map(
      (f) =>
        linhas.filter(
          (l) => l.dias_para_aprovar >= f.min && l.dias_para_aprovar <= f.max,
        ).length,
    );

    this._renderizarGrafico({
      tipo: "bar",
      titulo: "Distribuição por Faixa de Dias",
      labels: faixas.map((f) => f.label),
      dados: dadosFaixas,
      cores: ["#059669", "#16a34a", "#d97706", "#ea580c", "#dc2626"],
      tooltipFormatter: (v) => `${v} pedido(s)`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 14 · PEDIDOS DETALHADO (ANALÍTICO)
  // ============================================================
  // ============================================================
  async _relPedidosDetalhado(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("pedidos")
      .select(
        `
        id,
        numero_pedido,
        data_solicitacao,
        data_aprovacao,
        status_aprovacao,
        valor_total,
        observacao_aprovacao,
        usuario:usuarios(nome),
        orgao:orgaos(nome, sigla),
        fornecedor:fornecedores(razao_social),
        ata:atas(numero_ata)
      `,
      )
      .order("data_solicitacao", { ascending: false });

    if (inicio) query = query.gte("data_solicitacao", inicio);
    if (fim) query = query.lte("data_solicitacao", fim);

    const { data: pedidos, error } = await query;
    if (error) throw error;

    const rotulos = {
      AGUARDANDO_APROVACAO: "Aguardando",
      APROVADO: "Aprovado",
      REPROVADO: "Rejeitado",
      PEDIDO_REALIZADO: "Realizado",
    };

    const linhas = (pedidos || []).map((p) => ({
      id: p.id,
      numero_pedido: p.numero_pedido || "N/I",
      data_solicitacao: p.data_solicitacao,
      data_aprovacao: p.data_aprovacao,
      solicitante: p.usuario?.nome || "N/I",
      orgao: p.orgao?.sigla || p.orgao?.nome || "N/I",
      fornecedor: p.fornecedor?.razao_social || "N/I",
      ata: p.ata?.numero_ata || "N/I",
      valor_total: p.valor_total || 0,
      status_aprovacao: p.status_aprovacao || "PEDIDO_REALIZADO",
      rotulo: rotulos[p.status_aprovacao] || p.status_aprovacao,
    }));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_pedido", label: "Pedido" },
      {
        key: "data_solicitacao",
        label: "Solicitado",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
      { key: "solicitante", label: "Solicitante" },
      { key: "orgao", label: "Órgão", align: "center" },
      { key: "ata", label: "Ata", align: "center" },
      {
        key: "fornecedor",
        label: "Fornecedor",
        formato: (v) => this._escapeHtml((v || "").slice(0, 40)),
      },
      {
        key: "valor_total",
        label: "Valor",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "rotulo",
        label: "Status",
        align: "center",
        formato: (v, linha) => {
          const cls =
            linha.status_aprovacao === "APROVADO"
              ? "status-aprovado"
              : linha.status_aprovacao === "REPROVADO"
                ? "status-rejeitado"
                : "status-aguardando";
          return `<span class="status-badge ${cls}">${v}</span>`;
        },
      },
      {
        key: "data_aprovacao",
        label: "Aprovado em",
        formato: (v) => (v ? this.sistema.ui.formatarData(v) : "—"),
      },
    ];

    const total = linhas.length;
    const valorTotal = linhas.reduce((s, l) => s + l.valor_total, 0);
    const ticketMedio = total > 0 ? valorTotal / total : 0;
    const pendentes = linhas.filter(
      (l) => l.status_aprovacao === "AGUARDANDO_APROVACAO",
    ).length;

    this._renderizarKpis([
      { label: "Total de Pedidos", valor: total, cor: "info" },
      {
        label: "Valor Total",
        valor: this.sistema.ui.formatarMoeda(valorTotal),
        cor: "sucesso",
      },
      {
        label: "Ticket Médio",
        valor: this.sistema.ui.formatarMoeda(ticketMedio),
        cor: "aviso",
      },
      { label: "Pendentes", valor: pendentes, cor: "erro" },
    ]);

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 15 · PEDIDOS REPROVADOS / CANCELADOS
  // ============================================================
  // ============================================================
  async _relPedidosReprovados(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("pedidos")
      .select(
        `
        id,
        numero_pedido,
        data_solicitacao,
        data_aprovacao,
        valor_total,
        observacao_aprovacao,
        usuario:usuarios(nome),
        orgao:orgaos(nome, sigla),
        ata:atas(numero_ata),
        aprovador:usuarios!pedidos_aprovado_por_fkey(nome)
      `,
      )
      .eq("status_aprovacao", "REPROVADO")
      .order("data_aprovacao", { ascending: false });

    if (inicio) query = query.gte("data_aprovacao", inicio);
    if (fim) query = query.lte("data_aprovacao", fim);

    const { data: pedidos, error } = await query;
    if (error) throw error;

    const linhas = (pedidos || []).map((p) => {
      const dSol = p.data_solicitacao ? new Date(p.data_solicitacao) : null;
      const dApr = p.data_aprovacao ? new Date(p.data_aprovacao) : null;
      let diasAteRejeitar = null;
      if (dSol && dApr) {
        dSol.setHours(0, 0, 0, 0);
        dApr.setHours(0, 0, 0, 0);
        diasAteRejeitar = Math.max(
          0,
          Math.round((dApr.getTime() - dSol.getTime()) / (1000 * 60 * 60 * 24)),
        );
      }

      return {
        id: p.id,
        numero_pedido: p.numero_pedido || "N/I",
        solicitante: p.usuario?.nome || "N/I",
        aprovador: p.aprovador?.nome || "—",
        orgao: p.orgao?.sigla || p.orgao?.nome || "N/I",
        ata: p.ata?.numero_ata || "N/I",
        data_solicitacao: p.data_solicitacao,
        data_aprovacao: p.data_aprovacao,
        valor_total: p.valor_total || 0,
        motivo: p.observacao_aprovacao || "Não informado",
        dias_ate_rejeitar: diasAteRejeitar,
      };
    });

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "numero_pedido", label: "Pedido" },
      { key: "solicitante", label: "Solicitante" },
      { key: "orgao", label: "Órgão", align: "center" },
      { key: "ata", label: "Ata", align: "center" },
      {
        key: "valor_total",
        label: "Valor",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "data_aprovacao",
        label: "Rejeitado em",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
      {
        key: "dias_ate_rejeitar",
        label: "Dias até Rejeitar",
        align: "right",
        formato: (v) => (v === null ? "—" : String(v)),
      },
      {
        key: "motivo",
        label: "Motivo",
        formato: (v) => this._escapeHtml((v || "").slice(0, 60)),
      },
      { key: "aprovador", label: "Rejeitado por" },
    ];

    const total = linhas.length;
    const valorTotal = linhas.reduce((s, l) => s + l.valor_total, 0);
    const comDias = linhas.filter((l) => l.dias_ate_rejeitar !== null);
    const mediaDias =
      comDias.length > 0
        ? comDias.reduce((s, l) => s + l.dias_ate_rejeitar, 0) / comDias.length
        : 0;

    // Motivos mais comuns (top 5)
    const contMotivos = {};
    linhas.forEach((l) => {
      const m = (l.motivo || "Não informado").slice(0, 50);
      contMotivos[m] = (contMotivos[m] || 0) + 1;
    });
    const topMotivos = Object.entries(contMotivos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1);

    this._renderizarKpis([
      { label: "Total Rejeitados", valor: total, cor: "erro" },
      {
        label: "Valor Rejeitado",
        valor: this.sistema.ui.formatarMoeda(valorTotal),
        cor: "aviso",
      },
      {
        label: "Tempo Médio até Rejeitar",
        valor: `${mediaDias.toFixed(1)} dias`,
        cor: "info",
      },
      {
        label: "Motivo Mais Comum",
        valor: topMotivos[0] ? topMotivos[0][0].slice(0, 25) : "—",
        cor: "erro",
      },
    ]);

    // Gráfico: top 10 motivos
    const top10Motivos = Object.entries(contMotivos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (top10Motivos.length > 0) {
      this._renderizarGrafico({
        tipo: "bar-horizontal",
        titulo: "Top 10 · Motivos de Rejeição",
        labels: top10Motivos.map((m) =>
          m[0].length > 35 ? m[0].slice(0, 33) + "…" : m[0],
        ),
        dados: top10Motivos.map((m) => m[1]),
        tooltipFormatter: (v) => `${v} pedido(s)`,
      });
    }

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 16 · ESTOQUE ZERADO COM PEDIDO PENDENTE
  // ============================================================
  // ============================================================
  async _relEstoqueZeradoPendente(meta) {
    // 1. Buscar itens com saldo zerado ou negativo
    const { data: itens, error: itensErr } = await supabase
      .from("itens_ata")
      .select(
        `
        id,
        item_numero,
        descricao,
        saldo_quantidade,
        quantidade_contratada,
        valor_unitario,
        ata_id,
        ata:atas(numero_ata, modalidade, situacao)
      `,
      )
      .lte("saldo_quantidade", 0);

    if (itensErr) throw itensErr;

    if (!itens || itens.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const itemIds = itens.map((i) => i.id);

    // 2. Buscar itens de pedido pendentes que referenciam esses itens
    const { data: itensPedido, error: ipErr } = await supabase
      .from("itens_pedido")
      .select(
        `
        item_ata_id,
        quantidade_solicitada,
        valor_total,
        pedido:pedidos(
          id,
          numero_pedido,
          status_aprovacao,
          data_solicitacao,
          orgao:orgaos(nome, sigla)
        )
      `,
      )
      .in("item_ata_id", itemIds);

    if (ipErr) throw ipErr;

    // 3. Filtrar apenas pedidos AGUARDANDO_APROVACAO
    const porItem = {};
    (itensPedido || []).forEach((ip) => {
      const ped = ip.pedido;
      if (!ped || ped.status_aprovacao !== "AGUARDANDO_APROVACAO") return;
      if (!porItem[ip.item_ata_id]) porItem[ip.item_ata_id] = [];
      porItem[ip.item_ata_id].push({
        numero_pedido: ped.numero_pedido,
        data_solicitacao: ped.data_solicitacao,
        orgao: ped.orgao?.sigla || ped.orgao?.nome || "N/I",
        quantidade_solicitada: ip.quantidade_solicitada || 0,
        valor_total: ip.valor_total || 0,
      });
    });

    const linhas = itens
      .filter((item) => porItem[item.id]?.length > 0)
      .map((item) => {
        const pedidos = porItem[item.id];
        const qtdTotalSolicitada = pedidos.reduce(
          (s, p) => s + p.quantidade_solicitada,
          0,
        );
        const valorTotal = pedidos.reduce((s, p) => s + p.valor_total, 0);
        const primeiroPedido = pedidos[0];

        return {
          id: item.id,
          ata: item.ata?.numero_ata || "N/I",
          item_numero: item.item_numero || "—",
          descricao: item.descricao || "—",
          saldo_quantidade: item.saldo_quantidade || 0,
          quantidade_contratada: item.quantidade_contratada || 0,
          qtd_pedidos_pendentes: pedidos.length,
          qtd_total_solicitada: qtdTotalSolicitada,
          valor_total_pendente: valorTotal,
          numero_pedido_ref: primeiroPedido.numero_pedido || "N/I",
          orgao_ref: primeiroPedido.orgao || "N/I",
          data_solicitacao: primeiroPedido.data_solicitacao,
        };
      })
      .sort((a, b) => b.valor_total_pendente - a.valor_total_pendente);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "ata", label: "Ata", align: "center" },
      { key: "item_numero", label: "Item", align: "center" },
      {
        key: "descricao",
        label: "Descrição",
        formato: (v) => this._escapeHtml((v || "").slice(0, 60)),
      },
      {
        key: "saldo_quantidade",
        label: "Saldo Atual",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          return `<span class="destaque-erro">${n}</span>`;
        },
      },
      {
        key: "qtd_pedidos_pendentes",
        label: "Qtd Pedidos",
        align: "right",
      },
      {
        key: "qtd_total_solicitada",
        label: "Qtd Solicitada",
        align: "right",
      },
      {
        key: "valor_total_pendente",
        label: "Valor Pendente",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      { key: "numero_pedido_ref", label: "Pedido Ref." },
      { key: "orgao_ref", label: "Órgão Ref.", align: "center" },
      {
        key: "data_solicitacao",
        label: "Solicitado em",
        formato: (v) => this.sistema.ui.formatarData(v),
      },
    ];

    const totalItens = linhas.length;
    const totalPedidos = linhas.reduce(
      (s, l) => s + l.qtd_pedidos_pendentes,
      0,
    );
    const valorTotal = linhas.reduce((s, l) => s + l.valor_total_pendente, 0);
    const criticos = linhas.filter((l) => l.saldo_quantidade < 0).length;

    this._renderizarKpis([
      { label: "Itens sem Saldo", valor: totalItens, cor: "erro" },
      { label: "Pedidos Pendentes", valor: totalPedidos, cor: "aviso" },
      {
        label: "Valor em Risco",
        valor: this.sistema.ui.formatarMoeda(valorTotal),
        cor: "erro",
      },
      { label: "Saldo Negativo", valor: criticos, cor: "erro" },
    ]);

    const top10 = linhas.slice(0, 10);
    if (top10.length > 0) {
      this._renderizarGrafico({
        tipo: "bar-horizontal",
        titulo: "Top 10 · Maiores Valores em Risco",
        labels: top10.map((l) => `${l.ata} · ${l.item_numero}`),
        dados: top10.map((l) => l.valor_total_pendente),
        tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
      });
    }

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 17 · RANKING DE FORNECEDORES
  // ============================================================
  // ============================================================
  async _relRankingFornecedores(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;
    const ordenacao = this.filtrosAtivos.ordenacao || "contratado";

    let atasQuery = supabase.from("atas").select(
      `
        id,
        valor_global,
        fornecedor_id,
        data_inicio_vigencia,
        fornecedor:fornecedores(razao_social, cnpj)
      `,
    );

    if (inicio) atasQuery = atasQuery.gte("data_inicio_vigencia", inicio);
    if (fim) atasQuery = atasQuery.lte("data_inicio_vigencia", fim);

    const { data: atas, error: atasErr } = await atasQuery;
    if (atasErr) throw atasErr;

    let consQuery = supabase.from("consumos").select("ata_id, valor_total");

    if (inicio) consQuery = consQuery.gte("data_consumo", inicio);
    if (fim) consQuery = consQuery.lte("data_consumo", fim);

    const { data: consumos, error: consErr } = await consQuery;
    if (consErr) throw consErr;

    const ataParaFornecedor = {};
    (atas || []).forEach((a) => {
      ataParaFornecedor[a.id] = a.fornecedor_id;
    });

    const consumidoPorForn = {};
    (consumos || []).forEach((c) => {
      const fId = ataParaFornecedor[c.ata_id];
      if (!fId) return;
      consumidoPorForn[fId] =
        (consumidoPorForn[fId] || 0) + (c.valor_total || 0);
    });

    const agrupado = {};
    (atas || []).forEach((a) => {
      const fId = a.fornecedor_id;
      if (!fId) return;
      if (!agrupado[fId]) {
        agrupado[fId] = {
          id: fId,
          razao_social: a.fornecedor?.razao_social || "N/I",
          cnpj: this.sistema.ui.formatarDocumento(a.fornecedor?.cnpj || ""),
          qtd_atas: 0,
          valor_contratado: 0,
        };
      }
      agrupado[fId].qtd_atas += 1;
      agrupado[fId].valor_contratado += a.valor_global || 0;
    });

    const linhas = Object.values(agrupado).map((f) => {
      const consumido = consumidoPorForn[f.id] || 0;
      const percentual =
        f.valor_contratado > 0 ? (consumido / f.valor_contratado) * 100 : 0;
      return {
        ...f,
        valor_consumido: consumido,
        percentual_execucao: percentual,
      };
    });

    linhas.sort((a, b) => {
      if (ordenacao === "consumido")
        return b.valor_consumido - a.valor_consumido;
      if (ordenacao === "atas") return b.qtd_atas - a.qtd_atas;
      return b.valor_contratado - a.valor_contratado;
    });

    linhas.forEach((l, i) => (l.rank = i + 1));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      {
        key: "rank",
        label: "#",
        align: "center",
        formato: (v) => {
          const n = Number(v);
          if (n === 1) return "🥇";
          if (n === 2) return "🥈";
          if (n === 3) return "🥉";
          return `<strong>${n}</strong>`;
        },
      },
      { key: "razao_social", label: "Fornecedor" },
      { key: "cnpj", label: "CPF/CNPJ" },
      { key: "qtd_atas", label: "Nº Atas", align: "right" },
      {
        key: "valor_contratado",
        label: "Valor Contratado",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "valor_consumido",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual_execucao",
        label: "% Execução",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 80
              ? "destaque-erro"
              : n >= 50
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
    ];

    const totalFornecedores = linhas.length;
    const totalContratado = linhas.reduce((s, l) => s + l.valor_contratado, 0);
    const totalConsumido = linhas.reduce((s, l) => s + l.valor_consumido, 0);
    const topForn = linhas[0];

    this._renderizarKpis([
      { label: "Fornecedores", valor: totalFornecedores, cor: "info" },
      {
        label: "Total Contratado",
        valor: this.sistema.ui.formatarMoeda(totalContratado),
        cor: "sucesso",
      },
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalConsumido),
        cor: "aviso",
      },
      {
        label: "Líder do Ranking",
        valor: topForn ? topForn.razao_social.slice(0, 20) : "—",
        cor: "erro",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    const usaContratado = ordenacao !== "consumido";
    const valores = top10.map((l) =>
      usaContratado ? l.valor_contratado : l.valor_consumido,
    );

    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: `Top 10 · ${
        usaContratado ? "Valor Contratado" : "Valor Consumido"
      }`,
      labels: top10.map((l) =>
        l.razao_social.length > 25
          ? l.razao_social.slice(0, 23) + "…"
          : l.razao_social,
      ),
      dados: valores,
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 18 · SALDO POR FORNECEDOR
  // ============================================================
  // ============================================================
  async _relSaldoPorFornecedor(meta) {
    const { data: atas, error: atasErr } = await supabase
      .from("atas")
      .select(
        `
        id,
        valor_global,
        fornecedor_id,
        situacao,
        fornecedor:fornecedores(razao_social, cnpj)
      `,
      )
      .in("situacao", ["ATIVA", "PROXIMA"]);

    if (atasErr) throw atasErr;

    const atasIds = (atas || []).map((a) => a.id);
    if (atasIds.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const [itensRes, consumosRes] = await Promise.all([
      supabase
        .from("itens_ata")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
      supabase
        .from("consumos")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
    ]);

    const contratadoPorAta = {};
    (itensRes.data || []).forEach((i) => {
      contratadoPorAta[i.ata_id] =
        (contratadoPorAta[i.ata_id] || 0) + (i.valor_total || 0);
    });

    const consumidoPorAta = {};
    (consumosRes.data || []).forEach((c) => {
      consumidoPorAta[c.ata_id] =
        (consumidoPorAta[c.ata_id] || 0) + (c.valor_total || 0);
    });

    const agrupado = {};
    (atas || []).forEach((a) => {
      const fId = a.fornecedor_id;
      if (!fId) return;
      if (!agrupado[fId]) {
        agrupado[fId] = {
          id: fId,
          razao_social: a.fornecedor?.razao_social || "N/I",
          cnpj: this.sistema.ui.formatarDocumento(a.fornecedor?.cnpj || ""),
          qtd_atas: 0,
          valor_contratado: 0,
          valor_consumido: 0,
        };
      }
      const contratadoAta = contratadoPorAta[a.id] || 0;
      const consumidoAta = consumidoPorAta[a.id] || 0;
      agrupado[fId].qtd_atas += 1;
      agrupado[fId].valor_contratado += contratadoAta;
      agrupado[fId].valor_consumido += consumidoAta;
    });

    const linhas = Object.values(agrupado)
      .map((f) => {
        const saldo = Math.max(0, f.valor_contratado - f.valor_consumido);
        const percentual =
          f.valor_contratado > 0
            ? (f.valor_consumido / f.valor_contratado) * 100
            : 0;
        return {
          ...f,
          saldo,
          percentual_execucao: percentual,
        };
      })
      .sort((a, b) => b.saldo - a.saldo);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "razao_social", label: "Fornecedor" },
      { key: "cnpj", label: "CPF/CNPJ" },
      { key: "qtd_atas", label: "Nº Atas", align: "right" },
      {
        key: "valor_contratado",
        label: "Contratado",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "valor_consumido",
        label: "Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "saldo",
        label: "Saldo",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual_execucao",
        label: "% Exec.",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 90
              ? "destaque-erro"
              : n >= 70
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
    ];

    const totalFornec = linhas.length;
    const totalContratado = linhas.reduce((s, l) => s + l.valor_contratado, 0);
    const totalConsumido = linhas.reduce((s, l) => s + l.valor_consumido, 0);
    const saldoGeral = linhas.reduce((s, l) => s + l.saldo, 0);
    const topForn = linhas[0];

    this._renderizarKpis([
      { label: "Fornecedores Ativos", valor: totalFornec, cor: "info" },
      {
        label: "Total Contratado",
        valor: this.sistema.ui.formatarMoeda(totalContratado),
        cor: "sucesso",
      },
      {
        label: "Total Consumido",
        valor: this.sistema.ui.formatarMoeda(totalConsumido),
        cor: "aviso",
      },
      {
        label: "Saldo Consolidado",
        valor: this.sistema.ui.formatarMoeda(saldoGeral),
        cor: topForn && topForn.saldo > 0 ? "sucesso" : "erro",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Maiores Saldos por Fornecedor",
      labels: top10.map((l) =>
        l.razao_social.length > 25
          ? l.razao_social.slice(0, 23) + "…"
          : l.razao_social,
      ),
      dados: top10.map((l) => l.saldo),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }
  // ============================================================
  // ============================================================
  // RELATÓRIO 19 · DIFERENÇA DE PREÇOS
  // ============================================================
  // ------------------------------------------------------------
  // Encontra o MESMO item (mesma descrição normalizada) em atas
  // diferentes com preços unitários divergentes.
  // Mostra o menor preço, o maior preço e a economia potencial.
  // ------------------------------------------------------------
  // ============================================================
  async _relDiferencaPrecos(meta) {
    // 1. Buscar todos os itens de atas ATIVA/PROXIMA
    const { data: itens, error } = await supabase
      .from("itens_ata")
      .select(
        `
        id,
        item_numero,
        descricao,
        valor_unitario,
        unidade_medida,
        ata:atas(
          id,
          numero_ata,
          modalidade,
          situacao,
          fornecedor:fornecedores(razao_social)
        )
      `,
      )
      .in("ata.situacao", ["ATIVA", "PROXIMA"])
      .gt("valor_unitario", 0);

    if (error) throw error;

    if (!itens || itens.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    // 2. Agrupar por descrição normalizada
    const normalizar = (s) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const grupos = {};
    itens.forEach((item) => {
      const chave = normalizar(item.descricao).slice(0, 80);
      if (!chave) return;
      if (!grupos[chave]) {
        grupos[chave] = {
          chave,
          descricao: item.descricao,
          unidade: item.unidade_medida || "UN",
          itens: [],
        };
      }
      grupos[chave].itens.push({
        id: item.id,
        item_numero: item.item_numero,
        descricao: item.descricao,
        valor_unitario: item.valor_unitario || 0,
        ata: item.ata?.numero_ata || "N/I",
        fornecedor: item.ata?.fornecedor?.razao_social || "N/I",
      });
    });

    // 3. Filtrar apenas grupos com 2+ preços DIFERENTES
    const linhas = [];
    Object.values(grupos).forEach((g) => {
      if (g.itens.length < 2) return;

      const precos = g.itens.map((i) => i.valor_unitario);
      const min = Math.min(...precos);
      const max = Math.max(...precos);
      if (max <= min) return; // preços iguais, ignora

      const diff = max - min;
      const diffPct = min > 0 ? (diff / min) * 100 : 0;
      const menorItem = g.itens.find((i) => i.valor_unitario === min);
      const maiorItem = g.itens.find((i) => i.valor_unitario === max);

      linhas.push({
        descricao: g.descricao,
        unidade: g.unidade,
        qtd_atas: g.itens.length,
        menor_preco: min,
        maior_preco: max,
        diferenca: diff,
        diferenca_percentual: diffPct,
        ata_menor: menorItem?.ata || "—",
        ata_maior: maiorItem?.ata || "—",
        fornecedor_menor: menorItem?.fornecedor || "—",
        fornecedor_maior: maiorItem?.fornecedor || "—",
        economia_potencial: diff,
      });
    });

    linhas.sort((a, b) => b.diferenca_percentual - a.diferenca_percentual);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      {
        key: "descricao",
        label: "Descrição",
        formato: (v) => this._escapeHtml((v || "").slice(0, 55)),
      },
      { key: "unidade", label: "Un.", align: "center" },
      { key: "qtd_atas", label: "Nº Atas", align: "right" },
      {
        key: "menor_preco",
        label: "Menor Preço",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "maior_preco",
        label: "Maior Preço",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "diferenca",
        label: "Diferença",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "diferenca_percentual",
        label: "% Diferença",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 50
              ? "destaque-erro"
              : n >= 20
                ? "destaque-aviso"
                : "destaque-info";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
      { key: "ata_menor", label: "Ata c/ Menor", align: "center" },
      { key: "ata_maior", label: "Ata c/ Maior", align: "center" },
    ];

    const totalItens = linhas.length;
    const mediaDif =
      totalItens > 0
        ? linhas.reduce((s, l) => s + l.diferenca_percentual, 0) / totalItens
        : 0;
    const maiorDif = linhas[0];

    this._renderizarKpis([
      { label: "Itens Divergentes", valor: totalItens, cor: "info" },
      {
        label: "Média de Diferença",
        valor: `${mediaDif.toFixed(1)}%`,
        cor: mediaDif >= 30 ? "erro" : "aviso",
      },
      {
        label: "Maior Divergência",
        valor: maiorDif ? `${maiorDif.diferenca_percentual.toFixed(0)}%` : "—",
        cor: "erro",
      },
      {
        label: "Fornecedores Envolvidos",
        valor: new Set(linhas.map((l) => l.fornecedor_maior)).size,
        cor: "sucesso",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    if (top10.length > 0) {
      this._renderizarGrafico({
        tipo: "bar-horizontal",
        titulo: "Top 10 · Maiores Divergências (%)",
        labels: top10.map((l) => l.descricao.slice(0, 25) + "…"),
        dados: top10.map((l) => l.diferenca_percentual),
        cores: top10.map((l) =>
          l.diferenca_percentual >= 50
            ? "#dc2626"
            : l.diferenca_percentual >= 20
              ? "#d97706"
              : "#f59e0b",
        ),
        tooltipFormatter: (v) => `${Number(v).toFixed(1)}% de diferença`,
      });
    }

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 20 · HISTÓRICO DE ALTERAÇÕES
  // ============================================================
  // ============================================================
  async _relHistoricoAlteracoes(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("atas_historico")
      .select(
        `
        id,
        campo_alterado,
        valor_antigo,
        valor_novo,
        created_at,
        ata_id,
        usuario_id,
        ata:atas(numero_ata),
        usuario:usuarios(nome)
      `,
      )
      .order("created_at", { ascending: false });

    if (inicio) query = query.gte("created_at", `${inicio}T00:00:00`);
    if (fim) query = query.lte("created_at", `${fim}T23:59:59`);

    const { data: registros, error } = await query;
    if (error) throw error;

    const linhas = (registros || []).map((r) => ({
      id: r.id,
      data_alteracao: r.created_at,
      ata: r.ata?.numero_ata || "N/I",
      campo: r.campo_alterado || "—",
      valor_antigo: r.valor_antigo || "",
      valor_novo: r.valor_novo || "",
      usuario: r.usuario?.nome || "Desconhecido",
    }));

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      {
        key: "data_alteracao",
        label: "Data",
        formato: (v) =>
          v
            ? new Date(v).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—",
      },
      { key: "ata", label: "Ata", align: "center" },
      { key: "campo", label: "Campo" },
      {
        key: "valor_antigo",
        label: "Valor Antigo",
        formato: (v) => this._escapeHtml(v || "—"),
      },
      {
        key: "valor_novo",
        label: "Valor Novo",
        formato: (v) =>
          `<strong class="destaque-info">${this._escapeHtml(v || "—")}</strong>`,
      },
      { key: "usuario", label: "Usuário" },
    ];

    const totalAlteracoes = linhas.length;
    const atasUnicas = new Set(linhas.map((l) => l.ata)).size;
    const usuariosUnicos = new Set(linhas.map((l) => l.usuario)).size;
    const ultimaData = linhas[0]?.data_alteracao;

    this._renderizarKpis([
      { label: "Total de Alterações", valor: totalAlteracoes, cor: "info" },
      { label: "Atas Alteradas", valor: atasUnicas, cor: "aviso" },
      { label: "Usuários Envolvidos", valor: usuariosUnicos, cor: "sucesso" },
      {
        label: "Última Alteração",
        valor: ultimaData
          ? new Date(ultimaData).toLocaleDateString("pt-BR")
          : "—",
        cor: "erro",
      },
    ]);

    const contCampo = {};
    linhas.forEach((l) => {
      contCampo[l.campo] = (contCampo[l.campo] || 0) + 1;
    });
    const camposTop = Object.entries(contCampo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (camposTop.length > 0) {
      this._renderizarGrafico({
        tipo: "bar-horizontal",
        titulo: "Top 10 · Campos mais Alterados",
        labels: camposTop.map((c) => c[0]),
        dados: camposTop.map((c) => c[1]),
        tooltipFormatter: (v) => `${v} alteração(ões)`,
      });
    }

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 21 · DIVERGÊNCIAS DE SALDO
  // ============================================================
  // ------------------------------------------------------------
  // Snapshot: saldo esperado = contratado - consumido
  // Compara com saldo_quantidade real do itens_ata.
  // Lógica autocontida (não chama gestao.js).
  // ============================================================
  async _relDivergenciasSaldo(meta) {
    const { data: itens, error: itensErr } = await supabase
      .from("itens_ata")
      .select(
        `
        id,
        item_numero,
        descricao,
        quantidade_contratada,
        saldo_quantidade,
        valor_unitario,
        ata_id,
        ata:atas(numero_ata, modalidade, situacao)
      `,
      )
      .in("ata.situacao", ["ATIVA", "PROXIMA"]);

    if (itensErr) throw itensErr;

    if (!itens || itens.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    const itemIds = itens.map((i) => i.id);
    const { data: consumos, error: consErr } = await supabase
      .from("consumos")
      .select("item_ata_id, quantidade, valor_total")
      .in("item_ata_id", itemIds);

    if (consErr) throw consErr;

    const consumidoPorItem = {};
    (consumos || []).forEach((c) => {
      if (!consumidoPorItem[c.item_ata_id]) {
        consumidoPorItem[c.item_ata_id] = { quantidade: 0, valor: 0 };
      }
      consumidoPorItem[c.item_ata_id].quantidade += c.quantidade || 0;
      consumidoPorItem[c.item_ata_id].valor += c.valor_total || 0;
    });

    const linhas = [];
    itens.forEach((item) => {
      const contratado = item.quantidade_contratada || 0;
      const consumido = consumidoPorItem[item.id]?.quantidade || 0;
      const saldoEsperado = contratado - consumido;
      const saldoReal = item.saldo_quantidade || 0;
      const divergencia = saldoReal - saldoEsperado;

      if (divergencia !== 0) {
        linhas.push({
          id: item.id,
          ata: item.ata?.numero_ata || "N/I",
          item_numero: item.item_numero || "—",
          descricao: item.descricao || "—",
          quantidade_contratada: contratado,
          quantidade_consumida: consumido,
          saldo_esperado: saldoEsperado,
          saldo_real: saldoReal,
          divergencia: divergencia,
          valor_unitario: item.valor_unitario || 0,
          valor_divergencia: Math.abs(divergencia) * (item.valor_unitario || 0),
        });
      }
    });

    linhas.sort((a, b) => b.valor_divergencia - a.valor_divergencia);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "ata", label: "Ata", align: "center" },
      { key: "item_numero", label: "Item", align: "center" },
      {
        key: "descricao",
        label: "Descrição",
        formato: (v) => this._escapeHtml((v || "").slice(0, 60)),
      },
      {
        key: "quantidade_contratada",
        label: "Contratado",
        align: "right",
      },
      {
        key: "quantidade_consumida",
        label: "Consumido",
        align: "right",
      },
      {
        key: "saldo_esperado",
        label: "Saldo Esperado",
        align: "right",
      },
      {
        key: "saldo_real",
        label: "Saldo Real",
        align: "right",
      },
      {
        key: "divergencia",
        label: "Divergência",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls = n > 0 ? "destaque-sucesso" : "destaque-erro";
          return `<span class="${cls}">${n > 0 ? "+" : ""}${n}</span>`;
        },
      },
      {
        key: "valor_divergencia",
        label: "Valor Impacto",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
    ];

    const totalDivergencias = linhas.length;
    const totalPositivas = linhas.filter((l) => l.divergencia > 0).length;
    const totalNegativas = linhas.filter((l) => l.divergencia < 0).length;
    const impactoTotal = linhas.reduce((s, l) => s + l.valor_divergencia, 0);

    this._renderizarKpis([
      { label: "Total de Divergências", valor: totalDivergencias, cor: "erro" },
      { label: "Saldo a Mais", valor: totalPositivas, cor: "sucesso" },
      { label: "Saldo a Menos", valor: totalNegativas, cor: "erro" },
      {
        label: "Impacto Financeiro",
        valor: this.sistema.ui.formatarMoeda(impactoTotal),
        cor: "aviso",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    if (top10.length > 0) {
      this._renderizarGrafico({
        tipo: "bar-horizontal",
        titulo: "Top 10 · Maiores Impactos Financeiros",
        labels: top10.map((l) => `${l.ata} · ${l.item_numero}`),
        dados: top10.map((l) => l.valor_divergencia),
        cores: top10.map((l) => (l.divergencia > 0 ? "#059669" : "#dc2626")),
        tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
      });
    }

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 22 · COMPARATIVO ANO A ANO
  // ============================================================
  // ============================================================
  async _relComparativoAnoAno(meta) {
    const anoBase = this.filtrosAtivos.anoBase || new Date().getFullYear();
    const anoAnterior = anoBase - 1;

    const dataInicio = `${anoAnterior}-01-01`;
    const dataFim = `${anoBase}-12-31`;

    const { data: consumos, error } = await supabase
      .from("consumos")
      .select("data_consumo, valor_total")
      .gte("data_consumo", dataInicio)
      .lte("data_consumo", dataFim);

    if (error) throw error;

    const meses = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];

    const base = new Array(12).fill(0);
    const anterior = new Array(12).fill(0);

    (consumos || []).forEach((c) => {
      if (!c.data_consumo) return;
      const [anoStr, mesStr] = c.data_consumo.split("-");
      const ano = parseInt(anoStr);
      const mes = parseInt(mesStr) - 1;

      if (mes < 0 || mes > 11) return;

      if (ano === anoBase) base[mes] += c.valor_total || 0;
      else if (ano === anoAnterior) anterior[mes] += c.valor_total || 0;
    });

    const linhas = meses.map((m, i) => {
      const atual = base[i];
      const ant = anterior[i];
      const variacao = ant > 0 ? ((atual - ant) / ant) * 100 : null;
      const variacaoAbsoluta = atual - ant;

      return {
        mes: m,
        mesNumero: i + 1,
        valor_ano_base: atual,
        valor_ano_anterior: ant,
        variacao_absoluta: variacaoAbsoluta,
        variacao_percentual: variacao,
      };
    });

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "mes", label: "Mês" },
      {
        key: "valor_ano_base",
        label: `Ano ${anoBase}`,
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "valor_ano_anterior",
        label: `Ano ${anoAnterior}`,
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "variacao_absoluta",
        label: "Variação (R$)",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls = n > 0 ? "destaque-erro" : n < 0 ? "destaque-sucesso" : "";
          return `<span class="${cls}">${this.sistema.ui.formatarMoeda(Math.abs(n))} ${n > 0 ? "▲" : n < 0 ? "▼" : ""}</span>`;
        },
      },
      {
        key: "variacao_percentual",
        label: "Variação (%)",
        align: "right",
        formato: (v) => {
          if (v === null || v === undefined) return "—";
          const n = Number(v);
          const cls = n > 0 ? "destaque-erro" : n < 0 ? "destaque-sucesso" : "";
          return `<span class="${cls}">${n > 0 ? "+" : ""}${n.toFixed(1)}%</span>`;
        },
      },
    ];

    const totalBase = base.reduce((s, v) => s + v, 0);
    const totalAnterior = anterior.reduce((s, v) => s + v, 0);
    const variacaoGeral =
      totalAnterior > 0
        ? ((totalBase - totalAnterior) / totalAnterior) * 100
        : 0;

    let maiorAlta = null;
    linhas.forEach((l) => {
      if (
        l.variacao_percentual !== null &&
        (maiorAlta === null ||
          l.variacao_percentual > maiorAlta.variacao_percentual)
      ) {
        maiorAlta = l;
      }
    });

    this._renderizarKpis([
      {
        label: `Total ${anoBase}`,
        valor: this.sistema.ui.formatarMoeda(totalBase),
        cor: "info",
      },
      {
        label: `Total ${anoAnterior}`,
        valor: this.sistema.ui.formatarMoeda(totalAnterior),
        cor: "sucesso",
      },
      {
        label: "Variação Geral",
        valor: `${variacaoGeral > 0 ? "+" : ""}${variacaoGeral.toFixed(1)}%`,
        cor: variacaoGeral > 0 ? "erro" : "sucesso",
      },
      {
        label: "Mês Maior Alta",
        valor: maiorAlta
          ? `${maiorAlta.mes} (${maiorAlta.variacao_percentual.toFixed(0)}%)`
          : "—",
        cor: "aviso",
      },
    ]);

    this._renderizarGrafico({
      tipo: "line",
      titulo: `Evolução Mensal · ${anoBase} vs ${anoAnterior}`,
      labels: meses,
      datasets: [
        {
          label: `Ano ${anoBase}`,
          data: base,
          borderColor: "#0d5e3a",
          backgroundColor: "rgba(13, 94, 58, 0.1)",
          borderWidth: 3,
          tension: 0.3,
          pointBackgroundColor: "#0d5e3a",
          pointBorderColor: "white",
          pointBorderWidth: 2,
          pointRadius: 4,
          fill: true,
        },
        {
          label: `Ano ${anoAnterior}`,
          data: anterior,
          borderColor: "#94a3b8",
          backgroundColor: "rgba(148, 163, 184, 0.1)",
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          pointBackgroundColor: "#94a3b8",
          pointBorderColor: "white",
          pointBorderWidth: 2,
          pointRadius: 3,
          fill: false,
        },
      ],
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 23 · AUDITORIA COMPLETA (TIMELINE)
  // ============================================================
  // ------------------------------------------------------------
  // Timeline unificada com 3 fontes:
  //   · Pedidos (criação)
  //   · Consumos (registro)
  //   · Alterações de atas (atas_historico)
  // Ordenada por data decrescente.
  // ============================================================
  async _relAuditoriaCompleta(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    // 1. Pedidos
    let qPedidos = supabase
      .from("pedidos")
      .select(
        `
        id,
        numero_pedido,
        created_at,
        data_solicitacao,
        status_aprovacao,
        valor_total,
        usuario:usuarios(nome),
        ata:atas(numero_ata),
        orgao:orgaos(sigla)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (inicio) qPedidos = qPedidos.gte("created_at", `${inicio}T00:00:00`);
    if (fim) qPedidos = qPedidos.lte("created_at", `${fim}T23:59:59`);

    // 2. Consumos
    let qConsumos = supabase
      .from("consumos")
      .select(
        `
        id,
        quantidade,
        valor_total,
        created_at,
        data_consumo,
        usuario:usuarios(nome),
        orgao:orgaos(sigla),
        ata:atas(numero_ata),
        item:itens_ata(item_numero, descricao)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (inicio) qConsumos = qConsumos.gte("created_at", `${inicio}T00:00:00`);
    if (fim) qConsumos = qConsumos.lte("created_at", `${fim}T23:59:59`);

    // 3. Alterações de atas
    let qHist = supabase
      .from("atas_historico")
      .select(
        `
        id,
        campo_alterado,
        valor_antigo,
        valor_novo,
        created_at,
        usuario:usuarios(nome),
        ata:atas(numero_ata)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (inicio) qHist = qHist.gte("created_at", `${inicio}T00:00:00`);
    if (fim) qHist = qHist.lte("created_at", `${fim}T23:59:59`);

    const [pedidosRes, consumosRes, histRes] = await Promise.all([
      qPedidos,
      qConsumos,
      qHist,
    ]);

    if (pedidosRes.error) throw pedidosRes.error;
    if (consumosRes.error) throw consumosRes.error;
    if (histRes.error) throw histRes.error;

    const eventos = [];

    (pedidosRes.data || []).forEach((p) => {
      const rotulos = {
        AGUARDANDO_APROVACAO: "Pedido aguardando aprovação",
        APROVADO: "Pedido aprovado",
        REPROVADO: "Pedido rejeitado",
        PEDIDO_REALIZADO: "Pedido realizado",
      };
      eventos.push({
        id: `pedido-${p.id}`,
        tipo: "PEDIDO",
        data: p.created_at,
        descricao: rotulos[p.status_aprovacao] || "Pedido",
        detalhe: `${p.numero_pedido || "N/I"} · ${p.ata?.numero_ata || "N/I"}`,
        usuario: p.usuario?.nome || "—",
        orgao: p.orgao?.sigla || "—",
        valor: p.valor_total || 0,
      });
    });

    (consumosRes.data || []).forEach((c) => {
      eventos.push({
        id: `consumo-${c.id}`,
        tipo: "CONSUMO",
        data: c.created_at || c.data_consumo,
        descricao: `Consumo registrado`,
        detalhe: `${c.ata?.numero_ata || "N/I"} · Item ${c.item?.item_numero || "—"} (${c.quantidade || 0} un)`,
        usuario: c.usuario?.nome || "—",
        orgao: c.orgao?.sigla || "—",
        valor: c.valor_total || 0,
      });
    });

    (histRes.data || []).forEach((h) => {
      eventos.push({
        id: `hist-${h.id}`,
        tipo: "ALTERACAO",
        data: h.created_at,
        descricao: `Alteração em "${h.campo_alterado}"`,
        detalhe: `De "${(h.valor_antigo || "").slice(0, 30)}" para "${(h.valor_novo || "").slice(0, 30)}"`,
        usuario: h.usuario?.nome || "—",
        orgao: h.ata?.numero_ata || "—",
        valor: 0,
      });
    });

    eventos.sort((a, b) => new Date(b.data) - new Date(a.data));

    this.dadosAtuais = eventos;

    this.colunasAtuais = [
      {
        key: "data",
        label: "Data/Hora",
        formato: (v) =>
          v
            ? new Date(v).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—",
      },
      {
        key: "tipo",
        label: "Tipo",
        align: "center",
        formato: (v) => {
          const cores = {
            PEDIDO: "status-aguardando",
            CONSUMO: "status-aprovado",
            ALTERACAO: "status-rejeitado",
          };
          return `<span class="status-badge ${cores[v] || ""}">${v}</span>`;
        },
      },
      { key: "descricao", label: "Evento" },
      { key: "detalhe", label: "Detalhe" },
      { key: "usuario", label: "Usuário" },
      { key: "orgao", label: "Ref.", align: "center" },
      {
        key: "valor",
        label: "Valor",
        align: "right",
        formato: (v) =>
          Number(v) > 0 ? this.sistema.ui.formatarMoeda(v) : "—",
      },
    ];

    const totalEventos = eventos.length;
    const totalPedidos = eventos.filter((e) => e.tipo === "PEDIDO").length;
    const totalConsumos = eventos.filter((e) => e.tipo === "CONSUMO").length;
    const totalAlteracoes = eventos.filter(
      (e) => e.tipo === "ALTERACAO",
    ).length;

    this._renderizarKpis([
      { label: "Total de Eventos", valor: totalEventos, cor: "info" },
      { label: "Pedidos", valor: totalPedidos, cor: "aviso" },
      { label: "Consumos", valor: totalConsumos, cor: "sucesso" },
      { label: "Alterações", valor: totalAlteracoes, cor: "erro" },
    ]);

    this._renderizarTabela(
      linhas.slice ? eventos : eventos,
      this.colunasAtuais,
    );
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 24 · CONCENTRAÇÃO DE FORNECEDORES
  // ============================================================
  // ------------------------------------------------------------
  // Mede quanto do gasto total está concentrado nos Top N
  // fornecedores. Alerta se poucos fornecedores concentram muito.
  // ============================================================
  async _relConcentracaoFornecedores(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;
    const topN = this.filtrosAtivos.topo || 10;

    // 1. Buscar atas do período (para obter fornecedor de cada ata)
    let atasQuery = supabase.from("atas").select(
      `
        id,
        valor_global,
        fornecedor_id,
        data_inicio_vigencia,
        fornecedor:fornecedores(razao_social, cnpj)
      `,
    );
    if (inicio) atasQuery = atasQuery.gte("data_inicio_vigencia", inicio);
    if (fim) atasQuery = atasQuery.lte("data_inicio_vigencia", fim);

    const { data: atas, error: atasErr } = await atasQuery;
    if (atasErr) throw atasErr;

    // 2. Buscar consumos do período
    let consQuery = supabase.from("consumos").select("ata_id, valor_total");
    if (inicio) consQuery = consQuery.gte("data_consumo", inicio);
    if (fim) consQuery = consQuery.lte("data_consumo", fim);

    const { data: consumos, error: consErr } = await consQuery;
    if (consErr) throw consErr;

    // 3. Mapear ata → fornecedor
    const ataParaForn = {};
    (atas || []).forEach((a) => {
      ataParaForn[a.id] = a.fornecedor_id;
    });

    // 4. Somar consumo por fornecedor
    const porForn = {};
    (consumos || []).forEach((c) => {
      const fId = ataParaForn[c.ata_id];
      if (!fId) return;
      porForn[fId] = (porForn[fId] || 0) + (c.valor_total || 0);
    });

    // 5. Ranking decrescente
    const ranking = Object.entries(porForn)
      .map(([fId, valor]) => {
        const ata = (atas || []).find((a) => a.fornecedor_id === parseInt(fId));
        return {
          id: parseInt(fId),
          razao_social: ata?.fornecedor?.razao_social || "N/I",
          cnpj: this.sistema.ui.formatarDocumento(ata?.fornecedor?.cnpj || ""),
          valor: valor,
        };
      })
      .sort((a, b) => b.valor - a.valor);

    const totalGeral = ranking.reduce((s, r) => s + r.valor, 0);

    if (totalGeral === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    // 6. Calcular acumulado e % para cada fornecedor
    let acumulado = 0;
    const linhas = ranking.map((r, i) => {
      const pct = (r.valor / totalGeral) * 100;
      acumulado += pct;
      return {
        ...r,
        rank: i + 1,
        percentual: pct,
        percentual_acumulado: acumulado,
      };
    });

    // 7. Contar quantos fornecedores concentram 50%, 80%, 95%
    const atinge = (t) => {
      let acc = 0;
      for (let i = 0; i < linhas.length; i++) {
        acc += linhas[i].percentual;
        if (acc >= t) return i + 1;
      }
      return linhas.length;
    };

    const n50 = atinge(50);
    const n80 = atinge(80);
    const n95 = atinge(95);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "rank", label: "#", align: "center" },
      { key: "razao_social", label: "Fornecedor" },
      { key: "cnpj", label: "CPF/CNPJ" },
      {
        key: "valor",
        label: "Valor Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual",
        label: "% do Total",
        align: "right",
        formato: (v) => `${Number(v).toFixed(2)}%`,
      },
      {
        key: "percentual_acumulado",
        label: "% Acumulado",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n <= 50
              ? "destaque-erro"
              : n <= 80
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(2)}%</span>`;
        },
      },
    ];

    this._renderizarKpis([
      { label: "Fornecedores", valor: linhas.length, cor: "info" },
      {
        label: "Para concentrar 50%",
        valor: `${n50} fornecedor(es)`,
        cor: n50 <= 3 ? "erro" : "aviso",
      },
      {
        label: "Para concentrar 80%",
        valor: `${n80} fornecedor(es)`,
        cor: n80 <= 5 ? "erro" : "aviso",
      },
      {
        label: "Para concentrar 95%",
        valor: `${n95} fornecedor(es)`,
        cor: "sucesso",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: `Top ${Math.min(top10.length, topN)} · Concentração de Gasto`,
      labels: top10.map((l) =>
        l.razao_social.length > 25
          ? l.razao_social.slice(0, 23) + "…"
          : l.razao_social,
      ),
      dados: top10.map((l) => l.valor),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 25 · PEDIDOS POR ÓRGÃO
  // ============================================================
  // ------------------------------------------------------------
  // Cruzamento órgão × pedidos: quantidade, valor total,
  // ticket médio, quantos foram aprovados/rejeitados/pendentes.
  // ============================================================
  async _relPedidosPorOrgao(meta) {
    const inicio = this.filtrosAtivos.dataInicio;
    const fim = this.filtrosAtivos.dataFim;

    let query = supabase
      .from("pedidos")
      .select(
        `
        id,
        valor_total,
        status_aprovacao,
        data_solicitacao,
        orgao_solicitante_id,
        orgao:orgaos(id, nome, sigla)
      `,
      )
      .order("data_solicitacao", { ascending: false });

    if (inicio) query = query.gte("data_solicitacao", inicio);
    if (fim) query = query.lte("data_solicitacao", fim);

    const { data: pedidos, error } = await query;
    if (error) throw error;

    const agrupado = {};
    (pedidos || []).forEach((p) => {
      const id = p.orgao_solicitante_id;
      if (!id) return;
      if (!agrupado[id]) {
        agrupado[id] = {
          id,
          nome: p.orgao?.nome || "Órgão não identificado",
          sigla: p.orgao?.sigla || "",
          total_pedidos: 0,
          valor_total: 0,
          aprovados: 0,
          rejeitados: 0,
          pendentes: 0,
          valor_aprovado: 0,
          valor_rejeitado: 0,
          valor_pendente: 0,
        };
      }
      const g = agrupado[id];
      g.total_pedidos += 1;
      g.valor_total += p.valor_total || 0;

      const st = p.status_aprovacao || "PEDIDO_REALIZADO";
      if (st === "APROVADO") {
        g.aprovados += 1;
        g.valor_aprovado += p.valor_total || 0;
      } else if (st === "REPROVADO") {
        g.rejeitados += 1;
        g.valor_rejeitado += p.valor_total || 0;
      } else if (st === "AGUARDANDO_APROVACAO") {
        g.pendentes += 1;
        g.valor_pendente += p.valor_total || 0;
      }
    });

    const linhas = Object.values(agrupado)
      .map((g) => ({
        ...g,
        ticket_medio: g.total_pedidos > 0 ? g.valor_total / g.total_pedidos : 0,
        taxa_aprovacao:
          g.total_pedidos > 0 ? (g.aprovados / g.total_pedidos) * 100 : 0,
      }))
      .sort((a, b) => b.valor_total - a.valor_total);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "nome", label: "Órgão" },
      { key: "sigla", label: "Sigla", align: "center" },
      {
        key: "total_pedidos",
        label: "Pedidos",
        align: "right",
      },
      {
        key: "valor_total",
        label: "Valor Total",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "ticket_medio",
        label: "Ticket Médio",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "aprovados",
        label: "Aprovados",
        align: "right",
        formato: (v) => `<span class="destaque-sucesso">${v}</span>`,
      },
      {
        key: "pendentes",
        label: "Pendentes",
        align: "right",
        formato: (v) => `<span class="destaque-aviso">${v}</span>`,
      },
      {
        key: "rejeitados",
        label: "Rejeitados",
        align: "right",
        formato: (v) => `<span class="destaque-erro">${v}</span>`,
      },
      {
        key: "taxa_aprovacao",
        label: "% Aprovação",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 80
              ? "destaque-sucesso"
              : n >= 50
                ? "destaque-aviso"
                : "destaque-erro";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
    ];

    const totalOrgaos = linhas.length;
    const totalPedidos = linhas.reduce((s, l) => s + l.total_pedidos, 0);
    const valorTotal = linhas.reduce((s, l) => s + l.valor_total, 0);
    const ticketGeral = totalPedidos > 0 ? valorTotal / totalPedidos : 0;
    const topOrgao = linhas[0];

    this._renderizarKpis([
      { label: "Órgãos Envolvidos", valor: totalOrgaos, cor: "info" },
      { label: "Total de Pedidos", valor: totalPedidos, cor: "sucesso" },
      {
        label: "Valor Total",
        valor: this.sistema.ui.formatarMoeda(valorTotal),
        cor: "aviso",
      },
      {
        label: "Maior Solicitante",
        valor: topOrgao ? topOrgao.sigla || topOrgao.nome.slice(0, 20) : "—",
        cor: "erro",
      },
    ]);

    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Órgãos por Valor de Pedidos",
      labels: top10.map((l) => l.sigla || l.nome.slice(0, 20)),
      dados: top10.map((l) => l.valor_total),
      tooltipFormatter: (v) => this.sistema.ui.formatarMoeda(v),
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // RELATÓRIO 26 · EXECUÇÃO MÉDIA POR CATEGORIA
  // ============================================================
  // ------------------------------------------------------------
  // Agrupa atas por categoria e calcula a % média de execução
  // (consumido / contratado) de cada grupo.
  // ============================================================
  async _relExecucaoMediaCategoria(meta) {
    // 1. Buscar atas ATIVA/PROXIMA com categoria e valor global
    const { data: atas, error: atasErr } = await supabase
      .from("atas")
      .select(
        `
        id,
        valor_global,
        situacao,
        categoria:categorias(id, nome)
      `,
      )
      .in("situacao", ["ATIVA", "PROXIMA"]);

    if (atasErr) throw atasErr;

    const atasIds = (atas || []).map((a) => a.id);
    if (atasIds.length === 0) {
      this.dadosAtuais = [];
      this.colunasAtuais = [];
      this._renderizarKpis([]);
      this._renderizarTabela([], []);
      return;
    }

    // 2. Buscar itens contratados e consumos
    const [itensRes, consumosRes] = await Promise.all([
      supabase
        .from("itens_ata")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
      supabase
        .from("consumos")
        .select("ata_id, valor_total")
        .in("ata_id", atasIds),
    ]);

    const contratadoPorAta = {};
    (itensRes.data || []).forEach((i) => {
      contratadoPorAta[i.ata_id] =
        (contratadoPorAta[i.ata_id] || 0) + (i.valor_total || 0);
    });

    const consumidoPorAta = {};
    (consumosRes.data || []).forEach((c) => {
      consumidoPorAta[c.ata_id] =
        (consumidoPorAta[c.ata_id] || 0) + (c.valor_total || 0);
    });

    // 3. Agrupar por categoria
    const agrupado = {};
    (atas || []).forEach((a) => {
      const catId = a.categoria?.id || "__sem__";
      const catNome = a.categoria?.nome || "Sem categoria";
      if (!agrupado[catId]) {
        agrupado[catId] = {
          id: catId,
          nome: catNome,
          qtd_atas: 0,
          total_contratado: 0,
          total_consumido: 0,
        };
      }
      agrupado[catId].qtd_atas += 1;
      agrupado[catId].total_contratado += contratadoPorAta[a.id] || 0;
      agrupado[catId].total_consumido += consumidoPorAta[a.id] || 0;
    });

    // 4. Calcular % execução por categoria
    const linhas = Object.values(agrupado)
      .map((g) => {
        const pct =
          g.total_contratado > 0
            ? (g.total_consumido / g.total_contratado) * 100
            : 0;
        return {
          ...g,
          saldo: Math.max(0, g.total_contratado - g.total_consumido),
          percentual_execucao: pct,
        };
      })
      .sort((a, b) => b.percentual_execucao - a.percentual_execucao);

    this.dadosAtuais = linhas;

    this.colunasAtuais = [
      { key: "nome", label: "Categoria" },
      { key: "qtd_atas", label: "Nº Atas", align: "right" },
      {
        key: "total_contratado",
        label: "Contratado",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "total_consumido",
        label: "Consumido",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "saldo",
        label: "Saldo",
        align: "right",
        formato: (v) => this.sistema.ui.formatarMoeda(v),
      },
      {
        key: "percentual_execucao",
        label: "% Execução Média",
        align: "right",
        formato: (v) => {
          const n = Number(v);
          const cls =
            n >= 90
              ? "destaque-erro"
              : n >= 70
                ? "destaque-aviso"
                : "destaque-sucesso";
          return `<span class="${cls}">${n.toFixed(1)}%</span>`;
        },
      },
    ];

    const totalCategorias = linhas.length;
    const totalContratado = linhas.reduce((s, l) => s + l.total_contratado, 0);
    const totalConsumido = linhas.reduce((s, l) => s + l.total_consumido, 0);
    const pctGeral =
      totalContratado > 0 ? (totalConsumido / totalContratado) * 100 : 0;
    const lider = linhas[0];

    this._renderizarKpis([
      { label: "Categorias", valor: totalCategorias, cor: "info" },
      {
        label: "Contratado Total",
        valor: this.sistema.ui.formatarMoeda(totalContratado),
        cor: "sucesso",
      },
      {
        label: "Consumido Total",
        valor: this.sistema.ui.formatarMoeda(totalConsumido),
        cor: "aviso",
      },
      {
        label: "Execução Geral",
        valor: `${pctGeral.toFixed(1)}%`,
        cor: pctGeral >= 80 ? "erro" : "info",
      },
    ]);

    // Gráfico: % execução por categoria
    const top10 = linhas.slice(0, 10);
    this._renderizarGrafico({
      tipo: "bar-horizontal",
      titulo: "Top 10 · Categorias mais Executadas (%)",
      labels: top10.map((l) =>
        l.nome.length > 25 ? l.nome.slice(0, 23) + "…" : l.nome,
      ),
      dados: top10.map((l) => l.percentual_execucao),
      cores: top10.map((l) =>
        l.percentual_execucao >= 90
          ? "#dc2626"
          : l.percentual_execucao >= 70
            ? "#d97706"
            : "#059669",
      ),
      tooltipFormatter: (v) => `${Number(v).toFixed(1)}% executado`,
    });

    this._renderizarTabela(linhas, this.colunasAtuais);
  }

  // ============================================================
  // ============================================================
  // EXPORTAÇÃO CSV
  // ============================================================
  // Reaproveita o padrão do pedidos.js:
  //   · BOM UTF-8 no início
  //   · Separador vírgula
  //   · Download via Blob + <a> temporário
  // ============================================================
  exportarCSV() {
    if (!this.dadosAtuais || this.dadosAtuais.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Sem dados",
        "Não há dados para exportar.",
      );
      return;
    }

    const meta = this.RELATORIOS.find((r) => r.id === this.relatorioAtivo);
    const nomeBase = meta ? meta.id : "relatorio";

    const cabecalho = this.colunasAtuais.map((c) => c.label);

    const linhasTexto = this.dadosAtuais.map((linha) =>
      this.colunasAtuais.map((c) => {
        const raw = linha[c.key];

        // Datas
        if (
          c.key === "data_fim_vigencia" ||
          c.key === "data_solicitacao" ||
          c.key === "data_aprovacao" ||
          c.key === "data_alteracao" ||
          c.key === "data_prevista" ||
          c.key === "data"
        ) {
          return raw ? this.sistema.ui.formatarData(raw) : "";
        }

        // Moeda
        if (
          c.key === "valor_global" ||
          c.key === "valor_consumido" ||
          c.key === "valor_contratado" ||
          c.key === "valor_total" ||
          c.key === "saldo" ||
          c.key === "valor" ||
          c.key === "valor_impacto" ||
          c.key === "valor_divergencia" ||
          c.key === "valor_ano_base" ||
          c.key === "valor_ano_anterior" ||
          c.key === "variacao_absoluta" ||
          c.key === "menor_preco" ||
          c.key === "maior_preco" ||
          c.key === "diferenca" ||
          c.key === "valor_total_pendente" ||
          c.key === "ticket_medio" ||
          c.key === "total_contratado" ||
          c.key === "total_consumido" ||
          c.key === "valor_aprovado" ||
          c.key === "valor_rejeitado" ||
          c.key === "valor_pendente"
        ) {
          return (Number(raw) || 0).toFixed(2).replace(".", ",");
        }

        // Percentuais
        if (
          c.key === "percentual" ||
          c.key === "percentual_execucao" ||
          c.key === "percentual_acumulado" ||
          c.key === "diferenca_percentual" ||
          c.key === "taxa_aprovacao"
        ) {
          return (Number(raw) || 0).toFixed(2).replace(".", ",");
        }

        // Variação percentual (pode ser null)
        if (c.key === "variacao_percentual") {
          if (raw === null || raw === undefined) return "";
          return Number(raw).toFixed(2).replace(".", ",");
        }

        return raw === null || raw === undefined ? "" : String(raw);
      }),
    );

    const escapar = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvContent = [
      cabecalho.map(escapar).join(","),
      ...linhasTexto.map((l) => l.map(escapar).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const dataAtual = new Date().toISOString().split("T")[0];
    const nomeArquivo = `${nomeBase}_${dataAtual}.csv`;

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", nomeArquivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.sistema.ui.mostrarToast(
      "sucesso",
      "CSV exportado",
      `${this.dadosAtuais.length} registro(s) exportado(s).`,
    );
  }

  // ============================================================
  // ============================================================
  // EXPORTAÇÃO PDF
  // ============================================================
  // Reaproveita jsPDF + jspdf-autotable.
  // Cabeçalho institucional + título + filtros + tabela + rodapé.
  // ============================================================
  exportarPDF() {
    if (!this.dadosAtuais || this.dadosAtuais.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Sem dados",
        "Não há dados para exportar.",
      );
      return;
    }

    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Biblioteca PDF não carregada",
        "Recarregue a página (Ctrl+F5).",
      );
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const meta = this.RELATORIOS.find((r) => r.id === this.relatorioAtivo);
      const titulo = meta ? meta.titulo : "Relatório";

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margem = 12;

      // ---------- Cabeçalho institucional ----------
      doc.setFillColor(26, 58, 107);
      doc.rect(0, 0, pageWidth, 22, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Prefeitura de Pitangueiras", margem, 10);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Sistema de Gestão de Atas · Relatórios", margem, 16);

      // ---------- Título do relatório ----------
      let y = 32;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(titulo, margem, y);
      y += 7;

      // ---------- Subtítulo (filtros aplicados) ----------
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);

      const descricaoFiltros = this._descreverFiltrosParaPDF();
      if (descricaoFiltros) {
        doc.text(descricaoFiltros, margem, y);
        y += 5;
      }

      doc.text(
        `Gerado em: ${new Date().toLocaleString("pt-BR")}  ·  Total: ${this.dadosAtuais.length} registro(s)`,
        margem,
        y,
      );
      y += 6;

      // ---------- Montar tabela ----------
      const head = [this.colunasAtuais.map((c) => c.label)];
      const body = this.dadosAtuais.map((linha) =>
        this.colunasAtuais.map((c) => this._formatarParaPDF(c, linha)),
      );

      doc.autoTable({
        startY: y,
        head: head,
        body: body,
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 2,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [26, 58, 107],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: this._columnStylesParaPDF(),
        margin: { left: margem, right: margem },
        didDrawPage: () => {
          const pageAtual = doc.internal.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(`Página ${pageAtual}`, pageWidth - margem, pageHeight - 6, {
            align: "right",
          });
          doc.text(
            "Sistema desenvolvido pelo Departamento de Informática - Versão 1.0",
            margem,
            pageHeight - 6,
          );
        },
      });

      const dataAtual = new Date().toISOString().split("T")[0];
      const nomeArquivo = `${meta ? meta.id : "relatorio"}_${dataAtual}.pdf`;
      doc.save(nomeArquivo);

      this.sistema.ui.mostrarToast(
        "sucesso",
        "PDF gerado",
        `${this.dadosAtuais.length} registro(s) exportado(s).`,
      );
    } catch (err) {
      console.error("[Relatorios] Erro ao gerar PDF:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao gerar PDF",
        err.message || "Não foi possível gerar o arquivo.",
      );
    }
  }

  /**
   * Formata um valor de célula para o PDF (texto puro).
   */
  _formatarParaPDF(coluna, linha) {
    const raw = linha[coluna.key];

    // Datas
    if (
      coluna.key === "data_fim_vigencia" ||
      coluna.key === "data_solicitacao" ||
      coluna.key === "data_aprovacao" ||
      coluna.key === "data_alteracao" ||
      coluna.key === "data_prevista" ||
      coluna.key === "data"
    ) {
      return raw ? this.sistema.ui.formatarData(raw) : "";
    }

    // Moeda
    if (
      coluna.key === "valor_global" ||
      coluna.key === "valor_consumido" ||
      coluna.key === "valor_contratado" ||
      coluna.key === "valor_total" ||
      coluna.key === "saldo" ||
      coluna.key === "valor" ||
      coluna.key === "valor_divergencia" ||
      coluna.key === "valor_ano_base" ||
      coluna.key === "valor_ano_anterior" ||
      coluna.key === "menor_preco" ||
      coluna.key === "maior_preco" ||
      coluna.key === "diferenca" ||
      coluna.key === "valor_total_pendente" ||
      coluna.key === "ticket_medio" ||
      coluna.key === "total_contratado" ||
      coluna.key === "total_consumido"
    ) {
      return this.sistema.ui.formatarMoeda(raw).replace("R$", "").trim();
    }

    if (coluna.key === "variacao_absoluta") {
      const n = Number(raw) || 0;
      return this.sistema.ui
        .formatarMoeda(Math.abs(n))
        .replace("R$", "")
        .trim();
    }

    // Percentuais
    if (
      coluna.key === "percentual" ||
      coluna.key === "percentual_execucao" ||
      coluna.key === "percentual_acumulado" ||
      coluna.key === "diferenca_percentual" ||
      coluna.key === "taxa_aprovacao"
    ) {
      return `${(Number(raw) || 0).toFixed(2)}%`;
    }

    if (coluna.key === "variacao_percentual") {
      if (raw === null || raw === undefined) return "—";
      const n = Number(raw);
      return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
    }

    if (coluna.key === "rank") {
      return String(raw || "");
    }

    if (coluna.key === "divergencia") {
      const n = Number(raw) || 0;
      return `${n > 0 ? "+" : ""}${n}`;
    }

    if (raw === null || raw === undefined) return "";
    return String(raw);
  }

  /**
   * Estilos de coluna para o autoTable (alinhamento).
   */
  _columnStylesParaPDF() {
    const styles = {};
    const totalCols = this.colunasAtuais.length;
    if (totalCols === 0) return styles;

    this.colunasAtuais.forEach((c, i) => {
      const align =
        c.align === "right"
          ? "right"
          : c.align === "center"
            ? "center"
            : "left";
      styles[i] = { halign: align };
    });

    return styles;
  }

  /**
   * Texto descritivo dos filtros ativos, para o cabeçalho do PDF.
   */
  _descreverFiltrosParaPDF() {
    const f = this.filtrosAtivos;
    const partes = [];

    if (f.dataInicio && f.dataFim) {
      partes.push(
        `Período: ${this.sistema.ui.formatarData(f.dataInicio)} até ${this.sistema.ui.formatarData(f.dataFim)}`,
      );
    } else if (f.dataInicio) {
      partes.push(`A partir de: ${this.sistema.ui.formatarData(f.dataInicio)}`);
    } else if (f.dataFim) {
      partes.push(`Até: ${this.sistema.ui.formatarData(f.dataFim)}`);
    }

    if (f.dias) {
      partes.push(`Janela de ${f.dias} dias`);
    }

    if (f.ordenacao) {
      const mapa = {
        contratado: "Valor contratado",
        consumido: "Valor consumido",
        atas: "Nº de atas",
      };
      partes.push(`Ordenação: ${mapa[f.ordenacao] || f.ordenacao}`);
    }

    if (f.anoBase) {
      partes.push(`Ano base: ${f.anoBase}`);
    }

    if (f.agrupamento) {
      partes.push(`Agrupamento: ${f.agrupamento}`);
    }

    return partes.join("  ·  ");
  }
}
