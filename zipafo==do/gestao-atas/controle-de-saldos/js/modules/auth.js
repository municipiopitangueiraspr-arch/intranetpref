import { supabase } from "../supabase.js";

export class Auth {
  constructor(sistema) {
    this.sistema = sistema;
  }

  // ============================================
  // MÉTODO REMOVIDO: fazerLogin() - não é mais usado
  // O login agora é feito em index.html
  // ============================================

  async carregarUsuario(uuid) {
    try {
      const { data: usuario, error } = await supabase
        .from("usuarios")
        .select("*, orgao:orgaos(*)")
        .eq("uuid", uuid)
        .single();

      if (error) {
        console.error("Erro ao buscar usuário:", error);
        this.redirecionarParaLogin();
        return;
      }

      if (!usuario) {
        console.error("Usuário não encontrado na base de dados.");
        this.redirecionarParaLogin();
        return;
      }

      // Armazenar usuário no sistema
      this.sistema.usuarioAtual = usuario;

      // Atualizar interface com os dados do usuário
      this.atualizarInterfaceUsuario(usuario);

      // Configurar permissões baseadas no perfil
      this.configurarPermissoes();

      // O sistema já está visível (removemos a tela de login)
      // Garantir que o mainSystem está visível
      const mainSystem = document.getElementById("mainSystem");
      if (mainSystem) {
        mainSystem.style.display = "block";
      }

      // Carregar dados iniciais
      await this.sistema.carregarOrgaos();
      await this.sistema.carregarCategorias();
      await this.sistema.carregarFiltros();
      await this.sistema.carregarSelectsGestao();
      await this.sistema.carregarTabelaUsuarios();
      await this.sistema.carregarTabelaOrgaos();
      await this.sistema.carregarPedidos();
      await this.sistema.carregarAditivos();

      this.sistema.atualizarCarrinhoUI();
      this.sistema.ativarTab("consulta");
    } catch (error) {
      console.error("Erro ao carregar usuário:", error);
      this.redirecionarParaLogin();
    }
  }

  // ============================================
  // ATUALIZAR INTERFACE DO USUÁRIO
  // ============================================
  atualizarInterfaceUsuario(usuario) {
    // Atualizar nome
    const userName = document.getElementById("userName");
    if (userName) {
      userName.textContent = usuario.nome || "Usuário";
    }

    // Atualizar perfil/role
    const userRole = document.getElementById("userRole");
    if (userRole) {
      userRole.textContent = usuario.perfil || "Usuário";
    }

    // Atualizar avatar (iniciais)
    const userAvatar = document.getElementById("userAvatar");
    if (userAvatar) {
      const iniciais =
        usuario.nome
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase() || "U";
      userAvatar.textContent = iniciais;
    }
  }

  // ============================================
  // CONFIGURAR PERMISSÕES
  // ============================================
  configurarPermissoes() {
    const perfil = this.sistema.usuarioAtual?.perfil;

    // Abas que requerem permissões especiais
    const tabUsuarios = document.getElementById("tabUsuarios");
    const tabOrgaos = document.getElementById("tabOrgaos");
    const tabAditivos = document.getElementById("tabAditivos");
    const tabGestao = document.getElementById("tabGestao");
    const tabCadastro = document.getElementById("tabCadastro");

    if (tabUsuarios) {
      tabUsuarios.style.display = perfil === "ADMIN" ? "block" : "none";
    }
    if (tabOrgaos) {
      tabOrgaos.style.display = perfil === "ADMIN" ? "block" : "none";
    }
    if (tabAditivos) {
      tabAditivos.style.display =
        perfil === "ADMIN" || perfil === "ESTAGIARIO" ? "block" : "none";
    }
    if (tabGestao) {
      tabGestao.style.display =
        perfil === "ADMIN" || perfil === "ESTAGIARIO" ? "block" : "none";
    }
    if (tabCadastro) {
      tabCadastro.style.display =
        perfil === "ADMIN" || perfil === "ESTAGIARIO" ? "block" : "none";
    }

    // Carrinho - visível para ADMIN, SECRETARIO e SOLICITANTE
    const carrinhoIndicator = document.getElementById("carrinhoIndicator");
    if (carrinhoIndicator) {
      const count = this.sistema.carrinho?.length || 0;
      if (
        count > 0 &&
        (perfil === "ADMIN" ||
          perfil === "SECRETARIO" ||
          perfil === "SOLICITANTE")
      ) {
        carrinhoIndicator.style.display = "flex";
      } else {
        carrinhoIndicator.style.display = "none";
      }
    }
  }

  // ============================================
  // REDIRECIONAR PARA LOGIN
  // ============================================
  redirecionarParaLogin() {
    // Redireciona para index.html (antigo login.html)
    window.location.href = "../index.html";
  }

  // ============================================
  // LOGOUT
  // ============================================
  async fazerLogout() {
    try {
      await supabase.auth.signOut();
      this.sistema.usuarioAtual = null;
      // Redirecionar para index.html
      window.location.href = "../index.html";
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  }
}
