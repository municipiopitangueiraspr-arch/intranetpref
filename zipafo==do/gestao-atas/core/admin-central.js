import { supabase } from "/shared/js/supabase.js";

const $ = (s) => document.querySelector(s);
const state = { user: null, loading: false };
const REQUEST_TIMEOUT_MS = 10000;
function withTimeout(promise, label, timeout = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(`${label} excedeu o tempo limite.`)), timeout)),
  ]);
}
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
const date = (v) => v ? new Date(v).toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" }) : "—";
const relative = (v) => { if (!v) return "Nunca"; const m = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000)); if (m < 1) return "agora"; if (m < 60) return `há ${m} min`; const h = Math.floor(m/60); if (h < 24) return `há ${h} h`; return `há ${Math.floor(h/24)} d`; };
const icon = (v) => { const s = String(v || "fa-cube").match(/fa-[a-z0-9-]+/i)?.[0]; return s || "fa-cube"; };

function notify(message, tone = "error") {
  const host = $("#notificationCenter"); if (!host) return;
  const el = document.createElement("div"); el.className = "admin-toast";
  el.innerHTML = `<i class="fas ${tone === "success" ? "fa-circle-check" : tone === "warning" ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i><span>${esc(message)}</span>`;
  host.appendChild(el); window.setTimeout(() => el.remove(), 5000);
}

async function getAdminUser() {
  const { data: sessionData, error: sessionError } = await withTimeout(supabase.auth.getSession(), "A verificação da sessão");
  if (sessionError || !sessionData?.session) throw new Error("Sessão administrativa não encontrada.");
  const { data, error } = await withTimeout(supabase.from("usuarios").select("id,nome,email,perfil,ativo,foto_url").eq("uuid", sessionData.session.user.id).maybeSingle(), "A leitura do perfil administrativo");
  if (error) throw error;
  if (!data || data.ativo === false || data.perfil !== "ADMIN") throw new Error("Acesso restrito ao perfil ADMIN.");
  return data;
}

async function directFallback() {
  const [users, orgs, modules] = await withTimeout(Promise.all([
    supabase.from("usuarios").select("id,nome,email,perfil,ativo,ultimo_acesso"),
    supabase.from("orgaos").select("id,ativo"),
    supabase.from("modulos_sistema").select("id,nome,descricao,icone,rota,ativo,ordem,cor,visivel_intranet").order("ordem", { ascending: true }),
  ]), "A leitura de contingência");
  if (users.error) throw users.error; if (orgs.error) throw orgs.error; if (modules.error) throw modules.error;
  const u = users.data || [], o = orgs.data || [], m = modules.data || [];
  const profiles = Object.entries(u.reduce((a, x) => { const k = x.perfil || "SEM PERFIL"; (a[k] ||= { perfil:k, total:0, ativos:0 }); a[k].total++; if (x.ativo !== false) a[k].ativos++; return a; }, {})).map(([,x]) => x);
  return { _fallback:true, visao:{tenant_total:0,unidades_total:o.length,integridade:{usuarios_sem_primeiro_acesso:0,usuarios_inativos:u.filter(x=>x.ativo===false).length,modulos_inativos:m.filter(x=>x.ativo===false).length,solicitacoes_pendentes:0}}, usuarios:{total:u.length,ativos:u.filter(x=>x.ativo!==false).length,inativos:u.filter(x=>x.ativo===false).length,com_acesso_30d:0,perfis:profiles}, modulos:{total:m.length,ativos:m.filter(x=>x.ativo!==false).length,visiveis:m.filter(x=>x.visivel_intranet!==false).length,catalogo:m}, acessos:{concessoes:0,perfis_configurados:0,regras_configuradas:0,regras_modulares:0,solicitacoes_pendentes:0}, auditoria:{eventos_24h:0,eventos_7d:0,operacoes_24h:0,ultimo_evento_em:null,eventos_recentes:[]}, acessos_recentes:u.filter(x=>x.ultimo_acesso).sort((a,b)=>new Date(b.ultimo_acesso)-new Date(a.ultimo_acesso)).slice(0,10), solicitacoes:[] };
}

