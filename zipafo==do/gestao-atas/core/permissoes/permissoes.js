// ============================================
// core/permissoes/permissoes.js
// Módulo central de gestão de permissões
// Integração com Supabase - Versão Completa
// ============================================

import { supabase } from "../../shared/js/supabase.js";
import { PermissoesService } from "../../shared/js/services/permissoes-service.js";
import { auth } from "../../shared/js/auth.js";

// ============================================
// CLASSE PRINCIPAL
// ============================================
class GestaoPermissoes {
  constructor() {
    this.perfis = [];
    this.modulosSistema = [];
    this.permissoes = [];
    this.usuarioAtual = null;
    this.filtros = {
      busca: "",
      status: "todos",
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

      const [perfisData, modulosData, permissoesData] = await Promise.all([
        PermissoesService.listarPerfis(),
        PermissoesService.listarModulos(),
        PermissoesService.listarPermissoes(),
      ]);

      this.perfis = perfisData || [];
      this.modulosSistema = modulosData || [];
      this.permissoes = permissoesData || [];

      return {
        perfis: this.perfis,
        modulos: this.modulosSistema,
        permissoes: this.permissoes,
      };
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      this.mostrarToast("erro", "Erro", "Não foi possível carregar os dados.");
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

    // Filtrar perfis
    let perfisFiltrados = [...this.perfis];

    if (this.filtros.busca) {
      const termo = this.filtros.busca.toLowerCase();
      perfisFiltrados = perfisFiltrados.filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          (p.descricao || "").toLowerCase().includes(termo),
      );
    }

    if (this.filtros.status === "ativo") {
      perfisFiltrados = perfisFiltrados.filter((p) => p.ativo !== false);
    } else if (this.filtros.status === "inativo") {
      perfisFiltrados = perfisFiltrados.filter((p) => p.ativo === false);
    }

    const totalPaginas =
      Math.ceil(perfisFiltrados.length / this.itensPorPagina) || 1;
    if (this.paginaAtual > totalPaginas) this.paginaAtual = totalPaginas;

    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const paginaPerfis = perfisFiltrados.slice(
      inicio,
      inicio + this.itensPorPagina,
    );

    // Mapear permissões por perfil
    const permissoesPorPerfil = {};
    this.permissoes.forEach((p) => {
      if (!permissoesPorPerfil[p.perfil_id]) {
        permissoesPorPerfil[p.perfil_id] = [];
      }
      permissoesPorPerfil[p.perfil_id].push(p);
    });

    container.innerHTML = `
            <div class="permissoes-content">
                <div class="page-header">
                    <h1><i class="fas fa-lock"></i> Gestão de Permissões</h1>
                    <button class="btn btn-primary" id="btnNovoPerfil">
                        <i class="fas fa-plus-circle"></i> Novo Perfil
                    </button>
                </div>

                <div class="filters-bar">
                    <div class="filter-group" style="flex: 1;">
                        <label><i class="fas fa-search"></i> Buscar</label>
                        <input type="text" id="filtroBusca" placeholder="Nome ou descrição..." value="${this.filtros.busca || ""}" />
                    </div>
                    <div class="filter-group">
                        <label><i class="fas fa-filter"></i> Status</label>
                        <select id="filtroStatus">
                            <option value="todos" ${this.filtros.status === "todos" ? "selected" : ""}>Todos</option>
                            <option value="ativo" ${this.filtros.status === "ativo" ? "selected" : ""}>Ativos</option>
                            <option value="inativo" ${this.filtros.status === "inativo" ? "selected" : ""}>Inativos</option>
                        </select>
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
                        ${this.renderizarTabela(paginaPerfis, permissoesPorPerfil)}
                    </div>
                    ${
                      perfisFiltrados.length > this.itensPorPagina
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
                    <span><i class="fas fa-users-cog"></i> Total: <strong>${this.perfis.length}</strong> perfis</span>
                    <span><i class="fas fa-check-circle" style="color: var(--success-600);"></i> Ativos: <strong>${this.perfis.filter((p) => p.ativo !== false).length}</strong></span>
                    <span><i class="fas fa-times-circle" style="color: var(--error-600);"></i> Inativos: <strong>${this.perfis.filter((p) => p.ativo === false).length}</strong></span>
                    <span><i class="fas fa-cubes"></i> Módulos: <strong>${this.modulosSistema.length}</strong></span>
                </div>
            </div>
        `;

    // Configurar eventos da página
    this.configurarEventosPagina();
  }

