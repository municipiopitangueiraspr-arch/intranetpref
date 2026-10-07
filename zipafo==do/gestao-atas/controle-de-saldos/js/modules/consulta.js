import { supabase } from "../supabase.js";

export class Consulta {
  constructor(sistema) {
    this.sistema = sistema;
    this.fornecedoresCache = [];
    this.categoriasCache = [];
    this.filtrosAtivos = {
      fornecedor: null,
      vencimento: "todos",
      valorMin: null,
      valorMax: null,
      saldo: [],
      ordenacao: "vencimento_asc",
    };
    // Cache para evitar múltiplas requisições
    this._atasCache = [];
    this._ultimaBusca = null;
    this._favoritasIds = new Set();
    this._mostrarTodas = false;
    this._carregandoInicial = false;
    // Termo de busca atual (para destacar nos resultados)
    this._termoBuscaAtual = "";
    // Controla quais cards estão com o bloco de itens expandido
    // Set de IDs de atas (ex: "78-2025" ou o id numérico) que estão expandidas
    this._atasExpandidas = new Set();
    // Limite de caracteres para o resumo da descrição
    // Se a descrição for maior que isso, aplica corte inteligente
    this.LIMITE_DESCRICAO_RESUMO = 120;

    // ============================================================
    // ✅ NOVO · ESTADO DO MODAL INLINE DE DETALHES
    // ------------------------------------------------------------
    // Guarda a ata que está aberta no modal no momento, para que
    // os handlers de adicionar/remover item possam consultá-la.
    //
    // Também guarda a lista de itens da ata atualmente renderizada
    // no modal (para re-render rápido sem refetch).
    // ============================================================
    this._ataModalAberta = null;
    this._itensModalAberta = [];

    // ============================================================
    // ✅ NOVO · FILTRO ATIVO (card do topo selecionado)
    // ------------------------------------------------------------
    // Guarda qual dos 5 cards de resumo rápido está ativo:
    //   · "total"    → nenhum filtro de vigência
    //   · "venc_30"  → vencendo em até 30 dias
    //   · "venc_60"  → vencendo em até 60 dias
    //   · "venc_90"  → vencendo em até 90 dias
    //   · "alertas"  → atas já vencidas
    //   · null       → nenhum card ativo
    // ============================================================
    this._cardAtivo = null;

    // ============================================================
    // ✅ NOVO · UNIDADES QUE ACEITAM DECIMAIS
    // ------------------------------------------------------------
    // Quando o item tem unidade_medida em uma dessas, o input
    // inline de quantidade aceita casas decimais (step=0.001)
    // e o parser usa vírgula OU ponto como separador decimal.
    // ============================================================
    this.UNIDADES_DECIMAIS = new Set([
      "KG",
      "G",
      "MG",
      "L",
      "ML",
      "M",
      "CM",
      "MM",
      "M2",
      "M3",
      "LT",
      "KILO",
      "LITRO",
      "METRO",
    ]);

    // Precisão (casas decimais) por unidade. Default: 0 (inteiro)
    this.PRECISAO_POR_UNIDADE = {
      KG: 3,
      G: 3,
      MG: 3,
      L: 3,
      ML: 3,
      M: 3,
      CM: 2,
      MM: 2,
      M2: 3,
      M3: 3,
      LT: 3,
      KILO: 3,
      LITRO: 3,
      METRO: 3,
    };

    // ============================================================
    // ✅ NOVO · TERMO DE BUSCA NO MODAL DE DETALHES
    // ------------------------------------------------------------
    // Guarda o termo digitado no campo de busca do modal, para
    // filtrar as linhas da tabela de itens sem refetch.
    // ============================================================
    this._termoBuscaModal = "";
    this._autocompleteDocumentListenerConfigurado = false;
  }

  // ============================================================
  // CARREGAR CONTEÚDO DA CONSULTA
  // ============================================================
  async carregarConteudo() {
    const container = document.getElementById("consultaContent");
    if (!container) return;

    this.sistema.ui.mostrarSpinner("consultaContent", "Carregando atas...");
    const html = await this.gerarHTMLConsultas();
    container.innerHTML = html;
    await this.carregarFiltros();
    this.configurarEventos();

    // ============================================================
    // Aplica filtro vindo do dashboard (drill-down)
    // Se não houver filtro, apenas segue o fluxo normal
    // ============================================================
    this.aplicarFiltroExterno();

    // ============================================================
    // Aplica modo compra (vindo da aba Pedidos · Onda 1)
    // Se o usuário clicou em "Novo Pedido" lá, ativamos aqui
    // o filtro de status = ATIVA e mostramos um toast guia.
    // ============================================================
    this.aplicarModoCompra();
    await this.carregarFavoritas();
    this._mostrarTodas = false;
    this._carregandoInicial = true;

    // ============================================================
    // ✅ NOVO · Reset do card ativo ao (re)carregar a view
    // ============================================================
    this._cardAtivo = null;

    await this.filtrarAtas();
    this._carregandoInicial = false;
  }

  // ============================================================
  // APLICAR MODO COMPRA (vindo da aba Pedidos)
  // ------------------------------------------------------------
  // Quando o usuário clica em "[+ Novo Pedido]" na aba Pedidos,
  // o pedidos.js salva em sessionStorage a chave
  // `consulta_modo_compra` com um objeto:
  //   { origem: "pedidos", timestamp: <epoch ms> }
  //
  // Aqui lemos essa flag, aplicamos alguns ajustes na UI:
  //   1. Força o filtro de status para ATIVA (só atas vigentes)
  //   2. Rola a página para o topo dos filtros
  //   3. Mostra um toast explicativo do modo compra
  //
  // A flag é consumida (removida) para não persistir em F5.
  // Também ignoramos flags antigas (> 30s), para o caso do
  // usuário ter saído da página sem consumir.
  // ============================================================
  aplicarModoCompra() {
    let bruto = null;
    try {
      bruto = sessionStorage.getItem("consulta_modo_compra");
      if (!bruto) return;
      sessionStorage.removeItem("consulta_modo_compra");
    } catch (e) {
      console.warn("Erro ao ler flag de modo compra:", e);
      return;
    }

    let flag = null;
    try {
      flag = JSON.parse(bruto);
    } catch (e) {
      console.warn("Flag de modo compra inválida:", bruto);
      return;
    }

    if (!flag || typeof flag !== "object") return;

    // Ignora flags antigas (> 30 segundos) para não ativar
    // o modo compra depois de o usuário ter saído e voltado
    const agora = Date.now();
    const idade = agora - (flag.timestamp || 0);
    if (idade > 30 * 1000) return;

    // ---------- 1. Preserva as favoritas sem impor um status ----------
    // O modo Novo Pedido deve abrir as atas favoritas do usuário.
    // Não forçamos ATIVA, pois uma favorita pode estar como PROXIMA.
    const selectStatus = document.getElementById("filtroStatus");
    if (selectStatus) {
      selectStatus.value = "todos";
    }

    // ---------- 2. Rola para o topo (filtros ficam visíveis) ----------
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      // alguns navegadores antigos não suportam smooth — ignora
    }

