// ============================================
// controle-de-saldos/js/modules/carrinho-page.js
// Página de Carrinho - Visualização e gestão de itens
// CORRIGIDO: Pedidos sempre nascem como AGUARDANDO_APROVACAO
// ============================================

import { supabase } from "../supabase.js";

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let usuarioAtual = null;
let carrinho = [];

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

  const containerEl = document.getElementById("toastContainer");
  if (containerEl) {
    containerEl.appendChild(toast);
  } else {
    document.body.appendChild(toast);
  }

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

function formatarMoeda(valor) {
  return (valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function mostrarLoading(show) {
  const container = document.getElementById("loadingContainer");
  const content = document.getElementById("carrinhoContent");
  if (container) container.style.display = show ? "flex" : "none";
  if (content) content.style.display = show ? "none" : "block";
}

// ============================================
// CARRINHO
// ============================================
function carregarCarrinho() {
  const stored = localStorage.getItem("carrinhoAtas");
  if (stored) {
    try {
      carrinho = JSON.parse(stored);
      console.log("📦 Carrinho carregado:", carrinho);
    } catch (e) {
      console.warn("Erro ao carregar carrinho:", e);
      carrinho = [];
    }
  } else {
    carrinho = [];
  }
  return carrinho;
}

function salvarCarrinho() {
  localStorage.setItem("carrinhoAtas", JSON.stringify(carrinho));
  console.log("💾 Carrinho salvo:", carrinho);
}

// ============================================
// REMOVER ITEM
// ============================================
function removerItem(itemId) {
  carrinho = carrinho.filter((i) => i.id !== itemId);
  salvarCarrinho();
  renderizarCarrinho();
  mostrarToast("sucesso", "Item removido", "Item removido do carrinho.");
}

// ============================================
// LIMPAR CARRINHO
// ============================================
function limparCarrinho() {
  if (carrinho.length === 0) {
    mostrarToast("aviso", "Carrinho vazio", "Não há itens para remover.");
    return;
  }

  if (confirm("Tem certeza que deseja limpar todo o carrinho?")) {
    carrinho = [];
    salvarCarrinho();
    renderizarCarrinho();
    mostrarToast(
      "sucesso",
      "Carrinho limpo",
      "Todos os itens foram removidos.",
    );
  }
}

// ============================================
// FINALIZAR PEDIDO - CORRIGIDO
// ============================================
async function finalizarPedido() {
  if (carrinho.length === 0) {
    mostrarToast(
      "aviso",
      "Carrinho vazio",
      "Adicione itens ao carrinho antes de finalizar.",
    );
    return;
  }

  // Verificar se o usuário está logado
  if (!usuarioAtual) {
    mostrarToast(
      "erro",
      "Usuário não logado",
      "Faça login para finalizar o pedido.",
    );
    return;
  }

  const confirmado = confirm(
    `Deseja finalizar o pedido com ${carrinho.length} item(ns)?`,
  );
  if (!confirmado) return;

  try {
    mostrarLoading(true);

    // Agrupar itens por ata
    const pedidosPorAta = {};
    carrinho.forEach((item) => {
      if (!pedidosPorAta[item.ataId]) {
        pedidosPorAta[item.ataId] = {
          ataNumero: item.ataNumero,
          fornecedorId: item.fornecedorId,
          fornecedorRazao: item.fornecedorRazao,
          fornecedorCnpj: item.fornecedorCnpj,
          processo: item.processo,
          objeto: item.objeto,
          itens: [],
        };
      }
      pedidosPorAta[item.ataId].itens.push(item);
    });

    const dataAtual = new Date().toISOString().split("T")[0];

    // Para cada ata, criar um pedido
    for (const [ataId, pedido] of Object.entries(pedidosPorAta)) {
      const totalPedido = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);
      const numeroPedido = `PED-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

      // ============================================================
      // CORREÇÃO: Pedido sempre nasce como AGUARDANDO_APROVACAO
      // Independente do perfil do usuário
      // ============================================================
      const { data: pedidoData, error: pedidoError } = await supabase
        .from("pedidos")
        .insert({
          numero_pedido: numeroPedido,
          numero_requisicao: null,
          usuario_id: usuarioAtual.id,
          ata_id: parseInt(ataId),
          orgao_solicitante_id: usuarioAtual.orgao_id,
          fornecedor_id: pedido.fornecedorId,
          data_solicitacao: dataAtual,
          data_autorizacao: null,
          status: "PEDIDO_REALIZADO",
          observacoes: "Pedido gerado via carrinho",
          justificativa: null,
          valor_total: totalPedido,
          // ============================================================
          // CORREÇÃO: Sempre AGUARDANDO_APROVACAO
          // ============================================================
          status_aprovacao: "AGUARDANDO_APROVACAO",
          aprovado_por: null,
          data_aprovacao: null,
          observacao_aprovacao: null,
        })
        .select()
        .single();

      if (pedidoError) throw pedidoError;

      // Inserir itens do pedido
      for (const item of pedido.itens) {
        const { error: itemError } = await supabase
          .from("itens_pedido")
          .insert({
            pedido_id: pedidoData.id,
            item_ata_id: item.itemId,
            quantidade_solicitada: item.quantidade,
            valor_unitario: item.valorUnitario,
            valor_total: item.valorTotal,
          });

        if (itemError) throw itemError;
      }
    }

    // Limpar carrinho
    carrinho = [];
    salvarCarrinho();
    renderizarCarrinho();

    mostrarToast(
      "sucesso",
      "Pedido realizado",
      `${Object.keys(pedidosPorAta).length} pedido(s) gerado(s) com sucesso!`,
    );

    // Redirecionar para a lista de pedidos após 2 segundos
    setTimeout(() => {
      window.location.href = "gestao-atas.html#pedidos";
    }, 2000);
  } catch (error) {
    console.error("Erro ao finalizar pedido:", error);
    mostrarToast(
      "erro",
      "Erro",
      error.message || "Não foi possível finalizar o pedido.",
    );
  } finally {
    mostrarLoading(false);
  }
}

// ============================================
// RENDERIZAR CARRINHO
// ============================================
function renderizarCarrinho() {
  const empty = document.getElementById("carrinhoEmpty");
  const items = document.getElementById("carrinhoItems");
  const lista = document.getElementById("itensCarrinhoLista");
  const totalEl = document.getElementById("carrinhoTotal");
  const totalItensEl = document.getElementById("totalItensCarrinho");
  const qtdItensCarrinho = document.getElementById("qtdItensCarrinho");

  if (!lista) return;

  carregarCarrinho();

  if (carrinho.length === 0) {
    if (empty) empty.style.display = "flex";
    if (items) items.style.display = "none";
    if (totalItensEl) totalItensEl.textContent = "0";
    if (qtdItensCarrinho) qtdItensCarrinho.textContent = "0";
    return;
  }

  if (empty) empty.style.display = "none";
  if (items) items.style.display = "block";
  if (totalItensEl) totalItensEl.textContent = carrinho.length;
  if (qtdItensCarrinho) qtdItensCarrinho.textContent = carrinho.length;

  // Agrupar itens por ata
  const pedidosPorAta = {};
  carrinho.forEach((item) => {
    if (!pedidosPorAta[item.ataId]) {
      pedidosPorAta[item.ataId] = {
        ataNumero: item.ataNumero || "N/I",
        fornecedorRazao: item.fornecedorRazao || "",
        itens: [],
      };
    }
    pedidosPorAta[item.ataId].itens.push(item);
  });

  let html = "";
  let totalGeral = 0;

  for (const [ataId, pedido] of Object.entries(pedidosPorAta)) {
    const totalAta = pedido.itens.reduce((s, i) => s + (i.valorTotal || 0), 0);
    totalGeral += totalAta;

    html += `
            <div class="carrinho-grupo-ata">
                <div class="carrinho-grupo-header">
                    <span class="carrinho-grupo-titulo">
                        <i class="fas fa-file-contract"></i> Ata ${pedido.ataNumero}
                    </span>
                    <span class="carrinho-grupo-fornecedor">
                        <i class="fas fa-building"></i> ${pedido.fornecedorRazao || ""}
                    </span>
                </div>
                <div class="tabela-container">
                    <table class="tabela-carrinho">
                        <thead>
                            <tr>
                                <th style="width: 60px;">Item</th>
                                <th>Descrição</th>
                                <th style="width: 80px; text-align: right;">Qtd</th>
                                <th style="width: 120px; text-align: right;">Valor Unit.</th>
                                <th style="width: 130px; text-align: right;">Total</th>
                                <th style="width: 50px; text-align: center;">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pedido.itens
                              .map(
                                (i) => `
                                <tr>
                                    <td class="item-numero">${i.itemNumero || "-"}</td>
                                    <td class="item-descricao">${i.itemDescricao || "Item"}</td>
                                    <td class="numeric">${i.quantidade || 0}</td>
                                    <td class="numeric">${formatarMoeda(i.valorUnitario || 0)}</td>
                                    <td class="numeric item-total">${formatarMoeda(i.valorTotal || 0)}</td>
                                    <td style="text-align: center;">
                                        <button class="item-remover" onclick="removerItem('${i.id}')" title="Remover item">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="text-align: right; font-weight: 700;">Subtotal da Ata:</td>
                                <td class="numeric" style="font-weight: 700; color: var(--primary-700); font-size: 1.05rem;">${formatarMoeda(totalAta)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
  }

  lista.innerHTML = html;

  if (totalEl) {
    totalEl.textContent = formatarMoeda(totalGeral);
  }
}

// ============================================
// ATUALIZAR BADGE DO CARRINHO (opcional)
// ============================================
function atualizarBadgeCarrinho() {
  const badge = document.getElementById("carrinhoBadge");
  if (badge) {
    badge.textContent = carrinho.length;
  }
}

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

    const avatar = document.getElementById("userAvatar");
    if (avatar && usuario.nome) {
      const iniciais = usuario.nome
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      avatar.textContent = iniciais;
    }

    // Configurar logout
    document.getElementById("btnLogout").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "../../index.html";
    });

    // Configurar botões
    document
      .getElementById("btnLimparCarrinho")
      .addEventListener("click", limparCarrinho);
    document
      .getElementById("btnFinalizarPedido")
      .addEventListener("click", finalizarPedido);

    // Carregar e renderizar carrinho
    carregarCarrinho();
    renderizarCarrinho();
    mostrarLoading(false);

    // Atualizar badge
    atualizarBadgeCarrinho();
  } catch (error) {
    console.error("Erro na inicialização:", error);
    mostrarToast("erro", "Erro", "Não foi possível inicializar a página.");
    mostrarLoading(false);
  }
}

// Expor funções globalmente
window.removerItem = removerItem;
window.limparCarrinho = limparCarrinho;
window.finalizarPedido = finalizarPedido;

// Iniciar
document.addEventListener("DOMContentLoaded", init);
