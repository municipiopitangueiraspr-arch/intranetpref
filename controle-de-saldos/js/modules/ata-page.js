import { supabase } from "../supabase.js";
import { carregarUsuario } from "../../../shared/js/layout.js?v=20261010-shared-shell-1";
const PERFIS_ESCOPO_GLOBAL = new Set(["ADMIN", "PREFEITO"]);
const usuarioTemEscopoGlobal = (usuario) => PERFIS_ESCOPO_GLOBAL.has(String(usuario?.perfil || "").toUpperCase());
const ataPodeOperar = () => true;
const mensagemAcessoAta = () => "";

const state = { ata: null, usuario: null, pedidos: [], charts: new Map(), operational: new Map(), carrinho: [] };
const $ = (id) => document.getElementById(id);
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (value) => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const date = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const escapeHtml = (value) => String(value ?? "—").replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const truncate = (value, length = 50) => { const text = String(value ?? "").trim(); return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text; };
const formatCnpj = (value) => { const d = String(value || "").replace(/\D/g, ""); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : value || "—"; };
const showToast = (message) => { const el = $("toastContainer"); if (!el) return; el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2600); };
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const consumedQty = (item) => Math.max(0, Number(item.quantidade_contratada || 0) - Number(item.saldo_quantidade || 0));
const consumedValue = (item) => consumedQty(item) * Number(item.valor_unitario || 0);
const statusClass = (percent) => percent >= 90 ? "danger" : percent >= 70 ? "warning" : "";

function initials(nome) {
  const parts = String(nome || "?").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase() : (parts[0] || "?").slice(0, 2).toUpperCase();
}

async function initHallHeader() {
  const usuario = await carregarUsuario(supabase);
  if (!usuario) return null;
  window.usuarioLogado = usuario;

  const name = $("saudacaoMiniNome");
  const menuName = $("menuNome");
  const menuEmail = $("menuEmail");
  const avatar = $("avatarIniciais");
  if (name) name.textContent = usuario.nome || "Usuário";
  if (menuName) menuName.textContent = usuario.nome || "Usuário";
  if (menuEmail) menuEmail.textContent = usuario.email || "—";
  if (avatar) {
    avatar.textContent = initials(usuario.nome);
    if (usuario.foto_url) {
      avatar.innerHTML = `<img src="${escapeHtml(usuario.foto_url)}" alt="Foto de ${escapeHtml(usuario.nome || "usuário")}">`;
    }
  }

  const button = $("avatarBtn");
  const menu = $("avatarMenu");
  const closeMenu = () => {
    if (!menu || !button) return;
    menu.setAttribute("aria-hidden", "true");
    menu.classList.remove("aberto");
    button.setAttribute("aria-expanded", "false");
  };
  button?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = menu?.getAttribute("aria-hidden") === "false";
    if (!menu || !button) return;
    menu.setAttribute("aria-hidden", open ? "true" : "false");
    menu.classList.toggle("aberto", !open);
    button.setAttribute("aria-expanded", String(!open));
  });
  document.addEventListener("click", (event) => {
    if (menu && !menu.contains(event.target) && !button?.contains(event.target)) closeMenu();
  });
  $("menuSair")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "../index.html";
  });
  return usuario;
}

