// ============================================
// portal-atos-oficiais.js
// Portal Público de Atos Oficiais
// Integração real com Supabase (dados públicos)
// Inclui: visualização enriquecida com abas e
// duas colunas, linha do tempo normativa,
// busca reversa, gráficos, acessibilidade,
// responsividade, SEO, carregamento dinâmico
// das configurações do portal e a NOVA seção
// de Estatísticas com KPIs, evolução, composição,
// ranking de órgãos, heatmap e insights.
// ============================================

import { supabase } from "./supabase.js";

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
let currentAtoId = null;

// Instâncias dos gráficos (Chart.js)
let chartEvolucaoAnualInstance = null;
let chartComposicaoTipoInstance = null;
let chartStatusAnoInstance = null;

// Para a busca reversa
let buscaReversaAtoIdSelecionado = null;

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
         onclick="window.location.href='visualizar-ato.html?id=${ato.id}'">
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
    <div class="resultado-item" onclick="window.location.href='visualizar-ato.html?id=${ato.id}'">
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
              <div style="margin-top: 6px; font-size: 13px; cursor: pointer;" onclick="window.location.href='visualizar-ato.html?id=${a.id}'">
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

// ========== LINHA DO TEMPO NORMATIVA ==========
async function montarLinhaDoTempo(atoId) {
  const container = document.getElementById("viewAtoTimeline");
  if (!container) return;
  container.innerHTML = `<div class="loading-placeholder"><div class="loading-spinner"></div><p>Montando linha do tempo...</p></div>`;

  const { data: ato } = await supabase
    .from("atos_oficiais")
    .select("id, tipo_nome, numero, ano, data_publicacao")
    .eq("id", atoId)
    .single();

  if (!ato) {
    container.innerHTML = '<p class="empty-state">Ato não encontrado.</p>';
    return;
  }

  const { data: relsOrigem } = await supabase
    .from("relacionamentos_atos")
    .select(
      "tipo, ato_destino:ato_destino_id(id, tipos_ato (nome, sigla), numero, ano, data_publicacao)",
    )
    .eq("ato_origem_id", atoId);
  const { data: relsDestino } = await supabase
    .from("relacionamentos_atos")
    .select(
      "tipo, ato_origem:ato_origem_id(id, tipos_ato (nome, sigla), numero, ano, data_publicacao)",
    )
    .eq("ato_destino_id", atoId);

  const { data: alteracoes } = await supabase
    .from("alteracoes_dispositivos")
    .select(
      "id, tipo, identificador_dispositivo, novo_texto, ato_alterador:ato_alterador_id(id, tipos_ato (nome, sigla), numero, ano, data_publicacao)",
    )
    .eq("ato_origem_id", atoId);

  const eventos = [];

  eventos.push({
    data: ato.data_publicacao,
    titulo: "Publicação",
    descricao: `${ato.tipo_nome || "Ato"} nº ${ato.numero}/${ato.ano} publicado.`,
    tipo: "publicacao",
  });

  if (relsOrigem) {
    for (const rel of relsOrigem) {
      const destino = rel.ato_destino;
      if (!destino) continue;
      eventos.push({
        data: destino.data_publicacao || ato.data_publicacao,
        titulo: `${rel.tipo.charAt(0).toUpperCase() + rel.tipo.slice(1)}`,
        descricao: `Este ato ${rel.tipo} o ${destino.tipos_ato?.nome || "Ato"} ${destino.numero}/${destino.ano}.`,
        tipo: rel.tipo === "revoga" ? "revogado" : "alterado",
        linkAtoId: destino.id,
      });
    }
  }

  if (relsDestino) {
    for (const rel of relsDestino) {
      const origem = rel.ato_origem;
      if (!origem) continue;
      eventos.push({
        data: origem.data_publicacao || ato.data_publicacao,
        titulo: `${rel.tipo.charAt(0).toUpperCase() + rel.tipo.slice(1)}`,
        descricao: `O ${origem.tipos_ato?.nome || "Ato"} ${origem.numero}/${origem.ano} ${rel.tipo} este ato.`,
        tipo: rel.tipo === "revoga" ? "revogado" : "alterado",
        linkAtoId: origem.id,
      });
    }
  }

  if (alteracoes) {
    for (const alt of alteracoes) {
      const alterador = alt.ato_alterador;
      if (!alterador) continue;
      const tipoDesc =
        alt.tipo === "revogado"
          ? "Revogado"
          : alt.tipo === "alterado"
            ? "Alterado"
            : "Acrescentado";
      eventos.push({
        data: alterador.data_publicacao || ato.data_publicacao,
        titulo: `Dispositivo "${alt.identificador_dispositivo}" ${tipoDesc}`,
        descricao: `O ${alterador.tipos_ato?.nome || "Ato"} ${alterador.numero}/${alterador.ano} ${alt.tipo} o dispositivo "${alt.identificador_dispositivo}".`,
        tipo: alt.tipo === "revogado" ? "revogado" : "alterado",
        linkAtoId: alterador.id,
      });
    }
  }

  eventos.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

  if (eventos.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Nenhum evento na linha do tempo.</p>';
    return;
  }

  let html = '<div class="timeline">';
  for (const ev of eventos) {
    const icone =
      ev.tipo === "publicacao"
        ? "📅"
        : ev.tipo === "revogado"
          ? "🚫"
          : ev.tipo === "alterado"
            ? "✏️"
            : "ℹ️";
    const dotClass =
      ev.tipo === "revogado"
        ? "revogado"
        : ev.tipo === "alterado"
          ? "alterado"
          : "";
    html += `
      <div class="timeline-item">
        <div class="timeline-dot ${dotClass}">${icone}</div>
        <div class="timeline-content">
          <div class="timeline-title">${ev.titulo}</div>
          <div class="timeline-description">
            ${ev.descricao}
            ${ev.linkAtoId ? `<br><a href="#" class="timeline-link" onclick="window.location.href='visualizar-ato.html?id=${ev.linkAtoId}'; return false;"><i class="fas fa-external-link-alt"></i> Ver ato</a>` : ""}
          </div>
          <div class="timeline-date">${formatarData(ev.data)}</div>
        </div>
      </div>
    `;
  }
  html += "</div>";
  container.innerHTML = html;
}

