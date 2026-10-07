// ============================================
// controle-de-saldos/js/modules/carrinho.js
// Módulo do Carrinho — versão SPA integrada ao
// layout compartilhado (shared/js/layout.js).
//
// Substitui js/modules/carrinho-page.js (que era
// uma página standalone). Aqui o carrinho é uma
// VIEW do sistema, renderizada dentro de
// <div id="carrinhoContent"> em gestao-atas.html.
//
// Regras mantidas da versão original:
//   · Pedido sempre nasce como AGUARDANDO_APROVACAO
//   · Um pedido por ATA (agrupamento por ataId)
//   · Carrinho persistido em localStorage via
//     sistema.salvarCarrinhoStorage()
//
// ✅ NOVO · LOCAL DE ENTREGA
//   Ao finalizar, abre um modal que mostra um bloco
//   por ATA (que vai virar pedido). Cada bloco tem
//   um campo obrigatório de local de entrega, com
//   autocomplete (datalist) baseado nos locais já
//   usados antes. Checkbox "aplicar a todos" ajuda
//   quando todos os pedidos vão pro mesmo lugar.
//
// ✅ ATUALIZADO · MODAL MOVIDO PARA O HTML PRINCIPAL
//   O modal `#modalFinalizacao` foi MOVIDO de dentro
//   do `gerarHTML()` para o HTML principal
//   (`gestao-atas.html`). Motivo: o FAB (drawer
//   flutuante) precisa abrir esse modal mesmo que a
//   view SPA do carrinho nunca tenha sido renderizada.
//
//   Consequências:
//     · `gerarHTML()` não inclui mais o bloco do modal
//     · Os listeners do modal usam uma flag
//       `_modalEventosConectados` para não duplicar
//     · `_abrirModalFinalizacao()` funciona de qualquer
//       origem (FAB ou view SPA)
//     · Um aviso contextual (`#finalizacaoAvisoFab`)
//       é mostrado quando o modal é aberto pelo FAB
// ============================================

import { supabase } from "../supabase.js";

export class Carrinho {
  constructor(sistema) {
    this.sistema = sistema;

    // ============================================================
    // ESTADO · cache de locais de entrega sugeridos
    // ------------------------------------------------------------
    // Preenchido no primeiro clique em "Finalizar Pedido".
    // Guarda os locais já usados em pedidos anteriores para
    // popular o <datalist> do modal.
    // ============================================================
    this._locaisSugeridos = null;

    // ============================================================
    // ESTADO · dados temporários do modal de finalização
    // ------------------------------------------------------------
    // Guarda o agrupamento por ATA para reusar depois do
    // usuário preencher os locais.
    // ============================================================
    this._pedidosPendentes = null;

    // ============================================================
    // ✅ NOVO · Flag para não duplicar listeners do modal
    // ------------------------------------------------------------
    // Como o modal agora vive no HTML principal e pode ser
    // aberto/fechado várias vezes, precisamos garantir que os
    // listeners sejam conectados UMA VEZ SÓ.
    // ============================================================
    this._modalEventosConectados = false;
  }

  // ============================================================
  // CARREGAR CONTEÚDO DA VIEW
  // Chamado por sistema.ativarTab("carrinho")
  // ============================================================
  async carregarConteudo() {
    const container = document.getElementById("carrinhoContent");
    if (!container) {
      console.warn(
        "[Carrinho] #carrinhoContent não encontrado em gestao-atas.html.",
      );
      return;
    }

    // Renderiza a estrutura base da view
    container.innerHTML = this.gerarHTML();

    // Relê o carrinho do localStorage (garante dados atualizados)
    this.sistema.carregarCarrinhoStorage();

    // Configura eventos dos botões da view
    this.configurarEventos();

    // ✅ Garante que os listeners do modal também estejam conectados
    // (mesmo que a view nunca tenha sido renderizada antes)
    this._conectarEventosModalFinalizacao();

    // Renderiza o estado atual (vazio ou itens)
    this.renderizar();
  }