function loadCart() { try { state.carrinho = JSON.parse(localStorage.getItem("carrinhoAtas") || "[]"); } catch { state.carrinho = []; } }
function saveCart() { localStorage.setItem("carrinhoAtas", JSON.stringify(state.carrinho)); }
function cartEntry(item) { return state.carrinho.find((entry) => String(entry.ataId) === String(state.ata?.id) && String(entry.itemId) === String(item.id)); }
function cartCount() { return state.carrinho.reduce((sum, entry) => sum + Number(entry.quantidade || 0), 0); }
function renderCartFab() {
  const fab = $("ataCartFab"); const badge = $("ataCartBadge");
  if (!fab || !badge) return;
  const count = cartCount();
  badge.textContent = number(count);
  badge.hidden = count <= 0;
  fab.setAttribute("aria-label", count > 0 ? `Abrir carrinho com ${number(count)} itens` : "Abrir carrinho vazio");
  renderCartDrawer();
}
function renderCartDrawer() {
  const list = $("ataCartDrawerItems"); const total = $("ataCartDrawerTotal");
  if (!list || !total) return;
  const items = state.carrinho;
  if (!items.length) {
    list.innerHTML = '<div class="ata-cart-empty"><i class="fas fa-cart-shopping"></i><p>Seu carrinho está vazio.</p><small>Adicione itens pela tabela desta ata.</small></div>';
    total.textContent = "0 itens";
    return;
  }
  list.innerHTML = items.map((entry) => `<div class="ata-cart-drawer-item"><div><strong>${escapeHtml(entry.itemDescricao || "Item")}</strong><small>Item ${escapeHtml(entry.itemNumero || "—")} · ${number(entry.quantidade)} un.</small></div><b>${money(Number(entry.quantidade || 0) * Number(entry.valorUnitario || 0))}</b></div>`).join("");
  total.textContent = `${number(cartCount())} itens`;
}
function toggleCartDrawer(open) {
  const drawer = $("ataCartDrawer"); const overlay = $("ataCartDrawerOverlay");
  if (!drawer || !overlay) return;
  drawer.classList.toggle("is-open", open); overlay.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
}
function addToCart(item, requestedQuantity = 1) {
  const ata = state.ata;
  // Todos os usuários podem operar qualquer ata; o escopo é analítico.
  const saldo = Math.max(0, Number(item.saldo_quantidade || 0));
  const current = cartEntry(item);
  const alreadyInCart = Number(current?.quantidade || 0);
  const requested = Number(requestedQuantity);
  if (!Number.isFinite(requested) || requested <= 0) { showToast("Informe uma quantidade válida."); return; }
  const quantity = Math.min(requested, Math.max(0, saldo - alreadyInCart));
  if (quantity <= 0) { showToast("A quantidade disponível deste item já está no carrinho."); return; }
  if (current) current.quantidade = alreadyInCart + quantity;
  else state.carrinho.push({ id: `${ata.id}-${item.id}-${Date.now()}`, ataId: ata.id, ataNumero: ata.numero_ata, fornecedorId: ata.fornecedor_id, fornecedorRazao: ata.fornecedor?.razao_social, fornecedorCnpj: ata.fornecedor?.cnpj, itemId: item.id, itemNumero: item.item_numero, itemDescricao: item.descricao, quantidade: quantity, valorUnitario: Number(item.valor_unitario || 0), valorTotal: Number(item.valor_unitario || 0) * quantity, data: new Date().toISOString().slice(0, 10), solicitante: state.usuario?.nome, orgaoId: state.usuario?.orgao_id });
  saveCart(); renderCartFab(); showToast(quantity < requested ? `Quantidade ajustada para ${number(quantity)} disponível.` : `${number(quantity)} item(ns) adicionado(s) ao carrinho.`);
}

async function loadAta(ataId) {
  const { data, error } = await supabase.from("atas").select("*, fornecedor:fornecedores(razao_social,cnpj), itens:itens_ata!fk_item_ata(*), categoria:categorias(id,nome)").eq("id", ataId).single();
  if (error) throw error;
  return data;
}

async function loadPedidos(ataId) {
  const { data, error } = await supabase.from("pedidos").select("id,numero_pedido,status_aprovacao,created_at,data_solicitacao,orgao_solicitante_id,valor_total,unidade_id").eq("ata_id", ataId).order("created_at", { ascending: false }).limit(250);
  if (error) { console.warn("Não foi possível carregar pedidos da ata:", error); return []; }
  return data || [];
}

