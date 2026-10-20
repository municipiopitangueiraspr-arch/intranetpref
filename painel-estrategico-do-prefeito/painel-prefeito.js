import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js?v=20261017-prefeito-no-brand-1";

const $ = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const has = (object, key) => object && Object.prototype.hasOwnProperty.call(object, key) && object[key] !== null && object[key] !== undefined;
const displayNumber = (object, key) => has(object, key) ? number(object[key]) : "—";
const displayMoney = (object, key) => has(object, key) ? money(object[key]) : "—";
const setUpdated = (text) => { const node = $("updated"); if (node) node.textContent = text; };

function dates() {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - 29);
  $("fim").value = fim.toISOString().slice(0, 10);
  $("inicio").value = inicio.toISOString().slice(0, 10);
}

function renderPanelAvatar(user) {
  const avatar = $("avatarIniciais");
  if (!avatar) return;
  const name = user?.nome || user?.email || "Usuário";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  if (user?.foto_url) {
    const image = document.createElement("img");
    image.className = "avatar-foto";
    image.src = user.foto_url;
    image.alt = `Foto de ${name}`;
    image.addEventListener("error", () => { image.remove(); avatar.textContent = initials; }, { once: true });
    avatar.replaceChildren(image);
  } else {
    avatar.textContent = initials;
  }
}

function layoutConfig() {
  return {
    supabase,
    brand: { nome: "Painel do Prefeito", subtitulo: "Gestão municipal integrada", icone: "fa-landmark" },
    sidebarBrand: false,
    iconeTitulo: "fa-chart-line",
    titulo: "Painel Estratégico",
    subtitulo: "Visão integrada da gestão municipal",
    moduloAtivo: "visao-agregada",
    menu: [{ section: "Gestão municipal", itens: [
      { id: "visao-agregada", rota: "#visao-geral", icone: "fa-table-cells-large", label: "Visão executiva" },
      { id: "leitura-executiva", rota: "#leitura-executiva", icone: "fa-compass", label: "Saúde da gestão" },
      { id: "saude-atas", rota: "#saude-atas", icone: "fa-file-contract", label: "Atas e saldos" },
      { id: "reconciliacao-financeira", rota: "#reconciliacao-financeira", icone: "fa-scale-balanced", label: "Reconciliação financeira" },
      { id: "pedidos-decisoes", rota: "#pedidos-decisoes", icone: "fa-clipboard-check", label: "Pedidos e decisões" },
      { id: "cobertura-modulos", rota: "#cobertura-modulos", icone: "fa-layer-group", label: "Mapa das secretarias" },
      { id: "alertas", rota: "#alertas", icone: "fa-bell", label: "Riscos e decisões" },
    ] }],
    rotaVoltar: "../intranet.html",
    textoVoltar: "Voltar à intranet",
    menuUsuario: { rotaPerfil: "../perfil.html", rotaAjuda: "#alertas" },
  };
}

let requestSequence = 0;
let currentData = {};

async function load() {
  const sequence = ++requestSequence;
  setUpdated("Consultando indicadores...");
  try {
    const timeout = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000))]);
    const results = await Promise.allSettled([
      timeout(supabase.rpc("prefeito_painel_dados", { p_inicio: $("inicio").value, p_fim: $("fim").value })),
      timeout(supabase.rpc("prefeito_painel_reconciliacao", { p_inicio: $("inicio").value, p_fim: $("fim").value })),
    ]);
    const painelResult = results[0].status === "fulfilled" ? results[0].value : { error: results[0].reason };
    const reconResult = results[1].status === "fulfilled" ? results[1].value : { error: results[1].reason };
    if (sequence !== requestSequence) return;
    if (painelResult.error) throw painelResult.error;
    currentData = { ...(painelResult.data || {}), reconciliacao_financeira: reconResult.error ? { status: "INDISPONIVEL", resumo: {}, avisos: ["A fonte de reconciliação não respondeu nesta sessão."] } : (reconResult.data || {}) };
    render(currentData);
    setUpdated(`Atualizado em ${new Date().toLocaleString("pt-BR")}`);
  } catch (error) {
    if (sequence !== requestSequence) return;
    console.error("[painel-prefeito] atualização", error);
    currentData = {};
    render({});
    setUpdated("Dados executivos indisponíveis no momento");
  }
}

