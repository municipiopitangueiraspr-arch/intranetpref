import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js";
import { COMPRAS_MENU } from "./compras-menu.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = "") => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const human = (value = "") => String(value || "").replaceAll("_", " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const date = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)) : "—";
const manager = (membership) => ["tenant_admin", "compras_manager"].includes(membership?.role);
const emptyStructure = () => ({ codigo: "novo-modelo-v1", titulo: "", orientacao: "", secoes: [{ codigo: "I", titulo: "Nova seção", campos: [{ chave: "nova_pergunta", rotulo: "Nova pergunta", tipo: "textarea", obrigatorio: false, fundamento: "", ajuda: "" }] }] });
const state = { user: null, membership: null, tenantId: null, models: [], selectedModelId: null, selectedVersionId: null, draft: null };

function notify(message, tone = "success") { const region = $("#toast-region"); const node = document.createElement("div"); node.className = "toast"; node.dataset.tone = tone; node.textContent = message; region.append(node); window.setTimeout(() => node.remove(), 5500); }
function showError(message) { const box = $("#area-status"); box.hidden = false; box.dataset.tone = "error"; box.textContent = message; }
function clearError() { const box = $("#area-status"); box.hidden = true; box.textContent = ""; }
function modelLabel(model) { return `${model.nome} · ${human(model.tipo)} · ${model.versoes.length} versão(ões)`; }
function versionsOf(model) { return [...(model?.versoes || [])].sort((a, b) => b.versao - a.versao); }
function selectedModel() { return state.models.find((model) => model.id === state.selectedModelId) || null; }
function selectedVersion() { return selectedModel()?.versoes.find((version) => version.id === state.selectedVersionId) || null; }
function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeStructure(structure, model) { const copy = deepCopy(structure || emptyStructure()); copy.codigo ||= `${model?.chave || "modelo"}-v${(versionsOf(model)[0]?.versao || 0) + 1}`; copy.titulo ||= model?.nome || ""; copy.orientacao ||= ""; copy.secoes = Array.isArray(copy.secoes) ? copy.secoes : []; copy.secoes.forEach((section, index) => { section.codigo ||= String(index + 1); section.titulo ||= `Seção ${index + 1}`; section.campos = Array.isArray(section.campos) ? section.campos : []; section.campos.forEach((field, fieldIndex) => { field.chave ||= `pergunta_${index + 1}_${fieldIndex + 1}`; field.rotulo ||= `Pergunta ${fieldIndex + 1}`; field.tipo ||= "textarea"; field.obrigatorio = Boolean(field.obrigatorio); field.fundamento ||= ""; field.ajuda ||= ""; }); }); return copy; }

function areaLinks() { return `<nav class="area-nav" aria-label="Áreas operacionais de Compras"><a href="index.html"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i> Painel</a><a href="artefatos.html"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ETP / TR</a><a href="modelos.html" aria-current="page"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Modelos</a><a href="decisoes.html"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Decisões</a><a href="governanca.html"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i> Regras e fontes</a>${state.membership?.role === "tenant_admin" ? `<a href="auditoria.html"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Auditoria</a>` : ""}</nav>`; }
function typeOptions(selected = "etp") { return ["etp", "termo_referencia", "projeto_basico", "edital", "outro"].map((type) => `<option value="${type}" ${type === selected ? "selected" : ""}>${esc(human(type))}</option>`).join(""); }
function statusPill(value) { return `<span class="status-pill" data-status="${esc(value)}">${esc(human(value))}</span>`; }

function render() {
  const model = selectedModel(); const version = selectedVersion();
  $("#model-workspace").innerHTML = `${areaLinks()}<section class="surface-card model-admin-intro"><div><p class="eyebrow">Governança de formulários</p><h2>Modelos publicados com histórico preservado</h2><p>Edite a estrutura abaixo e salve uma nova versão. Publicar uma nova versão arquiva automaticamente a versão oficial anterior; documentos já preenchidos continuam vinculados ao modelo que utilizaram.</p></div><button class="button button-primary" type="button" id="new-model"><i class="fa-solid fa-plus" aria-hidden="true"></i> Novo modelo</button></section>
    <div class="model-admin-grid"><section class="surface-card"><div class="card-heading"><div><p class="eyebrow">Catálogo</p><h2>Modelos cadastrados</h2></div><span class="heading-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span></div><div class="model-catalog">${state.models.length ? state.models.map((item) => `<button class="model-catalog-item ${item.id === state.selectedModelId ? "is-active" : ""}" type="button" data-select-model="${esc(item.id)}"><strong>${esc(item.nome)}</strong><small>${esc(human(item.tipo))} · ${item.versoes.length} versão(ões)</small><span>${esc(item.descricao || "Sem descrição")}</span></button>`).join("") : `<div class="dialog-callout">Nenhum modelo cadastrado.</div>`}</div></section>
    <section class="surface-card model-editor-card"><div class="card-heading"><div><p class="eyebrow">${model ? "Edição versionada" : "Novo cadastro"}</p><h2>${esc(model?.nome || "Novo modelo")}</h2></div><span class="heading-icon"><i class="fa-solid fa-pen-ruler" aria-hidden="true"></i></span></div>${editorHtml(model, version)}</section></div>`;
  bindEvents();
}

