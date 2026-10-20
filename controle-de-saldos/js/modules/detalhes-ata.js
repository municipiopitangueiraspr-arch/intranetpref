// ============================================
// controle-de-saldos/js/modules/detalhes-ata.js
// Página de detalhes da ata - Estilo E-commerce
// v20261012-ata-page-v8
//
// O que este arquivo entrega:
//  · Autenticação (Supabase) e carregamento do usuário atual.
//  · Carrinho persistido em localStorage, com badge e feedback.
//  · Carregamento da ata + fornecedor + itens + categoria.
//  · Carregamento de consumos (com valor, data e órgão) para calcular
//    saldo real e alimentar os painéis de análise.
//  · Carregamento de pedidos recentes (com órgão) para o painel
//    "Últimos registros".
//  · Renderização de: hero, summary, painel de acompanhamento (health),
//    gráficos (Chart.js), bloco B (análise, resumo, distribuição,
//    evolução, movimentações, relatório) e tabela de itens.
//  · Busca por descrição/número na tabela de itens.
//  · Impressão (window.print) e exportação em PDF (html2pdf) com
//    classe `.ata-printing` aplicada no <body> durante a operação.
// ============================================

import { supabase } from "../supabase.js";

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let ataAtual = null;
let usuarioAtual = null;
let carrinho = [];
let itensCache = {};

