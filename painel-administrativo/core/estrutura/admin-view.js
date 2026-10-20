import { supabase } from "../../../shared/js/supabase.js";
import { UnidadesOrganizacionaisService } from "../../../shared/js/services/unidades-organizacionais-service.js";

const TYPES = [
  ["PREFEITURA", "Prefeitura"],
  ["ORGAO_ADMINISTRACAO_ESPECIFICA", "Órgão de administração específica"],
  ["ORGAO_ADMINISTRACAO_SUPERIOR", "Órgão de administração superior"],
  ["ORGAO_ASSISTENCIA_SUPERIOR", "Órgão de assistência superior"],
  ["SECRETARIA", "Secretaria"],
  ["PROCURADORIA", "Procuradoria"],
  ["GABINETE", "Gabinete"],
  ["DEPARTAMENTO", "Departamento"],
  ["DIVISAO", "Divisão"],
  ["SUBDIVISAO", "Subdivisão"],
  ["ASSESSORIA", "Assessoria"],
  ["CONSELHO", "Conselho"],
  ["COMISSAO", "Comissão"],
  ["AUTARQUIA", "Autarquia"],
  ["FUNDACAO", "Fundação"],
  ["CAMARA", "Câmara"],
  ["SAAE", "SAAE"],
  ["OUTRO", "Outro"],
];

const $ = (selector) => document.querySelector(selector);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const typeLabel = (v) => TYPES.find(([key]) => key === v)?.[1] || v || "Outro";
const state = { rows: [], byId: new Map() };

function notify(message, tone = "success") {
  const host = $("#notificationCenter") || document.body;
  const el = document.createElement("div");
  el.className = `org-toast ${tone}`;
  el.textContent = message;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}

function options(parentId = null) {
  return `<option value="">Unidade raiz</option>${state.rows.filter((r) => r.ativo && r.id !== parentId).map((r) => `<option value="${esc(r.id)}">${esc("— ".repeat(r.nivel) + r.codigo + " · " + r.nome)}</option>`).join("")}`;
}

function renderTree() {
  const host = $("#orgTree");
  if (!host) return;
  const children = new Map();
  state.rows.forEach((row) => { const key = row.parent_id || "__root__"; if (!children.has(key)) children.set(key, []); children.get(key).push(row); });
  const seen = new Set();
  const walk = (parentId, depth = 0) => (children.get(parentId || "__root__") || []).map((row) => {
    seen.add(row.id);
    const childCount = (children.get(row.id) || []).length;
    return `<div class="org-row ${row.ativo ? "" : "is-inactive"}" style="--org-depth:${depth}">
      <div class="org-main"><span class="org-toggle">${childCount ? "▾" : "·"}</span><span class="org-code">${esc(row.codigo)}</span><strong>${esc(row.nome)}</strong><small>${esc(row.sigla || "")}</small></div>
      <div class="org-meta"><span class="org-pill">${esc(typeLabel(row.tipo))}</span><span class="org-level">Nível ${row.nivel}</span><span class="org-status">${row.ativo ? "Ativa" : "Inativa"}</span><button type="button" class="org-action" data-toggle-id="${esc(row.id)}">${row.ativo ? "Inativar" : "Reativar"}</button></div>
    </div>${walk(row.id, depth + 1)}`).join("");
  });
  const html = walk(null);
  const orphans = state.rows.filter((r) => !seen.has(r.id));
  host.innerHTML = html + (orphans.length ? `<div class="org-warning">${orphans.length} unidade(s) não puderam ser encaixadas na árvore.</div>${orphans.map((r) => walk(r.id, 0)).join("")}` : "") || `<div class="org-empty">Nenhuma unidade organizacional cadastrada.</div>`;
  host.querySelectorAll("[data-toggle-id]").forEach((button) => button.addEventListener("click", async () => {
    const row = state.byId.get(button.dataset.toggleId);
    if (!row) return;
    button.disabled = true;
    try { await UnidadesOrganizacionaisService.alternarAtivo(row.id, !row.ativo); notify(row.ativo ? "Unidade inativada." : "Unidade reativada."); await load(); }
    catch (error) { console.error(error); notify(error.message || "Não foi possível atualizar a unidade.", "error"); button.disabled = false; }
  }));
}

