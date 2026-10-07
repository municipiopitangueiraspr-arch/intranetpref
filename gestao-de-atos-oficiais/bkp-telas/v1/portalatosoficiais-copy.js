// ============================================
// portal-atos-oficiais.js
// Portal Público de Atos Oficiais
// Integração real com Supabase (dados públicos)
// Inclui: paginação/filtros server-side, visualização enriquecida
// com relacionamentos e alterações, download real de PDF do Storage,
// gráficos com Chart.js para estatísticas, acessibilidade e SEO.
// ============================================

import { supabase } from "../../supabase.js";

// ========== VARIÁVEIS DE ESTADO ==========
let orgaos = [];
let tiposAto = [];
let paginaAtual = 1;
const itensPorPagina = 10;
let filtrosAtuais = {
  texto: "",
  tipo: "",
  ano: "",
  orgao: "",
  status: "",
};
let totalResultadosBusca = 0;
let currentAtoId = null; // para download do PDF

// Instâncias dos gráficos (Chart.js)
let chartTiposInstance = null;
let chartAnosInstance = null;

// ========== UTILITÁRIOS ==========
function showNotification(type, title, message, duration = 4000) {
  const container = document.getElementById("notificationContainer");
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `notification-toast notification-${type}`;
  toast.innerHTML = `
    <span class="notification-icon">${icons[type]}</span>
    <div class="notification-content">
      <div class="notification-title">${title}</div>
      <div class="notification-message">${message}</div>
    </div>
    <button class="notification-close">✕</button>
  `;
  container.appendChild(toast);
  const closeBtn = toast.querySelector(".notification-close");
  closeBtn.addEventListener("click", () => toast.remove());
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, duration);
  }
}

function formatarData(data) {
  if (!data) return "—";
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// ========== CARGA DE DADOS BÁSICOS ==========
async function carregarOrgaos() {
  const { data, error } = await supabase
    .from("orgaos")
    .select("id, nome, tipo, ativo")
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("Erro ao carregar órgãos:", error);
    return [];
  }
  orgaos = data || [];
  return orgaos;
}

async function carregarTiposAto() {
  const { data, error } = await supabase
    .from("tipos_ato")
    .select("id, nome, sigla, ativo")
    .eq("ativo", true)
    .order("ordem");
  if (error) {
    console.error("Erro ao carregar tipos de ato:", error);
    return [];
  }
  tiposAto = data || [];
  return tiposAto;
}

// ========== POPULAR SELECTS ==========
function popularSelectTipos() {
  const select = document.getElementById("buscaTipo");
  if (!select) return;
  select.innerHTML = '<option value="">Todos os tipos</option>';
  tiposAto.forEach((t) => {
    select.innerHTML += `<option value="${t.id}">${t.nome} (${t.sigla})</option>`;
  });
}

function popularSelectOrgaos() {
  const select = document.getElementById("buscaOrgao");
  if (!select) return;
  select.innerHTML = '<option value="">Todos os órgãos</option>';
  orgaos.forEach((o) => {
    select.innerHTML += `<option value="${o.id}">${o.nome}</option>`;
  });
}

async function carregarAnosDisponiveis() {
  const { data, error } = await supabase
    .from("atos_oficiais")
    .select("ano", { distinct: true })
    .order("ano", { ascending: false });
  if (error) return;
  const select = document.getElementById("buscaAno");
  if (!select) return;
  select.innerHTML = '<option value="">Todos os anos</option>';
  if (data) {
    data.forEach((item) => {
      select.innerHTML += `<option value="${item.ano}">${item.ano}</option>`;
    });
  }
}

// ========== HOME ==========
async function carregarHome() {
  await Promise.all([
    carregarHomeStats(),
    carregarAtosRecentes(),
    carregarOrgaosDestaque(),
  ]);
}

