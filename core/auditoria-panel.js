import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js?v=20261009-audit-shell-3";

const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 25;
const MAX_PAGE_INDEX = 200;
const MAX_VISIBLE_RECORDS = (MAX_PAGE_INDEX + 1) * PAGE_SIZE;
const REFRESH_INTERVAL_MS = 60_000;
const RPC_TIMEOUT_MS = 15_000;
const SEVERITIES = Object.freeze({ critical: "Crítico", warning: "Atenção", review: "Revisar" });
const state = {
  page: 0,
  total: 0,
  refreshing: false,
  accessRevoked: false,
  refreshTimer: null,
  authSubscription: null,
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

function formatDate(value, options = { dateStyle: "short", timeStyle: "short" }) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", options);
}

function isAuthorizationFailure(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return status === 401 || status === 403
    || ["42501", "PGRST301", "PGRST302"].includes(code)
    || /jwt expired|invalid jwt|permission denied|not authorized|unauthorized|apenas administradores/.test(message);
}

function setStatus(message, stateName = "ok") {
  const status = $("#auditStatus");
  if (!status) return;
  status.dataset.state = stateName;
  const icon = status.querySelector("i");
  if (icon) {
    icon.className = stateName === "error"
      ? "fas fa-circle-exclamation"
      : stateName === "loading"
        ? "fas fa-spinner fa-spin"
        : "fas fa-circle-check";
  }
  const text = status.querySelector("span");
  if (text) text.textContent = message;
}

function setBusy(busy) {
  const disabled = busy || state.accessRevoked;
  ["#btnAtualizar", "#btnFiltrar", "#filterSearch", "#filterCategory", "#filterPeriod"].forEach((selector) => {
    const control = $(selector);
    if (control) control.disabled = disabled;
  });
  const previous = $("#btnPrev");
  const next = $("#btnNext");
  if (previous) previous.disabled = disabled || state.page <= 0;
  if (next) next.disabled = disabled || state.page >= MAX_PAGE_INDEX || (state.page + 1) * PAGE_SIZE >= state.total;
}

function clearSensitiveData(message) {
  state.total = 0;
  state.page = 0;
  const rows = $("#auditRows");
  if (rows) rows.innerHTML = `<tr><td colspan="8" class="audit-table-state error">${esc(message)}</td></tr>`;
  const alerts = $("#auditAlerts");
  if (alerts) alerts.innerHTML = `<div class="audit-empty audit-empty-error"><i class="fas fa-lock" aria-hidden="true"></i><span>${esc(message)}</span></div>`;
  const total = $("#metricTotal");
  const alertCount = $("#metricAlerts");
  const criticalCount = $("#metricCritical");
  if (total) total.textContent = "—";
  if (alertCount) alertCount.textContent = "—";
  if (criticalCount) criticalCount.textContent = "—";
  const resultCount = $("#resultCount");
  const pageIndicator = $("#pageIndicator");
  const updated = $("#alertsUpdatedAt");
  const limitNotice = $("#auditLimitNotice");
  if (resultCount) resultCount.textContent = "Dados ocultados";
  if (pageIndicator) pageIndicator.textContent = "Página 1";
  if (updated) updated.textContent = "Consulta indisponível";
  if (limitNotice) limitNotice.hidden = true;
  setBusy(false);
}

function displayOutcome(outcome) {
  if (outcome === "success") return { label: "Sucesso", className: "success" };
  if (outcome === "failure") return { label: "Falha", className: "failure" };
  if (outcome === "attempt" || outcome === "pending") return { label: "Tentativa", className: "attempt" };
  return { label: "Registrado", className: "recorded" };
}

function eventTypeLabel(value) {
  const type = String(value || "").trim();
  const labels = {
    login: "Login",
    insert: "Inclusão",
    update: "Atualização",
    delete: "Exclusão",
    sign_in: "Login",
    user_signedup: "Cadastro",
  };
  return labels[type.toLowerCase()] || type || "Alteração";
}

function sourceLabel(value) {
  const source = String(value || "").trim();
  if (!source) return "—";
  if (source === "supabase_auth") return "Auth Audit Logs do Supabase";
  if (source === "security-login") return "Login seguro";
  if (source === "oauth") return "OAuth";
  return source;
}

