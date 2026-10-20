import { supabase } from "./shared/js/supabase.js";
import { AuthGuard } from "./shared/js/auth-guard.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  units: [], users: [], links: [], designations: [], managers: [], permissions: [], pendings: [], audits: [], logins: [], atas: [], orders: [], reserves: [], consumptions: [],
  errors: [], sourceErrors: {}, sourceCounts: {}, emptySources: {}, truncatedSources: {}, views: {}, filter: "", period: "30d", currentUser: null, refreshedAt: null,
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const fmtInt = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const fmtMoney = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const fmtDate = (value) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const daysFromNow = (value) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null;
const typeLabel = (value) => ({ PREFEITURA: "Prefeitura", SECRETARIA: "Secretaria", DEPARTAMENTO: "Departamento", DIVISAO: "Divisão", SUBDIVISAO: "Subdivisão", PROCURADORIA: "Procuradoria", GABINETE: "Gabinete", ASSESSORIA: "Assessoria", CONSELHO: "Conselho", COMISSAO: "Comissão", REDE: "Rede", AUTARQUIA: "Autarquia", CAMARA: "Câmara", OUTRO: "Outro" }[value] || value || "—");
const closedStatuses = ["resolvida", "resolvido", "concluida", "concluído", "fechada", "fechado"];
const pendingStatuses = ["AGUARDANDO_APROVACAO", "PENDENTE", "EM_ANALISE", "AGUARDANDO"];
const PERIOD_LABELS = { "24h": "últimas 24 horas", "7d": "últimos 7 dias", "30d": "últimos 30 dias", "180d": "últimos 180 dias" };
const PERIOD_MS = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 86400000, "30d": 30 * 86400000, "180d": 180 * 86400000 };
const ROW_PAGE_SIZE = 500;
const MAX_FETCH_ROWS = 10000;
const LOGIN_PAGE_SIZE = 50;
const MAX_LOGIN_ROWS = 1000;
const requestId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `gov-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function toast(message, error = false) { const node = $("#toast"); node.textContent = message; node.className = `gov-toast is-visible${error ? " error" : ""}`; window.setTimeout(() => node.classList.remove("is-visible"), 4500); }
function setDataState(message, error = false) { const node = $("#dataState"); node.innerHTML = error ? `<i class="fas fa-triangle-exclamation"></i> ${esc(message)}` : `<i class="fas fa-circle-check"></i> ${esc(message)}`; node.classList.toggle("is-error", error); }
function periodStart() { return new Date(Date.now() - (PERIOD_MS[state.period] || PERIOD_MS["30d"])); }
function activeInPeriod(value) {
  if (!value) return false;
  const date = new Date(value).getTime();
  return Number.isFinite(date) && date >= periodStart().getTime() && date <= Date.now();
}
function periodLabel() { return PERIOD_LABELS[state.period] || PERIOD_LABELS["30d"]; }
function ordersInSelectedPeriod() { return state.orders.filter((item) => activeInPeriod(item.data_solicitacao)); }
function reservesInSelectedPeriod() { return state.reserves.filter((item) => activeInPeriod(item.criada_em)); }
function consumptionsInSelectedPeriod() { return state.consumptions.filter((item) => activeInPeriod(item.data_consumo)); }
function textMatch(...values) { const q = state.filter.toLowerCase().trim(); return !q || values.some((value) => String(value ?? "").toLowerCase().includes(q)); }
function emptyRow(columns, message = "Nenhum dado encontrado para os filtros atuais.") { return `<tr><td colspan="${columns}" class="gov-empty">${esc(message)}</td></tr>`; }
function pill(value, tone = "") { return `<span class="gov-pill ${tone}">${esc(value)}</span>`; }
function kpi(icon, tone, value, label, meta = "") { return `<article class="gov-kpi"><span class="gov-kpi-icon ${tone}"><i class="fas ${icon}"></i></span><div><strong>${esc(value)}</strong><span>${esc(label)}</span>${meta ? `<small>${esc(meta)}</small>` : ""}</div></article>`; }
function indicator(code, label, value, detail, tone = "info", action = "") { return `<article class="gov-indicator ${tone}"><div><span class="gov-indicator-code">${esc(code)}</span><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(detail)}</small>${action ? `<em>${esc(action)}</em>` : ""}</div></article>`; }
function unavailable(label) { return !state.sourceErrors[label]; }
function sourceUnavailable(label) {
  if (["auditoria", "login"].includes(label) && state.currentUser?.perfil !== "ADMIN") return "Restrito ao perfil ADMIN pelo contrato do banco";
  if (state.sourceErrors[label]) return "Fonte indisponível nesta sessão";
  if (state.truncatedSources[label]) return "Amostra atingiu o limite; total parcial";
  if (state.emptySources[label]) return "Consulta concluída sem registros acessíveis";
  return "";
}
function metricCount(value, labels) {
  const sources = labels.filter(Boolean);
  if (sources.some((label) => state.sourceErrors[label])) return "—";
  if (sources.some((label) => state.truncatedSources[label])) return "Parcial";
  if (sources.length && sources.every((label) => state.sourceCounts[label] === 0)) return "Sem registros";
  return fmtInt(value);
}
function hasCriticalSourceGap() { return ["unidades", "usuários", "permissões", "auditoria"].some((label) => state.sourceErrors[label] || state.emptySources[label] || state.truncatedSources[label]); }
function activeManagers() {
  const now = new Date();
  return state.managers.filter((manager) => (!manager.data_inicio || new Date(manager.data_inicio) <= now) && (!manager.data_fim || new Date(manager.data_fim) >= now));
}
function activeLinks() { return state.links.filter((link) => link.ativo !== false && (!link.valido_de || new Date(link.valido_de) <= new Date()) && (!link.valido_ate || new Date(link.valido_ate) >= new Date())); }
function activeDesignations() { return state.designations.filter((item) => item.ativa !== false && (!item.vigencia_inicio || new Date(item.vigencia_inicio) <= new Date()) && (!item.vigencia_fim || new Date(item.vigencia_fim) >= new Date())); }
function activePermissions() { return state.permissions.filter((item) => item.permitido !== false && (!item.valido_de || new Date(item.valido_de) <= new Date()) && (!item.valido_ate || new Date(item.valido_ate) >= new Date())); }
function openPendings() { return state.pendings.filter((item) => !closedStatuses.includes(String(item.status || "").toLowerCase())); }
function usersById() { return new Map(state.users.map((item) => [String(item.id), item])); }
function unitsById() { return new Map(state.units.map((item) => [String(item.id), item])); }
function unitName(id) { const unit = unitsById().get(String(id)); return unit ? `${unit.codigo || ""} · ${unit.nome}` : (id ? `Unidade #${id}` : "Sem unidade"); }
function userName(id) { const user = usersById().get(String(id)); return user ? (user.nome || user.email) : (id ? `Usuário #${id}` : "Não identificado"); }
function daysOpen(value) { return value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)) : null; }

async function rows(label, buildQuery) {
  try {
    const collected = [];
    for (let offset = 0; offset < MAX_FETCH_ROWS; offset += ROW_PAGE_SIZE) {
      const result = await buildQuery().range(offset, Math.min(offset + ROW_PAGE_SIZE - 1, MAX_FETCH_ROWS - 1));
      if (result.error) throw result.error;
      const batch = result.data || [];
      collected.push(...batch);
      if (batch.length < ROW_PAGE_SIZE) break;
    }
    if (collected.length === MAX_FETCH_ROWS) {
      const probe = await buildQuery().range(MAX_FETCH_ROWS, MAX_FETCH_ROWS);
      if (probe.error) throw probe.error;
      if ((probe.data || []).length) state.truncatedSources[label] = true;
    }
    state.sourceCounts[label] = collected.length;
    if (!collected.length) state.emptySources[label] = true;
    return collected;
  } catch (error) {
    state.errors.push(`${label}: ${error.message || error}`);
    state.sourceErrors[label] = error.message || String(error);
    state.sourceCounts[label] = 0;
    return [];
  }
}