async function carregarHomeStats() {
  const { count: total } = await supabase
    .from("atos_oficiais")
    .select("*", { count: "exact", head: true });
  const { count: vigentes } = await supabase
    .from("atos_oficiais")
    .select("*", { count: "exact", head: true })
    .eq("status", "Vigente");
  const { data: ultimaAtualizacao } = await supabase
    .from("atos_oficiais")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  document.getElementById("homeTotalAtos").textContent = total || 0;
  document.getElementById("homeVigentes").textContent = vigentes || 0;
  document.getElementById("homeOrgaos").textContent = orgaos.length;
  document.getElementById("homeAtualizacao").textContent = ultimaAtualizacao
    ? formatarData(ultimaAtualizacao.updated_at?.split("T")[0])
    : "Hoje";
}

async function carregarAtosRecentes() {
  const grid = document.getElementById("atosRecentesGrid");
  grid.innerHTML = `<div class="loading-placeholder"><div class="loading-spinner"></div><p>Carregando atos recentes…</p></div>`;

  const { data, error } = await supabase
    .from("atos_oficiais")
    .select(
      `id, numero, ano, ementa, status, data_publicacao, edicao_diario, pagina_diario, tipo_id, orgao_id,
      tipos_ato (nome, sigla),
      orgaos (nome)`,
    )
    .order("data_publicacao", { ascending: false })
    .limit(6);

  if (error) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Erro ao carregar atos recentes.</p></div>`;
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><p>Nenhum ato publicado recentemente.</p></div>`;
    return;
  }

  grid.innerHTML = data
    .map(
      (ato) => `
    <div class="ato-card ${ato.status === "Revogado" ? "row-revogado" : ""}"
         onclick="visualizarAtoPublico(${ato.id})">
      <div class="ato-card-tipo">${ato.tipos_ato?.sigla || "?"}</div>
      <div class="ato-card-numero">${ato.numero}/${ato.ano}</div>
      <div class="ato-card-ementa">${ato.ementa}</div>
      <div class="ato-card-meta">
        <span class="ato-card-orgao">${ato.orgaos?.nome || "Sem órgão"}</span>
        <span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span>
        <span>📅 ${formatarData(ato.data_publicacao)}</span>
      </div>
    </div>`,
    )
    .join("");
}

async function carregarOrgaosDestaque() {
  const grid = document.getElementById("orgaosGridHome");
  const orgaosDestaque = orgaos.slice(0, 6);
  if (!orgaosDestaque.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-icon">🏛️</span><p>Nenhum órgão cadastrado.</p></div>`;
    return;
  }

  // Obter contagem de atos por órgão (paralelo)
  const counts = {};
  await Promise.all(
    orgaosDestaque.map(async (org) => {
      const { count } = await supabase
        .from("atos_oficiais")
        .select("*", { count: "exact", head: true })
        .eq("orgao_id", org.id);
      counts[org.id] = count || 0;
    }),
  );

  grid.innerHTML = orgaosDestaque
    .map(
      (o) => `
    <div class="orgao-card" onclick="navegarSecao('orgaos')">
      <div class="orgao-card-icon"><i class="fas fa-building"></i></div>
      <div class="orgao-card-nome">${o.nome}</div>
      <div class="orgao-card-tipo">${o.tipo || "Órgão"}</div>
      <div class="orgao-card-atos">📄 ${counts[o.id] || 0} ato(s)</div>
    </div>`,
    )
    .join("");
}

// ========== BUSCA AVANÇADA (server-side) ==========
function coletarFiltros() {
  filtrosAtuais.texto = document.getElementById("buscaTexto")?.value || "";
  filtrosAtuais.tipo = document.getElementById("buscaTipo")?.value || "";
  filtrosAtuais.ano = document.getElementById("buscaAno")?.value || "";
  filtrosAtuais.orgao = document.getElementById("buscaOrgao")?.value || "";
  filtrosAtuais.status = document.getElementById("buscaStatus")?.value || "";
}