  // ============================================
  // RENDERIZAR TABELA
  // ============================================
  renderizarTabela(perfisList, permissoesPorPerfil) {
    if (!perfisList || perfisList.length === 0) {
      return `
                <div class="empty-state">
                    <span class="empty-icon"><i class="fas fa-lock"></i></span>
                    <p>Nenhum perfil cadastrado.</p>
                    <button class="btn btn-primary btn-sm" onclick="gestaoPermissoes.abrirModalPerfil()">
                        <i class="fas fa-plus-circle"></i> Cadastrar primeiro perfil
                    </button>
                </div>
            `;
    }

    return `
            <table class="table" id="tabelaPermissoes">
                <thead>
                    <tr>
                        <th style="width: 30px;">#</th>
                        <th>Perfil</th>
                        <th>Descrição</th>
                        <th>Módulos</th>
                        <th>Status</th>
                        <th style="min-width: 200px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${perfisList
                      .map((p, index) => {
                        const num =
                          (this.paginaAtual - 1) * this.itensPorPagina +
                          index +
                          1;
                        const modulosPermitidos =
                          permissoesPorPerfil[p.id] || [];
                        const qtdModulos = modulosPermitidos.filter(
                          (m) => m.permissao !== "negado",
                        ).length;
                        const totalModulos = this.modulosSistema.length;

                        return `
                            <tr>
                                <td style="text-align: center; color: var(--neutral-500);">${num}</td>
                                <td><strong>${p.nome}</strong></td>
                                <td>${p.descricao || "-"}</td>
                                <td>
                                    <span class="badge-permissao ${qtdModulos === totalModulos ? "admin" : qtdModulos > 0 ? "permitido" : "negado"}">
                                        ${qtdModulos}/${totalModulos} módulos
                                    </span>
                                </td>
                                <td>
                                    <span class="status-badge ${p.ativo !== false ? "status-ativo" : "status-inativo"}">
                                        ${p.ativo !== false ? "Ativo" : "Inativo"}
                                    </span>
                                </td>
                                <td class="acoes-cell">
                                    <button class="btn btn-sm btn-outline" onclick="gestaoPermissoes.editarPerfil(${p.id})" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="gestaoPermissoes.gerenciarModulos(${p.id})" title="Módulos">
                                        <i class="fas fa-cubes"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="gestaoPermissoes.verUsuarios(${p.id})" title="Usuários">
                                        <i class="fas fa-users"></i>
                                    </button>
                                    ${
                                      p.ativo !== false
                                        ? `<button class="btn btn-sm btn-danger" onclick="gestaoPermissoes.desativarPerfil(${p.id})" title="Desativar">
                                            <i class="fas fa-times-circle"></i>
                                           </button>`
                                        : `<button class="btn btn-sm btn-success" onclick="gestaoPermissoes.ativarPerfil(${p.id})" title="Ativar">
                                            <i class="fas fa-check-circle"></i>
                                           </button>`
                                    }
                                    <button class="btn btn-sm btn-danger" onclick="gestaoPermissoes.excluirPerfil(${p.id})" title="Excluir">
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
    // Botão novo perfil
    document.getElementById("btnNovoPerfil")?.addEventListener("click", () => {
      this.abrirModalPerfil();
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
      const totalPaginas = Math.ceil(this.perfis.length / this.itensPorPagina);
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
    this.filtros.busca = document.getElementById("filtroBusca")?.value || "";
    this.filtros.status =
      document.getElementById("filtroStatus")?.value || "todos";
    this.paginaAtual = 1;
    this.renderizar();
  }

  limparFiltros() {
    const buscaInput = document.getElementById("filtroBusca");
    const statusSelect = document.getElementById("filtroStatus");

    if (buscaInput) buscaInput.value = "";
    if (statusSelect) statusSelect.value = "todos";

    this.filtros = { busca: "", status: "todos" };
    this.paginaAtual = 1;
    this.renderizar();
  }

  // ============================================
  // MODAL DE PERFIL
  // ============================================
  abrirModalPerfil(id = null) {
    const isEdit = !!id;
    const perfil = isEdit ? this.perfis.find((p) => p.id === id) : null;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "modalPerfil";
    modal.innerHTML = `
            <div class="modal-container modal-sm">
                <div class="modal-header">
                    <h2><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Editar" : "Novo"} Perfil</h2>
                    <button class="modal-close" onclick="gestaoPermissoes.fecharModal('modalPerfil')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="formPerfil" novalidate>
                        <input type="hidden" id="perfilId" value="${id || ""}">

                        <div class="form-group">
                            <label class="required">Nome do Perfil</label>
                            <input type="text" id="perfilNome" class="form-input"
                                value="${perfil?.nome || ""}" placeholder="Ex: Administrador" required>
                            <span class="form-text">Nome único para identificar o perfil.</span>
                        </div>

                        <div class="form-group">
                            <label>Descrição</label>
                            <textarea id="perfilDescricao" class="form-input" rows="2"
                                placeholder="Descrição das permissões deste perfil...">${perfil?.descricao || ""}</textarea>
                        </div>

                        <div class="form-group">
                            <label>Status</label>
                            <select id="perfilStatus" class="form-input">
                                <option value="true" ${perfil?.ativo !== false ? "selected" : ""}>Ativo</option>
                                <option value="false" ${perfil?.ativo === false ? "selected" : ""}>Inativo</option>
                            </select>
                        </div>

                        <div class="form-hint">
                            <i class="fas fa-info-circle"></i>
                            Após criar o perfil, você poderá gerenciar os módulos e permissões.
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="gestaoPermissoes.fecharModal('modalPerfil')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-primary" id="btnSalvarPerfil">
                        <i class="fas fa-save"></i> ${isEdit ? "Atualizar" : "Salvar"}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    document.getElementById("btnSalvarPerfil").addEventListener("click", () => {
      this.salvarPerfil(id);
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.fecharModal("modalPerfil");
      }
    });

    setTimeout(() => {
      document.getElementById("perfilNome")?.focus();
    }, 100);
  }

  // ============================================
  // SALVAR PERFIL
  // ============================================
  async salvarPerfil(id) {
    const nomeInput = document.getElementById("perfilNome");
    const nome = nomeInput?.value?.trim();
    const descricao = document.getElementById("perfilDescricao")?.value?.trim();
    const ativo = document.getElementById("perfilStatus")?.value === "true";

    if (!nome) {
      this.mostrarToast(
        "aviso",
        "Campo obrigatório",
        "Informe o nome do perfil.",
      );
      if (nomeInput) {
        nomeInput.focus();
        nomeInput.classList.add("error");
        setTimeout(() => nomeInput.classList.remove("error"), 3000);
      }
      return;
    }

    try {
      this.mostrarLoading(true);

      let resultado;
      if (id) {
        resultado = await PermissoesService.atualizarPerfil(id, {
          nome,
          descricao,
          ativo,
        });
        this.mostrarToast(
          "sucesso",
          "Atualizado",
          `Perfil "${nome}" atualizado com sucesso!`,
        );
      } else {
        resultado = await PermissoesService.criarPerfil({
          nome,
          descricao,
          ativo,
        });
        this.mostrarToast(
          "sucesso",
          "Criado",
          `Perfil "${nome}" criado com sucesso!`,
        );
      }

      this.fecharModal("modalPerfil");
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível salvar o perfil.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // AÇÕES DO PERFIL
  // ============================================
  async editarPerfil(id) {
    this.abrirModalPerfil(id);
  }

  async desativarPerfil(id) {
    const perfil = this.perfis.find((p) => p.id === id);
    if (!perfil) return;

    const confirmado = await this.showConfirm(
      "Desativar perfil",
      `Tem certeza que deseja desativar o perfil "${perfil.nome}"?\n\nUsuários com este perfil perderão os acessos.`,
      "⚠️",
    );
    if (!confirmado) return;

    try {
      this.mostrarLoading(true);
      await PermissoesService.desativarPerfil(id);
      this.mostrarToast(
        "sucesso",
        "Desativado",
        `Perfil "${perfil.nome}" desativado com sucesso.`,
      );
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao desativar perfil:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível desativar o perfil.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async ativarPerfil(id) {
    const perfil = this.perfis.find((p) => p.id === id);
    if (!perfil) return;

    try {
      this.mostrarLoading(true);
      await PermissoesService.ativarPerfil(id);
      this.mostrarToast(
        "sucesso",
        "Ativado",
        `Perfil "${perfil.nome}" ativado com sucesso.`,
      );
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao ativar perfil:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível ativar o perfil.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  async excluirPerfil(id) {
    const perfil = this.perfis.find((p) => p.id === id);
    if (!perfil) return;

    try {
      // Verificar se há usuários com este perfil
      const usuariosComPerfil =
        await PermissoesService.verificarUsuariosPorPerfil(id);
      let mensagem = `Tem certeza que deseja excluir o perfil "${perfil.nome}"?\n\nEsta ação não pode ser desfeita.`;

      if (usuariosComPerfil > 0) {
        mensagem += `\n\n⚠️ Existem ${usuariosComPerfil} usuário(s) com este perfil. Eles serão desassociados.`;
      }

      const confirmado = await this.showConfirm(
        "Excluir perfil",
        mensagem,
        "🗑️",
      );
      if (!confirmado) return;

      this.mostrarLoading(true);
      await PermissoesService.excluirPerfil(id);
      this.mostrarToast(
        "sucesso",
        "Excluído",
        `Perfil "${perfil.nome}" excluído com sucesso.`,
      );
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao excluir perfil:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível excluir o perfil.",
      );
    } finally {
      this.mostrarLoading(false);
    }
  }

  // ============================================
  // GERENCIAR MÓDULOS DO PERFIL
  // ============================================
  async gerenciarModulos(perfilId) {
    try {
      const perfil = this.perfis.find((p) => p.id === perfilId);
      if (!perfil) return;

      const permissoesPerfil = this.permissoes.filter(
        (p) => p.perfil_id === perfilId,
      );
      const permissoesMap = {};
      permissoesPerfil.forEach((p) => {
        permissoesMap[p.modulo] = p.permissao;
      });

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.id = "modalModulos";
      modal.innerHTML = `
                <div class="modal-container modal-md">
                    <div class="modal-header">
                        <h2><i class="fas fa-cubes"></i> Módulos - ${perfil.nome}</h2>
                        <button class="modal-close" onclick="gestaoPermissoes.fecharModal('modalModulos')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-hint">
                            <i class="fas fa-info-circle"></i>
                            Defina quais módulos este perfil pode acessar.
                            <br><strong>Admin:</strong> Acesso total ao módulo.
                            <br><strong>Permitido:</strong> Acesso apenas leitura.
                            <br><strong>Negado:</strong> Sem acesso ao módulo.
                        </div>
                        <form id="formModulos">
                            <input type="hidden" id="modulosPerfilId" value="${perfilId}">
                            <div class="modulos-grid">
                                ${this.modulosSistema
                                  .map((m) => {
                                    const permissao =
                                      permissoesMap[m.nome] || "negado";
                                    return `
                                        <div class="modulo-item">
                                            <input type="checkbox" id="mod_${m.nome}"
                                                ${permissao !== "negado" ? "checked" : ""}
                                                onchange="gestaoPermissoes.toggleModulo('${m.nome}')">
                                            <label for="mod_${m.nome}">
                                                <i class="${m.icone || "fas fa-cube"}"></i>
                                                ${m.descricao || m.nome}
                                            </label>
                                            <select id="mod_tipo_${m.nome}" class="modulo-permissao"
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
                        <button class="btn btn-secondary" onclick="gestaoPermissoes.fecharModal('modalModulos')">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button class="btn btn-primary" id="btnSalvarModulos">
                            <i class="fas fa-save"></i> Salvar Permissões
                        </button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      document
        .getElementById("btnSalvarModulos")
        .addEventListener("click", async () => {
          await this.salvarModulosPerfil(perfilId);
        });

      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.fecharModal("modalModulos");
        }
      });
    } catch (error) {
      console.error("Erro ao gerenciar módulos:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível carregar os módulos.",
      );
    }
  }

  async salvarModulosPerfil(perfilId) {
    try {
      const modulos = [];
      this.modulosSistema.forEach((m) => {
        const checkbox = document.getElementById(`mod_${m.nome}`);
        if (checkbox && checkbox.checked) {
          const select = document.getElementById(`mod_tipo_${m.nome}`);
          const permissao = select ? select.value : "permitido";
          modulos.push({
            modulo: m.nome,
            permissao: permissao,
          });
        } else {
          modulos.push({
            modulo: m.nome,
            permissao: "negado",
          });
        }
      });

      this.mostrarLoading(true);
      await PermissoesService.atualizarPermissoesPerfil(perfilId, modulos);
      this.mostrarToast(
        "sucesso",
        "Salvo",
        "Permissões atualizadas com sucesso!",
      );
      this.fecharModal("modalModulos");
      await this.carregarDados();
      this.renderizar();
    } catch (error) {
      console.error("Erro ao salvar módulos:", error);
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
  // TOGGLE MÓDULO
  // ============================================
  toggleModulo(modulo) {
    const checkbox = document.getElementById(`mod_${modulo}`);
    const select = document.getElementById(`mod_tipo_${modulo}`);
    if (select) {
      select.disabled = !checkbox.checked;
      if (!checkbox.checked) {
        select.value = "permitido";
      }
    }
  }

  // ============================================
  // VER USUÁRIOS DO PERFIL
  // ============================================
  async verUsuarios(perfilId) {
    try {
      const perfil = this.perfis.find((p) => p.id === perfilId);
      if (!perfil) return;

      const usuarios =
        await PermissoesService.listarUsuariosPorPerfil(perfilId);

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.id = "modalUsuariosPerfil";
      modal.innerHTML = `
                <div class="modal-container modal-md">
                    <div class="modal-header">
                        <h2><i class="fas fa-users"></i> Usuários - ${perfil.nome}</h2>
                        <button class="modal-close" onclick="gestaoPermissoes.fecharModal('modalUsuariosPerfil')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${
                          usuarios.length > 0
                            ? `
                            <div class="table-container">
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Nome</th>
                                            <th>E-mail</th>
                                            <th>Órgão</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${usuarios
                                          .map(
                                            (u) => `
                                            <tr>
                                                <td><strong>${u.nome}</strong></td>
                                                <td>${u.email}</td>
                                                <td>${u.orgao?.nome || "-"}</td>
                                                <td><span class="status-badge ${u.ativo ? "status-ativo" : "status-inativo"}">${u.ativo ? "Ativo" : "Inativo"}</span></td>
                                            </tr>
                                        `,
                                          )
                                          .join("")}
                                    </tbody>
                                </table>
                            </div>
                        `
                            : `
                            <div class="empty-state">
                                <span class="empty-icon"><i class="fas fa-users"></i></span>
                                <p>Nenhum usuário com este perfil.</p>
                            </div>
                        `
                        }
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="gestaoPermissoes.fecharModal('modalUsuariosPerfil')">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.fecharModal("modalUsuariosPerfil");
        }
      });
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      this.mostrarToast(
        "erro",
        "Erro",
        error.message || "Não foi possível listar os usuários.",
      );
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
    const content = document.querySelector(".permissoes-content");
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
      const stats = await PermissoesService.obterEstatisticas();
      return stats;
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error);
      return { totalPerfis: 0, ativos: 0, inativos: 0, totalPermissoes: 0 };
    }
  }

  // ============================================
  // EXPORTAR DADOS
  // ============================================
  exportarDados() {
    try {
      const dados = this.perfis.map((p) => {
        const permissoesPerfil = this.permissoes.filter(
          (perm) => perm.perfil_id === p.id,
        );
        const modulos = permissoesPerfil
          .map((perm) => `${perm.modulo}: ${perm.permissao}`)
          .join("; ");
        return {
          Perfil: p.nome,
          Descricao: p.descricao || "",
          Status: p.ativo !== false ? "Ativo" : "Inativo",
          Modulos: modulos || "Nenhum",
        };
      });

      if (dados.length === 0) {
        this.mostrarToast("aviso", "Sem dados", "Não há perfis para exportar.");
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
      link.download = `permissoes_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.mostrarToast(
        "sucesso",
        "Exportado",
        `CSV gerado com ${dados.length} perfis.`,
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
let gestaoPermissoes = null;

document.addEventListener("DOMContentLoaded", () => {
  gestaoPermissoes = new GestaoPermissoes();
  window.gestaoPermissoes = gestaoPermissoes;
  window.gestaoPermissoes.toggleModulo = function (modulo) {
    if (gestaoPermissoes) {
      gestaoPermissoes.toggleModulo(modulo);
    }
  };
});

export { GestaoPermissoes };
export default GestaoPermissoes;
