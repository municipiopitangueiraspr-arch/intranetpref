// ============================================
// painel-adm-atos-oficiais.js
// Módulo ES6 - Painel Administrativo de Atos Oficiais
// Versão COMPLETA com upload real, exportação, visualização
// com abas, breadcrumb, ações rápidas, e CORREÇÃO DO TACHADO.
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
let currentViewAtoId = null;
let currentPdfFile = null;
let currentDocFile = null;
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

// ========== NOVA FUNÇÃO: APLICAR ESTILOS DE DISPOSITIVOS ==========
function aplicarEstilosDispositivos(containerElement, alteracoes) {
  if (!containerElement || !alteracoes || !alteracoes.length) return;
  alteracoes.forEach((alt) => {
    const el = containerElement.querySelector(
      `#${alt.identificador_dispositivo}`,
    );
    if (!el) {
      console.warn(
        `⚠️ Dispositivo "${alt.identificador_dispositivo}" não encontrado no texto.`,
      );
      return;
    }
    if (alt.tipo === "revogado") {
      el.classList.add("dispositivo-revogado");
      el.setAttribute(
        "title",
        `Revogado por ${alt.ato_alterador?.tipos_ato?.sigla || "?"} ${alt.ato_alterador?.numero}/${alt.ato_alterador?.ano}`,
      );
    } else if (alt.tipo === "alterado") {
      el.classList.add("dispositivo-alterado");
      el.setAttribute(
        "title",
        `Alterado por ${alt.ato_alterador?.tipos_ato?.sigla || "?"} ${alt.ato_alterador?.numero}/${alt.ato_alterador?.ano}\nNovo texto: ${alt.novo_texto || ""}`,
      );
    }
  });
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
    .select(`*, tipos_ato (id, nome, sigla), orgaos (id, nome)`)
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
    console.warn(err);
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
    if (data) for (const g of data) map[g.orgao_id] = g;
    return map;
  } catch (err) {
    return {};
  }
}

