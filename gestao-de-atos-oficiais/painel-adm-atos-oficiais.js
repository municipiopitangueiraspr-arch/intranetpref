// ============================================
// gestao-de-atos-oficiais/painel-adm-atos-oficiais.js
// Módulo ES6 - Painel Administrativo de Atos Oficiais
// Versão com editor de texto rico aprimorado (sem IA)
// ============================================

import { supabase } from "../shared/js/supabase.js";
import { OrgaosService } from "../shared/js/services/orgaos-service.js";
import { UsuariosService } from "../shared/js/services/usuarios-service.js";

// ============================================================
// REMOVIDAS: Funções duplicadas de Órgãos e Usuários
// Agora usando os serviços centralizados do Core
// ============================================================

// ========== VARIÁVEIS GLOBAIS ==========
let usuarioAtual = null;
let atos = [];
let orgaos = [];
let usuarios = [];
let tiposAto = [];
let paginaAtualAtos = 1;
let currentRelAtoId = null;
let currentViewAtoId = null;
let currentPdfFile = null;
let currentDocFile = null;
const itensPorPagina = 5;
let sortableTipos = null;

let buscaReversaAtoIdSelecionado = null;
let currentAnexosAtoId = null;

// ========== UTILITÁRIOS ==========
function showNotification(type, title, message, duration = 4000) {
  const container = document.getElementById("notificationCenter");
  if (!container) return;
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
  const confirmIcon = document.getElementById("confirmIcon");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmOkBtn = document.getElementById("confirmOkBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");

  if (!modal || !confirmOkBtn || !confirmCancelBtn) {
    if (confirm(`${icon} ${title}\n\n${message}`)) {
      if (typeof onConfirm === "function") onConfirm();
    }
    return;
  }

  modal.style.zIndex = "10001";
  if (confirmIcon) confirmIcon.textContent = icon;
  if (confirmTitle) confirmTitle.textContent = title;
  if (confirmMessage) confirmMessage.textContent = message;

  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  function cleanup() {
    modal.style.display = "none";
    confirmOkBtn.removeEventListener("click", handleConfirm);
    confirmCancelBtn.removeEventListener("click", handleCancel);
    window.removeEventListener("click", handleClickOutside);
  }

  function handleConfirm() {
    cleanup();
    if (typeof onConfirm === "function") {
      try {
        onConfirm();
      } catch (e) {
        console.error("Erro ao executar ação confirmada:", e);
      }
    }
  }

  function handleCancel() {
    cleanup();
  }

  function handleClickOutside(e) {
    if (e.target === modal) cleanup();
  }

  confirmOkBtn.removeEventListener("click", handleConfirm);
  confirmCancelBtn.removeEventListener("click", handleCancel);
  window.removeEventListener("click", handleClickOutside);

  confirmOkBtn.addEventListener("click", handleConfirm);
  confirmCancelBtn.addEventListener("click", handleCancel);
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

// ========== APLICAR ESTILOS DE DISPOSITIVOS ==========
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
  try {
    orgaos = await OrgaosService.listarAtivos();
    return orgaos;
  } catch (error) {
    showNotification("error", "Erro", error.message);
    orgaos = [];
    return [];
  }
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
  try {
    usuarios = await UsuariosService.listarAtivos();
    return usuarios;
  } catch (error) {
    showNotification("error", "Erro", error.message);
    usuarios = [];
    return [];
  }
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

// ============================================================
// REMOVIDAS: Funções de Gestores (agora no OrgaosService)
// ============================================================

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
      '<tr class="empty-row"><td colspan="7">Nenhum ato cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = recentes
    .map(
      (ato) => `
    <tr class="${ato.status === "Revogado" ? "row-revogado" : ""}">
      <td><strong>${ato.tipo_sigla || "?"}</strong></td>
      <td>${ato.numero}/${ato.ano}</td>
      <td>${ato.orgao_nome}</td>
      <td>${ato.ementa}</td>
      <td><span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span></td>
      <td>${formatarData(ato.data_publicacao)}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="visualizarAto(${ato.id})" title="Visualizar"><i class="fas fa-eye"></i></button>
        ${usuarioAtual?.perfil === "ADMIN" || usuarioAtual?.perfil === "SECRETARIO" ? `<button class="btn btn-sm btn-outline" onclick="editarAto(${ato.id})" title="Editar"><i class="fas fa-edit"></i></button>` : ""}
        <button class="btn btn-sm btn-outline" onclick="gerenciarRelacionamentos(${ato.id})" title="Relacionamentos"><i class="fas fa-link"></i></button>
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
      '<tr class="empty-row"><td colspan="6">Nenhum tipo.</td></tr>';
    return;
  }
  tbody.innerHTML = tiposAto
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td class="sortable-handle"><i class="fas fa-grip-vertical"></i></td>
      <td>${t.nome}</td>
      <td>${t.sigla}</td>
      <td>${t.ordem || 0}</td>
      <td>${t.ativo ? "✅ Ativo" : "❌ Inativo"}</td>
      <td class="acoes-cell">
        <button class="btn btn-sm btn-outline" onclick="editarTipoAto(${t.id})" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirTipoAto(${t.id})" title="Excluir"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>`,
    )
    .join("");

  if (sortableTipos) sortableTipos.destroy();
  const table = document.getElementById("tableTiposAtoInline");
  if (table) {
    sortableTipos = new Sortable(tbody, {
      handle: ".sortable-handle",
      animation: 150,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd: async function () {
        const rows = tbody.querySelectorAll("tr[data-id]");
        const novaOrdem = [];
        rows.forEach((row, index) => {
          novaOrdem.push({
            id: parseInt(row.getAttribute("data-id")),
            ordem: index + 1,
          });
        });
        try {
          for (const item of novaOrdem) {
            await supabase
              .from("tipos_ato")
              .update({ ordem: item.ordem })
              .eq("id", item.id);
          }
          showNotification(
            "success",
            "Ordem atualizada",
            "A ordem dos tipos foi salva.",
          );
          await carregarTiposAtoSupabase();
          renderizarTiposAtoInline();
        } catch (err) {
          console.error(err);
          showNotification("error", "Erro", "Falha ao atualizar a ordem.");
        }
      },
    });
  }
}

// ============================================================
// REMOVIDAS: Funções renderizarOrgaosInline e renderizarUsuariosInline
// Agora usando os serviços centralizados do Core
// ============================================================

// ========== CONFIGURAÇÕES DO PORTAL ==========
async function carregarConfiguracoesPortal() {
  const { data, error } = await supabase
    .from("configuracoes_portal")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar configurações do portal:", error);
    return;
  }

  if (data) {
    document.getElementById("cfgEmail").value = data.email_contato || "";
    document.getElementById("cfgTelefone").value = data.telefone_contato || "";
    document.getElementById("cfgEndereco").value = data.endereco || "";
    document.getElementById("cfgHorario").value =
      data.horario_atendimento || "";
    document.getElementById("cfgOuvidoria").value = data.ouvidoria_email || "";
    document.getElementById("cfgDiarioUrl").value =
      data.diario_oficial_url || "";
    document.getElementById("cfgCnpj").value = data.cnpj || "";
    document.getElementById("cfgPrefeito").value = data.nome_prefeito || "";
    document.getElementById("cfgResponsavel").value =
      data.responsavel_portal || "";
  }
}

