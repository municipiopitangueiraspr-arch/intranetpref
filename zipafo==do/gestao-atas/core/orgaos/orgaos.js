// ============================================
// core/orgaos/orgaos.js
// Módulo central de gestão de órgãos
// Integração com Supabase - Versão Completa
// ============================================

import { supabase } from "../../shared/js/supabase.js";
import { OrgaosService } from "../../shared/js/services/orgaos-service.js";
import { auth } from "../../shared/js/auth.js";

// ============================================
// CLASSE PRINCIPAL
// ============================================
class GestaoOrgaos {
  constructor() {
    this.orgaos = [];
    this.gestores = {};
    this.usuarioAtual = null;
    this.filtros = {
      status: "todos",
      busca: "",
    };
    this.paginaAtual = 1;
    this.itensPorPagina = 10;
    this.init();
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================
  async init() {
    try {
      // Verificar autenticação
      const session = await auth.verificarSessao();
      if (!session) {
        window.location.href = "/index.html";
        return;
      }

      this.usuarioAtual = await auth.obterUsuarioAtual();
      if (!this.usuarioAtual) {
        window.location.href = "/index.html";
        return;
      }

      // Verificar permissão (apenas ADMIN)
      if (this.usuarioAtual.perfil !== "ADMIN") {
        this.mostrarToast(
          "erro",
          "Permissão negada",
          "Apenas administradores podem acessar esta área.",
        );
        setTimeout(() => {
          window.location.href = "/intranet.html";
        }, 2000);
        return;
      }

      // Atualizar interface do usuário
      this.atualizarInterfaceUsuario();

      // Carregar dados
      await this.carregarDados();

      // Renderizar página
      this.renderizar();

      // Configurar eventos
      this.configurarEventos();
    } catch (error) {
      console.error("Erro ao inicializar módulo:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        "Não foi possível inicializar o módulo.",
      );
    }
  }

  // ============================================
  // INTERFACE DO USUÁRIO
  // ============================================
  atualizarInterfaceUsuario() {
    if (!this.usuarioAtual) return;

    const userName = document.getElementById("userName");
    const userPerfil = document.getElementById("userPerfil");
    const userAvatar = document.getElementById("userAvatar");

    if (userName) userName.textContent = this.usuarioAtual.nome || "Usuário";
    if (userPerfil)
      userPerfil.textContent = this.usuarioAtual.perfil || "ADMIN";

    if (userAvatar && this.usuarioAtual.nome) {
      const iniciais = this.usuarioAtual.nome
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      userAvatar.textContent = iniciais;
    }
  }

  // ============================================
  // CARREGAR DADOS
  // ============================================
  async carregarDados() {
    try {
      this.mostrarLoading(true);

      const options = {};

      if (this.filtros.status === "ativo") {
        options.onlyActive = true;
      }

      if (this.filtros.busca) {
        options.search = this.filtros.busca;
      }

      this.orgaos = await OrgaosService.listar(options);

      // Se for inativo, filtrar manualmente
      if (this.filtros.status === "inativo") {
        this.orgaos = this.orgaos.filter((o) => o.ativo === false);
      }

      // Ordenar por nome
      this.orgaos.sort((a, b) => a.nome.localeCompare(b.nome));

      return this.orgaos;
    } catch (error) {
      console.error("Erro ao carregar órgãos:", error);
      this.mostrarToast("erro", "Erro", "Não foi possível carregar os órgãos.");
      throw error;
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // RENDERIZAR
  // ============================================
  renderizar() {
    const container = document.getElementById("pageContent");
    if (!container) return;

    const totalPaginas =
      Math.ceil(this.orgaos.length / this.itensPorPagina) || 1;
    if (this.paginaAtual > totalPaginas) this.paginaAtual = totalPaginas;

    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const paginaOrgaos = this.orgaos.slice(
      inicio,
      inicio + this.itensPorPagina,
    );

    container.innerHTML = `
            <div class="orgaos-content">
                <div class="page-header">
                    <h1><i class="fas fa-building"></i> Órgãos</h1>
                    <button class="btn btn-primary" id="btnNovoOrgao">
                        <i class="fas fa-plus-circle"></i> Novo Órgão
                    </button>
                </div>

                <div class="filters-bar">
                    <div class="filter-group">
                        <label><i class="fas fa-filter"></i> Status</label>
                        <select id="filtroStatus">
                            <option value="todos" ${this.filtros.status === "todos" ? "selected" : ""}>Todos</option>
                            <option value="ativo" ${this.filtros.status === "ativo" ? "selected" : ""}>Ativos</option>
                            <option value="inativo" ${this.filtros.status === "inativo" ? "selected" : ""}>Inativos</option>
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1;">
                        <label><i class="fas fa-search"></i> Buscar</label>
                        <input type="text" id="filtroBusca" placeholder="Nome ou sigla..." value="${this.filtros.busca || ""}" />
                    </div>
                    <button class="btn btn-outline" id="btnLimparFiltros">
                        <i class="fas fa-undo-alt"></i> Limpar
                    </button>
                    <button class="btn btn-primary" id="btnAplicarFiltros">
                        <i class="fas fa-search"></i> Aplicar
                    </button>
                </div>

                <div class="card">
                    <div class="table-container">
                        ${this.renderizarTabela(paginaOrgaos)}
                    </div>
                    ${
                      this.orgaos.length > this.itensPorPagina
                        ? `
                        <div class="pagination">
                            <button class="btn-page" id="btnPagAnterior" ${this.paginaAtual <= 1 ? "disabled" : ""}>
                                <i class="fas fa-chevron-left"></i> Anterior
                            </button>
                            <span class="page-info">Página ${this.paginaAtual} de ${totalPaginas}</span>
                            <button class="btn-page" id="btnPagProximo" ${this.paginaAtual >= totalPaginas ? "disabled" : ""}>
                                Próximo <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    `
                        : ""
                    }
                </div>

                <div class="stats-footer">
                    <span><i class="fas fa-building"></i> Total: <strong>${this.orgaos.length}</strong> órgãos</span>
                    <span><i class="fas fa-check-circle" style="color: var(--success-600);"></i> Ativos: <strong>${this.orgaos.filter((o) => o.ativo).length}</strong></span>
                    <span><i class="fas fa-times-circle" style="color: var(--error-600);"></i> Inativos: <strong>${this.orgaos.filter((o) => !o.ativo).length}</strong></span>
                </div>
            </div>
        `;

    // Configurar eventos da página
    this.configurarEventosPagina();
  }

  // ============================================
  // RENDERIZAR TABELA
  // ============================================
  renderizarTabela(orgaosList) {
    if (!orgaosList || orgaosList.length === 0) {
      return `
                <div class="empty-state">
                    <span class="empty-icon"><i class="fas fa-building"></i></span>
                    <p>Nenhum órgão cadastrado.</p>
                    <button class="btn btn-primary btn-sm" onclick="gestaoOrgaos.abrirModalOrgao()">
                        <i class="fas fa-plus-circle"></i> Cadastrar primeiro órgão
                    </button>
                </div>
            `;
    }

    return `
            <table class="table" id="tabelaOrgaos">
                <thead>
                    <tr>
                        <th style="width: 30px;">#</th>
                        <th>Nome</th>
                        <th>Sigla</th>
                        <th>CNPJ</th>
                        <th>Gestor Atual</th>
                        <th>Status</th>
                        <th style="min-width: 200px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${orgaosList
                      .map((o, index) => {
                        const num =
                          (this.paginaAtual - 1) * this.itensPorPagina +
                          index +
                          1;
                        return `
                            <tr>
                                <td style="text-align: center; color: var(--neutral-500);">${num}</td>
                                <td><strong>${o.nome}</strong></td>
                                <td><span class="badge badge-sigla">${o.sigla || "-"}</span></td>
                                <td>${o.cnpj || "-"}</td>
                                <td>${o.gestor_atual || "-"}</td>
                                <td>
                                    <span class="status-badge ${o.ativo ? "status-ativo" : "status-inativo"}">
                                        ${o.ativo ? "Ativo" : "Inativo"}
                                    </span>
                                </td>
                                <td class="acoes-cell">
                                    <button class="btn btn-sm btn-outline" onclick="gestaoOrgaos.editarOrgao(${o.id})" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="gestaoOrgaos.gerenciarGestores(${o.id})" title="Gestores">
                                        <i class="fas fa-users"></i>
                                    </button>
                                    ${
                                      o.ativo
                                        ? `<button class="btn btn-sm btn-outline btn-danger" onclick="gestaoOrgaos.desativarOrgao(${o.id})" title="Desativar">
                                            <i class="fas fa-times-circle"></i>
                                           </button>`
                                        : `<button class="btn btn-sm btn-outline btn-success" onclick="gestaoOrgaos.ativarOrgao(${o.id})" title="Ativar">
                                            <i class="fas fa-check-circle"></i>
                                           </button>`
                                    }
                                    <button class="btn btn-sm btn-outline btn-danger" onclick="gestaoOrgaos.excluirOrgao(${o.id})" title="Excluir">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                      })
                      .join("")}
                </tbody>
            </table>
        `;
  }

  // ============================================
  // CONFIGURAR EVENTOS
  // ============================================
  configurarEventos() {
    // Evento de logout
    document
      .getElementById("btnLogout")
      ?.addEventListener("click", () => this.fazerLogout());

    // Evento de toggle sidebar
    window.toggleSidebar = () => {
      document.getElementById("coreSidebar")?.classList.toggle("open");
    };

    // Fechar sidebar ao clicar fora
    document.addEventListener("click", (e) => {
      const sidebar = document.getElementById("coreSidebar");
      const toggleBtn = document.querySelector(".btn-toggle-sidebar");
      if (sidebar && toggleBtn) {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
          sidebar.classList.remove("open");
        }
      }
    });

    // Fechar modais com ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modals = document.querySelectorAll(".modal-overlay");
        modals.forEach((modal) => {
          if (modal.style.display !== "none") {
            modal.remove();
          }
        });
      }
    });
  }

  // ============================================
  // CONFIGURAR EVENTOS DA PÁGINA
  // ============================================
  configurarEventosPagina() {
    // Botão novo órgão
    document.getElementById("btnNovoOrgao")?.addEventListener("click", () => {
      this.abrirModalOrgao();
    });

    // Botão aplicar filtros
    document
      .getElementById("btnAplicarFiltros")
      ?.addEventListener("click", () => {
        this.aplicarFiltros();
      });

    // Botão limpar filtros
    document
      .getElementById("btnLimparFiltros")
      ?.addEventListener("click", () => {
        this.limparFiltros();
      });

    // Filtro status
    document.getElementById("filtroStatus")?.addEventListener("change", () => {
      this.aplicarFiltros();
    });

    // Filtro busca com Enter
    document
      .getElementById("filtroBusca")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.aplicarFiltros();
        }
      });

    // Paginação
    document.getElementById("btnPagAnterior")?.addEventListener("click", () => {
      if (this.paginaAtual > 1) {
        this.paginaAtual--;
        this.renderizar();
      }
    });

    document.getElementById("btnPagProximo")?.addEventListener("click", () => {
      const totalPaginas = Math.ceil(this.orgaos.length / this.itensPorPagina);
      if (this.paginaAtual < totalPaginas) {
        this.paginaAtual++;
        this.renderizar();
      }
    });
  }

  // ============================================
  // FILTROS
  // ============================================
  aplicarFiltros() {
    this.filtros.status =
      document.getElementById("filtroStatus")?.value || "todos";
    this.filtros.busca = document.getElementById("filtroBusca")?.value || "";
    this.paginaAtual = 1;
    this.carregarDados().then(() => this.renderizar());
  }

  limparFiltros() {
    const statusSelect = document.getElementById("filtroStatus");
    const buscaInput = document.getElementById("filtroBusca");

    if (statusSelect) statusSelect.value = "todos";
    if (buscaInput) buscaInput.value = "";

    this.filtros = { status: "todos", busca: "" };
    this.paginaAtual = 1;
    this.carregarDados().then(() => this.renderizar());
  }

  // ============================================
  // MODAL DE ÓRGÃO
  // ============================================
  abrirModalOrgao(id = null) {
    const isEdit = !!id;
    const orgao = isEdit ? this.orgaos.find((o) => o.id === id) : null;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "modalOrgao";
    modal.innerHTML = `
            <div class="modal-container modal-md">
                <div class="modal-header">
                    <h2><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Editar" : "Novo"} Órgão</h2>
                    <button class="modal-close" onclick="gestaoOrgaos.fecharModal('modalOrgao')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="formOrgao" novalidate>
                        <input type="hidden" id="orgaoId" value="${id || ""}">

                        <div class="form-group">
                            <label class="required">Nome do Órgão</label>
                            <input type="text" id="orgaoNome" class="form-input"
                                value="${orgao?.nome || ""}" placeholder="Ex: Secretaria Municipal de Saúde" required>
                            <span class="form-text">Nome completo do órgão ou autarquia.</span>
                        </div>

                        <div class="form-row-2">
                            <div class="form-group">
                                <label>Sigla</label>
                                <input type="text" id="orgaoSigla" class="form-input"
                                    value="${orgao?.sigla || ""}" placeholder="Ex: SEMAS">
                                <span class="form-text">A sigla será convertida para maiúsculas automaticamente.</span>
                            </div>
                            <div class="form-group">
                                <label>CNPJ</label>
                                <input type="text" id="orgaoCnpj" class="form-input"
                                    value="${orgao?.cnpj || ""}" placeholder="00.000.000/0001-00">
                                <span class="form-text">CNPJ do órgão (opcional).</span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Endereço</label>
                            <input type="text" id="orgaoEndereco" class="form-input"
                                value="${orgao?.endereco || ""}" placeholder="Endereço completo">
                        </div>

                        <div class="form-row-2">
                            <div class="form-group">
                                <label>Telefone</label>
                                <input type="text" id="orgaoTelefone" class="form-input"
                                    value="${orgao?.telefone || ""}" placeholder="(00) 0000-0000">
                            </div>
                            <div class="form-group">
                                <label>E-mail</label>
                                <input type="email" id="orgaoEmail" class="form-input"
                                    value="${orgao?.email || ""}" placeholder="contato@orgao.gov.br">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Tipo</label>
                            <select id="orgaoTipo" class="form-input">
                                <option value="SECRETARIA" ${orgao?.tipo === "SECRETARIA" ? "selected" : ""}>Secretaria</option>
                                <option value="PREFEITURA" ${orgao?.tipo === "PREFEITURA" ? "selected" : ""}>Prefeitura</option>
                                <option value="CAMARA" ${orgao?.tipo === "CAMARA" ? "selected" : ""}>Câmara</option>
                                <option value="SAAE" ${orgao?.tipo === "SAAE" ? "selected" : ""}>SAAE</option>
                                <option value="AUTARQUIA" ${orgao?.tipo === "AUTARQUIA" ? "selected" : ""}>Autarquia</option>
                                <option value="FUNDACAO" ${orgao?.tipo === "FUNDACAO" ? "selected" : ""}>Fundação</option>
                                <option value="OUTROS" ${orgao?.tipo === "OUTROS" ? "selected" : ""}>Outros</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Gestor Atual</label>
                            <input type="text" id="orgaoGestor" class="form-input"
                                value="${orgao?.gestor_atual || ""}" placeholder="Nome do gestor atual" list="listaGestores">
                            <datalist id="listaGestores"></datalist>
                            <span class="form-text">Digite o nome do gestor ou selecione da lista de sugestões.</span>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="gestaoOrgaos.fecharModal('modalOrgao')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-primary" id="btnSalvarOrgao">
                        <i class="fas fa-save"></i> ${isEdit ? "Atualizar" : "Salvar"}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // Carregar sugestões de gestores
    this.carregarSugestoesGestores();

    // Evento do botão salvar
    document.getElementById("btnSalvarOrgao").addEventListener("click", () => {
      this.salvarOrgao(id);
    });

    // Fechar modal ao clicar fora
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.fecharModal("modalOrgao");
      }
    });

    // Focar no primeiro campo
    setTimeout(() => {
      document.getElementById("orgaoNome")?.focus();
    }, 100);
  }

  // ============================================
  // CARREGAR SUGESTÕES DE GESTORES
  // ============================================
  async carregarSugestoesGestores() {
    try {
      const nomes = await OrgaosService.listarNomesGestores();
      const datalist = document.getElementById("listaGestores");
      if (datalist && nomes.length > 0) {
        datalist.innerHTML = nomes
          .slice(0, 50) // Limitar para performance
          .map((n) => `<option value="${n.replace(/"/g, "&quot;")}">`)
          .join("");
      }
    } catch (error) {
      console.warn("Erro ao carregar sugestões de gestores:", error);
    }
  }

  // ============================================
  // SALVAR ÓRGÃO
  // ============================================
  async salvarOrgao(id) {
    const nomeInput = document.getElementById("orgaoNome");
    const nome = nomeInput?.value?.trim();

    // Validar nome
    if (!nome) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe o nome do órgão.",
      );
      if (nomeInput) {
        nomeInput.focus();
        nomeInput.classList.add("error");
        setTimeout(() => nomeInput.classList.remove("error"), 3000);
      }
      return;
    }

    const dados = {
      nome: nome,
      sigla:
        document.getElementById("orgaoSigla")?.value?.trim()?.toUpperCase() ||
        null,
      cnpj: document.getElementById("orgaoCnpj")?.value?.trim() || null,
      endereco: document.getElementById("orgaoEndereco")?.value?.trim() || null,
      telefone: document.getElementById("orgaoTelefone")?.value?.trim() || null,
      email: document.getElementById("orgaoEmail")?.value?.trim() || null,
      tipo: document.getElementById("orgaoTipo")?.value || "SECRETARIA",
      gestor_atual:
        document.getElementById("orgaoGestor")?.value?.trim() || null,
    };

    try {
      this.mostrarLoading(true);

      let resultado;
      if (id) {
        // Verificar se o órgão existe
        const orgaoExistente = this.orgaos.find((o) => o.id === id);
        if (!orgaoExistente) {
          throw new Error("Órgão não encontrado.");
        }

        resultado = await OrgaosService.atualizar(id, dados);
        this.mostrarToast(
          "sucesso",
          "Atualizado",
          `Órgão "${dados.nome}" atualizado com sucesso!`,
        );
      } else {
        resultado = await OrgaosService.criar(dados);
        this.mostrarToast(
          "sucesso",
          "Criado",
          `Órgão "${dados.nome}" criado com sucesso!`,
        );
      }

      this.fecharModal("modalOrgao");
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao salvar órgão:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível salvar o órgão.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // AÇÕES DO ÓRGÃO
  // ============================================
  async editarOrgao(id) {
    this.abrirModalOrgao(id);
  }

  async desativarOrgao(id) {
    const orgao = this.orgaos.find((o) => o.id === id);
    if (!orgao) return;

    const confirmado = await this.showConfirm(
      "Desativar órgão",
      `Tem certeza que deseja desativar o órgão "${orgao.nome}"?\n\nOs usuários vinculados continuarão ativos, mas não poderão ser associados a novos processos.`,
      "⚠️",
    );
    if (!confirmado) return;

    try {
      this.mostrarLoading(true);
      await OrgaosService.desativar(id);
      this.mostrarToast(
        "sucesso",
        "Desativado",
        `Órgão "${orgao.nome}" desativado com sucesso.`,
      );
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao desativar órgão:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível desativar o órgão.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async ativarOrgao(id) {
    const orgao = this.orgaos.find((o) => o.id === id);
    if (!orgao) return;

    try {
      this.mostrarLoading(true);
      await OrgaosService.ativar(id);
      this.mostrarToast(
        "sucesso",
        "Ativado",
        `Órgão "${orgao.nome}" ativado com sucesso.`,
      );
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao ativar órgão:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível ativar o órgão.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async excluirOrgao(id) {
    const orgao = this.orgaos.find((o) => o.id === id);
    if (!orgao) return;

    // Verificar dependências
    try {
      const dependencias = await OrgaosService.verificarDependencias(id);
      let mensagem = `Tem certeza que deseja excluir "${orgao.nome}"?\n\nEsta ação não pode ser desfeita.`;

      if (dependencias.temUsuarios) {
        mensagem +=
          "\n\n⚠️ Este órgão possui usuários vinculados. Eles serão desassociados.";
      }
      if (dependencias.temAtos) {
        mensagem += "\n\n⚠️ Este órgão possui atos oficiais vinculados.";
      }
      if (dependencias.temProcessos) {
        mensagem +=
          "\n\n⚠️ Este órgão possui processos licitatórios vinculados.";
      }

      const confirmado = await this.showConfirm(
        "Excluir órgão",
        mensagem,
        "🗑️",
      );
      if (!confirmado) return;

      this.mostrarLoading(true);
      await OrgaosService.excluir(id);
      this.mostrarToast(
        "sucesso",
        "Excluído",
        `Órgão "${orgao.nome}" excluído com sucesso.`,
      );
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao excluir órgão:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível excluir o órgão.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // GESTORES
  // ============================================
  async gerenciarGestores(orgaoId) {
    try {
      const orgao = this.orgaos.find((o) => o.id === orgaoId);
      if (!orgao) return;

      const gestores = await OrgaosService.listarGestores(orgaoId);

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.id = "modalGestores";
      modal.innerHTML = `
                <div class="modal-container modal-md">
                    <div class="modal-header">
                        <h2><i class="fas fa-users"></i> Gestores - ${orgao.nome}</h2>
                        <button class="modal-close" onclick="gestaoOrgaos.fecharModal('modalGestores')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
                            <span><strong>Total:</strong> ${gestores.length} gestor(es)</span>
                            <button class="btn btn-primary btn-sm" onclick="gestaoOrgaos.abrirModalGestor(${orgaoId})">
                                <i class="fas fa-plus-circle"></i> Novo Gestor
                            </button>
                        </div>
                        <div class="table-container">
                            ${this.renderizarTabelaGestores(gestores, orgaoId)}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="gestaoOrgaos.fecharModal('modalGestores')">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.fecharModal("modalGestores");
        }
      });
    } catch (error) {
      console.error("Erro ao carregar gestores:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível carregar os gestores.",
      );
    }
  }

  renderizarTabelaGestores(gestores, orgaoId) {
    if (!gestores || gestores.length === 0) {
      return `
                <div class="empty-state">
                    <span class="empty-icon"><i class="fas fa-user"></i></span>
                    <p>Nenhum gestor cadastrado para este órgão.</p>
                    <button class="btn btn-primary btn-sm" onclick="gestaoOrgaos.abrirModalGestor(${orgaoId})">
                        <i class="fas fa-plus-circle"></i> Adicionar primeiro gestor
                    </button>
                </div>
            `;
    }

    return `
            <table class="table table-compacta">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Cargo</th>
                        <th>Início</th>
                        <th>Término</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${gestores
                      .map(
                        (g) => `
                        <tr>
                            <td><strong>${g.nome_responsavel}</strong></td>
                            <td>${g.cargo_responsavel || "-"}</td>
                            <td>${this.formatarData(g.data_inicio)}</td>
                            <td>
                                ${
                                  g.data_fim
                                    ? this.formatarData(g.data_fim)
                                    : '<span class="status-badge status-ativo">Atual</span>'
                                }
                            </td>
                            <td class="acoes-cell">
                                <button class="btn btn-sm btn-outline" onclick="gestaoOrgaos.abrirModalGestor(${orgaoId}, ${g.id})" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                ${
                                  !g.data_fim
                                    ? `<button class="btn btn-sm btn-success" onclick="gestaoOrgaos.finalizarGestor(${g.id})" title="Finalizar mandato">
                                        <i class="fas fa-check"></i>
                                       </button>`
                                    : ""
                                }
                                <button class="btn btn-sm btn-outline btn-danger" onclick="gestaoOrgaos.excluirGestor(${g.id})" title="Excluir">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;
  }

  // ============================================
  // MODAL DE GESTOR
  // ============================================
  async abrirModalGestor(orgaoId, gestorId = null) {
    const isEdit = !!gestorId;
    let gestor = null;

    if (isEdit) {
      const gestores = await OrgaosService.listarGestores(orgaoId);
      gestor = gestores.find((g) => g.id === gestorId);
    }

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "modalGestor";
    modal.innerHTML = `
            <div class="modal-container modal-sm">
                <div class="modal-header">
                    <h2><i class="fas ${isEdit ? "fa-edit" : "fa-user-plus"}"></i> ${isEdit ? "Editar" : "Novo"} Gestor</h2>
                    <button class="modal-close" onclick="gestaoOrgaos.fecharModal('modalGestor')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="formGestor" novalidate>
                        <input type="hidden" id="gestorId" value="${gestorId || ""}">
                        <input type="hidden" id="gestorOrgaoId" value="${orgaoId}">

                        <div class="form-group">
                            <label class="required">Nome do Gestor</label>
                            <input type="text" id="gestorNome" class="form-input"
                                value="${gestor?.nome_responsavel || ""}" placeholder="Nome completo" required>
                        </div>

                        <div class="form-group">
                            <label>Cargo</label>
                            <input type="text" id="gestorCargo" class="form-input"
                                value="${gestor?.cargo_responsavel || ""}" placeholder="Ex: Secretário Municipal">
                        </div>

                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="required">Data de Início</label>
                                <input type="date" id="gestorDataInicio" class="form-input"
                                    value="${gestor?.data_inicio || ""}" required>
                            </div>
                            <div class="form-group">
                                <label>Data de Término</label>
                                <input type="date" id="gestorDataFim" class="form-input"
                                    value="${gestor?.data_fim || ""}">
                                <span class="form-text">Deixe em branco para gestão atual.</span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Observação</label>
                            <textarea id="gestorObservacao" class="form-input" rows="2"
                                placeholder="Observações sobre o mandato...">${gestor?.observacao || ""}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="gestaoOrgaos.fecharModal('modalGestor')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-primary" id="btnSalvarGestor">
                        <i class="fas fa-save"></i> ${isEdit ? "Atualizar" : "Salvar"}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    document.getElementById("btnSalvarGestor").addEventListener("click", () => {
      this.salvarGestor(orgaoId, gestorId);
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.fecharModal("modalGestor");
      }
    });

    // Focar no primeiro campo
    setTimeout(() => {
      document.getElementById("gestorNome")?.focus();
    }, 100);
  }

  // ============================================
  // SALVAR GESTOR
  // ============================================
  async salvarGestor(orgaoId, gestorId) {
    const nomeInput = document.getElementById("gestorNome");
    const nome = nomeInput?.value?.trim();
    const dataInicio = document.getElementById("gestorDataInicio")?.value;

    // Validar campos
    if (!nome) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe o nome do gestor.",
      );
      if (nomeInput) {
        nomeInput.focus();
        nomeInput.classList.add("error");
        setTimeout(() => nomeInput.classList.remove("error"), 3000);
      }
      return;
    }

    if (!dataInicio) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe a data de início.",
      );
      document.getElementById("gestorDataInicio")?.focus();
      return;
    }

    const dados = {
      orgao_id: orgaoId,
      nome_responsavel: nome,
      cargo_responsavel:
        document.getElementById("gestorCargo")?.value?.trim() || null,
      data_inicio: dataInicio,
      data_fim: document.getElementById("gestorDataFim")?.value || null,
      observacao:
        document.getElementById("gestorObservacao")?.value?.trim() || null,
    };

    try {
      this.mostrarLoading(true);

      if (gestorId) {
        await OrgaosService.atualizarGestor(gestorId, dados);
        this.mostrarToast(
          "sucesso",
          "Atualizado",
          "Gestor atualizado com sucesso!",
        );
      } else {
        await OrgaosService.criarGestor(dados);
        this.mostrarToast("sucesso", "Criado", "Gestor criado com sucesso!");
      }

      this.fecharModal("modalGestor");

      // Recarregar a lista de gestores
      const modalGestores = document.getElementById("modalGestores");
      if (modalGestores) {
        modalGestores.remove();
        this.gerenciarGestores(orgaoId);
      }
    } catch (error) {
      console.error("Erro ao salvar gestor:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível salvar o gestor.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // AÇÕES DO GESTOR
  // ============================================
  async finalizarGestor(id) {
    const confirmado = await this.showConfirm(
      "Finalizar mandato",
      'Tem certeza que deseja finalizar o mandato deste gestor?\n\nO gestor será marcado como "anterior" e um novo gestor poderá ser cadastrado.',
      "⚠️",
    );
    if (!confirmado) return;

    try {
      this.mostrarLoading(true);
      await OrgaosService.finalizarGestor(id);
      this.mostrarToast(
        "sucesso",
        "Finalizado",
        "Mandato finalizado com sucesso.",
      );

      // Recarregar a lista de gestores
      const modal = document.getElementById("modalGestores");
      if (modal) {
        const orgaoId = document.getElementById("gestorOrgaoId")?.value;
        if (orgaoId) {
          modal.remove();
          this.gerenciarGestores(parseInt(orgaoId));
        }
      }
    } catch (error) {
      console.error("Erro ao finalizar gestor:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível finalizar o mandato.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async excluirGestor(id) {
    const confirmado = await this.showConfirm(
      "Excluir gestor",
      "Tem certeza que deseja excluir este gestor?\n\nEsta ação não pode ser desfeita.",
      "🗑️",
    );
    if (!confirmado) return;

    try {
      this.mostrarLoading(true);
      await OrgaosService.excluirGestor(id);
      this.mostrarToast("sucesso", "Excluído", "Gestor excluído com sucesso.");

      // Recarregar a lista de gestores
      const modal = document.getElementById("modalGestores");
      if (modal) {
        const orgaoId = document.getElementById("gestorOrgaoId")?.value;
        if (orgaoId) {
          modal.remove();
          this.gerenciarGestores(parseInt(orgaoId));
        }
      }
    } catch (error) {
      console.error("Erro ao excluir gestor:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível excluir o gestor.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // LOGOUT
  // ============================================
  async fazerLogout() {
    const confirmado = await this.showConfirm(
      "Sair do sistema",
      "Tem certeza que deseja sair?",
      "🔓",
    );
    if (confirmado) {
      await auth.logout();
      window.location.href = "/index.html";
    }
  }

  // ============================================
  // FECHAR MODAL
  // ============================================
  fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.remove();
    }
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================
  formatarData(data) {
    if (!data) return "-";
    try {
      const d = new Date(data);
      return d.toLocaleDateString("pt-BR");
    } catch {
      return data;
    }
  }

  mostrarToast(tipo, titulo, mensagem, duracao = 4000) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

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

  mostrarLoading(show) {
    const container = document.getElementById("loadingContainer");
    if (container) {
      container.style.display = show ? "flex" : "none";
    }
    const content = document.querySelector(".orgaos-content");
    if (content) {
      content.style.display = show ? "none" : "block";
    }
  }

  showConfirm(title, message, icon = "⚠️") {
    return new Promise((resolve) => {
      const modal = document.getElementById("confirmModal");
      const confirmIcon = document.getElementById("confirmIcon");
      const confirmTitle = document.getElementById("confirmTitle");
      const confirmMessage = document.getElementById("confirmMessage");
      const confirmOkBtn = document.getElementById("confirmOkBtn");
      const confirmCancelBtn = document.getElementById("confirmCancelBtn");

      if (!modal) {
        resolve(confirm(`${icon} ${title}\n\n${message}`));
        return;
      }

      confirmIcon.textContent = icon;
      confirmTitle.textContent = title;
      confirmMessage.textContent = message;

      modal.style.display = "flex";

      function cleanup() {
        modal.style.display = "none";
        confirmOkBtn.removeEventListener("click", handleConfirm);
        confirmCancelBtn.removeEventListener("click", handleCancel);
        window.removeEventListener("click", handleClickOutside);
      }

      function handleConfirm() {
        cleanup();
        resolve(true);
      }

      function handleCancel() {
        cleanup();
        resolve(false);
      }

      function handleClickOutside(e) {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      }

      confirmOkBtn.addEventListener("click", handleConfirm);
      confirmCancelBtn.addEventListener("click", handleCancel);
      window.addEventListener("click", handleClickOutside);
    });
  }

  // ============================================
  // ESTATÍSTICAS
  // ============================================
  async obterEstatisticas() {
    try {
      const stats = await OrgaosService.obterEstatisticas();
      return stats;
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error);
      return { total: 0, ativos: 0, inativos: 0, comGestor: 0 };
    }
  }

  // ============================================
  // EXPORTAR DADOS
  // ============================================
  exportarDados() {
    try {
      const dados = this.orgaos.map((o) => ({
        Nome: o.nome,
        Sigla: o.sigla || "",
        CNPJ: o.cnpj || "",
        Endereco: o.endereco || "",
        Telefone: o.telefone || "",
        Email: o.email || "",
        Tipo: o.tipo || "",
        Gestor: o.gestor_atual || "",
        Status: o.ativo ? "Ativo" : "Inativo",
      }));

      if (dados.length === 0) {
        this.mostrarToast("aviso", "Sem dados", "Não há órgãos para exportar.");
        return;
      }

      // Criar CSV
      const headers = Object.keys(dados[0]);
      const csv = [
        headers.join(","),
        ...dados.map((row) =>
          headers
            .map((header) => `"${(row[header] || "").replace(/"/g, '""')}"`)
            .join(","),
        ),
      ].join("\n");

      // Baixar arquivo
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `orgaos_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.mostrarToast(
        "sucesso",
        "Exportado",
        `CSV gerado com ${dados.length} órgãos.`,
      );
    } catch (error) {
      console.error("Erro ao exportar dados:", error);
      this.mostrarToast("erro", "Erro", "Não foi possível exportar os dados.");
    }
  }
}

// ============================================
// EXPORTAÇÃO GLOBAL
// ============================================
let gestaoOrgaos = null;

document.addEventListener("DOMContentLoaded", () => {
  gestaoOrgaos = new GestaoOrgaos();
  window.gestaoOrgaos = gestaoOrgaos;
});

export { GestaoOrgaos };
export default GestaoOrgaos;