function editorHtml(model, version) {
  const structure = state.draft || normalizeStructure(version?.estrutura, model);
  const isNew = !model;
  const latest = versionsOf(model)[0];
  return `<form id="model-form" class="form-grid model-form" novalidate><input type="hidden" name="modelo_id" value="${esc(model?.id || "")}">
    <div class="form-field"><label for="model-key">Chave técnica *</label><input id="model-key" name="chave" required maxlength="100" pattern="[a-z0-9][a-z0-9_-]*" value="${esc(model?.chave || "")}" placeholder="ex.: etp-municipal-oficial"><span class="form-help">Use apenas letras minúsculas, números, hífen ou sublinhado.</span></div>
    <div class="form-field"><label for="model-type">Tipo *</label><select id="model-type" name="tipo" required>${typeOptions(model?.tipo || "etp")}</select></div>
    <div class="form-field span-2"><label for="model-name">Nome de apresentação *</label><input id="model-name" name="nome" required maxlength="200" value="${esc(model?.nome || structure.titulo || "")}" placeholder="Ex.: ETP Municipal — Modelo oficial"></div>
    <div class="form-field span-2"><label for="model-description">Descrição</label><textarea id="model-description" name="descricao" maxlength="1200" rows="2" placeholder="Quando este modelo deve ser utilizado?">${esc(model?.descricao || "")}</textarea></div>
    <div class="form-field span-2"><label for="model-orientation">Orientação para o preenchimento</label><textarea id="model-orientation" name="orientacao" maxlength="3000" rows="3">${esc(structure.orientacao || "")}</textarea></div>
    ${model ? `<div class="model-history span-2"><div class="fields-editor-head"><strong>Histórico de versões</strong><span class="form-help">Selecione uma versão para carregá-la como base de uma nova edição.</span></div><div class="model-version-list">${versionsOf(model).map((item) => `<div class="model-version-row ${item.id === version?.id ? "is-current" : ""}"><span><strong>v${esc(item.versao)}</strong> ${statusPill(item.situacao)} <small>${esc(date(item.created_at))}</small></span><button class="button button-outline button-small" type="button" data-select-version="${esc(item.id)}">Carregar base</button></div>`).join("")}</div></div>` : ""}
    <div class="model-version-toolbar span-2"><div><p class="eyebrow">Estrutura da versão ${latest ? `seguinte à v${latest.versao}` : "inicial"}</p><p class="muted-text">${version ? `Editando uma cópia da v${version.versao} (${human(version.situacao)}).` : "Cada salvamento cria uma nova versão, sem apagar versões anteriores."}</p></div><button class="button button-outline button-small" type="button" id="add-section"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Adicionar seção</button></div>
    <div id="sections-editor" class="sections-editor span-2">${structure.secoes.map((section, index) => sectionHtml(section, index)).join("") || `<div class="dialog-callout">Adicione a primeira seção para começar.</div>`}</div>
    <div class="dialog-actions span-2"><button class="button button-outline" type="button" id="reset-editor">Desfazer alterações</button><button class="button button-outline" type="button" id="save-draft"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Salvar rascunho</button><button class="button button-primary" type="button" id="publish-model"><i class="fa-solid fa-rocket" aria-hidden="true"></i> Publicar versão</button></div>
  </form>`;
}
function sectionHtml(section, index) { return `<fieldset class="model-section" data-section-index="${index}"><legend><span>Seção ${index + 1}</span><button class="icon-button" type="button" data-remove-section="${index}" aria-label="Remover seção"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></legend><div class="form-grid"><div class="form-field"><label>Código *</label><input data-section-field="codigo" value="${esc(section.codigo)}" maxlength="30" required></div><div class="form-field"><label>Título da seção *</label><input data-section-field="titulo" value="${esc(section.titulo)}" maxlength="200" required></div><div class="fields-editor span-2"><div class="fields-editor-head"><strong>Perguntas da seção</strong><button class="button button-outline button-small" type="button" data-add-field="${index}"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nova pergunta</button></div><div class="fields-list">${(section.campos || []).map((field, fieldIndex) => fieldHtml(field, index, fieldIndex)).join("") || `<p class="muted-text">Nenhuma pergunta. Adicione uma para tornar a seção preenchível.</p>`}</div></div></div></fieldset>`; }
function fieldHtml(field, sectionIndex, fieldIndex) { return `<article class="model-field" data-field-index="${fieldIndex}"><div class="model-field-head"><strong>Pergunta ${fieldIndex + 1}</strong><button class="icon-button" type="button" data-remove-field="${sectionIndex}:${fieldIndex}" aria-label="Remover pergunta"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div><div class="form-grid"><div class="form-field"><label>Chave *</label><input data-field="chave" value="${esc(field.chave)}" maxlength="100" required></div><div class="form-field"><label>Rótulo / pergunta *</label><input data-field="rotulo" value="${esc(field.rotulo)}" maxlength="500" required></div><div class="form-field"><label>Tipo de resposta</label><select data-field="tipo"><option value="textarea" ${field.tipo === "textarea" ? "selected" : ""}>Texto longo</option><option value="text" ${field.tipo === "text" ? "selected" : ""}>Texto curto</option><option value="date" ${field.tipo === "date" ? "selected" : ""}>Data</option><option value="number" ${field.tipo === "number" ? "selected" : ""}>Número</option></select></div><label class="checkbox-field"><input type="checkbox" data-field="obrigatorio" ${field.obrigatorio ? "checked" : ""}> Campo obrigatório</label><div class="form-field"><label>Fundamento / referência</label><input data-field="fundamento" value="${esc(field.fundamento || "")}" maxlength="300"></div><div class="form-field"><label>Ajuda para o preenchimento</label><input data-field="ajuda" value="${esc(field.ajuda || "")}" maxlength="500"></div></div></article>`; }

