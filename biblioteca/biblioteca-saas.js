import { supabase } from "../shared/js/supabase.js";
export async function initBibliotecaSaaS() {
  if (window.__bibliotecaSaaSInicializado) return;
  window.__bibliotecaSaaSInicializado = true;
  injectStyles();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data: usuario } = await supabase.from("usuarios").select("id,nome,email,perfil,ativo").eq("uuid", session.user.id).maybeSingle();
  if (!usuario || usuario.ativo === false) return;
  window.bibliotecaSaaS = { supabase, usuario, uploadDocumento };
  await renderNotificationCenter();
}

async function renderNotificationCenter() {
  const topbar = document.querySelector(".topbar-direita");
  if (!topbar || document.getElementById("bibSaasBell")) return;
  const wrap = document.createElement("div"); wrap.className = "bib-saas-notification-wrap";
  wrap.innerHTML = `<button id="bibSaasBell" class="bib-saas-bell" aria-label="Pendências da biblioteca" aria-expanded="false"><i class="fas fa-bell"></i><span id="bibSaasBadge" hidden>0</span></button><div id="bibSaasPanel" class="bib-saas-panel" hidden><div class="bib-saas-panel-head"><strong>Pendências da Biblioteca</strong><button id="bibSaasReadAll" type="button">Marcar lidas</button></div><div id="bibSaasNotifications" class="bib-saas-notifications"><div class="bib-saas-empty">Carregando...</div></div></div>`;
  topbar.insertBefore(wrap, topbar.firstChild);
  wrap.querySelector("#bibSaasBell").onclick = () => { const p=wrap.querySelector("#bibSaasPanel"); p.hidden=!p.hidden; wrap.querySelector("#bibSaasBell").setAttribute("aria-expanded",String(!p.hidden)); };
  document.addEventListener("click", e => { if (!wrap.contains(e.target)) wrap.querySelector("#bibSaasPanel").hidden=true; });
  await loadNotifications();
  wrap.querySelector("#bibSaasReadAll").onclick = async () => { const {data}=await supabase.rpc("bib_listar_notificacoes",{p_apenas_nao_lidas:true}); await Promise.all((data||[]).map(n=>supabase.rpc("bib_marcar_notificacao_lida",{p_id:n.id}))); await loadNotifications(); };
}

async function loadNotifications() {
  const { data } = await supabase.rpc("bib_listar_notificacoes", { p_apenas_nao_lidas: false });
  const list = data || [], unread = list.filter(n => !n.lida_em).length;
  const badge = document.getElementById("bibSaasBadge"); if (badge) { badge.textContent = unread > 99 ? "99+" : String(unread); badge.hidden = unread === 0; }
  const out = document.getElementById("bibSaasNotifications"); if (!out) return;
  out.innerHTML = list.length ? list.map(n => `<button type="button" class="bib-saas-notification ${n.lida_em ? "" : "unread"}" data-id="${esc(n.id)}"><i class="fas ${n.prioridade === "critica" || n.prioridade === "alta" ? "fa-triangle-exclamation" : "fa-circle-info"}"></i><span><strong>${esc(n.titulo)}</strong><small>${esc(n.mensagem)}</small><em>${n.created_at ? new Date(n.created_at).toLocaleString("pt-BR") : ""}</em></span></button>`).join("") : '<div class="bib-saas-empty"><i class="fas fa-check-circle"></i><br>Nenhuma pendência no momento.</div>';
  out.querySelectorAll("[data-id]").forEach(btn => btn.onclick = async () => { await supabase.rpc("bib_marcar_notificacao_lida", { p_id: btn.dataset.id }); await loadNotifications(); });
}

export async function uploadDocumento({ entidade, entidadeId, arquivo }) {
  if (!arquivo || arquivo.size > 25 * 1024 * 1024) throw new Error("Arquivo ausente ou maior que 25 MB.");
  const { data: cfg } = await supabase.rpc("bib_obter_configuracao");
  const tenant = cfg?.tenant_id; if (!tenant) throw new Error("Tenant da Biblioteca não identificado.");
  const safe = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${tenant}/${entidade}/${entidadeId}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from("biblioteca-documentos").upload(path, arquivo, { contentType: arquivo.type || "application/octet-stream" });
  if (up.error) throw up.error;
  const { data, error } = await supabase.rpc("bib_registrar_documento", { p_entidade: entidade, p_entidade_id: String(entidadeId), p_nome_arquivo: arquivo.name, p_storage_path: path, p_mime_type: arquivo.type || "application/octet-stream", p_tamanho_bytes: arquivo.size });
  if (error) throw error; return data;
}

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function injectStyles() { /* CSS migrated to shared/css/intranet-global.css */ }

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initBibliotecaSaaS()); else initBibliotecaSaaS();