function renderEvents(items) {
  const rows = $("#auditRows");
  if (!rows) return;
  if (!Array.isArray(items) || items.length === 0) {
    rows.innerHTML = '<tr><td colspan="8" class="audit-table-state">Nenhum evento encontrado para os filtros selecionados.</td></tr>';
    return;
  }

  rows.innerHTML = items.map((event) => {
    const isAccess = event.category === "access";
    const outcome = displayOutcome(event.outcome);
    const category = isAccess ? "Acesso" : "Transação";
    const categoryClass = isAccess ? "access" : "transactions";
    const actor = event.actor || event.identifier_masked || "—";
    const extraActor = event.identifier_masked && event.identifier_masked !== actor
      ? `<small>${esc(event.identifier_masked)}</small>` : "";
    const fields = Array.isArray(event.changed_fields) ? event.changed_fields.filter(Boolean) : [];
    const detail = isAccess
      ? `${eventTypeLabel(event.event_type)}${event.reason_code ? ` · ${event.reason_code}` : ""}`
      : `${eventTypeLabel(event.event_type)} · ${event.entity || "Entidade"}${event.entity_id ? ` · ${event.entity_id}` : ""}${fields.length ? ` · campos: ${fields.join(", ")}` : ""}`;
    const agent = String(event.user_agent || "");
    const agentShort = agent.length > 72 ? `${agent.slice(0, 71)}…` : (agent || "—");
    return `<tr>
      <td>${esc(formatDate(event.event_at))}</td>
      <td><span class="audit-category ${categoryClass}">${category}</span></td>
      <td><span class="audit-result ${outcome.className}">${outcome.label}</span></td>
      <td><strong>${esc(actor)}</strong>${extraActor}</td>
      <td title="${esc(detail)}"><strong>${esc(detail)}</strong></td>
      <td class="audit-cell-mono">${esc(event.ip_address || "—")}</td>
      <td class="audit-cell-agent" title="${esc(agent)}">${esc(agentShort)}</td>
      <td>${esc(sourceLabel(event.source))}</td>
    </tr>`;
  }).join("");
}

function renderAlerts(result) {
  const host = $("#auditAlerts");
  const updated = $("#alertsUpdatedAt");
  if (!host) return [];
  const alerts = Array.isArray(result?.alerts) ? result.alerts : [];
  const generatedAt = result?.generated_at || new Date().toISOString();
  if (updated) updated.textContent = `Verificado ${formatDate(generatedAt)}`;

  if (!alerts.length) {
    host.innerHTML = '<div class="audit-empty"><i class="fas fa-circle-check" aria-hidden="true"></i><span><strong>Sem alertas ativos.</strong> Nenhum sinal ultrapassou os limites monitorados nas janelas avaliadas.</span></div>';
    return alerts;
  }

  host.innerHTML = alerts.map((alert) => {
    const severity = Object.prototype.hasOwnProperty.call(SEVERITIES, alert.severity) ? alert.severity : "review";
    const label = SEVERITIES[severity];
    const count = Math.max(0, Number(alert.event_count) || 0);
    return `<article class="audit-alert-card ${severity}">
      <div>
        <div class="audit-alert-meta"><span class="audit-severity ${severity}">${esc(label)}</span><span class="audit-window">${esc(alert.window || "Janela não informada")}</span></div>
        <h4>${esc(alert.title || "Sinal de segurança")}</h4>
        <p>${esc(alert.message || "Consulte a trilha de auditoria para mais contexto.")}</p>
      </div>
      <div class="audit-alert-count"><strong>${count}</strong><span>${count === 1 ? "registro" : "registros"}</span><small>Último: ${esc(formatDate(alert.last_event_at))}</small></div>
    </article>`;
  }).join("");
  return alerts;
}

function unwrapRpc(value) {
  return Array.isArray(value) ? (value[0] || {}) : (value || {});
}

function updateMetrics(total, alerts, generatedAt) {
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const totalNode = $("#metricTotal");
  const alertsNode = $("#metricAlerts");
  const criticalNode = $("#metricCritical");
  const detail = $("#metricTotalDetail");
  if (totalNode) totalNode.textContent = Number(total).toLocaleString("pt-BR");
  if (alertsNode) alertsNode.textContent = String(alerts.length);
  if (criticalNode) criticalNode.textContent = String(critical);
  if (detail) detail.textContent = `${$("#filterPeriod").selectedOptions[0]?.textContent || "Período selecionado"} · filtro aplicado`;
  const resultCount = $("#resultCount");
  const first = total ? state.page * PAGE_SIZE + 1 : 0;
  const last = Math.min(total, (state.page + 1) * PAGE_SIZE);
  if (resultCount) resultCount.textContent = `${first}–${last} de ${Number(total).toLocaleString("pt-BR")}`;
  const pageIndicator = $("#pageIndicator");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const accessiblePages = Math.min(totalPages, MAX_PAGE_INDEX + 1);
  if (pageIndicator) pageIndicator.textContent = `Página ${state.page + 1} de ${accessiblePages}${totalPages > accessiblePages ? " · limite" : ""}`;
  const limitNotice = $("#auditLimitNotice");
  if (limitNotice) limitNotice.hidden = total <= MAX_VISIBLE_RECORDS;
  const footer = $("#auditFooterUpdated");
  if (footer) footer.textContent = `Última consulta: ${formatDate(generatedAt)} · Próxima atualização automática em até 60 s.`;
}

