import { supabase } from "../supabase.js";

export class Cadastro {
  constructor(sistema) {
    this.sistema = sistema;
    this.itensCadastroTemp = [];
    this.atasCache = [];
    this.filtroTimer = null;
  }

  // ============================================================
  // CARREGAR CONTEÚDO DA ABA DE CADASTRO
  // ============================================================
  async carregarConteudo() {
    const container = document.getElementById("cadastroContent");
    container.innerHTML = this.gerarHTMLCadastro();
    this.itensCadastroTemp = [];
    this.renderizarItensCadastro();
    await this.sistema.carregarCategorias();
    this.configurarEventos();

    // Carregar lista de atas e indicadores
    await this.carregarListaAtas();
  }

  // ============================================================
  // GERAR HTML DA ABA DE CADASTRO
  // ============================================================
  gerarHTMLCadastro() {
    return `
      <div class="cadastro-container">
        <!-- ============================================================ -->
        <!-- INDICADORES RÁPIDOS                                           -->
        <!-- ============================================================ -->
        <div class="cadastro-indicadores">
          <div class="indicador-card">
            <span class="indicador-numero" id="totalCadastro">0</span>
            <span class="indicador-label">Total de Atas</span>
          </div>
          <div class="indicador-card indicador-ativa">
            <span class="indicador-numero" id="ativasCadastro">0</span>
            <span class="indicador-label">Ativas</span>
          </div>
          <div class="indicador-card indicador-proxima">
            <span class="indicador-numero" id="proximasCadastro">0</span>
            <span class="indicador-label">Próximas</span>
          </div>
          <div class="indicador-card indicador-vencida">
            <span class="indicador-numero" id="vencidasCadastro">0</span>
            <span class="indicador-label">Vencidas</span>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- FILTROS E AÇÕES                                              -->
        <!-- ============================================================ -->
        <div class="cadastro-filtros">
          <div class="filtro-busca">
            <i class="fas fa-search"></i>
            <input
              type="text"
              id="buscaCadastro"
              class="filtro-input"
              placeholder="Buscar por nº da ata, fornecedor, CPF/CNPJ, objeto ou vigência..."
            />
          </div>
          <select id="filtroStatusCadastro" class="filtro-select">
            <option value="todos">Todos os status</option>
            <option value="ATIVA">🟢 Ativa</option>
            <option value="PROXIMA">🟡 Próxima</option>
            <option value="VENCIDA">🔴 Vencida</option>
          </select>
          <button class="btn-nova-ata" id="btnNovaAta">
            <i class="fas fa-plus"></i> Nova Ata
          </button>
        </div>

        <!-- ============================================================ -->
        <!-- LISTA DE ATAS CADASTRADAS                                    -->
        <!-- ============================================================ -->
        <div id="listaAtasCadastro" class="atas-grid">
          <!-- Cards serão inseridos via JavaScript -->
        </div>

        <!-- ============================================================ -->
        <!-- SEPARADOR                                                    -->
        <!-- ============================================================ -->
        <div class="cadastro-divider">
          <span><i class="fas fa-arrow-down"></i> Formulário de Cadastro</span>
        </div>

        <!-- ============================================================ -->
        <!-- FORMULÁRIO DE CADASTRO                                       -->
        <!-- ============================================================ -->
        <div class="cadastro-form-wrapper">
          <div class="cadastro-header">
            <div class="cadastro-titulo">
              <i class="fas fa-file-signature"></i> Cadastrar Ata
            </div>
            <button id="btnExtracao" class="btn-extracao">
              <i class="fas fa-file-code"></i> Carregar JSON
            </button>
          </div>
          <input type="file" id="fileJsonInput" accept=".json,application/json" data-intranet-style="2d281201779c">
          <form id="formCadastroAta">
            <div class="cadastro-secao">
              <div class="secao-titulo"><i class="fas fa-gavel"></i> Processo</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Nº Processo</label>
                  <input type="text" id="processoNumero" required>
                </div>
                <div class="form-group">
                  <label>Nº Pregão</label>
                  <input type="text" id="pregaoNumero">
                </div>
                <div class="form-group">
                  <label>Modalidade (conforme edital)</label>
                  <input type="text" id="modalidade" list="modalidadesSugestao" required placeholder="Ex.: Pregão eletrônico">
                  <datalist id="modalidadesSugestao">
                    <option value="Pregão eletrônico"></option>
                    <option value="Pregão presencial"></option>
                    <option value="Concorrência eletrônica"></option>
                    <option value="Concorrência presencial"></option>
                    <option value="Concurso"></option>
                    <option value="Leilão"></option>
                    <option value="Diálogo competitivo"></option>
                    <option value="Dispensa de licitação"></option>
                    <option value="Inexigibilidade de licitação"></option>
                    <option value="Registro de preços"></option>
                    <option value="Credenciamento"></option>
                  </datalist>
                  <small class="campo-ajuda-modalidade">Use a denominação que consta no edital ou na ata; mantenha procedimentos como registro de preços conforme o documento.</small>
                </div>
                <div class="form-group">
                  <label>Nº Ata</label>
                  <input type="text" id="ataNumero" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Assinatura</label>
                  <input type="date" id="dataAssinatura" required>
                </div>
                <div class="form-group">
                  <label>Início Vigência</label>
                  <input type="date" id="vigenciaInicio" required>
                </div>
                <div class="form-group">
                  <label>Fim Vigência</label>
                  <input type="date" id="vigenciaFim" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Objeto</label>
                  <textarea id="objeto" rows="2" required></textarea>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Categoria/Gênero</label>
                  <input type="text" id="categoriaInput" class="filtro-input" placeholder="Digite ou selecione uma categoria" list="categoriasList">
                  <datalist id="categoriasList"></datalist>
                </div>
              </div>
            </div>

            <div class="cadastro-secao">
              <div class="secao-titulo"><i class="fas fa-building"></i> Fornecedor</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Razão Social</label>
                  <input type="text" id="fornecedorRazao" required>
                </div>
                <div class="form-group">
                  <label>CPF/CNPJ</label>
                  <input type="text" id="fornecedorCnpj" required inputmode="numeric" maxlength="18" placeholder="Digite CPF ou CNPJ">
                </div>
              </div>
            </div>

            <div class="cadastro-secao">
              <div class="secao-titulo"><i class="fas fa-boxes"></i> Itens</div>
              <div class="itens-cadastro-header">
                <span>Total: <span id="totalItensCadastro">0</span></span>
                <button type="button" class="btn-adicionar-item" id="btnAdicionarItem">
                  <i class="fas fa-plus"></i> Adicionar
                </button>
              </div>
              <div class="tabela-container">
                <table class="tabela-itens-cadastro" id="tabelaItensCadastro">
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Descrição</th>
                      <th>Qtd</th>
                      <th>Valor Unit.</th>
                      <th>Valor Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="itensCadastroBody"></tbody>
                  <tfoot>
                    <tr>
                      <td colspan="4" data-intranet-style="4764267ddc80">VALOR TOTAL:</td>
                      <td id="valorTotalAta" data-intranet-style="9625382520ed">R$ 0,00</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <button type="submit" class="btn-salvar-ata">
              <i class="fas fa-save"></i> Salvar Ata
            </button>
          </form>
        </div>
      </div>
    `;
  }