function getDaysRemaining(endDate) { if (!endDate) return null; const end = new Date(`${endDate}T23:59:59`); return Math.ceil((end - new Date()) / 86400000); }
async function loadAtaDecisionData(ataId) {
  const [{ data: consumos, error: consumoError }, { data: eventos, error: eventosError }] = await Promise.all([
    supabase.from("consumos").select("id,item_ata_id,quantidade,valor_unitario,valor_total,data_consumo").eq("ata_id", ataId).order("data_consumo", { ascending: false }).limit(5000),
    supabase.from("pedidos_eventos").select("id,pedido_id,status_anterior,status_novo,ocorrido_em,evento").in("pedido_id", state.pedidos.map((p) => p.id)).order("ocorrido_em", { ascending: false }).limit(5000),
  ]);
  return { consumos: consumoError ? [] : (consumos || []), eventos: eventosError ? [] : (eventos || []) };
}

function renderDecisionPanel(ata, pedidos, totals, operational) {
  const target = $("ataDecisionPanel"); if (!target) return;
  const items = ata.itens || [];
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const days = getDaysRemaining(ata.data_fim_vigencia);
  const registered = (operational.consumos || []).reduce((s, c) => s + Number(c.valor_total || (Number(c.quantidade || 0) * Number(c.valor_unitario || 0))), 0);
  const pending = pedidos.filter((p) => String(p.status_aprovacao || "").toUpperCase() === "AGUARDANDO_APROVACAO");
  const pendingValue = pending.reduce((s, p) => s + Number(p.valor_total || 0), 0);
  const exhausted = items.filter((i) => Number(i.saldo_quantidade || 0) <= 0).length;
  const critical = items.filter((i) => Number(i.quantidade_contratada || 0) > 0 && Number(i.saldo_quantidade || 0) > 0 && Number(i.saldo_quantidade || 0) / Number(i.quantidade_contratada || 1) <= .10).length;
  const governance = [
    ["Gestor", ata.gestor_id], ["Fiscal", ata.fiscal_id], ["Órgão responsável", ata.orgao_responsavel_id], ["Ato de designação", ata.ato_designacao && ata.data_designacao],
  ];
  const missing = governance.filter(([, value]) => !value).map(([label]) => label);
  const priority = [];
  if (days !== null && days < 0) priority.push(`<li data-level="critical"><strong>Crítica</strong><span>Ata vencida há ${Math.abs(days)} dia(s).</span></li>`);
  else if (days !== null && days <= 30) priority.push(`<li data-level="high"><strong>Alta</strong><span>Vence em ${days} dia(s); iniciar plano de continuidade.</span></li>`);
  if (exhausted) priority.push(`<li data-level="high"><strong>Alta</strong><span>${exhausted} item(ns) sem saldo disponível.</span></li>`);
  if (critical) priority.push(`<li data-level="high"><strong>Alta</strong><span>${critical} item(ns) em pré-ruptura, com até 10% de saldo.</span></li>`);
  if (pending.length) priority.push(`<li data-level="high"><strong>Alta</strong><span>${pending.length} pedido(s) aguardando aprovação, total de ${money(pendingValue)}.</span></li>`);
  if (missing.length) priority.push(`<li data-level="medium"><strong>Média</strong><span>Governança pendente: ${escapeHtml(missing.join(", "))}.</span></li>`);
  if (!priority.length) priority.push('<li data-level="info"><strong>Informativa</strong><span>Nenhuma prioridade crítica identificada.</span></li>');
  const statusMov = registered > 0 ? `Há ${money(registered)} em consumo efetivamente registrado.` : "Não há consumo efetivamente registrado para esta ata.";
  target.innerHTML = `<div class="ata-decision__head"><div><span class="ata-page__eyebrow ata-page__eyebrow--dark">DECISÃO E CONTROLE</span><h2>Leitura acionável da ata</h2><p>${statusMov} A utilização estimada abaixo é calculada por saldo físico informado.</p></div><span class="ata-decision__source">${operational.eventos.length} evento(s) de decisão</span></div><div class="ata-decision__kpis"><div><span>Consumo registrado</span><strong>${money(registered)}</strong></div><div><span>Utilização estimada</span><strong>${money(totals.consumed)}</strong></div><div><span>Pedidos pendentes</span><strong>${pending.length} · ${money(pendingValue)}</strong></div><div><span>Saldo disponível</span><strong>${money(totals.balance)}</strong></div><div><span>Itens sem saldo</span><strong>${exhausted}</strong></div><div><span>Itens críticos</span><strong>${critical}</strong></div></div><div class="ata-decision__grid"><section><h3><i class="fas fa-list-check"></i> Próximas ações</h3><ul>${priority.join("")}</ul></section><section><h3><i class="fas fa-user-shield"></i> Governança da ata</h3><ul class="ata-governance-list">${governance.map(([label, value]) => `<li><span>${label}</span><strong class="${value ? "ok" : "pending"}">${value ? "Cadastrado" : "Pendente"}</strong></li>`).join("")}</ul></section></div><p class="ata-decision__formula"><strong>Fórmulas:</strong> utilização estimada = valor contratado dos itens − saldo informado; consumo registrado = soma de <code>consumos.valor_total</code>; saldo disponível = saldo físico dos itens × preço unitário. Os indicadores não substituem a conferência do documento contratual.</p></div>`;
}