async function aplicarFiltrosBusca(pagina = 1) {
  coletarFiltros();
  paginaAtual = pagina;
  const container = document.getElementById("resultadosBusca");
  container.innerHTML = `<div class="loading-placeholder"><div class="loading-spinner"></div><p>Buscando atos…</p></div>`;

  let query = supabase
    .from("atos_oficiais")
    .select(
      `id, numero, ano, ementa, status, data_publicacao,
      edicao_diario, pagina_diario, pdf_url,
      tipo_id, orgao_id,
      tipos_ato (nome, sigla),
      orgaos (nome)`,
      { count: "exact" },
    )
    .order("data_publicacao", { ascending: false });

  // Filtros
  if (filtrosAtuais.texto) {
    const termo = `%${filtrosAtuais.texto}%`;
    query = query.or(`ementa.ilike.${termo},numero::text.ilike.${termo}`);
  }
  if (filtrosAtuais.tipo) {
    query = query.eq("tipo_id", parseInt(filtrosAtuais.tipo));
  }
  if (filtrosAtuais.ano) {
    query = query.eq("ano", parseInt(filtrosAtuais.ano));
  }
  if (filtrosAtuais.orgao) {
    query = query.eq("orgao_id", parseInt(filtrosAtuais.orgao));
  }
  if (filtrosAtuais.status) {
    query = query.eq("status", filtrosAtuais.status);
  }

  // Paginação server-side
  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina - 1;
  query = query.range(inicio, fim);

  const { data, error, count } = await query;

  if (error) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Erro ao buscar atos.</p></div>`;
    return;
  }

  totalResultadosBusca = count || 0;
  document.getElementById("resultadosInfo").textContent =
    `Total: ${totalResultadosBusca} resultado(s)`;

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🔍</span><p>Nenhum ato encontrado com os filtros informados.</p></div>`;
    atualizarPaginacaoBusca();
    return;
  }

  container.innerHTML = data
    .map(
      (ato) => `
    <div class="resultado-item" onclick="visualizarAtoPublico(${ato.id})">
      <div class="resultado-header">
        <div class="resultado-tipo-numero ${ato.status === "Revogado" ? "row-revogado" : ""}">
          ${ato.tipos_ato?.nome || "Ato"} nº ${ato.numero}/${ato.ano}
        </div>
        <span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span>
      </div>
      <div class="resultado-ementa ${ato.status === "Revogado" ? "row-revogado" : ""}">
        ${ato.ementa}
      </div>
      <div class="resultado-meta">
        <span>🏛️ ${ato.orgaos?.nome || "Sem órgão"}</span>
        <span>📅 ${formatarData(ato.data_publicacao)}</span>
        ${ato.edicao_diario ? `<span>📰 Ed. ${ato.edicao_diario}</span>` : ""}
        <span>📥 <a href="#" onclick="event.stopPropagation(); downloadPDF(${ato.id});">Baixar PDF</a></span>
      </div>
    </div>`,
    )
    .join("");

  atualizarPaginacaoBusca();
}

function atualizarPaginacaoBusca() {
  const totalPaginas = Math.ceil(totalResultadosBusca / itensPorPagina) || 1;
  document.getElementById("pageInfoBusca").textContent =
    `Página ${paginaAtual} de ${totalPaginas}`;
  document.getElementById("btnPagAnterior").disabled = paginaAtual <= 1;
  document.getElementById("btnPagProximo").disabled =
    paginaAtual >= totalPaginas;
  document.getElementById("paginationBusca").style.display =
    totalResultadosBusca > itensPorPagina ? "flex" : "none";
}

function limparFiltrosBusca() {
  document.getElementById("buscaTexto").value = "";
  document.getElementById("buscaTipo").value = "";
  document.getElementById("buscaAno").value = "";
  document.getElementById("buscaOrgao").value = "";
  document.getElementById("buscaStatus").value = "";
  aplicarFiltrosBusca(1);
}