  // ============================================================
  // CONFIGURAR EVENTOS
  // ============================================================
  configurarEventos() {
    // Botão carregar JSON
    document.getElementById("btnExtracao").addEventListener("click", () => {
      document.getElementById("fileJsonInput").click();
    });
    document.getElementById("fileJsonInput").addEventListener("change", (e) => {
      this.processarArquivoJson(e.target.files[0]);
    });

    const documentoInput = document.getElementById("fornecedorCnpj");
    documentoInput.addEventListener("input", (e) => {
      e.target.value = this.formatarDocumento(e.target.value);
    });
    documentoInput.addEventListener("blur", (e) => {
      const valor = e.target.value.trim();
      if (valor && !this.sistema.ui.validarDocumento(valor)) {
        this.sistema.ui.mostrarToast("erro", "Informe um CPF ou CNPJ válido.");
      }
    });

    // Botão adicionar item
    document
      .getElementById("btnAdicionarItem")
      .addEventListener("click", () => {
        this.adicionarItemCadastro();
      });

    // Submit do formulário
    document
      .getElementById("formCadastroAta")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.salvarAta();
      });

    // Botão Nova Ata
    document.getElementById("btnNovaAta").addEventListener("click", () => {
      this.novaAta();
    });

    // Filtros
    const buscaInput = document.getElementById("buscaCadastro");
    if (buscaInput) {
      buscaInput.addEventListener("input", () =>
        this.debounceFiltrarListaAtas(),
      );
    }

    const filtroStatus = document.getElementById("filtroStatusCadastro");
    if (filtroStatus) {
      filtroStatus.addEventListener("change", () => this.filtrarListaAtas());
    }
  }

  // ============================================================
  // DEBOUNCE PARA FILTRAR LISTA DE ATAS
  // ============================================================
  debounceFiltrarListaAtas() {
    clearTimeout(this.filtroTimer);
    this.filtroTimer = setTimeout(() => this.filtrarListaAtas(), 400);
  }

  // ============================================================
  // CARREGAR LISTA DE ATAS CADASTRADAS
  // ============================================================
  async carregarListaAtas() {
    try {
      const { data: atas, error } = await supabase
        .from("atas")
        .select(
          `
          *,
          fornecedor:fornecedores(razao_social, cnpj),
          categoria:categorias(id, nome)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      this.atasCache = atas || [];
      this.filtrarListaAtas();
      this.atualizarIndicadores();
    } catch (error) {
      console.error("Erro ao carregar lista de atas:", error);
      this.sistema.ui.mostrarToast("erro", "Erro ao carregar lista de atas.");
    }
  }

  // ============================================================
  // FILTRAR LISTA DE ATAS
  // ============================================================
  filtrarListaAtas() {
    const busca =
      document.getElementById("buscaCadastro")?.value?.toLowerCase() || "";
    const statusFiltro =
      document.getElementById("filtroStatusCadastro")?.value || "todos";

    let atasFiltradas = this.atasCache;

    // Filtro por texto
    if (busca) {
      atasFiltradas = atasFiltradas.filter((a) => {
        const numeroAta = a.numero_ata?.toLowerCase() || "";
        const fornecedor = a.fornecedor?.razao_social?.toLowerCase() || "";
        const cnpj = a.fornecedor?.cnpj?.replace(/\D/g, "") || "";
        const objeto = a.objeto?.toLowerCase() || "";
        const vigencia = a.data_fim_vigencia || "";
        const processo = a.processo_administrativo?.toLowerCase() || "";
        const modalidade = a.modalidade?.toLowerCase() || "";

        return (
          numeroAta.includes(busca) ||
          fornecedor.includes(busca) ||
          cnpj.includes(busca.replace(/\D/g, "")) ||
          objeto.includes(busca) ||
          vigencia.includes(busca) ||
          processo.includes(busca) ||
          modalidade.includes(busca)
        );
      });
    }

    // Filtro por status
    if (statusFiltro !== "todos") {
      atasFiltradas = atasFiltradas.filter((a) => a.situacao === statusFiltro);
    }

    this.renderizarCardsAtas(atasFiltradas);
  }

  // ============================================================
  // RENDERIZAR CARDS DE ATAS
  // ============================================================
  renderizarCardsAtas(atas) {
    const container = document.getElementById("listaAtasCadastro");
    if (!container) return;
    const escaparTexto = (valor) =>
      String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[caractere]);

    if (atas.length === 0) {
      container.innerHTML = `
        <div data-intranet-style="97856deabe09">
          <i class="fas fa-inbox" data-intranet-style="e4936772c3d8"></i>
          Nenhuma ata encontrada
        </div>
      `;
      return;
    }

    container.innerHTML = atas
      .map((ata) => {
        const statusClass =
          {
            ATIVA: "status-ativa",
            PROXIMA: "status-proxima",
            VENCIDA: "status-vencida",
          }[ata.situacao] || "status-ativa";

        const statusLabel = ata.situacao || "ATIVA";
        const fornecedorNome = ata.fornecedor?.razao_social || "N/I";
        const cnpj = ata.fornecedor?.cnpj || "";
        const cnpjFormatado = cnpj ? this.formatarDocumento(cnpj) : "";
        const valorFormatado = this.sistema.ui.formatarMoeda(
          ata.valor_global || 0,
        );
        const inicioVigencia = this.sistema.ui.formatarData(
          ata.data_inicio_vigencia,
        );
        const fimVigencia = this.sistema.ui.formatarData(ata.data_fim_vigencia);
        const modalidade = String(ata.modalidade || "").trim();
        const processo = String(ata.processo_administrativo || "").trim();
        const modalidadeClass = modalidade ? "" : " ata-modalidade-nao-cadastrada";

        return `
        <div class="ata-card" onclick="sistema.cadastro.verDetalhes(${ata.id})">
          <div class="ata-header">
            <div class="ata-status">
              <span class="status-badge ${statusClass}">${statusLabel}</span>
              <span data-intranet-style="69e13dbf3557">
                <i class="fas fa-box"></i> ${ata.itens?.length || 0}
              </span>
            </div>
            <div class="ata-numero">Ata nº ${ata.numero_ata || ""}</div>
            <div class="ata-contexto-modalidade">
              <span class="ata-modalidade-badge${modalidadeClass}"><i class="fas fa-gavel"></i> ${escaparTexto(modalidade || "Modalidade não cadastrada")}</span>
              <span class="ata-contexto-processo">Processo: ${escaparTexto(processo || "não informado")}</span>
            </div>
            <div class="ata-fornecedor">
              <i class="fas fa-building"></i> ${fornecedorNome}
              ${cnpjFormatado ? ` <span data-intranet-style="03ed1694ecb2">(${cnpjFormatado})</span>` : ""}
            </div>
            <div data-intranet-style="2e4030ebf549">
              <i class="fas fa-calendar"></i> ${inicioVigencia}
              ${fimVigencia ? `até ${fimVigencia}` : ""}
            </div>
          </div>
          <div class="ata-footer">
            <span data-intranet-style="bd02e89ba2e4">${valorFormatado}</span>
            <div data-intranet-style="3f5ca708649a">
              <button class="btn-visualizar" onclick="event.stopPropagation(); sistema.cadastro.verDetalhes(${ata.id})" data-intranet-style="43c9e05efbdf">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn-editar" onclick="event.stopPropagation(); sistema.cadastro.editarAta(${ata.id})" data-intranet-style="b93d316f0b78">
                <i class="fas fa-pen"></i> Editar
              </button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // ============================================================
  // ATUALIZAR INDICADORES
  // ============================================================
  atualizarIndicadores() {
    const total = this.atasCache.length;
    const ativas = this.atasCache.filter((a) => a.situacao === "ATIVA").length;
    const proximas = this.atasCache.filter(
      (a) => a.situacao === "PROXIMA",
    ).length;
    const vencidas = this.atasCache.filter(
      (a) => a.situacao === "VENCIDA",
    ).length;

    document.getElementById("totalCadastro").textContent = total;
    document.getElementById("ativasCadastro").textContent = ativas;
    document.getElementById("proximasCadastro").textContent = proximas;
    document.getElementById("vencidasCadastro").textContent = vencidas;
  }

  // ============================================================
  // FORMATAR CPF OU CNPJ
  // ============================================================
  formatarDocumento(documento) {
    return this.sistema.ui.formatarDocumento(documento);
  }

  formatarCnpj(cnpj) {
    return this.formatarDocumento(cnpj);
  }

  // ============================================================
  // NOVA ATA - LIMPAR FORMULÁRIO
  // ============================================================
  novaAta() {
    // Limpar formulário
    document.getElementById("formCadastroAta").reset();
    this.itensCadastroTemp = [];
    this.renderizarItensCadastro();

    // Focar no primeiro campo
    document.getElementById("processoNumero").focus();

    // Scroll para o formulário
    const formWrapper = document.querySelector(".cadastro-form-wrapper");
    if (formWrapper) {
      formWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    this.sistema.ui.mostrarToast("info", "Formulário limpo para nova ata.");
  }

  // ============================================================
  // EDITAR ATA - REDIRECIONAR PARA PÁGINA DE EDIÇÃO
  // ============================================================
  editarAta(ataId) {
    // Verificar permissão (apenas ADMIN e ESTAGIARIO)
    const perfil = this.sistema.usuarioAtual?.perfil;
    if (perfil !== "ADMIN" && perfil !== "ESTAGIARIO") {
      this.sistema.ui.mostrarToast(
        "erro",
        "Apenas Administradores e Estagiários podem editar atas.",
      );
      return;
    }
    // CORRETO: editar-ata.html está em templates/
    window.location.href = `templates/editar-ata.html?id=${ataId}`;
  }

  // ============================================================
  // VER DETALHES - REDIRECIONAR PARA PÁGINA DE DETALHES
  // ============================================================
  verDetalhes(ataId) {
    // CORRIGIDO: detalhes-ata.html está na raiz do controle-de-saldos
    window.location.href = `detalhes-ata.html?id=${ataId}`;
  }

  // ============================================================
  // ADICIONAR ITEM AO CADASTRO
  // ============================================================
  adicionarItemCadastro() {
    this.itensCadastroTemp.push({
      id: Date.now(),
      numero: this.itensCadastroTemp.length + 1,
      descricao: "",
      quantidade: 0,
      valor_unitario: 0,
      valor_total: 0,
    });
    this.renderizarItensCadastro();
  }

  // ============================================================
  // REMOVER ITEM DO CADASTRO
  // ============================================================
  removerItemCadastro(id) {
    this.itensCadastroTemp = this.itensCadastroTemp.filter((i) => i.id !== id);
    this.itensCadastroTemp.forEach((item, idx) => (item.numero = idx + 1));
    this.renderizarItensCadastro();
  }

  // ============================================================
  // CALCULAR TOTAIS DOS ITENS
  // ============================================================
  calcularTotaisItem() {
    this.itensCadastroTemp.forEach((item) => {
      item.valor_total = (item.quantidade || 0) * (item.valor_unitario || 0);
    });
    this.renderizarItensCadastro();
  }

  // ============================================================
  // RENDERIZAR ITENS DO CADASTRO
  // ============================================================
  renderizarItensCadastro() {
    const tbody = document.getElementById("itensCadastroBody");
    if (!tbody) return;

    tbody.innerHTML = this.itensCadastroTemp
      .map(
        (item) => `
          <tr>
            <td><input type="text" value="${item.numero}" onchange="sistema.cadastro.atualizarItemCadastro(${item.id}, 'numero', this.value)" data-intranet-style="8d0831460ff2"></td>
            <td><input type="text" value="${item.descricao}" onchange="sistema.cadastro.atualizarItemCadastro(${item.id}, 'descricao', this.value)" placeholder="Descrição" data-intranet-style="47b319904078" required></td>
            <td><input type="number" value="${item.quantidade}" onchange="sistema.cadastro.atualizarItemCadastro(${item.id}, 'quantidade', parseInt(this.value)||0); sistema.cadastro.calcularTotaisItem();" min="0" data-intranet-style="77c67d2cb26b" required></td>
            <td><input type="number" value="${item.valor_unitario}" onchange="sistema.cadastro.atualizarItemCadastro(${item.id}, 'valor_unitario', parseFloat(this.value)||0); sistema.cadastro.calcularTotaisItem();" min="0" step="0.01" data-intranet-style="6eb0ab89214f" required></td>
            <td data-intranet-style="a5f9e7b252e1">${this.sistema.ui.formatarMoeda(item.valor_total)}</td>
            <td><button type="button" class="btn-remover-item" onclick="sistema.cadastro.removerItemCadastro(${item.id})" data-intranet-style="978de8a122c3"><i class="fas fa-trash"></i></button></td>
          </tr>
        `,
      )
      .join("");

    document.getElementById("totalItensCadastro").innerText =
      this.itensCadastroTemp.length;

    const totalAta = this.itensCadastroTemp.reduce(
      (s, i) => s + (i.valor_total || 0),
      0,
    );
    document.getElementById("valorTotalAta").innerText =
      this.sistema.ui.formatarMoeda(totalAta);
  }

  // ============================================================
  // ATUALIZAR ITEM DO CADASTRO
  // ============================================================
  atualizarItemCadastro(id, campo, valor) {
    const item = this.itensCadastroTemp.find((i) => i.id === id);
    if (item) item[campo] = valor;
  }

  // ============================================================
  // PROCESSAR ARQUIVO JSON
  // ------------------------------------------------------------
  // Fluxo:
  //   1. Lê o arquivo
  //   2. Faz parse do JSON
  //   3. Normaliza (plano ou aninhado → sempre plano)
  //   4. Valida o formato normalizado
  //   5. Preenche o formulário
  // ============================================================
  async processarArquivoJson(arquivo) {
    if (!arquivo) return;
    try {
      const btn = document.getElementById("btnExtracao");
      const textoOriginal = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
      btn.disabled = true;

      const conteudo = await this.lerArquivo(arquivo);
      const dadosBrutos = JSON.parse(conteudo);

      // Normaliza: aceita formato plano (legado) e aninhado (novo)
      const dados = this.normalizarJson(dadosBrutos);

      // Valida o formato normalizado (sempre plano)
      this.validarEstruturaJson(dados);

      // Preenche o formulário
      this.preencheFormularioComJson(dados);

      this.sistema.ui.mostrarToast(
        "sucesso",
        "JSON carregado com sucesso! Revise os dados antes de salvar.",
      );
    } catch (erro) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Erro ao processar JSON: " + erro.message,
      );
    } finally {
      const btn = document.getElementById("btnExtracao");
      btn.innerHTML = '<i class="fas fa-file-code"></i> Carregar JSON';
      btn.disabled = false;
      document.getElementById("fileJsonInput").value = "";
    }
  }

  // ============================================================
  // LER ARQUIVO
  // ============================================================
  lerArquivo(arquivo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Erro ao ler o arquivo"));
      reader.readAsText(arquivo);
    });
  }

  // ============================================================
  // NORMALIZAR CHAVE (para comparação de aliases)
  // ------------------------------------------------------------
  // Remove acentos, espaços e caracteres especiais
  // Ex: "Número do Processo" → "numerodoprocesso"
  // ============================================================
  normalizarChave(chave) {
    return String(chave)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  // ============================================================
  // BUSCAR CAMPO (com suporte a aliases)
  // ------------------------------------------------------------
  // Busca um valor no objeto usando múltiplos nomes alternativos.
  // Primeiro tenta match exato, depois tenta match normalizado.
  // ============================================================
  buscarCampo(obj, ...nomesAlternativos) {
    if (!obj || typeof obj !== "object") return undefined;

    // 1) Match exato
    for (const nome of nomesAlternativos) {
      if (obj[nome] !== undefined && obj[nome] !== null) return obj[nome];
    }

    // 2) Match normalizado
    const chavesObj = Object.keys(obj);
    for (const nome of nomesAlternativos) {
      const alvo = this.normalizarChave(nome);
      const encontrada = chavesObj.find(
        (k) => this.normalizarChave(k) === alvo,
      );
      if (encontrada !== undefined) {
        const valor = obj[encontrada];
        if (valor !== undefined && valor !== null) return valor;
      }
    }

    return undefined;
  }

  // ============================================================
  // PARSE DE VALOR MONETÁRIO (BR ou US)
  // ------------------------------------------------------------
  // Aceita: "1.234,56", "1234.56", "1234", 1234.56, "R$ 1.234,56"
  // ============================================================
  parseValorMonetario(valor) {
    if (valor === null || valor === undefined) return 0;
    if (typeof valor === "number") return valor;

    let str = String(valor).trim();
    if (!str) return 0;

    // Remove R$, espaços e outros símbolos
    str = str.replace(/[R$\s]/g, "");

    // Detecta formato BR: 1.234,56 ou 1234,56
    const temVirgulaDecimal = /,\d{1,2}$/.test(str);
    const temPontoMilhar = /\.\d{3}/.test(str);

    if (temVirgulaDecimal || temPontoMilhar) {
      // Formato BR: remove pontos de milhar, troca vírgula por ponto
      str = str.replace(/\./g, "").replace(",", ".");
    }
    // Senão assume formato US (1234.56) ou inteiro (1234)

    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  // ============================================================
  // NORMALIZAR DATA PARA O FORMATO DE INPUT (YYYY-MM-DD)
  // ------------------------------------------------------------
  // Aceita: "2026-05-12", "12/05/2026", "12-05-2026", "12.05.2026"
  // ============================================================
  normalizarDataParaInput(dataStr) {
    if (!dataStr) return "";
    const str = String(dataStr).trim();

    // Já está em YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
    const matchBR = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (matchBR) {
      const [, d, m, y] = matchBR;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    // Tenta converter via Date (ISO 8601 completo, etc)
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().split("T")[0];
    }

    return "";
  }

  // ============================================================
  // LIMPAR DESCRIÇÃO DUPLICADA
  // ------------------------------------------------------------
  // O PDF do "Saldo de Contratações" duplica a descrição:
  //   "CLORIDRATO DE LIDOCAÍNA 2% ... - CLORIDRATO DE LIDOCAÍNA 2% ..."
  // Este método mantém apenas a primeira metade quando as duas
  // são iguais ou muito similares.
  // ============================================================
  limparDescricaoDuplicada(descricao) {
    if (!descricao) return descricao;
    const str = String(descricao).trim();

    // Procura o separador " - " (com espaços ao redor)
    const partes = str.split(" - ");
    if (partes.length !== 2) return str;

    const [a, b] = partes.map((p) => p.trim());
    if (!a || !b) return str;

    // Se as duas metades são idênticas, mantém só a primeira
    if (a === b) return a;

    // Se uma contém a outra (ex: "X" e "X Y"), mantém a mais curta
    if (a.includes(b)) return b;
    if (b.includes(a)) return a;

    // Se são muito similares (mesmo início de 20+ chars), mantém a primeira
    if (
      a.length > 20 &&
      b.length > 20 &&
      a.substring(0, 20) === b.substring(0, 20)
    ) {
      return a;
    }

    return str;
  }

  // ============================================================
  // NORMALIZAR JSON
  // ------------------------------------------------------------
  // Detecta se o JSON veio no formato ANINHADO (novo) ou PLANO
  // (legado) e devolve SEMPRE um objeto plano com as chaves:
  //   numero_processo, numero_pregao, numero_ata, data_assinatura,
  //   vigencia_inicio, vigencia_fim, objeto, razao_social,
  //   cnpj_fornecedor, categoria, itens[]
  //
  // Cada item também é normalizado com as chaves:
  //   item, descricao, quant_contratada, valor_unitario, valor_total
  // ============================================================
  normalizarJson(dadosBrutos) {
    if (!dadosBrutos || typeof dadosBrutos !== "object") {
      return dadosBrutos;
    }

    // ---------- 1. Detectar formato ----------
    const temBlocoCabecalho =
      dadosBrutos.cabecalho && typeof dadosBrutos.cabecalho === "object";
    const temBlocoFornecedor =
      dadosBrutos.fornecedor && typeof dadosBrutos.fornecedor === "object";

    // Fontes possíveis (para buscar cada campo)
    const fonteCabecalho = temBlocoCabecalho
      ? dadosBrutos.cabecalho
      : dadosBrutos;
    const fonteFornecedor = temBlocoFornecedor
      ? dadosBrutos.fornecedor
      : dadosBrutos;

    // ---------- 2. Normalizar cabeçalho ----------
    const numeroProcesso = this.buscarCampo(
      fonteCabecalho,
      "numero_processo",
      "numeroProcesso",
      "processo",
      "processo_administrativo",
      "num_processo",
    );

    const numeroPregao = this.buscarCampo(
      fonteCabecalho,
      "numero_pregao",
      "numeroPregao",
      "pregao",
      "num_pregao",
    );

    const numeroAta = this.buscarCampo(
      fonteCabecalho,
      "numero_ata",
      "numeroAta",
      "num_ata",
      "ata",
    );

    const modalidade = this.buscarCampo(
      fonteCabecalho,
      "modalidade",
      "modalidade_licitacao",
      "tipo_licitacao",
      "tipo_contratacao",
    );

    const dataAssinatura = this.buscarCampo(
      fonteCabecalho,
      "data_assinatura",
      "dataAssinatura",
      "assinatura",
    );

    const vigenciaInicio = this.buscarCampo(
      fonteCabecalho,
      "vigencia_inicio",
      "vigenciaInicio",
      "data_inicio",
      "inicio_vigencia",
    );

    const vigenciaFim = this.buscarCampo(
      fonteCabecalho,
      "vigencia_fim",
      "vigenciaFim",
      "data_fim",
      "fim_vigencia",
    );

    const objeto = this.buscarCampo(
      fonteCabecalho,
      "objeto",
      "object",
      "descricao",
    );

    const categoria = this.buscarCampo(
      fonteCabecalho,
      "categoria",
      "category",
      "genero",
    );

    // ---------- 3. Normalizar fornecedor ----------
    const razaoSocial = this.buscarCampo(
      fonteFornecedor,
      "razao_social",
      "razaoSocial",
      "fornecedor",
      "nome_fornecedor",
    );

    const cnpj = this.buscarCampo(
      fonteFornecedor,
      "cpf_cnpj",
      "cpfCnpj",
      "documento",
      "documento_fornecedor",
      "cpf",
      "cpf_fornecedor",
      "cnpj",
      "cnpj_fornecedor",
      "cnpjFornecedor",
      "fornecedor_cnpj",
    );

    // ---------- 4. Normalizar itens ----------
    const itensRaw =
      this.buscarCampo(
        dadosBrutos,
        "itens",
        "items",
        "produtos",
        "lista_itens",
      ) || [];

    const itensNormalizados = (Array.isArray(itensRaw) ? itensRaw : []).map(
      (item, index) => {
        const numeroItem = this.buscarCampo(
          item,
          "item",
          "numero",
          "num_item",
          "codigo",
        );

        const descricaoRaw = this.buscarCampo(
          item,
          "descricao",
          "description",
          "produto",
          "nome",
        );

        const descricao = this.limparDescricaoDuplicada(descricaoRaw);

        const quantidadeRaw = this.buscarCampo(
          item,
          "quant_contratada",
          "quantidade",
          "qtd",
          "quantidade_contratada",
          "qtd_contratada",
        );

        const valorUnitRaw = this.buscarCampo(
          item,
          "valor_unitario",
          "valorUnitario",
          "preco_unitario",
          "unitario",
          "vl_unitario",
        );

        const valorTotalRaw = this.buscarCampo(
          item,
          "valor_total",
          "valorTotal",
          "total",
          "vl_total",
        );

        const quantidade = this.parseValorMonetario(quantidadeRaw);
        let valorUnit = this.parseValorMonetario(valorUnitRaw);
        let valorTotal = this.parseValorMonetario(valorTotalRaw);

        // Consistência: se tem total mas não unitário, calcula
        if (!valorUnit && valorTotal && quantidade > 0) {
          valorUnit = valorTotal / quantidade;
        }
        // Se tem unitário mas não total, calcula
        if (!valorTotal && valorUnit && quantidade > 0) {
          valorTotal = valorUnit * quantidade;
        }

        return {
          item:
            numeroItem !== undefined && numeroItem !== null
              ? String(numeroItem)
              : String(index + 1),
          descricao: descricao ? String(descricao).trim() : "",
          quant_contratada: quantidade,
          valor_unitario: valorUnit,
          valor_total: valorTotal,
        };
      },
    );

    // ---------- 5. Montar objeto plano final ----------
    return {
      // Cabeçalho
      numero_processo: numeroProcesso ? String(numeroProcesso).trim() : "",
      numero_pregao: numeroPregao ? String(numeroPregao).trim() : "",
      numero_ata: numeroAta ? String(numeroAta).trim() : "",
      modalidade: modalidade ? String(modalidade).trim() : "",
      data_assinatura: this.normalizarDataParaInput(dataAssinatura),
      vigencia_inicio: this.normalizarDataParaInput(vigenciaInicio),
      vigencia_fim: this.normalizarDataParaInput(vigenciaFim),
      objeto: objeto ? String(objeto).trim() : "",
      categoria: categoria ? String(categoria).trim() : "",

      // Fornecedor
      razao_social: razaoSocial ? String(razaoSocial).trim() : "",
      cnpj_fornecedor: cnpj ? String(cnpj).trim() : "",

      // Itens
      itens: itensNormalizados,
    };
  }

  // ============================================================
  // VALIDAR ESTRUTURA DO JSON (formato plano normalizado)
  // ------------------------------------------------------------
  // Recebe SEMPRE o objeto plano resultante de normalizarJson().
  // Retorna todos os erros encontrados de uma vez.
  // ============================================================
  validarEstruturaJson(dados) {
    const erros = [];

    if (!dados || typeof dados !== "object") {
      throw new Error("O arquivo não contém um objeto JSON válido.");
    }

    // ---------- Cabeçalho obrigatório ----------
    if (!dados.numero_processo) {
      erros.push(
        'Campo obrigatório ausente: "numero_processo" (ou "cabecalho.numero_processo")',
      );
    }
    if (!dados.numero_ata) {
      erros.push(
        'Campo obrigatório ausente: "numero_ata" (ou "cabecalho.numero_ata")',
      );
    }

    // ---------- Fornecedor obrigatório ----------
    if (!dados.cnpj_fornecedor) {
      erros.push(
        'Campo obrigatório ausente: "cpf_cnpj"/"cnpj_fornecedor" (ou "fornecedor.cnpj")',
      );
    }
    if (!dados.razao_social) {
      erros.push(
        'Campo obrigatório ausente: "razao_social" (ou "fornecedor.razao_social")',
      );
    }

    // ---------- Itens ----------
    if (
      !dados.itens ||
      !Array.isArray(dados.itens) ||
      dados.itens.length === 0
    ) {
      erros.push('O campo "itens" deve ser um array com pelo menos 1 item.');
    } else {
      dados.itens.forEach((item, i) => {
        const num = i + 1;
        if (!item.item && item.item !== 0) {
          erros.push(`Item ${num}: campo "item" obrigatório`);
        }
        if (!item.descricao || !String(item.descricao).trim()) {
          erros.push(`Item ${num}: campo "descricao" obrigatório`);
        }
        if (
          item.quant_contratada === undefined ||
          item.quant_contratada === null
        ) {
          erros.push(`Item ${num}: campo "quant_contratada" obrigatório`);
        }
        if (item.valor_unitario === undefined || item.valor_unitario === null) {
          erros.push(`Item ${num}: campo "valor_unitario" obrigatório`);
        }
        if (item.valor_total === undefined || item.valor_total === null) {
          erros.push(`Item ${num}: campo "valor_total" obrigatório`);
        }
      });
    }

    // Se houve qualquer erro, lança todos de uma vez
    if (erros.length > 0) {
      const mensagem =
        erros.length === 1
          ? erros[0]
          : `${erros.length} problemas encontrados:\n• ${erros.join("\n• ")}`;
      throw new Error(mensagem);
    }
  }

  // ============================================================
  // PREENCHER FORMULÁRIO COM JSON (formato plano normalizado)
  // ------------------------------------------------------------
  // Recebe SEMPRE o objeto plano resultante de normalizarJson().
  // ============================================================
  preencheFormularioComJson(dados) {
    this.itensCadastroTemp = [];

    // ---------- Cabeçalho ----------
    document.getElementById("processoNumero").value =
      dados.numero_processo || "";
    document.getElementById("pregaoNumero").value = dados.numero_pregao || "";
    document.getElementById("modalidade").value = dados.modalidade || "";
    document.getElementById("ataNumero").value = dados.numero_ata || "";
    document.getElementById("dataAssinatura").value =
      dados.data_assinatura || "";
    document.getElementById("vigenciaInicio").value =
      dados.vigencia_inicio || "";
    document.getElementById("vigenciaFim").value = dados.vigencia_fim || "";
    document.getElementById("objeto").value = dados.objeto || "";
    document.getElementById("categoriaInput").value = dados.categoria || "";

    // ---------- Fornecedor ----------
    document.getElementById("fornecedorRazao").value = dados.razao_social || "";
    document.getElementById("fornecedorCnpj").value =
      this.formatarDocumento(dados.cnpj_fornecedor || "");

    // ---------- Itens ----------
    if (dados.itens && Array.isArray(dados.itens)) {
      dados.itens.forEach((itemJson, index) => {
        const qtd = parseFloat(itemJson.quant_contratada) || 0;
        const unit = parseFloat(itemJson.valor_unitario) || 0;
        const total = parseFloat(itemJson.valor_total) || qtd * unit;
        this.itensCadastroTemp.push({
          id: Date.now() + index,
          numero: itemJson.item || (index + 1).toString(),
          descricao: itemJson.descricao || "",
          quantidade: qtd,
          valor_unitario: unit,
          valor_total: total,
        });
      });
    }
    this.renderizarItensCadastro();
  }

  // ============================================================
  // SALVAR ATA
  // ============================================================
  async salvarAta() {
    if (this.itensCadastroTemp.length === 0) {
      this.sistema.ui.mostrarToast("erro", "Adicione pelo menos um item");
      return;
    }

    for (const i of this.itensCadastroTemp) {
      if (!i.descricao?.trim()) {
        this.sistema.ui.mostrarToast(
          "erro",
          `Item ${i.numero}: Descrição obrigatória`,
        );
        return;
      }
      if (i.quantidade <= 0) {
        this.sistema.ui.mostrarToast(
          "erro",
          `Item ${i.numero}: Quantidade > 0`,
        );
        return;
      }
      if (i.valor_unitario <= 0) {
        this.sistema.ui.mostrarToast(
          "erro",
          `Item ${i.numero}: Valor unitário > 0`,
        );
        return;
      }
    }

    let categoriaId = null;
    const categoriaNome = document
      .getElementById("categoriaInput")
      .value.trim();
    if (categoriaNome) {
      const categoria = this.sistema.categorias.find(
        (c) => c.nome.toLowerCase() === categoriaNome.toLowerCase(),
      );
      if (categoria) {
        categoriaId = categoria.id;
      } else {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Categoria não encontrada na lista. A ata será salva sem categoria.",
        );
      }
    }

    try {
      const documentoInput = document.getElementById("fornecedorCnpj");
      const documento = this.sistema.ui.normalizarDocumento(documentoInput.value);
      if (!this.sistema.ui.validarDocumento(documento)) {
        this.sistema.ui.mostrarToast("erro", "CPF/CNPJ inválido. Informe um documento válido.");
        return;
      }
      documentoInput.value = this.sistema.ui.formatarDocumento(documento);

      let fornecedorId = null;
      const { data: exist } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("cnpj", documento)
        .maybeSingle();

      if (exist) {
        fornecedorId = exist.id;
      } else {
        const { data: novo, error: fe } = await supabase
          .from("fornecedores")
          .insert({
            razao_social: document.getElementById("fornecedorRazao").value,
            cnpj: documento,
          })
          .select()
          .single();
        if (fe) throw fe;
        fornecedorId = novo.id;
      }

      const { data: ata, error: ae } = await supabase
        .from("atas")
        .insert({
          numero_ata: document.getElementById("ataNumero").value,
          modalidade: document.getElementById("modalidade").value.trim(),
          processo_administrativo:
            document.getElementById("processoNumero").value,
          pregao_numero: document.getElementById("pregaoNumero").value || null,
          data_assinatura: document.getElementById("dataAssinatura").value,
          data_inicio_vigencia: document.getElementById("vigenciaInicio").value,
          data_fim_vigencia: document.getElementById("vigenciaFim").value,
          objeto: document.getElementById("objeto").value,
          fornecedor_id: fornecedorId,
          situacao: "ATIVA",
          valor_global: this.itensCadastroTemp.reduce(
            (s, i) => s + (i.valor_total || 0),
            0,
          ),
          usuario_cadastro_id: this.sistema.usuarioAtual.id,
          categoria_id: categoriaId,
        })
        .select()
        .single();

      if (ae) throw ae;

      for (const i of this.itensCadastroTemp) {
        const { error: ie } = await supabase.from("itens_ata").insert({
          ata_id: ata.id,
          item_numero: i.numero,
          descricao: i.descricao,
          quantidade_contratada: i.quantidade,
          saldo_quantidade: i.quantidade,
          saldo_valor: i.valor_total,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          unidade_medida: "UN",
          categoria: "Geral",
        });
        if (ie) throw ie;
      }

      this.sistema.ui.mostrarToast("sucesso", "Ata cadastrada com sucesso!");

      // Limpar formulário
      this.itensCadastroTemp = [];
      this.renderizarItensCadastro();
      document.getElementById("formCadastroAta").reset();

      // Recarregar lista de atas
      await this.carregarListaAtas();

      // Recarregar consulta
      if (this.sistema.consulta) {
        await this.sistema.consulta.carregarConteudo();
      }
    } catch (error) {
      console.error("Erro ao salvar ata:", error);
      this.sistema.ui.mostrarToast(
        "erro",
        error.message || "Erro ao salvar ata.",
      );
    }
  }
}
