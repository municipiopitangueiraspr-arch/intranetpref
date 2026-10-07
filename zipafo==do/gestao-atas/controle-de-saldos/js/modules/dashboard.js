// ============================================
// controle-de-saldos/js/modules/dashboard.js
// Módulo de Dashboard - Indicadores e gráficos
// ------------------------------------------------------------
// ESTRUTURA APÓS REORGANIZAÇÃO:
//
//   1. KPIs (4 cards no topo) — com sparklines
//   2. Faixa de alerta contextual (só aparece se houver pendência)
//   3. Bloco de ação principal (por perfil):
//        · SECRETARIO/ADMIN → Fila de Aprovação em destaque
//        · SOLICITANTE      → Meus Pedidos
//   4. Bloco de risco (SECRETARIO/ADMIN) → Pedidos estourando saldo
//   5. 3 colunas de indicadores: Termômetro · Aging · Top Itens
//   6. Gráfico principal (full width): Consumo por Categoria
//   7. 2 colunas médias: Próximos Vencimentos · Evolução 3 meses
//
// REMOVIDOS DA VIEW (por duplicação ou baixo valor):
//   · Ações Rápidas (duplica sidebar)
//   · Distribuição de Status (doughnut decorativo)
//   · Timeline de Atividades (existe em Relatórios)
//   · Top Fornecedores (existe em Relatórios)
//   · Atividades Recentes (legado, já estava hidden)
//
// PERFIL CONDICIONAL:
//   · ADMIN      → vê tudo
//   · SECRETARIO → vê fila de aprovação + estourando saldo
//   · SOLICITANTE→ vê "meus pedidos"
//   · ESTAGIARIO → vê como ADMIN mas sem ações críticas
//
// ⚠️ NOTA SOBRE AS FKs DUPLICADAS
// ------------------------------------------------------------
// A tabela `pedidos` tem DUAS constraints para as mesmas
// colunas (ex: `usuario_id` tem `fk_pedido_usuario` E
// `pedidos_usuario_id_fkey`). Isso confunde o PostgREST, que
// não sabe qual usar nos joins.
//
// Solução: desambiguar por COLUNA com `!`, ex:
//   usuario:usuarios!usuario_id(nome)
//   orgao:orgaos!orgao_solicitante_id(nome, sigla)
//   ata:atas!ata_id(numero_ata)
//   fornecedor:fornecedores!fornecedor_id(razao_social)
//
// Isso vale para TODOS os joins que envolvam `pedidos`.
// ============================================

import { supabase } from "../supabase.js";

export class Dashboard {
  constructor(sistema) {
    this.sistema = sistema;
    this.charts = {};

    // ============================================================
    // Estado do filtro global de período
    // ============================================================
    this.filtroPeriodo = "30d"; // hoje | 7d | 30d | 90d | ano | custom
    this.filtroDataInicio = null;
    this.filtroDataFim = null;

    // Estado do auto-refresh
    this.autoRefreshAtivo = false;
    this.autoRefreshTimer = null;
    this.autoRefreshIntervalMs = 5 * 60 * 1000; // 5 minutos

    // Cache dos últimos valores para cálculo de comparativos
    this._cacheComparativos = {
      atas: 0,
      valores: 0,
      saldos: 0,
      alertas: 0,
    };
  }

  // ============================================
  // CARREGAR CONTEÚDO DO DASHBOARD
  // ============================================
  async carregarConteudo() {
    const container = document.getElementById("dashboardContent");
    if (!container) return;

    // Buscar o template HTML
    const response = await fetch("templates/dashboard.html");
    const html = await response.text();
    container.innerHTML = html;

    // Aplicar visibilidade por perfil (esconde cards restritos)
    this.aplicarPerfil();
    this.atualizarContextoPerfil();

    // Inicializar controles (filtros, auto-refresh)
    this.inicializarFiltros();
    this.inicializarAutoRefresh();

    // Carregar todos os dados
    await this.carregarTodosDados();
  }

  // ============================================================
  // APLICAR PERFIL · esconde cards que não fazem sentido
  // ============================================================
  aplicarPerfil() {
    const perfil = this.sistema.usuarioAtual?.perfil;
    if (!perfil) return;

    document.querySelectorAll("[data-perfil]").forEach((el) => {
      const permitidos = (el.dataset.perfil || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      if (permitidos.length === 0) return;

      const visivel = permitidos.includes(perfil);
      el.style.display = visivel ? "" : "none";
    });
  }

  atualizarContextoPerfil() {
    const el = document.getElementById("dashboardContextoPerfil");
    if (!el) return;
    const perfil = this.sistema.usuarioAtual?.perfil;
    const textos = {
      ADMIN: "Visão administrativa: acompanhe a operação completa e as decisões pendentes.",
      SECRETARIO: "Visão da secretaria: priorize aprovações, riscos de saldo e vencimentos do seu órgão.",
      SOLICITANTE: "Visão do solicitante: acompanhe seus pedidos e o saldo disponível para novas solicitações.",
      ESTAGIARIO: "Visão de apoio: monitore a operação sem executar ações críticas.",
    };
    el.textContent = textos[perfil] || "Acompanhe a operação de atas, saldos e pedidos.";
  }

  // ============================================
  // CARREGAR TODOS OS DADOS
  // ============================================
  async carregarTodosDados() {
    try {
      this.aplicarPerfil();
      this.atualizarBadgesPeriodo();

      const tarefas = [
        // ---------- FAIXA DE ALERTA (topo contextual) ----------
        this.carregarFaixaAlerta(),

        // ---------- KPIs ----------
        this.carregarIndicadores(),

        // ---------- BLOCO DE AÇÃO (por perfil) ----------
        this.carregarMeusPedidos(),
        this.carregarFilaAprovacaoDestaque(),

        // ---------- BLOCO DE RISCO (secretário/admin) ----------
        this.carregarPedidosEstourandoSaldo(),

        // ---------- INDICADORES (3 colunas) ----------
        this.carregarTermometroExecucao(),
        this.carregarAgingPedidos(),
        this.carregarTopItens(),

        // ---------- GRÁFICO PRINCIPAL ----------
        this.carregarGraficoConsumo(),

        // ---------- 2 COLUNAS MÉDIAS ----------
        this.carregarVencimentos(),
        this.carregarEvolucaoMensal(),
      ];

      await Promise.allSettled(tarefas);

      this.atualizarTimestamp();
      this.esconderLoading();
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      this.sistema.ui.mostrarToast("erro", "Erro ao carregar dashboard.");
      this.esconderLoading();
    }
  }

  // ============================================
  // ATUALIZAR DASHBOARD (botão manual)
  // ============================================
  async atualizarDashboard() {
    const botoes = document.querySelectorAll(
      ".dashboard-header-right .btn-outline",
    );
    botoes.forEach((btn) => {
      btn.disabled = true;
    });

    const btnAtualizar = document.querySelector(
      '.dashboard-header-right .btn-outline[onclick*="atualizarDashboard"]',
    );
    const textoOriginal = btnAtualizar?.innerHTML;
    if (btnAtualizar) {
      btnAtualizar.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
    }

    await this.carregarTodosDados();

    botoes.forEach((btn) => {
      btn.disabled = false;
    });
    if (btnAtualizar && textoOriginal) {
      btnAtualizar.innerHTML = textoOriginal;
    }

    this.sistema.ui.mostrarToast("sucesso", "Dashboard atualizado!");
  }

  // ============================================
  // MOSTRAR/ESCONDER LOADING (skeleton)
  // ============================================
  mostrarLoading() {
    document.querySelectorAll(".lista-placeholder").forEach((el) => {
      el.style.display = "flex";
    });
    document.querySelectorAll(".grafico-placeholder").forEach((el) => {
      el.style.display = "flex";
    });
    document.querySelectorAll("canvas").forEach((el) => {
      el.style.display = "none";
    });
  }

  esconderLoading() {
    document.querySelectorAll(".lista-placeholder").forEach((el) => {
      el.style.display = "none";
    });
    document.querySelectorAll(".grafico-placeholder").forEach((el) => {
      el.style.display = "none";
    });
    document.querySelectorAll("canvas").forEach((el) => {
      if (!el.dataset.vazio) {
        el.style.display = "block";
      }
    });

    document.querySelectorAll(".skeleton-lista").forEach((el) => {
      const parent = el.parentElement;
      if (parent && parent.querySelector(".skeleton-lista")) {
        el.remove();
      }
    });
    document.querySelectorAll(".skeleton-chart").forEach((el) => el.remove());
    document
      .querySelectorAll(".skeleton-chart-line")
      .forEach((el) => el.remove());
    document
      .querySelectorAll(".skeleton-doughnut")
      .forEach((el) => el.remove());
    document.querySelectorAll(".skeleton-circle").forEach((el) => el.remove());
  }

  // ============================================
  // ATUALIZAR TIMESTAMP
  // ============================================
  atualizarTimestamp() {
    const el = document.getElementById("dataAtualizacao");
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleString("pt-BR");
    }
  }