// ========== ÓRGÃOS (SEÇÃO COMPLETA) ==========
async function carregarSecaoOrgaos() {
  const container = document.getElementById("orgaosListaCompleta");
  if (!orgaos.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🏛️</span><p>Nenhum órgão cadastrado.</p></div>`;
    return;
  }

  let html = "";
  for (const org of orgaos) {
    const { count } = await supabase
      .from("atos_oficiais")
      .select("*", { count: "exact", head: true })
      .eq("orgao_id", org.id);
    const countAtos = count || 0;

    const { data: ultimosAtos } = await supabase
      .from("atos_oficiais")
      .select("id, numero, ano, ementa, tipo_id, tipos_ato (nome, sigla)")
      .eq("orgao_id", org.id)
      .order("data_publicacao", { ascending: false })
      .limit(3);

    html += `
      <div class="orgao-card" style="text-align: left; padding: 24px;">
        <div class="orgao-card-icon" style="text-align: center;"><i class="fas fa-building"></i></div>
        <div class="orgao-card-nome" style="text-align: center;">${org.nome}</div>
        <div class="orgao-card-tipo" style="text-align: center;">${org.tipo || "Órgão"} • ✅ Ativo</div>
        <div class="orgao-card-atos" style="text-align: center;">📄 ${countAtos} ato(s) publicados</div>
        ${
          ultimosAtos && ultimosAtos.length > 0
            ? `
          <div style="margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            <small style="color: #718096;">Últimos atos:</small>
            ${ultimosAtos
              .map(
                (a) => `
              <div style="margin-top: 6px; font-size: 13px; cursor: pointer;" onclick="visualizarAtoPublico(${a.id})">
                📄 ${a.tipos_ato?.sigla || "?"} ${a.numero}/${a.ano} - ${
                  a.ementa.length > 50
                    ? a.ementa.substring(0, 50) + "..."
                    : a.ementa
                }
              </div>`,
              )
              .join("")}
          </div>`
            : ""
        }
      </div>
    `;
  }
  container.innerHTML = html;
}

// ========== ESTATÍSTICAS (COM CHART.JS) ==========
async function carregarEstatisticas() {
  // Buscar até 5000 registros para processamento local
  const { data: atos, error } = await supabase
    .from("atos_oficiais")
    .select("id, tipo_id, ano, status, tipos_ato (nome)")
    .limit(5000);

  if (error) {
    showNotification("error", "Erro", "Falha ao carregar estatísticas.");
    return;
  }

  if (!atos || atos.length === 0) {
    document.getElementById("estatTotal").textContent = "0";
    document.getElementById("estatVigentes").textContent = "0";
    document.getElementById("estatRevogados").textContent = "0";
    document.getElementById("estatAlterados").textContent = "0";
    // Limpar gráficos
    if (chartTiposInstance) chartTiposInstance.destroy();
    if (chartAnosInstance) chartAnosInstance.destroy();
    document.getElementById("chartTiposFallback").textContent = "Sem dados.";
    document.getElementById("chartAnosFallback").textContent = "Sem dados.";
    return;
  }

  const total = atos.length;
  const vigentes = atos.filter((a) => a.status === "Vigente").length;
  const revogados = atos.filter((a) => a.status === "Revogado").length;
  const alterados = atos.filter((a) => a.status === "Alterado").length;

  document.getElementById("estatTotal").textContent = total;
  document.getElementById("estatVigentes").textContent = vigentes;
  document.getElementById("estatRevogados").textContent = revogados;
  document.getElementById("estatAlterados").textContent = alterados;

  // Construir dados para gráficos
  // Distribuição por tipo
  const tipoCounts = {};
  atos.forEach((a) => {
    const nome = a.tipos_ato?.nome || "Outros";
    tipoCounts[nome] = (tipoCounts[nome] || 0) + 1;
  });
  const tiposOrdenados = Object.entries(tipoCounts).sort((a, b) => b[1] - a[1]);
  const tipoLabels = tiposOrdenados.map(([nome]) => nome);
  const tipoData = tiposOrdenados.map(([, count]) => count);

  // Distribuição por ano
  const anoCounts = {};
  atos.forEach((a) => {
    anoCounts[a.ano] = (anoCounts[a.ano] || 0) + 1;
  });
  const anosOrdenados = Object.entries(anoCounts).sort((a, b) => a[0] - b[0]);
  const anoLabels = anosOrdenados.map(([ano]) => ano.toString());
  const anoData = anosOrdenados.map(([, count]) => count);

  // Destruir gráficos anteriores se existirem
  if (chartTiposInstance) chartTiposInstance.destroy();
  if (chartAnosInstance) chartAnosInstance.destroy();

  // Gráfico de tipos (barra horizontal)
  const ctxTipos = document
    .getElementById("chartTiposCanvas")
    ?.getContext("2d");
  if (ctxTipos) {
    chartTiposInstance = new Chart(ctxTipos, {
      type: "bar",
      data: {
        labels: tipoLabels,
        datasets: [
          {
            label: "Quantidade",
            data: tipoData,
            backgroundColor: [
              "#0d5e3a",
              "#1a3a6b",
              "#2c5282",
              "#047857",
              "#065f46",
              "#1e40af",
              "#312e81",
            ],
            borderColor: "white",
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} ato(s)` } },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  // Gráfico de anos (barra vertical)
  const ctxAnos = document.getElementById("chartAnosCanvas")?.getContext("2d");
  if (ctxAnos) {
    chartAnosInstance = new Chart(ctxAnos, {
      type: "bar",
      data: {
        labels: anoLabels,
        datasets: [
          {
            label: "Publicações",
            data: anoData,
            backgroundColor: "#1a3a6b",
            borderColor: "white",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} ato(s)` } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  // Fallback textual para leitores de tela
  const tiposFallback = tipoLabels
    .map((nome, i) => `${nome}: ${tipoData[i]} ato(s)`)
    .join("; ");
  const anosFallback = anoLabels
    .map((ano, i) => `${ano}: ${anoData[i]} ato(s)`)
    .join("; ");
  document.getElementById("chartTiposFallback").textContent =
    "Distribuição por tipo: " + tiposFallback;
  document.getElementById("chartAnosFallback").textContent =
    "Publicações por ano: " + anosFallback;
}

// ========== VISUALIZAÇÃO DE ATO (MODAL ENRIQUECIDO) ==========
async function visualizarAtoPublico(id) {
  currentAtoId = id;
  const modal = document.getElementById("viewAtoModal");
  modal.style.display = "flex";

  // Mostrar loading, esconder dados
  document.getElementById("viewAtoLoading").style.display = "block";
  document.getElementById("viewAtoData").style.display = "none";
  document.getElementById("viewAtoRelacionamentosContainer").style.display =
    "none";
  document.getElementById("viewAtoAlteracoesContainer").style.display = "none";

  try {
    // Buscar o ato completo
    const { data: ato, error } = await supabase
      .from("atos_oficiais")
      .select(`*, tipos_ato (nome, sigla), orgaos (nome)`)
      .eq("id", id)
      .single();

    if (error || !ato) {
      showNotification("error", "Erro", "Ato não encontrado.");
      closeViewAtoModal();
      return;
    }

    // Preencher detalhes básicos
    document.getElementById("viewAtoTitle").textContent =
      `${ato.tipos_ato?.nome || "Ato"} nº ${ato.numero}/${ato.ano}`;
    document.getElementById("viewAtoTipo").textContent =
      `${ato.tipos_ato?.nome || "—"} (${ato.tipos_ato?.sigla || "?"})`;
    document.getElementById("viewAtoNumeroAno").textContent =
      `${ato.numero}/${ato.ano}`;
    document.getElementById("viewAtoOrgao").textContent =
      ato.orgaos?.nome || "—";
    const statusSpan = document.getElementById("viewAtoStatus");
    statusSpan.textContent = ato.status;
    statusSpan.className = `status-badge status-${ato.status.toLowerCase()}`;
    document.getElementById("viewAtoDataPub").textContent = formatarData(
      ato.data_publicacao,
    );
    document.getElementById("viewAtoEmenta").textContent = ato.ementa;

    // Diário oficial
    const diarioContainer = document.getElementById("viewAtoDiarioContainer");
    if (ato.edicao_diario) {
      diarioContainer.style.display = "block";
      document.getElementById("viewAtoDiario").textContent =
        `Edição ${ato.edicao_diario}, Página ${ato.pagina_diario}`;
    } else {
      diarioContainer.style.display = "none";
    }

    // Tags
    const tagsContainer = document.getElementById("viewAtoTagsContainer");
    if (ato.palavras_chave && ato.palavras_chave.length > 0) {
      tagsContainer.style.display = "block";
      document.getElementById("viewAtoTags").textContent =
        ato.palavras_chave.join(", ");
    } else {
      tagsContainer.style.display = "none";
    }

    // Texto completo (com ancoras)
    const textoContainer = document.getElementById(
      "viewAtoTextoCompletoContainer",
    );
    const textoDiv = document.getElementById("viewAtoTextoCompleto");
    if (ato.texto_completo) {
      textoContainer.style.display = "block";
      textoDiv.innerHTML = ato.texto_completo;
    } else {
      textoContainer.style.display = "none";
    }

    // Buscar relacionamentos e alterações em paralelo
    const [relOrigemRes, relDestinoRes, alteracoesRes] = await Promise.all([
      supabase
        .from("relacionamentos_atos")
        .select(
          "tipo, ato_destino:ato_destino_id (id, tipos_ato (nome, sigla), numero, ano)",
        )
        .eq("ato_origem_id", id),
      supabase
        .from("relacionamentos_atos")
        .select(
          "tipo, ato_origem:ato_origem_id (id, tipos_ato (nome, sigla), numero, ano)",
        )
        .eq("ato_destino_id", id),
      supabase
        .from("alteracoes_dispositivos")
        .select(
          "id, tipo, identificador_dispositivo, novo_texto, ato_alterador:ato_alterador_id (id, tipos_ato (nome, sigla), numero, ano)",
        )
        .eq("ato_origem_id", id),
    ]);

    // Relacionamentos origem (este ato -> outros)
    const relsOrigem = relOrigemRes.data || [];
    const relsDestino = relDestinoRes.data || [];
    const alteracoes = alteracoesRes.data || [];

    // Montar HTML de relacionamentos
    let relHtmlOrigem = "";
    if (relsOrigem.length > 0) {
      relHtmlOrigem = `
        <div class="view-relacionamentos-box">
          <h5>📌 Este ato:</h5>
          <ul>
            ${relsOrigem
              .map((r) => {
                const destino = r.ato_destino;
                if (!destino) return "";
                return `<li>${r.tipo} → <a href="#" onclick="event.preventDefault(); visualizarAtoPublico(${destino.id});">${destino.tipos_ato?.nome || "Ato"} ${destino.numero}/${destino.ano}</a></li>`;
              })
              .join("")}
          </ul>
        </div>`;
    }
    let relHtmlDestino = "";
    if (relsDestino.length > 0) {
      relHtmlDestino = `
        <div class="view-relacionamentos-box">
          <h5>🔁 Referenciado por:</h5>
          <ul>
            ${relsDestino
              .map((r) => {
                const origem = r.ato_origem;
                if (!origem) return "";
                return `<li>${r.tipo} ← <a href="#" onclick="event.preventDefault(); visualizarAtoPublico(${origem.id});">${origem.tipos_ato?.nome || "Ato"} ${origem.numero}/${origem.ano}</a></li>`;
              })
              .join("")}
          </ul>
        </div>`;
    }

    const relContainer = document.getElementById(
      "viewAtoRelacionamentosContainer",
    );
    document.getElementById("viewAtoRelacionamentosOrigem").innerHTML =
      relHtmlOrigem;
    document.getElementById("viewAtoRelacionamentosDestino").innerHTML =
      relHtmlDestino;
    if (relHtmlOrigem || relHtmlDestino) {
      relContainer.style.display = "block";
    } else {
      relContainer.style.display = "none";
    }

    // Alterações de dispositivos
    let altHtml = "";
    if (alteracoes.length > 0) {
      altHtml = `
        <div class="view-alteracoes-box">
          <h5>✏️ Alterações em dispositivos:</h5>
          <ul>
            ${alteracoes
              .map((alt) => {
                const alterador = alt.ato_alterador;
                const nomeAlterador = alterador
                  ? `${alterador.tipos_ato?.nome || "Ato"} ${alterador.numero}/${alterador.ano}`
                  : "Desconhecido";
                const tipoDesc =
                  alt.tipo === "revogado"
                    ? "🚫 Revogado"
                    : alt.tipo === "alterado"
                      ? "✏️ Alterado"
                      : "➕ Acrescentado";
                let extra = "";
                if (alt.tipo === "alterado" && alt.novo_texto) {
                  extra = `<br><small>Novo texto: ${alt.novo_texto.substring(0, 150)}${alt.novo_texto.length > 150 ? "..." : ""}</small>`;
                }
                return `<li>${tipoDesc} "<code>${alt.identificador_dispositivo}</code>" por <a href="#" onclick="event.preventDefault(); visualizarAtoPublico(${alterador?.id});">${nomeAlterador}</a>${extra}</li>`;
              })
              .join("")}
          </ul>
        </div>`;
    }
    const altContainer = document.getElementById("viewAtoAlteracoesContainer");
    document.getElementById("viewAtoAlteracoesLista").innerHTML = altHtml;
    altContainer.style.display = alteracoes.length > 0 ? "block" : "none";

    // Esconder loading e mostrar dados
    document.getElementById("viewAtoLoading").style.display = "none";
    document.getElementById("viewAtoData").style.display = "block";

    // Aplicar estilos nos dispositivos se houver texto completo e alterações
    if (alteracoes.length > 0 && ato.texto_completo) {
      const container = document.getElementById("viewAtoTextoCompleto");
      if (container) {
        alteracoes.forEach((alt) => {
          const elemento = container.querySelector(
            `#${alt.identificador_dispositivo}`,
          );
          if (elemento) {
            if (alt.tipo === "revogado") {
              elemento.classList.add("dispositivo-revogado");
              elemento.setAttribute(
                "title",
                `Revogado por ${alt.ato_alterador?.tipos_ato?.sigla || "?"} ${alt.ato_alterador?.numero}/${alt.ato_alterador?.ano}`,
              );
            } else if (alt.tipo === "alterado") {
              elemento.classList.add("dispositivo-alterado");
              elemento.setAttribute(
                "title",
                `Alterado por ${alt.ato_alterador?.tipos_ato?.sigla || "?"} ${alt.ato_alterador?.numero}/${alt.ato_alterador?.ano}\nNovo texto: ${alt.novo_texto || ""}`,
              );
            }
          }
        });
      }
    }

    // Atualizar URL para compartilhamento
    if (history.pushState) {
      const newUrl = `${window.location.pathname}?ato=${id}`;
      window.history.pushState({ path: newUrl }, "", newUrl);
    }
  } catch (err) {
    console.error("Erro ao carregar detalhes do ato:", err);
    showNotification("error", "Erro", "Falha ao carregar o ato.");
    closeViewAtoModal();
  }
}