function readStructure(form) {
  return { codigo: `${form.elements.chave.value.trim()}-v${(versionsOf(selectedModel())[0]?.versao || 0) + 1}`, titulo: form.elements.nome.value.trim(), orientacao: form.elements.orientacao.value.trim(), secoes: [...form.querySelectorAll("[data-section-index]")].map((sectionNode) => ({
    codigo: sectionNode.querySelector('[data-section-field="codigo"]').value.trim(),
    titulo: sectionNode.querySelector('[data-section-field="titulo"]').value.trim(),
    campos: [...sectionNode.querySelectorAll("[data-field-index]")].map((fieldNode) => ({
      chave: fieldNode.querySelector('[data-field="chave"]').value.trim(), rotulo: fieldNode.querySelector('[data-field="rotulo"]').value.trim(), tipo: fieldNode.querySelector('[data-field="tipo"]').value,
      obrigatorio: fieldNode.querySelector('[data-field="obrigatorio"]').checked, fundamento: fieldNode.querySelector('[data-field="fundamento"]').value.trim(), ajuda: fieldNode.querySelector('[data-field="ajuda"]').value.trim(),
    })),
  })) };
}
function collectStructure(form) {
  const structure = readStructure(form); const { secoes: sections } = structure;
  const keys = sections.flatMap((section) => section.campos.map((field) => field.chave));
  if (!sections.length) throw new Error("Adicione pelo menos uma seção.");
  if (sections.some((section) => !section.codigo || !section.titulo || !section.campos.length)) throw new Error("Cada seção precisa ter código, título e pelo menos uma pergunta.");
  if (sections.some((section) => section.campos.some((field) => !field.chave || !field.rotulo))) throw new Error("Toda pergunta precisa ter chave e rótulo.");
  if (new Set(keys).size !== keys.length) throw new Error("As chaves das perguntas precisam ser únicas dentro do modelo.");
  if (keys.some((key) => !/^[a-z0-9][a-z0-9_-]*$/.test(key))) throw new Error("As chaves das perguntas devem usar letras minúsculas, números, hífen ou sublinhado.");
  return structure;
}
function bindEvents() {
  $("#new-model")?.addEventListener("click", () => { state.selectedModelId = null; state.selectedVersionId = null; state.draft = emptyStructure(); clearError(); render(); });
  document.querySelectorAll("[data-select-model]").forEach((button) => button.addEventListener("click", () => { state.selectedModelId = button.dataset.selectModel; const model = selectedModel(); state.selectedVersionId = versionsOf(model)[0]?.id || null; state.draft = null; clearError(); render(); }));
  document.querySelectorAll("[data-select-version]").forEach((button) => button.addEventListener("click", () => { state.selectedVersionId = button.dataset.selectVersion; state.draft = null; clearError(); render(); }));
  $("#add-section")?.addEventListener("click", () => { const form = $("#model-form"); const structure = collectStructureLoose(form); structure.secoes.push({ codigo: String(structure.secoes.length + 1), titulo: "Nova seção", campos: [] }); state.draft = structure; render(); });
  document.querySelectorAll("[data-remove-section]").forEach((button) => button.addEventListener("click", () => mutateEditor(() => { const structure = collectStructureLoose($("#model-form")); structure.secoes.splice(Number(button.dataset.removeSection), 1); return structure; })));
  document.querySelectorAll("[data-add-field]").forEach((button) => button.addEventListener("click", () => mutateEditor(() => { const structure = collectStructureLoose($("#model-form")); const index = Number(button.dataset.addField); structure.secoes[index].campos.push({ chave: `pergunta_${index + 1}_${structure.secoes[index].campos.length + 1}`, rotulo: "Nova pergunta", tipo: "textarea", obrigatorio: false, fundamento: "", ajuda: "" }); return structure; })));
  document.querySelectorAll("[data-remove-field]").forEach((button) => button.addEventListener("click", () => mutateEditor(() => { const structure = collectStructureLoose($("#model-form")); const [section, field] = button.dataset.removeField.split(":").map(Number); structure.secoes[section].campos.splice(field, 1); return structure; })));
  $("#reset-editor")?.addEventListener("click", () => { state.draft = null; render(); });
  $("#save-draft")?.addEventListener("click", () => save(false));
  $("#publish-model")?.addEventListener("click", () => save(true));
}
function collectStructureLoose(form) { return readStructure(form); }
function mutateEditor(mutator) { state.draft = mutator(); render(); }
async function save(publish) {
  clearError(); const form = $("#model-form"); try {
    const structure = collectStructure(form); const key = form.elements.chave.value.trim(); const name = form.elements.nome.value.trim();
    if (!key || !name) throw new Error("Informe a chave técnica e o nome do modelo.");
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(key)) throw new Error("A chave técnica contém caracteres inválidos.");
    const { data, error } = await supabase.rpc("compras_salvar_modelo_artefato", { p_modelo_id: String(form.elements.modelo_id.value || "") || null, p_chave: key, p_nome: name, p_tipo: form.elements.tipo.value, p_descricao: form.elements.descricao.value.trim(), p_estrutura: structure, p_publicar: publish });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data; notify(publish ? `Versão ${row.numero_versao} publicada. A versão anterior foi arquivada.` : `Rascunho da versão ${row.numero_versao} salvo.`);
    await loadModels(); state.selectedModelId = row.modelo_id; state.selectedVersionId = row.versao_id; state.draft = null; render();
  } catch (error) { showError(error.message || "Não foi possível salvar o modelo."); }
}
async function loadModels() { const [models, versions] = await Promise.all([supabase.from("compras_modelos_artefato").select("id,chave,nome,tipo,descricao,ativo,created_at").eq("tenant_id", state.tenantId).order("nome").limit(200), supabase.from("compras_modelos_artefato_versoes").select("id,modelo_id,versao,situacao,estrutura,publicada_em,created_by,created_at").eq("tenant_id", state.tenantId).order("versao", { ascending: false }).limit(500)]); if (models.error) throw models.error; if (versions.error) throw versions.error; state.models = (models.data || []).map((model) => ({ ...model, versoes: (versions.data || []).filter((version) => version.modelo_id === model.id) })); if (!state.selectedModelId && state.models.length) { state.selectedModelId = state.models[0].id; state.selectedVersionId = versionsOf(state.models[0])[0]?.id || null; } }
async function start() { try {
  state.user = await initLayout({ supabase, brand: { nome: "Compras Públicas", subtitulo: "Intranet Municipal", icone: "fa-cart-shopping" }, iconeTitulo: "fa-sliders", titulo: "Modelos de documentos", subtitulo: "Estrutura configurável de ETP, TR e documentos auxiliares", moduloAtivo: "compras-modelos", rotaVoltar: "../intranet.html", textoVoltar: "Voltar à intranet", menuUsuario: { rotaPerfil: "../perfil.html", rotaAjuda: "ajuda.html" }, menu: COMPRAS_MENU });
  if (!state.user) return;
  const { data: memberships, error } = await supabase.from("app_tenant_memberships").select("tenant_id,unidade_id,role,ativo").eq("user_id", state.user.id).eq("ativo", true).limit(2); if (error) throw error; if (!memberships?.length) throw new Error("Seu usuário não possui vínculo ativo com Compras Públicas."); if (memberships.length > 1) throw new Error("Há mais de um vínculo ativo; o administrador precisa definir a unidade."); state.membership = memberships[0]; state.tenantId = state.membership.tenant_id; if (!manager(state.membership)) throw new Error("Apenas Compras ou o administrador podem gerenciar modelos.");
  $("#context-bar").hidden = false; $("#context-bar").innerHTML = `<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span><strong>Acesso de gestão</strong> · ${esc(human(state.membership.role))} · novas versões não alteram documentos históricos</span>`; await loadModels(); render();
} catch (error) { console.error("[Compras modelos]", error); showError(error.message || "Não foi possível carregar o gerenciador de modelos."); $("#model-workspace").innerHTML = ""; } }
start();