// ========== BUSCA REVERSA ==========
function initBuscaReversaAutocomplete() {
  const input = document.getElementById("buscaReversaAtoInput");
  const sugestoesContainer = document.getElementById("buscaReversaSugestoes");
  if (!input || !sugestoesContainer) return;

  input.addEventListener("input", async function () {
    const termo = this.value.trim();
    if (!termo) {
      sugestoesContainer.innerHTML = "";
      sugestoesContainer.classList.remove("show");
      buscaReversaAtoIdSelecionado = null;
      return;
    }

    const { data } = await supabase
      .from("atos_oficiais")
      .select("id, numero, ano, ementa, tipos_ato (nome, sigla)")
      .or(`numero::text.ilike.%${termo}%,tipos_ato.nome.ilike.%${termo}%`)
      .order("data_publicacao", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      sugestoesContainer.innerHTML =
        '<div class="busca-reversa-sugestao-item" style="color: var(--neutral-500);">Nenhum ato encontrado</div>';
      sugestoesContainer.classList.add("show");
      return;
    }

    sugestoesContainer.innerHTML = data
      .map(
        (ato) =>
          `<div class="busca-reversa-sugestao-item" data-ato-id="${ato.id}">${ato.tipos_ato?.sigla || "?"} ${ato.numero}/${ato.ano} - ${ato.ementa.substring(0, 60)}...</div>`,
      )
      .join("");
    sugestoesContainer.classList.add("show");

    sugestoesContainer
      .querySelectorAll(".busca-reversa-sugestao-item")
      .forEach((item) => {
        item.addEventListener("click", function () {
          const atoId = parseInt(this.getAttribute("data-ato-id"));
          const atoSelecionado = data.find((a) => a.id === atoId);
          if (atoSelecionado) {
            input.value = `${atoSelecionado.tipos_ato?.sigla || ""} ${atoSelecionado.numero}/${atoSelecionado.ano}`;
            buscaReversaAtoIdSelecionado = atoId;
          }
          sugestoesContainer.classList.remove("show");
        });
      });
  });

  document.addEventListener("click", function (e) {
    if (!input.contains(e.target) && !sugestoesContainer.contains(e.target)) {
      sugestoesContainer.classList.remove("show");
    }
  });
}

