import { supabase } from "../supabase.js";

export class Usuarios {
  constructor(sistema) {
    this.sistema = sistema;
  }

  async carregarConteudo() {
    const container = document.getElementById("usuariosContent");
    container.innerHTML = this.gerarHTMLUsuarios();
    document
      .getElementById("btnNovoUsuario")
      .addEventListener("click", () => this.abrirModal());
    await this.carregarTabela();
  }

  gerarHTMLUsuarios() {
    return `
            <div class="usuarios-container">
                <div class="usuarios-header">
                    <h3 style="font-size: 1.1rem">
                        <i class="fas fa-users-cog"></i> Gestão de Usuários
                    </h3>
                    <button class="btn-novo-usuario" id="btnNovoUsuario">
                        <i class="fas fa-user-plus"></i> Novo Usuário
                    </button>
                </div>
                <div class="tabela-container">
                    <table class="tabela-usuarios">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Órgão</th>
                                <th>Perfil</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="tabelaUsuariosBody"></tbody>
                    </table>
                </div>
            </div>
        `;
  }

  async carregarTabela() {
    const tbody = document.getElementById("tabelaUsuariosBody");
    if (!tbody) return;
    await this.sistema.carregarOrgaos();
    const { data: usuarios } = await supabase
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
        return `
                <tr>
                    <td><strong style="font-size:0.85rem;">${u.nome}</strong></td>
                    <td style="font-size:0.8rem;">${u.email}</td>
                    <td style="font-size:0.8rem;">${u.orgao?.nome || ""}</td>
                    <td><span class="badge-perfil ${perfilClass}" style="font-size:0.65rem;">${u.perfil}</span></td>
                    <td><span class="badge-perfil status-ativo" style="font-size:0.65rem;"><i class="fas fa-circle"></i> Ativo</span></td>
                    <td>
                        ${u.perfil === "ADMIN" ? `<button class="btn-editar-usuario" data-id="${u.id}" style="padding:4px;"><i class="fas fa-edit"></i></button>` : ""}
                        ${u.id !== this.sistema.usuarioAtual?.id && u.perfil !== "ADMIN" ? `<button class="btn-desativar-usuario" data-id="${u.id}" style="padding:4px;"><i class="fas fa-trash"></i></button>` : ""}
                    </td>
                </tr>
            `;
      })
      .join("");
    document.querySelectorAll(".btn-editar-usuario").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        this.abrirModal(id);
      });
    });
    document.querySelectorAll(".btn-desativar-usuario").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        this.desativarUsuario(id);
      });
    });
  }

  async abrirModal(id = null) {
    if (this.sistema.usuarioAtual?.perfil !== "ADMIN") {
      this.sistema.ui.mostrarToast("erro", "Apenas administradores");
      return;
    }
    const modal = document.getElementById("modalUsuario");
    const titulo = document.getElementById("modalUsuarioTitulo");
    titulo.innerHTML = id
      ? '<i class="fas fa-edit"></i> Editar Usuário'
      : '<i class="fas fa-user-plus"></i> Novo Usuário';

    const form = document.getElementById("formUsuario");
    form.innerHTML = this.gerarFormUsuario(id);
    await this.sistema.ui.carregarSelectOrgaos(
      "usuarioOrgao",
      id ? null : this.sistema.usuarioAtual?.orgao_id,
    );

    if (id) {
      const { data: u } = await supabase
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
        await this.sistema.ui.carregarSelectOrgaos("usuarioOrgao", u.orgao_id);
      }
    }

    form.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        this.salvarUsuario();
      },
      { once: true },
    );

    document
      .getElementById("btnCancelarUsuario")
      .addEventListener("click", () => {
        modal.classList.remove("active");
      });

    modal.classList.add("active");
  }

  gerarFormUsuario(id) {
    return `
            <input type="hidden" id="usuarioId" value="${id || ""}">
            <div class="form-group">
                <label>Nome</label>
                <input type="text" id="usuarioNome" class="filtro-input" required>
            </div>
            <div class="form-group">
                <label>E-mail</label>
                <input type="email" id="usuarioEmail" class="filtro-input" required>
            </div>
            <div class="form-group">
                <label>Senha</label>
                <input type="password" id="usuarioSenha" class="filtro-input" placeholder="Mínimo 6" ${id ? "" : "required"}>
            </div>
            <div class="form-group">
                <label>Órgão</label>
                <select id="usuarioOrgao" class="filtro-select" required></select>
            </div>
            <div class="form-group">
                <label>Perfil</label>
                <select id="usuarioPerfil" class="filtro-select">
                    <option value="ADMIN">Administrador</option>
                    <option value="SECRETARIO">Secretário</option>
                    <option value="SOLICITANTE">Solicitante</option>
                    <option value="ESTAGIARIO">Estagiário</option>
                </select>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button type="button" id="btnCancelarUsuario" style="background: var(--neutral-200); padding: 8px 16px; border: none; border-radius: var(--border-radius-md);">Cancelar</button>
                <button type="submit" style="background: var(--primary-600); color: white; padding: 8px 16px; border: none; border-radius: var(--border-radius-md);"><i class="fas fa-save"></i> Salvar</button>
            </div>
        `;
  }

  async salvarUsuario() {
    const id = document.getElementById("usuarioId").value;
    const nome = document.getElementById("usuarioNome").value;
    const email = document.getElementById("usuarioEmail").value;
    const senha = document.getElementById("usuarioSenha").value;
    const orgaoId = parseInt(document.getElementById("usuarioOrgao").value);
    const perfil = document.getElementById("usuarioPerfil").value;

    if (!nome || !email || !orgaoId) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Preencha todos os campos obrigatórios",
      );
      return;
    }

    try {
      if (id) {
        const { error } = await supabase
          .from("usuarios")
          .update({ nome, email, perfil, orgao_id: orgaoId })
          .eq("id", id);
        if (error) throw error;
        this.sistema.ui.mostrarToast("sucesso", "Usuário atualizado!");
      } else {
        if (!senha || senha.length < 6) {
          this.sistema.ui.mostrarToast(
            "erro",
            "Senha deve ter no mínimo 6 caracteres",
          );
          return;
        }
        const { data: authData, error: authError } = await supabase.auth.signUp(
          {
            email,
            password: senha,
            options: { data: { name: nome } },
          },
        );
        if (authError) throw authError;
        const { error } = await supabase.from("usuarios").insert({
          uuid: authData.user.id,
          nome,
          email,
          perfil,
          orgao_id: orgaoId,
          ativo: true,
        });
        if (error) throw error;
        this.sistema.ui.mostrarToast("sucesso", "Usuário criado!");
      }
      this.sistema.fecharModalUsuario();
      await this.carregarTabela();
    } catch (error) {
      this.sistema.ui.mostrarToast("erro", error.message);
    }
  }

  async desativarUsuario(id) {
    const confirmado = await this.sistema.confirmar("Desativar usuário?");
    if (confirmado) {
      await supabase.from("usuarios").update({ ativo: false }).eq("id", id);
      await this.carregarTabela();
      this.sistema.ui.mostrarToast("sucesso", "Usuário desativado");
    }
  }
}
