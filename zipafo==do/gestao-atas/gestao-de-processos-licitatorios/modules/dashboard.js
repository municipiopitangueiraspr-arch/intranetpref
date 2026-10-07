const dashboardModule = {
  async init() {
    const response = await fetch("pages/dashboard.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
  },
  async render() {
    const processos = await API.getProcessos();
    const tarefas = await API.getTarefas();

    const saudaveis = processos.filter((p) => p.saude === "saudavel").length;
    const atencao = processos.filter((p) => p.saude === "atencao").length;
    const criticos = processos.filter((p) => p.saude === "critico").length;
    const parados = processos.filter((p) => p.saude === "parado").length;

    document.getElementById("card-saudaveis").innerText = saudaveis;
    document.getElementById("card-atencao").innerText = atencao;
    document.getElementById("card-criticos").innerText = criticos;
    document.getElementById("card-parados").innerText = parados;

    const processosCriticos = processos.filter((p) => p.saude === "critico");
    const listaCriticos = document.getElementById("lista-processos-criticos");
    listaCriticos.innerHTML = processosCriticos
      .map(
        (p) => `
            <tr>
                <td>${p.numero}</td>
                <td>${p.objeto}</td>
                <td>${p.modalidade}</td>
                <td><span class="status-badge status-critico">Crítico</span></td>
            </tr>
        `,
      )
      .join("");

    const tarefasPendentes = tarefas.filter((t) => t.status !== "concluida");
    const listaTarefas = document.getElementById("lista-tarefas-pendentes");
    listaTarefas.innerHTML = tarefasPendentes
      .map((t) => {
        const processo = processos.find((p) => p.id === t.processoId);
        return `
                <tr>
                    <td>${t.descricao}</td>
                    <td>${processo ? processo.numero : ""}</td>
                    <td>${t.responsavel}</td>
                    <td>${t.prazo}</td>
                    <td><span class="status-badge status-atencao">Pendente</span></td>
                </tr>
            `;
      })
      .join("");
  },
};

window.dashboardModule = dashboardModule;