function renderKpis(d) {
  const u=d.usuarios||{}, m=d.modulos||{}, a=d.acessos||{}, au=d.auditoria||{}, v=d.visao||{};
  const items=[
    ["fa-users",u.ativos??0,"Usuários ativos",`${u.total??0} identidades no ambiente`,""],
    ["fa-cubes",m.ativos??0,"Módulos ativos",`${m.visiveis??0} visíveis na intranet`,"green"],
    ["fa-key",a.regras_configuradas??0,"Regras de acesso",`${a.concessoes??0} concessões individuais`,"violet"],
    ["fa-list-check",au.eventos_24h??0,"Eventos nas últimas 24h",`${au.eventos_7d??0} registrados em 7 dias`,"green"],
    ["fa-user-clock",a.solicitacoes_pendentes??0,"Solicitações pendentes","Aguardando decisão ADMIN","amber"],
  ];
  $("#kpiGrid").innerHTML=items.map(([i,val,label,meta,tone])=>`<article class="admin-kpi ${tone}"><span class="admin-kpi-icon"><i class="fas ${i}"></i></span><div><strong>${esc(val)}</strong><span>${esc(label)}</span><small>${esc(meta)}</small></div></article>`).join("");
  $("#navUsers").textContent = u.ativos ?? "—";
}
function renderModules(d) {
  const list=d.modulos?.catalogo||[], el=$("#moduleGrid");
  el.innerHTML=list.length?list.map(m=>`<a class="module-item" href="${esc(m.rota||"/core/modulos/index.html")}"><span class="module-icon" style="color:${esc(m.cor||"#1d4ed8")}"><i class="fas ${icon(m.icone)}"></i></span><span><strong>${esc(m.nome)}</strong><small>${esc(m.descricao||"Módulo operacional da Intranet")}</small></span><i class="module-status ${m.ativo===false?"off":""}"></i></a>`).join(""):empty("fa-cubes","Nenhum módulo cadastrado.");
}
function renderHealth(d) {
  const v=d.visao?.integridade||{}, u=d.usuarios||{}, m=d.modulos||{}, a=d.acessos||{}, au=d.auditoria||{};
  const rows=[
    ["Identidades",`${u.ativos??0}/${u.total??0} ativas`,u.inativos?"Atenção":"Estável",u.inativos?"warn":"ok"],
    ["Catálogo de módulos",`${m.ativos??0}/${m.total??0} ativos`,m.ativos===m.total?"Estável":"Revisar",m.ativos===m.total?"ok":"warn"],
    ["Primeiro acesso",String(v.usuarios_sem_primeiro_acesso??0),v.usuarios_sem_primeiro_acesso?"Acompanhar":"Em dia",v.usuarios_sem_primeiro_acesso?"warn":"ok"],
    ["Trilha de auditoria",`${au.eventos_24h??0} eventos / 24h`,"Monitorada","ok"],
  ];
  $("#healthList").innerHTML=rows.map(([l,val,s,t])=>`<div class="health-row"><span class="health-dot ${t}"></span><div><strong>${esc(l)}</strong><small>${esc(val)}</small></div><b class="health-status ${t}">${esc(s)}</b></div>`).join("");
}
function renderEvents(d) {
  const events=d.auditoria?.eventos_recentes||[];
  $("#eventsBody").innerHTML=events.length?events.map(e=>`<tr><td><strong>${esc(e.operacao||"Evento")}</strong><small>${esc(e.id?`#${e.id}`:"")}</small></td><td><span class="entity-chip">${esc(e.entidade||"Sistema")}</span><small>${esc(e.entidade_id||"")}</small></td><td>${esc(e.ator_nome||"Sistema")}</td><td>${esc(e.origem||"Aplicação")}</td><td title="${esc(date(e.ocorrido_em))}">${esc(relative(e.ocorrido_em))}</td></tr>`).join(""): `<tr><td colspan="5">${empty("fa-inbox","Nenhum evento recente registrado.")}</td></tr>`;
}
function renderAccess(d) {
  const list=d.acessos_recentes||[]; $("#accessList").innerHTML=list.length?list.map(u=>`<div class="access-row"><span class="access-avatar">${esc((u.nome||"U").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase())}</span><div><strong>${esc(u.nome||"Usuário")}</strong><small>${esc(u.perfil||"—")} · ${esc(u.email||"")}</small></div><time>${esc(relative(u.ultimo_acesso))}</time></div>`).join(""):empty("fa-user-clock","Nenhum acesso recente.");
}
function renderRequests(d) {
  const list=d.solicitacoes||[]; $("#requestList").innerHTML=list.length?list.map(r=>`<div class="request-item"><span class="request-icon"><i class="fas fa-user-plus"></i></span><div><strong>${esc(r.nome||r.email||"Solicitação")}</strong><small>${esc(r.email||"")} · Perfil: ${esc(r.perfil_solicitado||"a definir")}</small></div><span class="request-date">${esc(relative(r.created_at))}</span></div>`).join(""):empty("fa-circle-check","Nenhuma solicitação pendente.");
}
function renderProfiles(d) {
  const list=d.usuarios?.perfis||[], max=Math.max(1,...list.map(x=>Number(x.total)||0)); $("#profileList").innerHTML=list.length?list.map(p=>`<div class="profile-row"><span class="profile-name">${esc(p.perfil)}</span><span class="profile-track"><span class="profile-bar" style="width:${Math.round((Number(p.total)||0)/max*100)}%"></span></span><span class="profile-count">${esc(p.total)} total</span></div>`).join(""):empty("fa-user-shield","Nenhum perfil distribuído.");
}
function empty(i,text){return `<div class="admin-empty"><i class="fas ${i}"></i>${esc(text)}</div>`;}
function render(d){renderKpis(d);renderModules(d);renderHealth(d);renderEvents(d);renderAccess(d);renderRequests(d);renderProfiles(d);const x=$("#lastSync");if(x)x.textContent=`Sincronizado às ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}${d._fallback?" · contingência":""}`;}
function renderError(error){const c=$("#dashboardContent");if(!c)return;c.hidden=false;c.innerHTML=`<div class="admin-load-error"><i class="fas fa-cloud-exclamation"></i><h2>Não foi possível carregar a governança</h2><p>O painel não recebeu os dados do ambiente. A falha foi tratada sem expor informações sensíveis; tente novamente.</p><button id="adminRetry" type="button"><i class="fas fa-rotate"></i> Tentar novamente</button><small>${esc(error?.message||"Falha de comunicação")}</small></div>`;$("#adminRetry")?.addEventListener("click",load);}
async function load(){if(state.loading)return;state.loading=true;const l=$("#loadingContainer"),c=$("#dashboardContent");if(l){l.hidden=false;l.querySelector("strong")?.replaceChildren(document.createTextNode("Atualizando a governança do sistema…"));}if(c)c.hidden=true;try{let r=await Promise.race([supabase.rpc("admin_central_resumo"),new Promise(resolve=>setTimeout(()=>resolve({error:new Error("Tempo limite de atualização atingido.")}),8000))]);let d;if(r.error){const old=await withTimeout(supabase.rpc("admin_dashboard_resumo"), "A consulta administrativa anterior").catch(()=>({error:new Error("RPC anterior indisponível")}));d=!old.error?old.data:await directFallback();notify("O painel foi carregado em modo de contingência.","warning");}else d=Array.isArray(r.data)?(r.data[0]||{}):(r.data||{});render(d);if(c)c.hidden=false;}catch(e){console.error("[admin-central]",e);renderError(e);notify(e.message||"Falha ao carregar o painel.");}finally{if(l)l.hidden=true;state.loading=false;}}
function boot(){
  $("#topbarNome").textContent=state.user.nome||"Administrador";$("#topbarData").textContent=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});$("#avatarIniciais").textContent=(state.user.nome||"AD").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  $("#btnToggleSidebar")?.addEventListener("click",()=>$("#sidebar")?.classList.toggle("aberta"));document.querySelectorAll("[data-scroll-target]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();document.getElementById(a.dataset.scrollTarget)?.scrollIntoView({behavior:"smooth"});$("#sidebar")?.classList.remove("aberta");}));$("#btnRefresh")?.addEventListener("click",load);$("#btnSair")?.addEventListener("click",async()=>{await supabase.auth.signOut();location.href="/intranet.html";});
}
(async()=>{try{state.user=await getAdminUser();boot();await load();}catch(e){console.error("[admin-central-auth]",e);$("#loadingContainer")?.setAttribute("hidden","");renderError(e);notify(e.message||"Acesso não autorizado.");}})();