async function executarBuscaReversa() {
  const input = document.getElementById("buscaReversaInput");
  const container = document.getElementById("buscaReversaResultados");
  const termo = input.value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!termo) {
    container.innerHTML =
      '<p class="empty-state">Informe um identificador de dispositivo (ex.: artigo5).</p>';
    return;
  }
  container.innerHTML =
    '<div class="loading-placeholder"><div class="loading-spinner"></div><p>Buscando...</p></div>';

  let query = supabase
    .from("alteracoes_dispositivos")
    .select(
      "*, ato_alterador:ato_alterador_id(*, tipos_ato(*), orgaos(*)), ato_origem:ato_origem_id(*, tipos_ato(*), orgaos(*))",
    )
    .eq("identificador_dispositivo", termo)
    .order("created_at", { ascending: false });

  if (buscaReversaAtoIdSelecionado) {
    query = query.eq("ato_origem_id", buscaReversaAtoIdSelecionado);
  }

  const { data, error } = await query;

  if (error) {
    container.innerHTML = '<p class="empty-state">Erro ao buscar.</p>';
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Nenhum ato afeta o dispositivo "${termo}".</p>`;
    return;
  }

  let html = "";
  for (const alt of data) {
    const alterador = alt.ato_alterador;
    const origem = alt.ato_origem;
    html += `
      <div class="busca-reversa-item" onclick="window.location.href='visualizar-ato.html?id=${alterador.id}'">
        <strong>${alterador.tipos_ato?.sigla || "?"} ${alterador.numero}/${alterador.ano}</strong>
        → ${alt.tipo === "revogado" ? "Revogou" : alt.tipo === "alterado" ? "Alterou" : "Acrescentou"}
        o dispositivo "<code>${alt.identificador_dispositivo}</code>" do ato
        <strong>${origem.tipos_ato?.sigla || "?"} ${origem.numero}/${origem.ano}</strong>
        <br><small>${formatarData(alterador.data_publicacao)}</small>
      </div>
    `;
  }
  container.innerHTML = html;
}
window.executarBuscaReversa = executarBuscaReversa;

// ========== CONFIGURAÇÕES DO PORTAL (SEÇÃO SOBRE) ==========
async function carregarConfiguracoesPortal() {
  const { data, error } = await supabase
    .from("configuracoes_portal")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const padrao = {
    email_contato: "transparencia@prefeitura.gov.br",
    telefone_contato: "(00) 0000-0000",
    endereco: "Praça Municipal, s/n — Centro",
    horario_atendimento: "Segunda a Sexta-feira, das 8h às 17h",
    ouvidoria_email: "ouvidoria@prefeitura.gov.br",
    diario_oficial_url: "https://www.diarioficial.gov.br",
    cnpj: "XX.XXX.XXX/0001-XX",
    nome_prefeito: "Nome do Prefeito(a)",
    responsavel_portal:
      "Departamento de Tecnologia da Informação / Setor de Transparência",
  };

  const cfg = data || padrao;

  document.getElementById("cfgEmail").textContent =
    cfg.email_contato || padrao.email_contato;
  document.getElementById("cfgTelefone").textContent =
    cfg.telefone_contato || padrao.telefone_contato;
  document.getElementById("cfgHorario").textContent =
    cfg.horario_atendimento || padrao.horario_atendimento;
  document.getElementById("cfgEndereco").textContent =
    cfg.endereco || padrao.endereco;
  document.getElementById("cfgOuvidoria").textContent =
    cfg.ouvidoria_email || padrao.ouvidoria_email;
  document.getElementById("cfgDiarioUrl").textContent =
    cfg.diario_oficial_url || padrao.diario_oficial_url;
  document.getElementById("cfgCnpj").textContent = cfg.cnpj || padrao.cnpj;
  document.getElementById("cfgPrefeito").textContent =
    cfg.nome_prefeito || padrao.nome_prefeito;
  document.getElementById("cfgResponsavel").textContent =
    cfg.responsavel_portal || padrao.responsavel_portal;

  const cfgOuvidoriaLink = document.getElementById("cfgOuvidoriaLink");
  if (cfgOuvidoriaLink)
    cfgOuvidoriaLink.href = `mailto:${cfg.ouvidoria_email || padrao.ouvidoria_email}`;
  const cfgDiarioUrlLink = document.getElementById("cfgDiarioUrlLink");
  if (cfgDiarioUrlLink)
    cfgDiarioUrlLink.href = cfg.diario_oficial_url || padrao.diario_oficial_url;

  document.getElementById("footerEmail").textContent =
    cfg.email_contato || padrao.email_contato;
  document.getElementById("footerTelefone").textContent =
    cfg.telefone_contato || padrao.telefone_contato;
  const footerDiarioLink = document.getElementById("footerDiarioLink");
  if (footerDiarioLink)
    footerDiarioLink.href = cfg.diario_oficial_url || padrao.diario_oficial_url;
  const footerOuvidoriaLink = document.getElementById("footerOuvidoriaLink");
  if (footerOuvidoriaLink)
    footerOuvidoriaLink.href = `mailto:${cfg.ouvidoria_email || padrao.ouvidoria_email}`;
}

// ========== DOWNLOAD DE PDF ==========
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

// ========== NOVA SEÇÃO DE ESTATÍSTICAS ==========
async function carregarEstatisticas() {
  const { data: atos, error } = await supabase
    .from("atos_oficiais")
    .select(
      "id, tipo_id, ano, status, data_publicacao, orgao_id, tipos_ato (nome)",
    )
    .limit(5000);

  if (error) {
    showNotification("error", "Erro", "Falha ao carregar estatísticas.");
    return;
  }

  if (!atos || atos.length === 0) {
    document.getElementById("estatTotalNovo").textContent = "0";
    document.getElementById("estatVigentesNovo").textContent = "0";
    document.getElementById("estatRevogadosNovo").textContent = "0";
    document.getElementById("estatAlteradosNovo").textContent = "0";
    return;
  }

  const total = atos.length;
  const vigentes = atos.filter((a) => a.status === "Vigente").length;
  const revogados = atos.filter((a) => a.status === "Revogado").length;
  const alterados = atos.filter((a) => a.status === "Alterado").length;

  document.getElementById("estatTotalNovo").textContent = total;
  document.getElementById("estatVigentesNovo").textContent = vigentes;
  document.getElementById("estatRevogadosNovo").textContent = revogados;
  document.getElementById("estatAlteradosNovo").textContent = alterados;

  // Tendências
  const anoAtual = new Date().getFullYear();
  const atosAnoAtual = atos.filter((a) => a.ano === anoAtual);
  const atosAnoAnterior = atos.filter((a) => a.ano === anoAtual - 1);

  function calcularTendencia(atual, anterior) {
    if (!anterior) return { classe: "neutral", texto: "—" };
    const diff = ((atual - anterior) / anterior) * 100;
    if (diff > 5) return { classe: "up", texto: `+${diff.toFixed(0)}%` };
    if (diff < -5) return { classe: "down", texto: `${diff.toFixed(0)}%` };
    return { classe: "neutral", texto: `${diff.toFixed(0)}%` };
  }

  const trendTotal = calcularTendencia(
    atosAnoAtual.length,
    atosAnoAnterior.length,
  );
  document.getElementById("trendTotal").textContent = trendTotal.texto;
  document.getElementById("trendTotal").className =
    `kpi-trend ${trendTotal.classe}`;

  const trendVigentes = calcularTendencia(
    atosAnoAtual.filter((a) => a.status === "Vigente").length,
    atosAnoAnterior.filter((a) => a.status === "Vigente").length,
  );
  document.getElementById("trendVigentes").textContent = trendVigentes.texto;
  document.getElementById("trendVigentes").className =
    `kpi-trend ${trendVigentes.classe}`;

  const trendRevogados = calcularTendencia(
    atosAnoAtual.filter((a) => a.status === "Revogado").length,
    atosAnoAnterior.filter((a) => a.status === "Revogado").length,
  );
  document.getElementById("trendRevogados").textContent = trendRevogados.texto;
  document.getElementById("trendRevogados").className =
    `kpi-trend ${trendRevogados.classe}`;

  const trendAlterados = calcularTendencia(
    atosAnoAtual.filter((a) => a.status === "Alterado").length,
    atosAnoAnterior.filter((a) => a.status === "Alterado").length,
  );
  document.getElementById("trendAlterados").textContent = trendAlterados.texto;
  document.getElementById("trendAlterados").className =
    `kpi-trend ${trendAlterados.classe}`;

  // Evolução anual
  const anosUnicos = [...new Set(atos.map((a) => a.ano))].sort();
  const countsPorAno = anosUnicos.map(
    (ano) => atos.filter((a) => a.ano === ano).length,
  );

  if (chartEvolucaoAnualInstance) chartEvolucaoAnualInstance.destroy();
  const ctxEvolucao = document
    .getElementById("chartEvolucaoAnual")
    ?.getContext("2d");
  if (ctxEvolucao) {
    chartEvolucaoAnualInstance = new Chart(ctxEvolucao, {
      type: "line",
      data: {
        labels: anosUnicos,
        datasets: [
          {
            label: "Publicações",
            data: countsPorAno,
            borderColor: "#0d5e3a",
            backgroundColor: "rgba(13, 94, 58, 0.1)",
            fill: true,
            tension: 0.3,
            pointBackgroundColor: "#0d5e3a",
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }
  document.getElementById("chartEvolucaoAnualFallback").textContent =
    `Evolução anual: ${anosUnicos.map((ano, i) => `${ano}: ${countsPorAno[i]}`).join("; ")}`;

  // Composição por tipo
  const tipoCounts = {};
  atos.forEach((a) => {
    const nome = a.tipos_ato?.nome || "Outros";
    tipoCounts[nome] = (tipoCounts[nome] || 0) + 1;
  });
  const tipoLabels = Object.keys(tipoCounts);
  const tipoData = Object.values(tipoCounts);

  if (chartComposicaoTipoInstance) chartComposicaoTipoInstance.destroy();
  const ctxComposicao = document
    .getElementById("chartComposicaoTipo")
    ?.getContext("2d");
  if (ctxComposicao) {
    chartComposicaoTipoInstance = new Chart(ctxComposicao, {
      type: "doughnut",
      data: {
        labels: tipoLabels,
        datasets: [
          {
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
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
      },
    });
  }
  document.getElementById("chartComposicaoTipoFallback").textContent =
    `Composição por tipo: ${tipoLabels.map((nome, i) => `${nome}: ${tipoData[i]}`).join("; ")}`;

  // Ranking de órgãos
  const orgaoCounts = {};
  atos.forEach((a) => {
    orgaoCounts[a.orgao_id] = (orgaoCounts[a.orgao_id] || 0) + 1;
  });
  const ranking = Object.entries(orgaoCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxOrgao = ranking[0]?.[1] || 1;
  const rankingContainer = document.getElementById("orgaosRanking");
  let rankingHtml = "";
  ranking.forEach(([orgaoId, qtd], index) => {
    const org = orgaos.find((o) => o.id === parseInt(orgaoId));
    const nome = org ? org.nome : `Órgão #${orgaoId}`;
    const pct = ((qtd / maxOrgao) * 100).toFixed(0);
    rankingHtml += `
      <div class="orgao-ranking-item">
        <div class="orgao-ranking-posicao">${index + 1}º</div>
        <div class="orgao-ranking-nome">${nome}</div>
        <div class="orgao-ranking-barra">
          <div class="orgao-ranking-preenchimento" style="width: ${pct}%;"></div>
        </div>
        <div class="orgao-ranking-qtd">${qtd}</div>
      </div>
    `;
  });
  rankingContainer.innerHTML =
    rankingHtml || "<p class='empty-state'>Sem dados.</p>";

  // Distribuição por status (por ano)
  const anosStatus = [...new Set(atos.map((a) => a.ano))].sort();
  const statusTipos = ["Vigente", "Revogado", "Alterado"];
  const datasetsStatus = statusTipos.map((status) => ({
    label: status,
    data: anosStatus.map(
      (ano) => atos.filter((a) => a.ano === ano && a.status === status).length,
    ),
    backgroundColor:
      status === "Vigente"
        ? "#0d5e3a"
        : status === "Revogado"
          ? "#dc2626"
          : "#f59e0b",
  }));

  if (chartStatusAnoInstance) chartStatusAnoInstance.destroy();
  const ctxStatusAno = document
    .getElementById("chartStatusAno")
    ?.getContext("2d");
  if (ctxStatusAno) {
    chartStatusAnoInstance = new Chart(ctxStatusAno, {
      type: "bar",
      data: {
        labels: anosStatus,
        datasets: datasetsStatus,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }
  document.getElementById("chartStatusAnoFallback").textContent =
    "Distribuição por status: " +
    anosStatus
      .map((ano) => {
        const v = atos.filter(
          (a) => a.ano === ano && a.status === "Vigente",
        ).length;
        const r = atos.filter(
          (a) => a.ano === ano && a.status === "Revogado",
        ).length;
        const a = atos.filter(
          (a) => a.ano === ano && a.status === "Alterado",
        ).length;
        return `${ano}: Vigente=${v}, Revogado=${r}, Alterado=${a}`;
      })
      .join("; ");

  // Heatmap mensal
  const meses = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  const anosHeat = anosUnicos.slice(-5);
  const heatData = {};
  atos.forEach((a) => {
    if (!a.data_publicacao) return;
    const partes = a.data_publicacao.split("-");
    const ano = parseInt(partes[0]);
    const mes = parseInt(partes[1]) - 1;
    if (!heatData[ano]) heatData[ano] = Array(12).fill(0);
    heatData[ano][mes]++;
  });

  const maxHeat = Math.max(
    ...anosHeat.flatMap((ano) => heatData[ano] || []),
    1,
  );

  function heatClass(valor) {
    const pct = valor / maxHeat;
    if (pct === 0) return "heatmap-cell-0";
    if (pct < 0.25) return "heatmap-cell-1";
    if (pct < 0.5) return "heatmap-cell-2";
    if (pct < 0.75) return "heatmap-cell-3";
    if (pct < 1) return "heatmap-cell-4";
    return "heatmap-cell-max";
  }

  let heatThead = "<tr><th>Mês</th>";
  anosHeat.forEach((ano) => {
    heatThead += `<th>${ano}</th>`;
  });
  heatThead += "</tr>";
  let heatTbody = "";
  for (let m = 0; m < 12; m++) {
    heatTbody += `<tr><td><strong>${meses[m]}</strong></td>`;
    anosHeat.forEach((ano) => {
      const valor = (heatData[ano] || [])[m] || 0;
      heatTbody += `<td class="${heatClass(valor)}">${valor || "-"}</td>`;
    });
    heatTbody += "</tr>";
  }
  const heatTable = document.getElementById("heatmapTabela");
  if (heatTable) {
    heatTable.querySelector("thead").innerHTML = heatThead;
    heatTable.querySelector("tbody").innerHTML = heatTbody;
  }

  // Insights automáticos
  const insights = [];
  if (anosUnicos.length >= 2) {
    const ultimo = anosUnicos[anosUnicos.length - 1];
    const penultimo = anosUnicos[anosUnicos.length - 2];
    const qtdUltimo = atos.filter((a) => a.ano === ultimo).length;
    const qtdPenultimo = atos.filter((a) => a.ano === penultimo).length;
    const diff = qtdUltimo - qtdPenultimo;
    if (diff > 0) {
      insights.push(
        `Em ${ultimo}, foram publicados <strong>${diff} atos a mais</strong> do que em ${penultimo} (${qtdUltimo} vs ${qtdPenultimo}).`,
      );
    } else if (diff < 0) {
      insights.push(
        `Em ${ultimo}, foram publicados <strong>${Math.abs(diff)} atos a menos</strong> do que em ${penultimo} (${qtdUltimo} vs ${qtdPenultimo}).`,
      );
    }

    const tipoPrincipalUltimo = Object.entries(tipoCounts).sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (tipoPrincipalUltimo) {
      insights.push(
        `O tipo de ato mais frequente em ${ultimo} foi <strong>${tipoPrincipalUltimo[0]}</strong>, com ${tipoPrincipalUltimo[1]} publicações.`,
      );
    }
  }

  if (ranking.length > 0) {
    const orgaoCampeao = orgaos.find((o) => o.id === parseInt(ranking[0][0]));
    const nomeOrgaoCampeao = orgaoCampeao
      ? orgaoCampeao.nome
      : `Órgão #${ranking[0][0]}`;
    insights.push(
      `O órgão que mais publicou atos é <strong>${nomeOrgaoCampeao}</strong>, responsável por <strong>${ranking[0][1]} atos</strong>.`,
    );
  }

  const insightsContainer = document.getElementById("insightsContainer");
  if (insightsContainer) {
    insightsContainer.innerHTML = insights
      .map(
        (i) =>
          `<div class="insight-box"><i class="fas fa-lightbulb"></i> ${i}</div>`,
      )
      .join("");
  }
}

// ========== NAVEGAÇÃO (EXTENSÃO) ==========
const navegarSecaoOriginal = window.navegarSecao;
window.navegarSecao = function (secao) {
  if (typeof navegarSecaoOriginal === "function") {
    navegarSecaoOriginal(secao);
  } else {
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
  }

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
      carregarConfiguracoesPortal();
      break;
  }
};

// ========== INICIALIZAÇÃO GERAL ==========
async function inicializar() {
  try {
    await Promise.all([carregarOrgaos(), carregarTiposAto()]);

    popularSelectTipos();
    popularSelectOrgaos();
    await carregarAnosDisponiveis();

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

    document
      .getElementById("btnLimparFiltros")
      .addEventListener("click", limparFiltrosBusca);

    ["buscaTipo", "buscaAno", "buscaOrgao", "buscaStatus"].forEach((id) => {
      document
        .getElementById(id)
        .addEventListener("change", () => aplicarFiltrosBusca(1));
    });

    let debounceTimer;
    document.getElementById("buscaTexto").addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => aplicarFiltrosBusca(1), 800);
    });

    initBuscaReversaAutocomplete();

    const urlParams = new URLSearchParams(window.location.search);
    const atoIdParam = urlParams.get("ato");
    if (atoIdParam) {
      // Redirecionar para a página de visualização
      window.location.href = `visualizar-ato.html?id=${atoIdParam}`;
    }

    await carregarConfiguracoesPortal();

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