async function salvarConfiguracoesPortal() {
  const dados = {
    id: 1,
    email_contato: document.getElementById("cfgEmail").value.trim(),
    telefone_contato: document.getElementById("cfgTelefone").value.trim(),
    endereco: document.getElementById("cfgEndereco").value.trim(),
    horario_atendimento: document.getElementById("cfgHorario").value.trim(),
    ouvidoria_email: document.getElementById("cfgOuvidoria").value.trim(),
    diario_oficial_url: document.getElementById("cfgDiarioUrl").value.trim(),
    cnpj: document.getElementById("cfgCnpj").value.trim(),
    nome_prefeito: document.getElementById("cfgPrefeito").value.trim(),
    responsavel_portal: document.getElementById("cfgResponsavel").value.trim(),
    updated_at: new Date().toISOString(),
  };

  mostrarLoading(true);
  try {
    const { error } = await supabase
      .from("configuracoes_portal")
      .upsert(dados, { onConflict: "id" });

    if (error) throw error;
    showNotification(
      "success",
      "Salvo",
      "Configurações do portal atualizadas.",
    );
  } catch (err) {
    console.error(err);
    showNotification("error", "Erro", "Falha ao salvar configurações.");
  } finally {
    mostrarLoading(false);
  }
}
window.salvarConfiguracoesPortal = salvarConfiguracoesPortal;

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
      // ============================================================
      // REMOVIDOS: Cases para "orgaos" e "usuarios"
      // Agora gerenciados pelo módulo Core
      // ============================================================
      // else if (target === "orgaos") renderizarOrgaosInline();
      // else if (target === "usuarios") renderizarUsuariosInline();
      else if (target === "portal") carregarConfiguracoesPortal();
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
        <td>${ato.ementa}</td>
        <td><span class="status-badge status-${ato.status.toLowerCase()}">${ato.status}</span></td>
        <td>${formatarData(ato.data_publicacao)}</td>
        <td class="acoes-cell">
          <button class="btn btn-sm btn-outline" onclick="visualizarAto(${ato.id})" title="Visualizar"><i class="fas fa-eye"></i></button>
          ${usuarioAtual?.perfil === "ADMIN" || usuarioAtual?.perfil === "SECRETARIO" ? `<button class="btn btn-sm btn-outline" onclick="editarAto(${ato.id})" title="Editar"><i class="fas fa-edit"></i></button>` : ""}
          <button class="btn btn-sm btn-outline" onclick="gerenciarRelacionamentos(${ato.id})" title="Relacionamentos"><i class="fas fa-link"></i></button>
          <button class="btn btn-sm btn-outline" onclick="abrirAnexosModal(${ato.id})" title="Anexos"><i class="fas fa-paperclip"></i></button>
          <button class="btn btn-sm btn-outline" onclick="abrirHistoricoModal(${ato.id})" title="Histórico"><i class="fas fa-history"></i></button>
          ${usuarioAtual?.perfil === "ADMIN" ? `<button class="btn btn-sm btn-outline btn-excluir" onclick="confirmarExcluirAto(${ato.id})" title="Excluir"><i class="fas fa-trash-alt"></i></button>` : ""}
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
    `Tem certeza que deseja excluir ${ato.tipo_sigla} ${ato.numero}/${ato.ano}? Essa ação não pode ser desfeita.`,
    "🗑️",
    async () => {
      mostrarLoading(true);
      await supabase.from("atos_oficiais").delete().eq("id", id);
      showNotification("success", "Excluído", "Ato removido permanentemente.");
      await carregarAtosSupabase();
      await recarregarTudo();
      mostrarLoading(false);
    },
  );
}

// ========== FUNÇÕES DO MODAL DE ATO ==========
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
  window.desmarcarFormAlterado?.();
}

function abrirAtoModal() {
  if (
    usuarioAtual?.perfil !== "ADMIN" &&
    usuarioAtual?.perfil !== "SECRETARIO"
  ) {
    showNotification("error", "Permissão", "Sem autorização para criar atos.");
    return;
  }
  document.getElementById("atoModal").style.display = "flex";
  document.getElementById("atoModalTitle").textContent = "Cadastrar Novo Ato";
  resetarFormAto();
  window.desmarcarFormAlterado?.();
  const tipoSelect = document.getElementById("tipoAto");
  const anoInput = document.getElementById("anoAto");
  if (tipoSelect.value && anoInput.value)
    tipoSelect.dispatchEvent(new Event("change"));
}

// ========== FECHAMENTO DO MODAL DE ATO ==========
function closeAtoModal() {
  if (window.formAlterado) {
    showConfirm(
      "Alterações não salvas",
      "Há alterações que não foram salvas. Deseja realmente fechar o formulário?",
      "⚠️",
      () => {
        try {
          document.getElementById("atoModal").style.display = "none";
          resetarFormAto();
        } catch (e) {
          console.error(e);
          document.getElementById("atoModal").style.display = "none";
        }
        window.desmarcarFormAlterado?.();
      },
    );
  } else {
    document.getElementById("atoModal").style.display = "none";
    resetarFormAto();
  }
}

function resetarFormAto() {
  const form = document.getElementById("atoForm");
  if (form) form.reset();
  const atoId = document.getElementById("atoId");
  if (atoId) atoId.value = "";
  const editor = document.getElementById("textoCompletoEditor");
  if (editor) editor.innerHTML = "";
  const tagsList = document.getElementById("tagsList");
  if (tagsList) tagsList.innerHTML = "";
  const pdfPreview = document.getElementById("pdfPreview");
  if (pdfPreview) pdfPreview.style.display = "none";
  const docPreview = document.getElementById("docPreview");
  if (docPreview) docPreview.style.display = "none";
  const pdfPreviewContainer = document.getElementById("pdfPreviewContainer");
  if (pdfPreviewContainer) pdfPreviewContainer.style.display = "none";
  const pdfPreviewFrame = document.getElementById("pdfPreviewFrame");
  if (pdfPreviewFrame) pdfPreviewFrame.src = "";
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

// ========== EDITOR DE TEXTO AVANÇADO ==========
function getContainingCell(node) {
  while (node && node !== document.body) {
    if (node.nodeName === "TD" || node.nodeName === "TH") return node;
    node = node.parentNode;
  }
  return null;
}

function getContainingTable(node) {
  while (node && node !== document.body) {
    if (node.nodeName === "TABLE") return node;
    node = node.parentNode;
  }
  return null;
}

function insertTable(rows, cols) {
  const editor = document.getElementById("textoCompletoEditor");
  if (!editor) return;
  let tableHtml =
    '<table border="1" data-intranet-style="1c57a9a06eab">';
  for (let i = 0; i < rows; i++) {
    tableHtml += "<tr>";
    for (let j = 0; j < cols; j++) {
      const tag = i === 0 ? "th" : "td";
      tableHtml += `<${tag} data-intranet-style="5d8ef160f136">&nbsp;</${tag}>`;
    }
    tableHtml += "</tr>";
  }
  tableHtml += "</table>";
  document.execCommand("insertHTML", false, tableHtml);
}

function addRow(direction) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const cell = getContainingCell(sel.anchorNode);
  if (!cell) return;
  const row = cell.parentNode;
  const table = getContainingTable(row);
  if (!table) return;
  const newRow = document.createElement("tr");
  const cells = row.querySelectorAll("td, th");
  cells.forEach((c) => {
    const newCell = document.createElement(c.tagName);
    newCell.innerHTML = "&nbsp;";
    newCell.style.cssText = c.style.cssText;
    newRow.appendChild(newCell);
  });
  if (direction === "above") {
    row.parentNode.insertBefore(newRow, row);
  } else {
    row.parentNode.insertBefore(newRow, row.nextSibling);
  }
  window.marcarFormAlterado?.();
}

