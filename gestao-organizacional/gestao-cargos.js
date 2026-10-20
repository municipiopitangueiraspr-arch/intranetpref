import { supabase } from "../shared/js/supabase.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[char]);
const $ = (selector) => document.querySelector(selector);
const today = () => new Date().toISOString().slice(0, 10);
const activeAndCurrent = (row) => row.ativo && (!row.valido_de || row.valido_de <= today()) && (!row.valido_ate || row.valido_ate >= today());

function notify(message, error = false) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.className = `org-toast is-visible${error ? " error" : ""}`;
  window.setTimeout(() => node.classList.remove("is-visible"), 4000);
}

function mount() {
  const panel = document.querySelector('.org-view[data-panel="users"]');
  if (!panel || document.getElementById("cargoDesignationArea")) return null;
  const area = document.createElement("div");
  area.id = "cargoDesignationArea";
  area.className = "org-section-layout";
  area.innerHTML = `
    <article class="org-card">
      <div class="org-card-head"><div><span class="org-card-kicker">Catálogo funcional</span><h3>Novo cargo</h3></div></div>
      <p class="org-help">Cargo é uma designação funcional; não altera a lotação nem concede permissões.</p>
      <form id="cargoForm" class="org-form">
        <label>Código<input name="codigo" required maxlength="80" placeholder="Ex.: SECRETARIO_EDUCACAO"></label>
        <label>Nome do cargo<input name="nome" required maxlength="180" placeholder="Ex.: Secretário Municipal de Educação"></label>
        <label>Categoria<input name="categoria" maxlength="100" placeholder="Ex.: Agente político, comissão, efetivo"></label>
        <button class="org-button primary" type="submit"><i class="fas fa-plus"></i> Cadastrar cargo</button>
      </form>
    </article>
    <article class="org-card">
      <div class="org-card-head"><div><span class="org-card-kicker">Vigência funcional</span><h3>Registrar designação</h3></div></div>
      <p class="org-help">Cada designação registra separadamente a pessoa, a unidade e o cargo exercido.</p>
      <form id="designationForm" class="org-form">
        <label>Usuário<select id="designationUser" name="usuario_id" required></select></label>
        <label>Unidade organizacional<select id="designationUnit" name="unidade_organizacional_id" required></select></label>
        <label>Cargo<select id="designationCargo" name="cargo_id" required></select></label>
        <label>Ato de designação<input name="ato_designacao" maxlength="240" placeholder="Portaria, decreto ou ato (opcional)"></label>
        <label>Início da vigência<input name="vigencia_inicio" type="date" required value="${today()}"></label>
        <label>Fim da vigência<input name="vigencia_fim" type="date"></label>
        <label class="org-checkbox"><input type="checkbox" name="principal" value="true"> Designação principal</label>
        <button class="org-button primary" type="submit"><i class="fas fa-user-tag"></i> Registrar designação</button>
      </form>
    </article>
    <article class="org-card org-tree-card">
      <div class="org-card-head"><div><span class="org-card-kicker">Vínculos vigentes e históricos</span><h3>Cargos e designações</h3></div></div>
      <div class="org-table-wrap"><table class="org-table"><thead><tr><th>Usuário</th><th>Cargo</th><th>Unidade</th><th>Vigência</th><th>Status</th><th>Ação</th></tr></thead><tbody id="designationTable"><tr><td colspan="6" class="org-empty">Carregando designações...</td></tr></tbody></table></div>
    </article>`;
  panel.append(area);
  return area;
}

function optionLabel(unit) {
  return `${"— ".repeat(Number(unit.nivel || 0))}${unit.codigo} · ${unit.nome}${unit.sigla ? ` (${unit.sigla})` : ""}`;
}

function fillSelect(selector, rows, label, placeholder) {
  const select = $(selector);
  if (!select) return;
  select.innerHTML = `<option value="">${esc(placeholder)}</option>${rows.map((row) => `<option value="${esc(row.id)}">${esc(label(row))}</option>`).join("")}`;
}