// ============================================
// UTILITÁRIOS
// ============================================
function mostrarToast(tipo, titulo, mensagem, duracao = 4000) {
  const container = document.getElementById("toastContainer");
  const icones = {
    sucesso: "✅",
    erro: "❌",
    aviso: "⚠️",
    info: "ℹ️",
  };

  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
        <span>${icones[tipo] || "ℹ️"}</span>
        <span><strong>${titulo}</strong><br>${mensagem}</span>
        <button class="btn-fechar" onclick="this.parentElement.remove()">✕</button>
    `;

  container.appendChild(toast);

  if (duracao > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        setTimeout(() => toast.remove(), 300);
      }
    }, duracao);
  }
}

function formatarData(data) {
  if (!data) return "—";
  try {
    const d = new Date(data);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return data;
  }
}

function formatarMoeda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "R$ 0,00";
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mostrarLoading(show) {
  const container = document.getElementById("loadingContainer");
  const content = document.getElementById("ataContent");
  const notFound = document.getElementById("notFound");

  if (container) container.style.display = show ? "flex" : "none";
  if (content) content.style.display = show ? "none" : "block";
  if (notFound) notFound.style.display = "none";
}

function mostrarNaoEncontrado() {
  const loading = document.getElementById("loadingContainer");
  const content = document.getElementById("ataContent");
  const notFound = document.getElementById("notFound");
  if (loading) loading.style.display = "none";
  if (content) content.style.display = "none";
  if (notFound) notFound.style.display = "block";
}

// ============================================
// MODO IMPRESSÃO / PDF
// --------------------------------------------
// Aplica a classe `.ata-printing` no <body> e garante que a classe
// `ata-page` permaneça presente (o CSS está escopado em
// `.ata-page.ata-printing`). Retorna uma função de cleanup que
// restaura exatamente o estado anterior.
//
// Uso:
//   const restaurar = _comModoImpressao();
//   try { ... } finally { restaurar(); }
// ============================================
function _comModoImpressao() {
  const body = document.body;
  const jaTinhaPrinting = body.classList.contains("ata-printing");
  const jaTinhaAtaPage = body.classList.contains("ata-page");

  if (!jaTinhaAtaPage) body.classList.add("ata-page");
  if (!jaTinhaPrinting) body.classList.add("ata-printing");

  return function restaurar() {
    if (!jaTinhaPrinting) body.classList.remove("ata-printing");
    if (!jaTinhaAtaPage) body.classList.remove("ata-page");
  };
}

// ============================================
// CARRINHO
// ============================================
function carregarCarrinhoStorage() {
  const stored = localStorage.getItem("carrinhoAtas");
  if (stored) {
    try {
      carrinho = JSON.parse(stored);
      console.log("📦 Carrinho carregado do storage:", carrinho);
    } catch (e) {
      console.warn("Erro ao carregar carrinho:", e);
      carrinho = [];
    }
  } else {
    console.log("📦 Nenhum carrinho encontrado no storage");
    carrinho = [];
  }
  atualizarBadgeCarrinho();
}

function salvarCarrinhoStorage() {
  console.log("💾 Salvando carrinho no storage:", carrinho);
  localStorage.setItem("carrinhoAtas", JSON.stringify(carrinho));
  atualizarBadgeCarrinho();
}

function atualizarBadgeCarrinho() {
  const badge = document.getElementById("carrinhoBadge");
  if (badge) {
    badge.textContent = carrinho.length;
  }
}

// ============================================
// ADICIONAR AO CARRINHO
// ============================================
window.adicionarAoCarrinho = function (ataId, itemId) {
  console.log("🔍 adicionarAoCarrinho chamado com:", { ataId, itemId });

  // Buscar o input pelo ID correto (apenas itemId)
  const qtdInput = document.getElementById(`qtd-${itemId}`);
  console.log("🔍 Input encontrado:", qtdInput);

  if (!qtdInput) {
    mostrarToast("erro", "Erro", "Campo de quantidade não encontrado.");
    return;
  }

  const quantidade = parseInt(qtdInput.value);
  console.log(
    "🔍 Quantidade digitada:",
    quantidade,
    "Tipo:",
    typeof quantidade,
  );

  if (!quantidade || quantidade <= 0) {
    mostrarToast(
      "aviso",
      "Quantidade inválida",
      "Informe uma quantidade válida (mínimo 1).",
    );
    qtdInput.focus();
    qtdInput.select();
    return;
  }

  // Buscar o item no cache
  const item = itensCache[itemId];
  console.log("🔍 Item encontrado no cache:", item);

  if (!item) {
    mostrarToast("erro", "Erro", "Item não encontrado no cache.");
    return;
  }

  const saldo = item.saldo_quantidade || 0;
  console.log("🔍 Saldo disponível:", saldo);

  if (quantidade > saldo) {
    mostrarToast(
      "erro",
      "Saldo insuficiente",
      `Disponível: ${saldo} unidades.`,
    );
    qtdInput.value = saldo;
    qtdInput.focus();
    qtdInput.select();
    return;
  }

  // Verificar se o item já está no carrinho
  const existente = carrinho.find(
    (c) => c.itemId === itemId && c.ataId === ataId,
  );
  if (existente) {
    const novaQtd = existente.quantidade + quantidade;
    if (novaQtd > saldo) {
      mostrarToast(
        "erro",
        "Saldo insuficiente",
        `Total solicitado (${novaQtd}) excede o saldo disponível (${saldo}).`,
      );
      return;
    }
    existente.quantidade = novaQtd;
    existente.valorTotal = existente.valorUnitario * novaQtd;
    console.log("🔄 Item atualizado no carrinho:", existente);
  } else {
    const numeroPedido = `PED-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000 + 1000))}`;
    const novoItem = {
      id: `${ataId}-${itemId}-${Date.now()}`,
      ataId: ataId,
      ataNumero: ataAtual?.numero_ata || "",
      fornecedorId: ataAtual?.fornecedor_id,
      fornecedorRazao: ataAtual?.fornecedor?.razao_social,
      fornecedorCnpj: ataAtual?.fornecedor?.cnpj,
      processo: ataAtual?.processo_administrativo,
      objeto: ataAtual?.objeto,
      itemId: itemId,
      itemNumero: item.item_numero,
      itemDescricao: item.descricao,
      quantidade: quantidade,
      valorUnitario: item.valor_unitario,
      valorTotal: item.valor_unitario * quantidade,
      numeroPedido: numeroPedido,
      data: new Date().toISOString().split("T")[0],
      solicitante: usuarioAtual?.nome,
      orgaoId: usuarioAtual?.orgao_id,
    };
    carrinho.push(novoItem);
    console.log("➕ Novo item adicionado ao carrinho:", novoItem);
  }

  salvarCarrinhoStorage();
  qtdInput.value = "";

  // Feedback visual no botão
  const btn = document.querySelector(`[data-item-id="${itemId}"]`);
  if (btn) {
    const textoOriginal = btn.innerHTML;
    btn.classList.add("adicionado");
    btn.innerHTML = '<i class="fas fa-check"></i> Adicionado!';
    setTimeout(() => {
      btn.classList.remove("adicionado");
      btn.innerHTML =
        textoOriginal || '<i class="fas fa-cart-plus"></i> Adicionar';
    }, 2000);
  }

  mostrarToast(
    "sucesso",
    "Item adicionado",
    `${item.descricao} adicionado ao carrinho!`,
  );
};

// ============================================
// ABRIR DRAWER DO CARRINHO
// ============================================
window.abrirDrawerCarrinho = function () {
  // Verificar se o sistema principal está disponível
  if (window.parent && window.parent.sistema) {
    // Usar o drawer do sistema principal
    window.parent.sistema.abrirDrawerCarrinho();
  } else {
    // Fallback: mostrar o carrinho em um toast informativo
    mostrarToast(
      "info",
      "Carrinho",
      `${carrinho.length} item(ns) no carrinho. Volte para a listagem para finalizar.`,
    );
  }
};

// ============================================
// CARREGAR DETALHES DA ATA
// ============================================
async function carregarDetalhesAta() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const ataId = urlParams.get("id");

    if (!ataId) {
      mostrarNaoEncontrado();
      return;
    }

    mostrarLoading(true);

    // Buscar dados da ata com fornecedor, itens e categoria
    const { data: ata, error } = await supabase
      .from("atas")
      .select(
        `
                *,
                fornecedor:fornecedores!fk_ata_fornecedor(razao_social,cnpj),
                itens:itens_ata!fk_item_ata(*),
                categoria:categorias!atas_categoria_id_fkey(id, nome)
            `,
      )
      .eq("id", parseInt(ataId))
      .single();

    if (error || !ata) {
      console.error("Erro ao buscar ata:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        ataId,
      });
      mostrarNaoEncontrado();
      return;
    }

    ataAtual = ata;

    // Cachear itens para acesso rápido
    ata.itens.forEach((item) => {
      itensCache[item.id] = item;
    });
    console.log("📦 Itens cacheados:", Object.keys(itensCache));

    // ------------------------------------------------------------
    // Buscar consumos para calcular saldo real e alimentar os
    // painéis de análise (financeiro, por departamento, evolução).
    // ------------------------------------------------------------
    let consumosQuery = supabase
      .from("consumos")
      .select(
        "item_ata_id, quantidade, valor_total, data_consumo, created_at, orgao_solicitante_id, orgao:orgaos!fk_consumo_orgao(nome, sigla)",
      )
      .eq("ata_id", ata.id);

    const { data: consumos, error: consumosError } = await consumosQuery;

    if (consumosError) {
      console.warn(
        "Não foi possível carregar o histórico de consumos:",
        consumosError,
      );
    }
    ata.consumos = consumos || [];

    // Calcular consumo por item
    const consumoPorItem = {};
    consumos?.forEach((c) => {
      if (!consumoPorItem[c.item_ata_id]) {
        consumoPorItem[c.item_ata_id] = 0;
      }
      consumoPorItem[c.item_ata_id] += c.quantidade || 0;
    });

    // Atualizar saldo dos itens com base nos consumos
    ata.itens.forEach((item) => {
      const consumido = consumoPorItem[item.id] || 0;
      const saldoCalculado = (item.quantidade_contratada || 0) - consumido;
      // Se o saldo no banco estiver diferente, usar o calculado (mais confiável)
      if (item.saldo_quantidade !== saldoCalculado) {
        // Não atualizamos no banco aqui, apenas para exibição
        item.saldo_quantidade = saldoCalculado;
      }
    });

    // ------------------------------------------------------------
    // Buscar pedidos recentes para o painel "Últimos registros".
    // ------------------------------------------------------------
    let pedidos = [];
    try {
      let pedidosQuery = supabase
        .from("pedidos")
        .select(
          "id, numero_pedido, valor_total, data_solicitacao, status_aprovacao, created_at, orgao_solicitante_id, orgao:orgaos!pedidos_orgao_solicitante_id_fkey(nome, sigla), itens_pedido!inner(item_ata_id)",
        )
        .eq("ata_id", ata.id)
        .order("created_at", { ascending: false })
        .limit(20);

      const result = await pedidosQuery;
      if (result.error) throw result.error;
      pedidos = result.data || [];
    } catch (pedidoError) {
      console.warn(
        "Não foi possível carregar os últimos pedidos da ata:",
        pedidoError,
      );
    }
    ata.pedidos = pedidos;

    renderizarAta(ata);
    mostrarLoading(false);
  } catch (error) {
    console.error("Erro ao carregar detalhes:", error);
    mostrarNaoEncontrado();
  }
}

// ============================================
// RENDERIZAR ATA
// ============================================
function renderizarAta(ata) {
  // Atualizar título da página
  document.title = `Ata ${ata.numero_ata} · Gestão de Atas`;
  const tituloEl = document.getElementById("ataTitulo");
  if (tituloEl) tituloEl.textContent = `Ata ${ata.numero_ata}`;

  // Atualizar informações do usuário
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = usuarioAtual?.nome || "Usuário";

  const avatar = document.getElementById("userAvatar");
  if (avatar && usuarioAtual?.nome) {
    const iniciais = usuarioAtual.nome
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    avatar.textContent = iniciais;
  }

  // ============================================================
  // Info da ata com Nº Pregão
  // ============================================================
  const numeroEl = document.getElementById("ataNumero");
  if (numeroEl) numeroEl.textContent = ata.numero_ata || "—";

  // Buscar número do pregão (pode estar em numero_pregao ou pregao_numero)
  const numeroPregao = ata.numero_pregao || ata.pregao_numero || "";
  const pregaoEl = document.getElementById("ataPregao");
  if (pregaoEl) pregaoEl.textContent = numeroPregao || "—";

  const modalidadeEl = document.getElementById("ataModalidade");
  if (modalidadeEl) modalidadeEl.textContent = ata.modalidade || "—";

  const fornecedorEl = document.getElementById("ataFornecedor");
  if (fornecedorEl) {
    fornecedorEl.textContent = ata.fornecedor?.razao_social || "—";
  }

  const cnpjEl = document.getElementById("ataCnpj");
  if (cnpjEl) cnpjEl.textContent = ata.fornecedor?.cnpj || "—";

  // Status badge
  const statusMap = {
    ATIVA: { class: "status-ativa", label: "Ativa" },
    PROXIMA: { class: "status-proxima", label: "Próxima" },
    VENCIDA: { class: "status-vencida", label: "Vencida" },
  };
  const statusInfo = statusMap[ata.situacao] || statusMap["ATIVA"];
  const statusEl = document.getElementById("ataStatus");
  if (statusEl) {
    statusEl.innerHTML = `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`;
  }

  // Dias restantes
  const diasEl = document.getElementById("ataDiasRestantes");
  if (diasEl) {
    const fim = ata.data_fim_vigencia
      ? new Date(`${String(ata.data_fim_vigencia).slice(0, 10)}T23:59:59`)
      : null;
    const hoje = new Date();
    const dias = fim ? Math.ceil((fim - hoje) / 86400000) : null;
    diasEl.className = `ata-page__days ${
      dias === null
        ? ""
        : dias < 0
          ? "ata-page__days--danger"
          : dias <= 30
            ? "ata-page__days--warning"
            : "ata-page__days--safe"
    }`;
    diasEl.textContent =
      dias === null
        ? "Prazo não informado"
        : dias < 0
          ? `Vencida há ${Math.abs(dias)} dias`
          : `${dias} dias restantes`;
  }

  // Processo / categoria / vigência
  const processoEl = document.getElementById("ataProcesso");
  if (processoEl) processoEl.textContent = ata.processo_administrativo || "—";

  const categoriaEl = document.getElementById("ataCategoria");
  if (categoriaEl) categoriaEl.textContent = ata.categoria?.nome || "—";

  const vigenciaEl = document.getElementById("ataVigencia");
  if (vigenciaEl) {
    vigenciaEl.textContent = `${formatarData(ata.data_inicio_vigencia)} até ${formatarData(
      ata.data_fim_vigencia,
    )}`;
  }

  // Calcular valor consumido
  const valorTotal = ata.itens.reduce((s, i) => s + (i.valor_total || 0), 0);
  const valorConsumido = ata.itens.reduce((s, i) => {
    const consumido =
      (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
    return s + consumido * (i.valor_unitario || 0);
  }, 0);
  const saldoAta = valorTotal - valorConsumido;

  const valorGlobalEl = document.getElementById("ataValorGlobal");
  if (valorGlobalEl) valorGlobalEl.textContent = formatarMoeda(valorTotal);

  const consumidoEl = document.getElementById("ataConsumido");
  if (consumidoEl) consumidoEl.textContent = formatarMoeda(valorConsumido);

  const saldoEl = document.getElementById("ataSaldo");
  if (saldoEl) saldoEl.textContent = formatarMoeda(saldoAta);

  const totalItensEl = document.getElementById("ataTotalItensResumo");
  if (totalItensEl) totalItensEl.textContent = ata.itens.length;

  // Renderizar itens
  renderizarItens(ata.itens);

  // Renderizar painéis de análise
  renderizarPainelAta(ata);
  renderizarBlocoB(ata);
}

// ============================================
// RENDERIZAR PAINEL DE ACOMPANHAMENTO (HEALTH)
// ============================================
function renderizarPainelAta(ata) {
  const itens = ata.itens || [];
  const dados = itens.map((item) => {
    const contratado = Number(item.quantidade_contratada) || 0;
    const saldo = Math.max(0, Number(item.saldo_quantidade) || 0);
    const consumido = Math.max(0, contratado - saldo);
    const percentual = contratado > 0 ? (consumido / contratado) * 100 : 0;
    return { item, contratado, saldo, consumido, percentual };
  });

  const totalContratado = dados.reduce(
    (sum, d) => sum + d.contratado * (Number(d.item.valor_unitario) || 0),
    0,
  );
  const totalConsumido = dados.reduce(
    (sum, d) => sum + d.consumido * (Number(d.item.valor_unitario) || 0),
    0,
  );
  const utilizacao =
    totalContratado > 0
      ? Math.min(100, (totalConsumido / totalContratado) * 100)
      : 0;

  const confortaveis = dados.filter(
    (d) => d.saldo > 0 && d.percentual < 80,
  ).length;
  const criticos = dados.filter(
    (d) => d.saldo > 0 && d.percentual >= 80,
  ).length;
  const esgotados = dados.filter((d) => d.saldo <= 0).length;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("ataTotalItens", itens.length);
  setText("ataItensConfortaveis", confortaveis);
  setText("ataItensCriticos", criticos);
  setText("ataItensEsgotados", esgotados);
  setText("ataUtilizacaoLabel", `${utilizacao.toFixed(0)}% utilizado`);

  const bar = document.getElementById("ataUtilizacaoBar");
  if (bar) {
    bar.style.width = `${utilizacao}%`;
    bar.dataset.level =
      utilizacao >= 95 ? "danger" : utilizacao >= 80 ? "warning" : "safe";
  }

  // Ranking dos itens mais utilizados
  const ranking = document.getElementById("ataRankingItens");
  if (ranking) {
    const linhas = dados
      .slice()
      .sort((a, b) => b.percentual - a.percentual)
      .slice(0, 5)
      .map((d) => {
        const descricao =
          String(d.item.descricao || "Item").slice(0, 42) || "Item";
        const numero = d.item.item_numero || "—";
        return `
          <div class="ata-ranking__row">
            <span title="${d.item.descricao || "Item"}">${numero} · ${descricao}</span>
            <b>${d.percentual.toFixed(0)}%</b>
            <i><em style="width:${Math.min(100, d.percentual)}%"></em></i>
          </div>
        `;
      })
      .join("");
    ranking.innerHTML =
      linhas ||
      '<span class="ata-ranking__empty">Nenhum item cadastrado.</span>';
  }

  // Gráficos
  if (!window.Chart) return;

  // Destrói gráficos anteriores para evitar duplicação em re-renders
  window.__ataCharts?.forEach((chart) => chart.destroy());
  window.__ataCharts = [];

  const doughnut = document.getElementById("ataGraficoConsumo");
  const barras = document.getElementById("ataGraficoItens");

  if (doughnut) {
    window.__ataCharts.push(
      new window.Chart(doughnut, {
        type: "doughnut",
        data: {
          labels: ["Consumido", "Disponível"],
          datasets: [
            {
              data: [
                totalConsumido,
                Math.max(0, totalContratado - totalConsumido),
              ],
              backgroundColor: ["#1769dc", "#dce7f3"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "70%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${formatarMoeda(ctx.raw)}`,
              },
            },
          },
        },
      }),
    );
  }

  if (barras) {
    window.__ataCharts.push(
      new window.Chart(barras, {
        type: "bar",
        data: {
          labels: ["Confortável", "Crítico", "Esgotado"],
          datasets: [
            {
              data: [confortaveis, criticos, esgotados],
              backgroundColor: ["#2aa66f", "#e79a2f", "#c64c4c"],
              borderRadius: 5,
              barThickness: 24,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
              grid: { color: "#edf1f5" },
            },
            x: { grid: { display: false } },
          },
          plugins: { legend: { display: false } },
        },
      }),
    );
  }
}

