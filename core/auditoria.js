import { supabase } from "../shared/js/supabase.js";

const $ = (selector) => document.querySelector(selector);
const REFRESH_INTERVAL_MS = 60_000;
const ALERT_SEVERITIES = Object.freeze({ critical: "Crítico", warning: "Atenção", review: "Revisar" });
const state = {
  user: null,
  page: 0,
  pageSize: 25,
  total: 0,
  loading: false,
  alertLoading: false,
  refreshing: false,
  refreshTimer: null,
  accessRevoked: false,
};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const fmt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const shorten = (value, max = 70) => { const text = String(value || "—"); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };

function isAuthorizationFailure(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return status === 401 || status === 403 || ["42501", "PGRST301", "PGRST302"].includes(code)
    || /jwt expired|invalid jwt|permission denied|not authorized|unauthorized|apenas administradores/.test(message);
}

function setLogControlsBusy(busy) {
  const disabled = busy || state.accessRevoked;
  ["#btnFiltrar", "#filterSearch", "#filterCategory", "#filterPeriod"].forEach((selector) => {
    const element = $(selector);
    if (element) element.disabled = disabled;
  });
  const previous = $("#btnPrev");
  const next = $("#btnNext");
  if (previous) previous.disabled = disabled || state.page === 0;
  if (next) next.disabled = disabled || (state.page + 1) * state.pageSize >= state.total;
}

function clearSensitiveView(message, { accessRevoked = false } = {}) {
  if (accessRevoked) state.accessRevoked = true;
  state.total = 0;
  state.page = 0;
  const body = $("#auditBody");
  if (body) body.innerHTML = `<tr><td colspan="7" class="security-error">${esc(message)}</td></tr>`;
  const alerts = $("#securityAlerts");
  if (alerts) alerts.innerHTML = `<div class="security-alert-empty security-alert-empty-error"><strong>Dados ocultados</strong><p>${esc(message)}</p></div>`;
  const resultCount = $("#resultCount");
  if (resultCount) resultCount.textContent = state.accessRevoked ? "Acesso não confirmado" : "Dados ocultados por segurança";
  const pageIndicator = $("#pageIndicator");
  if (pageIndicator) pageIndicator.textContent = "Página 1";
  const updated = $("#alertsUpdatedAt");
  if (updated) updated.textContent = state.accessRevoked ? "Autorização não confirmada" : "Atualização necessária";
  if (state.accessRevoked) {
    const name = $("#topbarNome");
    const avatar = $("#avatarIniciais");
    if (name) name.textContent = "Sessão não autorizada";
    if (avatar) avatar.textContent = "—";
    if (state.refreshTimer) {
      window.clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }
  setLogControlsBusy(state.loading);
  const updateButton = $("#btnAtualizar");
  if (updateButton) updateButton.disabled = state.accessRevoked || state.refreshing;
}

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
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        clearSensitiveView("A sessão foi encerrada ou expirou. Entre novamente para consultar a auditoria.", { accessRevoked: true });
      } else if (state.accessRevoked && event === "SIGNED_IN") {
        location.reload();
      }
    });
    $("#btnSair")?.addEventListener("click", async () => { await supabase.auth.signOut(); location.href = "../../intranet.html"; });
    $("#btnFiltrar")?.addEventListener("click", () => {
      if (!state.loading && !state.accessRevoked) { state.page = 0; load(); }
    });
    $("#btnAtualizar")?.addEventListener("click", () => refreshAll());
    $("#filterSearch")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !state.loading && !state.accessRevoked) { state.page = 0; load(); }
    });
    $("#btnPrev")?.addEventListener("click", () => {
      if (!state.loading && !state.accessRevoked && state.page > 0) { state.page -= 1; load(); }
    });
    $("#btnNext")?.addEventListener("click", () => {
      if (!state.loading && !state.accessRevoked && (state.page + 1) * state.pageSize < state.total) { state.page += 1; load(); }
    });

    await refreshAll();
    if (!state.accessRevoked) {
      state.refreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") refreshAll({ silent: true });
      }, REFRESH_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshAll({ silent: true });
      });
    }
  } catch (error) {
    console.error("[admin-security-logs] access check failed", error);
    clearSensitiveView("Acesso restrito ao perfil ADMIN ativo. Os dados permanecem ocultos.", { accessRevoked: true });
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
    // IP e agente são mantidos na trilha administrativa, conforme requisito; a RPC valida ADMIN.
    return `<tr><td><span class="security-category">${categoryText}</span></td><td><span class="security-result ${outcomeClass}">${outcomeText}</span></td><td><strong>${esc(event.actor || "—")}</strong>${event.identifier_masked ? `<small>${esc(event.identifier_masked)}</small>` : ""}</td><td><strong>${esc(eventLabel)}</strong><small>${esc(event.source || "")}</small></td><td>${esc(event.ip_address || "—")}</td><td class="ua-cell" title="${esc(event.user_agent || "")}">${esc(shorten(event.user_agent))}</td><td>${esc(fmt(event.event_at))}</td></tr>`;
  }).join("");
}

