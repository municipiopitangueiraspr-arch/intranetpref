import { supabase } from "/shared/js/supabase.js";
const $=s=>document.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const fmt=v=>v?new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—";
async function boot(){
  try{
    const {data:sd,error:se}=await supabase.auth.getSession();if(se||!sd?.session)throw Error("Sessão administrativa não encontrada.");
    const {data:u,error:ue}=await supabase.from("usuarios").select("nome,email,perfil,ativo").eq("uuid",sd.session.user.id).maybeSingle();if(ue)throw ue;if(!u||u.ativo===false||u.perfil!=="ADMIN")throw Error("Acesso restrito ao perfil ADMIN.");
    $("#topbarNome").textContent=u.nome||"Administrador";$("#topbarData").textContent=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});$("#avatarIniciais").textContent=(u.nome||"AD").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
    $("#btnToggleSidebar")?.addEventListener("click",()=>$("#sidebar")?.classList.toggle("aberta"));$("#btnSair")?.addEventListener("click",async()=>{await supabase.auth.signOut();location.href="/intranet.html"});$("#btnAtualizar")?.addEventListener("click",load);
    await load();
  }catch(e){console.error(e);$("#loadingAudit").innerHTML=`<div class="lista-vazia"><i class="fas fa-triangle-exclamation"></i> ${esc(e.message||"Não foi possível carregar a auditoria.")}</div>`;}
}
async function load(){const loading=$("#loadingAudit"),wrap=$("#auditTableWrap");loading.hidden=false;wrap.hidden=true;try{let {data,error}=await supabase.rpc("admin_central_resumo");if(error)throw error;const d=Array.isArray(data)?data[0]:data;const rows=d?.auditoria?.eventos_recentes||[];$("#auditBody").innerHTML=rows.length?rows.map(e=>`<tr><td><strong>${esc(e.operacao||"Evento")}</strong><small>#${esc(e.id||"")}</small></td><td><span class="status-badge">${esc(e.entidade||"Sistema")}</span><small>${esc(e.entidade_id||"")}</small></td><td>${esc(e.ator_nome||"Sistema")}</td><td>${esc(e.origem||"Aplicação")}</td><td>${esc(fmt(e.ocorrido_em))}</td></tr>`).join(""):`<tr><td colspan="5"><div class="lista-vazia"><i class="fas fa-inbox"></i> Nenhum evento registrado.</div></td></tr>`;wrap.hidden=false;}catch(e){$("#auditBody").innerHTML=`<tr><td colspan="5"><div class="lista-vazia"><i class="fas fa-triangle-exclamation"></i> ${esc(e.message||"Falha ao carregar eventos.")}</div></td></tr>`;wrap.hidden=false;}finally{loading.hidden=true;}}
boot();
