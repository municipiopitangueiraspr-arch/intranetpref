import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js";

const $ = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const safeIcon = (value, fallback = "fa-chart-pie") => /^fa-[a-z0-9-]+$/i.test(String(value || "")) ? String(value) : fallback;
const safeTone = (value) => ["blue", "yellow", "green", "red", "neutral"].includes(value) ? value : "blue";

const moduleCatalog = {
  biblioteca: {
    nome: "Biblioteca Municipal",
    descricao: "Circulação do acervo, atendimento e capacidade de serviço.",
    icone: "fa-book-open",
    cor: "blue",
    rota: "../biblioteca/dashboard.html",
  },
  compras: {
    nome: "Compras, Atas e Saldos",
    descricao: "Execução de pedidos, contratos vigentes e pontos de atenção.",
    icone: "fa-cart-shopping",
    cor: "yellow",
    rota: "../controle-de-saldos/gestao-atas.html",
  },
};

function defaultDates() {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - 29);
  $("fim").value = fim.toISOString().slice(0, 10);
  $("inicio").value = inicio.toISOString().slice(0, 10);
}

function layoutConfig() {
  return {
    supabase,
    brand: { nome: "Visão Executiva", subtitulo: "Gestão municipal", icone: "fa-landmark" },
    iconeTitulo: "fa-chart-line",
    titulo: "Visão Executiva",
    subtitulo: "Indicadores agregados do Município",
    moduloAtivo: "visao-executiva",
    menu: [
      { section: "Visão do Município", itens: [
        { id: "visao-executiva", rota: "#visao-geral", icone: "fa-table-cells-large", label: "Visão geral" },
        { id: "modulos", rota: "#modulos", icone: "fa-cubes", label: "Módulos e indicadores" },
        { id: "alertas", rota: "#alertas", icone: "fa-bell", label: "Alertas executivos" },
      ] },
    ],
    rotaVoltar: "../intranet.html",
    textoVoltar: "Voltar à intranet",
    menuUsuario: { rotaPerfil: "../perfil.html", rotaAjuda: "#alertas" },
  };
}

async function load() {
  $("loading").hidden = false;
  $("erro").hidden = true;
  $("dashboard").hidden = true;
  try {
    const { error, data } = await supabase.rpc("prefeito_painel_dados", { p_inicio: $("inicio").value, p_fim: $("fim").value });
    if (error) throw error;
    render(data || {});
    $("dashboard").hidden = false;
  } catch (error) {
    console.error("[painel-prefeito] Erro ao carregar indicadores:", error);
    $("erroTexto").textContent = error.message || "Verifique sua sessão e tente novamente.";
    $("erro").hidden = false;
  } finally {
    $("loading").hidden = true;
  }
}

function normalizeModules(data) {
  if (Array.isArray(data.modulos)) {
    return data.modulos.map((module, index) => normalizeModule(module, index)).filter(Boolean);
  }
  return [normalizeBiblioteca(data.biblioteca), normalizeCompras(data.compras)].filter(Boolean);
}

function normalizeModule(module, index) {
  const id = String(module.id || module.codigo || `modulo-${index + 1}`).toLowerCase();
  const base = moduleCatalog[id] || {};
  const metrics = Array.isArray(module.metricas) ? module.metricas : Array.isArray(module.metrics) ? module.metrics : [];
  return {
    id,
    nome: module.nome || module.name || base.nome || "Módulo municipal",
    descricao: module.descricao || module.description || base.descricao || "Indicadores agregados publicados por este módulo.",
    icone: safeIcon(module.icone || module.icon || base.icone),
    cor: safeTone(module.cor || base.cor),
    rota: module.rota || module.route || base.rota || "#modulos",
    status: module.status || (module.ativo === false ? "implantacao" : "ativo"),
    metricas: metrics.map(normalizeMetric).filter(Boolean),
    insights: Array.isArray(module.insights) ? module.insights : module.insight ? [module.insight] : [],
    widgets: Array.isArray(module.widgets) ? module.widgets : [],
  };
}

function normalizeMetric(metric) {
  if (!metric || !metric.label) return null;
  return { label: metric.label || metric.nome, value: metric.value ?? metric.valor ?? "—", icon: safeIcon(metric.icon || metric.icone, "fa-chart-simple"), tone: safeTone(metric.tone || metric.cor), alert: metric.alert === true };
}

