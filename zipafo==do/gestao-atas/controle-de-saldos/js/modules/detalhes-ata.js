// ============================================
// controle-de-saldos/js/modules/detalhes-ata.js
// Página de detalhes da ata - Estilo E-commerce
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
  return (valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
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
  document.getElementById("loadingContainer").style.display = "none";
  document.getElementById("ataContent").style.display = "none";
  document.getElementById("notFound").style.display = "block";
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
// ADICIONAR AO CARRINHO - CORRIGIDO
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
    // Fallback: mostrar o carrinho em um alerta (ou redirecionar)
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

    // Buscar dados da ata com fornecedor e itens
    const { data: ata, error } = await supabase
      .from("atas")
      .select(
        `
                *,
                fornecedor:fornecedores(*),
                itens:itens_ata(*),
                categoria:categorias(id, nome)
            `,
      )
      .eq("id", parseInt(ataId))
      .single();

    if (error || !ata) {
      console.error("Erro ao buscar ata:", error);
      mostrarNaoEncontrado();
      return;
    }

    ataAtual = ata;

    // Cachear itens para acesso rápido
    ata.itens.forEach((item) => {
      itensCache[item.id] = item;
    });
    console.log("📦 Itens cacheados:", Object.keys(itensCache));

    // Buscar consumos para calcular saldo real
    const { data: consumos } = await supabase
      .from("consumos")
      .select("item_ata_id, quantidade")
      .eq("ata_id", ata.id);

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
  document.getElementById("ataTitulo").textContent = `Ata ${ata.numero_ata}`;

  // Atualizar informações do usuário
  document.getElementById("userName").textContent =
    usuarioAtual?.nome || "Usuário";
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
  // CORREÇÃO: Info da ata com Nº Pregão
  // ============================================================
  document.getElementById("ataNumero").textContent = ata.numero_ata || "—";

  // Buscar número do pregão (pode estar em numero_pregao ou pregao_numero)
  const numeroPregao = ata.numero_pregao || ata.pregao_numero || "";
  document.getElementById("ataPregao").textContent = numeroPregao || "—";
  const modalidadeEl = document.getElementById("ataModalidade");
  if (modalidadeEl) modalidadeEl.textContent = ata.modalidade || "—";

  document.getElementById("ataFornecedor").textContent =
    ata.fornecedor?.razao_social || "—";
  document.getElementById("ataCnpj").textContent = ata.fornecedor?.cnpj || "—";

  const statusMap = {
    ATIVA: { class: "status-ativa", label: "Ativa" },
    PROXIMA: { class: "status-proxima", label: "Próxima" },
    VENCIDA: { class: "status-vencida", label: "Vencida" },
  };
  const statusInfo = statusMap[ata.situacao] || statusMap["ATIVA"];
  document.getElementById("ataStatus").innerHTML = `
        <span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>
    `;

  document.getElementById("ataProcesso").textContent =
    ata.processo_administrativo || "—";
  document.getElementById("ataCategoria").textContent =
    ata.categoria?.nome || "—";
  document.getElementById("ataVigencia").textContent =
    `${formatarData(ata.data_inicio_vigencia)} até ${formatarData(ata.data_fim_vigencia)}`;

  // Calcular valor consumido
  const valorTotal = ata.itens.reduce((s, i) => s + (i.valor_total || 0), 0);
  const valorConsumido = ata.itens.reduce((s, i) => {
    const consumido =
      (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
    return s + consumido * (i.valor_unitario || 0);
  }, 0);
  const saldoAta = valorTotal - valorConsumido;

  document.getElementById("ataValorGlobal").textContent =
    formatarMoeda(valorTotal);
  document.getElementById("ataConsumido").textContent =
    formatarMoeda(valorConsumido);
  document.getElementById("ataSaldo").textContent = formatarMoeda(saldoAta);

  // Renderizar itens
  renderizarItens(ata.itens);
}

// ============================================
// RENDERIZAR ITENS
// ============================================
function renderizarItens(itens) {
  const tbody = document.getElementById("itensTableBody");
  document.getElementById("qtdItens").textContent = `${itens.length} itens`;

  if (!itens || itens.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--neutral-400);">
                    <i class="fas fa-box-open" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>
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
                                    onclick="adicionarAoCarrinho(${ataAtual.id}, ${item.id})">
                                <i class="fas fa-cart-plus"></i> Adicionar
                            </button>
                        </div>
                    `
                          : `
                        <span style="color: var(--neutral-400); font-size: 0.75rem;">
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
    document.getElementById("userName").textContent = usuario.nome || "Usuário";

    // Carregar carrinho
    carregarCarrinhoStorage();

    // Configurar logout
    document.getElementById("btnLogout").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "../../index.html";
    });

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
