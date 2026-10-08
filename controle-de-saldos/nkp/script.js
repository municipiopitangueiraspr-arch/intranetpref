const SUPABASE_URL = "https://qgkjnzcqjhhqdgxmvtew.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gbXPIpkbYvf3YKITplkjpg_eKrPHhYw";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class SistemaGestaoAtas {
  constructor() {
    this.usuarioAtual = null;
    this.ataSelecionada = null;
    this.ataParaAditivo = null;
    this.carrinho = [];
    this.pdfData = null;
    this.itensCadastroTemp = [];
    this.filtroTimer = null;
    this.orgaos = [];
    this.categorias = [];
    this.aditivosFiltrados = [];
    this.filtrosGestaoAtivos = {
      busca: "",
      fornecedor: "todos",
      orgao: "todos",
      statusAta: "todos",
      saldo: "todos",
      ocultarZerados: false,
      apenas30dias: false,
    };
    this.confirmacaoResolver = null;
    this.init();
  }

  async init() {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (session) await this.carregarUsuario(session.user.id);
    this.carregarCarrinhoStorage();
  }

  mostrarToast(tipo, mensagem) {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<i class="fas ${tipo === "sucesso" ? "fa-check-circle" : tipo === "erro" ? "fa-exclamation-circle" : "fa-info-circle"}"></i><span>${mensagem}</span><button class="btn-fechar" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  confirmar(mensagem) {
    return new Promise((resolve) => {
      this.confirmacaoResolver = resolve;
      document.getElementById("confirmacaoMensagem").innerText = mensagem;
      document.getElementById("modalConfirmacao").classList.add("active");
    });
  }

  fecharModalConfirmacao(resultado) {
    document.getElementById("modalConfirmacao").classList.remove("active");
    if (this.confirmacaoResolver) {
      this.confirmacaoResolver(resultado);
      this.confirmacaoResolver = null;
    }
  }

  resolverConfirmacao(resposta) {
    this.fecharModalConfirmacao(resposta);
  }

  async fazerLogin() {
    const errorDiv = document.getElementById("loginError");
    errorDiv.style.display = "none";
    const email = document.getElementById("loginEmail").value;
    const senha = document.getElementById("loginSenha").value;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (error) throw error;
      await this.carregarUsuario(data.user.id);
    } catch (error) {
      errorDiv.style.display = "block";
      errorDiv.innerHTML = "❌ " + error.message;
    }
  }

  async carregarUsuario(uuid) {
    const { data: usuario, error } = await supabaseClient
      .from("usuarios")
      .select("*, orgao:orgaos(*)")
      .eq("uuid", uuid)
      .single();
    if (error || !usuario) return;
    this.usuarioAtual = usuario;
    document.getElementById("userName").innerHTML = usuario.nome;
    document.getElementById("userRole").innerHTML = usuario.perfil;
    const iniciais =
      usuario.nome
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase() || "U";
    document.getElementById("userAvatar").innerHTML = iniciais;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("mainSystem").style.display = "block";
    await this.carregarOrgaos();
    await this.carregarCategorias();
    await this.carregarFiltros();
    await this.carregarAtas();
    await this.carregarSelectsGestao();
    await this.carregarTabelaUsuarios();
    await this.carregarTabelaOrgaos();
    await this.carregarPedidos();
    await this.carregarAditivos();
    this.configurarPermissoes();
    this.atualizarCarrinhoUI();
    this.ativarTab("consulta");
  }

  async fazerLogout() {
    await supabaseClient.auth.signOut();
    this.usuarioAtual = null;
    document.getElementById("loginScreen").style.display = "block";
    document.getElementById("mainSystem").style.display = "none";
  }

  configurarPermissoes() {
    const perfil = this.usuarioAtual?.perfil;
    document.getElementById("tabUsuarios").style.display =
      perfil === "ADMIN" ? "block" : "none";
    document.getElementById("tabOrgaos").style.display =
      perfil === "ADMIN" ? "block" : "none";
    document.getElementById("tabAditivos").style.display =
      perfil === "ADMIN" || perfil === "ESTAGIARIO" ? "block" : "none";
    document.getElementById("tabGestao").style.display =
      perfil === "ADMIN" || perfil === "ESTAGIARIO" ? "block" : "none";
    document.getElementById("tabCadastro").style.display =
      perfil === "ADMIN" || perfil === "ESTAGIARIO" ? "block" : "none";
  }

  ativarTab(tab) {
    if (!this.verificarPermissaoTab(tab)) return;
    document
      .querySelectorAll(".tab-principal")
      .forEach((t) => t.classList.remove("active"));
    document
      .getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)
      .classList.add("active");
    document.getElementById("consultaContent").style.display =
      tab === "consulta" ? "block" : "none";
    document.getElementById("gestaoContent").style.display =
      tab === "gestao" ? "block" : "none";
    document.getElementById("cadastroContent").style.display =
      tab === "cadastro" ? "block" : "none";
    document.getElementById("pedidosContent").style.display =
      tab === "pedidos" ? "block" : "none";
    document.getElementById("aditivosContent").style.display =
      tab === "aditivos" ? "block" : "none";
    document.getElementById("orgaosContent").style.display =
      tab === "orgaos" ? "block" : "none";
    document.getElementById("usuariosContent").style.display =
      tab === "usuarios" ? "block" : "none";
    if (tab === "consulta") this.carregarAtas();
    if (tab === "gestao") this.carregarSelectsGestao();
    if (tab === "pedidos") this.carregarPedidos();
    if (tab === "aditivos") this.carregarAditivos();
    if (tab === "orgaos") this.carregarTabelaOrgaos();
    if (tab === "usuarios") this.carregarTabelaUsuarios();
  }

  verificarPermissaoTab(tab) {
    const perfil = this.usuarioAtual?.perfil;
    if (tab === "usuarios" && perfil !== "ADMIN") return false;
    if (tab === "orgaos" && perfil !== "ADMIN") return false;
    if (tab === "aditivos" && !(perfil === "ADMIN" || perfil === "ESTAGIARIO"))
      return false;
    if (
      (tab === "gestao" || tab === "cadastro") &&
      !(perfil === "ADMIN" || perfil === "ESTAGIARIO")
    )
      return false;
    return true;
  }

  debounceFiltrarAtas() {
    clearTimeout(this.filtroTimer);
    this.filtroTimer = setTimeout(() => this.filtrarAtas(), 400);
  }

  carregarArquivoJson() {
    document.getElementById("fileJsonInput").click();
  }

  async processarArquivoJson(arquivo) {
    if (!arquivo) return;
    try {
      const btn = document.getElementById("btnExtracao");
      const textoOriginal = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
      btn.disabled = true;
      const conteudo = await this.lerArquivo(arquivo);
      const dados = JSON.parse(conteudo);
      this.validarEstruturaJson(dados);
      this.preencheFormularioComJson(dados);
      this.mostrarToast(
        "sucesso",
        "JSON carregado com sucesso! Revise os dados antes de salvar.",
      );
    } catch (erro) {
      this.mostrarToast("erro", "Erro ao processar JSON: " + erro.message);
    } finally {
      const btn = document.getElementById("btnExtracao");
      btn.innerHTML = '<i class="fas fa-file-code"></i> Carregar JSON';
      btn.disabled = false;
      document.getElementById("fileJsonInput").value = "";
    }
  }

  lerArquivo(arquivo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Erro ao ler o arquivo"));
      reader.readAsText(arquivo);
    });
  }

  validarEstruturaJson(dados) {
    if (!dados.numero_processo)
      throw new Error('Campo "numero_processo" não encontrado');
    if (!dados.numero_ata) throw new Error('Campo "numero_ata" não encontrado');
    if (!dados.cnpj_fornecedor)
      throw new Error('Campo "cnpj_fornecedor" não encontrado');
    if (!dados.razao_social)
      throw new Error('Campo "razao_social" não encontrado');
    if (!dados.itens || !Array.isArray(dados.itens) || dados.itens.length === 0)
      throw new Error('Campo "itens" deve ser um array não vazio');
    dados.itens.forEach((item, i) => {
      if (!item.item && item.item !== 0)
        throw new Error(`Item ${i + 1}: campo "item" obrigatório`);
      if (!item.descricao)
        throw new Error(`Item ${i + 1}: campo "descricao" obrigatório`);
      if (item.quant_contratada === undefined)
        throw new Error(`Item ${i + 1}: campo "quant_contratada" obrigatório`);
      if (item.valor_unitario === undefined)
        throw new Error(`Item ${i + 1}: campo "valor_unitario" obrigatório`);
      if (item.valor_total === undefined)
        throw new Error(`Item ${i + 1}: campo "valor_total" obrigatório`);
    });
  }

  preencheFormularioComJson(dados) {
    this.itensCadastroTemp = [];
    document.getElementById("processoNumero").value =
      dados.numero_processo || "";
    document.getElementById("pregaoNumero").value =
      dados.numero_pregao || dados.numeroPregao || dados.cabecalho?.numero_pregao || "";
    document.getElementById("modalidade").value =
      dados.modalidade || dados.cabecalho?.modalidade || "";
    document.getElementById("ataNumero").value =
      dados.numero_ata || dados.cabecalho?.numero_ata || "";
    document.getElementById("dataAssinatura").value = "";
    document.getElementById("vigenciaInicio").value = "";
    document.getElementById("vigenciaFim").value = "";
    document.getElementById("objeto").value = "";
    document.getElementById("fornecedorRazao").value = dados.razao_social || "";
    document.getElementById("fornecedorCnpj").value =
      dados.cnpj_fornecedor || "";
    document.getElementById("categoriaInput").value = "";
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
    const totalAta = this.itensCadastroTemp.reduce(
      (s, i) => s + (i.valor_total || 0),
      0,
    );
    document.getElementById("valorTotalAta").innerHTML =
      this.formatarMoeda(totalAta);
  }

  async carregarOrgaos() {
    const { data: orgaos } = await supabaseClient
      .from("orgaos")
      .select("*")
      .order("nome");
    if (orgaos) this.orgaos = orgaos;
    return this.orgaos;
  }

  async carregarCategorias() {
    const { data: categorias } = await supabaseClient
      .from("categorias")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    this.categorias = categorias || [];
    const datalist = document.getElementById("categoriasList");
    if (datalist) {
      datalist.innerHTML = this.categorias
        .map((c) => `<option value="${c.nome}">`)
        .join("");
    }
    return this.categorias;
  }

  async carregarTabelaOrgaos() {
    const tbody = document.getElementById("tabelaOrgaosBody");
    if (!tbody) return;
    const { data: orgaos } = await supabaseClient
      .from("orgaos")
      .select("*")
      .order("nome");
    if (!orgaos?.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhum órgão cadastrado</td></tr>';
      return;
    }
    tbody.innerHTML = orgaos
      .map(
        (o) => `
          <tr>
            <td>${o.id}</td>
            <td><strong>${o.nome}</strong></td>
            <td><span class="badge-perfil" style="background:var(--primary-100);">${o.sigla || "-"}</span></td>
            <td>${o.cnpj || "-"}</td>
            <td>${o.telefone ? `<i class="fas fa-phone"></i> ${o.telefone}<br>` : ""}${o.email ? `<i class="fas fa-envelope"></i> ${o.email}` : ""}</td>
            <td><span class="badge-perfil ${o.ativo ? "status-ativo" : "status-inativo"}">${o.ativo ? "ATIVO" : "INATIVO"}</span></td>
            <td>
              <button class="btn-editar-orgao" onclick="sistema.editarOrgao(${o.id})"><i class="fas fa-edit"></i></button>
              <button class="btn-desativar-orgao" onclick="sistema.toggleStatusOrgao(${o.id})"><i class="fas ${o.ativo ? "fa-times-circle" : "fa-check-circle"}"></i></button>
            </td>
          </tr>
        `,
      )
      .join("");
  }

  async carregarSelectOrgaos(selectId, selectedId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const orgaos = await this.carregarOrgaos();
    select.innerHTML = '<option value="">Selecione um órgão...</option>';
    orgaos
      .filter((o) => o.ativo !== false)
      .forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.id;
        opt.textContent = `${o.nome}${o.sigla ? ` (${o.sigla})` : ""}`;
        if (selectedId && o.id == selectedId) opt.selected = true;
        select.appendChild(opt);
      });
  }

  abrirModalOrgao(orgaoId = null) {
    if (this.usuarioAtual?.perfil !== "ADMIN") {
      this.mostrarToast(
        "erro",
        "Apenas administradores podem gerenciar órgãos.",
      );
      return;
    }
    document.getElementById("modalOrgaoTitulo").innerHTML = orgaoId
      ? '<i class="fas fa-edit"></i> Editar Órgão'
      : '<i class="fas fa-plus-circle"></i> Novo Órgão';
    if (orgaoId) this.editarOrgao(orgaoId);
    else {
      document.getElementById("orgaoId").value = "";
      document.getElementById("orgaoNome").value = "";
      document.getElementById("orgaoSigla").value = "";
      document.getElementById("orgaoCnpj").value = "";
      document.getElementById("orgaoEndereco").value = "";
      document.getElementById("orgaoTelefone").value = "";
      document.getElementById("orgaoEmail").value = "";
      document.getElementById("orgaoStatus").value = "true";
      document.getElementById("modalOrgao").classList.add("active");
    }
  }

  async editarOrgao(id) {
    const { data: o } = await supabaseClient
      .from("orgaos")
      .select("*")
      .eq("id", id)
      .single();
    if (o) {
      document.getElementById("orgaoId").value = o.id;
      document.getElementById("orgaoNome").value = o.nome || "";
      document.getElementById("orgaoSigla").value = o.sigla || "";
      document.getElementById("orgaoCnpj").value = o.cnpj || "";
      document.getElementById("orgaoEndereco").value = o.endereco || "";
      document.getElementById("orgaoTelefone").value = o.telefone || "";
      document.getElementById("orgaoEmail").value = o.email || "";
      document.getElementById("orgaoStatus").value = o.ativo ? "true" : "false";
      document.getElementById("modalOrgao").classList.add("active");
    }
  }

  async salvarOrgao() {
    const id = document.getElementById("orgaoId").value;
    const dados = {
      nome: document.getElementById("orgaoNome").value,
      sigla: document.getElementById("orgaoSigla").value,
      cnpj: document.getElementById("orgaoCnpj").value || null,
      endereco: document.getElementById("orgaoEndereco").value || null,
      telefone: document.getElementById("orgaoTelefone").value || null,
      email: document.getElementById("orgaoEmail").value || null,
      ativo: document.getElementById("orgaoStatus").value === "true",
    };
    try {
      let error;
      if (id)
        ({ error } = await supabaseClient
          .from("orgaos")
          .update(dados)
          .eq("id", id));
      else ({ error } = await supabaseClient.from("orgaos").insert(dados));
      if (error) throw error;
      this.mostrarToast(
        "sucesso",
        id ? "Órgão atualizado!" : "Órgão cadastrado!",
      );
      this.fecharModalOrgao();
      await this.carregarOrgaos();
      await this.carregarTabelaOrgaos();
      await this.carregarSelectOrgaos(
        "usuarioOrgao",
        this.usuarioAtual?.orgao_id,
      );
      await this.carregarFiltros();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async toggleStatusOrgao(id) {
    const { data: o } = await supabaseClient
      .from("orgaos")
      .select("ativo")
      .eq("id", id)
      .single();
    if (o) {
      const confirmado = await this.confirmar(
        `${o.ativo ? "Desativar" : "Ativar"} este órgão?`,
      );
      if (confirmado) {
        await supabaseClient
          .from("orgaos")
          .update({ ativo: !o.ativo })
          .eq("id", id);
        await this.carregarTabelaOrgaos();
        await this.carregarOrgaos();
        this.mostrarToast(
          "sucesso",
          `Órgão ${!o.ativo ? "ativado" : "desativado"}!`,
        );
      }
    }
  }

  fecharModalOrgao() {
    document.getElementById("modalOrgao").classList.remove("active");
  }

  async carregarFiltros() {
    const sf = document.getElementById("filtroFornecedor");
    if (sf) {
      sf.innerHTML = '<option value="todos">Todos os fornecedores</option>';
      const { data: f } = await supabaseClient
        .from("fornecedores")
        .select("razao_social")
        .order("razao_social");
      f?.forEach((f) => {
        let o = document.createElement("option");
        o.value = f.razao_social;
        o.textContent = f.razao_social;
        sf.appendChild(o);
      });
    }
    await this.carregarSelectOrgaos("filtroOrgao");
    await this.carregarSelectOrgaos(
      "usuarioOrgao",
      this.usuarioAtual?.orgao_id,
    );
    await this.carregarFiltrosGestao();
  }

  async carregarFiltrosGestao() {
    const sf = document.getElementById("filtroGestaoFornecedor");
    if (sf) {
      sf.innerHTML = '<option value="todos">Todos os fornecedores</option>';
      const { data: f } = await supabaseClient
        .from("fornecedores")
        .select("razao_social")
        .order("razao_social");
      f?.forEach((f) => {
        let o = document.createElement("option");
        o.value = f.razao_social;
        o.textContent = f.razao_social;
        sf.appendChild(o);
      });
    }
    await this.carregarSelectOrgaos("filtroGestaoOrgao");
  }

  async carregarAtas() {
    const container = document.getElementById("atasLista");
    container.innerHTML =
      '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando atas...</div>';
    let query = supabaseClient
      .from("atas")
      .select(
        `*, fornecedor:fornecedores(razao_social,cnpj), itens:itens_ata(*), categoria:categorias(id,nome)`,
      );
    const statusFiltro = document.getElementById("filtroStatus")?.value;
    if (statusFiltro && statusFiltro !== "todos")
      query = query.eq("situacao", statusFiltro);
    else query = query.not("situacao", "eq", "VENCIDA");
    const { data: atas } = await query.order("data_inicio_vigencia", {
      ascending: false,
    });
    let atasFiltradas = atas || [];
    const fornecedorFiltro = document.getElementById("filtroFornecedor")?.value;
    if (fornecedorFiltro && fornecedorFiltro !== "todos")
      atasFiltradas = atasFiltradas.filter(
        (a) => a.fornecedor?.razao_social === fornecedorFiltro,
      );
    const busca = document.getElementById("buscaInput")?.value?.toLowerCase();
    if (busca)
      atasFiltradas = atasFiltradas.filter((a) =>
        a.itens?.some((i) => i.descricao?.toLowerCase().includes(busca)),
      );
    if (!atasFiltradas.length) {
      container.innerHTML =
        '<div style="text-align:center;padding:30px;">Nenhuma ata encontrada</div>';
      return;
    }
    container.innerHTML = atasFiltradas
      .map((a) => this.renderCardAta(a))
      .join("");
  }

  renderCardAta(ata) {
    const statusClass =
      {
        ATIVA: "status-ativa",
        PROXIMA: "status-proxima",
        VENCIDA: "status-vencida",
      }[ata.situacao] || "status-ativa";
    const categoriaNome = ata.categoria?.nome || "Outros";
    return `<div class="ata-card" onclick="sistema.abrirDetalhes(${ata.id})">
      <div class="ata-header">
        <div class="ata-status">
          <span class="status-badge ${statusClass}">${ata.situacao || "ATIVA"}</span>
          <span style="font-size:0.75rem"><i class="fas fa-box"></i> ${ata.itens?.length || 0}</span>
        </div>
        <div class="ata-numero">Ata nº ${ata.numero_ata || ""}</div>
        <div class="ata-fornecedor"><i class="fas fa-building"></i> ${ata.fornecedor?.razao_social || "N/I"}</div>
        <div style="font-size:0.8rem"><i class="fas fa-tag"></i> ${categoriaNome}</div>
        <div style="font-size:0.8rem"><i class="fas fa-calendar"></i> ${this.formatarData(ata.data_inicio_vigencia)}</div>
      </div>
      <div class="ata-footer">
        <span style="font-weight:600;font-size:0.9rem">${this.formatarMoeda(ata.valor_global || 0)}</span>
        <button class="btn-visualizar" onclick="event.stopPropagation(); sistema.abrirDetalhes(${ata.id})"><i class="fas fa-eye"></i> Ver</button>
      </div>
    </div>`;
  }

  async abrirDetalhes(ataId) {
    const { data: ata } = await supabaseClient
      .from("atas")
      .select(
        `*, fornecedor:fornecedores(*), itens:itens_ata(*), categoria:categorias(id,nome)`,
      )
      .eq("id", ataId)
      .single();
    this.ataSelecionada = ata;
    const { data: consumos } = await supabaseClient
      .from("consumos")
      .select("valor_total")
      .eq("ata_id", ataId);
    const valorConsumido =
      consumos?.reduce((s, c) => s + (c.valor_total || 0), 0) || 0;
    const saldoAta = (ata.valor_global || 0) - valorConsumido;
    document.getElementById("modalTituloAta").innerHTML =
      `<i class="fas fa-file-contract"></i> Ata nº ${ata.numero_ata}<div style="font-size:0.85rem;margin-top:4px;color:var(--neutral-500);">Vigência: De ${this.formatarData(ata.data_inicio_vigencia)} até ${this.formatarData(ata.data_fim_vigencia)}</div><div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;"><span style="background:var(--success-100);padding:3px 8px;border-radius:20px;font-size:0.8rem;"><strong>Valor:</strong> ${this.formatarMoeda(ata.valor_global || 0)}</span><span style="background:var(--warning-100);padding:3px 8px;border-radius:20px;font-size:0.8rem;"><strong>Consumido:</strong> ${this.formatarMoeda(valorConsumido)}</span><span style="background:var(--primary-100);padding:3px 8px;border-radius:20px;font-size:0.8rem;"><strong>Saldo:</strong> ${this.formatarMoeda(saldoAta)}</span></div>`;
    document.getElementById("modalConteudo").innerHTML =
      await this.renderDetalhesAta(ata);
    document.getElementById("modalDetalhes").classList.add("active");
  }

  async renderDetalhesAta(ata) {
    const { data: consumos } = await supabaseClient
      .from("consumos")
      .select("*, orgao:orgaos(*)")
      .eq("ata_id", ata.id);
    const consPorItem = {};
    consumos?.forEach((c) => {
      if (!consPorItem[c.item_ata_id]) consPorItem[c.item_ata_id] = [];
      consPorItem[c.item_ata_id].push(c);
    });
    const podeConsumir =
      this.usuarioAtual?.perfil === "ADMIN" ||
      this.usuarioAtual?.perfil === "ESTAGIARIO";
    const podePedir =
      this.usuarioAtual?.perfil === "ADMIN" ||
      this.usuarioAtual?.perfil === "SECRETARIO" ||
      this.usuarioAtual?.perfil === "SOLICITANTE";
    const podeAditivar =
      this.usuarioAtual?.perfil === "ADMIN" ||
      this.usuarioAtual?.perfil === "ESTAGIARIO";

    const categoriaNome = ata.categoria?.nome || "Outros";

    return `<div class="info-grid">
      <div class="info-item"><span class="info-label">Fornecedor</span><span class="info-value">${ata.fornecedor?.razao_social || ""}</span></div>
      <div class="info-item"><span class="info-label">CNPJ</span><span class="info-value">${ata.fornecedor?.cnpj || ""}</span></div>
      <div class="info-item"><span class="info-label">Processo</span><span class="info-value">${ata.processo_administrativo || ""}</span></div>
      <div class="info-item"><span class="info-label">Categoria</span><span class="info-value">${categoriaNome}</span></div>
      <div class="info-item"><span class="info-label">Status</span><span class="status-badge ${ata.situacao === "ATIVA" ? "status-ativa" : "status-vencida"}">${ata.situacao || "ATIVA"}</span></div>
    </div>
    <h3 style="margin-bottom:12px;font-size:1rem;">Itens da Ata</h3>
    <div class="tabela-container">
      <table class="tabela-itens">
        <thead>
          <tr><th>Nº</th><th>Descrição</th><th>Qtd</th><th>Valor Unit.</th><th>Valor Total</th><th>Saldo</th><th>%</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${ata.itens
            .map((item) => {
              const consumosItem = consPorItem[item.id] || [];
              const qtdConsumida = consumosItem.reduce(
                (s, c) => s + c.quantidade,
                0,
              );
              const saldo = item.saldo_quantidade || 0;
              const percentual =
                item.quantidade_contratada > 0
                  ? (
                      ((item.quantidade_contratada - saldo) /
                        item.quantidade_contratada) *
                      100
                    ).toFixed(1)
                  : 0;
              const saldoClass =
                saldo <= 0
                  ? "saldo-zerado"
                  : saldo <= item.quantidade_contratada * 0.1
                    ? "saldo-baixo"
                    : "saldo-alto";
              return `<tr>
                <td>${item.item_numero || ""}</td>
                <td>${item.descricao || ""}</td>
                <td class="numeric">${item.quantidade_contratada || 0}</td>
                <td class="numeric">${this.formatarMoeda(item.valor_unitario)}</td>
                <td class="numeric">${this.formatarMoeda(item.valor_total)}</td>
                <td class="numeric ${saldoClass}">${saldo}</td>
                <td><div class="progresso-container"><div class="progresso-bar" style="width:${percentual}%;"></div></div>${percentual}%</td>
                <td>
                  <div style="display:grid;grid-template-columns:repeat(3,minmax(80px,1fr));gap:4px;align-items:center;">
                    ${podeConsumir && saldo > 0 ? `<button class="btn-consumo" onclick="event.stopPropagation();sistema.abrirModalConsumo(${ata.id},${item.id})" style="height:32px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:4px;width:100%;"><i class="fas fa-pen"></i> Consumo</button>` : "<div></div>"}
                    ${podePedir && saldo > 0 ? `<div style="display:flex;gap:4px;width:100%;"><input type="number" id="qtd-${ata.id}-${item.id}" min="1" max="${saldo}" placeholder="Qtd" style="width:45px;height:32px;padding:0 4px;border:1px solid var(--neutral-300);border-radius:var(--border-radius-md);font-size:0.7rem;text-align:center;"><button class="btn-pedido" onclick="sistema.adicionarAoCarrinho(${ata.id},${item.id})" style="height:32px;padding:0 8px;display:flex;align-items:center;gap:4px;flex:1;"><i class="fas fa-cart-plus"></i> Pedido</button></div>` : "<div></div>"}
                    ${podeAditivar && (ata.situacao === "PROXIMA" || ata.situacao === "VENCIDA") ? `<button class="btn-aditivo-rapido" onclick="event.stopPropagation();sistema.abrirModalAditivo(${ata.id})" style="height:32px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:4px;width:100%;background:var(--success-600);color:white;border:none;border-radius:6px;font-weight:600;font-size:0.7rem;cursor:pointer;"><i class="fas fa-file-contract"></i> Aditivar</button>` : "<div></div>"}
                  </div>
                  ${saldo <= 0 ? '<div style="margin-top:4px;text-align:center;"><span style="color:var(--error-600);font-size:0.7rem;background:var(--error-50);padding:2px 8px;border-radius:12px;">ESGOTADO</span></div>' : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  async carregarSelectsGestao() {
    const select = document.getElementById("selectAtaGestao");
    if (!select) return;
    select.innerHTML = '<option value="">🔍 Selecione...</option>';
    const { data: atas } = await supabaseClient
      .from("atas")
      .select("id, numero_ata, situacao, fornecedor:fornecedores(razao_social)")
      .order("numero_ata");
    atas?.forEach((a) => {
      let o = document.createElement("option");
      o.value = a.id;
      o.textContent = `${a.numero_ata} - ${a.fornecedor?.razao_social || ""}`;
      select.appendChild(o);
    });
  }

  async carregarItensGestao() {
    const ataId = document.getElementById("selectAtaGestao").value;
    if (!ataId) {
      document.getElementById("itensGestaoContainer").innerHTML = "";
      this.atualizarStatsGestao(null);
      document.getElementById("statusEditorContainer").style.display = "none";
      return;
    }
    const { data: ata } = await supabaseClient
      .from("atas")
      .select("*, itens:itens_ata(*)")
      .eq("id", ataId)
      .single();
    this.ataSelecionada = ata;
    document.getElementById("statusEditorContainer").style.display = "flex";
    document.getElementById("statusAtaSelect").value = ata.situacao || "ATIVA";
    this.atualizarStatsGestao(ata);
    this.filtrarItensGestao();
  }

  atualizarStatsGestao(ata) {
    if (!ata) {
      document.getElementById("gestaoAtaNome").innerHTML = "Nenhuma";
      document.getElementById("gestaoTotalItens").innerHTML = "0";
      document.getElementById("gestaoItensComSaldo").innerHTML = "0";
      document.getElementById("gestaoItensCriticos").innerHTML = "0";
      return;
    }
    document.getElementById("gestaoAtaNome").innerHTML = `${ata.numero_ata}`;
    document.getElementById("gestaoTotalItens").innerHTML = ata.itens.length;
    let comSaldo = 0,
      criticos = 0;
    ata.itens.forEach((i) => {
      if (i.saldo_quantidade > 0) comSaldo++;
      if (
        i.saldo_quantidade > 0 &&
        i.saldo_quantidade <= i.quantidade_contratada * 0.1
      )
        criticos++;
    });
    document.getElementById("gestaoItensComSaldo").innerHTML = comSaldo;
    document.getElementById("gestaoItensCriticos").innerHTML = criticos;
  }

  filtrarItensGestao() {
    if (!this.ataSelecionada) return;
    const filtro =
      document.getElementById("filtroStatusGestao")?.value || "todos";
    let itens = [...this.ataSelecionada.itens];
    if (filtro === "disponivel")
      itens = itens.filter((i) => i.saldo_quantidade > 0);
    else if (filtro === "critico")
      itens = itens.filter(
        (i) =>
          i.saldo_quantidade > 0 &&
          i.saldo_quantidade <= i.quantidade_contratada * 0.1,
      );
    else if (filtro === "esgotado")
      itens = itens.filter((i) => i.saldo_quantidade <= 0);
    this.renderizarItensGestao(itens);
  }

  filtrarGestao() {
    if (!this.ataSelecionada) return;
    this.filtrosGestaoAtivos.busca = document
      .getElementById("buscaGestao")
      .value.toLowerCase();
    this.filtrosGestaoAtivos.fornecedor = document.getElementById(
      "filtroGestaoFornecedor",
    ).value;
    this.filtrosGestaoAtivos.orgao =
      document.getElementById("filtroGestaoOrgao").value;
    this.filtrosGestaoAtivos.statusAta = document.getElementById(
      "filtroGestaoStatusAta",
    ).value;
    this.filtrosGestaoAtivos.saldo =
      document.getElementById("filtroGestaoSaldo").value;
    this.filtrosGestaoAtivos.ocultarZerados =
      document.getElementById("ocultarZerados").checked;
    this.filtrosGestaoAtivos.apenas30dias =
      document.getElementById("apenas30dias").checked;
    this.aplicarFiltrosGestao();
  }

  async aplicarFiltrosGestao() {
    if (!this.ataSelecionada) return;
    let itens = [...this.ataSelecionada.itens];
    if (this.filtrosGestaoAtivos.busca)
      itens = itens.filter((i) =>
        i.descricao.toLowerCase().includes(this.filtrosGestaoAtivos.busca),
      );
    if (this.filtrosGestaoAtivos.saldo === "disponivel")
      itens = itens.filter((i) => i.saldo_quantidade > 0);
    else if (this.filtrosGestaoAtivos.saldo === "critico")
      itens = itens.filter(
        (i) =>
          i.saldo_quantidade > 0 &&
          i.saldo_quantidade <= i.quantidade_contratada * 0.1,
      );
    else if (this.filtrosGestaoAtivos.saldo === "zerado")
      itens = itens.filter((i) => i.saldo_quantidade <= 0);
    if (this.filtrosGestaoAtivos.ocultarZerados)
      itens = itens.filter((i) => i.saldo_quantidade > 0);
    this.renderizarItensGestao(itens);
  }

  limparFiltrosGestao() {
    document.getElementById("buscaGestao").value = "";
    document.getElementById("filtroGestaoFornecedor").value = "todos";
    document.getElementById("filtroGestaoOrgao").value = "todos";
    document.getElementById("filtroGestaoStatusAta").value = "todos";
    document.getElementById("filtroGestaoSaldo").value = "todos";
    document.getElementById("ocultarZerados").checked = false;
    document.getElementById("apenas30dias").checked = false;
    this.filtrosGestaoAtivos = {
      busca: "",
      fornecedor: "todos",
      orgao: "todos",
      statusAta: "todos",
      saldo: "todos",
      ocultarZerados: false,
      apenas30dias: false,
    };
    this.filtrarGestao();
  }

  exportarListaGestao() {
    if (!this.ataSelecionada) {
      this.mostrarToast("erro", "Selecione uma ata primeiro");
      return;
    }
    const itens = this.ataSelecionada.itens;
    const cabecalho = [
      "Item",
      "Descrição",
      "Qtd Contratada",
      "Saldo",
      "Valor Unitário",
      "Valor Total",
    ];
    const linhas = itens.map((i) => [
      i.item_numero,
      i.descricao,
      i.quantidade_contratada,
      i.saldo_quantidade,
      this.formatarMoeda(i.valor_unitario),
      this.formatarMoeda(i.valor_total),
    ]);
    const csv = [cabecalho.join(","), ...linhas.map((l) => l.join(","))].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `itens_ata_${this.ataSelecionada.numero_ata}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.mostrarToast("sucesso", "Lista exportada com sucesso!");
  }

  async alterarStatusAta() {
    if (!this.ataSelecionada) return;
    const novo = document.getElementById("statusAtaSelect").value;
    if (this.ataSelecionada.situacao === novo) {
      this.mostrarToast("aviso", "O status já é " + novo);
      return;
    }
    const confirmado = await this.confirmar(
      `Deseja alterar o status da ata de ${this.ataSelecionada.situacao} para ${novo}?`,
    );
    if (!confirmado) return;
    try {
      const { error } = await supabaseClient
        .from("atas")
        .update({ situacao: novo })
        .eq("id", this.ataSelecionada.id);
      if (error) throw error;
      this.mostrarToast("sucesso", "Status atualizado!");
      this.ataSelecionada.situacao = novo;
      await this.carregarAtas();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  renderizarItensGestao(itens) {
    const container = document.getElementById("itensGestaoContainer");
    if (!itens.length) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px;"><i class="fas fa-box-open" style="font-size:3rem;color:var(--neutral-400);"></i><h3 style="margin-top:15px;color:var(--neutral-500);font-size:0.9rem;">Nenhum item encontrado</h3></div>';
      return;
    }
    const podeConsumir =
      this.usuarioAtual?.perfil === "ADMIN" ||
      this.usuarioAtual?.perfil === "ESTAGIARIO";
    container.innerHTML = `<table class="gestao-tabela">
      <thead>
        <tr><th>Item</th><th>Descrição</th><th>Contratado</th><th>Saldo</th><th>Valor Unit.</th><th>Status</th><th>Ações</th></tr>
      </thead>
      <tbody>
        ${itens
          .map((item) => {
            const saldo = item.saldo_quantidade || 0;
            const critico =
              saldo > 0 && saldo <= item.quantidade_contratada * 0.1;
            return `<tr>
              <td>${item.item_numero}</td>
              <td>${item.descricao}</td>
              <td class="numeric">${item.quantidade_contratada}</td>
              <td class="numeric ${saldo <= 0 ? "saldo-zerado" : critico ? "saldo-baixo" : "saldo-alto"}">${saldo}</td>
              <td class="numeric">${this.formatarMoeda(item.valor_unitario)}</td>
              <td><span class="status-badge" style="background:${saldo <= 0 ? "var(--error-100)" : critico ? "var(--warning-100)" : "var(--success-100)"};color:${saldo <= 0 ? "var(--error-800)" : critico ? "var(--warning-800)" : "var(--success-800)"};">${saldo <= 0 ? "Esgotado" : critico ? "Crítico" : "Normal"}</span></td>
              <td>${saldo > 0 && podeConsumir ? `<button class="btn-lancar-rapido" onclick="sistema.abrirModalConsumo(${this.ataSelecionada.id},${item.id})"><i class="fas fa-pen"></i> Consumo</button>` : ""}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  }

  async abrirModalConsumo(ataId, itemId) {
    const { data: item } = await supabaseClient
      .from("itens_ata")
      .select("*")
      .eq("id", itemId)
      .single();
    const saldo = item.saldo_quantidade || 0;
    await this.carregarSelectOrgaos("autarquiaConsumo");
    document.getElementById("modalConsumoConteudo").innerHTML = `<div>
        <div style="background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);margin-bottom:16px;">
          <p style="font-size:0.85rem;"><strong>Ata:</strong> ${this.ataSelecionada?.numero_ata}</p>
          <p style="font-size:0.85rem;"><strong>Item:</strong> ${item.descricao}</p>
          <p style="font-size:0.85rem;"><strong>Saldo:</strong> <span style="color:var(--success-600);font-weight:700;">${saldo}</span></p>
        </div>
        <div class="filtro-grupo" style="margin-bottom:12px;">
          <label style="font-size:0.75rem;">Órgão</label>
          <select id="autarquiaConsumo" class="filtro-select" style="padding:6px 10px;" required></select>
        </div>
        <div class="filtro-grupo" style="margin-bottom:12px;">
          <label style="font-size:0.75rem;">Quantidade</label>
          <input type="number" id="quantidadeConsumo" class="filtro-input" style="padding:6px 10px;" min="1" max="${saldo}" placeholder="Quantidade" required>
        </div>
        <div class="filtro-grupo" style="margin-bottom:16px;">
          <label style="font-size:0.75rem;">Observação</label>
          <input type="text" id="obsConsumo" class="filtro-input" style="padding:6px 10px;" placeholder="Opcional">
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn" style="background:var(--neutral-200);padding:6px 14px;border:none;border-radius:var(--border-radius-md);font-size:0.85rem;" onclick="sistema.fecharModalConsumo()">Cancelar</button>
          <button class="btn-consumo" style="padding:6px 14px;font-size:0.85rem;" onclick="sistema.registrarConsumo(${ataId}, ${itemId})"><i class="fas fa-save"></i> Registrar</button>
        </div>
      </div>`;
    document.getElementById("modalConsumo").classList.add("active");
  }

  async registrarConsumo(ataId, itemId) {
    const quantidade = parseInt(
      document.getElementById("quantidadeConsumo").value,
    );
    const orgaoId = parseInt(document.getElementById("autarquiaConsumo").value);
    const obs = document.getElementById("obsConsumo").value;
    if (!quantidade || quantidade <= 0) {
      this.mostrarToast("erro", "Quantidade inválida!");
      return;
    }
    if (!orgaoId) {
      this.mostrarToast("erro", "Selecione um órgão!");
      return;
    }
    try {
      const { error } = await supabaseClient.rpc("sp_registrar_consumo", {
        p_usuario_id: this.usuarioAtual.id,
        p_ata_id: ataId,
        p_item_ata_id: itemId,
        p_orgao_id: orgaoId,
        p_quantidade: quantidade,
        p_observacao: obs,
      });
      if (error) throw error;
      this.mostrarToast("sucesso", "Consumo registrado!");
      this.fecharModalConsumo();
      if (this.ataSelecionada?.id === ataId) this.abrirDetalhes(ataId);
      await this.carregarAtas();
      if (this.ataSelecionada?.id === ataId) {
        this.atualizarStatsGestao(this.ataSelecionada);
        this.filtrarItensGestao();
      }
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  carregarCarrinhoStorage() {
    const stored = localStorage.getItem("carrinhoAtas");
    if (stored)
      try {
        this.carrinho = JSON.parse(stored);
      } catch (e) {
        this.carrinho = [];
      }
    this.atualizarCarrinhoUI();
  }

  salvarCarrinhoStorage() {
    localStorage.setItem("carrinhoAtas", JSON.stringify(this.carrinho));
    this.atualizarCarrinhoUI();
  }

  atualizarCarrinhoUI() {
    const count = this.carrinho.length;
    document.getElementById("carrinhoCount").innerHTML = count;
    const indicator = document.getElementById("carrinhoIndicator");
    if (
      count > 0 &&
      (this.usuarioAtual?.perfil === "ADMIN" ||
        this.usuarioAtual?.perfil === "SECRETARIO" ||
        this.usuarioAtual?.perfil === "SOLICITANTE")
    )
      indicator.style.display = "flex";
    else indicator.style.display = "none";
  }

  adicionarAoCarrinho(ataId, itemId) {
    const qtdInput = document.getElementById(`qtd-${ataId}-${itemId}`);
    if (!qtdInput) return;
    const quantidade = parseInt(qtdInput.value);
    if (!quantidade || quantidade <= 0) {
      this.mostrarToast("erro", "Quantidade inválida!");
      return;
    }
    const ata = this.ataSelecionada;
    const item = ata.itens.find((i) => i.id === itemId);
    if (!item) return;
    if (quantidade > (item.saldo_quantidade || 0)) {
      this.mostrarToast(
        "erro",
        `Saldo insuficiente (${item.saldo_quantidade})!`,
      );
      return;
    }
    const numeroPedido = `PED-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000 + 1000))}`;
    this.carrinho.push({
      id: `${ataId}-${itemId}-${Date.now()}`,
      ataId: ata.id,
      ataNumero: ata.numero_ata,
      fornecedorId: ata.fornecedor_id,
      fornecedorRazao: ata.fornecedor?.razao_social,
      fornecedorCnpj: ata.fornecedor?.cnpj,
      processo: ata.processo_administrativo,
      objeto: ata.objeto,
      itemId: item.id,
      itemNumero: item.item_numero,
      itemDescricao: item.descricao,
      quantidade,
      valorUnitario: item.valor_unitario,
      valorTotal: item.valor_unitario * quantidade,
      numeroPedido,
      data: new Date().toISOString().split("T")[0],
      solicitante: this.usuarioAtual?.nome,
      orgaoId: this.usuarioAtual?.orgao_id,
    });
    qtdInput.value = "";
    this.salvarCarrinhoStorage();
    this.mostrarToast("sucesso", "Item adicionado ao carrinho!");
  }

  removerDoCarrinho(itemId) {
    this.carrinho = this.carrinho.filter((i) => i.id !== itemId);
    this.salvarCarrinhoStorage();
    this.abrirCarrinho();
  }

  limparCarrinho() {
    this.confirmar("Limpar carrinho?").then((confirmado) => {
      if (confirmado) {
        this.carrinho = [];
        this.salvarCarrinhoStorage();
        this.fecharModalCarrinho();
        this.mostrarToast("sucesso", "Carrinho limpo!");
      }
    });
  }

  abrirCarrinho() {
    if (this.carrinho.length === 0) {
      this.mostrarToast("aviso", "Carrinho vazio");
      return;
    }
    const pedidosPorAta = {};
    this.carrinho.forEach((item) => {
      if (!pedidosPorAta[item.ataId])
        pedidosPorAta[item.ataId] = {
          ataNumero: item.ataNumero,
          fornecedorId: item.fornecedorId,
          fornecedorRazao: item.fornecedorRazao,
          fornecedorCnpj: item.fornecedorCnpj,
          processo: item.processo,
          objeto: item.objeto,
          itens: [],
        };
      pedidosPorAta[item.ataId].itens.push(item);
    });
    let html = "";
    for (const [ataId, pedido] of Object.entries(pedidosPorAta)) {
      const total = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);
      html += `<div style="background:var(--neutral-50);padding:16px;border-radius:var(--border-radius-lg);margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <div>
            <h3 style="color:var(--neutral-900);font-size:1rem;">Ata ${pedido.ataNumero}</h3>
            <p style="color:var(--neutral-600);font-size:0.8rem;">${pedido.fornecedorRazao || ""}</p>
          </div>
          <span style="background:var(--primary-600);color:white;padding:6px 12px;border-radius:var(--border-radius-lg);font-size:0.85rem;">Total: ${this.formatarMoeda(total)}</span>
        </div>
        <div class="tabela-container">
          <table style="width:100%;font-size:0.8rem;">
            <thead>
              <tr style="background:var(--neutral-800);color:white;">
                <th style="padding:8px;">Item</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Valor Unit.</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${pedido.itens
                .map(
                  (i) => `<tr>
                <td style="padding:6px 8px;">${i.itemNumero}</td>
                <td>${i.itemDescricao}</td>
                <td class="numeric">${i.quantidade}</td>
                <td class="numeric">${this.formatarMoeda(i.valorUnitario)}</td>
                <td class="numeric">${this.formatarMoeda(i.valorTotal)}</td>
                <td><button onclick="sistema.removerDoCarrinho('${i.id}')" style="color:var(--error-600);background:none;border:none;cursor:pointer;"><i class="fas fa-trash"></i></button></td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    }
    html += `<div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn" style="background:var(--neutral-200);padding:8px 16px;border:none;border-radius:var(--border-radius-md);font-size:0.85rem;" onclick="sistema.limparCarrinho()"><i class="fas fa-trash"></i> Limpar</button>
      <button class="btn-gerar-pedido" style="padding:8px 16px;font-size:0.85rem;" onclick="sistema.gerarPedidos()"><i class="fas fa-file-invoice"></i> Gerar Pedido</button>
    </div>`;
    document.getElementById("modalCarrinhoConteudo").innerHTML = html;
    document.getElementById("modalCarrinho").classList.add("active");
  }

  async gerarPedidos() {
    if (this.carrinho.length === 0) return;
    const pedidosPorAta = {};
    this.carrinho.forEach((item) => {
      if (!pedidosPorAta[item.ataId])
        pedidosPorAta[item.ataId] = {
          ataNumero: item.ataNumero,
          fornecedorId: item.fornecedorId,
          fornecedorRazao: item.fornecedorRazao,
          fornecedorCnpj: item.fornecedorCnpj,
          processo: item.processo,
          objeto: item.objeto,
          itens: [],
        };
      pedidosPorAta[item.ataId].itens.push(item);
    });
    let pedidosHtml = "";
    const dataAtual = new Date().toISOString().split("T")[0];
    const dataExibicao = new Date().toLocaleDateString("pt-BR");
    this.pdfData = [];
    for (const [ataId, pedido] of Object.entries(pedidosPorAta)) {
      const totalPedido = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);
      const numeroPedido = `PED-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
      this.pdfData.push({
        numeroPedido,
        data: dataExibicao,
        pedido,
        solicitante: this.usuarioAtual?.nome,
        orgao: this.usuarioAtual?.orgao?.nome,
        totalPedido,
      });
      try {
        const { data: pedidoData, error: pedidoError } = await supabaseClient
          .from("pedidos")
          .insert({
            numero_pedido: numeroPedido,
            numero_requisicao: null,
            usuario_id: this.usuarioAtual.id,
            ata_id: parseInt(ataId),
            orgao_solicitante_id: this.usuarioAtual.orgao_id,
            fornecedor_id: pedido.fornecedorId,
            data_solicitacao: dataAtual,
            data_autorizacao: null,
            status: "PEDIDO_REALIZADO",
            observacoes: "Pedido gerado automaticamente via sistema",
            justificativa: null,
            valor_total: totalPedido,
            status_aprovacao:
              this.usuarioAtual.perfil === "SOLICITANTE"
                ? "AGUARDANDO_APROVACAO"
                : "APROVADO",
            aprovado_por:
              this.usuarioAtual.perfil !== "SOLICITANTE"
                ? this.usuarioAtual.id
                : null,
            data_aprovacao:
              this.usuarioAtual.perfil !== "SOLICITANTE" ? dataAtual : null,
            observacao_aprovacao: null,
          })
          .select()
          .single();
        if (pedidoError) throw pedidoError;
        for (const item of pedido.itens) {
          const itemData = {
            pedido_id: pedidoData.id,
            item_ata_id: item.itemId,
            quantidade_solicitada: item.quantidade,
            valor_unitario: item.valorUnitario,
            valor_total: item.valorTotal,
          };
          const { error: itemError } = await supabaseClient
            .from("itens_pedido")
            .insert(itemData);
          if (itemError) throw itemError;
        }
      } catch (e) {
        console.error(e);
        this.mostrarToast("erro", "Erro ao gerar pedido: " + e.message);
        return;
      }
      pedidosHtml += `<div class="pedido-container">
        <div class="pedido-header">
          <div>
            <h2 class="pedido-titulo">PEDIDO Nº ${numeroPedido}</h2>
            <p class="pedido-subtitulo" style="font-size:0.85rem;">${dataExibicao} | Ata: ${pedido.ataNumero}</p>
          </div>
          <span class="status-badge" style="background:var(--success-100);color:var(--success-800);font-size:0.75rem;"><i class="fas fa-check-circle"></i> PEDIDO REALIZADO</span>
        </div>
        <div class="pedido-info-grid">
          <div>
            <p style="font-weight:700;font-size:0.8rem;">FORNECEDOR</p>
            <p style="font-size:0.85rem;">${pedido.fornecedorRazao || ""}</p>
            <p style="font-size:0.75rem;">CNPJ: ${pedido.fornecedorCnpj || ""}</p>
          </div>
          <div>
            <p style="font-weight:700;font-size:0.8rem;">SOLICITANTE</p>
            <p style="font-size:0.85rem;">${this.usuarioAtual?.nome || ""}</p>
            <p style="font-size:0.75rem;">${this.usuarioAtual?.orgao?.nome || ""}</p>
          </div>
        </div>
        <h4 style="margin-bottom:12px;font-size:0.9rem;">Itens do Pedido</h4>
        <div class="tabela-container">
          <table style="width:100%;font-size:0.8rem;">
            <thead>
              <tr style="background:var(--neutral-800);color:white;">
                <th style="padding:8px;">Item</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Valor Unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${pedido.itens
                .map(
                  (i) => `<tr>
                <td style="padding:6px 8px;">${i.itemNumero}</td>
                <td>${i.itemDescricao}</td>
                <td class="numeric">${i.quantidade}</td>
                <td class="numeric">${this.formatarMoeda(i.valorUnitario)}</td>
                <td class="numeric">${this.formatarMoeda(i.valorTotal)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" style="text-align:right;font-weight:700;padding:10px;">TOTAL</td>
                <td style="color:var(--success-600);font-weight:700;text-align:right;">${this.formatarMoeda(totalPedido)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
    }
    pedidosHtml += `<div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn" style="background:var(--neutral-200);padding:8px 16px;border:none;border-radius:var(--border-radius-md);font-size:0.85rem;" onclick="sistema.fecharModalPedido()">Fechar</button>
      <button class="btn-pdf" style="padding:8px 16px;font-size:0.85rem;" onclick="sistema.visualizarPDF()"><i class="fas fa-file-pdf"></i> PDF</button>
    </div>`;
    document.getElementById("modalPedidoConteudo").innerHTML = pedidosHtml;
    this.fecharModalCarrinho();
    document.getElementById("modalPedido").classList.add("active");
    this.carrinho = [];
    this.salvarCarrinhoStorage();
    this.mostrarToast("sucesso", "Pedido(s) gerado(s) com sucesso!");
    await this.carregarPedidos();
  }

  async carregarPedidos() {
    const container = document.getElementById("pedidosLista");
    if (!this.usuarioAtual?.id) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px;">Usuário não logado</div>';
      return;
    }
    try {
      let query = supabaseClient.from("pedidos").select("*");
      if (this.usuarioAtual.perfil === "SOLICITANTE")
        query = query.eq("usuario_id", this.usuarioAtual.id);
      else if (this.usuarioAtual.perfil === "SECRETARIO")
        query = query
          .eq("orgao_solicitante_id", this.usuarioAtual.orgao_id)
          .eq("status_aprovacao", "AGUARDANDO_APROVACAO");
      const { data: pedidos, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      if (!pedidos?.length) {
        container.innerHTML =
          '<div style="text-align:center;padding:40px;"><i class="fas fa-file-invoice" style="font-size:3rem;color:var(--neutral-400);"></i><h3 style="margin-top:15px;color:var(--neutral-600);font-size:1rem;">Nenhum pedido encontrado</h3></div>';
        return;
      }
      const pedidosCompletos = await Promise.all(
        pedidos.map(async (p) => {
          const [
            usuarioResult,
            ataResult,
            fornecedorResult,
            orgaoResult,
            itensResult,
          ] = await Promise.all([
            supabaseClient
              .from("usuarios")
              .select("nome")
              .eq("id", p.usuario_id)
              .single(),
            supabaseClient
              .from("atas")
              .select("numero_ata, processo_administrativo")
              .eq("id", p.ata_id)
              .single(),
            supabaseClient
              .from("fornecedores")
              .select("razao_social,cnpj")
              .eq("id", p.fornecedor_id)
              .single(),
            supabaseClient
              .from("orgaos")
              .select("nome,sigla")
              .eq("id", p.orgao_solicitante_id)
              .single(),
            supabaseClient
              .from("itens_pedido")
              .select("*")
              .eq("pedido_id", p.id),
          ]);
          const itensCompletos = [];
          if (itensResult.data && itensResult.data.length > 0) {
            for (const item of itensResult.data) {
              const { data: itemAta } = await supabaseClient
                .from("itens_ata")
                .select("descricao, item_numero")
                .eq("id", item.item_ata_id)
                .single();
              itensCompletos.push({
                ...item,
                descricao: itemAta?.descricao || "Descrição não encontrada",
                item_numero: itemAta?.item_numero || item.item_ata_id,
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
            orgao_solicitante: orgaoResult.data || {
              nome: "N/I",
              sigla: "",
            },
            itens_pedido: itensCompletos,
          };
        }),
      );
      container.innerHTML = pedidosCompletos
        .map((p) => {
          const total =
            p.itens_pedido?.reduce((s, i) => s + (i.valor_total || 0), 0) || 0;
          const statusAprovacao = p.status_aprovacao || "AGUARDANDO_APROVACAO";
          const podeAprovar =
            (this.usuarioAtual.perfil === "ADMIN" ||
              (this.usuarioAtual.perfil === "SECRETARIO" &&
                this.usuarioAtual.orgao_id === p.orgao_solicitante_id)) &&
            statusAprovacao === "AGUARDANDO_APROVACAO";
          return `<div style="background:white;border-radius:var(--border-radius-lg);padding:16px;border:1px solid var(--neutral-200);margin-bottom:16px;box-shadow:var(--shadow-sm);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="background:var(--primary-600);color:white;padding:4px 10px;border-radius:40px;font-weight:600;font-size:0.75rem;">${p.numero_pedido || "N/I"}</span>
                <span style="color:var(--neutral-500);font-size:0.8rem;"><i class="fas fa-calendar"></i> ${this.formatarData(p.data_solicitacao)}</span>
                <span class="status-badge" style="background:${statusAprovacao === "APROVADO" ? "var(--success-100)" : statusAprovacao === "REJEITADO" ? "var(--error-100)" : "var(--warning-100)"};color:${statusAprovacao === "APROVADO" ? "var(--success-800)" : statusAprovacao === "REJEITADO" ? "var(--error-800)" : "var(--warning-800)"};">${statusAprovacao}</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px;background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
              <div><p style="font-size:0.65rem;text-transform:uppercase;color:var(--neutral-500);margin-bottom:2px;">ATA</p><p style="font-weight:600;margin-bottom:2px;font-size:0.85rem;">${p.ata?.numero_ata || "N/I"}</p><p style="font-size:0.7rem;color:var(--neutral-600);">Proc: ${p.ata?.processo_administrativo || ""}</p></div>
              <div><p style="font-size:0.65rem;text-transform:uppercase;color:var(--neutral-500);margin-bottom:2px;">FORNECEDOR</p><p style="font-weight:600;margin-bottom:2px;font-size:0.85rem;">${p.fornecedor?.razao_social || "N/I"}</p><p style="font-size:0.7rem;color:var(--neutral-600);">${p.fornecedor?.cnpj || ""}</p></div>
              <div><p style="font-size:0.65rem;text-transform:uppercase;color:var(--neutral-500);margin-bottom:2px;">ÓRGÃO</p><p style="font-weight:600;font-size:0.85rem;">${p.orgao_solicitante?.nome || "N/I"}</p><p style="font-size:0.7rem;color:var(--neutral-600);">${p.orgao_solicitante?.sigla || ""}</p></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div><p style="font-size:0.65rem;text-transform:uppercase;color:var(--neutral-500);margin-bottom:2px;">VALOR TOTAL</p><p style="font-weight:700;color:var(--success-600);font-size:1rem;">${this.formatarMoeda(total)}</p></div>
              <div style="display:flex;gap:8px;">
                <button class="btn-visualizar" onclick="sistema.visualizarPedidoCompleto(${p.id})" style="padding:6px 12px;font-size:0.75rem;"><i class="fas fa-eye"></i> Ver Itens</button>
                <button class="btn-pdf" onclick="sistema.gerarPDFPedido(${p.id})" style="padding:6px 12px;font-size:0.75rem;background:var(--primary-600);"><i class="fas fa-file-pdf"></i> PDF</button>
              </div>
            </div>
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--neutral-200);font-size:0.75rem;color:var(--neutral-500);display:flex;justify-content:space-between;flex-wrap:wrap;">
              <span><i class="fas fa-user"></i> Solicitante: ${p.usuario?.nome || "N/I"}</span>
              <span><i class="fas fa-boxes"></i> ${p.itens_pedido?.length || 0} item(ns)</span>
            </div>
            ${podeAprovar ? `<div style="display:flex;gap:8px;margin-top:10px;"><button class="btn-success" onclick="sistema.aprovarPedido(${p.id})"><i class="fas fa-check"></i> Aprovar</button><button class="btn-danger" onclick="sistema.rejeitarPedido(${p.id})"><i class="fas fa-times"></i> Rejeitar</button></div>` : ""}
          </div>`;
        })
        .join("");
    } catch (error) {
      container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--error-600);"><i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i><h3 style="font-size:0.9rem;">Erro ao carregar pedidos</h3><p style="font-size:0.8rem;">${error.message}</p></div>`;
    }
  }

  async aprovarPedido(pedidoId) {
    try {
      const { error } = await supabaseClient
        .from("pedidos")
        .update({
          status_aprovacao: "APROVADO",
          aprovado_por: this.usuarioAtual.id,
          data_aprovacao: new Date().toISOString().split("T")[0],
        })
        .eq("id", pedidoId);
      if (error) throw error;
      this.mostrarToast("sucesso", "Pedido aprovado!");
      this.carregarPedidos();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async rejeitarPedido(pedidoId) {
    const justificativa = prompt("Motivo da rejeição:");
    if (!justificativa) return;
    try {
      const { error } = await supabaseClient
        .from("pedidos")
        .update({
          status_aprovacao: "REJEITADO",
          aprovado_por: this.usuarioAtual.id,
          data_aprovacao: new Date().toISOString().split("T")[0],
          observacao_aprovacao: justificativa,
        })
        .eq("id", pedidoId);
      if (error) throw error;
      this.mostrarToast("sucesso", "Pedido rejeitado.");
      this.carregarPedidos();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async visualizarPedidoCompleto(pedidoId) {
    try {
      const { data: pedido, error: ePed } = await supabaseClient
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .single();
      if (ePed || !pedido) {
        this.mostrarToast("erro", "Pedido não encontrado");
        return;
      }
      const [
        usuarioResult,
        ataResult,
        fornecedorResult,
        orgaoResult,
        itensResult,
      ] = await Promise.all([
        supabaseClient
          .from("usuarios")
          .select("nome")
          .eq("id", pedido.usuario_id)
          .single(),
        supabaseClient
          .from("atas")
          .select(
            "numero_ata, processo_administrativo, objeto, data_inicio_vigencia, data_fim_vigencia",
          )
          .eq("id", pedido.ata_id)
          .single(),
        supabaseClient
          .from("fornecedores")
          .select("razao_social,cnpj")
          .eq("id", pedido.fornecedor_id)
          .single(),
        supabaseClient
          .from("orgaos")
          .select("nome,sigla,cnpj")
          .eq("id", pedido.orgao_solicitante_id)
          .single(),
        supabaseClient
          .from("itens_pedido")
          .select("*")
          .eq("pedido_id", pedidoId),
      ]);
      const itensCompletos = [];
      if (itensResult.data && itensResult.data.length > 0) {
        for (const item of itensResult.data) {
          const { data: itemAta } = await supabaseClient
            .from("itens_ata")
            .select("descricao, item_numero")
            .eq("id", item.item_ata_id)
            .single();
          itensCompletos.push({
            ...item,
            descricao: itemAta?.descricao || "Descrição não encontrada",
            item_numero: itemAta?.item_numero || item.item_ata_id,
          });
        }
      }
      const pedidoCompleto = {
        ...pedido,
        usuario: usuarioResult.data || { nome: "N/I" },
        ata: ataResult.data || {
          numero_ata: "N/I",
          processo_administrativo: "",
          objeto: "",
          data_inicio_vigencia: null,
          data_fim_vigencia: null,
        },
        fornecedor: fornecedorResult.data || {
          razao_social: "N/I",
          cnpj: "",
        },
        orgao_solicitante: orgaoResult.data || {
          nome: "N/I",
          sigla: "",
          cnpj: "",
        },
        itens_pedido: itensCompletos,
      };
      const total = pedidoCompleto.itens_pedido.reduce(
        (s, i) => s + (i.valor_total || 0),
        0,
      );
      const statusAprovacao =
        pedidoCompleto.status_aprovacao || "AGUARDANDO_APROVACAO";
      let html = `<div class="pedido-container">
        <div class="pedido-header">
          <div>
            <h2 class="pedido-titulo">PEDIDO Nº ${pedidoCompleto.numero_pedido}</h2>
            <p class="pedido-subtitulo" style="font-size:0.85rem;">${this.formatarData(pedidoCompleto.data_solicitacao)}</p>
          </div>
          <span class="status-badge" style="background:${statusAprovacao === "APROVADO" ? "var(--success-100)" : statusAprovacao === "REJEITADO" ? "var(--error-100)" : "var(--warning-100)"};color:${statusAprovacao === "APROVADO" ? "var(--success-800)" : statusAprovacao === "REJEITADO" ? "var(--error-800)" : "var(--warning-800)"};">${statusAprovacao}</span>
        </div>`;
      if (pedidoCompleto.aprovado_por) {
        const { data: aprovador } = await supabaseClient
          .from("usuarios")
          .select("nome")
          .eq("id", pedidoCompleto.aprovado_por)
          .single();
        html += `<div style="margin-bottom:16px;padding:8px;background:var(--neutral-50);border-radius:var(--border-radius-lg);font-size:0.85rem;"><strong>Aprovado/Rejeitado por:</strong> ${aprovador?.nome || "Desconhecido"} em ${this.formatarData(pedidoCompleto.data_aprovacao)} ${pedidoCompleto.observacao_aprovacao ? `<br><strong>Observação:</strong> ${pedidoCompleto.observacao_aprovacao}` : ""}</div>`;
      }
      html += `<div style="margin-bottom:16px;">
        <h3 style="color:var(--primary-700);margin-bottom:8px;font-size:0.9rem;">DADOS DA ATA</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
          <div>
            <strong style="font-size:0.8rem;">Ata nº:</strong> <span style="font-size:0.85rem;">${pedidoCompleto.ata?.numero_ata || "N/I"}</span><br>
            <strong style="font-size:0.8rem;">Processo:</strong> <span style="font-size:0.85rem;">${pedidoCompleto.ata?.processo_administrativo || "N/I"}</span><br>
            <strong style="font-size:0.8rem;">Objeto:</strong> <span style="font-size:0.85rem;">${pedidoCompleto.ata?.objeto || "N/I"}</span>
          </div>
          <div>
            <strong style="font-size:0.8rem;">Vigência:</strong> <span style="font-size:0.85rem;">${this.formatarData(pedidoCompleto.ata?.data_inicio_vigencia)} até ${this.formatarData(pedidoCompleto.ata?.data_fim_vigencia)}</span>
          </div>
        </div>
      </div>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
          <h4 style="color:var(--primary-700);margin-bottom:6px;font-size:0.85rem;">FORNECEDOR</h4>
          <p style="font-size:0.8rem;"><strong>Razão Social:</strong> ${pedidoCompleto.fornecedor?.razao_social || "N/I"}</p>
          <p style="font-size:0.8rem;"><strong>CNPJ:</strong> ${pedidoCompleto.fornecedor?.cnpj || "N/I"}</p>
        </div>
        <div style="background:var(--neutral-50);padding:12px;border-radius:var(--border-radius-lg);">
          <h4 style="color:var(--primary-700);margin-bottom:6px;font-size:0.85rem;">SOLICITANTE</h4>
          <p style="font-size:0.8rem;"><strong>Órgão:</strong> ${pedidoCompleto.orgao_solicitante?.nome || "N/I"} (${pedidoCompleto.orgao_solicitante?.sigla || ""})</p>
          <p style="font-size:0.8rem;"><strong>CNPJ:</strong> ${pedidoCompleto.orgao_solicitante?.cnpj || "N/I"}</p>
          <p style="font-size:0.8rem;"><strong>Solicitante:</strong> ${pedidoCompleto.usuario?.nome || "N/I"}</p>
        </div>
      </div>`;
      html += `<h4 style="margin-bottom:10px;font-size:0.9rem;">ITENS DO PEDIDO</h4>
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
                (i) => `<tr>
              <td style="padding:6px 8px;border-bottom:1px solid var(--neutral-200);">${i.item_numero || i.item_ata_id}</td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--neutral-200);">${i.descricao || "Descrição não disponível"}</td>
              <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--neutral-200);">${i.quantidade_solicitada || 0}</td>
              <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--neutral-200);">${this.formatarMoeda(i.valor_unitario)}</td>
              <td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--neutral-200);">${this.formatarMoeda(i.valor_total)}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr style="background:var(--neutral-50);">
              <td colspan="4" style="padding:10px;text-align:right;font-weight:700;">TOTAL DO PEDIDO</td>
              <td style="padding:10px;text-align:right;font-weight:700;color:var(--success-600);">${this.formatarMoeda(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
      html += `<div style="margin-top:20px;font-size:0.7rem;color:var(--neutral-500);font-style:italic;text-align:center;border-top:1px solid var(--neutral-200);padding-top:12px;">
        <p>Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")}.</p>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn" style="background:var(--neutral-200);padding:6px 14px;border:none;border-radius:var(--border-radius-md);cursor:pointer;font-size:0.8rem;" onclick="sistema.fecharModalVisualizarPedido()">Fechar</button>
        <button class="btn-pdf" style="background:var(--primary-600);color:white;padding:6px 14px;border:none;border-radius:var(--border-radius-md);cursor:pointer;font-size:0.8rem;" onclick="sistema.gerarPDFPedido(${pedido.id})"><i class="fas fa-file-pdf"></i> PDF</button>
      </div>
    </div>`;
      document.getElementById("modalVisualizarPedidoConteudo").innerHTML = html;
      document.getElementById("modalVisualizarPedido").classList.add("active");
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async gerarPDFPedido(pedidoId) {
    try {
      const pedido = await this.carregarPedidoCompleto(pedidoId);
      if (!pedido) {
        this.mostrarToast("erro", "Pedido não encontrado!");
        return;
      }
      const total = pedido.itens_pedido.reduce(
        (s, i) => s + (i.valor_total || 0),
        0,
      );
      this.pdfData = [
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
        },
      ];
      this.baixarPDF();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async carregarPedidoCompleto(pedidoId) {
    try {
      const { data: pedido, error: ePed } = await supabaseClient
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
        supabaseClient
          .from("usuarios")
          .select("nome")
          .eq("id", pedido.usuario_id)
          .single(),
        supabaseClient
          .from("atas")
          .select(
            "numero_ata, processo_administrativo, objeto, data_inicio_vigencia, data_fim_vigencia",
          )
          .eq("id", pedido.ata_id)
          .single(),
        supabaseClient
          .from("fornecedores")
          .select("razao_social,cnpj")
          .eq("id", pedido.fornecedor_id)
          .single(),
        supabaseClient
          .from("orgaos")
          .select("nome,sigla,cnpj")
          .eq("id", pedido.orgao_solicitante_id)
          .single(),
        supabaseClient
          .from("itens_pedido")
          .select("*")
          .eq("pedido_id", pedidoId),
      ]);
      const itensCompletos = [];
      if (itensResult.data && itensResult.data.length > 0) {
        for (const item of itensResult.data) {
          const { data: itemAta } = await supabaseClient
            .from("itens_ata")
            .select("descricao, item_numero")
            .eq("id", item.item_ata_id)
            .single();
          itensCompletos.push({
            ...item,
            descricao: itemAta?.descricao || "Descrição não encontrada",
            item_numero: itemAta?.item_numero || item.item_ata_id,
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

  async carregarTabelaUsuarios() {
    const tbody = document.getElementById("tabelaUsuariosBody");
    if (!tbody) return;
    await this.carregarOrgaos();
    const { data: usuarios } = await supabaseClient
      .from("usuarios")
      .select("*, orgao:orgaos(*)")
      .eq("ativo", true)
      .order("nome");
    if (!usuarios?.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:20px;">Nenhum usuário</td></tr>';
      return;
    }
    tbody.innerHTML = usuarios
      .map((u) => {
        const perfilClass = {
          ADMIN: "perfil-admin",
          SECRETARIO: "perfil-secretario",
          SOLICITANTE: "perfil-solicitante",
          ESTAGIARIO: "perfil-estagiario",
        }[u.perfil];
        return `<tr>
          <td><strong style="font-size:0.85rem;">${u.nome}</strong></td>
          <td style="font-size:0.8rem;">${u.email}</td>
          <td style="font-size:0.8rem;">${u.orgao?.nome || ""}</td>
          <td><span class="badge-perfil ${perfilClass}" style="font-size:0.65rem;">${u.perfil}</span></td>
          <td><span class="badge-perfil status-ativo" style="font-size:0.65rem;"><i class="fas fa-circle"></i> Ativo</span></td>
          <td>
            ${u.perfil === "ADMIN" ? `<button class="btn-editar-usuario" onclick="sistema.editarUsuario(${u.id})" style="padding:4px;"><i class="fas fa-edit"></i></button>` : ""}
            ${u.id !== this.usuarioAtual?.id && u.perfil !== "ADMIN" ? `<button class="btn-desativar-usuario" onclick="sistema.desativarUsuario(${u.id})" style="padding:4px;"><i class="fas fa-trash"></i></button>` : ""}
          </td>
        </tr>`;
      })
      .join("");
  }

  abrirModalUsuario(usuarioId = null) {
    if (this.usuarioAtual?.perfil !== "ADMIN") {
      this.mostrarToast("erro", "Apenas administradores");
      return;
    }
    this.carregarSelectOrgaos("usuarioOrgao");
    if (usuarioId) {
      document.getElementById("modalUsuarioTitulo").innerHTML =
        '<i class="fas fa-edit"></i> Editar Usuário';
      this.editarUsuario(usuarioId);
    } else {
      document.getElementById("modalUsuarioTitulo").innerHTML =
        '<i class="fas fa-user-plus"></i> Novo Usuário';
      document.getElementById("usuarioId").value = "";
      document.getElementById("usuarioNome").value = "";
      document.getElementById("usuarioEmail").value = "";
      document.getElementById("usuarioSenha").value = "";
      document.getElementById("usuarioPerfil").value = "SOLICITANTE";
      document.getElementById("modalUsuario").classList.add("active");
    }
  }

  async editarUsuario(id) {
    const { data: u } = await supabaseClient
      .from("usuarios")
      .select("*")
      .eq("id", id)
      .single();
    if (u) {
      document.getElementById("usuarioId").value = u.id;
      document.getElementById("usuarioNome").value = u.nome || "";
      document.getElementById("usuarioEmail").value = u.email || "";
      document.getElementById("usuarioSenha").value = "";
      document.getElementById("usuarioPerfil").value =
        u.perfil || "SOLICITANTE";
      await this.carregarSelectOrgaos("usuarioOrgao", u.orgao_id);
      document.getElementById("modalUsuario").classList.add("active");
    }
  }

  fecharModalUsuario() {
    document.getElementById("modalUsuario").classList.remove("active");
  }

  async salvarUsuario() {
    const id = document.getElementById("usuarioId").value;
    const nome = document.getElementById("usuarioNome").value;
    const email = document.getElementById("usuarioEmail").value;
    const senha = document.getElementById("usuarioSenha").value;
    const orgaoId = parseInt(document.getElementById("usuarioOrgao").value);
    const perfil = document.getElementById("usuarioPerfil").value;
    if (!nome || !email || !orgaoId) {
      this.mostrarToast("erro", "Preencha todos os campos obrigatórios");
      return;
    }
    try {
      if (id) {
        const { error } = await supabaseClient
          .from("usuarios")
          .update({ nome, email, perfil, orgao_id: orgaoId })
          .eq("id", id);
        if (error) throw error;
        this.mostrarToast("sucesso", "Usuário atualizado!");
      } else {
        if (!senha || senha.length < 6) {
          this.mostrarToast("erro", "Senha deve ter no mínimo 6 caracteres");
          return;
        }
        const { data: authData, error: authError } =
          await supabaseClient.auth.signUp({
            email,
            password: senha,
            options: { data: { name: nome } },
          });
        if (authError) throw authError;
        const { error } = await supabaseClient.from("usuarios").insert({
          uuid: authData.user.id,
          nome,
          email,
          perfil,
          orgao_id: orgaoId,
          ativo: true,
        });
        if (error) throw error;
        this.mostrarToast("sucesso", "Usuário criado!");
      }
      this.fecharModalUsuario();
      await this.carregarTabelaUsuarios();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async desativarUsuario(id) {
    const confirmado = await this.confirmar("Desativar usuário?");
    if (confirmado) {
      await supabaseClient
        .from("usuarios")
        .update({ ativo: false })
        .eq("id", id);
      await this.carregarTabelaUsuarios();
      this.mostrarToast("sucesso", "Usuário desativado");
    }
  }

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

  removerItemCadastro(id) {
    this.itensCadastroTemp = this.itensCadastroTemp.filter((i) => i.id !== id);
    this.itensCadastroTemp.forEach((item, idx) => (item.numero = idx + 1));
    this.renderizarItensCadastro();
  }

  calcularTotaisItem() {
    this.itensCadastroTemp.forEach((item) => {
      item.valor_total = (item.quantidade || 0) * (item.valor_unitario || 0);
    });
    this.renderizarItensCadastro();
  }

  renderizarItensCadastro() {
    const tbody = document.getElementById("itensCadastroBody");
    if (!tbody) return;
    tbody.innerHTML = this.itensCadastroTemp
      .map(
        (item) =>
          `<tr>
            <td><input type="text" value="${item.numero}" onchange="sistema.atualizarItemCadastro(${item.id}, 'numero', this.value)" style="width:60px;font-size:0.8rem;"></td>
            <td><input type="text" value="${item.descricao}" onchange="sistema.atualizarItemCadastro(${item.id}, 'descricao', this.value)" placeholder="Descrição" style="width:100%;font-size:0.8rem;" required></td>
            <td><input type="number" value="${item.quantidade}" onchange="sistema.atualizarItemCadastro(${item.id}, 'quantidade', parseInt(this.value)||0); sistema.calcularTotaisItem();" min="0" style="width:70px;font-size:0.8rem;" required></td>
            <td><input type="number" value="${item.valor_unitario}" onchange="sistema.atualizarItemCadastro(${item.id}, 'valor_unitario', parseFloat(this.value)||0); sistema.calcularTotaisItem();" min="0" step="0.01" style="width:90px;font-size:0.8rem;" required></td>
            <td style="text-align:right;font-weight:600;font-size:0.8rem;">${this.formatarMoeda(item.valor_total)}</td>
            <td><button type="button" class="btn-remover-item" onclick="sistema.removerItemCadastro(${item.id})" style="padding:4px;"><i class="fas fa-trash"></i></button></td>
          </tr>`,
      )
      .join("");
    document.getElementById("totalItensCadastro").innerHTML =
      this.itensCadastroTemp.length;
    const totalAta = this.itensCadastroTemp.reduce(
      (s, i) => s + (i.valor_total || 0),
      0,
    );
    document.getElementById("valorTotalAta").innerHTML =
      this.formatarMoeda(totalAta);
  }

  atualizarItemCadastro(id, campo, valor) {
    let item = this.itensCadastroTemp.find((i) => i.id === id);
    if (item) item[campo] = valor;
  }

  async salvarAta() {
    if (this.itensCadastroTemp.length === 0) {
      this.mostrarToast("erro", "Adicione pelo menos um item");
      return;
    }
    for (const i of this.itensCadastroTemp) {
      if (!i.descricao?.trim()) {
        this.mostrarToast("erro", `Item ${i.numero}: Descrição obrigatória`);
        return;
      }
      if (i.quantidade <= 0) {
        this.mostrarToast("erro", `Item ${i.numero}: Quantidade > 0`);
        return;
      }
      if (i.valor_unitario <= 0) {
        this.mostrarToast("erro", `Item ${i.numero}: Valor unitário > 0`);
        return;
      }
    }

    // Processar categoria
    let categoriaId = null;
    const categoriaNome = document
      .getElementById("categoriaInput")
      .value.trim();
    if (categoriaNome) {
      const categoria = this.categorias.find(
        (c) => c.nome.toLowerCase() === categoriaNome.toLowerCase(),
      );
      if (categoria) {
        categoriaId = categoria.id;
      } else {
        // Se não encontrou, pode criar uma nova categoria? Decidimos não criar automaticamente, apenas ignorar.
        // Apenas mostra um aviso e continua sem categoria.
        this.mostrarToast(
          "aviso",
          "Categoria não encontrada na lista. A ata será salva sem categoria.",
        );
      }
    }

    try {
      let fornecedorId = null;
      const { data: exist } = await supabaseClient
        .from("fornecedores")
        .select("id")
        .eq("cnpj", document.getElementById("fornecedorCnpj").value)
        .maybeSingle();
      if (exist) fornecedorId = exist.id;
      else {
        const { data: novo, error: fe } = await supabaseClient
          .from("fornecedores")
          .insert({
            razao_social: document.getElementById("fornecedorRazao").value,
            cnpj: document.getElementById("fornecedorCnpj").value,
          })
          .select()
          .single();
        if (fe) throw fe;
        fornecedorId = novo.id;
      }
      const { data: ata, error: ae } = await supabaseClient
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
          usuario_cadastro_id: this.usuarioAtual.id,
          categoria_id: categoriaId,
        })
        .select()
        .single();
      if (ae) throw ae;
      for (const i of this.itensCadastroTemp) {
        const { error: ie } = await supabaseClient.from("itens_ata").insert({
          ata_id: ata.id,
          item_numero: i.numero,
          descricao: i.descricao,
          quantidade_contratada: i.quantidade,
          saldo_quantidade: i.quantidade,
          saldo_valor: i.valor_total,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          categoria: "Geral",
        });
        if (ie) throw ie;
      }
      this.mostrarToast("sucesso", "Ata cadastrada!");
      this.itensCadastroTemp = [];
      this.renderizarItensCadastro();
      document.getElementById("formCadastroAta").reset();
      this.ativarTab("consulta");
      await this.carregarAtas();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async carregarAtasParaAditivo() {
    const select = document.getElementById("aditivoAtaOriginal");
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    const { data: atas } = await supabaseClient
      .from("atas")
      .select(
        `id, numero_ata, situacao, data_inicio_vigencia, data_fim_vigencia, valor_global, fornecedor:fornecedores(razao_social)`,
      )
      .in("situacao", ["ATIVA", "PROXIMA"])
      .order("numero_ata");
    atas?.forEach((a) => {
      let o = document.createElement("option");
      o.value = a.id;
      o.textContent = `${a.numero_ata} - ${a.fornecedor?.razao_social || ""} (${a.situacao})`;
      select.appendChild(o);
    });
  }

  async abrirModalAditivo(ataId = null) {
    if (
      this.usuarioAtual?.perfil !== "ADMIN" &&
      this.usuarioAtual?.perfil !== "ESTAGIARIO"
    ) {
      this.mostrarToast(
        "erro",
        "Apenas administradores e estagiários podem criar aditivos.",
      );
      return;
    }
    document.getElementById("modalAditivoTitulo").innerHTML =
      '<i class="fas fa-file-contract"></i> Novo Aditivo';
    document.getElementById("formAditivo").reset();
    document.getElementById("aditivoId").value = "";
    document.getElementById("camposPrazo").style.display = "none";
    document.getElementById("camposValor").style.display = "none";
    document.getElementById("itensAditivoContainer").style.display = "none";
    document.getElementById("resumoAtaOriginal").innerHTML = "";
    await this.carregarAtasParaAditivo();
    if (ataId) {
      document.getElementById("aditivoAtaOriginal").value = ataId;
      document.getElementById("aditivoAtaOriginal").disabled = true;
      await this.carregarResumoAtaOriginal(ataId);
    } else document.getElementById("aditivoAtaOriginal").disabled = false;
    document.getElementById("modalAditivo").classList.add("active");
  }

  async carregarResumoAtaOriginal(ataId) {
    if (!ataId) {
      document.getElementById("resumoAtaOriginal").innerHTML = "";
      return;
    }
    const { data: ata } = await supabaseClient
      .from("atas")
      .select("*, fornecedor:fornecedores(*)")
      .eq("id", ataId)
      .single();
    if (ata) {
      this.ataParaAditivo = ata;
      const { data: consumos } = await supabaseClient
        .from("consumos")
        .select("valor_total")
        .eq("ata_id", ataId);
      const valorConsumido =
        consumos?.reduce((s, c) => s + (c.valor_total || 0), 0) || 0;
      const saldoAtual = (ata.valor_global || 0) - valorConsumido;
      document.getElementById("resumoAtaOriginal").innerHTML =
        `<div class="resumo-ata-original">
          <h4><i class="fas fa-file-contract"></i> Ata Original</h4>
          <div class="resumo-grid">
            <div class="resumo-item"><span class="resumo-label">Número</span><span class="resumo-valor">${ata.numero_ata}</span></div>
            <div class="resumo-item"><span class="resumo-label">Fornecedor</span><span class="resumo-valor">${ata.fornecedor?.razao_social || ""}</span></div>
            <div class="resumo-item"><span class="resumo-label">Vigência</span><span class="resumo-valor">${this.formatarData(ata.data_inicio_vigencia)} até ${this.formatarData(ata.data_fim_vigencia)}</span></div>
            <div class="resumo-item"><span class="resumo-label">Valor Global</span><span class="resumo-valor">${this.formatarMoeda(ata.valor_global)}</span></div>
            <div class="resumo-item"><span class="resumo-label">Consumido</span><span class="resumo-valor">${this.formatarMoeda(valorConsumido)}</span></div>
            <div class="resumo-item"><span class="resumo-label">Saldo Atual</span><span class="resumo-valor destaque">${this.formatarMoeda(saldoAtual)}</span></div>
          </div>
        </div>`;
    }
  }

  toggleCamposAditivo() {
    const tipo = document.getElementById("aditivoTipo").value;
    document.getElementById("camposPrazo").style.display =
      tipo === "PRAZO" || tipo === "AMBOS" ? "block" : "none";
    document.getElementById("camposValor").style.display =
      tipo === "VALOR" || tipo === "AMBOS" ? "block" : "none";
    if (tipo === "VALOR" || tipo === "AMBOS") {
      const ataId = document.getElementById("aditivoAtaOriginal").value;
      if (ataId) this.carregarItensParaAditivo(ataId);
    }
  }

  async carregarItensParaAditivo(ataId) {
    const { data: itens } = await supabaseClient
      .from("itens_ata")
      .select("*")
      .eq("ata_id", ataId)
      .order("item_numero");
    if (itens?.length) {
      let html = `<table class="itens-aditivo-tabela">
        <thead>
          <tr>
            <th>Item</th>
            <th>Descrição</th>
            <th>Qtd Original</th>
            <th>Saldo</th>
            <th>Valor Unit.</th>
            <th>Nova Qtd</th>
            <th>Novo Valor Unit.</th>
          </tr>
        </thead>
        <tbody>`;
      itens.forEach((item) => {
        html += `<tr>
          <td>${item.item_numero}</td>
          <td>${item.descricao}</td>
          <td class="numeric">${item.quantidade_contratada}</td>
          <td class="numeric">${item.saldo_quantidade}</td>
          <td class="numeric">${this.formatarMoeda(item.valor_unitario)}</td>
          <td><input type="number" id="nova_qtd_${item.id}" class="item-nova-qtd" min="0" placeholder="Nova qtd" data-item-id="${item.id}"></td>
          <td><input type="number" id="novo_valor_${item.id}" class="item-novo-valor" min="0" step="0.01" placeholder="Novo valor" data-item-id="${item.id}"></td>
        </tr>`;
      });
      html += `</tbody></table>`;
      document.getElementById("itensAditivoLista").innerHTML = html;
    }
  }

  toggleItensAditivo() {
    const checked = document.getElementById("aditivoAlterarItens").checked;
    document.getElementById("itensAditivoContainer").style.display = checked
      ? "block"
      : "none";
    if (checked) {
      const ataId = document.getElementById("aditivoAtaOriginal").value;
      if (ataId) this.carregarItensParaAditivo(ataId);
    }
  }

  async salvarAditivo() {
    const ataId = document.getElementById("aditivoAtaOriginal").value;
    if (!ataId) {
      this.mostrarToast("erro", "Selecione a ata original!");
      return;
    }
    const dadosAditivo = {
      ata_original_id: parseInt(ataId),
      numero_aditivo: document.getElementById("aditivoNumero").value,
      tipo_aditivo: document.getElementById("aditivoTipo").value,
      data_assinatura: document.getElementById("aditivoDataAssinatura").value,
      documento_referencia:
        document.getElementById("aditivoDocumento").value || null,
      nova_data_inicio_vigencia:
        document.getElementById("aditivoNovaDataInicio").value || null,
      nova_data_fim_vigencia:
        document.getElementById("aditivoNovaDataFim").value || null,
      novo_valor_global: document.getElementById("aditivoNovoValor").value
        ? parseFloat(document.getElementById("aditivoNovoValor").value)
        : null,
      justificativa: document.getElementById("aditivoJustificativa").value,
      observacoes: document.getElementById("aditivoObservacoes").value || null,
      usuario_registro_id: this.usuarioAtual.id,
      status: "ATIVO",
      data_aplicacao: null,
    };
    if (!dadosAditivo.numero_aditivo) {
      this.mostrarToast("erro", "Informe o número do aditivo!");
      return;
    }
    if (!dadosAditivo.tipo_aditivo) {
      this.mostrarToast("erro", "Selecione o tipo de aditivo!");
      return;
    }
    if (!dadosAditivo.data_assinatura) {
      this.mostrarToast("erro", "Informe a data de assinatura!");
      return;
    }
    if (!dadosAditivo.justificativa) {
      this.mostrarToast("erro", "Informe a justificativa do aditivo!");
      return;
    }
    if (
      (dadosAditivo.tipo_aditivo === "PRAZO" ||
        dadosAditivo.tipo_aditivo === "AMBOS") &&
      !dadosAditivo.nova_data_fim_vigencia
    ) {
      this.mostrarToast(
        "erro",
        "Para aditivo de prazo, informe a nova data de fim de vigência!",
      );
      return;
    }
    try {
      const { data: aditivo, error } = await supabaseClient
        .from("aditivos_ata")
        .insert([dadosAditivo])
        .select()
        .single();
      if (error) throw error;
      if (document.getElementById("aditivoAlterarItens").checked) {
        const itensAlterados = [];
        const inputsQtd = document.querySelectorAll(".item-nova-qtd");
        const inputsValor = document.querySelectorAll(".item-novo-valor");
        inputsQtd.forEach((i) => {
          if (i.value) {
            const itemId = i.dataset.itemId;
            itensAlterados.push({
              item_ata_id: parseInt(itemId),
              nova_quantidade: parseInt(i.value),
            });
          }
        });
        inputsValor.forEach((i) => {
          if (i.value) {
            const itemId = i.dataset.itemId;
            const existente = itensAlterados.find(
              (x) => x.item_ata_id === parseInt(itemId),
            );
            if (existente) existente.novo_valor_unitario = parseFloat(i.value);
            else
              itensAlterados.push({
                item_ata_id: parseInt(itemId),
                novo_valor_unitario: parseFloat(i.value),
              });
          }
        });
        for (const item of itensAlterados) {
          const { data: itemAtual } = await supabaseClient
            .from("itens_ata")
            .select("*")
            .eq("id", item.item_ata_id)
            .single();
          if (itemAtual) {
            item.quantidade_anterior = itemAtual.quantidade_contratada;
            item.valor_unitario_anterior = itemAtual.valor_unitario;
            item.valor_total_anterior = itemAtual.valor_total;
            item.saldo_anterior = itemAtual.saldo_quantidade;
            item.nova_quantidade =
              item.nova_quantidade || itemAtual.quantidade_contratada;
            item.novo_valor_unitario =
              item.novo_valor_unitario || itemAtual.valor_unitario;
            item.novo_valor_total =
              item.nova_quantidade * item.novo_valor_unitario;
            item.novo_saldo = item.nova_quantidade;
            await supabaseClient.from("aditivos_itens_historico").insert([
              {
                aditivo_id: aditivo.id,
                item_ata_id: item.item_ata_id,
                quantidade_anterior: item.quantidade_anterior,
                valor_unitario_anterior: item.valor_unitario_anterior,
                valor_total_anterior: item.valor_total_anterior,
                saldo_anterior: item.saldo_anterior,
                nova_quantidade: item.nova_quantidade,
                novo_valor_unitario: item.novo_valor_unitario,
                novo_valor_total: item.novo_valor_total,
                novo_saldo: item.nova_quantidade,
              },
            ]);
          }
        }
      }
      this.mostrarToast(
        "sucesso",
        "Aditivo registrado! Lembre-se de aplicá-lo para efetivar as mudanças.",
      );
      this.fecharModalAditivo();
      await this.carregarAditivos();
    } catch (error) {
      console.error(error);
      this.mostrarToast("erro", error.message);
    }
  }

  async aplicarAditivo(aditivoId) {
    const confirmado = await this.confirmar(
      "Ao aplicar este aditivo, a ata será atualizada com os novos valores e os saldos serão resetados. Deseja continuar?",
    );
    if (!confirmado) return;
    try {
      const { data: aditivo, error: e1 } = await supabaseClient
        .from("aditivos_ata")
        .select("*")
        .eq("id", aditivoId)
        .single();
      if (e1) throw e1;
      const { data: itensHistorico } = await supabaseClient
        .from("aditivos_itens_historico")
        .select("*")
        .eq("aditivo_id", aditivoId);
      const updates = {};
      if (
        aditivo.tipo_aditivo === "PRAZO" ||
        aditivo.tipo_aditivo === "AMBOS"
      ) {
        if (aditivo.nova_data_inicio_vigencia)
          updates.data_inicio_vigencia = aditivo.nova_data_inicio_vigencia;
        if (aditivo.nova_data_fim_vigencia)
          updates.data_fim_vigencia = aditivo.nova_data_fim_vigencia;
      }
      if (
        aditivo.tipo_aditivo === "VALOR" ||
        aditivo.tipo_aditivo === "AMBOS"
      ) {
        if (aditivo.novo_valor_global)
          updates.valor_global = aditivo.novo_valor_global;
      }
      if (Object.keys(updates).length > 0) {
        await supabaseClient
          .from("atas")
          .update(updates)
          .eq("id", aditivo.ata_original_id);
      }
      if (itensHistorico?.length > 0) {
        for (const h of itensHistorico) {
          await supabaseClient
            .from("itens_ata")
            .update({
              quantidade_contratada: h.nova_quantidade,
              valor_unitario: h.novo_valor_unitario,
              valor_total: h.novo_valor_total,
              saldo_quantidade: h.nova_quantidade,
            })
            .eq("id", h.item_ata_id);
        }
      }
      await supabaseClient
        .from("aditivos_ata")
        .update({
          data_aplicacao: new Date().toISOString().split("T")[0],
        })
        .eq("id", aditivoId);
      this.mostrarToast("sucesso", "Aditivo aplicado com sucesso!");
      await this.carregarAditivos();
      await this.carregarAtas();
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  async carregarAditivos() {
    const container = document.getElementById("aditivosLista");
    if (!container) return;
    container.innerHTML =
      '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando aditivos...</div>';
    try {
      const { data: aditivos, error } = await supabaseClient
        .from("aditivos_ata")
        .select(
          `*, ata_original:atas(numero_ata,situacao,data_inicio_vigencia,data_fim_vigencia,valor_global,fornecedor:fornecedores(razao_social)), usuario:usuarios(nome)`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!aditivos?.length) {
        container.innerHTML =
          '<div style="text-align:center;padding:40px;"><i class="fas fa-file-contract" style="font-size:3rem;color:var(--neutral-400);"></i><h3 style="margin-top:15px;">Nenhum aditivo cadastrado</h3></div>';
        return;
      }
      this.aditivosFiltrados = aditivos;
      this.filtrarAditivos();
    } catch (error) {
      container.innerHTML = `<div style="text-align:center;color:var(--error-600);padding:40px;"><i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i><p>Erro: ${error.message}</p></div>`;
    }
  }

  filtrarAditivos() {
    const busca =
      document.getElementById("buscaAditivos")?.value.toLowerCase() || "";
    const tipo = document.getElementById("filtroTipoAditivo")?.value || "todos";
    const status =
      document.getElementById("filtroStatusAditivo")?.value || "todos";
    let filtrados = this.aditivosFiltrados;
    if (busca)
      filtrados = filtrados.filter(
        (a) =>
          a.numero_aditivo.toLowerCase().includes(busca) ||
          a.ata_original?.numero_ata.toLowerCase().includes(busca),
      );
    if (tipo !== "todos")
      filtrados = filtrados.filter((a) => a.tipo_aditivo === tipo);
    if (status !== "todos") {
      if (status === "aplicado")
        filtrados = filtrados.filter((a) => a.data_aplicacao);
      else filtrados = filtrados.filter((a) => !a.data_aplicacao);
    }
    this.renderizarAditivos(filtrados);
  }

  renderizarAditivos(aditivos) {
    const container = document.getElementById("aditivosLista");
    container.innerHTML = aditivos
      .map((a) => {
        const tipoClass = {
          PRAZO: "prazo",
          VALOR: "valor",
          AMBOS: "ambos",
        }[a.tipo_aditivo];
        const tipoLabel = {
          PRAZO: "📅 Prazo",
          VALOR: "💰 Valor",
          AMBOS: "📅💰 Prazo e Valor",
        }[a.tipo_aditivo];
        const aplicado = a.data_aplicacao ? "✅ Aplicado" : "⏳ Pendente";
        return `<div class="aditivo-card" data-tipo="${a.tipo_aditivo}">
          <div class="aditivo-header">
            <span class="aditivo-tipo-badge ${tipoClass}">${tipoLabel}</span>
            <div class="aditivo-numero">${a.numero_aditivo}</div>
            <div class="aditivo-ata-original"><i class="fas fa-file-contract"></i> Ata Original: ${a.ata_original?.numero_ata || ""}</div>
            <div class="aditivo-data"><i class="fas fa-calendar"></i> Assinatura: ${this.formatarData(a.data_assinatura)}</div>
          </div>
          <div class="aditivo-body">
            <div class="aditivo-info-row"><span class="aditivo-label">Status:</span><span class="aditivo-value">${aplicado}</span></div>
            ${a.tipo_aditivo === "PRAZO" || a.tipo_aditivo === "AMBOS" ? `<div class="aditivo-info-row"><span class="aditivo-label">Nova Vigência:</span><span class="aditivo-value">${this.formatarData(a.nova_data_inicio_vigencia)} até ${this.formatarData(a.nova_data_fim_vigencia)}</span></div>` : ""}
            ${a.tipo_aditivo === "VALOR" || a.tipo_aditivo === "AMBOS" ? `<div class="aditivo-info-row"><span class="aditivo-label">Novo Valor:</span><span class="aditivo-value destaque">${this.formatarMoeda(a.novo_valor_global)}</span></div>` : ""}
            <div class="aditivo-info-row"><span class="aditivo-label">Justificativa:</span><span class="aditivo-value">${a.justificativa.substring(0, 50)}${a.justificativa.length > 50 ? "..." : ""}</span></div>
            <div class="aditivo-info-row"><span class="aditivo-label">Registrado por:</span><span class="aditivo-value">${a.usuario?.nome || ""}</span></div>
          </div>
          <div class="aditivo-footer">
            <button class="btn-visualizar-aditivo" onclick="sistema.visualizarAditivo(${a.id})"><i class="fas fa-eye"></i> Detalhes</button>
            ${!a.data_aplicacao ? `<button class="btn-aplicar-aditivo" onclick="sistema.aplicarAditivo(${a.id})"><i class="fas fa-check-circle"></i> Aplicar</button>` : `<span style="color:var(--success-600);font-size:0.8rem;"><i class="fas fa-check-circle"></i> Aplicado em ${this.formatarData(a.data_aplicacao)}</span>`}
          </div>
        </div>`;
      })
      .join("");
  }

  async visualizarAditivo(aditivoId) {
    const { data: aditivo } = await supabaseClient
      .from("aditivos_ata")
      .select(
        `*, ata_original:atas(*, fornecedor:fornecedores(*)), itens_historico:aditivos_itens_historico(*, item:itens_ata(descricao,item_numero)), usuario:usuarios(nome)`,
      )
      .eq("id", aditivoId)
      .single();
    if (aditivo) {
      let html = `<div class="modal-content" style="max-width:900px;">
        <div class="modal-header">
          <h2 class="modal-titulo">Detalhes do Aditivo</h2>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div style="padding:20px;">
          <h3 style="color:var(--primary-700);margin-bottom:16px;">${aditivo.numero_aditivo}</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            <div>
              <p><strong>Tipo:</strong> ${aditivo.tipo_aditivo}</p>
              <p><strong>Data Assinatura:</strong> ${this.formatarData(aditivo.data_assinatura)}</p>
              <p><strong>Documento:</strong> ${aditivo.documento_referencia || "N/I"}</p>
            </div>
            <div>
              <p><strong>Registrado por:</strong> ${aditivo.usuario?.nome}</p>
              <p><strong>Data Registro:</strong> ${this.formatarData(aditivo.created_at)}</p>
              <p><strong>Data Aplicação:</strong> ${aditivo.data_aplicacao ? this.formatarData(aditivo.data_aplicacao) : "Pendente"}</p>
            </div>
          </div>
          <div style="background:var(--neutral-50);padding:16px;border-radius:var(--border-radius-lg);margin-bottom:20px;">
            <h4 style="margin-bottom:8px;">Justificativa</h4>
            <p>${aditivo.justificativa}</p>
            ${aditivo.observacoes ? `<p style="margin-top:8px;"><strong>Obs:</strong> ${aditivo.observacoes}</p>` : ""}
          </div>
          <h4 style="margin-bottom:12px;">Alterações Realizadas</h4>
          ${
            aditivo.tipo_aditivo === "PRAZO" || aditivo.tipo_aditivo === "AMBOS"
              ? `<div style="background:var(--primary-50);padding:12px;border-radius:var(--border-radius-lg);margin-bottom:16px;">
            <p><strong>📅 Vigência Original:</strong> ${this.formatarData(aditivo.ata_original?.data_inicio_vigencia)} até ${this.formatarData(aditivo.ata_original?.data_fim_vigencia)}</p>
            <p><strong>📅 Nova Vigência:</strong> ${this.formatarData(aditivo.nova_data_inicio_vigencia)} até ${this.formatarData(aditivo.nova_data_fim_vigencia)}</p>
          </div>`
              : ""
          }
          ${
            aditivo.tipo_aditivo === "VALOR" || aditivo.tipo_aditivo === "AMBOS"
              ? `<div style="background:var(--success-50);padding:12px;border-radius:var(--border-radius-lg);margin-bottom:16px;">
            <p><strong>💰 Valor Original:</strong> ${this.formatarMoeda(aditivo.ata_original?.valor_global)}</p>
            <p><strong>💰 Novo Valor:</strong> ${this.formatarMoeda(aditivo.novo_valor_global)}</p>
          </div>`
              : ""
          }
          ${
            aditivo.itens_historico?.length > 0
              ? `<h5 style="margin:20px 0 10px;">Itens Modificados</h5>
          <div class="tabela-container">
            <table class="tabela-itens">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th>Qtd Ant.</th>
                  <th>Saldo Ant.</th>
                  <th>Nova Qtd</th>
                  <th>Novo Saldo</th>
                  <th>Valor Ant.</th>
                  <th>Novo Valor</th>
                </tr>
              </thead>
              <tbody>
                ${aditivo.itens_historico
                  .map(
                    (h) => `<tr>
                  <td>${h.item?.item_numero}</td>
                  <td>${h.item?.descricao}</td>
                  <td class="numeric">${h.quantidade_anterior}</td>
                  <td class="numeric">${h.saldo_anterior}</td>
                  <td class="numeric"><strong>${h.nova_quantidade}</strong></td>
                  <td class="numeric"><strong>${h.novo_saldo}</strong></td>
                  <td class="numeric">${this.formatarMoeda(h.valor_unitario_anterior)}</td>
                  <td class="numeric">${this.formatarMoeda(h.novo_valor_unitario)}</td>
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
              : ""
          }
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
            <button class="btn" onclick="this.closest('.modal').remove()" style="background:var(--neutral-200);padding:8px 16px;border:none;border-radius:var(--border-radius-md);">Fechar</button>
            ${!aditivo.data_aplicacao ? `<button class="btn-aplicar-aditivo" onclick="sistema.aplicarAditivo(${aditivo.id}); this.closest('.modal').remove()"><i class="fas fa-check-circle"></i> Aplicar Aditivo</button>` : ""}
          </div>
        </div>
      </div>`;
      const modal = document.createElement("div");
      modal.className = "modal active";
      modal.innerHTML = html;
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
      document.body.appendChild(modal);
    }
  }

  fecharModalAditivo() {
    document.getElementById("modalAditivo").classList.remove("active");
  }

  visualizarPDF() {
    if (!this.pdfData?.length) {
      this.mostrarToast("aviso", "Nenhum pedido");
      return;
    }
    let pdfHtml = "";
    this.pdfData.forEach((item) => {
      const pedido = item.pedido;
      const total = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);
      pdfHtml += `<div class="pdf-pagina" style="font-family:Arial,sans-serif;">
        <h2 style="text-align:center;color:var(--neutral-900);margin-bottom:16px;font-size:1.2rem;">PEDIDO DE COMPRA</h2>
        <p style="text-align:center;font-weight:600;margin-bottom:16px;font-size:0.9rem;">Nº ${item.numeroPedido}</p>
        <div style="margin-bottom:16px;">
          <h3 style="color:var(--primary-700);margin-bottom:8px;font-size:0.9rem;">DADOS DA ATA</h3>
          <p style="font-size:0.8rem;"><strong>Ata nº:</strong> ${pedido.ataNumero || "N/I"}</p>
          <p style="font-size:0.8rem;"><strong>Processo:</strong> ${pedido.ataProcesso || "N/I"}</p>
          <p style="font-size:0.8rem;"><strong>Objeto:</strong> ${pedido.ataObjeto || "N/I"}</p>
          <p style="font-size:0.8rem;"><strong>Vigência:</strong> ${pedido.ataVigenciaInicio ? this.formatarData(pedido.ataVigenciaInicio) : "N/I"} até ${pedido.ataVigenciaFim ? this.formatarData(pedido.ataVigenciaFim) : "N/I"}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <div style="border:1px solid var(--neutral-200);padding:10px;border-radius:var(--border-radius-lg);">
            <h4 style="color:var(--primary-700);margin-bottom:6px;font-size:0.85rem;">FORNECEDOR</h4>
            <p style="font-size:0.8rem;"><strong>Razão Social:</strong> ${pedido.fornecedorRazao || "N/I"}</p>
            <p style="font-size:0.8rem;"><strong>CNPJ:</strong> ${pedido.fornecedorCnpj || "N/I"}</p>
          </div>
          <div style="border:1px solid var(--neutral-200);padding:10px;border-radius:var(--border-radius-lg);">
            <h4 style="color:var(--primary-700);margin-bottom:6px;font-size:0.85rem;">SOLICITANTE</h4>
            <p style="font-size:0.8rem;"><strong>Órgão:</strong> ${pedido.orgaoNome || "N/I"}</p>
            <p style="font-size:0.8rem;"><strong>CNPJ:</strong> ${pedido.orgaoCnpj || "N/I"}</p>
            <p style="font-size:0.8rem;"><strong>Solicitante:</strong> ${item.solicitante || "N/I"}</p>
          </div>
        </div>
        <h4 style="margin-bottom:10px;font-size:0.85rem;">ITENS DO PEDIDO</h4>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:0.7rem;">
          <thead>
            <tr style="background:var(--neutral-900);color:white;">
              <th style="padding:6px;">Item</th>
              <th style="padding:6px;">Descrição</th>
              <th style="padding:6px;">Qtd</th>
              <th style="padding:6px;">Valor Unit.</th>
              <th style="padding:6px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${pedido.itens
              .map(
                (i) => `<tr>
              <td style="padding:4px;border-bottom:1px solid var(--neutral-200);">${i.itemNumero}</td>
              <td style="padding:4px;border-bottom:1px solid var(--neutral-200);">${i.itemDescricao}</td>
              <td style="padding:4px;text-align:right;border-bottom:1px solid var(--neutral-200);">${i.quantidade}</td>
              <td style="padding:4px;text-align:right;border-bottom:1px solid var(--neutral-200);">${this.formatarMoeda(i.valorUnitario)}</td>
              <td style="padding:4px;text-align:right;border-bottom:1px solid var(--neutral-200);">${this.formatarMoeda(i.valorTotal)}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right;font-weight:700;padding:6px;">TOTAL DO PEDIDO</td>
              <td style="color:var(--success-600);font-weight:700;text-align:right;padding:6px;">${this.formatarMoeda(total)}</td>
            </tr>
          </tfoot>
        </table>
        <div style="margin-top:16px;font-size:0.65rem;color:var(--neutral-500);font-style:italic;text-align:center;border-top:1px solid var(--neutral-200);padding-top:8px;">
          <p>Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")}.</p>
        </div>
      </div>`;
    });
    document.getElementById("pdfConteudo").innerHTML = pdfHtml;
    document.getElementById("pdfVisualizador").classList.add("active");
  }

  baixarPDF() {
    if (!this.pdfData || this.pdfData.length === 0) {
      this.mostrarToast("aviso", "Nenhum dado para gerar PDF");
      return;
    }
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      let yOffset = 15;
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;
      this.pdfData.forEach((item, idx) => {
        if (idx > 0) {
          doc.addPage();
          yOffset = 15;
        }
        const pedido = item.pedido;
        const total = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);
        doc.setFontSize(14);
        doc.text("PEDIDO DE COMPRA", pageWidth / 2, yOffset, {
          align: "center",
        });
        yOffset += 8;
        doc.setFontSize(11);
        doc.text(`Nº ${item.numeroPedido}`, pageWidth / 2, yOffset, {
          align: "center",
        });
        yOffset += 10;
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text("DADOS DA ATA", 15, yOffset);
        yOffset += 6;
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(`Ata nº: ${pedido.ataNumero || "N/I"}`, 15, yOffset);
        yOffset += 5;
        doc.text(`Processo: ${pedido.ataProcesso || "N/I"}`, 15, yOffset);
        yOffset += 5;
        const objeto = pedido.ataObjeto || "N/I";
        const linhasObjeto = doc.splitTextToSize(
          `Objeto: ${objeto}`,
          pageWidth - 30,
        );
        doc.text(linhasObjeto[0], 15, yOffset);
        yOffset += 5;
        for (let i = 1; i < linhasObjeto.length; i++) {
          doc.text(linhasObjeto[i], 15, yOffset);
          yOffset += 5;
        }
        doc.text(
          `Vigência: ${pedido.ataVigenciaInicio ? this.formatarData(pedido.ataVigenciaInicio) : "N/I"} até ${pedido.ataVigenciaFim ? this.formatarData(pedido.ataVigenciaFim) : "N/I"}`,
          15,
          yOffset,
        );
        yOffset += 8;
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text("FORNECEDOR", 15, yOffset);
        yOffset += 6;
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(
          `Razão Social: ${pedido.fornecedorRazao || "N/I"}`,
          15,
          yOffset,
        );
        yOffset += 5;
        doc.text(`CNPJ: ${pedido.fornecedorCnpj || "N/I"}`, 15, yOffset);
        yOffset += 8;
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text("SOLICITANTE", 15, yOffset);
        yOffset += 6;
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(`Órgão: ${pedido.orgaoNome || "N/I"}`, 15, yOffset);
        yOffset += 5;
        doc.text(`CNPJ: ${pedido.orgaoCnpj || "N/I"}`, 15, yOffset);
        yOffset += 5;
        doc.text(`Solicitante: ${item.solicitante || "N/I"}`, 15, yOffset);
        yOffset += 8;
        const tableData = pedido.itens.map((i) => [
          i.itemNumero,
          doc.splitTextToSize(i.itemDescricao, 90),
          i.quantidade.toString(),
          this.formatarMoeda(i.valorUnitario).replace("R$", "").trim(),
          this.formatarMoeda(i.valorTotal).replace("R$", "").trim(),
        ]);
        doc.autoTable({
          startY: yOffset,
          head: [["Item", "Descrição", "Qtd", "Valor Unit.", "Total"]],
          body: tableData,
          foot: [
            [
              {
                content: "TOTAL DO PEDIDO",
                colSpan: 4,
                styles: {
                  halign: "right",
                  fontStyle: "bold",
                  fontSize: 9,
                },
              },
              {
                content: this.formatarMoeda(total).replace("R$", "").trim(),
                styles: {
                  fontStyle: "bold",
                  fontSize: 9,
                  halign: "right",
                },
              },
            ],
          ],
          theme: "striped",
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontSize: 8,
            halign: "center",
          },
          footStyles: {
            fillColor: [241, 245, 249],
            textColor: [79, 70, 229],
            fontStyle: "bold",
            fontSize: 9,
          },
          columnStyles: {
            0: { cellWidth: 15, halign: "center" },
            1: { cellWidth: 90, halign: "left" },
            2: { cellWidth: 15, halign: "right" },
            3: { cellWidth: 25, halign: "right" },
            4: { cellWidth: 25, halign: "right" },
          },
          styles: {
            fontSize: 7,
            cellPadding: 1.5,
            overflow: "linebreak",
            valign: "top",
          },
          margin: { left: 15, right: 15 },
          tableWidth: "auto",
        });
        yOffset = doc.lastAutoTable.finalY + 10;
        if (yOffset > pageHeight - 30) {
          doc.addPage();
          yOffset = 15;
        }
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        const rodape = [
          "Este documento foi gerado eletronicamente pelo Sistema de Gestão de Atas.",
          "É de responsabilidade do solicitante a conferência dos dados e saldos apresentados.",
          "Em caso de divergência, prevalecem os dados constantes no processo administrativo e na ata de registro de preços.",
          "Sistema desenvolvido pelo Departamento de Informática - Versão 1.0",
        ];
        rodape.forEach((l) => {
          doc.text(l, pageWidth / 2, yOffset, { align: "center" });
          yOffset += 3.5;
        });
      });
      const dataAtual = new Date()
        .toLocaleDateString("pt-BR")
        .replace(/\//g, "-");
      doc.save(`pedido_${dataAtual}.pdf`);
      this.mostrarToast("sucesso", "PDF gerado com sucesso!");
    } catch (error) {
      this.mostrarToast("erro", error.message);
    }
  }

  fecharPdfVisualizador() {
    document.getElementById("pdfVisualizador").classList.remove("active");
  }

  filtrarAtas() {
    this.carregarAtas();
  }

  fecharModal() {
    document.getElementById("modalDetalhes").classList.remove("active");
    this.ataSelecionada = null;
  }

  fecharModalConsumo() {
    document.getElementById("modalConsumo").classList.remove("active");
  }

  fecharModalCarrinho() {
    document.getElementById("modalCarrinho").classList.remove("active");
  }

  fecharModalPedido() {
    document.getElementById("modalPedido").classList.remove("active");
    this.pdfData = null;
  }

  fecharModalVisualizarPedido() {
    document.getElementById("modalVisualizarPedido").classList.remove("active");
  }

  formatarMoeda(valor) {
    return (valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  formatarData(dataISO) {
    try {
      if (!dataISO) return "N/I";
      return new Date(dataISO).toLocaleDateString("pt-BR");
    } catch {
      return "N/I";
    }
  }
}

const sistema = new SistemaGestaoAtas();
window.sistema = sistema;
