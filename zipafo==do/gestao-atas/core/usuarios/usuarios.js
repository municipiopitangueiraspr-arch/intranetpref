// ============================================
// core/usuarios/usuarios.js
// Módulo central de gestão de usuários
// Integração com Supabase - Versão Completa
// CORRIGIDO: Removida chamada à API Admin (atualizarSenha)
// ============================================

import { supabase } from "../../shared/js/supabase.js";
import { UsuariosService } from "../../shared/js/services/usuarios-service.js";
import { OrgaosService } from "../../shared/js/services/orgaos-service.js";
import { auth } from "../../shared/js/auth.js";

// ============================================
// CLASSE PRINCIPAL
// ============================================
class GestaoUsuarios {
  constructor() {
    this.usuarios = [];
    this.orgaos = [];
    this.usuarioAtual = null;
    this.filtros = {
      status: "todos",
      perfil: "todos",
      orgao: "todos",
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

      // Carregar órgãos primeiro
      await this.carregarOrgaos();

      // Carregar usuários
      await this.carregarUsuarios();

      return {
        usuarios: this.usuarios,
        orgaos: this.orgaos,
      };
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      this.mostrarToast("erro", "Erro", "Não foi possível carregar os dados.");
      throw error;
    } finally {
      this.mostrarLoading(false);
    }
  }

  async carregarOrgaos() {
    try {
      this.orgaos = await OrgaosService.listarAtivos();
      return this.orgaos;
    } catch (error) {
      console.error("Erro ao carregar órgãos:", error);
      this.orgaos = [];
      return [];
    }
  }

  async carregarUsuarios() {
    try {
      const options = {};

      if (this.filtros.status === "ativo") {
        options.onlyActive = true;
      }

      if (this.filtros.busca) {
        options.search = this.filtros.busca;
      }

      if (this.filtros.orgao && this.filtros.orgao !== "todos") {
        options.orgaoId = parseInt(this.filtros.orgao);
      }

      if (this.filtros.perfil && this.filtros.perfil !== "todos") {
        options.perfil = this.filtros.perfil;
      }

      this.usuarios = await UsuariosService.listar(options);

      // Se for inativo, filtrar manualmente
      if (this.filtros.status === "inativo") {
        this.usuarios = this.usuarios.filter((u) => u.ativo === false);
      }

      // Ordenar por nome
      this.usuarios.sort((a, b) => a.nome.localeCompare(b.nome));

      return this.usuarios;
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      this.usuarios = [];
      throw error;
    }
  }

  // ============================================
  // RENDERIZAR
  // ============================================
  renderizar() {
    const container = document.getElementById("pageContent");
    if (!container) return;

    const totalPaginas =
      Math.ceil(this.usuarios.length / this.itensPorPagina) || 1;
    if (this.paginaAtual > totalPaginas) this.paginaAtual = totalPaginas;

    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const paginaUsuarios = this.usuarios.slice(
      inicio,
      inicio + this.itensPorPagina,
    );

    // Opções para filtros
    const perfis = [
      { value: "todos", label: "Todos os perfis" },
      { value: "ADMIN", label: "Administrador" },
      { value: "SECRETARIO", label: "Secretário" },
      { value: "SOLICITANTE", label: "Solicitante" },
      { value: "ESTAGIARIO", label: "Estagiário" },
    ];

    const orgaoOptions = [
      { value: "todos", label: "Todos os órgãos" },
      ...this.orgaos.map((o) => ({ value: o.id, label: o.nome })),
    ];

    container.innerHTML = `
            <div class="usuarios-content">
                <div class="page-header">
                    <h1><i class="fas fa-users"></i> Usuários</h1>
                    <button class="btn btn-primary" id="btnNovoUsuario">
                        <i class="fas fa-user-plus"></i> Novo Usuário
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
                    <div class="filter-group">
                        <label><i class="fas fa-user-tag"></i> Perfil</label>
                        <select id="filtroPerfil">
                            ${perfis
                              .map(
                                (p) => `
                                <option value="${p.value}" ${this.filtros.perfil === p.value ? "selected" : ""}>${p.label}</option>
                            `,
                              )
                              .join("")}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label><i class="fas fa-building"></i> Órgão</label>
                        <select id="filtroOrgao">
                            ${orgaoOptions
                              .map(
                                (o) => `
                                <option value="${o.value}" ${this.filtros.orgao == o.value ? "selected" : ""}>${o.label}</option>
                            `,
                              )
                              .join("")}
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1;">
                        <label><i class="fas fa-search"></i> Buscar</label>
                        <input type="text" id="filtroBusca" placeholder="Nome ou e-mail..." value="${this.filtros.busca || ""}" />
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
                        ${this.renderizarTabela(paginaUsuarios)}
                    </div>
                    ${
                      this.usuarios.length > this.itensPorPagina
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
                    <span><i class="fas fa-users"></i> Total: <strong>${this.usuarios.length}</strong> usuários</span>
                    <span><i class="fas fa-check-circle" style="color: var(--success-600);"></i> Ativos: <strong>${this.usuarios.filter((u) => u.ativo).length}</strong></span>
                    <span><i class="fas fa-times-circle" style="color: var(--error-600);"></i> Inativos: <strong>${this.usuarios.filter((u) => !u.ativo).length}</strong></span>
                    <span><i class="fas fa-building"></i> Órgãos: <strong>${this.orgaos.length}</strong></span>
                </div>
            </div>
        `;

    // Configurar eventos da página
    this.configurarEventosPagina();
  }

