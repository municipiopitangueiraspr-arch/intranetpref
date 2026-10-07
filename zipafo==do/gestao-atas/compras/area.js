import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js";
import { COMPRAS_MENU } from "./compras-menu.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = "") => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const human = (value = "") => String(value || "").replaceAll("_", " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
const date = (value) => value ? dateFmt.format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)) : "—";
const money = (value) => value == null || value === "" ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const safeUrl = (value) => { try { const u = new URL(String(value)); return ["https:", "http:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
const manager = (s) => ["tenant_admin", "compras_manager"].includes(s.membership?.role);
const admin = (s) => s.membership?.role === "tenant_admin";

const pages = {
  artefatos: { id: "compras-artefatos", title: "Artefatos da contratação", subtitle: "ETP, Termo de Referência, edital e documentos estruturados", icon: "fa-file-lines", lead: "Prepare versões iniciais ligadas ao processo, acompanhe revisões e mantenha cada minuta como rascunho até a validação dos responsáveis.", nav: "artefatos.html" },
  decisoes: { id: "compras-decisoes", title: "Decisões e atos", subtitle: "Registro de motivação, autoridade e fundamento informado", icon: "fa-scale-balanced", lead: "Registre o que foi decidido, por quem, quando e com qual justificativa. Cada registro é append-only; correções devem referenciar o ato anterior.", nav: "decisoes.html" },
  governanca: { id: "compras-governanca", title: "Regras e fontes", subtitle: "Norma legal separada de procedimento interno", icon: "fa-book-bookmark", lead: "Cadastre versões identificadas de normas, procedimentos internos e parâmetros. O sistema não interpreta nem substitui parecer jurídico.", nav: "governanca.html" },
  auditoria: { id: "compras-auditoria", title: "Trilha de auditoria", subtitle: "Histórico de alterações por entidade e horário", icon: "fa-clipboard-check", lead: "Consulte a trilha técnica e os relatórios de auditoria do tenant. O acesso é exclusivo do administrador.", nav: "auditoria.html" },
  processo: { id: "compras-processos", title: "Ficha do processo", subtitle: "Visão independente do ciclo e dos artefatos vinculados", icon: "fa-folder-open", lead: "Etapas, documentos, tarefas, decisões, artefatos e contratos relacionados ao mesmo processo.", nav: "index.html#tab-processes" },
};
const state = { user: null, membership: null, tenantId: null, processes: [], rules: [], resources: { artifacts: [], versions: [], documents: [], decisions: [], stages: [], tasks: [], contracts: [], events: [] }, page: null };
let resourceRequestToken = 0;

function notify(message, tone = "success") {
  const region = $("#toast-region");
  const node = document.createElement("div"); node.className = "toast"; node.dataset.tone = tone; node.textContent = message; region.append(node);
  window.setTimeout(() => node.remove(), 5000);
}
function showError(message) {
  const box = $("#area-status"); box.hidden = false; box.dataset.tone = "error"; box.textContent = message;
}
function statusPill(value) { return `<span class="status-pill" data-status="${esc(value)}">${esc(human(value || "sem situação"))}</span>`; }
function noData(text) { return `<div class="surface-card attention-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><strong>${esc(text)}</strong></div>`; }
function processLabel(p) { return `${p.numero_processo}/${p.ano} · ${String(p.objeto || "").slice(0, 100)}`; }
function selectOptions(rows, placeholder, labelFn, valueFn = (r) => r.id) {
  return `<option value="">${esc(placeholder)}</option>${rows.map((r) => `<option value="${esc(valueFn(r))}">${esc(labelFn(r))}</option>`).join("")}`;
}
function processOptions() { return selectOptions(state.processes, "Selecione um processo", processLabel); }
function initialProcessId() {
  const requested = new URLSearchParams(window.location.search).get("processo_id");
  return state.processes.some((p) => p.id === requested) ? requested : (state.processes[0]?.id || "");
}

async function loadMembership() {
  const { data, error } = await supabase.from("app_tenant_memberships")
    .select("tenant_id,unidade_id,role,ativo").eq("user_id", state.user.id).eq("ativo", true).limit(2);
  if (error) throw error;
  if (!data?.length) throw new Error("Seu usuário não tem vínculo ativo com Compras Públicas. Peça ao administrador da Intranet para conferir o acesso.");
  if (data.length > 1) throw new Error("Há mais de um vínculo ativo. O administrador precisa definir a organização/unidade antes de continuar.");
  state.membership = data[0]; state.tenantId = data[0].tenant_id;
  const { data: processes, error: processError } = await supabase.from("compras_processos")
    .select("id,numero_processo,ano,objeto,status,modalidade,procedimento,tipo_contratacao,valor_estimado,valor_homologado,ata_id,data_abertura,data_homologacao,unidade_id")
    .eq("tenant_id", state.tenantId).order("ano", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (processError) throw processError;
  state.processes = processes || [];
  const context = $("#context-bar"); context.hidden = false;
  context.innerHTML = `<i class="fa-solid fa-building" aria-hidden="true"></i><span><strong>${manager(state) ? "Acesso de gestão" : "Acesso de leitura"}</strong> · ${esc(human(state.membership.role))}</span>`;
  if (["governanca", "decisoes", "artefatos"].includes(state.page) && !manager(state)) {
    document.querySelectorAll("[data-manager-only]").forEach((node) => { node.hidden = true; });
  }
}

function renderShell() {
  const page = pages[state.page];
  document.title = `${page.title} | Compras Públicas`;
  $("#area-title").textContent = page.title;
  $("#area-subtitle").textContent = page.subtitle;
  $("#area-lead").textContent = page.lead;
  $("#area-icon").className = `fa-solid ${page.icon}`;
}

function renderPage() {
  if (state.page === "artefatos") return renderArtifactsPage();
  if (state.page === "decisoes") return renderDecisionsPage();
  if (state.page === "governanca") return renderGovernancePage();
  if (state.page === "auditoria") return renderAuditPage();
  return renderProcessPage();
}
function renderAreaLinks() {
  const auditLink = admin(state) ? `<a href="auditoria.html"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Auditoria</a>` : "";
  return `<nav class="area-nav" aria-label="Áreas operacionais de Compras">
    <a href="index.html"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i> Painel</a>
    <a href="index.html#tab-processes"><i class="fa-solid fa-folder-tree" aria-hidden="true"></i> Processos</a>
    <a href="artefatos.html"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ETP / TR</a>
    <a href="decisoes.html"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Decisões</a>
    <a href="governanca.html"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i> Regras e fontes</a>
    ${auditLink}
  </nav>`;
}
function renderArtifactsPage() {
  const canWrite = manager(state);
  $("#area-workspace").innerHTML = `${renderAreaLinks()}
    <section class="surface-card area-intro"><p class="eyebrow">Minutas guiadas</p><h2>Prepare e revise os documentos do processo</h2><p>Use estes campos como estrutura de trabalho. A versão só fica registrada como rascunho ou em revisão; aprovação, assinatura e publicação exigem conferência formal da equipe.</p></section>
    ${canWrite ? `<section class="surface-card area-form-card"><div class="card-heading"><div><p class="eyebrow">Nova versão</p><h2>ETP, TR, edital ou outro artefato</h2></div><span class="heading-icon"><i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i></span></div>
      <form id="artifact-form" class="form-grid area-form"><div class="form-field span-2"><label for="artifact-process">Processo *</label><select id="artifact-process" name="processo_id" required>${processOptions()}</select></div>
      <div class="form-field"><label for="artifact-existing">Documento existente (opcional)</label><select id="artifact-existing" name="artefato_id"><option value="">Criar novo documento</option></select><span class="form-help">Escolha um documento para criar a próxima revisão sem apagar as anteriores.</span></div>
      <div class="form-field"><label for="artifact-type">Tipo *</label><select id="artifact-type" name="tipo" required><option value="etp">Estudo Técnico Preliminar (ETP)</option><option value="termo_referencia">Termo de Referência (TR)</option><option value="projeto_basico">Projeto Básico</option><option value="edital">Edital / minuta</option><option value="parecer_tecnico">Parecer técnico</option><option value="mapa_pesquisa_precos">Mapa de pesquisa de preços</option><option value="nota_autorizacao">Nota de autorização</option><option value="ata_sessao">Ata de sessão</option><option value="outro">Outro artefato</option></select></div>
      <div class="form-field span-2"><label for="artifact-title">Título do documento *</label><input id="artifact-title" name="titulo" maxlength="300" required placeholder="Ex.: ETP — aquisição de materiais de expediente" /></div>
      <div class="form-field"><label>Necessidade e problema</label><textarea name="necessidade" maxlength="6000" placeholder="Qual problema público precisa ser resolvido? Quem será atendido?"></textarea></div>
      <div class="form-field"><label>Requisitos e resultados esperados</label><textarea name="requisitos" maxlength="6000" placeholder="Descreva requisitos funcionais, níveis de serviço e resultados esperados."></textarea></div>
      <div class="form-field"><label>Alternativas e justificativa da solução</label><textarea name="alternativas" maxlength="6000" placeholder="Registre alternativas avaliadas e a justificativa técnica informada."></textarea></div>
      <div class="form-field"><label>Estimativa e memória de cálculo</label><textarea name="estimativa" maxlength="6000" placeholder="Indique quantitativos, fontes, premissas e memória de cálculo."></textarea></div>
      <div class="form-field"><label>Riscos e medidas de tratamento</label><textarea name="riscos" maxlength="6000" placeholder="Riscos identificados, impacto, prevenção e responsável."></textarea></div>
      <div class="form-field"><label>Critérios de recebimento e aceite</label><textarea name="criterios_aceite" maxlength="6000" placeholder="Como a equipe verificará a entrega e a qualidade?"></textarea></div>
      <div class="form-field"><label>Modelo de execução e fiscalização</label><textarea name="execucao" maxlength="6000" placeholder="Descreva acompanhamento, medição, fiscalização e obrigações propostas."></textarea></div>
      <div class="form-field"><label>Situação inicial</label><select name="situacao"><option value="rascunho">Rascunho</option><option value="em_revisao">Enviar para revisão</option></select></div>
      <div class="form-field span-2"><label>Notas complementares</label><textarea name="observacoes" maxlength="6000" placeholder="Fontes consultadas, pontos pendentes e observações da equipe."></textarea></div>
      <div class="area-actions span-2"><button class="button button-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Salvar versão</button></div></form></section>` : `<section class="surface-card">${noData("Seu perfil pode consultar documentos do processo; somente Compras ou o administrador cadastra versões.")}</section>`}
    <section class="surface-card"><div class="list-toolbar"><div><p class="eyebrow">Histórico imutável</p><h2>Versões registradas</h2><p class="muted-text">Escolha o processo para consultar seus documentos e revisões.</p></div><label class="form-field area-process-filter" for="artifact-filter-process"><span>Processo</span><select id="artifact-filter-process">${processOptions()}</select></label></div><div id="artifact-list">${noData("Selecione um processo para consultar os artefatos.")}</div></section>`;
  bindProcessSelect("#artifact-filter-process", (id) => {
    if (canWrite && $("#artifact-process")) $("#artifact-process").value = id;
    return loadSelectedProcessResources(id);
  });
  if (canWrite) bindProcessSelect("#artifact-process", (id) => {
    $("#artifact-filter-process").value = id;
    return loadSelectedProcessResources(id);
  });
  if (canWrite) bindForm("artifact-form", saveArtifact);
  const initial = initialProcessId();
  if (initial) {
    $("#artifact-filter-process").value = initial;
    if (canWrite) $("#artifact-process").value = initial;
  }
  loadSelectedProcessResources(initial);
}
function renderDecisionsPage() {
  const canWrite = manager(state);
  $("#area-workspace").innerHTML = `${renderAreaLinks()}
    <section class="surface-card area-intro"><p class="eyebrow">Rastreabilidade administrativa</p><h2>Registre o ato e a justificativa</h2><p>O registro organiza a evidência fornecida pela equipe. Ele não é uma assinatura digital, não publica atos e não decide se o fundamento jurídico é suficiente.</p></section>
    ${canWrite ? `<section class="surface-card area-form-card"><div class="card-heading"><div><p class="eyebrow">Novo registro</p><h2>Decisão, parecer ou autorização</h2></div><span class="heading-icon"><i class="fa-solid fa-file-signature" aria-hidden="true"></i></span></div>
      <form id="decision-form" class="form-grid area-form"><div class="form-field span-2"><label for="decision-process">Processo *</label><select id="decision-process" name="processo_id" required>${processOptions()}</select></div>
      <div class="form-field"><label>Tipo de decisão *</label><select name="tipo_decisao" required><option value="analise">Análise</option><option value="parecer_tecnico">Parecer técnico</option><option value="parecer_juridico">Parecer jurídico</option><option value="habilitacao">Habilitação</option><option value="julgamento">Julgamento</option><option value="recurso">Recurso</option><option value="adjudicacao">Adjudicação</option><option value="homologacao">Homologação</option><option value="autorizacao_direta">Autorização de contratação direta</option><option value="aprovacao_etp">Aprovação de ETP</option><option value="aprovacao_tr">Aprovação de TR</option><option value="formalizacao">Formalização</option><option value="encerramento">Encerramento</option><option value="outra">Outra</option></select></div>
      <div class="form-field"><label>Data do ato *</label><input name="decidido_em" type="date" required value="${new Date().toISOString().slice(0,10)}" /></div>
      <div class="form-field"><label>Resultado informado *</label><input name="resultado" maxlength="1000" required placeholder="Ex.: aprovado, diligência, recurso acolhido…" /></div>
      <div class="form-field"><label>Autoridade / responsável pelo ato *</label><input name="autoridade_ato" maxlength="300" required placeholder="Nome, cargo ou referência do ato formal" /></div>
      <div class="form-field"><label>Fundamento informado</label><input name="fundamento_informado" maxlength="1000" placeholder="Referência informada pela equipe — não é validação jurídica" /></div>
      <div class="form-field"><label>Versão de artefato relacionada</label><select id="decision-artifact-version" name="artefato_versao_id"><option value="">Opcional</option></select></div>
      <div class="form-field"><label>Versão de regra/fonte relacionada</label><select id="decision-rule-version" name="regra_versao_id"><option value="">Opcional</option></select></div>
      <div class="form-field"><label>Documento de processo relacionado</label><select id="decision-document" name="documento_id"><option value="">Opcional</option></select></div>
      <div class="form-field"><label>Substitui decisão anterior</label><select id="decision-previous" name="substitui_id"><option value="">Não substitui</option></select></div>
      <div class="form-field span-2"><label>Motivação registrada *</label><textarea name="motivacao" maxlength="8000" required placeholder="Registre os fatos, critérios, análise e razões apresentadas no ato."></textarea></div>
      <div class="area-actions span-2"><button class="button button-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Registrar decisão</button></div></form></section>` : `<section class="surface-card">${noData("Somente Compras ou o administrador pode registrar atos decisórios.")}</section>`}
    <section class="surface-card"><div class="list-toolbar"><div><p class="eyebrow">Histórico por processo</p><h2>Decisões cadastradas</h2></div><label class="form-field area-process-filter"><span>Processo</span><select id="decision-filter-process">${processOptions()}</select></label></div><div id="decision-list">${noData("Selecione um processo para consultar os registros.")}</div></section>`;
  if (canWrite) bindProcessSelect("#decision-process", (id) => {
    if ($("#decision-filter-process")) $("#decision-filter-process").value = id;
    loadSelectedProcessResources(id);
  });
  bindProcessSelect("#decision-filter-process", (id) => {
    if ($("#decision-process")) $("#decision-process").value = id;
    loadSelectedProcessResources(id);
  });
  if (canWrite) bindForm("decision-form", saveDecision);
  const selected = initialProcessId();
  if (selected) {
    if (canWrite) $("#decision-process").value = selected;
    $("#decision-filter-process").value = selected;
    loadSelectedProcessResources(selected);
  }
}
function renderGovernancePage() {
  const canWrite = manager(state);
  $("#area-workspace").innerHTML = `${renderAreaLinks()}
    <section class="surface-card area-intro"><p class="eyebrow">Regra ≠ orientação interna</p><h2>Separe fontes e registre a versão usada</h2><p>Classifique cada registro como norma legal, procedimento interno ou parâmetro do sistema; informe origem, localizador e vigência. Não publique aqui interpretação jurídica automática.</p></section>
    ${canWrite ? `<section class="surface-card area-form-card"><div class="card-heading"><div><p class="eyebrow">Nova versão</p><h2>Norma, procedimento ou parâmetro</h2></div><span class="heading-icon"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i></span></div>
    <form id="rule-form" class="form-grid area-form"><div class="form-field"><label>Classificação *</label><select name="tipo_registro" required><option value="norma_legal">Norma legal</option><option value="procedimento_interno">Procedimento interno municipal</option><option value="parametro_sistema">Parâmetro do sistema</option></select></div>
    <div class="form-field"><label>Chave estável *</label><input name="chave" required maxlength="150" placeholder="Ex.: lei-14133-2021 ou fluxo-srp" /><span class="form-help">Use a mesma chave para criar versões posteriores do mesmo registro.</span></div>
    <div class="form-field span-2"><label>Título *</label><input name="titulo" required maxlength="300" placeholder="Nome da norma, procedimento ou parâmetro" /></div>
    <div class="form-field"><label>Fonte / identificador</label><input name="fonte_identificacao" maxlength="300" placeholder="Órgão emissor, número, versão interna…" /></div>
    <div class="form-field"><label>Artigo, seção ou página</label><input name="localizador" maxlength="300" placeholder="Artigo, item, capítulo ou página" /></div>
    <div class="form-field span-2"><label>URL pública da fonte, se houver</label><input name="fonte_url" type="url" placeholder="https://…" /></div>
    <div class="form-field span-2"><label>Resumo descritivo *</label><textarea name="resumo" required maxlength="8000" placeholder="Descreva o conteúdo e a relação com o fluxo sem transformar o resumo em parecer jurídico."></textarea></div>
    <div class="form-field"><label>Início de vigência</label><input name="vigencia_inicio" type="date" /></div><div class="form-field"><label>Fim de vigência</label><input name="vigencia_fim" type="date" /></div>
    <div class="form-field"><label>Situação *</label><select name="situacao"><option value="rascunho">Rascunho</option><option value="em_revisao">Em revisão</option></select></div>
    <div class="form-field"><label>Versão anterior que esta substitui</label><select id="rule-replaces" name="substitui_id"><option value="">Nova chave / primeira versão</option></select></div>
    <div class="area-actions span-2"><button class="button button-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Registrar versão</button></div></form></section>` : `<section class="surface-card">${noData("Seu perfil pode consultar as referências do tenant; somente Compras ou o administrador cadastra versões.")}</section>`}
    <section class="surface-card"><div class="list-toolbar"><div><p class="eyebrow">Histórico append-only</p><h2>Fontes e procedimentos cadastrados</h2></div><label class="form-field area-process-filter"><span>Classificação</span><select id="rule-filter"><option value="">Todas</option><option value="norma_legal">Norma legal</option><option value="procedimento_interno">Procedimento interno</option><option value="parametro_sistema">Parâmetro do sistema</option></select></label></div><div id="rule-list">Carregando registros…</div></section>`;
  if (canWrite) bindForm("rule-form", saveRule);
  $("#rule-filter").addEventListener("change", renderRules);
  renderRules();
}
function renderAuditPage() {
  if (!admin(state)) {
    $("#area-workspace").innerHTML = `${renderAreaLinks()}<section class="surface-card">${noData("A trilha detalhada e os relatórios de auditoria estão disponíveis somente para o administrador do tenant.")}</section>`;
    return;
  }
  $("#area-workspace").innerHTML = `${renderAreaLinks()}<section class="surface-card area-intro"><p class="eyebrow">Evidência de alteração</p><h2>Histórico append-only do tenant</h2><p>Os eventos são produzidos no banco por triggers. A leitura é limitada pelas políticas RLS. A trilha não substitui logs de acesso do provedor nem backup.</p></section>
    <section class="surface-card"><div class="list-toolbar"><div><p class="eyebrow">Últimos 500 eventos</p><h2>Alterações registradas</h2></div><button class="button button-outline" type="button" id="refresh-audit"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Atualizar</button></div><div id="audit-list">Carregando eventos…</div></section>`;
  $("#refresh-audit").addEventListener("click", loadAudit);
  loadAudit();
}
function renderProcessPage() {
  const processId = new URLSearchParams(window.location.search).get("id");
  $("#area-workspace").innerHTML = `${renderAreaLinks()}<div id="process-record" class="area-record">${noData(processId ? "Carregando ficha do processo…" : "Esta rota precisa do identificador do processo. Volte à lista e escolha um processo.")}</div>`;
  if (processId) loadProcessRecord(processId);
}

function bindForm(id, handler) {
  const form = document.getElementById(id); if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]'); if (button) { button.disabled = true; button.dataset.old = button.innerHTML; button.textContent = "Salvando…"; }
    try { await handler(form); }
    catch (error) { console.error(`[Compras:${id}]`, error); notify(error.message || "Não foi possível salvar. Verifique os campos e suas permissões.", "error"); }
    finally { if (button) { button.disabled = false; button.innerHTML = button.dataset.old || "Salvar"; } }
  });
}
function bindProcessSelect(selector, handler) {
  const select = $(selector); if (!select) return;
  select.addEventListener("change", () => handler(select.value));
}
async function loadSelectedProcessResources(processId) {
  const processSelect = state.page === "artefatos" ? $("#artifact-filter-process") : $("#decision-process");
  if (processSelect && processSelect.value !== processId) return;
  const requestToken = ++resourceRequestToken;
  const isCurrentRequest = () => requestToken === resourceRequestToken && (!processSelect || processSelect.value === processId);
  state.resources.artifacts = []; state.resources.versions = []; state.resources.documents = []; state.resources.decisions = [];
  fillArtifactChoices(processId); fillDecisionChoices(); renderResourceList();
  if (state.page === "decisoes") renderDecisionList();
  if (!processId) {
    return;
  }
  const list = $("#artifact-list"); if (list) list.innerHTML = '<p class="muted-text" role="status">Carregando documentos do processo…</p>';
  if (state.page === "decisoes") { const decisions = $("#decision-list"); if (decisions) decisions.innerHTML = '<p class="muted-text" role="status">Carregando decisões…</p>'; }
  const tenantId = state.tenantId;
  try {
    const queries = await Promise.all([
      supabase.from("compras_artefatos").select("id,processo_id,tipo,titulo,created_at").eq("tenant_id", tenantId).eq("processo_id", processId).order("created_at", { ascending: false }).limit(100),
      supabase.from("compras_documentos").select("id,processo_id,etapa_id,tipo_documento,nome,descricao,referencia_url,storage_path,obrigatorio,validade,status,created_at").eq("tenant_id", tenantId).eq("processo_id", processId).order("created_at", { ascending: false }).limit(200),
      supabase.from("compras_decisoes").select("id,processo_id,tipo_decisao,resultado,autoridade_ato,fundamento_informado,motivacao,decidido_em,artefato_versao_id,regra_versao_id,documento_id,substitui_id,registrado_por,created_at").eq("tenant_id", tenantId).eq("processo_id", processId).order("decidido_em", { ascending: false }).limit(200),
    ]);
    if (!isCurrentRequest()) return;
    for (const response of queries) if (response.error) throw response.error;
    const artifactRows = queries[0].data || [];
    const versions = [];
    const artifactIds = artifactRows.map((artifact) => artifact.id);
    for (let offset = 0; artifactIds.length; offset += 500) {
      const { data, error } = await supabase.from("compras_artefato_versoes")
        .select("id,artefato_id,versao,situacao,conteudo,created_by,created_at")
        .eq("tenant_id", tenantId).in("artefato_id", artifactIds)
        .order("created_at", { ascending: false }).range(offset, offset + 499);
      if (!isCurrentRequest()) return;
      if (error) throw error;
      versions.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    if (!isCurrentRequest()) return;
    state.resources.artifacts = artifactRows;
    state.resources.versions = versions;
    state.resources.documents = queries[1].data || [];
    state.resources.decisions = queries[2].data || [];
    fillArtifactChoices(processId);
    fillDecisionChoices();
    renderResourceList();
    if (state.page === "decisoes") renderDecisionList();
  } catch (error) {
    if (!isCurrentRequest()) return;
    state.resources.artifacts = []; state.resources.versions = []; state.resources.documents = []; state.resources.decisions = [];
    fillArtifactChoices(); fillDecisionChoices(); renderResourceList();
    if (state.page === "decisoes") renderDecisionList();
    console.error("[Compras] Falha ao consultar registros do processo:", error);
    notify(error.message || "Não foi possível carregar os registros do processo.", "error");
  }
}
function fillArtifactChoices(processId) {
  const select = $("#artifact-existing");
  if (select) select.innerHTML = `<option value="">Criar novo documento</option>${state.resources.artifacts.map((a) => `<option value="${esc(a.id)}">${esc(a.titulo)} · ${esc(human(a.tipo))}</option>`).join("")}`;
}
async function saveArtifact(form) {
  if (!manager(state)) throw new Error("Somente Compras ou o administrador pode registrar artefatos.");
  const d = new FormData(form); const processId = String(d.get("processo_id"));
  if (!state.processes.some((p) => p.id === processId)) throw new Error("Selecione um processo permitido.");
  const payload = {
    necessidade: String(d.get("necessidade") || "").trim(), requisitos: String(d.get("requisitos") || "").trim(), alternativas: String(d.get("alternativas") || "").trim(),
    estimativa: String(d.get("estimativa") || "").trim(), riscos: String(d.get("riscos") || "").trim(), criterios_aceite: String(d.get("criterios_aceite") || "").trim(),
    execucao: String(d.get("execucao") || "").trim(), observacoes: String(d.get("observacoes") || "").trim(), origem: "interface_compras_v1",
  };
  const { data, error } = await supabase.rpc("compras_registrar_artefato_versao", {
    p_processo_id: processId, p_tipo: d.get("tipo"), p_titulo: String(d.get("titulo")).trim(), p_conteudo: payload,
    p_artefato_id: String(d.get("artefato_id") || "") || null, p_situacao: d.get("situacao"),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  notify(`Versão ${row?.numero_versao || ""} registrada. O documento continua como rascunho/em revisão; não foi aprovado nem publicado.`);
  form.reset();
  const process = $("#artifact-process"); if (process) process.value = processId;
  await loadSelectedProcessResources(processId);
}
function renderResourceList() {
  const target = $("#artifact-list"); if (!target) return;
  if (!state.resources.artifacts.length) { target.innerHTML = noData("Ainda não há artefatos cadastrados para este processo."); return; }
  target.innerHTML = `<div class="version-list">${state.resources.artifacts.map((a) => {
    const versions = state.resources.versions.filter((v) => v.artefato_id === a.id).sort((x,y) => y.versao-x.versao);
    return `<article class="version-card"><div class="version-card-head"><div><span class="eyebrow">${esc(human(a.tipo))}</span><h3>${esc(a.titulo)}</h3></div><span class="status-pill">${versions.length} versão(ões)</span></div>${versions.map((v) => `<details class="version-detail"><summary>Versão ${esc(v.versao)} · ${esc(human(v.situacao))} · ${esc(date(v.created_at))}</summary><dl class="content-summary">${Object.entries(v.conteudo || {}).filter(([k,val]) => !["origem"].includes(k) && String(val || "").trim()).map(([k,val]) => `<div><dt>${esc(human(k))}</dt><dd>${esc(val)}</dd></div>`).join("") || "<div><dd>Sem campos preenchidos nesta versão.</dd></div>"}</dl></details>`).join("")}</article>`;
  }).join("")}</div>`;
}
function fillDecisionChoices() {
  const versionOptions = state.resources.versions.map((v) => ({ ...v, artifact: state.resources.artifacts.find((a) => a.id === v.artefato_id) }));
  const v = $("#decision-artifact-version"); if (v) v.innerHTML = `<option value="">Opcional</option>${versionOptions.map((x) => `<option value="${esc(x.id)}">${esc(x.artifact?.titulo || "Artefato")} · v${esc(x.versao)}</option>`).join("")}`;
  const doc = $("#decision-document"); if (doc) doc.innerHTML = `<option value="">Opcional</option>${state.resources.documents.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("")}`;
  const prev = $("#decision-previous"); if (prev) prev.innerHTML = `<option value="">Não substitui</option>${state.resources.decisions.map((x) => `<option value="${esc(x.id)}">${esc(date(x.decidido_em))} · ${esc(human(x.tipo_decisao))} · ${esc(x.resultado.slice(0,70))}</option>`).join("")}`;
  const rules = $("#decision-rule-version"); if (rules) rules.innerHTML = `<option value="">Opcional</option>${state.rules.map((x) => `<option value="${esc(x.id)}">${esc(x.titulo)} · v${esc(x.versao)} · ${esc(human(x.tipo_registro))}</option>`).join("")}`;
}
async function saveDecision(form) {
  if (!manager(state)) throw new Error("Somente Compras ou o administrador pode registrar decisões.");
  const d = new FormData(form); const processId = String(d.get("processo_id"));
  if (!state.processes.some((p) => p.id === processId)) throw new Error("Selecione um processo permitido.");
  const payload = {
    tenant_id: state.tenantId, processo_id: processId, tipo_decisao: d.get("tipo_decisao"), resultado: String(d.get("resultado")).trim(),
    autoridade_ato: String(d.get("autoridade_ato")).trim(), fundamento_informado: String(d.get("fundamento_informado") || "").trim() || null,
    motivacao: String(d.get("motivacao")).trim(), decidido_em: d.get("decidido_em"), artefato_versao_id: String(d.get("artefato_versao_id") || "") || null,
    regra_versao_id: String(d.get("regra_versao_id") || "") || null, documento_id: String(d.get("documento_id") || "") || null,
    substitui_id: String(d.get("substitui_id") || "") || null, registrado_por: state.user.id,
  };
  const { error } = await supabase.from("compras_decisoes").insert(payload); if (error) throw error;
  notify("Decisão registrada no histórico. Para corrigir, crie outro registro referenciando o anterior.");
  form.reset();
  const dateField = form.querySelector('[name="decidido_em"]'); if (dateField) dateField.value = new Date().toISOString().slice(0,10);
  const processSelect = $("#decision-process"); if (processSelect) processSelect.value = processId;
  await loadSelectedProcessResources(processId);
}
function renderDecisionList() {
  const target = $("#decision-list"); if (!target) return;
  const rows = state.resources.decisions;
  target.innerHTML = rows.length ? `<div class="decision-list">${rows.map((d) => `<article class="decision-card"><div class="decision-meta"><span>${esc(date(d.decidido_em))}</span>${statusPill(d.tipo_decisao)}</div><h3>${esc(d.resultado)}</h3><p><strong>Autoridade:</strong> ${esc(d.autoridade_ato)}</p><p><strong>Motivação:</strong> ${esc(d.motivacao)}</p><p class="muted-text">${d.fundamento_informado ? `<strong>Fundamento informado:</strong> ${esc(d.fundamento_informado)}` : "Sem referência de fundamento informada."}</p>${d.substitui_id ? `<small>Substitui decisão ${esc(d.substitui_id)}</small>` : ""}</article>`).join("")}</div>` : noData("Nenhuma decisão registrada para este processo.");
}
async function saveRule(form) {
  if (!manager(state)) throw new Error("Somente Compras ou o administrador pode cadastrar fontes.");
  const d = new FormData(form); const key = String(d.get("chave")).trim();
  const replacesId = String(d.get("substitui_id") || "") || null;
  const replaces = replacesId ? state.rules.find((r) => r.id === replacesId) : null;
  if (replacesId && (!replaces || replaces.chave !== key)) throw new Error("A versão substituída precisa pertencer à mesma chave do novo registro.");
  const sourceUrl = String(d.get("fonte_url") || "").trim();
  if (sourceUrl && !safeUrl(sourceUrl)) throw new Error("A URL precisa começar com http:// ou https://.");
  const { data, error } = await supabase.rpc("compras_registrar_regra_versao", {
    p_tenant_id: state.tenantId, p_chave: key, p_tipo_registro: d.get("tipo_registro"), p_titulo: String(d.get("titulo")).trim(),
    p_fonte_identificacao: String(d.get("fonte_identificacao") || "").trim() || null,
    p_localizador: String(d.get("localizador") || "").trim() || null, p_fonte_url: sourceUrl || null,
    p_resumo: String(d.get("resumo")).trim(), p_vigencia_inicio: d.get("vigencia_inicio") || null,
    p_vigencia_fim: d.get("vigencia_fim") || null, p_situacao: d.get("situacao"), p_substitui_id: replacesId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  notify(`Versão ${row?.numero_versao || ""} cadastrada. O conteúdo não foi validado juridicamente.`); form.reset(); await loadRules();
}
async function loadRules() {
  const { data, error } = await supabase.from("compras_regras_versoes")
    .select("id,chave,versao,tipo_registro,titulo,fonte_identificacao,localizador,fonte_url,resumo,vigencia_inicio,vigencia_fim,situacao,substitui_id,created_at")
    .eq("tenant_id", state.tenantId).order("created_at", { ascending: false }).limit(500);
  if (error) { const node = $("#rule-list"); if (node) node.innerHTML = noData(error.message || "Não foi possível consultar as regras."); return; }
  state.rules = data || [];
  const replace = $("#rule-replaces"); if (replace) replace.innerHTML = `<option value="">Nova chave / primeira versão</option>${state.rules.map((r) => `<option value="${esc(r.id)}">${esc(r.chave)} · v${esc(r.versao)} · ${esc(r.titulo)}</option>`).join("")}`;
  fillDecisionChoices(); renderRules();
}
function renderRules() {
  const target = $("#rule-list"); if (!target) return;
  const filter = $("#rule-filter")?.value || "";
  const rows = state.rules.filter((r) => !filter || r.tipo_registro === filter);
  target.innerHTML = rows.length ? `<div class="rule-list">${rows.map((r) => { const url = safeUrl(r.fonte_url); return `<article class="rule-card"><div class="decision-meta"><span>${esc(human(r.tipo_registro))}</span>${statusPill(r.situacao)}</div><h3>${esc(r.titulo)} <small>v${esc(r.versao)}</small></h3><p>${esc(r.resumo)}</p><dl><div><dt>Chave</dt><dd>${esc(r.chave)}</dd></div><div><dt>Fonte</dt><dd>${esc(r.fonte_identificacao || "Não informada")}${r.localizador ? ` · ${esc(r.localizador)}` : ""}</dd></div><div><dt>Vigência</dt><dd>${esc(date(r.vigencia_inicio))} — ${esc(date(r.vigencia_fim))}</dd></div></dl>${url ? `<a class="button button-outline button-small" href="${esc(url)}" target="_blank" rel="noopener">Abrir fonte</a>` : ""}${r.substitui_id ? `<small class="record-secondary">Substitui versão ${esc(r.substitui_id)}</small>` : ""}</article>`; }).join("")}</div>` : noData("Nenhuma fonte cadastrada com este filtro.");
}
async function loadAudit() {
  const target = $("#audit-list"); if (!target) return; target.innerHTML = "Carregando eventos…";
    const { data, error } = await supabase.from("auditoria_eventos_relatorio")
    .select("id,entidade,entidade_id,operacao,ator_id,ator_uuid,ocorrido_em,origem,request_id,ip_address,user_agent,registro_anterior,registro_novo,campos_alterados,metadados,hash_anterior,hash_evento")
    .eq("tenant_id", state.tenantId).order("ocorrido_em", { ascending: false }).limit(500);
    if (error) { target.innerHTML = noData(`A consulta foi recusada ou falhou: ${error.message}`); return; }
  target.innerHTML = data?.length ? `<div class="audit-list">${data.map((row) => `<details class="audit-entry"><summary><span class="audit-operation" data-operation="${esc(row.operacao)}">${esc(row.operacao)}</span><strong>${esc(row.entidade)}</strong><code>${esc(row.entidade_id)}</code><time>${esc(new Date(row.ocorrido_em).toLocaleString("pt-BR"))}</time></summary><div class="audit-payload"><p>Ator interno: ${esc(row.ator_id ?? "não identificado")} · Origem: ${esc(row.origem || "—")} · Requisição: ${esc(row.request_id || "—")}</p><p>Campos alterados: ${esc(row.campos_alterados?.join(", ") || "—")}</p><p>Hash: <code>${esc(row.hash_evento || "—")}</code></p><div><strong>Anterior</strong><pre>${esc(row.registro_anterior ? JSON.stringify(row.registro_anterior, null, 2) : "—")}</pre></div><div><strong>Novo</strong><pre>${esc(row.registro_novo ? JSON.stringify(row.registro_novo, null, 2) : "—")}</pre></div></div></details>`).join("")}</div>` : noData("Ainda não há eventos de auditoria acessíveis neste tenant.");
}
async function loadProcessRecord(processId) {
  const target = $("#process-record");
  try {
    const { data: process, error } = await supabase.from("compras_processos")
      .select("id,numero_processo,ano,numero_edital,objeto,descricao,tipo_contratacao,modalidade,procedimento,fundamento_legal,valor_estimado,valor_homologado,status,ata_id,data_abertura,data_homologacao,unidade_id,created_at,updated_at")
      .eq("id", processId).eq("tenant_id", state.tenantId).maybeSingle();
    if (error) throw error;
    if (!process) { target.innerHTML = noData("Processo não encontrado ou você não tem permissão para consultá-lo."); return; }
    const result = await Promise.all([
      supabase.from("compras_processos_etapas").select("id,ordem,codigo,nome,descricao,status,prazo,concluida_em,dependencias_snapshot,documentos_snapshot").eq("tenant_id",state.tenantId).eq("processo_id",processId).order("ordem").limit(200),
      supabase.from("compras_documentos").select("id,etapa_id,tipo_documento,nome,descricao,referencia_url,storage_path,obrigatorio,validade,status,created_at").eq("tenant_id",state.tenantId).eq("processo_id",processId).order("created_at",{ascending:false}).limit(200),
      supabase.from("compras_artefatos").select("id,tipo,titulo,created_at").eq("tenant_id",state.tenantId).eq("processo_id",processId).order("created_at",{ascending:false}).limit(100),
      supabase.from("compras_decisoes").select("id,tipo_decisao,resultado,autoridade_ato,fundamento_informado,motivacao,decidido_em,substitui_id,created_at").eq("tenant_id",state.tenantId).eq("processo_id",processId).order("decidido_em",{ascending:false}).limit(200),
      supabase.from("compras_tarefas").select("id,titulo,descricao,status,prazo,responsavel_id,concluida_em").eq("tenant_id",state.tenantId).eq("processo_id",processId).order("prazo").limit(200),
      supabase.from("compras_contratos").select("id,numero,objeto,fornecedor_id,valor_inicial,valor_atual,vigencia_inicio,vigencia_fim,situacao").eq("tenant_id",state.tenantId).eq("processo_id",processId).order("created_at",{ascending:false}).limit(100),
    ]);
    for (const response of result) if (response.error) throw response.error;
    const [stages, docs, artifacts, decisions, tasks, contracts] = result.map((r) => r.data || []);
    target.innerHTML = `<section class="surface-card process-summary"><div class="process-title-row"><div><p class="eyebrow">Processo ${esc(process.numero_processo)}/${esc(process.ano)}</p><h2>${esc(process.objeto)}</h2></div>${statusPill(process.status)}</div><div class="process-facts"><div><span>Tipo</span><strong>${esc(human(process.tipo_contratacao))}</strong></div><div><span>Modalidade / procedimento</span><strong>${esc([process.modalidade,process.procedimento].filter(Boolean).join(" · ") || "A classificar")}</strong></div><div><span>Valor estimado</span><strong>${esc(money(process.valor_estimado))}</strong></div><div><span>Valor homologado</span><strong>${esc(money(process.valor_homologado))}</strong></div><div><span>Fundamento informado</span><strong>${esc(process.fundamento_legal || "Não informado")}</strong></div><div><span>Ata vinculada</span><strong>${esc(process.ata_id ?? "Não vinculada")}</strong></div></div>${process.descricao ? `<p class="process-description">${esc(process.descricao)}</p>` : ""}<a class="button button-outline" href="index.html#tab-processes">Voltar à lista de processos</a></section>
      <div class="content-grid process-detail-grid"><section class="surface-card"><div class="card-heading"><div><p class="eyebrow">Fluxo operacional</p><h2>Etapas</h2></div></div>${stages.length ? `<ol class="process-stage-list">${stages.map((s) => `<li class="process-stage" data-stage-status="${esc(s.status)}"><span class="stage-number">${esc(s.ordem)}</span><div><strong>${esc(s.nome)}</strong><small>${esc(s.descricao || "")}</small><div class="stage-meta">${statusPill(s.status)} <span>Prazo: ${esc(date(s.prazo))}</span>${s.concluida_em ? `<span>Concluída: ${esc(new Date(s.concluida_em).toLocaleString("pt-BR"))}</span>` : ""}</div></div></li>`).join("")}</ol>` : noData("Este processo ainda não tem etapas materializadas.")}</section>
      <section class="surface-card"><div class="card-heading"><div><p class="eyebrow">Documentação</p><h2>Documentos vinculados</h2></div></div>${docs.length ? `<div class="document-list">${docs.map((d) => { const url = safeUrl(d.referencia_url); return `<article class="document-card"><div><strong>${esc(d.nome)}</strong><small>${esc(human(d.tipo_documento))} · ${esc(human(d.status))}${d.obrigatorio ? " · Obrigatório" : ""} · validade ${esc(date(d.validade))}</small></div>${d.storage_path ? `<button class="button button-outline button-small" type="button" data-open-storage="${esc(d.id)}">Abrir arquivo privado</button>` : url ? `<a class="button button-outline button-small" href="${esc(url)}" target="_blank" rel="noopener">Abrir referência</a>` : ""}</article>`; }).join("")}</div>` : noData("Nenhum documento foi vinculado a este processo.")}</section>
      <section class="surface-card"><div class="card-heading"><div><p class="eyebrow">Minutas e versões</p><h2>Artefatos</h2></div><a class="button button-outline button-small" href="artefatos.html?processo_id=${encodeURIComponent(process.id)}">Abrir área de artefatos</a></div>${artifacts.length ? `<div class="version-list">${artifacts.map((a) => `<article class="version-card"><span class="eyebrow">${esc(human(a.tipo))}</span><h3>${esc(a.titulo)}</h3><small>Cadastrado em ${esc(date(a.created_at))}</small><a class="record-secondary" href="artefatos.html?processo_id=${encodeURIComponent(process.id)}">Consultar versões</a></article>`).join("")}</div>` : noData("Nenhum artefato estruturado vinculado.")}</section>
      <section class="surface-card"><div class="card-heading"><div><p class="eyebrow">Motivação e atos</p><h2>Decisões</h2></div><a class="button button-outline button-small" href="decisoes.html?processo_id=${encodeURIComponent(process.id)}">Abrir área de decisões</a></div>${decisions.length ? `<div class="decision-list">${decisions.map((d) => `<article class="decision-card"><div class="decision-meta"><span>${esc(date(d.decidido_em))}</span>${statusPill(d.tipo_decisao)}</div><h3>${esc(d.resultado)}</h3><p><strong>Autoridade:</strong> ${esc(d.autoridade_ato)}</p><p>${esc(d.motivacao)}</p>${d.fundamento_informado ? `<small>Fundamento informado: ${esc(d.fundamento_informado)}</small>` : ""}</article>`).join("")}</div>` : noData("Nenhuma decisão registrada.")}</section>
      <section class="surface-card"><div class="card-heading"><div><p class="eyebrow">Acompanhamento</p><h2>Tarefas e contratos</h2></div></div><div class="record-pair"><div><h3>Tarefas (${tasks.length})</h3>${tasks.length ? tasks.map((t) => `<p class="record-line"><strong>${esc(t.titulo)}</strong><span>${statusPill(t.status)} · ${esc(date(t.prazo))}</span></p>`).join("") : "<p>Nenhuma tarefa cadastrada.</p>"}</div><div><h3>Contratos (${contracts.length})</h3>${contracts.length ? contracts.map((c) => `<p class="record-line"><strong>${esc(c.numero)} · ${esc(c.objeto)}</strong><span>${statusPill(c.situacao)} · ${esc(money(c.valor_atual))} · até ${esc(date(c.vigencia_fim))}</span></p>`).join("") : "<p>Nenhum contrato cadastrado.</p>"}</div></div></section></div>`;
    target.querySelectorAll("[data-open-storage]").forEach((button) => button.addEventListener("click", () => openPrivateDocument(button.dataset.openStorage, docs)));
  } catch (error) { console.error("[Compras] Falha ao abrir ficha:", error); target.innerHTML = noData(error.message || "Não foi possível abrir a ficha do processo."); }
}
async function openPrivateDocument(id, documents) {
  const row = documents.find((d) => d.id === id);
  if (!row?.storage_path) return notify("O caminho do arquivo não está disponível.", "error");
  const { data, error } = await supabase.storage.from("compras-documentos").createSignedUrl(row.storage_path, 60);
  if (error) return notify(error.message || "Seu perfil não pode abrir este arquivo.", "error");
  const url = safeUrl(data?.signedUrl); if (!url) return notify("O serviço retornou um endereço inválido.", "error");
  window.open(url, "_blank", "noopener,noreferrer");
}

async function start() {
  state.page = document.body.dataset.area || "artefatos";
  if (!pages[state.page]) state.page = "artefatos";
  renderShell();
  try {
    state.user = await initLayout({
      supabase, brand: { nome: "Compras Públicas", subtitulo: "Intranet Municipal", icone: "fa-cart-shopping" },
      iconeTitulo: pages[state.page].icon, titulo: pages[state.page].title, subtitulo: pages[state.page].subtitle,
      moduloAtivo: pages[state.page].id, rotaVoltar: "../intranet.html", textoVoltar: "Voltar à intranet",
      menuUsuario: { rotaPerfil: "../perfil.html", rotaAjuda: "ajuda.html" },
      menu: COMPRAS_MENU,
    });
    if (!state.user) return;
    await loadMembership();
    if (state.page === "governanca" || state.page === "decisoes") await loadRules();
    renderPage();
    if (state.page === "decisoes") fillDecisionChoices();
  } catch (error) { console.error("[Compras] Falha de inicialização:", error); showError(error.message || "Não foi possível carregar a área. Verifique sua conexão ou peça ao administrador para revisar seu acesso."); $("#area-workspace").innerHTML = ""; }
}
start();