async function loadUsers() {
  const userSelect = $("#orgUser");
  if (!userSelect) return;
  const { data, error } = await supabase.from("usuarios").select("id,nome,email,ativo").order("nome").limit(500);
  if (error) throw error;
  const userMarkup = `<option value="">Selecione um usuário</option>${(data || []).map((u) => `<option value="${esc(u.id)}">${esc(u.nome || u.email)}${u.ativo === false ? " · inativo" : ""}</option>`).join("")}`;
  userSelect.innerHTML = userMarkup;
  const permUser = $("#orgPermUser"); if (permUser) permUser.innerHTML = userMarkup;
}

async function load() {
  const host = $("#orgTree");
  if (host) host.innerHTML = `<div class="org-empty"><i class="fas fa-spinner fa-spin"></i> Carregando estrutura…</div>`;
  try {
    state.rows = await UnidadesOrganizacionaisService.listar();
    state.byId = new Map(state.rows.map((row) => [row.id, row]));
    const unitMarkup = `<option value="">Selecione uma unidade</option>${state.rows.filter((r) => r.ativo).map((r) => `<option value="${esc(r.id)}">${esc("— ".repeat(r.nivel) + r.codigo + " · " + r.nome)}</option>`).join("")}`;
    const unitSelect = $("#orgUnit"); if (unitSelect) unitSelect.innerHTML = unitMarkup;
    const permUnit = $("#orgPermUnit"); if (permUnit) permUnit.innerHTML = unitMarkup;
    const parent = $("#orgParent");
    if (parent) parent.innerHTML = options();
    const count = $("#orgCount");
    if (count) count.textContent = `${state.rows.filter((r) => r.ativo).length} ativas · ${state.rows.length} total`;
    renderTree();
  } catch (error) {
    console.error("[estrutura]", error);
    if (host) host.innerHTML = `<div class="org-empty error">Não foi possível carregar a estrutura. ${esc(error.message || "Verifique as permissões de administrador.")}</div>`;
  }
}

function bindForm() {
  $("#orgForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await UnidadesOrganizacionaisService.criar(Object.fromEntries(form.entries()));
      event.currentTarget.reset();
      notify("Unidade criada e registrada no histórico.");
      await load();
    } catch (error) { console.error(error); notify(error.message || "Não foi possível criar a unidade.", "error"); }
    finally { button.disabled = false; }
  });
  $("#orgRefresh")?.addEventListener("click", load);
  $("#orgAssignmentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await UnidadesOrganizacionaisService.criarVinculoUsuario({ ...Object.fromEntries(form.entries()), principal: form.get("principal") === "true" });
      $("#orgAssignmentResult").textContent = "Vínculo registrado com histórico.";
      event.currentTarget.reset();
      notify("Vínculo de lotação registrado.");
    } catch (error) { console.error(error); notify(error.message || "Não foi possível registrar o vínculo.", "error"); }
    finally { button.disabled = false; }
  });

  $("#orgPermissionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    try {
      await UnidadesOrganizacionaisService.criarPermissaoUnidade(Object.fromEntries(form.entries()));
      $("#orgPermissionResult").textContent = "Permissão concedida com escopo registrado.";
      event.currentTarget.reset(); notify("Permissão por escopo registrada.");
    } catch (error) { console.error(error); notify(error.message || "Não foi possível conceder a permissão.", "error"); }
    finally { button.disabled = false; }
  });}

export async function initializeAdminView() {
  const type = $("#orgType");
  if (type) type.innerHTML = TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  bindForm();
  await Promise.all([load(), loadUsers()]);
}
