import { createClient } from "@supabase/supabase-js";

const supabase = createClient("https://qgkjnzcqjhhqdgxmvtew.supabase.co", "sb_publishable_gbXPIpkbYvf3YKITplkjpg_eKrPHhYw");
const $ = id => document.getElementById(id);
const money = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v || 0));
const number = v => new Intl.NumberFormat("pt-BR").format(Number(v || 0));
const dateBR = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString("pt-BR") : "—";

function defaultDates() {
  const fim = new Date(); const inicio = new Date(fim); inicio.setDate(fim.getDate() - 29);
  $("fim").value = fim.toISOString().slice(0,10); $("inicio").value = inicio.toISOString().slice(0,10);
}
async function sessionGuard() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente na intranet.");
  const { data: user } = await supabase.from("usuarios").select("nome,email,perfil,ativo").eq("uuid", session.user.id).maybeSingle();
  if (!user || user.ativo === false) throw new Error("Usuário sem autorização para acessar o painel.");
  $("userName").textContent = user.nome || "Gestor";
}
async function load() {
  $("loading").hidden = false; $("erro").hidden = true; $("dashboard").hidden = true;
  try { await sessionGuard(); const { data, error } = await supabase.rpc("prefeito_painel_dados", { p_inicio: $("inicio").value, p_fim: $("fim").value }); if (error) throw error; render(data); $("dashboard").hidden = false; }
  catch (e) { console.error(e); $("erroTexto").textContent = e.message || "Verifique sua sessão e tente novamente."; $("erro").hidden = false; }
  finally { $("loading").hidden = true; }
}
function card(label, value, icon, tone = "") { return `<div class="metric ${tone}"><i class="fa-solid ${icon}"></i><strong>${value}</strong><span>${label}</span></div>`; }
function render(data) {
  const b = data.biblioteca || {}, c = data.compras || {};
  $("updated").textContent = `Consultado em ${new Date().toLocaleString("pt-BR")}`;
  $("heroPedidos").textContent = number(c.pedidos_periodo); $("heroEmprestimos").textContent = number(b.emprestimos_periodo); $("heroAlertas").textContent = number((data.alertas || []).length);
  $("bibCards").innerHTML = [card("Livros no acervo",number(b.livros),"fa-book"),card("Exemplares",number(b.exemplares),"fa-layer-group"),card("Leitores ativos",number(b.leitores_ativos),"fa-users"),card("Empréstimos no período",number(b.emprestimos_periodo),"fa-arrow-right-arrow-left"),card("Em atraso",number(b.emprestimos_atrasados),"fa-clock","alert")].join("");
  const totalEx = Number(b.exemplares || 0), disponiveis = Number(b.exemplares_disponiveis || 0), pct = totalEx ? Math.round(disponiveis/totalEx*100) : 0;
  $("bibAvailabilityPct").textContent = `${pct}%`; $("bibAvailabilityBar").style.width = `${pct}%`;
  $("bibInsight").textContent = totalEx ? `O acervo possui ${number(disponiveis)} exemplares disponíveis de ${number(totalEx)}. Há ${number(b.reservas_ativas)} reserva(s) ativa(s) e ${number(b.inventarios_em_execucao)} inventário(s) em execução. Acompanhe atrasos para preservar a disponibilidade do serviço.` : "Ainda não existem dados suficientes de acervo para gerar uma leitura executiva.";
  $("buyCards").innerHTML = [card("Atas vigentes",number(c.atas_ativas),"fa-file-signature"),card("Valor global das atas",money(c.valor_global_atas),"fa-sack-dollar"),card("Saldo financeiro",money(c.saldo_valor),"fa-wallet"),card("Pedidos no período",number(c.pedidos_periodo),"fa-clipboard-list"),card("Ocorrências abertas",number(c.ocorrencias_abertas),"fa-triangle-exclamation","alert")].join("");
  const total = Number(c.pedidos_periodo || 0); $("orderTotal").textContent = `${number(total)} no período`;
  const rows = [["Pendentes",c.pedidos_pendentes,"pending"],["Aprovados",c.pedidos_aprovados,"approved"],["Rejeitados/cancelados",c.pedidos_rejeitados,"rejected"]]; $("orderBars").innerHTML = rows.map(([label,val,tone]) => `<div class="status-row"><span>${label}</span><div class="status-track"><div class="status-fill ${tone}" style="width:${total ? Math.min(100,Number(val)/total*100) : 0}%"></div></div><strong>${number(val)}</strong></div>`).join("");
  $("buyInsight").textContent = `Foram registrados ${number(c.pedidos_periodo)} pedido(s), totalizando ${money(c.valor_pedidos_periodo)} no período. Existem ${number(c.atas_a_vencer_30_dias)} ata(s) com vencimento nos próximos 30 dias e ${number(c.entregas_parciais)} entrega(s) parcial(is).`;
  renderTrend(data.tendencias || []); renderAlerts(data.alertas || []);
}
function renderTrend(items) { const max = Math.max(1,...items.flatMap(x=>[Number(x.emprestimos||0),Number(x.pedidos||0)])); $("trendChart").innerHTML = items.map(x=>`<div class="trend-col"><div class="trend-bar green" title="${x.emprestimos} empréstimos" style="height:${Math.max(3,Number(x.emprestimos||0)/max*100)}%"></div><div class="trend-bar blue" title="${x.pedidos} pedidos" style="height:${Math.max(3,Number(x.pedidos||0)/max*100)}%"></div><small>${x.mes.slice(5)}</small></div>`).join(""); }
function renderAlerts(items) { $("alertsList").innerHTML = items.length ? items.map(a=>`<div class="alert ${Number(a.prioridade)>=3 ? "critical" : ""}"><i class="fa-solid ${Number(a.prioridade)>=3 ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i><div><strong>${escapeHtml(a.titulo)}</strong><span>${escapeHtml(a.mensagem)}</span></div></div>`).join("") : `<div class="empty"><i class="fa-solid fa-circle-check"></i><br>Nenhum alerta executivo ativo para o período.</div>`; }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }

defaultDates(); $("atualizar").onclick = load; $("tentar").onclick = load; load();