function addCol(direction) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const cell = getContainingCell(sel.anchorNode);
  if (!cell) return;
  const row = cell.parentNode;
  const table = getContainingTable(row);
  if (!table) return;
  const colIndex = Array.prototype.indexOf.call(row.children, cell);
  const rows = table.querySelectorAll("tr");
  rows.forEach((r) => {
    const refCell = r.children[colIndex];
    const newCell = document.createElement(refCell?.tagName || "td");
    newCell.innerHTML = "&nbsp;";
    newCell.style.cssText = refCell ? refCell.style.cssText : "";
    if (direction === "left") {
      r.insertBefore(newCell, refCell);
    } else {
      r.insertBefore(newCell, refCell ? refCell.nextSibling : null);
    }
  });
  window.marcarFormAlterado?.();
}

function deleteRow() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const cell = getContainingCell(sel.anchorNode);
  if (!cell) return;
  const row = cell.parentNode;
  const table = getContainingTable(row);
  if (!table) return;
  if (table.rows.length <= 1) {
    table.remove();
  } else {
    row.remove();
  }
  window.marcarFormAlterado?.();
}

function deleteCol() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const cell = getContainingCell(sel.anchorNode);
  if (!cell) return;
  const row = cell.parentNode;
  const table = getContainingTable(row);
  if (!table) return;
  const colIndex = Array.prototype.indexOf.call(row.children, cell);
  if (row.children.length <= 1) {
    table.remove();
  } else {
    const rows = table.querySelectorAll("tr");
    rows.forEach((r) => {
      const target = r.children[colIndex];
      if (target) target.remove();
    });
  }
  window.marcarFormAlterado?.();
}

function deleteTable() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const table = getContainingTable(sel.anchorNode);
  if (table) {
    table.remove();
    window.marcarFormAlterado?.();
  }
}

function mergeCells() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const startCell = getContainingCell(range.startContainer);
  const endCell = getContainingCell(range.endContainer);
  if (!startCell || !endCell || startCell === endCell) {
    showNotification(
      "warning",
      "Mesclagem",
      "Selecione pelo menos duas células adjacentes.",
    );
    return;
  }
  const table = getContainingTable(startCell);
  if (table !== getContainingTable(endCell)) return;
  const rows = [...table.rows];
  const startRow = rows.indexOf(startCell.parentNode);
  const endRow = rows.indexOf(endCell.parentNode);
  const startCol = [...startCell.parentNode.children].indexOf(startCell);
  const endCol = [...endCell.parentNode.children].indexOf(endCell);

  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);

  const mergedContent = [];
  for (let i = minRow; i <= maxRow; i++) {
    const row = rows[i];
    for (let j = minCol; j <= maxCol; j++) {
      const cell = row.children[j];
      if (cell) mergedContent.push(cell.innerHTML);
    }
  }
  const targetCell = rows[minRow].children[minCol];
  targetCell.innerHTML = mergedContent.join(" ");
  targetCell.setAttribute("colspan", maxCol - minCol + 1);
  targetCell.setAttribute("rowspan", maxRow - minRow + 1);

  for (let i = minRow; i <= maxRow; i++) {
    const row = rows[i];
    for (let j = minCol; j <= maxCol; j++) {
      if (i === minRow && j === minCol) continue;
      const cell = row.children[j];
      if (cell) cell.remove();
    }
  }
  window.marcarFormAlterado?.();
}

