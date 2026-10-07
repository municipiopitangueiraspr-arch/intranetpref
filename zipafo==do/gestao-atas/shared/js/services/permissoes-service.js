// ============================================
// shared/js/services/permissoes-service.js
// Serviço compartilhado para gestão de permissões
// Integração com Supabase - Centralizado
// ============================================

import { supabase } from "../supabase.js";

export const PermissoesService = {
  // ============================================
  // PERFIS
  // ============================================

  /**
   * Lista todos os perfis
   * @param {Object} options - Opções de filtro
   * @param {boolean} options.onlyActive - Apenas perfis ativos
   * @param {string} options.search - Termo de busca
   * @returns {Promise<Array>} Lista de perfis
   */
  async listarPerfis(options = {}) {
    try {
      let query = supabase.from("perfis").select("*").order("nome");

      if (options.onlyActive) {
        query = query.eq("ativo", true);
      }

      if (options.search) {
        const termo = `%${options.search}%`;
        query = query.or(`nome.ilike.${termo},descricao.ilike.${termo}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao listar perfis:", error);
      throw error;
    }
  },

  /**
   * Obtém um perfil por ID
   * @param {number} id - ID do perfil
   * @returns {Promise<Object>} Dados do perfil
   */
  async obterPerfilPorId(id) {
    try {
      const { data, error } = await supabase
        .from("perfis")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao obter perfil ${id}:`, error);
      throw error;
    }
  },

  /**
   * Cria um novo perfil
   * @param {Object} dados - Dados do perfil
   * @param {string} dados.nome - Nome do perfil (obrigatório)
   * @param {string} dados.descricao - Descrição do perfil
   * @param {boolean} dados.ativo - Status do perfil
   * @returns {Promise<Object>} Perfil criado
   */
  async criarPerfil(dados) {
    try {
      if (!dados.nome) {
        throw new Error("O nome do perfil é obrigatório.");
      }

      // Verificar se já existe um perfil com este nome
      const { data: existente } = await supabase
        .from("perfis")
        .select("id")
        .eq("nome", dados.nome)
        .maybeSingle();

      if (existente) {
        throw new Error(`Já existe um perfil com o nome "${dados.nome}".`);
      }

      const { data, error } = await supabase
        .from("perfis")
        .insert([
          {
            nome: dados.nome.trim(),
            descricao: dados.descricao?.trim() || null,
            ativo: dados.ativo !== undefined ? dados.ativo : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Erro ao criar perfil:", error);
      throw error;
    }
  },

  /**
   * Atualiza um perfil existente
   * @param {number} id - ID do perfil
   * @param {Object} dados - Dados para atualizar
   * @returns {Promise<Object>} Perfil atualizado
   */
  async atualizarPerfil(id, dados) {
    try {
      const perfilExistente = await this.obterPerfilPorId(id);
      if (!perfilExistente) {
        throw new Error("Perfil não encontrado.");
      }

      // Se alterou o nome, verificar duplicidade
      if (dados.nome && dados.nome !== perfilExistente.nome) {
        const { data: existente } = await supabase
          .from("perfis")
          .select("id")
          .eq("nome", dados.nome)
          .neq("id", id)
          .maybeSingle();

        if (existente) {
          throw new Error(`Já existe um perfil com o nome "${dados.nome}".`);
        }
      }

      const dadosParaAtualizar = {};
      if (dados.nome !== undefined) dadosParaAtualizar.nome = dados.nome.trim();
      if (dados.descricao !== undefined)
        dadosParaAtualizar.descricao = dados.descricao?.trim() || null;
      if (dados.ativo !== undefined) dadosParaAtualizar.ativo = dados.ativo;
      dadosParaAtualizar.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("perfis")
        .update(dadosParaAtualizar)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao atualizar perfil ${id}:`, error);
      throw error;
    }
  },

  /**
   * Desativa um perfil
   * @param {number} id - ID do perfil
   * @returns {Promise<Object>} Perfil atualizado
   */
  async desativarPerfil(id) {
    try {
      const { data, error } = await supabase
        .from("perfis")
        .update({
          ativo: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao desativar perfil ${id}:`, error);
      throw error;
    }
  },

  /**
   * Ativa um perfil
   * @param {number} id - ID do perfil
   * @returns {Promise<Object>} Perfil atualizado
   */
  async ativarPerfil(id) {
    try {
      const { data, error } = await supabase
        .from("perfis")
        .update({
          ativo: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao ativar perfil ${id}:`, error);
      throw error;
    }
  },

  /**
   * Exclui um perfil
   * @param {number} id - ID do perfil
   * @returns {Promise<boolean>} True se excluído
   */
  async excluirPerfil(id) {
    try {
      // Verificar se há usuários com este perfil
      const usuarios = await this.verificarUsuariosPorPerfil(id);
      if (usuarios > 0) {
        throw new Error(
          `Não é possível excluir o perfil pois existem ${usuarios} usuário(s) vinculados.`,
        );
      }

      // Excluir permissões associadas
      await supabase.from("permissoes_modulos").delete().eq("perfil_id", id);

      // Excluir perfil
      const { error } = await supabase.from("perfis").delete().eq("id", id);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Erro ao excluir perfil ${id}:`, error);
      throw error;
    }
  },

  /**
   * Verifica quantos usuários têm um perfil
   * @param {number} perfilId - ID do perfil
   * @returns {Promise<number>} Número de usuários
   */
  async verificarUsuariosPorPerfil(perfilId) {
    try {
      const { count, error } = await supabase
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("perfil", (await this.obterPerfilPorId(perfilId))?.nome);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error(`Erro ao verificar usuários do perfil ${perfilId}:`, error);
      return 0;
    }
  },

  // ============================================
  // MÓDULOS DO SISTEMA
  // ============================================

  /**
   * Lista todos os módulos do sistema
   * @param {Object} options - Opções de filtro
   * @param {boolean} options.onlyActive - Apenas módulos ativos
   * @returns {Promise<Array>} Lista de módulos
   */
  async listarModulos(options = {}) {
    try {
      let query = supabase
        .from("modulos_sistema")
        .select("*")
        .order("ordem", { ascending: true });

      if (options.onlyActive) {
        query = query.eq("ativo", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao listar módulos:", error);
      throw error;
    }
  },

  /**
   * Cria um novo módulo
   * @param {Object} dados - Dados do módulo
   * @param {string} dados.nome - Nome do módulo (obrigatório)
   * @param {string} dados.descricao - Descrição do módulo
   * @param {string} dados.icone - Ícone do módulo (Font Awesome)
   * @param {string} dados.rota - Rota do módulo
   * @param {number} dados.ordem - Ordem de exibição
   * @param {boolean} dados.ativo - Status do módulo
   * @returns {Promise<Object>} Módulo criado
   */
  async criarModulo(dados) {
    try {
      if (!dados.nome) {
        throw new Error("O nome do módulo é obrigatório.");
      }

      const { data, error } = await supabase
        .from("modulos_sistema")
        .insert([
          {
            nome: dados.nome.trim(),
            descricao: dados.descricao?.trim() || null,
            icone: dados.icone || "fas fa-cube",
            rota: dados.rota || `/${dados.nome}`,
            ordem: dados.ordem || 0,
            ativo: dados.ativo !== undefined ? dados.ativo : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Erro ao criar módulo:", error);
      throw error;
    }
  },

  // ============================================
  // PERMISSÕES POR PERFIL
  // ============================================

  /**
   * Lista todas as permissões
   * @param {Object} options - Opções de filtro
   * @param {number} options.perfilId - Filtrar por perfil
   * @param {string} options.modulo - Filtrar por módulo
   * @returns {Promise<Array>} Lista de permissões
   */
  async listarPermissoes(options = {}) {
    try {
      let query = supabase.from("permissoes_modulos").select("*");

      if (options.perfilId) {
        query = query.eq("perfil_id", options.perfilId);
      }

      if (options.modulo) {
        query = query.eq("modulo", options.modulo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao listar permissões:", error);
      throw error;
    }
  },

  /**
   * Obtém as permissões de um perfil
   * @param {number} perfilId - ID do perfil
   * @returns {Promise<Array>} Lista de permissões
   */
  async obterPermissoesPorPerfil(perfilId) {
    try {
      return await this.listarPermissoes({ perfilId });
    } catch (error) {
      console.error(`Erro ao obter permissões do perfil ${perfilId}:`, error);
      throw error;
    }
  },

  /**
   * Atualiza as permissões de um perfil
   * @param {number} perfilId - ID do perfil
   * @param {Array} permissoes - Lista de permissões [{modulo, permissao}]
   * @returns {Promise<boolean>} True se atualizado
   */
  async atualizarPermissoesPerfil(perfilId, permissoes) {
    try {
      // Remover permissões existentes
      await supabase
        .from("permissoes_modulos")
        .delete()
        .eq("perfil_id", perfilId);

      // Inserir novas permissões
      if (permissoes && permissoes.length > 0) {
        const dadosParaInserir = permissoes.map((p) => ({
          perfil_id: perfilId,
          modulo: p.modulo,
          permissao: p.permissao || "permitido",
          acoes: p.acoes || ["ler"],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("permissoes_modulos")
          .insert(dadosParaInserir);
        if (error) throw error;
      }
      return true;
    } catch (error) {
      console.error(
        `Erro ao atualizar permissões do perfil ${perfilId}:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Lista usuários por perfil
   * @param {number} perfilId - ID do perfil
   * @returns {Promise<Array>} Lista de usuários
   */
  async listarUsuariosPorPerfil(perfilId) {
    try {
      const perfil = await this.obterPerfilPorId(perfilId);
      if (!perfil) return [];

      const { data, error } = await supabase
        .from("usuarios")
        .select("*, orgao:orgaos(id, nome)")
        .eq("perfil", perfil.nome)
        .order("nome");

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Erro ao listar usuários do perfil ${perfilId}:`, error);
      throw error;
    }
  },

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  /**
   * Obtém estatísticas de permissões
   * @returns {Promise<Object>} Estatísticas
   */
  async obterEstatisticas() {
    try {
      const [totalPerfis, ativos, inativos, totalPermissoes] =
        await Promise.all([
          supabase.from("perfis").select("id", { count: "exact", head: true }),
          supabase
            .from("perfis")
            .select("id", { count: "exact", head: true })
            .eq("ativo", true),
          supabase
            .from("perfis")
            .select("id", { count: "exact", head: true })
            .eq("ativo", false),
          supabase
            .from("permissoes_modulos")
            .select("id", { count: "exact", head: true }),
        ]);

      return {
        totalPerfis: totalPerfis.count || 0,
        ativos: ativos.count || 0,
        inativos: inativos.count || 0,
        totalPermissoes: totalPermissoes.count || 0,
      };
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error);
      return { totalPerfis: 0, ativos: 0, inativos: 0, totalPermissoes: 0 };
    }
  },
};

export default PermissoesService;