function render(data) {
  const compras = data.compras || {};
  const trends = Array.isArray(data.tendencias) ? data.tendencias : [];
  const alerts = Array.isArray(data.alertas) ? data.alertas : [];
  const reconciliation = data.reconciliacao_financeira || {};
  const reconSummary = reconciliation.resumo || {};
  const reconReady = reconciliation.status === "CANDIDATO_RECONCILIADO";
  const contracted = has(compras, "valor_global_atas") ? Number(compras.valor_global_atas) : null;
  const balance = has(compras, "saldo_valor") ? Number(compras.saldo_valor) : null;
  const consumed = has(compras, "valor_consumido") ? Number(compras.valor_consumido) : contracted !== null && balance !== null ? Math.max(0, contracted - balance) : null;
  const reconContracted = reconReady && has(reconSummary, "contratado_valor") ? Number(reconSummary.contratado_valor) : null;
  const reconBalance = reconReady && has(reconSummary, "saldo_derivado_valor") ? Number(reconSummary.saldo_derivado_valor) : null;
  const reconConsumed = reconReady && has(reconSummary, "consumido_valor") ? Number(reconSummary.consumido_valor) : null;
  const reconExecution = reconContracted && reconConsumed !== null ? Math.max(0, Math.min(100, reconConsumed / reconContracted * 100)) : null;
  const pending = has(compras, "pedidos_pendentes") ? Number(compras.pedidos_pendentes) : null;
  const expiring = has(compras, "atas_a_vencer_30_dias") ? Number(compras.atas_a_vencer_30_dias) : null;

  $("summaryGrid").innerHTML = [
    summary("Valor vigente", contracted === null ? "—" : money(contracted), "fa-sack-dollar", "blue"),
    summary("Saldo reconciliado", reconBalance === null ? "—" : money(reconBalance), "fa-wallet", reconBalance === null ? "amber" : "green"),
    summary("Execução reconciliada", reconExecution === null ? "—" : `${Math.round(reconExecution)}%`, "fa-chart-line", reconExecution !== null && reconExecution >= 80 ? "red" : "green"),
    summary("Pedidos no período", displayNumber(compras, "pedidos_periodo"), "fa-clipboard-list", "blue"),
    summary("Aguardando decisão", pending === null ? "—" : number(pending), "fa-hourglass-half", pending ? "red" : "green"),
    summary("Atas vencendo em 30 dias", expiring === null ? "—" : number(expiring), "fa-calendar-xmark", expiring ? "red" : "green"),
  ].join("");

  renderExecutiveReading(compras, pending, expiring, reconExecution, reconciliation);
  renderHealth(compras, contracted, balance, consumed, execution);
  renderReconciliation(reconciliation);
  renderOrders(compras);
  renderCoverage();
  renderTrend(trends);
  renderAlerts(alerts, compras);
}

function renderExecutiveReading(c, pending, expiring, execution, reconciliation) {
  const facts = [];
  if (pending !== null) facts.push(pending ? `${number(pending)} pedido(s) aguardam decisão.` : "Não há pedidos pendentes no recorte informado.");
  if (expiring !== null) facts.push(expiring ? `${number(expiring)} ata(s) vencem em até 30 dias.` : "Não há atas vencendo em até 30 dias.");
  if (execution !== null) facts.push(`A execução financeira reconciliada está em ${Math.round(execution)}%.`);
  if (reconciliation?.status === "PENDENTE_VALIDACAO") facts.push("A reconciliação financeira está pendente de validação por divergências ou fontes operacionais incompletas.");
  if (!facts.length) facts.push("Não há dados executivos suficientes para produzir uma leitura automática nesta sessão.");
  $("executiveReading").innerHTML = `<div class="painel-reading-main"><i class="fas fa-compass" aria-hidden="true"></i><div><strong>Leitura baseada no módulo disponível</strong><p>${escapeHtml(facts.join(" "))}</p></div></div><div class="painel-reading-scope"><i class="fas fa-circle-info" aria-hidden="true"></i><span>Administração, Saúde, Educação e demais secretarias aparecem no mapa abaixo, mas seus indicadores operacionais ainda estão em construção.</span></div>`;
  const priorities = [];
  if (pending) priorities.push(priority("Decisão", `${number(pending)} pedido(s) pendentes`, "Priorizar análise e autoridade responsável.", "high"));
  if (expiring) priorities.push(priority("Continuidade", `${number(expiring)} ata(s) vencendo`, "Verificar saldo, gestor, fiscal e próximo procedimento.", "medium"));
  if (execution !== null && execution >= 80) priorities.push(priority("Execução", `${Math.round(execution)}% consumido`, "Avaliar disponibilidade futura e risco de interrupção.", "medium"));
  if (!priorities.length) priorities.push(priority("Acompanhamento", "Sem alerta crítico calculado", "Manter atualização e ampliar fontes por secretaria.", "info"));
  $("priorityGrid").innerHTML = priorities.join("");
}