function initEditorTools() {
  const editor = document.getElementById("textoCompletoEditor");
  const toolbar = document.getElementById("editorToolbar");
  if (!editor || !toolbar) return;

  toolbar.querySelectorAll("button[data-command]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      editor.focus();

      if (command === "createLink") {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        if (!selectedText) {
          showNotification(
            "warning",
            "Selecione um texto",
            "Selecione o texto para criar a âncora.",
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
          `ID "${idLimpo}" adicionado com sucesso.`,
        );
      } else if (command === "insertTable") {
        const rows = prompt("Número de linhas:", "3");
        const cols = prompt("Número de colunas:", "4");
        if (rows && cols) {
          insertTable(parseInt(rows), parseInt(cols));
          window.marcarFormAlterado?.();
        }
      } else if (command === "addRowAbove") {
        addRow("above");
      } else if (command === "addRowBelow") {
        addRow("below");
      } else if (command === "addColLeft") {
        addCol("left");
      } else if (command === "addColRight") {
        addCol("right");
      } else if (command === "deleteRow") {
        deleteRow();
      } else if (command === "deleteCol") {
        deleteCol();
      } else if (command === "deleteTable") {
        deleteTable();
      } else if (command === "mergeCells") {
        mergeCells();
      } else {
        document.execCommand(command, false, null);
        editor.focus();
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
        window.marcarFormAlterado?.();
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
        window.marcarFormAlterado?.();
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

  document.getElementById("relacionamentoAtoInfo").innerHTML = `
    <i class="fas fa-link"></i> Relacionamentos do ${ato.tipo_sigla} nº ${ato.numero}/${ato.ano}
  `;

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

  document.getElementById("relIdentificadorDispositivo").value = "";
  document.getElementById("relNovoTexto").value = "";
  document.getElementById("relTipoDispositivo").value = "revogado";
  document.getElementById("relNovoTextoGroup").style.display = "none";

  const chkAtualizar = document.getElementById("chkAtualizarStatus");
  if (chkAtualizar) chkAtualizar.checked = false;
  const checkboxContainer = document.getElementById(
    "checkboxAtualizarStatusContainer",
  );
  if (checkboxContainer) checkboxContainer.style.display = "none";

  const rels = await carregarRelacionamentos(atoId);
  const listaDiv = document.getElementById("relacionamentosList");

  if (!rels.origem.length && !rels.destino.length) {
    listaDiv.innerHTML =
      '<p class="empty-state">Nenhum vínculo cadastrado.</p>';
  } else {
    let html =
      '<div data-intranet-style="dffd512c8830"><table class="tabela-compacta"><thead><tr><th>Tipo</th><th>Ato Relacionado</th><th>Ações</th></tr></thead><tbody>';
    if (rels.origem.length) {
      rels.origem.forEach((r) => {
        html += `<tr>
          <td><strong>${r.tipo}</strong> →</td>
          <td><a href="#" onclick="visualizarAto(${r.ato_destino.id}); return false;">${r.ato_destino.tipos_ato?.nome || "Ato"} ${r.ato_destino.numero}/${r.ato_destino.ano}</a></td>
          <td><button class="btn btn-sm btn-outline btn-excluir" onclick="removerRelacionamento(${r.id})" title="Remover vínculo"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`;
      });
    }
    if (rels.destino.length) {
      rels.destino.forEach((r) => {
        html += `<tr>
          <td>← <strong>${r.tipo}</strong></td>
          <td><a href="#" onclick="visualizarAto(${r.ato_origem.id}); return false;">${r.ato_origem.tipos_ato?.nome || "Ato"} ${r.ato_origem.numero}/${r.ato_origem.ano}</a></td>
          <td><button class="btn btn-sm btn-outline btn-excluir" onclick="removerRelacionamento(${r.id})" title="Remover vínculo"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`;
      });
    }
    html += "</tbody></table></div>";
    listaDiv.innerHTML = html;
  }

  const alts = await carregarAlteracoesDispositivos(atoId);
  const altDiv = document.getElementById("alteracoesList");
  altDiv.innerHTML = "";

  if (!alts.length) {
    altDiv.innerHTML = '<p class="empty-state">Nenhuma alteração pontual.</p>';
  } else {
    let altHtml =
      '<div data-intranet-style="dffd512c8830"><table class="tabela-compacta"><thead><tr><th>Dispositivo</th><th>Tipo</th><th>Ato Alterador</th><th>Ações</th></tr></thead><tbody>';
    alts.forEach((alt) => {
      const alterador = alt.ato_alterador;
      const nomeAlterador = alterador
        ? `${alterador.tipos_ato?.nome || "Ato"} ${alterador.numero}/${alterador.ano}`
        : "Desconhecido";
      const tipoIcone =
        alt.tipo === "revogado" ? "🚫" : alt.tipo === "alterado" ? "✏️" : "➕";
      altHtml += `<tr>
        <td><code>${alt.identificador_dispositivo}</code></td>
        <td>${tipoIcone} ${alt.tipo}</td>
        <td><a href="#" onclick="visualizarAto(${alterador?.id}); return false;">${nomeAlterador}</a></td>
        <td><button class="btn btn-sm btn-outline btn-excluir" onclick="removerAlteracaoDispositivo(${alt.id})" title="Remover alteração"><i class="fas fa-trash-alt"></i></button></td>
      </tr>`;
      if (alt.tipo === "alterado" && alt.novo_texto) {
        altHtml += `<tr><td colspan="4" data-intranet-style="7a83ce75afb8"><small>Novo texto: ${alt.novo_texto.substring(0, 150)}${alt.novo_texto.length > 150 ? "..." : ""}</small></td></tr>`;
      }
    });
    altHtml += "</tbody></table></div>";
    altDiv.innerHTML = altHtml;
  }

  const tipoDispositivo = document.getElementById("relTipoDispositivo");
  tipoDispositivo.onchange = function () {
    document.getElementById("relNovoTextoGroup").style.display =
      this.value === "alterado" ? "block" : "none";
  };

  const relTipoSelect = document.getElementById("relTipo");
  const chkContainer = document.getElementById(
    "checkboxAtualizarStatusContainer",
  );
  if (relTipoSelect && chkContainer) {
    relTipoSelect.onchange = function () {
      chkContainer.style.display = this.value === "revoga" ? "flex" : "none";
    };
  }

  document
    .querySelectorAll(".rel-tab")
    .forEach((t) => t.classList.remove("active"));
  const primeiraAba = document.querySelector(
    '.rel-tab[data-reltab="vinculos"]',
  );
  if (primeiraAba) primeiraAba.classList.add("active");
  document
    .querySelectorAll(".rel-panel")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("relPanelVinculos").classList.add("active");
}

async function adicionarRelacionamento() {
  if (!currentRelAtoId) return;
  const destinoId = document.getElementById("relAtoId").value;
  const tipo = document.getElementById("relTipo").value;
  if (!destinoId) {
    showNotification("warning", "Selecione", "Escolha um ato para relacionar.");
    return;
  }
  mostrarLoading(true);
  try {
    await supabase.from("relacionamentos_atos").insert({
      ato_origem_id: currentRelAtoId,
      ato_destino_id: parseInt(destinoId),
      tipo,
      usuario_cadastro_id: usuarioAtual.id,
      created_at: new Date(),
    });

    const chkAtualizar = document.getElementById("chkAtualizarStatus");
    if (chkAtualizar && chkAtualizar.checked && tipo === "revoga") {
      await supabase
        .from("atos_oficiais")
        .update({ status: "Revogado", updated_at: new Date().toISOString() })
        .eq("id", parseInt(destinoId));
      showNotification(
        "success",
        "Vínculo criado",
        "Relacionamento adicionado e status do ato alvo atualizado para Revogado.",
      );
      await carregarAtosSupabase();
    } else {
      showNotification(
        "success",
        "Vínculo criado",
        "Relacionamento adicionado.",
      );
    }

    await atualizarModalRelacionamentos(currentRelAtoId);
  } catch (err) {
    showNotification("error", "Erro", err.message);
  } finally {
    mostrarLoading(false);
  }
}

async function removerRelacionamento(relId) {
  showConfirm(
    "Remover vínculo",
    "Deseja remover este vínculo?",
    "⚠️",
    async () => {
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
    },
  );
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
    showNotification(
      "warning",
      "Identificador",
      "Informe o identificador do dispositivo.",
    );
    return;
  }
  if (tipo === "alterado" && !novoTexto) {
    showNotification(
      "warning",
      "Novo texto",
      "Informe o novo texto do dispositivo.",
    );
    return;
  }

  mostrarLoading(true);
  try {
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
  showConfirm(
    "Remover alteração",
    "Deseja remover esta alteração de dispositivo?",
    "⚠️",
    async () => {
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
    },
  );
}

// ========== LINHA DO TEMPO NORMATIVA ==========
async function montarLinhaDoTempo(atoId) {
  const container = document.getElementById("viewAtoTimeline");
  if (!container) return;
  container.innerHTML =
    '<div class="loading-placeholder"><div class="loading-spinner"></div><p>Montando linha do tempo...</p></div>';

  const ato = atos.find((a) => a.id === atoId);
  if (!ato) {
    container.innerHTML = '<p class="empty-state">Ato não encontrado.</p>';
    return;
  }

  const { data: relsOrigem } = await supabase
    .from("relacionamentos_atos")
    .select(
      "tipo, ato_destino:ato_destino_id(id, tipos_ato (nome, sigla), numero, ano, data_publicacao)",
    )
    .eq("ato_origem_id", atoId);
  const { data: relsDestino } = await supabase
    .from("relacionamentos_atos")
    .select(
      "tipo, ato_origem:ato_origem_id(id, tipos_ato (nome, sigla), numero, ano, data_publicacao)",
    )
    .eq("ato_destino_id", atoId);

  const { data: alteracoes } = await supabase
    .from("alteracoes_dispositivos")
    .select(
      "id, tipo, identificador_dispositivo, novo_texto, ato_alterador:ato_alterador_id(id, tipos_ato (nome, sigla), numero, ano, data_publicacao)",
    )
    .eq("ato_origem_id", atoId);

  const eventos = [];

  eventos.push({
    data: ato.data_publicacao,
    titulo: "Publicação",
    descricao: `${ato.tipo_nome} nº ${ato.numero}/${ato.ano} publicado.`,
    tipo: "publicacao",
  });

  if (relsOrigem) {
    for (const rel of relsOrigem) {
      const destino = rel.ato_destino;
      if (!destino) continue;
      eventos.push({
        data: destino.data_publicacao || ato.data_publicacao,
        titulo: `${rel.tipo.charAt(0).toUpperCase() + rel.tipo.slice(1)}`,
        descricao: `Este ato ${rel.tipo} o ${destino.tipos_ato?.nome || "Ato"} ${destino.numero}/${destino.ano}.`,
        tipo: rel.tipo === "revoga" ? "revogado" : "alterado",
        linkAtoId: destino.id,
      });
    }
  }

  if (relsDestino) {
    for (const rel of relsDestino) {
      const origem = rel.ato_origem;
      if (!origem) continue;
      eventos.push({
        data: origem.data_publicacao || ato.data_publicacao,
        titulo: `${rel.tipo.charAt(0).toUpperCase() + rel.tipo.slice(1)}`,
        descricao: `O ${origem.tipos_ato?.nome || "Ato"} ${origem.numero}/${origem.ano} ${rel.tipo} este ato.`,
        tipo: rel.tipo === "revoga" ? "revogado" : "alterado",
        linkAtoId: origem.id,
      });
    }
  }

  if (alteracoes) {
    for (const alt of alteracoes) {
      const alterador = alt.ato_alterador;
      if (!alterador) continue;
      const tipoDesc =
        alt.tipo === "revogado"
          ? "Revogado"
          : alt.tipo === "alterado"
            ? "Alterado"
            : "Acrescentado";
      eventos.push({
        data: alterador.data_publicacao || ato.data_publicacao,
        titulo: `Dispositivo "${alt.identificador_dispositivo}" ${tipoDesc}`,
        descricao: `O ${alterador.tipos_ato?.nome || "Ato"} ${alterador.numero}/${alterador.ano} ${alt.tipo} o dispositivo "${alt.identificador_dispositivo}".`,
        tipo: alt.tipo === "revogado" ? "revogado" : "alterado",
        linkAtoId: alterador.id,
      });
    }
  }

  eventos.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

  if (eventos.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Nenhum evento na linha do tempo.</p>';
    return;
  }

  let html = '<div class="timeline">';
  for (const ev of eventos) {
    const icone =
      ev.tipo === "publicacao"
        ? "📅"
        : ev.tipo === "revogado"
          ? "🚫"
          : ev.tipo === "alterado"
            ? "✏️"
            : "ℹ️";
    const dotClass =
      ev.tipo === "revogado"
        ? "revogado"
        : ev.tipo === "alterado"
          ? "alterado"
          : "";
    html += `
      <div class="timeline-item">
        <div class="timeline-dot ${dotClass}">${icone}</div>
        <div class="timeline-content">
          <div class="timeline-title">${ev.titulo}</div>
          <div class="timeline-description">
            ${ev.descricao}
            ${ev.linkAtoId ? `<br><a href="#" class="timeline-link" onclick="visualizarAto(${ev.linkAtoId}); return false;"><i class="fas fa-external-link-alt"></i> Ver ato</a>` : ""}
          </div>
          <div class="timeline-date">${formatarData(ev.data)}</div>
        </div>
      </div>
    `;
  }
  html += "</div>";
  container.innerHTML = html;
}

// ========== BUSCA REVERSA ==========
function initBuscaReversaAutocomplete() {
  const input = document.getElementById("buscaReversaAtoInput");
  const sugestoesContainer = document.getElementById("buscaReversaSugestoes");
  if (!input || !sugestoesContainer) return;

  input.addEventListener("input", function () {
    const termo = this.value.trim().toLowerCase();
    if (!termo) {
      sugestoesContainer.innerHTML = "";
      sugestoesContainer.classList.remove("show");
      buscaReversaAtoIdSelecionado = null;
      return;
    }

    const resultados = atos
      .filter((ato) => {
        const texto =
          `${ato.tipo_sigla || ""} ${ato.numero}/${ato.ano}`.toLowerCase();
        return (
          texto.includes(termo) ||
          ato.numero.toString().includes(termo) ||
          ato.ano.toString().includes(termo)
        );
      })
      .slice(0, 10);

    if (resultados.length === 0) {
      sugestoesContainer.innerHTML =
        '<div class="busca-reversa-sugestao-item" data-intranet-style="dd4e59883ab2">Nenhum ato encontrado</div>';
      sugestoesContainer.classList.add("show");
      return;
    }

    sugestoesContainer.innerHTML = resultados
      .map(
        (ato) =>
          `<div class="busca-reversa-sugestao-item" data-ato-id="${ato.id}">${ato.tipo_sigla || "?"} ${ato.numero}/${ato.ano} - ${ato.ementa.substring(0, 60)}...</div>`,
      )
      .join("");
    sugestoesContainer.classList.add("show");

    sugestoesContainer
      .querySelectorAll(".busca-reversa-sugestao-item")
      .forEach((item) => {
        item.addEventListener("click", function () {
          const atoId = parseInt(this.getAttribute("data-ato-id"));
          const atoSelecionado = atos.find((a) => a.id === atoId);
          if (atoSelecionado) {
            input.value = `${atoSelecionado.tipo_sigla || ""} ${atoSelecionado.numero}/${atoSelecionado.ano}`;
            buscaReversaAtoIdSelecionado = atoId;
          }
          sugestoesContainer.classList.remove("show");
        });
      });
  });

  document.addEventListener("click", function (e) {
    if (!input.contains(e.target) && !sugestoesContainer.contains(e.target)) {
      sugestoesContainer.classList.remove("show");
    }
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      sugestoesContainer.classList.remove("show");
    }
  });
  input.addEventListener("blur", function () {
    setTimeout(() => {
      if (!sugestoesContainer.contains(document.activeElement)) {
        sugestoesContainer.classList.remove("show");
      }
    }, 150);
  });
}

async function executarBuscaReversa() {
  const input = document.getElementById("buscaReversaInput");
  const container = document.getElementById("buscaReversaResultados");
  const termo = input.value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!termo) {
    container.innerHTML =
      '<p class="empty-state">Informe um identificador de dispositivo (ex.: artigo5).</p>';
    return;
  }
  container.innerHTML =
    '<div class="loading-placeholder"><div class="loading-spinner"></div><p>Buscando...</p></div>';

  let query = supabase
    .from("alteracoes_dispositivos")
    .select(
      "*, ato_alterador:ato_alterador_id(*, tipos_ato(*), orgaos(*)), ato_origem:ato_origem_id(*, tipos_ato(*), orgaos(*))",
    )
    .eq("identificador_dispositivo", termo)
    .order("created_at", { ascending: false });

  if (buscaReversaAtoIdSelecionado) {
    query = query.eq("ato_origem_id", buscaReversaAtoIdSelecionado);
  }

  const { data, error } = await query;

  if (error) {
    container.innerHTML = '<p class="empty-state">Erro ao buscar.</p>';
    return;
  }
  if (!data || data.length === 0) {
    let msg = `Nenhum ato afeta o dispositivo "${termo}".`;
    if (buscaReversaAtoIdSelecionado) {
      const ato = atos.find((a) => a.id === buscaReversaAtoIdSelecionado);
      if (ato)
        msg = `Nenhum ato afeta o dispositivo "${termo}" no ${ato.tipo_sigla} ${ato.numero}/${ato.ano}.`;
    }
    container.innerHTML = `<p class="empty-state">${msg}</p>`;
    return;
  }

  let html = "";
  for (const alt of data) {
    const alterador = alt.ato_alterador;
    const origem = alt.ato_origem;
    html += `
      <div class="busca-reversa-item" onclick="visualizarAto(${alterador.id})">
        <strong>${alterador.tipos_ato?.sigla || "?"} ${alterador.numero}/${alterador.ano}</strong>
        → ${alt.tipo === "revogado" ? "Revogou" : alt.tipo === "alterado" ? "Alterou" : "Acrescentou"}
        o dispositivo "<code>${alt.identificador_dispositivo}</code>" do ato
        <strong>${origem.tipos_ato?.sigla || "?"} ${origem.numero}/${origem.ano}</strong>
        <br><small>${formatarData(alterador.data_publicacao)}</small>
      </div>
    `;
  }
  container.innerHTML = html;
}
window.executarBuscaReversa = executarBuscaReversa;

// ========== MODAL DE ANEXOS ==========
async function abrirAnexosModal(atoId) {
  currentAnexosAtoId = atoId;
  document.getElementById("anexosModal").style.display = "flex";
  await carregarAnexos(atoId);
}

async function carregarAnexos(atoId) {
  const container = document.getElementById("anexosLista");
  container.innerHTML = '<p class="empty-state">Carregando anexos...</p>';

  const ato = atos.find((a) => a.id === atoId);
  if (!ato) {
    container.innerHTML = '<p class="empty-state">Ato não encontrado.</p>';
    return;
  }

  let html = "";

  if (
    ato.pdf_url &&
    (ato.pdf_url.startsWith("https://") || ato.pdf_url.startsWith("http://"))
  ) {
    const nome = ato.pdf_url.split("/").pop() || "PDF Oficial";
    html += `
      <div class="anexo-item">
        <div class="anexo-info">
          <div class="anexo-icon"><i class="fas fa-file-pdf"></i></div>
          <div class="anexo-detalhes">
            <div class="anexo-nome" title="${nome}">📄 PDF Oficial — ${nome}</div>
            <div class="anexo-meta">Documento oficial do ato</div>
          </div>
        </div>
        <div class="anexo-acoes">
          <button class="btn btn-sm btn-outline" onclick="window.open('${ato.pdf_url}', '_blank')" title="Baixar"><i class="fas fa-download"></i></button>
        </div>
      </div>
    `;
  }

  if (
    ato.doc_url &&
    (ato.doc_url.startsWith("https://") || ato.doc_url.startsWith("http://"))
  ) {
    const nome = ato.doc_url.split("/").pop() || "Documento Editável";
    html += `
      <div class="anexo-item">
        <div class="anexo-info">
          <div class="anexo-icon"><i class="fas fa-file-word"></i></div>
          <div class="anexo-detalhes">
            <div class="anexo-nome" title="${nome}">📝 Documento Editável — ${nome}</div>
            <div class="anexo-meta">Documento oficial do ato</div>
          </div>
        </div>
        <div class="anexo-acoes">
          <button class="btn btn-sm btn-outline" onclick="window.open('${ato.doc_url}', '_blank')" title="Baixar"><i class="fas fa-download"></i></button>
        </div>
      </div>
    `;
  }

  const { data, error } = await supabase
    .from("anexos_ato")
    .select("*")
    .eq("ato_id", atoId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar anexos:", error);
    if (!html)
      html =
        '<p class="empty-state">Nenhum anexo disponível para este ato.</p>';
    container.innerHTML = html;
    return;
  }

  if (data && data.length > 0) {
    html +=
      '<div data-intranet-style="5932fd38feb2"><strong>Anexos Adicionais</strong></div>';
    for (const anexo of data) {
      const icone = obterIconeArquivo(anexo.nome_arquivo);
      const tamanhoFormatado = formatarTamanho(anexo.tamanho);
      html += `
        <div class="anexo-item">
          <div class="anexo-info">
            <div class="anexo-icon"><i class="${icone}"></i></div>
            <div class="anexo-detalhes">
              <div class="anexo-nome" title="${anexo.nome_arquivo}">${anexo.nome_arquivo}</div>
              <div class="anexo-meta">${formatarData(anexo.created_at?.split("T")[0])} · ${tamanhoFormatado}</div>
            </div>
          </div>
          <div class="anexo-acoes">
            <button class="btn btn-sm btn-outline" onclick="window.open('${anexo.url_storage}', '_blank')" title="Baixar"><i class="fas fa-download"></i></button>
            <button class="btn btn-sm btn-outline btn-excluir" onclick="excluirAnexo(${anexo.id}, '${anexo.url_storage.replace(/'/g, "\\'")}')" title="Excluir"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      `;
    }
  }

  if (!html)
    html = '<p class="empty-state">Nenhum anexo disponível para este ato.</p>';
  container.innerHTML = html;
}

function obterIconeArquivo(nome) {
  const ext = nome.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "fas fa-file-pdf";
    case "doc":
    case "docx":
      return "fas fa-file-word";
    case "xls":
    case "xlsx":
      return "fas fa-file-excel";
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
      return "fas fa-file-image";
    default:
      return "fas fa-file";
  }
}

