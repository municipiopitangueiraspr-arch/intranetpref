import { supabase } from "../supabase.js";

const hoje = () => new Date().toISOString().slice(0, 10);
const globalProfiles = new Set(["ADMIN", "PREFEITO"]);

function vigente(registro, inicio = "valido_de", fim = "valido_ate") {
  const data = hoje();
  return (!registro[inicio] || registro[inicio] <= data) && (!registro[fim] || registro[fim] >= data);
}

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[caractere]);
}

/**
 * Lista apenas unidades ativas e vigentes que o usuário pode usar.
 * O backend/RLS e os triggers continuam sendo a autoridade final.
 */
export async function listarUnidadesOperacionais(usuario) {
  if (!usuario?.id) return [];

  const { data: unidades, error: erroUnidades } = await supabase
    .from("unidades_organizacionais")
    .select("id,parent_id,codigo,nome,sigla,tipo,nivel,ordem,ativo,valido_de,valido_ate")
    .eq("ativo", true)
    .order("nivel", { ascending: true })
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (erroUnidades) throw erroUnidades;

  const disponiveis = (unidades || []).filter((unidade) => vigente(unidade));
  if (globalProfiles.has(String(usuario.perfil || "").toUpperCase())) return disponiveis;

  const { data: vinculos, error: erroVinculos } = await supabase
    .from("usuarios_unidades")
    .select("unidade_id,valido_de,valido_ate,ativo")
    .eq("usuario_id", usuario.id)
    .eq("ativo", true);
  if (erroVinculos) throw erroVinculos;

  const idsRaiz = new Set((vinculos || []).filter((v) => vigente(v)).map((v) => String(v.unidade_id)));
  if (!idsRaiz.size) return [];

  const filhos = new Map();
  for (const unidade of disponiveis) {
    const pai = unidade.parent_id ? String(unidade.parent_id) : "__root__";
    if (!filhos.has(pai)) filhos.set(pai, []);
    filhos.get(pai).push(unidade);
  }

  const idsAcessiveis = new Set();
  const visitar = (id) => {
    if (idsAcessiveis.has(id)) return;
    idsAcessiveis.add(id);
    for (const filho of filhos.get(id) || []) visitar(String(filho.id));
  };
  for (const id of idsRaiz) visitar(id);

  return disponiveis.filter((unidade) => idsAcessiveis.has(String(unidade.id)));
}

export function popularSelectUnidades(select, unidades, placeholder = "Selecione a unidade responsável") {
  if (!select) return;
  const opcoes = (unidades || []).map((unidade) => {
    const indentacao = "— ".repeat(Math.max(0, Number(unidade.nivel || 0)));
    const nome = `${indentacao}${unidade.codigo ? `${unidade.codigo} · ` : ""}${unidade.nome}${unidade.sigla ? ` (${unidade.sigla})` : ""}`;
    return `<option value="${escaparHtml(unidade.id)}">${escaparHtml(nome)}</option>`;
  }).join("");
  select.innerHTML = `<option value="">${escaparHtml(placeholder)}</option>${opcoes}`;
  select.disabled = !(unidades || []).length;
}