function renderHero(ata) {
  const days = getDaysRemaining(ata.data_fim_vigencia);
  const situacao = ata.situacao || (days !== null && days < 0 ? "VENCIDA" : "ATIVA");
  setText("ataTitulo", `Saúde da Ata nº ${ata.numero_ata || "—"}`);
  setText("ataNumero", ata.numero_ata); setText("ataFornecedor", ata.fornecedor?.razao_social || "Fornecedor não informado");
  setText("ataVigencia", `${date(ata.data_inicio_vigencia)} até ${date(ata.data_fim_vigencia)}`);
  setText("ataStatus", situacao); setText("ataDiasRestantes", days === null ? "Prazo não informado" : days < 0 ? `Vencida há ${Math.abs(days)} dias` : days === 0 ? "Vence hoje" : `${days} dias restantes`);
}

function renderKpis(ata) {
  const items = ata.itens || [];
  const global = items.reduce((sum, item) => sum + Number(item.valor_total || 0), 0) || Number(ata.valor_global || 0);
  const consumed = items.reduce((sum, item) => sum + consumedValue(item), 0);
  const balance = Math.max(0, items.reduce((sum, item) => sum + Number(item.saldo_quantidade || 0) * Number(item.valor_unitario || 0), 0) || global - consumed);
  const percent = global > 0 ? Math.min(100, consumed / global * 100) : 0;
  const comfortable = items.filter(i => consumedQty(i) / Math.max(Number(i.quantidade_contratada || 1), 1) < .7 && Number(i.saldo_quantidade || 0) > 0).length;
  const critical = items.filter(i => consumedQty(i) / Math.max(Number(i.quantidade_contratada || 1), 1) >= .7 && Number(i.saldo_quantidade || 0) > 0).length;
  const exhausted = items.filter(i => Number(i.saldo_quantidade || 0) <= 0).length;
  setText("ataValorGlobal", money(global)); setText("ataConsumido", money(consumed)); setText("ataSaldo", money(balance)); setText("ataTotalItensResumo", items.length);
  setText("ataTotalItens", items.length); setText("ataItensConfortaveis", comfortable); setText("ataItensCriticos", critical); setText("ataItensEsgotados", exhausted); setText("ataUtilizacaoLabel", `${percent.toFixed(1).replace('.', ',')}% utilizado`);
  const bar = $("ataUtilizacaoBar"); if (bar) { bar.style.width = `${percent}%`; bar.dataset.level = statusClass(percent); }
  setText("ataResumoFornecedor", ata.fornecedor?.razao_social || "—"); setText("ataResumoCnpj", formatCnpj(ata.fornecedor?.cnpj)); setText("ataResumoVigencia", `${date(ata.data_inicio_vigencia)} até ${date(ata.data_fim_vigencia)}`); setText("ataResumoValor", money(global)); setText("ataResumoSaldo", money(balance));
  return { global, consumed, balance, percent };
}