function renderHealth(c, contracted, balance, consumed, execution) {
  $("healthGrid").innerHTML = [
    health("Atas vigentes", displayNumber(c, "atas_ativas"), "fa-file-signature"),
    health("Entregas parciais", displayNumber(c, "entregas_parciais"), "fa-truck-ramp-box", has(c, "entregas_parciais") && Number(c.entregas_parciais) > 0),
    health("Ocorrências abertas", displayNumber(c, "ocorrencias_abertas"), "fa-triangle-exclamation", has(c, "ocorrencias_abertas") && Number(c.ocorrencias_abertas) > 0),
    health("Valor solicitado", displayMoney(c, "valor_pedidos_periodo"), "fa-receipt"),
  ].join("");
  const safeExecution = execution === null ? 0 : Math.max(0, Math.min(100, execution));
  $("executionPct").className = execution !== null && execution >= 80 ? "risco" : "saudavel";
  $("executionPct").textContent = execution === null ? "—" : `${Math.round(execution)}%`;
  $("executionBar").className = `painel-progress-large ${execution !== null && execution >= 80 ? "risco" : "saudavel"}`;
  $("executionBar").value = safeExecution;
  $("consumedValue").textContent = consumed === null ? "—" : money(consumed);
  $("balanceValue").textContent = balance === null ? "—" : money(balance);
  $("healthReading").textContent = contracted === null || balance === null ? "A fonte operacional legada não retornou valor contratado e saldo armazenado suficientes. O saldo oficial depende da seção de Reconciliação financeira." : `A fonte operacional legada informa ${money(contracted)} de valor global, ${money(consumed || 0)} consumido e ${money(balance)} armazenado. O saldo oficial depende da reconciliação por item. ${Number(c.atas_a_vencer_30_dias || 0) ? `Há ${number(c.atas_a_vencer_30_dias)} ata(s) vencendo em até 30 dias; recomenda-se revisar a continuidade.` : "Não há atas vigentes vencendo nos próximos 30 dias."}`;
}

function renderReconciliation(payload) {
  const status = payload?.status || "INDISPONIVEL";
  const summaryData = payload?.resumo || {};
  const statusNode = $("reconStatus");
  const detailNode = $("reconStatusDetail");
  const metricsNode = $("reconMetrics");
  const formulaNode = $("reconFormula");
  const evidenceNode = $("reconEvidence");
  const labels = { CANDIDATO_RECONCILIADO: "Candidato reconciliado", PENDENTE_VALIDACAO: "Pendente de validação", INDISPONIVEL: "Fonte indisponível" };
  const tones = { CANDIDATO_RECONCILIADO: "status-badge--real", PENDENTE_VALIDACAO: "status-badge--construction", INDISPONIVEL: "status-badge--info" };
  if (statusNode) { statusNode.textContent = labels[status] || status; statusNode.className = `painel-section-count status-badge ${tones[status] || "status-badge--info"}`; }
  const divergence = has(summaryData, "divergencia_qtd") ? Number(summaryData.divergencia_qtd) : null;
  const divergenceValue = has(summaryData, "divergencia_valor") ? Number(summaryData.divergencia_valor) : null;
  const pendingReservations = has(summaryData, "reservas_ativas_pendentes_qtd") ? Number(summaryData.reservas_ativas_pendentes_qtd) : null;
  if (detailNode) detailNode.innerHTML = status === "PENDENTE_VALIDACAO" ? `<i class="fas fa-triangle-exclamation" aria-hidden="true"></i><strong>O painel não declara o saldo como oficial.</strong><span>Há divergências ou eventos operacionais cuja regra ainda precisa de validação.</span>` : status === "CANDIDATO_RECONCILIADO" ? `<i class="fas fa-circle-check" aria-hidden="true"></i><strong>Fórmula candidata sem bloqueios detectados.</strong><span>O resultado ainda deve ser homologado antes de ser tratado como indicador oficial.</span>` : `<i class="fas fa-circle-info" aria-hidden="true"></i><strong>Reconciliação indisponível nesta sessão.</strong><span>Os cartões financeiros permanecem sem valor reconciliado.</span>`;
  if (metricsNode) metricsNode.innerHTML = [
    reconMetric("Contratado", has(summaryData, "contratado_valor") ? money(summaryData.contratado_valor) : "—", "fa-file-contract"),
    reconMetric("Saldo derivado", has(summaryData, "saldo_derivado_valor") ? money(summaryData.saldo_derivado_valor) : "—", "fa-scale-balanced", status === "PENDENTE_VALIDACAO"),
    reconMetric("Divergência de quantidade", divergence === null ? "—" : number(Math.abs(divergence)), "fa-arrows-left-right", divergence !== null && Math.abs(divergence) > 0.0001),
    reconMetric("Reservas pendentes", pendingReservations === null ? "—" : number(pendingReservations), "fa-hourglass-half", pendingReservations !== null && pendingReservations > 0),
    reconMetric("Consumo registrado", has(summaryData, "consumido_valor") ? money(summaryData.consumido_valor) : "—", "fa-chart-line"),
    reconMetric("Entregue registrado", has(summaryData, "entregue_qtd") ? number(summaryData.entregue_qtd) : "—", "fa-truck"),
  ].join("");
  if (formulaNode) formulaNode.textContent = summaryData.formula_aplicada || "Fórmula não disponível.";
  if (evidenceNode) evidenceNode.textContent = `Itens: ${has(summaryData, "itens_total") ? number(summaryData.itens_total) : "—"} · Itens divergentes: ${has(summaryData, "itens_com_divergencia") ? number(summaryData.itens_com_divergencia) : "—"} · Divergência financeira: ${divergenceValue === null ? "—" : money(divergenceValue)}`;
}
function reconMetric(label, value, icon, alert = false) { return `<div class="painel-recon-metric ${alert ? "is-alert" : ""}"><i class="fas ${icon}" aria-hidden="true"></i><div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div></div>`; }

