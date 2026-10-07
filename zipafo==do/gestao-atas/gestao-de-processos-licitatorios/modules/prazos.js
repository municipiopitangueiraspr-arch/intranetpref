const prazosModule = {
  async init() {
    const response = await fetch("pages/prazos.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
  },
  async render() {
    const prazos = await API.getPrazos();
    const processos = await API.getProcessos();

    const tbody = document.getElementById("prazos-table-body");
    tbody.innerHTML = prazos
      .map((p) => {
        const processo = processos.find((proc) => proc.id === p.processoId);
        const hoje = new Date();
        const dataLimite = new Date(p.dataLimite);
        const diff = Math.ceil((dataLimite - hoje) / (1000 * 60 * 60 * 24));
        let statusClass = "";
        if (diff < 0) statusClass = "status-critico";
        else if (diff <= 3) statusClass = "status-atencao";
        else statusClass = "status-saudavel";

        return `
                <tr>
                    <td>${processo ? processo.numero : ""}</td>
                    <td>${p.descricao}</td>
                    <td>${new Date(p.dataInicio).toLocaleDateString()}</td>
                    <td>${new Date(p.dataLimite).toLocaleDateString()}</td>
                    <td><span class="status-badge ${statusClass}">${diff < 0 ? "Vencido" : diff <= 3 ? "Próximo" : "Normal"}</span></td>
                </tr>
            `;
      })
      .join("");
  },
};

window.prazosModule = prazosModule;