function normalizeBiblioteca(raw = {}) {
  const b = raw || {};
  return normalizeModule({
    id: "biblioteca",
    metricas: [
      { label: "Livros no acervo", value: number(b.livros), icon: "fa-book" },
      { label: "Exemplares", value: number(b.exemplares), icon: "fa-layer-group" },
      { label: "Leitores ativos", value: number(b.leitores_ativos), icon: "fa-users" },
      { label: "Empréstimos no período", value: number(b.emprestimos_periodo), icon: "fa-arrow-right-arrow-left" },
      { label: "Em atraso", value: number(b.emprestimos_atrasados), icon: "fa-clock", tone: "red", alert: true },
    ],
    insights: [Number(b.exemplares || 0) ? `O acervo possui ${number(b.exemplares_disponiveis)} exemplares disponíveis de ${number(b.exemplares)}. Há ${number(b.reservas_ativas)} reserva(s) ativa(s) e ${number(b.inventarios_em_execucao)} inventário(s) em execução.` : "Ainda não existem dados suficientes de acervo para gerar uma leitura executiva."],
    widgets: Number(b.exemplares || 0) ? [{ type: "progress", title: "Disponibilidade do acervo", value: Math.round(Number(b.exemplares_disponiveis || 0) / Number(b.exemplares) * 100), left: "Disponíveis", right: "Emprestados" }] : [],
  }, 0);
}

function normalizeCompras(raw = {}) {
  const c = raw || {};
  return normalizeModule({
    id: "compras",
    metricas: [
      { label: "Atas vigentes", value: number(c.atas_ativas), icon: "fa-file-signature" },
      { label: "Valor global das atas", value: money(c.valor_global_atas), icon: "fa-sack-dollar" },
      { label: "Saldo financeiro", value: money(c.saldo_valor), icon: "fa-wallet" },
      { label: "Pedidos no período", value: number(c.pedidos_periodo), icon: "fa-clipboard-list" },
      { label: "Ocorrências abertas", value: number(c.ocorrencias_abertas), icon: "fa-triangle-exclamation", tone: "red", alert: true },
    ],
    insights: [`Foram registrados ${number(c.pedidos_periodo)} pedido(s), totalizando ${money(c.valor_pedidos_periodo)} no período. Existem ${number(c.atas_a_vencer_30_dias)} ata(s) com vencimento nos próximos 30 dias e ${number(c.entregas_parciais)} entrega(s) parcial(is).`],
    widgets: [{ type: "status", title: "Status dos pedidos", total: Number(c.pedidos_periodo || 0), rows: [
      ["Pendentes", c.pedidos_pendentes, "yellow"], ["Aprovados", c.pedidos_aprovados, "green"], ["Rejeitados/cancelados", c.pedidos_rejeitados, "red"],
    ] }],
  }, 1);
}

function render(data) {
  const modules = normalizeModules(data);
  const alerts = Array.isArray(data.alertas) ? data.alertas : modules.flatMap((module) => module.alertas || []);
  const totalMetrics = modules.reduce((total, module) => total + module.metricas.length, 0);
  $("updated").textContent = `Consultado em ${new Date().toLocaleString("pt-BR")}`;
  $("moduleCount").textContent = `${number(modules.length)} módulo(s)`;
  $("alertCount").textContent = `${number(alerts.length)} alerta(s)`;
  renderSummary(modules, alerts, totalMetrics);
  renderTrend(data, modules);
  renderModules(modules);
  renderAlerts(alerts);
}

function renderSummary(modules, alerts, totalMetrics) {
  const active = modules.filter((module) => module.status !== "implantacao").length;
  $("resumoGrid").innerHTML = [
    summaryCard("Módulos disponíveis", number(active), "fa-cubes", "blue"),
    summaryCard("Indicadores publicados", number(totalMetrics), "fa-chart-simple", "yellow"),
    summaryCard("Alertas prioritários", number(alerts.length), "fa-bell", alerts.length ? "red" : "green"),
  ].join("");
}

function summaryCard(label, value, icon, tone) {
  return `<div class="painel-summary-card tone-${tone}"><i class="fas ${icon}" aria-hidden="true"></i><div><strong>${value}</strong><span>${label}</span></div></div>`;
}

function renderModules(modules) {
  $("moduleGrid").innerHTML = modules.length ? modules.map(renderModule).join("") : `<div class="painel-empty"><i class="fas fa-cubes" aria-hidden="true"></i><strong>Nenhum módulo executivo disponível</strong><span>Os módulos publicarão indicadores aqui conforme forem integrados à visão municipal.</span></div>`;
}

function renderModule(module) {
  const status = module.status === "implantacao" ? "Em implantação" : "Disponível";
  const metrics = module.metricas.length ? `<div class="painel-metric-grid">${module.metricas.map(renderMetric).join("")}</div>` : `<div class="painel-empty painel-empty-inline"><i class="fas fa-chart-line" aria-hidden="true"></i><span>Este módulo ainda não possui indicadores executivos publicados.</span></div>`;
  const widgets = [...module.widgets.map(renderWidget), ...module.insights.map((text) => `<div class="painel-module-widget"><div class="painel-widget-title"><i class="fas fa-lightbulb" aria-hidden="true"></i><strong>Leitura executiva</strong></div><p>${escapeHtml(text)}</p></div>`)].join("");
  return `<article id="modulo-${escapeHtml(module.id)}" class="painel-module-card tone-${module.cor}" data-module-id="${escapeHtml(module.id)}">
    <header class="painel-module-heading"><div class="painel-module-icon"><i class="fas ${module.icone}" aria-hidden="true"></i></div><div><span class="eyebrow">Módulo setorial</span><h3>${escapeHtml(module.nome)}</h3><p>${escapeHtml(module.descricao)}</p></div><span class="painel-module-status ${module.status === "implantacao" ? "is-planned" : ""}">${status}</span><a class="painel-module-link" href="${escapeHtml(module.rota)}">Abrir módulo <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a></header>
    ${metrics}${widgets ? `<div class="painel-module-widgets">${widgets}</div>` : ""}
  </article>`;
}

