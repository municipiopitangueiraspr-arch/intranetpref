const usuariosModule = {
  async init() {
    const response = await fetch("pages/usuarios.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
  },
  async render() {
    const usuarios = await API.getUsuarios();
    const setores = await API.getSetores();

    const tbody = document.getElementById("usuarios-table-body");
    tbody.innerHTML = usuarios
      .map((u) => {
        const setor = setores.find((s) => s.id === u.setorId);
        return `
                <tr>
                    <td>${u.nome}</td>
                    <td>${u.email}</td>
                    <td>${setor ? setor.nome : ""}</td>
                    <td>${u.perfil}</td>
                    <td><span class="status-badge ${u.ativo ? "status-saudavel" : "status-parado"}">${u.ativo ? "Ativo" : "Inativo"}</span></td>
                </tr>
            `;
      })
      .join("");
  },
};

window.usuariosModule = usuariosModule;