function renderOrders(c) {
  const orders = has(c, "pedidos_periodo") ? Number(c.pedidos_periodo) : null;
  const pending = has(c, "pedidos_pendentes") ? Number(c.pedidos_pendentes) : null;
  const approved = has(c, "pedidos_aprovados") ? Number(c.pedidos_aprovados) : null;
  const rejected = has(c, "pedidos_rejeitados") ? Number(c.pedidos_rejeitados) : null;
  $("ordersTotal").textContent = orders === null ? "—" : `${number(orders)} no período`;
  $("ordersFunnel").innerHTML = [funnel("Aguardando análise", pending, orders, "pending"), funnel("Aprovados", approved, orders, "approved"), funnel("Rejeitados/cancelados", rejected, orders, "rejected")].join("");
  $("decisionGrid").innerHTML = decision("Valor solicitado", displayMoney(c, "valor_pedidos_periodo"), "fa-money-bill-trend-up") + decision("Entregas parciais", displayNumber(c, "entregas_parciais"), "fa-truck-ramp-box") + decision("Ocorrências abertas", displayNumber(c, "ocorrencias_abertas"), "fa-triangle-exclamation");
}

function renderCoverage() {
  const areas = [
    ["Administração", "Estrutura, pessoas, acessos e decisões administrativas.", "em-construcao", "fa-building"],
    ["Saúde", "Atendimento, produção, filas, cobertura e resultados de saúde.", "em-construcao", "fa-heart-pulse"],
    ["Educação", "Matrículas, frequência, aprendizagem, transporte e rede escolar.", "em-construcao", "fa-school"],
    ["Assistência Social", "Benefícios, famílias, serviços e acompanhamento da proteção social.", "em-construcao", "fa-hands-holding-child"],
    ["Obras e infraestrutura", "Projetos, execução física, prazos, contratos e entregas.", "em-construcao", "fa-road"],
    ["Compras e contratos", "Atas, saldos e pedidos são a primeira fonte disponível.", "disponivel", "fa-file-signature"],
    ["Finanças", "Receitas, despesas, empenhos, liquidação e execução orçamentária.", "em-construcao", "fa-chart-pie"],
    ["Gestão de pessoas", "Lotação, força de trabalho, férias e responsabilidades.", "em-construcao", "fa-users"],
    ["Atos e transparência", "Atos oficiais, documentos, prazos e prestação de informações.", "em-construcao", "fa-scale-balanced"],
  ];
  $("moduleCoverage").innerHTML = areas.map(([title, description, state, icon]) => `<article class="painel-module-card ${state}"><span class="painel-module-icon"><i class="fas ${icon}" aria-hidden="true"></i></span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div><span class="status-badge ${state === "disponivel" ? "status-badge--real" : "status-badge--construction"}">${state === "disponivel" ? "Dados disponíveis" : "Em construção"}</span></article>`).join("");
}