function renderMetric(metric) {
  return `<div class="painel-metric ${metric.alert ? "is-alert" : ""}"><i class="fas ${metric.icon}" aria-hidden="true"></i><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></div>`;
}

function renderWidget(widget) {
  if (widget.type === "progress") {
    const value = Math.max(0, Math.min(100, Number(widget.value || 0)));
    return `<div class="painel-module-widget"><div class="painel-widget-title"><strong>${escapeHtml(widget.title || "Disponibilidade")}</strong><b>${value}%</b></div><div class="painel-progress"><span style="width:${value}%"></span></div><div class="painel-widget-labels"><span>${escapeHtml(widget.left || "Disponível")}</span><span>${escapeHtml(widget.right || "Em uso")}</span></div></div>`;
  }
  if (widget.type === "status") {
    const total = Number(widget.total || 0);
    const rows = (widget.rows || []).map(([label, value, tone]) => `<div class="painel-status-row"><span>${escapeHtml(label)}</span><div class="painel-status-track"><i class="tone-${safeTone(tone)}" style="width:${total ? Math.min(100, Number(value || 0) / total * 100) : 0}%"></i></div><b>${number(value)}</b></div>`).join("");
    return `<div class="painel-module-widget"><div class="painel-widget-title"><strong>${escapeHtml(widget.title || "Status")}</strong><b>${number(total)} no período</b></div><div class="painel-status-list">${rows}</div></div>`;
  }
  return "";
}

function renderTrend(data, modules) {
  const trends = Array.isArray(data.tendencias) ? data.tendencias : [];
  const series = Array.isArray(data.series) ? data.series : [
    { id: "biblioteca", label: "Biblioteca", icon: "fa-book-open", tone: "blue", key: "emprestimos" },
    { id: "compras", label: "Compras", icon: "fa-cart-shopping", tone: "yellow", key: "pedidos" },
  ];
  $("trendLegend").innerHTML = series.map((item) => `<span><i class="painel-legend-dot tone-${safeTone(item.tone)}"></i>${escapeHtml(item.label)}</span>`).join("");
  if (!trends.length) {
    $("trendChart").innerHTML = `<div class="painel-empty painel-empty-inline"><i class="fas fa-chart-column" aria-hidden="true"></i><span>Não há séries temporais disponíveis para o período.</span></div>`;
    return;
  }
  const values = trends.flatMap((item) => series.map((serie) => Number(item[serie.key] || item.series?.[serie.id] || 0)));
  const max = Math.max(1, ...values);
  $("trendChart").innerHTML = trends.map((item) => `<div class="painel-trend-column">${series.map((serie) => `<i class="painel-trend-bar tone-${safeTone(serie.tone)}" title="${escapeHtml(serie.label)}: ${number(item[serie.key] || item.series?.[serie.id] || 0)}" style="height:${Math.max(3, Number(item[serie.key] || item.series?.[serie.id] || 0) / max * 100)}%"></i>`).join("")}<small>${escapeHtml(String(item.mes || item.label || "").slice(5))}</small></div>`).join("");
}

function renderAlerts(items) {
  $("alertsList").innerHTML = items.length ? items.map((alert) => `<div class="painel-alert ${Number(alert.prioridade) >= 3 ? "is-critical" : ""}"><i class="fas ${Number(alert.prioridade) >= 3 ? "fa-circle-exclamation" : "fa-triangle-exclamation"}" aria-hidden="true"></i><div><strong>${escapeHtml(alert.titulo || "Alerta executivo")}</strong><span>${escapeHtml(alert.mensagem || "Atenção necessária no módulo responsável.")}</span></div><small>${escapeHtml(alert.modulo || "Município")}</small></div>`).join("") : `<div class="painel-empty"><i class="fas fa-circle-check" aria-hidden="true"></i><strong>Nenhum alerta executivo ativo</strong><span>Não há ocorrências agregadas exigindo atenção no período selecionado.</span></div>`;
}

async function boot() {
  defaultDates();
  $("atualizar").addEventListener("click", load);
  $("tentar").addEventListener("click", load);
  const usuario = await initLayout(layoutConfig());
  if (!usuario) return;
  await load();
}

boot();