function renderSummary(ata) { setText("summaryFornecedor", ata.fornecedor?.razao_social || "—"); setText("summaryCnpj", formatCnpj(ata.fornecedor?.cnpj)); setText("summaryPregao", ata.numero_pregao || ata.pregao_numero || "—"); setText("summaryCategoria", ata.categoria?.nome || "—"); }
function renderMostConsumed(items) {
  const sorted = [...items].sort((a,b) => consumedQty(b) - consumedQty(a)).slice(0, 5); const max = Math.max(...sorted.map(consumedQty), 1);
  const html = sorted.length ? sorted.map((item, index) => { const percent = Number(item.quantidade_contratada) ? consumedQty(item) / Number(item.quantidade_contratada) * 100 : 0; return `<div class="ata-ranked-item"><span class="ata-rank">${index + 1}</span><div><div class="ata-item-name">${escapeHtml(truncate(item.descricao, 50))}</div><div class="ata-mini-track"><span style="width:${Math.min(100, consumedQty(item) / max * 100)}%"></span></div><div class="ata-item-meta">Item ${escapeHtml(item.item_numero)} · ${number(consumedQty(item))} ${escapeHtml(item.unidade_medida || "un.")} consumidos</div></div><strong class="ata-item-value">${percent.toFixed(1).replace('.', ',')}%</strong></div>`; }).join("") : '<p class="ata-panel-note">Nenhum item cadastrado.</p>';
  ["ataRankingItens", "ataItensMaisConsumidos"].forEach(id => { if ($(id)) $(id).innerHTML = html; });
}
function orderValue(order) { return Number(order.valor_total || 0) || (order.itens || []).reduce((sum, item) => sum + Number(item.valor_total || 0), 0); }
function isConfirmed(order) { return ["APROVADO", "PEDIDO_REALIZADO", "EM_SEPARACAO", "ENTREGUE", "ENCERRADO", "CONFIRMADO"].includes(String(order.status_aprovacao || "").toUpperCase()); }