window.visualizarAtoPublico = visualizarAtoPublico;

function closeViewAtoModal() {
  document.getElementById("viewAtoModal").style.display = "none";
}
window.closeViewAtoModal = closeViewAtoModal;

// ========== DOWNLOAD DE PDF (STORAGE REAL) ==========
async function downloadPDF(atoId) {
  const id = atoId || currentAtoId;
  if (!id) {
    showNotification("warning", "PDF", "Nenhum ato selecionado.");
    return;
  }

  const { data, error } = await supabase
    .from("atos_oficiais")
    .select("pdf_url")
    .eq("id", id)
    .single();

  if (error || !data || !data.pdf_url) {
    showNotification(
      "warning",
      "Indisponível",
      "PDF não disponível para este ato.",
    );
    return;
  }

  window.open(data.pdf_url, "_blank");
}
window.downloadPDF = downloadPDF;

// ========== COMPARTILHAR (já definida no HTML inline, apenas referência) ==========
// A função compartilharAto() está no HTML, não precisa ser redeclarada.

// ========== NAVEGAÇÃO (EXTENSÃO) ==========
const navegarSecaoOriginal = window.navegarSecao;
window.navegarSecao = function (secao) {
  if (typeof navegarSecaoOriginal === "function") {
    navegarSecaoOriginal(secao);
  } else {
    // Fallback básico
    document
      .querySelectorAll(".portal-section")
      .forEach((s) => (s.style.display = "none"));
    const target = document.getElementById(
      `secao${secao.charAt(0).toUpperCase() + secao.slice(1)}`,
    );
    if (target) target.style.display = "block";
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("data-section") === secao)
        link.classList.add("active");
    });
    // Breadcrumb
    const breadcrumb = document.getElementById("breadcrumb");
    const currentEl = document.getElementById("breadcrumbCurrent");
    const nomes = {
      home: "Início",
      busca: "Buscar Atos",
      orgaos: "Órgãos",
      estatisticas: "Estatísticas",
      sobre: "Sobre",
    };
    if (secao === "home") {
      breadcrumb.style.display = "none";
    } else {
      breadcrumb.style.display = "flex";
      currentEl.textContent = nomes[secao] || secao;
    }
  }

  // Carregar dados da seção
  switch (secao) {
    case "home":
      carregarHome();
      break;
    case "busca":
      popularSelectTipos();
      popularSelectOrgaos();
      carregarAnosDisponiveis();
      aplicarFiltrosBusca(1);
      break;
    case "orgaos":
      carregarSecaoOrgaos();
      break;
    case "estatisticas":
      carregarEstatisticas();
      break;
    case "sobre":
      // sem ação necessária
      break;
  }
};