  // ============================================
  // RENDERIZAR TABELA
  // ============================================
  renderizarTabela(usuariosList) {
    if (!usuariosList || usuariosList.length === 0) {
      return `
                <div class="empty-state">
                    <span class="empty-icon"><i class="fas fa-users"></i></span>
                    <p>Nenhum usuário cadastrado.</p>
                    <button class="btn btn-primary btn-sm" onclick="gestaoUsuarios.abrirModalUsuario()">
                        <i class="fas fa-user-plus"></i> Cadastrar primeiro usuário
                    </button>
                </div>
            `;
    }

    return `
            <table class="table" id="tabelaUsuarios">
                <thead>
                    <tr>
                        <th style="width: 30px;">#</th>
                        <th>Nome</th>
                        <th>E-mail</th>
                        <th>Perfil</th>
                        <th>Órgão</th>
                        <th>Status</th>
                        <th>Último Login</th>
                        <th style="min-width: 150px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${usuariosList
                      .map((u, index) => {
                        const num =
                          (this.paginaAtual - 1) * this.itensPorPagina +
                          index +
                          1;
                        const perfilClass = u.perfil
                          ? u.perfil.toLowerCase()
                          : "solicitante";
                        const orgao = this.orgaos.find(
                          (o) => o.id === u.orgao_id,
                        );
                        return `
                            <tr>
                                <td style="text-align: center; color: var(--neutral-500);">${num}</td>
                                <td><strong>${u.nome}</strong></td>
                                <td>${u.email}</td>
                                <td><span class="badge-perfil-sistema ${perfilClass}">${u.perfil || "SOLICITANTE"}</span></td>
                                <td>${orgao ? orgao.nome : "-"}</td>
                                <td>
                                    <span class="status-badge ${u.ativo ? "status-ativo" : "status-inativo"}">
                                        ${u.ativo ? "Ativo" : "Inativo"}
                                    </span>
                                </td>
                                <td>${u.ultimo_login ? this.formatarData(u.ultimo_login) : "-"}</td>
                                <td class="acoes-cell">
                                    <button class="btn btn-sm btn-outline" onclick="gestaoUsuarios.editarUsuario(${u.id})" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="gestaoUsuarios.gerenciarPermissoes(${u.id})" title="Permissões">
                                        <i class="fas fa-lock"></i>
                                    </button>
                                    ${
                                      u.ativo
                                        ? `<button class="btn btn-sm btn-danger" onclick="gestaoUsuarios.desativarUsuario(${u.id})" title="Desativar">
                                            <i class="fas fa-times-circle"></i>
                                           </button>`
                                        : `<button class="btn btn-sm btn-success" onclick="gestaoUsuarios.ativarUsuario(${u.id})" title="Ativar">
                                            <i class="fas fa-check-circle"></i>
                                           </button>`
                                    }
                                    <button class="btn btn-sm btn-danger" onclick="gestaoUsuarios.excluirUsuario(${u.id})" title="Excluir">
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
    // Botão novo usuário
    document.getElementById("btnNovoUsuario")?.addEventListener("click", () => {
      this.abrirModalUsuario();
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

    // Filtros com change
    document
      .getElementById("filtroStatus")
      ?.addEventListener("change", () => this.aplicarFiltros());
    document
      .getElementById("filtroPerfil")
      ?.addEventListener("change", () => this.aplicarFiltros());
    document
      .getElementById("filtroOrgao")
      ?.addEventListener("change", () => this.aplicarFiltros());

    // Filtro busca com Enter
    document
      .getElementById("filtroBusca")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.aplicarFiltros();
      });

    // Paginação
    document.getElementById("btnPagAnterior")?.addEventListener("click", () => {
      if (this.paginaAtual > 1) {
        this.paginaAtual--;
        this.renderizar();
      }
    });

    document.getElementById("btnPagProximo")?.addEventListener("click", () => {
      const totalPaginas = Math.ceil(
        this.usuarios.length / this.itensPorPagina,
      );
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
    this.filtros.perfil =
      document.getElementById("filtroPerfil")?.value || "todos";
    this.filtros.orgao =
      document.getElementById("filtroOrgao")?.value || "todos";
    this.filtros.busca = document.getElementById("filtroBusca")?.value || "";
    this.paginaAtual = 1;
    this.carregarUsuarios().then(() => this.renderizar());
  }

  limparFiltros() {
    const statusSelect = document.getElementById("filtroStatus");
    const perfilSelect = document.getElementById("filtroPerfil");
    const orgaoSelect = document.getElementById("filtroOrgao");
    const buscaInput = document.getElementById("filtroBusca");

    if (statusSelect) statusSelect.value = "todos";
    if (perfilSelect) perfilSelect.value = "todos";
    if (orgaoSelect) orgaoSelect.value = "todos";
    if (buscaInput) buscaInput.value = "";

    this.filtros = {
      status: "todos",
      perfil: "todos",
      orgao: "todos",
      busca: "",
    };
    this.paginaAtual = 1;
    this.carregarUsuarios().then(() => this.renderizar());
  }

  // ============================================
  // MODAL DE USUÁRIO
  // ============================================
  abrirModalUsuario(id = null) {
    const isEdit = !!id;
    const usuario = isEdit ? this.usuarios.find((u) => u.id === id) : null;

    // Carregar órgãos para o select
    const orgaoOptions = [
      { value: "", label: "Selecione um órgão" },
      ...this.orgaos.map((o) => ({ value: o.id, label: o.nome })),
    ];

    const perfis = [
      { value: "ADMIN", label: "Administrador" },
      { value: "SECRETARIO", label: "Secretário" },
      { value: "SOLICITANTE", label: "Solicitante" },
      { value: "ESTAGIARIO", label: "Estagiário" },
    ];

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "modalUsuario";
    modal.innerHTML = `
            <div class="modal-container modal-md">
                <div class="modal-header">
                    <h2><i class="fas ${isEdit ? "fa-edit" : "fa-user-plus"}"></i> ${isEdit ? "Editar" : "Novo"} Usuário</h2>
                    <button class="modal-close" onclick="gestaoUsuarios.fecharModal('modalUsuario')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="formUsuario" novalidate>
                        <input type="hidden" id="usuarioId" value="${id || ""}">

                        <div class="form-group">
                            <label class="required">Nome Completo</label>
                            <input type="text" id="usuarioNome" class="form-input"
                                value="${usuario?.nome || ""}" placeholder="Nome completo do usuário" required>
                        </div>

                        <div class="form-group">
                            <label class="required">E-mail</label>
                            <input type="email" id="usuarioEmail" class="form-input"
                                value="${usuario?.email || ""}" placeholder="usuario@prefeitura.gov.br" required>
                            <span class="form-text">O e-mail será usado para login no sistema.</span>
                        </div>

                        <div class="form-group" id="senhaGroup" ${isEdit ? 'style="display: none;"' : ""}>
                            <label class="required">Senha</label>
                            <input type="password" id="usuarioSenha" class="form-input"
                                placeholder="Mínimo 6 caracteres" ${isEdit ? "" : "required"} autocomplete="new-password">
                            <span class="form-text">${isEdit ? "Deixe em branco para manter a senha atual." : "A senha deve ter no mínimo 6 caracteres."}</span>
                        </div>

                        <div class="form-row-2">
                            <div class="form-group">
                                <label class="required">Perfil</label>
                                <select id="usuarioPerfil" class="form-input" required>
                                    ${perfis
                                      .map(
                                        (p) => `
                                        <option value="${p.value}" ${usuario?.perfil === p.value ? "selected" : ""}>${p.label}</option>
                                    `,
                                      )
                                      .join("")}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Órgão</label>
                                <select id="usuarioOrgao" class="form-input">
                                    ${orgaoOptions
                                      .map(
                                        (o) => `
                                        <option value="${o.value}" ${usuario?.orgao_id == o.value ? "selected" : ""}>${o.label}</option>
                                    `,
                                      )
                                      .join("")}
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Status</label>
                            <select id="usuarioStatus" class="form-input">
                                <option value="true" ${usuario?.ativo !== false ? "selected" : ""}>Ativo</option>
                                <option value="false" ${usuario?.ativo === false ? "selected" : ""}>Inativo</option>
                            </select>
                        </div>

                        ${
                          !isEdit
                            ? `
                            <div class="form-hint">
                                <i class="fas fa-info-circle"></i>
                                O usuário receberá um e-mail de confirmação após o cadastro.
                                <br><br>
                                <strong>Importante:</strong> A senha é definida no momento do cadastro.
                                Para redefinir a senha, use a opção "Esqueci minha senha" na tela de login.
                            </div>
                        `
                            : `
                            <div class="form-hint">
                                <i class="fas fa-info-circle"></i>
                                Para redefinir a senha do usuário, use a opção "Esqueci minha senha" na tela de login.
                            </div>
                        `
                        }
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="gestaoUsuarios.fecharModal('modalUsuario')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-primary" id="btnSalvarUsuario">
                        <i class="fas fa-save"></i> ${isEdit ? "Atualizar" : "Salvar"}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // Se for edição, esconder campo de senha
    if (isEdit) {
      document.getElementById("senhaGroup").style.display = "none";
    }

    // Evento do botão salvar
    document
      .getElementById("btnSalvarUsuario")
      .addEventListener("click", () => {
        this.salvarUsuario(id);
      });

    // Fechar modal ao clicar fora
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.fecharModal("modalUsuario");
      }
    });

    // Focar no primeiro campo
    setTimeout(() => {
      document.getElementById("usuarioNome")?.focus();
    }, 100);
  }

  // ============================================
  // SALVAR USUÁRIO
  // ============================================
  async salvarUsuario(id) {
    const nomeInput = document.getElementById("usuarioNome");
    const nome = nomeInput?.value?.trim();
    const email = document.getElementById("usuarioEmail")?.value?.trim();
    const senha = document.getElementById("usuarioSenha")?.value;
    const perfil = document.getElementById("usuarioPerfil")?.value;
    const orgaoId = document.getElementById("usuarioOrgao")?.value;
    const ativo = document.getElementById("usuarioStatus")?.value === "true";

    // Validar campos
    if (!nome) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe o nome do usuário.",
      );
      if (nomeInput) {
        nomeInput.focus();
        nomeInput.classList.add("error");
        setTimeout(() => nomeInput.classList.remove("error"), 3000);
      }
      return;
    }

    if (!email) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe o e-mail do usuário.",
      );
      document.getElementById("usuarioEmail")?.focus();
      return;
    }

    // Para novo usuário, senha é obrigatória
    if (!id && (!senha || senha.length < 6)) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "A senha deve ter no mínimo 6 caracteres.",
      );
      document.getElementById("usuarioSenha")?.focus();
      return;
    }

    const dados = {
      nome: nome,
      email: email,
      perfil: perfil || "SOLICITANTE",
      orgao_id: orgaoId ? parseInt(orgaoId) : null,
      ativo: ativo,
    };

    try {
      this.mostrarLoading(true);

      let resultado;
      if (id) {
        // Verificar se o usuário existe
        const usuarioExistente = this.usuarios.find((u) => u.id === id);
        if (!usuarioExistente) {
          throw new Error("Usuário não encontrado.");
        }

        // Atualizar dados do usuário
        resultado = await UsuariosService.atualizar(id, dados);
        this.mostrarToast(
          "sucesso",
          "Atualizado",
          `Usuário "${dados.nome}" atualizado com sucesso!`,
        );
      } else {
        // Criar novo usuário - a senha já é definida no momento do cadastro via signUp()
        dados.senha = senha;
        resultado = await UsuariosService.criar(dados);
        this.mostrarToast(
          "sucesso",
          "Criado",
          `Usuário "${dados.nome}" criado com sucesso!`,
        );
      }

      this.fecharModal("modalUsuario");
      await this.carregarUsuarios();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível salvar o usuário.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // AÇÕES DO USUÁRIO
  // ============================================
  async editarUsuario(id) {
    this.abrirModalUsuario(id);
  }

  async desativarUsuario(id) {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) return;

    const confirmado = await this.showConfirm(
      "Desativar usuário",
      `Tem certeza que deseja desativar o usuário "${usuario.nome}"?\n\nO usuário não poderá mais acessar o sistema.`,
      "⚠️",
    );
    if (!confirmado) return;

    try {
      this.mostrarLoading(true);
      await UsuariosService.desativar(id);
      this.mostrarToast(
        "sucesso",
        "Desativado",
        `Usuário "${usuario.nome}" desativado com sucesso.`,
      );
      await this.carregarUsuarios();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao desativar usuário:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível desativar o usuário.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async ativarUsuario(id) {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) return;

    try {
      this.mostrarLoading(true);
      await UsuariosService.ativar(id);
      this.mostrarToast(
        "sucesso",
        "Ativado",
        `Usuário "${usuario.nome}" ativado com sucesso.`,
      );
      await this.carregarUsuarios();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao ativar usuário:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível ativar o usuário.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async excluirUsuario(id) {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) return;

    // Verificar dependências
    try {
      const dependencias = await UsuariosService.verificarDependencias(id);
      let mensagem = `Tem certeza que deseja excluir o usuário "${usuario.nome}"?\n\nEsta ação não pode ser desfeita.`;

      if (dependencias.temPedidos) {
        mensagem += "\n\n⚠️ Este usuário possui pedidos vinculados.";
      }
      if (dependencias.temProcessos) {
        mensagem += "\n\n⚠️ Este usuário possui processos vinculados.";
      }
      if (dependencias.temAtos) {
        mensagem += "\n\n⚠️ Este usuário possui atos oficiais vinculados.";
      }

      const confirmado = await this.showConfirm(
        "Excluir usuário",
        mensagem,
        "🗑️",
      );
      if (!confirmado) return;

      this.mostrarLoading(true);
      await UsuariosService.excluir(id);
      this.mostrarToast(
        "sucesso",
        "Excluído",
        `Usuário "${usuario.nome}" excluído com sucesso.`,
      );
      await this.carregarUsuarios();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível excluir o usuário.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // PERMISSÕES
  // ============================================
  async gerenciarPermissoes(usuarioId) {
    try {
      const usuario = this.usuarios.find((u) => u.id === usuarioId);
      if (!usuario) return;

      const permissoes = await UsuariosService.obterPermissoes(usuarioId);
      const modulos = UsuariosService.getModulos();

      // Mapear permissões existentes
      const permissoesMap = {};
      permissoes.forEach((p) => {
        permissoesMap[p.modulo] = p.permissao;
      });

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.id = "modalPermissoes";
      modal.innerHTML = `
                <div class="modal-container modal-md">
                    <div class="modal-header">
                        <h2><i class="fas fa-lock"></i> Permissões - ${usuario.nome}</h2>
                        <button class="modal-close" onclick="gestaoUsuarios.fecharModal('modalPermissoes')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-hint">
                            <i class="fas fa-info-circle"></i>
                            Defina quais módulos este usuário pode acessar.
                            <br><strong>Admin:</strong> Acesso total ao módulo.
                            <br><strong>Permitido:</strong> Acesso apenas leitura.
                        </div>
                        <form id="formPermissoes">
                            <input type="hidden" id="permissoesUsuarioId" value="${usuarioId}">
                            <div class="permissoes-grid">
                                ${modulos
                                  .map((m) => {
                                    const permissao =
                                      permissoesMap[m.value] || "negado";
                                    return `
                                        <div class="permissao-item">
                                            <input type="checkbox" id="perm_${m.value}"
                                                ${permissao !== "negado" ? "checked" : ""}
                                                onchange="gestaoUsuarios.togglePermissao('${m.value}')">
                                            <label for="perm_${m.value}">${m.label}</label>
                                            <select id="perm_tipo_${m.value}" class="permissao-tipo"
                                                ${permissao === "negado" ? "disabled" : ""}>
                                                <option value="permitido" ${permissao === "permitido" ? "selected" : ""}>Leitura</option>
                                                <option value="admin" ${permissao === "admin" ? "selected" : ""}>Admin</option>
                                            </select>
                                        </div>
                                    `;
                                  })
                                  .join("")}
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="gestaoUsuarios.fecharModal('modalPermissoes')">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button class="btn btn-primary" id="btnSalvarPermissoes">
                            <i class="fas fa-save"></i> Salvar Permissões
                        </button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      // Evento do botão salvar
      document
        .getElementById("btnSalvarPermissoes")
        .addEventListener("click", async () => {
          await this.salvarPermissoes(usuarioId);
        });

      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.fecharModal("modalPermissoes");
        }
      });
    } catch (error) {
      console.error("Erro ao gerenciar permissões:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível carregar as permissões.",
      );
    }
  }

  async salvarPermissoes(usuarioId) {
    try {
      const modulos = UsuariosService.getModulos();
      const permissoes = [];

      modulos.forEach((m) => {
        const checkbox = document.getElementById(`perm_${m.value}`);
        if (checkbox && checkbox.checked) {
          const select = document.getElementById(`perm_tipo_${m.value}`);
          const permissao = select ? select.value : "permitido";
          permissoes.push({
            modulo: m.value,
            permissao: permissao,
          });
        }
      });

      this.mostrarLoading(true);
      await UsuariosService.atualizarPermissoes(usuarioId, permissoes);
      this.mostrarToast(
        "sucesso",
        "Salvo",
        "Permissões atualizadas com sucesso!",
      );
      this.fecharModal("modalPermissoes");
    } catch (error) {
      console.error("Erro ao salvar permissões:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível salvar as permissões.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // TOGGLE PERMISSÃO
  // ============================================
  togglePermissao(modulo) {
    const checkbox = document.getElementById(`perm_${modulo}`);
    const select = document.getElementById(`perm_tipo_${modulo}`);
    if (select) {
      select.disabled = !checkbox.checked;
      if (!checkbox.checked) {
        select.value = "permitido";
      }
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
    const content = document.querySelector(".usuarios-content");
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
      const stats = await UsuariosService.obterEstatisticas();
      return stats;
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error);
      return { total: 0, ativos: 0, inativos: 0, porPerfil: {} };
    }
  }

  // ============================================
  // EXPORTAR DADOS
  // ============================================
  exportarDados() {
    try {
      const dados = this.usuarios.map((u) => {
        const orgao = this.orgaos.find((o) => o.id === u.orgao_id);
        return {
          Nome: u.nome,
          Email: u.email,
          Perfil: u.perfil || "SOLICITANTE",
          Orgao: orgao ? orgao.nome : "-",
          Status: u.ativo ? "Ativo" : "Inativo",
          "Ultimo Login": u.ultimo_login
            ? this.formatarData(u.ultimo_login)
            : "-",
        };
      });

      if (dados.length === 0) {
        this.mostrarToast(
          "aviso",
          "Sem dados",
          "Não há usuários para exportar.",
        );
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
      link.download = `usuarios_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.mostrarToast(
        "sucesso",
        "Exportado",
        `CSV gerado com ${dados.length} usuários.`,
      );
    } catch (error) {
      console.error("Erro ao exportar dados:", error);
      this.mostrarToast("erro", "Erro", "Não foi possível exportar os dados.");
    }
  }

  // ============================================
  // REDEFINIR SENHA (via e-mail)
  // ============================================
  async redefinirSenha(id) {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) return;

    const confirmado = await this.showConfirm(
      "Enviar e-mail de redefinição",
      `Deseja enviar um e-mail para "${usuario.email}" com as instruções para redefinir a senha?`,
      "📧",
    );
    if (!confirmado) return;

    try {
      this.mostrarLoading(true);
      await UsuariosService.enviarRedefinicaoSenha(usuario.email);
      this.mostrarToast(
        "sucesso",
        "E-mail enviado",
        `Instruções para redefinir a senha enviadas para ${usuario.email}.`,
      );
    } catch (error) {
      console.error("Erro ao enviar e-mail de redefinição:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível enviar o e-mail.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }
}

// ============================================
// EXPORTAÇÃO GLOBAL
// ============================================
let gestaoUsuarios = null;

document.addEventListener("DOMContentLoaded", () => {
  gestaoUsuarios = new GestaoUsuarios();
  window.gestaoUsuarios = gestaoUsuarios;
  window.gestaoUsuarios.togglePermissao = function (modulo) {
    if (gestaoUsuarios) {
      gestaoUsuarios.togglePermissao(modulo);
    }
  };
});

export { GestaoUsuarios };
export default GestaoUsuarios;