async function adminSecurityLoginRows(period = state.period) {
  const label = "login";
  try {
    const first = await supabase.rpc("admin_security_activity", { p_category: "access", p_period: period, p_search: "", p_page: 0, p_page_size: LOGIN_PAGE_SIZE });
    if (first.error) throw first.error;
    const firstData = first.data || {};
    const total = Number(firstData.total || 0);
    const pageCount = Math.min(Math.ceil(total / LOGIN_PAGE_SIZE), MAX_LOGIN_ROWS / LOGIN_PAGE_SIZE);
    const pages = [firstData.items || []];
    for (let batchStart = 1; batchStart < pageCount; batchStart += 5) {
      const pageNumbers = Array.from({ length: Math.min(5, pageCount - batchStart) }, (_, index) => batchStart + index);
      const results = await Promise.all(pageNumbers.map((page) => supabase.rpc("admin_security_activity", { p_category: "access", p_period: period, p_search: "", p_page: page, p_page_size: LOGIN_PAGE_SIZE })));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      pages.push(...results.map((result) => result.data?.items || []));
    }
    if (total > MAX_LOGIN_ROWS) state.truncatedSources[label] = true;
    const events = pages.flat().filter((item) => String(item.event_type || "").toLowerCase() === "login").map((item) => ({
      id: item.event_id,
      outcome: item.outcome,
      provider: item.source,
      created_at: item.event_at,
      reason_code: item.reason_code,
      identifier_masked: item.identifier_masked,
      actor: item.actor,
      ip_address: item.ip_address,
    }));
    state.sourceCounts[label] = events.length;
    if (!events.length) state.emptySources[label] = true;
    return events;
  } catch (error) {
    state.errors.push(`${label}: ${error.message || error}`);
    state.sourceErrors[label] = error.message || String(error);
    state.sourceCounts[label] = 0;
    return [];
  }
}

const databaseViewDefinitions = [
  { key: "summary", source: "view:vw_governanca_resumo", table: "vw_governanca_resumo", title: "Resumo oficial de governança", description: "Indicadores retornados pela view municipal de resumo.", target: "summaryViewData", mode: "metrics", fields: "atualizado_em,unidades_ativas,unidades_inativas,usuarios_ativos,vinculos_ativos,designacoes_vigentes,gestores_vigentes,permissoes_vigentes,pendencias_abertas,auditoria_eventos,auditoria_incompleta,atas_vencendo_90,atas_vencidas,pedidos_aguardando,valor_pedidos_aguardando", order: ["atualizado_em"] },
  { key: "unitsRisk", source: "view:vw_governanca_unidades_risco", table: "vw_governanca_unidades_risco", title: "Riscos de unidades · view oficial", description: "Registros retornados pela view de unidades com risco.", target: "unitsRiskViewData", mode: "table", fields: "unidade_id,municipio_id,codigo,nome,sigla,tipo,nivel,parent_id,ativo,valido_de,valido_ate,updated_at,usuarios_ativos,gestores_vigentes,permissoes_vigentes,severidade,motivo", order: ["unidade_id"] },
  { key: "accessRisk", source: "view:vw_governanca_acessos_risco", table: "vw_governanca_acessos_risco", title: "Riscos de acesso · view oficial", description: "Registros retornados pela view de acessos com risco.", target: "accessRiskViewData", mode: "table", fields: "permissao_id,usuario_id,usuario_nome,perfil,unidade_id,unidade_codigo,unidade_nome,modulo,acao,escopo,permitido,valido_de,valido_ate,created_at,severidade,motivo", order: ["permissao_id"] },
  { key: "people", source: "view:vw_governanca_pessoas_responsabilidades", table: "vw_governanca_pessoas_responsabilidades", title: "Pessoas e responsabilidades · view oficial", description: "Vínculos, lotações, designações e gestores retornados pela view.", target: "peopleViewData", mode: "table", fields: "municipio_id,usuario_id,usuario_nome,usuario_perfil,usuario_ativo,vinculo_id,unidade_id,unidade_nome,tipo_vinculo,vinculo_principal,vinculo_valido_de,vinculo_valido_ate,designacao_id,funcao,ato_designacao,designacao_principal,vigencia_inicio,vigencia_fim,designacao_vigente,gestor_vigente", order: ["usuario_id", "vinculo_id", "designacao_id"] },
  { key: "integrity", source: "view:vw_integridade_dados", table: "vw_integridade_dados", title: "Integridade dos dados · view oficial", description: "Regras de completude e cobertura retornadas pela view.", target: "integrityViewData", mode: "metrics", fields: "municipio_id,regra,descricao,quantidade,severidade,verificado_em", order: ["municipio_id", "regra"] },
];

function viewFieldLabel(value) {
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function viewCellValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function renderDatabaseView(definition) {
  const target = document.getElementById(definition.target);
  if (!target) return;
  const error = state.sourceErrors[definition.source];
  if (error) {
    target.innerHTML = `<div class="gov-view-state is-unavailable" role="status"><strong>Fonte indisponível</strong><span>${esc(error).slice(0, 240)}</span><small>View: ${esc(definition.table)} · Verifique permissões, RLS e disponibilidade no ambiente.</small></div>`;
    return;
  }
  const rows = state.views[definition.key] || [];
  if (!rows.length) {
    target.innerHTML = `<div class="gov-view-state is-empty" role="status"><strong>Consulta concluída; nenhum registro retornado</strong><span>Não interpretar esta ausência como valor zero. Ela pode refletir o escopo atual ou ausência de registros.</span><small>Fonte: ${esc(definition.table)}</small></div>`;
    return;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))].slice(0, 12);
  const freshnessField = ["atualizado_em", "verificado_em", "updated_at"].find((field) => columns.includes(field) && rows[0]?.[field]);
  const freshness = freshnessField ? ` · Verificado em ${fmtDateTime(rows[0][freshnessField])}` : "";
  const capNote = state.truncatedSources[definition.source] ? ` · limite de ${fmtInt(MAX_FETCH_ROWS)} linhas atingido; totais incompletos` : "";
  if (definition.mode === "metrics" && rows.length === 1) {
    const metrics = columns.map((column) => `<div class="gov-view-metric"><span>${esc(viewFieldLabel(column))}</span><strong>${esc(viewCellValue(rows[0][column]))}</strong></div>`).join("");
    target.innerHTML = `<div class="gov-view-metrics">${metrics}</div><small class="gov-view-meta">Fonte: ${esc(definition.table)} · 1 registro${freshness}${capNote}</small>`;
    return;
  }
  const body = rows.slice(0, 25).map((row) => `<tr>${columns.map((column) => `<td>${esc(viewCellValue(row?.[column]))}</td>`).join("")}</tr>`).join("");
  target.innerHTML = `<div class="gov-table-wrap gov-view-table-wrap"><table class="gov-table"><thead><tr>${columns.map((column) => `<th>${esc(viewFieldLabel(column))}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div><small class="gov-view-meta">Fonte: ${esc(definition.table)} · ${fmtInt(rows.length)} registro(s) retornado(s)${rows.length > 25 ? ` · exibindo 25` : ""}${freshness}${capNote}</small>`;
}
function renderDatabaseViews() {
  databaseViewDefinitions.forEach((definition) => renderDatabaseView(definition));
}

function populateAuditFilters() {
  const fill = (selector, values, allLabel) => {
    const select = $(selector);
    if (!select) return;
    const current = select.value;
    const options = [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim()).map(String))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    select.innerHTML = `<option value="">${esc(allLabel)}</option>${options.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
    if (options.includes(current)) select.value = current;
  };
  fill("#auditOperationFilter", state.audits.map((event) => event.operacao), "Todas as operações/eventos");
  fill("#auditOriginFilter", state.audits.map((event) => event.origem || event.fonte), "Todas as origens/fontes");
}