function renderAlerts(result) {
  const container = $("#securityAlerts");
  const updated = $("#alertsUpdatedAt");
  if (!container) return;
  const alerts = Array.isArray(result?.alerts) ? result.alerts : [];
  const updatedAt = fmt(result?.generated_at);
  if (updated) updated.textContent = `Verificado ${updatedAt}`;

  if (!alerts.length) {
    container.innerHTML = '<div class="security-alert-empty"><span class="security-alert-empty-icon" aria-hidden="true"><i class="fas fa-shield-check"></i></span><div><strong>Sem alertas ativos</strong><p>Nenhum sinal ultrapassou os limites monitorados nas janelas avaliadas. Consulte a trilha completa para investigação.</p></div></div>';
    return;
  }

  container.innerHTML = alerts.map((alert) => {
    const severity = Object.prototype.hasOwnProperty.call(ALERT_SEVERITIES, alert.severity) ? alert.severity : "review";
    const label = ALERT_SEVERITIES[severity];
    const count = Math.max(0, Number(alert.event_count) || 0);
    return `<article class="security-alert-item ${severity}"><div class="security-alert-main"><div class="security-alert-meta"><span class="security-alert-severity ${severity}">${esc(label)}</span><span class="security-alert-window">${esc(alert.window || "Janela não informada")}</span></div><strong>${esc(alert.title || "Sinal de segurança")}</strong><p>${esc(alert.message || "Consulte a trilha de auditoria para mais contexto.")}</p></div><div class="security-alert-count"><strong>${count}</strong><span>${count === 1 ? "registro" : "registros"}</span><small>Último: ${esc(fmt(alert.last_event_at))}</small></div></article>`;
  }).join("");
}

async function loadAlerts({ silent = false } = {}) {
  if (state.alertLoading || state.accessRevoked) return null;
  state.alertLoading = true;
  const container = $("#securityAlerts");
  if (!silent && container) container.innerHTML = '<div class="security-loading">Verificando sinais de segurança…</div>';
  try {
    const { data, error } = await supabase.rpc("admin_security_alerts");
    if (error) throw error;
    if (state.accessRevoked) return { ok: false, accessRevoked: true };
    renderAlerts(data || {});
    return { ok: true };
  } catch (error) {
    console.error("[admin-security-logs] alert check failed", error);
    return { ok: false, accessRevoked: isAuthorizationFailure(error) };
  } finally {
    state.alertLoading = false;
  }
}

async function load({ silent = false } = {}) {
  if (state.loading || state.accessRevoked) return null;
  state.loading = true;
  setLogControlsBusy(true);
  const body = $("#auditBody");
  if (!silent) body.innerHTML = '<tr><td colspan="7" class="security-loading">Carregando registros administrativos…</td></tr>';
  try {
    const { data, error } = await supabase.rpc("admin_security_activity", {
      p_category: $("#filterCategory").value,
      p_period: $("#filterPeriod").value,
      p_search: $("#filterSearch").value.trim(),
      p_page: state.page,
      p_page_size: state.pageSize,
    });
    if (error) throw error;
    if (state.accessRevoked) return { ok: false, accessRevoked: true };
    const result = Array.isArray(data) ? (data[0] || {}) : (data || {});
    state.total = Number(result.total) || 0;
    renderEvents(result.items || []);
    const first = state.total ? state.page * state.pageSize + 1 : 0;
    const last = Math.min(state.total, (state.page + 1) * state.pageSize);
    $("#resultCount").textContent = `${first}–${last} de ${state.total} registros`;
    $("#pageIndicator").textContent = `Página ${state.page + 1}`;
    return { ok: true };
  } catch (error) {
    console.error("[admin-security-logs] load failed", error);
    const accessRevoked = isAuthorizationFailure(error);
    clearSensitiveView(
      accessRevoked
        ? "A sessão ou autorização ADMIN foi encerrada. Entre novamente para consultar a auditoria."
        : "Não foi possível revalidar a consulta. Os dados anteriores foram ocultados; tente atualizar.",
      { accessRevoked },
    );
    return { ok: false, accessRevoked: isAuthorizationFailure(error) };
  } finally {
    state.loading = false;
    setLogControlsBusy(false);
  }
}

async function refreshAll({ silent = false } = {}) {
  if (state.refreshing || state.accessRevoked) return;
  state.refreshing = true;
  const updateButton = $("#btnAtualizar");
  if (updateButton) updateButton.disabled = true;
  try {
    const [logResult, alertResult] = await Promise.all([load({ silent }), loadAlerts({ silent })]);
    const results = [logResult, alertResult].filter(Boolean);
    const failed = results.some((result) => !result.ok);
    const accessRevoked = results.some((result) => result.accessRevoked);
    if (failed) {
      clearSensitiveView(
        accessRevoked
          ? "A sessão ou autorização ADMIN foi encerrada. Entre novamente para consultar a auditoria."
          : "Não foi possível revalidar as consultas. Os dados anteriores foram ocultados; tente atualizar.",
        { accessRevoked },
      );
    }
  } finally {
    state.refreshing = false;
    if (updateButton) updateButton.disabled = state.accessRevoked;
  }
}

boot();
