// ============================================
// painel-adm-atos-oficiais.js
// Módulo ES6 - Painel Administrativo de Atos Oficiais
// Versão COM CARDS DE NAVEGAÇÃO E CONFIGURAÇÕES INLINE
// CORRIGIDO: removida referência ao elemento #totalAtosBadge
// ============================================

import { supabase } from "../../supabase.js";

// ========== VARIÁVEIS GLOBAIS ==========
let usuarioAtual = null;
let atos = [];
let orgaos = [];
let usuarios = [];
let tiposAto = [];
let paginaAtualAtos = 1;
let currentRelAtoId = null;
let currentOrgaoGestorId = null;
const itensPorPagina = 5;

// ========== UTILITÁRIOS ==========
function showNotification(type, title, message, duration = 4000) {
  const container = document.getElementById("notificationCenter");
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `notification-toast notification-${type}`;
  toast.innerHTML = `
    <span class="notification-icon">${icons[type]}</span>
    <div class="notification-content">
      <div class="notification-title">${title}</div>
      <div class="notification-message">${message}</div>
    </div>
    <button class="notification-close">✕</button>
  `;
  container.appendChild(toast);
  const closeBtn = toast.querySelector(".notification-close");
  closeBtn.addEventListener("click", () => {
    toast.classList.add("removing");
    setTimeout(() => toast.remove(), 300);
  });
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, duration);
  }
}

function showConfirm(title, message, icon = "⚠️", onConfirm) {
  const modal = document.getElementById("confirmModal");
  document.getElementById("confirmIcon").textContent = icon;
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  const cleanup = () => {
    modal.style.display = "none";
    document
      .getElementById("confirmOkBtn")
      .removeEventListener("click", handleConfirm);
    document
      .getElementById("confirmCancelBtn")
      .removeEventListener("click", handleCancel);
    window.removeEventListener("click", handleClickOutside);
  };
  const handleConfirm = () => {
    cleanup();
    if (typeof onConfirm === "function") onConfirm();
  };
  const handleCancel = () => cleanup();
  const handleClickOutside = (e) => {
    if (e.target === modal) cleanup();
  };
  document
    .getElementById("confirmOkBtn")
    .addEventListener("click", handleConfirm);
  document
    .getElementById("confirmCancelBtn")
    .addEventListener("click", handleCancel);
  window.addEventListener("click", handleClickOutside);
}