// Expor funções auxiliares
window.voltarAoTopo = function () {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ========== INICIALIZAÇÃO GERAL ==========
async function inicializar() {
  try {
    await Promise.all([carregarOrgaos(), carregarTiposAto()]);

    popularSelectTipos();
    popularSelectOrgaos();
    await carregarAnosDisponiveis();

    // Configurar listeners de paginação
    document.getElementById("btnPagAnterior").addEventListener("click", () => {
      if (paginaAtual > 1) {
        aplicarFiltrosBusca(paginaAtual - 1);
        window.scrollTo({
          top: document.getElementById("secaoBusca").offsetTop - 110,
          behavior: "smooth",
        });
      }
    });
    document.getElementById("btnPagProximo").addEventListener("click", () => {
      const totalPaginas =
        Math.ceil(totalResultadosBusca / itensPorPagina) || 1;
      if (paginaAtual < totalPaginas) {
        aplicarFiltrosBusca(paginaAtual + 1);
        window.scrollTo({
          top: document.getElementById("secaoBusca").offsetTop - 110,
          behavior: "smooth",
        });
      }
    });

    // Botão limpar filtros
    document
      .getElementById("btnLimparFiltros")
      .addEventListener("click", limparFiltrosBusca);

    // Eventos de alteração nos selects (exceto texto, que tem debounce)
    ["buscaTipo", "buscaAno", "buscaOrgao", "buscaStatus"].forEach((id) => {
      document
        .getElementById(id)
        .addEventListener("change", () => aplicarFiltrosBusca(1));
    });

    // Campo de texto com debounce (800ms)
    let debounceTimer;
    document.getElementById("buscaTexto").addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => aplicarFiltrosBusca(1), 800);
    });

    // Verificar se há parâmetro de ato na URL (compartilhamento)
    const urlParams = new URLSearchParams(window.location.search);
    const atoIdParam = urlParams.get("ato");
    if (atoIdParam) {
      visualizarAtoPublico(parseInt(atoIdParam));
    }

    // Carregar home inicial
    carregarHome();
  } catch (err) {
    console.error("Erro na inicialização do portal:", err);
    showNotification(
      "error",
      "Erro",
      "Falha ao carregar dados. Tente novamente.",
    );
  }
}

document.addEventListener("DOMContentLoaded", inicializar);