// ============================================
// RENDERIZAR BLOCO B (ANÁLISE + RESUMO + GRÁFICOS + MOVIMENTAÇÕES)
// ============================================
function renderizarBlocoB(ata) {
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );

  const itens = ata.itens || [];
  const consumos = ata.consumos || [];
  const pedidos = ata.pedidos || [];

  const financeiro = (item) =>
    Number(item.valor_total) ||
    (Number(item.quantidade_contratada) || 0) *
      (Number(item.valor_unitario) || 0);

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  // ------------------------------------------------------------
  // Itens mais consumidos (top 5 por percentual)
  // ------------------------------------------------------------
  const top = itens
    .map((item) => {
      const contratado = Number(item.quantidade_contratada) || 0;
      const saldo = Math.max(0, Number(item.saldo_quantidade) || 0);
      return {
        item,
        percentual: contratado
          ? Math.min(100, ((contratado - saldo) / contratado) * 100)
          : 0,
      };
    })
    .sort((a, b) => b.percentual - a.percentual)
    .slice(0, 5);

  const topEl = document.getElementById("ataItensMaisConsumidos");
  if (topEl) {
    const linhas = top
      .map((d) => {
        const descricao = esc((d.item.descricao || "Item").slice(0, 45));
        const numero = esc(d.item.item_numero || "—");
        return `
          <div class="ata-ranking__row">
            <span title="${esc(d.item.descricao)}"><b>${numero}</b> · ${descricao}</span>
            <b>${d.percentual.toFixed(0)}%</b>
            <i><em style="width:${d.percentual}%"></em></i>
          </div>
        `;
      })
      .join("");
    topEl.innerHTML =
      linhas ||
      '<span class="ata-ranking__empty">Nenhum item cadastrado.</span>';
  }

  // ------------------------------------------------------------
  // Resumo da ata (identificação)
  // ------------------------------------------------------------
  setText("ataResumoFornecedor", ata.fornecedor?.razao_social || "—");
  setText("ataResumoCnpj", ata.fornecedor?.cnpj || "—");
  setText(
    "ataResumoVigencia",
    `${formatarData(ata.data_inicio_vigencia)} até ${formatarData(ata.data_fim_vigencia)}`,
  );
  setText(
    "ataResumoValor",
    formatarMoeda(itens.reduce((s, i) => s + financeiro(i), 0)),
  );
  setText(
    "ataResumoSaldo",
    formatarMoeda(
      itens.reduce(
        (s, i) =>
          s +
          (Number(i.saldo_quantidade) || 0) * (Number(i.valor_unitario) || 0),
        0,
      ),
    ),
  );

  // ------------------------------------------------------------
  // Consumo por departamento
  // ------------------------------------------------------------
  const porOrgao = {};
  consumos.forEach((c) => {
    const nome = c.orgao?.sigla || c.orgao?.nome || "Não informado";
    porOrgao[nome] = (porOrgao[nome] || 0) + (Number(c.valor_total) || 0);
  });

  const escopo = document.getElementById("ataEscopoConsumo");
  const solicitante =
    String(usuarioAtual?.perfil || "").toUpperCase() === "SOLICITANTE";
  if (escopo) {
    escopo.textContent = solicitante
      ? "Exibindo apenas o consumo do seu departamento."
      : "Exibindo os registros disponíveis para o seu perfil.";
  }

  setText(
    "ataReportEscopo",
    solicitante
      ? "Escopo: departamento do solicitante"
      : "Escopo: registros autorizados para o perfil",
  );
  setText(
    "ataReportGeradoEm",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
  );

  // ------------------------------------------------------------
  // Últimos registros (pedidos)
  // ------------------------------------------------------------
  const registros = document.getElementById("ataUltimosRegistros");
  if (registros) {
    const linhas = pedidos
      .slice(0, 5)
      .map((p) => {
        const numero = esc(p.numero_pedido || "Pedido");
        const orgao = esc(
          p.orgao?.sigla || p.orgao?.nome || "Departamento não informado",
        );
        const valor = formatarMoeda(p.valor_total);
        const data = formatarData(p.data_solicitacao || p.created_at);
        return `
          <div class="ata-record">
            <div>
              <strong>${numero}</strong>
              <span>${orgao}</span>
            </div>
            <div>
              <b>${valor}</b>
              <small>${data}</small>
            </div>
          </div>
        `;
      })
      .join("");
    registros.innerHTML =
      linhas ||
      '<span class="ata-ranking__empty">Nenhum pedido encontrado para esta ata.</span>';
  }

  // ------------------------------------------------------------
  // Evolução por mês
  // ------------------------------------------------------------
  const porMes = {};
  consumos.forEach((c) => {
    const data = c.data_consumo || c.created_at;
    if (!data) return;
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    porMes[key] = (porMes[key] || 0) + (Number(c.valor_total) || 0);
  });
  const meses = Object.keys(porMes).sort();

  const vazio = document.getElementById("ataEvolucaoVazia");
  if (vazio) vazio.hidden = meses.length > 0;

  // ------------------------------------------------------------
  // Gráficos do bloco B
  // ------------------------------------------------------------
  if (!window.Chart) return;

  window.__ataBlocoBCharts?.forEach((chart) => chart.destroy());
  window.__ataBlocoBCharts = [];

  const deptCanvas = document.getElementById("ataGraficoDepartamentos");
  const evolCanvas = document.getElementById("ataGraficoEvolucao");

  if (deptCanvas) {
    window.__ataBlocoBCharts.push(
      new window.Chart(deptCanvas, {
        type: "bar",
        data: {
          labels: Object.keys(porOrgao).slice(0, 8),
          datasets: [
            {
              data: Object.values(porOrgao).slice(0, 8),
              backgroundColor: "#2b78d4",
              borderRadius: 5,
              barThickness: 18,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              beginAtZero: true,
              ticks: { callback: (v) => formatarMoeda(v) },
              grid: { color: "#edf1f5" },
            },
            y: { grid: { display: false } },
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => formatarMoeda(ctx.raw) } },
          },
        },
      }),
    );
  }

  if (evolCanvas && meses.length) {
    window.__ataBlocoBCharts.push(
      new window.Chart(evolCanvas, {
        type: "line",
        data: {
          labels: meses.map((m) => {
            const [y, mo] = m.split("-");
            return `${mo}/${y}`;
          }),
          datasets: [
            {
              label: "Consumo",
              data: meses.map((m) => porMes[m]),
              borderColor: "#1769dc",
              backgroundColor: "rgba(23,105,220,.12)",
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: "#1769dc",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => formatarMoeda(v) },
              grid: { color: "#edf1f5" },
            },
            x: { grid: { display: false } },
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => formatarMoeda(ctx.raw) } },
          },
        },
      }),
    );
  }
}

