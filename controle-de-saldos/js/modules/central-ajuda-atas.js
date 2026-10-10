// Central de Ajuda · módulo SPA integrado ao shell de Consulta.
export class CentralAjudaAtas {
  constructor(sistema) {
    this.sistema = sistema;
    this._carregado = false;
    this._html = null;
  }

  async carregarConteudo() {
    const container = document.getElementById("faqContent");
    if (!container) return;
    if (!this._carregado) {
      try {
        if (!this._html) {
          const resposta = await fetch("templates/central-ajuda-atas.html?v=20261008-central-ajuda-5", { cache: "no-store" });
          if (!resposta.ok) throw new Error(`Central de ajuda: HTTP ${resposta.status}`);
          this._html = await resposta.text();
        }
        container.innerHTML = this._html;
        this._ligarEventos(container);
        this._carregado = true;
      } catch (erro) {
        console.error("[CentralAjudaAtas] falha ao carregar conteúdo", erro);
        container.innerHTML = `<section class="central-ajuda-vazio" role="alert"><strong>Não foi possível carregar a Central de Ajuda.</strong><span>Atualize a página e tente novamente.</span></section>`;
      }
    }
  }

  _ligarEventos(container) {
    const busca = container.querySelector("#centralAjudaBusca");
    const modulo = container.querySelector("#centralAjudaModulo");
    const contagem = container.querySelector("#centralAjudaContagem");
    const vazio = container.querySelector("#centralAjudaVazio");
    const secoes = [...container.querySelectorAll("[data-ajuda-secao]")];
    const itens = [...container.querySelectorAll(".central-ajuda-item")];

    const filtrar = () => {
      const termo = (busca?.value || "").trim().toLocaleLowerCase("pt-BR");
      const moduloSelecionado = modulo?.value || "todos";
      let visiveis = 0;
      secoes.forEach((secao) => {
        const pertenceAoModulo = moduloSelecionado === "todos" || secao.dataset.ajudaSecao === moduloSelecionado;
        let itensVisiveis = 0;
        secao.querySelectorAll(".central-ajuda-item").forEach((item) => {
          const texto = item.textContent.toLocaleLowerCase("pt-BR");
          const corresponde = pertenceAoModulo && (!termo || texto.includes(termo));
          item.hidden = !corresponde;
          if (corresponde) itensVisiveis += 1;
        });
        secao.hidden = !pertenceAoModulo || itensVisiveis === 0;
        if (!secao.hidden) visiveis += itensVisiveis;
      });
      if (contagem) contagem.textContent = `${visiveis} ${visiveis === 1 ? "orientação encontrada" : "orientações encontradas"}`;
      if (vazio) vazio.hidden = visiveis !== 0;
    };

    busca?.addEventListener("input", filtrar);
    modulo?.addEventListener("change", filtrar);
    container.querySelectorAll("[data-ajuda-modulo]").forEach((botao) => {
      botao.addEventListener("click", () => {
        if (modulo) modulo.value = botao.dataset.ajudaModulo;
        container.querySelectorAll("[data-ajuda-modulo]").forEach((item) => item.classList.toggle("ajuda-ativo", item === botao));
        filtrar();
        container.querySelector(`[data-ajuda-secao="${botao.dataset.ajudaModulo}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    container.querySelectorAll('[data-ajuda-action="limpar"]').forEach((botao) => botao.addEventListener("click", () => {
      if (busca) busca.value = "";
      if (modulo) modulo.value = "todos";
      container.querySelectorAll("[data-ajuda-modulo]").forEach((item) => item.classList.remove("ajuda-ativo"));
      filtrar();
    }));
    container.querySelectorAll('[data-ajuda-action="imprimir"]').forEach((botao) => botao.addEventListener("click", () => this._baixarGuiaPdf(botao)));
    itens.forEach((item) => item.addEventListener("toggle", () => {
      if (item.open) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
    filtrar();
  }

  async _baixarGuiaPdf(botao) {
    const texto = botao?.querySelector("span");
    const textoOriginal = texto?.textContent || "Baixar guia PDF";
    if (botao) {
      botao.disabled = true;
      botao.setAttribute("aria-busy", "true");
    }
    if (texto) texto.textContent = "Gerando guia...";

    try {
      const resposta = await fetch("templates/central-ajuda-atas-guia.pdf?v=20261008-guia-completo-1", { cache: "no-store" });
      if (!resposta.ok) throw new Error(`Guia PDF: HTTP ${resposta.status}`);
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "guia-gestao-atas-saldos-pedidos.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (erro) {
      console.error("[CentralAjudaAtas] falha ao gerar guia PDF", erro);
      window.alert("Não foi possível gerar o guia PDF agora. Atualize a página e tente novamente.");
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.removeAttribute("aria-busy");
      }
      if (texto) texto.textContent = textoOriginal;
    }
  }
}