async function loadAll() {
  state.errors = []; state.sourceErrors = {}; state.sourceCounts = {}; state.emptySources = {}; state.truncatedSources = {};
  const canAccessAudit = state.currentUser?.perfil === "ADMIN";
  if (!canAccessAudit) {
    const restricted = "Fonte restrita ao perfil ADMIN pelo contrato de segurança do banco.";
    state.sourceErrors.auditoria = restricted; state.sourceErrors.login = restricted;
    state.sourceCounts.auditoria = 0; state.sourceCounts.login = 0;
    state.errors.push(`auditoria: ${restricted}`, `login: ${restricted}`);
  }
  const auditStart = periodStart().toISOString();
  const auditEnd = new Date().toISOString();
  const [units, users, links, designations, managers, permissions, pendings, audits, logins, atas, orders, reserves, consumptions, summaryView, unitsRiskView, accessRiskView, peopleView, integrityView] = await Promise.all([
    rows("unidades", () => supabase.from("unidades_organizacionais").select("id,codigo,sigla,nome,tipo,nivel,parent_id,ordem,ativo,valido_de,valido_ate,updated_at").order("nivel").order("ordem").order("id")),
    rows("usuários", () => supabase.from("usuarios").select("id,nome,email,perfil,ativo,orgao_id,ultimo_acesso").order("nome").order("id")),
    rows("vínculos", () => supabase.from("usuarios_unidades").select("id,usuario_id,unidade_id,tipo_vinculo,principal,ativo,valido_de,valido_ate,updated_at").order("id")),
    rows("designações", () => supabase.from("designacoes_funcionais").select("id,usuario_id,unidade_organizacional_id,cargo_id,funcao,vigencia_inicio,vigencia_fim,ativa,principal,ato_designacao").order("id")),
    rows("gestores", () => supabase.from("gestores_unidades").select("id,unidade_id,usuario_id,nome_responsavel,cargo_responsavel,data_inicio,data_fim,ato_designacao").order("id")),
    rows("permissões", () => supabase.from("permissoes_unidades").select("id,usuario_id,unidade_id,modulo,acao,escopo,permitido,valido_de,valido_ate,created_at").order("id")),
    rows("pendências", () => supabase.from("organograma_carga_pendencias").select("id,assunto,decisao_necessaria,status,responsavel,carregado_em").order("id")),
    canAccessAudit ? rows("auditoria", () => supabase.from("vw_auditoria_timeline_contextualizada").select("id_evento,ocorrido_em,categoria,entidade,entidade_id,operacao,ator_id,ator_nome,ator_perfil,municipio_id,unidade_organizacional_id,origem,request_id,correlacao_id,ip_address,justificativa,severidade,fonte").gte("ocorrido_em", auditStart).lte("ocorrido_em", auditEnd).order("ocorrido_em", { ascending: false }).order("id_evento", { ascending: false })) : Promise.resolve([]),
    canAccessAudit ? adminSecurityLoginRows(state.period) : Promise.resolve([]),
    rows("atas", () => supabase.from("atas").select("id,numero_ata,objeto,situacao,data_fim_vigencia,valor_global,gestor_id,fiscal_id,orgao_responsavel_id").order("data_fim_vigencia").order("id")),
    rows("pedidos", () => supabase.from("pedidos").select("id,numero_pedido,status,status_aprovacao,data_solicitacao,data_autorizacao,valor_total,orgao_solicitante_id,unidade_organizacional_id").order("data_solicitacao", { ascending: false }).order("id", { ascending: false })),
    rows("reservas", () => supabase.from("pedidos_reservas").select("id,pedido_id,quantidade,valor,status,criada_em,liberada_em").order("criada_em", { ascending: false }).order("id", { ascending: false })),
    rows("consumos", () => supabase.from("consumos").select("id,quantidade,valor_total,data_consumo,orgao_solicitante_id,unidade_organizacional_id").order("data_consumo", { ascending: false }).order("id", { ascending: false })),
    rows("view:vw_governanca_resumo", () => supabase.from("vw_governanca_resumo").select("atualizado_em,unidades_ativas,unidades_inativas,usuarios_ativos,vinculos_ativos,designacoes_vigentes,gestores_vigentes,permissoes_vigentes,pendencias_abertas,auditoria_eventos,auditoria_incompleta,atas_vencendo_90,atas_vencidas,pedidos_aguardando,valor_pedidos_aguardando").order("atualizado_em", { ascending: false })),
    rows("view:vw_governanca_unidades_risco", () => supabase.from("vw_governanca_unidades_risco").select("unidade_id,municipio_id,codigo,nome,sigla,tipo,nivel,parent_id,ativo,valido_de,valido_ate,updated_at,usuarios_ativos,gestores_vigentes,permissoes_vigentes,severidade,motivo").order("unidade_id")),
    rows("view:vw_governanca_acessos_risco", () => supabase.from("vw_governanca_acessos_risco").select("permissao_id,usuario_id,usuario_nome,perfil,unidade_id,unidade_codigo,unidade_nome,modulo,acao,escopo,permitido,valido_de,valido_ate,created_at,severidade,motivo").order("permissao_id")),
    rows("view:vw_governanca_pessoas_responsabilidades", () => supabase.from("vw_governanca_pessoas_responsabilidades").select("municipio_id,usuario_id,usuario_nome,usuario_perfil,usuario_ativo,vinculo_id,unidade_id,unidade_nome,tipo_vinculo,vinculo_principal,vinculo_valido_de,vinculo_valido_ate,designacao_id,funcao,ato_designacao,designacao_principal,vigencia_inicio,vigencia_fim,designacao_vigente,gestor_vigente").order("usuario_id").order("vinculo_id").order("designacao_id")),
    rows("view:vw_integridade_dados", () => supabase.from("vw_integridade_dados").select("municipio_id,regra,descricao,quantidade,severidade,verificado_em").order("municipio_id").order("regra")),
  ]);
  Object.assign(state, { units, users, links, designations, managers, permissions, pendings, audits, logins, atas, orders, reserves, consumptions, views: { summary: summaryView, unitsRisk: unitsRiskView, accessRisk: accessRiskView, people: peopleView, integrity: integrityView }, refreshedAt: new Date() });
  populateAuditFilters();
  renderAll();
  const stamp = state.refreshedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  $("#lastRefresh").textContent = `Atualizado em ${stamp}`;
  const errors = Object.keys(state.sourceErrors);
  const limited = Object.keys(state.truncatedSources);
  const empty = Object.keys(state.emptySources);
  const statusParts = [errors.length ? `${errors.length} fonte(s) indisponível(is)` : "Dados atuais carregados"];
  if (limited.length) statusParts.push(`${limited.length} fonte(s) com amostra limitada`);
  if (empty.length) statusParts.push(`${empty.length} fonte(s) sem registros`);
  setDataState(statusParts.join(" · "), Boolean(errors.length || limited.length));
  $("#dataState").title = [errors.length ? `Indisponíveis: ${errors.join(", ")}` : "", limited.length ? `Amostra limitada: ${limited.join(", ")}` : "", empty.length ? `Sem registros: ${empty.join(", ")}` : ""].filter(Boolean).join("\n");
}
function auditContextIssues(event) {
  const source = String(event.fonte || "");
  const operation = String(event.operacao || "").toLowerCase();
  const isLogin = source === "security_login_events";
  const isPendingRequest = source === "solicitacoes_acesso" && operation === "pendente";
  const issues = [];
  if ((!isLogin && !isPendingRequest && !event.ator_id && !event.ator_nome) || (isLogin && operation === "success" && !event.ator_id && !event.ator_nome)) issues.push("ator");
  if (!isLogin && !event.municipio_id) issues.push("município");
  if (!event.origem && !event.fonte) issues.push("origem");
  if (source === "auditoria_eventos") {
    if (!event.unidade_organizacional_id && !event.justificativa) issues.push("unidade");
    if (!event.request_id && !event.justificativa) issues.push("request");
    if (!event.correlacao_id && !event.justificativa) issues.push("correlação");
  } else if (source !== "security_login_events" && !event.correlacao_id && !event.justificativa) {
    issues.push("correlação");
  }
  return issues;
}
function auditActor(event) { return event.ator_nome || userName(event.ator_id); }
function auditKey(event) { return `${event.fonte || "fonte"}:${event.id_evento}`; }
function shortRef(value) { const text = String(value ?? ""); return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-5)}` : (text || "—"); }
function buildAlerts() {
  const activeUnitRows = state.units.filter((unit) => unit.ativo !== false);
  const managerIds = new Set(activeManagers().map((item) => String(item.unidade_id)));
  const linkedUnits = new Set(activeLinks().map((item) => String(item.unidade_id)));
  const unitsWithoutManager = activeUnitRows.filter((unit) => !managerIds.has(String(unit.id)));
  const usersWithoutDesignation = state.users.filter((user) => user.ativo !== false && !activeDesignations().some((item) => String(item.usuario_id) === String(user.id)));
  const incompleteAudit = state.audits.filter((event) => auditContextIssues(event).length > 0);
  const expiringAtas = state.atas.filter((ata) => ata.data_fim_vigencia && daysFromNow(ata.data_fim_vigencia) >= 0 && daysFromNow(ata.data_fim_vigencia) <= 90);
  const pendingOrders = ordersInSelectedPeriod().filter((order) => pendingStatuses.includes(order.status_aprovacao || order.status));
  const alerts = [];
  if (openPendings().length) alerts.push({ tone: "medium", icon: "fa-clipboard-check", title: `${openPendings().length} pendência(s) de validação do organograma`, detail: "Há decisões institucionais aguardando manifestação do Município.", meta: "Abrir fila de decisões" });
  if (unitsWithoutManager.length) alerts.push({ tone: "high", icon: "fa-user-slash", title: `${unitsWithoutManager.length} unidade(s) sem gestor vigente`, detail: "Uma unidade sem responsável formal reduz a capacidade de decisão e continuidade.", meta: "Regularizar responsáveis" });
  if (usersWithoutDesignation.length) alerts.push({ tone: "high", icon: "fa-user-tag", title: `${usersWithoutDesignation.length} usuário(s) sem designação vigente`, detail: "Há acesso ou lotação sem função formal registrada.", meta: "Revisar designações" });
  if (!activePermissions().length && unavailable("permissões")) alerts.push({ tone: "high", icon: "fa-key", title: "Nenhuma permissão granular vigente registrada", detail: "O painel diferencia controle por perfil legado de autorização por unidade.", meta: "Revisar modelo de acesso" });
  if (incompleteAudit.length) alerts.push({ tone: "high", icon: "fa-fingerprint", title: `${incompleteAudit.length} evento(s) de auditoria com contexto incompleto`, detail: "Há eventos sem ator, município, request/unidade/correlação aplicáveis ou origem.", meta: "Corrigir instrumentação" });
  if (expiringAtas.length) alerts.push({ tone: "medium", icon: "fa-calendar-xmark", title: `${expiringAtas.length} ata(s) vencem em até 90 dias`, detail: "Verifique gestor, fiscal, saldo e necessidade de renovação ou novo procedimento.", meta: "Acompanhar vigência" });
  if (pendingOrders.length) alerts.push({ tone: "medium", icon: "fa-hourglass-half", title: `${pendingOrders.length} pedido(s) do período aguardam decisão`, detail: `Pedidos solicitados nos ${periodLabel()} que seguem pendentes.`, meta: "Abrir tramitação" });
  if (!linkedUnits.size && unavailable("vínculos")) alerts.push({ tone: "info", icon: "fa-link", title: "Nenhuma unidade possui vínculo operacional", detail: "O diretório tem usuários, mas a cobertura de unidades ainda não foi demonstrada.", meta: "Completar vínculos" });
  return alerts;
}
function alertHtml(alert) { return `<article class="gov-alert ${esc(alert.tone)}"><span class="gov-alert-icon"><i class="fas ${esc(alert.icon)}"></i></span><div><strong>${esc(alert.title)}</strong><p>${esc(alert.detail)}</p></div><small>${esc(alert.meta)}</small></article>`; }

function renderKpis() {
  const activeUnits = state.units.filter((item) => item.ativo !== false).length;
  const managerUnits = new Set(activeManagers().map((item) => String(item.unidade_id)));
  const unitsWithoutManager = state.units.filter((unit) => unit.ativo !== false && !managerUnits.has(String(unit.id))).length;
  const pendingOrders = ordersInSelectedPeriod().filter((item) => pendingStatuses.includes(item.status_aprovacao || item.status)).length;
  const incomplete = state.audits.filter((event) => auditContextIssues(event).length > 0).length;
  const permissions = activePermissions();
  const alertSources = ["unidades", "gestores", "vínculos", "designações", "permissões", "auditoria", "atas", "pedidos", "pendências"];
  $("#overviewKpis").innerHTML = [
    kpi("fa-sitemap", "blue", metricCount(activeUnits, ["unidades"]), "unidades ativas", sourceUnavailable("unidades") || `${state.units.length} no cadastro · estado atual`),
    kpi("fa-user-shield", "green", metricCount(state.users.filter((item) => item.ativo !== false).length, ["usuários"]), "usuários ativos", sourceUnavailable("usuários") || `${activeDesignations().length} designações vigentes · estado atual`),
    kpi("fa-triangle-exclamation", "amber", hasCriticalSourceGap() ? "Dados insuficientes" : metricCount(buildAlerts().length, alertSources), "alertas acionáveis", hasCriticalSourceGap() ? "não afirmar ausência sem fontes completas" : "fontes consultadas nesta atualização"),
    kpi("fa-fingerprint", "purple", metricCount(state.audits.length, ["auditoria"]), "eventos de auditoria", sourceUnavailable("auditoria") || `${incomplete} com contexto incompleto · ${periodLabel()}`),
  ].join("");
  $("#miniUnits").textContent = metricCount(activeUnits, ["unidades"]);
  $("#miniUnitsMeta").textContent = state.emptySources.unidades ? "Sem registros de unidades" : (sourceUnavailable("unidades") || `${state.units.filter((item) => item.ativo === false).length} inativa(s) · estado atual`);
  $("#miniManagers").textContent = metricCount(unitsWithoutManager, ["unidades", "gestores"]);
  $("#miniOrders").textContent = metricCount(pendingOrders, ["pedidos"]);
  const overviewAlerts = buildAlerts();
  $("#overviewAlerts").innerHTML = overviewAlerts.length ? overviewAlerts.slice(0, 5).map(alertHtml).join("") : (hasCriticalSourceGap() ? `<div class="gov-view-state is-empty">Dados insuficientes para afirmar ausência de alertas. Verifique fontes vazias, indisponíveis ou limitadas.</div>` : `<div class="gov-empty">Nenhum alerta acionável encontrado nas fontes disponíveis.</div>`);
  const managerCoverage = activeUnits ? ((activeUnits - unitsWithoutManager) / activeUnits) * 100 : 0;
  const checks = [
    { label: "Estrutura hierárquica", detail: state.emptySources.unidades ? "Sem registros de unidades" : `${activeUnits} unidades ativas`, value: activeUnits ? 100 : 0, tone: activeUnits ? "" : "danger" },
    { label: "Cobertura de gestores", detail: state.emptySources.unidades ? "Sem base para cálculo" : `${activeUnits - unitsWithoutManager}/${activeUnits} unidades cobertas`, value: managerCoverage, tone: unitsWithoutManager ? "warn" : "" },
    { label: "Autorizações granulares", detail: state.emptySources["permissões"] ? "Sem registros de permissões" : `${permissions.length} vigentes`, value: permissions.length ? 100 : 0, tone: permissions.length ? "" : "danger" },
    { label: "Auditoria contextual", detail: state.sourceErrors.auditoria ? "Fonte indisponível" : state.emptySources.auditoria ? "Sem eventos no período" : state.truncatedSources.auditoria ? "Amostra parcial" : `${state.audits.length - incomplete}/${state.audits.length} completas`, value: state.audits.length ? ((state.audits.length - incomplete) / state.audits.length) * 100 : 0, tone: incomplete ? "warn" : (state.sourceErrors.auditoria || state.truncatedSources.auditoria ? "danger" : "") },
  ];
  $("#integrityList").innerHTML = checks.map((item) => `<div class="gov-integrity-item"><div><strong>${esc(item.label)}</strong><span>${esc(item.detail)}</span></div><div class="gov-integrity-meter"><i class="${item.tone}" style="width:${Math.max(0, Math.min(100, item.value))}%"></i></div></div>`).join("");
  const high = buildAlerts().some((item) => item.tone === "high");
  const coreSourcesIncomplete = hasCriticalSourceGap();
  $("#directoryStatus").innerHTML = high ? `<i class="fas fa-triangle-exclamation"></i> Requer atenção` : coreSourcesIncomplete ? `<i class="fas fa-circle-info"></i> Dados insuficientes` : `<i class="fas fa-circle-check"></i> Sem alerta alto`;
  $("#directoryStatus").style.color = high ? "var(--state-danger)" : coreSourcesIncomplete ? "var(--state-warning)" : "var(--state-success)";
  $("#navAlertCount").textContent = metricCount(buildAlerts().length, alertSources);
  const empty = Object.keys(state.emptySources);
  const limited = Object.keys(state.truncatedSources);
  const missingTemporal = [["pedidos", state.orders.filter((item) => !item.data_solicitacao).length], ["reservas", state.reserves.filter((item) => !item.criada_em).length], ["consumos", state.consumptions.filter((item) => !item.data_consumo).length]].filter(([, count]) => count > 0);
  const qualityNote = [
    `Período selecionado (${periodLabel()}) aplicado à linha do tempo, logins, pedidos solicitados, reservas criadas e consumos.`,
    "Estrutura, pessoas, permissões e vigências são retratos atuais, pois as fontes não mantêm snapshots históricos.",
    empty.length ? `Fontes sem registros: ${empty.join(", ")}. KPIs dessas fontes mostram “Sem registros”, não zero validado.` : "",
    limited.length ? `Fontes limitadas: ${limited.join(", ")}; totais potencialmente incompletos.` : "",
    missingTemporal.length ? `Registros sem data, excluídos do período: ${missingTemporal.map(([label, count]) => `${label} ${count}`).join(", ")}.` : "",
    state.errors.length ? `Fontes indisponíveis: ${Object.keys(state.sourceErrors).join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  $("#overviewDataNote").innerHTML = `<i class="fas fa-circle-info"></i><p><strong>Escopo e qualidade:</strong> ${esc(qualityNote)}</p>`;
}
function renderAlerts() { const alerts = buildAlerts(); $("#alertsPanel").innerHTML = alerts.length ? alerts.map(alertHtml).join("") : (hasCriticalSourceGap() ? `<div class="gov-view-state is-empty">Dados insuficientes para concluir que não há alertas; uma ou mais fontes críticas estão vazias, indisponíveis ou limitadas.</div>` : `<div class="gov-empty">Nenhum alerta acionável encontrado.</div>`); $("#alertSummary").textContent = hasCriticalSourceGap() ? "Dados insuficientes" : `${alerts.length} alerta(s) · ${alerts.filter((item) => item.tone === "high").length} alto risco`; }