// ============================================
// IMPRIMIR RELATÓRIO (window.print)
// --------------------------------------------
// Aplica `.ata-printing` no <body>, chama window.print() e restaura
// o estado original depois. O CSS escopado em `.ata-page.ata-printing`
// cuida de todo o layout de impressão; aqui só garantimos a classe
// durante o ciclo de impressão.
// ============================================
window.imprimirRelatorioAta = function () {
  const restaurar = _comModoImpressao();

  const finalizar = () => {
    restaurar();
    window.removeEventListener("afterprint", finalizar);
  };

  window.addEventListener("afterprint", finalizar, { once: true });

  // Alguns navegadores não disparam `afterprint` de forma confiável
  // (ex.: Safari em iOS). O timeout é uma rede de segurança.
  window.setTimeout(() => {
    window.print();
    // Se afterprint não disparar, limpamos após um tempo razoável.
    window.setTimeout(() => {
      if (document.body.classList.contains("ata-printing")) {
        finalizar();
      }
    }, 1200);
  }, 60);
};

// ============================================
// EXPORTAR RELATÓRIO (html2pdf)
// --------------------------------------------
// Aplica `.ata-printing` no <body> antes de gerar o PDF, porque o
// html2pdf não dispara @media print. A classe é removida em qualquer
// cenário (sucesso, erro ou ausência do html2pdf).
// ============================================
window.exportarRelatorioAta = async function () {
  const content = document.getElementById("ataContent");

  if (!content || !window.html2pdf) {
    // Fallback: se html2pdf não estiver disponível, cai para impressão
    // nativa (que já tem seu próprio controle de classe).
    window.imprimirRelatorioAta();
    return;
  }

  const restaurar = _comModoImpressao();

  try {
    await window
      .html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: `relatorio-ata-${ataAtual?.numero_ata || "consulta"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 1.7,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: 1200,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(content)
      .save();
  } catch (error) {
    console.error("Erro ao exportar PDF:", error);
    mostrarToast(
      "erro",
      "Falha ao gerar PDF",
      "Não foi possível gerar o relatório. Tente novamente ou use Imprimir.",
    );
  } finally {
    restaurar();
  }
};

// ============================================
// RENDERIZAR ITENS
// ============================================
function renderizarItens(itens) {
  const tbody = document.getElementById("itensTableBody");
  const qtdItensEl = document.getElementById("qtdItens");
  if (qtdItensEl) {
    qtdItensEl.textContent = `${itens.length} ${
      itens.length === 1 ? "item" : "itens"
    }`;
  }

  const contador = document.getElementById("contadorItens");
  if (contador) {
    contador.textContent = `${itens.length} ${
      itens.length === 1 ? "item" : "itens"
    }`;
  }

  if (!tbody) return;

  if (!itens || itens.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <i class="fas fa-box-open"></i>
                    Nenhum item cadastrado nesta ata.
                </td>
            </tr>
        `;
    return;
  }

  const podePedir =
    usuarioAtual?.perfil === "ADMIN" ||
    usuarioAtual?.perfil === "SECRETARIO" ||
    usuarioAtual?.perfil === "SOLICITANTE";

  tbody.innerHTML = itens
    .map((item) => {
      const saldo = item.saldo_quantidade || 0;
      const qtdContratada = item.quantidade_contratada || 0;
      const percentual =
        qtdContratada > 0
          ? (((qtdContratada - saldo) / qtdContratada) * 100).toFixed(1)
          : 0;

      const saldoClass =
        saldo <= 0
          ? "saldo-zerado"
          : saldo <= qtdContratada * 0.1
            ? "saldo-baixo"
            : "saldo-alto";

      const esgotado = saldo <= 0;

      return `
            <tr>
                <td><strong>${item.item_numero || "—"}</strong></td>
                <td>${item.descricao || "—"}</td>
                <td class="numeric">${qtdContratada}</td>
                <td class="numeric ${saldoClass}">${saldo}</td>
                <td class="numeric">${formatarMoeda(item.valor_unitario)}</td>
                <td class="numeric">${formatarMoeda(item.valor_total)}</td>
                <td>
                    <div class="progresso-container">
                        <div class="progresso-bar" style="width: ${Math.min(percentual, 100)}%;"></div>
                    </div>
                    ${percentual}%
                </td>
                <td>
                    ${
                      esgotado
                        ? `
                        <span class="status-esgotado"><i class="fas fa-times-circle"></i> ESGOTADO</span>
                    `
                        : podePedir
                          ? `
                        <div class="acoes-item">
                            <input type="number" id="qtd-${item.id}" class="qtd-input"
                                   min="1" max="${saldo}" placeholder="Qtd"
                                   onchange="atualizarMaxQtd(${item.id})">
                            <button class="btn-add-carrinho" data-item-id="${item.id}"
                                    onclick="adicionarAoCarrinho(${ataAtual?.id}, ${item.id})">
                                <i class="fas fa-cart-plus"></i> Adicionar
                            </button>
                        </div>
                    `
                          : `
                        <span>
                            <i class="fas fa-lock"></i> Sem permissão
                        </span>
                    `
                    }
                </td>
            </tr>
        `;
    })
    .join("");

  // Adicionar evento para limitar quantidade pelo saldo
  document.querySelectorAll(".qtd-input").forEach((input) => {
    const max = parseInt(input.getAttribute("max")) || 0;
    input.addEventListener("change", function () {
      const val = parseInt(this.value) || 0;
      if (val > max) {
        this.value = max;
        mostrarToast(
          "aviso",
          "Limite atingido",
          `Quantidade máxima disponível: ${max}`,
        );
      }
    });
  });
}

