const modelosModule = {
  async init() {
    const response = await fetch("pages/modelos.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render();
  },
  async render() {
    const modelos = await API.getModelos();
    const grupos = modelos.reduce((acc, m) => {
      if (!acc[m.tipo]) acc[m.tipo] = [];
      acc[m.tipo].push(m);
      return acc;
    }, {});

    const container = document.getElementById("modelos-container");
    container.innerHTML = Object.entries(grupos)
      .map(
        ([tipo, lista]) => `
            <div class="card">
                <h3>${tipo}</h3>
                <ul>
                    ${lista.map((m) => `<li><a href="#">${m.nome}</a></li>`).join("")}
                </ul>
            </div>
        `,
      )
      .join("");
  },
};

window.modelosModule = modelosModule;