function renderStructure() {
  const managers = activeManagers(); const managerUnitIds = new Set(managers.map((item) => String(item.unidade_id))); const links = activeLinks(); const linkedByUnit = new Map(); links.forEach((item) => linkedByUnit.set(String(item.unidade_id), (linkedByUnit.get(String(item.unidade_id)) || 0) + 1));
  const activeUnits = state.units.filter((unit) => unit.ativo !== false); const without = activeUnits.filter((unit) => !managerUnitIds.has(String(unit.id))).length;
  const parentIds = new Set(state.units.map((unit) => String(unit.id))); const orphan = activeUnits.filter((unit) => unit.parent_id && !parentIds.has(String(unit.parent_id))).length; const inactiveParent = activeUnits.filter((unit) => { const parent = unitsById().get(String(unit.parent_id)); return parent && parent.ativo === false; }).length;
  const codeCounts = new Map(); const siglaCounts = new Map(); state.units.forEach((unit) => { if (unit.ativo !== false && unit.codigo) codeCounts.set(unit.codigo, (codeCounts.get(unit.codigo) || 0) + 1); if (unit.ativo !== false && unit.sigla) siglaCounts.set(unit.sigla, (siglaCounts.get(unit.sigla) || 0) + 1); });
  const duplicateCodes = [...codeCounts.values()].filter((count) => count > 1).length; const duplicateSiglas = [...siglaCounts.values()].filter((count) => count > 1).length; const noValidity = activeUnits.filter((unit) => !unit.valido_de && !unit.valido_ate).length; const oldPendings = openPendings().filter((item) => daysOpen(item.carregado_em) >= 30).length;
  $("#structureKpis").innerHTML = [kpi("fa-sitemap", "blue", metricCount(activeUnits.length, ["unidades"]), "unidades ativas", sourceUnavailable("unidades") || `${state.units.length} cadastradas · estado atual`), kpi("fa-user-tie", "red", metricCount(without, ["unidades", "gestores"]), "sem gestor", "P0 · estado atual"), kpi("fa-link", "green", metricCount(links.length, ["vínculos"]), "vínculos ativos", "P0 · estado atual"), kpi("fa-clipboard-check", "amber", metricCount(openPendings().length, ["pendências"]), "pendências abertas", "P0 · estado atual")].join("");
  $("#structureQuality").innerHTML = [indicator("P0", "Cobertura de gestores", activeUnits.length ? `${metricCount(activeUnits.length - without, ["unidades", "gestores"])}/${metricCount(activeUnits.length, ["unidades"])}` : metricCount(0, ["unidades"]), activeUnits.length ? "unidades com gestor vigente · estado atual" : (sourceUnavailable("unidades") || "Sem unidades ativas"), without ? "high" : "success", "Abrir unidades sem responsável"), indicator("P0", "Cobertura de vínculos", activeUnits.length ? `${metricCount(new Set(links.map((item) => String(item.unidade_id))).size, ["unidades", "vínculos"])}/${metricCount(activeUnits.length, ["unidades"])}` : metricCount(0, ["unidades"]), "unidades com pelo menos um vínculo · estado atual", links.length ? "info" : "high", "Identificar unidades sem equipe"), indicator("P1", "Pai inválido", metricCount(orphan + inactiveParent, ["unidades"]), `${metricCount(orphan, ["unidades"])} inexistente(s) · ${metricCount(inactiveParent, ["unidades"])} inativo(s)`, orphan + inactiveParent ? "high" : "success", "Reconciliar hierarquia"), indicator("P1", "Duplicidades estruturais", metricCount(duplicateCodes + duplicateSiglas, ["unidades"]), `${metricCount(duplicateCodes, ["unidades"])} código(s) · ${metricCount(duplicateSiglas, ["unidades"])} sigla(s)`, duplicateCodes + duplicateSiglas ? "medium" : "success", "Validar unicidade"), indicator("P1", "Pendências antigas", metricCount(oldPendings, ["pendências"]), "abertas há 30 dias ou mais · estado atual", oldPendings ? "medium" : "success", "Priorizar fila municipal")].join("");
  const rows = activeUnits.filter((unit) => { const noManager = !managerUnitIds.has(String(unit.id)); const noLink = !linkedByUnit.has(String(unit.id)); const invalidParent = Boolean(unit.parent_id && !parentIds.has(String(unit.parent_id))); return noManager || noLink || invalidParent; }).filter((unit) => textMatch(unit.codigo, unit.nome, unit.tipo));
  $("#unitRiskTable").innerHTML = rows.slice(0, 100).map((unit) => { const hasManager = managerUnitIds.has(String(unit.id)); const hasLink = linkedByUnit.has(String(unit.id)); const risk = !hasManager ? "Alto" : (!hasLink ? "Médio" : "Baixo"); return `<tr><td><strong>${esc(unit.codigo)}</strong><small>${esc(unit.nome)}</small></td><td>${esc(typeLabel(unit.tipo))}</td><td>${fmtInt(linkedByUnit.get(String(unit.id)) || 0)}</td><td>${hasManager ? pill("Vigente", "success") : pill("Ausente", "high")}</td><td>${pill(risk, risk === "Alto" ? "high" : risk === "Médio" ? "medium" : "success")}</td></tr>`; }).join("") || emptyRow(5, "Nenhuma unidade em situação de risco para o filtro atual.");
  $("#unitRiskNote").textContent = rows.length > 100 ? `Exibindo 100 de ${rows.length} unidades de risco; aplique busca para reduzir a lista.` : `${rows.length} unidade(s) de risco retornada(s).`;
  $("#orgPendingTable").innerHTML = openPendings().filter((item) => textMatch(item.assunto, item.decisao_necessaria, item.responsavel, item.status)).map((item) => `<tr><td><strong>${esc(item.assunto)}</strong><small>${fmtDate(item.carregado_em)}${daysOpen(item.carregado_em) !== null ? ` · há ${daysOpen(item.carregado_em)} dias` : ""}</small></td><td>${esc(item.decisao_necessaria)}</td><td>${esc(item.responsavel)}</td><td>${pill(item.status || "Pendente", daysOpen(item.carregado_em) >= 30 ? "high" : "medium")}</td></tr>`).join("") || emptyRow(4, "Nenhuma pendência aberta.");
}

