import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js";
import { COMPRAS_MENU } from "./compras-menu.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  user: null, tenantId: null, membership: null, units: [], unitById: new Map(),
  demands: [], processes: [], stages: [], tasks: [], contracts: [], suppliers: [], pca: [], obligations: [], publications: [],
  classifications: { tipo_contratacao: [], modalidade: [], procedimento: [] },
  flows: [], flowCatalog: [], flowVersions: [], flowStages: [], substeps: [], holidays: [], processSubsteps: [], favorites: [], recent: [], notifications: [], role: "leitor", activeProcess: null,
};
const manager = () => ["tenant_admin", "compras_manager"].includes(state.role);
const canRequestDemand = () => manager() || state.role === "solicitante";
let processDetailRequestToken = 0;
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
const human = (value = "") => String(value).replaceAll("_", " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const asDate = (value) => value ? dateFmt.format(new Date(`${value}T00:00:00Z`)) : "—";
const money = (value) => value === null || value === undefined || value === "" ? "—" : currency.format(Number(value));
const isOpen = (status) => !["encerrado", "cancelado", "convertida"].includes(status);

const safeHttpUrl = (value) => {
  try { const url = new URL(String(value)); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
};

function toast(message, tone = "success") {
  const node = document.createElement("div");
  node.className = "toast";
  node.dataset.tone = tone;
  node.textContent = message;
  $("#toast-region").append(node);
  window.setTimeout(() => node.remove(), 4500);
}
function banner(message, tone = "info") {
  const node = $("#status-message");
  node.hidden = !message;
  node.dataset.tone = tone;
  node.textContent = message || "";
}
function statusPill(status) {
  return `<span class="status-pill" data-status="${esc(status)}">${esc(human(status || "sem situação"))}</span>`;
}
function dialog(content) {
  processDetailRequestToken += 1;
  $("#dialog-content").innerHTML = content;
  const box = $("#app-dialog");
  if (!box.open) box.showModal();
}
function closeDialog() {
  processDetailRequestToken += 1;
  const box = $("#app-dialog");
  if (box.open) box.close();
  $("#dialog-content").replaceChildren();
}
$("#app-dialog")?.addEventListener("close", () => { processDetailRequestToken += 1; });
function actionsFooter(cancel = "Fechar", submit = "Salvar") {
  return `<div class="dialog-actions"><button class="button button-outline" type="button" data-dialog-close>${esc(cancel)}</button><button class="button button-primary" type="submit">${esc(submit)}</button></div>`;
}
function unitName(id) { return state.unitById.get(id)?.nome || "Unidade"; }
function selectOptions(items, selected = "", placeholder = "Selecione…") {
  return `<option value="">${esc(placeholder)}</option>${items.map((item) => `<option value="${esc(item.value)}" ${String(selected) === String(item.value) ? "selected" : ""}>${esc(item.label)}</option>`).join("")}`;
}
function unitSelect(name = "unidade_id", selected = state.membership?.unidade_id) {
  if (!manager()) return `<input type="hidden" name="${name}" value="${esc(selected || "")}"><div class="form-help">Unidade vinculada ao seu acesso: <strong>${esc(unitName(selected))}</strong>.</div>`;
  return `<select name="${name}" required>${selectOptions(state.units.map((u) => ({ value: u.id, label: `${u.sigla ? `${u.sigla} · ` : ""}${u.nome}` })), selected, "Escolha a unidade…")}</select>`;
}
function emptyRow(cols, message) { return `<tr><td colspan="${cols}" class="table-empty">${esc(message)}</td></tr>`; }
function supplierName(id) {
  const supplier = state.suppliers.find((row) => String(row.id) === String(id));
  return supplier ? supplier.nome_fantasia || supplier.razao_social : `Fornecedor ${id ?? "—"}`;
}
function isFavorite(entidade, entidadeId) { return state.favorites.some((row) => row.entidade === entidade && row.entidade_id === entidadeId); }
async function recordRecent(entidade, entidadeId) {
  if (!state.tenantId || !state.user?.id || !entidadeId) return;
  const payload = { tenant_id: state.tenantId, usuario_id: state.user.id, entidade, entidade_id: entidadeId, acessado_em: new Date().toISOString() };
  const { error } = await supabase.from("compras_acessos_recentes").upsert(payload, { onConflict: "tenant_id,usuario_id,entidade,entidade_id" });
  if (!error) state.recent = [payload, ...state.recent.filter((row) => !(row.entidade === entidade && row.entidade_id === entidadeId))].slice(0, 20);
}
async function toggleFavorite(entidade, entidadeId) {
  if (isFavorite(entidade, entidadeId)) {
    const { error } = await supabase.from("compras_favoritos").delete().eq("tenant_id", state.tenantId).eq("usuario_id", state.user.id).eq("entidade", entidade).eq("entidade_id", entidadeId);
    if (error) throw error;
    state.favorites = state.favorites.filter((row) => !(row.entidade === entidade && row.entidade_id === entidadeId));
    toast("Removido dos favoritos.");
  } else {
    const row = { tenant_id: state.tenantId, usuario_id: state.user.id, entidade, entidade_id: entidadeId };
    const { data, error } = await supabase.from("compras_favoritos").insert(row).select("id,entidade,entidade_id,created_at").single();
    if (error) throw error;
    state.favorites.push(data || row);
    toast("Adicionado aos favoritos.");
  }
  if (entidade === "processo" && state.activeProcess?.id === entidadeId) renderProcessDetail();
}
async function markNotificationRead(notificationId) {
  const { error } = await supabase.from("compras_notificacoes").update({ lida_em: new Date().toISOString() }).eq("id", notificationId).eq("tenant_id", state.tenantId).eq("usuario_id", state.user.id).is("lida_em", null);
  if (error) throw error;
  state.notifications = state.notifications.filter((row) => row.id !== notificationId);
  renderAttention();
}

async function loadMembership() {
  const { data, error } = await supabase.from("app_tenant_memberships")
    .select("tenant_id,unidade_id,role,ativo")
    .eq("user_id", state.user.id).eq("ativo", true).limit(2);
  if (error) throw error;
  if (!data?.length) throw new Error("Seu usuário ainda não tem vínculo ativo com este módulo. Peça ao administrador da Intranet para conferir o acesso.");
  if (data.length > 1) throw new Error("Este acesso está associado a mais de uma organização. É necessário escolher a unidade/organização antes de continuar.");
  state.membership = data[0];
  state.tenantId = data[0].tenant_id;
  state.role = data[0].role;
  const unitQuery = supabase.from("app_tenant_units").select("id,nome,sigla,ativo")
    .eq("tenant_id", state.tenantId).eq("ativo", true).order("nome").limit(100);
  const { data: units, error: unitError } = await unitQuery;
  if (unitError) throw unitError;
  state.units = units || [];
  state.unitById = new Map(state.units.map((u) => [u.id, u]));
  const unit = state.unitById.get(state.membership.unidade_id);
  const context = $("#context-bar");
  context.hidden = false;
  context.innerHTML = `<i class="fa-solid fa-building" aria-hidden="true"></i><span><strong>${manager() ? "Acesso de gestão" : "Sua unidade"}</strong> · ${esc(unit?.nome || (manager() ? "Todas as unidades autorizadas" : "Unidade não definida"))}</span><span class="context-role">${esc(human(state.role))}</span>`;
}

async function fetchRows(table, columns, configure = (query) => query) {
  let query = supabase.from(table).select(columns).eq("tenant_id", state.tenantId);
  query = configure(query);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
async function loadData() {
  const tasks = [
    fetchRows("compras_demandas", "id,unidade_id,numero,objeto,justificativa,prioridade,valor_estimado,data_necessidade,responsavel_id,status,criado_por,created_at,updated_at", (q) => q.order("created_at", { ascending: false }).limit(200)),
    fetchRows("compras_processos", "id,demanda_id,unidade_id,numero_processo,ano,numero_edital,objeto,descricao,tipo_contratacao,modalidade,procedimento,fundamento_legal,valor_estimado,valor_homologado,status,responsavel_id,ata_id,data_abertura,data_homologacao,created_at,updated_at", (q) => q.order("ano", { ascending: false }).order("created_at", { ascending: false }).limit(200)),
    fetchRows("compras_tarefas", "id,demanda_id,processo_id,etapa_id,titulo,descricao,prioridade,status,responsavel_id,prazo,created_at", (q) => q.order("prazo", { ascending: true }).limit(200)),
    fetchRows("compras_contratos", "id,processo_id,ata_id,fornecedor_id,numero,objeto,valor_atual,vigencia_inicio,vigencia_fim,gestor_id,fiscal_id,situacao", (q) => q.order("vigencia_fim", { ascending: true }).limit(200)),
    fetchRows("compras_classificacoes", "id,tipo,nome,descricao,sugestao,ordem", (q) => q.eq("ativo", true).order("ordem").limit(150)),
    fetchRows("compras_fluxos", "id,nome,tipo_contratacao,ativo", (q) => q.eq("ativo", true).order("nome").limit(100)),
    fetchRows("compras_fluxo_versoes", "id,fluxo_id,versao,situacao,publicada_em", (q) => q.order("versao", { ascending: false }).limit(200)),
    supabase.from("fornecedores").select("id,razao_social,nome_fantasia,cnpj").eq("ativo", true).order("razao_social").limit(200),
    fetchRows("compras_pca_itens", "id,ano_plano,unidade_id,processo_id,descricao,quantidade,unidade_medida,valor_estimado,prioridade,mes_previsto,status", (q) => q.order("ano_plano", { ascending: false }).order("mes_previsto").limit(500)),
    fetchRows("compras_obrigacoes", "id,processo_id,contrato_id,origem,descricao,prazo,responsavel_id,status,comprovante_url", (q) => q.order("prazo").limit(500)),
    fetchRows("compras_publicacoes", "id,processo_id,canal,tipo,status,data_publicacao,protocolo_externo,url_publica,comprovante,observacoes", (q) => q.order("data_publicacao", { ascending: false }).limit(300)),
    fetchRows("compras_feriados", "id,data,nome,abrangencia", (q) => q.order("data").limit(300)),
    fetchRows("compras_fluxo_etapas", "id,fluxo_versao_id,ordem,codigo,nome,descricao,prazo_dias,responsavel_padrao,ativa", (q) => q.eq("ativa", true).order("ordem").limit(500)),
    fetchRows("compras_fluxo_subetapas", "id,fluxo_etapa_id,ordem,codigo,nome,descricao,prazo_dias,responsavel_padrao,ativa", (q) => q.eq("ativa", true).order("ordem").limit(1000)),
  ];
  const results = await Promise.all(tasks);
  for (const result of results) if (result?.error) throw result.error;
  [state.demands, state.processes, state.tasks, state.contracts] = results.slice(0, 4);
  const categories = results[4] || [];
  state.classifications = { tipo_contratacao: [], modalidade: [], procedimento: [] };
  for (const row of categories) (state.classifications[row.tipo] ||= []).push(row.nome);
  const flows = results[5] || [];
  const versions = results[6] || [];
  state.flowCatalog = flows;
  state.flowVersions = versions;
  state.flows = versions.filter((v) => v.situacao === "publicada").map((v) => ({ ...v, nome: flows.find((f) => f.id === v.fluxo_id)?.nome || "Fluxo", tipo_contratacao: flows.find((f) => f.id === v.fluxo_id)?.tipo_contratacao || "" }));
  state.suppliers = results[7]?.data || [];
  if (results[7]?.error) throw results[7].error;
  state.pca = results[8] || [];
  state.obligations = results[9] || [];
  state.publications = results[10] || [];
  state.holidays = results[11] || [];
  state.flowStages = results[12] || [];
  state.substeps = results[13] || [];
  const processIds = state.processes.map((p) => p.id);
  if (processIds.length) {
    const { data, error } = await supabase.from("compras_processos_etapas")
      .select("id,processo_id,ordem,nome,status,prazo,concluida_em")
      .eq("tenant_id", state.tenantId).in("processo_id", processIds).order("ordem").limit(1000);
    if (error) throw error;
    state.stages = data || [];
  } else state.stages = [];
  const [favoriteResult, recentResult, notificationResult] = await Promise.all([
    supabase.from("compras_favoritos").select("id,entidade,entidade_id,created_at").eq("tenant_id", state.tenantId).eq("usuario_id", state.user.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("compras_acessos_recentes").select("id,entidade,entidade_id,acessado_em").eq("tenant_id", state.tenantId).eq("usuario_id", state.user.id).order("acessado_em", { ascending: false }).limit(20),
    supabase.from("compras_notificacoes").select("id,tipo,titulo,mensagem,prioridade,entidade,entidade_id,lida_em,created_at").eq("tenant_id", state.tenantId).eq("usuario_id", state.user.id).is("lida_em", null).order("created_at", { ascending: false }).limit(30),
  ]);
  if (favoriteResult.error) throw favoriteResult.error;
  if (recentResult.error) throw recentResult.error;
  if (notificationResult.error) throw notificationResult.error;
  state.favorites = favoriteResult.data || [];
  state.recent = recentResult.data || [];
  state.notifications = notificationResult.data || [];
  renderAll();
}

function currentStage(processId) {
  const rows = state.stages.filter((s) => s.processo_id === processId);
  return rows.find((s) => !["concluida", "concluído", "concluido"].includes((s.status || "").toLowerCase())) || rows.at(-1);
}
function renderAll() {
  const demandsOpen = state.demands.filter((d) => ["enviada", "em_analise"].includes(d.status)).length;
  const processesOpen = state.processes.filter((p) => isOpen(p.status)).length;
  const pendingTasks = state.tasks.filter((t) => !["concluida", "concluído", "concluido", "cancelada"].includes((t.status || "").toLowerCase())).length;
  const activeContracts = state.contracts.filter((c) => !["encerrado", "encerrada", "rescindido", "cancelado"].includes((c.situacao || "").toLowerCase())).length;
  $("#kpi-demands").textContent = demandsOpen;
  $("#kpi-processes").textContent = processesOpen;
  $("#kpi-tasks").textContent = pendingTasks;
  $("#kpi-contracts").textContent = activeContracts;
  renderAttention();
  renderOverviewProcesses();
  renderDemands();
  renderProcesses();
  renderContracts();
  renderPca();
  renderAgenda();
  renderPublications();
  renderSettings();
  renderFullFlowEditor();
  $("#hero-new-process").hidden = !manager();
  $("#new-process-button").hidden = !manager();
  $("#new-pca-button").hidden = !manager();
  $("#new-publication-button").hidden = !manager();
  $("#new-obligation-button").hidden = !manager();
  $("#settings-tab").hidden = !manager();
  $("#new-holiday-button").hidden = !manager();
  $$("[data-action='new-demand']").forEach((button) => { button.hidden = !canRequestDemand(); });
}
function renderAttention() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = state.tasks.filter((t) => t.prazo && new Date(`${t.prazo}T00:00:00`) < today && !["concluida", "concluído", "concluido"].includes((t.status || "").toLowerCase()));
  const upcoming = state.tasks.filter((t) => t.prazo && new Date(`${t.prazo}T00:00:00`) >= today && new Date(`${t.prazo}T00:00:00`) <= new Date(today.getTime() + 7 * 86400000) && !["concluida", "concluído", "concluido"].includes((t.status || "").toLowerCase()));
  const waiting = state.demands.filter((d) => ["enviada", "em_analise"].includes(d.status));
  const notificationItems = state.notifications.slice(0, 4).map((n) => ({ icon: ["alta", "urgente"].includes(n.prioridade) ? "fa-triangle-exclamation" : "fa-bell", title: n.titulo, text: n.mensagem, notificationId: n.id }));
  const items = [
    ...notificationItems,
    ...overdue.slice(0, 3).map((t) => ({ icon: "fa-triangle-exclamation", title: `Prazo vencido: ${t.titulo}`, text: `${t.processo_id ? "Processo em acompanhamento" : "Necessidade"} · prazo ${asDate(t.prazo)}`, tone: "warning" })),
    ...upcoming.slice(0, 3).map((t) => ({ icon: "fa-clock", title: `Prazo próximo: ${t.titulo}`, text: `Vence em ${asDate(t.prazo)}`, tone: "warning" })),
    ...waiting.slice(0, 2).map((d) => ({ icon: "fa-inbox", title: `Necessidade aguardando análise: ${d.objeto}`, text: `${unitName(d.unidade_id)} · ${human(d.status)}`, tone: "neutral" })),
  ];
  $("#attention-list").innerHTML = items.length ? items.map((i) => `<div class="attention-item"><span class="attention-icon"><i class="fa-solid ${i.icon}" aria-hidden="true"></i></span><div><strong>${esc(i.title)}</strong><p>${esc(i.text)}</p>${i.notificationId ? `<button class="button button-outline button-small" type="button" data-read-notification="${esc(i.notificationId)}">Marcar como lida</button>` : ""}</div></div>`).join("") : `<div class="attention-empty"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><strong>Sem pendências urgentes encontradas.</strong><p>Quando houver prazo próximo ou necessidade aguardando análise, ela aparecerá aqui.</p></div>`;
}
function processSummary(p) {
  const stage = currentStage(p.id);
  return `<span class="record-primary">${esc(p.numero_processo)}/${esc(p.ano)}</span><span class="record-secondary">${esc(unitName(p.unidade_id))}</span>`;
}
function renderOverviewProcesses() {
  const rows = state.processes.filter((p) => isOpen(p.status)).slice(0, 6);
  $("#overview-processes").innerHTML = rows.length ? rows.map((p) => {
    const stage = currentStage(p.id);
    return `<tr><td>${processSummary(p)}</td><td><span class="record-primary">${esc(p.objeto)}</span></td><td>${esc([p.modalidade, p.procedimento].filter(Boolean).join(" · ") || human(p.tipo_contratacao || "A classificar"))}</td><td>${esc(stage?.nome || "Etapa não definida")}</td><td>${statusPill(p.status)}</td><td><div class="row-actions"><a class="button button-outline button-small" href="./processo.html?id=${encodeURIComponent(p.id)}">Ficha</a><button class="icon-button" type="button" data-open-process="${esc(p.id)}" aria-label="Abrir ações do processo ${esc(p.numero_processo)}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button></div></td></tr>`;
  }).join("") : emptyRow(6, "Ainda não há processos em andamento visíveis para o seu acesso.");
}
function renderDemands() {
  const term = $("#demand-search")?.value.trim().toLowerCase() || "";
  const status = $("#demand-status-filter")?.value || "";
  const rows = state.demands.filter((d) => (!status || d.status === status) && (!term || `${d.objeto} ${unitName(d.unidade_id)}`.toLowerCase().includes(term)));
  $("#demands-table").innerHTML = rows.length ? rows.map((d) => {
    const actions = [];
    if (canRequestDemand() && d.criado_por === state.user.id && d.status === "rascunho") actions.push(`<button class="button button-outline button-small" type="button" data-send-demand="${esc(d.id)}">Enviar para análise</button>`);
    if (manager() && ["enviada", "em_analise"].includes(d.status)) actions.push(`<button class="button button-primary button-small" type="button" data-convert-demand="${esc(d.id)}">Abrir processo</button>`);
    return `<tr><td><span class="record-primary">${esc(d.objeto)}</span><span class="record-secondary">${esc(d.numero || "Necessidade sem número")}</span></td><td>${esc(unitName(d.unidade_id))}</td><td><span class="priority-pill" data-priority="${esc(d.prioridade)}">${esc(human(d.prioridade))}</span></td><td>${money(d.valor_estimado)}</td><td>${asDate(d.data_necessidade)}</td><td>${statusPill(d.status)}</td><td><div class="row-actions">${actions.join("")}</div></td></tr>`;
  }).join("") : emptyRow(7, canRequestDemand() ? "Nenhuma necessidade encontrada. Use “Registrar necessidade” para começar." : "Nenhuma necessidade encontrada para sua unidade.");
}
function renderProcesses() {
  const term = $("#process-search")?.value.trim().toLowerCase() || "";
  const status = $("#process-status-filter")?.value || "";
  const rows = state.processes.filter((p) => (!status || p.status === status) && (!term || `${p.numero_processo} ${p.ano} ${p.objeto} ${p.modalidade || ""} ${p.procedimento || ""}`.toLowerCase().includes(term)));
  $("#processes-table").innerHTML = rows.length ? rows.map((p) => {
    const stage = currentStage(p.id);
    const due = stage?.prazo ? asDate(stage.prazo) : "—";
    return `<tr><td>${processSummary(p)}</td><td><span class="record-primary">${esc(p.objeto)}</span><span class="record-secondary">${esc(unitName(p.unidade_id))}</span></td><td>${esc([p.modalidade, p.procedimento].filter(Boolean).join(" · ") || human(p.tipo_contratacao || "A classificar"))}</td><td>${money(p.valor_estimado)}</td><td>${statusPill(p.status)}</td><td>${due}</td><td><div class="row-actions"><a class="button button-outline button-small" href="./processo.html?id=${encodeURIComponent(p.id)}">Ficha</a><button class="button button-outline button-small" type="button" data-open-process="${esc(p.id)}">Ações</button></div></td></tr>`;
  }).join("") : emptyRow(7, "Nenhum processo encontrado para este filtro.");
}
function renderContracts() {
  const rows = state.contracts;
  $("#contracts-table").innerHTML = rows.length ? rows.map((c) => {
    const proc = state.processes.find((p) => p.id === c.processo_id);
    return `<tr><td><span class="record-primary">${esc(c.numero)}</span><span class="record-secondary">Processo ${esc(proc ? `${proc.numero_processo}/${proc.ano}` : "—")}</span></td><td>${esc(c.objeto)}</td><td>${esc(supplierName(c.fornecedor_id))}</td><td>${money(c.valor_atual)}</td><td>${asDate(c.vigencia_inicio)} – ${asDate(c.vigencia_fim)}</td><td>${statusPill(c.situacao)}</td><td><button class="button button-outline button-small" type="button" data-open-contract="${esc(c.id)}">Acompanhar</button></td></tr>`;
  }).join("") : emptyRow(7, "Nenhum contrato cadastrado ainda.");
}

function renderPca() {
  const rows = [...state.pca].sort((a, b) => b.ano_plano - a.ano_plano || (a.mes_previsto || 13) - (b.mes_previsto || 13));
  $("#pca-table").innerHTML = rows.length ? rows.map((r) => `<tr><td>${esc(r.ano_plano)}</td><td>${esc(unitName(r.unidade_id))}</td><td><span class="record-primary">${esc(r.descricao)}</span>${r.processo_id ? `<span class="record-secondary">Vinculado a processo</span>` : ""}</td><td>${r.quantidade ? `${esc(r.quantidade)} ${esc(r.unidade_medida || "")}` : "—"}</td><td>${money(r.valor_estimado)}</td><td>${r.mes_previsto ? esc(new Date(Date.UTC(2020, r.mes_previsto - 1, 1)).toLocaleString("pt-BR", { month: "long", timeZone: "UTC" })) : "A definir"}</td><td><span class="priority-pill" data-priority="${esc(r.prioridade)}">${esc(human(r.prioridade))}</span></td><td>${statusPill(r.status)}</td></tr>`).join("") : emptyRow(8, "Nenhuma previsão cadastrada. Registre os itens que sua unidade espera contratar.");
}

function renderPublications() {
  const rows = [...state.publications].sort((a, b) => (b.data_publicacao || "").localeCompare(a.data_publicacao || ""));
  $("#publications-table").innerHTML = rows.length ? rows.map((r) => {
    const process = state.processes.find((p) => p.id === r.processo_id);
    const link = safeHttpUrl(r.url_publica || r.comprovante);
    return `<tr><td><span class="record-primary">${esc(process ? `${process.numero_processo}/${process.ano}` : "Processo")}</span><span class="record-secondary">${esc(process?.objeto || "")}</span></td><td>${esc(r.canal)}<span class="record-secondary">${esc(r.tipo)}</span></td><td>${asDate(r.data_publicacao)}</td><td>${esc(r.protocolo_externo || "—")}</td><td>${statusPill(r.status)}</td><td>${link ? `<a class="button button-outline button-small" href="${esc(link)}" target="_blank" rel="noopener">Abrir</a>` : "—"}</td></tr>`;
  }).join("") : emptyRow(6, "Nenhuma publicação registrada. Use o botão para cadastrar um registro manual.");
}

function renderAgenda() {
  const today = new Date().toISOString().slice(0, 10);
  const items = [
    ...state.tasks.filter((t) => t.prazo && !["concluida", "concluído", "concluido", "cancelada"].includes((t.status || "").toLowerCase())).map((t) => ({ id: t.id, type: "Tarefa", title: t.titulo, due: t.prazo, status: t.status, processId: t.processo_id, description: t.descricao, canComplete: manager() || Number(t.responsavel_id) === Number(state.user.id) })),
    ...state.obligations.filter((o) => o.prazo && !["concluida", "concluído", "concluido", "cancelada"].includes((o.status || "").toLowerCase())).map((o) => ({ id: o.id, type: "Obrigação", title: o.descricao, due: o.prazo, status: o.status, processId: o.processo_id || state.contracts.find((c) => c.id === o.contrato_id)?.processo_id, description: o.origem, canComplete: manager() })),
  ].sort((a, b) => a.due.localeCompare(b.due));
  $("#agenda-list").innerHTML = items.length ? items.map((i) => {
    const completeAction = i.canComplete ? `<button class="button button-outline button-small" type="button" ${i.type === "Tarefa" ? `data-complete-task="${esc(i.id)}"` : `data-complete-obligation="${esc(i.id)}"`}>Concluir</button>` : "";
    return `<article class="agenda-item" data-overdue="${i.due < today}"><div class="agenda-date"><strong>${esc(asDate(i.due))}</strong><small>${i.due < today ? "Atrasado" : "Prazo"}</small></div><div class="agenda-copy"><span class="agenda-type">${esc(i.type)}${i.processId ? ` · Processo ${esc(state.processes.find((p) => p.id === i.processId)?.numero_processo || "")}` : ""}</span><strong>${esc(i.title)}</strong><small>${esc(i.description || "")}</small></div><div class="agenda-status">${statusPill(i.status)}${completeAction}</div></article>`;
  }).join("") : `<div class="surface-card attention-empty"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i><strong>Sem prazos pendentes cadastrados.</strong><p>As datas de tarefas e obrigações aparecerão aqui.</p></div>`;
}

function renderSettings() {
  const holidays = $("#holidays-list");
  if (!holidays) return;
  holidays.innerHTML = state.holidays.length ? state.holidays.map((h) => `<article class="agenda-item"><div class="agenda-date"><strong>${esc(asDate(h.data))}</strong><small>${esc(h.abrangencia || "municipal")}</small></div><div class="agenda-copy"><strong>${esc(h.nome)}</strong><small>Entra no cálculo de dias úteis deste tenant.</small></div><div class="agenda-status"><button class="button button-outline button-small" type="button" data-delete-holiday="${esc(h.id)}">Excluir</button></div></article>`).join("") : `<div class="attention-empty"><i class="fa-regular fa-calendar" aria-hidden="true"></i><strong>Nenhum feriado configurado.</strong><p>Finais de semana continuam sendo ignorados automaticamente.</p></div>`;
  const editor = $("#flow-editor");
  if (!editor) return;
  editor.innerHTML = state.flows.length ? state.flows.map((flow) => {
    const stages = state.flowStages.filter((s) => s.fluxo_versao_id === flow.id);
    return `<div class="detail-section"><div class="card-heading"><div><strong>${esc(flow.nome)} · v${esc(flow.versao)}</strong><span class="record-secondary">${esc(human(flow.tipo_contratacao))}</span></div></div>${stages.length ? stages.map((stage) => { const subs = state.substeps.filter((s) => s.fluxo_etapa_id === stage.id); return `<div class="detail-row"><span><strong>${esc(stage.ordem)}. ${esc(stage.nome)}</strong><span class="record-secondary">${stage.prazo_dias !== null && stage.prazo_dias !== undefined ? `${esc(stage.prazo_dias)} dias úteis` : "Sem prazo padrão"}${subs.length ? ` · ${subs.length} subetapa(s)` : ""}</span>${subs.map((sub) => `<span class="record-secondary">↳ ${esc(sub.ordem)}. ${esc(sub.nome)}${sub.prazo_dias !== null && sub.prazo_dias !== undefined ? ` · ${esc(sub.prazo_dias)} dias` : ""}</span>`).join("")}</span><button class="button button-outline button-small" type="button" data-new-substep="${esc(stage.id)}">Adicionar subetapa</button></div>`; }).join("") : `<p class="muted-text">Nenhuma etapa publicada nesta versão.</p>`}</div>`;
  }).join("") : `<div class="attention-empty"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i><strong>Nenhum fluxo publicado disponível.</strong><p>Publique uma versão de fluxo antes de cadastrar subetapas.</p></div>`;
}

function renderFullFlowEditor() {
  const editor = $("#flow-editor");
  if (!editor) return;
  const versions = state.flowVersions.map((version) => {
    const flow = state.flowCatalog.find((row) => row.id === version.fluxo_id);
    const stages = state.flowStages.filter((row) => row.fluxo_versao_id === version.id);
    const actions = version.situacao === "rascunho" ? `<button class="button button-outline button-small" type="button" data-new-stage="${esc(version.id)}">Adicionar etapa</button><button class="button button-primary button-small" type="button" data-publish-version="${esc(version.id)}">Publicar versão</button>` : `<button class="button button-outline button-small" type="button" data-clone-version="${esc(version.id)}">Criar nova versão</button>`;
    return `<div class="detail-section"><div class="card-heading card-heading-row"><div><strong>${esc(flow?.nome || "Fluxo")} · v${esc(version.versao)}</strong><span class="record-secondary">${esc(human(version.situacao))} · ${esc(flow?.tipo_contratacao || "")}</span></div><div class="row-actions">${actions}</div></div>${stages.length ? stages.map((stage) => { const subs = state.substeps.filter((sub) => sub.fluxo_etapa_id === stage.id); return `<div class="detail-row"><span><strong>${esc(stage.ordem)}. ${esc(stage.nome)}</strong><span class="record-secondary">${esc(stage.codigo)}${stage.prazo_dias !== null && stage.prazo_dias !== undefined ? ` · ${esc(stage.prazo_dias)} dias úteis` : ""}</span>${subs.map((sub) => `<span class="record-secondary">↳ ${esc(sub.ordem)}. ${esc(sub.nome)}${version.situacao === "rascunho" ? ` <button class="button button-outline button-small" type="button" data-edit-substep="${esc(sub.id)}">Editar</button><button class="button button-outline button-small" type="button" data-delete-substep="${esc(sub.id)}">Excluir</button>` : ""}</span>`).join("")}</span>${version.situacao === "rascunho" ? `<span class="row-actions"><button class="button button-outline button-small" type="button" data-edit-stage="${esc(stage.id)}">Editar etapa</button><button class="button button-outline button-small" type="button" data-new-substep="${esc(stage.id)}">Subetapa</button><button class="button button-outline button-small" type="button" data-delete-stage="${esc(stage.id)}">Excluir etapa</button></span>` : ""}</div>`; }).join("") : `<p class="muted-text">Versão sem etapas. Adicione a primeira etapa.</p>`}</div>`;
  }).join("");
  editor.innerHTML = versions || `<div class="attention-empty"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i><strong>Nenhum fluxo cadastrado.</strong><p>Crie o primeiro fluxo para começar a configurar etapas e versões.</p></div>`;
}

function exportReport() {
  const data = [
    ["Tipo", "Identificador", "Ano", "Unidade", "Descrição", "Modalidade/Status", "Valor estimado", "Data/Prazo"],
    ...state.demands.map((d) => ["Necessidade", d.numero || d.id, "", unitName(d.unidade_id), d.objeto, d.status, d.valor_estimado ?? "", d.data_necessidade || ""]),
    ...state.pca.map((r) => ["PCA", r.id, r.ano_plano, unitName(r.unidade_id), r.descricao, `${r.prioridade} / ${r.status}`, r.valor_estimado ?? "", r.mes_previsto ?? ""]),
    ...state.processes.map((p) => ["Processo", `${p.numero_processo}/${p.ano}`, p.ano, unitName(p.unidade_id), p.objeto, [p.modalidade, p.procedimento, p.status].filter(Boolean).join(" / "), p.valor_estimado ?? "", p.data_abertura || ""]),
    ...state.contracts.map((c) => ["Contrato", c.numero, "", "", c.objeto, c.situacao, c.valor_atual, c.vigencia_fim || ""]),
    ...state.obligations.map((o) => ["Obrigação", o.id, "", "", o.descricao, o.status, "", o.prazo || ""]),
  ];
  const csvCell = (value) => { let text = String(value ?? "").replace(/[\r\n]+/g, " "); if (/^[=+@\-]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
  const csv = "\ufeff" + data.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `compras-publicas-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  toast("Relatório CSV baixado. Ele contém somente os registros visíveis ao seu acesso.");
}

function switchTab(name) {
  $$(".section-tab[data-tab]").forEach((b) => { const active = b.dataset.tab === name; b.classList.toggle("is-active", active); b.setAttribute("aria-selected", String(active)); });
  $$(".tab-panel").forEach((panel) => { const active = panel.id === `tab-${name}`; panel.classList.toggle("is-active", active); panel.hidden = !active; });
}
function switchToHashTab() {
  const tab = { "#tab-overview": "overview", "#tab-demands": "demands", "#tab-pca": "pca", "#tab-processes": "processes", "#tab-publications": "publications", "#tab-contracts": "contracts", "#tab-agenda": "agenda", "#tab-settings": "settings" }[window.location.hash];
  if (tab) switchTab(tab);
}
function searchText(...values) { return values.filter((value) => value !== null && value !== undefined).join(" ").toLocaleLowerCase("pt-BR"); }
function openGlobalSearch() {
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Localizar na área de Compras</h2><p>Pesquise nos registros já disponíveis para o seu acesso.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><div class="dialog-body global-search-body"><label class="search-field" for="global-search-input"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span class="sr-only">Buscar em Compras</span><input id="global-search-input" type="search" autocomplete="off" placeholder="Processo, fornecedor, contrato, objeto…" /></label><p class="form-help">A busca respeita o conjunto de dados que o sistema carregou para seu tenant e perfil. Não consulta outros módulos nem dados fora da sua autorização.</p><div id="global-search-results" class="global-search-results" aria-live="polite"></div></div>`);
  const input = $("#global-search-input");
  input?.addEventListener("input", () => renderGlobalSearchResults(input.value));
  input?.focus();
  renderGlobalSearchResults("");
}
function renderGlobalSearchResults(rawTerm = "") {
  const container = $("#global-search-results");
  if (!container) return;
  const term = rawTerm.trim().toLocaleLowerCase("pt-BR");
  if (term.length < 2) { container.innerHTML = `<div class="search-empty"><i class="fa-solid fa-keyboard" aria-hidden="true"></i><strong>Digite pelo menos 2 caracteres.</strong><p>Você pode buscar por número, objeto, unidade, fornecedor, contrato ou situação.</p></div>`; return; }
  const results = [
    ...state.processes.map((p) => ({ type: "Processo", icon: "fa-folder-tree", title: `${p.numero_processo}/${p.ano} · ${p.objeto}`, meta: `${unitName(p.unidade_id)} · ${[p.modalidade, p.procedimento, p.status].filter(Boolean).join(" · ")}`, action: `<button type="button" class="button button-outline button-small" data-open-process="${esc(p.id)}">Abrir ficha</button>`, haystack: searchText("processo", p.numero_processo, p.ano, p.objeto, p.modalidade, p.procedimento, p.status, unitName(p.unidade_id)) })),
    ...state.demands.map((d) => ({ type: "Necessidade", icon: "fa-inbox", title: d.objeto, meta: `${unitName(d.unidade_id)} · ${human(d.status)} · ${money(d.valor_estimado)}`, action: `<button type="button" class="button button-outline button-small" data-search-jump="demands" data-search-value="${esc(d.objeto)}">Ver necessidade</button>`, haystack: searchText("necessidade", d.numero, d.objeto, d.justificativa, d.status, unitName(d.unidade_id)) })),
    ...state.contracts.map((c) => ({ type: "Contrato", icon: "fa-file-contract", title: `${c.numero} · ${c.objeto}`, meta: `${supplierName(c.fornecedor_id)} · ${human(c.situacao)}`, action: `<button type="button" class="button button-outline button-small" data-open-contract="${esc(c.id)}">Acompanhar</button>`, haystack: searchText("contrato", c.numero, c.objeto, supplierName(c.fornecedor_id), c.situacao) })),
    ...state.pca.map((r) => ({ type: "PCA", icon: "fa-calendar-check", title: r.descricao, meta: `${r.ano_plano} · ${unitName(r.unidade_id)} · ${human(r.status)}`, action: `<button type="button" class="button button-outline button-small" data-search-jump="pca" data-search-value="${esc(r.descricao)}">Ver planejamento</button>`, haystack: searchText("pca", r.ano_plano, r.descricao, r.status, unitName(r.unidade_id)) })),
    ...state.publications.map((r) => { const p = state.processes.find((row) => row.id === r.processo_id); return { type: "Publicação", icon: "fa-bullhorn", title: `${r.canal || "Canal"} · ${p ? `${p.numero_processo}/${p.ano}` : "Processo"}`, meta: `${r.tipo || ""} · ${human(r.status)}`, action: `<button type="button" class="button button-outline button-small" data-search-jump="publications" data-search-value="${esc(p?.numero_processo || r.canal || "")}">Ver publicação</button>`, haystack: searchText("publicação", r.canal, r.tipo, r.status, r.protocolo_externo, p?.numero_processo, p?.objeto) }; }),
    ...state.tasks.map((t) => ({ type: "Tarefa", icon: "fa-list-check", title: t.titulo, meta: `${t.prazo ? `Prazo ${asDate(t.prazo)}` : "Sem prazo"} · ${human(t.status)}`, action: `<button type="button" class="button button-outline button-small" data-search-jump="agenda" data-search-value="${esc(t.titulo)}">Ver agenda</button>`, haystack: searchText("tarefa", t.titulo, t.descricao, t.status, t.prazo) })),
    ...state.obligations.map((o) => ({ type: "Obrigação", icon: "fa-calendar-check", title: o.descricao, meta: `${o.origem || ""} · ${o.prazo ? asDate(o.prazo) : "Sem prazo"}`, action: `<button type="button" class="button button-outline button-small" data-search-jump="agenda" data-search-value="${esc(o.descricao)}">Ver agenda</button>`, haystack: searchText("obrigação", o.descricao, o.origem, o.status, o.prazo) })),
  ].filter((row) => row.haystack.includes(term)).slice(0, 30);
  container.innerHTML = results.length ? `<p class="search-result-count">${results.length} resultado(s)${results.length === 30 ? " · mostrando os 30 primeiros" : ""}.</p>${results.map((row) => `<article class="search-result"><span class="search-result-icon"><i class="fa-solid ${row.icon}" aria-hidden="true"></i></span><div class="search-result-copy"><span class="search-result-type">${esc(row.type)}</span><strong>${esc(row.title)}</strong><small>${esc(row.meta)}</small></div>${row.action}</article>`).join("")}` : `<div class="search-empty"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><strong>Nenhum registro encontrado.</strong><p>Tente outro número, nome, objeto ou situação.</p></div>`;
}
function openDemandForm(prefill = {}) {
  if (!canRequestDemand()) return toast("Seu perfil pode consultar necessidades, mas não registrá-las. Peça ao administrador para atribuir o papel de solicitante.", "error");
  const priorities = ["baixa", "normal", "alta", "urgente"].map((v) => ({ value: v, label: human(v) }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Registrar uma necessidade</h2><p>Descreva o que sua unidade precisa. Você poderá acompanhar a análise depois.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="demand-form" class="dialog-body"><div class="dialog-callout">Preencha com palavras simples e específicas. A justificativa explica por que a compra é necessária; ela não substitui a instrução formal do processo.</div><div class="form-grid"><div class="form-field span-2"><label for="demand-object">O que sua unidade precisa? *</label><textarea id="demand-object" name="objeto" required maxlength="2000" placeholder="Ex.: materiais de expediente para atender as unidades de saúde"></textarea></div><div class="form-field span-2"><label for="demand-justification">Por que isso é necessário? *</label><textarea id="demand-justification" name="justificativa" required maxlength="5000" placeholder="Descreva a necessidade, o uso esperado e quem será atendido."></textarea></div><div class="form-field"><label for="demand-unit">Unidade solicitante *</label>${unitSelect("unidade_id", prefill.unidade_id || state.membership.unidade_id)}</div><div class="form-field"><label for="demand-priority">Prioridade</label><select id="demand-priority" name="prioridade">${selectOptions(priorities, prefill.prioridade || "normal")}</select></div><div class="form-field"><label for="demand-value">Estimativa de valor (R$)</label><input id="demand-value" name="valor_estimado" type="number" min="0" step="0.01" placeholder="Opcional" /></div><div class="form-field"><label for="demand-date">Quando precisa? (opcional)</label><input id="demand-date" name="data_necessidade" type="date" /></div></div>${actionsFooter("Cancelar", "Salvar necessidade")}</form>`);
}
function openPcaForm() {
  if (!manager()) return toast("Somente Compras ou o administrador pode cadastrar previsões do PCA.", "error");
  const priorities = ["baixa", "normal", "alta", "urgente"].map((v) => ({ value: v, label: human(v) }));
  const months = [{ value: "", label: "A definir" }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(Date.UTC(2020, i, 1)).toLocaleString("pt-BR", { month: "long", timeZone: "UTC" }) }))];
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Adicionar previsão ao PCA</h2><p>Registre uma previsão anual. Isso não cria autorização para contratar.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="pca-form" class="dialog-body"><div class="form-grid"><div class="form-field"><label>Ano do planejamento *</label><input name="ano_plano" type="number" min="2000" max="2200" value="${new Date().getFullYear()}" required /></div><div class="form-field"><label>Unidade solicitante *</label>${unitSelect("unidade_id")}</div><div class="form-field span-2"><label>O que está previsto? *</label><textarea name="descricao" required maxlength="2000" placeholder="Descreva o item ou a contratação prevista."></textarea></div><div class="form-field"><label>Quantidade</label><input name="quantidade" type="number" min="0.001" step="0.001" /></div><div class="form-field"><label>Unidade de medida</label><input name="unidade_medida" maxlength="50" placeholder="unidade, caixa, serviço…" /></div><div class="form-field"><label>Valor estimado (R$)</label><input name="valor_estimado" type="number" min="0" step="0.01" /></div><div class="form-field"><label>Mês previsto</label><select name="mes_previsto">${selectOptions(months, "", "Escolha se souber")}</select></div><div class="form-field"><label>Prioridade</label><select name="prioridade">${selectOptions(priorities, "normal")}</select></div></div>${actionsFooter("Cancelar", "Salvar previsão")}</form>`);
}
function openProcessForm(demand = null) {
  if (!manager()) return toast("Somente Compras ou o administrador pode abrir um processo.", "error");
  const typeOpts = state.classifications.tipo_contratacao.map((v) => ({ value: v, label: v }));
  const modOpts = state.classifications.modalidade.map((v) => ({ value: v, label: v }));
  const procOpts = state.classifications.procedimento.map((v) => ({ value: v, label: v }));
  const demands = state.demands.filter((d) => ["enviada", "em_analise"].includes(d.status));
  const flowOpts = state.flows.map((f) => ({ value: f.id, label: `${f.nome} · v${f.versao}` }));
  const year = new Date().getFullYear();
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Abrir processo de compra</h2><p>Cadastre o processo e, se desejar, inicie um fluxo de trabalho versionado.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="process-form" class="dialog-body"><div class="dialog-callout"><strong>Importante:</strong> as opções são classificações configuráveis, não uma análise de enquadramento jurídico. Confirme modalidade e fundamento nos documentos e com a autoridade responsável.</div><div class="form-grid"><div class="form-field"><label>Número do processo *</label><input name="numero_processo" required maxlength="60" placeholder="Ex.: 12" /></div><div class="form-field"><label>Ano *</label><input name="ano" type="number" min="2000" max="2200" value="${year}" required /></div><div class="form-field"><label>Número do edital / aviso</label><input name="numero_edital" maxlength="100" placeholder="Opcional" /></div><div class="form-field"><label>Unidade solicitante *</label>${unitSelect("unidade_id", demand?.unidade_id || state.membership.unidade_id)}</div><div class="form-field span-2"><label>Objeto da contratação *</label><textarea name="objeto" required maxlength="4000" placeholder="Descreva de forma clara o que será contratado.">${esc(demand?.objeto || "")}</textarea></div><div class="form-field"><label>Tipo de contratação</label><select name="tipo_contratacao">${selectOptions(typeOpts, "", "Escolha ou deixe para classificar")}</select></div><div class="form-field"><label>Modalidade</label><select name="modalidade">${selectOptions(modOpts, "", "A definir / não se aplica")}</select></div><div class="form-field"><label>Procedimento</label><select name="procedimento">${selectOptions(procOpts, "", "A definir / não se aplica")}</select></div><div class="form-field"><label>Fundamento legal informado</label><input name="fundamento_legal" maxlength="500" placeholder="Somente quando confirmado pela equipe" /></div><div class="form-field"><label>Valor estimado (R$)</label><input name="valor_estimado" type="number" min="0" step="0.01" placeholder="Opcional" /></div><div class="form-field"><label>Data de abertura</label><input name="data_abertura" type="date" /></div><div class="form-field span-2"><label>Necessidade de origem</label><select name="demanda_id">${selectOptions(demands.map((d) => ({ value: d.id, label: `${d.objeto.slice(0, 110)} · ${unitName(d.unidade_id)}` })), demand?.id || "", "Sem vínculo / selecionar necessidade")}</select></div><div class="form-field span-2"><label>Fluxo de trabalho (opcional)</label><select name="fluxo_versao_id">${selectOptions(flowOpts, "", "Sem fluxo publicado")}</select><span class="form-help">Usar um fluxo cria cópias das etapas para este processo. Alterar o modelo depois não reescreve processos iniciados.</span></div></div>${actionsFooter("Cancelar", "Criar processo")}</form>`);
}
function openPublicationForm() {
  if (!manager()) return toast("Somente Compras ou o administrador pode registrar publicações.", "error");
  const processes = state.processes.map((p) => ({ value: p.id, label: `${p.numero_processo}/${p.ano} · ${p.objeto.slice(0, 90)}` }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Registrar publicação</h2><p>Cadastre a evidência da divulgação feita pela equipe.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="publication-form" class="dialog-body"><div class="dialog-callout">Este registro é manual: o formulário não envia nem transmite dados ao PNCP, Diário Oficial ou portal municipal. Confira o comprovante no canal oficial.</div><div class="form-grid"><div class="form-field span-2"><label>Processo *</label><select name="processo_id" required>${selectOptions(processes, "", "Selecione o processo")}</select></div><div class="form-field"><label>Canal *</label><input name="canal" required maxlength="100" placeholder="PNCP, Diário Oficial, portal…" /></div><div class="form-field"><label>Tipo de publicação *</label><input name="tipo" required maxlength="100" placeholder="Edital, aviso, contrato…" /></div><div class="form-field"><label>Situação</label><select name="status"><option value="pendente">Pendente</option><option value="publicada">Publicada</option><option value="cancelada">Cancelada</option></select></div><div class="form-field"><label>Data da publicação</label><input name="data_publicacao" type="date" /></div><div class="form-field"><label>Nº protocolo / identificador</label><input name="protocolo_externo" maxlength="200" /></div><div class="form-field"><label>Link público</label><input name="url_publica" type="url" placeholder="https://…" /></div><div class="form-field span-2"><label>Comprovante ou observações</label><textarea name="comprovante" maxlength="2000" placeholder="Identifique onde está arquivado ou descreva a conferência realizada."></textarea></div></div>${actionsFooter("Cancelar", "Salvar registro")}</form>`);
}
function openItemForm(processId) {
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Adicionar item ao processo</h2><p>Use uma linha por item/lote. Confira quantidade, unidade e preço.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="item-form" class="dialog-body"><div class="form-grid"><div class="form-field"><label>Nº do item *</label><input name="item_numero" required maxlength="50" placeholder="1" /></div><div class="form-field"><label>Unidade de medida *</label><input name="unidade_medida" required maxlength="50" placeholder="unidade, caixa, hora…" /></div><div class="form-field span-2"><label>Descrição do item *</label><textarea name="descricao" required maxlength="2000" placeholder="Descreva o item ou serviço."></textarea></div><div class="form-field"><label>Código do catálogo</label><input name="codigo_catalogo" maxlength="100" /></div><div class="form-field"><label>Categoria</label><input name="categoria" maxlength="150" /></div><div class="form-field"><label>Quantidade solicitada *</label><input name="quantidade_solicitada" type="number" min="0.001" step="0.001" required /></div><div class="form-field"><label>Preço unitário estimado (R$)</label><input name="valor_unitario_estimado" type="number" min="0" step="0.0001" /></div><div class="form-field"><label>Quantidade adjudicada</label><input name="quantidade_adjudicada" type="number" min="0.001" step="0.001" /></div><div class="form-field"><label>Preço unitário adjudicado (R$)</label><input name="preco_unitario_adjudicado" type="number" min="0" step="0.0001" /></div><div class="form-field"><label>Situação do item</label><select name="status"><option value="planejado">Planejado</option><option value="adjudicado">Adjudicado (confira dados antes)</option></select></div><div class="form-field"><label>Lote (se aplicável)</label><input name="lote_numero" maxlength="80" /></div></div>${actionsFooter("Cancelar", "Adicionar item")}</form>`);
  $("#item-form").dataset.processId = processId;
}
function openParticipantForm(processId) {
  const supplierOptions = state.suppliers.map((s) => ({ value: s.id, label: `${s.nome_fantasia || s.razao_social} · ${s.cnpj}` }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Vincular fornecedor participante</h2><p>Selecione um fornecedor já cadastrado no Controle de Saldos.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="participant-form" class="dialog-body"><div class="form-grid"><div class="form-field span-2"><label>Fornecedor *</label><select name="fornecedor_id" required>${selectOptions(supplierOptions, "", "Selecione um fornecedor")}</select></div><div class="form-field"><label>Situação</label><select name="situacao"><option value="participante">Participante</option><option value="vencedor">Vencedor (resultado já conferido)</option><option value="inabilitado">Inabilitado</option><option value="desistente">Desistente</option></select></div><div class="form-field"><label>Valor da proposta (R$)</label><input name="valor_proposta" type="number" min="0" step="0.01" /></div><div class="form-field span-2"><label>Observações</label><textarea name="observacoes" maxlength="2000"></textarea></div></div><div class="dialog-callout">A marcação “Vencedor” registra o resultado informado pela equipe; não substitui ata de julgamento nem homologação.</div>${actionsFooter("Cancelar", "Vincular fornecedor")}</form>`);
  $("#participant-form").dataset.processId = processId;
}
function openTaskForm(processId) {
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Criar tarefa</h2><p>Registre a próxima ação com responsável e prazo.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="task-form" class="dialog-body"><div class="form-grid"><div class="form-field span-2"><label>O que precisa ser feito? *</label><input name="titulo" required maxlength="300" /></div><div class="form-field span-2"><label>Orientações</label><textarea name="descricao" maxlength="2000"></textarea></div><div class="form-field"><label>Prioridade</label><select name="prioridade"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option><option value="baixa">Baixa</option></select></div><div class="form-field"><label>Prazo</label><input name="prazo" type="date" /></div><div class="form-field"><label>Responsável (ID interno)</label><input name="responsavel_id" type="number" min="1" placeholder="Opcional" /><span class="form-help">A equipe de Compras pode preencher o ID cadastrado do responsável.</span></div></div>${actionsFooter("Cancelar", "Criar tarefa")}</form>`);
  $("#task-form").dataset.processId = processId;
}
function openPriceResearchForm(processId) {
  if (!manager()) return toast("Somente Compras ou o administrador pode registrar pesquisa de preços.", "error");
  const p = state.activeProcess;
  const sourceTypes = ["painel_oficial", "fornecedor", "contratacao_similar", "catalogo", "outro"].map((value) => ({ value, label: human(value) }));
  const itemOptions = p.items.map((item) => ({ value: item.id, label: `Item ${item.item_numero} · ${item.descricao.slice(0, 90)}` }));
  const supplierOptions = state.suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.nome_fantasia || supplier.razao_social} · ${supplier.cnpj}` }));
  const documentOptions = p.documents.map((doc) => ({ value: doc.id, label: `${doc.tipo_documento} · ${doc.nome}` }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Registrar fonte de pesquisa</h2><p>Inclua uma cotação ou referência rastreável para este processo.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="price-research-form" class="dialog-body"><div class="dialog-callout">Cadastre cada fonte separadamente. O sistema mostra estatísticas descritivas; a equipe registra a memória de cálculo e decide qual referência é adequada.</div><div class="form-grid"><div class="form-field span-2"><label>Item do processo</label><select name="item_id">${selectOptions(itemOptions, "", "Pesquisa geral / não vincular a item")}</select></div><div class="form-field"><label>Tipo de fonte *</label><select name="fonte_tipo" required>${selectOptions(sourceTypes, "", "Escolha a fonte")}</select></div><div class="form-field"><label>Fornecedor (se aplicável)</label><select name="fornecedor_id">${selectOptions(supplierOptions, "", "Não vincular fornecedor")}</select></div><div class="form-field"><label>Preço unitário (R$) *</label><input name="valor_unitario" type="number" min="0" step="0.0001" required /></div><div class="form-field"><label>Data da coleta *</label><input name="data_coleta" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div><div class="form-field span-2"><label>Endereço da fonte (se houver)</label><input name="fonte_url" type="url" placeholder="https://…" /></div><div class="form-field span-2"><label>Documento do processo</label><select name="documento_id">${selectOptions(documentOptions, "", "Sem documento vinculado")}</select></div><div class="form-field span-2"><label>Condições e observações da cotação</label><textarea name="condicoes" maxlength="2000" placeholder="Prazo de entrega, frete, localidade, especificação comparável…"></textarea></div><div class="form-field"><label>Método da memória de cálculo</label><input name="metodo_calculo" maxlength="200" placeholder="Ex.: comparação por item" /></div><div class="form-field"><label>Justificativa / ressalva</label><input name="observacao_calculo" maxlength="500" placeholder="Ex.: fonte desconsiderada e motivo" /></div></div>${actionsFooter("Cancelar", "Salvar fonte")}</form>`);
  $("#price-research-form").dataset.processId = processId;
}

function renderContractDetails(contract, events, documents) {
  const canManage = manager();
  const process = state.processes.find((row) => row.id === contract.processo_id);
  const documentOptions = documents.map((doc) => ({ value: doc.id, label: `${doc.tipo_documento} · ${doc.nome}` }));
  const history = events.length ? events.map((event) => {
    const doc = documents.find((row) => row.id === event.documento_id);
    const url = doc ? safeHttpUrl(doc.signedUrl || doc.referencia_url) : "";
    return `<div class="detail-row"><span><strong>${esc(human(event.tipo))} · ${asDate(event.ocorrido_em)}</strong><span class="record-secondary">${esc(event.descricao)}</span><span class="record-secondary">${esc(event.origem || "registro")} ${event.status ? `· ${esc(human(event.status))}` : ""}</span>${event.valor !== null && event.valor !== undefined ? `<span class="record-secondary">Valor registrado: ${money(event.valor)}</span>` : ""}</span>${doc ? (url ? `<a class="button button-outline button-small" href="${esc(url)}" target="_blank" rel="noopener">${esc(doc.nome)}</a>` : `<span class="record-secondary">${esc(doc.nome)}</span>`) : ""}</div>`;
  }).join("") : `<p class="muted-text">Nenhum evento de execução registrado.</p>`;
  const eventForm = canManage ? `<form id="contract-event-form" class="dialog-body"><div class="dialog-callout">Este registro organiza evidências e ocorrências. Não substitui medição formal, atesto do fiscal, autorização de pagamento ou análise de aditivo.</div><div class="form-grid"><div class="form-field"><label>Tipo de evento *</label><select name="tipo" required>${selectOptions(["medicao", "atesto", "entrega", "aditivo", "reajuste", "ocorrencia", "sancao", "encerramento"].map((value) => ({ value, label: human(value) })), "", "Escolha o tipo")}</select></div><div class="form-field"><label>Data do evento *</label><input name="ocorrido_em" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div><div class="form-field"><label>Valor novo / relacionado (R$)</label><input name="valor" type="number" min="0" step="0.01" /></div><div class="form-field"><label>Documento relacionado</label><select name="documento_id">${selectOptions(documentOptions, "", "Sem documento vinculado")}</select></div><div class="form-field span-2"><label>Descrição do que ocorreu *</label><textarea name="descricao" required maxlength="3000" placeholder="Registre fato, providência e referência do comprovante."></textarea></div></div><div class="dialog-actions"><button class="button button-primary" type="submit">Registrar execução</button></div></form>` : "";
  dialog(`<div class="dialog-head"><div><p class="eyebrow">Execução contratual</p><h2 id="dialog-title">Contrato ${esc(contract.numero)}</h2><p>${esc(contract.objeto)} · ${esc(supplierName(contract.fornecedor_id))}</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><div class="dialog-body"><div class="detail-section"><h3>Resumo do contrato</h3><div class="detail-row"><span>Processo</span><strong>${esc(process ? `${process.numero_processo}/${process.ano}` : "—")}</strong></div><div class="detail-row"><span>Valor atual registrado</span><strong>${money(contract.valor_atual)}</strong></div><div class="detail-row"><span>Vigência</span><strong>${asDate(contract.vigencia_inicio)} – ${asDate(contract.vigencia_fim)}</strong></div><div class="detail-row"><span>Gestor / fiscal</span><strong>${esc(contract.gestor_id || "—")} / ${esc(contract.fiscal_id || "—")}</strong></div></div><div class="detail-section"><h3>Histórico de execução</h3>${history}</div>${eventForm}<div class="dialog-actions"><button class="button button-outline" type="button" data-dialog-close>Fechar</button></div></div>`);
  const form = $("#contract-event-form");
  if (form) form.dataset.contractId = contract.id;
}

async function openContractDetails(contractId) {
  const contract = state.contracts.find((row) => row.id === contractId);
  if (!contract) return toast("O contrato não está disponível para este acesso.", "error");
  const [eventResult, structuredResult, documentResult] = await Promise.all([
    supabase.from("compras_contrato_eventos").select("id,tipo,ocorrido_em,descricao,valor,documento_id").eq("tenant_id", state.tenantId).eq("contrato_id", contractId).order("ocorrido_em", { ascending: false }).limit(300),
    supabase.from("compras_execucoes_contratuais").select("id,tipo,status,ocorrido_em,descricao,valor_anterior,valor_novo,documento_id").eq("tenant_id", state.tenantId).eq("contrato_id", contractId).order("ocorrido_em", { ascending: false }).limit(300),
    supabase.from("compras_documentos").select("id,tipo_documento,nome,referencia_url,storage_path,status").eq("tenant_id", state.tenantId).eq("processo_id", contract.processo_id).eq("status", "registrado").limit(200),
  ]);
  if (eventResult.error || structuredResult.error || documentResult.error) return toast(`Não foi possível carregar a execução: ${(eventResult.error || structuredResult.error || documentResult.error).message}`, "error");
  const documents = documentResult.data || [];
  await Promise.all(documents.map(async (doc) => {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage.from("compras-documentos").createSignedUrl(doc.storage_path, 120);
    if (!error) doc.signedUrl = data?.signedUrl || "";
  }));
  const legacyEvents = (eventResult.data || []).map((event) => ({ ...event, origem: "histórico" }));
  const structuredEvents = (structuredResult.data || []).map((event) => ({ ...event, valor: event.valor_novo, origem: "execução estruturada" }));
  renderContractDetails(contract, [...legacyEvents, ...structuredEvents].sort((a, b) => String(b.ocorrido_em).localeCompare(String(a.ocorrido_em))), documents);
}
function openDocumentForm(processId) {
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Registrar documento</h2><p>Carregue um arquivo privado ou cadastre um link oficial.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="document-form" class="dialog-body"><div class="dialog-callout">Arquivos carregados ficam em armazenamento privado e só são acessíveis a usuários autorizados do processo. Até 50 MB por arquivo: PDF, Word, Excel ou imagem PNG/JPEG.</div><div class="form-grid"><div class="form-field"><label>Tipo de documento *</label><input name="tipo_documento" required maxlength="100" placeholder="Termo de Referência, edital…" /></div><div class="form-field"><label>Nome do documento *</label><input name="nome" required maxlength="255" /></div><div class="form-field span-2"><label>Arquivo (opcional)</label><input name="arquivo" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg" /></div><div class="form-field span-2"><label>Link / referência (se não enviar arquivo)</label><input name="referencia_url" type="url" placeholder="https://…" /></div><div class="form-field"><label>Obrigatório para a etapa?</label><select name="obrigatorio"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="form-field"><label>Validade, se houver</label><input name="validade" type="date" /></div></div>${actionsFooter("Cancelar", "Registrar documento")}</form>`);
  $("#document-form").dataset.processId = processId;
}
function openContractForm(processId) {
  const supplierOptions = state.suppliers.map((s) => ({ value: s.id, label: `${s.nome_fantasia || s.razao_social} · ${s.cnpj}` }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Registrar contrato</h2><p>Vincule o instrumento ao processo e informe a vigência.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="contract-form" class="dialog-body"><div class="form-grid"><div class="form-field"><label>Número do contrato *</label><input name="numero" required maxlength="100" /></div><div class="form-field"><label>Fornecedor *</label><select name="fornecedor_id" required>${selectOptions(supplierOptions, "", "Selecione")}</select></div><div class="form-field span-2"><label>Objeto *</label><textarea name="objeto" required maxlength="3000"></textarea></div><div class="form-field"><label>Valor inicial (R$) *</label><input name="valor_inicial" type="number" min="0" step="0.01" required /></div><div class="form-field"><label>Valor atual (R$) *</label><input name="valor_atual" type="number" min="0" step="0.01" required /></div><div class="form-field"><label>Início da vigência</label><input name="vigencia_inicio" type="date" /></div><div class="form-field"><label>Fim da vigência</label><input name="vigencia_fim" type="date" /></div><div class="form-field"><label>Gestor (ID interno)</label><input name="gestor_id" type="number" min="1" /></div><div class="form-field"><label>Fiscal (ID interno)</label><input name="fiscal_id" type="number" min="1" /></div></div>${actionsFooter("Cancelar", "Registrar contrato")}</form>`);
  $("#contract-form").dataset.processId = processId;
}
function openAtaForm(processId) {
  const participants = state.activeProcess?.participants?.filter((p) => p.situacao === "vencedor") || [];
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Gerar ata a partir do resultado</h2><p>Esta ação cria a ata e os itens de saldo no módulo já usado pela Intranet.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="ata-form" class="dialog-body"><div class="dialog-callout">Só é possível gerar ata para processo homologado, com fornecedor vencedor e ao menos um item adjudicado com quantidade e preço unitário conferidos. A operação cria registros financeiros; revise o resultado antes de confirmar.</div><div class="form-grid"><div class="form-field"><label>Número da ata *</label><input name="numero_ata" required maxlength="100" /></div><div class="form-field"><label>Fornecedor vencedor *</label><select name="fornecedor_id" required>${selectOptions(participants.map((p) => ({ value: p.fornecedor_id, label: supplierName(p.fornecedor_id) })), "", "Selecione")}</select></div><div class="form-field"><label>Data da assinatura *</label><input name="data_assinatura" type="date" required /></div><div class="form-field"><label>Início da vigência *</label><input name="data_inicio_vigencia" type="date" required /></div><div class="form-field"><label>Fim da vigência *</label><input name="data_fim_vigencia" type="date" required /></div></div>${actionsFooter("Cancelar", "Gerar ata e saldos")}</form>`);
  $("#ata-form").dataset.processId = processId;
}

async function openProcess(id) {
  const process = state.processes.find((p) => p.id === id);
  if (!process) return;
  await recordRecent("processo", id);
  const requestToken = ++processDetailRequestToken;
  state.activeProcess = { ...process, stages: [], substeps: [], items: [], participants: [], documents: [], tasks: [], research: [] };
  let requests;
  try {
    requests = await Promise.all([
      supabase.from("compras_processos_etapas").select("id,ordem,codigo,nome,descricao,status,prazo,concluida_em,dependencias_snapshot,documentos_snapshot,responsavel_id").eq("tenant_id", state.tenantId).eq("processo_id", id).order("ordem").limit(100),
      supabase.from("compras_processos_subetapas").select("id,processo_etapa_id,ordem,codigo,nome,descricao,status,prazo,concluida_em,dependencias_snapshot,documentos_snapshot,responsavel_id").eq("tenant_id", state.tenantId).eq("processo_id", id).order("processo_etapa_id").order("ordem").limit(1000),
      supabase.from("compras_processos_itens").select("id,item_numero,descricao,unidade_medida,quantidade_solicitada,valor_unitario_estimado,quantidade_adjudicada,preco_unitario_adjudicado,status,item_ata_id").eq("tenant_id", state.tenantId).eq("processo_id", id).order("item_numero").limit(250),
      supabase.from("compras_processos_fornecedores").select("id,fornecedor_id,situacao,valor_proposta,observacoes").eq("tenant_id", state.tenantId).eq("processo_id", id).limit(200),
      supabase.from("compras_documentos").select("id,tipo_documento,nome,referencia_url,storage_path,obrigatorio,validade,status").eq("tenant_id", state.tenantId).eq("processo_id", id).order("created_at", { ascending: false }).limit(200),
      supabase.from("compras_tarefas").select("id,titulo,descricao,status,prazo,responsavel_id,prioridade,concluida_em").eq("tenant_id", state.tenantId).eq("processo_id", id).order("prazo").limit(200),
      supabase.from("compras_pesquisa_precos").select("id,item_id,fonte_tipo,fornecedor_id,valor_unitario,data_coleta,condicoes,fonte_url,documento_id,memoria_calculo").eq("tenant_id", state.tenantId).eq("processo_id", id).order("data_coleta", { ascending: false }).limit(500),
    ]);
  } catch (error) {
    if (requestToken === processDetailRequestToken && state.activeProcess?.id === id) {
      state.activeProcess = null;
      toast(`Não foi possível abrir os detalhes: ${error.message || "falha de conexão"}`, "error");
    }
    return;
  }
  if (requestToken !== processDetailRequestToken || state.activeProcess?.id !== id) return;
  const failed = requests.find((r) => r.error);
  if (failed) {
    state.activeProcess = null;
    return toast(`Não foi possível abrir os detalhes: ${failed.error.message}`, "error");
  }
  const [stages, substeps, items, participants, documents, tasks, research] = requests.map((r) => r.data || []);
  try {
    await Promise.all(documents.map(async (doc) => {
      if (!doc.storage_path) return;
      const { data, error } = await supabase.storage.from("compras-documentos").createSignedUrl(doc.storage_path, 120);
      if (!error) doc.signedUrl = data?.signedUrl || "";
    }));
  } catch (error) {
    if (requestToken === processDetailRequestToken && state.activeProcess?.id === id) {
      state.activeProcess = null;
      toast(`Não foi possível abrir os detalhes: ${error.message || "falha ao acessar documento privado"}`, "error");
    }
    return;
  }
  if (requestToken !== processDetailRequestToken || state.activeProcess?.id !== id) return;
  Object.assign(state.activeProcess, { stages, substeps, items, participants, documents, tasks, research });
  renderProcessDetail();
}
function stageDone(stage) { return ["concluida", "concluído", "concluido"].includes((stage.status || "").toLowerCase()); }
function stageDependencyReference(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return String(value?.codigo ?? value?.code ?? value?.etapa_codigo ?? value?.ordem ?? "");
}
function stageGate(stage, process) {
  const dependencies = Array.isArray(stage.dependencias_snapshot) ? stage.dependencias_snapshot : [];
  const blockedBy = dependencies.map(stageDependencyReference).filter(Boolean).map((ref) => {
    const dependency = process.stages.find((row) => String(row.codigo || "") === ref || String(row.ordem) === ref);
    return !dependency || !stageDone(dependency) ? (dependency?.nome || `etapa ${ref}`) : null;
  }).filter(Boolean);
  const required = Array.isArray(stage.documentos_snapshot?.obrigatorios) ? stage.documentos_snapshot.obrigatorios : [];
  const missingDocuments = required.map((item) => typeof item === "string" ? item : String(item?.tipo_documento ?? item?.tipo ?? item?.nome ?? "")).filter(Boolean).filter((label) =>
    !process.documents.some((doc) => doc.status === "registrado" && [doc.tipo_documento, doc.nome].some((value) => String(value || "").toLowerCase() === label.toLowerCase()))
  );
  return { blockedBy, missingDocuments, ready: blockedBy.length === 0 && missingDocuments.length === 0 };
}
function renderPriceResearch(p, canManage) {
  const groups = new Map();
  for (const price of p.research || []) {
    const key = price.item_id || "__unlinked__";
    groups.set(key, [...(groups.get(key) || []), price]);
  }
  const summaries = [...groups.entries()].map(([key, rows]) => {
    const item = p.items.find((row) => row.id === key);
    const sorted = rows.map((row) => Number(row.valor_unitario)).sort((a, b) => a - b);
    const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    return `<div class="detail-row"><span><strong>${item ? `Item ${esc(item.item_numero)} · ${esc(item.descricao)}` : "Pesquisa sem item vinculado"}</strong><span class="record-secondary">${rows.length} fonte(s) · menor ${money(sorted[0])} · média descritiva ${money(average)} · maior ${money(sorted.at(-1))}</span></span></div>`;
  }).join("");
  const records = (p.research || []).map((row) => {
    const item = p.items.find((value) => value.id === row.item_id);
    const link = safeHttpUrl(row.fonte_url);
    return `<div class="detail-row"><span><strong>${esc(item ? `Item ${item.item_numero}` : "Fonte geral")} · ${money(row.valor_unitario)}</strong><span class="record-secondary">${esc(human(row.fonte_tipo))} · ${esc(row.fornecedor_id ? supplierName(row.fornecedor_id) : "Sem fornecedor vinculado")} · ${asDate(row.data_coleta)}</span><span class="record-secondary">${esc(row.condicoes || "Sem observações registradas")}</span></span>${link ? `<a class="button button-outline button-small" href="${esc(link)}" target="_blank" rel="noopener">Abrir fonte</a>` : ""}</div>`;
  }).join("");
  return `<div class="detail-section"><div class="card-heading"><h3>Pesquisa de preços e mapa comparativo</h3>${canManage ? `<button class="button button-outline button-small" type="button" data-action="add-price-research"><i class="fa-solid fa-plus" aria-hidden="true"></i> Registrar fonte</button>` : ""}</div><div class="dialog-callout">Os indicadores são descritivos. A escolha do preço de referência, os critérios de exclusão e a memória de cálculo devem ser conferidos e justificados pela equipe.</div>${summaries || `<p class="muted-text">Ainda não há pesquisa de preços registrada para este processo.</p>`}${records}</div>`;
}
function renderProcessDetail() {
  const p = state.activeProcess;
  if (!p) return;
  const canManage = manager();
  const stagesHtml = p.stages.length ? p.stages.map((s) => {
    const gate = stageGate(s, p);
    const blockedReason = [...gate.blockedBy.map((name) => `Dependência pendente: ${name}`), ...gate.missingDocuments.map((name) => `Documento obrigatório ausente: ${name}`)].join("; ");
    const action = canManage && !stageDone(s) ? gate.ready
      ? `<button class="button button-outline button-small" type="button" data-complete-stage="${esc(s.id)}">Concluir etapa</button>`
      : `<small class="record-secondary" title="${esc(blockedReason)}">Bloqueada: ${esc(blockedReason)}</small>` : "";
    const subRows = (p.substeps || []).filter((sub) => sub.processo_etapa_id === s.id);
    const subHtml = subRows.map((sub) => `<div class="detail-row detail-row-nested"><span><strong>↳ ${esc(sub.ordem)}. ${esc(sub.nome)}</strong><span class="record-secondary">${esc(sub.descricao || "")}</span></span><span>${statusPill(sub.status)}${sub.prazo ? `<small class="record-secondary">Prazo ${asDate(sub.prazo)}</small>` : ""}${canManage && sub.status !== "concluida" ? `<button class="button button-outline button-small" type="button" data-complete-substep="${esc(sub.id)}">Concluir</button>` : ""}</span></div>`).join("");
    return `<div class="detail-row"><span><strong>${esc(s.ordem)}. ${esc(s.nome)}</strong><span class="record-secondary">${esc(s.descricao || "")}</span>${s.responsavel_id ? `<span class="record-secondary">Responsável ${esc(s.responsavel_id)}</span>` : ""}</span><span>${statusPill(s.status)}${s.prazo ? `<small class="record-secondary">Prazo ${asDate(s.prazo)}</small>` : ""}${action}</span></div>${subHtml}`;
  }).join("") : `<p class="muted-text">Este processo ainda não tem etapas vinculadas a um fluxo.</p>`;
  const itemsHtml = p.items.length ? p.items.map((i) => `<div class="detail-row"><span><strong>Item ${esc(i.item_numero)} · ${esc(i.descricao)}</strong><span class="record-secondary">${esc(i.quantidade_solicitada)} ${esc(i.unidade_medida)} · estimado ${money(i.valor_unitario_estimado)} por unidade</span>${i.status === "adjudicado" ? `<span class="record-secondary">Adjudicado: ${esc(i.quantidade_adjudicada || "—")} × ${money(i.preco_unitario_adjudicado)}</span>` : ""}</span>${statusPill(i.status)}</div>`).join("") : `<p class="muted-text">Nenhum item informado.</p>`;
  const participantsHtml = p.participants.length ? p.participants.map((f) => `<div class="detail-row"><span><strong>${esc(supplierName(f.fornecedor_id))}</strong><span class="record-secondary">Proposta: ${money(f.valor_proposta)}</span></span><span>${statusPill(f.situacao)}${canManage && f.situacao !== "vencedor" ? `<button class="button button-outline button-small" type="button" data-winner="${esc(f.id)}">Marcar vencedor</button>` : ""}</span></div>`).join("") : `<p class="muted-text">Nenhum fornecedor participante registrado.</p>`;
  const docsHtml = p.documents.length ? p.documents.map((d) => { const url = safeHttpUrl(d.signedUrl || d.referencia_url); return `<div class="detail-row"><span><strong>${esc(d.nome)}</strong><span class="record-secondary">${esc(d.tipo_documento)}${d.obrigatorio ? " · obrigatório" : ""}</span></span>${url ? `<a class="button button-outline button-small" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>` : `<span class="record-secondary">${esc(d.status)}</span>`}</div>`; }).join("") : `<p class="muted-text">Nenhum documento registrado.</p>`;
  const tasksHtml = p.tasks.length ? p.tasks.map((t) => {
    const taskOpen = !["concluida", "concluído", "concluido", "cancelada", "cancelado"].includes((t.status || "").toLowerCase());
    const mayComplete = taskOpen && (canManage || Number(t.responsavel_id) === Number(state.user.id));
    return `<div class="detail-row"><span><strong>${esc(t.titulo)}</strong><span class="record-secondary">${t.prazo ? `Prazo ${asDate(t.prazo)}` : "Sem prazo"}${t.responsavel_id ? ` · Responsável ${esc(t.responsavel_id)}` : ""}</span></span><span>${statusPill(t.status)}${mayComplete ? `<button class="button button-outline button-small" type="button" data-complete-task="${esc(t.id)}">Concluir</button>` : ""}</span></div>`;
  }).join("") : `<p class="muted-text">Nenhuma tarefa vinculada.</p>`;
  const ataButton = canManage && p.status === "homologado" && !p.ata_id && p.participants.some((x) => x.situacao === "vencedor") ? `<button class="button button-primary button-small" type="button" data-action="generate-ata"><i class="fa-solid fa-link" aria-hidden="true"></i> Gerar ata e saldo</button>` : "";
  const statusControl = canManage && p.status === "ata_gerada"
    ? `<p class="form-help">A situação “Ata gerada” é definida somente pela operação que cria e vincula a ata.</p>`
    : canManage ? `<label class="form-field"><span class="form-help">Atualizar situação do processo</span><select id="process-status-update" data-process-id="${esc(p.id)}">${selectOptions(["planejamento", "em_instrucao", "em_selecao", "homologado", "formalizado", "encerrado"].map((v) => ({ value: v, label: human(v) })), p.status)}</select></label>` : "";
  dialog(`<div class="dialog-head"><div><p class="eyebrow">Processo ${esc(p.numero_processo)}/${esc(p.ano)}</p><h2 id="dialog-title">${esc(p.objeto)}</h2><p>${esc(unitName(p.unidade_id))} · ${esc([p.modalidade,p.procedimento].filter(Boolean).join(" · ") || human(p.tipo_contratacao || "A classificar"))}</p></div><div class="dialog-head-actions"><button class="button button-outline button-small" type="button" data-toggle-favorite="processo:${esc(p.id)}"><i class="fa-${isFavorite("processo", p.id) ? "solid" : "regular"} fa-star" aria-hidden="true"></i> ${isFavorite("processo", p.id) ? "Favorito" : "Favoritar"}</button><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div></div><div class="dialog-body"><div class="detail-section"><h3>Resumo e situação</h3><div class="detail-row"><span>Estimativa</span><strong>${money(p.valor_estimado)}</strong></div><div class="detail-row"><span>Situação atual</span><strong>${statusPill(p.status)}</strong></div><div class="detail-row"><span>Fundamento informado</span><strong>${esc(p.fundamento_legal || "Não informado")}</strong></div>${p.ata_id ? `<div class="detail-row"><span>Ata vinculada</span><strong>#${esc(p.ata_id)} · <a href="../controle-de-saldos/gestao-atas.html">abrir Controle de Saldos</a></strong></div>` : ""}${statusControl}</div><div class="detail-section"><div class="card-heading"><h3>Etapas e prazos</h3></div>${stagesHtml}</div><div class="detail-section"><div class="card-heading"><h3>Itens</h3>${canManage ? `<button class="button button-outline button-small" type="button" data-action="add-item"><i class="fa-solid fa-plus"></i> Adicionar item</button>` : ""}</div>${itemsHtml}</div>${renderPriceResearch(p, canManage)}<div class="detail-section"><div class="card-heading"><h3>Fornecedores</h3>${canManage ? `<button class="button button-outline button-small" type="button" data-action="add-participant"><i class="fa-solid fa-plus"></i> Vincular fornecedor</button>` : ""}</div>${participantsHtml}</div><div class="detail-section"><div class="card-heading"><h3>Tarefas</h3>${canManage ? `<button class="button button-outline button-small" type="button" data-action="add-task"><i class="fa-solid fa-plus"></i> Criar tarefa</button>` : ""}</div>${tasksHtml}</div><div class="detail-section"><div class="card-heading"><h3>Documentos</h3>${canManage ? `<button class="button button-outline button-small" type="button" data-action="add-document"><i class="fa-solid fa-plus"></i> Registrar documento</button>` : ""}</div>${docsHtml}</div><div class="detail-section"><div class="card-heading"><h3>Formalização</h3>${canManage ? `<button class="button button-outline button-small" type="button" data-action="add-contract"><i class="fa-solid fa-plus"></i> Registrar contrato</button>${ataButton}` : ""}</div><p class="form-help">A geração da ata só fica disponível após homologação e exige revisão de fornecedor, quantidades e preços.</p></div><div class="dialog-actions"><button class="button button-outline" type="button" data-dialog-close>Fechar</button></div></div>`);
}

async function createDemand(form) {
  if (!canRequestDemand()) throw new Error("Seu perfil não pode registrar necessidades. Peça ao administrador para atribuir o papel de solicitante.");
  const data = new FormData(form);
  const payload = {
    tenant_id: state.tenantId,
    unidade_id: String(data.get("unidade_id") || state.membership.unidade_id),
    objeto: String(data.get("objeto")).trim(),
    justificativa: String(data.get("justificativa")).trim(),
    prioridade: String(data.get("prioridade") || "normal"),
    valor_estimado: data.get("valor_estimado") ? Number(data.get("valor_estimado")) : null,
    data_necessidade: data.get("data_necessidade") || null,
    status: "rascunho", criado_por: state.user.id,
    responsavel_id: state.user.id,
  };
  const { error } = await supabase.from("compras_demandas").insert(payload);
  if (error) throw error;
  closeDialog(); toast("Necessidade salva. Você pode enviá-la para análise na lista."); await loadData(); switchTab("demands");
}
async function createPca(form) {
  if (!manager()) throw new Error("Seu perfil não pode cadastrar previsões do PCA.");
  const data = new FormData(form);
  const payload = { tenant_id: state.tenantId, ano_plano: Number(data.get("ano_plano")), unidade_id: String(data.get("unidade_id")), processo_id: null, descricao: String(data.get("descricao")).trim(), quantidade: data.get("quantidade") ? Number(data.get("quantidade")) : null, unidade_medida: String(data.get("unidade_medida") || "").trim() || null, valor_estimado: data.get("valor_estimado") ? Number(data.get("valor_estimado")) : null, prioridade: data.get("prioridade") || "normal", mes_previsto: data.get("mes_previsto") ? Number(data.get("mes_previsto")) : null, status: "planejado", created_by: state.user.id };
  const { error } = await supabase.from("compras_pca_itens").insert(payload);
  if (error) throw error;
  closeDialog(); toast("Previsão adicionada ao PCA."); await loadData(); switchTab("pca");
}
async function createPublication(form) {
  if (!manager()) throw new Error("Seu perfil não pode registrar publicações.");
  const data = new FormData(form);
  const rawUrl = String(data.get("url_publica") || "").trim();
  const url = rawUrl ? safeHttpUrl(rawUrl) : "";
  if (rawUrl && !url) throw new Error("O link precisa começar com http:// ou https://.");
  const payload = { tenant_id: state.tenantId, processo_id: String(data.get("processo_id")), canal: String(data.get("canal")).trim(), tipo: String(data.get("tipo")).trim(), status: data.get("status") || "pendente", data_publicacao: data.get("data_publicacao") || null, protocolo_externo: String(data.get("protocolo_externo") || "").trim() || null, url_publica: url || null, comprovante: String(data.get("comprovante") || "").trim() || null, observacoes: null, responsavel_id: state.user.id };
  const { error } = await supabase.from("compras_publicacoes").insert(payload);
  if (error) throw error;
  closeDialog(); toast("Registro de publicação salvo. Confirme o comprovante no canal oficial."); await loadData(); switchTab("publications");
}
async function createProcess(form) {
  if (!manager()) throw new Error("Seu perfil não pode abrir processos.");
  const data = new FormData(form);
  const flowVersionId = data.get("fluxo_versao_id") || null;
  const payload = {
    tenant_id: state.tenantId,
    demanda_id: data.get("demanda_id") || null,
    unidade_id: String(data.get("unidade_id") || state.membership.unidade_id),
    fluxo_versao_id: flowVersionId,
    numero_processo: String(data.get("numero_processo")).trim(),
    ano: Number(data.get("ano")),
    numero_edital: String(data.get("numero_edital") || "").trim() || null,
    objeto: String(data.get("objeto")).trim(),
    tipo_contratacao: String(data.get("tipo_contratacao") || "licitacao"),
    modalidade: String(data.get("modalidade") || "").trim() || null,
    procedimento: String(data.get("procedimento") || "").trim() || null,
    fundamento_legal: String(data.get("fundamento_legal") || "").trim() || null,
    valor_estimado: data.get("valor_estimado") ? Number(data.get("valor_estimado")) : null,
    status: "planejamento", responsavel_id: state.user.id, criado_por: state.user.id,
    data_abertura: data.get("data_abertura") || null,
  };
  const { data: created, error } = await supabase.from("compras_processos").insert(payload).select("id").single();
  if (error) throw error;
  if (flowVersionId) {
    const { data: flowSteps, error: flowError } = await supabase.from("compras_fluxo_etapas")
      .select("id,ordem,codigo,nome,descricao,prazo_dias,responsavel_padrao,dependencias,documentos_obrigatorios,documentos_opcionais")
      .eq("tenant_id", state.tenantId).eq("fluxo_versao_id", flowVersionId).eq("ativa", true).order("ordem").limit(100);
    if (flowError) {
      await supabase.from("compras_processos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
      throw flowError;
    }
    if (flowSteps?.length) {
      const stageRows = [];
      let stageStart = payload.data_abertura || new Date().toISOString().slice(0, 10);
      for (const s of flowSteps) {
        let prazo = null;
        if (Number.isInteger(s.prazo_dias) && s.prazo_dias >= 0) {
          const { data: calculated, error: calendarError } = await supabase.rpc("compras_calcular_prazo_dias_uteis", { p_tenant_id: state.tenantId, p_data_inicio: stageStart, p_dias: s.prazo_dias });
          if (calendarError) {
            await supabase.from("compras_processos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
            throw calendarError;
          }
          prazo = calculated;
          stageStart = calculated;
        }
        stageRows.push({
          tenant_id: state.tenantId, processo_id: created.id, fluxo_etapa_id: s.id,
          ordem: s.ordem, codigo: s.codigo, nome: s.nome, descricao: s.descricao,
          dependencias_snapshot: s.dependencias || [],
          documentos_snapshot: { obrigatorios: s.documentos_obrigatorios || [], opcionais: s.documentos_opcionais || [], responsavel_padrao: s.responsavel_padrao || null },
          status: "pendente", prazo,
        });
      }
      const { data: createdStages, error: stagesError } = await supabase.from("compras_processos_etapas").insert(stageRows).select("id,ordem,fluxo_etapa_id,prazo");
      if (stagesError) {
        await supabase.from("compras_processos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
        throw stagesError;
      }
      const stageIds = createdStages.map((row) => row.fluxo_etapa_id).filter(Boolean);
      if (stageIds.length) {
        const { data: templates, error: templateError } = await supabase.from("compras_fluxo_subetapas")
          .select("id,fluxo_etapa_id,ordem,codigo,nome,descricao,prazo_dias,responsavel_padrao,dependencias,documentos_obrigatorios")
          .eq("tenant_id", state.tenantId).in("fluxo_etapa_id", stageIds).eq("ativa", true).order("ordem").limit(1000);
        if (templateError) {
          await supabase.from("compras_processos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
          throw templateError;
        }
        const subRows = [];
        for (const stage of createdStages) {
          let subStart = stageRows.find((row) => row.ordem === stage.ordem)?.prazo || payload.data_abertura || new Date().toISOString().slice(0, 10);
          for (const sub of (templates || []).filter((row) => row.fluxo_etapa_id === stage.fluxo_etapa_id)) {
            let subDeadline = null;
            if (Number.isInteger(sub.prazo_dias) && sub.prazo_dias >= 0) {
              const { data: calculated, error: calendarError } = await supabase.rpc("compras_calcular_prazo_dias_uteis", { p_tenant_id: state.tenantId, p_data_inicio: subStart, p_dias: sub.prazo_dias });
              if (calendarError) {
                await supabase.from("compras_processos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
                throw calendarError;
              }
              subDeadline = calculated; subStart = calculated;
            }
            subRows.push({ tenant_id: state.tenantId, processo_id: created.id, processo_etapa_id: stage.id, fluxo_subetapa_id: sub.id, ordem: sub.ordem, codigo: sub.codigo, nome: sub.nome, descricao: sub.descricao, prazo: subDeadline, dependencias_snapshot: sub.dependencias || [], documentos_snapshot: { obrigatorios: sub.documentos_obrigatorios || [], responsavel_padrao: sub.responsavel_padrao || null }, status: "pendente" });
          }
        }
        if (subRows.length) {
          const { error: subError } = await supabase.from("compras_processos_subetapas").insert(subRows);
          if (subError) {
            await supabase.from("compras_processos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
            throw subError;
          }
        }
      }
    }
  }
  const demandId = payload.demanda_id;
  if (demandId) {
    const { error: demandError } = await supabase.from("compras_demandas").update({ status: "convertida", updated_at: new Date().toISOString() }).eq("id", demandId).eq("tenant_id", state.tenantId);
    if (demandError) toast("Processo criado, mas a necessidade não foi marcada como convertida. Confira a lista.", "error");
  }
  closeDialog(); toast("Processo criado e salvo no Supabase."); await loadData(); switchTab("processes");
}
async function createItem(form) {
  const data = new FormData(form); const processId = form.dataset.processId;
  const payload = {
    tenant_id: state.tenantId, processo_id: processId,
    item_numero: String(data.get("item_numero")).trim(), descricao: String(data.get("descricao")).trim(),
    unidade_medida: String(data.get("unidade_medida")).trim(), quantidade_solicitada: Number(data.get("quantidade_solicitada")),
    codigo_catalogo: String(data.get("codigo_catalogo") || "").trim() || null,
    categoria: String(data.get("categoria") || "").trim() || null,
    valor_unitario_estimado: data.get("valor_unitario_estimado") ? Number(data.get("valor_unitario_estimado")) : null,
    quantidade_adjudicada: data.get("quantidade_adjudicada") ? Number(data.get("quantidade_adjudicada")) : null,
    preco_unitario_adjudicado: data.get("preco_unitario_adjudicado") ? Number(data.get("preco_unitario_adjudicado")) : null,
    status: String(data.get("status") || "planejado"), lote_numero: String(data.get("lote_numero") || "").trim() || null,
  };
  const { error } = await supabase.from("compras_processos_itens").insert(payload);
  if (error) throw error;
  toast("Item adicionado ao processo."); await openProcess(processId);
}
async function createParticipant(form) {
  const data = new FormData(form); const processId = form.dataset.processId;
  const payload = { tenant_id: state.tenantId, processo_id: processId, fornecedor_id: Number(data.get("fornecedor_id")), situacao: data.get("situacao"), valor_proposta: data.get("valor_proposta") ? Number(data.get("valor_proposta")) : null, observacoes: String(data.get("observacoes") || "").trim() || null };
  const { error } = await supabase.from("compras_processos_fornecedores").insert(payload);
  if (error) throw error;
  toast("Fornecedor vinculado ao processo."); await openProcess(processId);
}
async function createTask(form) {
  const data = new FormData(form); const processId = form.dataset.processId;
  const payload = { tenant_id: state.tenantId, processo_id: processId, titulo: String(data.get("titulo")).trim(), descricao: String(data.get("descricao") || "").trim() || null, prioridade: data.get("prioridade"), status: "pendente", responsavel_id: data.get("responsavel_id") ? Number(data.get("responsavel_id")) : null, prazo: data.get("prazo") || null, criado_por: state.user.id, recorrencia: {} };
  const { error } = await supabase.from("compras_tarefas").insert(payload);
  if (error) throw error;
  toast("Tarefa criada."); await loadData(); await openProcess(processId);
}
async function createPriceResearch(form) {
  if (!manager()) throw new Error("Seu perfil não pode registrar pesquisa de preços.");
  const data = new FormData(form);
  const rawUrl = String(data.get("fonte_url") || "").trim();
  const sourceUrl = rawUrl ? safeHttpUrl(rawUrl) : "";
  if (rawUrl && !sourceUrl) throw new Error("O endereço da fonte deve começar com http:// ou https://.");
  const method = String(data.get("metodo_calculo") || "").trim();
  const observation = String(data.get("observacao_calculo") || "").trim();
  const payload = {
    tenant_id: state.tenantId, processo_id: form.dataset.processId,
    item_id: String(data.get("item_id") || "") || null,
    fonte_tipo: String(data.get("fonte_tipo")).trim(),
    fornecedor_id: data.get("fornecedor_id") ? Number(data.get("fornecedor_id")) : null,
    valor_unitario: Number(data.get("valor_unitario")), data_coleta: data.get("data_coleta"),
    condicoes: String(data.get("condicoes") || "").trim() || null,
    fonte_url: sourceUrl || null, documento_id: String(data.get("documento_id") || "") || null,
    memoria_calculo: { metodo: method || null, observacao: observation || null },
    coletado_por: state.user.id,
  };
  const { error } = await supabase.from("compras_pesquisa_precos").insert(payload);
  if (error) throw error;
  toast("Fonte de pesquisa registrada."); await openProcess(form.dataset.processId);
}
async function createDocument(form) {
  const data = new FormData(form); const processId = form.dataset.processId;
  const file = data.get("arquivo");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && file.size > 50 * 1024 * 1024) throw new Error("O arquivo excede o limite de 50 MB.");
  const allowedTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "image/png", "image/jpeg"]);
  if (hasFile && file.type && !allowedTypes.has(file.type)) throw new Error("Tipo de arquivo não permitido. Envie PDF, Word, Excel, PNG ou JPEG.");
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = hasFile ? file.name.normalize("NFKD").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-100) : "";
  const storagePath = hasFile ? `${state.tenantId}/${processId}/${randomId}-${safeName || "documento"}` : null;
  const payload = { tenant_id: state.tenantId, processo_id: processId, tipo_documento: String(data.get("tipo_documento")).trim(), nome: String(data.get("nome")).trim(), referencia_url: String(data.get("referencia_url") || "").trim() || null, storage_path: storagePath, obrigatorio: data.get("obrigatorio") === "true", validade: data.get("validade") || null, status: hasFile ? "enviando" : "registrado", criado_por: state.user.id };
  const { data: created, error } = await supabase.from("compras_documentos").insert(payload).select("id").single();
  if (error) throw error;
  if (hasFile) {
    const { error: uploadError } = await supabase.storage.from("compras-documentos").upload(storagePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
    if (uploadError) {
      await supabase.from("compras_documentos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
      throw uploadError;
    }
    const { error: updateError } = await supabase.from("compras_documentos").update({ status: "registrado", updated_at: new Date().toISOString() }).eq("id", created.id).eq("tenant_id", state.tenantId);
    if (updateError) {
      await supabase.storage.from("compras-documentos").remove([storagePath]);
      await supabase.from("compras_documentos").delete().eq("id", created.id).eq("tenant_id", state.tenantId);
      throw updateError;
    }
  }
  const { error: versionError } = await supabase.from("compras_documento_versoes").insert({
    tenant_id: state.tenantId,
    documento_id: created.id,
    versao: 1,
    nome: String(data.get("nome")).trim(),
    referencia_url: String(data.get("referencia_url") || "").trim() || null,
    storage_path: storagePath,
    mime_type: hasFile ? file.type || null : null,
    tamanho_bytes: hasFile ? file.size : null,
    status: "vigente",
    criado_por: state.user.id,
  });
  if (versionError) throw versionError;
  toast(hasFile ? "Documento carregado com acesso privado." : "Referência do documento registrada."); await openProcess(processId);
}
async function createContract(form) {
  const data = new FormData(form); const processId = form.dataset.processId;
  const process = state.processes.find((p) => p.id === processId);
  const payload = { tenant_id: state.tenantId, processo_id: processId, ata_id: process?.ata_id || null, fornecedor_id: Number(data.get("fornecedor_id")), numero: String(data.get("numero")).trim(), objeto: String(data.get("objeto")).trim(), valor_inicial: Number(data.get("valor_inicial")), valor_atual: Number(data.get("valor_atual")), vigencia_inicio: data.get("vigencia_inicio") || null, vigencia_fim: data.get("vigencia_fim") || null, gestor_id: data.get("gestor_id") ? Number(data.get("gestor_id")) : null, fiscal_id: data.get("fiscal_id") ? Number(data.get("fiscal_id")) : null, situacao: "vigente", created_by: state.user.id };
  const { error } = await supabase.from("compras_contratos").insert(payload);
  if (error) throw error;
  toast("Contrato registrado."); await loadData(); await openProcess(processId);
}
async function createContractEvent(form) {
  if (!manager()) throw new Error("Seu perfil não pode registrar eventos de execução contratual.");
  const data = new FormData(form);
  const payload = {
    tenant_id: state.tenantId, contrato_id: form.dataset.contractId,
    tipo: String(data.get("tipo")).trim(), ocorrido_em: data.get("ocorrido_em"),
    descricao: String(data.get("descricao")).trim(),
    valor_novo: data.get("valor") ? Number(data.get("valor")) : null,
    documento_id: String(data.get("documento_id") || "") || null,
    registrado_por: state.user.id,
  };
  const { error } = await supabase.from("compras_execucoes_contratuais").insert(payload);
  if (error) throw error;
  toast("Execução contratual registrada."); await loadData(); await openContractDetails(form.dataset.contractId);
}
async function generateAta(form) {
  const processId = form.dataset.processId; const data = new FormData(form);
  const { data: result, error } = await supabase.rpc("compras_gerar_ata", {
    p_processo_id: processId, p_numero_ata: String(data.get("numero_ata")).trim(),
    p_fornecedor_id: Number(data.get("fornecedor_id")), p_data_assinatura: data.get("data_assinatura"),
    p_data_inicio_vigencia: data.get("data_inicio_vigencia"), p_data_fim_vigencia: data.get("data_fim_vigencia"),
  });
  if (error) throw error;
  const row = Array.isArray(result) ? result[0] : result;
  closeDialog(); toast(`Ata #${row?.ata_id ?? ""} criada com ${row?.itens_criados ?? 0} item(ns).`); await loadData();
  banner("A ata foi criada no módulo de Controle de Saldos. Revise a visualização e os saldos antes de iniciar pedidos.");
  switchTab("processes");
}

async function sendDemand(id) {
  if (!canRequestDemand()) throw new Error("Seu perfil não pode enviar necessidades para análise.");
  const { error } = await supabase.from("compras_demandas").update({ status: "enviada", updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", state.tenantId).eq("criado_por", state.user.id).eq("status", "rascunho");
  if (error) throw error;
  toast("Necessidade enviada para análise."); await loadData();
}
async function markWinner(id) {
  const { error } = await supabase.from("compras_processos_fornecedores").update({ situacao: "vencedor", updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", state.tenantId);
  if (error) throw error;
  toast("Resultado registrado. Confira os atos e documentos antes de homologar."); await openProcess(state.activeProcess.id);
}
async function updateProcessStatus(select) {
  const id = select.dataset.processId;
  if (!manager()) throw new Error("Somente Compras ou o administrador pode atualizar a situação do processo.");
  if (select.value === "ata_gerada") throw new Error("A situação “Ata gerada” só pode ser definida pela operação que cria e vincula a ata.");
  const { error } = await supabase.from("compras_processos").update({ status: select.value, updated_at: new Date().toISOString(), ...(select.value === "homologado" ? { data_homologacao: new Date().toISOString().slice(0, 10) } : {}) }).eq("id", id).eq("tenant_id", state.tenantId);
  if (error) throw error;
  toast("Situação do processo atualizada."); await loadData(); await openProcess(id);
}
async function completeStage(stageId) {
  if (!manager()) throw new Error("Somente Compras ou o administrador pode concluir etapas.");
  const processId = state.activeProcess?.id;
  const stage = state.activeProcess?.stages.find((row) => row.id === stageId);
  if (!stage) throw new Error("A etapa não está mais disponível. Atualize o processo.");
  const gate = stageGate(stage, state.activeProcess);
  if (!gate.ready) throw new Error("A etapa está bloqueada por dependências ou documentos obrigatórios.");
  const { error } = await supabase.rpc("compras_concluir_etapa", { p_etapa_id: stageId });
  if (error) throw error;
  toast("Etapa concluída. O histórico foi atualizado."); await loadData(); await openProcess(processId);
}
async function completeSubstep(substepId) {
  if (!manager()) throw new Error("Somente Compras ou o administrador pode concluir subetapas.");
  const substep = state.activeProcess?.substeps.find((row) => row.id === substepId);
  if (!substep) throw new Error("A subetapa não está mais disponível. Atualize o processo.");
  const { error } = await supabase.from("compras_processos_subetapas").update({ status: "concluida", concluida_em: new Date().toISOString(), concluida_por: state.user.id, updated_at: new Date().toISOString() }).eq("id", substepId).eq("tenant_id", state.tenantId);
  if (error) throw error;
  toast("Subetapa concluída."); await openProcess(state.activeProcess.id);
}
async function completeTask(taskId) {
  const task = [...(state.activeProcess?.tasks || []), ...state.tasks].find((row) => row.id === taskId);
  if (!task || (!manager() && Number(task.responsavel_id) !== Number(state.user.id))) throw new Error("Somente o responsável ou Compras pode concluir esta tarefa.");
  const { error } = await supabase.from("compras_tarefas").update({ status: "concluida", concluida_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", taskId).eq("tenant_id", state.tenantId);
  if (error) throw error;
  const processId = task.processo_id;
  toast("Tarefa marcada como concluída."); await loadData();
  if (processId && state.activeProcess?.id === processId) await openProcess(processId);
}
async function completeObligation(obligationId) {
  if (!manager()) throw new Error("Somente Compras ou o administrador pode concluir obrigações.");
  const { error } = await supabase.from("compras_obrigacoes").update({ status: "concluida", concluida_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", obligationId).eq("tenant_id", state.tenantId);
  if (error) throw error;
  toast("Obrigação marcada como concluída."); await loadData();
}

async function handleSubmit(event) {
  const form = event.target;
  const submitters = {
    "demand-form": createDemand, "pca-form": createPca, "publication-form": createPublication, "obligation-form": createObligation, "process-form": createProcess, "item-form": createItem,
    "participant-form": createParticipant, "task-form": createTask, "price-research-form": createPriceResearch, "document-form": createDocument,
    "contract-form": createContract, "contract-event-form": createContractEvent, "ata-form": generateAta, "holiday-form": createHoliday, "substep-form": createSubstep, "flow-form": createFlow, "flow-version-form": createFlowVersion, "stage-form": saveStage,
  };
  const action = submitters[form.id];
  if (!action) return;
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  if (submit) { submit.disabled = true; submit.dataset.oldText = submit.textContent; submit.textContent = "Salvando…"; }
  try { await action(form); }
  catch (error) { console.error("[Compras] Falha ao salvar:", error); toast(error.message || "Não foi possível salvar. Verifique os campos e sua permissão.", "error"); if (submit) { submit.disabled = false; submit.textContent = submit.dataset.oldText || "Salvar"; } }
}
function handleClick(event) {
  const target = event.target.closest("button,a");
  if (!target) return;
  if (target.hasAttribute("data-dialog-close")) return closeDialog();
  if (target.dataset.tab) return switchTab(target.dataset.tab);
  if (target.dataset.tabLink) return switchTab(target.dataset.tabLink);
  if (target.dataset.action === "new-demand") return openDemandForm();
  if (target.dataset.action === "new-pca") return openPcaForm();
  if (target.dataset.action === "new-publication") return openPublicationForm();
  if (target.dataset.action === "new-obligation") return openObligationForm();
  if (target.dataset.action === "new-holiday") return openHolidayForm();
  if (target.dataset.action === "new-flow") return openFlowForm();
  if (target.dataset.action === "new-flow-version") return openVersionForm();
  if (target.dataset.action === "export-report") return exportReport();
  if (target.dataset.action === "new-process") return openProcessForm();
  if (target.dataset.action === "search") return openGlobalSearch();
  if (target.dataset.readNotification) return markNotificationRead(target.dataset.readNotification).catch((e) => toast(e.message || "Não foi possível atualizar a notificação.", "error"));
  if (target.dataset.toggleFavorite) {
    const [entidade, entidadeId] = target.dataset.toggleFavorite.split(":");
    return toggleFavorite(entidade, entidadeId).catch((e) => toast(e.message || "Não foi possível atualizar o favorito.", "error"));
  }
  if (target.dataset.searchJump) {
    const tab = target.dataset.searchJump;
    closeDialog();
    switchTab(tab);
    const field = tab === "demands" ? $("#demand-search") : tab === "publications" ? null : tab === "agenda" ? null : tab === "pca" ? null : $("#process-search");
    if (field) { field.value = target.dataset.searchValue || ""; field.dispatchEvent(new Event("input")); field.focus(); }
    return;
  }
  if (target.dataset.action === "add-item") return openItemForm(state.activeProcess.id);
  if (target.dataset.action === "add-participant") return openParticipantForm(state.activeProcess.id);
  if (target.dataset.action === "add-task") return openTaskForm(state.activeProcess.id);
  if (target.dataset.action === "add-price-research") return openPriceResearchForm(state.activeProcess.id);
  if (target.dataset.action === "add-document") return openDocumentForm(state.activeProcess.id);
  if (target.dataset.action === "add-contract") return openContractForm(state.activeProcess.id);
  if (target.dataset.action === "generate-ata") return openAtaForm(state.activeProcess.id);
  if (target.dataset.openContract) return openContractDetails(target.dataset.openContract).catch((e) => toast(e.message, "error"));
  if (target.dataset.openProcess) return openProcess(target.dataset.openProcess);
  if (target.dataset.sendDemand) return sendDemand(target.dataset.sendDemand).catch((e) => toast(e.message, "error"));
  if (target.dataset.convertDemand) { const d = state.demands.find((x) => x.id === target.dataset.convertDemand); return openProcessForm(d); }
  if (target.dataset.winner) return markWinner(target.dataset.winner).catch((e) => toast(e.message, "error"));
  if (target.dataset.completeStage) return completeStage(target.dataset.completeStage).catch((e) => toast(e.message, "error"));
  if (target.dataset.completeSubstep) return completeSubstep(target.dataset.completeSubstep).catch((e) => toast(e.message, "error"));
  if (target.dataset.completeTask) return completeTask(target.dataset.completeTask).catch((e) => toast(e.message, "error"));
  if (target.dataset.completeObligation) return completeObligation(target.dataset.completeObligation).catch((e) => toast(e.message, "error"));
  if (target.dataset.deleteHoliday) return deleteHoliday(target.dataset.deleteHoliday).catch((e) => toast(e.message || "Não foi possível remover o feriado.", "error"));
  if (target.dataset.newSubstep) return openSubstepForm(target.dataset.newSubstep);
  if (target.dataset.editSubstep) return openSubstepEditForm(target.dataset.editSubstep);
  if (target.dataset.newStage) return openStageForm(target.dataset.newStage);
  if (target.dataset.editStage) { const stage = state.flowStages.find((row) => row.id === target.dataset.editStage); return openStageForm(stage?.fluxo_versao_id, stage?.id); }
  if (target.dataset.deleteStage) return deleteStage(target.dataset.deleteStage).catch((e) => toast(e.message || "Não foi possível excluir a etapa.", "error"));
  if (target.dataset.deleteSubstep) return deleteSubstep(target.dataset.deleteSubstep).catch((e) => toast(e.message || "Não foi possível excluir a subetapa.", "error"));
  if (target.dataset.publishVersion) return publishVersion(target.dataset.publishVersion).catch((e) => toast(e.message || "Não foi possível publicar a versão.", "error"));
  if (target.dataset.cloneVersion) return cloneVersion(target.dataset.cloneVersion).catch((e) => toast(e.message || "Não foi possível criar a versão.", "error"));
  if (target.closest(".section-link")) return;
}
function setUpTabs() {
  document.addEventListener("click", handleClick);
  $("#app-dialog").addEventListener("click", (event) => { if (event.target === $("#app-dialog")) closeDialog(); });
  $("#dialog-content").addEventListener("submit", (event) => handleSubmit(event));
  $("#dialog-content").addEventListener("click", (event) => {
    const close = event.target.closest("[data-dialog-close]"); if (close) closeDialog();
  });
  $("#dialog-content").addEventListener("change", (event) => {
    if (event.target.id === "process-status-update") updateProcessStatus(event.target).catch((e) => toast(e.message, "error"));
  });
  $("#demand-search").addEventListener("input", renderDemands);
  $("#demand-status-filter").addEventListener("change", renderDemands);
  $("#process-search").addEventListener("input", renderProcesses);
  $("#process-status-filter").addEventListener("change", renderProcesses);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && $("#app-dialog").open) closeDialog(); });
}

function openFlowForm() {
  if (!manager()) return toast("Somente Compras ou o administrador pode criar fluxos.", "error");
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Novo fluxo de trabalho</h2><p>Crie um modelo que receberá versões e etapas.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="flow-form" class="dialog-body"><div class="form-grid"><div class="form-field span-2"><label>Nome *</label><input name="nome" required maxlength="180" placeholder="Ex.: Licitação de bens e serviços" /></div><div class="form-field"><label>Tipo de contratação *</label><input name="tipo_contratacao" required maxlength="80" placeholder="licitacao" /></div><div class="form-field span-2"><label>Descrição</label><textarea name="descricao" maxlength="1000"></textarea></div></div>${actionsFooter("Cancelar", "Criar fluxo")}</form>`);
}
async function createFlow(form) {
  if (!manager()) throw new Error("Seu perfil não pode criar fluxos.");
  const data = new FormData(form);
  const { data: flow, error } = await supabase.from("compras_fluxos").insert({ tenant_id: state.tenantId, nome: String(data.get("nome")).trim(), tipo_contratacao: String(data.get("tipo_contratacao")).trim(), descricao: String(data.get("descricao") || "").trim() || null, created_by: state.user.id }).select("id").single();
  if (error) throw error;
  const { error: versionError } = await supabase.from("compras_fluxo_versoes").insert({ tenant_id: state.tenantId, fluxo_id: flow.id, versao: 1, situacao: "rascunho" });
  if (versionError) throw versionError;
  closeDialog(); toast("Fluxo criado como versão 1 em rascunho."); await loadData(); switchTab("settings");
}
function openVersionForm() {
  if (!manager()) return toast("Somente Compras ou o administrador pode criar versões.", "error");
  const options = state.flowCatalog.map((flow) => ({ value: flow.id, label: `${flow.nome} · ${human(flow.tipo_contratacao)}` }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Nova versão de fluxo</h2><p>A nova versão será criada em rascunho e copiará a versão publicada mais recente.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="flow-version-form" class="dialog-body"><div class="form-field"><label>Fluxo *</label><select name="fluxo_id" required>${selectOptions(options, "", "Escolha o fluxo")}</select></div>${actionsFooter("Cancelar", "Criar rascunho")}</form>`);
}
async function cloneVersion(versionId) {
  if (!manager()) throw new Error("Seu perfil não pode criar versões.");
  const source = state.flowVersions.find((row) => row.id === versionId);
  if (!source) throw new Error("Versão não encontrada.");
  await cloneFlowVersion(source.fluxo_id, source.id);
}
async function createFlowVersion(form) {
  if (!manager()) throw new Error("Seu perfil não pode criar versões.");
  const flowId = String(new FormData(form).get("fluxo_id"));
  const source = state.flowVersions.filter((row) => row.fluxo_id === flowId).sort((a, b) => b.versao - a.versao)[0];
  if (!source) throw new Error("O fluxo ainda não possui uma versão para copiar.");
  await cloneFlowVersion(flowId, source.id);
}
async function cloneFlowVersion(flowId, sourceVersionId) {
  const current = state.flowVersions.filter((row) => row.fluxo_id === flowId).reduce((max, row) => Math.max(max, Number(row.versao) || 0), 0);
  const { data: version, error } = await supabase.from("compras_fluxo_versoes").insert({ tenant_id: state.tenantId, fluxo_id: flowId, versao: current + 1, situacao: "rascunho" }).select("id,fluxo_id,versao,situacao,publicada_em").single();
  if (error) throw error;
  const { data: stages, error: stageError } = await supabase.from("compras_fluxo_etapas").select("id,ordem,codigo,nome,descricao,prazo_dias,responsavel_padrao,dependencias,documentos_obrigatorios,documentos_opcionais,condicoes,ativa").eq("tenant_id", state.tenantId).eq("fluxo_versao_id", sourceVersionId).order("ordem");
  if (stageError) throw stageError;
  const stageMap = new Map();
  if (stages?.length) {
    const { data: copiedStages, error: copyError } = await supabase.from("compras_fluxo_etapas").insert(stages.map((stage) => ({ tenant_id: state.tenantId, fluxo_versao_id: version.id, ordem: stage.ordem, codigo: stage.codigo, nome: stage.nome, descricao: stage.descricao, prazo_dias: stage.prazo_dias, responsavel_padrao: stage.responsavel_padrao, dependencias: stage.dependencias || [], documentos_obrigatorios: stage.documentos_obrigatorios || [], documentos_opcionais: stage.documentos_opcionais || [], condicoes: stage.condicoes || {}, ativa: stage.ativa }))).select("id,ordem,codigo");
    if (copyError) throw copyError;
    stages.forEach((stage, index) => stageMap.set(stage.id, copiedStages[index]));
    const { data: subs } = await supabase.from("compras_fluxo_subetapas").select("fluxo_etapa_id,ordem,codigo,nome,descricao,prazo_dias,responsavel_padrao,dependencias,documentos_obrigatorios,ativa").eq("tenant_id", state.tenantId).in("fluxo_etapa_id", stages.map((s) => s.id));
    if (subs?.length) await supabase.from("compras_fluxo_subetapas").insert(subs.map((sub) => ({ ...sub, tenant_id: state.tenantId, fluxo_etapa_id: stageMap.get(sub.fluxo_etapa_id)?.id })));
  }
  closeDialog(); toast(`Rascunho v${version.versao} criado.`); await loadData(); switchTab("settings");
}
function openStageForm(versionId, stageId = null) {
  if (!manager()) return toast("Somente Compras ou o administrador pode editar etapas.", "error");
  const stage = stageId ? state.flowStages.find((row) => row.id === stageId) : null;
  const nextOrder = state.flowStages.filter((row) => row.fluxo_versao_id === versionId).reduce((max, row) => Math.max(max, Number(row.ordem) || 0), 0) + 1;
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">${stage ? "Editar etapa" : "Adicionar etapa"}</h2><p>Somente rascunhos podem ser alterados.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="stage-form" class="dialog-body" data-version-id="${esc(versionId)}" data-stage-id="${esc(stage?.id || "")}"><div class="form-grid"><div class="form-field"><label>Ordem *</label><input name="ordem" type="number" min="1" value="${esc(stage?.ordem || nextOrder)}" required /></div><div class="form-field"><label>Código *</label><input name="codigo" required maxlength="60" value="${esc(stage?.codigo || "")}" /></div><div class="form-field span-2"><label>Nome *</label><input name="nome" required maxlength="180" value="${esc(stage?.nome || "")}" /></div><div class="form-field span-2"><label>Descrição</label><textarea name="descricao" maxlength="1200">${esc(stage?.descricao || "")}</textarea></div><div class="form-field"><label>Prazo em dias úteis</label><input name="prazo_dias" type="number" min="0" value="${esc(stage?.prazo_dias ?? "")}" /></div><div class="form-field"><label>Responsável padrão</label><input name="responsavel_padrao" maxlength="120" value="${esc(stage?.responsavel_padrao || "")}" /></div></div>${actionsFooter("Cancelar", stage ? "Salvar etapa" : "Adicionar etapa")}</form>`);
}
async function saveStage(form) {
  if (!manager()) throw new Error("Seu perfil não pode editar etapas.");
  const data = new FormData(form); const payload = { tenant_id: state.tenantId, fluxo_versao_id: form.dataset.versionId, ordem: Number(data.get("ordem")), codigo: String(data.get("codigo")).trim(), nome: String(data.get("nome")).trim(), descricao: String(data.get("descricao") || "").trim() || null, prazo_dias: data.get("prazo_dias") ? Number(data.get("prazo_dias")) : null, responsavel_padrao: String(data.get("responsavel_padrao") || "").trim() || null, ativa: true };
  const query = form.dataset.stageId ? supabase.from("compras_fluxo_etapas").update(payload).eq("id", form.dataset.stageId).eq("tenant_id", state.tenantId) : supabase.from("compras_fluxo_etapas").insert(payload);
  const { error } = await query; if (error) throw error; closeDialog(); toast("Etapa salva no rascunho."); await loadData(); switchTab("settings");
}
async function publishVersion(versionId) {
  if (!manager()) throw new Error("Seu perfil não pode publicar fluxos.");
  const version = state.flowVersions.find((row) => row.id === versionId);
  const stages = state.flowStages.filter((row) => row.fluxo_versao_id === versionId);
  if (!version || version.situacao !== "rascunho") throw new Error("Somente versões em rascunho podem ser publicadas.");
  if (!stages.length) throw new Error("Adicione pelo menos uma etapa antes de publicar.");
  const { error: archiveError } = await supabase.from("compras_fluxo_versoes").update({ situacao: "arquivada" }).eq("tenant_id", state.tenantId).eq("fluxo_id", version.fluxo_id).eq("situacao", "publicada");
  if (archiveError) throw archiveError;
  const { error } = await supabase.from("compras_fluxo_versoes").update({ situacao: "publicada", publicada_em: new Date().toISOString(), publicada_por: state.user.id }).eq("id", versionId).eq("tenant_id", state.tenantId).eq("situacao", "rascunho");
  if (error) throw error;
  toast(`Versão ${version.versao} publicada. Novos processos usarão este modelo.`); await loadData(); switchTab("settings");
}
async function deleteStage(stageId) {
  if (!manager()) throw new Error("Seu perfil não pode excluir etapas.");
  const stage = state.flowStages.find((row) => row.id === stageId);
  if (!stage || state.flowVersions.find((row) => row.id === stage.fluxo_versao_id)?.situacao !== "rascunho") throw new Error("Somente etapas de rascunho podem ser excluídas.");
  const { error } = await supabase.from("compras_fluxo_etapas").delete().eq("id", stageId).eq("tenant_id", state.tenantId);
  if (error) throw error; toast("Etapa excluída do rascunho."); await loadData();
}
async function deleteSubstep(substepId) {
  if (!manager()) throw new Error("Seu perfil não pode excluir subetapas.");
  const sub = state.substeps.find((row) => row.id === substepId); const stage = state.flowStages.find((row) => row.id === sub?.fluxo_etapa_id);
  if (!sub || state.flowVersions.find((row) => row.id === stage?.fluxo_versao_id)?.situacao !== "rascunho") throw new Error("Somente subetapas de rascunho podem ser excluídas.");
  const { error } = await supabase.from("compras_fluxo_subetapas").delete().eq("id", substepId).eq("tenant_id", state.tenantId);
  if (error) throw error; toast("Subetapa excluída do rascunho."); await loadData();
}
function openSubstepEditForm(substepId) {
  const sub = state.substeps.find((row) => row.id === substepId); if (!sub) return toast("Subetapa não encontrada.", "error");
  openSubstepForm(sub.fluxo_etapa_id, sub);
}
function openHolidayForm() {
  if (!manager()) return toast("Somente Compras ou o administrador pode configurar feriados.", "error");
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Adicionar feriado</h2><p>O dia será ignorado no cálculo de prazos úteis deste tenant.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="holiday-form" class="dialog-body"><div class="form-grid"><div class="form-field"><label>Data *</label><input name="data" type="date" required /></div><div class="form-field"><label>Abrangência</label><select name="abrangencia"><option value="municipal">Municipal</option><option value="estadual">Estadual</option><option value="federal">Federal</option></select></div><div class="form-field span-2"><label>Nome *</label><input name="nome" required maxlength="180" placeholder="Ex.: Aniversário do município" /></div></div>${actionsFooter("Cancelar", "Adicionar feriado")}</form>`);
}
async function createHoliday(form) {
  if (!manager()) throw new Error("Seu perfil não pode configurar feriados.");
  const data = new FormData(form);
  const { error } = await supabase.from("compras_feriados").insert({ tenant_id: state.tenantId, data: data.get("data"), nome: String(data.get("nome")).trim(), abrangencia: data.get("abrangencia") || "municipal" });
  if (error) throw error;
  closeDialog(); toast("Feriado adicionado ao calendário."); await loadData(); switchTab("settings");
}
async function deleteHoliday(id) {
  if (!manager()) throw new Error("Seu perfil não pode remover feriados.");
  const { error } = await supabase.from("compras_feriados").delete().eq("id", id).eq("tenant_id", state.tenantId);
  if (error) throw error;
  toast("Feriado removido do calendário."); await loadData();
}
function openSubstepForm(stageId, existing = null) {
  if (!manager()) return toast("Somente Compras ou o administrador pode configurar subetapas.", "error");
  const stage = state.flowStages.find((row) => row.id === stageId);
  const nextOrder = state.substeps.filter((row) => row.fluxo_etapa_id === stageId).reduce((max, row) => Math.max(max, Number(row.ordem) || 0), 0) + 1;
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">${existing ? "Editar subetapa" : "Adicionar subetapa"}</h2><p>${esc(stage?.nome || "Etapa do fluxo")}</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="substep-form" class="dialog-body" data-stage-id="${esc(stageId)}" data-substep-id="${esc(existing?.id || "")}"><div class="form-grid"><div class="form-field"><label>Ordem *</label><input name="ordem" type="number" min="1" value="${esc(existing?.ordem || nextOrder)}" required /></div><div class="form-field"><label>Código *</label><input name="codigo" required maxlength="60" value="${esc(existing?.codigo || "")}" /></div><div class="form-field span-2"><label>Nome *</label><input name="nome" required maxlength="180" value="${esc(existing?.nome || "")}" /></div><div class="form-field span-2"><label>Descrição</label><textarea name="descricao" maxlength="1000">${esc(existing?.descricao || "")}</textarea></div><div class="form-field"><label>Prazo em dias úteis</label><input name="prazo_dias" type="number" min="0" value="${esc(existing?.prazo_dias ?? "")}" /></div><div class="form-field"><label>Responsável padrão</label><input name="responsavel_padrao" maxlength="120" value="${esc(existing?.responsavel_padrao || "")}" /></div></div><div class="dialog-callout">Somente versões em rascunho podem ser alteradas; processos existentes mantêm seu snapshot.</div>${actionsFooter("Cancelar", existing ? "Salvar subetapa" : "Adicionar subetapa")}</form>`);
}
async function createSubstep(form) {
  if (!manager()) throw new Error("Seu perfil não pode configurar subetapas.");
  const data = new FormData(form);
  const payload = { tenant_id: state.tenantId, fluxo_etapa_id: form.dataset.stageId, ordem: Number(data.get("ordem")), codigo: String(data.get("codigo")).trim(), nome: String(data.get("nome")).trim(), descricao: String(data.get("descricao") || "").trim() || null, prazo_dias: data.get("prazo_dias") ? Number(data.get("prazo_dias")) : null, responsavel_padrao: String(data.get("responsavel_padrao") || "").trim() || null, ativa: true };
  const query = form.dataset.substepId ? supabase.from("compras_fluxo_subetapas").update(payload).eq("id", form.dataset.substepId).eq("tenant_id", state.tenantId) : supabase.from("compras_fluxo_subetapas").insert(payload);
  const { error } = await query;
  if (error) throw error;
  closeDialog(); toast("Subetapa adicionada ao fluxo."); await loadData(); switchTab("settings");
}
function openObligationForm() {
  if (!manager()) return toast("Somente Compras ou o administrador pode registrar obrigações.", "error");
  const processes = state.processes.map((p) => ({ value: p.id, label: `${p.numero_processo}/${p.ano} · ${p.objeto.slice(0, 75)}` }));
  const contracts = state.contracts.map((c) => ({ value: c.id, label: `${c.numero} · ${c.objeto.slice(0, 75)}` }));
  dialog(`<div class="dialog-head"><div><h2 id="dialog-title">Registrar obrigação</h2><p>Inclua o prazo e vincule-o ao processo ou contrato correspondente.</p></div><button class="icon-button" type="button" data-dialog-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><form id="obligation-form" class="dialog-body"><div class="dialog-callout">Cadastre apenas obrigações confirmadas pela equipe. O sistema não presume prazo legal nem envia informações a órgãos externos.</div><div class="form-grid"><div class="form-field span-2"><label>O que precisa ser feito? *</label><textarea name="descricao" required maxlength="2000" placeholder="Ex.: conferir comprovante de publicação no PNCP"></textarea></div><div class="form-field"><label>Origem *</label><input name="origem" required maxlength="100" placeholder="PNCP, TCE-PR/SIM-AM, contrato…" /></div><div class="form-field"><label>Prazo</label><input name="prazo" type="date" /></div><div class="form-field span-2"><label>Processo relacionado</label><select name="processo_id">${selectOptions(processes, "", "Não vincular a processo")}</select></div><div class="form-field span-2"><label>Contrato relacionado</label><select name="contrato_id">${selectOptions(contracts, "", "Não vincular a contrato")}</select><span class="form-help">Escolha pelo menos um vínculo.</span></div><div class="form-field"><label>Responsável (ID interno)</label><input name="responsavel_id" type="number" min="1" /></div><div class="form-field"><label>Link do comprovante</label><input name="comprovante_url" type="url" placeholder="https://…" /></div></div>${actionsFooter("Cancelar", "Salvar obrigação")}</form>`);
}

async function createObligation(form) {
  if (!manager()) throw new Error("Seu perfil não pode cadastrar obrigações.");
  const data = new FormData(form);
  const processId = String(data.get("processo_id") || "") || null;
  const contractId = String(data.get("contrato_id") || "") || null;
  if (!processId && !contractId) throw new Error("Escolha um processo ou contrato para vincular a obrigação.");
  const rawUrl = String(data.get("comprovante_url") || "").trim();
  const proofUrl = rawUrl ? safeHttpUrl(rawUrl) : "";
  if (rawUrl && !proofUrl) throw new Error("O link do comprovante precisa começar com http:// ou https://.");
  const payload = { tenant_id: state.tenantId, processo_id: processId, contrato_id: contractId, origem: String(data.get("origem")).trim(), descricao: String(data.get("descricao")).trim(), prazo: data.get("prazo") || null, responsavel_id: data.get("responsavel_id") ? Number(data.get("responsavel_id")) : null, status: "pendente", comprovante_url: proofUrl || null };
  const { error } = await supabase.from("compras_obrigacoes").insert(payload);
  if (error) throw error;
  closeDialog(); toast("Obrigação registrada na agenda."); await loadData(); switchTab("agenda");
}

async function start() {
  setUpTabs();
  try {
    state.user = await initLayout({
      supabase,
      brand: { nome: "Compras Públicas", subtitulo: "Intranet Municipal", icone: "fa-cart-shopping" },
      iconeTitulo: "fa-diagram-project",
      titulo: "Compras Públicas",
      subtitulo: "Planejamento, processos, contratos e atas",
      moduloAtivo: "compras-painel",
      rotaVoltar: "../intranet.html",
      textoVoltar: "Voltar à intranet",
      menuUsuario: { rotaPerfil: "../perfil.html", rotaAjuda: "ajuda.html" },
      menu: COMPRAS_MENU,
    });
    if (!state.user) return;
    await loadMembership();
    await loadData();
    switchToHashTab();
    window.addEventListener("hashchange", switchToHashTab);
    banner("As classificações e fluxos são configuráveis. O sistema não substitui conferência técnica, jurídica ou autorização administrativa.");
  } catch (error) {
    console.error("[Compras] Erro ao inicializar:", error);
    banner(error.message || "Não foi possível carregar o módulo. Verifique sua conexão ou peça ajuda ao administrador.", "error");
    $("#attention-list").innerHTML = `<div class="attention-item"><span class="attention-icon"><i class="fa-solid fa-triangle-exclamation"></i></span><div><strong>Os dados não foram carregados.</strong><p>${esc(error.message || "Verifique o acesso e tente novamente.")}</p></div></div>`;
  }
}

start();