  // ============================================================
  // HTML BASE DA VIEW
  // ------------------------------------------------------------
  // ✅ ATUALIZADO · O bloco `#modalFinalizacao` e o
  // `<datalist id="locaisEntregaList">` NÃO são mais gerados
  // aqui — eles vivem no HTML principal (gestao-atas.html).
  //
  // Isso permite que o FAB (drawer) abra o modal mesmo que
  // esta view nunca tenha sido renderizada.
  // ============================================================
  gerarHTML() {
    return `
      <div class="carrinho-view">
        <!-- Breadcrumb -->
        <div class="breadcrumb-carrinho">
          <a href="#consulta" id="breadcrumbInicio">Início</a>
          <span class="separator">/</span>
          <span class="current">Meu Carrinho</span>
          <span
            style="
              margin-left: auto;
              font-size: 0.8rem;
              color: var(--neutral-400);
            "
          >
            <i class="fas fa-shopping-cart"></i>
            <span id="qtdItensCarrinho">0</span> itens
          </span>
        </div>

        <!-- Loading (oculto por padrão — load é instantâneo do storage) -->
        <div class="loading-container" id="carrinhoLoading" style="display: none">
          <div class="loading-spinner"></div>
          <p>Processando…</p>
        </div>

        <!-- Conteúdo -->
        <div id="carrinhoViewContent">
          <!-- Carrinho vazio -->
          <div class="carrinho-empty" id="carrinhoEmpty" style="display: none">
            <div class="empty-icon">
              <i class="fas fa-shopping-cart"></i>
            </div>
            <h2>Seu carrinho está vazio</h2>
            <p>
              Navegue pelas atas disponíveis e adicione os itens que você precisa.
            </p>
            <button class="btn-continuar-comprando" id="btnContinuarComprando">
              <i class="fas fa-store"></i> Continuar Comprando
            </button>
          </div>

          <!-- Itens do carrinho -->
          <div id="carrinhoItems" style="display: none">
            <div id="itensCarrinhoLista"></div>

            <div class="carrinho-resumo">
              <div class="carrinho-resumo-left">
                <div class="total-itens">
                  <strong id="totalItensCarrinho">0</strong> item(ns) no carrinho
                </div>
              </div>
              <div class="carrinho-total">
                <span class="total-label">Total:</span>
                <span class="carrinho-total-value" id="carrinhoTotal"
                  >R$ 0,00</span
                >
              </div>
              <div class="carrinho-actions">
                <button class="btn-limpar-carrinho" id="btnLimparCarrinho">
                  <i class="fas fa-trash-alt"></i> Limpar Carrinho
                </button>
                <button class="btn-finalizar-pedido" id="btnFinalizarPedido">
                  <i class="fas fa-check-circle"></i> Finalizar Pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // CONFIGURAÇÃO DE EVENTOS DA VIEW SPA
  // ============================================================
  configurarEventos() {
    // Botão "Continuar Comprando" — navega para a view de consulta
    const btnContinuar = document.getElementById("btnContinuarComprando");
    if (btnContinuar) {
      btnContinuar.addEventListener("click", () => {
        this.sistema.ativarTab("consulta");
      });
    }

    // Link "Início" do breadcrumb — navega para a view de consulta
    const breadcrumbInicio = document.getElementById("breadcrumbInicio");
    if (breadcrumbInicio) {
      breadcrumbInicio.addEventListener("click", (e) => {
        e.preventDefault();
        this.sistema.ativarTab("consulta");
      });
    }

    // Botão "Limpar Carrinho"
    const btnLimpar = document.getElementById("btnLimparCarrinho");
    if (btnLimpar) {
      btnLimpar.addEventListener("click", () => this.limparCarrinho());
    }

    // Botão "Finalizar Pedido" (da view SPA)
    const btnFinalizar = document.getElementById("btnFinalizarPedido");
    if (btnFinalizar) {
      btnFinalizar.addEventListener("click", () => this.finalizarPedido());
    }
  }

  // ============================================================
  // ✅ NOVO · CONECTAR EVENTOS DO MODAL DE FINALIZAÇÃO
  // ------------------------------------------------------------
  // Como o modal `#modalFinalizacao` agora vive no HTML principal
  // e pode ser aberto tanto pela view SPA quanto pelo FAB, os
  // listeners precisam ser conectados UMA VEZ SÓ.
  //
  // A flag `_modalEventosConectados` garante idempotência.
  //
  // Se o modal não existir no DOM (ex: HTML antigo sem o novo
  // bloco), o método sai silenciosamente sem quebrar nada.
  // ============================================================
  _conectarEventosModalFinalizacao() {
    if (this._modalEventosConectados) return;

    const modal = document.getElementById("modalFinalizacao");
    if (!modal) {
      // Não loga warning — pode ser que ainda não tenha sido
      // adicionado o bloco (HTML antigo). Simplesmente ignora.
      return;
    }

    // Botão fechar (X)
    document
      .getElementById("btnFecharModalFinalizacao")
      ?.addEventListener("click", () => this._fecharModalFinalizacao());

    // Botão Cancelar
    document
      .getElementById("btnCancelarFinalizacao")
      ?.addEventListener("click", () => this._fecharModalFinalizacao());

    // Botão Confirmar Pedido
    document
      .getElementById("btnConfirmarFinalizacao")
      ?.addEventListener("click", () => this._executarCriacaoPedidos());

    // Checkbox "aplicar a todos"
    document
      .getElementById("aplicarTodosLocais")
      ?.addEventListener("change", (e) =>
        this._onChangeAplicarTodos(e.target.checked),
      );

    // Fechar modal clicando fora do conteúdo
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this._fecharModalFinalizacao();
      }
    });

    // Fechar modal com ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const m = document.getElementById("modalFinalizacao");
        if (m?.classList.contains("active")) {
          this._fecharModalFinalizacao();
        }
      }
    });

    this._modalEventosConectados = true;
  }

  // ============================================================
  // RENDERIZAÇÃO PRINCIPAL
  // ============================================================
  renderizar() {
    const carrinho = this.sistema.carrinho || [];

    // Atualiza contadores
    const qtdItens = document.getElementById("qtdItensCarrinho");
    if (qtdItens) qtdItens.textContent = carrinho.length;

    const totalItens = document.getElementById("totalItensCarrinho");
    if (totalItens) totalItens.textContent = carrinho.length;

    const empty = document.getElementById("carrinhoEmpty");
    const items = document.getElementById("carrinhoItems");

    // Estado vazio
    if (carrinho.length === 0) {
      if (empty) empty.style.display = "flex";
      if (items) items.style.display = "none";
      return;
    }

    // Estado com itens
    if (empty) empty.style.display = "none";
    if (items) items.style.display = "block";

    this.renderizarGrupos();
  }

  // ============================================================
  // RENDERIZA OS GRUPOS DE ITENS (UM BLOCO POR ATA)
  // ============================================================
  renderizarGrupos() {
    const lista = document.getElementById("itensCarrinhoLista");
    if (!lista) return;

    const carrinho = this.sistema.carrinho || [];

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

    for (const [, pedido] of Object.entries(pedidosPorAta)) {
      const totalAta = pedido.itens.reduce(
        (s, i) => s + (i.valorTotal || 0),
        0,
      );
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
                    <td class="numeric">${this.sistema.ui.formatarMoeda(
                      i.valorUnitario || 0,
                    )}</td>
                    <td class="numeric item-total">${this.sistema.ui.formatarMoeda(
                      i.valorTotal || 0,
                    )}</td>
                    <td style="text-align: center;">
                      <button
                        class="item-remover"
                        data-item-id="${i.id}"
                        title="Remover item"
                      >
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
                  <td colspan="4" style="text-align: right; font-weight: 700;">
                    Subtotal da Ata:
                  </td>
                  <td class="numeric subtotal-valor">
                    ${this.sistema.ui.formatarMoeda(totalAta)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    lista.innerHTML = html;

    // Atualiza total geral
    const totalEl = document.getElementById("carrinhoTotal");
    if (totalEl) {
      totalEl.textContent = this.sistema.ui.formatarMoeda(totalGeral);
    }

    // Conecta os botões de remover (delegação por data-attribute)
    lista.querySelectorAll(".item-remover").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.dataset.itemId;
        if (itemId) this.removerItem(itemId);
      });
    });
  }

  // ============================================================
  // REMOVER ITEM
  // ============================================================
  removerItem(itemId) {
    this.sistema.carrinho = (this.sistema.carrinho || []).filter(
      (i) => i.id !== itemId,
    );
    this.sistema.salvarCarrinhoStorage();
    this.renderizar();
    this.sistema.ui.mostrarToast(
      "sucesso",
      "Item removido",
      "O item foi removido do carrinho.",
    );
  }

  // ============================================================
  // LIMPAR CARRINHO
  // ============================================================
  async limparCarrinho() {
    if ((this.sistema.carrinho || []).length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Carrinho vazio",
        "Não há itens para remover.",
      );
      return;
    }

    const confirmado = await this.sistema.confirmar(
      "Tem certeza que deseja limpar todo o carrinho?",
    );
    if (!confirmado) return;

    this.sistema.carrinho = [];
    this.sistema.salvarCarrinhoStorage();
    this.renderizar();
    this.sistema.ui.mostrarToast(
      "sucesso",
      "Carrinho limpo",
      "Todos os itens foram removidos.",
    );
  }

  // ============================================================
  // MOSTRAR / ESCONDER LOADING
  // ============================================================
  mostrarLoading(show, mensagem) {
    const loading = document.getElementById("carrinhoLoading");
    const content = document.getElementById("carrinhoViewContent");

    if (loading) {
      loading.style.display = show ? "flex" : "none";
      if (mensagem) {
        const p = loading.querySelector("p");
        if (p) p.textContent = mensagem;
      }
    }
    if (content) {
      content.style.display = show ? "none" : "block";
    }
  }

  // ============================================================
  // ============================================================
  // MODAL DE FINALIZAÇÃO (COM LOCAL DE ENTREGA)
  // ============================================================
  // ============================================================

  /**
   * Carrega os locais de entrega já usados em pedidos anteriores.
   * Usa cache na sessão pra não bater no banco toda vez.
   *
   * Retorna um array de strings (únicas).
   */
  async _carregarLocaisSugeridos() {
    // Cache já preenchido
    if (Array.isArray(this._locaisSugeridos)) {
      return this._locaisSugeridos;
    }

    try {
      const { data, error } = await supabase
        .from("pedidos")
        .select("local_entrega")
        .not("local_entrega", "is", null);

      if (error) throw error;

      // Deduplica e limpa
      const set = new Set();
      (data || []).forEach((p) => {
        const local = (p.local_entrega || "").trim();
        if (local) set.add(local);
      });

      this._locaisSugeridos = Array.from(set).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );

      return this._locaisSugeridos;
    } catch (err) {
      console.warn(
        "[Carrinho] Não foi possível carregar locais sugeridos:",
        err,
      );
      this._locaisSugeridos = [];
      return [];
    }
  }

  /**
   * Popula o <datalist id="locaisEntregaList"> com os locais
   * sugeridos. Chamado quando o modal abre.
   */
  _popularDatalist(locais) {
    const datalist = document.getElementById("locaisEntregaList");
    if (!datalist) return;

    datalist.innerHTML = (locais || [])
      .map((l) => `<option value="${this._escapeAttr(l)}"></option>`)
      .join("");
  }

  /**
   * Escapa string para uso em atributo HTML (value="...").
   */
  _escapeAttr(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Escapa string para uso em conteúdo HTML (texto).
   */
  _escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Abre o modal de finalização.
   *   · Monta o agrupamento por ATA (1 bloco por pedido a ser criado)
   *   · Carrega os locais sugeridos
   *   · Popula o datalist
   *   · Renderiza os blocos
   *
   * ✅ ATUALIZADO · Aceita um parâmetro `origem` ("spa" | "fab").
   * Quando a origem é "fab", mostra o aviso contextual
   * `#finalizacaoAvisoFab`. Caso contrário, esconde.
   */
  async _abrirModalFinalizacao(origem = "spa") {
    const carrinho = this.sistema.carrinho || [];
    if (carrinho.length === 0) return;

    // ---------------------------------------------------------
    // 0) Garante que o modal existe e tem listeners conectados
    // ---------------------------------------------------------
    const modal = document.getElementById("modalFinalizacao");
    if (!modal) {
      console.error(
        "[Carrinho] #modalFinalizacao não encontrado. Verifique se o HTML principal foi atualizado.",
      );
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        "O modal de finalização não está disponível. Recarregue a página.",
      );
      return;
    }

    // Garante que os listeners estejam conectados
    this._conectarEventosModalFinalizacao();

    // ---------------------------------------------------------
    // 1. Agrupar itens por ATA (mesma lógica do finalizarPedido)
    // ---------------------------------------------------------
    const pedidosPorAta = {};
    carrinho.forEach((item) => {
      if (!pedidosPorAta[item.ataId]) {
        pedidosPorAta[item.ataId] = {
          ataId: item.ataId,
          ataNumero: item.ataNumero || "N/I",
          fornecedorId: item.fornecedorId,
          fornecedorRazao: item.fornecedorRazao || "",
          fornecedorCnpj: item.fornecedorCnpj || "",
          processo: item.processo || "",
          objeto: item.objeto || "",
          itens: [],
        };
      }
      pedidosPorAta[item.ataId].itens.push(item);
    });

    this._pedidosPendentes = pedidosPorAta;

    // ---------------------------------------------------------
    // 2. Carregar locais sugeridos e popular datalist
    // ---------------------------------------------------------
    const locais = await this._carregarLocaisSugeridos();
    this._popularDatalist(locais);

    // ---------------------------------------------------------
    // 3. Renderizar blocos + resumo
    // ---------------------------------------------------------
    this._renderizarBlocosFinalizacao(pedidosPorAta);

    // ---------------------------------------------------------
    // 4. Reset do checkbox "aplicar a todos"
    // ---------------------------------------------------------
    const cbAplicarTodos = document.getElementById("aplicarTodosLocais");
    if (cbAplicarTodos) cbAplicarTodos.checked = false;

    // ---------------------------------------------------------
    // 4.b) ✅ NOVO · Aviso contextual para origem "fab"
    // ---------------------------------------------------------
    const aviso = document.getElementById("finalizacaoAvisoFab");
    if (aviso) {
      aviso.style.display = origem === "fab" ? "flex" : "none";
    }

    // ---------------------------------------------------------
    // 5. Abrir modal
    // ---------------------------------------------------------
    modal.classList.add("active");

    // ---------------------------------------------------------
    // 6. Validar de início (botão confirmar fica desabilitado)
    // ---------------------------------------------------------
    this._validarModalFinalizacao();
  }

  /**
   * Renderiza os blocos (1 por ATA) + resumo.
   */
  _renderizarBlocosFinalizacao(pedidosPorAta) {
    const entradas = Object.entries(pedidosPorAta);
    const totalPedidos = entradas.length;

    // ---------- Resumo ----------
    const resumo = document.getElementById("finalizacaoResumo");
    if (resumo) {
      resumo.innerHTML = `
        <i class="fas fa-info-circle"></i>
        Será(ão) gerado(s) <strong>${totalPedidos} pedido(s)</strong>,
        agrupado(s) por ATA. Informe o local de entrega de cada um.
      `;
    }

    // ---------- Blocos ----------
    const container = document.getElementById("finalizacaoBlocos");
    if (!container) return;

    const html = entradas
      .map(([ataId, pedido]) => {
        const totalAta = pedido.itens.reduce(
          (s, i) => s + (i.valorTotal || 0),
          0,
        );

        const itensHtml = pedido.itens
          .map(
            (i) => `
              <li class="finalizacao-item">
                <span class="finalizacao-item-numero">#${this._escapeHtml(i.itemNumero || "—")}</span>
                <span class="finalizacao-item-desc">${this._escapeHtml((i.itemDescricao || "Item").slice(0, 60))}</span>
                <span class="finalizacao-item-qtd">${i.quantidade || 0}</span>
                <span class="finalizacao-item-valor">${this.sistema.ui.formatarMoeda(i.valorTotal || 0)}</span>
              </li>
            `,
          )
          .join("");

        return `
          <div class="finalizacao-bloco" data-ata-id="${ataId}">
            <div class="finalizacao-bloco-header">
              <div class="finalizacao-bloco-titulo">
                <i class="fas fa-file-contract"></i>
                Ata ${this._escapeHtml(pedido.ataNumero)}
              </div>
              <div class="finalizacao-bloco-fornecedor">
                <i class="fas fa-building"></i>
                ${this._escapeHtml(pedido.fornecedorRazao || "—")}
              </div>
            </div>

            <ul class="finalizacao-bloco-itens">
              ${itensHtml}
            </ul>

            <div class="finalizacao-bloco-total">
              <span>Subtotal da ATA:</span>
              <strong>${this.sistema.ui.formatarMoeda(totalAta)}</strong>
            </div>

            <div class="finalizacao-bloco-local">
              <label for="local-entrega-${ataId}">
                <i class="fas fa-map-marker-alt"></i>
                Local de entrega <span class="obrigatorio">*</span>
              </label>
              <input
                type="text"
                id="local-entrega-${ataId}"
                class="finalizacao-input-local"
                data-ata-id="${ataId}"
                list="locaisEntregaList"
                placeholder="Ex: Escola Municipal João XXIII"
                autocomplete="off"
              />
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = html;

    // ---------------------------------------------------------
    // Listeners nos inputs de local (para validar em tempo real)
    // ---------------------------------------------------------
    container.querySelectorAll(".finalizacao-input-local").forEach((inp) => {
      inp.addEventListener("input", () => {
        // Se "aplicar a todos" está marcado, replica o valor
        const cbAplicarTodos = document.getElementById("aplicarTodosLocais");
        if (cbAplicarTodos?.checked) {
          const valor = inp.value;
          container
            .querySelectorAll(".finalizacao-input-local")
            .forEach((outro) => {
              if (outro !== inp) outro.value = valor;
            });
        }
        this._validarModalFinalizacao();
      });
    });
  }

  /**
   * Handler do checkbox "aplicar a todos".
   * Quando marcado, copia o valor do primeiro input preenchido
   * (ou do primeiro, se nenhum) para todos os outros.
   */
  _onChangeAplicarTodos(marcado) {
    if (!marcado) return;

    const inputs = document.querySelectorAll(".finalizacao-input-local");
    if (inputs.length === 0) return;

    // Pega o primeiro input com valor; se nenhum, o primeiro vazio
    let origem = null;
    for (const inp of inputs) {
      if (inp.value.trim()) {
        origem = inp;
        break;
      }
    }
    if (!origem) origem = inputs[0];

    const valor = origem.value;
    inputs.forEach((inp) => {
      if (inp !== origem) inp.value = valor;
    });

    this._validarModalFinalizacao();
  }

  /**
   * Habilita ou desabilita o botão "Confirmar Pedido" conforme
   * todos os inputs de local estejam preenchidos.
   */
  _validarModalFinalizacao() {
    const inputs = document.querySelectorAll(".finalizacao-input-local");
    const btn = document.getElementById("btnConfirmarFinalizacao");
    if (!btn) return;

    const todosPreenchidos =
      inputs.length > 0 &&
      Array.from(inputs).every((inp) => inp.value.trim().length > 0);

    btn.disabled = !todosPreenchidos;
  }

  /**
   * Coleta o mapa { ataId: localEntrega } a partir do DOM.
   */
  _coletarLocaisDoModal() {
    const inputs = document.querySelectorAll(".finalizacao-input-local");
    const locais = {};
    inputs.forEach((inp) => {
      const ataId = inp.dataset.ataId;
      if (ataId) locais[ataId] = inp.value.trim();
    });
    return locais;
  }

  /**
   * Fecha o modal (sem executar nada).
   */
  _fecharModalFinalizacao() {
    const modal = document.getElementById("modalFinalizacao");
    if (modal) modal.classList.remove("active");
    this._pedidosPendentes = null;

    // ✅ Esconde o aviso do FAB (próxima abertura decide de novo)
    const aviso = document.getElementById("finalizacaoAvisoFab");
    if (aviso) aviso.style.display = "none";
  }

  // ============================================================
  // FINALIZAR PEDIDO
  // ------------------------------------------------------------
  // ✅ ATUALIZADO · Aceita parâmetro `origem`:
  //   · "spa" (padrão) → chamado pela view SPA do carrinho
  //   · "fab"          → chamado pelo drawer (FAB)
  //
  // Ambos abrem o MESMO modal de finalização. A única diferença
  // é que o modo "fab" mostra um aviso contextual no topo.
  //
  // O fluxo é:
  //   1. finalizarPedido() → abre o modal
  //   2. Usuário preenche locais
  //   3. Clica "Confirmar Pedido" → _executarCriacaoPedidos()
  //   4. Os pedidos são criados com `local_entrega`
  // ============================================================
  async finalizarPedido(origem = "spa") {
    const carrinho = this.sistema.carrinho || [];

    if (carrinho.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Carrinho vazio",
        "Adicione itens ao carrinho antes de finalizar.",
      );
      return;
    }

    if (!this.sistema.usuarioAtual) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Usuário não logado",
        "Faça login para finalizar o pedido.",
      );
      return;
    }

    // Abre o modal (não usa mais `confirm()`)
    await this._abrirModalFinalizacao(origem);
  }

  /**
   * Executa de fato a criação dos pedidos, usando os locais
   * coletados do modal. Chamado pelo botão "Confirmar Pedido".
   */
  async _executarCriacaoPedidos() {
    // ---------------------------------------------------------
    // 1. Validar
    // ---------------------------------------------------------
    const locais = this._coletarLocaisDoModal();
    const pedidosPorAta = this._pedidosPendentes;

    if (!pedidosPorAta || Object.keys(pedidosPorAta).length === 0) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        "Pedidos pendentes não encontrados. Feche e tente novamente.",
      );
      return;
    }

    for (const ataId of Object.keys(pedidosPorAta)) {
      if (!locais[ataId] || !locais[ataId].trim()) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Local de entrega obrigatório",
          `Preencha o local da Ata ${pedidosPorAta[ataId].ataNumero}.`,
        );
        return;
      }
    }

    // ---------------------------------------------------------
    // 2. Desabilitar botão do modal
    // ---------------------------------------------------------
    const btn = document.getElementById("btnConfirmarFinalizacao");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }

    // ---------------------------------------------------------
    // 3. Mostrar loading principal
    // ---------------------------------------------------------
    this._fecharModalFinalizacao();
    this.mostrarLoading(true, "Gerando pedido(s)...");

    try {
      const dataAtual = new Date().toISOString().split("T")[0];

      // ---------------------------------------------------------
      // 4. Para cada ATA, criar um pedido
      // ---------------------------------------------------------
      for (const [ataId, pedido] of Object.entries(pedidosPorAta)) {
        const totalPedido = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);

        const numeroPedido = `PED-${new Date().getFullYear()}-${String(
          Date.now(),
        ).slice(-4)}-${String(Math.floor(Math.random() * 1000)).padStart(
          3,
          "0",
        )}`;

        const localEntrega = locais[ataId];

        // -----------------------------------------------------
        // INSERT em pedidos (agora com local_entrega)
        // -----------------------------------------------------
        const { data: pedidoData, error: pedidoError } = await supabase
          .from("pedidos")
          .insert({
            numero_pedido: numeroPedido,
            numero_requisicao: null,
            usuario_id: this.sistema.usuarioAtual.id,
            ata_id: parseInt(ataId),
            orgao_solicitante_id: this.sistema.usuarioAtual.orgao_id,
            fornecedor_id: pedido.fornecedorId,
            data_solicitacao: dataAtual,
            data_autorizacao: null,
            status: "PEDIDO_REALIZADO",
            observacoes: "Pedido gerado via carrinho",
            justificativa: null,
            valor_total: totalPedido,
            status_aprovacao: "AGUARDANDO_APROVACAO",
            aprovado_por: null,
            data_aprovacao: null,
            observacao_aprovacao: null,
            local_entrega: localEntrega,
          })
          .select()
          .single();

        if (pedidoError) throw pedidoError;

        // -----------------------------------------------------
        // INSERT dos itens do pedido
        // -----------------------------------------------------
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

      // ---------------------------------------------------------
      // 5. Limpar carrinho + notificar
      // ---------------------------------------------------------
      this.sistema.carrinho = [];
      this.sistema.salvarCarrinhoStorage();
      this.renderizar();

      const qtdPedidos = Object.keys(pedidosPorAta).length;
      this.sistema.ui.mostrarToast(
        "sucesso",
        "Pedido realizado",
        `${qtdPedidos} pedido(s) gerado(s) com sucesso!`,
      );

      // ---------------------------------------------------------
      // 6. Navegar para Pedidos
      // ---------------------------------------------------------
      setTimeout(() => {
        this.sistema.ativarTab("pedidos");
      }, 800);
    } catch (error) {
      console.error("[Carrinho] Erro ao finalizar pedido:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível finalizar o pedido.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }
}