// ============================================
// BUSCA DE ITENS
// ============================================
function configurarBuscaItens() {
  const input = document.getElementById("buscaItens");
  const tbody = document.getElementById("itensTableBody");
  const contador = document.getElementById("contadorItens");
  if (!input || !tbody) return;

  input.addEventListener("input", () => {
    const termo = input.value.trim().toLocaleLowerCase("pt-BR");
    const linhas = [...tbody.querySelectorAll("tr")];
    let visiveis = 0;
    linhas.forEach((linha) => {
      const encontrado =
        !termo || linha.textContent.toLocaleLowerCase("pt-BR").includes(termo);
      linha.hidden = !encontrado;
      if (encontrado) visiveis += 1;
    });
    if (contador) {
      contador.textContent = `${visiveis} de ${linhas.length} ${
        linhas.length === 1 ? "item" : "itens"
      }`;
    }
  });
}

// ============================================
// FUNÇÃO PARA ATUALIZAR MAX DA QUANTIDADE
// ============================================
window.atualizarMaxQtd = function (itemId) {
  const input = document.getElementById(`qtd-${itemId}`);
  const item = itensCache[itemId];
  if (input && item) {
    const max = item.saldo_quantidade || 0;
    input.setAttribute("max", max);
    const val = parseInt(input.value) || 0;
    if (val > max) {
      input.value = max;
    }
  }
};

// ============================================
// INICIALIZAÇÃO
// ============================================
async function init() {
  try {
    // Verificar autenticação
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "../../index.html";
      return;
    }

    // Buscar dados do usuário
    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("*")
      .eq("uuid", session.user.id)
      .single();

    if (userError || !usuario) {
      window.location.href = "../../index.html";
      return;
    }

    usuarioAtual = usuario;

    const userNameEl = document.getElementById("userName");
    if (userNameEl) userNameEl.textContent = usuario.nome || "Usuário";

    // Carregar carrinho
    carregarCarrinhoStorage();

    // Configurar logout
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "../../index.html";
      });
    }

    // Configurar busca
    configurarBuscaItens();

    // Carregar detalhes da ata
    await carregarDetalhesAta();
  } catch (error) {
    console.error("Erro na inicialização:", error);
    mostrarToast("erro", "Erro", "Não foi possível inicializar a página.");
  }
}

// Expor funções globalmente para uso no HTML
window.adicionarAoCarrinho = window.adicionarAoCarrinho;
window.atualizarMaxQtd = window.atualizarMaxQtd;
window.abrirDrawerCarrinho = window.abrirDrawerCarrinho;

// Iniciar
document.addEventListener("DOMContentLoaded", init);