function formatarTamanho(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function fazerUploadAnexo(file) {
  if (!currentAnexosAtoId) return;
  if (file.size > 10 * 1024 * 1024) {
    showNotification(
      "warning",
      "Arquivo grande",
      `O arquivo "${file.name}" excede 10MB.`,
    );
    return;
  }
  mostrarLoading(true);
  try {
    const url = await fazerUploadArquivo(
      file,
      "atos-anexos",
      `anexo-${currentAnexosAtoId}`,
    );
    await supabase.from("anexos_ato").insert({
      ato_id: currentAnexosAtoId,
      nome_arquivo: file.name,
      url_storage: url,
      tamanho: file.size,
      tipo_mime: file.type,
      usuario_cadastro_id: usuarioAtual.id,
      created_at: new Date().toISOString(),
    });
    await carregarAnexos(currentAnexosAtoId);
  } catch (err) {
    console.error(err);
    showNotification("error", "Erro", "Falha ao fazer upload do anexo.");
  } finally {
    mostrarLoading(false);
  }
}

async function excluirAnexo(anexoId, urlStorage) {
  showConfirm(
    "Excluir anexo",
    "Deseja remover este anexo adicional?",
    "🗑️",
    async () => {
      mostrarLoading(true);
      try {
        const caminho = urlStorage.split("/").slice(-2).join("/");
        await supabase.storage.from("atos-anexos").remove([caminho]);
        await supabase.from("anexos_ato").delete().eq("id", anexoId);
        showNotification("success", "Excluído", "Anexo removido.");
        if (currentAnexosAtoId) await carregarAnexos(currentAnexosAtoId);
      } catch (err) {
        console.error(err);
        showNotification("error", "Erro", "Falha ao excluir anexo.");
      } finally {
        mostrarLoading(false);
      }
    },
  );
}

function initAnexosUpload() {
  const area = document.getElementById("anexosUploadArea");
  const input = document.getElementById("anexoFileInput");
  if (!area || !input) return;

  area.addEventListener("click", () => input.click());
  input.addEventListener("change", async (e) => {
    if (e.target.files.length) {
      for (const file of e.target.files) {
        await fazerUploadAnexo(file);
      }
      input.value = "";
    }
  });

  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.classList.add("dragover");
  });
  area.addEventListener("dragleave", () => area.classList.remove("dragover"));
  area.addEventListener("drop", async (e) => {
    e.preventDefault();
    area.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      for (const file of e.dataTransfer.files) {
        await fazerUploadAnexo(file);
      }
    }
  });
}

