import { supabase } from "../supabase.js";

export class Pedidos {
  constructor(sistema) {
    this.sistema = sistema;
    this.pedidosCache = [];
    this.totalPedidos = 0;
    this.limit = 15;
    this.offset = 0;

    this.filtrosAtivos = {
      statusAprovacao: "todos",
      numeroPedido: "",
      numeroAta: "",
      fornecedorId: null,
      dataCriacaoInicio: null,
      dataCriacaoFim: null,
      dataAprovacaoInicio: null,
      dataAprovacaoFim: null,
    };
    this.fornecedoresCache = [];
    this._carregandoMais = false;

    this._atasCompraRapida = [];
    this._itensCompraRapidaAtual = [];
    this._filaAprovacao = [];
    this._processandoAprovacaoLote = false;

    this._cronogramasPorPedido = {};
    this._itemFracionando = null;
    this._pedidoFracionando = null;
    this._linhasFracionamentoTemp = [];
    this._itemExclusaoFrac = null;
    this._pedidoExclusaoFrac = null;
    this._itemContadorTemp = 0;

    this._fracionamentoGradeTemp = {};
    this._periodosSemanasTemp = [];
    this._pedidoFracionandoInteiro = null;
    this._itensFracionamentoSelecionados = new Set();
    this._cronogramaPedidoInteiroCache = {};
    this._eventosFracionamentoConfigurados = false;
    this._eventosFracionamentoInteiroConfigurados = false;

    // Mês de referência das entregas fracionadas. Por padrão, o fluxo
    // considera o mês seguinte, pois os pedidos são preparados para o
    // próximo mês de consumo. O usuário pode alterar no modal.
    this.mesFracionamentoAtual = this._mesSeguinteISO();
  }

  getStatusDefault() {
    const perfil = this.sistema.usuarioAtual?.perfil;
    if (perfil === "ADMIN" || perfil === "SECRETARIO") {
      return "AGUARDANDO_APROVACAO";
    }
    return "todos";
  }

  async carregarConteudo() {
    const container = document.getElementById("pedidosContent");
    this.sistema.ui.mostrarSpinner("pedidosContent", "Carregando pedidos...");
    const html = this.gerarHTMLPedidos();
    container.innerHTML = html;

    this.offset = 0;
    this.pedidosCache = [];
    this.totalPedidos = 0;
    this._filaAprovacao = [];
    this._cronogramasPorPedido = {};
    this._cronogramaPedidoInteiroCache = {};

    this.filtrosAtivos.statusAprovacao = this.getStatusDefault();
    const selectStatus = document.getElementById("filtroStatusAprovacao");
    if (selectStatus) {
      selectStatus.value = this.filtrosAtivos.statusAprovacao;
    }

    await this.configurarFiltros();
    await this.inicializarOnda1();
    await this.inicializarOnda2();
    await this.inicializarOnda3();

    this._configurarEventosFracionamento();
    this._configurarEventosFracionamentoInteiro();

    await this.carregarPedidos();
  }

  gerarHTMLPedidos() {
    return `
      <div class="pedido-container">
        <div class="pedidos-acoes-rapidas" id="pedidosAcoesRapidas">
          <button type="button" class="btn-acao-principal" id="btnNovoPedido" title="Ir para a Consulta em modo compra">
            <i class="fas fa-plus-circle"></i>
            <span>Novo Pedido</span>
          </button>
          <button type="button" class="btn-acao-secundaria" id="btnIrParaCarrinho" title="Ver os itens no carrinho">
            <i class="fas fa-shopping-cart"></i>
            <span>Carrinho</span>
            <span class="badge-acao badge-vazio" id="badgeCarrinhoAcoes">0</span>
          </button>
          <button type="button" class="btn-acao-secundaria btn-acao-fila" id="btnIrParaFila" title="Ver pedidos aguardando sua aprovação" style="display: none">
            <i class="fas fa-clipboard-check"></i>
            <span>Fila de Aprovação</span>
            <span class="badge-acao badge-acao-alerta" id="badgeFilaAcoes">0</span>
          </button>
        </div>

        <div class="fila-aprovacao" id="filaAprovacao" style="display: none"></div>

        <div class="compra-rapida" id="compraRapida">
          <div class="compra-rapida-header">
            <h3 class="compra-rapida-titulo"><i class="fas fa-bolt"></i> Compra Rápida</h3>
            <span class="compra-rapida-dica">Já sabe o que precisa? Adicione direto aqui.</span>
          </div>
          <div class="compra-rapida-grid">
            <div class="filtro-grupo compra-rapida-ata">
              <label class="filtro-label" for="compraRapidaAta"><i class="fas fa-file-contract"></i> Ata</label>
              <select id="compraRapidaAta" class="filtro-select">
                <option value="">🔍 Selecione uma ata...</option>
              </select>
            </div>
            <div class="filtro-grupo compra-rapida-item">
              <label class="filtro-label" for="compraRapidaItem"><i class="fas fa-box"></i> Item</label>
              <select id="compraRapidaItem" class="filtro-select" disabled>
                <option value="">Selecione uma ata primeiro...</option>
              </select>
            </div>
            <div class="filtro-grupo compra-rapida-qtd">
              <label class="filtro-label" for="compraRapidaQtd"><i class="fas fa-hashtag"></i> Quantidade</label>
              <input type="number" id="compraRapidaQtd" class="filtro-input" placeholder="0" min="1" disabled />
            </div>
            <div class="filtro-grupo compra-rapida-acao">
              <label class="filtro-label" aria-hidden="true">&nbsp;</label>
              <button type="button" class="btn-adicionar-rapido" id="btnCompraRapidaAdicionar" disabled>
                <i class="fas fa-cart-plus"></i>
                <span>Adicionar</span>
              </button>
            </div>
          </div>
          <div class="compra-rapida-preview" id="compraRapidaPreview" style="display: none"></div>
        </div>

        <div class="pedidos-indicadores">
          <div class="indicador-card indicador-clicavel" data-status="todos" title="Ver todos os pedidos">
            <span class="indicador-numero" id="totalPedidos">0</span>
            <span class="indicador-label">Total</span>
          </div>
          <div class="indicador-card indicador-pendente indicador-clicavel" data-status="AGUARDANDO_APROVACAO" title="Ver apenas os pedidos aguardando aprovação">
            <span class="indicador-numero" id="pendentesPedidos">0</span>
            <span class="indicador-label">Pendentes</span>
          </div>
          <div class="indicador-card indicador-aprovado indicador-clicavel" data-status="APROVADO" title="Ver apenas os pedidos aprovados">
            <span class="indicador-numero" id="aprovadosPedidos">0</span>
            <span class="indicador-label">Aprovados</span>
          </div>
          <div class="indicador-card indicador-rejeitado indicador-clicavel" data-status="REPROVADO" title="Ver apenas os pedidos rejeitados">
            <span class="indicador-numero" id="rejeitadosPedidos">0</span>
            <span class="indicador-label">Rejeitados</span>
          </div>
        </div>

        <div class="pedidos-filtros">
          <div class="pedidos-filtros-grid">
            <div class="filtro-grupo">
              <label class="filtro-label" for="filtroStatusAprovacao"><i class="fas fa-filter"></i> Status</label>
              <select id="filtroStatusAprovacao" class="filtro-select">
                <option value="AGUARDANDO_APROVACAO">⏳ Aguardando Aprovação</option>
                <option value="APROVADO">✅ Aprovados</option>
                <option value="REPROVADO">❌ Rejeitados</option>
                <option value="todos">📋 Todos</option>
              </select>
            </div>
            <div class="filtro-grupo">
              <label class="filtro-label"><i class="fas fa-hashtag"></i> Nº Pedido</label>
              <input type="text" id="filtroNumeroPedido" class="filtro-input" placeholder="Ex: PED-2026-0001">
            </div>
            <div class="filtro-grupo">
              <label class="filtro-label"><i class="fas fa-file-contract"></i> Nº Ata</label>
              <input type="text" id="filtroNumeroAta" class="filtro-input" placeholder="Ex: 74/2026">
            </div>
          </div>

          <div class="pedidos-filtros-grid">
            <div class="filtro-grupo">
              <label class="filtro-label"><i class="fas fa-building"></i> Fornecedor</label>
              <div class="autocomplete-container" id="autocompleteFornecedorPedidos">
                <input type="text" id="fornecedorPedidoInput" class="filtro-input autocomplete-input" placeholder="Digite o nome ou CPF/CNPJ..." autocomplete="off">
                <input type="hidden" id="fornecedorPedidoId" value="">
                <div class="autocomplete-dropdown" id="autocompletePedidoDropdown"></div>
              </div>
            </div>
          </div>

          <div class="pedidos-filtros-grid">
            <div class="filtro-grupo">
              <label class="filtro-label"><i class="fas fa-calendar-plus"></i> Criado em</label>
              <div class="filtro-data-inputs">
                <input type="date" id="filtroDataCriacaoInicio" class="filtro-input filtro-data" placeholder="Início">
                <span class="filtro-data-separador">até</span>
                <input type="date" id="filtroDataCriacaoFim" class="filtro-input filtro-data" placeholder="Fim">
              </div>
            </div>
            <div class="filtro-grupo">
              <label class="filtro-label"><i class="fas fa-calendar-check"></i> Aprovado em</label>
              <div class="filtro-data-inputs">
                <input type="date" id="filtroDataAprovacaoInicio" class="filtro-input filtro-data" placeholder="Início">
                <span class="filtro-data-separador">até</span>
                <input type="date" id="filtroDataAprovacaoFim" class="filtro-input filtro-data" placeholder="Fim">
              </div>
            </div>
          </div>

          <div class="pedidos-filtros-actions">
            <button class="btn-aplicar" id="btnFiltrarPedidos"><i class="fas fa-filter"></i> Filtrar</button>
            <button class="btn-limpar" id="btnLimparFiltrosPedidos"><i class="fas fa-eraser"></i> Limpar</button>
            <button class="btn-exportar" id="btnExportarPedidos"><i class="fas fa-download"></i> Exportar</button>
          </div>
        </div>

        <div class="pedidos-contador">
          <span id="pedidosContador">Carregando pedidos...</span>
          <button class="btn-carregar-mais" id="btnCarregarMais" style="display: none;">
            <i class="fas fa-chevron-down"></i> Carregar mais 15
          </button>
        </div>

        <div id="pedidosLista" class="pedidos-lista-wrapper"></div>
      </div>

      <div id="modalFracionar" class="modal modal-fracionar">
        <div class="modal-content modal-content-fracionar" id="modalFracionarContent"></div>
      </div>

      <div id="modalConfirmarExclusaoFrac" class="modal modal-confirmar-exclusao-frac">
        <div class="modal-content modal-content-confirmar-exclusao-frac">
          <div class="modal-header modal-header-danger">
            <h2 class="modal-titulo"><i class="fas fa-exclamation-triangle"></i> Excluir Cronograma</h2>
            <button type="button" class="modal-close" id="btnFecharModalExclusaoFrac" title="Fechar">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body modal-body-exclusao-frac">
            <p class="exclusao-frac-mensagem">
              Tem certeza que deseja <strong>excluir</strong> o cronograma de entregas deste item?
            </p>
            <p class="exclusao-frac-item" id="exclusaoFracItemNome"></p>
            <div class="exclusao-frac-aviso">
              <i class="fas fa-info-circle"></i>
              <span>Esta ação não pode ser desfeita. O item volta a ficar sem cronograma.</span>
            </div>
          </div>
          <div class="modal-footer-fracionar">
            <button type="button" class="btn-cancelar-fracionar" id="btnCancelarExclusaoFrac">
              <i class="fas fa-times"></i> Cancelar
            </button>
            <button type="button" class="btn-confirmar-exclusao-frac" id="btnConfirmarExclusaoFrac">
              <i class="fas fa-trash"></i> Excluir Cronograma
            </button>
          </div>
        </div>
      </div>

      <div id="modalFracionarPedido" class="modal modal-fracionar-pedido">
        <div class="modal-content modal-content-fracionar-pedido" id="modalFracionarPedidoContent"></div>
      </div>

      <div id="modalRecebimentoPedido" class="modal modal-recebimento-pedido">
        <div class="modal-content modal-content-recebimento-pedido" id="modalRecebimentoPedidoContent"></div>
      </div>

      <div id="modalTimelinePedido" class="modal modal-timeline-pedido">
        <div class="modal-content modal-content-timeline-pedido" id="modalTimelinePedidoContent"></div>
      </div>
    `;
  }