function formatarData(data) {
  if (!data) return "-";
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function mostrarLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

function centralizarModal(modalElement) {
  if (modalElement && modalElement.style.display === "flex") {
    modalElement.style.alignItems = "center";
    modalElement.style.justifyContent = "center";
  }
}

// ========== CARGA DE DADOS ==========
async function carregarOrgaosSupabase() {
  const { data, error } = await supabase
    .from("orgaos")
    .select("*")
    .order("nome");
  if (error) showNotification("error", "Erro", error.message);
  orgaos = data || [];
  return orgaos;
}

async function carregarAtosSupabase() {
  const { data, error } = await supabase
    .from("atos_oficiais")
    .select(
      `
      *,
      tipos_ato (id, nome, sigla),
      orgaos (id, nome)
    `,
    )
    .order("created_at", { ascending: false });
  if (error) {
    showNotification("error", "Erro", error.message);
    atos = [];
    return [];
  }
  atos = data.map((ato) => ({
    ...ato,
    tipo_nome: ato.tipos_ato?.nome,
    tipo_sigla: ato.tipos_ato?.sigla,
    orgao_nome: ato.orgaos?.nome,
  }));
  return atos;
}

async function carregarUsuariosSupabase() {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .order("nome");
  if (error) showNotification("error", "Erro", error.message);
  usuarios = data || [];
  return usuarios;
}

async function carregarTiposAtoSupabase() {
  const { data, error } = await supabase
    .from("tipos_ato")
    .select("*")
    .order("ordem", { ascending: true });
  if (error) showNotification("error", "Erro", error.message);
  tiposAto = data || [];
  return tiposAto;
}

// ========== GESTORES ==========
async function carregarGestores(orgaoId) {
  try {
    const { data, error } = await supabase
      .from("gestores_orgaos")
      .select("*")
      .eq("orgao_id", orgaoId)
      .order("data_inicio", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn(`Erro ao carregar gestores do órgão ${orgaoId}:`, err);
    return [];
  }
}

async function obterGestorAtual(orgaoId) {
  try {
    const { data, error } = await supabase
      .from("gestores_orgaos")
      .select("nome_responsavel, cargo_responsavel")
      .eq("orgao_id", orgaoId)
      .is("data_fim", null)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn(`Erro ao buscar gestor atual para órgão ${orgaoId}:`, err);
    return null;
  }
}

async function carregarTodosGestoresAtuais() {
  try {
    const { data, error } = await supabase
      .from("gestores_orgaos")
      .select("orgao_id, nome_responsavel, cargo_responsavel")
      .is("data_fim", null);
    if (error) throw error;
    const map = {};
    if (data) {
      for (const g of data) {
        map[g.orgao_id] = g;
      }
    }
    return map;
  } catch (err) {
    console.warn("Erro ao carregar gestores atuais:", err);
    return {};
  }
}

async function associarGestorAoOrgao(orgaoId, nomeGestor) {
  if (!nomeGestor) return;
  let { data: gestorExistente, error } = await supabase
    .from("gestores_orgaos")
    .select("id")
    .eq("nome_responsavel", nomeGestor)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;

  if (!gestorExistente) {
    const { error: insertError } = await supabase
      .from("gestores_orgaos")
      .insert({
        orgao_id: orgaoId,
        nome_responsavel: nomeGestor,
        data_inicio: new Date().toISOString().split("T")[0],
        data_fim: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (insertError) throw insertError;
  } else {
    const { error: insertError } = await supabase
      .from("gestores_orgaos")
      .insert({
        orgao_id: orgaoId,
        nome_responsavel: nomeGestor,
        data_inicio: new Date().toISOString().split("T")[0],
        data_fim: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (insertError) throw insertError;
  }
}

async function carregarListaGestoresParaDatalist() {
  try {
    const { data, error } = await supabase
      .from("gestores_orgaos")
      .select("nome_responsavel")
      .order("nome_responsavel");
    if (error) throw error;
    const nomes = [...new Set(data.map((g) => g.nome_responsavel))];
    const datalist = document.getElementById("listaGestores");
    if (datalist) {
      datalist.innerHTML = nomes
        .map((nome) => `<option value="${nome.replace(/"/g, "&quot;")}">`)
        .join("");
    }
  } catch (err) {
    console.warn("Erro ao carregar lista de gestores:", err);
  }
}

async function salvarGestor(gestor) {
  const {
    id,
    orgao_id,
    nome_responsavel,
    cargo_responsavel,
    data_inicio,
    data_fim,
    observacao,
  } = gestor;
  try {
    if (id) {
      const { error } = await supabase
        .from("gestores_orgaos")
        .update({
          nome_responsavel,
          cargo_responsavel,
          data_inicio,
          data_fim: data_fim || null,
          observacao,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("gestores_orgaos").insert({
        orgao_id,
        nome_responsavel,
        cargo_responsavel,
        data_inicio,
        data_fim: data_fim || null,
        observacao,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function excluirGestor(id) {
  const { error } = await supabase
    .from("gestores_orgaos")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ========== POPULAR SELECTS ==========
async function popularSelectTiposAto(selectElementId, includeEmpty = true) {
  const select = document.getElementById(selectElementId);
  if (!select) return;
  let options = includeEmpty ? '<option value="">Selecione...</option>' : "";
  for (const tipo of tiposAto) {
    if (tipo.ativo !== false) {
      options += `<option value="${tipo.id}">${tipo.nome} (${tipo.sigla})</option>`;
    }
  }
  select.innerHTML = options;
}

async function popularSelectOrgaos(selectElementId, includeEmpty = true) {
  const select = document.getElementById(selectElementId);
  if (!select) return;
  let options = includeEmpty ? '<option value="">Selecione...</option>' : "";
  for (const org of orgaos) {
    options += `<option value="${org.id}">${org.nome}</option>`;
  }
  select.innerHTML = options;
}

// ========== SUGESTÃO DE PRÓXIMO NÚMERO ==========
async function sugerirProximoNumeroAto(tipoId, ano) {
  if (!tipoId || !ano) return null;
  try {
    const { data, error } = await supabase
      .from("atos_oficiais")
      .select("numero")
      .eq("tipo_id", parseInt(tipoId))
      .eq("ano", parseInt(ano))
      .order("numero", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) return data[0].numero + 1;
    return 1;
  } catch (err) {
    console.error("Erro ao buscar último número:", err);
    return null;
  }
}

function setupSugestaoNumero() {
  const tipoSelect = document.getElementById("tipoAto");
  const anoInput = document.getElementById("anoAto");
  const numeroInput = document.getElementById("numeroAto");
  if (!tipoSelect || !anoInput || !numeroInput) return;
  async function atualizarSugestao() {
    const tipoId = tipoSelect.value;
    const ano = anoInput.value;
    const atoId = document.getElementById("atoId").value;
    if (atoId) return;
    if (!tipoId || !ano) {
      numeroInput.placeholder = "Nº";
      return;
    }
    const sugestao = await sugerirProximoNumeroAto(tipoId, ano);
    numeroInput.placeholder =
      sugestao !== null ? `Nº (sugestão: ${sugestao})` : "Nº";
  }
  tipoSelect.addEventListener("change", atualizarSugestao);
  anoInput.addEventListener("input", atualizarSugestao);
}

// ========== RENDERIZAÇÃO DASHBOARD ==========
function atualizarDashboard() {
  document.getElementById("statTotalAtos").textContent = atos.length;
  document.getElementById("statVigentes").textContent = atos.filter(
    (a) => a.status === "Vigente",
  ).length;
  document.getElementById("statRevogados").textContent = atos.filter(
    (a) => a.status === "Revogado",
  ).length;
  document.getElementById("statAlterados").textContent = atos.filter(
    (a) => a.status === "Alterado",
  ).length;
  // O elemento totalAtosBadge foi removido (sidebar não existe mais)
  // document.getElementById("totalAtosBadge").textContent = atos.length; // removido

  const recentes = [...atos]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);
  const tbody = document.querySelector("#tableAtosRecentes tbody");
  if (!recentes.length)
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">Nenhum ato cadastrado. <tr>';
  else
    tbody.innerHTML = recentes
      .map(
        (ato) => `
    <tr class="${ato.status === "Revogado" ? "row-revogado" : ""}">
      <td><strong>${ato.tipo_sigla || "?"}</strong></td>
      <td>${ato.numero}/${ato.ano}</td>
      <td>${ato.orgao_nome}</td>
      <td><span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span></td>
      <td>${formatarData(ato.data_publicacao)}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="visualizarAto(${ato.id})">👁️</button>
        ${usuarioAtual?.perfil === "ADMIN" || usuarioAtual?.perfil === "SECRETARIO" ? `<button class="btn btn-sm btn-outline" onclick="editarAto(${ato.id})">✏️</button>` : ""}
        <button class="btn btn-sm btn-outline" onclick="gerenciarRelacionamentos(${ato.id})">🔗</button>
      </td>
    </tr>
  `,
      )
      .join("");
}

// ========== RENDERIZAÇÃO DAS TABELAS DE CONFIGURAÇÃO (INLINE) ==========
function renderizarTiposAtoInline() {
  const tbody = document.getElementById("tableTiposAtoBodyInline");
  if (!tiposAto.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Nenhum tipo cadastrado. </tr>';
    return;
  }
  tbody.innerHTML = tiposAto
    .map(
      (t) => `
    <tr>
      <td>${t.nome}</td>
      <td>${t.sigla}</td>
      <td>${t.ordem || 0}</td>
      <td>${t.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="editarTipoAto(${t.id})">✏️</button>
        <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirTipoAto(${t.id})">🗑️</button>
      </td>
    </tr>
  `,
    )
    .join("");
}

async function renderizarOrgaosInline() {
  const tbody = document.getElementById("tableOrgaosBodyInline");
  if (!orgaos.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Nenhum órgão cadastrado. <tr>';
    return;
  }
  const gestoresMap = await carregarTodosGestoresAtuais();
  let html = "";
  for (const o of orgaos) {
    const gestor = gestoresMap[o.id];
    const gestorDisplay = gestor
      ? `${gestor.nome_responsavel} (${gestor.cargo_responsavel || "Sem cargo"})`
      : "—";
    html += `
      <tr>
        <td>${o.nome}</td>
        <td>${o.sigla || "-"}</td>
        <td>${gestorDisplay}</td>
        <td>${o.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
        <td class="acoes-cell">
          <button class="btn btn-sm btn-outline" onclick="editarOrgao(${o.id})">✏️</button>
          <button class="btn btn-sm btn-outline" onclick="gerenciarGestores(${o.id}, '${o.nome.replace(/'/g, "\\'")}')">👥 Gestores</button>
          <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirOrgao(${o.id})">🗑️</button>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function renderizarUsuariosInline() {
  const tbody = document.getElementById("tableUsuariosBodyInline");
  if (!usuarios.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">Nenhum usuário cadastrado. </tr>';
    return;
  }
  tbody.innerHTML = usuarios
    .map(
      (u) => `
    <tr>
      <td>${u.nome}</td>
      <td>${u.email}</td>
      <td><span class="badge-perfil perfil-${(u.perfil || "").toLowerCase()}">${u.perfil || "N/A"}</span></td>
      <td>${u.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
      <td>${u.ultimo_login ? formatarData(u.ultimo_login.split("T")[0]) : "-"}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="editarUsuario(${u.id})">✏️</button>
        <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirUsuario(${u.id})">🗑️</button>
      </td>
    </tr>
  `,
    )
    .join("");
}

// ========== CONFIGURAÇÃO DAS ABAS INTERNAS DE CONFIGURAÇÕES ==========
function initConfigTabs() {
  const tabs = document.querySelectorAll(".config-tab");
  const panels = document.querySelectorAll(".config-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      panels.forEach((panel) => (panel.style.display = "none"));
      const activePanel = document.getElementById(
        `config${target.charAt(0).toUpperCase() + target.slice(1)}Panel`,
      );
      if (activePanel) activePanel.style.display = "block";
      // Recarregar dados conforme a aba selecionada
      if (target === "tipos") renderizarTiposAtoInline();
      else if (target === "orgaos") renderizarOrgaosInline();
      else if (target === "usuarios") renderizarUsuariosInline();
    });
  });
}

// ========== FILTROS E LISTAGEM DE ATOS ==========
function filtrarAtos() {
  const tipo = document.getElementById("filtroTipo")?.value || "";
  const ano = document.getElementById("filtroAno")?.value || "";
  const orgao = document.getElementById("filtroOrgao")?.value || "";
  const status = document.getElementById("filtroStatus")?.value || "";
  const busca = (document.getElementById("filtroBusca")?.value || "")
    .toLowerCase()
    .trim();
  return atos.filter((ato) => {
    if (tipo && ato.tipo_id !== parseInt(tipo)) return false;
    if (ano && ato.ano !== parseInt(ano)) return false;
    if (orgao && ato.orgao_id !== parseInt(orgao)) return false;
    if (status && ato.status !== status) return false;
    if (busca) {
      return (
        ato.numero.toString().includes(busca) ||
        ato.ano.toString().includes(busca) ||
        ato.ementa.toLowerCase().includes(busca) ||
        (ato.texto_completo || "").toLowerCase().includes(busca) ||
        (ato.palavras_chave || []).some((tag) =>
          tag.toLowerCase().includes(busca),
        )
      );
    }
    return true;
  });
}

function carregarListaAtos() {
  let resultado = filtrarAtos();
  document.getElementById("totalRegistros").textContent =
    `Total: ${resultado.length} registro(s)`;
  const totalPaginas = Math.ceil(resultado.length / itensPorPagina) || 1;
  if (paginaAtualAtos > totalPaginas) paginaAtualAtos = totalPaginas;
  const inicio = (paginaAtualAtos - 1) * itensPorPagina;
  const paginaDados = resultado.slice(inicio, inicio + itensPorPagina);
  const tbody = document.getElementById("tableAtosBody");
  if (!paginaDados.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="7">Nenhum ato encontrado. <tr>';
  } else {
    tbody.innerHTML = paginaDados
      .map(
        (ato) => `
      <tr class="${ato.status === "Revogado" ? "row-revogado" : ""}">
        <td><strong>${ato.tipo_sigla || "?"}</strong></td>
        <td>${ato.numero}/${ato.ano}</td>
        <td>${ato.orgao_nome}</td>
        <td>${ato.ementa.length > 60 ? ato.ementa.substring(0, 60) + "..." : ato.ementa}</td>
        <td><span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span></td>
        <td>${formatarData(ato.data_publicacao)}</td>
        <td class="acoes-cell">
          <button class="btn btn-sm btn-outline" onclick="visualizarAto(${ato.id})">👁️</button>
          ${usuarioAtual?.perfil === "ADMIN" || usuarioAtual?.perfil === "SECRETARIO" ? `<button class="btn btn-sm btn-outline" onclick="editarAto(${ato.id})">✏️</button>` : ""}
          <button class="btn btn-sm btn-outline" onclick="gerenciarRelacionamentos(${ato.id})">🔗</button>
          <button class="btn btn-sm btn-outline" onclick="abrirAnexosModal(${ato.id})">📎</button>
          <button class="btn btn-sm btn-outline" onclick="abrirHistoricoModal(${ato.id})">📜</button>
          ${usuarioAtual?.perfil === "ADMIN" ? `<button class="btn btn-sm btn-outline btn-excluir" onclick="confirmarExcluirAto(${ato.id})">🗑️</button>` : ""}
        </td>
      </tr>
    `,
      )
      .join("");
  }
  const btnAnt = document.getElementById("btnPagAnterior");
  const btnProx = document.getElementById("btnPagProximo");
  if (btnAnt) btnAnt.disabled = paginaAtualAtos <= 1;
  if (btnProx) btnProx.disabled = paginaAtualAtos >= totalPaginas;
  const pageSpan = document.getElementById("pageInfoAtos");
  if (pageSpan)
    pageSpan.textContent = `Página ${paginaAtualAtos} de ${totalPaginas}`;
  if (btnAnt)
    btnAnt.onclick = () => {
      if (paginaAtualAtos > 1) {
        paginaAtualAtos--;
        carregarListaAtos();
      }
    };
  if (btnProx)
    btnProx.onclick = () => {
      if (paginaAtualAtos < totalPaginas) {
        paginaAtualAtos++;
        carregarListaAtos();
      }
    };
}

function aplicarFiltros() {
  paginaAtualAtos = 1;
  carregarListaAtos();
}
function limparFiltros() {
  [
    "filtroTipo",
    "filtroAno",
    "filtroOrgao",
    "filtroStatus",
    "filtroBusca",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  aplicarFiltros();
}
function atualizarFiltrosAnoOrgao() {
  const anos = [...new Set(atos.map((a) => a.ano))].sort((a, b) => b - a);
  const selectAno = document.getElementById("filtroAno");
  if (selectAno)
    selectAno.innerHTML =
      '<option value="">Todos</option>' +
      anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  const selectOrgao = document.getElementById("filtroOrgao");
  if (selectOrgao)
    selectOrgao.innerHTML =
      '<option value="">Todos</option>' +
      orgaos.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("");
}

// ========== CRUD ATOS ==========
async function salvarAto() {
  const tipo = document.getElementById("tipoAto")?.value;
  const numero = parseInt(document.getElementById("numeroAto")?.value);
  const ano = parseInt(document.getElementById("anoAto")?.value);
  const orgao = parseInt(document.getElementById("orgaoAto")?.value);
  const dataPub = document.getElementById("dataPublicacao")?.value;
  const ementa = document.getElementById("ementaAto")?.value.trim();
  if (!tipo || !numero || !ano || !orgao || !dataPub || !ementa) {
    showNotification(
      "error",
      "Campos obrigatórios",
      "Preencha todos os campos.",
    );
    return;
  }
  const atoId = document.getElementById("atoId")?.value;
  const palavrasChave = [];
  document
    .querySelectorAll("#tagsList .tag-item")
    .forEach((el) =>
      palavrasChave.push(el.textContent.replace("×", "").trim()),
    );
  const dadosAto = {
    tipo_id: parseInt(tipo),
    numero: numero,
    ano: ano,
    orgao_id: orgao,
    ementa: ementa,
    texto_completo:
      document.getElementById("textoCompletoEditor")?.innerHTML || "",
    status: document.getElementById("statusAto")?.value,
    data_publicacao: dataPub,
    data_vigencia: dataPub,
    palavras_chave: palavrasChave,
    observacoes: document.getElementById("observacoesAto")?.value || "",
    nome_diario: document.getElementById("nomeDiario")?.value || "",
    edicao_diario: document.getElementById("edicaoDiario")?.value || "",
    pagina_diario: document.getElementById("paginaDiario")?.value || "",
    link_diario: document.getElementById("linkDiario")?.value || "",
    pdf_url: `/storage/pdfs/temp-${Date.now()}.pdf`,
    doc_url: document.getElementById("docUpload")?.files.length
      ? `/storage/docs/temp-${Date.now()}.docx`
      : "",
  };
  mostrarLoading(true);
  try {
    if (atoId) {
      const { error } = await supabase
        .from("atos_oficiais")
        .update({
          ...dadosAto,
          usuario_atualizacao_id: usuarioAtual.id,
          updated_at: new Date().toISOString(),
          versao: (atos.find((a) => a.id === parseInt(atoId))?.versao || 1) + 1,
        })
        .eq("id", parseInt(atoId));
      if (error) throw error;
      showNotification("success", "Atualizado", `Ato atualizado.`);
      await carregarAtosSupabase();
    } else {
      const { error } = await supabase.from("atos_oficiais").insert({
        ...dadosAto,
        usuario_cadastro_id: usuarioAtual.id,
        usuario_atualizacao_id: usuarioAtual.id,
        versao: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      showNotification("success", "Criado", `Ato cadastrado.`);
      await carregarAtosSupabase();
    }
    closeAtoModal();
    await recarregarTudo();
  } catch (err) {
    console.error(err);
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}

async function confirmarExcluirAto(id) {
  const ato = atos.find((a) => a.id === id);
  if (!ato) return;
  showConfirm(
    "Excluir ato",
    `Excluir ${ato.tipo_sigla} ${ato.numero}/${ato.ano}?`,
    "🗑️",
    async () => {
      mostrarLoading(true);
      try {
        await supabase.from("atos_oficiais").delete().eq("id", id);
        showNotification("success", "Excluído", "Ato removido.");
        await carregarAtosSupabase();
        await recarregarTudo();
      } catch (err) {
        showNotification("error", "Erro", err.message);
      } finally {
        mostrarLoading(false);
      }
    },
  );
}

function editarAto(id) {
  const ato = atos.find((a) => a.id === id);
  if (!ato) return;
  const modal = document.getElementById("atoModal");
  modal.style.display = "flex";
  centralizarModal(modal);
  document.getElementById("atoModalTitle").textContent = "Editar Ato";
  document.getElementById("atoId").value = ato.id;
  document.getElementById("tipoAto").value = ato.tipo_id;
  document.getElementById("numeroAto").value = ato.numero;
  document.getElementById("anoAto").value = ato.ano;
  document.getElementById("orgaoAto").value = ato.orgao_id;
  document.getElementById("dataPublicacao").value = ato.data_publicacao;
  document.getElementById("statusAto").value = ato.status;
  document.getElementById("ementaAto").value = ato.ementa;
  document.getElementById("textoCompletoEditor").innerHTML =
    ato.texto_completo || "";
  document.getElementById("nomeDiario").value = ato.nome_diario || "";
  document.getElementById("edicaoDiario").value = ato.edicao_diario || "";
  document.getElementById("paginaDiario").value = ato.pagina_diario || "";
  document.getElementById("linkDiario").value = ato.link_diario || "";
  document.getElementById("observacoesAto").value = ato.observacoes || "";
  const tagsList = document.getElementById("tagsList");
  if (tagsList) tagsList.innerHTML = "";
  if (ato.palavras_chave)
    ato.palavras_chave.forEach((tag) => adicionarTagVisual(tag));
  if (ato.pdf_url) {
    document.getElementById("pdfPreview").style.display = "flex";
    document.getElementById("pdfName").textContent = ato.pdf_url
      .split("/")
      .pop();
  }
  if (ato.doc_url) {
    document.getElementById("docPreview").style.display = "flex";
    document.getElementById("docName").textContent = ato.doc_url
      .split("/")
      .pop();
  }
}

function abrirAtoModal() {
  if (
    usuarioAtual?.perfil !== "ADMIN" &&
    usuarioAtual?.perfil !== "SECRETARIO"
  ) {
    showNotification("error", "Permissão", "Sem autorização.");
    return;
  }
  const modal = document.getElementById("atoModal");
  modal.style.display = "flex";
  centralizarModal(modal);
  document.getElementById("atoModalTitle").textContent = "Cadastrar Novo Ato";
  resetarFormAto();
  const tipoSelect = document.getElementById("tipoAto");
  const anoInput = document.getElementById("anoAto");
  if (tipoSelect.value && anoInput.value)
    tipoSelect.dispatchEvent(new Event("change"));
}

function closeAtoModal() {
  document.getElementById("atoModal").style.display = "none";
  resetarFormAto();
}

function resetarFormAto() {
  document.getElementById("atoForm")?.reset();
  document.getElementById("atoId").value = "";
  document.getElementById("textoCompletoEditor").innerHTML = "";
  document.getElementById("tagsList").innerHTML = "";
  document.getElementById("pdfPreview").style.display = "none";
  document.getElementById("docPreview").style.display = "none";
}

// ========== TAGS, EDITOR, UPLOADS ==========
function adicionarTagVisual(texto) {
  const tagsList = document.getElementById("tagsList");
  if (!tagsList) return;
  const tagEl = document.createElement("span");
  tagEl.className = "tag-item";
  tagEl.innerHTML = `${texto} <span class="tag-remove">&times;</span>`;
  tagEl
    .querySelector(".tag-remove")
    .addEventListener("click", () => tagEl.remove());
  tagsList.appendChild(tagEl);
}

function initTags() {
  const tagInput = document.getElementById("tagInput");
  if (!tagInput) return;
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = tagInput.value.trim();
      if (
        val &&
        ![...document.querySelectorAll("#tagsList .tag-item")].some((el) =>
          el.textContent.includes(val),
        )
      ) {
        adicionarTagVisual(val);
      }
      tagInput.value = "";
    }
  });
}

function initEditorTools() {
  document.querySelectorAll(".toolbar-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      if (command === "createLink") {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        if (!selectedText) {
          showNotification(
            "warning",
            "Selecione um texto",
            "Selecione o texto para âncora.",
          );
          return;
        }
        const anchorId = prompt("Identificador (ex: artigo1)", "artigo1");
        if (!anchorId) return;
        const span = document.createElement("span");
        span.id = anchorId;
        span.style.backgroundColor = "#e8f5e9";
        span.style.padding = "0 2px";
        span.style.borderRadius = "4px";
        span.setAttribute("title", `Âncora: ${anchorId}`);
        span.textContent = selectedText;
        range.deleteContents();
        range.insertNode(span);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        showNotification(
          "success",
          "Âncora criada",
          `ID "${anchorId}" adicionado.`,
        );
      } else {
        document.execCommand(command, false, null);
        document.getElementById("textoCompletoEditor").focus();
      }
    });
  });
}

function initUploads() {
  const pdfArea = document.getElementById("pdfUploadArea");
  const pdfInput = document.getElementById("pdfUpload");
  if (pdfArea && pdfInput) {
    pdfArea.addEventListener("click", () => pdfInput.click());
    pdfInput.addEventListener("change", (e) => {
      if (e.target.files.length) {
        document.getElementById("pdfPreview").style.display = "flex";
        document.getElementById("pdfName").textContent = e.target.files[0].name;
      }
    });
  }
  const docArea = document.getElementById("docUploadArea");
  const docInput = document.getElementById("docUpload");
  if (docArea && docInput) {
    docArea.addEventListener("click", () => docInput.click());
    docInput.addEventListener("change", (e) => {
      if (e.target.files.length) {
        document.getElementById("docPreview").style.display = "flex";
        document.getElementById("docName").textContent = e.target.files[0].name;
      }
    });
  }
  [pdfArea, docArea].forEach((area) => {
    if (!area) return;
    area.addEventListener("dragover", (e) => {
      e.preventDefault();
      area.classList.add("dragover");
    });
    area.addEventListener("dragleave", () => area.classList.remove("dragover"));
    area.addEventListener("drop", (e) => {
      e.preventDefault();
      area.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) {
        const input = area.querySelector('input[type="file"]');
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event("change"));
        }
      }
    });
  });
}

window.removeFile = (tipo) => {
  if (tipo === "pdf") {
    document.getElementById("pdfUpload").value = "";
    document.getElementById("pdfPreview").style.display = "none";
  } else if (tipo === "doc") {
    document.getElementById("docUpload").value = "";
    document.getElementById("docPreview").style.display = "none";
  }
};

// ========== RELACIONAMENTOS E ALTERAÇÕES ==========
async function carregarRelacionamentos(atoId) {
  const { data: asOrigem, error: e1 } = await supabase
    .from("relacionamentos_atos")
    .select(
      "*, ato_destino:ato_destino_id(id, tipo_nome, tipo_sigla, numero, ano)",
    )
    .eq("ato_origem_id", atoId);
  const { data: asDestino, error: e2 } = await supabase
    .from("relacionamentos_atos")
    .select(
      "*, ato_origem:ato_origem_id(id, tipo_nome, tipo_sigla, numero, ano)",
    )
    .eq("ato_destino_id", atoId);
  if (e1 || e2) return { origem: [], destino: [] };
  return { origem: asOrigem || [], destino: asDestino || [] };
}

async function carregarAlteracoesDispositivos(atoId) {
  const { data, error } = await supabase
    .from("alteracoes_dispositivos")
    .select(
      "*, ato_alterador:ato_alterador_id(id, tipo_nome, tipo_sigla, numero, ano)",
    )
    .eq("ato_origem_id", atoId);
  if (error) return [];
  return data || [];
}

async function atualizarModalRelacionamentos(atoId) {
  currentRelAtoId = atoId;
  const ato = atos.find((a) => a.id === atoId);
  if (!ato) return;
  document.getElementById("relacionamentoAtoInfo").innerHTML =
    `<strong>${ato.tipo_sigla} ${ato.numero}/${ato.ano}</strong>`;
  const outros = atos
    .filter((a) => a.id !== atoId)
    .map(
      (a) =>
        `<option value="${a.id}">${a.tipo_sigla} ${a.numero}/${a.ano}</option>`,
    )
    .join("");
  document.getElementById("relAtoId").innerHTML =
    `<option value="">Selecione...</option>${outros}`;
  document.getElementById("relDispositivoAtoId").innerHTML =
    `<option value="">Selecione...</option>${outros}`;
  const rels = await carregarRelacionamentos(atoId);
  const listaDiv = document.getElementById("relacionamentosList");
  if (!rels.origem.length && !rels.destino.length)
    listaDiv.innerHTML = '<p class="empty-state">Nenhum relacionamento.</p>';
  else {
    let html = "";
    if (rels.origem.length) {
      html += `<h4>📌 Este ato:</h4><ul>`;
      rels.origem.forEach(
        (r) =>
          (html += `<li><strong>${r.tipo}</strong> → <a href="#" onclick="visualizarAto(${r.ato_destino.id}); return false;">${r.ato_destino.tipo_nome} ${r.ato_destino.numero}/${r.ato_destino.ano}</a> <button class="btn btn-sm btn-outline btn-excluir" onclick="removerRelacionamento(${r.id})">🗑️</button></li>`),
      );
      html += `</ul>`;
    }
    if (rels.destino.length) {
      html += `<h4>🔁 Referenciado por:</h4><ul>`;
      rels.destino.forEach(
        (r) =>
          (html += `<li><strong>${r.tipo}</strong> ← <a href="#" onclick="visualizarAto(${r.ato_origem.id}); return false;">${r.ato_origem.tipo_nome} ${r.ato_origem.numero}/${r.ato_origem.ano}</a> <button class="btn btn-sm btn-outline btn-excluir" onclick="removerRelacionamento(${r.id})">🗑️</button></li>`),
      );
      html += `</ul>`;
    }
    listaDiv.innerHTML = html;
  }
  const alts = await carregarAlteracoesDispositivos(atoId);
  const altDiv = document.getElementById("alteracoesList");
  if (!alts.length)
    altDiv.innerHTML = '<p class="empty-state">Nenhuma alteração pontual.</p>';
  else {
    let altHtml = `<ul>`;
    alts.forEach((alt) => {
      altHtml += `<li><strong>${alt.tipo === "revogado" ? "🚫 Revogado" : alt.tipo === "alterado" ? "✏️ Alterado" : "➕ Acrescentado"}</strong> dispositivo "<code>${alt.identificador_dispositivo}</code>" no ato ${alt.ato_origem_id} por <a href="#" onclick="visualizarAto(${alt.ato_alterador.id}); return false;">${alt.ato_alterador.tipo_nome} ${alt.ato_alterador.numero}/${alt.ato_alterador.ano}</a> <button class="btn btn-sm btn-outline btn-excluir" onclick="removerAlteracaoDispositivo(${alt.id})">🗑️</button>`;
      if (alt.tipo === "alterado")
        altHtml += `<br><small>Novo texto: ${alt.novo_texto.substring(0, 100)}${alt.novo_texto.length > 100 ? "..." : ""}</small>`;
      altHtml += `</li>`;
    });
    altHtml += `</ul>`;
    altDiv.innerHTML = altHtml;
  }
  const tipoSel = document.getElementById("relTipoDispositivo");
  const novoGroup = document.getElementById("relNovoTextoGroup");
  if (tipoSel && novoGroup) {
    tipoSel.addEventListener("change", () => {
      novoGroup.style.display = tipoSel.value === "alterado" ? "block" : "none";
    });
    novoGroup.style.display = tipoSel.value === "alterado" ? "block" : "none";
  }
}

async function adicionarRelacionamento() {
  if (!currentRelAtoId) return;
  const destinoId = document.getElementById("relAtoId").value;
  const tipo = document.getElementById("relTipo").value;
  if (!destinoId) {
    showNotification("warning", "Selecione", "Escolha um ato.");
    return;
  }
  mostrarLoading(true);
  try {
    await supabase
      .from("relacionamentos_atos")
      .insert({
        ato_origem_id: currentRelAtoId,
        ato_destino_id: parseInt(destinoId),
        tipo,
        usuario_cadastro_id: usuarioAtual.id,
        created_at: new Date(),
      });
    showNotification("success", "Vínculo criado", "Relacionamento adicionado.");
    await atualizarModalRelacionamentos(currentRelAtoId);
  } catch (err) {
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}

async function removerRelacionamento(relId) {
  showConfirm("Remover vínculo", "Deseja remover?", "⚠️", async () => {
    mostrarLoading(true);
    try {
      await supabase.from("relacionamentos_atos").delete().eq("id", relId);
      showNotification("success", "Removido", "Vínculo removido.");
      await atualizarModalRelacionamentos(currentRelAtoId);
    } catch (err) {
      showNotification("error", "Erro", err.message);
    } finally {
      mostrarLoading(false);
    }
  });
}

async function adicionarAlteracaoDispositivo() {
  if (!currentRelAtoId) return;
  const atoAlvoId = document.getElementById("relDispositivoAtoId").value;
  const identificador = document
    .getElementById("relIdentificadorDispositivo")
    .value.trim();
  const tipo = document.getElementById("relTipoDispositivo").value;
  const novoTexto = document.getElementById("relNovoTexto").value.trim();
  if (!atoAlvoId) {
    showNotification("warning", "Selecione", "Escolha o ato alvo.");
    return;
  }
  if (!identificador) {
    showNotification("warning", "Identificador", "Informe o identificador.");
    return;
  }
  if (tipo === "alterado" && !novoTexto) {
    showNotification("warning", "Novo texto", "Informe o novo texto.");
    return;
  }
  mostrarLoading(true);
  try {
    await supabase
      .from("alteracoes_dispositivos")
      .insert({
        ato_origem_id: parseInt(atoAlvoId),
        ato_alterador_id: currentRelAtoId,
        tipo,
        identificador_dispositivo: identificador,
        novo_texto: tipo === "alterado" ? novoTexto : null,
        created_at: new Date(),
      });
    showNotification(
      "success",
      "Alteração registrada",
      `Dispositivo "${identificador}" ${tipo}.`,
    );
    document.getElementById("relIdentificadorDispositivo").value = "";
    document.getElementById("relNovoTexto").value = "";
    document.getElementById("relTipoDispositivo").value = "revogado";
    document.getElementById("relNovoTextoGroup").style.display = "none";
    await atualizarModalRelacionamentos(currentRelAtoId);
  } catch (err) {
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}

async function removerAlteracaoDispositivo(altId) {
  showConfirm("Remover alteração", "Deseja remover?", "⚠️", async () => {
    mostrarLoading(true);
    try {
      await supabase.from("alteracoes_dispositivos").delete().eq("id", altId);
      showNotification("success", "Removido", "Alteração removida.");
      await atualizarModalRelacionamentos(currentRelAtoId);
    } catch (err) {
      showNotification("error", "Erro", err.message);
    } finally {
      mostrarLoading(false);
    }
  });
}

// ========== VISUALIZAÇÃO ATO ==========
async function aplicarAlteracoesVisuais(container, alteracoes) {
  for (const alt of alteracoes) {
    const elemento = container.querySelector(
      `#${alt.identificador_dispositivo}`,
    );
    if (!elemento) continue;
    if (alt.tipo === "revogado") {
      elemento.classList.add("dispositivo-revogado");
      elemento.setAttribute(
        "title",
        `Revogado por ${alt.ato_alterador.tipo_sigla} ${alt.ato_alterador.numero}/${alt.ato_alterador.ano}`,
      );
    } else if (alt.tipo === "alterado") {
      elemento.classList.add("dispositivo-alterado");
      elemento.setAttribute(
        "title",
        `Alterado por ${alt.ato_alterador.tipo_sigla} ${alt.ato_alterador.numero}/${alt.ato_alterador.ano}\nNovo texto: ${alt.novo_texto}`,
      );
    }
  }
}

window.visualizarAto = async (id) => {
  const ato = atos.find((a) => a.id === id);
  if (!ato) return;
  const rels = await carregarRelacionamentos(id);
  const alts = await carregarAlteracoesDispositivos(id);
  let relHtml = "";
  if (rels.origem.length) {
    relHtml += `<div style="margin:16px 0; padding:12px; background:#f8fafc; border-radius:12px;"><strong>📌 Este ato:</strong><ul>`;
    rels.origem.forEach(
      (r) =>
        (relHtml += `<li>${r.tipo} → <a href="#" onclick="visualizarAto(${r.ato_destino.id}); return false;">${r.ato_destino.tipo_nome} ${r.ato_destino.numero}/${r.ato_destino.ano}</a></li>`),
    );
    relHtml += `</ul></div>`;
  }
  if (rels.destino.length) {
    relHtml += `<div style="margin:16px 0; padding:12px; background:#f8fafc; border-radius:12px;"><strong>🔁 Referenciado por:</strong><ul>`;
    rels.destino.forEach(
      (r) =>
        (relHtml += `<li>${r.tipo} ← <a href="#" onclick="visualizarAto(${r.ato_origem.id}); return false;">${r.ato_origem.tipo_nome} ${r.ato_origem.numero}/${r.ato_origem.ano}</a></li>`),
    );
    relHtml += `</ul></div>`;
  }
  let altHtml = "";
  if (alts.length) {
    altHtml += `<div style="margin:16px 0; padding:12px; background:#fff5eb; border-radius:12px;"><strong>✏️ Alterações em dispositivos:</strong><ul>`;
    alts.forEach((alt) => {
      altHtml += `<li><strong>${alt.tipo === "revogado" ? "Revogado" : alt.tipo === "alterado" ? "Alterado" : "Acrescentado"}</strong> "<code>${alt.identificador_dispositivo}</code>" por <a href="#" onclick="visualizarAto(${alt.ato_alterador.id}); return false;">${alt.ato_alterador.tipo_nome} ${alt.ato_alterador.numero}/${alt.ato_alterador.ano}</a>`;
      if (alt.tipo === "alterado")
        altHtml += `<br><small>Novo texto: ${alt.novo_texto.substring(0, 150)}${alt.novo_texto.length > 150 ? "..." : ""}</small>`;
      altHtml += `</li>`;
    });
    altHtml += `</ul></div>`;
  }
  const textoCompletoHtml = ato.texto_completo
    ? `<h4>Texto Completo</h4><div id="textoCompletoView" class="texto-completo-view">${ato.texto_completo}</div>`
    : "";
  document.getElementById("viewAtoTitle").innerHTML =
    `${ato.tipo_nome} nº ${ato.numero}/${ato.ano}`;
  document.getElementById("viewAtoContent").innerHTML =
    `<div class="view-ato-detalhes"><p><strong>Tipo:</strong> ${ato.tipo_nome}</p><p><strong>Número/Ano:</strong> ${ato.numero}/${ato.ano}</p><p><strong>Órgão:</strong> ${ato.orgao_nome}</p><p><strong>Status:</strong> <span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span></p><p><strong>Data:</strong> ${formatarData(ato.data_publicacao)}</p>${ato.edicao_diario ? `<p><strong>Diário:</strong> Ed.${ato.edicao_diario}, Pág.${ato.pagina_diario}</p>` : ""}<hr><h4>Ementa</h4><p>${ato.ementa}</p>${textoCompletoHtml}${relHtml}${altHtml}</div>`;
  const modal = document.getElementById("viewAtoModal");
  modal.style.display = "flex";
  centralizarModal(modal);
  if (alts.length && document.getElementById("textoCompletoView")) {
    const container = document.getElementById("textoCompletoView");
    await aplicarAlteracoesVisuais(container, alts);
    if (!document.getElementById("styleDispositivos")) {
      const style = document.createElement("style");
      style.id = "styleDispositivos";
      style.textContent = `.dispositivo-revogado { text-decoration: line-through; background-color: #fee2e2; cursor: help; } .dispositivo-alterado { background-color: #fef3c7; cursor: help; border-left: 3px solid #f59e0b; padding-left: 4px; }`;
      document.head.appendChild(style);
    }
  }
};

// ========== CRUD TIPOS DE ATO ==========
async function abrirModalTipoAto(id = null) {
  if (!usuarioAtual || usuarioAtual.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  const modal = document.getElementById("tipoAtoModal");
  if (id) {
    const tipo = tiposAto.find((t) => t.id === id);
    if (tipo) {
      document.getElementById("tipoAtoModalTitle").innerText =
        "Editar Tipo de Ato";
      document.getElementById("tipoAtoId").value = tipo.id;
      document.getElementById("tipoAtoNome").value = tipo.nome;
      document.getElementById("tipoAtoSigla").value = tipo.sigla;
      document.getElementById("tipoAtoOrdem").value = tipo.ordem || 0;
      document.getElementById("tipoAtoAtivo").value = tipo.ativo
        ? "true"
        : "false";
    }
  } else {
    document.getElementById("tipoAtoModalTitle").innerText = "Novo Tipo de Ato";
    document.getElementById("tipoAtoForm").reset();
    document.getElementById("tipoAtoId").value = "";
  }
  modal.style.display = "flex";
  centralizarModal(modal);
}
window.abrirModalTipoAto = abrirModalTipoAto;

function closeTipoAtoModal() {
  document.getElementById("tipoAtoModal").style.display = "none";
}
window.closeTipoAtoModal = closeTipoAtoModal;

async function salvarTipoAto() {
  const id = document.getElementById("tipoAtoId").value;
  const nome = document.getElementById("tipoAtoNome").value.trim();
  const sigla = document
    .getElementById("tipoAtoSigla")
    .value.trim()
    .toUpperCase();
  const ordem = parseInt(document.getElementById("tipoAtoOrdem").value) || 0;
  const ativo = document.getElementById("tipoAtoAtivo").value === "true";
  if (!nome || !sigla) {
    showNotification("warning", "Campos obrigatórios", "Informe nome e sigla.");
    return;
  }
  mostrarLoading(true);
  try {
    if (id) {
      await supabase
        .from("tipos_ato")
        .update({ nome, sigla, ordem, ativo })
        .eq("id", parseInt(id));
      showNotification("success", "Atualizado", "Tipo de ato atualizado.");
    } else {
      await supabase.from("tipos_ato").insert({ nome, sigla, ordem, ativo });
      showNotification("success", "Criado", "Tipo de ato cadastrado.");
    }
    await carregarTiposAtoSupabase();
    renderizarTiposAtoInline();
    await popularSelectTiposAto("tipoAto", true);
    await popularSelectTiposAto("filtroTipo", true);
    closeTipoAtoModal();
  } catch (err) {
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}
window.salvarTipoAto = salvarTipoAto;

async function editarTipoAto(id) {
  abrirModalTipoAto(id);
}
window.editarTipoAto = editarTipoAto;

async function excluirTipoAto(id) {
  const tipo = tiposAto.find((t) => t.id === id);
  if (!tipo) return;
  const { count } = await supabase
    .from("atos_oficiais")
    .select("*", { count: "exact", head: true })
    .eq("tipo_id", id);
  if (count > 0) {
    showNotification(
      "warning",
      "Não pode excluir",
      `Existem ${count} atos vinculados.`,
    );
    return;
  }
  showConfirm("Excluir tipo", `Excluir "${tipo.nome}"?`, "🗑️", async () => {
    mostrarLoading(true);
    try {
      await supabase.from("tipos_ato").delete().eq("id", id);
      await carregarTiposAtoSupabase();
      renderizarTiposAtoInline();
      await popularSelectTiposAto("tipoAto", true);
      await popularSelectTiposAto("filtroTipo", true);
      showNotification("success", "Excluído", "Tipo removido.");
    } catch (err) {
      showNotification("error", "Erro", err.message);
    } finally {
      mostrarLoading(false);
    }
  });
}
window.excluirTipoAto = excluirTipoAto;

// ========== CRUD ÓRGÃOS ==========
window.abrirOrgaoModal = async (id = null) => {
  if (!usuarioAtual || usuarioAtual.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  await carregarListaGestoresParaDatalist();
  const modal = document.getElementById("orgaoModal");
  const form = document.getElementById("orgaoForm");
  form.reset();
  document.getElementById("orgaoId").value = "";
  document.getElementById("orgaoSigla").value = "";
  document.getElementById("orgaoGestor").value = "";
  if (id) {
    const org = orgaos.find((o) => o.id === id);
    if (org) {
      document.getElementById("orgaoModalTitle").innerText = "Editar Órgão";
      document.getElementById("orgaoId").value = org.id;
      document.getElementById("orgaoNome").value = org.nome;
      document.getElementById("orgaoSigla").value = org.sigla || "";
      document.getElementById("orgaoTipo").value = org.tipo || "SECRETARIA";
      document.getElementById("orgaoStatus").value = org.ativo
        ? "true"
        : "false";
      const gestorAtual = await obterGestorAtual(org.id);
      if (gestorAtual) {
        document.getElementById("orgaoGestor").value =
          gestorAtual.nome_responsavel;
      }
    }
  } else {
    document.getElementById("orgaoModalTitle").innerText = "Novo Órgão";
  }
  modal.style.display = "flex";
  centralizarModal(modal);
};

function closeOrgaoModal() {
  document.getElementById("orgaoModal").style.display = "none";
}
window.closeOrgaoModal = closeOrgaoModal;

window.salvarOrgao = async () => {
  const id = document.getElementById("orgaoId").value;
  const nome = document.getElementById("orgaoNome").value.trim();
  const sigla = document
    .getElementById("orgaoSigla")
    .value.trim()
    .toUpperCase();
  const tipo = document.getElementById("orgaoTipo").value;
  const ativo = document.getElementById("orgaoStatus").value === "true";
  const gestorNome = document.getElementById("orgaoGestor").value.trim();
  if (!nome) {
    showNotification("warning", "Atenção", "Informe o nome do órgão.");
    return;
  }
  if (!sigla) {
    showNotification("warning", "Atenção", "Informe a sigla do órgão.");
    return;
  }
  mostrarLoading(true);
  try {
    let orgaoId = id ? parseInt(id) : null;
    if (orgaoId) {
      const updateData = { nome, sigla, ativo };
      if (tipo === "") updateData.tipo = null;
      else updateData.tipo = tipo;
      const { error } = await supabase
        .from("orgaos")
        .update(updateData)
        .eq("id", orgaoId);
      if (error) throw error;
      showNotification("success", "Atualizado", `Órgão "${nome}" atualizado.`);
      if (gestorNome) {
        const gestorAtual = await obterGestorAtual(orgaoId);
        if (gestorAtual && gestorAtual.nome_responsavel !== gestorNome) {
          await supabase
            .from("gestores_orgaos")
            .update({ data_fim: new Date().toISOString().split("T")[0] })
            .eq("orgao_id", orgaoId)
            .is("data_fim", null);
        }
        await associarGestorAoOrgao(orgaoId, gestorNome);
      }
    } else {
      let siglaGerada = sigla;
      const { data: siglaExistente } = await supabase
        .from("orgaos")
        .select("sigla")
        .eq("sigla", siglaGerada)
        .maybeSingle();
      if (siglaExistente) {
        siglaGerada = siglaGerada + Math.floor(Math.random() * 1000);
        showNotification(
          "warning",
          "Sigla ajustada",
          `Sigla já existente, foi alterada para ${siglaGerada}`,
        );
      }
      const insertData = {
        nome,
        sigla: siglaGerada,
        tipo: tipo || null,
        ativo,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: newOrg, error } = await supabase
        .from("orgaos")
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      orgaoId = newOrg.id;
      showNotification("success", "Criado", `Órgão "${nome}" cadastrado.`);
      if (gestorNome) {
        await associarGestorAoOrgao(orgaoId, gestorNome);
      }
    }
    await carregarOrgaosSupabase();
    await renderizarOrgaosInline();
    await popularSelectOrgaos("orgaoAto", true);
    await popularSelectOrgaos("filtroOrgao", true);
    closeOrgaoModal();
  } catch (err) {
    console.error(err);
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
};

window.excluirOrgao = (id) => {
  const org = orgaos.find((o) => o.id === id);
  if (!org) return;
  showConfirm("Excluir órgão", `Excluir "${org.nome}"?`, "🗑️", async () => {
    mostrarLoading(true);
    try {
      await supabase.from("orgaos").delete().eq("id", id);
      await carregarOrgaosSupabase();
      await renderizarOrgaosInline();
      await popularSelectOrgaos("orgaoAto", true);
      await popularSelectOrgaos("filtroOrgao", true);
      showNotification("success", "Excluído", "Órgão removido.");
    } catch (err) {
      showNotification("error", "Erro", err.message);
    } finally {
      mostrarLoading(false);
    }
  });
};
window.editarOrgao = (id) => window.abrirOrgaoModal(id);

// ========== CRUD GESTORES ==========
async function gerenciarGestores(orgaoId, orgaoNome) {
  if (!usuarioAtual || usuarioAtual.perfil !== "ADMIN") {
    showNotification(
      "error",
      "Permissão",
      "Apenas administradores podem gerenciar gestores.",
    );
    return;
  }
  currentOrgaoGestorId = orgaoId;
  document.getElementById("orgaoGestorInfo").innerHTML =
    `<strong>${orgaoNome}</strong> - Gestores do órgão`;
  await listarGestores(orgaoId);
  document.getElementById("gestoresModal").style.display = "flex";
  centralizarModal(document.getElementById("gestoresModal"));
}

async function listarGestores(orgaoId) {
  const gestoresList = await carregarGestores(orgaoId);
  const container = document.getElementById("gestoresList");
  if (!gestoresList.length) {
    container.innerHTML =
      '<p class="empty-state">Nenhum gestor cadastrado para este órgão.</p>';
    return;
  }
  let html =
    '<div style="max-height: 400px; overflow-y: auto;"><table class="table"><thead><tr><th>Nome</th><th>Cargo</th><th>Início</th><th>Término</th><th>Observação</th><th>Ações</th></tr></thead><tbody>';
  for (const g of gestoresList) {
    html += `
      <tr>
        <tr>${g.nome_responsavel}</td>
        <td>${g.cargo_responsavel || "-"}</td>
        <td>${formatarData(g.data_inicio)}</td>
        <td>${g.data_fim ? formatarData(g.data_fim) : "<em>Atual</em>"}</td>
        <td>${g.observacao || "-"}</td>
        <td class="acoes-cell">
          <button class="btn btn-sm btn-outline" onclick="editarGestor(${g.id}, ${g.orgao_id})">✏️</button>
          <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirGestor(${g.id})">🗑️</button>
        </td>
      </tr>
    `;
  }
  html += "</tbody></table></div>";
  container.innerHTML = html;
}

function closeGestoresModal() {
  document.getElementById("gestoresModal").style.display = "none";
}

async function abrirFormGestor(id = null, orgaoId = null) {
  const modal = document.getElementById("gestorFormModal");
  if (id) {
    const gestoresList = await carregarGestores(
      orgaoId || currentOrgaoGestorId,
    );
    const gestor = gestoresList.find((g) => g.id === id);
    if (gestor) {
      document.getElementById("gestorFormModalTitle").innerText =
        "Editar Gestor";
      document.getElementById("gestorId").value = gestor.id;
      document.getElementById("gestorOrgaoId").value = gestor.orgao_id;
      document.getElementById("gestorNome").value = gestor.nome_responsavel;
      document.getElementById("gestorCargo").value =
        gestor.cargo_responsavel || "";
      document.getElementById("gestorDataInicio").value = gestor.data_inicio;
      document.getElementById("gestorDataFim").value = gestor.data_fim || "";
      document.getElementById("gestorObservacao").value =
        gestor.observacao || "";
    }
  } else {
    document.getElementById("gestorFormModalTitle").innerText = "Novo Gestor";
    document.getElementById("gestorForm").reset();
    document.getElementById("gestorId").value = "";
    document.getElementById("gestorOrgaoId").value = currentOrgaoGestorId;
    document.getElementById("gestorDataFim").value = "";
  }
  modal.style.display = "flex";
  centralizarModal(modal);
}

function closeGestorFormModal() {
  document.getElementById("gestorFormModal").style.display = "none";
}

async function salvarGestorHandler() {
  const id = document.getElementById("gestorId").value;
  const orgao_id = parseInt(document.getElementById("gestorOrgaoId").value);
  const nome = document.getElementById("gestorNome").value.trim();
  const cargo = document.getElementById("gestorCargo").value.trim() || null;
  const dataInicio = document.getElementById("gestorDataInicio").value;
  const dataFim = document.getElementById("gestorDataFim").value || null;
  const observacao =
    document.getElementById("gestorObservacao").value.trim() || null;
  if (!nome || !dataInicio) {
    showNotification(
      "warning",
      "Campos obrigatórios",
      "Nome e data de início são obrigatórios.",
    );
    return;
  }
  mostrarLoading(true);
  try {
    await salvarGestor({
      id: id || null,
      orgao_id,
      nome_responsavel: nome,
      cargo_responsavel: cargo,
      data_inicio: dataInicio,
      data_fim: dataFim,
      observacao,
    });
    showNotification("success", "Salvo", "Gestor salvo com sucesso.");
    closeGestorFormModal();
    await listarGestores(orgao_id);
    await renderizarOrgaosInline();
  } catch (err) {
    console.error(err);
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}

async function editarGestorHandler(id, orgaoId) {
  abrirFormGestor(id, orgaoId);
}

async function excluirGestorHandler(id) {
  showConfirm(
    "Excluir gestor",
    "Deseja remover este gestor?",
    "🗑️",
    async () => {
      mostrarLoading(true);
      try {
        await excluirGestor(id);
        showNotification("success", "Excluído", "Gestor removido.");
        await listarGestores(currentOrgaoGestorId);
        await renderizarOrgaosInline();
      } catch (err) {
        showNotification("error", "Erro", err.message);
      } finally {
        mostrarLoading(false);
      }
    },
  );
}

window.gerenciarGestores = gerenciarGestores;
window.closeGestoresModal = closeGestoresModal;
window.abrirFormGestor = abrirFormGestor;
window.closeGestorFormModal = closeGestorFormModal;
window.salvarGestor = salvarGestorHandler;
window.editarGestor = editarGestorHandler;
window.excluirGestor = excluirGestorHandler;

// ========== CRUD USUÁRIOS ==========
async function abrirUsuarioModal(id = null) {
  if (!usuarioAtual || usuarioAtual.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  const modal = document.getElementById("usuarioModal");
  if (id) {
    const user = usuarios.find((u) => u.id === id);
    if (user) {
      document.getElementById("usuarioModalTitle").innerText = "Editar Usuário";
      document.getElementById("usuarioId").value = user.id;
      document.getElementById("usuarioNome").value = user.nome;
      document.getElementById("usuarioEmail").value = user.email;
      document.getElementById("usuarioPerfil").value =
        user.perfil || "SOLICITANTE";
      document.getElementById("senhaGroup").style.display = "none";
    }
  } else {
    document.getElementById("usuarioModalTitle").innerText = "Novo Usuário";
    document.getElementById("usuarioForm").reset();
    document.getElementById("usuarioId").value = "";
    document.getElementById("senhaGroup").style.display = "block";
  }
  modal.style.display = "flex";
  centralizarModal(modal);
}
window.abrirUsuarioModal = abrirUsuarioModal;

function closeUsuarioModal() {
  document.getElementById("usuarioModal").style.display = "none";
}
window.closeUsuarioModal = closeUsuarioModal;

async function salvarUsuario() {
  const id = document.getElementById("usuarioId").value;
  const nome = document.getElementById("usuarioNome").value.trim();
  const email = document.getElementById("usuarioEmail").value.trim();
  const perfil = document.getElementById("usuarioPerfil").value;
  const senha = document.getElementById("usuarioSenha").value;
  if (!nome || !email) {
    showNotification("warning", "Campos obrigatórios", "Nome e e-mail.");
    return;
  }
  mostrarLoading(true);
  try {
    if (id) {
      await supabase
        .from("usuarios")
        .update({ nome, email, perfil, updated_at: new Date() })
        .eq("id", parseInt(id));
      showNotification("success", "Atualizado", "Usuário atualizado.");
    } else {
      if (!senha || senha.length < 6) {
        showNotification("warning", "Senha", "Mínimo 6 caracteres.");
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (userId)
        await supabase
          .from("usuarios")
          .update({ nome, perfil })
          .eq("uuid", userId);
      showNotification("success", "Criado", "Usuário cadastrado.");
    }
    await carregarUsuariosSupabase();
    renderizarUsuariosInline();
    closeUsuarioModal();
  } catch (err) {
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}
window.salvarUsuario = salvarUsuario;

async function excluirUsuario(id) {
  const user = usuarios.find((u) => u.id === id);
  if (!user) return;
  showConfirm("Excluir usuário", `Excluir "${user.nome}"?`, "🗑️", async () => {
    mostrarLoading(true);
    try {
      await supabase.from("usuarios").delete().eq("id", id);
      await carregarUsuariosSupabase();
      renderizarUsuariosInline();
      showNotification("success", "Excluído", "Usuário removido.");
    } catch (err) {
      showNotification("error", "Erro", err.message);
    } finally {
      mostrarLoading(false);
    }
  });
}
window.excluirUsuario = excluirUsuario;
window.editarUsuario = (id) => abrirUsuarioModal(id);

// ========== CARDS DE NAVEGAÇÃO ==========
function initNavCards() {
  const cards = document.querySelectorAll(".card-nav");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const page = card.getAttribute("data-page");
      if (page === "configuracoes") {
        mostrarPagina("configuracoes");
        // Garantir que a primeira aba da configuração esteja ativa
        const primeiraAba = document.querySelector(".config-tab");
        if (primeiraAba && !primeiraAba.classList.contains("active")) {
          primeiraAba.click();
        }
      } else {
        mostrarPagina(page);
      }
      cards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });
}

function mostrarPagina(page) {
  document.querySelectorAll(".page").forEach((p) => (p.style.display = "none"));
  const target = document.getElementById(
    `page${page.charAt(0).toUpperCase() + page.slice(1)}`,
  );
  if (target) target.style.display = "block";
  const titleMap = {
    dashboard: "Dashboard",
    atos: "Gestão de Atos",
    configuracoes: "Configurações",
  };
  const h2Title = document.querySelector(".topbar-left h2");
  if (h2Title) h2Title.innerHTML = titleMap[page] || "Gestão de Atos Oficiais";
  if (page === "atos") carregarListaAtos();
  if (page === "configuracoes") {
    renderizarTiposAtoInline();
    renderizarOrgaosInline();
    renderizarUsuariosInline();
  }
}

// ========== MODAIS PLACEHOLDER ==========
window.closeViewAtoModal = () =>
  (document.getElementById("viewAtoModal").style.display = "none");
window.gerenciarRelacionamentos = async (id) => {
  if (!usuarioAtual) return;
  await atualizarModalRelacionamentos(id);
  const modal = document.getElementById("relacionamentoModal");
  modal.style.display = "flex";
  centralizarModal(modal);
};
window.closeRelacionamentoModal = () =>
  (document.getElementById("relacionamentoModal").style.display = "none");
window.adicionarRelacionamento = adicionarRelacionamento;
window.removerRelacionamento = removerRelacionamento;
window.adicionarAlteracaoDispositivo = adicionarAlteracaoDispositivo;
window.removerAlteracaoDispositivo = removerAlteracaoDispositivo;
window.abrirAnexosModal = () => {
  const m = document.getElementById("anexosModal");
  m.style.display = "flex";
  centralizarModal(m);
};
window.closeAnexosModal = () =>
  (document.getElementById("anexosModal").style.display = "none");
window.abrirHistoricoModal = () => {
  const m = document.getElementById("historicoModal");
  m.style.display = "flex";
  centralizarModal(m);
};
window.closeHistoricoModal = () =>
  (document.getElementById("historicoModal").style.display = "none");
window.downloadPDF = () => showNotification("info", "Download", "Em breve.");
window.exportarLista = (fmt) =>
  showNotification(
    "info",
    "Exportação",
    `Exportação ${fmt.toUpperCase()} em breve.`,
  );

// ========== LOGOUT ==========
async function fazerLogout() {
  showConfirm("Encerrar sessão", "Deseja sair?", "🚪", async () => {
    await supabase.auth.signOut();
    window.location.href = "intranet.html";
  });
}

// ========== RECARREGAR TUDO ==========
async function recarregarTudo() {
  await carregarAtosSupabase();
  await carregarOrgaosSupabase();
  await carregarUsuariosSupabase();
  await carregarTiposAtoSupabase();
  atualizarDashboard();
  carregarListaAtos();
  atualizarFiltrosAnoOrgao();
  renderizarTiposAtoInline();
  await renderizarOrgaosInline();
  renderizarUsuariosInline();
  await popularSelectTiposAto("tipoAto", true);
  await popularSelectTiposAto("filtroTipo", true);
  await popularSelectOrgaos("orgaoAto", true);
  await popularSelectOrgaos("filtroOrgao", true);
}

// ========== AUTENTICAÇÃO ==========
async function initAuth() {
  mostrarLoading(true);
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "intranet.html";
      return;
    }
    const { data: perfil, error } = await supabase
      .from("usuarios")
      .select("id, nome, perfil, email, ativo")
      .eq("uuid", session.user.id)
      .single();
    if (error || !perfil || !perfil.ativo) {
      showNotification(
        "error",
        "Acesso negado",
        "Usuário inválido ou inativo.",
      );
      await supabase.auth.signOut();
      window.location.href = "intranet.html";
      return;
    }
    usuarioAtual = {
      id: perfil.id,
      nome: perfil.nome,
      perfil: perfil.perfil,
      email: perfil.email,
      uuid: session.user.id,
    };
    document.getElementById("topbarUserName").innerText = usuarioAtual.nome;
    document.getElementById("topbarUserPerfil").innerText = usuarioAtual.perfil;
    if (
      usuarioAtual.perfil !== "ADMIN" &&
      usuarioAtual.perfil !== "SECRETARIO"
    ) {
      document
        .querySelectorAll("#novoAtoBtn, #novoAtoDashboardBtn")
        .forEach((btn) => btn && (btn.style.display = "none"));
    }
    await recarregarTudo();
    initNavCards();
    initConfigTabs();
    document
      .getElementById("logoutBtn")
      .addEventListener("click", () => fazerLogout());
    document
      .getElementById("novoAtoBtn")
      .addEventListener("click", () => abrirAtoModal());
    document
      .getElementById("novoAtoDashboardBtn")
      .addEventListener("click", () => abrirAtoModal());
    document
      .getElementById("btnLimparFiltros")
      .addEventListener("click", limparFiltros);
    ["filtroTipo", "filtroAno", "filtroOrgao", "filtroStatus"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", aplicarFiltros);
    });
    document
      .getElementById("filtroBusca")
      .addEventListener("input", aplicarFiltros);
    initEditorTools();
    initUploads();
    initTags();
    setupSugestaoNumero();
    mostrarPagina("dashboard");
    const activeCard = document.querySelector(
      '.card-nav[data-page="dashboard"]',
    );
    if (activeCard) activeCard.classList.add("active");
  } catch (err) {
    console.error(err);
    showNotification(
      "error",
      "Erro",
      "Falha ao carregar o painel: " + err.message,
    );
  } finally {
    mostrarLoading(false);
  }
}

// ========== EXPOSIÇÃO GLOBAL ==========
window.salvarAto = salvarAto;
window.confirmarExcluirAto = confirmarExcluirAto;
window.editarAto = editarAto;
window.abrirAtoModal = abrirAtoModal;
window.closeAtoModal = closeAtoModal;
window.fazerLogout = fazerLogout;

initAuth();
