const tarefasModule = {
  async init() {
    const response = await fetch("pages/tarefas.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
    this.setupFilters();
  },
  async render(filtros = {}) {
    const tarefas = await API.getTarefas();
    const processos = await API.getProcessos();

    let filtered = tarefas;
    if (filtros.responsavel && filtros.responsavel !== "todos") {
      filtered = filtered.filter((t) => t.responsavel === filtros.responsavel);
    }
    if (filtros.setor && filtros.setor !== "todos") {
      filtered = filtered.filter((t) => t.setor === filtros.setor);
    }
    if (filtros.status && filtros.status !== "todos") {
      filtered = filtered.filter((t) => t.status === filtros.status);
    }

    const tbody = document.getElementById("tarefas-table-body");
    tbody.innerHTML = filtered
      .map((t) => {
        const processo = processos.find((p) => p.id === t.processoId);
        return `
                <tr>
                    <td>${t.descricao}</td>
                    <td>${processo ? processo.numero : ""}</td>
                    <td>${t.fase}</td>
                    <td>${t.responsavel}</td>
                    <td>${t.prazo}</td>
                    <td><span class="status-badge status-${t.status}">${t.status}</span></td>
                </tr>
            `;
      })
      .join("");

    this.populateFilterOptions(tarefas);
  },
  populateFilterOptions(tarefas) {
    const responsaveis = [...new Set(tarefas.map((t) => t.responsavel))];
    const setores = [...new Set(tarefas.map((t) => t.setor))];
    const status = [...new Set(tarefas.map((t) => t.status))];

    const selectResponsavel = document.getElementById(
      "filter-tarefa-responsavel",
    );
    selectResponsavel.innerHTML =
      '<option value="todos">Todos</option>' +
      responsaveis.map((r) => `<option value="${r}">${r}</option>`).join("");

    const selectSetor = document.getElementById("filter-tarefa-setor");
    selectSetor.innerHTML =
      '<option value="todos">Todos</option>' +
      setores.map((s) => `<option value="${s}">${s}</option>`).join("");

    const selectStatus = document.getElementById("filter-tarefa-status");
    selectStatus.innerHTML =
      '<option value="todos">Todos</option>' +
      status.map((s) => `<option value="${s}">${s}</option>`).join("");
  },
  setupFilters() {
    document
      .getElementById("filter-tarefa-responsavel")
      .addEventListener("change", () => this.applyFilters());
    document
      .getElementById("filter-tarefa-setor")
      .addEventListener("change", () => this.applyFilters());
    document
      .getElementById("filter-tarefa-status")
      .addEventListener("change", () => this.applyFilters());
    document
      .getElementById("btn-limpar-filtros-tarefas")
      .addEventListener("click", () => this.clearFilters());
  },
  applyFilters() {
    const filtros = {
      responsavel: document.getElementById("filter-tarefa-responsavel").value,
      setor: document.getElementById("filter-tarefa-setor").value,
      status: document.getElementById("filter-tarefa-status").value,
    };
    this.render(filtros);
  },
  clearFilters() {
    document.getElementById("filter-tarefa-responsavel").value = "todos";
    document.getElementById("filter-tarefa-setor").value = "todos";
    document.getElementById("filter-tarefa-status").value = "todos";
    this.render();
  },
};

window.tarefasModule = tarefasModule;
