const processosModule = {
  async init() {
    const response = await fetch("pages/processos.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
    this.setupFilters();
    this.setupNewProcesso();
  },
  async render(filtros = {}) {
    const processos = await API.getProcessos();
    let filtered = processos;
    if (filtros.modalidade && filtros.modalidade !== "todos") {
      filtered = filtered.filter((p) => p.modalidade === filtros.modalidade);
    }
    if (filtros.fase && filtros.fase !== "todos") {
      filtered = filtered.filter((p) => p.faseAtual === filtros.fase);
    }
    if (filtros.responsavel && filtros.responsavel !== "todos") {
      filtered = filtered.filter((p) => p.responsavel === filtros.responsavel);
    }

    const tbody = document.getElementById("processos-table-body");
    tbody.innerHTML = filtered
      .map(
        (p) => `
            <tr>
                <td>${p.numero}</td>
                <td>${p.objeto}</td>
                <td>${p.modalidade}</td>
                <td>${p.faseAtual}</td>
                <td>${p.responsavel}</td>
                <td><span class="status-badge status-${p.saude}">${p.saude}</span></td>
                <td>${new Date(p.dataCriacao).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm" onclick="processosModule.verProcesso(${p.id})">Ver</button>
                    <button class="btn btn-sm btn-primary" onclick="processosModule.editarProcesso(${p.id})">Editar</button>
                </td>
            </tr>
        `,
      )
      .join("");

    this.populateFilterOptions(processos);
  },
  populateFilterOptions(processos) {
    const modalidades = [...new Set(processos.map((p) => p.modalidade))];
    const fases = [...new Set(processos.map((p) => p.faseAtual))];
    const responsaveis = [...new Set(processos.map((p) => p.responsavel))];

    const selectModalidade = document.getElementById("filter-modalidade");
    selectModalidade.innerHTML =
      '<option value="todos">Todas</option>' +
      modalidades.map((m) => `<option value="${m}">${m}</option>`).join("");

    const selectFase = document.getElementById("filter-fase");
    selectFase.innerHTML =
      '<option value="todos">Todas</option>' +
      fases.map((f) => `<option value="${f}">${f}</option>`).join("");

    const selectResponsavel = document.getElementById("filter-responsavel");
    selectResponsavel.innerHTML =
      '<option value="todos">Todos</option>' +
      responsaveis.map((r) => `<option value="${r}">${r}</option>`).join("");
  },
  setupFilters() {
    document
      .getElementById("filter-modalidade")
      .addEventListener("change", () => this.applyFilters());
    document
      .getElementById("filter-fase")
      .addEventListener("change", () => this.applyFilters());
    document
      .getElementById("filter-responsavel")
      .addEventListener("change", () => this.applyFilters());
    document
      .getElementById("btn-limpar-filtros")
      .addEventListener("click", () => this.clearFilters());
  },
  applyFilters() {
    const filtros = {
      modalidade: document.getElementById("filter-modalidade").value,
      fase: document.getElementById("filter-fase").value,
      responsavel: document.getElementById("filter-responsavel").value,
    };
    this.render(filtros);
  },
  clearFilters() {
    document.getElementById("filter-modalidade").value = "todos";
    document.getElementById("filter-fase").value = "todos";
    document.getElementById("filter-responsavel").value = "todos";
    this.render();
  },
  setupNewProcesso() {
    document
      .getElementById("btn-novo-processo")
      .addEventListener("click", () => {
        alert("Funcionalidade de criar processo (abriria um modal)");
      });
  },
  verProcesso(id) {
    window.location.hash = `#/processo/${id}`;
  },
  editarProcesso(id) {
    alert(`Editar processo ${id}`);
  },
};

window.processosModule = processosModule;