  async configurarFiltros() {
    await this.carregarFornecedores();
    this.configurarAutocompleteFornecedor();

    document
      .getElementById("btnFiltrarPedidos")
      ?.addEventListener("click", () => {
        this.aplicarFiltros();
      });

    document
      .getElementById("btnLimparFiltrosPedidos")
      ?.addEventListener("click", () => {
        this.limparFiltros();
      });

    document
      .getElementById("btnExportarPedidos")
      ?.addEventListener("click", () => {
        this.exportarPedidos();
      });

    document
      .getElementById("btnCarregarMais")
      ?.addEventListener("click", () => {
        this.carregarMaisPedidos();
      });

    document
      .getElementById("filtroStatusAprovacao")
      ?.addEventListener("change", () => {
        this.aplicarFiltros();
      });

    document.querySelectorAll(".indicador-clicavel").forEach((card) => {
      card.addEventListener("click", () => {
        const status = card.dataset.status || "todos";
        this.filtrarPorStatus(status);
      });
    });

    document
      .querySelectorAll(
        "#filtroNumeroPedido, #filtroNumeroAta, #filtroDataCriacaoInicio, #filtroDataCriacaoFim, #filtroDataAprovacaoInicio, #filtroDataAprovacaoFim",
      )
      .forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.aplicarFiltros();
          }
        });
      });
  }

  filtrarPorStatus(status) {
    const select = document.getElementById("filtroStatusAprovacao");
    if (select) select.value = status;
    this.filtrosAtivos.statusAprovacao = status;
    this.offset = 0;
    this.pedidosCache = [];
    this.carregarPedidos();

    const labelMap = {
      todos: "Todos os pedidos",
      AGUARDANDO_APROVACAO: "Pedidos aguardando aprovação",
      APROVADO: "Pedidos aprovados",
      REPROVADO: "Pedidos rejeitados",
    };
    this.sistema.ui.mostrarToast(
      "info",
      "Filtro aplicado",
      labelMap[status] || "Filtro aplicado",
      2000,
    );
  }

  async carregarFornecedores() {
    try {
      const { data: fornecedores, error } = await supabase
        .from("fornecedores")
        .select("id, razao_social, cnpj")
        .order("razao_social");
      if (error) throw error;
      this.fornecedoresCache = fornecedores || [];
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
    }
  }

  configurarAutocompleteFornecedor() {
    const input = document.getElementById("fornecedorPedidoInput");
    const dropdown = document.getElementById("autocompletePedidoDropdown");
    const hiddenId = document.getElementById("fornecedorPedidoId");
    if (!input || !dropdown) return;

    let debounceTimer;

    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value.toLowerCase().trim();
      if (value.length === 0) {
        dropdown.classList.remove("open");
        hiddenId.value = "";
        return;
      }

      debounceTimer = setTimeout(() => {
        const resultados = this.fornecedoresCache
          .filter(
            (f) =>
              f.razao_social.toLowerCase().includes(value) ||
              (f.cnpj &&
                f.cnpj.replace(/\D/g, "").includes(value.replace(/\D/g, ""))),
          )
          .slice(0, 10);

        if (resultados.length === 0) {
          dropdown.innerHTML = `<div class="autocomplete-item disabled">Nenhum fornecedor encontrado</div>`;
        } else {
          dropdown.innerHTML = resultados
            .map(
              (f) => `
            <div class="autocomplete-item" data-id="${f.id}" data-razao="${f.razao_social}" data-cnpj="${f.cnpj || ""}">
              <span class="item-razao">${f.razao_social}</span>
              ${f.cnpj ? `<span class="item-cnpj">${this.formatarCnpj(f.cnpj)}</span>` : ""}
            </div>
          `,
            )
            .join("");

          dropdown
            .querySelectorAll(".autocomplete-item:not(.disabled)")
            .forEach((item) => {
              item.addEventListener("click", () => {
                input.value = item.dataset.razao;
                hiddenId.value = item.dataset.id;
                dropdown.classList.remove("open");
              });
            });
        }
        dropdown.classList.add("open");
      }, 300);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".autocomplete-container")) {
        dropdown.classList.remove("open");
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        dropdown.classList.remove("open");
        input.blur();
      }
    });
  }

  formatarCnpj(cnpj) {
    if (!cnpj) return "";
    const limpo = String(cnpj).replace(/\D/g, "");
    if (limpo.length === 11) return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (limpo.length === 14) return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return String(cnpj);
  }

  aplicarFiltros() {
    const statusValue = document.getElementById("filtroStatusAprovacao")?.value;
    this.filtrosAtivos.statusAprovacao = statusValue || "todos";
    this.filtrosAtivos.numeroPedido =
      document.getElementById("filtroNumeroPedido")?.value?.trim() || "";
    this.filtrosAtivos.numeroAta =
      document.getElementById("filtroNumeroAta")?.value?.trim() || "";
    this.filtrosAtivos.fornecedorId =
      document.getElementById("fornecedorPedidoId")?.value || null;
    this.filtrosAtivos.dataCriacaoInicio =
      document.getElementById("filtroDataCriacaoInicio")?.value || null;
    this.filtrosAtivos.dataCriacaoFim =
      document.getElementById("filtroDataCriacaoFim")?.value || null;
    this.filtrosAtivos.dataAprovacaoInicio =
      document.getElementById("filtroDataAprovacaoInicio")?.value || null;
    this.filtrosAtivos.dataAprovacaoFim =
      document.getElementById("filtroDataAprovacaoFim")?.value || null;

    this.offset = 0;
    this.pedidosCache = [];
    this.carregarPedidos();
  }

  limparFiltros() {
    document.getElementById("filtroNumeroPedido").value = "";
    document.getElementById("filtroNumeroAta").value = "";
    document.getElementById("fornecedorPedidoInput").value = "";
    document.getElementById("fornecedorPedidoId").value = "";
    document.getElementById("filtroDataCriacaoInicio").value = "";
    document.getElementById("filtroDataCriacaoFim").value = "";
    document.getElementById("filtroDataAprovacaoInicio").value = "";
    document.getElementById("filtroDataAprovacaoFim").value = "";
    document
      .getElementById("autocompletePedidoDropdown")
      ?.classList.remove("open");

    const statusDefault = this.getStatusDefault();
    const selectStatus = document.getElementById("filtroStatusAprovacao");
    if (selectStatus) selectStatus.value = statusDefault;

    this.filtrosAtivos = {
      statusAprovacao: statusDefault,
      numeroPedido: "",
      numeroAta: "",
      fornecedorId: null,
      dataCriacaoInicio: null,
      dataCriacaoFim: null,
      dataAprovacaoInicio: null,
      dataAprovacaoFim: null,
    };

    this.offset = 0;
    this.pedidosCache = [];
    this.carregarPedidos();
    this.sistema.ui.mostrarToast("info", "Filtros limpos!");
  }

  async carregarPedidos() {
    const container = document.getElementById("pedidosLista");
    if (!this.sistema.usuarioAtual?.id) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px;">Usuário não logado</div>';
      return;
    }

    try {
      let query = supabase.from("pedidos").select("*", { count: "exact" });

      if (this.sistema.usuarioAtual.orgao_id) {
        query = query.eq(
          "orgao_solicitante_id",
          this.sistema.usuarioAtual.orgao_id,
        );
      }

      query = this.aplicarFiltrosQuery(query);
      query = query
        .order("created_at", { ascending: false })
        .range(this.offset, this.offset + this.limit - 1);

      const { data: pedidos, count, error } = await query;
      if (error) throw error;

      this.totalPedidos = count || 0;

      if (this.offset === 0) this.pedidosCache = [];
      if (pedidos && pedidos.length > 0) {
        this.pedidosCache = [...this.pedidosCache, ...pedidos];
      }

      if (this.offset === 0) {
        await this.carregarIndicadores();
      }

      await this.renderizarPedidos();
      this.atualizarContador();
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error);
      container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--error-600);">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <h3 style="font-size:0.9rem;">Erro ao carregar pedidos</h3>
        <p style="font-size:0.8rem;">${error.message}</p>
      </div>`;
    }
  }

  aplicarFiltrosQuery(query) {
    const f = this.filtrosAtivos;

    if (f.statusAprovacao && f.statusAprovacao !== "todos") {
      query = query.eq("status_aprovacao", f.statusAprovacao);
    }

    if (f.numeroPedido) {
      query = query.ilike("numero_pedido", `%${f.numeroPedido}%`);
    }

    if (f.numeroAta) {
      if (Array.isArray(f._idsAtasFiltro) && f._idsAtasFiltro.length > 0) {
        query = query.in("ata_id", f._idsAtasFiltro);
      } else if (
        Array.isArray(f._idsAtasFiltro) &&
        f._idsAtasFiltro.length === 0
      ) {
        query = query.eq("id", -1);
      }
    }

    if (f.fornecedorId) {
      query = query.eq("fornecedor_id", parseInt(f.fornecedorId));
    }

    if (f.dataCriacaoInicio)
      query = query.gte("created_at", `${f.dataCriacaoInicio}T00:00:00`);
    if (f.dataCriacaoFim)
      query = query.lte("created_at", `${f.dataCriacaoFim}T23:59:59`);
    if (f.dataAprovacaoInicio)
      query = query.gte("data_aprovacao", f.dataAprovacaoInicio);
    if (f.dataAprovacaoFim)
      query = query.lte("data_aprovacao", f.dataAprovacaoFim);

    return query;
  }

  async prepararFiltroNumeroAta() {
    const termo = this.filtrosAtivos.numeroAta;
    if (!termo) {
      this.filtrosAtivos._idsAtasFiltro = undefined;
      return;
    }

    try {
      const { data, error } = await supabase
        .from("atas")
        .select("id")
        .ilike("numero_ata", `%${termo}%`);
      if (error) throw error;
      this.filtrosAtivos._idsAtasFiltro = (data || []).map((a) => a.id);
    } catch (error) {
      console.error("Erro ao preparar filtro de Nº Ata:", error);
      this.filtrosAtivos._idsAtasFiltro = [];
    }
  }

  async carregarIndicadores() {
    try {
      const orgId = this.sistema.usuarioAtual?.orgao_id;

      const baseQuery = () => {
        let q = supabase
          .from("pedidos")
          .select("*", { count: "exact", head: true });
        if (orgId) q = q.eq("orgao_solicitante_id", orgId);
        return q;
      };

      const [
        { count: total, error: e1 },
        { count: pendentes, error: e2 },
        { count: aprovados, error: e3 },
        { count: rejeitados, error: e4 },
      ] = await Promise.all([
        baseQuery(),
        baseQuery().eq("status_aprovacao", "AGUARDANDO_APROVACAO"),
        baseQuery().eq("status_aprovacao", "APROVADO"),
        baseQuery().eq("status_aprovacao", "REPROVADO"),
      ]);

      if (e1 || e2 || e3 || e4) {
        console.warn("Erro parcial nos indicadores:", { e1, e2, e3, e4 });
      }

      const totalEl = document.getElementById("totalPedidos");
      const pendEl = document.getElementById("pendentesPedidos");
      const aprEl = document.getElementById("aprovadosPedidos");
      const rejEl = document.getElementById("rejeitadosPedidos");

      if (totalEl) totalEl.textContent = total || 0;
      if (pendEl) pendEl.textContent = pendentes || 0;
      if (aprEl) aprEl.textContent = aprovados || 0;
      if (rejEl) rejEl.textContent = rejeitados || 0;
    } catch (error) {
      console.error("Erro ao carregar indicadores:", error);
    }
  }
  async renderizarPedidos() {
    const container = document.getElementById("pedidosLista");

    if (!this.pedidosCache || this.pedidosCache.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;background:white;border-radius:var(--border-radius-2xl);border:1px solid var(--neutral-200);">
          <i class="fas fa-file-invoice" style="font-size:3rem;color:var(--neutral-300);"></i>
          <h3 style="margin-top:15px;color:var(--neutral-600);font-size:1rem;">Nenhum pedido encontrado</h3>
          <p style="color:var(--neutral-400);font-size:0.85rem;">Nenhum pedido corresponde aos filtros aplicados.</p>
        </div>
      `;
      return;
    }

    const idsPedidos = this.pedidosCache.map((p) => p.id);

    const { data: pedidosFull, error: e1 } = await supabase
      .from("pedidos")
      .select(
        `
        id,
        usuario:usuarios!usuario_id(nome),
        aprovador:usuarios!aprovado_por(nome),
        ata:atas!ata_id(numero_ata, processo_administrativo),
        fornecedor:fornecedores!fornecedor_id(razao_social, cnpj),
        orgao:orgaos!orgao_solicitante_id(nome, sigla)
      `,
      )
      .in("id", idsPedidos);

    let pedidosCompletos = [];
    if (e1 || !pedidosFull) {
      console.warn(
        "Falha no join otimizado, usando fallback (N+1). Erro:",
        e1?.message,
      );
      pedidosCompletos = await this._carregarPedidosFallback();
    } else {
      const { data: itensFull, error: e2 } = await supabase
        .from("itens_pedido")
        .select("*")
        .in("pedido_id", idsPedidos);

      if (e2) console.warn("Falha ao buscar itens:", e2.message);

      const idsItensAta = [
        ...new Set((itensFull || []).map((i) => i.item_ata_id).filter(Boolean)),
      ];

      let itensAtaMap = {};
      if (idsItensAta.length > 0) {
        const { data: itensAta } = await supabase
          .from("itens_ata")
          .select("id, descricao, item_numero, unidade_medida")
          .in("id", idsItensAta);

        (itensAta || []).forEach((ia) => {
          itensAtaMap[ia.id] = ia;
        });
      }

      const itensPorPedido = {};
      (itensFull || []).forEach((item) => {
        if (!itensPorPedido[item.pedido_id])
          itensPorPedido[item.pedido_id] = [];
        const meta = itensAtaMap[item.item_ata_id];
        itensPorPedido[item.pedido_id].push({
          ...item,
          descricao: meta?.descricao || "Descrição não encontrada",
          item_numero: meta?.item_numero || item.item_ata_id,
          unidade_medida: meta?.unidade_medida || "UN",
        });
      });

      const mapFull = {};
      pedidosFull.forEach((pf) => {
        mapFull[pf.id] = pf;
      });

      pedidosCompletos = this.pedidosCache.map((p) => {
        const full = mapFull[p.id] || {};
        return {
          ...p,
          usuario: full.usuario || { nome: "N/I" },
          aprovador_nome: full.aprovador?.nome || null,
          ata: full.ata || { numero_ata: "N/I", processo_administrativo: "" },
          fornecedor: full.fornecedor || { razao_social: "N/I", cnpj: "" },
          orgao_solicitante: full.orgao || { nome: "N/I", sigla: "" },
          itens_pedido: itensPorPedido[p.id] || [],
        };
      });
    }

    this.pedidosCache = this.pedidosCache.map((original) => {
      const completo = pedidosCompletos.find((pc) => pc.id === original.id);
      return completo ? { ...original, ...completo } : original;
    });

    await this._carregarCronogramasDosPedidos(idsPedidos);
    await this._carregarCronogramasPedidoInteiro(idsPedidos);

    if (this.offset === 0) {
      container.innerHTML = `
        <div class="pedidos-lista-container">
          <div class="pedidos-lista-header">
            <span>Pedido</span>
            <span>Ata</span>
            <span>Fornecedor</span>
            <span>Local</span>
            <span style="text-align:right;">Valor</span>
            <span style="text-align:center;">Status</span>
            <span style="text-align:center;">Data</span>
          </div>
          ${pedidosCompletos.map((p) => this.renderPedido(p)).join("")}
        </div>
      `;
    } else {
      const listaContainer = container.querySelector(
        ".pedidos-lista-container",
      );
      if (listaContainer) {
        const novosPedidosHtml = pedidosCompletos
          .map((p) => this.renderPedido(p))
          .join("");
        const footer = listaContainer.querySelector(".pedidos-contador-footer");
        if (footer) {
          footer.insertAdjacentHTML("beforebegin", novosPedidosHtml);
        } else {
          listaContainer.insertAdjacentHTML("beforeend", novosPedidosHtml);
        }
      }
    }

    this.atualizarContador();
  }

  async _carregarPedidosFallback() {
    return await Promise.all(
      this.pedidosCache.map(async (p) => {
        const [
          usuarioResult,
          ataResult,
          fornecedorResult,
          orgaoResult,
          itensResult,
        ] = await Promise.all([
          supabase
            .from("usuarios")
            .select("nome")
            .eq("id", p.usuario_id)
            .single(),
          supabase
            .from("atas")
            .select("numero_ata, processo_administrativo")
            .eq("id", p.ata_id)
            .single(),
          supabase
            .from("fornecedores")
            .select("razao_social,cnpj")
            .eq("id", p.fornecedor_id)
            .single(),
          supabase
            .from("orgaos")
            .select("nome,sigla")
            .eq("id", p.orgao_solicitante_id)
            .single(),
          supabase.from("itens_pedido").select("*").eq("pedido_id", p.id),
        ]);

        let aprovadorNome = null;
        if (p.aprovado_por) {
          const { data: aprovador } = await supabase
            .from("usuarios")
            .select("nome")
            .eq("id", p.aprovado_por)
            .single();
          aprovadorNome = aprovador?.nome;
        }

        const itensCompletos = [];
        if (itensResult.data && itensResult.data.length > 0) {
          for (const item of itensResult.data) {
            const { data: itemAta } = await supabase
              .from("itens_ata")
              .select("descricao, item_numero, unidade_medida")
              .eq("id", item.item_ata_id)
              .single();
            itensCompletos.push({
              ...item,
              descricao: itemAta?.descricao || "Descrição não encontrada",
              item_numero: itemAta?.item_numero || item.item_ata_id,
              unidade_medida: itemAta?.unidade_medida || "UN",
            });
          }
        }

        return {
          ...p,
          usuario: usuarioResult.data || { nome: "N/I" },
          ata: ataResult.data || {
            numero_ata: "N/I",
            processo_administrativo: "",
          },
          fornecedor: fornecedorResult.data || {
            razao_social: "N/I",
            cnpj: "",
          },
          orgao_solicitante: orgaoResult.data || { nome: "N/I", sigla: "" },
          itens_pedido: itensCompletos,
          aprovador_nome: aprovadorNome,
        };
      }),
    );
  }

  renderPedido(p) {
    const total =
      p.itens_pedido?.reduce((s, i) => s + (i.valor_total || 0), 0) || 0;
    const statusAprovacao = p.status_aprovacao || "AGUARDANDO_APROVACAO";
    const podeAprovar =
      (this.sistema.usuarioAtual.perfil === "ADMIN" ||
        (this.sistema.usuarioAtual.perfil === "SECRETARIO" &&
          this.sistema.usuarioAtual.orgao_id === p.orgao_solicitante_id)) &&
      statusAprovacao === "AGUARDANDO_APROVACAO";

    const statusClass =
      statusAprovacao === "APROVADO"
        ? "status-aprovado"
        : statusAprovacao === "REPROVADO"
          ? "status-rejeitado"
          : "status-aguardando";

    const statusLabel =
      statusAprovacao === "APROVADO"
        ? "Aprovado"
        : statusAprovacao === "REPROVADO"
          ? "Rejeitado"
          : "Aguardando Aprovação";

    const localEntrega = p.local_entrega || "";
    const podeFracionar = statusAprovacao === "APROVADO";
    const podeReceber =
      statusAprovacao === "APROVADO" &&
      ["ADMIN", "SECRETARIO"].includes(this.sistema.usuarioAtual?.perfil);
    const podeEncerrar =
      statusAprovacao === "APROVADO" &&
      ["ADMIN", "SECRETARIO"].includes(this.sistema.usuarioAtual?.perfil);
    const podeEstornar =
      statusAprovacao === "APROVADO" &&
      ["ADMIN", "SECRETARIO"].includes(this.sistema.usuarioAtual?.perfil);
    const cronogramaInteiro = this._cronogramaPedidoInteiroCache[p.id];
    const temCronogramaInteiro = !!cronogramaInteiro;

    const itensHtml =
      p.itens_pedido
        ?.map((i) => {
          const cronograma =
            this._cronogramasPorPedido[p.id]?.filter(
              (c) => String(c.item_pedido_id) === String(i.id),
            ) || [];

          const temCronograma = cronograma.length > 0 && !temCronogramaInteiro;

          return `
            <tr>
              <td>${i.item_numero || i.item_ata_id}</td>
              <td>
                <div>${i.descricao || "Descrição não disponível"}</div>
              </td>
              <td class="numeric">${i.quantidade_solicitada || 0} ${i.unidade_medida || ""}</td>
              <td class="numeric">${this.sistema.ui.formatarMoeda(i.valor_unitario)}</td>
              <td class="numeric total-item">${this.sistema.ui.formatarMoeda(i.valor_total)}</td>
            </tr>
            ${
              temCronograma
                ? `<tr class="linha-cronograma"><td colspan="5">${this._renderizarCronograma(p.id, i.id, cronograma, i)}</td></tr>`
                : ""
            }
          `;
        })
        .join("") ||
      '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--neutral-400);">Nenhum item encontrado</td></tr>';

    return `
      <div class="pedidos-lista-item" data-pedido-id="${p.id}" onclick="sistema.pedidos.toggleExpandPedido(${p.id})">
        <div class="numero-pedido"><i class="fas fa-file-invoice"></i> ${p.numero_pedido || "N/I"}</div>
        <div class="ata-info">
          <strong>Ata ${p.ata?.numero_ata || "N/I"}</strong>
          <span style="font-size:0.7rem;color:var(--neutral-400);display:block;">${p.ata?.processo_administrativo || ""}</span>
        </div>
        <div class="fornecedor-info" title="${p.fornecedor?.razao_social || "N/I"}">
          ${p.fornecedor?.razao_social || "N/I"}
        </div>
        <div class="local-info" title="${localEntrega || "Não informado"}">
          ${localEntrega ? `<i class="fas fa-map-marker-alt"></i> ${localEntrega.length > 22 ? localEntrega.slice(0, 20) + "…" : localEntrega}` : '<span style="color:var(--neutral-400);">—</span>'}
        </div>
        <div class="valor-info">${this.sistema.ui.formatarMoeda(total)}</div>
        <div class="status-info">
          ${
            statusAprovacao === "REPROVADO"
              ? `<span class="status-badge ${statusClass} clickable" onclick="event.stopPropagation(); sistema.pedidos.abrirModalMotivoRejeicao(${p.id})" title="Clique para ver o motivo da rejeição">${statusLabel} <i class="fas fa-info-circle" style="font-size: 0.6rem; margin-left: 4px;"></i></span>`
              : `<span class="status-badge ${statusClass}">${statusLabel}</span>`
          }
        </div>
        <div class="data-info"><i class="far fa-calendar-alt"></i> ${this.sistema.ui.formatarData(p.data_solicitacao)}</div>

        <div class="pedidos-detalhes" id="detalhes-${p.id}">
          <div class="detalhes-header">
            <h4><i class="fas fa-boxes"></i> Itens do Pedido (${p.itens_pedido?.length || 0} itens)</h4>
            <div class="detalhes-actions">
              <button class="btn-visualizar-pedido" onclick="event.stopPropagation(); sistema.pedidos.visualizarPedidoCompleto(${p.id})">
                <i class="fas fa-eye"></i> Ver Detalhes
              </button>
              ${
                podeAprovar
                  ? `
                <button class="btn-aprovar" onclick="event.stopPropagation(); sistema.pedidos.aprovarPedido(${p.id})">
                  <i class="fas fa-check"></i> Aprovar
                </button>
                <button class="btn-rejeitar" onclick="event.stopPropagation(); sistema.pedidos.rejeitarPedido(${p.id})">
                  <i class="fas fa-times"></i> Rejeitar
                </button>
              `
                  : ""
              }
              ${
                podeFracionar
                  ? `<button class="btn-fracionar-pedido-inteiro" onclick="event.stopPropagation(); sistema.pedidos._abrirModalFracionarPedido(${p.id})">
                       <i class="fas fa-calendar-alt"></i>
                       ${temCronogramaInteiro ? "Editar Cronograma do Pedido" : "Fracionar Entregas do Pedido"}
                     </button>
                     ${
                       temCronogramaInteiro
                         ? `<button class="btn-exportar-cronograma-pdf" onclick="event.stopPropagation(); sistema.pedidos._exportarCronogramaPedidoPDF(${p.id})" title="Exportar PDF para o fornecedor">
                              <i class="fas fa-file-pdf"></i> PDF do Cronograma
                            </button>`
                         : ""
                     }`
                  : ""
              }
              <button class="btn-timeline-pedido" onclick="event.stopPropagation(); sistema.pedidos.abrirTimelinePedido(${p.id})">
                <i class="fas fa-stream"></i> Timeline
              </button>
              ${
                podeReceber
                  ? `<button class="btn-receber-pedido" onclick="event.stopPropagation(); sistema.pedidos.abrirRecebimentoPedido(${p.id})">
                       <i class="fas fa-truck-loading"></i> Registrar Recebimento
                     </button>`
                  : ""
              }
              ${
                podeEncerrar
                  ? `<button class="btn-encerrar-pedido" onclick="event.stopPropagation(); sistema.pedidos.encerrarPedido(${p.id})">
                       <i class="fas fa-flag-checkered"></i> Encerrar Pedido
                     </button>`
                  : ""
              }
              ${
                podeEstornar
                  ? `<button class="btn-estornar-pedido" onclick="event.stopPropagation(); sistema.pedidos.abrirEstornoPedido(${p.id})">
                       <i class="fas fa-undo-alt"></i> Solicitar Estorno
                     </button>`
                  : ""
              }
              ${
                podeReceber
                  ? `<button class="btn-ocorrencia-pedido" onclick="event.stopPropagation(); sistema.pedidos.abrirOcorrenciaPedido(${p.id})">
                       <i class="fas fa-triangle-exclamation"></i> Registrar Ocorrência
                     </button>`
                  : ""
              }
            </div>
          </div>

          ${
            localEntrega
              ? `<div class="pedido-local-entrega">
                   <i class="fas fa-map-marker-alt"></i>
                   <span><strong>Local de entrega:</strong> ${localEntrega}</span>
                 </div>`
              : `<div class="pedido-local-entrega pedido-local-vazio">
                   <i class="fas fa-map-marker-alt"></i>
                   <span>Local de entrega não informado</span>
                 </div>`
          }

          <div class="tabela-container">
            <table class="tabela-itens-pedido">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th style="text-align:right;">Qtd</th>
                  <th style="text-align:right;">Valor Unit.</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itensHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" style="text-align:right;">TOTAL DO PEDIDO</td>
                  <td style="text-align:right;color:var(--success-600);font-size:1rem;">
                    ${this.sistema.ui.formatarMoeda(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          ${
            temCronogramaInteiro
              ? this._renderizarResumoCronogramaInteiro(
                  p.id,
                  cronogramaInteiro,
                  p,
                )
              : ""
          }
          <div style="margin-top:12px;font-size:0.75rem;color:var(--neutral-500);display:flex;justify-content:space-between;flex-wrap:wrap;border-top:1px solid var(--neutral-200);padding-top:10px;">
            <span><i class="fas fa-user"></i> Solicitante: ${p.usuario?.nome || "N/I"}</span>
            <span><i class="fas fa-building"></i> Órgão: ${p.orgao_solicitante?.nome || "N/I"}</span>
            ${p.aprovado_por ? `<span><i class="fas fa-check-circle"></i> Aprovado por: ${p.aprovador_nome || "N/I"}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  _escaparRecebimento(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  _fecharModalOperacional(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("active");
  }

  async abrirRecebimentoPedido(pedidoId) {
    const modal = document.getElementById("modalRecebimentoPedido");
    const content = document.getElementById("modalRecebimentoPedidoContent");
    if (!modal || !content) return;
    content.innerHTML = `<div style="padding:32px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Carregando itens do pedido...</div>`;
    modal.classList.add("active");

    try {
      const [{ data: pedido, error: pedidoError }, { data: itens, error: itensError }, { data: entregas, error: entregasError }] = await Promise.all([
        supabase.from("pedidos").select("id,numero_pedido,status_aprovacao,local_entrega").eq("id", pedidoId).single(),
        supabase.from("itens_pedido").select("id,item_ata_id,quantidade_solicitada,valor_unitario,valor_total").eq("pedido_id", pedidoId).order("id"),
        supabase.from("pedidos_entregas_itens").select("item_pedido_id,quantidade").eq("pedido_id", pedidoId),
      ]);
      if (pedidoError) throw pedidoError;
      if (itensError) throw itensError;
      if (entregasError) throw entregasError;
      if (!pedido || pedido.status_aprovacao !== "APROVADO") throw new Error("Somente pedidos aprovados podem receber entrega.");

      const entregues = {};
      (entregas || []).forEach((item) => {
        entregues[item.item_pedido_id] = (entregues[item.item_pedido_id] || 0) + Number(item.quantidade || 0);
      });
      const idsAta = [...new Set((itens || []).map((item) => item.item_ata_id).filter(Boolean))];
      const { data: itensAta, error: ataError } = idsAta.length
        ? await supabase.from("itens_ata").select("id,item_numero,descricao,unidade_medida").in("id", idsAta)
        : { data: [], error: null };
      if (ataError) throw ataError;
      const mapaAta = Object.fromEntries((itensAta || []).map((item) => [item.id, item]));

      const linhas = (itens || []).map((item) => {
        const meta = mapaAta[item.item_ata_id] || {};
        const solicitado = Number(item.quantidade_solicitada || 0);
        const entregue = Number(entregues[item.id] || 0);
        const restante = Math.max(0, solicitado - entregue);
        return `<tr>
          <td><strong>${this._escaparRecebimento(meta.item_numero || item.item_ata_id)}</strong><br><small>${this._escaparRecebimento(meta.descricao || "Item")}</small></td>
          <td>${solicitado} ${this._escaparRecebimento(meta.unidade_medida || "UN")}</td>
          <td>${entregue} ${this._escaparRecebimento(meta.unidade_medida || "UN")}</td>
          <td><strong>${restante} ${this._escaparRecebimento(meta.unidade_medida || "UN")}</strong></td>
          <td><input class="filtro-input recebimento-qtd" data-item-pedido-id="${item.id}" data-restante="${restante}" type="number" min="0" max="${restante}" step="0.01" value="${restante > 0 ? restante : 0}" ${restante <= 0 ? "disabled" : ""} aria-label="Quantidade recebida"></td>
        </tr>`;
      }).join("");

      content.innerHTML = `<div class="modal-header">
          <h2 class="modal-titulo"><i class="fas fa-truck-loading"></i> Recebimento — ${this._escaparRecebimento(pedido.numero_pedido)}</h2>
          <button type="button" class="modal-close" data-fechar-recebimento><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="padding:18px 22px">
          <p style="margin:0 0 12px;color:var(--neutral-600)"><i class="fas fa-map-marker-alt"></i> Local: <strong>${this._escaparRecebimento(pedido.local_entrega || "Não informado")}</strong></p>
          <div class="tabela-container"><table class="tabela-itens-pedido"><thead><tr><th>Item</th><th>Solicitado</th><th>Recebido</th><th>Restante</th><th>Receber agora</th></tr></thead><tbody>${linhas || '<tr><td colspan="5">Nenhum item encontrado.</td></tr>'}</tbody></table></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
            <label class="filtro-label">Tipo de recebimento<select id="recebimentoTipo" class="filtro-select"><option value="PARCIAL">Entrega parcial</option><option value="FINAL">Entrega final</option></select></label>
            <label class="filtro-label">Data<input id="recebimentoData" class="filtro-input" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
          </div>
          <label class="filtro-label" style="display:block;margin-top:12px">Documento de referência<input id="recebimentoDocumento" class="filtro-input" maxlength="180" placeholder="NF, termo de recebimento ou protocolo"></label>
          <label class="filtro-label" style="display:block;margin-top:12px">Anexo privado<input id="recebimentoArquivo" class="filtro-input" type="file" accept="application/pdf,image/*,.doc,.docx"></label>
          <label class="filtro-label" style="display:block;margin-top:12px">Observação<textarea id="recebimentoObservacao" class="filtro-input" rows="3" maxlength="1000" placeholder="Informe divergências, avarias ou observações"></textarea></label>
        </div>
        <div class="modal-footer-fracionar" style="display:flex;justify-content:flex-end;gap:10px;padding:14px 22px">
          <button type="button" class="btn-cancelar-fracionar" data-fechar-recebimento>Cancelar</button>
          <button type="button" class="btn-aprovar" id="btnSalvarRecebimento"><i class="fas fa-check"></i> Registrar recebimento</button>
        </div>`;
      content.querySelectorAll("[data-fechar-recebimento]").forEach((button) => button.addEventListener("click", () => this._fecharModalOperacional("modalRecebimentoPedido")));
      content.querySelector("#btnSalvarRecebimento")?.addEventListener("click", () => this.confirmarRecebimentoPedido(pedidoId));
    } catch (error) {
      content.innerHTML = `<div style="padding:24px"><h3>Não foi possível carregar o recebimento</h3><p>${this._escaparRecebimento(error.message)}</p><button type="button" class="btn-limpar" data-fechar-recebimento>Fechar</button></div>`;
      content.querySelector("[data-fechar-recebimento]")?.addEventListener("click", () => this._fecharModalOperacional("modalRecebimentoPedido"));
    }
  }

  async confirmarRecebimentoPedido(pedidoId) {
    const button = document.getElementById("btnSalvarRecebimento");
    const inputs = [...document.querySelectorAll("#modalRecebimentoPedidoContent .recebimento-qtd")];
    const tipo = document.getElementById("recebimentoTipo")?.value || "PARCIAL";
    if (tipo === "FINAL" && inputs.some((input) => Number(input.value || 0) < Number(input.dataset.restante || 0))) {
      this.sistema.ui.mostrarToast("aviso", "Recebimento final incompleto", "Para finalizar, informe a quantidade restante de todos os itens.");
      return;
    }
    const itens = inputs
      .map((input) => ({ item_pedido_id: Number(input.dataset.itemPedidoId), quantidade: Number(input.value || 0) }))
      .filter((item) => item.quantidade > 0);
    if (!itens.length) {
      this.sistema.ui.mostrarToast("aviso", "Nenhuma quantidade informada", "Informe ao menos um item recebido.");
      return;
    }
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...'; }
    try {
      const { data: entrega, error } = await supabase.rpc("compras_registrar_entrega", {
        p_pedido_id: pedidoId,
        p_itens: itens,
        p_tipo: tipo,
        p_data_entrega: document.getElementById("recebimentoData")?.value || new Date().toISOString().slice(0,10),
        p_documento: document.getElementById("recebimentoDocumento")?.value?.trim() || null,
        p_observacao: document.getElementById("recebimentoObservacao")?.value?.trim() || null,
      });
      if (error) throw error;
      const arquivo = document.getElementById("recebimentoArquivo")?.files?.[0];
      if (arquivo && this.sistema.saasExperience) {
        await this.sistema.saasExperience.uploadDocumento({ entidade: "ENTREGA", entidadeId: entrega?.entrega_id, arquivo });
      }
      this._fecharModalOperacional("modalRecebimentoPedido");
      this.sistema.ui.mostrarToast("sucesso", "Recebimento registrado", "A entrega foi registrada e entrou na timeline do pedido.");
      await this.abrirTimelinePedido(pedidoId);
    } catch (error) {
      this.sistema.ui.mostrarToast("erro", "Falha no recebimento", error.message || "Não foi possível registrar a entrega.");
    } finally {
      if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-check"></i> Registrar recebimento'; }
    }
  }

  async abrirTimelinePedido(pedidoId) {
    const modal = document.getElementById("modalTimelinePedido");
    const content = document.getElementById("modalTimelinePedidoContent");
    if (!modal || !content) return;
    content.innerHTML = `<div style="padding:32px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Carregando timeline...</div>`;
    modal.classList.add("active");
    try {
      const [{ data: pedido, error: pedidoError }, { data: eventos, error: eventosError }, { data: entregas, error: entregasError }, { data: ocorrencias, error: ocorrenciasError }] = await Promise.all([
        supabase.from("pedidos").select("numero_pedido,status,status_aprovacao,created_at").eq("id", pedidoId).single(),
        supabase.from("pedidos_eventos").select("id,evento,status_anterior,status_novo,ator_id,justificativa,metadados,ocorrido_em").eq("pedido_id", pedidoId).order("ocorrido_em", { ascending: false }),
        supabase.from("pedidos_entregas").select("id,numero,data_entrega,tipo,documento_referencia,observacao,recebido_por,created_at").eq("pedido_id", pedidoId).order("numero", { ascending: false }),
        supabase.from("pedidos_ocorrencias").select("id,tipo,severidade,descricao,resolvida,registrada_por,created_at").eq("pedido_id", pedidoId).order("created_at", { ascending: false }),
      ]);
      if (pedidoError) throw pedidoError;
      if (eventosError) throw eventosError;
      if (entregasError) throw entregasError;
      if (ocorrenciasError) throw ocorrenciasError;
      const atorIds = [...new Set((eventos || []).map((e) => e.ator_id).concat((entregas || []).map((e) => e.recebido_por), (ocorrencias || []).map((e) => e.registrada_por)).filter(Boolean))];
      const { data: atores } = atorIds.length ? await supabase.from("usuarios").select("id,nome").in("id", atorIds) : { data: [] };
      const nomes = Object.fromEntries((atores || []).map((a) => [a.id, a.nome]));
      const eventosHtml = (eventos || []).map((evento) => `<div style="position:relative;padding:0 0 18px 30px;border-left:2px solid var(--primary-200)">
        <span style="position:absolute;left:-8px;top:0;width:14px;height:14px;border-radius:50%;background:var(--primary-600);border:3px solid white;box-shadow:0 0 0 1px var(--primary-200)"></span>
        <strong>${this._escaparRecebimento(this._rotuloEventoPedido(evento.evento))}</strong><small style="display:block;color:var(--neutral-500)">${this._escaparRecebimento(this._formatarDataHora(evento.ocorrido_em))} · ${this._escaparRecebimento(nomes[evento.ator_id] || "Sistema")}</small>
        ${evento.status_anterior || evento.status_novo ? `<div style="margin-top:5px;font-size:.8rem">${this._escaparRecebimento(evento.status_anterior || "inicial")} → <strong>${this._escaparRecebimento(evento.status_novo || "")}</strong></div>` : ""}
        ${evento.justificativa ? `<p style="margin:5px 0 0;color:var(--neutral-700)">${this._escaparRecebimento(evento.justificativa)}</p>` : ""}
      </div>`).join("");
      const entregasHtml = (entregas || []).map((entrega) => `<div style="position:relative;padding:0 0 18px 30px;border-left:2px solid var(--success-200)">
        <span style="position:absolute;left:-8px;top:0;width:14px;height:14px;border-radius:50%;background:var(--success-600);border:3px solid white;box-shadow:0 0 0 1px var(--success-200)"></span>
        <strong>Entrega ${entrega.numero} · ${this._escaparRecebimento(entrega.tipo)}</strong><small style="display:block;color:var(--neutral-500)">${this._escaparRecebimento(this._formatarDataHora(entrega.data_entrega))} · ${this._escaparRecebimento(nomes[entrega.recebido_por] || "Usuário")}</small>
        ${entrega.documento_referencia ? `<div style="font-size:.8rem;margin-top:5px">Documento: ${this._escaparRecebimento(entrega.documento_referencia)}</div>` : ""}
        ${entrega.observacao ? `<p style="margin:5px 0 0;color:var(--neutral-700)">${this._escaparRecebimento(entrega.observacao)}</p>` : ""}
      </div>`).join("");
      const ocorrenciasHtml = (ocorrencias || []).map((ocorrencia) => `<div style="position:relative;padding:0 0 18px 30px;border-left:2px solid var(--warning-300)">
        <span style="position:absolute;left:-8px;top:0;width:14px;height:14px;border-radius:50%;background:var(--warning-600);border:3px solid white;box-shadow:0 0 0 1px var(--warning-200)"></span>
        <strong>Ocorrência · ${this._escaparRecebimento(ocorrencia.tipo)} <span class="status-badge">${this._escaparRecebimento(ocorrencia.severidade)}</span></strong><small style="display:block;color:var(--neutral-500)">${this._escaparRecebimento(this._formatarDataHora(ocorrencia.created_at))} · ${this._escaparRecebimento(nomes[ocorrencia.registrada_por] || "Usuário")}</small>
        <p style="margin:5px 0 0;color:var(--neutral-700)">${this._escaparRecebimento(ocorrencia.descricao)}</p>
      </div>`).join("");
      content.innerHTML = `<div class="modal-header"><h2 class="modal-titulo"><i class="fas fa-stream"></i> Timeline — ${this._escaparRecebimento(pedido.numero_pedido)}</h2><button type="button" class="modal-close" data-fechar-timeline><i class="fas fa-times"></i></button></div>
        <div class="modal-body" style="padding:20px 24px"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px"><span class="status-badge">${this._escaparRecebimento(pedido.status_aprovacao || pedido.status || "")}</span><span style="font-size:.8rem;color:var(--neutral-500)">Criado em ${this._escaparRecebimento(this._formatarDataHora(pedido.created_at))}</span></div>
        <div>${eventosHtml || ""}${entregasHtml || ""}${ocorrenciasHtml || ""}${!eventosHtml && !entregasHtml && !ocorrenciasHtml ? '<p style="color:var(--neutral-500)">Nenhum evento registrado.</p>' : ""}</div></div>`;
      content.querySelector("[data-fechar-timeline]")?.addEventListener("click", () => this._fecharModalOperacional("modalTimelinePedido"));
    } catch (error) {
      content.innerHTML = `<div style="padding:24px"><h3>Não foi possível carregar a timeline</h3><p>${this._escaparRecebimento(error.message)}</p><button type="button" class="btn-limpar" data-fechar-timeline>Fechar</button></div>`;
      content.querySelector("[data-fechar-timeline]")?.addEventListener("click", () => this._fecharModalOperacional("modalTimelinePedido"));
    }
  }

  async abrirEstornoPedido(pedidoId) {
    const modal = document.getElementById("modalEstornoPedido");
    const content = document.getElementById("modalEstornoPedidoContent");
    if (!modal || !content) return;
    content.innerHTML = `<div style="padding:32px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Carregando itens elegíveis...</div>`;
    modal.classList.add("active");
    try {
      const [{ data: pedido, error: pedidoError }, { data: itens, error: itensError }, { data: entregas, error: entregasError }] = await Promise.all([
        supabase.from("pedidos").select("id,numero_pedido,status_aprovacao").eq("id", pedidoId).single(),
        supabase.from("itens_pedido").select("id,item_ata_id,quantidade_solicitada,valor_unitario").eq("pedido_id", pedidoId).order("id"),
        supabase.from("pedidos_entregas_itens").select("item_pedido_id,quantidade").eq("pedido_id", pedidoId),
      ]);
      if (pedidoError) throw pedidoError;
      if (itensError) throw itensError;
      if (entregasError) throw entregasError;
      if ((entregas || []).length) throw new Error("Este pedido já possui entrega registrada. Use o fluxo de devolução formal.");
      const ids = [...new Set((itens || []).map((i) => i.item_ata_id).filter(Boolean))];
      const { data: metas, error: metaError } = ids.length
        ? await supabase.from("itens_ata").select("id,item_numero,descricao,unidade_medida").in("id", ids)
        : { data: [], error: null };
      if (metaError) throw metaError;
      const metaMap = Object.fromEntries((metas || []).map((m) => [m.id, m]));
      const rows = (itens || []).map((i) => {
        const m = metaMap[i.item_ata_id] || {};
        return `<tr><td><strong>${this._escaparRecebimento(m.item_numero || i.item_ata_id)}</strong><br><small>${this._escaparRecebimento(m.descricao || "Item")}</small></td><td>${i.quantidade_solicitada} ${this._escaparRecebimento(m.unidade_medida || "UN")}</td><td><input class="estorno-qtd filtro-input" data-item-pedido-id="${i.id}" max="${i.quantidade_solicitada}" min="0" step="0.01" type="number" value="0"></td></tr>`;
      }).join("");
      content.innerHTML = `<div class="modal-header"><h2 class="modal-titulo"><i class="fas fa-undo-alt"></i> Solicitar estorno — ${this._escaparRecebimento(pedido.numero_pedido)}</h2><button type="button" class="modal-close" data-fechar-estorno><i class="fas fa-times"></i></button></div><div class="modal-body" style="padding:18px 22px"><p class="aviso-estorno"><i class="fas fa-circle-info"></i> O estorno não apaga o consumo; ele será submetido à aprovação de outro gestor.</p><div class="tabela-container"><table class="tabela-itens-pedido"><thead><tr><th>Item</th><th>Solicitado</th><th>Quantidade a estornar</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Nenhum item disponível.</td></tr>'}</tbody></table></div><label class="filtro-label" style="display:block;margin-top:14px">Justificativa <textarea id="estornoJustificativa" class="filtro-input" minlength="10" maxlength="1000" rows="4" placeholder="Explique o motivo do estorno (mínimo de 10 caracteres)"></textarea></label></div><div class="modal-footer-fracionar" style="display:flex;justify-content:flex-end;gap:10px;padding:14px 22px"><button type="button" class="btn-cancelar-fracionar" data-fechar-estorno>Cancelar</button><button type="button" class="btn-estornar-pedido" id="btnSalvarEstorno"><i class="fas fa-paper-plane"></i> Enviar solicitação</button></div>`;
      content.querySelectorAll("[data-fechar-estorno]").forEach((b) => b.addEventListener("click", () => this._fecharModalOperacional("modalEstornoPedido")));
      content.querySelector("#btnSalvarEstorno")?.addEventListener("click", () => this.confirmarEstornoPedido(pedidoId));
    } catch (error) {
      content.innerHTML = `<div style="padding:24px"><h3>Não foi possível abrir o estorno</h3><p>${this._escaparRecebimento(error.message)}</p><button type="button" class="btn-limpar" data-fechar-estorno>Fechar</button></div>`;
      content.querySelector("[data-fechar-estorno]")?.addEventListener("click", () => this._fecharModalOperacional("modalEstornoPedido"));
    }
  }

  async confirmarEstornoPedido(pedidoId) {
    const justificativa = document.getElementById("estornoJustificativa")?.value.trim() || "";
    const itens = [...document.querySelectorAll("#modalEstornoPedidoContent .estorno-qtd")].map((i) => ({ item_pedido_id: Number(i.dataset.itemPedidoId), quantidade: Number(i.value || 0) })).filter((i) => i.quantidade > 0);
    if (justificativa.length < 10) { this.sistema.ui.mostrarToast("aviso", "Justificativa insuficiente", "Informe pelo menos 10 caracteres."); return; }
    if (!itens.length) { this.sistema.ui.mostrarToast("aviso", "Nenhum item informado", "Informe ao menos uma quantidade para estorno."); return; }
    const button = document.getElementById("btnSalvarEstorno");
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }
    try {
      const { error } = await supabase.rpc("compras_solicitar_estorno", { p_pedido_id: pedidoId, p_itens: itens, p_justificativa: justificativa });
      if (error) throw error;
      this._fecharModalOperacional("modalEstornoPedido");
      this.sistema.ui.mostrarToast("sucesso", "Solicitação de estorno enviada", "A decisão ficará registrada na timeline.");
      await this.abrirTimelinePedido(pedidoId);
    } catch (error) { this.sistema.ui.mostrarToast("erro", "Falha no estorno", error.message || "Não foi possível solicitar o estorno."); }
    finally { if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar solicitação'; } }
  }

  abrirOcorrenciaPedido(pedidoId) {
    const modal = document.getElementById("modalOcorrenciaPedido");
    const content = document.getElementById("modalOcorrenciaPedidoContent");
    if (!modal || !content) return;
    content.innerHTML = `<div class="modal-header"><h2 class="modal-titulo"><i class="fas fa-triangle-exclamation"></i> Registrar ocorrência</h2><button type="button" class="modal-close" data-fechar-ocorrencia><i class="fas fa-times"></i></button></div><div class="modal-body" style="padding:18px 22px"><label class="filtro-label">Tipo<select id="ocorrenciaTipo" class="filtro-select"><option>DIVERGENCIA</option><option>AVARIA</option><option>ATRASO</option><option>RECUSA</option><option>DEVOLUCAO</option><option>OUTRA</option></select></label><label class="filtro-label" style="display:block;margin-top:12px">Severidade<select id="ocorrenciaSeveridade" class="filtro-select"><option>NORMAL</option><option>ALTA</option><option>CRITICA</option></select></label><label class="filtro-label" style="display:block;margin-top:12px">Descrição<textarea id="ocorrenciaDescricao" class="filtro-input" minlength="5" maxlength="1000" rows="5" placeholder="Descreva o fato e a providência necessária"></textarea></label><label class="filtro-label" style="display:block;margin-top:12px">Evidência privada<input id="ocorrenciaArquivo" class="filtro-input" type="file" accept="application/pdf,image/*,.doc,.docx"></label></div><div class="modal-footer-fracionar" style="display:flex;justify-content:flex-end;gap:10px;padding:14px 22px"><button type="button" class="btn-cancelar-fracionar" data-fechar-ocorrencia>Cancelar</button><button type="button" class="btn-ocorrencia-pedido" id="btnSalvarOcorrencia"><i class="fas fa-save"></i> Registrar</button></div>`;
    modal.classList.add("active");
    content.querySelectorAll("[data-fechar-ocorrencia]").forEach((b) => b.addEventListener("click", () => this._fecharModalOperacional("modalOcorrenciaPedido")));
    content.querySelector("#btnSalvarOcorrencia")?.addEventListener("click", () => this.confirmarOcorrenciaPedido(pedidoId));
  }

  async confirmarOcorrenciaPedido(pedidoId) {
    const descricao = document.getElementById("ocorrenciaDescricao")?.value.trim() || "";
    if (descricao.length < 5) { this.sistema.ui.mostrarToast("aviso", "Descrição insuficiente", "Informe pelo menos 5 caracteres."); return; }
    const { data: ocorrencia, error } = await supabase.rpc("compras_registrar_ocorrencia", { p_pedido_id: pedidoId, p_tipo: document.getElementById("ocorrenciaTipo")?.value, p_descricao: descricao, p_severidade: document.getElementById("ocorrenciaSeveridade")?.value });
    if (error) { this.sistema.ui.mostrarToast("erro", "Falha na ocorrência", error.message); return; }
    const arquivo = document.getElementById("ocorrenciaArquivo")?.files?.[0];
    if (arquivo && this.sistema.saasExperience) {
      try { await this.sistema.saasExperience.uploadDocumento({ entidade: "OCORRENCIA", entidadeId: ocorrencia?.ocorrencia_id, arquivo }); }
      catch (uploadError) { this.sistema.ui.mostrarToast("aviso", "Ocorrência registrada", `Não foi possível anexar o arquivo: ${uploadError.message}`); }
    }
    this._fecharModalOperacional("modalOcorrenciaPedido");
    this.sistema.ui.mostrarToast("sucesso", "Ocorrência registrada", "O evento foi incluído na timeline.");
    await this.abrirTimelinePedido(pedidoId);
  }

  _rotuloEventoPedido(evento) {
    return { STATUS_ALTERADO: "Status alterado", SALDO_RESERVADO: "Saldo reservado", ENTREGA_REGISTRADA: "Entrega registrada", ESTORNO_SOLICITADO: "Estorno solicitado", ESTORNO_APROVADO: "Estorno aprovado", ESTORNO_REJEITADO: "Estorno rejeitado", OCORRENCIA_REGISTRADA: "Ocorrência registrada", PEDIDO_ENCERRADO: "Pedido encerrado" }[evento] || evento || "Evento";
  }

  _formatarDataHora(valor) {
    if (!valor) return "—";
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return this._formatarDataBR(valor);
    return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  atualizarContador() {
    const contadorEl = document.getElementById("pedidosContador");
    const carregarMaisEl = document.getElementById("btnCarregarMais");
    if (!contadorEl) return;

    const exibidos = this.pedidosCache.length;
    const total = this.totalPedidos;

    if (total === 0) {
      contadorEl.innerHTML = "Nenhum pedido encontrado";
      if (carregarMaisEl) carregarMaisEl.style.display = "none";
      return;
    }

    contadorEl.innerHTML = `Exibindo <strong>${exibidos}</strong> de <strong>${total}</strong> pedidos`;

    if (carregarMaisEl) {
      if (exibidos < total) {
        carregarMaisEl.style.display = "inline-flex";
        carregarMaisEl.disabled = false;
      } else {
        carregarMaisEl.style.display = "none";
      }
    }
  }

  async carregarMaisPedidos() {
    if (this._carregandoMais) return;
    if (this.pedidosCache.length >= this.totalPedidos) return;

    this._carregandoMais = true;
    const btn = document.getElementById("btnCarregarMais");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    }

    this.offset += this.limit;
    await this.carregarPedidos();

    this._carregandoMais = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-chevron-down"></i> Carregar mais 15';
    }
  }

  toggleExpandPedido(pedidoId) {
    const detalhes = document.getElementById(`detalhes-${pedidoId}`);
    if (!detalhes) return;

    const item = detalhes.closest(".pedidos-lista-item");
    const isExpanded = detalhes.classList.contains("ativo");

    document.querySelectorAll(".pedidos-detalhes.ativo").forEach((el) => {
      if (el.id !== `detalhes-${pedidoId}`) {
        el.classList.remove("ativo");
        el.closest(".pedidos-lista-item")?.classList.remove("expandido");
      }
    });

    if (isExpanded) {
      detalhes.classList.remove("ativo");
      item?.classList.remove("expandido");
    } else {
      detalhes.classList.add("ativo");
      item?.classList.add("expandido");
      item?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  _configurarEventosFracionamento() {
    if (this._eventosFracionamentoConfigurados) return;
    this._eventosFracionamentoConfigurados = true;
    document.addEventListener("click", (e) => {
      const modalFrac = document.getElementById("modalFracionar");
      if (modalFrac?.classList.contains("active") && e.target === modalFrac) {
        this._fecharModalFracionar();
      }
    });

    document
      .getElementById("btnFecharModalExclusaoFrac")
      ?.addEventListener("click", () => this._fecharModalExclusaoFrac());

    document
      .getElementById("btnCancelarExclusaoFrac")
      ?.addEventListener("click", () => this._fecharModalExclusaoFrac());

    document
      .getElementById("btnConfirmarExclusaoFrac")
      ?.addEventListener("click", () => this._confirmarExclusaoFracionamento());

    const modalExc = document.getElementById("modalConfirmarExclusaoFrac");
    if (modalExc) {
      modalExc.addEventListener("click", (e) => {
        if (e.target === modalExc) this._fecharModalExclusaoFrac();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modalFrac = document.getElementById("modalFracionar");
        const modalExc = document.getElementById("modalConfirmarExclusaoFrac");
        if (modalExc?.classList.contains("active")) {
          this._fecharModalExclusaoFrac();
        } else if (modalFrac?.classList.contains("active")) {
          this._fecharModalFracionar();
        }
      }
    });
  }

  async _carregarCronogramasDosPedidos(idsPedidos) {
    if (!idsPedidos || idsPedidos.length === 0) return;

    try {
      const { data, error } = await supabase
        .from("entregas_fracionadas")
        .select("*")
        .in("pedido_id", idsPedidos)
        .order("numero_entrega", { ascending: true });

      if (error) throw error;

      const porPedido = {};
      (data || []).forEach((linha) => {
        if (!porPedido[linha.pedido_id]) porPedido[linha.pedido_id] = [];
        porPedido[linha.pedido_id].push(linha);
      });

      this._cronogramasPorPedido = porPedido;
    } catch (err) {
      console.warn("[Pedidos] Erro ao carregar cronogramas:", err);
      this._cronogramasPorPedido = {};
    }
  }

  _renderizarCronograma(pedidoId, itemPedidoId, cronograma, itemPedido) {
    const total = cronograma.reduce(
      (s, l) => s + (Number(l.quantidade) || 0),
      0,
    );
    const totalItem = Number(itemPedido.quantidade_solicitada) || 0;
    const unidade = itemPedido.unidade_medida || "UN";

    const semanas = [...cronograma]
      .sort(
        (a, b) => Number(a.numero_entrega || 0) - Number(b.numero_entrega || 0),
      )
      .map((linha, index) => ({
        numero: Number(
          linha.numero_semana || linha.numero_entrega || index + 1,
        ),
        inicio: linha.data_prevista_inicio,
        fim: linha.data_prevista_fim,
        quantidade: Number(linha.quantidade) || 0,
      }));

    const cabecalhos = semanas
      .map(
        (sem) => `
          <th>
            <span>Semana ${sem.numero}</span>
            <small>${this._formatarDataBR(sem.inicio)} a ${this._formatarDataBR(sem.fim)}</small>
          </th>
        `,
      )
      .join("");

    const celulas = semanas
      .map(
        (sem) =>
          `<td>${sem.quantidade > 0 ? `${sem.quantidade} ${unidade}` : "—"}</td>`,
      )
      .join("");

    return `
      <div class="cronograma-wrapper">
        <div class="cronograma-header">
          <div>
            <div class="cronograma-header-titulo">
              <i class="fas fa-calendar-alt"></i>
              Cronograma de Entregas — ${itemPedido.item_numero || ""} ${itemPedido.descricao ? `· ${itemPedido.descricao.slice(0, 50)}` : ""}
            </div>
            <div class="cronograma-header-meta">
              Total programado: <strong>${total} ${unidade}</strong> de ${totalItem} ${unidade}
            </div>
          </div>
          <div class="cronograma-acoes">
            <button type="button" class="cronograma-btn cronograma-btn-pdf" onclick="event.stopPropagation(); sistema.pedidos._exportarCronogramaPDF(${pedidoId}, ${itemPedidoId})" title="Exportar PDF">
              <i class="fas fa-file-pdf"></i> PDF
            </button>
            <button type="button" class="cronograma-btn cronograma-btn-csv" onclick="event.stopPropagation(); sistema.pedidos._exportarCronogramaCSV(${pedidoId}, ${itemPedidoId})" title="Exportar CSV">
              <i class="fas fa-file-csv"></i> CSV
            </button>
            <button type="button" class="cronograma-btn cronograma-btn-editar" onclick="event.stopPropagation(); sistema.pedidos._editarFracionamento(${pedidoId}, ${itemPedidoId})" title="Editar cronograma">
              <i class="fas fa-pen"></i> Editar
            </button>
            <button type="button" class="cronograma-btn cronograma-btn-excluir" onclick="event.stopPropagation(); sistema.pedidos._abrirModalExclusaoFracionamento(${pedidoId}, ${itemPedidoId})" title="Excluir cronograma">
              <i class="fas fa-trash"></i> Excluir
            </button>
          </div>
        </div>
        <div class="cronograma-matriz-scroll">
          <table class="tabela-cronograma-matriz">
            <thead>
              <tr>
                <th>Produto</th>
                ${cabecalhos}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="cronograma-item-resumo">
                  <strong>#${itemPedido.item_numero || "—"}</strong>
                  <span>${itemPedido.descricao || "Produto não informado"}</span>
                  <small>${unidade}</small>
                </td>
                ${celulas}
                <td class="cronograma-total-resumo"><strong>${total} ${unidade}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async _abrirModalFracionar(pedidoId, itemPedidoId) {
    const pedido = this.pedidosCache.find(
      (p) => String(p.id) === String(pedidoId),
    );
    if (!pedido) {
      this.sistema.ui.mostrarToast("erro", "Pedido não encontrado.");
      return;
    }

    const item = await this._carregarItensPedidoDetalhado(
      pedidoId,
      itemPedidoId,
    );
    if (!item) {
      this.sistema.ui.mostrarToast("erro", "Item do pedido não encontrado.");
      return;
    }

    this._pedidoFracionando = pedido;
    this._itemFracionando = item;
    this.mesFracionamentoAtual = this._mesSeguinteISO();

    // As linhas passam a representar as semanas reais do mês selecionado,
    // em vez de quatro blocos fixos e sem datas.
    this._linhasFracionamentoTemp = this._obterSemanasDoMes(
      this.mesFracionamentoAtual,
    ).map((semana) => ({
      _id: ++this._itemContadorTemp,
      numero_entrega: semana.numero,
      data_prevista_inicio: semana.data_inicio,
      data_prevista_fim: semana.data_fim,
      quantidade: "",
    }));

    this._renderizarModalFracionar();
    const modal = document.getElementById("modalFracionar");
    if (modal) modal.classList.add("active");
  }

  async _editarFracionamento(pedidoId, itemPedidoId) {
    const cronograma =
      this._cronogramasPorPedido[pedidoId]?.filter(
        (c) => String(c.item_pedido_id) === String(itemPedidoId),
      ) || [];

    if (cronograma.length === 0) {
      return this._abrirModalFracionar(pedidoId, itemPedidoId);
    }

    const pedido = this.pedidosCache.find(
      (p) => String(p.id) === String(pedidoId),
    );
    if (!pedido) {
      this.sistema.ui.mostrarToast("erro", "Pedido não encontrado.");
      return;
    }

    const item = await this._carregarItensPedidoDetalhado(
      pedidoId,
      itemPedidoId,
    );
    if (!item) {
      this.sistema.ui.mostrarToast("erro", "Item do pedido não encontrado.");
      return;
    }

    this._pedidoFracionando = pedido;
    this._itemFracionando = item;
    this.mesFracionamentoAtual =
      this._mesDaDataISO(cronograma[0]?.data_prevista_inicio) ||
      this._mesSeguinteISO();

    this._linhasFracionamentoTemp = cronograma.map((linha, idx) => ({
      _id: ++this._itemContadorTemp,
      _originalId: linha.id,
      numero_entrega: linha.numero_entrega || idx + 1,
      data_prevista_inicio: linha.data_prevista_inicio || "",
      data_prevista_fim: linha.data_prevista_fim || "",
      quantidade: linha.quantidade || "",
    }));

    this._renderizarModalFracionar();
    const modal = document.getElementById("modalFracionar");
    if (modal) modal.classList.add("active");
  }

  async _carregarItensPedidoDetalhado(pedidoId, itemPedidoId) {
    const { data, error } = await supabase
      .from("itens_pedido")
      .select(
        `
        id,
        pedido_id,
        item_ata_id,
        quantidade_solicitada,
        valor_unitario,
        valor_total,
        item:itens_ata(
          id,
          item_numero,
          descricao,
          unidade_medida
        )
      `,
      )
      .eq("id", itemPedidoId)
      .eq("pedido_id", pedidoId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      pedido_id: data.pedido_id,
      item_ata_id: data.item_ata_id,
      quantidade_solicitada: data.quantidade_solicitada || 0,
      valor_unitario: data.valor_unitario || 0,
      valor_total: data.valor_total || 0,
      item_numero: data.item?.item_numero || "",
      descricao: data.item?.descricao || "",
      unidade_medida: data.item?.unidade_medida || "UN",
    };
  }

  _renderizarModalFracionar() {
    const container = document.getElementById("modalFracionarContent");
    if (!container) return;

    const item = this._itemFracionando;
    const pedido = this._pedidoFracionando;
    if (!item || !pedido) return;

    const totalItem = Number(item.quantidade_solicitada) || 0;
    const unidade = item.unidade_medida || "UN";
    const totalLinhas = this._linhasFracionamentoTemp.reduce(
      (s, l) => s + (Number(l.quantidade) || 0),
      0,
    );
    const dif = totalItem - totalLinhas;
    const bate = Math.abs(dif) < 0.0001;
    const sobrou = dif > 0;

    const statusSomaClass = bate ? "ok" : totalLinhas === 0 ? "neutro" : "erro";
    const statusSomaIcon = bate
      ? "fa-check-circle"
      : totalLinhas === 0
        ? "fa-info-circle"
        : "fa-exclamation-triangle";
    const statusSomaTexto = bate
      ? `Soma confere: ${totalLinhas} ${unidade}`
      : totalLinhas === 0
        ? `Nenhuma quantidade informada ainda (total do item: ${totalItem} ${unidade})`
        : sobrou
          ? `Faltam ${dif} ${unidade} para fechar o total do item`
          : `Excedeu ${Math.abs(dif)} ${unidade} do total do item`;

    const linhasHtml = this._linhasFracionamentoTemp
      .map(
        (l, idx) => `
        <div class="fracionamento-linha" data-linha-id="${l._id}">
          <div class="fracionamento-linha-num">${idx + 1}</div>
          <input
            type="date"
            class="input-data-inicio"
            data-field="data_prevista_inicio"
            data-linha-id="${l._id}"
            value="${l.data_prevista_inicio || ""}"
            aria-label="Data início da entrega ${idx + 1}"
          />
          <input
            type="date"
            class="input-data-fim"
            data-field="data_prevista_fim"
            data-linha-id="${l._id}"
            value="${l.data_prevista_fim || ""}"
            aria-label="Data fim da entrega ${idx + 1}"
          />
          <input
            type="number"
            class="input-quantidade"
            data-field="quantidade"
            data-linha-id="${l._id}"
            value="${l.quantidade || ""}"
            min="0"
            step="0.01"
            placeholder="Qtd"
            aria-label="Quantidade da entrega ${idx + 1}"
          />
          <button
            type="button"
            class="fracionamento-linha-remover"
            data-linha-id="${l._id}"
            title="Remover esta entrega"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `,
      )
      .join("");

    container.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-titulo">
          <i class="fas fa-calendar-alt"></i> Fracionar Entregas
        </h2>
        <button type="button" class="modal-close" id="btnFecharModalFracionar" title="Fechar">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="modal-body-fracionar">
        <div class="fracionamento-info">
          <div class="fracionamento-info-titulo">
            <i class="fas fa-box"></i>
            <span>
              <strong>${item.item_numero || "—"}</strong>
              ${item.descricao ? ` · ${item.descricao.slice(0, 80)}` : ""}
            </span>
          </div>
          <div class="fracionamento-info-meta">
            <span>Pedido: <strong>${pedido.numero_pedido || "N/I"}</strong></span>
            <span>Ata: <strong>${pedido.ata?.numero_ata || "N/I"}</strong></span>
            <span>Local: <strong>${pedido.local_entrega || "—"}</strong></span>
            <span>Total do item: <strong>${totalItem} ${unidade}</strong></span>
          </div>
        </div>

        <div class="fracionamento-info-meta" style="margin-top:10px;">
          <label style="display:flex;align-items:center;gap:8px;">
            <i class="fas fa-calendar-week"></i>
            <strong>Mês de entrega:</strong>
            <input
              type="month"
              id="mesEntregaFracionamento"
              class="filtro-input"
              value="${this.mesFracionamentoAtual}"
              aria-label="Mês de entrega do fracionamento"
            />
          </label>
          <small style="display:block;margin-top:6px;color:var(--neutral-500);">
            As semanas são calculadas de acordo com o calendário do mês, desconsiderando sábados, domingos e feriados.
          </small>
        </div>

        <div class="fracionamento-tabela-header">
          <span>Nº</span>
          <span>Início</span>
          <span>Fim</span>
          <span style="text-align:right;">Quantidade</span>
          <span></span>
        </div>

        <div class="fracionamento-tabela" id="fracionamentoTabela">
          ${linhasHtml}
        </div>

        <div class="fracionamento-acoes-add">
          <button type="button" class="btn-adicionar-linha" id="btnAdicionarLinhaFrac">
            <i class="fas fa-plus"></i> Adicionar semana
          </button>
        </div>

        <div class="fracionamento-total ${statusSomaClass}">
          <span>
            <i class="fas ${statusSomaIcon}"></i>
            ${statusSomaTexto}
          </span>
          <span class="fracionamento-total-valor">
            ${totalLinhas} / ${totalItem} ${unidade}
          </span>
        </div>
      </div>

      <div class="modal-footer-fracionar">
        <button type="button" class="btn-cancelar-fracionar" id="btnCancelarFrac">
          <i class="fas fa-times"></i> Cancelar
        </button>
        <button type="button" class="btn-salvar-fracionar" id="btnSalvarFrac" ${!bate ? "disabled" : ""}>
          <i class="fas fa-save"></i> Salvar Cronograma
        </button>
      </div>
    `;

    this._conectarEventosModalFracionar();
  }

  _conectarEventosModalFracionar() {
    const container = document.getElementById("modalFracionarContent");
    if (!container) return;

    document
      .getElementById("btnFecharModalFracionar")
      ?.addEventListener("click", () => {
        this._fecharModalFracionar();
      });

    document
      .getElementById("btnCancelarFrac")
      ?.addEventListener("click", () => {
        this._fecharModalFracionar();
      });

    document.getElementById("btnSalvarFrac")?.addEventListener("click", () => {
      this._salvarFracionamento();
    });

    document
      .getElementById("btnAdicionarLinhaFrac")
      ?.addEventListener("click", () => {
        this._adicionarLinhaFracionamento();
      });

    document
      .getElementById("mesEntregaFracionamento")
      ?.addEventListener("change", (e) => {
        this._alterarMesFracionamento(e.target.value, "individual");
      });

    container.querySelectorAll(".fracionamento-linha").forEach((linha) => {
      const inputs = linha.querySelectorAll("input[data-field]");
      inputs.forEach((input) => {
        input.addEventListener("input", (e) => {
          const linhaId = parseInt(e.target.dataset.linhaId);
          const field = e.target.dataset.field;
          const lin = this._linhasFracionamentoTemp.find(
            (l) => l._id === linhaId,
          );
          if (lin) {
            lin[field] = e.target.value;
          }
          this._atualizarSomaFracionamento();
        });
      });
    });

    container
      .querySelectorAll(".fracionamento-linha-remover")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const linhaId = parseInt(btn.dataset.linhaId);
          this._removerLinhaFracionamento(linhaId);
        });
      });
  }

  _adicionarLinhaFracionamento() {
    const proximoNumero = this._linhasFracionamentoTemp.length + 1;
    this._linhasFracionamentoTemp.push({
      _id: ++this._itemContadorTemp,
      numero_entrega: proximoNumero,
      data_prevista_inicio: "",
      data_prevista_fim: "",
      quantidade: "",
    });
    this._renderizarModalFracionar();
  }

  _removerLinhaFracionamento(linhaId) {
    if (this._linhasFracionamentoTemp.length <= 1) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Não é possível remover",
        "O cronograma precisa ter pelo menos uma linha.",
      );
      return;
    }

    this._linhasFracionamentoTemp = this._linhasFracionamentoTemp.filter(
      (l) => l._id !== linhaId,
    );

    this._linhasFracionamentoTemp.forEach((l, idx) => {
      l.numero_entrega = idx + 1;
    });

    this._renderizarModalFracionar();
  }

  _atualizarSomaFracionamento() {
    const totalEl = document.querySelector(".fracionamento-total");
    if (!totalEl) return;

    const item = this._itemFracionando;
    if (!item) return;

    const totalItem = Number(item.quantidade_solicitada) || 0;
    const unidade = item.unidade_medida || "UN";
    const totalLinhas = this._linhasFracionamentoTemp.reduce(
      (s, l) => s + (Number(l.quantidade) || 0),
      0,
    );
    const dif = totalItem - totalLinhas;
    const bate = Math.abs(dif) < 0.0001;
    const sobrou = dif > 0;

    const statusSomaClass = bate ? "ok" : totalLinhas === 0 ? "neutro" : "erro";
    const statusSomaIcon = bate
      ? "fa-check-circle"
      : totalLinhas === 0
        ? "fa-info-circle"
        : "fa-exclamation-triangle";
    const statusSomaTexto = bate
      ? `Soma confere: ${totalLinhas} ${unidade}`
      : totalLinhas === 0
        ? `Nenhuma quantidade informada ainda (total do item: ${totalItem} ${unidade})`
        : sobrou
          ? `Faltam ${dif} ${unidade} para fechar o total do item`
          : `Excedeu ${Math.abs(dif)} ${unidade} do total do item`;

    totalEl.className = `fracionamento-total ${statusSomaClass}`;
    totalEl.innerHTML = `
      <span>
        <i class="fas ${statusSomaIcon}"></i>
        ${statusSomaTexto}
      </span>
      <span class="fracionamento-total-valor">
        ${totalLinhas} / ${totalItem} ${unidade}
      </span>
    `;

    const btnSalvar = document.getElementById("btnSalvarFrac");
    if (btnSalvar) btnSalvar.disabled = !bate;
  }
  _fecharModalFracionar() {
    const modal = document.getElementById("modalFracionar");
    if (modal) modal.classList.remove("active");
    this._itemFracionando = null;
    this._pedidoFracionando = null;
    this._linhasFracionamentoTemp = [];
  }

  async _salvarFracionamento() {
    const item = this._itemFracionando;
    const pedido = this._pedidoFracionando;
    if (!item || !pedido) {
      this.sistema.ui.mostrarToast("erro", "Item ou pedido não identificado.");
      return;
    }

    const totalItem = Number(item.quantidade_solicitada) || 0;
    const linhas = this._linhasFracionamentoTemp;

    if (linhas.length === 0) {
      this.sistema.ui.mostrarToast("aviso", "Adicione pelo menos uma linha.");
      return;
    }

    for (const l of linhas) {
      if (!l.data_prevista_inicio || !l.data_prevista_fim) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Período incompleto",
          "Todas as linhas precisam de data de início e fim.",
        );
        return;
      }
      const di = new Date(l.data_prevista_inicio);
      const df = new Date(l.data_prevista_fim);
      if (di > df) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Período inválido",
          "A data de início não pode ser maior que a data de fim.",
        );
        return;
      }
      if (!l.quantidade || Number(l.quantidade) <= 0) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Quantidade inválida",
          "Todas as linhas precisam de quantidade maior que zero.",
        );
        return;
      }
    }

    const soma = linhas.reduce((s, l) => s + Number(l.quantidade), 0);
    if (Math.abs(soma - totalItem) > 0.0001) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Soma não confere",
        `Total das linhas (${soma}) difere do total do item (${totalItem}).`,
      );
      return;
    }

    const btn = document.getElementById("btnSalvarFrac");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
      const cronogramaExistente =
        this._cronogramasPorPedido[pedido.id]?.filter(
          (c) => String(c.item_pedido_id) === String(item.id),
        ) || [];

      if (cronogramaExistente.length > 0) {
        const idsAntigos = cronogramaExistente.map((c) => c.id);
        const { error: delErr } = await supabase
          .from("entregas_fracionadas")
          .delete()
          .in("id", idsAntigos);
        if (delErr) throw delErr;
      }

      const novosRegistros = linhas.map((l, idx) => ({
        pedido_id: pedido.id,
        item_pedido_id: item.id,
        numero_entrega: idx + 1,
        quantidade: Number(l.quantidade),
        data_prevista_inicio: l.data_prevista_inicio,
        data_prevista_fim: l.data_prevista_fim,
      }));

      const { error: insErr } = await supabase
        .from("entregas_fracionadas")
        .insert(novosRegistros);

      if (insErr) throw insErr;

      await this._recarregarCronogramasDosPedidosVisiveis();

      this._fecharModalFracionar();

      this.sistema.ui.mostrarToast(
        "sucesso",
        "Cronograma salvo",
        "O cronograma de entregas foi registrado com sucesso.",
      );

      await this.renderizarPedidos();
    } catch (err) {
      console.error("[Pedidos] Erro ao salvar fracionamento:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao salvar",
        err.message || "Não foi possível salvar o cronograma.",
      );

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Cronograma';
      }
    }
  }

  async _recarregarCronogramasDosPedidosVisiveis() {
    const ids = this.pedidosCache.map((p) => p.id);
    await this._carregarCronogramasDosPedidos(ids);
    await this._carregarCronogramasPedidoInteiro(ids);
  }

  _abrirModalExclusaoFracionamento(pedidoId, itemPedidoId) {
    const item = this.pedidosCache
      .find((p) => String(p.id) === String(pedidoId))
      ?.itens_pedido?.find((i) => String(i.id) === String(itemPedidoId));

    this._pedidoExclusaoFrac = pedidoId;
    this._itemExclusaoFrac = itemPedidoId;

    const nomeEl = document.getElementById("exclusaoFracItemNome");
    if (nomeEl) {
      if (item) {
        nomeEl.innerHTML = `<strong>Item ${item.item_numero || "—"}</strong> · ${item.descricao || "—"}`;
      } else {
        nomeEl.textContent = "";
      }
    }

    const modal = document.getElementById("modalConfirmarExclusaoFrac");
    if (modal) modal.classList.add("active");
  }

  _fecharModalExclusaoFrac() {
    const modal = document.getElementById("modalConfirmarExclusaoFrac");
    if (modal) modal.classList.remove("active");
    this._pedidoExclusaoFrac = null;
    this._itemExclusaoFrac = null;
  }

  async _confirmarExclusaoFracionamento() {
    const pedidoId = this._pedidoExclusaoFrac;
    const itemPedidoId = this._itemExclusaoFrac;
    if (!pedidoId || !itemPedidoId) return;

    const btn = document.getElementById("btnConfirmarExclusaoFrac");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
    }

    try {
      const { data: registrosExcluidos, error } = await supabase
        .from("entregas_fracionadas")
        .delete()
        .eq("pedido_id", pedidoId)
        .eq("item_pedido_id", itemPedidoId)
        .select("id");

      if (error) throw error;

      if (!registrosExcluidos || registrosExcluidos.length === 0) {
        throw new Error(
          "Nenhum registro foi excluído. Verifique se a política DELETE da tabela entregas_fracionadas permite excluir este cronograma.",
        );
      }

      await this._recarregarCronogramasDosPedidosVisiveis();
      await this.renderizarPedidos();

      this._fecharModalExclusaoFrac();

      this.sistema.ui.mostrarToast(
        "sucesso",
        "Cronograma excluído",
        "O cronograma de entregas foi removido.",
      );
    } catch (err) {
      console.error("[Pedidos] Erro ao excluir cronograma:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao excluir",
        err.message || "Não foi possível excluir o cronograma.",
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash"></i> Excluir Cronograma';
      }
    }
  }

  _formatarDataBR(dataISO) {
    if (!dataISO) return "—";
    try {
      const d = new Date(dataISO + "T00:00:00");
      if (isNaN(d.getTime())) return dataISO;
      return d.toLocaleDateString("pt-BR");
    } catch {
      return dataISO;
    }
  }

  _exportarCronogramaPDF(pedidoId, itemPedidoId) {
    const pedido = this.pedidosCache.find(
      (p) => String(p.id) === String(pedidoId),
    );
    if (!pedido) {
      this.sistema.ui.mostrarToast("erro", "Pedido não encontrado.");
      return;
    }

    const item = pedido.itens_pedido?.find(
      (i) => String(i.id) === String(itemPedidoId),
    );
    if (!item) {
      this.sistema.ui.mostrarToast("erro", "Item não encontrado.");
      return;
    }

    const cronograma =
      this._cronogramasPorPedido[pedidoId]?.filter(
        (c) => String(c.item_pedido_id) === String(itemPedidoId),
      ) || [];

    if (cronograma.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Sem cronograma",
        "Este item não possui cronograma de entregas para exportar.",
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
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margem = 15;
      const contentWidth = pageWidth - margem * 2;

      doc.setFillColor(26, 58, 107);
      doc.rect(0, 0, pageWidth, 22, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Prefeitura de Pitangueiras", margem, 10);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(
        "Sistema de Gestão de Atas · Cronograma de Entregas",
        margem,
        16,
      );

      let y = 32;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("CRONOGRAMA DE ENTREGAS", margem, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);

      const linhas = [
        ["Pedido:", pedido.numero_pedido || "N/I"],
        ["Ata:", pedido.ata?.numero_ata || "N/I"],
        ["Fornecedor:", pedido.fornecedor?.razao_social || "N/I"],
        ["Local de entrega:", pedido.local_entrega || "Não informado"],
        ["Item:", `${item.item_numero || "—"} · ${item.descricao || "—"}`],
        [
          "Quantidade total:",
          `${item.quantidade_solicitada || 0} ${item.unidade_medida || ""}`,
        ],
      ];

      linhas.forEach(([label, valor]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, margem, y);
        doc.setFont("helvetica", "normal");
        const linhas2 = doc.splitTextToSize(valor, contentWidth - 40);
        doc.text(linhas2, margem + 35, y);
        y += linhas2.length * 5 + 2;
      });

      y += 4;

      const tableData = cronograma.map((l, idx) => [
        String(l.numero_entrega || idx + 1),
        `${this._formatarDataBR(l.data_prevista_inicio)} a ${this._formatarDataBR(l.data_prevista_fim)}`,
        `${Number(l.quantidade) || 0} ${item.unidade_medida || ""}`,
      ]);

      const soma = cronograma.reduce(
        (s, l) => s + (Number(l.quantidade) || 0),
        0,
      );

      doc.autoTable({
        startY: y,
        head: [["Nº", "Período", "Quantidade"]],
        body: tableData,
        foot: [
          [
            {
              content: "TOTAL",
              colSpan: 2,
              styles: { halign: "right", fontStyle: "bold" },
            },
            {
              content: `${soma} ${item.unidade_medida || ""}`,
              styles: { fontStyle: "bold", halign: "right" },
            },
          ],
        ],
        theme: "grid",
        headStyles: {
          fillColor: [26, 58, 107],
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: "bold",
          halign: "center",
        },
        bodyStyles: {
          fontSize: 10,
          textColor: [30, 41, 59],
          cellPadding: 3,
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [26, 58, 107],
          fontSize: 10,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 20, halign: "center" },
          1: { cellWidth: contentWidth - 20 - 50, halign: "left" },
          2: { cellWidth: 50, halign: "right" },
        },
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

      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        margem,
        pageHeight - 12,
      );

      const numeroPedido = (pedido.numero_pedido || "pedido").replace(
        /[^\w-]/g,
        "_",
      );
      const itemNum = (item.item_numero || itemPedidoId)
        .toString()
        .replace(/[^\w-]/g, "_");
      const dataAtual = new Date().toISOString().split("T")[0];

      doc.save(`cronograma_${numeroPedido}_item${itemNum}_${dataAtual}.pdf`);

      this.sistema.ui.mostrarToast(
        "sucesso",
        "PDF gerado",
        "O cronograma foi exportado com sucesso.",
      );
    } catch (err) {
      console.error("[Pedidos] Erro ao gerar PDF do cronograma:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao gerar PDF",
        err.message || "Não foi possível gerar o arquivo.",
      );
    }
  }

  _exportarCronogramaCSV(pedidoId, itemPedidoId) {
    const pedido = this.pedidosCache.find(
      (p) => String(p.id) === String(pedidoId),
    );
    if (!pedido) {
      this.sistema.ui.mostrarToast("erro", "Pedido não encontrado.");
      return;
    }

    const item = pedido.itens_pedido?.find(
      (i) => String(i.id) === String(itemPedidoId),
    );
    if (!item) {
      this.sistema.ui.mostrarToast("erro", "Item não encontrado.");
      return;
    }

    const cronograma =
      this._cronogramasPorPedido[pedidoId]?.filter(
        (c) => String(c.item_pedido_id) === String(itemPedidoId),
      ) || [];

    if (cronograma.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Sem cronograma",
        "Este item não possui cronograma de entregas para exportar.",
      );
      return;
    }

    try {
      const unidade = item.unidade_medida || "";

      const cabecalho = [
        "Nº",
        "Período Início",
        "Período Fim",
        "Quantidade",
        "Unidade",
      ];

      const linhas = cronograma.map((l, idx) => [
        String(l.numero_entrega || idx + 1),
        this._formatarDataBR(l.data_prevista_inicio),
        this._formatarDataBR(l.data_prevista_fim),
        String(Number(l.quantidade) || 0).replace(".", ","),
        unidade,
      ]);

      const soma = cronograma.reduce(
        (s, l) => s + (Number(l.quantidade) || 0),
        0,
      );
      linhas.push(["", "", "TOTAL", String(soma).replace(".", ","), unidade]);

      const escapar = (v) => {
        const s = String(v ?? "");
        if (s.includes(";") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const csvContent = [
        cabecalho.map(escapar).join(";"),
        ...linhas.map((l) => l.map(escapar).join(";")),
      ].join("\n");

      const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8;",
      });

      const numeroPedido = (pedido.numero_pedido || "pedido").replace(
        /[^\w-]/g,
        "_",
      );
      const itemNum = (item.item_numero || itemPedidoId)
        .toString()
        .replace(/[^\w-]/g, "_");
      const dataAtual = new Date().toISOString().split("T")[0];

      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `cronograma_${numeroPedido}_item${itemNum}_${dataAtual}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.sistema.ui.mostrarToast(
        "sucesso",
        "CSV exportado",
        "O cronograma foi exportado com sucesso.",
      );
    } catch (err) {
      console.error("[Pedidos] Erro ao gerar CSV do cronograma:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao exportar",
        err.message || "Não foi possível gerar o arquivo.",
      );
    }
  }

  _configurarEventosFracionamentoInteiro() {
    if (this._eventosFracionamentoInteiroConfigurados) return;
    this._eventosFracionamentoInteiroConfigurados = true;
    const modalInteiro = document.getElementById("modalFracionarPedido");
    if (modalInteiro) {
      modalInteiro.addEventListener("click", (e) => {
        if (e.target === modalInteiro) {
          this._fecharModalFracionarPedido();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.getElementById("modalFracionarPedido");
        if (modal?.classList.contains("active")) {
          this._fecharModalFracionarPedido();
        }
      }
    });
  }

  async _carregarCronogramasPedidoInteiro(idsPedidos) {
    if (!idsPedidos || idsPedidos.length === 0) return;

    try {
      const { data, error } = await supabase
        .from("entregas_fracionadas")
        .select("*")
        .in("pedido_id", idsPedidos)
        .order("numero_semana", { ascending: true });

      if (error) {
        if (error.message && error.message.includes("numero_semana")) {
          console.warn(
            "[Pedidos] Coluna numero_semana não encontrada. Rode o SQL de migração. Fallback para numero_entrega.",
          );
          const fallback = await supabase
            .from("entregas_fracionadas")
            .select("*")
            .in("pedido_id", idsPedidos)
            .order("numero_entrega", { ascending: true });

          if (fallback.error) throw fallback.error;

          this._processarCronogramaInteiro(fallback.data || [], idsPedidos);
          return;
        }
        throw error;
      }

      this._processarCronogramaInteiro(data || [], idsPedidos);
    } catch (err) {
      console.warn(
        "[Pedidos] Erro ao carregar cronogramas do pedido inteiro:",
        err,
      );
      this._cronogramaPedidoInteiroCache = {};
    }
  }

  _processarCronogramaInteiro(data, idsPedidos) {
    const porPedido = {};

    (data || []).forEach((linha) => {
      if (!porPedido[linha.pedido_id]) {
        porPedido[linha.pedido_id] = {
          periodos: {},
          itens: {},
        };
      }

      const numSemana = linha.numero_semana || linha.numero_entrega || 1;

      if (!porPedido[linha.pedido_id].periodos[numSemana]) {
        porPedido[linha.pedido_id].periodos[numSemana] = {
          numero: numSemana,
          data_inicio: linha.data_prevista_inicio || "",
          data_fim: linha.data_prevista_fim || "",
        };
      }

      const itemKey = String(linha.item_pedido_id);
      if (!porPedido[linha.pedido_id].itens[itemKey]) {
        porPedido[linha.pedido_id].itens[itemKey] = [];
      }
      porPedido[linha.pedido_id].itens[itemKey].push({
        numero_semana: numSemana,
        quantidade: Number(linha.quantidade) || 0,
      });
    });

    idsPedidos.forEach((id) => {
      if (!porPedido[id]) return;
      porPedido[id].periodos = Object.values(porPedido[id].periodos).sort(
        (a, b) => a.numero - b.numero,
      );
    });

    this._cronogramaPedidoInteiroCache = porPedido;
  }

  _renderizarResumoCronogramaInteiro(pedidoId, cronograma, pedido) {
    if (
      !cronograma ||
      !cronograma.periodos ||
      cronograma.periodos.length === 0
    ) {
      return "";
    }

    const periodosOrdenados = [...cronograma.periodos].sort(
      (a, b) => a.numero - b.numero,
    );

    const cabecalhosSemana = periodosOrdenados
      .map(
        (sem) => `
          <th>
            <span>Semana ${sem.numero}</span>
            <small>${this._formatarDataBR(sem.data_inicio)} a ${this._formatarDataBR(sem.data_fim)}</small>
          </th>
        `,
      )
      .join("");

    const linhasItens = Object.keys(cronograma.itens || {})
      .map((itemKey) => {
        const item = pedido.itens_pedido?.find(
          (i) => String(i.id) === String(itemKey),
        );
        if (!item) return "";

        const unidade = item.unidade_medida || "UN";
        const linhasItem = cronograma.itens[itemKey] || [];
        const quantidadePorSemana = new Map(
          linhasItem.map((linha) => [
            Number(linha.numero_semana || linha.numero_entrega),
            Number(linha.quantidade) || 0,
          ]),
        );
        const totalProgramado = linhasItem.reduce(
          (soma, linha) => soma + (Number(linha.quantidade) || 0),
          0,
        );
        const totalSolicitado = Number(item.quantidade_solicitada) || 0;
        const celulas = periodosOrdenados
          .map((sem) => {
            const quantidade = quantidadePorSemana.get(sem.numero) || 0;
            return `<td>${quantidade > 0 ? `${quantidade} ${unidade}` : "—"}</td>`;
          })
          .join("");

        return `
          <tr>
            <td class="cronograma-item-resumo">
              <strong>#${item.item_numero || "—"}</strong>
              <span>${item.descricao || "Produto não informado"}</span>
              <small>${unidade}</small>
            </td>
            ${celulas}
            <td class="cronograma-total-resumo">
              <strong>${totalProgramado}/${totalSolicitado} ${unidade}</strong>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <details class="cronograma-inteiro-wrapper pedido-cronograma-colapsavel" onclick="event.stopPropagation()">
        <summary class="cronograma-inteiro-header">
          <div class="cronograma-inteiro-titulo">
            <i class="fas fa-calendar-check"></i>
            Cronograma de Entregas do Pedido
          </div>
          <div class="cronograma-inteiro-meta">
            ${periodosOrdenados.length} semana(s) · ${Object.keys(cronograma.itens || {}).length} item(ns) programado(s)
          </div>
          <i class="fas fa-chevron-down cronograma-toggle-icon" aria-hidden="true"></i>
        </summary>
        <div class="cronograma-matriz-scroll">
          <table class="tabela-cronograma-matriz">
            <thead>
              <tr>
                <th>Produto</th>
                ${cabecalhosSemana}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${linhasItens}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }

  async _abrirModalFracionarPedido(pedidoId) {
    const pedidoBase = this.pedidosCache.find(
      (p) => String(p.id) === String(pedidoId),
    );

    if (!pedidoBase) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Pedido não encontrado.",
        "Recarregue a lista e tente novamente.",
      );
      return;
    }

    if (pedidoBase.status_aprovacao !== "APROVADO") {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Pedido não aprovado",
        "Só é possível fracionar entregas de pedidos APROVADOS.",
      );
      return;
    }

    let pedido = pedidoBase;

    if (!pedido.itens_pedido || pedido.itens_pedido.length === 0) {
      const pedidoCompleto = await this.carregarPedidoCompleto(pedidoId);

      if (!pedidoCompleto) {
        this.sistema.ui.mostrarToast(
          "erro",
          "Erro ao carregar",
          "Não foi possível carregar os itens do pedido.",
        );
        return;
      }

      pedido = {
        ...pedidoBase,
        ...pedidoCompleto,
        itens_pedido: pedidoCompleto.itens_pedido || [],
        usuario: pedidoCompleto.usuario || pedidoBase.usuario,
        fornecedor: pedidoCompleto.fornecedor || pedidoBase.fornecedor,
        ata: pedidoCompleto.ata || pedidoBase.ata,
        orgao_solicitante:
          pedidoCompleto.orgao_solicitante || pedidoBase.orgao_solicitante,
      };

      const idx = this.pedidosCache.findIndex(
        (p) => String(p.id) === String(pedidoId),
      );
      if (idx >= 0) {
        this.pedidosCache[idx] = pedido;
      }
    }

    if (!pedido.itens_pedido || pedido.itens_pedido.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Pedido sem itens",
        "Este pedido realmente não possui itens cadastrados.",
      );
      return;
    }

    this._pedidoFracionandoInteiro = pedido;

    const cronogramaExistente = this._cronogramaPedidoInteiroCache[pedido.id];
    this._itensFracionamentoSelecionados = new Set(
      cronogramaExistente ? Object.keys(cronogramaExistente.itens || {}) : [],
    );

    if (cronogramaExistente) {
      this._periodosSemanasTemp = cronogramaExistente.periodos.map((p) => ({
        numero: p.numero,
        data_inicio: p.data_inicio,
        data_fim: p.data_fim,
      }));
      this.mesFracionamentoAtual =
        this._mesDaDataISO(this._periodosSemanasTemp[0]?.data_inicio) ||
        this._mesSeguinteISO();

      this._fracionamentoGradeTemp = {};

      pedido.itens_pedido
        .filter((item) =>
          this._itensFracionamentoSelecionados.has(String(item.id)),
        )
        .forEach((item) => {
          const itemKey = String(item.id);
          const linhasItem = cronogramaExistente.itens[itemKey] || [];

          const semanas = this._periodosSemanasTemp.map((sem) => {
            const linha = linhasItem.find(
              (l) => l.numero_semana === sem.numero,
            );
            return {
              numero: sem.numero,
              quantidade: linha ? linha.quantidade : "",
            };
          });

          this._fracionamentoGradeTemp[itemKey] = {
            item: item,
            semanas: semanas,
          };
        });
    } else {
      this.mesFracionamentoAtual = this._mesSeguinteISO();
      this._periodosSemanasTemp = this._obterSemanasDoMes(
        this.mesFracionamentoAtual,
      );

      this._fracionamentoGradeTemp = {};

      pedido.itens_pedido
        .filter((item) =>
          this._itensFracionamentoSelecionados.has(String(item.id)),
        )
        .forEach((item) => {
          this._fracionamentoGradeTemp[String(item.id)] = {
            item: item,
            semanas: this._periodosSemanasTemp.map((sem) => ({
              numero: sem.numero,
              quantidade: "",
            })),
          };
        });
    }

    this._renderizarModalFracionarPedido();

    const modal = document.getElementById("modalFracionarPedido");
    if (modal) modal.classList.add("active");
  }

  _renderizarModalFracionarPedido() {
    const container = document.getElementById("modalFracionarPedidoContent");
    if (!container) return;

    const pedido = this._pedidoFracionandoInteiro;
    if (!pedido) return;

    const periodosHtml = this._periodosSemanasTemp
      .map(
        (sem) => `
        <div class="periodo-semana-bloco" data-semana-numero="${sem.numero}">
          <div class="periodo-semana-titulo">
            <span class="periodo-semana-badge">Semana ${sem.numero}</span>
            <button type="button" class="periodo-semana-remover" data-semana-numero="${sem.numero}" title="Remover semana ${sem.numero}">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="periodo-semana-inputs">
            <input type="date" class="periodo-input-data" data-field="data_inicio" data-semana-numero="${sem.numero}" value="${sem.data_inicio || ""}" aria-label="Data início semana ${sem.numero}" />
            <span class="periodo-sep">até</span>
            <input type="date" class="periodo-input-data" data-field="data_fim" data-semana-numero="${sem.numero}" value="${sem.data_fim || ""}" aria-label="Data fim semana ${sem.numero}" />
          </div>
        </div>
      `,
      )
      .join("");

    // Mantém o estado da matriz consistente com os checkboxes marcados.
    // Isso recupera a linha quando um cronograma antigo ou um estado parcial
    // trouxe o item selecionado, mas não trouxe seu bloco temporário.
    (pedido.itens_pedido || []).forEach((item) => {
      const itemKey = String(item.id);
      if (
        this._itensFracionamentoSelecionados.has(itemKey) &&
        !this._fracionamentoGradeTemp[itemKey]
      ) {
        this._fracionamentoGradeTemp[itemKey] = {
          item,
          semanas: this._periodosSemanasTemp.map((sem) => ({
            numero: sem.numero,
            quantidade: "",
          })),
        };
      }
    });

    const itensKeys = Object.keys(this._fracionamentoGradeTemp).filter(
      (itemKey) => this._itensFracionamentoSelecionados.has(String(itemKey)),
    );
    const itensSelecaoHtml = (pedido.itens_pedido || [])
      .map((item) => {
        const itemKey = String(item.id);
        const selecionado = this._itensFracionamentoSelecionados.has(itemKey);
        const descricaoCompleta = String(
          item.descricao || "Produto não informado",
        ).trim();
        const descricaoCurta =
          descricaoCompleta.length > 120
            ? `${descricaoCompleta.slice(0, 120).trimEnd()}…`
            : descricaoCompleta;
        return `
          <label class="item-fracionamento-opcao" for="item-fracionamento-${itemKey}">
            <input type="checkbox" class="item-fracionamento-checkbox" id="item-fracionamento-${itemKey}" data-item-fracionamento-id="${itemKey}" ${selecionado ? "checked" : ""} />
            <span class="item-fracionamento-checkmark" aria-hidden="true"><i class="fas fa-check"></i></span>
            <span class="item-fracionamento-dados" title="${descricaoCompleta}"><strong>#${item.item_numero || "—"}</strong><span>${descricaoCurta}</span></span>
            <span class="item-fracionamento-quantidade">${item.quantidade_solicitada || 0} ${item.unidade_medida || "UN"}</span>
          </label>
        `;
      })
      .join("");

    const gridHeaderCols = this._periodosSemanasTemp
      .map(
        (sem) => `
          <th class="grid-col-semana">
            <span>Semana ${sem.numero}</span>
            <small>${this._formatarDataBR(sem.data_inicio)} a ${this._formatarDataBR(sem.data_fim)}</small>
          </th>
        `,
      )
      .join("");

    const gridBody = itensKeys
      .map((itemKey) => {
        const bloco = this._fracionamentoGradeTemp[itemKey];
        const item = bloco.item;
        const unidade = item.unidade_medida || "UN";
        const descricaoCompleta = String(
          item.descricao || "Descrição não informada",
        ).trim();
        const descricaoCurta =
          descricaoCompleta.length > 120
            ? `${descricaoCompleta.slice(0, 120).trimEnd()}…`
            : descricaoCompleta;
        const totalItem = Number(item.quantidade_solicitada) || 0;

        const totalProgramado = bloco.semanas.reduce(
          (s, sem) => s + (Number(sem.quantidade) || 0),
          0,
        );
        const dif = totalItem - totalProgramado;
        const bate = Math.abs(dif) < 0.0001;
        const algumPreenchido = totalProgramado > 0;
        const excedeu = totalProgramado > totalItem;

        let statusIcone = "fa-circle";
        let statusClasse = "grid-status-neutro";
        let statusTexto = `Total: 0 / ${totalItem} ${unidade}`;

        if (bate && algumPreenchido) {
          statusIcone = "fa-check-circle";
          statusClasse = "grid-status-ok";
          statusTexto = `Total conferido: ${totalProgramado} / ${totalItem} ${unidade}`;
        } else if (algumPreenchido) {
          statusIcone = excedeu ? "fa-times-circle" : "fa-exclamation-triangle";
          statusClasse = "grid-status-erro";
          statusTexto = excedeu
            ? `Excedeu: ${totalProgramado} / ${totalItem} ${unidade}`
            : `Falta: ${dif} ${unidade} (${totalProgramado} / ${totalItem})`;
        }

        const celulasSemana = this._periodosSemanasTemp
          .map((sem) => {
            const semana = bloco.semanas.find((s) => s.numero === sem.numero);
            const valor =
              semana?.quantidade === 0 ? "" : semana?.quantidade || "";
            return `
              <td class="grid-cell-semana">
                <input
                  type="number"
                  class="grid-input-qtd"
                  data-item-pedido-id="${item.id}"
                  data-semana-numero="${sem.numero}"
                  value="${valor}"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  aria-label="Qtd item ${item.item_numero} semana ${sem.numero}"
                />
              </td>
            `;
          })
          .join("");

        return `
          <tr class="grid-linha-item" data-item-pedido-id="${item.id}">
            <td class="grid-col-item">
              <div class="grid-item-numero">#${item.item_numero || "—"}</div>
              <div class="grid-item-descricao" title="${descricaoCompleta}">${descricaoCurta}</div>
              <div class="grid-item-unidade">Unidade: ${unidade}</div>
            </td>
            ${celulasSemana}
            <td class="grid-col-total ${statusClasse}" title="${statusTexto}">
              <strong class="grid-total-valor">${totalProgramado}/${totalItem} ${unidade}</strong>
            </td>
          </tr>
        `;
      })
      .join("");

    container.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-titulo">
          <i class="fas fa-calendar-alt"></i> Fracionar Entregas do Pedido
        </h2>
        <button type="button" class="modal-close" id="btnFecharModalFracionarPedido" title="Fechar">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="modal-body-fracionar-pedido">
        <div class="fracionar-pedido-info">
          <div class="fracionar-pedido-info-titulo">
            <i class="fas fa-file-invoice"></i>
            <span>
              <strong>Pedido ${pedido.numero_pedido || "N/I"}</strong>
              ${pedido.ata?.numero_ata ? ` · Ata ${pedido.ata.numero_ata}` : ""}
            </span>
          </div>
          <div class="fracionar-pedido-info-meta">
            <span><i class="fas fa-building"></i> ${pedido.fornecedor?.razao_social || "N/I"}</span>
            <span><i class="fas fa-map-marker-alt"></i> ${pedido.local_entrega || "Local não informado"}</span>
            <span><i class="fas fa-boxes"></i> ${itensKeys.length} item(ns)</span>
          </div>
        </div>

        <section class="itens-selecao-fracionamento" aria-labelledby="tituloItensFracionamento">
          <div class="itens-selecao-fracionamento-header">
            <div>
              <h3 id="tituloItensFracionamento"><i class="fas fa-check-square"></i> Itens que serão fracionados</h3>
              <p>Selecione somente os produtos que terão entregas distribuídas por semana.</p>
            </div>
            <span class="itens-selecao-contador">${this._itensFracionamentoSelecionados.size} selecionado(s)</span>
          </div>
          <div class="itens-selecao-fracionamento-lista">
            ${itensSelecaoHtml}
          </div>
        </section>

        <div class="periodos-semanas-bloco">
          <div style="padding:14px 16px;background:var(--primary-50);border:1px solid var(--neutral-200);border-radius:var(--border-radius-lg);margin-bottom:16px;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:8px;">
              <i class="fas fa-calendar-week"></i>
              <span>Mês de entrega:</span>
              <input
                type="month"
                id="mesEntregaFracionamentoPedido"
                class="filtro-input"
                value="${this.mesFracionamentoAtual}"
                aria-label="Mês de entrega do fracionamento do pedido"
              />
            </label>
            <small style="display:block;color:var(--neutral-500);line-height:1.4;">
              As semanas respeitam o calendário do mês, fins de semana e feriados. O feriado reduz a quantidade de dias úteis da semana sem empurrá-la para a semana seguinte.
            </small>
          </div>
          <div class="periodos-semanas-header" style="margin-top:4px;">
            <div class="periodos-semanas-titulo">
              <i class="fas fa-calendar-week"></i> Períodos das Semanas
            </div>
            <div class="periodos-semanas-acoes">
              <button type="button" class="btn-gerar-datas-auto" id="btnGerarDatasAuto" title="Preenche as datas automaticamente a partir da Semana 1 (7 dias cada)">
                <i class="fas fa-magic"></i> Gerar automaticamente
              </button>
              <button type="button" class="btn-adicionar-semana" id="btnAdicionarSemanaFrac">
                <i class="fas fa-plus"></i> Adicionar semana
              </button>
            </div>
          </div>
          <div class="periodos-semanas-grid">
            ${periodosHtml}
          </div>
        </div>

        <div class="fracionar-pedido-grade-wrapper">
          <div class="fracionar-pedido-grade-titulo">
            <i class="fas fa-th"></i> Distribuição por Semana
          </div>
          <div class="fracionar-pedido-grade-scroll">
            <table class="fracionar-pedido-tabela">
              <thead>
                <tr>
                  <th class="grid-col-item">Produto</th>
                  ${gridHeaderCols}
                  <th class="grid-col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                ${gridBody}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="modal-footer-fracionar-pedido">
        <button type="button" class="btn-cancelar-fracionar-pedido" id="btnCancelarFracionarPedido">
          <i class="fas fa-times"></i> Cancelar
        </button>
        ${
          this._cronogramaPedidoInteiroCache[pedido.id]
            ? `<button type="button" class="btn-exportar-cronograma-pedido-pdf" id="btnExportarCronogramaPedidoPDF">
                 <i class="fas fa-file-pdf"></i> Exportar PDF
               </button>`
            : ""
        }
        <button type="button" class="btn-salvar-fracionar-pedido" id="btnSalvarFracionarPedido" disabled>
          <i class="fas fa-save"></i> Salvar Cronograma
        </button>
      </div>
    `;

    this._conectarEventosModalFracionarPedido();
    this._validarBotaoSalvarCronograma();
  }
  _conectarEventosModalFracionarPedido() {
    const container = document.getElementById("modalFracionarPedidoContent");
    if (!container) return;

    document
      .getElementById("btnFecharModalFracionarPedido")
      ?.addEventListener("click", () => this._fecharModalFracionarPedido());

    document
      .getElementById("btnCancelarFracionarPedido")
      ?.addEventListener("click", () => this._fecharModalFracionarPedido());

    document
      .getElementById("btnSalvarFracionarPedido")
      ?.addEventListener("click", () => this._salvarFracionamentoPedido());

    document
      .getElementById("btnExportarCronogramaPedidoPDF")
      ?.addEventListener("click", () => {
        const pedidoId = this._pedidoFracionandoInteiro?.id;
        if (pedidoId) {
          this._exportarCronogramaPedidoPDF(pedidoId);
        }
      });

    document
      .getElementById("btnAdicionarSemanaFrac")
      ?.addEventListener("click", () => this._adicionarSemanaFracionamento());

    document
      .getElementById("btnGerarDatasAuto")
      ?.addEventListener("click", () => this._gerarDatasAutomaticas());

    document
      .getElementById("mesEntregaFracionamentoPedido")
      ?.addEventListener("change", (e) => {
        this._alterarMesFracionamento(e.target.value, "pedido");
      });

    container
      .querySelectorAll(".item-fracionamento-checkbox")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", (e) => {
          this._alternarItemFracionamento(
            e.target.dataset.itemFracionamentoId,
            e.target.checked,
          );
        });
      });

    container.querySelectorAll(".periodo-input-data").forEach((input) => {
      input.addEventListener("input", (e) => {
        const semanaNum = parseInt(e.target.dataset.semanaNumero);
        const field = e.target.dataset.field;

        const periodo = this._periodosSemanasTemp.find(
          (s) => s.numero === semanaNum,
        );
        if (periodo) {
          periodo[field] = e.target.value;
        }
      });
    });

    container.querySelectorAll(".periodo-semana-remover").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const semanaNum = parseInt(btn.dataset.semanaNumero);
        this._removerSemanaFracionamento(semanaNum);
      });
    });

    container.querySelectorAll(".grid-input-qtd").forEach((input) => {
      input.addEventListener("input", (e) => {
        const itemPedidoId = e.target.dataset.itemPedidoId;
        const semanaNum = parseInt(e.target.dataset.semanaNumero);
        const valor = e.target.value;

        const bloco = this._fracionamentoGradeTemp[itemPedidoId];
        if (bloco) {
          const semana = bloco.semanas.find((s) => s.numero === semanaNum);
          if (semana) {
            semana.quantidade = valor === "" ? "" : Number(valor);
          }
        }

        this._atualizarStatusLinha(itemPedidoId);
      });
    });
  }

  _alternarItemFracionamento(itemPedidoId, selecionado) {
    const itemKey = String(itemPedidoId);
    const item = this._pedidoFracionandoInteiro?.itens_pedido?.find(
      (itemPedido) => String(itemPedido.id) === itemKey,
    );
    if (!item) return;

    if (selecionado) {
      this._itensFracionamentoSelecionados.add(itemKey);
      if (!this._fracionamentoGradeTemp[itemKey]) {
        this._fracionamentoGradeTemp[itemKey] = {
          item,
          semanas: this._periodosSemanasTemp.map((sem) => ({
            numero: sem.numero,
            quantidade: "",
          })),
        };
      }
    } else {
      this._itensFracionamentoSelecionados.delete(itemKey);
      delete this._fracionamentoGradeTemp[itemKey];
    }

    this._renderizarModalFracionarPedido();
  }

  _atualizarStatusLinha(itemPedidoId) {
    const bloco = this._fracionamentoGradeTemp[itemPedidoId];
    if (!bloco) return;

    const item = bloco.item;
    const unidade = item.unidade_medida || "UN";
    const totalItem = Number(item.quantidade_solicitada) || 0;

    const totalProgramado = bloco.semanas.reduce(
      (s, sem) => s + (Number(sem.quantidade) || 0),
      0,
    );

    const dif = totalItem - totalProgramado;
    const bate = Math.abs(dif) < 0.0001;
    const algumPreenchido = totalProgramado > 0;
    const excedeu = totalProgramado > totalItem;

    let statusIcone = "fa-circle";
    let statusClasse = "grid-status-neutro";
    let statusTexto = "Não iniciado";

    if (bate) {
      statusIcone = "fa-check-circle";
      statusClasse = "grid-status-ok";
      statusTexto = `${totalProgramado} / ${totalItem} ${unidade}`;
    } else if (algumPreenchido) {
      statusIcone = excedeu ? "fa-times-circle" : "fa-exclamation-triangle";
      statusClasse = "grid-status-erro";
      statusTexto = excedeu
        ? `${totalProgramado} / ${totalItem} ${unidade} (excedeu)`
        : `${totalProgramado} / ${totalItem} ${unidade}`;
    }

    const linha = document.querySelector(
      `.grid-linha-item[data-item-pedido-id="${itemPedidoId}"]`,
    );

    if (linha) {
      const totalEl = linha.querySelector(".grid-col-total");
      if (totalEl) {
        totalEl.className = `grid-col-total ${statusClasse}`;
        totalEl.title = statusTexto;
        const valorEl = totalEl.querySelector(".grid-total-valor");
        if (valorEl) {
          valorEl.textContent = `${totalProgramado}/${totalItem} ${unidade}`;
        }
      }
    }

    this._validarBotaoSalvarCronograma();
  }

  _validarBotaoSalvarCronograma() {
    const itensKeys = Object.keys(this._fracionamentoGradeTemp).filter(
      (itemKey) => this._itensFracionamentoSelecionados.has(String(itemKey)),
    );
    const btnSalvar = document.getElementById("btnSalvarFracionarPedido");

    if (!btnSalvar) return;

    if (itensKeys.length === 0) {
      btnSalvar.disabled = true;
      return;
    }

    let algumPreenchido = false;
    let algumComErro = false;

    itensKeys.forEach((itemKey) => {
      const bloco = this._fracionamentoGradeTemp[itemKey];
      if (!bloco) return;

      const totalItem = Number(bloco.item.quantidade_solicitada) || 0;
      const totalProgramado = bloco.semanas.reduce(
        (s, sem) => s + (Number(sem.quantidade) || 0),
        0,
      );

      if (totalProgramado > 0) {
        algumPreenchido = true;

        if (Math.abs(totalProgramado - totalItem) > 0.0001) {
          algumComErro = true;
        }
      }
    });

    btnSalvar.disabled = !algumPreenchido || algumComErro;
  }

  _adicionarSemanaFracionamento() {
    const proximoNumero =
      this._periodosSemanasTemp.length > 0
        ? Math.max(...this._periodosSemanasTemp.map((s) => s.numero)) + 1
        : 1;

    this._periodosSemanasTemp.push({
      numero: proximoNumero,
      data_inicio: "",
      data_fim: "",
    });

    Object.keys(this._fracionamentoGradeTemp).forEach((itemKey) => {
      const bloco = this._fracionamentoGradeTemp[itemKey];
      if (!bloco.semanas.find((s) => s.numero === proximoNumero)) {
        bloco.semanas.push({
          numero: proximoNumero,
          quantidade: "",
        });
      }
    });

    this._renderizarModalFracionarPedido();
  }

  _removerSemanaFracionamento(semanaNumero) {
    if (this._periodosSemanasTemp.length <= 1) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Não é possível remover",
        "O cronograma precisa ter pelo menos uma semana.",
      );
      return;
    }

    this._periodosSemanasTemp = this._periodosSemanasTemp.filter(
      (s) => s.numero !== semanaNumero,
    );

    Object.keys(this._fracionamentoGradeTemp).forEach((itemKey) => {
      const bloco = this._fracionamentoGradeTemp[itemKey];
      bloco.semanas = bloco.semanas.filter((s) => s.numero !== semanaNumero);
    });

    this._renderizarModalFracionarPedido();
  }

  _gerarDatasAutomaticas() {
    if (this._periodosSemanasTemp.length === 0) return;

    const mes =
      document.getElementById("mesEntregaFracionamentoPedido")?.value ||
      this.mesFracionamentoAtual ||
      this._mesSeguinteISO();

    this._alterarMesFracionamento(mes, "pedido");

    this.sistema.ui.mostrarToast(
      "sucesso",
      "Datas geradas",
      `As ${this._periodosSemanasTemp.length} semanas foram calculadas para ${this._formatarMesAno(mes)}.`,
    );
  }

  _mesSeguinteISO() {
    const hoje = new Date();
    const proximo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    return `${proximo.getFullYear()}-${String(proximo.getMonth() + 1).padStart(2, "0")}`;
  }

  _mesDaDataISO(dataISO) {
    if (!dataISO || !/^\d{4}-\d{2}-\d{2}/.test(String(dataISO))) {
      return "";
    }
    return String(dataISO).slice(0, 7);
  }

  _formatarMesAno(mesISO) {
    if (!/^\d{4}-\d{2}$/.test(String(mesISO))) {
      return mesISO || "mês selecionado";
    }
    const [ano, mes] = String(mesISO).split("-");
    return `${mes}/${ano}`;
  }

  _feriadosDoAno(ano) {
    // Feriados nacionais brasileiros e datas móveis normalmente observadas
    // pelo serviço público. A lista fica centralizada para facilitar futuras
    // inclusões de feriados estaduais/municipais sem alterar o algoritmo.
    const fixos = [
      `${ano}-01-01`,
      `${ano}-04-21`,
      `${ano}-05-01`,
      `${ano}-09-07`,
      `${ano}-10-12`,
      `${ano}-11-02`,
      `${ano}-11-15`,
      `${ano}-11-20`,
      `${ano}-12-25`,
    ];

    // Sexta-feira Santa e Corpus Christi são calculados a partir da Páscoa.
    const pascoa = this._calcularPascoa(ano);
    const sextaSanta = new Date(pascoa);
    sextaSanta.setDate(sextaSanta.getDate() - 2);
    const corpusChristi = new Date(pascoa);
    corpusChristi.setDate(corpusChristi.getDate() + 60);

    return new Set([
      ...fixos,
      this._toISODate(sextaSanta),
      this._toISODate(corpusChristi),
    ]);
  }

  _calcularPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }

  _obterSemanasDoMes(mesISO) {
    if (!/^\d{4}-\d{2}$/.test(String(mesISO))) return [];

    const [ano, mes] = String(mesISO).split("-").map(Number);
    const primeiroDia = new Date(ano, mes - 1, 1);
    const ultimoDia = new Date(ano, mes, 0);
    const feriados = this._feriadosDoAno(ano);
    const semanas = [];

    // A primeira semana começa na primeira segunda-feira do mês. Assim,
    // dias úteis de uma semana parcial anterior não são misturados ao mês.
    const primeiraSegunda = new Date(primeiroDia);
    const diasAteSegunda = (8 - primeiraSegunda.getDay()) % 7;
    primeiraSegunda.setDate(primeiraSegunda.getDate() + diasAteSegunda);

    for (
      const segunda = new Date(primeiraSegunda);
      segunda <= ultimoDia;
      segunda.setDate(segunda.getDate() + 7)
    ) {
      const sexta = new Date(segunda);
      sexta.setDate(sexta.getDate() + 4);

      const inicioSemana = new Date(segunda);
      const fimSemana = sexta < ultimoDia ? sexta : new Date(ultimoDia);

      while (
        inicioSemana <= fimSemana &&
        this._ehFimDeSemanaOuFeriado(inicioSemana, feriados)
      ) {
        inicioSemana.setDate(inicioSemana.getDate() + 1);
      }

      const fimUtil = new Date(fimSemana);
      while (
        fimUtil >= inicioSemana &&
        this._ehFimDeSemanaOuFeriado(fimUtil, feriados)
      ) {
        fimUtil.setDate(fimUtil.getDate() - 1);
      }

      if (inicioSemana <= fimUtil && inicioSemana.getMonth() === mes - 1) {
        semanas.push({
          numero: semanas.length + 1,
          data_inicio: this._toISODate(inicioSemana),
          data_fim: this._toISODate(fimUtil),
        });
      }
    }

    return semanas;
  }

  _ehFimDeSemanaOuFeriado(data, feriados) {
    const diaSemana = data.getDay();
    return (
      diaSemana === 0 || diaSemana === 6 || feriados.has(this._toISODate(data))
    );
  }

  _alterarMesFracionamento(mesISO, modo) {
    const semanas = this._obterSemanasDoMes(mesISO);
    if (semanas.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Mês inválido",
        "Selecione um mês válido para calcular as semanas de entrega.",
      );
      return;
    }

    this.mesFracionamentoAtual = mesISO;

    if (modo === "individual") {
      const quantidades = new Map(
        this._linhasFracionamentoTemp.map((linha) => [
          linha.numero_entrega,
          linha.quantidade,
        ]),
      );
      this._linhasFracionamentoTemp = semanas.map((semana) => ({
        _id: ++this._itemContadorTemp,
        numero_entrega: semana.numero,
        data_prevista_inicio: semana.data_inicio,
        data_prevista_fim: semana.data_fim,
        quantidade: quantidades.get(semana.numero) ?? "",
      }));
      this._renderizarModalFracionar();
      return;
    }

    const quantidadesPorItem = {};
    Object.entries(this._fracionamentoGradeTemp).forEach(([itemKey, bloco]) => {
      quantidadesPorItem[itemKey] = new Map(
        (bloco.semanas || []).map((semana) => [
          semana.numero,
          semana.quantidade,
        ]),
      );
    });

    this._periodosSemanasTemp = semanas;
    Object.entries(this._fracionamentoGradeTemp).forEach(([itemKey, bloco]) => {
      const quantidades = quantidadesPorItem[itemKey] || new Map();
      bloco.semanas = semanas.map((semana) => ({
        numero: semana.numero,
        quantidade: quantidades.get(semana.numero) ?? "",
      }));
    });

    this._renderizarModalFracionarPedido();
  }

  _toISODate(d) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  async _salvarFracionamentoPedido() {
    const pedido = this._pedidoFracionandoInteiro;
    if (!pedido) {
      this.sistema.ui.mostrarToast("erro", "Pedido não identificado.");
      return;
    }

    if (this._periodosSemanasTemp.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Sem semanas",
        "Adicione pelo menos uma semana antes de salvar.",
      );
      return;
    }

    for (const sem of this._periodosSemanasTemp) {
      if (!sem.data_inicio || !sem.data_fim) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Período incompleto",
          `Preencha as datas da Semana ${sem.numero}.`,
        );
        return;
      }
      const di = new Date(sem.data_inicio + "T00:00:00");
      const df = new Date(sem.data_fim + "T00:00:00");
      if (di > df) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Período inválido",
          `A data de início da Semana ${sem.numero} é maior que a data fim.`,
        );
        return;
      }
    }

    const itensKeys = Object.keys(this._fracionamentoGradeTemp).filter(
      (itemKey) => this._itensFracionamentoSelecionados.has(String(itemKey)),
    );
    const itensComErro = [];

    itensKeys.forEach((itemKey) => {
      const bloco = this._fracionamentoGradeTemp[itemKey];
      const totalItem = Number(bloco.item.quantidade_solicitada) || 0;
      const totalProgramado = bloco.semanas.reduce(
        (s, sem) => s + (Number(sem.quantidade) || 0),
        0,
      );

      if (totalProgramado === 0) {
        return;
      }

      if (Math.abs(totalProgramado - totalItem) > 0.0001) {
        itensComErro.push({
          item: bloco.item,
          programado: totalProgramado,
          esperado: totalItem,
        });
      }
    });

    if (itensComErro.length > 0) {
      const nomes = itensComErro
        .map(
          (e) =>
            `#${e.item.item_numero} (${e.programado}/${e.esperado} ${e.item.unidade_medida || "UN"})`,
        )
        .join(", ");
      this.sistema.ui.mostrarToast(
        "erro",
        "Soma não confere",
        `Os seguintes itens estão com soma incorreta: ${nomes}`,
      );
      return;
    }

    const itensPreenchidos = itensKeys.filter((itemKey) => {
      const bloco = this._fracionamentoGradeTemp[itemKey];
      return (
        bloco.semanas.reduce((s, sem) => s + (Number(sem.quantidade) || 0), 0) >
        0
      );
    });

    if (itensPreenchidos.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Nada para salvar",
        "Preencha as quantidades de pelo menos um item antes de salvar.",
      );
      return;
    }

    const confirmado = await this.sistema.confirmar(
      `Salvar o cronograma de entregas com ${itensPreenchidos.length} item(ns) programado(s)?`,
    );
    if (!confirmado) return;

    const btn = document.getElementById("btnSalvarFracionarPedido");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
      const { error: delErr } = await supabase
        .from("entregas_fracionadas")
        .delete()
        .eq("pedido_id", pedido.id);

      if (delErr) throw delErr;

      const registros = [];

      itensPreenchidos.forEach((itemKey) => {
        const bloco = this._fracionamentoGradeTemp[itemKey];
        const itemPedidoId = bloco.item.id;

        bloco.semanas.forEach((sem) => {
          const qtd = Number(sem.quantidade) || 0;
          if (qtd <= 0) return;

          const periodo = this._periodosSemanasTemp.find(
            (p) => p.numero === sem.numero,
          );
          if (!periodo) return;

          registros.push({
            pedido_id: pedido.id,
            item_pedido_id: itemPedidoId,
            numero_entrega: sem.numero,
            numero_semana: sem.numero,
            quantidade: qtd,
            data_prevista_inicio: periodo.data_inicio,
            data_prevista_fim: periodo.data_fim,
          });
        });
      });

      if (registros.length === 0) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Nenhum registro",
          "Nada para salvar após validação.",
        );
        return;
      }

      const { error: insErr } = await supabase
        .from("entregas_fracionadas")
        .insert(registros);

      if (insErr) {
        if (insErr.message && insErr.message.includes("numero_semana")) {
          console.warn(
            "[Pedidos] Coluna numero_semana não existe. Tentando sem ela...",
          );
          const registrosFallback = registros.map((r) => {
            const novo = { ...r };
            delete novo.numero_semana;
            return novo;
          });
          const { error: fallbackErr } = await supabase
            .from("entregas_fracionadas")
            .insert(registrosFallback);
          if (fallbackErr) throw fallbackErr;
        } else {
          throw insErr;
        }
      }

      await this._recarregarCronogramasDosPedidosVisiveis();

      this._fecharModalFracionarPedido();

      this.sistema.ui.mostrarToast(
        "sucesso",
        "Cronograma salvo",
        `${registros.length} registro(s) salvo(s) com sucesso.`,
      );

      await this.renderizarPedidos();

      const pedidoAtualizado = this.pedidosCache.find(
        (p) => p.id === pedido.id,
      );
      if (pedidoAtualizado) {
        this.sistema.ui.mostrarToast(
          "info",
          "Dica",
          "Clique em 'PDF do Cronograma' para enviar ao fornecedor.",
          5000,
        );
      }
    } catch (err) {
      console.error("[Pedidos] Erro ao salvar cronograma do pedido:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao salvar",
        err.message || "Não foi possível salvar o cronograma.",
      );

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Cronograma';
      }
    }
  }

  _fecharModalFracionarPedido() {
    const modal = document.getElementById("modalFracionarPedido");
    if (modal) modal.classList.remove("active");
    this._pedidoFracionandoInteiro = null;
    this._fracionamentoGradeTemp = {};
    this._periodosSemanasTemp = [];
    this._itensFracionamentoSelecionados = new Set();
  }

  _exportarCronogramaPedidoPDF(pedidoId) {
    const pedido = this.pedidosCache.find(
      (p) => String(p.id) === String(pedidoId),
    );
    if (!pedido) {
      this.sistema.ui.mostrarToast("erro", "Pedido não encontrado.");
      return;
    }

    const cronograma = this._cronogramaPedidoInteiroCache[pedidoId];
    if (
      !cronograma ||
      !cronograma.periodos ||
      cronograma.periodos.length === 0
    ) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Sem cronograma",
        "Este pedido ainda não possui cronograma salvo.",
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
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margem = 15;
      const contentWidth = pageWidth - margem * 2;

      doc.setFillColor(26, 58, 107);
      doc.rect(0, 0, pageWidth, 26, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("Prefeitura de Pitangueiras", margem, 11);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(
        "Sistema de Gestão de Atas · Cronograma de Entregas",
        margem,
        17,
      );

      doc.setFontSize(8);
      doc.text(
        `Documento gerado em ${new Date().toLocaleString("pt-BR")}`,
        pageWidth - margem,
        11,
        { align: "right" },
      );

      let y = 36;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("CRONOGRAMA DE ENTREGAS POR SEMANA", margem, y);
      y += 8;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margem, y, pageWidth - margem, y);
      y += 5;

      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);

      const infoBlocos = [
        [
          ["Pedido:", pedido.numero_pedido || "N/I"],
          ["Ata:", pedido.ata?.numero_ata || "N/I"],
          ["Processo:", pedido.ata?.processo_administrativo || "N/I"],
        ],
        [
          [
            "Fornecedor:",
            (pedido.fornecedor?.razao_social || "N/I").slice(0, 40),
          ],
          ["CPF/CNPJ:", this.formatarCnpj(pedido.fornecedor?.cnpj || "N/I")],
          [
            "Data solicitação:",
            this.sistema.ui.formatarData(pedido.data_solicitacao),
          ],
        ],
      ];

      infoBlocos.forEach((bloco) => {
        bloco.forEach(([label, valor]) => {
          doc.setFont("helvetica", "bold");
          doc.text(label, margem, y);
          doc.setFont("helvetica", "normal");
          const linhas = doc.splitTextToSize(String(valor), contentWidth - 40);
          doc.text(linhas, margem + 35, y);
          y += linhas.length * 5;
        });
        y += 2;
      });

      y += 2;

      doc.setFillColor(240, 249, 255);
      doc.setDrawColor(191, 219, 254);
      doc.roundedRect(margem, y, contentWidth, 12, 2, 2, "FD");

      doc.setFontSize(10);
      doc.setTextColor(26, 58, 107);
      doc.setFont("helvetica", "bold");
      doc.text("LOCAL DE ENTREGA:", margem + 4, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const localTexto = pedido.local_entrega || "Não informado";
      const localLinhas = doc.splitTextToSize(localTexto, contentWidth - 50);
      doc.text(localLinhas[0], margem + 40, y + 5);

      y += 18;

      const periodosOrdenados = [...cronograma.periodos].sort(
        (a, b) => a.numero - b.numero,
      );
      const semanasPDF = periodosOrdenados.map((sem) => ({
        numero: sem.numero,
        cabecalho: `Semana ${sem.numero}\n${this._formatarDataBR(sem.data_inicio)} a\n${this._formatarDataBR(sem.data_fim)}`,
      }));

      const tabelaCabecalho = [
        "Produto",
        ...semanasPDF.map((sem) => sem.cabecalho),
        "Total",
      ];
      const tabelaCorpo = [];

      Object.keys(cronograma.itens).forEach((itemKey) => {
        const item = pedido.itens_pedido?.find((i) => String(i.id) === itemKey);
        if (!item) return;

        const linhasItem = cronograma.itens[itemKey] || [];
        const quantidadePorSemana = new Map(
          linhasItem.map((linha) => [
            Number(linha.numero_semana || linha.numero_entrega),
            Number(linha.quantidade) || 0,
          ]),
        );

        const totalProgramado = linhasItem.reduce(
          (soma, linha) => soma + (Number(linha.quantidade) || 0),
          0,
        );
        const produto = [
          item.item_numero ? `#${item.item_numero}` : "",
          item.descricao || "Produto não informado",
        ]
          .filter(Boolean)
          .join(" · ");

        tabelaCorpo.push([
          produto,
          ...semanasPDF.map((sem) => {
            const quantidade = quantidadePorSemana.get(sem.numero) || 0;
            return quantidade > 0
              ? `${quantidade} ${item.unidade_medida || "UN"}`
              : "—";
          }),
          `${totalProgramado} ${item.unidade_medida || "UN"}`,
        ]);
      });

      if (tabelaCorpo.length > 0) {
        const larguraProduto = Math.min(72, contentWidth * 0.4);
        const larguraTotal = 24;
        const larguraSemana = Math.max(
          16,
          (contentWidth - larguraProduto - larguraTotal) / semanasPDF.length,
        );

        doc.autoTable({
          startY: y,
          head: [tabelaCabecalho],
          body: tabelaCorpo,
          theme: "grid",
          styles: {
            fontSize: semanasPDF.length > 4 ? 7 : 8,
            cellPadding: 2.5,
            overflow: "linebreak",
            valign: "middle",
          },
          headStyles: {
            fillColor: [26, 58, 107],
            textColor: [255, 255, 255],
            fontSize: semanasPDF.length > 4 ? 7 : 8,
            fontStyle: "bold",
            halign: "center",
            valign: "middle",
          },
          bodyStyles: {
            textColor: [30, 41, 59],
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            ...Object.fromEntries(
              semanasPDF.map((_, index) => [
                index + 1,
                {
                  cellWidth: larguraSemana,
                  halign: "center",
                  fontStyle: "bold",
                },
              ]),
            ),
            0: { cellWidth: larguraProduto, halign: "left", fontStyle: "bold" },
            [semanasPDF.length + 1]: {
              cellWidth: larguraTotal,
              halign: "center",
              fontStyle: "bold",
            },
          },
          margin: { left: margem, right: margem },
        });
        y = doc.lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text("Nenhum item programado.", margem, y);
        y += 10;
      }

      if (y > pageHeight - 80) {
        doc.addPage();
        y = 20;
      }

      y += 10;

      if (y > pageHeight - 50) {
        doc.addPage();
        y = 30;
      }

      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "normal");

      doc.text(
        "Assinatura do Fornecedor: _____________________________________",
        margem,
        y,
      );
      doc.text("Data: ____ / ____ / ________", pageWidth - margem - 60, y);

      y += 12;

      doc.text(
        "Assinatura do Recebedor: ______________________________________",
        margem,
        y,
      );
      doc.text("Data: ____ / ____ / ________", pageWidth - margem - 60, y);

      const totalPaginas = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPaginas; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Página ${i} de ${totalPaginas}`,
          pageWidth - margem,
          pageHeight - 6,
          { align: "right" },
        );
        doc.text(
          "Sistema desenvolvido pelo Departamento de Informática - Versão 1.0",
          margem,
          pageHeight - 6,
        );
      }

      const numeroPedido = (pedido.numero_pedido || "pedido").replace(
        /[^\w-]/g,
        "_",
      );
      const dataAtual = new Date().toISOString().split("T")[0];

      doc.save(`cronograma_${numeroPedido}_${dataAtual}.pdf`);

      this.sistema.ui.mostrarToast(
        "sucesso",
        "PDF gerado",
        "O cronograma foi exportado. Envie ao fornecedor.",
      );
    } catch (err) {
      console.error("[Pedidos] Erro ao gerar PDF do cronograma:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao gerar PDF",
        err.message || "Não foi possível gerar o arquivo.",
      );
    }
  }

  async visualizarPedidoCompleto(pedidoId) {
    try {
      const pedidoCompleto = await this.carregarPedidoCompleto(pedidoId);
      if (!pedidoCompleto) {
        this.sistema.ui.mostrarToast("erro", "Pedido não encontrado");
        return;
      }

      const total = pedidoCompleto.itens_pedido.reduce(
        (s, i) => s + (i.valor_total || 0),
        0,
      );
      const statusAprovacao =
        pedidoCompleto.status_aprovacao || "AGUARDANDO_APROVACAO";

      const cronogramaInteiro =
        this._cronogramaPedidoInteiroCache[pedidoCompleto.id];
      const temCronogramaInteiro = !!cronogramaInteiro;

      let html = `
        <div class="pedido-container">
          <div class="pedido-header">
            <div>
              <h2 class="pedido-titulo">PEDIDO Nº ${pedidoCompleto.numero_pedido}</h2>
              <p class="pedido-subtitulo" style="font-size:0.85rem;">${this.sistema.ui.formatarData(pedidoCompleto.data_solicitacao)}</p>
            </div>
            <span class="status-badge" style="background:${statusAprovacao === "APROVADO" ? "var(--success-100)" : statusAprovacao === "REPROVADO" ? "var(--error-100)" : "var(--warning-100)"};color:${statusAprovacao === "APROVADO" ? "var(--success-800)" : statusAprovacao === "REPROVADO" ? "var(--error-800)" : "var(--warning-800)"};">${statusAprovacao}</span>
          </div>
      `;

      if (pedidoCompleto.local_entrega) {
        html += `<div style="margin-bottom:16px;padding:10px 14px;background:var(--primary-50);border-left:3px solid var(--primary-600);border-radius:var(--border-radius-lg);font-size:0.85rem;">
          <i class="fas fa-map-marker-alt" style="color:var(--primary-600);"></i>
          <strong>Local de entrega:</strong> ${pedidoCompleto.local_entrega}
        </div>`;
      }

      if (pedidoCompleto.aprovado_por) {
        const { data: aprovador } = await supabase
          .from("usuarios")
          .select("nome")
          .eq("id", pedidoCompleto.aprovado_por)
          .single();
        html += `<div style="margin-bottom:16px;padding:8px;background:var(--neutral-50);border-radius:var(--border-radius-lg);font-size:0.85rem;"><strong>Aprovado/Rejeitado por:</strong> ${aprovador?.nome || "Desconhecido"} em ${this.sistema.ui.formatarData(pedidoCompleto.data_aprovacao)} ${pedidoCompleto.observacao_aprovacao ? `<br><strong>Observação:</strong> ${pedidoCompleto.observacao_aprovacao}` : ""}</div>`;
      }

      html += `
        <div style="margin-bottom:16px;">
          <h3 style="color:var(--primary-700);margin-bottom:8px;font-size:0.9rem;">DADOS DA ATA</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
            <div>
              <strong style="font-size:0.8rem;">Ata nº:</strong> <span style="font-size:0.85rem;">${pedidoCompleto.ata?.numero_ata || "N/I"}</span><br>
              <strong style="font-size:0.8rem;">Processo:</strong> <span style="font-size:0.85rem;">${pedidoCompleto.ata?.processo_administrativo || "N/I"}</span><br>
              <strong style="font-size:0.8rem;">Objeto:</strong> <span style="font-size:0.85rem;">${pedidoCompleto.ata?.objeto || "N/I"}</span>
            </div>
            <div>
              <strong style="font-size:0.8rem;">Vigência:</strong> <span style="font-size:0.85rem;">${this.sistema.ui.formatarData(pedidoCompleto.ata?.data_inicio_vigencia)} até ${this.sistema.ui.formatarData(pedidoCompleto.ata?.data_fim_vigencia)}</span>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div style="background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
            <h4 style="color:var(--primary-700);margin-bottom:6px;font-size:0.85rem;">FORNECEDOR</h4>
            <p style="font-size:0.8rem;"><strong>Razão Social:</strong> ${pedidoCompleto.fornecedor?.razao_social || "N/I"}</p>
            <p style="font-size:0.8rem;"><strong>CPF/CNPJ:</strong> ${this.formatarCnpj(pedidoCompleto.fornecedor?.cnpj || "N/I")}</p>
          </div>
          <div style="background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
            <h4 style="color:var(--primary-700);margin-bottom:6px;font-size:0.85rem;">SOLICITANTE</h4>
            <p style="font-size:0.8rem;"><strong>Órgão:</strong> ${pedidoCompleto.orgao_solicitante?.nome || "N/I"} (${pedidoCompleto.orgao_solicitante?.sigla || ""})</p>
            <p style="font-size:0.8rem;"><strong>CPF/CNPJ:</strong> ${this.formatarCnpj(pedidoCompleto.orgao_solicitante?.cnpj || "N/I")}</p>
            <p style="font-size:0.8rem;"><strong>Solicitante:</strong> ${pedidoCompleto.usuario?.nome || "N/I"}</p>
          </div>
        </div>
      `;

      if (temCronogramaInteiro) {
        html += this._renderizarBlocoCronogramaInteiroNoModal(
          pedidoCompleto.id,
          cronogramaInteiro,
          pedidoCompleto,
        );
      }

      html += `
        <h4 style="margin-bottom:10px;font-size:0.9rem;">ITENS DO PEDIDO</h4>
        <div class="tabela-container">
          <table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
            <thead>
              <tr style="background:var(--neutral-800);color:white;">
                <th style="padding:8px;text-align:left;">Item</th>
                <th style="padding:8px;text-align:left;">Descrição</th>
                <th style="padding:8px;text-align:right;">Qtd</th>
                <th style="padding:8px;text-align:right;">Valor Unit.</th>
                <th style="padding:8px;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${pedidoCompleto.itens_pedido
                .map(
                  (i) => `
                <tr>
                  <td style="padding:6px 8px;border-bottom:1px solid var(--neutral-200);">${i.item_numero || i.item_ata_id}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid var(--neutral-200);">${i.descricao || "Descrição não disponível"}</td>
                  <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--neutral-200);">${i.quantidade_solicitada || 0}</td>
                  <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--neutral-200);">${this.sistema.ui.formatarMoeda(i.valor_unitario)}</td>
                  <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--neutral-200);">${this.sistema.ui.formatarMoeda(i.valor_total)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr style="background:var(--neutral-50);">
                <td colspan="4" style="padding:10px;text-align:right;font-weight:700;">TOTAL DO PEDIDO</td>
                <td style="padding:10px;text-align:right;font-weight:700;color:var(--success-600);">${this.sistema.ui.formatarMoeda(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:20px;font-size:0.7rem;color:var(--neutral-500);font-style:italic;text-align:center;border-top:1px solid var(--neutral-200);padding-top:12px;">
          <p>Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")}.</p>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
          <button class="btn" style="background:var(--neutral-200);padding:6px 14px;border:none;border-radius:var(--border-radius-md);cursor:pointer;font-size:0.8rem;" onclick="sistema.fecharModalVisualizarPedido()">Fechar</button>
          ${
            statusAprovacao === "APROVADO"
              ? `<button class="btn-fracionar-pedido-inteiro" style="background:linear-gradient(135deg,var(--warning-600),var(--warning-700));color:white;padding:6px 14px;border:none;border-radius:var(--border-radius-md);cursor:pointer;font-size:0.8rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;" onclick="sistema.fecharModalVisualizarPedido(); sistema.pedidos._abrirModalFracionarPedido(${pedidoCompleto.id})">
                   <i class="fas fa-calendar-alt"></i>
                   ${temCronogramaInteiro ? "Editar Cronograma do Pedido" : "Fracionar Entregas do Pedido"}
                 </button>`
              : ""
          }
          ${
            temCronogramaInteiro
              ? `<button class="btn-pdf-cronograma" style="background:linear-gradient(135deg,#0891b2,#0e7490);color:white;padding:6px 14px;border:none;border-radius:var(--border-radius-md);cursor:pointer;font-size:0.8rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;" onclick="sistema.pedidos._exportarCronogramaPedidoPDF(${pedidoCompleto.id})">
                   <i class="fas fa-file-pdf"></i> PDF do Cronograma
                 </button>`
              : ""
          }
          <button class="btn-pdf" style="background:var(--primary-600);color:white;padding:6px 14px;border:none;border-radius:var(--border-radius-md);cursor:pointer;font-size:0.8rem;" onclick="sistema.pedidos.gerarPDFPedido(${pedidoCompleto.id})"><i class="fas fa-file-pdf"></i> PDF do Pedido</button>
        </div>
      </div>
      `;

      document.getElementById("modalVisualizarPedidoConteudo").innerHTML = html;
      document.getElementById("modalVisualizarPedido").classList.add("active");
    } catch (error) {
      this.sistema.ui.mostrarToast("erro", error.message);
    }
  }

  _renderizarBlocoCronogramaInteiroNoModal(pedidoId, cronograma, pedido) {
    if (
      !cronograma ||
      !cronograma.periodos ||
      cronograma.periodos.length === 0
    ) {
      return "";
    }

    const periodosOrdenados = [...cronograma.periodos].sort(
      (a, b) => a.numero - b.numero,
    );

    const cabecalhosSemana = periodosOrdenados
      .map(
        (sem) => `
          <th>
            <span>Semana ${sem.numero}</span>
            <small>${this._formatarDataBR(sem.data_inicio)} a ${this._formatarDataBR(sem.data_fim)}</small>
          </th>
        `,
      )
      .join("");

    const linhasItens = Object.keys(cronograma.itens)
      .map((itemKey) => {
        const item = pedido.itens_pedido?.find((i) => String(i.id) === itemKey);
        if (!item) return "";

        const quantidadePorSemana = new Map(
          (cronograma.itens[itemKey] || []).map((linha) => [
            Number(linha.numero_semana || linha.numero_entrega),
            Number(linha.quantidade) || 0,
          ]),
        );
        const unidade = item.unidade_medida || "UN";
        const totalProgramado = (cronograma.itens[itemKey] || []).reduce(
          (soma, linha) => soma + (Number(linha.quantidade) || 0),
          0,
        );
        const celulas = periodosOrdenados
          .map((sem) => {
            const quantidade = quantidadePorSemana.get(sem.numero) || 0;
            return `<td>${quantidade > 0 ? `${quantidade} ${unidade}` : "—"}</td>`;
          })
          .join("");

        return `
          <tr>
            <td class="cronograma-item-resumo">
              <strong>#${item.item_numero || "—"}</strong>
              <span>${item.descricao || "—"}</span>
              <small>${unidade}</small>
            </td>
            ${celulas}
            <td class="cronograma-total-resumo"><strong>${totalProgramado} ${unidade}</strong></td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="cronograma-inteiro-bloco">
        <h3 class="cronograma-inteiro-titulo">
          <i class="fas fa-calendar-check"></i> Cronograma de Entregas por Semana
        </h3>
        <div class="cronograma-inteiro-blocos-scroll">
          <table class="tabela-cronograma-matriz">
            <thead>
              <tr>
                <th>Produto</th>
                ${cabecalhosSemana}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${linhasItens}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  async carregarPedidoCompleto(pedidoId) {
    try {
      const { data: pedido, error: ePed } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .single();
      if (ePed || !pedido) return null;

      const [
        usuarioResult,
        ataResult,
        fornecedorResult,
        orgaoResult,
        itensResult,
      ] = await Promise.all([
        supabase
          .from("usuarios")
          .select("nome")
          .eq("id", pedido.usuario_id)
          .single(),
        supabase
          .from("atas")
          .select(
            "numero_ata, processo_administrativo, objeto, data_inicio_vigencia, data_fim_vigencia",
          )
          .eq("id", pedido.ata_id)
          .single(),
        supabase
          .from("fornecedores")
          .select("razao_social,cnpj")
          .eq("id", pedido.fornecedor_id)
          .single(),
        supabase
          .from("orgaos")
          .select("nome,sigla,cnpj")
          .eq("id", pedido.orgao_solicitante_id)
          .single(),
        supabase.from("itens_pedido").select("*").eq("pedido_id", pedidoId),
      ]);

      const itensCompletos = [];
      if (itensResult.data && itensResult.data.length > 0) {
        for (const item of itensResult.data) {
          const { data: itemAta } = await supabase
            .from("itens_ata")
            .select("descricao, item_numero, unidade_medida")
            .eq("id", item.item_ata_id)
            .single();
          itensCompletos.push({
            ...item,
            descricao: itemAta?.descricao || "Descrição não encontrada",
            item_numero: itemAta?.item_numero || item.item_ata_id,
            unidade_medida: itemAta?.unidade_medida || "UN",
          });
        }
      }

      return {
        ...pedido,
        usuario: usuarioResult.data || { nome: "N/I" },
        ata: ataResult.data || {},
        fornecedor: fornecedorResult.data || {},
        orgao_solicitante: orgaoResult.data || {},
        itens_pedido: itensCompletos,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async gerarPDFPedido(pedidoId) {
    try {
      const pedido = await this.carregarPedidoCompleto(pedidoId);
      if (!pedido) {
        this.sistema.ui.mostrarToast("erro", "Pedido não encontrado!");
        return;
      }

      const total = pedido.itens_pedido.reduce(
        (s, i) => s + (i.valor_total || 0),
        0,
      );
      this.sistema.pdfData = [
        {
          numeroPedido: pedido.numero_pedido,
          data: new Date(pedido.data_solicitacao).toLocaleDateString("pt-BR"),
          pedido: {
            fornecedorRazao: pedido.fornecedor?.razao_social,
            fornecedorCnpj: pedido.fornecedor?.cnpj,
            orgaoNome: pedido.orgao_solicitante?.nome,
            orgaoCnpj: pedido.orgao_solicitante?.cnpj,
            ataNumero: pedido.ata?.numero_ata,
            ataProcesso: pedido.ata?.processo_administrativo,
            ataObjeto: pedido.ata?.objeto,
            ataVigenciaInicio: pedido.ata?.data_inicio_vigencia,
            ataVigenciaFim: pedido.ata?.data_fim_vigencia,
            localEntrega: pedido.local_entrega || "",
            itens: pedido.itens_pedido.map((i) => ({
              itemNumero: i.item_numero,
              itemDescricao: i.descricao,
              quantidade: i.quantidade_solicitada,
              valorUnitario: i.valor_unitario,
              valorTotal: i.valor_total,
            })),
          },
          solicitante: pedido.usuario?.nome,
          orgao: pedido.orgao_solicitante?.nome,
          totalPedido: total,
          statusAprovacao: pedido.status_aprovacao || "AGUARDANDO_APROVACAO",
        },
      ];

      this.baixarPDF();
    } catch (error) {
      this.sistema.ui.mostrarToast("erro", error.message);
    }
  }

  async exportarPedidos() {
    try {
      let query = supabase
        .from("pedidos")
        .select(
          "*, atas:ata_id(numero_ata), fornecedores:fornecedor_id(razao_social, cnpj)",
        );

      if (this.sistema.usuarioAtual.orgao_id) {
        query = query.eq(
          "orgao_solicitante_id",
          this.sistema.usuarioAtual.orgao_id,
        );
      }

      query = this.aplicarFiltrosQuery(query);
      query = query.order("created_at", { ascending: false });

      const { data: pedidos, error } = await query;
      if (error) throw error;

      if (!pedidos || pedidos.length === 0) {
        this.sistema.ui.mostrarToast("aviso", "Nenhum pedido para exportar.");
        return;
      }

      const cabecalho = [
        "Nº Pedido",
        "Ata",
        "Fornecedor",
        "CPF/CNPJ",
        "Local de Entrega",
        "Valor Total",
        "Status",
        "Data Solicitação",
        "Data Aprovação",
        "Solicitante",
        "Órgão",
      ];

      const linhas = pedidos.map((p) => [
        p.numero_pedido || "",
        p.atas?.numero_ata || "",
        p.fornecedores?.razao_social || "",
        this.formatarCnpj(p.fornecedores?.cnpj || ""),
        p.local_entrega || "",
        (p.valor_total || 0).toFixed(2).replace(".", ","),
        p.status_aprovacao || "PEDIDO_REALIZADO",
        p.data_solicitacao || "",
        p.data_aprovacao || "",
        p.usuario_id || "",
        p.orgao_solicitante_id || "",
      ]);

      const csvContent = [
        cabecalho.join(","),
        ...linhas.map((l) => l.join(",")),
      ].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8;",
      });

      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `pedidos_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.sistema.ui.mostrarToast(
        "sucesso",
        `${pedidos.length} pedidos exportados com sucesso!`,
      );
    } catch (error) {
      console.error("Erro ao exportar pedidos:", error);
      this.sistema.ui.mostrarToast("erro", "Erro ao exportar pedidos.");
    }
  }

  baixarPDF() {
    if (!this.sistema.pdfData || this.sistema.pdfData.length === 0) {
      this.sistema.ui.mostrarToast("aviso", "Nenhum dado para gerar PDF");
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
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margem = 15;
      const contentWidth = pageWidth - margem * 2;

      const COR_AZUL_ESCURO = [26, 58, 107];
      const COR_AZUL_MEDIO = [37, 99, 235];
      const COR_AZUL_CLARO_BG = [235, 244, 255];
      const COR_VERDE = [22, 163, 74];
      const COR_VERDE_BG = [220, 252, 231];
      const COR_CINZA_LABEL = [100, 116, 139];
      const COR_CINZA_BORDA = [226, 232, 240];
      const COR_BRANCO = [255, 255, 255];

      this.sistema.pdfData.forEach((item, idx) => {
        if (idx > 0) doc.addPage();

        let y = 15;
        const pedido = item.pedido;
        const total = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);
        const status = item.statusAprovacao || "AGUARDANDO_APROVACAO";

        const statusMap = {
          APROVADO: { label: "ATIVO", cor: COR_VERDE, bg: COR_VERDE_BG },
          PEDIDO_REALIZADO: {
            label: "ATIVO",
            cor: COR_VERDE,
            bg: COR_VERDE_BG,
          },
          AGUARDANDO_APROVACAO: {
            label: "PENDENTE",
            cor: [217, 119, 6],
            bg: [254, 243, 199],
          },
          REPROVADO: {
            label: "REPROVADO",
            cor: [220, 38, 38],
            bg: [254, 226, 226],
          },
        };
        const statusInfo = statusMap[status] || statusMap["PEDIDO_REALIZADO"];

        doc.setFillColor(...COR_AZUL_ESCURO);
        doc.roundedRect(margem, y, 14, 18, 1.5, 1.5, "F");
        doc.setTextColor(...COR_BRANCO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("DOC", margem + 7, y + 10, { align: "center" });

        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("PEDIDO DE COMPRA", margem + 20, y + 8);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Sistema de Gestão de Atas", margem + 20, y + 15);

        const badgeNumeroWidth = 70;
        const badgeNumeroX = pageWidth - margem - badgeNumeroWidth;
        doc.setFillColor(...COR_AZUL_ESCURO);
        doc.roundedRect(badgeNumeroX, y, badgeNumeroWidth, 9, 1.5, 1.5, "F");
        doc.setTextColor(...COR_BRANCO);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`Nº ${item.numeroPedido}`, badgeNumeroX + 3, y + 6);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Data de Emissão", badgeNumeroX, y + 15);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(item.data, badgeNumeroX, y + 21);

        const badgeStatusWidth = 22;
        const badgeStatusX = pageWidth - margem - badgeStatusWidth;
        doc.setFillColor(...statusInfo.bg);
        doc.roundedRect(
          badgeStatusX,
          y + 14,
          badgeStatusWidth,
          7,
          3.5,
          3.5,
          "F",
        );
        doc.setTextColor(...statusInfo.cor);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(
          statusInfo.label,
          badgeStatusX + badgeStatusWidth / 2,
          y + 19,
          { align: "center" },
        );

        y += 26;

        doc.setDrawColor(...COR_CINZA_BORDA);
        doc.setLineWidth(0.3);
        doc.line(margem, y, pageWidth - margem, y);
        y += 6;

        const secaoAtaY = y;
        const secaoAtaHeight = pedido.localEntrega ? 50 : 40;

        doc.setFillColor(...COR_AZUL_CLARO_BG);
        doc.roundedRect(
          margem,
          secaoAtaY,
          contentWidth,
          secaoAtaHeight,
          1.5,
          1.5,
          "F",
        );

        doc.setFillColor(...COR_AZUL_ESCURO);
        doc.roundedRect(margem + 3, secaoAtaY + 3, 7, 7, 1, 1, "F");
        doc.setTextColor(...COR_BRANCO);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("i", margem + 6.5, secaoAtaY + 8, { align: "center" });

        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("DADOS DA ATA", margem + 13, secaoAtaY + 8.5);

        const gridY = secaoAtaY + 15;
        const colWidth = contentWidth / 3;

        doc.setTextColor(...COR_AZUL_MEDIO);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Ata nº:", margem + 5, gridY);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(pedido.ataNumero || "N/I", margem + 5, gridY + 5);

        doc.setTextColor(...COR_AZUL_MEDIO);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Processo:", margem + 5 + colWidth, gridY);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(pedido.ataProcesso || "N/I", margem + 5 + colWidth, gridY + 5);

        doc.setTextColor(...COR_AZUL_MEDIO);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Objeto:", margem + 5 + colWidth * 2, gridY);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const objetoLinhas = doc.splitTextToSize(
          pedido.ataObjeto || "N/I",
          colWidth - 8,
        );
        doc.text(
          objetoLinhas.slice(0, 2),
          margem + 5 + colWidth * 2,
          gridY + 5,
        );

        const vigenciaY = gridY + 14;
        doc.setTextColor(...COR_AZUL_MEDIO);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Vigência:", margem + 5, vigenciaY);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const vigIni = pedido.ataVigenciaInicio
          ? this.sistema.ui.formatarData(pedido.ataVigenciaInicio)
          : "N/I";
        const vigFim = pedido.ataVigenciaFim
          ? this.sistema.ui.formatarData(pedido.ataVigenciaFim)
          : "N/I";
        doc.text(`${vigIni} até ${vigFim}`, margem + 22, vigenciaY);

        if (pedido.localEntrega) {
          const localY = vigenciaY + 8;
          doc.setTextColor(...COR_AZUL_MEDIO);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.text("Local de entrega:", margem + 5, localY);
          doc.setTextColor(...COR_AZUL_ESCURO);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          const localLinhas = doc.splitTextToSize(
            pedido.localEntrega,
            contentWidth - 45,
          );
          doc.text(localLinhas.slice(0, 2), margem + 38, localY);
        }

        y = secaoAtaY + secaoAtaHeight + 5;

        const cardHeight = 30;
        const cardWidth = (contentWidth - 5) / 2;

        const card1X = margem;
        doc.setFillColor(...COR_BRANCO);
        doc.setDrawColor(...COR_CINZA_BORDA);
        doc.setLineWidth(0.3);
        doc.roundedRect(card1X, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

        doc.setFillColor(...COR_AZUL_CLARO_BG);
        doc.roundedRect(card1X, y, cardWidth, 8, 1.5, 1.5, "F");

        doc.setFillColor(...COR_AZUL_ESCURO);
        doc.roundedRect(card1X + 3, y + 1.5, 5, 5, 0.8, 0.8, "F");
        doc.setTextColor(...COR_BRANCO);
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.text("F", card1X + 5.5, y + 5, { align: "center" });

        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("FORNECEDOR", card1X + 10, y + 5.5);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Razão Social:", card1X + 3, y + 13);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        const razaoLinhas = doc.splitTextToSize(
          pedido.fornecedorRazao || "N/I",
          cardWidth - 6,
        );
        doc.text(razaoLinhas.slice(0, 2), card1X + 3, y + 17);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("CPF/CNPJ:", card1X + 3, y + 25);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(this.formatarCnpj(pedido.fornecedorCnpj || "N/I"), card1X + 15, y + 25);

        const card2X = margem + cardWidth + 5;
        doc.setFillColor(...COR_BRANCO);
        doc.setDrawColor(...COR_CINZA_BORDA);
        doc.roundedRect(card2X, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

        doc.setFillColor(...COR_AZUL_CLARO_BG);
        doc.roundedRect(card2X, y, cardWidth, 8, 1.5, 1.5, "F");

        doc.setFillColor(...COR_AZUL_ESCURO);
        doc.roundedRect(card2X + 3, y + 1.5, 5, 5, 0.8, 0.8, "F");
        doc.setTextColor(...COR_BRANCO);
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.text("S", card2X + 5.5, y + 5, { align: "center" });

        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("SOLICITANTE", card2X + 10, y + 5.5);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Órgão:", card2X + 3, y + 13);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const orgaoLinhas = doc.splitTextToSize(
          pedido.orgaoNome || "N/I",
          cardWidth - 20,
        );
        doc.text(orgaoLinhas.slice(0, 1), card2X + 15, y + 13);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("CPF/CNPJ:", card2X + 3, y + 19);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(this.formatarCnpj(pedido.orgaoCnpj || "N/I"), card2X + 15, y + 19);

        doc.setTextColor(...COR_CINZA_LABEL);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Solicitante:", card2X + 3, y + 25);
        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(item.solicitante || "N/I", card2X + 22, y + 25);

        y += cardHeight + 6;

        const tableData = pedido.itens.map((i) => [
          i.itemNumero,
          i.itemDescricao,
          i.quantidade.toString(),
          this.sistema.ui
            .formatarMoeda(i.valorUnitario)
            .replace("R$", "")
            .trim(),
          this.sistema.ui.formatarMoeda(i.valorTotal).replace("R$", "").trim(),
        ]);

        doc.autoTable({
          startY: y,
          head: [["Item", "Descrição", "Qtd", "Valor Unit.", "Total"]],
          body: tableData,
          theme: "grid",
          headStyles: {
            fillColor: COR_AZUL_ESCURO,
            textColor: COR_BRANCO,
            fontSize: 9,
            fontStyle: "bold",
            halign: "left",
          },
          bodyStyles: {
            fontSize: 9,
            textColor: COR_AZUL_ESCURO,
            cellPadding: 3,
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: contentWidth * 0.08, halign: "center" },
            1: { cellWidth: contentWidth * 0.52, halign: "left" },
            2: { cellWidth: contentWidth * 0.1, halign: "center" },
            3: { cellWidth: contentWidth * 0.15, halign: "right" },
            4: { cellWidth: contentWidth * 0.15, halign: "right" },
          },
          styles: {
            lineColor: COR_CINZA_BORDA,
            lineWidth: 0.2,
          },
          margin: { left: margem, right: margem },
        });

        y = doc.lastAutoTable.finalY + 4;

        const totalRowHeight = 12;
        doc.setFillColor(...COR_AZUL_CLARO_BG);
        doc.roundedRect(margem, y, contentWidth, totalRowHeight, 1.5, 1.5, "F");

        doc.setTextColor(...COR_AZUL_ESCURO);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("TOTAL DO PEDIDO", pageWidth - margem - 55, y + 7.5, {
          align: "right",
        });

        const totalBadgeWidth = 42;
        const totalBadgeX = pageWidth - margem - totalBadgeWidth - 2;
        doc.setFillColor(...COR_AZUL_ESCURO);
        doc.roundedRect(
          totalBadgeX,
          y + 1,
          totalBadgeWidth,
          totalRowHeight - 2,
          1.5,
          1.5,
          "F",
        );
        doc.setTextColor(...COR_BRANCO);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(
          `R$ ${this.sistema.ui.formatarMoeda(total).replace("R$", "").trim()}`,
          totalBadgeX + totalBadgeWidth / 2,
          y + 8.5,
          { align: "center" },
        );

        y += totalRowHeight + 6;

        doc.setDrawColor(...COR_CINZA_BORDA);
        doc.setLineWidth(0.3);
        doc.line(margem, y, pageWidth - margem, y);

        doc.setTextColor(...COR_AZUL_MEDIO);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(
          "Sistema desenvolvido pelo Departamento de Informática - Versão 1.0",
          pageWidth / 2,
          y + 5,
          { align: "center" },
        );
      });

      const dataAtual = new Date()
        .toLocaleDateString("pt-BR")
        .replace(/\//g, "-");
      doc.save(`pedido_${dataAtual}.pdf`);
      this.sistema.ui.mostrarToast("sucesso", "PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao gerar PDF",
        error.message || "Erro desconhecido ao gerar PDF.",
      );
    }
  }

  async inicializarOnda1() {
    try {
      document
        .getElementById("btnNovoPedido")
        ?.addEventListener("click", () => this.irParaConsultaModoCompra());

      document
        .getElementById("btnIrParaCarrinho")
        ?.addEventListener("click", () => this.irParaCarrinho());

      document
        .getElementById("btnIrParaFila")
        ?.addEventListener("click", () => this.irParaFilaAprovacao());

      this.atualizarAcoesRapidas();
    } catch (error) {
      console.error("[Onda 1] Erro ao inicializar:", error);
    }
  }

  irParaConsultaModoCompra() {
    try {
      sessionStorage.setItem(
        "consulta_modo_compra",
        JSON.stringify({ origem: "pedidos", timestamp: Date.now() }),
      );
    } catch (e) {
      console.warn("Não foi possível salvar flag de modo compra:", e);
    }

    this.sistema.ativarTab("consulta");
  }

  irParaCarrinho() {
    const temItens = (this.sistema.carrinho || []).length > 0;

    if (!temItens) {
      this.sistema.ui.mostrarToast(
        "info",
        "Carrinho vazio",
        "Adicione itens pela Consulta ou pela Compra Rápida.",
        3500,
      );
    }

    this.sistema.ativarTab("carrinho");
  }

  irParaFilaAprovacao() {
    this.filtrarPorStatus("AGUARDANDO_APROVACAO");

    const bloco = document.getElementById("filaAprovacao");
    if (bloco && bloco.style.display !== "none") {
      bloco.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      document
        .getElementById("pedidosLista")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  atualizarAcoesRapidas() {
    const badgeCarrinho = document.getElementById("badgeCarrinhoAcoes");
    if (badgeCarrinho) {
      const qtd = (this.sistema.carrinho || []).length;
      badgeCarrinho.textContent = qtd;
      badgeCarrinho.classList.toggle("badge-vazio", qtd === 0);
    }

    const btnFila = document.getElementById("btnIrParaFila");
    const badgeFila = document.getElementById("badgeFilaAcoes");
    if (!btnFila || !badgeFila) return;

    const perfil = this.sistema.usuarioAtual?.perfil;
    const podeAprovar = perfil === "ADMIN" || perfil === "SECRETARIO";
    const temFila = (this._filaAprovacao || []).length > 0;

    if (podeAprovar && temFila) {
      btnFila.style.display = "inline-flex";
      badgeFila.textContent = this._filaAprovacao.length;
    } else {
      btnFila.style.display = "none";
    }
  }

  async inicializarOnda2() {
    try {
      await this.carregarAtasCompraRapida();

      const selectAta = document.getElementById("compraRapidaAta");
      const selectItem = document.getElementById("compraRapidaItem");
      const inputQtd = document.getElementById("compraRapidaQtd");
      const btnAdicionar = document.getElementById("btnCompraRapidaAdicionar");

      selectAta?.addEventListener("change", (e) => {
        this.carregarItensCompraRapida(e.target.value);
      });

      selectItem?.addEventListener("change", () => {
        this.atualizarPreviewCompraRapida();
      });

      inputQtd?.addEventListener("input", () => {
        this.atualizarPreviewCompraRapida();
      });

      btnAdicionar?.addEventListener("click", () => {
        this.adicionarCompraRapida();
      });
    } catch (error) {
      console.error("[Onda 2] Erro ao inicializar:", error);
    }
  }

  async carregarAtasCompraRapida() {
    const select = document.getElementById("compraRapidaAta");
    if (!select) return;

    try {
      const { data: atas, error } = await supabase
        .from("atas")
        .select(
          `
          id, numero_ata, data_fim_vigencia, situacao,
          fornecedor:fornecedores(razao_social),
          itens:itens_ata(id, saldo_quantidade)
        `,
        )
        .eq("situacao", "ATIVA")
        .order("data_fim_vigencia", { ascending: true });

      if (error) throw error;

      this._atasCompraRapida = (atas || []).filter((a) =>
        (a.itens || []).some((i) => (i.saldo_quantidade || 0) > 0),
      );

      select.innerHTML = '<option value="">🔍 Selecione uma ata...</option>';

      if (this._atasCompraRapida.length === 0) {
        select.innerHTML =
          '<option value="">Nenhuma ata disponível para compra</option>';
        return;
      }

      this._atasCompraRapida.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.id;
        const fornecedor = a.fornecedor?.razao_social || "N/I";
        const vigencia = a.data_fim_vigencia
          ? ` · vence ${this.sistema.ui.formatarData(a.data_fim_vigencia)}`
          : "";
        opt.textContent = `Ata ${a.numero_ata} · ${fornecedor}${vigencia}`;
        select.appendChild(opt);
      });
    } catch (error) {
      console.error("Erro ao carregar atas para compra rápida:", error);
      select.innerHTML = '<option value="">Erro ao carregar atas</option>';
    }
  }

  async carregarItensCompraRapida(ataId) {
    const selectItem = document.getElementById("compraRapidaItem");
    const inputQtd = document.getElementById("compraRapidaQtd");
    const btnAdicionar = document.getElementById("btnCompraRapidaAdicionar");
    if (!selectItem || !inputQtd || !btnAdicionar) return;

    if (!ataId) {
      selectItem.innerHTML =
        '<option value="">Selecione uma ata primeiro...</option>';
      selectItem.disabled = true;
      inputQtd.value = "";
      inputQtd.disabled = true;
      btnAdicionar.disabled = true;
      this._itensCompraRapidaAtual = [];
      this.esconderPreviewCompraRapida();
      return;
    }

    try {
      const { data: itens, error } = await supabase
        .from("itens_ata")
        .select(
          "id, item_numero, descricao, quantidade_contratada, saldo_quantidade, valor_unitario",
        )
        .eq("ata_id", parseInt(ataId))
        .gt("saldo_quantidade", 0)
        .order("item_numero", { ascending: true });

      if (error) throw error;

      this._itensCompraRapidaAtual = itens || [];

      if (this._itensCompraRapidaAtual.length === 0) {
        selectItem.innerHTML =
          '<option value="">Todos os itens desta ata estão esgotados</option>';
        selectItem.disabled = true;
        inputQtd.value = "";
        inputQtd.disabled = true;
        btnAdicionar.disabled = true;
        this.esconderPreviewCompraRapida();
        return;
      }

      selectItem.innerHTML = '<option value="">Selecione um item...</option>';
      this._itensCompraRapidaAtual.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        const descCompleta = item.descricao || "";
        const descCurta =
          descCompleta.length > 80
            ? descCompleta.slice(0, 77) + "..."
            : descCompleta;
        opt.textContent = `#${item.item_numero} · ${descCurta} · Saldo: ${item.saldo_quantidade}`;
        opt.dataset.saldo = item.saldo_quantidade;
        selectItem.appendChild(opt);
      });

      selectItem.disabled = false;
      inputQtd.value = "";
      inputQtd.disabled = true;
      btnAdicionar.disabled = true;
      this.esconderPreviewCompraRapida();
    } catch (error) {
      console.error("Erro ao carregar itens da ata:", error);
      selectItem.innerHTML = '<option value="">Erro ao carregar itens</option>';
      selectItem.disabled = true;
      this._itensCompraRapidaAtual = [];
    }
  }

  atualizarPreviewCompraRapida() {
    const selectItem = document.getElementById("compraRapidaItem");
    const inputQtd = document.getElementById("compraRapidaQtd");
    const btnAdicionar = document.getElementById("btnCompraRapidaAdicionar");
    const previewEl = document.getElementById("compraRapidaPreview");
    if (!selectItem || !inputQtd || !btnAdicionar || !previewEl) return;

    const itemId = selectItem.value;
    const quantidade = parseInt(inputQtd.value) || 0;

    if (!itemId) {
      inputQtd.disabled = true;
      inputQtd.value = "";
      btnAdicionar.disabled = true;
      this.esconderPreviewCompraRapida();
      return;
    }

    inputQtd.disabled = false;

    const item = this._itensCompraRapidaAtual.find(
      (i) => String(i.id) === String(itemId),
    );

    if (!item) {
      btnAdicionar.disabled = true;
      this.esconderPreviewCompraRapida();
      return;
    }

    if (quantidade <= 0) {
      btnAdicionar.disabled = true;
      this.esconderPreviewCompraRapida();
      return;
    }

    const saldo = item.saldo_quantidade || 0;
    const excedeSaldo = quantidade > saldo;
    const valorUnit = item.valor_unitario || 0;
    const valorTotal = valorUnit * quantidade;

    previewEl.style.display = "flex";
    previewEl.innerHTML = `
      <div class="compra-rapida-preview-linha">
        <span>Item selecionado:</span>
        <strong>#${item.item_numero} · ${item.descricao || ""}</strong>
      </div>
      <div class="compra-rapida-preview-linha">
        <span>Quantidade:</span>
        <strong>${quantidade} (saldo disponível: ${saldo})</strong>
      </div>
      <div class="compra-rapida-preview-linha">
        <span>Valor unitário:</span>
        <strong>${this.sistema.ui.formatarMoeda(valorUnit)}</strong>
      </div>
      <div class="compra-rapida-preview-total">
        <span>Total:</span>
        <span class="valor-total">${this.sistema.ui.formatarMoeda(valorTotal)}</span>
      </div>
      ${
        excedeSaldo
          ? `<div class="compra-rapida-preview-aviso">
              <i class="fas fa-exclamation-triangle"></i>
              Quantidade excede o saldo disponível (${saldo}).
             </div>`
          : ""
      }
    `;

    btnAdicionar.disabled = excedeSaldo || quantidade <= 0;
  }

  esconderPreviewCompraRapida() {
    const previewEl = document.getElementById("compraRapidaPreview");
    if (previewEl) {
      previewEl.style.display = "none";
      previewEl.innerHTML = "";
    }
  }

  adicionarCompraRapida() {
    const selectAta = document.getElementById("compraRapidaAta");
    const selectItem = document.getElementById("compraRapidaItem");
    const inputQtd = document.getElementById("compraRapidaQtd");
    if (!selectAta || !selectItem || !inputQtd) return;

    const ataId = selectAta.value;
    const itemId = selectItem.value;
    const quantidade = parseInt(inputQtd.value) || 0;

    if (!ataId || !itemId || quantidade <= 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Dados incompletos",
        "Selecione a ata, o item e informe a quantidade.",
      );
      return;
    }

    const ata = this._atasCompraRapida.find(
      (a) => String(a.id) === String(ataId),
    );
    const item = this._itensCompraRapidaAtual.find(
      (i) => String(i.id) === String(itemId),
    );

    if (!ata || !item) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        "Não foi possível localizar a ata ou o item.",
      );
      return;
    }

    const saldo = item.saldo_quantidade || 0;
    if (quantidade > saldo) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Saldo insuficiente",
        `Disponível: ${saldo} unidades.`,
      );
      return;
    }

    const existente = (this.sistema.carrinho || []).find(
      (c) => c.ataId === ata.id && c.itemId === item.id,
    );

    if (existente) {
      const novaQtd = existente.quantidade + quantidade;
      if (novaQtd > saldo) {
        this.sistema.ui.mostrarToast(
          "erro",
          "Saldo insuficiente",
          `Total no carrinho (${novaQtd}) excede o disponível (${saldo}).`,
        );
        return;
      }
      existente.quantidade = novaQtd;
      existente.valorTotal = existente.valorUnitario * novaQtd;
    } else {
      const numeroPedido = `PED-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000 + 1000))}`;

      this.sistema.carrinho.push({
        id: `${ata.id}-${item.id}-${Date.now()}`,
        ataId: ata.id,
        ataNumero: ata.numero_ata,
        fornecedorId: ata.fornecedor_id,
        fornecedorRazao: ata.fornecedor?.razao_social || "",
        fornecedorCnpj: ata.fornecedor?.cnpj || "",
        processo: ata.processo_administrativo || "",
        objeto: ata.objeto || "",
        itemId: item.id,
        itemNumero: item.item_numero,
        itemDescricao: item.descricao,
        quantidade: quantidade,
        valorUnitario: item.valor_unitario,
        valorTotal: item.valor_unitario * quantidade,
        numeroPedido: numeroPedido,
        data: new Date().toISOString().split("T")[0],
        solicitante: this.sistema.usuarioAtual?.nome,
        orgaoId: this.sistema.usuarioAtual?.orgao_id,
      });
    }

    this.sistema.salvarCarrinhoStorage();

    selectItem.value = "";
    inputQtd.value = "";
    inputQtd.disabled = true;
    document.getElementById("btnCompraRapidaAdicionar").disabled = true;
    this.esconderPreviewCompraRapida();

    this.sistema.ui.mostrarToast(
      "sucesso",
      "Item adicionado",
      `${quantidade}x ${item.descricao?.slice(0, 40) || "item"} no carrinho.`,
    );

    this.atualizarAcoesRapidas();
  }

  async inicializarOnda3() {
    try {
      const perfil = this.sistema.usuarioAtual?.perfil;
      const podeAprovar = perfil === "ADMIN" || perfil === "SECRETARIO";

      if (!podeAprovar) {
        this._filaAprovacao = [];
        this.atualizarAcoesRapidas();
        return;
      }

      await this.carregarFilaAprovacao();
    } catch (error) {
      console.error("[Onda 3] Erro ao inicializar:", error);
    }
  }

  async carregarFilaAprovacao() {
    try {
      let query = supabase
        .from("pedidos")
        .select(
          `
          id, numero_pedido, valor_total, created_at, data_solicitacao,
          usuario:usuarios!usuario_id(nome),
          orgao:orgaos!orgao_solicitante_id(nome, sigla),
          fornecedor:fornecedores!fornecedor_id(razao_social),
          ata:atas!ata_id(numero_ata)
        `,
        )
        .eq("status_aprovacao", "AGUARDANDO_APROVACAO")
        .order("created_at", { ascending: true });

      if (this.sistema.usuarioAtual.perfil === "SECRETARIO") {
        query = query.eq(
          "orgao_solicitante_id",
          this.sistema.usuarioAtual.orgao_id,
        );
      }

      const { data: pedidos, error } = await query;
      if (error) throw error;

      this._filaAprovacao = pedidos || [];

      this.renderizarFilaAprovacao();
      this.atualizarAcoesRapidas();
    } catch (error) {
      console.error("Erro ao carregar fila de aprovação:", error);
      this._filaAprovacao = [];
    }
  }

  renderizarFilaAprovacao() {
    const container = document.getElementById("filaAprovacao");
    if (!container) return;

    const pedidos = this._filaAprovacao || [];

    if (pedidos.length === 0) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }

    const LIMITE_VISIVEL = 5;
    const visiveis = pedidos.slice(0, LIMITE_VISIVEL);
    const restantes = pedidos.length - visiveis.length;
    const totalGeral = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0);

    const itensHtml = visiveis
      .map((p) => {
        const numero = p.numero_pedido || "N/I";
        const fornecedor = p.fornecedor?.razao_social || "N/I";
        const orgao = p.orgao?.sigla || p.orgao?.nome || "Órgão não informado";
        const valor = this.sistema.ui.formatarMoeda(p.valor_total || 0);
        const dias = Math.max(0, Math.floor((Date.now() - new Date(p.created_at || p.data_solicitacao || Date.now()).getTime()) / 86400000));
        const idade = dias === 0 ? "Hoje" : `${dias} ${dias === 1 ? "dia" : "dias"}`;
        return `
          <li class="fila-aprovacao-item fila-aprovacao-item-enriquecido">
            <span class="fila-aprovacao-item-numero"><strong>${numero}</strong><small>${orgao}</small></span>
            <span class="fila-aprovacao-item-fornecedor"><span>${fornecedor}</span><small><i class="far fa-clock"></i> ${idade}</small></span>
            <span class="fila-aprovacao-item-valor">${valor}</span>
          </li>
        `;
      })
      .join("");

    const linhaRestantes =
      restantes > 0
        ? `<li class="fila-aprovacao-mais">… e mais ${restantes} ${restantes === 1 ? "pedido" : "pedidos"}</li>`
        : "";

    container.style.display = "block";
    container.innerHTML = `
      <div class="fila-aprovacao-header">
        <i class="fas fa-exclamation-circle"></i>
        <h4 class="fila-aprovacao-titulo">
          <strong>${pedidos.length}</strong>
          ${pedidos.length === 1 ? "pedido aguardando" : "pedidos aguardando"}
          sua aprovação
        </h4>
        <span class="fila-aprovacao-subtitulo">
          Aprovar em lote desconta o saldo das atas automaticamente.
        </span>
      </div>

      <ul class="fila-aprovacao-lista">
        ${itensHtml}
        ${linhaRestantes}
      </ul>

      <div class="fila-aprovacao-acoes">
        <span class="fila-aprovacao-total">
          Valor total agregado: <strong>${this.sistema.ui.formatarMoeda(totalGeral)}</strong>
        </span>
        <button type="button" class="btn-aprovar-todos" id="btnAprovarTodos">
          <i class="fas fa-check-double"></i> Aprovar Todos
        </button>
        <button type="button" class="btn-ver-fila-completa" id="btnVerFilaCompleta">
          <i class="fas fa-list"></i> Ver Fila Completa
        </button>
      </div>
    `;

    document
      .getElementById("btnAprovarTodos")
      ?.addEventListener("click", () => this.aprovarTodosPendentes());

    document
      .getElementById("btnVerFilaCompleta")
      ?.addEventListener("click", () => this.verFilaCompleta());
  }

  verFilaCompleta() {
    this.filtrarPorStatus("AGUARDANDO_APROVACAO");

    const lista = document.getElementById("pedidosLista");
    if (lista) {
      lista.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async aprovarTodosPendentes() {
    if (this._processandoAprovacaoLote) return;

    const pedidos = this._filaAprovacao || [];
    if (pedidos.length === 0) {
      this.sistema.ui.mostrarToast(
        "info",
        "Sem pedidos",
        "Não há pedidos aguardando aprovação.",
      );
      return;
    }

    const confirmado = await this.confirmarAprovacaoLote(pedidos);
    if (!confirmado) return;

    this._processandoAprovacaoLote = true;

    const btn = document.getElementById("btnAprovarTodos");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aprovando...';
    }

    let sucessos = 0;
    let falhas = 0;

    try {
      for (const p of pedidos) {
        try {
          await this._aprovarPedidoSilencioso(p.id);
          sucessos++;
        } catch (err) {
          console.error(`Falha ao aprovar pedido ${p.numero_pedido}:`, err);
          falhas++;
        }
      }

      if (falhas === 0) {
        this.sistema.ui.mostrarToast(
          "sucesso",
          "Aprovação em lote",
          `${sucessos} pedido(s) aprovado(s) com sucesso.`,
          5000,
        );
      } else if (sucessos === 0) {
        this.sistema.ui.mostrarToast(
          "erro",
          "Aprovação em lote",
          `Nenhum pedido pôde ser aprovado. ${falhas} falha(s).`,
          5000,
        );
      } else {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Aprovação parcial",
          `${sucessos} aprovado(s), ${falhas} com falha.`,
          5000,
        );
      }

      this.offset = 0;
      this.pedidosCache = [];
      await this.carregarPedidos();
      await this.carregarFilaAprovacao();
    } catch (error) {
      console.error("Erro na aprovação em lote:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro inesperado",
        error.message || "Falha na aprovação em lote.",
      );
    } finally {
      this._processandoAprovacaoLote = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-double"></i> Aprovar Todos';
      }
    }
  }

  async _aprovarPedidoSilencioso(pedidoId) {
    const { data, error } = await supabase.rpc("compras_aprovar_pedido", {
      p_pedido_id: pedidoId,
    });
    if (error) throw error;
    return data;
  }

  confirmarAprovacaoLote(pedidos) {
    return new Promise((resolve) => {
      const totalGeral = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0);

      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(3,7,18,0.82);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;`;

      const listaLinhas = pedidos
        .slice(0, 20)
        .map((p) => {
          const numero = p.numero_pedido || "N/I";
          const fornecedor = p.fornecedor?.razao_social || "N/I";
          const valor = this.sistema.ui.formatarMoeda(p.valor_total || 0);
          return `<li style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:#f8fafc;border-radius:8px;font-size:0.8rem;border:1px solid #e2e8f0;">
            <strong style="color:#1a3a6b;">${numero}</strong>
            <span style="flex:1;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fornecedor}</span>
            <span style="color:#059669;font-weight:700;">${valor}</span>
          </li>`;
        })
        .join("");

      const maisLinha =
        pedidos.length > 20
          ? `<li style="text-align:center;font-size:0.75rem;color:#64748b;font-style:italic;padding:4px;">… e mais ${pedidos.length - 20} pedido(s)</li>`
          : "";

      overlay.innerHTML = `
        <div style="background:white;border-radius:20px;max-width:520px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.25);border:1px solid #e2e8f0;overflow:hidden;">
          <div style="padding:20px 24px;background:linear-gradient(135deg,#fef2f2,#fff5f5);border-bottom:2px solid #fecaca;display:flex;align-items:center;gap:12px;">
            <i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:1.4rem;"></i>
            <div>
              <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#991b1b;">Aprovar ${pedidos.length} pedido(s) em lote</h3>
              <p style="margin:2px 0 0;font-size:0.78rem;color:#64748b;">Esta ação irá descontar o saldo das atas automaticamente.</p>
            </div>
          </div>
          <div style="padding:16px 20px;">
            <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:0.8rem;color:#7f1d1d;">
              <strong>Atenção:</strong> Após a confirmação, os pedidos abaixo serão marcados como <strong>APROVADO</strong> e o saldo dos itens será reduzido.
            </div>
            <ul style="list-style:none;padding:0;margin:0 0 14px 0;max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
              ${listaLinhas}
              ${maisLinha}
            </ul>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-weight:700;font-size:0.9rem;color:#166534;">
              <span>Valor total agregado:</span>
              <span style="font-size:1.1rem;">${this.sistema.ui.formatarMoeda(totalGeral)}</span>
            </div>
          </div>
          <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" id="__cancelarLote" style="padding:9px 20px;background:white;border:1px solid #cbd5e1;border-radius:10px;font-weight:600;font-size:0.85rem;cursor:pointer;font-family:inherit;color:#475569;">Cancelar</button>
            <button type="button" id="__confirmarLote" style="padding:9px 24px;background:linear-gradient(135deg,#059669,#047857);color:white;border:none;border-radius:10px;font-weight:700;font-size:0.85rem;cursor:pointer;font-family:inherit;box-shadow:0 2px 6px rgba(5,150,105,0.25);display:inline-flex;align-items:center;gap:8px;">
              <i class="fas fa-check-double"></i> Confirmar e Aprovar
            </button>
          </div>
        </div>
      `;

      const fechar = (resultado) => {
        overlay.style.opacity = "0";
        overlay.style.transition = "opacity 0.2s ease";
        setTimeout(() => {
          overlay.remove();
          resolve(resultado);
        }, 200);
      };

      overlay
        .querySelector("#__cancelarLote")
        .addEventListener("click", () => fechar(false));
      overlay
        .querySelector("#__confirmarLote")
        .addEventListener("click", () => fechar(true));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fechar(false);
      });

      document.body.appendChild(overlay);
    });
  }

  async rejeitarPedido(pedidoId) {
    this.pedidoRejeicaoId = pedidoId;
    window._pedidoRejeicaoId = pedidoId;

    const textarea = document.getElementById("motivoRejeicao");
    if (textarea) {
      textarea.value = "";
      textarea.focus();
      textarea.removeEventListener("input", this._handleCharCount);
      textarea.addEventListener("input", this._handleCharCount);
    }

    const charCount = document.getElementById("charCount");
    if (charCount) {
      charCount.textContent = "0";
      charCount.className = "count";
    }

    const modal = document.getElementById("modalMotivoRejeicao");
    if (modal) modal.classList.add("active");
  }

  _handleCharCount(e) {
    const textarea = e.target;
    const count = textarea.value.length;
    const charCount = document.getElementById("charCount");
    if (charCount) {
      charCount.textContent = count;
      charCount.className = "count";
      if (count > 450) charCount.classList.add("danger");
      else if (count > 400) charCount.classList.add("warning");
    }
  }

  async confirmarRejeicao() {
    const textarea = document.getElementById("motivoRejeicao");
    const justificativa = textarea?.value?.trim();

    if (!justificativa) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe o motivo da rejeição.",
      );
      textarea?.focus();
      return;
    }

    if (justificativa.length < 10) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Texto muito curto",
        "O motivo deve ter pelo menos 10 caracteres.",
      );
      textarea?.focus();
      return;
    }

    const btn = document.getElementById("btnConfirmarRejeicao");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }

    try {
      const { error } = await supabase.rpc("compras_rejeitar_pedido", {
        p_pedido_id: this.pedidoRejeicaoId,
        p_justificativa: justificativa,
      });

      if (error) throw error;

      this.fecharModalMotivoRejeicao();
      this.sistema.ui.mostrarToast(
        "sucesso",
        "Pedido rejeitado",
        "O pedido foi rejeitado com sucesso.",
      );
      await this.carregarPedidos();
    } catch (error) {
      this.sistema.ui.mostrarToast("erro", "Erro", error.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML =
          '<i class="fas fa-exclamation-triangle"></i> Rejeitar Pedido';
      }
    }
  }

  async abrirModalMotivoRejeicao(pedidoId) {
    try {
      const { data: pedido, error } = await supabase
        .from("pedidos")
        .select(
          "numero_pedido, observacao_aprovacao, aprovado_por, data_aprovacao",
        )
        .eq("id", pedidoId)
        .single();

      if (error) throw error;

      let nomeAprovador = "Desconhecido";
      let iniciaisAprovador = "?";
      if (pedido.aprovado_por) {
        const { data: aprovador } = await supabase
          .from("usuarios")
          .select("nome")
          .eq("id", pedido.aprovado_por)
          .single();
        nomeAprovador = aprovador?.nome || "Desconhecido";
        iniciaisAprovador = nomeAprovador
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();
      }

      const html = `
        <div class="motivo-card">
          <div class="card-header">
            <div class="pedido-info">
              <span class="pedido-numero"><i class="fas fa-file-invoice"></i> ${pedido.numero_pedido || "N/I"}</span>
            </div>
            <span class="pedido-status"><i class="fas fa-times-circle"></i> Rejeitado</span>
          </div>
          <div class="card-body">
            <div class="aprovador-info">
              <div class="aprovador-avatar">${iniciaisAprovador}</div>
              <div class="aprovador-detalhes">
                <div class="nome"><i class="fas fa-user-check" style="color: var(--error-600); margin-right: 4px;"></i> ${nomeAprovador}</div>
                <div class="data"><i class="far fa-calendar-alt"></i> Rejeitado em ${this.sistema.ui.formatarData(pedido.data_aprovacao)}</div>
              </div>
            </div>
            <div class="motivo-content">
              <div class="motivo-label"><i class="fas fa-comment"></i> Motivo da Rejeição</div>
              <div class="motivo-texto">${pedido.observacao_aprovacao || "Motivo não informado."}</div>
            </div>
          </div>
        </div>
      `;

      document.getElementById("modalVisualizarMotivoConteudo").innerHTML = html;
      document.getElementById("modalVisualizarMotivo").classList.add("active");
    } catch (error) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        "Não foi possível carregar o motivo da rejeição.",
      );
      console.error(error);
    }
  }

  fecharModalMotivoRejeicao() {
    const modal = document.getElementById("modalMotivoRejeicao");
    if (modal) modal.classList.remove("active");

    const textarea = document.getElementById("motivoRejeicao");
    if (textarea) {
      textarea.value = "";
      textarea.removeEventListener("input", this._handleCharCount);
    }

    const charCount = document.getElementById("charCount");
    if (charCount) {
      charCount.textContent = "0";
      charCount.className = "count";
    }

    const btn = document.getElementById("btnConfirmarRejeicao");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML =
        '<i class="fas fa-exclamation-triangle"></i> Rejeitar Pedido';
    }
  }

  fecharModalVisualizarMotivo() {
    const modal = document.getElementById("modalVisualizarMotivo");
    if (modal) modal.classList.remove("active");
  }

  async encerrarPedido(pedidoId) {
    try {
      const confirmado = await this.sistema.confirmar(
        "Encerrar este pedido? O sistema validará se todos os itens foram entregues e registrará a decisão na timeline.",
      );
      if (!confirmado) return;
      const observacao = window.prompt("Observação de encerramento (opcional):", "") || null;
      const { error } = await supabase.rpc("compras_encerrar_pedido", {
        p_pedido_id: pedidoId,
        p_observacao: observacao,
      });
      if (error) throw error;
      this.sistema.ui.mostrarToast("sucesso", "Pedido encerrado e auditado com sucesso.");
      await this.carregarPedidos();
    } catch (error) {
      console.error("Erro ao encerrar pedido:", error);
      this.sistema.ui.mostrarToast("erro", error.message || "Não foi possível encerrar o pedido.");
    }
  }

  async aprovarPedido(pedidoId) {
    try {
      const { data: pedido, error: pedidoError } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, status_aprovacao, valor_total")
        .eq("id", pedidoId)
        .single();
      if (pedidoError) throw pedidoError;
      if (!pedido) {
        this.sistema.ui.mostrarToast("erro", "Pedido não encontrado.");
        return;
      }
      if (pedido.status_aprovacao === "APROVADO") {
        this.sistema.ui.mostrarToast("aviso", "Pedido já foi aprovado.");
        return;
      }
      const confirmado = await this.sistema.confirmar(
        `Aprovar pedido ${pedido.numero_pedido}?\n\nA aprovação será processada de forma atômica e descontará o saldo dos itens da ata.`,
      );
      if (!confirmado) return;

      const { error } = await supabase.rpc("compras_aprovar_pedido", {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;

      this.sistema.ui.mostrarToast(
        "sucesso",
        "Pedido aprovado e saldo descontado com segurança!",
      );
      await this.carregarPedidos();
      if (this.sistema.consulta) {
        await this.sistema.consulta.carregarConteudo();
      }
    } catch (error) {
      console.error("Erro ao aprovar pedido:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        error.message || "Não foi possível aprovar o pedido.",
      );
    }
  }

}

if (typeof window !== "undefined") {
  window.fecharModalMotivoRejeicao = function () {
    const modal = document.getElementById("modalMotivoRejeicao");
    if (modal) modal.classList.remove("active");
    const textarea = document.getElementById("motivoRejeicao");
    if (textarea) textarea.value = "";
    const charCount = document.getElementById("charCount");
    if (charCount) {
      charCount.textContent = "0";
      charCount.className = "count";
    }
    const btn = document.getElementById("btnConfirmarRejeicao");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML =
        '<i class="fas fa-exclamation-triangle"></i> Rejeitar Pedido';
    }
  };

  window.fecharModalVisualizarMotivo = function () {
    const modal = document.getElementById("modalVisualizarMotivo");
    if (modal) modal.classList.remove("active");
  };

  window.confirmarRejeicao = async function () {
    const textarea = document.getElementById("motivoRejeicao");
    const justificativa = textarea?.value?.trim();

    if (!justificativa) {
      alert("Por favor, informe o motivo da rejeição.");
      textarea?.focus();
      return;
    }

    if (justificativa.length < 10) {
      alert("O motivo deve ter pelo menos 10 caracteres.");
      textarea?.focus();
      return;
    }

    const btn = document.getElementById("btnConfirmarRejeicao");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }

    try {
      const pedidoId = window._pedidoRejeicaoId;
      if (!pedidoId) {
        alert("Erro: Pedido não identificado.");
        return;
      }

      const sistema = window.sistema;
      if (!sistema || !sistema.usuarioAtual) {
        alert("Erro: Usuário não autenticado.");
        return;
      }

      const { error } = await supabase.rpc("compras_rejeitar_pedido", {
        p_pedido_id: pedidoId,
        p_justificativa: justificativa,
      });

      if (error) throw error;

      window.fecharModalMotivoRejeicao();

      if (sistema && sistema.pedidos) {
        await sistema.pedidos.carregarPedidos();
      }

      if (sistema && sistema.ui) {
        sistema.ui.mostrarToast(
          "sucesso",
          "Pedido rejeitado",
          "O pedido foi rejeitado com sucesso.",
        );
      } else {
        alert("Pedido rejeitado com sucesso!");
      }
    } catch (error) {
      alert("Erro ao rejeitar pedido: " + error.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML =
          '<i class="fas fa-exclamation-triangle"></i> Rejeitar Pedido';
      }
    }
  };
}
