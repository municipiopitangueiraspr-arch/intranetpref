const configuracoesModule = {
  async init() {
    const response = await fetch("pages/configuracoes.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
  },
};

window.configuracoesModule = configuracoesModule;