async function associarGestorAoOrgao(orgaoId, nomeGestor) {
  if (!nomeGestor) return;
  let { data: existente, error } = await supabase
    .from("gestores_orgaos")
    .select("id")
    .eq("nome_responsavel", nomeGestor)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  const registro = {
    orgao_id: orgaoId,
    nome_responsavel: nomeGestor,
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!existente) {
    await supabase.from("gestores_orgaos").insert(registro);
  } else {
    await supabase
      .from("gestores_orgaos")
      .update({ data_fim: new Date().toISOString().split("T")[0] })
      .eq("orgao_id", orgaoId)
      .is("data_fim", null);
    await supabase.from("gestores_orgaos").insert(registro);
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
    if (datalist)
      datalist.innerHTML = nomes
        .map((n) => `<option value="${n.replace(/"/g, "&quot;")}">`)
        .join("");
  } catch (err) {
    console.warn(err);
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
      await supabase
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
    } else {
      await supabase.from("gestores_orgaos").insert({
        orgao_id,
        nome_responsavel,
        cargo_responsavel,
        data_inicio,
        data_fim: data_fim || null,
        observacao,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function excluirGestor(id) {
  await supabase.from("gestores_orgaos").delete().eq("id", id);
}

// ========== POPULAR SELECTS ==========
async function popularSelectTiposAto(selectElementId, includeEmpty = true) {
  const select = document.getElementById(selectElementId);
  if (!select) return;
  let options = includeEmpty ? '<option value="">Selecione...</option>' : "";
  for (const t of tiposAto) {
    if (t.ativo !== false)
      options += `<option value="${t.id}">${t.nome} (${t.sigla})</option>`;
  }
  select.innerHTML = options;
}

async function popularSelectOrgaos(selectElementId, includeEmpty = true) {
  const select = document.getElementById(selectElementId);
  if (!select) return;
  let options = includeEmpty ? '<option value="">Selecione...</option>' : "";
  for (const o of orgaos)
    options += `<option value="${o.id}">${o.nome}</option>`;
  select.innerHTML = options;
}

// ========== SUGESTÃO DE NÚMERO ==========
async function sugerirProximoNumeroAto(tipoId, ano) {
  if (!tipoId || !ano) return null;
  const { data, error } = await supabase
    .from("atos_oficiais")
    .select("numero")
    .eq("tipo_id", parseInt(tipoId))
    .eq("ano", parseInt(ano))
    .order("numero", { ascending: false })
    .limit(1);
  if (error || !data.length) return 1;
  return data[0].numero + 1;
}

function setupSugestaoNumero() {
  const tipoSelect = document.getElementById("tipoAto");
  const anoInput = document.getElementById("anoAto");
  const numeroInput = document.getElementById("numeroAto");
  if (!tipoSelect || !anoInput || !numeroInput) return;
  async function atualizar() {
    const tipoId = tipoSelect.value;
    const ano = anoInput.value;
    const atoId = document.getElementById("atoId").value;
    if (atoId) return;
    const sugestao = await sugerirProximoNumeroAto(tipoId, ano);
    numeroInput.placeholder = sugestao ? `Nº (sugestão: ${sugestao})` : "Nº";
  }
  tipoSelect.addEventListener("change", atualizar);
  anoInput.addEventListener("input", atualizar);
}

// ========== DASHBOARD ==========
function atualizarBreakdowns() {
  if (!atos.length || !tiposAto.length) return;
  function contarPorTipo(filtrados) {
    const counts = {};
    filtrados.forEach(
      (a) => (counts[a.tipo_id] = (counts[a.tipo_id] || 0) + 1),
    );
    return counts;
  }
  const totalCounts = contarPorTipo(atos);
  const vigentes = atos.filter((a) => a.status === "Vigente");
  const revogados = atos.filter((a) => a.status === "Revogado");
  const alterados = atos.filter((a) => a.status === "Alterado");
  function renderBreakdown(containerId, counts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = "";
    for (const t of tiposAto) {
      const qtd = counts[t.id] || 0;
      if (qtd > 0)
        html += `<div class="breakdown-item"><span class="breakdown-label">${t.nome}</span><span class="breakdown-value">${qtd}</span></div>`;
    }
    container.innerHTML =
      html || '<div class="breakdown-loading">Nenhum ato</div>';
  }
  renderBreakdown("breakdownTotal", totalCounts);
  renderBreakdown("breakdownVigentes", contarPorTipo(vigentes));
  renderBreakdown("breakdownRevogados", contarPorTipo(revogados));
  renderBreakdown("breakdownAlterados", contarPorTipo(alterados));
}

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

  const recentes = [...atos]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);
  const tbody = document.querySelector("#tableAtosRecentes tbody");
  if (!recentes.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">Nenhum ato cadastrado.</td></tr>';
    return;
  }
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
        <button class="btn btn-sm btn-outline" onclick="visualizarAto(${ato.id})" title="Visualizar">👁️</button>
        ${usuarioAtual?.perfil === "ADMIN" || usuarioAtual?.perfil === "SECRETARIO" ? `<button class="btn btn-sm btn-outline" onclick="editarAto(${ato.id})" title="Editar">✏️</button>` : ""}
        <button class="btn btn-sm btn-outline" onclick="gerenciarRelacionamentos(${ato.id})" title="Relacionamentos">🔗</button>
      </td>
    </tr>`,
    )
    .join("");
  atualizarBreakdowns();
}

// ========== CONFIGURAÇÕES (TABELAS INLINE) ==========
function renderizarTiposAtoInline() {
  const tbody = document.getElementById("tableTiposAtoBodyInline");
  if (!tiposAto.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Nenhum tipo.</td></tr>';
    return;
  }
  tbody.innerHTML = tiposAto
    .map(
      (t) => `
    <tr>
      <td>${t.nome}</td><td>${t.sigla}</td><td>${t.ordem || 0}</td>
      <td>${t.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="editarTipoAto(${t.id})" title="Editar">✏️</button>
        <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirTipoAto(${t.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`,
    )
    .join("");
}

async function renderizarOrgaosInline() {
  const tbody = document.getElementById("tableOrgaosBodyInline");
  if (!orgaos.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Nenhum órgão.</td></tr>';
    return;
  }
  const gestoresMap = await carregarTodosGestoresAtuais();
  let html = "";
  for (const o of orgaos) {
    const g = gestoresMap[o.id];
    const gestorDisplay = g
      ? `${g.nome_responsavel} (${g.cargo_responsavel || ""})`
      : "—";
    html += `
    <tr>
      <td>${o.nome}</td><td>${o.sigla || "-"}</td>
      <td>${gestorDisplay}</td><td>${o.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="editarOrgao(${o.id})" title="Editar">✏️</button>
        <button class="btn btn-sm btn-outline" onclick="gerenciarGestores(${o.id}, '${o.nome.replace(/'/g, "\\'")}')" title="Gestores">👥</button>
        <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirOrgao(${o.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

function renderizarUsuariosInline() {
  const tbody = document.getElementById("tableUsuariosBodyInline");
  if (!usuarios.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">Nenhum usuário.</td></tr>';
    return;
  }
  tbody.innerHTML = usuarios
    .map(
      (u) => `
    <tr>
      <td>${u.nome}</td><td>${u.email}</td>
      <td><span class="badge-perfil">${u.perfil || "N/A"}</span></td>
      <td>${u.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
      <td>${u.ultimo_login ? formatarData(u.ultimo_login.split("T")[0]) : "-"}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="editarUsuario(${u.id})" title="Editar">✏️</button>
        <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirUsuario(${u.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`,
    )
    .join("");
}

function initConfigTabs() {
  document.querySelectorAll(".config-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      document
        .querySelectorAll(".config-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document
        .querySelectorAll(".config-panel")
        .forEach((p) => (p.style.display = "none"));
      const panel = document.getElementById(
        `config${target.charAt(0).toUpperCase() + target.slice(1)}Panel`,
      );
      if (panel) panel.style.display = "block";
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
      '<tr class="empty-row"><td colspan="7">Nenhum ato encontrado.</td></tr>';
  } else {
    tbody.innerHTML = paginaDados
      .map(
        (ato) => `
      <tr class="${ato.status === "Revogado" ? "row-revogado" : ""}">
        <td><strong>${ato.tipo_sigla || "?"}</strong></td>
        <td>${ato.numero}/${ato.ano}</td>
        <td>${ato.orgao_nome}</td>
        <td class="ementa-truncada" title="${ato.ementa.replace(/"/g, "&quot;")}">${ato.ementa.length > 60 ? ato.ementa.substring(0, 60) + "..." : ato.ementa}</td>
        <td><span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span></td>
        <td>${formatarData(ato.data_publicacao)}</td>
        <td class="acoes-cell">
          <button class="btn btn-sm btn-outline" onclick="visualizarAto(${ato.id})" title="Visualizar">👁️</button>
          ${usuarioAtual?.perfil === "ADMIN" || usuarioAtual?.perfil === "SECRETARIO" ? `<button class="btn btn-sm btn-outline" onclick="editarAto(${ato.id})" title="Editar">✏️</button>` : ""}
          <button class="btn btn-sm btn-outline" onclick="gerenciarRelacionamentos(${ato.id})" title="Relacionamentos">🔗</button>
          <button class="btn btn-sm btn-outline" onclick="abrirAnexosModal(${ato.id})" title="Anexos">📎</button>
          <button class="btn btn-sm btn-outline" onclick="abrirHistoricoModal(${ato.id})" title="Histórico">📜</button>
          ${usuarioAtual?.perfil === "ADMIN" ? `<button class="btn btn-sm btn-outline btn-excluir" onclick="confirmarExcluirAto(${ato.id})" title="Excluir">🗑️</button>` : ""}
        </td>
      </tr>`,
      )
      .join("");
  }
  document.getElementById("btnPagAnterior").disabled = paginaAtualAtos <= 1;
  document.getElementById("btnPagProximo").disabled =
    paginaAtualAtos >= totalPaginas;
  document.getElementById("pageInfoAtos").textContent =
    `Página ${paginaAtualAtos} de ${totalPaginas}`;
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

// ========== CRUD ATOS (COM UPLOAD REAL PARA STORAGE) ==========
async function fazerUploadArquivo(file, bucket, prefixo) {
  if (!file) return null;
  const nomeUnico = `${prefixo}-${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(nomeUnico, file, {
      cacheControl: "3600",
      upsert: true,
    });
  if (error) {
    console.error(error);
    throw error;
  }
  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(nomeUnico);
  return publicUrlData.publicUrl;
}

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

  mostrarLoading(true);
  try {
    let pdfUrl = atos.find((a) => a.id === parseInt(atoId))?.pdf_url || "";
    let docUrl = atos.find((a) => a.id === parseInt(atoId))?.doc_url || "";

    if (currentPdfFile) {
      pdfUrl = await fazerUploadArquivo(
        currentPdfFile,
        "atos-pdfs",
        `ato-${numero}-${ano}`,
      );
    }
    if (currentDocFile) {
      docUrl = await fazerUploadArquivo(
        currentDocFile,
        "atos-docs",
        `ato-${numero}-${ano}`,
      );
    }

    const dadosAto = {
      tipo_id: parseInt(tipo),
      numero,
      ano,
      orgao_id: orgao,
      ementa,
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
      pdf_url: pdfUrl,
      doc_url: docUrl,
    };

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
      showNotification("success", "Atualizado", "Ato atualizado.");
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
      showNotification("success", "Criado", "Ato cadastrado.");
    }
    window.desmarcarFormAlterado?.();
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
      await supabase.from("atos_oficiais").delete().eq("id", id);
      showNotification("success", "Excluído", "Ato removido.");
      await carregarAtosSupabase();
      await recarregarTudo();
      mostrarLoading(false);
    },
  );
}

function editarAto(id) {
  const ato = atos.find((a) => a.id === id);
  if (!ato) return;
  document.getElementById("atoModal").style.display = "flex";
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
  document.getElementById("tagsList").innerHTML = "";
  if (ato.palavras_chave)
    ato.palavras_chave.forEach((tag) => adicionarTagVisual(tag));
  if (
    ato.pdf_url &&
    (ato.pdf_url.startsWith("https://") || ato.pdf_url.startsWith("http://"))
  ) {
    document.getElementById("pdfPreview").style.display = "flex";
    const urlParts = ato.pdf_url.split("/");
    document.getElementById("pdfName").textContent =
      urlParts[urlParts.length - 1];
    document.getElementById("pdfPreviewContainer").style.display = "block";
    document.getElementById("pdfPreviewFrame").src = ato.pdf_url;
  } else {
    document.getElementById("pdfPreview").style.display = "none";
    document.getElementById("pdfPreviewContainer").style.display = "none";
  }
  if (
    ato.doc_url &&
    (ato.doc_url.startsWith("https://") || ato.doc_url.startsWith("http://"))
  ) {
    document.getElementById("docPreview").style.display = "flex";
    document.getElementById("docName").textContent = ato.doc_url
      .split("/")
      .pop();
  } else {
    document.getElementById("docPreview").style.display = "none";
  }
  marcarFormAlterado();
}

function abrirAtoModal() {
  if (
    usuarioAtual?.perfil !== "ADMIN" &&
    usuarioAtual?.perfil !== "SECRETARIO"
  ) {
    showNotification("error", "Permissão", "Sem autorização.");
    return;
  }
  document.getElementById("atoModal").style.display = "flex";
  document.getElementById("atoModalTitle").textContent = "Cadastrar Novo Ato";
  resetarFormAto();
  const tipoSelect = document.getElementById("tipoAto");
  const anoInput = document.getElementById("anoAto");
  if (tipoSelect.value && anoInput.value)
    tipoSelect.dispatchEvent(new Event("change"));
}

function closeAtoModal() {
  if (window.formAlterado) {
    if (!confirm("Há alterações não salvas. Deseja realmente fechar?")) return;
  }
  document.getElementById("atoModal").style.display = "none";
  resetarFormAto();
  window.desmarcarFormAlterado?.();
}

function resetarFormAto() {
  document.getElementById("atoForm")?.reset();
  document.getElementById("atoId").value = "";
  document.getElementById("textoCompletoEditor").innerHTML = "";
  document.getElementById("tagsList").innerHTML = "";
  document.getElementById("pdfPreview").style.display = "none";
  document.getElementById("docPreview").style.display = "none";
  document.getElementById("pdfPreviewContainer").style.display = "none";
  document.getElementById("pdfPreviewFrame").src = "";
  currentPdfFile = null;
  currentDocFile = null;
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
        const idLimpo = anchorId.trim().toLowerCase().replace(/\s+/g, "_");
        const span = document.createElement("span");
        span.id = idLimpo;
        span.style.backgroundColor = "#e8f5e9";
        span.style.padding = "0 2px";
        span.style.borderRadius = "4px";
        span.setAttribute("title", `Âncora: ${idLimpo}`);
        span.textContent = selectedText;
        range.deleteContents();
        range.insertNode(span);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        showNotification(
          "success",
          "Âncora criada",
          `ID "${idLimpo}" adicionado.`,
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
        currentPdfFile = e.target.files[0];
        document.getElementById("pdfPreview").style.display = "flex";
        document.getElementById("pdfName").textContent = currentPdfFile.name;
        const url = URL.createObjectURL(currentPdfFile);
        document.getElementById("pdfPreviewContainer").style.display = "block";
        document.getElementById("pdfPreviewFrame").src = url;
        marcarFormAlterado?.();
      }
    });
  }
  const docArea = document.getElementById("docUploadArea");
  const docInput = document.getElementById("docUpload");
  if (docArea && docInput) {
    docArea.addEventListener("click", () => docInput.click());
    docInput.addEventListener("change", (e) => {
      if (e.target.files.length) {
        currentDocFile = e.target.files[0];
        document.getElementById("docPreview").style.display = "flex";
        document.getElementById("docName").textContent = currentDocFile.name;
        marcarFormAlterado?.();
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
    currentPdfFile = null;
    document.getElementById("pdfPreview").style.display = "none";
    document.getElementById("pdfPreviewContainer").style.display = "none";
  } else if (tipo === "doc") {
    document.getElementById("docUpload").value = "";
    currentDocFile = null;
    document.getElementById("docPreview").style.display = "none";
  }
};

// ========== RELACIONAMENTOS ==========
async function carregarRelacionamentos(atoId) {
  const { data: asOrigem } = await supabase
    .from("relacionamentos_atos")
    .select(
      "*, ato_destino:ato_destino_id(id, tipos_ato (nome, sigla), numero, ano)",
    )
    .eq("ato_origem_id", atoId);
  const { data: asDestino } = await supabase
    .from("relacionamentos_atos")
    .select(
      "*, ato_origem:ato_origem_id(id, tipos_ato (nome, sigla), numero, ano)",
    )
    .eq("ato_destino_id", atoId);
  return { origem: asOrigem || [], destino: asDestino || [] };
}

async function carregarAlteracoesDispositivos(atoId) {
  const { data } = await supabase
    .from("alteracoes_dispositivos")
    .select(
      "*, ato_alterador:ato_alterador_id(id, tipos_ato (nome, sigla), numero, ano)",
    )
    .eq("ato_origem_id", atoId);
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

  // limpar campos
  document.getElementById("relIdentificadorDispositivo").value = "";
  document.getElementById("relNovoTexto").value = "";
  document.getElementById("relTipoDispositivo").value = "revogado";
  document.getElementById("relNovoTextoGroup").style.display = "none";

  const rels = await carregarRelacionamentos(atoId);
  const listaDiv = document.getElementById("relacionamentosList");
  if (!rels.origem.length && !rels.destino.length)
    listaDiv.innerHTML = '<p class="empty-state">Nenhum relacionamento.</p>';
  else {
    let html = "";
    if (rels.origem.length) {
      html += `<h4>📌 Este ato:</h4><ul>`;
      rels.origem.forEach((r) => {
        html += `<li><strong>${r.tipo}</strong> → <a href="#" onclick="visualizarAto(${r.ato_destino.id}); return false;">${r.ato_destino.tipos_ato?.nome} ${r.ato_destino.numero}/${r.ato_destino.ano}</a> <button class="btn btn-sm btn-outline btn-excluir" onclick="removerRelacionamento(${r.id})">🗑️</button></li>`;
      });
      html += `</ul>`;
    }
    if (rels.destino.length) {
      html += `<h4>🔁 Referenciado por:</h4><ul>`;
      rels.destino.forEach((r) => {
        html += `<li><strong>${r.tipo}</strong> ← <a href="#" onclick="visualizarAto(${r.ato_origem.id}); return false;">${r.ato_origem.tipos_ato?.nome} ${r.ato_origem.numero}/${r.ato_origem.ano}</a> <button class="btn btn-sm btn-outline btn-excluir" onclick="removerRelacionamento(${r.id})">🗑️</button></li>`;
      });
      html += `</ul>`;
    }
    listaDiv.innerHTML = html;
  }

  const alts = await carregarAlteracoesDispositivos(atoId);
  const altDiv = document.getElementById("alteracoesList");
  altDiv.innerHTML = ""; // limpa o container
  if (!alts.length)
    altDiv.innerHTML = '<p class="empty-state">Nenhuma alteração pontual.</p>';
  else {
    let altHtml = `<ul>`;
    alts.forEach((alt) => {
      altHtml += `<li><strong>${alt.tipo === "revogado" ? "🚫 Revogado" : alt.tipo === "alterado" ? "✏️ Alterado" : "➕ Acrescentado"}</strong> dispositivo "<code>${alt.identificador_dispositivo}</code>" no ato ${alt.ato_origem_id} por <a href="#" onclick="visualizarAto(${alt.ato_alterador.id}); return false;">${alt.ato_alterador.tipos_ato?.nome} ${alt.ato_alterador.numero}/${alt.ato_alterador.ano}</a> <button class="btn btn-sm btn-outline btn-excluir" onclick="removerAlteracaoDispositivo(${alt.id})">🗑️</button>`;
      if (alt.tipo === "alterado")
        altHtml += `<br><small>Novo texto: ${alt.novo_texto.substring(0, 100)}${alt.novo_texto.length > 100 ? "..." : ""}</small>`;
      altHtml += `</li>`;
    });
    altHtml += `</ul>`;
    altDiv.innerHTML = altHtml;
  }

  // configuração do campo novo texto dependendo do tipo
  const tipoDispositivo = document.getElementById("relTipoDispositivo");
  tipoDispositivo.addEventListener("change", function () {
    document.getElementById("relNovoTextoGroup").style.display =
      this.value === "alterado" ? "block" : "none";
  });
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
  await supabase.from("relacionamentos_atos").insert({
    ato_origem_id: currentRelAtoId,
    ato_destino_id: parseInt(destinoId),
    tipo,
    usuario_cadastro_id: usuarioAtual.id,
    created_at: new Date(),
  });
  showNotification("success", "Vínculo criado", "Relacionamento adicionado.");
  await atualizarModalRelacionamentos(currentRelAtoId);
  mostrarLoading(false);
}

async function removerRelacionamento(relId) {
  showConfirm("Remover vínculo", "Deseja remover?", "⚠️", async () => {
    mostrarLoading(true);
    await supabase.from("relacionamentos_atos").delete().eq("id", relId);
    showNotification("success", "Removido", "Vínculo removido.");
    await atualizarModalRelacionamentos(currentRelAtoId);
    mostrarLoading(false);
  });
}

async function adicionarAlteracaoDispositivo() {
  if (!currentRelAtoId) return;
  const atoAlvoId = document.getElementById("relDispositivoAtoId").value;
  const identificador = String(
    document.getElementById("relIdentificadorDispositivo").value || "",
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
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
  await supabase.from("alteracoes_dispositivos").insert({
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
  // limpar campos
  document.getElementById("relIdentificadorDispositivo").value = "";
  document.getElementById("relNovoTexto").value = "";
  document.getElementById("relTipoDispositivo").value = "revogado";
  document.getElementById("relNovoTextoGroup").style.display = "none";
  await atualizarModalRelacionamentos(currentRelAtoId);
  mostrarLoading(false);
}

async function removerAlteracaoDispositivo(altId) {
  showConfirm("Remover alteração", "Deseja remover?", "⚠️", async () => {
    mostrarLoading(true);
    await supabase.from("alteracoes_dispositivos").delete().eq("id", altId);
    showNotification("success", "Removido", "Alteração removida.");
    await atualizarModalRelacionamentos(currentRelAtoId);
    mostrarLoading(false);
  });
}

// ========== VISUALIZAÇÃO DE ATO (MODAL COM ABAS) - CORRIGIDO ==========
async function visualizarAto(id) {
  currentViewAtoId = id;
  const modal = document.getElementById("viewAtoModal");
  modal.style.display = "flex";
  document.getElementById("viewAtoLoading").style.display = "block";
  document.getElementById("viewAtoData").style.display = "none";

  try {
    const ato = atos.find((a) => a.id === id);
    if (!ato) throw new Error("Ato não encontrado localmente.");
    const [relOrigemRes, relDestinoRes, alteracoesRes] = await Promise.all([
      supabase
        .from("relacionamentos_atos")
        .select(
          "tipo, ato_destino:ato_destino_id(id, tipos_ato (nome, sigla), numero, ano)",
        )
        .eq("ato_origem_id", id),
      supabase
        .from("relacionamentos_atos")
        .select(
          "tipo, ato_origem:ato_origem_id(id, tipos_ato (nome, sigla), numero, ano)",
        )
        .eq("ato_destino_id", id),
      supabase
        .from("alteracoes_dispositivos")
        .select(
          "id, tipo, identificador_dispositivo, novo_texto, ato_alterador:ato_alterador_id(id, tipos_ato (nome, sigla), numero, ano)",
        )
        .eq("ato_origem_id", id),
    ]);

    // Preencher campos básicos
    document.getElementById("viewAtoTipo").textContent =
      `${ato.tipo_nome || "—"} (${ato.tipo_sigla || "?"})`;
    document.getElementById("viewAtoNumeroAno").textContent =
      `${ato.numero}/${ato.ano}`;
    document.getElementById("viewAtoOrgao").textContent = ato.orgao_nome || "—";
    const statusEl = document.getElementById("viewAtoStatus");
    statusEl.textContent = ato.status;
    statusEl.className = `status-badge status-${ato.status.toLowerCase()}`;
    document.getElementById("viewAtoDataPub").textContent = formatarData(
      ato.data_publicacao,
    );
    document.getElementById("viewAtoEmenta").textContent = ato.ementa;
    document.getElementById("viewAtoVersao").textContent = ato.versao || 1;

    document.getElementById("viewAtoDiarioContainer").style.display =
      ato.edicao_diario ? "block" : "none";
    if (ato.edicao_diario)
      document.getElementById("viewAtoDiario").textContent =
        `Edição ${ato.edicao_diario}, Página ${ato.pagina_diario}`;
    document.getElementById("viewAtoTagsContainer").style.display = ato
      .palavras_chave?.length
      ? "block"
      : "none";
    if (ato.palavras_chave?.length)
      document.getElementById("viewAtoTags").textContent =
        ato.palavras_chave.join(", ");

    // Texto Completo (com aplicação de estilos)
    const textoContainer = document.getElementById("viewAtoTextoCompleto");
    textoContainer.innerHTML = ato.texto_completo || "<em>Sem texto.</em>";

    const alteracoes = alteracoesRes.data || [];
    aplicarEstilosDispositivos(textoContainer, alteracoes);

    // Relacionamentos (origem e destino)
    const relsOrigem = relOrigemRes.data || [];
    const relsDestino = relDestinoRes.data || [];

    let relHtmlOrigem = "";
    if (relsOrigem.length) {
      relHtmlOrigem = `<div class="view-relacionamentos-box"><h5>📌 Este ato:</h5><ul>${relsOrigem
        .map((r) => {
          const dest = r.ato_destino;
          return `<li>${r.tipo} → <a href="#" onclick="visualizarAto(${dest.id}); return false;">${dest.tipos_ato?.nome} ${dest.numero}/${dest.ano}</a></li>`;
        })
        .join("")}</ul></div>`;
    }
    let relHtmlDestino = "";
    if (relsDestino.length) {
      relHtmlDestino = `<div class="view-relacionamentos-box"><h5>🔁 Referenciado por:</h5><ul>${relsDestino
        .map((r) => {
          const orig = r.ato_origem;
          return `<li>${r.tipo} ← <a href="#" onclick="visualizarAto(${orig.id}); return false;">${orig.tipos_ato?.nome} ${orig.numero}/${orig.ano}</a></li>`;
        })
        .join("")}</ul></div>`;
    }
    document.getElementById("viewAtoRelacionamentosOrigem").innerHTML =
      relHtmlOrigem;
    document.getElementById("viewAtoRelacionamentosDestino").innerHTML =
      relHtmlDestino;

    let altHtml = "";
    if (alteracoes.length) {
      altHtml = `<div class="view-alteracoes-box"><h5>✏️ Alterações em dispositivos:</h5><ul>${alteracoes
        .map((alt) => {
          const alterador = alt.ato_alterador;
          const nomeAlterador = alterador
            ? `${alterador.tipos_ato?.nome} ${alterador.numero}/${alterador.ano}`
            : "Desconhecido";
          const tipoDesc =
            alt.tipo === "revogado"
              ? "🚫 Revogado"
              : alt.tipo === "alterado"
                ? "✏️ Alterado"
                : "➕ Acrescentado";
          let extra =
            alt.tipo === "alterado" && alt.novo_texto
              ? `<br><small>Novo texto: ${alt.novo_texto.substring(0, 150)}</small>`
              : "";
          return `<li>${tipoDesc} "<code>${alt.identificador_dispositivo}</code>" por <a href="#" onclick="visualizarAto(${alterador?.id}); return false;">${nomeAlterador}</a>${extra}</li>`;
        })
        .join("")}</ul></div>`;
    }
    document.getElementById("viewAtoAlteracoesLista").innerHTML = altHtml;

    // Configurar botões de ação
    document.getElementById("viewBtnEditar").onclick = () => {
      closeViewAtoModal();
      editarAto(id);
    };
    document.getElementById("viewBtnGerenciarRels").onclick = () => {
      closeViewAtoModal();
      gerenciarRelacionamentos(id);
    };
    document.getElementById("viewBtnGerenciarAlts").onclick = () => {
      closeViewAtoModal();
      gerenciarRelacionamentos(id);
    };

    // Ocultar loading, mostrar dados
    document.getElementById("viewAtoLoading").style.display = "none";
    document.getElementById("viewAtoData").style.display = "block";

    // Ativar primeira aba
    ativarAbaView("detalhes");
  } catch (err) {
    console.error(err);
    showNotification("error", "Erro", "Falha ao carregar detalhes.");
    closeViewAtoModal();
  }
}

function ativarAbaView(tabName) {
  document
    .querySelectorAll(".view-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".view-tab-panel")
    .forEach((p) => p.classList.add("hidden"));
  const tabBtn = document.querySelector(`.view-tab[data-tab="${tabName}"]`);
  if (tabBtn) tabBtn.classList.add("active");
  const panel = document.getElementById(
    `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`,
  );
  if (panel) panel.classList.remove("hidden");
}

window.visualizarAto = visualizarAto;

function closeViewAtoModal() {
  document.getElementById("viewAtoModal").style.display = "none";
}

function downloadPDFAdmin() {
  if (!currentViewAtoId) return;
  downloadPDF(currentViewAtoId);
}

// ========== LINK PÚBLICO ==========
function copiarLinkPublico() {
  if (!currentViewAtoId) return;
  const url = `${window.location.origin}/portal-atos-oficiais.html?ato=${currentViewAtoId}`;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      showNotification("success", "Link copiado", "Link público copiado.");
    })
    .catch(() => {
      prompt("Copie o link:", url);
    });
}

function abrirLinkPublico() {
  if (!currentViewAtoId) return;
  const url = `${window.location.origin}/portal-atos-oficiais.html?ato=${currentViewAtoId}`;
  window.open(url, "_blank");
}

window.copiarLinkPublico = copiarLinkPublico;
window.abrirLinkPublico = abrirLinkPublico;
window.downloadPDFAdmin = downloadPDFAdmin;

// ========== DOWNLOAD PDF ==========
async function downloadPDF(atoId) {
  const id = atoId || currentViewAtoId;
  if (!id) return;
  const { data, error } = await supabase
    .from("atos_oficiais")
    .select("pdf_url")
    .eq("id", id)
    .single();
  if (error || !data?.pdf_url) {
    showNotification("warning", "Indisponível", "PDF não disponível.");
    return;
  }
  window.open(data.pdf_url, "_blank");
}
window.downloadPDF = downloadPDF;

// ========== EXPORTAÇÃO DE LISTA ==========
function exportarLista(formato) {
  const dados = filtrarAtos();
  if (!dados.length) {
    showNotification("warning", "Sem dados", "Não há atos para exportar.");
    return;
  }
  if (formato === "excel") {
    let csv = "Tipo,Número,Ano,Órgão,Ementa,Status,Data Publicação\n";
    dados.forEach((a) => {
      csv += `"${a.tipo_sigla || ""}",${a.numero},${a.ano},"${a.orgao_nome || ""}","${a.ementa.replace(/"/g, '""')}","${a.status}",${formatarData(a.data_publicacao)}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "atos_oficiais.csv";
    link.click();
    URL.revokeObjectURL(url);
    showNotification("success", "Exportado", "Lista exportada como CSV.");
  } else if (formato === "pdf") {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Atos Oficiais</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f0f0f0; }
      </style></head><body>
      <h2>Atos Oficiais</h2>
      <table><thead><tr><th>Tipo</th><th>Nº/Ano</th><th>Órgão</th><th>Ementa</th><th>Status</th><th>Data</th></tr></thead><tbody>
      ${dados.map((a) => `<tr><td>${a.tipo_sigla}</td><td>${a.numero}/${a.ano}</td><td>${a.orgao_nome}</td><td>${a.ementa}</td><td>${a.status}</td><td>${formatarData(a.data_publicacao)}</td></tr>`).join("")}
      </tbody></table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
}
window.exportarLista = exportarLista;

// ========== CRUD TIPOS, ORGAOS, USUARIOS (mantidos) ==========
// (códigos dos CRUDs estão preservados do original)

async function abrirModalTipoAto(id) {
  if (!usuarioAtual || usuarioAtual.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  document.getElementById("tipoAtoModal").style.display = "flex";
  if (id) {
    const t = tiposAto.find((t) => t.id === id);
    if (t) {
      document.getElementById("tipoAtoModalTitle").innerText =
        "Editar Tipo de Ato";
      document.getElementById("tipoAtoId").value = t.id;
      document.getElementById("tipoAtoNome").value = t.nome;
      document.getElementById("tipoAtoSigla").value = t.sigla;
      document.getElementById("tipoAtoOrdem").value = t.ordem || 0;
      document.getElementById("tipoAtoAtivo").value = t.ativo
        ? "true"
        : "false";
    }
  } else {
    document.getElementById("tipoAtoModalTitle").innerText = "Novo Tipo de Ato";
    document.getElementById("tipoAtoForm").reset();
    document.getElementById("tipoAtoId").value = "";
  }
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
  if (id) {
    await supabase
      .from("tipos_ato")
      .update({ nome, sigla, ordem, ativo })
      .eq("id", parseInt(id));
  } else {
    await supabase.from("tipos_ato").insert({ nome, sigla, ordem, ativo });
  }
  await carregarTiposAtoSupabase();
  renderizarTiposAtoInline();
  await popularSelectTiposAto("tipoAto", true);
  await popularSelectTiposAto("filtroTipo", true);
  closeTipoAtoModal();
  mostrarLoading(false);
}
window.salvarTipoAto = salvarTipoAto;

async function excluirTipoAto(id) {
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
  showConfirm(
    "Excluir tipo",
    `Excluir "${tiposAto.find((t) => t.id === id)?.nome}"?`,
    "🗑️",
    async () => {
      await supabase.from("tipos_ato").delete().eq("id", id);
      await carregarTiposAtoSupabase();
      renderizarTiposAtoInline();
      await popularSelectTiposAto("tipoAto", true);
      await popularSelectTiposAto("filtroTipo", true);
      showNotification("success", "Excluído", "Tipo removido.");
    },
  );
}
window.excluirTipoAto = excluirTipoAto;
window.editarTipoAto = (id) => abrirModalTipoAto(id);

// Órgãos (resumido)
window.abrirOrgaoModal = async (id) => {
  if (usuarioAtual?.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  await carregarListaGestoresParaDatalist();
  document.getElementById("orgaoModal").style.display = "flex";
  if (id) {
    const o = orgaos.find((o) => o.id === id);
    if (o) {
      document.getElementById("orgaoModalTitle").innerText = "Editar Órgão";
      document.getElementById("orgaoId").value = o.id;
      document.getElementById("orgaoNome").value = o.nome;
      document.getElementById("orgaoSigla").value = o.sigla || "";
      document.getElementById("orgaoTipo").value = o.tipo || "SECRETARIA";
      document.getElementById("orgaoStatus").value = o.ativo ? "true" : "false";
      const gestor = await obterGestorAtual(o.id);
      if (gestor)
        document.getElementById("orgaoGestor").value = gestor.nome_responsavel;
    }
  } else {
    document.getElementById("orgaoModalTitle").innerText = "Novo Órgão";
    document.getElementById("orgaoForm").reset();
    document.getElementById("orgaoId").value = "";
  }
};
window.closeOrgaoModal = () =>
  (document.getElementById("orgaoModal").style.display = "none");
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
    showNotification("warning", "Informe o nome.");
    return;
  }
  mostrarLoading(true);
  if (id) {
    await supabase
      .from("orgaos")
      .update({ nome, sigla, ativo, tipo: tipo || null })
      .eq("id", parseInt(id));
    if (gestorNome) {
      const gestorAtual = await obterGestorAtual(parseInt(id));
      if (!gestorAtual || gestorAtual.nome_responsavel !== gestorNome) {
        await supabase
          .from("gestores_orgaos")
          .update({ data_fim: new Date().toISOString().split("T")[0] })
          .eq("orgao_id", id)
          .is("data_fim", null);
        await associarGestorAoOrgao(parseInt(id), gestorNome);
      }
    }
  } else {
    let siglaGerada = sigla;
    const { data: existente } = await supabase
      .from("orgaos")
      .select("sigla")
      .eq("sigla", siglaGerada)
      .maybeSingle();
    if (existente) siglaGerada += Math.floor(Math.random() * 1000);
    const { data: newOrg } = await supabase
      .from("orgaos")
      .insert({ nome, sigla: siglaGerada, ativo, tipo: tipo || null })
      .select()
      .single();
    if (gestorNome) await associarGestorAoOrgao(newOrg.id, gestorNome);
  }
  await carregarOrgaosSupabase();
  await renderizarOrgaosInline();
  await popularSelectOrgaos("orgaoAto", true);
  await popularSelectOrgaos("filtroOrgao", true);
  closeOrgaoModal();
  mostrarLoading(false);
};
window.excluirOrgao = (id) => {
  const org = orgaos.find((o) => o.id === id);
  if (!org) return;
  showConfirm("Excluir órgão", `Excluir "${org.nome}"?`, "🗑️", async () => {
    await supabase.from("orgaos").delete().eq("id", id);
    await carregarOrgaosSupabase();
    await renderizarOrgaosInline();
    await popularSelectOrgaos("orgaoAto", true);
    await popularSelectOrgaos("filtroOrgao", true);
  });
};
window.editarOrgao = (id) => window.abrirOrgaoModal(id);

// Gestores (resumido)
async function gerenciarGestores(orgaoId, orgaoNome) {
  if (usuarioAtual?.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  currentOrgaoGestorId = orgaoId;
  document.getElementById("orgaoGestorInfo").innerHTML =
    `<strong>${orgaoNome}</strong> - Gestores do órgão`;
  await listarGestores(orgaoId);
  document.getElementById("gestoresModal").style.display = "flex";
}
async function listarGestores(orgaoId) {
  const gestores = await carregarGestores(orgaoId);
  const container = document.getElementById("gestoresList");
  if (!gestores.length) {
    container.innerHTML = '<p class="empty-state">Nenhum gestor.</p>';
    return;
  }
  let html =
    '<table class="table"><thead><tr><th>Nome</th><th>Cargo</th><th>Início</th><th>Término</th><th>Ações</th></tr></thead><tbody>';
  gestores.forEach((g) => {
    html += `<tr><td>${g.nome_responsavel}</td><td>${g.cargo_responsavel || "-"}</td><td>${formatarData(g.data_inicio)}</td><td>${g.data_fim ? formatarData(g.data_fim) : "<em>Atual</em>"}</td>
      <td><button class="btn btn-sm btn-outline" onclick="editarGestor(${g.id}, ${g.orgao_id})">✏️</button>
      <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirGestorHandler(${g.id})">🗑️</button></td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}
function closeGestoresModal() {
  document.getElementById("gestoresModal").style.display = "none";
}
async function abrirFormGestor(id, orgaoId) {
  document.getElementById("gestorFormModal").style.display = "flex";
  if (id) {
    const gestores = await carregarGestores(orgaoId || currentOrgaoGestorId);
    const g = gestores.find((g) => g.id === id);
    if (g) {
      document.getElementById("gestorId").value = g.id;
      document.getElementById("gestorOrgaoId").value = g.orgao_id;
      document.getElementById("gestorNome").value = g.nome_responsavel;
      document.getElementById("gestorCargo").value = g.cargo_responsavel || "";
      document.getElementById("gestorDataInicio").value = g.data_inicio;
      document.getElementById("gestorDataFim").value = g.data_fim || "";
      document.getElementById("gestorObservacao").value = g.observacao || "";
    }
  } else {
    document.getElementById("gestorForm").reset();
    document.getElementById("gestorId").value = "";
    document.getElementById("gestorOrgaoId").value = currentOrgaoGestorId;
  }
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
    showNotification("warning", "Nome e data de início são obrigatórios.");
    return;
  }
  mostrarLoading(true);
  await salvarGestor({
    id: id || null,
    orgao_id,
    nome_responsavel: nome,
    cargo_responsavel: cargo,
    data_inicio: dataInicio,
    data_fim: dataFim,
    observacao,
  });
  closeGestorFormModal();
  await listarGestores(orgao_id);
  await renderizarOrgaosInline();
  mostrarLoading(false);
}
async function excluirGestorHandler(id) {
  showConfirm("Excluir gestor", "Deseja remover?", "🗑️", async () => {
    await excluirGestor(id);
    await listarGestores(currentOrgaoGestorId);
    await renderizarOrgaosInline();
  });
}
window.gerenciarGestores = gerenciarGestores;
window.closeGestoresModal = closeGestoresModal;
window.abrirFormGestor = abrirFormGestor;
window.closeGestorFormModal = closeGestorFormModal;
window.salvarGestorHandler = salvarGestorHandler;
window.editarGestor = (id, orgaoId) => abrirFormGestor(id, orgaoId);
window.excluirGestorHandler = excluirGestorHandler;

// Usuários (resumido)
async function abrirUsuarioModal(id) {
  if (usuarioAtual?.perfil !== "ADMIN") {
    showNotification("error", "Permissão", "Apenas administradores.");
    return;
  }
  document.getElementById("usuarioModal").style.display = "flex";
  if (id) {
    const u = usuarios.find((u) => u.id === id);
    if (u) {
      document.getElementById("usuarioId").value = u.id;
      document.getElementById("usuarioNome").value = u.nome;
      document.getElementById("usuarioEmail").value = u.email;
      document.getElementById("usuarioPerfil").value =
        u.perfil || "SOLICITANTE";
      document.getElementById("senhaGroup").style.display = "none";
    }
  } else {
    document.getElementById("usuarioForm").reset();
    document.getElementById("usuarioId").value = "";
    document.getElementById("senhaGroup").style.display = "block";
  }
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
    showNotification("warning", "Nome e e-mail obrigatórios.");
    return;
  }
  mostrarLoading(true);
  if (id) {
    await supabase
      .from("usuarios")
      .update({ nome, email, perfil, updated_at: new Date() })
      .eq("id", parseInt(id));
  } else {
    if (!senha || senha.length < 6) {
      showNotification("warning", "Senha deve ter no mínimo 6 caracteres.");
      mostrarLoading(false);
      return;
    }
    const { error: authError } = await supabase.auth.signUp({
      email,
      password: senha,
    });
    if (authError) throw authError;
    await supabase.from("usuarios").update({ nome, perfil }).eq("email", email);
  }
  await carregarUsuariosSupabase();
  renderizarUsuariosInline();
  closeUsuarioModal();
  mostrarLoading(false);
}
window.salvarUsuario = salvarUsuario;
async function excluirUsuario(id) {
  const u = usuarios.find((u) => u.id === id);
  if (!u) return;
  showConfirm("Excluir usuário", `Excluir "${u.nome}"?`, "🗑️", async () => {
    await supabase.from("usuarios").delete().eq("id", id);
    await carregarUsuariosSupabase();
    renderizarUsuariosInline();
  });
}
window.excluirUsuario = excluirUsuario;
window.editarUsuario = (id) => abrirUsuarioModal(id);

// ========== NAVEGAÇÃO E INICIALIZAÇÃO ==========
function initNavCards() {
  document.querySelectorAll(".card-nav").forEach((card) => {
    card.addEventListener("click", () => {
      const page = card.getAttribute("data-page");
      mostrarPagina(page);
    });
  });
}

function mostrarPagina(page) {
  document.querySelectorAll(".page").forEach((p) => (p.style.display = "none"));
  const target = document.getElementById(
    `page${page.charAt(0).toUpperCase() + page.slice(1)}`,
  );
  if (target) target.style.display = "block";
  document
    .querySelectorAll(".card-nav")
    .forEach((c) => c.classList.remove("active"));
  document
    .querySelector(`.card-nav[data-page="${page}"]`)
    ?.classList.add("active");
  const nomes = {
    dashboard: "Dashboard",
    atos: "Gestão de Atos",
    configuracoes: "Configurações",
  };
  document.getElementById("painelBreadcrumbCurrent").textContent =
    nomes[page] || page;
  if (page === "atos") carregarListaAtos();
  if (page === "configuracoes") {
    renderizarTiposAtoInline();
    renderizarOrgaosInline();
    renderizarUsuariosInline();
  }
}

window.mostrarPagina = mostrarPagina;

async function fazerLogout() {
  await supabase.auth.signOut();
  window.location.href = "intranet.html";
}

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

async function initAuth() {
  mostrarLoading(true);
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
    showNotification("error", "Acesso negado", "Usuário inválido ou inativo.");
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
  if (usuarioAtual.perfil !== "ADMIN" && usuarioAtual.perfil !== "SECRETARIO") {
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
    document.getElementById(id).addEventListener("change", aplicarFiltros);
  });
  document
    .getElementById("filtroBusca")
    .addEventListener("input", aplicarFiltros);
  initEditorTools();
  initUploads();
  initTags();
  setupSugestaoNumero();
  mostrarPagina("dashboard");

  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      ativarAbaView(tabName);
    });
  });

  window.marcarFormAlterado = () => {
    window.formAlterado = true;
    document.getElementById("unsavedWarning").style.display = "block";
  };
  window.desmarcarFormAlterado = () => {
    window.formAlterado = false;
    document.getElementById("unsavedWarning").style.display = "none";
  };
  window.formAlterado = false;

  document
    .querySelectorAll("#atoForm input, #atoForm textarea, #atoForm select")
    .forEach((el) => {
      el.addEventListener("input", () => window.marcarFormAlterado());
      el.addEventListener("change", () => window.marcarFormAlterado());
    });

  mostrarLoading(false);
}

// ========== EXPOSIÇÃO GLOBAL ==========
window.salvarAto = salvarAto;
window.confirmarExcluirAto = confirmarExcluirAto;
window.editarAto = editarAto;
window.abrirAtoModal = abrirAtoModal;
window.closeAtoModal = closeAtoModal;
window.fazerLogout = fazerLogout;
window.visualizarAtoPublico = visualizarAto;

// Relacionamentos
window.gerenciarRelacionamentos = async (id) => {
  if (!usuarioAtual) return;
  await atualizarModalRelacionamentos(id);
  document.getElementById("relacionamentoModal").style.display = "flex";
};
window.adicionarRelacionamento = adicionarRelacionamento;
window.removerRelacionamento = removerRelacionamento;
window.adicionarAlteracaoDispositivo = adicionarAlteracaoDispositivo;
window.removerAlteracaoDispositivo = removerAlteracaoDispositivo;
window.abrirAnexosModal = () => {
  document.getElementById("anexosModal").style.display = "flex";
};
window.closeAnexosModal = () => {
  document.getElementById("anexosModal").style.display = "none";
};
window.abrirHistoricoModal = () => {
  document.getElementById("historicoModal").style.display = "flex";
};
window.closeHistoricoModal = () => {
  document.getElementById("historicoModal").style.display = "none";
};

initAuth();
