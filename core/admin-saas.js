import { supabase } from "../shared/js/supabase.js";

const $ = (selector) => document.querySelector(selector);
const state = { user: null, payload: null, loading: false };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const relative = (value) => {
  if (!value) return "Nunca";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
};
const dateTime = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function notify(message, tone = "error") {
  const host = $("#notificationCenter");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `admin-toast ${tone}`;
  el.innerHTML = `<i class="fas ${tone === "success" ? "fa-circle-check" : tone === "warning" ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i><span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), 5000);
}

async function getAdminUser() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) throw new Error("Sessão administrativa não encontrada.");
  const { data: user, error } = await supabase.from("usuarios").select("id,nome,email,perfil,ativo,foto_url").eq("uuid", sessionData.session.user.id).maybeSingle();
  if (error) throw error;
  if (!user || user.ativo === false || user.perfil !== "ADMIN") throw new Error("Acesso restrito ao perfil ADMIN.");
  return user;
}

async function fallbackResumo() {
  const [usuariosResult, orgaosResult] = await Promise.all([
    supabase.from("usuarios").select("id,ativo,nome,email,perfil,ultimo_acesso"),
    supabase.from("orgaos").select("id,ativo,nome,sigla"),
  ]);
  if (usuariosResult.error) throw usuariosResult.error;
  if (orgaosResult.error) throw orgaosResult.error;
  const usuarios = usuariosResult.data || [];
  const orgaos = orgaosResult.data || [];
  return {
    usuarios: { total: usuarios.length, ativos: usuarios.filter((x) => x.ativo !== false).length, inativos: usuarios.filter((x) => x.ativo === false).length },
    orgaos: { total: orgaos.length, ativos: orgaos.filter((x) => x.ativo !== false).length, inativos: orgaos.filter((x) => x.ativo === false).length },
    acessos: { concessoes: 0, perfis: 0, regras: 0, solicitacoes_pendentes: 0 },
    atividade: { auditoria_24h: 0, operacoes_24h: 0 },
    eventos_recentes: [],
    ultimos_acessos: usuarios.slice(0, 8),
    _fallback: true,
  };
}

function renderKpis(data) {
  const u = data.usuarios || {}, o = data.orgaos || {}, a = data.acessos || {}, v = data.atividade || {};
  const items = [
    ["fa-users", u.ativos ?? 0, "Usuários ativos", `${u.total ?? 0} identidades cadastradas`, "blue"],
    ["fa-building", o.ativos ?? 0, "Órgãos ativos", `${o.total ?? 0} estruturas cadastradas`, "green"],
    ["fa-key", a.concessoes ?? 0, "Acessos concedidos", `${a.perfis ?? 0} perfis ativos · ${a.regras ?? 0} regras`, "blue"],
    ["fa-bell", a.solicitacoes_pendentes ?? 0, "Solicitações pendentes", "Requerem revisão administrativa", a.solicitacoes_pendentes ? "amber" : "green"],
    ["fa-list-check", v.auditoria_24h ?? 0, "Eventos nas últimas 24h", `${v.operacoes_24h ?? 0} operações registradas`, "green"],
  ];
  $("#kpiGrid").innerHTML = items.map(([icon, value, label, meta, color]) => `<article class="admin-kpi ${color}"><span class="kpi-icon"><i class="fas ${icon}"></i></span><div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(meta)}</small></div></article>`).join("");
}

function renderHealth(data) {
  const u = data.usuarios || {}, o = data.orgaos || {}, a = data.acessos || {}, v = data.atividade || {};
  const rows = [
    ["Identidades", `${u.ativos ?? 0}/${u.total ?? 0} ativas`, u.inativos ? "Atenção" : "Estável", u.inativos ? "warn" : "ok"],
    ["Estrutura institucional", `${o.ativos ?? 0}/${o.total ?? 0} ativas`, o.inativos ? "Atenção" : "Estável", o.inativos ? "warn" : "ok"],
    ["Solicitações de acesso", String(a.solicitacoes_pendentes ?? 0), a.solicitacoes_pendentes ? "Revisar" : "Em dia", a.solicitacoes_pendentes ? "warn" : "ok"],
    ["Auditoria canônica", `${v.auditoria_24h ?? 0} eventos / 24h`, "Monitorada", "ok"],
  ];
  $("#healthList").innerHTML = rows.map(([label, value, status, tone]) => `<div class="health-row"><span class="health-dot ${tone}"></span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}</small></div><b class="health-status ${tone}">${escapeHtml(status)}</b></div>`).join("");
}
function renderEvents(events = []) {
  $("#eventsBody").innerHTML = events.length ? events.map((e) => `<tr><td><strong>${escapeHtml(e.operacao || "Evento")}</strong><small>${escapeHtml(e.id ? `#${e.id}` : "")}</small></td><td><span class="entity-chip">${escapeHtml(e.entidade || "Sistema")}</span><small>${escapeHtml(e.entidade_id || "")}</small></td><td>${escapeHtml(e.ator_nome || "Sistema")}</td><td>${escapeHtml(e.origem || "Aplicação")}</td><td title="${escapeHtml(dateTime(e.ocorrido_em))}">${escapeHtml(relative(e.ocorrido_em))}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-state"><i class="fas fa-inbox"></i> Nenhum evento recente encontrado.</td></tr>`;
}
function renderAccess(items = []) {
  $("#accessList").innerHTML = items.length ? items.map((u) => `<div class="access-row"><span class="access-avatar">${escapeHtml((u.nome || "U").split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase())}</span><div><strong>${escapeHtml(u.nome || "Usuário")}</strong><small>${escapeHtml(u.perfil || "—")} · ${escapeHtml(u.email || "")}</small></div><time>${escapeHtml(relative(u.ultimo_acesso))}</time></div>`).join("") : `<div class="empty-state"><i class="fas fa-user-clock"></i> Nenhum acesso registrado.</div>`;
}
function render(data) {
  state.payload = data;
  renderKpis(data); renderHealth(data); renderEvents(data.eventos_recentes); renderAccess(data.ultimos_acessos);
  const sync = $("#lastSync");
  if (sync) sync.textContent = `Sincronizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${data._fallback ? " · modo contingência" : ""}`;
}
function renderLoadError(error) {
  const content = $("#dashboardContent");
  if (!content) return;
  content.hidden = false;
  content.innerHTML = `<div class="admin-load-error"><i class="fas fa-triangle-exclamation"></i><h2>Não foi possível atualizar o painel</h2><p>O painel continua disponível, mas a fonte de dados demorou ou não respondeu. Você pode tentar novamente sem sair da página.</p><button type="button" id="adminRetry"><i class="fas fa-rotate"></i> Tentar novamente</button><small>${escapeHtml(error?.message || "Falha de comunicação com o serviço administrativo.")}</small></div>`;
  $("#adminRetry")?.addEventListener("click", load);
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  const loading = $("#loadingContainer");
  const content = $("#dashboardContent");
  if (loading) { loading.hidden = false; loading.querySelector("p")?.replaceChildren(document.createTextNode("Atualizando dados do painel…")); }
  if (content) content.hidden = true;
  try {
    let data;
    const rpc = await Promise.race([
      supabase.rpc("admin_dashboard_resumo"),
      new Promise((resolve) => window.setTimeout(() => resolve({ error: new Error("Tempo limite de atualização atingido.") }), 8000)),
    ]);
    if (rpc.error) {
      console.warn("[admin-saas] RPC indisponível; usando leitura de contingência:", rpc.error.message);
      data = await fallbackResumo();
      notify("O painel foi carregado em modo de contingência. A atualização automática será tentada novamente.", "warning");
    } else {
      data = Array.isArray(rpc.data) ? (rpc.data[0] || {}) : (rpc.data || {});
    }
    render(data);
    if (content) content.hidden = false;
  } catch (error) {
    console.error("[admin-saas] Falha ao carregar painel:", error);
    renderLoadError(error);
    notify(error.message || "Não foi possível carregar o painel.");
  } finally {
    if (loading) loading.hidden = true;
    state.loading = false;
  }
}

function bootShell() {
  $("#topbarNome").textContent = state.user.nome || "Administrador";
  $("#topbarData").textContent = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const initials = (state.user.nome || "AD").split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  $("#avatarIniciais").textContent = initials;
  $("#btnToggleSidebar")?.addEventListener("click", () => $("#sidebar")?.classList.toggle("aberta"));
  document.querySelectorAll("[data-scroll-target]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); document.getElementById(link.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth" }); $("#sidebar")?.classList.remove("aberta"); }));
  $("#btnRefresh")?.addEventListener("click", load);
  $("#btnSair")?.addEventListener("click", async () => { await supabase.auth.signOut(); window.location.href = "../intranet.html"; });
}

(async function start() {
  try {
    state.user = await getAdminUser();
    bootShell();
    await load();
  } catch (error) {
    console.error("[admin-saas-auth]", error);
    const loading = $("#loadingContainer");
    if (loading) loading.hidden = true;
    renderLoadError(error);
    notify(error.message || "Acesso não autorizado.");
  }
})();
