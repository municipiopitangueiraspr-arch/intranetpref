const processoDetalheModule = {
  async init(id) {
    if (!id) {
      window.location.hash = "#/processos";
      return;
    }
    const response = await fetch("pages/processo-detalhe.html");
    const html = await response.text();
    document.getElementById("page-content").innerHTML = html;
    this.render(id);
  },
  async render(id) {
    const processo = await API.getProcessoById(parseInt(id));
    if (!processo) {
      alert("Processo não encontrado");
      window.location.hash = "#/processos";
      return;
    }

    document.getElementById("detalhe-numero").innerText = processo.numero;
    document.getElementById("detalhe-objeto").innerText = processo.objeto;
    document.getElementById("detalhe-modalidade").innerText =
      processo.modalidade;
    document.getElementById("detalhe-secretaria").innerText =
      processo.secretaria;
    document.getElementById("detalhe-valor").innerText =
      processo.valorEstimado.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    document.getElementById("detalhe-status").innerHTML =
      `<span class="status-badge status-${processo.saude}">${processo.saude}</span>`;

    const fases = processo.fases || [];
    const timeline = document.getElementById("timeline");
    timeline.innerHTML = fases
      .map(
        (f) => `
            <div class="timeline-step ${f.status}">${f.nome}</div>
        `,
      )
      .join("");

    const tarefas = await API.getTarefasByProcesso(processo.id);
    const tarefasFase = tarefas.filter((t) => t.fase === processo.faseAtual);
    const listaTarefas = document.getElementById("lista-tarefas-fase");
    listaTarefas.innerHTML = tarefasFase
      .map(
        (t) => `
            <tr>
                <td>${t.descricao}</td>
                <td>${t.responsavel}</td>
                <td>${t.prazo}</td>
                <td><span class="status-badge status-${t.status}">${t.status}</span></td>
            </tr>
        `,
      )
      .join("");
  },
};

window.processoDetalheModule = processoDetalheModule;