function activityParams() {
  return {
    p_category: $("#filterCategory").value,
    p_period: $("#filterPeriod").value,
    p_search: $("#filterSearch").value.trim(),
    p_page: Math.min(MAX_PAGE_INDEX, Math.max(0, state.page)),
    p_page_size: PAGE_SIZE,
  };
}

async function rpcWithTimeout(name, params) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error(`A chamada ${name} excedeu o tempo limite.`);
      error.code = "AUDIT_RPC_TIMEOUT";
      reject(error);
      controller.abort();
    }, RPC_TIMEOUT_MS);
  });
  try {
    const request = params === undefined ? supabase.rpc(name) : supabase.rpc(name, params);
    const abortable = typeof request?.abortSignal === "function"
      ? request.abortSignal(controller.signal)
      : request;
    return await Promise.race([abortable, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestData() {
  return Promise.allSettled([
    rpcWithTimeout("admin_security_activity", activityParams()),
    rpcWithTimeout("admin_security_alerts"),
  ]);
}

function errorFromSettled(result) {
  return result.status === "rejected" ? result.reason : result.value?.error;
}

function handleQueryFailure(activityError, alertsError) {
  const error = activityError || alertsError;
  if (!error) return false;
  console.error("[admin-audit-console] query failed", error);
  const revoked = isAuthorizationFailure(activityError) || isAuthorizationFailure(alertsError);
  const timedOut = [activityError, alertsError].some((item) => item?.code === "AUDIT_RPC_TIMEOUT");
  if (revoked) {
    state.accessRevoked = true;
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  const message = revoked
    ? "A sessão ou autorização ADMIN foi encerrada. Entre novamente para consultar a auditoria."
    : timedOut
      ? "A consulta excedeu 15 segundos. Os resultados anteriores foram ocultados; tente novamente."
      : "Não foi possível revalidar a consulta. Os resultados anteriores foram ocultados; tente atualizar.";
  clearSensitiveData(message);
  setStatus(revoked
    ? "Autorização administrativa não confirmada; os dados foram ocultados."
    : timedOut
      ? "Tempo limite de consulta atingido; os controles foram liberados para nova tentativa."
      : "Falha temporária ao carregar dados; os resultados anteriores foram removidos.", "error");
  return true;
}

function lastAccessiblePage(total) {
  return Math.min(MAX_PAGE_INDEX, Math.max(0, Math.ceil(Math.max(0, total) / PAGE_SIZE) - 1));
}

function revokeAccess(message) {
  if (state.accessRevoked) return;
  state.accessRevoked = true;
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  clearSensitiveData(message);
  setStatus(message, "error");
  setBusy(false);
}

async function refresh() {
  if (state.refreshing || state.accessRevoked) return;
  state.refreshing = true;
  setBusy(true);
  setStatus("Consultando eventos e regras de alerta…", "loading");

  try {
    let [activitySettled, alertsSettled] = await requestData();
    if (state.accessRevoked) return;
    if (handleQueryFailure(errorFromSettled(activitySettled), errorFromSettled(alertsSettled))) return;

    let activity = unwrapRpc(activitySettled.value?.data);
    const alertPayload = unwrapRpc(alertsSettled.value?.data);
    state.total = Math.max(0, Number(activity.total) || 0);

    // O total pode cair entre atualizações. Reposiciona e consulta novamente
    // até três vezes, sem manter um indicador de página impossível.
    for (let correction = 0; correction < 3 && state.page > lastAccessiblePage(state.total); correction += 1) {
      state.page = lastAccessiblePage(state.total);
      let corrected;
      try {
        corrected = await rpcWithTimeout("admin_security_activity", activityParams());
      } catch (error) {
        handleQueryFailure(error, null);
        return;
      }
      if (state.accessRevoked) return;
      if (corrected?.error) {
        handleQueryFailure(corrected.error, null);
        return;
      }
      activity = unwrapRpc(corrected?.data);
      state.total = Math.max(0, Number(activity.total) || 0);
    }

    if (state.page > lastAccessiblePage(state.total)) {
      clearSensitiveData("A lista mudou enquanto era consultada; atualize os filtros para carregar o intervalo atual.");
      setStatus("A lista de eventos mudou durante a consulta. Tente novamente.", "error");
      return;
    }

    const events = Array.isArray(activity.items) ? activity.items : [];
    const alerts = renderAlerts(alertPayload);
    renderEvents(events);
    updateMetrics(state.total, alerts, alertPayload.generated_at);
    setStatus(`Consulta atualizada às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, "ok");
  } catch (error) {
    console.error("[admin-audit-console] unexpected error", error);
    clearSensitiveData("Não foi possível revalidar a consulta. Os resultados anteriores foram ocultados; tente atualizar.");
    setStatus("Falha temporária ao carregar a auditoria.", "error");
  } finally {
    state.refreshing = false;
    setBusy(false);
  }
}

async function boot() {
  const gate = $("#auditGate");
  try {
    const user = await initLayout({
      supabase,
      brand: {
        nome: "Prefeitura Municipal de Pitangueiras",
        subtitulo: "Intranet Municipal",
        icone: "fa-shield-halved",
        imagem: "../../brasao-pref.png",
      },
      iconeTitulo: "fa-shield-halved",
      titulo: "Segurança e Auditoria",
      subtitulo: "Governança administrativa · trilha de eventos",
      moduloAtivo: "auditoria",
      rotaIntranet: "../../intranet.html",
      rotaVoltar: "../../intranet.html",
      textoVoltar: "Voltar à intranet",
      menuUsuario: {
        rotaPerfil: "../../perfil.html",
        rotaAjuda: "../../controle-de-saldos/gestao-atas.html#faq",
      },
      adminOnly: ["painel", "auditoria", "usuarios", "orgaos", "modulos", "permissoes", "atas"],
      menu: [
        {
          section: "Visão central",
          itens: [
            { id: "painel", rota: "../../core/index.html", icone: "fa-gauge-high", label: "Painel executivo" },
            { id: "auditoria", rota: "index.html", icone: "fa-shield-halved", label: "Segurança e auditoria" },
          ],
        },
        {
          section: "Identidades e acesso",
          itens: [
            { id: "usuarios", rota: "../../core/usuarios/index.html", icone: "fa-users", label: "Usuários" },
            { id: "orgaos", rota: "../../core/orgaos/index.html", icone: "fa-building", label: "Órgãos e unidades" },
            { id: "permissoes", rota: "../../core/permissoes/index.html", icone: "fa-key", label: "Perfis e permissões" },
          ],
        },
        {
          section: "Módulos",
          itens: [
            { id: "modulos", rota: "../../core/modulos/index.html", icone: "fa-cubes", label: "Catálogo de módulos" },
            { id: "atas", rota: "../../controle-de-saldos/gestao-atas.html", icone: "fa-file-contract", label: "Atas, saldos e pedidos" },
          ],
        },
      ],
    });

    if (!user) return;
    if (user.ativo !== true || user.perfil !== "ADMIN") {
      if (gate) {
        gate.classList.add("is-denied");
        gate.textContent = "Acesso restrito a administradores ativos. Redirecionando…";
      }
      window.location.replace("../../intranet.html");
      return;
    }

    const consoleRoot = $("#auditConsole");
    if (consoleRoot) consoleRoot.hidden = false;
    if (gate) gate.hidden = true;

    const authState = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        revokeAccess("A sessão foi encerrada ou expirou. Entre novamente para consultar a auditoria.");
      } else if (state.accessRevoked && event === "SIGNED_IN") {
        window.location.reload();
      }
    });
    state.authSubscription = authState?.data?.subscription || null;

    $("#auditFilters")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!state.refreshing && !state.accessRevoked) {
        state.page = 0;
        void refresh();
      }
    });
    $("#btnAtualizar")?.addEventListener("click", () => void refresh());
    $("#btnPrev")?.addEventListener("click", () => {
      if (!state.refreshing && !state.accessRevoked && state.page > 0) {
        state.page -= 1;
        void refresh();
      }
    });
    $("#btnNext")?.addEventListener("click", () => {
      if (!state.refreshing && !state.accessRevoked && state.page < MAX_PAGE_INDEX && (state.page + 1) * PAGE_SIZE < state.total) {
        state.page += 1;
        void refresh();
      }
    });

    await refresh();
    if (!state.accessRevoked) {
      state.refreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, REFRESH_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void refresh();
      });
    }
    window.addEventListener("pagehide", () => state.authSubscription?.unsubscribe(), { once: true });
  } catch (error) {
    console.error("[admin-audit-console] access check failed", error);
    if (gate) {
      gate.classList.add("is-denied");
      gate.textContent = "Não foi possível validar a autorização administrativa. Os dados permanecem ocultos.";
    }
  }
}

void boot();