async function load() {
  const [usersResult, unitsResult, cargosResult, designacoesResult] = await Promise.all([
    supabase.from("usuarios").select("id,nome,email,ativo").order("nome").limit(500),
    supabase.from("unidades_organizacionais").select("id,codigo,nome,sigla,nivel,ativo,valido_de,valido_ate").order("nivel").order("ordem").order("nome").limit(1000),
    supabase.from("cargos").select("id,codigo,nome,categoria,ativo").order("nome").limit(500),
    supabase.from("designacoes_funcionais").select("id,usuario_id,unidade_organizacional_id,cargo_id,funcao,vigencia_inicio,vigencia_fim,ativa,principal,ato_designacao,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  for (const result of [usersResult, unitsResult, cargosResult, designacoesResult]) if (result.error) throw result.error;

  const users = usersResult.data || [];
  const units = unitsResult.data || [];
  const cargos = cargosResult.data || [];
  const designacoes = designacoesResult.data || [];
  fillSelect("#designationUser", users.filter((row) => row.ativo), (row) => row.nome || row.email, "Selecione o usuário");
  fillSelect("#designationUnit", units.filter(activeAndCurrent), optionLabel, "Selecione a unidade");
  fillSelect("#designationCargo", cargos.filter((row) => row.ativo), (row) => `${row.nome}${row.categoria ? ` · ${row.categoria}` : ""}`, "Selecione o cargo");

  const usersById = new Map(users.map((row) => [String(row.id), row]));
  const unitsById = new Map(units.map((row) => [String(row.id), row]));
  const cargosById = new Map(cargos.map((row) => [String(row.id), row]));
  const body = $("#designationTable");
  body.innerHTML = designacoes.map((row) => {
    const user = usersById.get(String(row.usuario_id));
    const unit = unitsById.get(String(row.unidade_organizacional_id));
    const cargo = cargosById.get(String(row.cargo_id));
    const periodo = `${row.vigencia_inicio ? new Date(`${row.vigencia_inicio}T00:00:00`).toLocaleDateString("pt-BR") : "—"} – ${row.vigencia_fim ? new Date(`${row.vigencia_fim}T00:00:00`).toLocaleDateString("pt-BR") : "em aberto"}`;
    return `<tr><td><strong>${esc(user?.nome || user?.email || `Usuário #${row.usuario_id}`)}</strong></td><td>${esc(cargo?.nome || row.funcao || "—")}${row.principal ? '<small>Principal</small>' : ""}</td><td>${esc(unit ? optionLabel(unit) : "Unidade legada não mapeada")}</td><td>${esc(periodo)}${row.ato_designacao ? `<small>${esc(row.ato_designacao)}</small>` : ""}</td><td><span class="org-pill">${row.ativa ? "Ativa" : "Encerrada"}</span></td><td>${row.ativa ? `<button class="org-button secondary" data-end-designation="${esc(row.id)}" type="button">Encerrar</button>` : "—"}</td></tr>`;
  }).join("") || '<tr><td colspan="6" class="org-empty">Nenhuma designação cadastrada.</td></tr>';

  body.querySelectorAll("[data-end-designation]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Encerrar esta designação a partir de hoje?")) return;
    button.disabled = true;
    const { error } = await supabase.from("designacoes_funcionais").update({ ativa: false, vigencia_fim: today() }).eq("id", button.dataset.endDesignation);
    if (error) { notify(error.message, true); button.disabled = false; return; }
    notify("Designação encerrada.");
    await load();
  }));
}

function bind() {
  $("#cargoForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = { codigo: data.codigo.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_"), nome: data.nome.trim(), categoria: data.categoria.trim() || null, ativo: true };
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const { error } = await supabase.from("cargos").insert(payload);
      if (error) throw error;
      event.currentTarget.reset();
      notify("Cargo cadastrado.");
      await load();
    } catch (error) { notify(error.message || "Não foi possível cadastrar o cargo.", true); }
    finally { button.disabled = false; }
  });

  $("#designationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = {
      usuario_id: Number(data.usuario_id),
      unidade_organizacional_id: data.unidade_organizacional_id,
      cargo_id: data.cargo_id,
      funcao: "",
      ato_designacao: data.ato_designacao.trim() || null,
      vigencia_inicio: data.vigencia_inicio,
      vigencia_fim: data.vigencia_fim || null,
      ativa: true,
      principal: data.principal === "true",
    };
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const { error } = await supabase.from("designacoes_funcionais").insert(payload);
      if (error) throw error;
      event.currentTarget.reset();
      event.currentTarget.elements.vigencia_inicio.value = today();
      notify("Designação registrada.");
      await load();
    } catch (error) { notify(error.message || "Não foi possível registrar a designação.", true); }
    finally { button.disabled = false; }
  });
}

const area = mount();
if (area) {
  bind();
  load().catch((error) => {
    notify(error.message || "Falha ao carregar cargos e designações.", true);
    const body = $("#designationTable");
    if (body) body.innerHTML = '<tr><td colspan="6" class="org-empty">Não foi possível carregar as designações.</td></tr>';
  });
}