function renderPeople() {
  const links = activeLinks(); const designations = activeDesignations(); const linkCount = new Map(); const principalCount = new Map(); links.forEach((item) => { linkCount.set(String(item.usuario_id), (linkCount.get(String(item.usuario_id)) || 0) + 1); if (item.principal) principalCount.set(String(item.usuario_id), (principalCount.get(String(item.usuario_id)) || 0) + 1); });
  const activeUsers = state.users.filter((item) => item.ativo !== false); const noDesignation = activeUsers.filter((item) => !designations.some((designation) => String(designation.usuario_id) === String(item.id))).length; const noAct = designations.filter((item) => !item.ato_designacao).length; const inactiveWithLink = state.users.filter((user) => user.ativo === false && links.some((link) => String(link.usuario_id) === String(user.id))).length; const multipleLinks = activeUsers.filter((user) => (linkCount.get(String(user.id)) || 0) > 1).length; const noPrincipal = activeUsers.filter((user) => (linkCount.get(String(user.id)) || 0) > 0 && !principalCount.has(String(user.id))).length; const expiring = designations.filter((item) => { const days = daysFromNow(item.vigencia_fim); return days !== null && days >= 0 && days <= 90; }).length;
  $("#peopleKpis").innerHTML = [kpi("fa-users", "blue", metricCount(activeUsers.length, ["usuários"]), "usuários ativos", sourceUnavailable("usuários") || `${state.users.length} cadastrados · estado atual`), kpi("fa-link", "green", metricCount(links.length, ["vínculos"]), "vínculos vigentes", "estado atual"), kpi("fa-user-tag", "amber", metricCount(designations.length, ["designações"]), "designações vigentes", `${metricCount(noDesignation, ["usuários", "designações"])} sem designação`), kpi("fa-user-tie", "purple", metricCount(activeManagers().length, ["gestores"]), "gestores vigentes", "estado atual")].join("");
  $("#peopleQuality").innerHTML = [indicator("P0", "Sem designação", metricCount(noDesignation, ["usuários", "designações"]), "usuários ativos sem função vigente · estado atual", noDesignation ? "high" : "success", "Regularizar função"), indicator("P1", "Designações sem ato", metricCount(noAct, ["designações"]), "registros sem portaria, decreto ou ato informado", noAct ? "medium" : "success", "Completar evidência"), indicator("P1", "Designações vencendo", metricCount(expiring, ["designações"]), "encerram nos próximos 90 dias · estado atual", expiring ? "medium" : "success", "Planejar renovação"), indicator("P1", "Vínculo inconsistente", metricCount(inactiveWithLink + noPrincipal, ["usuários", "vínculos"]), `${metricCount(inactiveWithLink, ["usuários", "vínculos"])} inativo(s) · ${metricCount(noPrincipal, ["usuários", "vínculos"])} sem principal`, inactiveWithLink + noPrincipal ? "high" : "success", "Revisar lotações"), indicator("P1", "Múltiplas lotações", metricCount(multipleLinks, ["usuários", "vínculos"]), "usuários com mais de um vínculo vigente", multipleLinks ? "info" : "success", "Validar justificativa")].join("");
  $("#peopleTable").innerHTML = state.users.filter((user) => textMatch(user.nome, user.email, user.perfil)).map((user) => { const hasDesignation = designations.some((item) => String(item.usuario_id) === String(user.id)); const count = linkCount.get(String(user.id)) || 0; return `<tr><td><strong>${esc(user.nome || "Sem nome")}</strong><small>${esc(user.email)}</small></td><td>${pill(user.perfil || "—")}</td><td>${esc(user.orgao_id ?? "—")}</td><td>${fmtInt(count)}</td><td>${hasDesignation ? pill("Vigente", "success") : pill("Ausente", "high")}</td><td>${user.ativo !== false ? pill("Ativo", "success") : pill("Inativo", "high")}</td></tr>`; }).join("") || emptyRow(6);
}

