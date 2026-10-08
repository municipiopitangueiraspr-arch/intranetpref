import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js";

const $ = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const setUpdated = (text) => { const node = $("updated"); if (node) node.textContent = text; };

function dates() { const fim = new Date(); const inicio = new Date(fim); inicio.setDate(fim.getDate() - 29); $("fim").value = fim.toISOString().slice(0, 10); $("inicio").value = inicio.toISOString().slice(0, 10); }
function layoutConfig() { return { supabase, brand: { nome: "Visão Executiva", subtitulo: "Gestão municipal", icone: "fa-landmark" }, iconeTitulo: "fa-chart-line", titulo: "Visão Executiva", subtitulo: "Atas, saldos e pedidos", moduloAtivo: "visao-executiva", menu: [{ section: "Gestão municipal", itens: [{ id: "visao-executiva", rota: "#visao-geral", icone: "fa-table-cells-large", label: "Visão geral" }, { id: "saude-atas", rota: "#saude-atas", icone: "fa-file-contract", label: "Saúde das atas" }, { id: "pedidos-decisoes", rota: "#pedidos-decisoes", icone: "fa-clipboard-check", label: "Pedidos e decisões" }, { id: "alertas", rota: "#alertas", icone: "fa-bell", label: "Alertas executivos" }] }], rotaVoltar: "../intranet.html", textoVoltar: "Voltar à intranet", menuUsuario: { rotaPerfil: "../perfil.html", rotaAjuda: "#alertas" } }; }

let requestSequence = 0;

async function load() {
  const sequence = ++requestSequence;
  try {
    const request = supabase.rpc("prefeito_painel_dados", { p_inicio: $("inicio").value, p_fim: $("fim").value });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000));
    const { data, error } = await Promise.race([request, timeout]);
    if (sequence !== requestSequence) return;
    if (error) throw error;
    render(data || {});
    setUpdated(`Atualizado em ${new Date().toLocaleString("pt-BR")}`);
  } catch (error) {
    if (sequence !== requestSequence) return;
    console.error("[painel-prefeito] atualização silenciosa", error);
    render({});
    setUpdated("Dados executivos indisponíveis no momento");
  }
}

