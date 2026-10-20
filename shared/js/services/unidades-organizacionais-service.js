import { supabase } from "../supabase.js";

export const UnidadesOrganizacionaisService = {
  async listar({ apenasAtivas = false } = {}) {
    let query = supabase
      .from("unidades_organizacionais")
      .select("id,parent_id,municipio_id,legacy_unidade_id,legacy_orgao_id,codigo,nome,sigla,tipo,nivel,ordem,descricao,ativo,valido_de,valido_ate")
      .order("nivel", { ascending: true })
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (apenasAtivas) query = query.eq("ativo", true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async criar(dados) {
    const payload = {
      parent_id: dados.parent_id || null,
      codigo: String(dados.codigo || "").trim().toUpperCase(),
      nome: String(dados.nome || "").trim(),
      sigla: dados.sigla ? String(dados.sigla).trim().toUpperCase() : null,
      tipo: dados.tipo || "OUTRO",
      ordem: Number(dados.ordem || 0),
      descricao: dados.descricao || null,
      ativo: dados.ativo !== false,
      valido_de: dados.valido_de || null,
      valido_ate: dados.valido_ate || null,
    };
    if (!payload.codigo || !payload.nome) throw new Error("Código e nome são obrigatórios.");
    const { data, error } = await supabase.from("unidades_organizacionais").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async atualizar(id, dados) {
    const payload = {};
    ["parent_id", "codigo", "nome", "sigla", "tipo", "ordem", "descricao", "ativo", "valido_de", "valido_ate"].forEach((key) => {
      if (dados[key] !== undefined) payload[key] = key === "codigo" || key === "sigla" ? (dados[key] ? String(dados[key]).trim().toUpperCase() : null) : dados[key];
    });
    const { data, error } = await supabase.from("unidades_organizacionais").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async alternarAtivo(id, ativo) {
    return this.atualizar(id, { ativo });
  },

  async listarVinculosUsuario(usuarioId) {
    const { data, error } = await supabase
      .from("usuarios_unidades")
      .select("id,usuario_id,unidade_id,tipo_vinculo,principal,valido_de,valido_ate,ativo,observacoes,unidade:unidades_organizacionais(id,parent_id,codigo,nome,sigla,tipo,nivel)")
      .eq("usuario_id", usuarioId)
      .order("principal", { ascending: false })
      .order("ativo", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async criarVinculoUsuario(dados) {
    const { data, error } = await supabase.from("usuarios_unidades").insert({
      usuario_id: dados.usuario_id,
      unidade_id: dados.unidade_id,
      tipo_vinculo: dados.tipo_vinculo || "LOTACAO",
      principal: dados.principal === true,
      valido_de: dados.valido_de || new Date().toISOString().slice(0, 10),
      valido_ate: dados.valido_ate || null,
      ativo: dados.ativo !== false,
      observacoes: dados.observacoes || null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async criarPermissaoUnidade(dados) {
    const { data, error } = await supabase.from("permissoes_unidades").insert({
      usuario_id: dados.usuario_id,
      unidade_id: dados.unidade_id,
      modulo: String(dados.modulo || "").trim(),
      acao: String(dados.acao || "").trim(),
      escopo: dados.escopo || "DESCENDENTES",
      permitido: dados.permitido !== false,
      observacoes: dados.observacoes || null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async listarHistoricoUnidade(unidadeId) {
    const { data, error } = await supabase.from("unidades_organizacionais_historico").select("*").eq("unidade_id", unidadeId).order("ocorrido_em", { ascending: false }).limit(100);
    if (error) throw error;
    return data || [];
  },
};