  // ============================================================
  // HELPERS DE DATA E FILTRO GLOBAL
  // ============================================================

  obterIntervaloAtivo() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let inicio = new Date(hoje);
    let fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);

    switch (this.filtroPeriodo) {
      case "hoje":
        inicio = new Date(hoje);
        break;
      case "7d":
        inicio.setDate(hoje.getDate() - 7);
        break;
      case "30d":
        inicio.setDate(hoje.getDate() - 30);
        break;
      case "90d":
        inicio.setDate(hoje.getDate() - 90);
        break;
      case "ano":
        inicio = new Date(hoje.getFullYear(), 0, 1);
        break;
      case "custom":
        inicio = this.filtroDataInicio
          ? new Date(this.filtroDataInicio + "T00:00:00")
          : new Date(hoje);
        fim = this.filtroDataFim
          ? new Date(this.filtroDataFim + "T23:59:59")
          : new Date(hoje);
        fim.setHours(23, 59, 59, 999);
        break;
    }

    return { inicio, fim };
  }

  obterIntervaloAnterior() {
    const { inicio, fim } = this.obterIntervaloAtivo();
    const duracaoMs = fim.getTime() - inicio.getTime();

    const fimAnterior = new Date(inicio.getTime() - 1);
    const inicioAnterior = new Date(fimAnterior.getTime() - duracaoMs);

    return { inicio: inicioAnterior, fim: fimAnterior };
  }

  toISODate(d) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  formatarIntervalo(inicio, fim) {
    const opts = { day: "2-digit", month: "short", year: "numeric" };
    const i = inicio.toLocaleDateString("pt-BR", opts);
    const f = fim.toLocaleDateString("pt-BR", opts);
    return i === f ? i : `${i} até ${f}`;
  }

  atualizarBadgesPeriodo() {
    const { inicio, fim } = this.obterIntervaloAtivo();
    const texto = this.formatarIntervalo(inicio, fim);

    const elIntervalo = document.getElementById("filtroIntervaloTexto");
    if (elIntervalo) elIntervalo.textContent = texto;

    const labels = {
      hoje: "Hoje",
      "7d": "Últimos 7 dias",
      "30d": "Últimos 30 dias",
      "90d": "Últimos 90 dias",
      ano: "Este ano",
      custom: "Personalizado",
    };
    const labelAtivo = labels[this.filtroPeriodo] || "Personalizado";

    const badgeConsumo = document.getElementById("badgePeriodoConsumo");
    if (badgeConsumo) badgeConsumo.textContent = labelAtivo;

    const badgeTopItens = document.getElementById("badgePeriodoTopItens");
    if (badgeTopItens) badgeTopItens.textContent = labelAtivo;

    const badgeEvolucao = document.getElementById("badgePeriodoEvolucao");
    if (badgeEvolucao) {
      badgeEvolucao.textContent =
        this.filtroPeriodo === "ano" ? "Este ano" : "Últimos 3 meses";
    }
  }

  inicializarFiltros() {
    const pills = document.querySelectorAll("#filtroPills .pill");
    const customBox = document.getElementById("filtroCustom");

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const periodo = pill.dataset.periodo;

        if (pill.classList.contains("ativo")) return;

        pills.forEach((p) => p.classList.remove("ativo"));
        pill.classList.add("ativo");

        if (periodo === "custom") {
          if (customBox) customBox.style.display = "flex";
          const hoje = new Date();
          const inicio = new Date();
          inicio.setDate(hoje.getDate() - 30);

          const elInicio = document.getElementById("filtroDataInicio");
          const elFim = document.getElementById("filtroDataFim");
          if (elInicio && !elInicio.value)
            elInicio.value = this.toISODate(inicio);
          if (elFim && !elFim.value) elFim.value = this.toISODate(hoje);
          return;
        }

        if (customBox) customBox.style.display = "none";
        this.filtroPeriodo = periodo;
        this.filtroDataInicio = null;
        this.filtroDataFim = null;
        this.carregarTodosDados();
      });
    });

    this.filtroPeriodo = "30d";
  }

  aplicarPeriodoCustom() {
    const elInicio = document.getElementById("filtroDataInicio");
    const elFim = document.getElementById("filtroDataFim");

    const inicio = elInicio?.value;
    const fim = elFim?.value;

    if (!inicio || !fim) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Período incompleto",
        "Informe data de início e fim.",
      );
      return;
    }

    if (new Date(inicio) > new Date(fim)) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Período inválido",
        "A data de início deve ser anterior à data fim.",
      );
      return;
    }

    this.filtroPeriodo = "custom";
    this.filtroDataInicio = inicio;
    this.filtroDataFim = fim;
    this.carregarTodosDados();
  }

  // ============================================================
  // AUTO-REFRESH
  // ============================================================

  inicializarAutoRefresh() {
    const toggle = document.getElementById("autoRefreshToggle");
    if (!toggle) return;

    const salvo = localStorage.getItem("dashboard_autorefresh") === "1";
    toggle.checked = salvo;
    if (salvo) this.ativarAutoRefresh();

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        this.ativarAutoRefresh();
        localStorage.setItem("dashboard_autorefresh", "1");
        this.sistema.ui.mostrarToast(
          "info",
          "Auto-refresh ativado",
          "Os dados serão atualizados automaticamente a cada 5 minutos.",
          3500,
        );
      } else {
        this.desativarAutoRefresh();
        localStorage.setItem("dashboard_autorefresh", "0");
        this.sistema.ui.mostrarToast(
          "info",
          "Auto-refresh desativado",
          "Atualize manualmente quando desejar.",
          3000,
        );
      }
    });

    window.addEventListener("beforeunload", () => this.desativarAutoRefresh());
  }

  ativarAutoRefresh() {
    this.desativarAutoRefresh();
    this.autoRefreshAtivo = true;
    this.autoRefreshTimer = setInterval(() => {
      const content = document.getElementById("dashboardContent");
      if (content && content.style.display !== "none") {
        console.log("🔄 Auto-refresh: recarregando dados...");
        this.carregarTodosDados();
      }
    }, this.autoRefreshIntervalMs);
  }

  desativarAutoRefresh() {
    this.autoRefreshAtivo = false;
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  // ============================================================
  // SPARKLINES NOS KPIs
  // ============================================================

  desenharSparkline(canvasId, dados, cor = "#0d5e3a") {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof Chart === "undefined") return;
    if (!dados || dados.length === 0) return;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    const ctx = canvas.getContext("2d");
    this.charts[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: dados.map((_, i) => i),
        datasets: [
          {
            data: dados,
            borderColor: cor,
            backgroundColor: cor + "22",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 1.8,
          },
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        animation: { duration: 400 },
        elements: { line: { borderCapStyle: "round" } },
      },
    });
  }

  async obterSerieMensalKPI(tipo) {
    try {
      const hoje = new Date();
      const inicio = new Date();
      inicio.setMonth(inicio.getMonth() - 5);
      inicio.setDate(1);

      const { data: consumos } = await supabase
        .from("consumos")
        .select("valor_total, data_consumo, created_at")
        .gte("data_consumo", this.toISODate(inicio));

      const meses = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        meses[key] = 0;
      }

      consumos?.forEach((c) => {
        const dt = c.data_consumo || c.created_at;
        if (!dt) return;
        const d = new Date(dt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key in meses) meses[key] += c.valor_total || 0;
      });

      const serie = Object.values(meses);

      if (serie.every((v) => v === 0)) {
        return [0.4, 0.55, 0.5, 0.65, 0.6, 0.75];
      }

      return serie;
    } catch (err) {
      return [0.5, 0.6, 0.55, 0.7, 0.65, 0.8];
    }
  }

  formatarComparativo(valorAtual, valorAnterior) {
    if (
      valorAnterior === 0 ||
      valorAnterior === null ||
      valorAnterior === undefined
    ) {
      if (valorAtual === 0) {
        return `<i class="fas fa-minus"></i> Sem variação`;
      }
      return `<i class="fas fa-arrow-up"></i> Novo`;
    }

    const diff = valorAtual - valorAnterior;
    const pct = (diff / valorAnterior) * 100;
    const absPct = Math.abs(pct).toFixed(1);

    if (Math.abs(pct) < 0.5) {
      return `<i class="fas fa-minus"></i> Estável`;
    }
    if (pct > 0) {
      return `<i class="fas fa-arrow-up"></i> +${absPct}% vs. anterior`;
    }
    return `<i class="fas fa-arrow-down"></i> -${absPct}% vs. anterior`;
  }

  renderizarComparativo(elementId, texto, positivo = null) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = texto;
    el.classList.remove("positivo", "negativo");
    if (positivo === true) el.classList.add("positivo");
    else if (positivo === false) el.classList.add("negativo");
  }

  // ============================================================
  // DRILL-DOWN · NAVEGAÇÃO
  // ============================================================

  irParaConsulta(filtro = {}) {
    try {
      sessionStorage.setItem(
        "consulta_filtro_externo",
        JSON.stringify(filtro || {}),
      );
    } catch (e) {
      console.warn(e);
    }
    this.sistema.ativarTab("consulta");
  }

  irParaGestao() {
    this.sistema.ativarTab("gestao");
  }

  scrollParaAlertas() {
    const card = document.getElementById("cardAlertasPrioritarios");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  abrirDetalhesCategoria(categoria) {
    if (!categoria) return;
    this.sistema.ui.mostrarToast(
      "info",
      "Detalhes da categoria",
      `Filtrando consulta por "${categoria}"…`,
      3000,
    );
    this.irParaConsulta({ categoria });
  }

  abrirDetalhesFornecedor(fornecedorId, fornecedorNome) {
    if (!fornecedorId) return;
    this.irParaConsulta({ fornecedor: fornecedorId });
  }

  // ============================================================
  // EXPORTAÇÃO PDF e CSV
  // ============================================================

  async exportarPDF() {
    try {
      if (typeof window.jspdf === "undefined") {
        throw new Error("Biblioteca jsPDF não carregada.");
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const { inicio, fim } = this.obterIntervaloAtivo();
      const periodoLabel = this.formatarIntervalo(inicio, fim);

      doc.setFillColor(13, 94, 58);
      doc.rect(0, 0, 210, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Prefeitura de Pitangueiras", 15, 13);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Dashboard · Gestão de Atas", 15, 21);

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.text(`Período: ${periodoLabel}`, 15, 40);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 15, 46);

      const ler = (id) =>
        document.getElementById(id)?.textContent?.trim() || "--";

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Indicadores Principais", 15, 58);

      const kpis = [
        ["Atas Ativas", ler("kpiAtasAtivas")],
        ["Valor Contratado", ler("kpiValorContratado")],
        ["Saldo Disponível", ler("kpiSaldoDisponivel")],
        ["Alertas", ler("kpiAlertas")],
      ];
      let y = 66;
      kpis.forEach(([label, valor]) => {
        doc.setFont("helvetica", "normal");
        doc.text(`${label}:`, 15, y);
        doc.setFont("helvetica", "bold");
        doc.text(valor, 70, y);
        y += 6;
      });

      const faixa = document.getElementById("dashboardFaixaAlerta");
      if (faixa && faixa.style.display !== "none") {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Pendências", 15, y + 4);
        y += 12;

        const itensFaixa = faixa.querySelectorAll(".alerta-faixa-item");
        itensFaixa.forEach((el) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          const texto =
            el.querySelector(".alerta-faixa-texto")?.textContent?.trim() || "";
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          const linhas = doc.splitTextToSize(`• ${texto}`, 180);
          doc.text(linhas, 15, y);
          y += linhas.length * 5 + 2;
        });
      }

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        "Sistema de Gestão de Atas · Departamento de Compras e Licitações",
        105,
        290,
        { align: "center" },
      );

      const nome = `dashboard_${this.toISODate(new Date())}.pdf`;
      doc.save(nome);
      this.sistema.ui.mostrarToast("sucesso", "PDF exportado com sucesso!");
    } catch (err) {
      console.error(err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao exportar PDF",
        err.message || "Não foi possível gerar o arquivo.",
      );
    }
  }

  async exportarExcel() {
    try {
      const { inicio, fim } = this.obterIntervaloAtivo();

      const ler = (id) =>
        document.getElementById(id)?.textContent?.trim() || "--";

      const linhas = [];
      linhas.push(["Indicador", "Valor"]);
      linhas.push(["Período", this.formatarIntervalo(inicio, fim)]);
      linhas.push(["Atas Ativas", ler("kpiAtasAtivas")]);
      linhas.push(["Valor Contratado", ler("kpiValorContratado")]);
      linhas.push(["Saldo Disponível", ler("kpiSaldoDisponivel")]);
      linhas.push(["Alertas", ler("kpiAlertas")]);
      linhas.push([]);
      linhas.push(["Pendências", ""]);

      const faixa = document.getElementById("dashboardFaixaAlerta");
      if (faixa && faixa.style.display !== "none") {
        faixa.querySelectorAll(".alerta-faixa-item").forEach((el) => {
          const texto =
            el.querySelector(".alerta-faixa-texto")?.textContent?.trim() || "";
          linhas.push([texto, ""]);
        });
      }

      const csv = linhas
        .map((row) =>
          row
            .map((v) => {
              const s = String(v ?? "").replace(/"/g, '""');
              return `"${s}"`;
            })
            .join(";"),
        )
        .join("\n");

      const conteudo = "\uFEFF" + csv;
      const blob = new Blob([conteudo], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard_${this.toISODate(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.sistema.ui.mostrarToast("sucesso", "CSV exportado com sucesso!");
    } catch (err) {
      console.error(err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao exportar",
        err.message || "Não foi possível gerar o arquivo.",
      );
    }
  }

  // ============================================
  // 1. INDICADORES (KPIs) - 4 CARDS
  // ============================================
  async carregarIndicadores() {
    try {
      const dados = await this.sistema.consulta.getIndicadoresDashboard();

      if (!dados) {
        throw new Error("Não foi possível carregar os indicadores");
      }

      const percentualConsumido =
        dados.valorTotal > 0
          ? (dados.valorConsumido / dados.valorTotal) * 100
          : 0;
      const percentualSaldo =
        dados.valorTotal > 0 ? (dados.saldoTotal / dados.valorTotal) * 100 : 0;

      // ---------- KPI 1: ATAS ----------
      document.getElementById("kpiAtasAtivas").textContent = dados.totalAtas;
      const atasDetalhe = document.getElementById("kpiAtasDetalhe");
      if (atasDetalhe) {
        atasDetalhe.innerHTML = `
          <span class="badge badge-success">${dados.totalAtas || 0} Ativas</span>
          <span class="badge badge-info">${dados.totalItens || 0} itens</span>
        `;
      }

      const compAtas = this.formatarComparativo(
        dados.totalAtas,
        this._cacheComparativos.atas,
      );
      this.renderizarComparativo(
        "kpiAtasComparativo",
        compAtas,
        dados.totalAtas >= this._cacheComparativos.atas,
      );
      this._cacheComparativos.atas = dados.totalAtas;

      // ---------- KPI 2: VALORES ----------
      document.getElementById("kpiValorContratado").textContent =
        this.sistema.ui.formatarMoeda(dados.valorTotal);
      const valoresDetalhe = document.getElementById("kpiValoresDetalhe");
      if (valoresDetalhe) {
        valoresDetalhe.innerHTML = `
          <span>Consumido: ${this.sistema.ui.formatarMoeda(dados.valorConsumido)}</span>
          <span class="badge badge-info">${percentualConsumido.toFixed(1)}%</span>
        `;
      }
      const compValores = this.formatarComparativo(
        dados.valorTotal,
        this._cacheComparativos.valores,
      );
      this.renderizarComparativo(
        "kpiValoresComparativo",
        compValores,
        dados.valorTotal >= this._cacheComparativos.valores,
      );
      this._cacheComparativos.valores = dados.valorTotal;

      // ---------- KPI 3: SALDOS ----------
      document.getElementById("kpiSaldoDisponivel").textContent =
        this.sistema.ui.formatarMoeda(dados.saldoUtilizavel ?? dados.saldoTotal);
      const saldosDetalhe = document.getElementById("kpiSaldosDetalhe");
      if (saldosDetalhe) {
        const saldoFisico = document.getElementById("kpiSaldoFisicoDetalhe");
        const saldoReservado = document.getElementById("kpiSaldoReservadoDetalhe");
        if (saldoFisico) saldoFisico.textContent = `Saldo físico: ${this.sistema.ui.formatarMoeda(dados.saldoTotal)}`;
        if (saldoReservado) saldoReservado.textContent = `Reservado: ${this.sistema.ui.formatarMoeda(dados.valorReservado || 0)}`;
        saldosDetalhe.title = `${percentualSaldo.toFixed(1)}% do valor contratado ainda está em saldo físico; o valor reservado considera pedidos aguardando aprovação.`;
      }
      const compSaldos = this.formatarComparativo(
        dados.saldoTotal,
        this._cacheComparativos.saldos,
      );
      this.renderizarComparativo(
        "kpiSaldosComparativo",
        compSaldos,
        dados.saldoTotal >= this._cacheComparativos.saldos,
      );
      this._cacheComparativos.saldos = dados.saldoTotal;

      // ---------- KPI 4: ALERTAS ----------
      const alertas = await this.sistema.gestao.getAlertasDashboard();
      const totalAlertas = alertas?.totalAlertas || 0;
      document.getElementById("kpiAlertas").textContent = totalAlertas;
      const alertasDetalhe = document.getElementById("kpiAlertasDetalhe");
      if (alertasDetalhe) {
        alertasDetalhe.innerHTML = `
          <span class="badge badge-danger">${alertas?.itensCriticos || 0} críticos</span>
          <span class="badge badge-warning">${alertas?.atasVencendo || 0} vencendo</span>
          <span class="badge badge-info">${alertas?.pedidosAntigos || 0} pedidos</span>
        `;
      }
      const compAlertas = this.formatarComparativo(
        totalAlertas,
        this._cacheComparativos.alertas,
      );
      this.renderizarComparativo(
        "kpiAlertasComparativo",
        compAlertas,
        totalAlertas <= this._cacheComparativos.alertas,
      );
      this._cacheComparativos.alertas = totalAlertas;

      // ---------- SPARKLINES ----------
      const serieAtas = await this.obterSerieMensalKPI("atas");
      this.desenharSparkline("sparklineAtasCanvas", serieAtas, "#0d5e3a");

      const serieValores = await this.obterSerieMensalKPI("valores");
      this.desenharSparkline("sparklineValoresCanvas", serieValores, "#059669");

      const serieSaldos = await this.obterSerieMensalKPI("saldos");
      this.desenharSparkline("sparklineSaldosCanvas", serieSaldos, "#d97706");

      const serieAlertas = await this.obterSerieMensalKPI("alertas");
      this.desenharSparkline("sparklineAlertasCanvas", serieAlertas, "#dc2626");
    } catch (error) {
      console.error("Erro ao carregar indicadores:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao carregar indicadores do dashboard.",
      );
    }
  }

  // ============================================================
  // FAIXA DE ALERTA CONTEXTUAL (topo)
  // ============================================================
  async carregarFaixaAlerta() {
    try {
      const faixa = document.getElementById("dashboardFaixaAlerta");
      const conteudo = document.getElementById("dashboardFaixaAlertaConteudo");
      if (!faixa || !conteudo) return;

      const perfil = this.sistema.usuarioAtual?.perfil;
      const usuarioId = this.sistema.usuarioAtual?.id;
      const itens = [];

      // ---------- SOLICITANTE: meus pedidos pendentes ----------
      if (perfil === "SOLICITANTE") {
        if (!usuarioId) {
          faixa.style.display = "none";
          return;
        }

        const { count, error } = await supabase
          .from("pedidos")
          .select("*", { count: "exact", head: true })
          .eq("usuario_id", usuarioId)
          .eq("status_aprovacao", "AGUARDANDO_APROVACAO");

        if (error) throw error;

        if ((count || 0) > 0) {
          itens.push({
            tipo: "aviso",
            icone: "fa-hourglass-half",
            texto: `Você tem ${count} pedido(s) aguardando aprovação.`,
            acao: () => this.sistema.ativarTab("pedidos"),
          });
        }
      }

      // ---------- SECRETARIO / ADMIN: fila + vencimentos ----------
      if (perfil === "ADMIN" || perfil === "SECRETARIO") {
        let query = supabase
          .from("pedidos")
          .select("*", { count: "exact", head: true })
          .eq("status_aprovacao", "AGUARDANDO_APROVACAO");

        if (perfil === "SECRETARIO" && this.sistema.usuarioAtual?.orgao_id) {
          query = query.eq(
            "orgao_solicitante_id",
            this.sistema.usuarioAtual.orgao_id,
          );
        }

        const { count: countPedidos, error: e1 } = await query;
        if (e1) throw e1;

        if ((countPedidos || 0) > 0) {
          itens.push({
            tipo: "aviso",
            icone: "fa-clipboard-check",
            texto: `${countPedidos} pedido(s) aguardando sua aprovação.`,
            acao: () => this.sistema.ativarTab("pedidos"),
          });
        }

        const hoje = new Date();
        const quinze = new Date();
        quinze.setDate(hoje.getDate() + 15);

        const { count: countVenc, error: e2 } = await supabase
          .from("atas")
          .select("*", { count: "exact", head: true })
          .gte("data_fim_vigencia", this.toISODate(hoje))
          .lte("data_fim_vigencia", this.toISODate(quinze))
          .in("situacao", ["ATIVA", "PROXIMA"]);

        if (e2) throw e2;

        if ((countVenc || 0) > 0) {
          itens.push({
            tipo: "critico",
            icone: "fa-calendar-times",
            texto: `${countVenc} ata(s) vencem nos próximos 15 dias.`,
            acao: () => this.irParaConsulta({ tipo: "vencimento", dias: 15 }),
          });
        }
      }

      if (itens.length === 0) {
        faixa.style.display = "none";
        conteudo.innerHTML = "";
        return;
      }

      faixa.style.display = "flex";
      conteudo.innerHTML = itens
        .map(
          (i, idx) => `
          <button
            type="button"
            class="alerta-faixa-item alerta-faixa-${i.tipo}"
            data-alerta-faixa-idx="${idx}"
          >
            <i class="fas ${i.icone}"></i>
            <span class="alerta-faixa-texto">${this._escapeHtml(i.texto)}</span>
            <i class="fas fa-arrow-right alerta-faixa-seta"></i>
          </button>
        `,
        )
        .join("");

      conteudo.querySelectorAll(".alerta-faixa-item").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = parseInt(el.dataset.alertaFaixaIdx);
          if (itens[idx]?.acao) itens[idx].acao();
        });
      });
    } catch (error) {
      console.error("Erro ao carregar faixa de alerta:", error);
      const faixa = document.getElementById("dashboardFaixaAlerta");
      if (faixa) faixa.style.display = "none";
    }
  }

  // ============================================================
  // MEUS PEDIDOS (solicitante)
  // ============================================================
  async carregarMeusPedidos() {
    try {
      const container = document.getElementById("listaMeusPedidos");
      if (!container) return;

      const perfil = this.sistema.usuarioAtual?.perfil;
      if (perfil !== "SOLICITANTE") {
        return;
      }

      const usuarioId = this.sistema.usuarioAtual?.id;
      if (!usuarioId) {
        this.mostrarVazioLista(
          container,
          "fa-user-slash",
          "Usuário não identificado",
          "",
        );
        return;
      }

      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select(
          `
          id,
          numero_pedido,
          valor_total,
          data_solicitacao,
          status_aprovacao,
          ata:atas!ata_id(numero_ata)
        `,
        )
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!pedidos || pedidos.length === 0) {
        this.mostrarVazioLista(
          container,
          "fa-inbox",
          "Nenhum pedido ainda",
          "Quando você fizer um pedido, ele aparece aqui.",
        );
        return;
      }

      const rotulos = {
        AGUARDANDO_APROVACAO: {
          label: "Aguardando",
          classe: "status-aguardando",
        },
        APROVADO: { label: "Aprovado", classe: "status-aprovado" },
        REPROVADO: { label: "Rejeitado", classe: "status-rejeitado" },
        PEDIDO_REALIZADO: {
          label: "Realizado",
          classe: "status-aprovado",
        },
      };

      container.innerHTML = pedidos
        .map((p) => {
          const st = p.status_aprovacao || "PEDIDO_REALIZADO";
          const info = rotulos[st] || rotulos.PEDIDO_REALIZADO;
          return `
          <div
            class="lista-item clickable"
            onclick="sistema.ativarTab('pedidos')"
          >
            <div class="item-info">
              <span class="item-titulo">${this._escapeHtml(p.numero_pedido || "N/I")}</span>
              <span class="item-subtitulo">
                <i class="fas fa-file-contract"></i>
                Ata ${this._escapeHtml(p.ata?.numero_ata || "N/I")} ·
                ${this.sistema.ui.formatarData(p.data_solicitacao)}
              </span>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
              <span class="item-valor">${this.sistema.ui.formatarMoeda(p.valor_total || 0)}</span>
              <span class="status-badge ${info.classe}" style="font-size:0.6rem;">${info.label}</span>
            </div>
          </div>
        `;
        })
        .join("");
    } catch (error) {
      console.error("Erro ao carregar meus pedidos:", error);
    }
  }

  // ============================================================
  // FILA DE APROVAÇÃO EM DESTAQUE (secretário)
  // ------------------------------------------------------------
  // ✅ CORRIGIDO · Desambigua as FKs com !coluna:
  //   usuario → usuarios!usuario_id
  //   orgao   → orgaos!orgao_solicitante_id
  //   ata     → atas!ata_id
  // ============================================================
  async carregarFilaAprovacaoDestaque() {
    try {
      const container = document.getElementById("filaAprovacaoDestaque");
      if (!container) return;

      const perfil = this.sistema.usuarioAtual?.perfil;
      if (perfil !== "ADMIN" && perfil !== "SECRETARIO") {
        return;
      }

      let query = supabase
        .from("pedidos")
        .select(
          `
          id,
          numero_pedido,
          valor_total,
          created_at,
          data_solicitacao,
          usuario:usuarios!usuario_id(nome),
          orgao:orgaos!orgao_solicitante_id(nome, sigla),
          ata:atas!ata_id(numero_ata)
        `,
        )
        .eq("status_aprovacao", "AGUARDANDO_APROVACAO")
        .order("created_at", { ascending: true });

      if (perfil === "SECRETARIO" && this.sistema.usuarioAtual?.orgao_id) {
        query = query.eq(
          "orgao_solicitante_id",
          this.sistema.usuarioAtual.orgao_id,
        );
      }

      const { data: pedidos, error } = await query;
      if (error) throw error;

      if (!pedidos || pedidos.length === 0) {
        container.innerHTML = `
          <div class="fila-destaque-vazia">
            <i class="fas fa-check-circle"></i>
            <div>
              <strong>Nada na fila</strong>
              <p>Nenhum pedido aguardando sua aprovação.</p>
            </div>
          </div>
        `;
        return;
      }

      const total = pedidos.length;
      const visiveis = pedidos.slice(0, 5);
      const restantes = total - visiveis.length;
      const valorTotal = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0);

      container.innerHTML = `
        <div class="fila-destaque-header">
          <div class="fila-destaque-titulo">
            <i class="fas fa-clipboard-check"></i>
            <span>
              <strong>${total}</strong>
              ${total === 1 ? "pedido aguardando" : "pedidos aguardando"} sua aprovação
            </span>
          </div>
          <span class="fila-destaque-total">
            Valor total: <strong>${this.sistema.ui.formatarMoeda(valorTotal)}</strong>
          </span>
        </div>

        <ul class="fila-destaque-lista">
          ${visiveis
            .map((p) => {
              const dias = Math.max(
                0,
                Math.floor(
                  (new Date() - new Date(p.data_solicitacao || p.created_at)) /
                    (1000 * 60 * 60 * 24),
                ),
              );
              const urgencia =
                dias >= 15 ? "urgente" : dias >= 7 ? "atencao" : "ok";
              return `
              <li class="fila-destaque-item" data-urgencia="${urgencia}">
                <span class="fila-item-numero">${this._escapeHtml(p.numero_pedido || "N/I")}</span>
                <span class="fila-item-orgao">
                  <i class="fas fa-building"></i>
                  ${this._escapeHtml(p.orgao?.sigla || p.orgao?.nome || "—")}
                </span>
                <span class="fila-item-ata">
                  <i class="fas fa-file-contract"></i>
                  ${this._escapeHtml(p.ata?.numero_ata || "N/I")}
                </span>
                <span class="fila-item-dias ${urgencia}">${dias}d</span>
                <span class="fila-item-valor">${this.sistema.ui.formatarMoeda(p.valor_total || 0)}</span>
              </li>
            `;
            })
            .join("")}
          ${
            restantes > 0
              ? `<li class="fila-destaque-mais">… e mais ${restantes} pedido(s)</li>`
              : ""
          }
        </ul>

        <div class="fila-destaque-acoes">
          <button
            type="button"
            class="btn-fila-ver-todos"
            id="btnFilaVerTodos"
          >
            <i class="fas fa-list"></i> Ver fila completa
          </button>
        </div>
      `;

      document
        .getElementById("btnFilaVerTodos")
        ?.addEventListener("click", () => {
          try {
            sessionStorage.setItem(
              "pedidos_filtro_inicial",
              JSON.stringify({ status: "AGUARDANDO_APROVACAO" }),
            );
          } catch (e) {
            /* silencioso */
          }
          this.sistema.ativarTab("pedidos");
        });
    } catch (error) {
      console.error("Erro ao carregar fila de aprovação em destaque:", error);
    }
  }

  // ============================================================
  // PEDIDOS ESTOURANDO SALDO (secretário/admin)
  // ------------------------------------------------------------
  // ✅ CORRIGIDO · Desambigua a FK com !coluna:
  //   orgao → orgaos!orgao_solicitante_id
  // ============================================================
  async carregarPedidosEstourandoSaldo() {
    try {
      const container = document.getElementById("listaEstourandoSaldo");
      const card = document.getElementById("cardEstourandoSaldo");
      if (!container || !card) return;

      const perfil = this.sistema.usuarioAtual?.perfil;
      if (perfil !== "ADMIN" && perfil !== "SECRETARIO") {
        return;
      }

      let queryPed = supabase
        .from("pedidos")
        .select(
          `
          id,
          numero_pedido,
          orgao:orgaos!orgao_solicitante_id(nome, sigla),
          status_aprovacao
        `,
        )
        .eq("status_aprovacao", "AGUARDANDO_APROVACAO");

      if (perfil === "SECRETARIO" && this.sistema.usuarioAtual?.orgao_id) {
        queryPed = queryPed.eq(
          "orgao_solicitante_id",
          this.sistema.usuarioAtual.orgao_id,
        );
      }

      const { data: pedidos, error: e1 } = await queryPed;
      if (e1) throw e1;

      if (!pedidos || pedidos.length === 0) {
        card.style.display = "none";
        return;
      }

      const pedidoIds = pedidos.map((p) => p.id);

      const { data: itensPedido, error: e2 } = await supabase
        .from("itens_pedido")
        .select(
          `
          pedido_id,
          item_ata_id,
          quantidade_solicitada,
          valor_total,
          item:itens_ata(
            id,
            item_numero,
            descricao,
            saldo_quantidade,
            ata:atas(numero_ata)
          )
        `,
        )
        .in("pedido_id", pedidoIds);

      if (e2) throw e2;

      const riscos = [];
      (itensPedido || []).forEach((ip) => {
        const item = ip.item;
        if (!item) return;
        const saldo = item.saldo_quantidade || 0;
        const solicitado = ip.quantidade_solicitada || 0;
        if (solicitado > saldo) {
          const pedido = pedidos.find((p) => p.id === ip.pedido_id);
          riscos.push({
            pedido_id: ip.pedido_id,
            numero_pedido: pedido?.numero_pedido || "N/I",
            orgao: pedido?.orgao?.sigla || pedido?.orgao?.nome || "—",
            ata: item.ata?.numero_ata || "N/I",
            item_numero: item.item_numero || "—",
            descricao: item.descricao || "—",
            saldo,
            solicitado,
            falta: solicitado - saldo,
            valor_total: ip.valor_total || 0,
          });
        }
      });

      if (riscos.length === 0) {
        card.style.display = "none";
        return;
      }

      card.style.display = "";
      const top = riscos.slice(0, 5);
      const restantes = riscos.length - top.length;

      container.innerHTML = `
        <div class="risco-lista">
          ${top
            .map(
              (r) => `
            <div class="risco-item">
              <div class="risco-item-info">
                <div class="risco-item-linha-1">
                  <strong>${this._escapeHtml(r.numero_pedido)}</strong>
                  <span class="risco-item-orgao">${this._escapeHtml(r.orgao)}</span>
                </div>
                <div class="risco-item-linha-2">
                  Ata ${this._escapeHtml(r.ata)} · Item ${this._escapeHtml(r.item_numero)}:
                  ${this._escapeHtml((r.descricao || "").slice(0, 50))}
                </div>
              </div>
              <div class="risco-item-falta">
                <span class="risco-falta-valor">−${r.falta}</span>
                <span class="risco-falta-label">abaixo do solicitado</span>
              </div>
            </div>
          `,
            )
            .join("")}
          ${
            restantes > 0
              ? `<div class="risco-mais">… e mais ${restantes} item(ns) em risco</div>`
              : ""
          }
        </div>
      `;
    } catch (error) {
      console.error("Erro ao carregar pedidos estourando saldo:", error);
      const card = document.getElementById("cardEstourandoSaldo");
      if (card) card.style.display = "none";
    }
  }

  // ============================================
  // GRÁFICO: CONSUMO POR CATEGORIA
  // ============================================
  async carregarGraficoConsumo() {
    try {
      const canvas = document.getElementById("graficoConsumoCanvas");
      if (!canvas) return;

      const { inicio, fim } = this.obterIntervaloAtivo();

      let query = supabase
        .from("consumos")
        .select("valor_total, item_ata_id, data_consumo, created_at")
        .gte("data_consumo", this.toISODate(inicio))
        .lte("data_consumo", this.toISODate(fim));

      const { data: consumos, error } = await query;

      if (error) throw error;

      if (!consumos || consumos.length === 0) {
        this.mostrarVazio(
          "graficoConsumo",
          "fa-inbox",
          "Nenhum consumo no período",
        );
        return;
      }

      const itemIds = [
        ...new Set(consumos.map((c) => c.item_ata_id).filter(Boolean)),
      ];
      const { data: itens } = await supabase
        .from("itens_ata")
        .select("id, categoria, descricao")
        .in("id", itemIds);

      const categoriaPorItem = {};
      itens?.forEach((item) => {
        categoriaPorItem[item.id] = item.categoria || "Outros";
      });

      const categorias = {};
      consumos.forEach((c) => {
        const categoria = categoriaPorItem[c.item_ata_id] || "Outros";
        categorias[categoria] =
          (categorias[categoria] || 0) + (c.valor_total || 0);
      });

      const sorted = Object.entries(categorias)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const labels = sorted.map((s) => s[0]);
      const data = sorted.map((s) => s[1]);

      if (data.length === 0) {
        this.mostrarVazio(
          "graficoConsumo",
          "fa-inbox",
          "Nenhum consumo no período",
        );
        return;
      }

      if (typeof Chart !== "undefined") {
        if (this.charts.consumo) this.charts.consumo.destroy();

        const ctx = canvas.getContext("2d");
        const self = this;

        this.charts.consumo = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Consumo (R$)",
                data: data,
                backgroundColor: [
                  "#0d5e3a",
                  "#1a3a6b",
                  "#059669",
                  "#d97706",
                  "#dc2626",
                  "#7c3aed",
                  "#0891b2",
                  "#b45309",
                ],
                borderRadius: 6,
                borderSkipped: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
              if (elements.length > 0) {
                const idx = elements[0].index;
                const cat = labels[idx];
                self.abrirDetalhesCategoria(cat);
              }
            },
            onHover: (evt, elements) => {
              canvas.style.cursor = elements.length > 0 ? "pointer" : "default";
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return `R$ ${context.parsed.y.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}`;
                  },
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function (value) {
                    return `R$ ${value.toLocaleString("pt-BR")}`;
                  },
                },
              },
            },
          },
        });

        canvas.style.display = "block";
        document.querySelector("#graficoConsumo .skeleton-chart")?.remove();
      } else {
        this.renderizarGraficoSimples("graficoConsumo", labels, data);
      }
    } catch (error) {
      console.error("Erro ao carregar gráfico de consumo:", error);
    }
  }

  // ============================================
  // PEDIDOS PENDENTES (widget simples, mantido para fallback)
  // ============================================
  async carregarPedidosPendentes() {
    try {
      const container = document.getElementById("listaPedidosPendentes");
      if (!container) return;

      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select(
          "id, numero_pedido, valor_total, data_solicitacao, usuario_id, ata_id",
        )
        .eq("status_aprovacao", "AGUARDANDO_APROVACAO")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!pedidos || pedidos.length === 0) {
        this.mostrarVazioLista(
          container,
          "fa-check-circle",
          "Nenhum pedido pendente",
          "Todos os pedidos foram processados.",
          "var(--success-600)",
        );
        return;
      }

      const userIds = pedidos.map((p) => p.usuario_id).filter(Boolean);
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("id, nome")
        .in("id", userIds);
      const usuarioMap = {};
      usuarios?.forEach((u) => (usuarioMap[u.id] = u.nome));

      const ataIds = pedidos.map((p) => p.ata_id).filter(Boolean);
      const { data: atas } = await supabase
        .from("atas")
        .select("id, numero_ata")
        .in("id", ataIds);
      const ataMap = {};
      atas?.forEach((a) => (ataMap[a.id] = a.numero_ata));

      container.innerHTML = pedidos
        .map(
          (p) => `
        <div class="lista-item clickable" onclick="sistema.ativarTab('pedidos')">
          <div class="item-info">
            <span class="item-titulo">${p.numero_pedido || "N/I"}</span>
            <span class="item-subtitulo">
              <i class="fas fa-file-contract"></i> Ata ${ataMap[p.ata_id] || "N/I"} ·
              ${usuarioMap[p.usuario_id] || "Usuário"}
            </span>
          </div>
          <div class="item-valor warning">${this.sistema.ui.formatarMoeda(p.valor_total || 0)}</div>
        </div>
      `,
        )
        .join("");
    } catch (error) {
      console.error("Erro ao carregar pedidos pendentes:", error);
    }
  }

  // ============================================
  // PRÓXIMOS VENCIMENTOS
  // ============================================
  async carregarVencimentos() {
    try {
      const container = document.getElementById("listaVencimentos");
      if (!container) return;

      const hoje = new Date();
      const trintaDias = new Date();
      trintaDias.setDate(trintaDias.getDate() + 30);

      const { data: atas, error } = await supabase
        .from("atas")
        .select(
          "id, numero_ata, data_fim_vigencia, fornecedor_id, valor_global, situacao",
        )
        .gte("data_fim_vigencia", hoje.toISOString().split("T")[0])
        .lte("data_fim_vigencia", trintaDias.toISOString().split("T")[0])
        .in("situacao", ["ATIVA", "PROXIMA"])
        .order("data_fim_vigencia", { ascending: true })
        .limit(5);

      if (error) throw error;

      if (!atas || atas.length === 0) {
        this.mostrarVazioLista(
          container,
          "fa-calendar-check",
          "Nenhum vencimento próximo",
          "Nenhuma ata vence nos próximos 30 dias.",
          "var(--success-600)",
        );
        return;
      }

      const fornecedorIds = atas.map((a) => a.fornecedor_id).filter(Boolean);
      const { data: fornecedores } = await supabase
        .from("fornecedores")
        .select("id, razao_social")
        .in("id", fornecedorIds);
      const fornecedorMap = {};
      fornecedores?.forEach((f) => (fornecedorMap[f.id] = f.razao_social));

      container.innerHTML = atas
        .map((a) => {
          const dias = Math.ceil(
            (new Date(a.data_fim_vigencia) - hoje) / (1000 * 60 * 60 * 24),
          );
          const statusClass = dias <= 7 ? "urgente" : "warning";

          return `
          <div class="lista-item clickable" onclick="sistema.consulta.abrirDetalhes(${a.id})">
            <div class="item-info">
              <span class="item-titulo">Ata ${a.numero_ata}</span>
              <span class="item-subtitulo">
                <i class="fas fa-building"></i> ${fornecedorMap[a.fornecedor_id] || "N/I"}
              </span>
            </div>
            <div class="item-valor ${statusClass}">
              ${dias} dia${dias !== 1 ? "s" : ""}
            </div>
          </div>
        `;
        })
        .join("");
    } catch (error) {
      console.error("Erro ao carregar vencimentos:", error);
    }
  }

  // ============================================
  // EVOLUÇÃO MENSAL · 3 MESES
  // ============================================
  async carregarEvolucaoMensal() {
    try {
      const canvas = document.getElementById("graficoEvolucaoCanvas");
      if (!canvas) return;

      const hoje = new Date();
      const tresMeses = new Date();
      tresMeses.setMonth(tresMeses.getMonth() - 3);

      const { data: consumos, error } = await supabase
        .from("consumos")
        .select("valor_total, data_consumo, created_at")
        .gte("data_consumo", tresMeses.toISOString().split("T")[0])
        .order("data_consumo", { ascending: true });

      if (error) throw error;

      const meses = {};
      const mesesLabels = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("pt-BR", {
          month: "short",
          year: "numeric",
        });
        meses[key] = { total: 0, label: label };
        mesesLabels.push(key);
      }

      consumos?.forEach((c) => {
        const data = c.data_consumo || c.created_at;
        if (data) {
          const d = new Date(data);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (meses[key]) {
            meses[key].total += c.valor_total || 0;
          }
        }
      });

      const labels = mesesLabels.map((k) => meses[k]?.label || k);
      const data = mesesLabels.map((k) => meses[k]?.total || 0);

      if (data.every((v) => v === 0)) {
        this.mostrarVazio(
          "graficoEvolucao",
          "fa-inbox",
          "Nenhum consumo nos últimos 3 meses",
        );
        return;
      }

      if (typeof Chart !== "undefined") {
        if (this.charts.evolucao) this.charts.evolucao.destroy();

        const ctx = canvas.getContext("2d");
        this.charts.evolucao = new Chart(ctx, {
          type: "line",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Consumo Mensal (R$)",
                data: data,
                borderColor: "#0d5e3a",
                backgroundColor: "rgba(13, 94, 58, 0.1)",
                fill: true,
                tension: 0.4,
                pointBackgroundColor: "#0d5e3a",
                pointBorderColor: "white",
                pointBorderWidth: 2,
                pointRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return `R$ ${context.parsed.y.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}`;
                  },
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function (value) {
                    return `R$ ${value.toLocaleString("pt-BR")}`;
                  },
                },
              },
            },
          },
        });

        canvas.style.display = "block";
        document
          .querySelector("#graficoEvolucao .skeleton-chart-line")
          ?.remove();
      } else {
        this.renderizarGraficoSimples("graficoEvolucao", labels, data, true);
      }
    } catch (error) {
      console.error("Erro ao carregar evolução mensal:", error);
    }
  }

  // ============================================
  // TERMÔMETRO DE EXECUÇÃO
  // ============================================
  async carregarTermometroExecucao() {
    try {
      const container = document.getElementById("termometroExecucao");
      if (!container) return;

      const { data: atas } = await supabase
        .from("atas")
        .select("id, valor_global")
        .in("situacao", ["ATIVA", "PROXIMA"]);

      const totalContratado = (atas || []).reduce(
        (s, a) => s + (a.valor_global || 0),
        0,
      );

      const { data: consumos } = await supabase
        .from("consumos")
        .select("valor_total");

      const totalConsumido = (consumos || []).reduce(
        (s, c) => s + (c.valor_total || 0),
        0,
      );

      const percentual =
        totalContratado > 0
          ? Math.min((totalConsumido / totalContratado) * 100, 100)
          : 0;
      const disponivel = totalContratado - totalConsumido;

      const raio = 78;
      const circunferencia = 2 * Math.PI * raio;
      const offset = circunferencia * (1 - percentual / 100);

      container.innerHTML = `
        <div class="termometro-svg">
          <svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="gradienteTermometro" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#10b981" />
                <stop offset="100%" stop-color="#0d5e3a" />
              </linearGradient>
            </defs>
            <circle class="track" cx="90" cy="90" r="${raio}" />
            <circle
              class="progress"
              cx="90"
              cy="90"
              r="${raio}"
              stroke-dasharray="${circunferencia}"
              stroke-dashoffset="${offset}"
            />
          </svg>
          <div class="termometro-valor-central">
            <div class="percentual">${percentual.toFixed(0)}%</div>
            <div class="rotulo">Consumido</div>
          </div>
        </div>
        <div class="termometro-info">
          <div class="termometro-info-item">
            <div class="valor consumido">${this.sistema.ui.formatarMoeda(totalConsumido)}</div>
            <div class="label">Consumido</div>
          </div>
          <div class="termometro-info-item">
            <div class="valor disponivel">${this.sistema.ui.formatarMoeda(disponivel)}</div>
            <div class="label">Disponível</div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error("Erro ao carregar termômetro:", error);
    }
  }

  // ============================================
  // AGING DE PEDIDOS
  // ============================================
  async carregarAgingPedidos() {
    try {
      const container = document.getElementById("agingPedidos");
      if (!container) return;

      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select("id, created_at, status_aprovacao")
        .eq("status_aprovacao", "AGUARDANDO_APROVACAO");

      if (error) throw error;

      if (!pedidos || pedidos.length === 0) {
        container.innerHTML = `
          <div class="aging-vazio">
            <i class="fas fa-check-circle"></i>
            Nenhum pedido parado. Tudo em dia!
          </div>
        `;
        return;
      }

      const hoje = new Date();
      const faixas = { ok: 0, atencao: 0, alerta: 0, critico: 0 };

      pedidos.forEach((p) => {
        const dt = new Date(p.created_at);
        const dias = Math.floor((hoje - dt) / (1000 * 60 * 60 * 24));
        if (dias <= 7) faixas.ok++;
        else if (dias <= 15) faixas.atencao++;
        else if (dias <= 30) faixas.alerta++;
        else faixas.critico++;
      });

      const maxValor = Math.max(
        faixas.ok,
        faixas.atencao,
        faixas.alerta,
        faixas.critico,
        1,
      );

      const linhas = [
        { label: "0–7 dias", valor: faixas.ok, classe: "aging-ok" },
        { label: "8–15 dias", valor: faixas.atencao, classe: "aging-atencao" },
        { label: "16–30 dias", valor: faixas.alerta, classe: "aging-alerta" },
        { label: "+30 dias", valor: faixas.critico, classe: "aging-critico" },
      ];

      container.innerHTML = `<div class="aging-lista">${linhas
        .map(
          (l) => `
          <div class="aging-item">
            <div class="aging-label">${l.label}</div>
            <div class="aging-bar-wrap">
              <div class="aging-bar ${l.classe}" style="width: ${Math.max((l.valor / maxValor) * 100, 3)}%">
                ${l.valor > 0 ? l.valor : ""}
              </div>
            </div>
            <div class="aging-count">${l.valor}</div>
          </div>
        `,
        )
        .join("")}</div>`;
    } catch (error) {
      console.error("Erro ao carregar aging de pedidos:", error);
    }
  }

  // ============================================
  // TOP ITENS MAIS CONSUMIDOS
  // ============================================
  async carregarTopItens() {
    try {
      const container = document.getElementById("listaTopItens");
      if (!container) return;

      const { inicio, fim } = this.obterIntervaloAtivo();

      let query = supabase
        .from("consumos")
        .select("item_ata_id, quantidade, valor_total")
        .gte("data_consumo", this.toISODate(inicio))
        .lte("data_consumo", this.toISODate(fim));

      const { data: consumos, error } = await query;

      if (error) throw error;

      if (!consumos || consumos.length === 0) {
        this.mostrarVazioLista(
          container,
          "fa-inbox",
          "Nenhum consumo no período",
          "Ajuste o filtro de período ou aguarde novas movimentações.",
        );
        return;
      }

      const porItem = {};
      consumos.forEach((c) => {
        if (!c.item_ata_id) return;
        if (!porItem[c.item_ata_id]) {
          porItem[c.item_ata_id] = { quantidade: 0, valor: 0 };
        }
        porItem[c.item_ata_id].quantidade += c.quantidade || 0;
        porItem[c.item_ata_id].valor += c.valor_total || 0;
      });

      const itemIds = Object.keys(porItem).map((id) => parseInt(id));

      const { data: itens } = await supabase
        .from("itens_ata")
        .select("id, descricao, item_numero, ata_id, unidade_medida")
        .in("id", itemIds);

      const itemMap = {};
      itens?.forEach((it) => (itemMap[it.id] = it));

      const ranking = Object.entries(porItem)
        .map(([id, info]) => ({
          id: parseInt(id),
          ...info,
          item: itemMap[parseInt(id)],
        }))
        .filter((r) => r.item)
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 5);

      if (ranking.length === 0) {
        this.mostrarVazioLista(
          container,
          "fa-inbox",
          "Nenhum item identificado",
          "Não foi possível mapear os itens consumidos.",
        );
        return;
      }

      container.innerHTML = `<div class="top-itens-lista">${ranking
        .map((r, idx) => {
          const medalha =
            idx === 0
              ? "🥇"
              : idx === 1
                ? "🥈"
                : idx === 2
                  ? "🥉"
                  : String(idx + 1);
          const itemNum = r.item?.item_numero ? `#${r.item.item_numero}` : "";
          const unidade = r.item?.unidade_medida || "un";

          return `
            <div class="top-item top-${idx + 1}">
              <div class="top-medalha">${medalha}</div>
              <div class="top-info">
                <div class="top-descricao">${r.item?.descricao || "Item"}</div>
                <div class="top-meta">
                  <span>${itemNum}</span>
                  <span><i class="fas fa-coins"></i> ${this.sistema.ui.formatarMoeda(r.valor)}</span>
                </div>
              </div>
              <div class="top-quantidade">
                ${r.quantidade}
                <small>${unidade}</small>
              </div>
            </div>
          `;
        })
        .join("")}</div>`;
    } catch (error) {
      console.error("Erro ao carregar top itens:", error);
    }
  }

  // ============================================================
  // HELPERS · EMPTY STATES
  // ============================================================

  mostrarVazio(containerId, icone = "fa-inbox", mensagem = "Sem dados") {
    const container = document.getElementById(containerId);
    if (!container) return;

    const canvas = container.querySelector("canvas");
    if (canvas) {
      canvas.style.display = "none";
      canvas.dataset.vazio = "1";
    }

    container.querySelector(".skeleton-chart")?.remove();
    container.querySelector(".skeleton-chart-line")?.remove();
    container.querySelector(".skeleton-doughnut")?.remove();
    container.querySelector(".skeleton-circle")?.remove();
    container.querySelector(".grafico-placeholder")?.remove();

    if (!container.querySelector(".empty-state")) {
      const el = document.createElement("div");
      el.className = "empty-state";
      el.innerHTML = `
        <i class="fas ${icone} empty-icon"></i>
        <div class="empty-titulo">${mensagem}</div>
        <div class="empty-descricao">Os dados aparecerão aqui quando houver movimentação.</div>
      `;
      container.appendChild(el);
    }
  }

  mostrarVazioLista(
    container,
    icone = "fa-inbox",
    titulo = "Sem dados",
    descricao = "",
    corIcone = null,
  ) {
    if (!container) return;
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas ${icone} empty-icon" ${corIcone ? `style="color:${corIcone}"` : ""}></i>
        <div class="empty-titulo">${titulo}</div>
        <div class="empty-descricao">${descricao}</div>
      </div>
    `;
  }

  // ============================================
  // GRÁFICO SIMPLES (FALLBACK SEM CHART.JS)
  // ============================================
  renderizarGraficoSimples(containerId, labels, data, isLine = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const max = Math.max(...data, 1);
    const colors = [
      "#0d5e3a",
      "#1a3a6b",
      "#059669",
      "#d97706",
      "#dc2626",
      "#7c3aed",
      "#0891b2",
      "#b45309",
    ];

    let html = `<div class="grafico-simples" style="padding: 10px;">`;

    if (isLine) {
      const pontos = data
        .map((v, i) => {
          const altura = (v / max) * 100;
          return `<div class="grafico-ponto" style="height: ${Math.max(altura, 5)}px; background: ${colors[i % colors.length]};"></div>`;
        })
        .join("");

      html += `
        <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 120px; gap: 8px;">
          ${pontos}
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.6rem; color: var(--neutral-400);">
          ${labels.map((l) => `<span>${l}</span>`).join("")}
        </div>
      `;
    } else {
      html += `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${data
            .map((v, i) => {
              const percent = (v / max) * 100;
              return `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.7rem; width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${labels[i]}</span>
                <div style="flex: 1; height: 20px; background: var(--neutral-200); border-radius: 4px; overflow: hidden;">
                  <div style="height: 100%; width: ${Math.max(percent, 2)}%; background: ${colors[i % colors.length]}; border-radius: 4px; transition: width 0.3s;"></div>
                </div>
                <span style="font-size: 0.7rem; font-weight: 600; min-width: 80px; text-align: right;">${this.sistema.ui.formatarMoeda(v)}</span>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // ============================================================
  // HELPERS INTERNOS
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
}
