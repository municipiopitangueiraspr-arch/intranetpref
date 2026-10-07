const setoresModule = {
  async init() {
    const response = await fetch("pages/setores.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
  },
  async render() {
    const setores = await API.getSetores();
    const tbody = document.getElementById("setores-table-body");
    tbody.innerHTML = setores
      .map(
        (s) => `
            <tr>
                <td>${s.nome}</td>
                <td>${s.descricao}</td>
                <td>${s.usuarios ? s.usuarios.length : 0}</td>
            </tr>
        `,
      )
      .join("");
  },
};

window.setoresModule = setoresModule;