function renderTrend(items) {
  $("trendLegend").innerHTML = `<span><i class="painel-legend-dot tone-blue"></i>Pedidos realizados</span>`;
  if (!items.length) { $("trendChart").innerHTML = empty("fa-chart-column", "Sem dados suficientes para calcular tendência mensal."); return; }
  const max = Math.max(1, ...items.map((item) => Number(item.pedidos || 0)));
  $("trendChart").innerHTML = items.map((item) => { const percent = Math.max(4, Number(item.pedidos || 0) / max * 100); const band = Math.max(1, Math.min(20, Math.ceil(percent / 5))); return `<div class="painel-trend-column"><i class="painel-trend-bar tone-blue bar-${band}" title="${number(item.pedidos)} pedidos"></i><small>${escapeHtml(String(item.mes || "").slice(5))}</small></div>`; }).join("");
}

function renderAlerts(items, c) {
  const alerts = [...items];
  if (has(c, "pedidos_pendentes") && Number(c.pedidos_pendentes) > 0) alerts.unshift({ prioridade: 3, titulo: "Pedidos aguardando decisão", mensagem: `${number(c.pedidos_pendentes)} pedido(s) exigem análise no período atual.`, modulo: "Pedidos" });
  if (has(c, "atas_a_vencer_30_dias") && Number(c.atas_a_vencer_30_dias) > 0) alerts.push({ prioridade: 2, titulo: "Atas próximas do vencimento", mensagem: `${number(c.atas_a_vencer_30_dias)} ata(s) vencem em até 30 dias.`, modulo: "Atas" });
  $("alertCount").textContent = `${number(alerts.length)} ponto(s) de atenção`;
  $("alertsList").innerHTML = alerts.length ? alerts.map((item) => `<div class="ui-card painel-alert ${Number(item.prioridade) >= 3 ? "is-critical" : ""}"><i class="fas ${Number(item.prioridade) >= 3 ? "fa-circle-exclamation" : "fa-triangle-exclamation"}" aria-hidden="true"></i><div><strong>${escapeHtml(item.titulo || "Alerta executivo")}</strong><span>${escapeHtml(item.mensagem || "Acompanhamento necessário.")}</span></div><small>${escapeHtml(item.modulo || "Módulo disponível")}</small></div>`).join("") : empty("fa-circle-check", "Nenhum alerta executivo ativo nos dados disponíveis.");
}

function summary(label, value, icon, tone) { return `<div class="painel-summary-card tone-${tone}"><i class="fas ${icon}" aria-hidden="true"></i><div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div></div>`; }
function health(label, value, icon, alert = false) { return `<div class="ui-card painel-health-card ${alert ? "is-alert" : ""}"><i class="fas ${icon}" aria-hidden="true"></i><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`; }
function funnel(label, value, total, tone) { const available = value !== null && total !== null; const pct = available && total ? Math.min(100, Number(value) / total * 100) : 0; return `<div class="painel-funnel-row"><div><span>${escapeHtml(label)}</span><b>${available ? number(value) : "—"}</b></div><progress class="painel-funnel-track ${tone}" max="100" value="${pct}" aria-label="${escapeHtml(label)}"></progress><small>${available ? `${Math.round(pct)}% do período` : "Sem dados suficientes"}</small></div>`; }
function decision(label, value, icon) { return `<div class="ui-card painel-decision-card"><i class="fas ${icon}" aria-hidden="true"></i><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`; }
function priority(label, title, detail, tone) { return `<article class="painel-priority-card ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></article>`; }
function empty(icon, text) { return `<div class="ui-empty painel-empty"><i class="fas ${icon}" aria-hidden="true"></i><span>${escapeHtml(text)}</span></div>`; }

async function boot() {
  dates();
  $("atualizar").addEventListener("click", load);
  try { const user = await initLayout(layoutConfig()); if (user) { const displayName = user.nome || user.email || "Usuário"; const display = document.getElementById("saudacaoMiniNome"); if (display) display.textContent = displayName; renderPanelAvatar(user); await load(); } } catch (error) { console.error("[painel-prefeito] inicialização", error); render({}); setUpdated("Dados executivos indisponíveis no momento"); }
}

boot();
