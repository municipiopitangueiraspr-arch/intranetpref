const fluxosModule = {
  async init() {
    const response = await fetch("pages/fluxos.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
  },
  async render() {
    const fluxos = await API.getFluxos();
    const container = document.getElementById("fluxos-list");
    container.innerHTML = fluxos
      .map(
        (f) => `
            <div class="card">
                <h3>${f.nome}</h3>
                <p>${f.descricao}</p>
                <h4>Fases:</h4>
                <ul>
                    ${f.fases.map((fase) => `<li>${fase.nome} - ${fase.prazo} dias</li>`).join("")}
                </ul>
            </div>
        `,
      )
      .join("");
  },
};

window.fluxosModule = fluxosModule;