function renderAccess() {
  const permissions = activePermissions(); const broad = permissions.filter((item) => item.escopo === "MUNICIPIO").length; const expired = state.permissions.filter((item) => item.valido_ate && new Date(item.valido_ate) < new Date()).length; const failures = state.logins.filter((item) => String(item.outcome).toLowerCase() !== "success").length; const linked = activeLinks(); const usersWithoutLinks = state.users.filter((user) => user.ativo !== false && !linked.some((link) => String(link.usuario_id) === String(user.id))).length; const inactiveUserAccess = permissions.filter((permission) => usersById().get(String(permission.usuario_id))?.ativo === false).length; const inactiveUnitAccess = permissions.filter((permission) => unitsById().get(String(permission.unidade_id))?.ativo === false).length; const usersWithExplicitPermission = new Set(permissions.map((permission) => String(permission.usuario_id))).size; const activeUsers = state.users.filter((item) => item.ativo !== false).length; const noReviewDate = permissions.filter((permission) => !permission.valido_de && !permission.valido_ate).length;
  $("#accessKpis").innerHTML = [kpi("fa-key", permissions.length ? "green" : "red", metricCount(permissions.length, ["permissões"]), "permissões vigentes", sourceUnavailable("permissões") || (permissions.length ? "por unidade · estado atual" : "validar perfil legado")), kpi("fa-globe", broad ? "amber" : "blue", metricCount(broad, ["permissões"]), "acessos municipais", "escopo amplo · estado atual"), kpi("fa-clock", expired ? "red" : "green", metricCount(expired, ["permissões"]), "permissões expiradas", "estado atual"), kpi("fa-right-to-bracket", failures ? "amber" : "green", metricCount(failures, ["login"]), "falhas de login", `${metricCount(state.logins.length, ["login"])} eventos · ${periodLabel()}`)].join("");
  $("#accessQuality").innerHTML = [indicator("P0", "Permissões vigentes", metricCount(permissions.length, ["permissões"]), permissions.length ? "autorizações granulares permitidas" : (sourceUnavailable("permissões") || "nenhuma registrada; perfis legados não avaliados"), permissions.length ? "success" : "high", "Revisar implantação granular"), indicator("P1", "Acessos amplos", metricCount(broad, ["permissões"]), "permissões com escopo município · estado atual", broad ? "medium" : "success", "Revisar segregação de funções"), indicator("P1", "Acesso residual", metricCount(inactiveUserAccess + inactiveUnitAccess, ["permissões", "usuários", "unidades"]), `${fmtInt(inactiveUserAccess)} usuário(s) inativo(s) · ${fmtInt(inactiveUnitAccess)} unidade(s) inativa(s)`, inactiveUserAccess + inactiveUnitAccess ? "high" : "success", "Suspender ou revogar"), indicator("P1", "Sem revisão definida", metricCount(noReviewDate, ["permissões"]), "permissões sem vigência informada · não equivale a recertificação", noReviewDate ? "medium" : "success", "Definir periodicidade"), indicator("P1", "Dependência de perfil", activeUsers && unavailable("permissões") ? `${metricCount(Math.max(0, activeUsers - usersWithExplicitPermission), ["usuários", "permissões"])}/${metricCount(activeUsers, ["usuários"])}` : "—", "usuários sem permissão explícita", activeUsers - usersWithExplicitPermission ? "info" : "success", "Iniciar campanha de revisão")].join("");
  const riskRows = []; state.users.filter((user) => user.ativo !== false).forEach((user) => { if (!linked.some((link) => String(link.usuario_id) === String(user.id))) riskRows.push({ user: userName(user.id), reason: "Sem vínculo organizacional vigente", unit: "—", tone: "high" }); });
  state.permissions.filter((permission) => permission.escopo === "MUNICIPIO" || (permission.valido_ate && new Date(permission.valido_ate) < new Date()) || usersById().get(String(permission.usuario_id))?.ativo === false || unitsById().get(String(permission.unidade_id))?.ativo === false).forEach((permission) => { const inactiveUser = usersById().get(String(permission.usuario_id))?.ativo === false; const inactiveUnit = unitsById().get(String(permission.unidade_id))?.ativo === false; const reason = inactiveUser ? "Usuário inativo com acesso" : inactiveUnit ? "Permissão em unidade inativa" : permission.escopo === "MUNICIPIO" ? `Escopo municipal · ${permission.modulo}/${permission.acao}` : "Permissão expirada"; riskRows.push({ user: userName(permission.usuario_id), reason, unit: unitName(permission.unidade_id), tone: inactiveUser || inactiveUnit || permission.valido_ate && new Date(permission.valido_ate) < new Date() ? "high" : "medium" }); });
  $("#accessRiskTable").innerHTML = riskRows.filter((row) => textMatch(row.user, row.reason, row.unit)).map((row) => `<tr><td><strong>${esc(row.user)}</strong></td><td>${esc(row.reason)}</td><td>${esc(row.unit)}</td><td>${pill(row.tone === "high" ? "Alto" : "Médio", row.tone)}</td></tr>`).join("") || emptyRow(4, usersWithoutLinks ? "Nenhum risco adicional carregado." : "Nenhum risco de acesso encontrado.");
  const loginRows = state.logins.filter((event) => textMatch(event.outcome, event.provider, event.reason_code, event.actor, event.identifier_masked));
  $("#loginTable").innerHTML = state.currentUser?.perfil !== "ADMIN" ? emptyRow(4, "Eventos de login restritos a ADMIN pelo contrato do banco; este estado não representa zero eventos.") : state.sourceErrors.login ? emptyRow(4, "Fonte de login indisponível; verifique permissões da RPC.") : loginRows.slice(0, 50).map((event) => `<tr><td>${fmtDateTime(event.created_at)}</td><td>${pill(event.outcome || "—", String(event.outcome).toLowerCase() === "success" ? "success" : "high")}</td><td>${esc(event.provider || "—")}</td><td>${esc(event.reason_code || "—")}</td></tr>`).join("") || emptyRow(4, "Nenhum evento de login retornado no período escolhido.");
  const loginNote = $("#loginDataNote");
  if (loginNote) loginNote.textContent = state.currentUser?.perfil !== "ADMIN" ? "A consulta de login está desabilitada para este perfil; não interpretar como zero." : state.sourceErrors.login ? "Fonte de login indisponível nesta sessão." : `${loginRows.length} evento(s) de login no escopo de ${periodLabel()}${loginRows.length > 50 ? " · exibindo 50" : ""}${state.truncatedSources.login ? " · limite de 1.000 eventos atingido; amostra parcial" : ""}`;
}
function renderAudit() {
  if (state.currentUser?.perfil !== "ADMIN") {
    const summary = $("#auditSummary"); if (summary) summary.textContent = "Restrito a ADMIN";
    const table = $("#auditTable"); if (table) table.innerHTML = emptyRow(10, "A linha do tempo é restrita a ADMIN pelo contrato atual do banco; este estado não representa zero eventos.");
    const quality = $("#auditQuality"); if (quality) quality.innerHTML = `<i class="fas fa-lock"></i><p><strong>Escopo de acesso:</strong> linha do tempo e login não consultados; a função de autorização atual aceita apenas o perfil ADMIN.</p>`;
    return;
  }
  const operation = $("#auditOperationFilter")?.value || "";
  const origin = $("#auditOriginFilter")?.value || "";
  const rows = state.audits.filter((event) => (!operation || event.operacao === operation) && (!(origin) || (event.origem || event.fonte) === origin) && textMatch(event.categoria, event.entidade, event.entidade_id, event.operacao, event.origem, event.fonte, auditActor(event), event.request_id, event.correlacao_id, event.municipio_id, event.unidade_organizacional_id));
  const incompleteRows = state.audits.filter((event) => auditContextIssues(event).length > 0);
  const missing = (field) => incompleteRows.filter((event) => auditContextIssues(event).includes(field)).length;
  const auditSummary = $("#auditSummary");
  if (auditSummary) {
    if (state.sourceErrors.auditoria) auditSummary.textContent = "Fonte indisponível";
    else if (state.emptySources.auditoria) auditSummary.textContent = `Sem eventos em ${periodLabel()}`;
    else auditSummary.textContent = `${state.truncatedSources.auditoria ? "Amostra parcial · " : ""}${fmtInt(rows.length)} evento(s) no filtro · ${fmtInt(incompleteRows.length)} com contexto incompleto${rows.length > 200 ? " · exibindo 200" : ""}`;
  }
  const auditTable = $("#auditTable");
  if (auditTable) {
    if (state.sourceErrors.auditoria) auditTable.innerHTML = emptyRow(10, "View de auditoria indisponível; confira sessão, autorização e RLS.");
    else auditTable.innerHTML = rows.slice(0, 200).map((event) => {
      const issues = auditContextIssues(event);
      const sourceIsLogin = event.fonte === "security_login_events";
      const requestContext = event.request_id ? `Request ${shortRef(event.request_id)}` : (sourceIsLogin || event.fonte !== "auditoria_eventos" ? "Request N/A" : "Request ausente");
      const correlationContext = event.correlacao_id ? `Correlação ${shortRef(event.correlacao_id)}` : (sourceIsLogin ? "Correlação N/A" : "Correlação ausente");
      const contextItems = [requestContext, correlationContext];
      const contextTitle = `Município ${event.municipio_id || (sourceIsLogin ? "N/A" : "ausente")} · Unidade ${event.unidade_organizacional_id || "N/A"} · ${contextItems.join(" · ")} · fonte ${event.fonte || "não informada"}`;
      const entity = [event.entidade, event.entidade_id ? `#${event.entidade_id}` : ""].filter(Boolean).join(" ") || event.categoria || "Evento";
      const context = issues.length ? pill(`Incompleto: ${issues.join(", ")}`, "high") : pill(sourceIsLogin ? "Completo · login" : "Completo", "success");
      return `<tr><td>${fmtDateTime(event.ocorrido_em)}</td><td><strong>${esc(event.categoria || "—")}</strong><small>${esc(entity)}</small></td><td>${pill(event.operacao || "—", String(event.severidade).toUpperCase() === "ALTO" ? "high" : String(event.severidade).toUpperCase() === "MEDIO" ? "medium" : "")}</td><td>${esc(auditActor(event))}<small>${esc(event.ator_perfil || "")}</small></td><td title="${esc(event.municipio_id || "Município não aplicável/ausente")}">${event.municipio_id ? esc(shortRef(event.municipio_id)) : (sourceIsLogin ? "N/A" : pill("Ausente", "high"))}</td><td title="${esc(event.unidade_organizacional_id || "Unidade não aplicável/ausente")}">${event.unidade_organizacional_id ? esc(shortRef(event.unidade_organizacional_id)) : (sourceIsLogin || event.fonte !== "auditoria_eventos" ? "N/A" : pill("Ausente", "high"))}</td><td title="${esc(contextTitle)}"><small>${contextItems.map(esc).join("<br>")}</small></td><td>${esc(event.origem || "—")}<small>${esc(event.fonte || "")}</small></td><td>${context}</td><td><button class="gov-link-button" data-audit-key="${esc(auditKey(event))}" type="button">Detalhes</button></td></tr>`;
    }).join("") || emptyRow(10, "Nenhum evento encontrado no período e nos filtros atuais.");
    auditTable.querySelectorAll("[data-audit-key]").forEach((button) => button.addEventListener("click", () => {
      const event = state.audits.find((item) => auditKey(item) === button.dataset.auditKey);
      if (event) {
        const details = [`${event.categoria || "Evento"}: ${event.entidade || "—"} ${event.operacao || ""}`, `Ator: ${auditActor(event)}`, `Município: ${event.municipio_id || "N/A"}`, `Unidade: ${event.unidade_organizacional_id || "N/A"}`, `Request: ${event.request_id || "N/A"}`, `Correlação: ${event.correlacao_id || "N/A"}`, `Origem/fonte: ${event.origem || "—"}/${event.fonte || "—"}`].join(" · ");
        toast(details);
      }
    }));
  }
  const auditQuality = $("#auditQuality");
  if (auditQuality) {
    const sourceScope = "Logins não exigem município/unidade/request/correlação na view; solicitações, módulos e eventos de acesso são avaliados conforme os campos aplicáveis à fonte.";
    auditQuality.innerHTML = `<i class="fas fa-fingerprint"></i><p><strong>Rastreabilidade · ${esc(periodLabel())}:</strong> ${metricCount(missing("ator"), ["auditoria"])} sem ator, ${metricCount(missing("município"), ["auditoria"])} sem município, ${metricCount(missing("request"), ["auditoria"])} sem request, ${metricCount(missing("unidade"), ["auditoria"])} sem unidade, ${metricCount(missing("correlação"), ["auditoria"])} sem correlação e ${metricCount(missing("origem"), ["auditoria"])} sem origem. ${esc(sourceScope)} Campos ausentes em fontes sem suporte ainda exigem ajuste na origem, não apenas na interface.</p>`;
  }
}
function renderOperations() {
  const expiring = state.atas.filter((ata) => ata.data_fim_vigencia && daysFromNow(ata.data_fim_vigencia) >= 0 && daysFromNow(ata.data_fim_vigencia) <= 90);
  const expired = state.atas.filter((ata) => ata.data_fim_vigencia && daysFromNow(ata.data_fim_vigencia) < 0);
  const periodOrders = ordersInSelectedPeriod(); const periodReserves = reservesInSelectedPeriod(); const periodConsumptions = consumptionsInSelectedPeriod();
  const pending = periodOrders.filter((order) => pendingStatuses.includes(order.status_aprovacao || order.status));
  const pendingWithoutDecision = pending.filter((order) => !order.data_autorizacao).length;
  const reservationsWithoutRelease = periodReserves.filter((reserve) => !reserve.liberada_em && String(reserve.status || "").toUpperCase() !== "LIBERADA").length;
  $("#operationsKpis").innerHTML = [kpi("fa-file-signature", "blue", metricCount(state.atas.length, ["atas"]), "atas cadastradas", `${state.atas.filter((item) => item.situacao === "ATIVA").length} ativas · estado atual`), kpi("fa-calendar-xmark", expiring.length || expired.length ? "amber" : "green", metricCount(expiring.length, ["atas"]), "vencem em 90 dias", `${expired.length} vencidas · estado atual`), kpi("fa-hourglass-half", pending.length ? "amber" : "green", metricCount(pending.length, ["pedidos"]), "pedidos aguardando", `${fmtMoney(pending.reduce((sum, item) => sum + Number(item.valor_total || 0), 0))} · solicitados em ${periodLabel()}`), kpi("fa-box-open", periodConsumptions.length ? "green" : "blue", metricCount(periodConsumptions.length, ["consumos"]), "consumos registrados", `${metricCount(periodReserves.length, ["reservas"])} reservas · ${periodLabel()}`)].join("");
  $("#operationsQuality").innerHTML = [indicator("P0", "Atas próximas do vencimento", metricCount(expiring.length, ["atas"]), "janela de 90 dias · estado atual", expiring.length ? "medium" : "success", "Verificar gestor, fiscal e saldo"), indicator("P0", "Pedidos sem decisão", metricCount(pending.length, ["pedidos"]), `aguardando aprovação · solicitados em ${periodLabel()}`, pending.length ? "medium" : "success", "Abrir fila de tramitação"), indicator("P1", "Pedidos sem autorização", metricCount(pendingWithoutDecision, ["pedidos"]), `pendentes sem data de autorização · ${periodLabel()}`, pendingWithoutDecision ? "medium" : "success", "Verificar autoridade"), indicator("P1", "Reservas sem liberação", metricCount(reservationsWithoutRelease, ["reservas"]), `reservas criadas em ${periodLabel()} sem data de liberação`, reservationsWithoutRelease ? "medium" : "success", "Reconciliar reservas"), indicator("P1", "Reconciliação de saldo", "—", "sem tabela de itens/saldos/estornos carregada nesta versão", "info", "Implementar view de saldo antes de concluir")].join("");
  $("#operationsSummary").textContent = `${metricCount(periodOrders.length, ["pedidos"])} pedidos · ${metricCount(periodReserves.length, ["reservas"])} reservas · ${metricCount(periodConsumptions.length, ["consumos"])} consumos · ${periodLabel()}`;
  const ataRows = state.atas.filter((ata) => (daysFromNow(ata.data_fim_vigencia) ?? 999) <= 90 && textMatch(ata.numero_ata, ata.objeto, ata.situacao));
  $("#ataTable").innerHTML = ataRows.slice(0, 100).map((ata) => { const days = daysFromNow(ata.data_fim_vigencia); const tone = days < 0 ? "high" : days <= 30 ? "medium" : ""; return `<tr><td><strong>${esc(ata.numero_ata || `Ata #${ata.id}`)}</strong><small>${esc(ata.objeto || "Sem objeto")}</small></td><td>${pill(ata.situacao || "—", tone)}</td><td>${fmtDate(ata.data_fim_vigencia)}<small>${days < 0 ? `${Math.abs(days)} dias vencida` : `${days} dias restantes`}</small></td><td>${fmtMoney(ata.valor_global)}</td></tr>`; }).join("") || emptyRow(4, "Nenhuma ata próxima do vencimento no estado atual.");
  $("#ataTableNote").textContent = ataRows.length > 100 ? `Exibindo 100 de ${ataRows.length} atas filtradas; aplique busca para reduzir a lista.` : `${ataRows.length} ata(s) filtrada(s) no estado atual.`;
  $("#orderTable").innerHTML = periodOrders.filter((order) => textMatch(order.numero_pedido, order.status, order.status_aprovacao, unitName(order.unidade_organizacional_id))).map((order) => { const status = order.status_aprovacao || order.status || "—"; return `<tr><td><strong>${esc(order.numero_pedido || `Pedido #${order.id}`)}</strong><small>${esc(unitName(order.unidade_organizacional_id))}</small></td><td>${pill(status, pendingStatuses.includes(status) ? "medium" : status === "APROVADO" ? "success" : "")}</td><td>${fmtDate(order.data_solicitacao)}</td><td>${fmtMoney(order.valor_total)}</td></tr>`; }).join("") || emptyRow(4, `Nenhum pedido solicitado em ${periodLabel()}.`);
}
function renderAll() { renderKpis(); renderAlerts(); renderStructure(); renderPeople(); renderAccess(); if (state.currentUser?.perfil === "ADMIN") renderAudit(); renderOperations(); renderDatabaseViews(); }
function setView(view) {
  const isAdmin = state.currentUser?.perfil === "ADMIN";
  if (view === "audit" && !isAdmin) { toast("A auditoria é exclusiva do perfil ADMIN.", true); view = "overview"; }
  const meta = { overview: ["Visão executiva", "Acompanhe a saúde da estrutura municipal, dos acessos e das operações críticas."], alerts: ["Alertas e decisões", "Priorize pendências com responsável, evidência e ação recomendada."], structure: ["Organograma", "Valide a estrutura, a cobertura de gestores e as pendências institucionais."], people: ["Pessoas e responsabilidades", "Acompanhe lotações, cargos, designações, gestores e substituições."], access: ["Acessos e permissões", "Revise autorizações, escopos, vigências e eventos de segurança."], audit: ["Auditoria e evidências", "Investigue alterações com contexto, ator, origem e estado anterior/novo."], operations: ["Saúde operacional", "Conecte governança à vigência de atas, pedidos, reservas e consumo."], reports: ["Relatórios", "Exporte informações para análise, revisão e prestação de contas."] }[view] || ["Visão executiva", ""];
  document.querySelectorAll(".gov-view").forEach((node) => node.classList.toggle("is-visible", node.dataset.panel === view && (node.dataset.panel !== "audit" || isAdmin)));
  document.querySelectorAll(".app-nav__link").forEach((node) => { const restricted = node.dataset.view === "audit" && !isAdmin; node.hidden = restricted; node.classList.toggle("is-active", node.dataset.view === view && !restricted); });
  $("#pageTitle").textContent = meta[0]; $("#pageSubtitle").textContent = meta[1]; window.history.replaceState(null, "", `#${view}`); document.body.dataset.sidebarOpen = "false";
  if (view === "audit" && isAdmin) renderAudit();
}
function csvEscape(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function downloadCsv(name, headers, rowsData) { const content = [headers, ...rowsData].map((row) => row.map(csvEscape).join(",")).join("\n"); const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); toast(`Arquivo ${name} gerado após registro de auditoria.`); }
async function exportData(type) {
  if (type === "audit" && state.currentUser?.perfil !== "ADMIN") return toast("Exportação de auditoria restrita ao perfil ADMIN.", true);
  let name; let headers; let rowsData;
  if (type === "structure") { name = "governanca-organograma.csv"; headers = ["codigo", "nome", "tipo", "nivel", "ativo", "gestor", "usuarios_vinculados", "risco"]; rowsData = state.units.map((unit) => [unit.codigo, unit.nome, unit.tipo, unit.nivel, unit.ativo, activeManagers().filter((item) => String(item.unidade_id) === String(unit.id)).map((item) => item.nome_responsavel || userName(item.usuario_id)).join("; "), activeLinks().filter((item) => String(item.unidade_id) === String(unit.id)).length, !activeManagers().some((item) => String(item.unidade_id) === String(unit.id)) ? "Alto" : "Baixo"]); }
  else if (type === "access") { name = "governanca-acessos.csv"; headers = ["usuario", "perfil", "ativo", "ultima_entrada", "vinculos", "permissoes", "escopo_amplo"]; rowsData = state.users.map((user) => [user.nome || user.email, user.perfil, user.ativo, user.ultimo_acesso, activeLinks().filter((item) => String(item.usuario_id) === String(user.id)).length, state.permissions.filter((item) => String(item.usuario_id) === String(user.id)).length, state.permissions.some((item) => String(item.usuario_id) === String(user.id) && item.escopo === "MUNICIPIO") ? "sim" : "não"]); }
  else { name = "governanca-auditoria.csv"; headers = ["id_evento", "ocorrido_em", "categoria", "entidade", "entidade_id", "operacao", "ator", "municipio_id", "unidade_organizacional_id", "request_id", "correlacao_id", "origem", "fonte", "campos_de_contexto_ausentes"]; rowsData = state.audits.map((event) => [event.id_evento, event.ocorrido_em, event.categoria, event.entidade, event.entidade_id, event.operacao, auditActor(event), event.municipio_id, event.unidade_organizacional_id, event.request_id, event.correlacao_id, event.origem, event.fonte, auditContextIssues(event).join("; ")]); }
  const correlationId = requestId();
  const { error } = await supabase.rpc("registrar_exportacao_auditada", { p_tipo_relatorio: type, p_periodo_inicio: periodStart().toISOString(), p_periodo_fim: new Date().toISOString(), p_filtros: { periodo: state.period, filtro: state.filter, fonte: "dados_carregados_na_sessao" }, p_quantidade_registros: rowsData.length, p_status: "CONCLUIDA", p_correlacao_id: correlationId, p_request_id: correlationId });
  if (error) return toast(`Exportação bloqueada: ${error.message}`, true);
  downloadCsv(name, headers, rowsData);
}
function bindEvents() { document.querySelectorAll("[data-view]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); setView(link.dataset.view); })); document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));  $("#refreshButton").addEventListener("click", () => loadAll().then(() => toast("Painel atualizado.")).catch((error) => toast(error.message, true))); $("#periodFilter").addEventListener("change", (event) => { state.period = event.target.value; loadAll().catch((error) => toast(error.message || "Falha ao atualizar o período.", true)); }); $("#contentFilter").addEventListener("input", (event) => { state.filter = event.target.value; renderAll(); });  $("#auditOperationFilter").addEventListener("change", renderAudit); $("#auditOriginFilter").addEventListener("change", renderAudit); document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportData(button.dataset.export).catch((error) => toast(error.message || "Falha ao registrar exportação.", true)))); }
async function init() { const guard = await AuthGuard.protegerRota({ registrarAcesso: true }); if (!guard.ok) return; const perfil = guard.usuario?.perfil; if (!["ADMIN", "PREFEITO"].includes(perfil)) { document.body.innerHTML = `<main class="app-main"><div class="gov-card"><h2>Acesso restrito</h2><p>Esta área está disponível para administradores e Prefeito.</p><a class="gov-button primary" href="./intranet.html">Voltar ao hall</a></div></main>`; return; } state.currentUser = guard.usuario; const displayName = guard.usuario.nome || guard.usuario.email || "Usuário"; $("#saudacaoMiniNome").textContent = displayName; $("#menuNome").textContent = displayName; $("#menuEmail").textContent = guard.usuario.email || "—"; $("#avatarIniciais").textContent = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); state.period = $("#periodFilter").value || "30d"; if (perfil !== "ADMIN") document.querySelectorAll('[data-admin-only="true"], [data-view="audit"], [data-export="audit"]').forEach((node) => { node.hidden = true; node.setAttribute("aria-hidden", "true"); }); bindEvents(); setView(location.hash.slice(1) || "overview"); await loadAll(); }
init().catch((error) => { setDataState(error.message || "Falha ao carregar o painel", true); toast(error.message || "Falha ao carregar o painel.", true); });