function render(data) {
  const c = data.compras || {}; const trends = data.tendencias || []; const alerts = data.alertas || [];
  const contracted = Number(c.valor_global_atas || 0); const balance = Number(c.saldo_valor || 0); const fallbackConsumed = Math.max(0, contracted - balance); const consumed = Number.isFinite(Number(c.valor_consumido)) ? Math.max(0, Number(c.valor_consumido)) : fallbackConsumed; const execution = Number.isFinite(Number(c.execucao_financeira_percentual)) ? Math.max(0, Math.min(100, Number(c.execucao_financeira_percentual))) : (contracted ? Math.max(0, Math.min(100, Math.round(consumed / contracted * 100))) : 0); const orders = Number(c.pedidos_periodo || 0); const pending = Number(c.pedidos_pendentes || 0); const approved = Number(c.pedidos_aprovados || 0); const rejected = Number(c.pedidos_rejeitados || 0);
  setUpdated(`Consultado em ${new Date().toLocaleString("pt-BR")}`); $("alertCount").textContent = `${number(alerts.length)} alerta(s)`;
  $("summaryGrid").innerHTML = [summary("Valor vigente", money(contracted), "fa-sack-dollar", "blue"), summary("Saldo disponível vigente", money(balance), "fa-wallet", "green"), summary("Execução financeira vigente", `${execution}%`, "fa-chart-line", execution >= 80 ? "yellow" : "blue"), summary("Pedidos no período", number(orders), "fa-clipboard-list", "yellow"), summary("Aguardando decisão", number(pending), "fa-hourglass-half", pending ? "red" : "green"), summary("Atas vencendo em 30 dias", number(c.atas_a_vencer_30_dias), "fa-calendar-xmark", Number(c.atas_a_vencer_30_dias) ? "red" : "green")].join("");
  $("healthGrid").innerHTML = [health("Atas vigentes", number(c.atas_ativas), "fa-file-signature"), health("Entregas parciais", number(c.entregas_parciais), "fa-truck-ramp-box", c.entregas_parciais), health("Ocorrências abertas", number(c.ocorrencias_abertas), "fa-triangle-exclamation", c.ocorrencias_abertas), health("Valor solicitado", money(c.valor_pedidos_periodo), "fa-receipt")].join("");
  $("executionPct").textContent = `${execution}%`; $("executionBar").style.width = `${execution}%`; $("consumedValue").textContent = money(consumed); $("balanceValue").textContent = money(balance);
  $("healthReading").textContent = contracted ? `Do valor global vigente de ${money(contracted)}, ${money(consumed)} já foi consumido e ${money(balance)} permanece disponível. ${Number(c.atas_a_vencer_30_dias) ? `Há ${number(c.atas_a_vencer_30_dias)} ata(s) vencendo em até 30 dias; recomenda-se revisar a continuidade antes de novas solicitações.` : "Não há atas vigentes vencendo nos próximos 30 dias."}` : "Ainda não há valor global de atas vigente suficiente para calcular a execução financeira.";
  $("ordersTotal").textContent = `${number(orders)} no período`; $("ordersFunnel").innerHTML = funnel("Aguardando análise", pending, orders, "pending") + funnel("Aprovados", approved, orders, "approved") + funnel("Rejeitados/cancelados", rejected, orders, "rejected");
  $("decisionGrid").innerHTML = decision("Valor solicitado", money(c.valor_pedidos_periodo), "fa-money-bill-trend-up") + decision("Entregas parciais", number(c.entregas_parciais), "fa-truck-ramp-box") + decision("Ocorrências abertas", number(c.ocorrencias_abertas), "fa-triangle-exclamation");
  renderTrend(trends); renderAlerts(alerts);
}
function summary(label, value, icon, tone) { return `<div class="painel-summary-card tone-${tone}"><i class="fas ${icon}" aria-hidden="true"></i><div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div></div>`; }
function health(label, value, icon, alert = false) { return `<div class="painel-health-card ${alert ? "is-alert" : ""}"><i class="fas ${icon}" aria-hidden="true"></i><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`; }
function funnel(label, value, total, tone) { const pct = total ? Math.min(100, Number(value) / total * 100) : 0; return `<div class="painel-funnel-row"><div><span>${escapeHtml(label)}</span><b>${number(value)}</b></div><div class="painel-funnel-track"><i class="${tone}" style="width:${pct}%"></i></div><small>${Math.round(pct)}% do período</small></div>`; }
function decision(label, value, icon) { return `<div class="painel-decision-card"><i class="fas ${icon}" aria-hidden="true"></i><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`; }
function renderTrend(items) { $("trendLegend").innerHTML = `<span><i class="painel-legend-dot tone-blue"></i>Pedidos realizados</span>`; if (!items.length) { $("trendChart").innerHTML = empty("fa-chart-column", "Não há tendência mensal disponível para o período."); return; } const max = Math.max(1, ...items.map((item) => Number(item.pedidos || 0))); $("trendChart").innerHTML = items.map((item) => `<div class="painel-trend-column"><i class="painel-trend-bar tone-blue" style="height:${Math.max(4, Number(item.pedidos || 0) / max * 100)}%" title="${number(item.pedidos)} pedidos"></i><small>${escapeHtml(String(item.mes || "").slice(5))}</small></div>`).join(""); }
function renderAlerts(items) { $("alertsList").innerHTML = items.length ? items.map((item) => `<div class="painel-alert ${Number(item.prioridade) >= 3 ? "is-critical" : ""}"><i class="fas ${Number(item.prioridade) >= 3 ? "fa-circle-exclamation" : "fa-triangle-exclamation"}" aria-hidden="true"></i><div><strong>${escapeHtml(item.titulo || "Alerta executivo")}</strong><span>${escapeHtml(item.mensagem || "Acompanhamento necessário.")}</span></div><small>${escapeHtml(item.modulo || "compras")}</small></div>`).join("") : empty("fa-circle-check", "Nenhum alerta executivo ativo no momento."); }
function empty(icon, text) { return `<div class="painel-empty"><i class="fas ${icon}" aria-hidden="true"></i><span>${escapeHtml(text)}</span></div>`; }

async function boot() {
  dates();
  $("atualizar").addEventListener("click", load);
  try {
    const user = await initLayout(layoutConfig());
    if (user) await load();
  } catch (error) {
    console.error("[painel-prefeito] inicialização", error);
    render({});
    setUpdated("Dados executivos indisponíveis no momento");
  }
}
boot();
