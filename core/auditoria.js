import { supabase } from "../shared/js/supabase.js";

const $ = (selector) => document.querySelector(selector);
const state = { user: null, page: 0, pageSize: 25, total: 0, loading: false };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const fmt = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const shorten = (value, max = 70) => { const text = String(value || "—"); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };

async function boot() {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) throw new Error("Sessão administrativa não encontrada.");
    const { data: user, error } = await supabase.from("usuarios").select("nome,email,perfil,ativo").eq("uuid", sessionData.session.user.id).maybeSingle();
    if (error) throw error;
    if (!user || user.ativo !== true || user.perfil !== "ADMIN") throw new Error("Acesso restrito ao perfil ADMIN.");
    state.user = user;
    $("#topbarNome").textContent = user.nome || "Administrador";
    $("#topbarData").textContent = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    $("#avatarIniciais").textContent = (user.nome || "AD").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    $("#btnSair")?.addEventListener("click", async () => { await supabase.auth.signOut(); location.href = "../../intranet.html"; });
    $("#btnFiltrar")?.addEventListener("click", () => { state.page = 0; load(); });
    $("#btnAtualizar")?.addEventListener("click", load);
    $("#filterSearch")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { state.page = 0; load(); } });
    $("#btnPrev")?.addEventListener("click", () => { if (state.page > 0) { state.page -= 1; load(); } });
    $("#btnNext")?.addEventListener("click", () => { if ((state.page + 1) * state.pageSize < state.total) { state.page += 1; load(); } });
    await load();
  } catch (error) {
    console.error("[admin-security-logs] access check failed", error);
    $("#auditBody").innerHTML = `<tr><td colspan="7" class="security-error">${esc(error.message || "Não foi possível validar o acesso administrativo.")}</td></tr>`;
  }
}

function renderEvents(items) {
  const body = $("#auditBody");
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" class="security-loading">Nenhum registro encontrado no período selecionado.</td></tr>';
    return;
  }
  body.innerHTML = items.map((event) => {
    const isAccess = event.category === "access";
    const outcomeClass = event.outcome === "success" ? "success" : event.outcome === "failure" ? "failure" : "recorded";
    const outcomeText = event.outcome === "success" ? "Sucesso" : event.outcome === "failure" ? "Falha" : "Registrado";
    const categoryText = isAccess ? "Autenticação" : "Transação";
    const detail = isAccess ? (event.source === "supabase_auth" ? "Tentativa capturada pelo Auth nativo" : event.source === "oauth" ? "Autenticação OAuth" : `Login por senha${event.reason_code ? ` · ${event.reason_code}` : ""}`) : `${event.entity || "Entidade"} · ${event.entity_id || "—"}`;
    const fields = Array.isArray(event.changed_fields) ? event.changed_fields.join(", ") : "";
    const eventLabel = isAccess ? detail : `${event.event_type || "Alteração"}${fields ? ` · campos: ${fields}` : ""}`;
    return `<tr><td><span class="security-category">${categoryText}</span></td><td><span class="security-result ${outcomeClass}">${outcomeText}</span></td><td><strong>${esc(event.actor || "—")}</strong>${event.identifier_masked ? `<small>${esc(event.identifier_masked)}</small>` : ""}</td><td><strong>${esc(eventLabel)}</strong><small>${esc(event.source || "")}</small></td><td>${esc(event.ip_address || "—")}</td><td class="ua-cell" title="${esc(event.user_agent || "")}">${esc(shorten(event.user_agent))}</td><td>${esc(fmt(event.event_at))}</td></tr>`;
  }).join("");
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  const body = $("#auditBody");
  body.innerHTML = '<tr><td colspan="7" class="security-loading">Carregando registros administrativos…</td></tr>';
  $("#btnFiltrar").disabled = true;
  $("#btnAtualizar").disabled = true;
  try {
    const { data, error } = await supabase.rpc("admin_security_activity", {
      p_category: $("#filterCategory").value,
      p_period: $("#filterPeriod").value,
      p_search: $("#filterSearch").value.trim(),
      p_page: state.page,
      p_page_size: state.pageSize,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? (data[0] || {}) : (data || {});
    state.total = Number(result.total) || 0;
    renderEvents(result.items || []);
    const first = state.total ? state.page * state.pageSize + 1 : 0;
    const last = Math.min(state.total, (state.page + 1) * state.pageSize);
    $("#resultCount").textContent = `${first}–${last} de ${state.total} registros`;
    $("#pageIndicator").textContent = `Página ${state.page + 1}`;
    $("#btnPrev").disabled = state.page === 0;
    $("#btnNext").disabled = (state.page + 1) * state.pageSize >= state.total;
  } catch (error) {
    console.error("[admin-security-logs] load failed", error);
    body.innerHTML = `<tr><td colspan="7" class="security-error">Não foi possível carregar os logs. ${esc(error.message || "Tente novamente.")}</td></tr>`;
    $("#resultCount").textContent = "Consulta indisponível";
  } finally {
    $("#btnFiltrar").disabled = false;
    $("#btnAtualizar").disabled = false;
    state.loading = false;
  }
}

boot();