function drawChart(key, canvas, type, labels, datasets) {
  if (!window.Chart || !canvas) return; state.charts.get(key)?.destroy();
  state.charts.set(key, new Chart(canvas, { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#edf0f2" } }, x: { grid: { display: false } } } } }));
}
function renderDepartments(pedidos) {
  const scoped = pedidos;
  const groups = new Map(); scoped.forEach(p => { const key = p.orgao_solicitante_id || "sem-orgao"; const row = groups.get(key) || { name: key === "sem-orgao" ? "Órgão não informado" : `Órgão ${key}`, value: 0 }; row.value += orderValue(p); groups.set(key, row); });
  const rows = [...groups.values()].sort((a,b) => b.value - a.value); const chart = $("ataGraficoDepartamentos");
  drawChart("departamentos", chart, "bar", rows.map(r => r.name), [{ data: rows.map(r => r.value), backgroundColor: "#1475d5", borderRadius: 6 }]);
  setText("ataEscopoConsumo", "Exibindo todos os pedidos e consumos relacionados a esta ata.");
  const target = $("ataUltimosRegistros"); if (target) target.innerHTML = scoped.slice(0,5).length ? pedidos.slice(0,5).map(p => `<div class="ata-order"><div><strong>${escapeHtml(p.numero_pedido || `Pedido #${p.id}`)}</strong><span>${date(p.data_solicitacao || p.created_at)} · ${escapeHtml(p.status_aprovacao || "Registrado")}</span></div><strong class="ata-order-value">${money(orderValue(p))}</strong></div>`).join("") : '<p class="ata-panel-note">Nenhum pedido encontrado.</p>';
}
function renderCharts(ata, pedidos, totals) {
  drawChart("consumo", $("ataGraficoConsumo"), "doughnut", ["Consumido", "Saldo"], [{ data: [totals.consumed, totals.balance], backgroundColor: ["#1475d5", "#dbe5ee"], borderWidth: 0 }]);
  const buckets = { Confortável: 0, Atenção: 0, Esgotado: 0 }; (ata.itens || []).forEach(i => { const p = Number(i.quantidade_contratada) ? consumedQty(i) / Number(i.quantidade_contratada) * 100 : 0; buckets[Number(i.saldo_quantidade || 0) <= 0 ? "Esgotado" : p >= 70 ? "Atenção" : "Confortável"]++; });
  drawChart("itens", $("ataGraficoItens"), "doughnut", Object.keys(buckets), [{ data: Object.values(buckets), backgroundColor: ["#159b6b", "#f2a900", "#dc3545"], borderWidth: 0 }]);
  const months = new Map(); pedidos.filter(isConfirmed).forEach(p => { const d = new Date(p.created_at || p.data_solicitacao); if (!Number.isNaN(d.getTime())) { const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; months.set(key, (months.get(key) || 0) + orderValue(p)); }});
  const entries = [...months.entries()].sort(([a],[b]) => a.localeCompare(b)).slice(-8); const empty = $("ataEvolucaoVazia"); if (empty) empty.hidden = entries.length > 0; drawChart("evolucao", $("ataGraficoEvolucao"), "line", entries.map(([k]) => k), [{ data: entries.map(([,v]) => v), borderColor: "#0d5e3a", backgroundColor: "rgba(13,94,58,.12)", fill: true, tension: .35, pointRadius: 3 }]);
}
function renderItems(items) {
  const target = $("itensTableBody");
  const podeOperar = true;
  setText("qtdItens", `${items.length} ${items.length === 1 ? "item" : "itens"}`);
  if (!target) return;
  target.innerHTML = items.map(item => {
    const contracted = Number(item.quantidade_contratada || 0);
    const saldo = Number(item.saldo_quantidade || 0);
    const percent = contracted > 0 ? Math.min(100, consumedQty(item) / contracted * 100) : 0;
    const description = String(item.descricao || "Item sem descrição").trim();
    const hasLongDescription = description.length > 120;
    const shortDescription = hasLongDescription ? `${description.slice(0, 120).trimEnd()}…` : description;
    return `<tr data-item-search="${escapeHtml(`${item.item_numero || ""} ${description}`)}">
      <td><strong>${escapeHtml(item.item_numero || "—")}</strong></td>
      <td class="ata-item-description">
        <strong class="ata-item-description__text" data-description-short>${escapeHtml(shortDescription)}</strong>
        <strong class="ata-item-description__text" data-description-full hidden>${escapeHtml(description)}</strong>
        ${hasLongDescription ? `<button type="button" class="ata-description-toggle" data-description-toggle aria-expanded="false">Ver mais</button>` : ""}
        <small>${escapeHtml(item.unidade_medida || "")}</small>
      </td>
      <td class="numeric">${number(contracted)}</td>
      <td class="numeric"><strong>${number(saldo)}</strong></td>
      <td><div class="ata-item-progress"><div class="ata-item-progress-bar"><span class="${statusClass(percent)}" style="width:${percent}%"></span></div><small>${percent.toFixed(1).replace('.', ',')}% utilizado</small></div></td>
      <td class="numeric">${money(item.valor_unitario)}</td>
      <td class="numeric">${money(item.valor_total)}</td>
      <td><div class="ata-item-actions">${podeOperar ? `<input class="ata-item-quantity" data-item-quantity="${item.id}" type="number" min="0.001" max="${saldo}" step="any" value="1" aria-label="Quantidade do item ${escapeHtml(item.item_numero || "")}" ${saldo <= 0 ? "disabled" : ""}><button type="button" class="ata-add-button" data-add-item="${item.id}" ${saldo <= 0 ? "disabled" : ""}>${saldo <= 0 ? "Esgotado" : "Adicionar"}</button>` : `<button type="button" class="ata-add-button ata-add-button--blocked" disabled title="${escapeHtml(mensagemAcessoAta(state.usuario, state.ata))}"><i class="fas fa-lock"></i> Bloqueado</button>`}</div></td>
    </tr>`;
  }).join("");
}
function wireSearch(items) { $("buscaItens")?.addEventListener("input", e => { const term = e.target.value.toLocaleLowerCase("pt-BR"); const rows = [...document.querySelectorAll("#itensTableBody tr")]; rows.forEach(row => { const searchable = `${row.textContent} ${row.dataset.itemSearch || ""}`.toLocaleLowerCase("pt-BR"); row.hidden = Boolean(term) && !searchable.includes(term); }); const visible = rows.filter(row => !row.hidden).length; setText("contadorItens", term ? `${visible} de ${items.length}` : ""); }); }

async function init() {
  try {
    loadCart();
    state.usuario = await initHallHeader();
    if (!state.usuario) return;
    const ataId = Number(new URLSearchParams(location.search).get("id")); if (!Number.isInteger(ataId) || ataId <= 0) throw new Error("ID da ata inválido");
    state.ata = await loadAta(ataId); state.pedidos = await loadPedidos(ataId); const operational = await loadAtaDecisionData(ataId); renderCartFab(); renderHero(state.ata); const totals = renderKpis(state.ata); renderDecisionPanel(state.ata, state.pedidos, totals, operational); renderMostConsumed(state.ata.itens || []); renderDepartments(state.pedidos); renderCharts(state.ata, state.pedidos, totals); renderItems(state.ata.itens || []); wireSearch(state.ata.itens || []); setText("ataReportEscopo", `Escopo: ${state.usuario.perfil || "usuário"}${ataPodeOperar(state.usuario, state.ata) ? " · ações liberadas" : " · visualização somente"}`); setText("ataReportGeradoEm", `Gerado em: ${new Date().toLocaleString("pt-BR")}`);
    $("loadingContainer").hidden = true; $("ataContent").hidden = false;
  } catch (error) { console.error("Erro ao carregar saúde da ata:", { code:error?.code, message:error?.message, details:error?.details, hint:error?.hint }); $("loadingContainer").hidden = true; $("notFound").hidden = false; setText("erroMensagem", error?.code ? `Não foi possível consultar esta ata (${error.code}).` : "Não foi possível carregar os dados da ata."); }
}

document.addEventListener("click", (event) => {
  const descriptionToggle = event.target.closest("[data-description-toggle]");
  if (descriptionToggle) {
    const cell = descriptionToggle.closest(".ata-item-description");
    const shortText = cell?.querySelector("[data-description-short]");
    const fullText = cell?.querySelector("[data-description-full]");
    const expanded = descriptionToggle.getAttribute("aria-expanded") === "true";
    if (shortText && fullText) {
      const nextExpanded = !expanded;
      shortText.hidden = nextExpanded;
      fullText.hidden = !nextExpanded;
      descriptionToggle.setAttribute("aria-expanded", String(nextExpanded));
      descriptionToggle.textContent = nextExpanded ? "Ver menos" : "Ver mais";
    }
    return;
  }
  const add = event.target.closest("[data-add-item]");
  if (add) {
    const item = (state.ata?.itens || []).find((entry) => String(entry.id) === String(add.dataset.addItem));
    const row = add.closest("tr"); const input = row?.querySelector(`[data-item-quantity="${add.dataset.addItem}"]`);
    if (item) { addToCart(item, input?.value || 1); if (input) input.value = "1"; }
  }
  if (event.target.closest("#ataCartFab")) toggleCartDrawer(true);
  if (event.target.closest("#ataCartDrawerClose, #ataCartDrawerOverlay")) toggleCartDrawer(false);
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") toggleCartDrawer(false); });
window.imprimirRelatorioAta = () => window.print(); window.exportarRelatorioAta = () => window.print();
document.addEventListener("DOMContentLoaded", init);