    // ---------- 3. Toast informativo ----------
    setTimeout(() => {
      this.sistema.ui.mostrarToast(
        "info",
        "Modo compra ativo",
        "Mostrando suas atas favoritas. Clique em uma ata para adicionar itens ao carrinho.",
        5500,
      );
    }, 400);
  }

  // ============================================================
  // APLICAR FILTRO EXTERNO (drill-down do dashboard)
  // ------------------------------------------------------------
  // O dashboard salva em sessionStorage um objeto:
  //   { status, categoria, fornecedor, tipo }
  // e navega para cá. Este método lê, aplica nos campos e limpa.
  // ============================================================
  aplicarFiltroExterno() {
    let bruto = null;
    try {
      bruto = sessionStorage.getItem("consulta_filtro_externo");
      if (!bruto) return;
      sessionStorage.removeItem("consulta_filtro_externo");
    } catch (e) {
      console.warn("Erro ao ler filtro externo:", e);
      return;
    }

    let filtro = null;
    try {
      filtro = JSON.parse(bruto);
    } catch (e) {
      console.warn("Filtro externo inválido:", bruto);
      return;
    }

    if (!filtro || typeof filtro !== "object") return;

    // ---------- Status ----------
    if (filtro.status) {
      const el = document.getElementById("filtroStatus");
      if (el) {
        // Só aplica se o valor existir no select
        const opcaoExiste = Array.from(el.options).some(
          (o) => o.value === filtro.status,
        );
        if (opcaoExiste) el.value = filtro.status;
      }
    }

    // ---------- Categoria (agora usa o select dedicado) ----------
    if (filtro.categoria) {
      const selectCat = document.getElementById("filtroCategoria");
      if (selectCat) {
        // Tenta encontrar a opção com esse nome (case-insensitive)
        const alvo = String(filtro.categoria).trim().toLowerCase();
        const opcao = Array.from(selectCat.options).find(
          (o) => o.value.toLowerCase() === alvo,
        );
        if (opcao) {
          selectCat.value = opcao.value;
        } else {
          // Fallback: usa o campo de busca unificada
          const el = document.getElementById("buscaInput");
          if (el) el.value = filtro.categoria;
        }
      } else {
        const el = document.getElementById("buscaInput");
        if (el) el.value = filtro.categoria;
      }
    }

    // ---------- Fornecedor (id) ----------
    if (filtro.fornecedor) {
      const hiddenId = document.getElementById("fornecedorId");
      const inputNome = document.getElementById("fornecedorInput");
      if (hiddenId) hiddenId.value = String(filtro.fornecedor);

      // Se já temos o cache de fornecedores, preenche o nome visível
      if (inputNome && this.fornecedoresCache?.length) {
        const f = this.fornecedoresCache.find(
          (x) => x.id === parseInt(filtro.fornecedor),
        );
        if (f) inputNome.value = f.razao_social;
      }
    }

    // ---------- Tipo especial: "críticos" (saldo baixo) ----------
    if (filtro.tipo === "criticos") {
      const cb = document.getElementById("saldoBaixo");
      if (cb) cb.checked = true;
    }

    // Feedback visual ao usuário
    const algumFiltroAplicado =
      filtro.status || filtro.categoria || filtro.fornecedor || filtro.tipo;

    if (algumFiltroAplicado) {
      setTimeout(() => {
        this.sistema.ui.mostrarToast(
          "info",
          "Filtro aplicado",
          "A consulta foi ajustada com base no dashboard.",
          3000,
        );
      }, 400);
    }
  }

  // ============================================================
  // GERAR HTML DA CONSULTA - COM NOVOS FILTROS
  // ============================================================
  async gerarHTMLConsultas() {
    return `
      <div class="filtros-container">
        <!-- ============================================================ -->
        <!-- RESULTADOS RÁPIDOS - CARD CLICÁVEIS                          -->
        <!-- ------------------------------------------------------------ -->
        <!-- ✅ ATUALIZADO · Os cards de resumo agora são <button> com    -->
        <!-- data-filtro="..." para aplicar filtros ao clicar:            -->
        <!--                                                              -->
        <!--   · Total     → limpa filtro de vigência (mostra tudo)       -->
        <!--   · 30 dias   → aplica "vencendo em até 30 dias"             -->
        <!--   · 60 dias   → aplica "vencendo em até 60 dias"             -->
        <!--   · 90 dias   → aplica "vencendo em até 90 dias"             -->
        <!--   · Alertas   → aplica "já vencidas"                         -->
        <!--                                                              -->
        <!-- O consulta.js lê o data-filtro, sincroniza o select          -->
        <!-- #filtroVencimentoModo + #filtroVencimentoDias, marca o card  -->
        <!-- como .ativo e chama filtrarAtas().                            -->
        <!-- ============================================================ -->
        <div class="resumo-rapido" id="resumoRapido">
          <button
            type="button"
            class="resumo-card"
            data-filtro="total"
            title="Mostrar todas as atas"
          >
            <span class="resumo-numero" id="totalAtas">0</span>
            <span class="resumo-label">Total</span>
          </button>

          <button
            type="button"
            class="resumo-card resumo-vencimento-30"
            data-filtro="venc_30"
            title="Atas que vencem em até 30 dias"
          >
            <span class="resumo-numero" id="vencimento30">0</span>
            <span class="resumo-label">30 dias</span>
          </button>

          <button
            type="button"
            class="resumo-card resumo-vencimento-60"
            data-filtro="venc_60"
            title="Atas que vencem em até 60 dias"
          >
            <span class="resumo-numero" id="vencimento60">0</span>
            <span class="resumo-label">60 dias</span>
          </button>

          <button
            type="button"
            class="resumo-card resumo-vencimento-90"
            data-filtro="venc_90"
            title="Atas que vencem em até 90 dias"
          >
            <span class="resumo-numero" id="vencimento90">0</span>
            <span class="resumo-label">90 dias</span>
          </button>

          <button
            type="button"
            class="resumo-card resumo-alertas"
            data-filtro="alertas"
            title="Atas que já venceram"
          >
            <span class="resumo-numero" id="totalAlertas">0</span>
            <span class="resumo-label">Alertas</span>
          </button>
        </div>

        <!-- ============================================================ -->
        <!-- FILTROS                                                        -->
        <!-- ============================================================ -->
        <div class="filtros-grid">
          <div class="filtro-grupo" style="grid-column: span 2;">
            <label class="filtro-label"><i class="fas fa-search"></i> Busca Global</label>
            <input
              type="text"
              id="buscaInput"
              class="filtro-input"
              placeholder="Busque por nº da ata, pregão, processo, objeto, fornecedor, CPF/CNPJ, categoria ou item..."
              autocomplete="off"
            >
          </div>
          <div class="filtro-grupo">
            <label class="filtro-label"><i class="fas fa-building"></i> Fornecedor</label>
            <div class="autocomplete-container" id="autocompleteContainer">
              <input type="text" id="fornecedorInput" class="filtro-input autocomplete-input"
                     placeholder="Digite o nome ou CPF/CNPJ..." autocomplete="off">
              <input type="hidden" id="fornecedorId" value="">
              <div class="autocomplete-dropdown" id="autocompleteDropdown"></div>
            </div>
          </div>
          <div class="filtro-grupo">
            <label class="filtro-label"><i class="fas fa-university"></i> Órgão</label>
            <select id="filtroOrgao" class="filtro-select">
              <option value="todos">Todos</option>
            </select>
          </div>
          <div class="filtro-grupo">
            <label class="filtro-label"><i class="fas fa-tag"></i> Status</label>
            <select id="filtroStatus" class="filtro-select">
              <option value="todos">Todos</option>
              <option value="ATIVA">Ativa</option>
              <option value="PROXIMA">Próxima</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </div>
          <div class="filtro-grupo">
            <label class="filtro-label"><i class="fas fa-layer-group"></i> Categoria</label>
            <select id="filtroCategoria" class="filtro-select">
              <option value="todos">Todas as categorias</option>
            </select>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- FILTROS AVANÇADOS - COMPACTADO                               -->
        <!-- ============================================================ -->
        <div class="filtros-avancados">
          <div class="filtros-avancados-row">
            <!-- ==================================================== -->
            <!-- FILTRO DE VIGÊNCIA INTELIGENTE                       -->
            <!-- ==================================================== -->
            <div class="filtro-grupo filtro-vencimento">
              <label class="filtro-label"><i class="fas fa-clock"></i> Vigência</label>
              <div class="filtro-vencimento-bloco">
                <select id="filtroVencimentoModo" class="filtro-select">
                  <option value="todos">Todas as vigências</option>
                  <option value="vigentes_hoje">Vigentes hoje</option>
                  <option value="vencendo_em">Vencendo em até X dias</option>
                  <option value="vencidas">Já vencidas</option>
                  <option value="nao_iniciadas">Não iniciadas</option>
                </select>
                <input
                  type="number"
                  id="filtroVencimentoDias"
                  class="filtro-input filtro-vencimento-dias"
                  placeholder="X dias"
                  min="1"
                  max="9999"
                  value="30"
                  style="display: none;"
                >
              </div>
            </div>
            <div class="filtro-grupo filtro-valor">
              <label class="filtro-label"><i class="fas fa-coins"></i> Valor</label>
              <div class="filtro-valor-inputs">
                <input type="number" id="valorMin" class="filtro-input" placeholder="R$ 0,00" min="0" step="0.01">
                <span class="filtro-valor-separador">até</span>
                <input type="number" id="valorMax" class="filtro-input" placeholder="R$ 1.000.000" min="0" step="0.01">
              </div>
            </div>
            <div class="filtro-grupo filtro-ordenacao">
              <label class="filtro-label"><i class="fas fa-sort"></i> Ordenar por</label>
              <select id="filtroOrdenacao" class="filtro-select">
                <option value="vencimento_asc">Vencimento (mais próximo)</option>
                <option value="vencimento_desc">Vencimento (mais distante)</option>
                <option value="valor_desc">Maior valor</option>
                <option value="valor_asc">Menor valor</option>
                <option value="numero_asc">Nº da Ata (crescente)</option>
                <option value="numero_desc">Nº da Ata (decrescente)</option>
                <option value="fornecedor_asc">Fornecedor (A-Z)</option>
                <option value="fornecedor_desc">Fornecedor (Z-A)</option>
                <option value="cadastro_desc">Cadastro (mais recentes)</option>
                <option value="cadastro_asc">Cadastro (mais antigas)</option>
                <option value="saldo_desc">Maior saldo</option>
                <option value="saldo_asc">Menor saldo</option>
              </select>
            </div>
          </div>
          <div class="filtros-avancados-row">
            <div class="filtro-grupo filtro-saldo">
              <label class="filtro-label"><i class="fas fa-wallet"></i> Saldo</label>
              <div class="filtro-saldo-checkboxes">
                <label class="checkbox-label">
                  <input type="checkbox" id="saldoDisponivel" value="disponivel">
                  <span>Com saldo</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" id="saldoBaixo" value="baixo">
                  <span>Saldo baixo (&lt; 10%)</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" id="saldoZerado" value="zerado">
                  <span>Saldo zerado</span>
                </label>
              </div>
            </div>
            <div class="filtro-grupo filtro-actions">
              <button class="btn-aplicar" id="btnAplicarFiltros"><i class="fas fa-filter"></i> Aplicar</button>
              <button class="btn-limpar" id="btnLimparFiltros"><i class="fas fa-eraser"></i> Limpar</button>
              <button class="btn-exportar" id="btnExportarResultados"><i class="fas fa-download"></i> Exportar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- CONTADOR DE RESULTADOS                                        -->
      <!-- ============================================================ -->
      <div class="consulta-contador" id="consultaContador">
        <span id="consultaContadorTexto">Carregando...</span>
        <div class="consulta-filtro-favoritas" id="consultaFiltroFavoritas" role="group" aria-label="Filtro de atas favoritas">
          <button type="button" class="btn-filtro-favoritas" data-favoritas-modo="favoritas"><i class="fas fa-star"></i> Minhas favoritas <span id="qtdAtasFavoritas">0</span></button>
          <button type="button" class="btn-filtro-favoritas" data-favoritas-modo="todas"><i class="fas fa-list"></i> Mostrar todas</button>
        </div>
      </div>

      <div id="atasLista" class="atas-grid"></div>
    `;
  }

  // ============================================================
  // CARREGAR FILTROS (Fornecedores + Órgãos + Categorias)
  // ============================================================
  async carregarFiltros() {
    // Carregar fornecedores para autocomplete
    const { data: fornecedores } = await supabase
      .from("fornecedores")
      .select("id, razao_social, cnpj")
      .order("razao_social");
    this.fornecedoresCache = fornecedores || [];

    // Carregar categorias para o novo select
    const { data: categorias } = await supabase
      .from("categorias")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    this.categoriasCache = categorias || [];

    // Popular select de categorias
    const selectCategoria = document.getElementById("filtroCategoria");
    if (selectCategoria) {
      selectCategoria.innerHTML =
        '<option value="todos">Todas as categorias</option>';
      this.categoriasCache.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.nome;
        opt.textContent = cat.nome;
        selectCategoria.appendChild(opt);
      });
    }

    // Carregar órgãos
    await this.sistema.ui.carregarSelectOrgaos("filtroOrgao");

    // Configurar autocomplete
    this.configurarAutocomplete();

    // Configurar evento de limpeza do campo de fornecedor
    this.configurarLimpezaFornecedor();

    // Configurar toggle do campo "X dias" do filtro de vigência
    this.configurarToggleVencimentoDias();
  }

  // ============================================================
  // CONFIGURAR TOGGLE DO CAMPO "X DIAS" (VIGÊNCIA)
  // ============================================================
  configurarToggleVencimentoDias() {
    const selectModo = document.getElementById("filtroVencimentoModo");
    const inputDias = document.getElementById("filtroVencimentoDias");
    if (!selectModo || !inputDias) return;

    const atualizarVisibilidade = () => {
      if (selectModo.value === "vencendo_em") {
        inputDias.style.display = "block";
      } else {
        inputDias.style.display = "none";
      }
    };

    selectModo.addEventListener("change", atualizarVisibilidade);
    atualizarVisibilidade();
  }

  // ============================================================
  // CONFIGURAR AUTOCOMPLETE
  // ============================================================
  configurarAutocomplete() {
    const input = document.getElementById("fornecedorInput");
    const dropdown = document.getElementById("autocompleteDropdown");
    const hiddenId = document.getElementById("fornecedorId");

    if (!input || !dropdown) return;

    let debounceTimer;

    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value.toLowerCase().trim();

      if (value.length === 0) {
        dropdown.classList.remove("open");
        hiddenId.value = "";
        // Disparar filtro ao limpar o campo
        this.debounceFiltrarAtas();
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
                this.filtrarAtas();
              });
            });
        }
        dropdown.classList.add("open");
      }, 300);
    });

    // Fechar dropdown ao clicar fora. Como a view é reconstruída ao navegar,
    // o listener global precisa ser registrado uma única vez.
    if (!this._autocompleteDocumentListenerConfigurado) {
      this._autocompleteDocumentListenerConfigurado = true;
      document.addEventListener("click", (e) => {
        if (e.target.closest(".autocomplete-container")) return;
        document
          .getElementById("autocompleteDropdown")
          ?.classList.remove("open");
      });
    }

    // Fechar dropdown com ESC
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        dropdown.classList.remove("open");
        input.blur();
      }
      // Enter para confirmar seleção
      if (e.key === "Enter" && dropdown.classList.contains("open")) {
        const firstItem = dropdown.querySelector(
          ".autocomplete-item:not(.disabled)",
        );
        if (firstItem) {
          firstItem.click();
        }
      }
    });

    // Navegação por teclado (setas)
    input.addEventListener("keydown", (e) => {
      if (!dropdown.classList.contains("open")) return;

      const items = dropdown.querySelectorAll(
        ".autocomplete-item:not(.disabled)",
      );
      if (items.length === 0) return;

      let currentIndex = -1;
      items.forEach((item, index) => {
        if (item.classList.contains("active")) {
          currentIndex = index;
          item.classList.remove("active");
        }
      });

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex].classList.add("active");
        items[nextIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex].classList.add("active");
        items[prevIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        const activeItem = dropdown.querySelector(".autocomplete-item.active");
        if (activeItem) {
          activeItem.click();
        }
      }
    });
  }

  // ============================================================
  // CONFIGURAR LIMPEZA DO CAMPO DE FORNECEDOR
  // ============================================================
  configurarLimpezaFornecedor() {
    const input = document.getElementById("fornecedorInput");
    const hiddenId = document.getElementById("fornecedorId");

    if (!input) return;

    // Ao perder o foco, se o campo estiver vazio, limpar o ID
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (input.value.trim() === "") {
          hiddenId.value = "";
        }
      }, 200);
    });
  }

  // ============================================================
  // FORMATAR CPF/CNPJ
  // ============================================================
  formatarCnpj(cnpj) {
    if (!cnpj) return "";
    const limpo = String(cnpj).replace(/\D/g, "");
    if (limpo.length === 11) return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (limpo.length === 14) return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return String(cnpj);
  }

  // ============================================================
  // ✅ NOVO · HELPER · NORMALIZA UNIDADE DE MEDIDA
  // ------------------------------------------------------------
  // Retorna a unidade em maiúsculas e sem espaços, para uso
  // nas comparações com UNIDADES_DECIMAIS.
  // ============================================================
  _normalizarUnidade(unidade) {
    if (!unidade) return "UN";
    return String(unidade).trim().toUpperCase();
  }

  // ============================================================
  // ✅ NOVO · HELPER · VERIFICA SE UNIDADE ACEITA DECIMAIS
  // ============================================================
  _unidadeAceitaDecimais(unidade) {
    return this.UNIDADES_DECIMAIS.has(this._normalizarUnidade(unidade));
  }

  // ============================================================
  // ✅ NOVO · HELPER · RETORNA PRECISÃO (CASAS DECIMAIS)
  // ------------------------------------------------------------
  // Se a unidade aceita decimais, retorna a precisão configurada
  // (default 3). Se não aceita, retorna 0 (inteiro).
  // ============================================================
  _precisaoUnidade(unidade) {
    const u = this._normalizarUnidade(unidade);
    if (!this.UNIDADES_DECIMAIS.has(u)) return 0;
    return this.PRECISAO_POR_UNIDADE[u] ?? 3;
  }

  // ============================================================
  // ✅ NOVO · FORMATAR QUANTIDADE PARA O INPUT
  // ------------------------------------------------------------
  // Recebe um número (ex: 1.5) e uma unidade (ex: "KG") e
  // devolve a string que deve aparecer no <input>.
  //
  // Regras:
  //   · Unidade inteira (UN, CX, PCT...)  → "10"
  //   · Unidade decimal (KG, L, M...)     → "1,5"  (vírgula BR)
  //
  // Usa vírgula como separador decimal (padrão pt-BR) para o
  // input inline e o mini-modal ficarem consistentes.
  // ============================================================
  formatarQtdInput(valor, unidade) {
    if (valor === null || valor === undefined || valor === "") return "";

    const num = typeof valor === "number" ? valor : parseFloat(valor);
    if (isNaN(num)) return "";

    const precisao = this._precisaoUnidade(unidade);

    if (precisao === 0) {
      // Inteiro: arredonda e devolve sem casas decimais
      return String(Math.round(num));
    }

    // Decimal: usa toFixed com a precisão da unidade e troca
    // o ponto pela vírgula (padrão BR)
    let str = num.toFixed(precisao);
    // Remove zeros à direita desnecessários (1,500 → 1,5)
    str = str.replace(/\.?0+$/, "");
    return str.replace(".", ",");
  }

  // ============================================================
  // ✅ NOVO · PARSEAR QUANTIDADE VINDA DO INPUT
  // ------------------------------------------------------------
  // Aceita:
  //   · Número puro        → 10  → 10
  //   · String com vírgula → "1,5"  → 1.5
  //   · String com ponto   → "1.5"  → 1.5
  //   · String vazia       → 0
  //
  // Aplica a precisão da unidade (arredonda KG pra 3 casas,
  // UN para 0 casas, etc).
  //
  // Retorna SEMPRE um número (nunca NaN, nunca null).
  // ============================================================
  parseQtdInput(valor, unidade) {
    if (valor === null || valor === undefined || valor === "") return 0;

    let num;

    if (typeof valor === "number") {
      num = valor;
    } else {
      // String: normaliza separador decimal
      let str = String(valor).trim();
      if (!str) return 0;

      // Remove espaços e pontos de milhar (ex: "1.234,56")
      // Heurística: se tem vírgula, é o separador decimal BR;
      // se só tem ponto e nenhuma vírgula, é US.
      if (str.includes(",")) {
        str = str.replace(/\./g, "").replace(",", ".");
      }
      // Se só tem ponto, assume US (padrão do input number)
      num = parseFloat(str);
    }

    if (isNaN(num) || num < 0) return 0;

    // Aplica precisão da unidade
    const precisao = this._precisaoUnidade(unidade);
    if (precisao === 0) {
      return Math.floor(num);
    }
    // Arredonda para a precisão e remove floating point noise
    return parseFloat(num.toFixed(precisao));
  }

  // ============================================================
  // NORMALIZAR TEXTO (remove acentos, pontuação, caixa)
  // ------------------------------------------------------------
  // Usado para comparar termos de busca e campos de forma
  // tolerante a variações (ex: "78/2025" vs "78-2025" vs "782025")
  // ============================================================
  normalizarTexto(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^a-z0-9]/g, ""); // mantém só letras e números
  }

  // ============================================================
  // NORMALIZAR NÚMERO DE ATA
  // ------------------------------------------------------------
  // Aceita variações como:
  //   "78/2025", "78-2025", "78 2025", "0078/2025", "78"
  // Retorna uma string canônica para comparação.
  // Ex: "78/2025" → "782025"
  // ============================================================
  normalizarNumeroAta(numero) {
    return this.normalizarTexto(numero);
  }

  // ============================================================
  // NORMALIZAR CPF/CNPJ (apenas dígitos)
  // ============================================================
  normalizarCnpj(cnpj) {
    if (!cnpj) return "";
    return String(cnpj).replace(/\D/g, "");
  }

  // ============================================================
  // CONFIGURAR EVENTOS
  // ============================================================
  configurarEventos() {
    // Busca unificada
    const buscaInput = document.getElementById("buscaInput");
    if (buscaInput) {
      buscaInput.addEventListener("keyup", () => this.debounceFiltrarAtas());
    }

    const filtroOrgao = document.getElementById("filtroOrgao");
    if (filtroOrgao) {
      filtroOrgao.addEventListener("change", () => this.debounceFiltrarAtas());
    }

    const filtroStatus = document.getElementById("filtroStatus");
    if (filtroStatus) {
      filtroStatus.addEventListener("change", () => this.debounceFiltrarAtas());
    }

    // Filtro de categoria
    const filtroCategoria = document.getElementById("filtroCategoria");
    if (filtroCategoria) {
      filtroCategoria.addEventListener("change", () =>
        this.debounceFiltrarAtas(),
      );
    }

    // Filtro de vigência (modo + input de dias)
    const filtroVencimentoModo = document.getElementById(
      "filtroVencimentoModo",
    );
    if (filtroVencimentoModo) {
      filtroVencimentoModo.addEventListener("change", () => {
        // ✅ Ao mudar manualmente, limpa o card ativo
        this._cardAtivo = null;
        this.sincronizarCardsAtivos();
        this.debounceFiltrarAtas();
      });
    }

    const filtroVencimentoDias = document.getElementById(
      "filtroVencimentoDias",
    );
    if (filtroVencimentoDias) {
      filtroVencimentoDias.addEventListener("input", () => {
        // ✅ Ao mudar manualmente, limpa o card ativo
        this._cardAtivo = null;
        this.sincronizarCardsAtivos();
        this.debounceFiltrarAtas();
      });
    }

    const filtroOrdenacao = document.getElementById("filtroOrdenacao");
    if (filtroOrdenacao) {
      filtroOrdenacao.addEventListener("change", () =>
        this.debounceFiltrarAtas(),
      );
    }

    const valorMin = document.getElementById("valorMin");
    if (valorMin) {
      valorMin.addEventListener("input", () => this.debounceFiltrarAtas());
    }

    const valorMax = document.getElementById("valorMax");
    if (valorMax) {
      valorMax.addEventListener("input", () => this.debounceFiltrarAtas());
    }

    const btnAplicar = document.getElementById("btnAplicarFiltros");
    if (btnAplicar) {
      btnAplicar.addEventListener("click", () => {
        this._mostrarTodas = true;
        this.atualizarControleFavoritas();
        this.filtrarAtas();
      });
    }

    const btnLimpar = document.getElementById("btnLimparFiltros");
    if (btnLimpar) {
      btnLimpar.addEventListener("click", () => this.limparFiltros());
    }

    const btnExportar = document.getElementById("btnExportarResultados");
    if (btnExportar) {
      btnExportar.addEventListener("click", () => this.exportarResultados());
    }
    document.querySelectorAll("[data-favoritas-modo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._mostrarTodas = btn.dataset.favoritasModo === "todas";
        this.atualizarControleFavoritas();
        this.filtrarAtas();
      });
    });

    // Filtros de saldo
    document
      .querySelectorAll('.filtro-saldo-checkboxes input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", () => {
          // ✅ Ao mudar manualmente, limpa o card ativo
          this._cardAtivo = null;
          this.sincronizarCardsAtivos();
          this.debounceFiltrarAtas();
        });
      });

    // ============================================================
    // ✅ NOVO · CARDS DO RESUMO RÁPIDO · clicáveis
    // ------------------------------------------------------------
    // Cada card tem data-filtro="total" | "venc_30" | "venc_60"
    // | "venc_90" | "alertas". Ao clicar, aplicamos o filtro
    // correspondente no select #filtroVencimentoModo e no input
    // #filtroVencimentoDias (e no checkbox de saldo baixo, para
    // o card de "Alertas"). Depois chamamos filtrarAtas().
    // ============================================================
    const resumoRapido = document.getElementById("resumoRapido");
    if (resumoRapido) {
      resumoRapido.addEventListener("click", (e) => {
        const card = e.target.closest(".resumo-card[data-filtro]");
        if (!card) return;
        e.preventDefault();
        const tipo = card.dataset.filtro;
        if (tipo) this.aplicarFiltroPorCard(tipo);
      });
    }

    // ============================================================
    // DELEGAÇÃO DE EVENTOS · #atasLista
    // ------------------------------------------------------------
    // Um único listener no container trata TODOS os cliques nos
    // cards e botões internos. A ORDEM das verificações importa:
    //
    //   0.a) Botão [+ Adicionar] do bloco de itens correspondentes
    //      → adiciona ao carrinho + re-renderiza o card
    //      → e.stopPropagation() + return (impede que o clique
    //        chegue ao card e dispare "abrir-detalhes")
    //
    //   0.b) ✅ NOVO · Botão [X Remover] do bloco de itens correspondentes
    //      → remove do carrinho + re-renderiza o card
    //      → e.stopPropagation() + return
    //      → SEM ISSO, o clique borbulha até o card e abre o modal
    //
    //   1) Botões internos (ver-todos / recolher-itens)
    //      → e.stopPropagation() + return
    //
    //   2) Card por último (abrir-detalhes)
    //      → só chega aqui se NENHUM botão interno foi clicado
    //
    // Isso elimina a mistura de onclick inline com addEventListener
    // e torna o comportamento determinístico.
    // ============================================================
    const listaAtas = document.getElementById("atasLista");
    if (listaAtas) {
      listaAtas.addEventListener("click", (e) => {
        const btnFavorita = e.target.closest("[data-action='toggle-favorita']");
        if (btnFavorita) {
          e.stopPropagation();
          e.preventDefault();
          this.alternarFavoritaAta(btnFavorita.dataset.ataId);
          return;
        }
        // ----- 0.a) Botão "Adicionar" no bloco de itens correspondentes -----
        const btnAddCarrinho = e.target.closest(
          "[data-action='add-item-carrinho']",
        );
        if (btnAddCarrinho) {
          e.stopPropagation();
          e.preventDefault();
          const itemId = btnAddCarrinho.dataset.itemId;
          const ataId = btnAddCarrinho.dataset.ataId;
          if (itemId && ataId) {
            this.adicionarItemAoCarrinhoInline(ataId, itemId);
          }
          return;
        }

        // ----- 0.b) ✅ CORRIGIDO · Botão "Remover" no bloco de itens correspondentes -----
        // Sem este handler, o clique borbulha até o .ata-card (que tem
        // data-action='abrir-detalhes') e abre o modal de detalhes.
        // Com stopPropagation, o clique é capturado aqui e NÃO sobe.
        const btnRemCarrinho = e.target.closest(
          "[data-action='rem-item-carrinho']",
        );
        if (btnRemCarrinho) {
          e.stopPropagation();
          e.preventDefault();
          const itemId = btnRemCarrinho.dataset.itemId;
          const ataId = btnRemCarrinho.dataset.ataId;
          if (itemId && ataId) {
            this.removerItemDoCarrinhoInline(ataId, itemId);
          }
          return;
        }

        // ----- 1) Botão "ver todos os itens correspondentes" -----
        const btnVerTodos = e.target.closest("[data-action='ver-todos-itens']");
        if (btnVerTodos) {
          e.stopPropagation();
          e.preventDefault();
          const ataId = btnVerTodos.dataset.ataId;
          if (ataId) {
            this.alternarItensCorrespondentes(ataId);
          }
          return;
        }

        // ----- 2) Botão "recolher itens" -----
        const btnRecolher = e.target.closest("[data-action='recolher-itens']");
        if (btnRecolher) {
          e.stopPropagation();
          e.preventDefault();
          const ataId = btnRecolher.dataset.ataId;
          if (ataId) {
            this.alternarItensCorrespondentes(ataId);
          }
          return;
        }

        // ----- 3) Card inteiro OU botão "Ver Itens" → abrir detalhes -----
        const alvoDetalhes = e.target.closest("[data-action='abrir-detalhes']");
        if (alvoDetalhes) {
          e.stopPropagation();
          e.preventDefault();
          const ataId = alvoDetalhes.dataset.ataId;
          if (ataId) {
            this.abrirDetalhes(ataId);
          }
          return;
        }
      });
    }

    // ============================================================
    // ✅ DELEGAÇÃO DE EVENTOS · #modalConteudo (detalhes inline)
    // ------------------------------------------------------------
    // Aqui tratamos os cliques DENTRO do modal de detalhes da ata:
    //
    //   1) Botões "Adicionar ao carrinho" (por item)
    //      → valida + adiciona + re-renderiza o item com novo estado
    //
    //   2) Botões "Remover do carrinho" (por item já adicionado)
    //      → remove do carrinho + re-renderiza o item
    //
    //   3) ✅ NOVO · Botões "+/-" do input inline de quantidade
    //      → apenas ajustam o valor do input (sem I/O)
    //
    // Usamos delegação porque o modal é re-renderizado várias vezes
    // durante a sessão, e reattachar listeners seria mais custoso.
    // ============================================================
    const modalConteudo = document.getElementById("modalConteudo");
    if (modalConteudo && modalConteudo.dataset.consultaInit !== "1") {
      modalConteudo.dataset.consultaInit = "1";

      modalConteudo.addEventListener("click", (e) => {
        // ----- 1) Botão "Adicionar ao carrinho" -----
        const btnAdd = e.target.closest("[data-action='add-item-carrinho']");
        if (btnAdd) {
          e.preventDefault();
          e.stopPropagation();
          const itemId = btnAdd.dataset.itemId;
          const ataId = btnAdd.dataset.ataId;
          if (itemId && ataId) {
            this.adicionarItemAoCarrinhoInline(ataId, itemId);
          }
          return;
        }

        // ----- 2) Botão "Remover do carrinho" -----
        const btnRem = e.target.closest("[data-action='rem-item-carrinho']");
        if (btnRem) {
          e.preventDefault();
          e.stopPropagation();
          const itemId = btnRem.dataset.itemId;
          const ataId = btnRem.dataset.ataId;
          if (itemId && ataId) {
            this.removerItemDoCarrinhoInline(ataId, itemId);
          }
          return;
        }

        // ----- 3) ✅ NOVO · Botão [-] do input inline -----
        const btnMinus = e.target.closest("[data-action='qtd-inline-minus']");
        if (btnMinus) {
          e.preventDefault();
          e.stopPropagation();
          const itemId = btnMinus.dataset.itemId;
          const input = document.querySelector(
            `[data-qtd-inline-for="${itemId}"]`,
          );
          if (input) {
            const unidade = input.dataset.unidade || "UN";
            const atual = this.parseQtdInput(input.value, unidade);
            const passo = this._unidadeAceitaDecimais(unidade) ? 0.1 : 1;
            const novo = Math.max(0, atual - passo);
            input.value = this.formatarQtdInput(novo, unidade);
          }
          return;
        }

        // ----- 4) ✅ NOVO · Botão [+] do input inline -----
        const btnPlus = e.target.closest("[data-action='qtd-inline-plus']");
        if (btnPlus) {
          e.preventDefault();
          e.stopPropagation();
          const itemId = btnPlus.dataset.itemId;
          const input = document.querySelector(
            `[data-qtd-inline-for="${itemId}"]`,
          );
          if (input) {
            const unidade = input.dataset.unidade || "UN";
            const max = parseFloat(input.dataset.max) || Infinity;
            const atual = this.parseQtdInput(input.value, unidade);
            const passo = this._unidadeAceitaDecimais(unidade) ? 0.1 : 1;
            const novo = Math.min(max, atual + passo);
            input.value = this.formatarQtdInput(novo, unidade);
          }
          return;
        }
      });

      // ============================================================
      // ✅ NOVO · BUSCA DENTRO DO MODAL DE DETALHES
      // ------------------------------------------------------------
      // Input de filtro em tempo real na tabela de itens do modal.
      // Filtra as <tr> do tbody pela descrição + nº do item.
      // ============================================================
      modalConteudo.addEventListener("input", (e) => {
        const inputBusca = e.target.closest("[data-modal-search]");
        if (!inputBusca) return;
        this.filtrarItensModal(inputBusca.value);
      });
    }
  }

  // ============================================================
  // ✅ NOVO · APLICAR FILTRO POR CARD DO RESUMO RÁPIDO
  // ------------------------------------------------------------
  // Chamado ao clicar em um dos 5 cards do topo:
  //
  //   · "total"    → limpa o filtro de vigência
  //   · "venc_30"  → modo = "vencendo_em", dias = 30
  //   · "venc_60"  → modo = "vencendo_em", dias = 60
  //   · "venc_90"  → modo = "vencendo_em", dias = 90
  //   · "alertas"  → modo = "vencidas"
  //
  // Depois atualiza o estado visual dos cards (.ativo) e dispara
  // filtrarAtas().
  // ============================================================
  aplicarFiltroPorCard(tipo) {
    const selectModo = document.getElementById("filtroVencimentoModo");
    const inputDias = document.getElementById("filtroVencimentoDias");
    const cbSaldoBaixo = document.getElementById("saldoBaixo");

    switch (tipo) {
      case "total":
        // Limpa o filtro de vigência e o saldo baixo
        if (selectModo) selectModo.value = "todos";
        if (inputDias) {
          inputDias.value = "30";
          inputDias.style.display = "none";
        }
        if (cbSaldoBaixo) cbSaldoBaixo.checked = false;
        break;

      case "venc_30":
        if (selectModo) selectModo.value = "vencendo_em";
        if (inputDias) {
          inputDias.value = "30";
          inputDias.style.display = "block";
        }
        if (cbSaldoBaixo) cbSaldoBaixo.checked = false;
        break;

      case "venc_60":
        if (selectModo) selectModo.value = "vencendo_em";
        if (inputDias) {
          inputDias.value = "60";
          inputDias.style.display = "block";
        }
        if (cbSaldoBaixo) cbSaldoBaixo.checked = false;
        break;

      case "venc_90":
        if (selectModo) selectModo.value = "vencendo_em";
        if (inputDias) {
          inputDias.value = "90";
          inputDias.style.display = "block";
        }
        if (cbSaldoBaixo) cbSaldoBaixo.checked = false;
        break;

      case "alertas":
        // Alertas representam atas já vencidas.
        if (selectModo) selectModo.value = "vencidas";
        if (inputDias) {
          inputDias.value = "30";
          inputDias.style.display = "none";
        }
        if (cbSaldoBaixo) cbSaldoBaixo.checked = false;
        break;

      default:
        return;
    }

    // Atualiza o estado visual dos cards
    this._cardAtivo = tipo;
    this.sincronizarCardsAtivos();

    // Dispara a filtragem
    this.filtrarAtas();

    // Feedback sutil via toast (só quando for "alertas", que é mais
    // complexo — combina dois filtros)
    if (tipo === "alertas") {
      this.sistema.ui.mostrarToast(
        "info",
        "Filtro de alertas",
        "Mostrando as atas que já venceram.",
        3000,
      );
    }
  }

  // ============================================================
  // ✅ NOVO · SINCRONIZAR CARDS ATIVOS
  // ------------------------------------------------------------
  // Marca o card correspondente a this._cardAtivo como .ativo
  // e desmarca os demais. Chamado em várias situações:
  //   · Ao clicar num card
  //   · Ao trocar manualmente o filtro de vigência (limpa o card)
  //   · Ao trocar filtros de saldo (limpa o card)
  //   · Ao limpar todos os filtros (limpa o card)
  // ============================================================
  sincronizarCardsAtivos() {
    const cards = document.querySelectorAll(".resumo-card[data-filtro]");
    cards.forEach((card) => {
      const isAtivo = card.dataset.filtro === this._cardAtivo;
      card.classList.toggle("ativo", isAtivo);
    });
  }

  // ============================================================
  // ALTERNAR EXPANSÃO DOS ITENS CORRESPONDENTES
  // ------------------------------------------------------------
  // Quando o usuário clica em "ver todos" ou "recolher", este
  // método atualiza o Set de atas expandidas e re-renderiza
  // apenas o card específico (mais performático que re-renderizar
  // toda a lista).
  // ============================================================
  alternarItensCorrespondentes(ataId) {
    const idStr = String(ataId);
    if (this._atasExpandidas.has(idStr)) {
      this._atasExpandidas.delete(idStr);
    } else {
      this._atasExpandidas.add(idStr);
    }

    // Re-renderiza apenas o card específico
    const card = document.querySelector(`.ata-card[data-ata-id="${idStr}"]`);
    if (!card) return;

    // Encontra a ata no cache para re-renderizar
    const ata = (this._atasCache || []).find((a) => String(a.id) === idStr);
    if (!ata) return;

    // Substitui o HTML do card
    const novoHtml = this.renderCardAta(ata);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = novoHtml.trim();
    const novoCard = wrapper.firstElementChild;
    if (novoCard) {
      card.replaceWith(novoCard);
    }
  }

  // ============================================================
  // DEBOUNCE PARA FILTRAR ATAS
  // ============================================================
  debounceFiltrarAtas() {
    if (!this._carregandoInicial) this._mostrarTodas = true;
    this.atualizarControleFavoritas();
    clearTimeout(this.sistema.filtroTimer);
    this.sistema.filtroTimer = setTimeout(() => this.filtrarAtas(), 400);
  }

  // ============================================================
  // FILTRAR ATAS - PRINCIPAL (COM BUSCA UNIFICADA)
  // ============================================================
  async carregarFavoritas() {
    this._favoritasIds = new Set();
    const usuarioId = this.sistema.usuarioAtual?.id;
    if (!usuarioId) {
      this.atualizarControleFavoritas();
      return;
    }
    const { data, error } = await supabase
      .from("atas_favoritas")
      .select("ata_id")
      .eq("usuario_id", usuarioId);
    if (error) {
      console.warn(
        "Favoritas indisponíveis. Execute o SQL da tabela atas_favoritas no Supabase:",
        error.message,
      );
      this.atualizarControleFavoritas();
      return;
    }
    (data || []).forEach((row) => this._favoritasIds.add(String(row.ata_id)));
    this.atualizarControleFavoritas();
  }
  atualizarControleFavoritas() {
    const grupo = document.getElementById("consultaFiltroFavoritas");
    if (!grupo) return;
    const qtd = document.getElementById("qtdAtasFavoritas");
    if (qtd) qtd.textContent = this._favoritasIds.size;
    grupo.querySelectorAll("[data-favoritas-modo]").forEach((btn) => {
      const modo = btn.dataset.favoritasModo;
      btn.classList.toggle("ativo", (modo === "todas") === this._mostrarTodas);
      btn.disabled = modo === "favoritas" && this._favoritasIds.size === 0;
    });
  }
  async alternarFavoritaAta(ataId) {
    const usuarioId = this.sistema.usuarioAtual?.id;
    if (!usuarioId || !ataId)
      return this.sistema.ui.mostrarToast(
        "erro",
        "Não foi possível identificar o usuário ou a ATA.",
      );
    const id = String(ataId);
    const favorita = this._favoritasIds.has(id);
    // Favoritar é uma ação explícita: preserve a lista atual para que o usuário
    // continue encontrando outras atas, sem mudar automaticamente para “favoritas”.
    if (!favorita) this._mostrarTodas = true;
    try {
      if (favorita) {
        const { error } = await supabase
          .from("atas_favoritas")
          .delete()
          .eq("usuario_id", usuarioId)
          .eq("ata_id", ataId);
        if (error) throw error;
        this._favoritasIds.delete(id);
        this.sistema.ui.mostrarToast("sucesso", "ATA removida das favoritas.");
      } else {
        const { error } = await supabase
          .from("atas_favoritas")
          .insert({ usuario_id: usuarioId, ata_id: ataId });
        if (error) throw error;
        this._favoritasIds.add(id);
        this.sistema.ui.mostrarToast("sucesso", "ATA adicionada às favoritas.");
      }
      this.atualizarControleFavoritas();
      await this.filtrarAtas();
    } catch (error) {
      console.error("Erro ao alterar favorita:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        "Não foi possível alterar a favorita. Verifique se a tabela atas_favoritas foi criada.",
      );
    }
  }
  async filtrarAtas() {
    const container = document.getElementById("atasLista");
    if (!container) return;

    container.innerHTML =
      '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando atas...</div>';

    let query = supabase
      .from("atas")
      .select(
        "*, fornecedor:fornecedores(razao_social,cnpj), itens:itens_ata(*), categoria:categorias(id,nome)",
      );

    // Filtro de status
    const statusFiltro = document.getElementById("filtroStatus")?.value;
    if (statusFiltro && statusFiltro !== "todos") {
      query = query.eq("situacao", statusFiltro);
    }
    // Mantemos vencidas carregadas para que o card Alertas possa filtrá-las.

    const { data: atas } = await query.order("data_inicio_vigencia", {
      ascending: false,
    });

    const atasBase = atas || [];
    const vencimentoModoInicial =
      document.getElementById("filtroVencimentoModo")?.value || "todos";
    let atasFiltradas = atasBase;
    if (statusFiltro === "todos" && vencimentoModoInicial !== "vencidas") {
      atasFiltradas = atasFiltradas.filter((a) => a.situacao !== "VENCIDA");
    }
    this._atasCache = atasBase;
    if (!this._mostrarTodas && this._favoritasIds.size > 0) {
      atasFiltradas = atasFiltradas.filter((ata) =>
        this._favoritasIds.has(String(ata.id)),
      );
    }

    // ============================================================
    // FILTRO DE FORNECEDOR VIA AUTOCOMPLETE (ID)
    // ============================================================
    const fornecedorId = document.getElementById("fornecedorId")?.value;
    if (fornecedorId) {
      atasFiltradas = atasFiltradas.filter(
        (a) => a.fornecedor_id === parseInt(fornecedorId),
      );
    }

    // Filtro de órgão (placeholder - sem relação direta)
    const orgaoFiltro = document.getElementById("filtroOrgao")?.value;
    if (orgaoFiltro && orgaoFiltro !== "todos") {
      console.log("Filtro por órgão:", orgaoFiltro);
    }

    // ============================================================
    // FILTRO DE CATEGORIA
    // ============================================================
    const categoriaFiltro =
      document.getElementById("filtroCategoria")?.value || "todos";
    if (categoriaFiltro !== "todos") {
      const alvo = categoriaFiltro.trim().toLowerCase();
      atasFiltradas = atasFiltradas.filter((a) => {
        const nomeCat = (a.categoria?.nome || "").trim().toLowerCase();
        return nomeCat === alvo;
      });
    }

    // ============================================================
    // BUSCA UNIFICADA
    // ------------------------------------------------------------
    // Busca em: número da ata, número do pregão, processo,
    // objeto, fornecedor (razão), CPF/CNPJ, categoria e descrição
    // dos itens. Aceita múltiplos termos (todos devem bater).
    // Normaliza o termo e os campos para ignorar acentos e
    // pontuação (ex: "78/2025" bate com "78-2025").
    // ============================================================
    const buscaRaw = document.getElementById("buscaInput")?.value || "";
    const busca = buscaRaw.trim();

    // Guarda o termo para destaque nos resultados
    this._termoBuscaAtual = busca;

    if (busca) {
      // Divide em termos (por espaço) e normaliza cada um
      const termos = busca
        .split(/\s+/)
        .map((t) => this.normalizarTexto(t))
        .filter((t) => t.length > 0);

      // Também gera uma versão "somente números" do termo inteiro
      // para o caso de o usuário digitar "78/2025" e querermos
      // comparar com "782025"
      const buscaNumeros = busca.replace(/\D/g, "");

      atasFiltradas = atasFiltradas.filter((a) => {
        // ---------- Constrói "texto pesquisável" da ata ----------
        const numeroAtaNorm = this.normalizarNumeroAta(a.numero_ata);
        const numeroPregaoNorm = this.normalizarTexto(
          a.numero_pregao || a.pregao_numero || "",
        );
        const processoNorm = this.normalizarTexto(
          a.processo_administrativo || "",
        );
        const objetoNorm = this.normalizarTexto(a.objeto || "");
        const fornecedorNorm = this.normalizarTexto(
          a.fornecedor?.razao_social || "",
        );
        const cnpjNorm = this.normalizarCnpj(a.fornecedor?.cnpj || "");
        const categoriaNorm = this.normalizarTexto(a.categoria?.nome || "");

        // Itens: concatena descrições
        const itensTexto = (a.itens || [])
          .map((i) => this.normalizarTexto(i.descricao || ""))
          .join(" ");

        // Concatena tudo num "blob" pesquisável
        const blob = [
          numeroAtaNorm,
          numeroPregaoNorm,
          processoNorm,
          objetoNorm,
          fornecedorNorm,
          cnpjNorm,
          categoriaNorm,
          itensTexto,
        ].join(" ");

        // ---------- Match 1: todos os termos batem no blob ----------
        const todosTermosBatem = termos.every((t) => blob.includes(t));

        // ---------- Match 2: número de ata normalizado ----------
        const matchNumeroAta =
          buscaNumeros.length > 0 &&
          (numeroAtaNorm.includes(buscaNumeros) ||
            buscaNumeros.includes(numeroAtaNorm));

        // ---------- Match 3: CPF/CNPJ (somente números) ----------
        const matchCnpj =
          buscaNumeros.length >= 8 && cnpjNorm.includes(buscaNumeros);

        return todosTermosBatem || matchNumeroAta || matchCnpj;
      });
    }

    // ============================================================
    // FILTRO DE VIGÊNCIA INTELIGENTE
    // ------------------------------------------------------------
    // Modos possíveis:
    //   · todos          → sem filtro
    //   · vigentes_hoje  → início <= hoje <= fim
    //   · vencendo_em    → fim entre hoje e hoje+X dias
    //   · vencidas       → fim < hoje
    //   · nao_iniciadas  → início > hoje
    // ============================================================
    const vencimentoModo =
      document.getElementById("filtroVencimentoModo")?.value || "todos";
    const vencimentoDias =
      parseInt(document.getElementById("filtroVencimentoDias")?.value) || 30;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (vencimentoModo !== "todos") {
      atasFiltradas = atasFiltradas.filter((a) => {
        const temFim = !!a.data_fim_vigencia;
        const temInicio = !!a.data_inicio_vigencia;

        const fim = temFim ? new Date(a.data_fim_vigencia) : null;
        const inicio = temInicio ? new Date(a.data_inicio_vigencia) : null;

        if (fim) fim.setHours(0, 0, 0, 0);
        if (inicio) inicio.setHours(0, 0, 0, 0);

        switch (vencimentoModo) {
          case "vigentes_hoje": {
            if (!inicio || !fim) return false;
            return inicio <= hoje && hoje <= fim;
          }
          case "vencendo_em": {
            if (!fim) return false;
            const limite = new Date(hoje);
            limite.setDate(limite.getDate() + vencimentoDias);
            return fim >= hoje && fim <= limite;
          }
          case "vencidas": {
            if (!fim) return false;
            return fim < hoje;
          }
          case "nao_iniciadas": {
            if (!inicio) return false;
            return inicio > hoje;
          }
          default:
            return true;
        }
      });
    }

    // ============================================================
    // FILTRO DE VALOR
    // ============================================================
    const valorMin = parseFloat(document.getElementById("valorMin")?.value);
    const valorMax = parseFloat(document.getElementById("valorMax")?.value);
    if (!isNaN(valorMin) && valorMin > 0) {
      atasFiltradas = atasFiltradas.filter(
        (a) => (a.valor_global || 0) >= valorMin,
      );
    }
    if (!isNaN(valorMax) && valorMax > 0) {
      atasFiltradas = atasFiltradas.filter(
        (a) => (a.valor_global || 0) <= valorMax,
      );
    }

    // ============================================================
    // FILTRO DE SALDO
    // ============================================================
    const saldoFilters = {
      disponivel: document.getElementById("saldoDisponivel")?.checked || false,
      baixo: document.getElementById("saldoBaixo")?.checked || false,
      zerado: document.getElementById("saldoZerado")?.checked || false,
    };

    if (saldoFilters.disponivel || saldoFilters.baixo || saldoFilters.zerado) {
      atasFiltradas = atasFiltradas.filter((a) => {
        const itens = a.itens || [];
        const valorContratado = itens.reduce(
          (s, i) => s + (i.valor_total || 0),
          0,
        );
        const valorConsumido = itens.reduce((s, i) => {
          const consumido =
            (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
          return s + consumido * (i.valor_unitario || 0);
        }, 0);
        const saldoTotal = valorContratado - valorConsumido;
        const percentual =
          valorContratado > 0 ? (saldoTotal / valorContratado) * 100 : 0;

        let match = false;
        if (saldoFilters.disponivel && saldoTotal > 0) match = true;
        if (saldoFilters.baixo && saldoTotal > 0 && percentual < 10)
          match = true;
        if (saldoFilters.zerado && saldoTotal <= 0) match = true;
        return match;
      });
    }

    // ============================================================
    // ORDENAÇÃO
    // ============================================================
    const ordenacao =
      document.getElementById("filtroOrdenacao")?.value || "vencimento_asc";
    atasFiltradas = this.ordenarAtas(atasFiltradas, ordenacao);

    // ============================================================
    // CONTADOR DE RESULTADOS
    // ============================================================
    this.atualizarContadorResultados(atasFiltradas.length);

    // ============================================================
    // ESTADO VAZIO
    // ============================================================
    if (!atasFiltradas.length) {
      container.innerHTML =
        '<div style="text-align:center;padding:30px;color:var(--neutral-500);">' +
        '<i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:12px;"></i>' +
        (busca
          ? `Nenhuma ata encontrada para "<strong>${this.escaparHtml(busca)}</strong>"`
          : "Nenhuma ata encontrada com os filtros aplicados") +
        "</div>";
      this.atualizarResumoRapido(atasBase);
      return;
    }

    // Os cards são indicadores globais da Consulta e não mudam
    // ao alternar entre favoritas ou filtros de tela.
    this.atualizarResumoRapido(atasBase);

    // Renderizar cards
    container.innerHTML = atasFiltradas
      .map((a) => this.renderCardAta(a))
      .join("");
  }

  // ============================================================
  // ATUALIZAR CONTADOR DE RESULTADOS
  // ============================================================
  atualizarContadorResultados(total) {
    const el = document.getElementById("consultaContadorTexto");
    if (!el) return;

    if (total === 0) {
      el.innerHTML = "Nenhum resultado encontrado";
    } else if (total === 1) {
      el.innerHTML = "<strong>1</strong> ata encontrada";
    } else {
      el.innerHTML = `<strong>${total}</strong> atas encontradas`;
    }
  }

  // ============================================================
  // ESCAPAR HTML (utilitário)
  // ============================================================
  escaparHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============================================================
  // ESCAPAR REGEX (utilitário, para o destaque)
  // ============================================================
  escaparRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ============================================================
  // DESTACAR TERMO BUSCADO
  // ------------------------------------------------------------
  // Envolve todas as ocorrências dos termos buscados em <mark>.
  // A comparação é feita de forma tolerante a acentos e caixa.
  // Se não houver termo ativo, devolve o texto original.
  // ============================================================
  destacarTermo(texto) {
    if (!texto) return "";
    const busca = (this._termoBuscaAtual || "").trim();
    if (!busca) return this.escaparHtml(texto);

    const textoStr = String(texto);

    // Quebra o termo em pedaços para destacar cada um
    const termos = busca
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (termos.length === 0) return this.escaparHtml(textoStr);

    // Aplica <mark> em cada termo no texto original
    let resultado = this.escaparHtml(textoStr);

    termos.forEach((termo) => {
      const termoEscapado = this.escaparRegex(termo);
      try {
        const regex = new RegExp(`(${termoEscapado})`, "gi");
        resultado = resultado.replace(regex, "<mark>$1</mark>");
      } catch (e) {
        // Se regex falhar (termo com caracteres especiais),
        // ignora o destaque desse termo.
      }
    });

    return resultado;
  }

  // ============================================================
  // RESUMIR DESCRIÇÃO COM CORTE INTELIGENTE
  // ------------------------------------------------------------
  // Se a descrição for menor ou igual ao limite, retorna como está.
  // Se for maior, aplica um corte de até LIMITE_DESCRICAO_RESUMO
  // caracteres, evitando cortar no meio de palavras e garantindo
  // que o TERMO BUSCADO (se houver) apareça no trecho exibido.
  //
  // Estratégia:
  //   1) Se a descrição cabe no limite → retorna como está
  //   2) Se a descrição é maior:
  //      a) Verifica se algum termo buscado está após o limite
  //      b) Se sim → desloca a janela para mostrar o termo
  //      c) Se não → corta nos primeiros N chars (respeitando palavras)
  //      d) Aplica reticências (…) no início e/ou fim conforme o caso
  //
  // Retorna sempre o texto ORIGINAL (sem destaque <mark>), e o
  // destaque é aplicado depois por destacarTermo(). Isso mantém
  // as responsabilidades separadas.
  // ============================================================
  resumirDescricao(descricao) {
    if (!descricao) return "";

    const texto = String(descricao).trim();
    const limite = this.LIMITE_DESCRICAO_RESUMO;

    // Caso 1: descrição cabe inteira
    if (texto.length <= limite) return texto;

    const busca = (this._termoBuscaAtual || "").trim();
    const termosBrutos = busca
      ? busca
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2)
      : [];

    // Se não há termos buscados, apenas corta do início
    if (termosBrutos.length === 0) {
      return this._cortarRespeitandoPalavras(texto, 0, limite) + "…";
    }

    // ---------- Procura o termo mais relevante dentro do texto ----------
    // Estratégia: encontra a primeira ocorrência de QUALQUER termo
    // (case-insensitive) e centraliza o corte ao redor dela.
    const textoLower = texto.toLowerCase();
    const termosLower = termosBrutos.map((t) => t.toLowerCase());

    let posMatch = -1;
    let termoMatch = "";

    for (const termo of termosLower) {
      const idx = textoLower.indexOf(termo);
      if (idx !== -1) {
        posMatch = idx;
        termoMatch = termo;
        break;
      }
    }

    // Se nenhum termo foi encontrado (improvável, mas possível),
    // faz corte simples do início.
    if (posMatch === -1) {
      return this._cortarRespeitandoPalavras(texto, 0, limite) + "…";
    }

    // ---------- Caso 2: o termo já aparece nos primeiros N chars ----------
    // Nesse caso, basta cortar do início.
    if (posMatch + termoMatch.length <= limite) {
      return this._cortarRespeitandoPalavras(texto, 0, limite) + "…";
    }

    // ---------- Caso 3: o termo está além do limite ----------
    // Precisamos deslocar a janela para que ele apareça.
    // Margem: mostramos ~40 chars ANTES do termo, para dar contexto.
    const MARGEM_ANTES = 40;
    const inicioJanela = Math.max(0, posMatch - MARGEM_ANTES);
    const fimJanela = Math.min(texto.length, inicioJanela + limite);

    // Ajusta a janela para trás se estourou o limite
    let inicioFinal = inicioJanela;
    if (fimJanela - inicioFinal < limite && inicioFinal > 0) {
      inicioFinal = Math.max(0, fimJanela - limite);
    }

    const trecho = texto.substring(inicioFinal, fimJanela);

    // Decide as reticências
    const prefixo = inicioFinal > 0 ? "…" : "";
    const sufixo = fimJanela < texto.length ? "…" : "";

    return prefixo + trecho.trim() + sufixo;
  }

  // ============================================================
  // CORTAR RESPEITANDO PALAVRAS (helper do resumirDescricao)
  // ------------------------------------------------------------
  // Corta o texto em `limite` caracteres, mas evita cortar no
  // meio de uma palavra. Se o caractere no limite for letra/dígito
  // e o próximo também, retrocede até o último espaço.
  // ============================================================
  _cortarRespeitandoPalavras(texto, inicio, limite) {
    if (!texto) return "";
    const fimTeorico = Math.min(texto.length, inicio + limite);
    if (fimTeorico >= texto.length) {
      return texto.substring(inicio);
    }

    // Verifica se estamos cortando no meio de uma palavra
    const charAntes = texto[fimTeorico - 1];
    const charDepois = texto[fimTeorico];

    const ehLetraOuNum = (c) => c && /[A-Za-z0-9À-ÿ]/.test(c);

    if (ehLetraOuNum(charAntes) && ehLetraOuNum(charDepois)) {
      // Retrocede até encontrar um espaço
      let pos = fimTeorico - 1;
      while (pos > inicio && !/\s/.test(texto[pos])) {
        pos--;
      }
      if (pos > inicio) {
        return texto.substring(inicio, pos).trimEnd();
      }
      // Não encontrou espaço (palavra gigante) → corta no limite mesmo
    }

    return texto.substring(inicio, fimTeorico).trimEnd();
  }

  // ============================================================
  // ENCONTRAR ITENS CORRESPONDENTES À BUSCA
  // ------------------------------------------------------------
  // Dado uma ata e o termo de busca atual, retorna um array com
  // os itens que batem com o termo, ordenados por relevância:
  //   1. Primeiro matches no início da descrição
  //   2. Depois por saldo decrescente
  // Retorna [] se não houver busca ou nenhum match.
  // ============================================================
  encontrarItensCorrespondentes(ata) {
    const busca = (this._termoBuscaAtual || "").trim();
    if (!busca) return [];

    const termos = busca
      .split(/\s+/)
      .map((t) => this.normalizarTexto(t))
      .filter((t) => t.length > 0);

    if (termos.length === 0) return [];

    const itens = ata.itens || [];
    const matches = [];

    itens.forEach((item) => {
      const descNorm = this.normalizarTexto(item.descricao || "");
      if (!descNorm) return;

      // Verifica se TODOS os termos batem na descrição
      const todosBatem = termos.every((t) => descNorm.includes(t));
      if (!todosBatem) return;

      // Calcula "score de relevância" para ordenação
      // Menor índice do primeiro termo = mais relevante
      let menorIndice = Infinity;
      termos.forEach((t) => {
        const idx = descNorm.indexOf(t);
        if (idx !== -1 && idx < menorIndice) menorIndice = idx;
      });

      matches.push({
        ...item,
        _relevancia: menorIndice === Infinity ? 9999 : menorIndice,
      });
    });

    // Ordena por relevância (posição do termo na descrição),
    // depois por saldo decrescente
    matches.sort((a, b) => {
      if (a._relevancia !== b._relevancia) {
        return a._relevancia - b._relevancia;
      }
      return (b.saldo_quantidade || 0) - (a.saldo_quantidade || 0);
    });

    return matches;
  }

  // ============================================================
  // CALCULAR STATUS DO ITEM (badge)
  // ------------------------------------------------------------
  // Retorna { label, classe } com base no saldo e quantidade
  // contratada.
  // ============================================================
  getStatusItem(item) {
    const saldo = item.saldo_quantidade || 0;
    const contratado = item.quantidade_contratada || 0;
    const percentual = contratado > 0 ? (saldo / contratado) * 100 : 0;

    if (saldo <= 0) {
      return {
        label: "Esgotado",
        classe: "esgotado",
        icone: "fa-times-circle",
      };
    }
    if (percentual < 10) {
      return {
        label: "Crítico",
        classe: "critico",
        icone: "fa-exclamation-triangle",
      };
    }
    return null; // sem badge para itens normais
  }

  // ============================================================
  // ✅ NOVO · HELPERS DE CARRINHO
  // ------------------------------------------------------------
  // Estes métodos fazem a ponte entre o carrinho (mantido em
  // localStorage pelo sistema) e a Consulta.
  //
  // Decisão C:
  //   · Saber quanto já está no carrinho por item
  //   · Marcar itens visualmente
  //   · Validar antes de adicionar (evitar duplicidade / exceder saldo)
  //
  // Decisão A:
  //   · Modal inline
  //   · Adicionar/remover direto do modal
  // ============================================================

  /**
   * Retorna o registro do carrinho que casa com (ataId, itemId),
   * ou null se não existir.
   *
   * Usa String() dos dois lados para evitar bugs de tipo
   * (o carrinho às vezes vem de JSON.parse e converte números).
   */
  _buscarNoCarrinho(ataId, itemId) {
    const carrinho = this.sistema.carrinho || [];
    return (
      carrinho.find(
        (c) =>
          String(c.ataId) === String(ataId) &&
          String(c.itemId) === String(itemId),
      ) || null
    );
  }

  /**
   * Retorna quantos itens da ata estão no carrinho.
   * Usado para o badge do card.
   */
  _contarItensDaAtaNoCarrinho(ataId) {
    const carrinho = this.sistema.carrinho || [];
    return carrinho.filter((c) => String(c.ataId) === String(ataId)).length;
  }

  /**
   * Soma as quantidades de um item específico no carrinho.
   * (Um mesmo item pode aparecer uma vez só no carrinho — o
   * pedidos.js consolida —, mas esse helper deixa explícito.)
   */
  _quantidadeNoCarrinho(ataId, itemId) {
    const reg = this._buscarNoCarrinho(ataId, itemId);
    return reg?.quantidade || 0;
  }

  // ============================================================
  // ✅ NOVO · MÉTODO PÚBLICO CHAMADO PELO MAIN.JS
  // ------------------------------------------------------------
  // Quando o carrinho muda (item adicionado/removido/limpo), o
  // main.js chama este método para a Consulta atualizar as
  // marcações visuais dos cards.
  //
  // Estratégia:
  //   · Se o modal estiver aberto, re-renderiza o conteúdo dele
  //   · Sempre re-renderiza os cards visíveis (rápido — só HTML)
  // ============================================================
  atualizarMarcacoesCarrinho() {
    // Re-renderiza cards visíveis
    const listaAtas = document.getElementById("atasLista");
    if (listaAtas && this._atasCache?.length) {
      // Como filtramos em cima do cache, precisamos re-render
      // exatamente o que está na tela. A forma mais barata:
      // substituir o HTML de cada card sem refetch.
      const cards = listaAtas.querySelectorAll(".ata-card");
      cards.forEach((cardEl) => {
        const ataId = cardEl.dataset.ataId;
        if (!ataId) return;
        const ata = this._atasCache.find((a) => String(a.id) === String(ataId));
        if (!ata) return;
        // Substitui o HTML do card
        const novoHtml = this.renderCardAta(ata);
        const wrapper = document.createElement("div");
        wrapper.innerHTML = novoHtml.trim();
        const novoCard = wrapper.firstElementChild;
        if (novoCard) cardEl.replaceWith(novoCard);
      });
    }

    // Re-renderiza o modal se estiver aberto
    if (this._ataModalAberta) {
      this.renderizarConteudoModalDetalhes(this._ataModalAberta);
    }
  }

  // ============================================================
  // RENDERIZAR BLOCO DE ITENS CORRESPONDENTES
  // ------------------------------------------------------------
  // Só renderiza se houver busca ativa E houver matches.
  // Mostra até 3 itens por padrão; se houver mais, mostra um
  // link "... e mais X itens" que expande no próprio card.
  //
  // ✅ ATUALIZADO · Agora cada item correspondente tem um botão
  // [+ Adicionar] que permite adicionar ao carrinho SEM sair da
  // busca. Se o item já estiver no carrinho, mostra a quantidade
  // e um botão [X] para remover.
  // ============================================================
  renderBlocoItensCorrespondentes(ata) {
    // Só renderiza se houver busca ativa
    if (!this._termoBuscaAtual || !this._termoBuscaAtual.trim()) {
      return "";
    }

    const correspondentes = this.encontrarItensCorrespondentes(ata);
    if (correspondentes.length === 0) return "";

    const LIMITE_PADRAO = 3;
    const ataId = String(ata.id);
    const estaExpandida = this._atasExpandidas.has(ataId);

    const total = correspondentes.length;
    const temMais = total > LIMITE_PADRAO;
    const itensVisiveis =
      estaExpandida || !temMais
        ? correspondentes
        : correspondentes.slice(0, LIMITE_PADRAO);

    // Monta HTML de cada item
    const itensHtml = itensVisiveis
      .map((item) => {
        const descricaoCompleta = item.descricao || "";

        // Aplica corte inteligente para gerar o resumo
        const resumo = this.resumirDescricao(descricaoCompleta);

        // Aplica destaque <mark> no resumo
        const descricaoDestacada = this.destacarTermo(resumo);

        const saldo = item.saldo_quantidade || 0;
        const valorUnit = this.sistema.ui.formatarMoeda(
          item.valor_unitario || 0,
        );
        const numero = item.item_numero
          ? `<span class="item-correspondente-numero">#${this.escaparHtml(item.item_numero)}</span>`
          : "";

        const status = this.getStatusItem(item);
        const statusBadge = status
          ? `<span class="item-correspondente-badge badge-${status.classe}">
              <i class="fas ${status.icone}"></i> ${status.label}
             </span>`
          : "";

        // Tooltip com descrição completa (escapada)
        const tooltipCompleto = this.escaparHtml(descricaoCompleta);

        // ============================================================
        // ✅ NOVO · BOTÃO DE AÇÃO (Adicionar / No carrinho / Esgotado)
        // ------------------------------------------------------------
        // Regras:
        //   · Esgotado (saldo <= 0)   → botão desabilitado "Esgotado"
        //   · Já no carrinho          → botão verde "No carrinho (X)"
        //   · Sem estar no carrinho   → botão azul "[+ Adicionar]"
        //
        // O clique é capturado por DELEGAÇÃO em #atasLista (ver
        // configurarEventos), que verifica o data-action antes de
        // chegar ao card. Isso impede que o clique abra o modal.
        // ============================================================
        const esgotado = saldo <= 0;
        const regCarrinho = this._buscarNoCarrinho(ata.id, item.id);
        const qtdNoCarrinho = regCarrinho?.quantidade || 0;

        let botaoAcaoHtml = "";

        if (esgotado) {
          botaoAcaoHtml = `
            <button
              type="button"
              class="btn-item-esgotado"
              disabled
              title="Sem saldo disponível"
            >
              <i class="fas fa-ban"></i> Esgotado
            </button>
          `;
        } else if (regCarrinho) {
          botaoAcaoHtml = `
            <div class="item-correspondente-acoes-carrinho">
              <span class="item-correspondente-no-carrinho">
                <i class="fas fa-check-circle"></i>
                No carrinho (${this.formatarQtdInput(qtdNoCarrinho, item.unidade_medida)})
              </span>
              <button
                type="button"
                class="btn-item-remover"
                data-action="rem-item-carrinho"
                data-item-id="${item.id}"
                data-ata-id="${ata.id}"
                title="Remover do carrinho"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
        } else {
          botaoAcaoHtml = `
            <button
              type="button"
              class="btn-item-adicionar"
              data-action="add-item-carrinho"
              data-item-id="${item.id}"
              data-ata-id="${ata.id}"
              title="Adicionar ao carrinho"
            >
              <i class="fas fa-cart-plus"></i> Adicionar
            </button>
          `;
        }

        // Unidade do item (KG, L, UN, ...)
        const unidade = this._normalizarUnidade(item.unidade_medida);

        return `
          <li class="item-correspondente">
            <div class="item-correspondente-linha-1">
              ${numero}
              <span class="item-correspondente-descricao" title="${tooltipCompleto}">${descricaoDestacada}</span>
              ${statusBadge}
            </div>
            <div class="item-correspondente-linha-2">
              <span><i class="fas fa-cubes"></i> Saldo: <strong>${this.formatarQtdInput(saldo, unidade)} ${unidade}</strong></span>
              <span class="item-correspondente-sep">·</span>
              <span><i class="fas fa-tag"></i> ${valorUnit}/${unidade}</span>
              <span class="item-correspondente-acoes">
                ${botaoAcaoHtml}
              </span>
            </div>
          </li>
        `;
      })
      .join("");

    // Botão de expandir/recolher
    let botaoToggle = "";
    if (temMais) {
      if (estaExpandida) {
        botaoToggle = `
          <button
            type="button"
            class="item-correspondente-toggle"
            data-action="recolher-itens"
            data-ata-id="${ataId}"
          >
            <i class="fas fa-chevron-up"></i> Recolher itens
          </button>
        `;
      } else {
        const restantes = total - LIMITE_PADRAO;
        botaoToggle = `
          <button
            type="button"
            class="item-correspondente-toggle"
            data-action="ver-todos-itens"
            data-ata-id="${ataId}"
          >
            <i class="fas fa-chevron-down"></i> Ver todos (mais ${restantes})
          </button>
        `;
      }
    }

    return `
      <div class="itens-correspondentes">
        <div class="itens-correspondentes-header">
          <i class="fas fa-search"></i>
          <span>
            <strong>${total}</strong>
            ${total === 1 ? "item corresponde" : "itens correspondem"}
            à busca
          </span>
        </div>
        <ul class="itens-correspondentes-lista">
          ${itensHtml}
        </ul>
        ${botaoToggle}
      </div>
    `;
  }

  // ============================================================
  // ORDENAR ATAS (COM NOVOS CRITÉRIOS)
  // ============================================================
  ordenarAtas(atas, criterio) {
    const copia = [...atas];

    // Helper: calcula saldo total da ata
    const calcularSaldo = (a) => {
      const itens = a.itens || [];
      const valorContratado = itens.reduce(
        (s, i) => s + (i.valor_total || 0),
        0,
      );
      const valorConsumido = itens.reduce((s, i) => {
        const consumido =
          (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
        return s + consumido * (i.valor_unitario || 0);
      }, 0);
      return valorContratado - valorConsumido;
    };

    switch (criterio) {
      // ---------- Vencimento ----------
      case "vencimento_asc":
        return copia.sort((a, b) => {
          const da = a.data_fim_vigencia
            ? new Date(a.data_fim_vigencia)
            : new Date(8640000000000000);
          const db = b.data_fim_vigencia
            ? new Date(b.data_fim_vigencia)
            : new Date(8640000000000000);
          return da - db;
        });
      case "vencimento_desc":
        return copia.sort((a, b) => {
          const da = a.data_fim_vigencia
            ? new Date(a.data_fim_vigencia)
            : new Date(0);
          const db = b.data_fim_vigencia
            ? new Date(b.data_fim_vigencia)
            : new Date(0);
          return db - da;
        });

      // ---------- Valor ----------
      case "valor_desc":
        return copia.sort(
          (a, b) => (b.valor_global || 0) - (a.valor_global || 0),
        );
      case "valor_asc":
        return copia.sort(
          (a, b) => (a.valor_global || 0) - (b.valor_global || 0),
        );

      // ---------- Número da Ata ----------
      case "numero_asc":
        return copia.sort((a, b) => this.compararNumeroAta(a, b, "asc"));
      case "numero_desc":
        return copia.sort((a, b) => this.compararNumeroAta(a, b, "desc"));

      // ---------- Fornecedor ----------
      case "fornecedor_asc":
        return copia.sort((a, b) =>
          (a.fornecedor?.razao_social || "").localeCompare(
            b.fornecedor?.razao_social || "",
            "pt-BR",
          ),
        );
      case "fornecedor_desc":
        return copia.sort((a, b) =>
          (b.fornecedor?.razao_social || "").localeCompare(
            a.fornecedor?.razao_social || "",
            "pt-BR",
          ),
        );

      // ---------- Data de Cadastro ----------
      case "cadastro_desc":
        return copia.sort((a, b) => {
          const da = a.created_at ? new Date(a.created_at) : new Date(0);
          const db = b.created_at ? new Date(b.created_at) : new Date(0);
          return db - da;
        });
      case "cadastro_asc":
        return copia.sort((a, b) => {
          const da = a.created_at ? new Date(a.created_at) : new Date(0);
          const db = b.created_at ? new Date(b.created_at) : new Date(0);
          return da - db;
        });

      // ---------- Saldo ----------
      case "saldo_desc":
        return copia.sort((a, b) => calcularSaldo(b) - calcularSaldo(a));
      case "saldo_asc":
        return copia.sort((a, b) => calcularSaldo(a) - calcularSaldo(b));

      // ---------- Fallback (nome_asc legado) ----------
      case "nome_asc":
        return copia.sort((a, b) =>
          (a.numero_ata || "").localeCompare(b.numero_ata || "", "pt-BR"),
        );

      default:
        return copia;
    }
  }

  // ============================================================
  // COMPARAR NÚMEROS DE ATA (ex: "78/2025" vs "120/2025")
  // ------------------------------------------------------------
  // Extrai ano e número e compara ano primeiro, depois número.
  // ============================================================
  compararNumeroAta(a, b, direcao = "asc") {
    const extrair = (num) => {
      const str = String(num || "").trim();
      // Tenta capturar "N/AAAA" ou "N-AAAA" ou "N AAAA"
      const match = str.match(/(\d+)\D+(\d{4})/);
      if (match) {
        return { numero: parseInt(match[1], 10), ano: parseInt(match[2], 10) };
      }
      // Só números
      const apenasNum = str.replace(/\D/g, "");
      return { numero: parseInt(apenasNum, 10) || 0, ano: 0 };
    };

    const ea = extrair(a.numero_ata);
    const eb = extrair(b.numero_ata);

    let cmp = 0;
    if (ea.ano !== eb.ano) cmp = ea.ano - eb.ano;
    else cmp = ea.numero - eb.numero;

    return direcao === "desc" ? -cmp : cmp;
  }

  // ============================================================
  // ATUALIZAR RESUMO RÁPIDO
  // ============================================================
  atualizarResumoRapido(atas) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const lista = Array.isArray(atas) ? atas : [];
    const vencidasLista = lista.filter((a) => a.situacao === "VENCIDA");
    const ativasLista = lista.filter((a) => a.situacao !== "VENCIDA");
    const total = ativasLista.length;
    let venc30 = 0,
      venc60 = 0,
      venc90 = 0;
    const vencidas = vencidasLista.length;
    ativasLista.forEach((a) => {
      if (!a.data_fim_vigencia) return;
      const fim = new Date(a.data_fim_vigencia);
      if (Number.isNaN(fim.getTime())) return;
      fim.setHours(0, 0, 0, 0);
      const dias = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
      if (dias >= 0 && dias <= 30) venc30++;
      else if (dias > 30 && dias <= 60) venc60++;
      else if (dias > 60 && dias <= 90) venc90++;
    });
    const definir = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };
    definir("totalAtas", total);
    definir("vencimento30", venc30);
    definir("vencimento60", venc60);
    definir("vencimento90", venc90);
    definir("totalAlertas", vencidas);
  }

  // ============================================================
  // RENDERIZAR CARD DA ATA
  // ------------------------------------------------------------
  // ✅ ATUALIZADO · Agora inclui badge de "itens no carrinho"
  // quando a ata tem itens já adicionados pelo usuário.
  // ============================================================
  renderCardAta(ata) {
    const statusClass =
      {
        ATIVA: "status-ativa",
        PROXIMA: "status-proxima",
        VENCIDA: "status-vencida",
      }[ata.situacao] || "status-ativa";
    const categoriaNome = ata.categoria?.nome || "Outros";
    const favorita = this._favoritasIds.has(String(ata.id));
    const botaoFavorita = `<button type="button" class="btn-favoritar-ata ${favorita ? "ativo" : ""}" data-action="toggle-favorita" data-ata-id="${ata.id}" aria-pressed="${favorita}" title="${favorita ? "Remover das favoritas" : "Favoritar esta ATA"}"><i class="fas fa-star"></i><span>${favorita ? "Favorita" : "Favoritar"}</span></button>`;

    // Calcular valor consumido para exibição
    const itens = ata.itens || [];
    const valorTotal = itens.reduce((s, i) => s + (i.valor_total || 0), 0);
    const valorConsumido = itens.reduce((s, i) => {
      const consumido =
        (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
      return s + consumido * (i.valor_unitario || 0);
    }, 0);
    const saldoAta = valorTotal - valorConsumido;

    // ============================================================
    // ✅ NOVO · CONTAGEM DE ITENS NO CARRINHO (badge)
    // ============================================================
    const qtdNoCarrinho = this._contarItensDaAtaNoCarrinho(ata.id);
    const badgeCarrinho =
      qtdNoCarrinho > 0
        ? `<span class="badge-carrinho-card">
             <i class="fas fa-shopping-cart"></i>
             ${qtdNoCarrinho} ${qtdNoCarrinho === 1 ? "item" : "itens"} no carrinho
           </span>`
        : "";

    // ============================================================
    // BADGE DE VENCIMENTO
    // ============================================================
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let diasRestantes = null;
    let badgeVencimento = "";
    if (ata.data_fim_vigencia) {
      const fim = new Date(ata.data_fim_vigencia);
      fim.setHours(0, 0, 0, 0);
      diasRestantes = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));

      if (diasRestantes < 0) {
        badgeVencimento = `<span class="badge-vencimento vermelho"><i class="fas fa-exclamation-circle"></i> Vencida há ${Math.abs(diasRestantes)} dias</span>`;
      } else if (diasRestantes <= 15) {
        badgeVencimento = `<span class="badge-vencimento vermelho"><i class="fas fa-exclamation-triangle"></i> Vence em ${diasRestantes} dias</span>`;
      } else if (diasRestantes <= 30) {
        badgeVencimento = `<span class="badge-vencimento laranja"><i class="fas fa-clock"></i> Vence em ${diasRestantes} dias</span>`;
      } else if (diasRestantes <= 60) {
        badgeVencimento = `<span class="badge-vencimento amarelo"><i class="fas fa-clock"></i> Vence em ${diasRestantes} dias</span>`;
      } else if (diasRestantes <= 90) {
        badgeVencimento = `<span class="badge-vencimento verde"><i class="fas fa-hourglass-half"></i> Vence em ${diasRestantes} dias</span>`;
      } else {
        badgeVencimento = `<span class="badge-vencimento verde-claro"><i class="fas fa-hourglass-start"></i> Vence em ${diasRestantes} dias</span>`;
      }
    }

    // Número do pregão
    const numeroPregao = ata.numero_pregao || ata.pregao_numero || "";
    const pregaoDisplay = numeroPregao ? `Pregão: ${numeroPregao}` : "";

    // ============================================================
    // DESTAQUE DOS CAMPOS
    // ============================================================
    const numeroAtaDestacado = this.destacarTermo(ata.numero_ata || "");
    const pregaoDestacado = this.destacarTermo(numeroPregao || "");
    const fornecedorDestacado = this.destacarTermo(
      ata.fornecedor?.razao_social || "N/I",
    );
    const categoriaDestacada = this.destacarTermo(categoriaNome);

    // ============================================================
    // BLOCO DE ITENS CORRESPONDENTES (só se houver busca)
    // ============================================================
    const blocoItens = this.renderBlocoItensCorrespondentes(ata);

    return `
      <div class="ata-card" data-ata-id="${ata.id}" data-action="abrir-detalhes">
        <div class="ata-header">
          <div class="ata-status">
            <span class="status-badge ${statusClass}">${ata.situacao || "ATIVA"}</span>
            ${badgeVencimento}
            <span style="font-size:0.75rem; margin-left: auto;"><i class="fas fa-box"></i> ${itens.length}</span>
          </div>
          <div class="ata-numero">Ata nº ${numeroAtaDestacado} ${botaoFavorita}</div>
          ${
            pregaoDisplay
              ? `<div style="font-size:0.8rem; color: var(--primary-600); font-weight: 500;">
                  <i class="fas fa-gavel"></i> Pregão: ${pregaoDestacado}
                </div>`
              : ""
          }
          <div class="ata-fornecedor">
            <i class="fas fa-building"></i> ${fornecedorDestacado}
            ${ata.fornecedor?.cnpj ? ` <span style="font-size:0.7rem;color:var(--neutral-400);">(${this.formatarCnpj(ata.fornecedor.cnpj)})</span>` : ""}
          </div>
          <div style="font-size:0.8rem"><i class="fas fa-tag"></i> ${categoriaDestacada}</div>
          <div style="font-size:0.8rem">
            <i class="fas fa-calendar"></i> ${this.sistema.ui.formatarData(ata.data_inicio_vigencia)}
            ${ata.data_fim_vigencia ? `até ${this.sistema.ui.formatarData(ata.data_fim_vigencia)}` : ""}
          </div>
          <div style="font-size:0.75rem; color: var(--neutral-500); margin-top: 4px;">
            <span>Saldo: <strong>${this.sistema.ui.formatarMoeda(saldoAta)}</strong></span>
            <span style="margin-left: 12px;">Consumido: <strong>${this.sistema.ui.formatarMoeda(valorConsumido)}</strong></span>
          </div>
          ${badgeCarrinho ? `<div style="margin-top: 8px;">${badgeCarrinho}</div>` : ""}
        </div>
        ${blocoItens}
        <div class="ata-footer">
          <span style="font-weight:600;font-size:0.9rem">${this.sistema.ui.formatarMoeda(ata.valor_global || 0)}</span>
          <button
            type="button"
            class="btn-visualizar"
            data-action="abrir-detalhes"
            data-ata-id="${ata.id}"
          >
            <i class="fas fa-eye"></i> Ver Itens
          </button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // LIMPAR FILTROS
  // ============================================================
  limparFiltros() {
    const buscaInput = document.getElementById("buscaInput");
    if (buscaInput) buscaInput.value = "";

    const fornecedorInput = document.getElementById("fornecedorInput");
    if (fornecedorInput) fornecedorInput.value = "";

    const fornecedorId = document.getElementById("fornecedorId");
    if (fornecedorId) fornecedorId.value = "";

    const filtroOrgao = document.getElementById("filtroOrgao");
    if (filtroOrgao) filtroOrgao.value = "todos";

    const filtroStatus = document.getElementById("filtroStatus");
    if (filtroStatus) filtroStatus.value = "todos";

    // filtro de categoria
    const filtroCategoria = document.getElementById("filtroCategoria");
    if (filtroCategoria) filtroCategoria.value = "todos";

    // filtro de vigência (modo + input de dias)
    const filtroVencimentoModo = document.getElementById(
      "filtroVencimentoModo",
    );
    if (filtroVencimentoModo) filtroVencimentoModo.value = "todos";

    const filtroVencimentoDias = document.getElementById(
      "filtroVencimentoDias",
    );
    if (filtroVencimentoDias) {
      filtroVencimentoDias.value = "30";
      filtroVencimentoDias.style.display = "none";
    }

    const filtroOrdenacao = document.getElementById("filtroOrdenacao");
    if (filtroOrdenacao) filtroOrdenacao.value = "vencimento_asc";

    const valorMin = document.getElementById("valorMin");
    if (valorMin) valorMin.value = "";

    const valorMax = document.getElementById("valorMax");
    if (valorMax) valorMax.value = "";

    document
      .querySelectorAll('.filtro-saldo-checkboxes input[type="checkbox"]')
      .forEach((cb) => (cb.checked = false));

    const dropdown = document.getElementById("autocompleteDropdown");
    if (dropdown) dropdown.classList.remove("open");

    // Limpa o termo de destaque
    this._termoBuscaAtual = "";

    // Limpa o estado de expansão dos cards
    this._atasExpandidas.clear();

    // ✅ Limpa o card ativo
    this._cardAtivo = null;
    this.sincronizarCardsAtivos();

    this.filtrarAtas();
  }

  // ============================================================
  // EXPORTAR RESULTADOS
  // ============================================================
  async exportarResultados() {
    const atas = await this.obterAtasFiltradas();

    if (!atas || atas.length === 0) {
      this.sistema.ui.mostrarToast("aviso", "Nenhuma ata para exportar.");
      return;
    }

    const cabecalho = [
      "Nº Ata",
      "Fornecedor",
      "CPF/CNPJ",
      "Processo",
      "Objeto",
      "Vigência Início",
      "Vigência Fim",
      "Valor Global",
      "Saldo",
      "Situação",
      "Categoria",
    ];

    const linhas = atas.map((a) => {
      const itens = a.itens || [];
      const valorTotal = itens.reduce((s, i) => s + (i.valor_total || 0), 0);
      const valorConsumido = itens.reduce((s, i) => {
        const consumido =
          (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
        return s + consumido * (i.valor_unitario || 0);
      }, 0);
      const saldoAta = valorTotal - valorConsumido;

      return [
        a.numero_ata || "",
        a.fornecedor?.razao_social || "",
        a.fornecedor?.cnpj || "",
        a.processo_administrativo || "",
        a.objeto || "",
        a.data_inicio_vigencia || "",
        a.data_fim_vigencia || "",
        valorTotal,
        saldoAta,
        a.situacao || "",
        a.categoria?.nome || "",
      ];
    });

    // Criar CSV com cabeçalho
    const csvContent = [
      cabecalho.join(","),
      ...linhas.map((l) => l.join(",")),
    ].join("\n");

    // Adicionar BOM para UTF-8
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `atas_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.sistema.ui.mostrarToast("sucesso", "Lista exportada com sucesso!");
  }

  // ============================================================
  // OBTER ATAS FILTRADAS (PARA EXPORTAÇÃO)
  // ============================================================
  async obterAtasFiltradas() {
    // Usar cache se disponível e se os filtros não mudaram
    if (this._atasCache.length > 0 && this._ultimaBusca === Date.now()) {
      return this._atasCache;
    }

    // Re-executar a consulta sem as limitações de exibição para obter todos os dados
    let query = supabase
      .from("atas")
      .select(
        "*, fornecedor:fornecedores(razao_social,cnpj), itens:itens_ata(*), categoria:categorias(id,nome)",
      );

    const statusFiltro = document.getElementById("filtroStatus")?.value;
    if (statusFiltro && statusFiltro !== "todos") {
      query = query.eq("situacao", statusFiltro);
    } else {
      query = query.not("situacao", "eq", "VENCIDA");
    }

    const { data: atas } = await query.order("data_inicio_vigencia", {
      ascending: false,
    });

    this._atasCache = atas || [];
    this._ultimaBusca = Date.now();

    return this._atasCache;
  }

  // ============================================================
  // ✅ ATUALIZADO · ABRIR DETALHES (MODAL INLINE)
  // ------------------------------------------------------------
  // Antes: navegava para detalhes-ata.html (perdia filtros)
  // Agora: abre o #modalDetalhes já existente no gestao-atas.html,
  //        preservando todo o contexto da Consulta.
  //
  // O modal recebe:
  //   · #modalTituloAta → cabeçalho (nº da ata, fornecedor, etc.)
  //   · #modalConteudo  → tabela de itens + botões de adicionar
  //
  // A lista de itens é renderizada por renderizarConteudoModalDetalhes(),
  // que já aplica as marcações "no carrinho" (decisão C).
  // ============================================================
  async abrirDetalhes(ataId) {
    // Encontra a ata no cache local (evita refetch — já temos tudo)
    const ata = (this._atasCache || []).find(
      (a) => String(a.id) === String(ataId),
    );

    if (!ata) {
      console.warn("[Consulta] Ata não encontrada no cache:", ataId);
      this.sistema.ui.mostrarToast(
        "erro",
        "Ata não encontrada",
        "Recarregue a lista e tente novamente.",
      );
      return;
    }

    // Guarda referência para uso interno (add/remove item)
    this._ataModalAberta = ata;
    this._itensModalAberta = ata.itens || [];
    // ✅ Limpa o termo de busca do modal ao abrir
    this._termoBuscaModal = "";

    // Cabeçalho
    const tituloEl = document.getElementById("modalTituloAta");
    if (tituloEl) {
      tituloEl.innerHTML = `
        <i class="fas fa-file-contract"></i>
        Ata nº ${this.escaparHtml(ata.numero_ata || "N/I")}
        <span style="font-size:0.85rem;font-weight:500;color:var(--neutral-500);margin-left:8px;">
          ${this.escaparHtml(ata.fornecedor?.razao_social || "")}
        </span>
      `;
    }

    // Conteúdo (tabela de itens)
    this.renderizarConteudoModalDetalhes(ata);

    // Abre o modal
    const modal = document.getElementById("modalDetalhes");
    if (modal) {
      modal.classList.add("active");
      // Foco no botão de fechar para acessibilidade
      modal.querySelector(".modal-close")?.focus();
    }
  }

  // ============================================================
  // ✅ ATUALIZADO · RENDERIZAR CONTEÚDO DO MODAL (tabela de itens)
  // ------------------------------------------------------------
  // Monta a tabela com todos os itens da ata e, para cada item:
  //   · Badge "no carrinho (X)" quando aplicável
  //   · Botão contextual:
  //       - Esgotado        → desabilitado "Esgotado"
  //       - No carrinho     → "Remover do carrinho" (vermelho)
  //       - Sem carrinho    → "Adicionar" (azul)
  //
  // Esta função é chamada:
  //   · Ao abrir o modal
  //   · Sempre que o usuário adiciona/remove um item
  //   · Quando o main.js notifica mudança no carrinho
  //
  // ✅ NOVO · Agora inclui um campo de busca acima da tabela para
  // filtrar itens em tempo real (por descrição ou nº do item).
  // ============================================================
  renderizarConteudoModalDetalhes(ata) {
    const container = document.getElementById("modalConteudo");
    if (!container) return;

    const itens = ata.itens || [];

    // Se não houver itens
    if (itens.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--neutral-500);">
          <i class="fas fa-box-open" style="font-size:2rem;display:block;margin-bottom:12px;opacity:0.5;"></i>
          Nenhum item cadastrado nesta ata.
        </div>
      `;
      return;
    }

    // Cabeçalho com dados da ata (reusa .info-grid do design system)
    const valorTotal = itens.reduce((s, i) => s + (i.valor_total || 0), 0);
    const valorConsumido = itens.reduce((s, i) => {
      const consumido =
        (i.quantidade_contratada || 0) - (i.saldo_quantidade || 0);
      return s + consumido * (i.valor_unitario || 0);
    }, 0);
    const saldoAta = valorTotal - valorConsumido;

    const cabecalho = `
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Fornecedor</span>
          <span class="info-value">${this.escaparHtml(ata.fornecedor?.razao_social || "N/I")}</span>
        </div>
        <div class="info-item">
          <span class="info-label">CPF/CNPJ</span>
          <span class="info-value">${this.formatarCnpj(ata.fornecedor?.cnpj || "")}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Vigência</span>
          <span class="info-value">
            ${this.sistema.ui.formatarData(ata.data_inicio_vigencia)}
            até
            ${this.sistema.ui.formatarData(ata.data_fim_vigencia)}
          </span>
        </div>
        <div class="info-item">
          <span class="info-label">Valor Global</span>
          <span class="info-value">${this.sistema.ui.formatarMoeda(valorTotal)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Consumido</span>
          <span class="info-value">${this.sistema.ui.formatarMoeda(valorConsumido)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Saldo</span>
          <span class="info-value" style="color:var(--success-600);font-weight:700;">
            ${this.sistema.ui.formatarMoeda(saldoAta)}
          </span>
        </div>
      </div>
    `;

    // ✅ Campo de busca dentro do modal
    const campoBusca = `
      <div class="modal-detalhes-busca">
        <i class="fas fa-search"></i>
        <input
          type="text"
          class="modal-detalhes-busca-input"
          placeholder="Filtrar itens por descrição ou nº do item..."
          data-modal-search
          autocomplete="off"
          value="${this.escaparHtml(this._termoBuscaModal || "")}"
        >
        <span class="modal-detalhes-busca-contador" data-modal-search-counter>
          ${itens.length} ${itens.length === 1 ? "item" : "itens"}
        </span>
      </div>
    `;

    // Monta as linhas da tabela de itens
    const linhasHtml = itens
      .map((item) => this._renderLinhaItemModal(item, ata))
      .join("");

    container.innerHTML = `
      ${cabecalho}
      <h4 style="margin:20px 0 10px 0;font-size:0.95rem;">
        <i class="fas fa-boxes"></i> Itens da Ata
        <span style="font-size:0.8rem;font-weight:500;color:var(--neutral-500);margin-left:8px;">
          (${itens.length} ${itens.length === 1 ? "item" : "itens"})
        </span>
      </h4>
      ${campoBusca}
      <div class="tabela-container">
        <table class="tabela-itens">
          <thead>
            <tr>
              <th style="width:70px;">Item</th>
              <th>Descrição</th>
              <th style="width:90px;text-align:right;">Contratado</th>
              <th style="width:90px;text-align:right;">Saldo</th>
              <th style="width:110px;text-align:right;">Valor Unit.</th>
              <th style="width:130px;text-align:right;">Valor Total</th>
              <th style="width:280px;text-align:center;">Ação</th>
            </tr>
          </thead>
          <tbody data-modal-itens-body>
            ${linhasHtml}
          </tbody>
        </table>
      </div>
    `;

    // Reaplica o filtro se havia termo anterior
    if (this._termoBuscaModal && this._termoBuscaModal.trim()) {
      this.filtrarItensModal(this._termoBuscaModal);
    }
  }

  // ============================================================
  // ✅ NOVO · FILTRAR ITENS DO MODAL EM TEMPO REAL
  // ------------------------------------------------------------
  // Chamado pelo listener de `input` no campo `[data-modal-search]`.
  // Esconde as <tr> que não batem com o termo e atualiza o contador.
  //
  // Compara contra:
  //   · Descrição do item (normalizada — sem acento/pontuação)
  //   · Número do item (ex: "5", "05", "10")
  //
  // Se o termo é vazio → mostra todas as linhas.
  // Se nenhuma linha bate → mostra empty state inline.
  // ============================================================
  filtrarItensModal(termo) {
    this._termoBuscaModal = termo || "";

    const container = document.getElementById("modalConteudo");
    if (!container) return;

    const tbody = container.querySelector("[data-modal-itens-body]");
    if (!tbody) return;

    const termoNorm = this.normalizarTexto(termo || "");
    const linhas = tbody.querySelectorAll("tr[data-item-id]");

    // Se o termo é vazio → mostra todas as linhas
    if (!termoNorm) {
      linhas.forEach((tr) => (tr.style.display = ""));
      this._atualizarContadorBuscaModal(linhas.length, linhas.length);
      this._removerEmptyStateInline();
      return;
    }

    let visiveis = 0;
    linhas.forEach((tr) => {
      // Pega o texto da linha para comparar
      const descricaoEl = tr.querySelector(".item-descricao-modal");
      const numeroEl = tr.querySelector("td:first-child");

      const descricao = descricaoEl
        ? this.normalizarTexto(descricaoEl.textContent || "")
        : "";
      const numero = numeroEl
        ? this.normalizarTexto(numeroEl.textContent || "")
        : "";

      // Bate se o termo está na descrição OU no número do item
      const bate = descricao.includes(termoNorm) || numero.includes(termoNorm);

      if (bate) {
        tr.style.display = "";
        visiveis++;
      } else {
        tr.style.display = "none";
      }
    });

    this._atualizarContadorBuscaModal(visiveis, linhas.length);

    // Empty state inline
    if (visiveis === 0) {
      this._mostrarEmptyStateInline(termo);
    } else {
      this._removerEmptyStateInline();
    }
  }

  /**
   * Atualiza o contador "X de Y itens" no topo do modal.
   */
  _atualizarContadorBuscaModal(visiveis, total) {
    const el = document.querySelector("[data-modal-search-counter]");
    if (!el) return;

    if (visiveis === total) {
      el.textContent = `${total} ${total === 1 ? "item" : "itens"}`;
      el.classList.remove("filtrado");
    } else {
      el.textContent = `${visiveis} de ${total} ${total === 1 ? "item" : "itens"}`;
      el.classList.add("filtrado");
    }
  }

  /**
   * Mostra um empty state quando o filtro do modal não retorna nada.
   */
  _mostrarEmptyStateInline(termo) {
    // Remove anterior se existir
    this._removerEmptyStateInline();

    const tbody = document.querySelector("[data-modal-itens-body]");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.dataset.emptyState = "1";
    tr.innerHTML = `
      <td colspan="7" style="text-align:center;padding:36px 20px;color:var(--neutral-500);">
        <i class="fas fa-search" style="font-size:1.6rem;display:block;margin-bottom:8px;opacity:0.5;"></i>
        Nenhum item corresponde a "<strong>${this.escaparHtml(termo)}</strong>"
      </td>
    `;
    tbody.appendChild(tr);
  }

  /**
   * Remove o empty state inline, se existir.
   */
  _removerEmptyStateInline() {
    const el = document.querySelector(
      "[data-modal-itens-body] tr[data-empty-state='1']",
    );
    if (el) el.remove();
  }

  // ============================================================
  // ✅ ATUALIZADO · RENDERIZAR UMA LINHA DE ITEM NO MODAL
  // ------------------------------------------------------------
  // Aplica a decisão C + a nova interface com input inline:
  //   · Se o item está no carrinho → badge + botões +/-/Remover
  //   · Se o item está esgotado    → badge + botão desabilitado
  //   · Caso contrário              → input inline + botão "Adicionar"
  //
  // ✅ NOVO · WRAPPER DO INPUT COM UNIDADE
  // ------------------------------------------------------------
  // Cada item agora tem um input de quantidade inline, envolto
  // num wrapper que exibe a unidade ao lado (ex: "10 un", "1,5 kg").
  //
  // Regras:
  //   · Se a unidade é inteira (UN, CX, PCT...) → step=1, inteiro
  //   · Se a unidade aceita decimais (KG, L, M...) → step=0.001
  //
  // ✅ ATUALIZADO · O input inline agora executa a adição DIRETO
  // quando preenchido. O mini-modal só aparece como fallback
  // (quando o input está vazio).
  // ============================================================
  _renderLinhaItemModal(item, ata) {
    const saldo = item.saldo_quantidade || 0;
    const contratado = item.quantidade_contratada || 0;
    const valorUnit = item.valor_unitario || 0;
    const valorTotal = item.valor_total || 0;

    const unidade = this._normalizarUnidade(item.unidade_medida);
    const aceitaDecimais = this._unidadeAceitaDecimais(unidade);
    const precisao = this._precisaoUnidade(unidade);
    const step = aceitaDecimais ? Math.pow(10, -precisao) : 1;

    const esgotado = saldo <= 0;
    const regCarrinho = this._buscarNoCarrinho(ata.id, item.id);
    const qtdNoCarrinho = regCarrinho?.quantidade || 0;

    // Cor da célula de saldo (verde/amarelo/vermelho)
    const percentualSaldo = contratado > 0 ? (saldo / contratado) * 100 : 0;
    const saldoClasse =
      saldo <= 0
        ? "saldo-zerado"
        : percentualSaldo < 10
          ? "saldo-baixo"
          : "saldo-alto";

    // --- Badge "no carrinho" (decisão C) ---
    const badgeCarrinho = regCarrinho
      ? `<div class="item-no-carrinho-badge">
           <i class="fas fa-check-circle"></i>
           ${this.formatarQtdInput(qtdNoCarrinho, unidade)} ${unidade} no carrinho
         </div>`
      : "";

    // ============================================================
    // ✅ NOVO · INPUT INLINE DE QUANTIDADE (COM WRAPPER + UNIDADE)
    // ------------------------------------------------------------
    // Só é renderizado quando:
    //   · O item NÃO está esgotado
    //   · O item NÃO está no carrinho (se já está, o usuário
    //     usa o mini-modal pra ajustar; aqui só mostramos o estado)
    //
    // O input tem:
    //   · type="number" (aceita vírgula ou ponto no parse)
    //   · step da unidade (1 para UN, 0.001 para KG, etc)
    //   · data-qtd-inline-for="<itemId>" (usado pelos handlers +/-)
    //   · data-unidade="<unidade>" (usado pelo parser)
    //   · data-max="<saldo>" (limite superior)
    //
    // Os botões +/- são capturados por DELEGAÇÃO em #modalConteudo,
    // que ajusta o valor do input sem I/O.
    // ============================================================
    let inputInlineHtml = "";
    if (!esgotado && !regCarrinho) {
      const classeWrapper = aceitaDecimais
        ? "qtd-input-wrapper qtd-decimal"
        : "qtd-input-wrapper";

      inputInlineHtml = `
        <div class="${classeWrapper}">
          <input
            type="number"
            id="qtd-inline-${item.id}"
            class="qtd-input"
            data-qtd-inline-for="${item.id}"
            data-unidade="${unidade}"
            data-max="${saldo}"
            min="0"
            max="${saldo}"
            step="${step}"
            placeholder="Qtd"
            inputmode="${aceitaDecimais ? "decimal" : "numeric"}"
            autocomplete="off"
          />
          <span class="qtd-unidade">${unidade}</span>
        </div>
      `;
    }

    // --- Botões de ação (decisão C) ---
    let acaoHtml = "";

    if (esgotado) {
      acaoHtml = `
        <button type="button" class="btn-item-esgotado" disabled>
          <i class="fas fa-ban"></i> Esgotado
        </button>
      `;
    } else if (regCarrinho) {
      acaoHtml = `
        <button
          type="button"
          class="btn-item-no-carrinho"
          data-action="rem-item-carrinho"
          data-item-id="${item.id}"
          data-ata-id="${ata.id}"
          title="Remover do carrinho"
        >
          <i class="fas fa-check-circle"></i>
          No carrinho (${this.formatarQtdInput(qtdNoCarrinho, unidade)})
        </button>
        <button
          type="button"
          class="btn-item-remover"
          data-action="rem-item-carrinho"
          data-item-id="${item.id}"
          data-ata-id="${ata.id}"
          title="Remover do carrinho"
        >
          <i class="fas fa-times"></i>
        </button>
      `;
    } else {
      acaoHtml = `
        <button
          type="button"
          class="btn-item-adicionar"
          data-action="add-item-carrinho"
          data-item-id="${item.id}"
          data-ata-id="${ata.id}"
          title="Adicionar ao carrinho"
        >
          <i class="fas fa-cart-plus"></i> Adicionar
        </button>
      `;
    }

    return `
      <tr data-item-id="${item.id}">
        <td style="text-align:center;font-weight:600;color:var(--neutral-500);">
          ${this.escaparHtml(item.item_numero || "—")}
        </td>
        <td>
          <div class="item-descricao-modal">
            ${this.escaparHtml(item.descricao || "—")}
            ${badgeCarrinho}
          </div>
        </td>
        <td class="numeric">${this.formatarQtdInput(contratado, unidade)}</td>
        <td class="numeric ${saldoClasse}">${this.formatarQtdInput(saldo, unidade)}</td>
        <td class="numeric">${this.sistema.ui.formatarMoeda(valorUnit)}</td>
        <td class="numeric">${this.sistema.ui.formatarMoeda(valorTotal)}</td>
        <td style="text-align:center;">
          <div class="item-acoes-modal">
            ${inputInlineHtml}
            ${acaoHtml}
          </div>
        </td>
      </tr>
    `;
  }

  // ============================================================
  // ✅ ATUALIZADO · ADICIONAR ITEM AO CARRINHO
  // ------------------------------------------------------------
  // Fluxo:
  //   1. Localiza a ata e o item no cache local (modal ou card)
  //   2. Valida saldo disponível
  //   3. Verifica se há input inline preenchido:
  //      · SIM → adiciona DIRETO (sem abrir mini-modal)
  //      · NÃO → abre o mini-modal para o usuário escolher
  //   4. Adiciona / atualiza no carrinho
  //   5. Re-renderiza card e/ou modal
  //
  // ✅ NOVO COMPORTAMENTO:
  //   Se o usuário digitou uma quantidade no input inline e
  //   clicou em [Adicionar], a operação é executada direto,
  //   sem abrir o mini-modal. O mini-modal só aparece quando
  //   o input está vazio (fallback / conveniência).
  // ============================================================
  async adicionarItemAoCarrinhoInline(ataId, itemId) {
    // ---------------------------------------------------------
    // 1) Localiza a ata (modal aberto tem prioridade, senão cache)
    // ---------------------------------------------------------
    let ata = this._ataModalAberta;

    if (!ata || String(ata.id) !== String(ataId)) {
      ata = (this._atasCache || []).find((a) => String(a.id) === String(ataId));
    }

    if (!ata) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        "A ata não foi encontrada. Recarregue a lista e tente novamente.",
      );
      return;
    }

    const item = (ata.itens || []).find((i) => String(i.id) === String(itemId));
    if (!item) {
      this.sistema.ui.mostrarToast("erro", "Item não encontrado.");
      return;
    }

    const unidade = this._normalizarUnidade(item.unidade_medida);
    const saldo = item.saldo_quantidade || 0;
    if (saldo <= 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Item esgotado",
        "Não há saldo disponível para este item.",
      );
      return;
    }

    // ---------------------------------------------------------
    // 2) Dados atuais no carrinho
    // ---------------------------------------------------------
    const regExistente = this._buscarNoCarrinho(ata.id, item.id);
    const qtdAtual = regExistente?.quantidade || 0;
    const saldoRestante = saldo - qtdAtual;

    if (saldoRestante <= 0) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Saldo insuficiente",
        `Você já tem ${this.formatarQtdInput(qtdAtual, unidade)} ${unidade} no carrinho. O saldo total é ${this.formatarQtdInput(saldo, unidade)} ${unidade}.`,
      );
      return;
    }

    // ---------------------------------------------------------
    // 2.b) ✅ NOVO · Lê a quantidade do input inline (se houver)
    // ---------------------------------------------------------
    // Se o usuário digitou uma quantidade no input inline do modal,
    // adicionamos DIRETO — sem abrir o mini-modal.
    //
    // Se o input não existir ou estiver vazio, caímos no mini-modal
    // (fallback / conveniência) com valor inicial = 1.
    // ---------------------------------------------------------
    let quantidadeEscolhida = null;
    const inputInline = document.querySelector(
      `[data-qtd-inline-for="${item.id}"]`,
    );

    if (inputInline && inputInline.value) {
      const parsed = this.parseQtdInput(inputInline.value, unidade);

      if (parsed > 0) {
        // -------- Valida contra o saldo restante --------
        if (parsed > saldoRestante) {
          this.sistema.ui.mostrarToast(
            "erro",
            "Saldo insuficiente",
            `Você tentou adicionar ${this.formatarQtdInput(parsed, unidade)} ${unidade}, mas só há ${this.formatarQtdInput(saldoRestante, unidade)} ${unidade} disponível.`,
          );
          // Limpa o input para o usuário tentar de novo
          inputInline.value = "";
          return;
        }

        // ✅ Quantidade válida → usa direto, sem mini-modal
        quantidadeEscolhida = parsed;
      }
    }

    // ---------------------------------------------------------
    // 3) Se NÃO veio do input inline, abre o mini-modal
    // ---------------------------------------------------------
    if (quantidadeEscolhida === null) {
      try {
        quantidadeEscolhida = await this._abrirMiniModalQtd({
          item,
          saldo,
          qtdAtual,
          saldoRestante,
          qtdSugerida: null, // sem sugestão — usuário digita no modal
        });
      } catch (e) {
        // Usuário cancelou — silencioso
        return;
      }
    }

    if (!quantidadeEscolhida || quantidadeEscolhida <= 0) return;

    // ---------------------------------------------------------
    // 4) Executa a adição ao carrinho
    // ---------------------------------------------------------
    this._executarAdicaoAoCarrinho({
      ata,
      item,
      unidade,
      quantidadeEscolhida,
      regExistente,
      qtdAtual,
      saldo,
    });
  }

  // ============================================================
  // ✅ NOVO · EXECUTAR A ADIÇÃO AO CARRINHO
  // ------------------------------------------------------------
  // Extraído de adicionarItemAoCarrinhoInline() para ser reusado
  // tanto pelo fluxo DIRETO (input inline preenchido) quanto
  // pelo fluxo via MINI-MODAL.
  //
  // Responsabilidades:
  //   · Inserir/atualizar o registro no carrinho
  //   · Persistir via salvarCarrinhoStorage()
  //   · Mostrar toast de feedback
  //   · Re-renderizar modal aberto + card específico
  // ============================================================
  _executarAdicaoAoCarrinho({
    ata,
    item,
    unidade,
    quantidadeEscolhida,
    regExistente,
    qtdAtual,
    saldo,
  }) {
    const qtdNova = qtdAtual + quantidadeEscolhida;

    // Valida saldo (defensivo — quem chama já validou)
    if (qtdNova > saldo) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Saldo insuficiente",
        `Você já tem ${this.formatarQtdInput(qtdAtual, unidade)} ${unidade} no carrinho. O saldo disponível é ${this.formatarQtdInput(saldo, unidade)} ${unidade}.`,
      );
      return;
    }

    try {
      if (regExistente) {
        // Item já está no carrinho → apenas soma
        regExistente.quantidade = qtdNova;
        regExistente.valorTotal = regExistente.valorUnitario * qtdNova;
      } else {
        // Novo item no carrinho
        const numeroPedido = `PED-${new Date().getFullYear()}-${String(
          Math.floor(Math.random() * 9000 + 1000),
        )}`;

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
          itemUnidade: unidade,
          quantidade: quantidadeEscolhida,
          valorUnitario: item.valor_unitario || 0,
          valorTotal: (item.valor_unitario || 0) * quantidadeEscolhida,
          numeroPedido: numeroPedido,
          data: new Date().toISOString().split("T")[0],
          solicitante: this.sistema.usuarioAtual?.nome,
          orgaoId: this.sistema.usuarioAtual?.orgao_id,
        });
      }

      // Persiste + propaga (salvarCarrinhoStorage já notifica a Consulta)
      this.sistema.salvarCarrinhoStorage();

      // Feedback
      this.sistema.ui.mostrarToast(
        "sucesso",
        "Adicionado ao carrinho",
        `${this.formatarQtdInput(quantidadeEscolhida, unidade)} ${unidade} de "${this.escaparHtml(item.descricao?.slice(0, 40) || "Item")}" (total: ${this.formatarQtdInput(qtdNova, unidade)} ${unidade})`,
      );

      // ============================================================
      // RE-RENDERIZA O QUE ESTIVER VISÍVEL
      // ============================================================
      // Se o modal está aberto com essa ata, re-renderiza
      if (
        this._ataModalAberta &&
        String(this._ataModalAberta.id) === String(ata.id)
      ) {
        this.renderizarConteudoModalDetalhes(ata);
      }

      // Re-renderiza o card específico
      this._atualizarCardEspecifico(ata.id);
    } catch (err) {
      console.error("[Consulta] Erro ao adicionar item:", err);
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro",
        "Não foi possível adicionar o item.",
      );
    }
  }

  // ============================================================
  // ✅ NOVO · MINI-MODAL DE QUANTIDADE
  // ------------------------------------------------------------
  // Abre uma caixinha compacta (não bloqueia o modal de detalhes
  // por trás) para o usuário escolher a quantidade.
  //
  // Retorna Promise<number>:
  //   · Resolve com a quantidade escolhida
  //   · Rejeita se o usuário cancelar
  //
  // Estrutura:
  //   · Cabeçalho com título
  //   · Info: descrição, saldo, valor unitário, "já no carrinho"
  //   · Controles: [-][input][unidade][+]  (max = saldoRestante)
  //   · Total calculado em tempo real
  //   · Botões Cancelar / Adicionar
  //
  // ✅ ATUALIZADO · Suporta unidades decimais (KG, L, ...):
  //   · Input aceita vírgula ou ponto
  //   · Passo (+/-) adapta-se à precisão da unidade
  //   · Total usa parseQtdInput para cálculo consistente
  //
  // ✅ NOTA · Este mini-modal é agora um FALLBACK: só é chamado
  // quando o input inline está vazio. Continua funcionando como
  // antes (com qtdSugerida opcional para compatibilidade).
  // ============================================================
  _abrirMiniModalQtd({ item, saldo, qtdAtual, saldoRestante, qtdSugerida }) {
    return new Promise((resolve, reject) => {
      // Remove qualquer mini-modal anterior
      document.getElementById("__miniModalQtd")?.remove();

      const descricaoCurta =
        (item.descricao || "Item").length > 80
          ? (item.descricao || "").slice(0, 77) + "..."
          : item.descricao || "Item";

      const unidade = this._normalizarUnidade(item.unidade_medida);
      const aceitaDecimais = this._unidadeAceitaDecimais(unidade);
      const precisao = this._precisaoUnidade(unidade);
      const step = aceitaDecimais ? Math.pow(10, -precisao) : 1;

      const valorUnit = this.sistema.ui.formatarMoeda(item.valor_unitario || 0);

      // Valor inicial do input: prioriza qtdSugerida (vinda do
      // input inline), senão começa em 1
      const qtdInicial =
        qtdSugerida && qtdSugerida > 0
          ? Math.min(qtdSugerida, saldoRestante)
          : 1;

      const overlay = document.createElement("div");
      overlay.id = "__miniModalQtd";
      overlay.className = "mini-modal-overlay";

      overlay.innerHTML = `
        <div class="mini-modal-qtd" role="dialog" aria-modal="true">
          <div class="mini-modal-header">
            <h3>
              <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
            </h3>
            <button type="button" class="mini-modal-close" aria-label="Fechar">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="mini-modal-body">
            <div class="mini-modal-item-info">
              <span class="mini-modal-item-numero">#${this.escaparHtml(item.item_numero || "—")}</span>
              <span class="mini-modal-item-descricao">${this.escaparHtml(descricaoCurta)}</span>
            </div>

            <div class="mini-modal-meta">
              <div class="mini-modal-meta-linha">
                <span><i class="fas fa-cubes"></i> Saldo disponível:</span>
                <strong>${this.formatarQtdInput(saldo, unidade)} ${unidade}</strong>
              </div>
              <div class="mini-modal-meta-linha">
                <span><i class="fas fa-tag"></i> Valor unitário:</span>
                <strong>${valorUnit}</strong>
              </div>
              ${
                qtdAtual > 0
                  ? `<div class="mini-modal-meta-linha mini-modal-meta-aviso">
                       <span><i class="fas fa-check-circle"></i> Já no carrinho:</span>
                       <strong>${this.formatarQtdInput(qtdAtual, unidade)} ${unidade}</strong>
                     </div>`
                  : ""
              }
            </div>

            <div class="mini-modal-qtd-label">
              <label for="__qtdInput">
                Quantidade a adicionar
              </label>
              <span class="mini-modal-qtd-hint">
                (máx: ${this.formatarQtdInput(saldoRestante, unidade)} ${unidade})
              </span>
            </div>

            <div class="mini-modal-qtd-controls ${
              aceitaDecimais ? "mini-modal-com-unidade" : ""
            }">
              <button type="button" class="btn-qtd-minus" aria-label="Diminuir">
                <i class="fas fa-minus"></i>
              </button>
              <input
                type="number"
                id="__qtdInput"
                class="mini-modal-qtd-input"
                value="${this.formatarQtdInput(qtdInicial, unidade)}"
                min="0"
                max="${saldoRestante}"
                step="${step}"
                inputmode="${aceitaDecimais ? "decimal" : "numeric"}"
                autocomplete="off"
              />
              ${
                aceitaDecimais
                  ? `<span class="mini-modal-qtd-unidade">${unidade}</span>`
                  : ""
              }
              <button type="button" class="btn-qtd-plus" aria-label="Aumentar">
                <i class="fas fa-plus"></i>
              </button>
            </div>

            <div class="mini-modal-total">
              <span>Total:</span>
              <strong id="__qtdTotal">${this.sistema.ui.formatarMoeda(
                (item.valor_unitario || 0) * qtdInicial,
              )}</strong>
            </div>
          </div>

          <div class="mini-modal-footer">
            <button type="button" class="mini-modal-btn-cancelar">
              Cancelar
            </button>
            <button type="button" class="mini-modal-btn-confirmar">
              <i class="fas fa-cart-plus"></i> Adicionar
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // ---------- Handlers ----------
      const input = overlay.querySelector("#__qtdInput");
      const totalEl = overlay.querySelector("#__qtdTotal");
      const btnMinus = overlay.querySelector(".btn-qtd-minus");
      const btnPlus = overlay.querySelector(".btn-qtd-plus");
      const btnCancelar = overlay.querySelector(".mini-modal-btn-cancelar");
      const btnConfirmar = overlay.querySelector(".mini-modal-btn-confirmar");
      const btnClose = overlay.querySelector(".mini-modal-close");

      const atualizarTotal = () => {
        // ✅ Usa parseQtdInput para normalizar (aceita vírgula/ponto)
        let qtd = this.parseQtdInput(input.value, unidade);

        // Clamp: entre step e saldoRestante
        if (qtd < step) qtd = step;
        if (qtd > saldoRestante) qtd = saldoRestante;

        input.value = this.formatarQtdInput(qtd, unidade);

        const total = (item.valor_unitario || 0) * qtd;
        totalEl.textContent = this.sistema.ui.formatarMoeda(total);
      };

      const fechar = (resultado) => {
        overlay.classList.add("mini-modal-saindo");
        setTimeout(() => {
          overlay.remove();
          if (resultado === undefined) {
            reject(new Error("cancelado"));
          } else {
            resolve(resultado);
          }
        }, 180);
      };

      btnMinus.addEventListener("click", () => {
        const v = this.parseQtdInput(input.value, unidade) || step;
        input.value = this.formatarQtdInput(Math.max(step, v - step), unidade);
        atualizarTotal();
      });

      btnPlus.addEventListener("click", () => {
        const v = this.parseQtdInput(input.value, unidade) || step;
        input.value = this.formatarQtdInput(
          Math.min(saldoRestante, v + step),
          unidade,
        );
        atualizarTotal();
      });

      input.addEventListener("input", atualizarTotal);

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          btnConfirmar.click();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          btnCancelar.click();
        }
      });

      btnCancelar.addEventListener("click", () => fechar(undefined));
      btnClose.addEventListener("click", () => fechar(undefined));

      btnConfirmar.addEventListener("click", () => {
        let qtd = this.parseQtdInput(input.value, unidade);
        if (qtd < step) qtd = step;
        if (qtd > saldoRestante) qtd = saldoRestante;
        fechar(qtd);
      });

      // Fechar clicando no overlay (fora do card)
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fechar(undefined);
      });

      // Foco automático no input
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    });
  }

  // ============================================================
  // ✅ NOVO · REMOVER ITEM DO CARRINHO (via modal inline OU via card)
  // ------------------------------------------------------------
  // Se o item tem quantidade > 1, diminui em 1 (ou no passo da
  // unidade). Se é a quantidade mínima, remove a entrada inteira.
  //
  // Pergunta antes de remover totalmente (para evitar clique
  // acidental em "Remover" e perder o item inteiro).
  //
  // ✅ ATUALIZADO · Agora:
  //   · Suporta unidades decimais (KG, L, ...) no decremento
  //   · Usa formatarQtdInput nas mensagens (mostra unidade)
  // ============================================================
  async removerItemDoCarrinhoInline(ataId, itemId) {
    const reg = this._buscarNoCarrinho(ataId, itemId);
    if (!reg) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "Item não está no carrinho",
        "Nada a remover.",
      );
      return;
    }

    // Descobre a unidade (do próprio carrinho ou do cache de atas)
    let unidade = this._normalizarUnidade(reg.itemUnidade);
    if (unidade === "UN" && reg.itemId) {
      // fallback: tenta achar a unidade na ata em cache
      const ataCache = (this._atasCache || []).find(
        (a) => String(a.id) === String(ataId),
      );
      const itemCache = ataCache?.itens?.find(
        (i) => String(i.id) === String(itemId),
      );
      if (itemCache?.unidade_medida) {
        unidade = this._normalizarUnidade(itemCache.unidade_medida);
      }
    }

    const aceitaDecimais = this._unidadeAceitaDecimais(unidade);
    const precisao = this._precisaoUnidade(unidade);
    const step = aceitaDecimais ? Math.pow(10, -precisao) : 1;

    const qtdAtual = reg.quantidade || 0;
    const qtdFormatada = this.formatarQtdInput(qtdAtual, unidade);

    // Se a quantidade é maior que 1 step, reduz
    if (qtdAtual > step) {
      const novaQtd = Math.max(step, qtdAtual - step);
      reg.quantidade = parseFloat(novaQtd.toFixed(precisao));
      reg.valorTotal = reg.valorUnitario * reg.quantidade;

      this.sistema.salvarCarrinhoStorage();

      this.sistema.ui.mostrarToast(
        "info",
        "Quantidade reduzida",
        `Agora são ${this.formatarQtdInput(reg.quantidade, unidade)} ${unidade} no carrinho.`,
        2500,
      );
    } else {
      // Removeu o último — confirma antes
      const confirmado = await this.sistema.confirmar(
        `Deseja remover este item do carrinho? (${qtdFormatada} ${unidade})`,
      );
      if (!confirmado) return;

      this.sistema.carrinho = this.sistema.carrinho.filter(
        (c) =>
          !(
            String(c.ataId) === String(ataId) &&
            String(c.itemId) === String(itemId)
          ),
      );

      this.sistema.salvarCarrinhoStorage();

      this.sistema.ui.mostrarToast(
        "info",
        "Item removido",
        "O item foi retirado do carrinho.",
        2500,
      );
    }

    // ============================================================
    // RE-RENDERIZA O QUE ESTIVER VISÍVEL
    // ============================================================
    // Se o modal está aberto com esta ata, re-renderiza o conteúdo
    if (
      this._ataModalAberta &&
      String(this._ataModalAberta.id) === String(ataId)
    ) {
      this.renderizarConteudoModalDetalhes(this._ataModalAberta);
    }

    // Re-renderiza o card específico
    this._atualizarCardEspecifico(ataId);
  }

  // ============================================================
  // ✅ NOVO · ATUALIZAR UM CARD ESPECÍFICO
  // ------------------------------------------------------------
  // Re-renderiza apenas o HTML do card indicado, sem refetch e
  // sem tocar nos outros cards (rápido e sem "piscar" a tela).
  //
  // Usado após adicionar/remover item do carrinho, para que o
  // badge "X itens no carrinho" e o botão do item correspondente
  // sejam atualizados imediatamente.
  // ============================================================
  _atualizarCardEspecifico(ataId) {
    const idStr = String(ataId);
    const card = document.querySelector(`.ata-card[data-ata-id="${idStr}"]`);
    if (!card) return;

    const ata = (this._atasCache || []).find((a) => String(a.id) === idStr);
    if (!ata) return;

    const novoHtml = this.renderCardAta(ata);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = novoHtml.trim();
    const novoCard = wrapper.firstElementChild;
    if (novoCard) {
      card.replaceWith(novoCard);
    }
  }

  // ============================================================
  // MÉTODO ANTIGO MANTIDO PARA COMPATIBILIDADE
  // ------------------------------------------------------------
  // Antes, abrirDetalhesModal() redirecionava para a página
  // externa detalhes-ata.html. Agora delegamos para o modal
  // inline (mesmo comportamento de abrirDetalhes()).
  // ============================================================
  async abrirDetalhesModal(ataId) {
    console.warn(
      "⚠️ abrirDetalhesModal() está obsoleto. Use abrirDetalhes() (modal inline).",
    );
    return this.abrirDetalhes(ataId);
  }

  // ============================================================
  // MÉTODOS AUXILIARES PARA O DASHBOARD (mantidos)
  // ============================================================

  async getIndicadoresDashboard() {
    try {
      const { data: atasAtivas, error: e1 } = await supabase
        .from("atas")
        .select("id, valor_global, situacao")
        .in("situacao", ["ATIVA", "PROXIMA"]);

      if (e1) throw e1;

      const totalAtas = atasAtivas?.length || 0;
      const valorTotal =
        atasAtivas?.reduce((s, a) => s + (a.valor_global || 0), 0) || 0;

      const { data: itens, error: e2 } = await supabase
        .from("itens_ata")
        .select("id, quantidade_contratada, valor_unitario, ata_id, descricao")
        .in("ata_id", atasAtivas?.map((a) => a.id) || []);

      if (e2) throw e2;

      const { data: consumos, error: e3 } = await supabase
        .from("consumos")
        .select("item_ata_id, quantidade, valor_total");

      if (e3) throw e3;

      const consumoPorItem = {};
      consumos?.forEach((c) => {
        if (!consumoPorItem[c.item_ata_id]) {
          consumoPorItem[c.item_ata_id] = { quantidade: 0, valor: 0 };
        }
        consumoPorItem[c.item_ata_id].quantidade += c.quantidade || 0;
        consumoPorItem[c.item_ata_id].valor += c.valor_total || 0;
      });

      let saldoTotal = 0;
      let itensComSaldo = 0;
      let itensCriticos = 0;
      let totalItens = 0;

      itens?.forEach((item) => {
        totalItens++;
        const consumido = consumoPorItem[item.id]?.valor || 0;
        const valorContratado =
          (item.quantidade_contratada || 0) * (item.valor_unitario || 0);
        const saldoItem = Math.max(0, valorContratado - consumido);
        saldoTotal += saldoItem;

        if (saldoItem > 0) itensComSaldo++;

        if (
          saldoItem > 0 &&
          valorContratado > 0 &&
          saldoItem / valorContratado < 0.1
        ) {
          itensCriticos++;
        }
      });

      const valorConsumido =
        consumos?.reduce((s, c) => s + (c.valor_total || 0), 0) || 0;

      // Pedidos aguardando decisão representam valor reservado operacionalmente.
      // Pedidos já aprovados já foram convertidos em consumo e não entram aqui.
      const { data: pedidosPendentes, error: e4 } = await supabase
        .from("pedidos")
        .select("valor_total")
        .eq("status_aprovacao", "AGUARDANDO_APROVACAO");
      if (e4) throw e4;
      const valorReservado =
        pedidosPendentes?.reduce((s, p) => s + (p.valor_total || 0), 0) || 0;
      const saldoUtilizavel = Math.max(0, saldoTotal - valorReservado);

      return {
        totalAtas,
        valorTotal,
        saldoTotal,
        saldoUtilizavel,
        valorReservado,
        valorConsumido,
        itensCriticos,
        totalItens,
        itensComSaldo,
      };
    } catch (error) {
      console.error("Erro ao buscar indicadores para dashboard:", error);
      return null;
    }
  }

  async getConsumoPorCategoria() {
    try {
      const { data: consumos, error } = await supabase.from("consumos").select(`
          valor_total,
          ata_id,
          item_ata_id,
          itens_ata!inner (
            categoria,
            descricao
          )
        `);

      if (error) throw error;

      const categorias = {};
      consumos?.forEach((c) => {
        const categoria = c.itens_ata?.categoria || "Outros";
        if (!categorias[categoria]) {
          categorias[categoria] = 0;
        }
        categorias[categoria] += c.valor_total || 0;
      });

      return Object.entries(categorias)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([categoria, valor]) => ({ categoria, valor }));
    } catch (error) {
      console.error("Erro ao buscar consumo por categoria:", error);
      return [];
    }
  }

  async getVencimentosProximos() {
    try {
      const hoje = new Date();
      const trintaDias = new Date();
      trintaDias.setDate(trintaDias.getDate() + 30);

      const { data: atas, error } = await supabase
        .from("atas")
        .select(
          `
          id,
          numero_ata,
          data_fim_vigencia,
          fornecedor_id,
          fornecedores!inner (razao_social),
          valor_global,
          situacao
        `,
        )
        .gte("data_fim_vigencia", hoje.toISOString().split("T")[0])
        .lte("data_fim_vigencia", trintaDias.toISOString().split("T")[0])
        .in("situacao", ["ATIVA", "PROXIMA"])
        .order("data_fim_vigencia", { ascending: true });

      if (error) throw error;

      return (
        atas?.map((a) => ({
          id: a.id,
          numero_ata: a.numero_ata,
          data_fim_vigencia: a.data_fim_vigencia,
          fornecedor: a.fornecedores?.razao_social || "N/I",
          dias_restantes: Math.ceil(
            (new Date(a.data_fim_vigencia) - hoje) / (1000 * 60 * 60 * 24),
          ),
        })) || []
      );
    } catch (error) {
      console.error("Erro ao buscar vencimentos próximos:", error);
      return [];
    }
  }

  async getTopFornecedores(limit = 5) {
    try {
      const { data: fornecedores, error } = await supabase
        .from("fornecedores")
        .select(
          `
          id,
          razao_social,
          cnpj,
          atas!inner (
            id,
            valor_global,
            situacao
          )
        `,
        )
        .in("atas.situacao", ["ATIVA", "PROXIMA"]);

      if (error) throw error;

      if (!fornecedores) return [];

      const ranking = fornecedores
        .map((f) => {
          const total =
            f.atas?.reduce((s, a) => s + (a.valor_global || 0), 0) || 0;
          return {
            id: f.id,
            razao_social: f.razao_social || "N/I",
            cnpj: f.cnpj || "",
            total,
            total_atas: f.atas?.length || 0,
          };
        })
        .filter((f) => f.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);

      return ranking;
    } catch (error) {
      console.error("Erro ao buscar top fornecedores:", error);
      return [];
    }
  }

  async getEvolucaoConsumo(meses = 6) {
    try {
      const hoje = new Date();
      const dataInicio = new Date();
      dataInicio.setMonth(dataInicio.getMonth() - meses);

      const { data: consumos, error } = await supabase
        .from("consumos")
        .select("valor_total, data_consumo, created_at")
        .gte("data_consumo", dataInicio.toISOString().split("T")[0])
        .order("data_consumo", { ascending: true });

      if (error) throw error;

      const mesesMap = {};
      const mesesLabels = [];
      for (let i = meses - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("pt-BR", {
          month: "short",
          year: "numeric",
        });
        mesesMap[key] = { total: 0, label: label };
        mesesLabels.push(key);
      }

      consumos?.forEach((c) => {
        const data = c.data_consumo || c.created_at;
        if (data) {
          const d = new Date(data);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (mesesMap[key]) {
            mesesMap[key].total += c.valor_total || 0;
          }
        }
      });

      return mesesLabels.map((key) => ({
        mes: key,
        label: mesesMap[key]?.label || key,
        valor: mesesMap[key]?.total || 0,
      }));
    } catch (error) {
      console.error("Erro ao buscar evolução de consumo:", error);
      return [];
    }
  }

  async getAtividadesRecentes(limit = 5) {
    try {
      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select(
          `
          id,
          numero_pedido,
          status_aprovacao,
          created_at,
          usuarios!inner (nome),
          atas!inner (numero_ata)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(limit * 2);

      if (error) throw error;

      if (!pedidos) return [];

      return pedidos.slice(0, limit).map((p) => ({
        id: p.id,
        numero_pedido: p.numero_pedido || "N/I",
        status: p.status_aprovacao || "PEDIDO_REALIZADO",
        data: p.created_at,
        usuario: p.usuarios?.nome || "Usuário",
        ata: p.atas?.numero_ata || "N/I",
      }));
    } catch (error) {
      console.error("Erro ao buscar atividades recentes:", error);
      return [];
    }
  }

  async getStatusDistribuicaoAtas() {
    try {
      const { data: atas, error } = await supabase
        .from("atas")
        .select("situacao");

      if (error) throw error;

      const statusCount = {
        ATIVA: 0,
        PROXIMA: 0,
        VENCIDA: 0,
        CANCELADA: 0,
        ENCERRADA: 0,
      };

      atas?.forEach((a) => {
        const status = a.situacao || "ATIVA";
        if (statusCount.hasOwnProperty(status)) {
          statusCount[status]++;
        } else {
          statusCount[status] = (statusCount[status] || 0) + 1;
        }
      });

      return Object.fromEntries(
        Object.entries(statusCount).filter(([_, value]) => value > 0),
      );
    } catch (error) {
      console.error("Erro ao buscar distribuição de status das atas:", error);
      return {};
    }
  }

  async getStatusDistribuicaoPedidos() {
    try {
      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select("status_aprovacao");

      if (error) throw error;

      const statusCount = {
        APROVADO: 0,
        REPROVADO: 0,
        AGUARDANDO_APROVACAO: 0,
        PEDIDO_REALIZADO: 0,
      };

      pedidos?.forEach((p) => {
        const status = p.status_aprovacao || "PEDIDO_REALIZADO";
        if (statusCount.hasOwnProperty(status)) {
          statusCount[status]++;
        } else {
          statusCount[status] = (statusCount[status] || 0) + 1;
        }
      });

      return Object.fromEntries(
        Object.entries(statusCount).filter(([_, value]) => value > 0),
      );
    } catch (error) {
      console.error(
        "Erro ao buscar distribuição de status dos pedidos:",
        error,
      );
      return {};
    }
  }
}