// ========== VISUALIZAÇÃO DE ATO ==========
async function visualizarAto(id) {
  currentViewAtoId = id;
  const modal = document.getElementById("viewAtoModal");
  modal.style.display = "flex";

  try {
    const ato = atos.find((a) => a.id === id);
    if (!ato) throw new Error("Ato não encontrado.");

    document.getElementById("viewAtoTitle").textContent =
      `${ato.tipo_nome || "Ato"} nº ${ato.numero}/${ato.ano}`;
    document.getElementById("viewAtoHeaderTexto").textContent =
      `${ato.tipo_nome || "Ato"} nº ${ato.numero}/${ato.ano} — ${ato.orgao_nome || ""}`;

    const statusEl = document.getElementById("viewAtoStatus");
    statusEl.textContent = ato.status;
    statusEl.className = `status-badge status-${ato.status.toLowerCase()}`;
    document.getElementById("viewAtoOrgao").textContent = ato.orgao_nome || "—";
    document.getElementById("viewAtoDataPub").textContent = formatarData(
      ato.data_publicacao,
    );
    document.getElementById("viewAtoVersao").textContent = ato.versao || 1;

    const diarioContainer = document.getElementById("viewAtoDiarioContainer");
    if (ato.edicao_diario) {
      diarioContainer.style.display = "block";
      document.getElementById("viewAtoDiario").textContent =
        `Edição ${ato.edicao_diario}, Página ${ato.pagina_diario}`;
    } else {
      diarioContainer.style.display = "none";
    }

    const tagsContainer = document.getElementById("viewAtoTagsContainer");
    if (ato.palavras_chave?.length) {
      tagsContainer.style.display = "block";
      document.getElementById("viewAtoTags").textContent =
        ato.palavras_chave.join(", ");
    } else {
      tagsContainer.style.display = "none";
    }

    document.getElementById("viewAtoTipo").textContent =
      `${ato.tipo_nome || "—"} (${ato.tipo_sigla || "?"})`;
    document.getElementById("viewAtoNumeroAno").textContent =
      `${ato.numero}/${ato.ano}`;
    document.getElementById("viewAtoEmenta").textContent = ato.ementa;

    const textoContainer = document.getElementById("viewAtoTextoCompleto");
    textoContainer.innerHTML = ato.texto_completo || "<em>Sem texto.</em>";

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

    const alteracoes = alteracoesRes.data || [];
    aplicarEstilosDispositivos(textoContainer, alteracoes);

    const relsOrigem = relOrigemRes.data || [];
    const relsDestino = relDestinoRes.data || [];

    let relHtmlOrigem = "";
    if (relsOrigem.length) {
      relHtmlOrigem = `<div class="view-relacionamentos-box"><h5>📌 Este ato:</h5><ul>${relsOrigem
        .map((r) => {
          const dest = r.ato_destino;
          return `<li>${r.tipo} → <a href="#" onclick="visualizarAto(${dest.id}); return false;">${dest.tipos_ato?.nome || "Ato"} ${dest.numero}/${dest.ano}</a></li>`;
        })
        .join("")}</ul></div>`;
    }
    let relHtmlDestino = "";
    if (relsDestino.length) {
      relHtmlDestino = `<div class="view-relacionamentos-box"><h5>🔁 Referenciado por:</h5><ul>${relsDestino
        .map((r) => {
          const orig = r.ato_origem;
          return `<li>${r.tipo} ← <a href="#" onclick="visualizarAto(${orig.id}); return false;">${orig.tipos_ato?.nome || "Ato"} ${orig.numero}/${orig.ano}</a></li>`;
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
            ? `${alterador.tipos_ato?.nome || "Ato"} ${alterador.numero}/${alterador.ano}`
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

    document.getElementById("viewBtnEditar").onclick = () => {
      closeViewAtoModal();
      editarAto(id);
    };
    document.getElementById("viewBtnGerenciarRels").onclick = () => {
      closeViewAtoModal();
      gerenciarRelacionamentos(id);
    };

    montarLinhaDoTempo(id);

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
function obterUrlPublicaAto() {
  const url = new URL("./portal-atos-oficiais.html", window.location.href);
  url.searchParams.set("ato", currentViewAtoId);
  return url.toString();
}

function copiarLinkPublico() {
  if (!currentViewAtoId) return;
  const url = obterUrlPublicaAto();
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
  const url = obterUrlPublicaAto();
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
    if (!printWindow) {
      showNotification("warning", "Pop-up bloqueado", "Permita a abertura da janela para imprimir o relatório.");
      return;
    }
    const escaparHtml = (valor) => String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[caractere]);
    const brasaoUrl = new URL("../brasao-pref.png", window.location.href).href;
    const cssUrl = new URL("../shared/css/intranet-global.css?v=20261005-fontawesome-local-1", window.location.href).href;
    const linhas = dados.map((a) => `<tr><td>${escaparHtml(a.tipo_sigla)}</td><td>${escaparHtml(a.numero)}/${escaparHtml(a.ano)}</td><td>${escaparHtml(a.orgao_nome)}</td><td>${escaparHtml(a.ementa)}</td><td>${escaparHtml(a.status)}</td><td>${escaparHtml(formatarData(a.data_publicacao))}</td></tr>`).join("");
    printWindow.document.write(`
      <!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atos Oficiais</title>
      <link id="municipalReportStyles" rel="stylesheet" href="${escaparHtml(cssUrl)}"></head>
      <body class="municipal-report-print-document municipal-report-print-document--landscape">
      <header class="municipal-report-print-header">
        <img id="brasaoMunicipio" src="${escaparHtml(brasaoUrl)}" alt="Brasão do Município" />
        <div><strong>Prefeitura Municipal de Pitangueiras</strong><span>Relatório de Atos Oficiais</span></div>
      </header>
      <h2>Atos Oficiais</h2>
      <table><thead><tr><th>Tipo</th><th>Nº/Ano</th><th>Órgão</th><th>Ementa</th><th>Status</th><th>Data</th></tr></thead><tbody>
      ${linhas}
      </tbody></table></body></html>
    `);
    printWindow.document.close();
    const imprimir = () => {
      printWindow.focus();
      printWindow.print();
    };
    const estilos = printWindow.document.getElementById("municipalReportStyles");
    const logo = printWindow.document.getElementById("brasaoMunicipio");
    const aguardarEstilos = new Promise((resolve) => {
      if (estilos?.sheet) return resolve();
      estilos?.addEventListener("load", resolve, { once: true });
      estilos?.addEventListener("error", resolve, { once: true });
      if (!estilos) resolve();
    });
    const aguardarBrasao = new Promise((resolve) => {
      if (!logo || logo.complete) return resolve();
      logo.addEventListener("load", resolve, { once: true });
      logo.addEventListener("error", resolve, { once: true });
    });
    Promise.all([aguardarEstilos, aguardarBrasao]).then(() => setTimeout(imprimir, 50));
  }
}
window.exportarLista = exportarLista;

// ========== CRUD TIPOS, ORGAOS, USUARIOS ==========
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

// ============================================================
// REMOVIDAS: Funções de Órgãos e Usuários (agora no Core)
// As funções abaixo foram mantidas apenas para compatibilidade,
// mas redirecionam para o módulo Core ou exibem aviso
// ============================================================

// Órgãos - Mantido para compatibilidade, mas redireciona para Core
window.abrirOrgaoModal = async (id) => {
  showNotification(
    "info",
    "Órgãos centralizados",
    "A gestão de órgãos agora está no Painel Administrativo (Core). Acesse pelo menu lateral.",
  );
  if (usuarioAtual?.perfil === "ADMIN") {
    window.location.href = "../core/orgaos/index.html";
  }
};

window.closeOrgaoModal = () => {
  showNotification(
    "info",
    "Órgãos centralizados",
    "Acesse o módulo Core para gerenciar órgãos.",
  );
};

window.salvarOrgao = async () => {
  showNotification(
    "info",
    "Órgãos centralizados",
    "Utilize o módulo Core para gerenciar órgãos.",
  );
};

window.excluirOrgao = (id) => {
  showNotification(
    "info",
    "Órgãos centralizados",
    "Utilize o módulo Core para gerenciar órgãos.",
  );
};

window.editarOrgao = (id) => {
  showNotification(
    "info",
    "Órgãos centralizados",
    "Utilize o módulo Core para gerenciar órgãos.",
  );
};

// Usuários - Mantido para compatibilidade, mas redireciona para Core
window.abrirUsuarioModal = async (id) => {
  showNotification(
    "info",
    "Usuários centralizados",
    "A gestão de usuários agora está no Painel Administrativo (Core). Acesse pelo menu lateral.",
  );
  if (usuarioAtual?.perfil === "ADMIN") {
    window.location.href = "../core/usuarios/index.html";
  }
};

window.closeUsuarioModal = () => {
  showNotification(
    "info",
    "Usuários centralizados",
    "Acesse o módulo Core para gerenciar usuários.",
  );
};

window.salvarUsuario = async () => {
  showNotification(
    "info",
    "Usuários centralizados",
    "Utilize o módulo Core para gerenciar usuários.",
  );
};

window.excluirUsuario = (id) => {
  showNotification(
    "info",
    "Usuários centralizados",
    "Utilize o módulo Core para gerenciar usuários.",
  );
};

window.editarUsuario = (id) => {
  showNotification(
    "info",
    "Usuários centralizados",
    "Utilize o módulo Core para gerenciar usuários.",
  );
};

// Gestores - Mantido para compatibilidade
window.gerenciarGestores = (orgaoId, orgaoNome) => {
  showNotification(
    "info",
    "Gestores centralizados",
    "A gestão de gestores agora está no módulo Core de Órgãos.",
  );
  if (usuarioAtual?.perfil === "ADMIN") {
    window.location.href = `../core/orgaos/index.html`;
  }
};

window.closeGestoresModal = () => {};
window.abrirFormGestor = () => {};
window.closeGestorFormModal = () => {};
window.salvarGestorHandler = () => {};
window.editarGestor = () => {};
window.excluirGestorHandler = () => {};

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
    // ============================================================
    // REMOVIDAS: Chamadas para renderizarOrgaosInline e renderizarUsuariosInline
    // Agora gerenciados pelo módulo Core
    // ============================================================
  }
}

window.mostrarPagina = mostrarPagina;

async function fazerLogout() {
  await supabase.auth.signOut();
  window.location.href = "../index.html";
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
    window.location.href = "../index.html";
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
    window.location.href = "../index.html";
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
  initBuscaReversaAutocomplete();
  initAnexosUpload();
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

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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

window.gerenciarRelacionamentos = async (id) => {
  if (!usuarioAtual) return;
  await atualizarModalRelacionamentos(id);
  document.getElementById("relacionamentoModal").style.display = "flex";
};
window.adicionarRelacionamento = adicionarRelacionamento;
window.removerRelacionamento = removerRelacionamento;
window.adicionarAlteracaoDispositivo = adicionarAlteracaoDispositivo;
window.removerAlteracaoDispositivo = removerAlteracaoDispositivo;

window.abrirAnexosModal = abrirAnexosModal;
window.closeAnexosModal = () => {
  document.getElementById("anexosModal").style.display = "none";
};
window.excluirAnexo = excluirAnexo;

window.abrirHistoricoModal = () => {
  document.getElementById("historicoModal").style.display = "flex";
};
window.closeHistoricoModal = () => {
  document.getElementById("historicoModal").style.display = "none";
};

window.gerenciarRelacionamentosDoView = () => {
  if (currentViewAtoId) {
    closeViewAtoModal();
    gerenciarRelacionamentos(currentViewAtoId);
  }
};
window.editarAtoDoView = () => {
  if (currentViewAtoId) {
    closeViewAtoModal();
    editarAto(currentViewAtoId);
  }
};

initAuth();
