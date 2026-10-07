import { createClient } from "@supabase/supabase-js";

const supabase = createClient("https://qgkjnzcqjhhqdgxmvtew.supabase.co", "sb_publishable_gbXPIpkbYvf3YKITplkjpg_eKrPHhYw");

export async function initBibliotecaSaaS() {
  if (window.__bibliotecaSaaSInicializado) return;
  window.__bibliotecaSaaSInicializado = true;
  injectStyles();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data: usuario } = await supabase.from("usuarios").select("id,nome,email,perfil,ativo").eq("uuid", session.user.id).maybeSingle();
  if (!usuario || usuario.ativo === false) return;
  window.bibliotecaSaaS = { supabase, usuario, uploadDocumento };
  await Promise.all([renderNotificationCenter(), renderProductBar(usuario)]);
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

async function renderProductBar(usuario) {
  if (document.getElementById("bibSaasProductBar")) return;
  const main = document.querySelector("main") || document.querySelector(".conteudo") || document.body;
  const bar = document.createElement("section"); bar.id = "bibSaasProductBar"; bar.className = "bib-saas-product-bar";
  bar.innerHTML = `<div><span class="bib-saas-eyebrow">Biblioteca Municipal · SaaS</span><strong>Operação rastreável e protegida por Município</strong><small>Circulação, acervo, inventário e atendimento em um só lugar.</small></div><div class="bib-saas-chips"><span><i class="fas fa-shield-halved"></i> Multi-tenant</span><span><i class="fas fa-clock-rotate-left"></i> Auditoria</span><span><i class="fas fa-lock"></i> LGPD</span></div>`;
  main.prepend(bar);
  const { data: config } = await supabase.rpc("bib_obter_configuracao");
  if (usuario.perfil === "ADMIN" && (!config || config.nome_biblioteca === "Biblioteca Municipal")) {
    bar.insertAdjacentHTML("beforeend", `<button type="button" class="bib-saas-setup" onclick="location.href='config.html'"><i class="fas fa-sliders"></i> Revisar configuração</button>`);
  }
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
function injectStyles() { if (document.getElementById("bibSaasStyles")) return; const s=document.createElement("style"); s.id="bibSaasStyles"; s.textContent=`.bib-saas-notification-wrap{position:relative;margin-right:14px}.bib-saas-bell{border:0;background:transparent;color:#475569;font-size:1.1rem;padding:9px;cursor:pointer;position:relative}.bib-saas-bell:hover{color:#0d5e3a}.bib-saas-bell span{position:absolute;right:0;top:1px;background:#dc2626;color:#fff;border-radius:99px;min-width:17px;height:17px;font:700 .65rem/17px sans-serif;text-align:center}.bib-saas-panel{position:absolute;right:0;top:44px;width:min(370px,calc(100vw - 24px));background:#fff;border:1px solid #dbe4e0;border-radius:12px;box-shadow:0 18px 50px #0f172a26;z-index:1000;overflow:hidden}.bib-saas-panel-head{padding:13px 15px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between}.bib-saas-panel-head button{border:0;background:none;color:#0d5e3a;cursor:pointer;font-size:.72rem}.bib-saas-notifications{max-height:380px;overflow:auto}.bib-saas-notification{width:100%;display:flex;gap:9px;text-align:left;border:0;border-bottom:1px solid #f1f5f9;background:#fff;padding:11px 13px;cursor:pointer}.bib-saas-notification.unread{background:#f0fdf4}.bib-saas-notification strong,.bib-saas-notification small,.bib-saas-notification em{display:block}.bib-saas-notification strong{font-size:.8rem}.bib-saas-notification small{font-size:.73rem;color:#475569;margin-top:3px}.bib-saas-notification em{font-size:.66rem;color:#94a3b8;margin-top:4px;font-style:normal}.bib-saas-notification>i{color:#0d5e3a}.bib-saas-empty{text-align:center;padding:26px;color:#64748b;font-size:.8rem}.bib-saas-product-bar{margin:0 0 18px;padding:15px 18px;border:1px solid #bbdcca;background:linear-gradient(110deg,#f0fdf4,#f8fafc);border-radius:12px;display:flex;gap:18px;align-items:center;justify-content:space-between}.bib-saas-product-bar strong,.bib-saas-product-bar small{display:block}.bib-saas-eyebrow{color:#0d5e3a;text-transform:uppercase;font-size:.65rem;font-weight:800;letter-spacing:.08em}.bib-saas-product-bar strong{margin:3px 0;color:#12372a}.bib-saas-product-bar small{color:#486156}.bib-saas-chips{display:flex;gap:7px;flex-wrap:wrap}.bib-saas-chips span{font-size:.68rem;color:#166534;background:#fff;border:1px solid #bbf7d0;border-radius:99px;padding:6px 9px;white-space:nowrap}.bib-saas-setup{border:1px solid #86efac;border-radius:8px;background:#fff;color:#166534;padding:9px 11px;cursor:pointer;white-space:nowrap}@media(max-width:700px){.bib-saas-product-bar{display:block}.bib-saas-chips{margin-top:10px}.bib-saas-setup{margin-top:10px}}`; document.head.appendChild(s); }

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initBibliotecaSaaS()); else initBibliotecaSaaS();
