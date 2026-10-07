// ============================================
// shared/js/services/orgaos-service.js
// Serviço compartilhado para gestão de órgãos
// Integração com Supabase - Centralizado
// ============================================

import { supabase } from "../supabase.js";

export const OrgaosService = {
  // ============================================
  // CRUD - ÓRGÃOS
  // ============================================

  /**
   * Lista todos os órgãos
   * Traz o gestor atual resolvido via join com gestores_orgaos
   * @param {Object} options - Opções de filtro
   * @param {boolean} options.onlyActive - Apenas órgãos ativos
   * @param {string} options.search - Termo de busca (nome ou sigla)
   * @returns {Promise<Array>} Lista de órgãos com gestor_atual resolvido
   */
  async listar(options = {}) {
    try {
      let query = supabase
        .from("orgaos")
        .select(
          `
          *,
          gestores: gestores_orgaos (
            id,
            nome_responsavel,
            cargo_responsavel,
            data_inicio,
            data_fim
          )
        `,
        )
        .order("nome");

      if (options.onlyActive) {
        query = query.eq("ativo", true);
      }

      if (options.search) {
        const termo = `%${options.search}%`;
        query = query.or(`nome.ilike.${termo},sigla.ilike.${termo}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enriquecer cada órgão com o gestor ativo (data_fim = null)
      return (data || []).map((orgao) => {
        const gestores = orgao.gestores || [];
        const gestorAtivo = gestores.find((g) => !g.data_fim);
        return {
          ...orgao,
          gestor_atual: gestorAtivo?.nome_responsavel || null,
          gestor_atual_cargo: gestorAtivo?.cargo_responsavel || null,
          gestor_atual_id: gestorAtivo?.id || null,
          gestor_atual_desde: gestorAtivo?.data_inicio || null,
        };
      });
    } catch (error) {
      console.error("Erro ao listar órgãos:", error);
      throw error;
    }
  },

  /**
   * Lista apenas órgãos ativos
   * Traz o gestor atual resolvido via join
   * @returns {Promise<Array>} Lista de órgãos ativos
   */
  async listarAtivos() {
    try {
      const { data, error } = await supabase
        .from("orgaos")
        .select(
          `
          *,
          gestores: gestores_orgaos (
            id,
            nome_responsavel,
            cargo_responsavel,
            data_inicio,
            data_fim
          )
        `,
        )
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;

      return (data || []).map((orgao) => {
        const gestores = orgao.gestores || [];
        const gestorAtivo = gestores.find((g) => !g.data_fim);
        return {
          ...orgao,
          gestor_atual: gestorAtivo?.nome_responsavel || null,
          gestor_atual_cargo: gestorAtivo?.cargo_responsavel || null,
          gestor_atual_id: gestorAtivo?.id || null,
          gestor_atual_desde: gestorAtivo?.data_inicio || null,
        };
      });
    } catch (error) {
      console.error("Erro ao listar órgãos ativos:", error);
      throw error;
    }
  },

  /**
   * Obtém um órgão por ID
   * Traz o gestor atual resolvido via join
   * @param {number} id - ID do órgão
   * @returns {Promise<Object>} Dados do órgão
   */
  async obterPorId(id) {
    try {
      const { data, error } = await supabase
        .from("orgaos")
        .select(
          `
          *,
          gestores: gestores_orgaos (
            id,
            nome_responsavel,
            cargo_responsavel,
            data_inicio,
            data_fim
          )
        `,
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      const gestores = data?.gestores || [];
      const gestorAtivo = gestores.find((g) => !g.data_fim);

      return {
        ...data,
        gestor_atual: gestorAtivo?.nome_responsavel || null,
        gestor_atual_cargo: gestorAtivo?.cargo_responsavel || null,
        gestor_atual_id: gestorAtivo?.id || null,
        gestor_atual_desde: gestorAtivo?.data_inicio || null,
      };
    } catch (error) {
      console.error(`Erro ao obter órgão ${id}:`, error);
      throw error;
    }
  },

  /**
   * Obtém um órgão por sigla
   * @param {string} sigla - Sigla do órgão
   * @returns {Promise<Object>} Dados do órgão
   */
  async obterPorSigla(sigla) {
    try {
      const { data, error } = await supabase
        .from("orgaos")
        .select("*")
        .eq("sigla", sigla.toUpperCase())
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao obter órgão por sigla ${sigla}:`, error);
      throw error;
    }
  },

  /**
   * Cria um novo órgão
   * @param {Object} dados - Dados do órgão
   * @param {string} dados.nome - Nome do órgão (obrigatório)
   * @param {string} dados.sigla - Sigla do órgão
   * @param {string} dados.cnpj - CNPJ do órgão
   * @param {string} dados.endereco - Endereço
   * @param {string} dados.telefone - Telefone
   * @param {string} dados.email - E-mail
   * @param {string} dados.gestor_atual - Nome do gestor atual
   * @param {string} dados.tipo - Tipo do órgão (SECRETARIA, PREFEITURA, etc.)
   * @param {boolean} dados.ativo - Status do órgão
   * @returns {Promise<Object>} Órgão criado
   */
  async criar(dados) {
    try {
      // Validar dados obrigatórios
      if (!dados.nome) {
        throw new Error("O nome do órgão é obrigatório.");
      }

      // Validar sigla (se informada, deve ser única)
      if (dados.sigla) {
        const existe = await this.validarSigla(dados.sigla);
        if (!existe) {
          throw new Error(`A sigla "${dados.sigla}" já está em uso.`);
        }
      }

      // Validar CNPJ (se informado, deve ser único)
      if (dados.cnpj) {
        const existe = await this.validarCnpj(dados.cnpj);
        if (!existe) {
          throw new Error(`O CNPJ "${dados.cnpj}" já está cadastrado.`);
        }
      }

      // Preparar dados
      const dadosParaInserir = {
        nome: dados.nome.trim(),
        sigla: dados.sigla ? dados.sigla.trim().toUpperCase() : null,
        cnpj: dados.cnpj ? dados.cnpj.trim() : null,
        endereco: dados.endereco ? dados.endereco.trim() : null,
        telefone: dados.telefone ? dados.telefone.trim() : null,
        email: dados.email ? dados.email.trim() : null,
        gestor_atual: dados.gestor_atual ? dados.gestor_atual.trim() : null,
        tipo: dados.tipo || "SECRETARIA",
        ativo: dados.ativo !== undefined ? dados.ativo : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("orgaos")
        .insert([dadosParaInserir])
        .select()
        .single();

      if (error) throw error;

      // Se informou um gestor, criar registro de gestor
      if (dados.gestor_atual) {
        await this.criarGestor({
          orgao_id: data.id,
          nome_responsavel: dados.gestor_atual,
          data_inicio: new Date().toISOString().split("T")[0],
        });
      }

      return data;
    } catch (error) {
      console.error("Erro ao criar órgão:", error);
      throw error;
    }
  },

  /**
   * Atualiza um órgão existente
   * @param {number} id - ID do órgão
   * @param {Object} dados - Dados para atualizar
   * @returns {Promise<Object>} Órgão atualizado
   */
  async atualizar(id, dados) {
    try {
      // Verificar se o órgão existe
      const orgaoExistente = await this.obterPorId(id);
      if (!orgaoExistente) {
        throw new Error("Órgão não encontrado.");
      }

      // Validar sigla (se alterada, deve ser única)
      if (dados.sigla && dados.sigla !== orgaoExistente.sigla) {
        const existe = await this.validarSigla(dados.sigla, id);
        if (!existe) {
          throw new Error(`A sigla "${dados.sigla}" já está em uso.`);
        }
      }

      // Validar CNPJ (se alterado, deve ser único)
      if (dados.cnpj && dados.cnpj !== orgaoExistente.cnpj) {
        const existe = await this.validarCnpj(dados.cnpj, id);
        if (!existe) {
          throw new Error(`O CNPJ "${dados.cnpj}" já está cadastrado.`);
        }
      }

      // Preparar dados para atualização
      const dadosParaAtualizar = {};

      if (dados.nome !== undefined) dadosParaAtualizar.nome = dados.nome.trim();
      if (dados.sigla !== undefined)
        dadosParaAtualizar.sigla = dados.sigla.trim().toUpperCase();
      if (dados.cnpj !== undefined)
        dadosParaAtualizar.cnpj = dados.cnpj.trim() || null;
      if (dados.endereco !== undefined)
        dadosParaAtualizar.endereco = dados.endereco.trim() || null;
      if (dados.telefone !== undefined)
        dadosParaAtualizar.telefone = dados.telefone.trim() || null;
      if (dados.email !== undefined)
        dadosParaAtualizar.email = dados.email.trim() || null;
      if (dados.gestor_atual !== undefined)
        dadosParaAtualizar.gestor_atual = dados.gestor_atual.trim() || null;
      if (dados.tipo !== undefined) dadosParaAtualizar.tipo = dados.tipo;
      if (dados.ativo !== undefined) dadosParaAtualizar.ativo = dados.ativo;

      dadosParaAtualizar.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("orgaos")
        .update(dadosParaAtualizar)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Se alterou o gestor atual, atualizar também na tabela de gestores
      if (
        dados.gestor_atual &&
        dados.gestor_atual !== orgaoExistente.gestor_atual
      ) {
        // Finalizar gestor atual
        await this.finalizarGestorAtual(id);
        // Criar novo gestor
        await this.criarGestor({
          orgao_id: id,
          nome_responsavel: dados.gestor_atual,
          data_inicio: new Date().toISOString().split("T")[0],
        });
      }

      return data;
    } catch (error) {
      console.error(`Erro ao atualizar órgão ${id}:`, error);
      throw error;
    }
  },

  /**
   * Desativa um órgão
   * @param {number} id - ID do órgão
   * @returns {Promise<Object>} Órgão atualizado
   */
  async desativar(id) {
    try {
      const { data, error } = await supabase
        .from("orgaos")
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
      console.error(`Erro ao desativar órgão ${id}:`, error);
      throw error;
    }
  },

  /**
   * Ativa um órgão
   * @param {number} id - ID do órgão
   * @returns {Promise<Object>} Órgão atualizado
   */
  async ativar(id) {
    try {
      const { data, error } = await supabase
        .from("orgaos")
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
      console.error(`Erro ao ativar órgão ${id}:`, error);
      throw error;
    }
  },

  /**
   * Exclui um órgão (apenas se não tiver dependências)
   * @param {number} id - ID do órgão
   * @returns {Promise<boolean>} True se excluído
   */
  async excluir(id) {
    try {
      // Verificar dependências
      const dependencias = await this.verificarDependencias(id);
      if (dependencias.temUsuarios) {
        throw new Error(
          "Não é possível excluir o órgão pois existem usuários vinculados.",
        );
      }
      if (dependencias.temAtos) {
        throw new Error(
          "Não é possível excluir o órgão pois existem atos vinculados.",
        );
      }
      if (dependencias.temProcessos) {
        throw new Error(
          "Não é possível excluir o órgão pois existem processos vinculados.",
        );
      }

      // Excluir gestores primeiro
      await supabase.from("gestores_orgaos").delete().eq("orgao_id", id);

      // Excluir órgão
      const { error } = await supabase.from("orgaos").delete().eq("id", id);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Erro ao excluir órgão ${id}:`, error);
      throw error;
    }
  },

  /**
   * Verifica dependências de um órgão
   * @param {number} id - ID do órgão
   * @returns {Promise<Object>} Objeto com dependências
   */
  async verificarDependencias(id) {
    try {
      const [usuarios, atos, processos] = await Promise.all([
        supabase
          .from("usuarios")
          .select("id", { count: "exact", head: true })
          .eq("orgao_id", id),
        supabase
          .from("atos_oficiais")
          .select("id", { count: "exact", head: true })
          .eq("orgao_id", id),
        supabase
          .from("processos_licitatorios")
          .select("id", { count: "exact", head: true })
          .eq("orgao_id", id),
      ]);

      return {
        temUsuarios: (usuarios.count || 0) > 0,
        temAtos: (atos.count || 0) > 0,
        temProcessos: (processos.count || 0) > 0,
      };
    } catch (error) {
      console.error(`Erro ao verificar dependências do órgão ${id}:`, error);
      return { temUsuarios: false, temAtos: false, temProcessos: false };
    }
  },

  // ============================================
  // GESTORES
  // ============================================

  /**
   * Lista os gestores de um órgão
   * @param {number} orgaoId - ID do órgão
   * @param {Object} options - Opções
   * @param {boolean} options.onlyActive - Apenas gestores ativos (sem data_fim)
   * @returns {Promise<Array>} Lista de gestores
   */
  async listarGestores(orgaoId, options = {}) {
    try {
      let query = supabase
        .from("gestores_orgaos")
        .select("*")
        .eq("orgao_id", orgaoId)
        .order("data_inicio", { ascending: false });

      if (options.onlyActive) {
        query = query.is("data_fim", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Erro ao listar gestores do órgão ${orgaoId}:`, error);
      throw error;
    }
  },

  /**
   * Obtém o gestor atual de um órgão
   * @param {number} orgaoId - ID do órgão
   * @returns {Promise<Object>} Dados do gestor atual
   */
  async obterGestorAtual(orgaoId) {
    try {
      const { data, error } = await supabase
        .from("gestores_orgaos")
        .select("id, nome_responsavel, cargo_responsavel, data_inicio")
        .eq("orgao_id", orgaoId)
        .is("data_fim", null)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao obter gestor atual do órgão ${orgaoId}:`, error);
      return null;
    }
  },

  /**
   * Cria um novo gestor para um órgão
   * @param {Object} dados - Dados do gestor
   * @param {number} dados.orgao_id - ID do órgão (obrigatório)
   * @param {string} dados.nome_responsavel - Nome do gestor (obrigatório)
   * @param {string} dados.cargo_responsavel - Cargo do gestor
   * @param {string} dados.data_inicio - Data de início (YYYY-MM-DD)
   * @param {string} dados.data_fim - Data de fim (YYYY-MM-DD)
   * @param {string} dados.observacao - Observações
   * @returns {Promise<Object>} Gestor criado
   */
  async criarGestor(dados) {
    try {
      if (!dados.orgao_id) {
        throw new Error("O ID do órgão é obrigatório.");
      }
      if (!dados.nome_responsavel) {
        throw new Error("O nome do gestor é obrigatório.");
      }

      // Verificar se o órgão existe
      const orgao = await this.obterPorId(dados.orgao_id);
      if (!orgao) {
        throw new Error("Órgão não encontrado.");
      }

      // Se não especificou data de início, usar hoje
      const dataInicio =
        dados.data_inicio || new Date().toISOString().split("T")[0];

      // Verificar se já existe um gestor ativo para este órgão
      const gestorAtual = await this.obterGestorAtual(dados.orgao_id);
      if (gestorAtual && !dados.data_fim) {
        // Finalizar o gestor atual automaticamente
        await this.finalizarGestor(gestorAtual.id);
      }

      const dadosParaInserir = {
        orgao_id: dados.orgao_id,
        nome_responsavel: dados.nome_responsavel.trim(),
        cargo_responsavel: dados.cargo_responsavel
          ? dados.cargo_responsavel.trim()
          : null,
        data_inicio: dataInicio,
        data_fim: dados.data_fim || null,
        observacao: dados.observacao ? dados.observacao.trim() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("gestores_orgaos")
        .insert([dadosParaInserir])
        .select()
        .single();

      if (error) throw error;

      // Atualizar o campo gestor_atual no órgão (desnormalizado, mantido por compatibilidade)
      await supabase
        .from("orgaos")
        .update({
          gestor_atual: dados.nome_responsavel,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dados.orgao_id);

      return data;
    } catch (error) {
      console.error("Erro ao criar gestor:", error);
      throw error;
    }
  },

  /**
   * Atualiza um gestor
   * @param {number} id - ID do gestor
   * @param {Object} dados - Dados para atualizar
   * @returns {Promise<Object>} Gestor atualizado
   */
  async atualizarGestor(id, dados) {
    try {
      // Verificar se o gestor existe
      const { data: gestorExistente, error: findError } = await supabase
        .from("gestores_orgaos")
        .select("*")
        .eq("id", id)
        .single();
      if (findError) throw findError;
      if (!gestorExistente) {
        throw new Error("Gestor não encontrado.");
      }

      const dadosParaAtualizar = {};
      if (dados.nome_responsavel !== undefined)
        dadosParaAtualizar.nome_responsavel = dados.nome_responsavel.trim();
      if (dados.cargo_responsavel !== undefined)
        dadosParaAtualizar.cargo_responsavel =
          dados.cargo_responsavel.trim() || null;
      if (dados.data_inicio !== undefined)
        dadosParaAtualizar.data_inicio = dados.data_inicio;
      if (dados.data_fim !== undefined)
        dadosParaAtualizar.data_fim = dados.data_fim || null;
      if (dados.observacao !== undefined)
        dadosParaAtualizar.observacao = dados.observacao.trim() || null;
      dadosParaAtualizar.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("gestores_orgaos")
        .update(dadosParaAtualizar)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Se o gestor foi finalizado, atualizar o campo gestor_atual do órgão
      if (dados.data_fim) {
        const gestorAtual = await this.obterGestorAtual(
          gestorExistente.orgao_id,
        );
        await supabase
          .from("orgaos")
          .update({
            gestor_atual: gestorAtual?.nome_responsavel || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", gestorExistente.orgao_id);
      }

      return data;
    } catch (error) {
      console.error(`Erro ao atualizar gestor ${id}:`, error);
      throw error;
    }
  },

  /**
   * Finaliza o mandato de um gestor (define data_fim como hoje)
   * @param {number} id - ID do gestor
   * @returns {Promise<Object>} Gestor atualizado
   */
  async finalizarGestor(id) {
    try {
      const hoje = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("gestores_orgaos")
        .update({
          data_fim: hoje,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar o campo gestor_atual no órgão
      const gestorAtual = await this.obterGestorAtual(data.orgao_id);
      await supabase
        .from("orgaos")
        .update({
          gestor_atual: gestorAtual?.nome_responsavel || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.orgao_id);

      return data;
    } catch (error) {
      console.error(`Erro ao finalizar gestor ${id}:`, error);
      throw error;
    }
  },

  /**
   * Finaliza o gestor atual de um órgão
   * @param {number} orgaoId - ID do órgão
   * @returns {Promise<void>}
   */
  async finalizarGestorAtual(orgaoId) {
    try {
      const gestorAtual = await this.obterGestorAtual(orgaoId);
      if (gestorAtual) {
        await this.finalizarGestor(gestorAtual.id);
      }
    } catch (error) {
      console.error(
        `Erro ao finalizar gestor atual do órgão ${orgaoId}:`,
        error,
      );
    }
  },

  /**
   * Exclui um gestor
   * @param {number} id - ID do gestor
   * @returns {Promise<boolean>} True se excluído
   */
  async excluirGestor(id) {
    try {
      const { data: gestor, error: findError } = await supabase
        .from("gestores_orgaos")
        .select("orgao_id")
        .eq("id", id)
        .single();
      if (findError) throw findError;

      const { error } = await supabase
        .from("gestores_orgaos")
        .delete()
        .eq("id", id);
      if (error) throw error;

      // Se o gestor excluído era o atual, atualizar o campo gestor_atual
      const gestorAtual = await this.obterGestorAtual(gestor.orgao_id);
      await supabase
        .from("orgaos")
        .update({
          gestor_atual: gestorAtual?.nome_responsavel || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", gestor.orgao_id);

      return true;
    } catch (error) {
      console.error(`Erro ao excluir gestor ${id}:`, error);
      throw error;
    }
  },

  /**
   * Lista todos os gestores (para autocomplete)
   * @param {string} search - Termo de busca
   * @returns {Promise<Array>} Lista de nomes de gestores
   */
  async listarNomesGestores(search = "") {
    try {
      let query = supabase
        .from("gestores_orgaos")
        .select("nome_responsavel")
        .order("nome_responsavel");

      if (search) {
        const termo = `%${search}%`;
        query = query.ilike("nome_responsavel", termo);
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;

      // Retornar lista única de nomes
      const nomes = [...new Set(data.map((g) => g.nome_responsavel))];
      return nomes;
    } catch (error) {
      console.error("Erro ao listar nomes de gestores:", error);
      return [];
    }
  },

  // ============================================
  // VALIDAÇÕES
  // ============================================

  /**
   * Valida se uma sigla é única
   * @param {string} sigla - Sigla a validar
   * @param {number} idIgnorar - ID do órgão a ignorar (para edição)
   * @returns {Promise<boolean>} True se a sigla estiver disponível
   */
  async validarSigla(sigla, idIgnorar = null) {
    try {
      if (!sigla) return true;

      let query = supabase
        .from("orgaos")
        .select("id")
        .eq("sigla", sigla.toUpperCase());

      if (idIgnorar) {
        query = query.neq("id", idIgnorar);
      }

      const { data, error } = await query.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return !data;
    } catch (error) {
      console.error("Erro ao validar sigla:", error);
      return false;
    }
  },

  /**
   * Valida se um CNPJ é único
   * @param {string} cnpj - CNPJ a validar
   * @param {number} idIgnorar - ID do órgão a ignorar (para edição)
   * @returns {Promise<boolean>} True se o CNPJ estiver disponível
   */
  async validarCnpj(cnpj, idIgnorar = null) {
    try {
      if (!cnpj) return true;

      let query = supabase.from("orgaos").select("id").eq("cnpj", cnpj);

      if (idIgnorar) {
        query = query.neq("id", idIgnorar);
      }

      const { data, error } = await query.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return !data;
    } catch (error) {
      console.error("Erro ao validar CNPJ:", error);
      return false;
    }
  },

  /**
   * Valida se um nome de órgão é único (opcional)
   * @param {string} nome - Nome a validar
   * @param {number} idIgnorar - ID do órgão a ignorar (para edição)
   * @returns {Promise<boolean>} True se o nome estiver disponível
   */
  async validarNome(nome, idIgnorar = null) {
    try {
      if (!nome) return true;

      let query = supabase.from("orgaos").select("id").eq("nome", nome.trim());

      if (idIgnorar) {
        query = query.neq("id", idIgnorar);
      }

      const { data, error } = await query.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return !data;
    } catch (error) {
      console.error("Erro ao validar nome:", error);
      return false;
    }
  },

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  /**
   * Obtém estatísticas de órgãos
   * Usa a tabela gestores_orgaos para contar órgãos COM gestor ativo
   * @returns {Promise<Object>} Estatísticas
   */
  async obterEstatisticas() {
    try {
      const [total, ativos, inativos] = await Promise.all([
        supabase.from("orgaos").select("id", { count: "exact", head: true }),
        supabase
          .from("orgaos")
          .select("id", { count: "exact", head: true })
          .eq("ativo", true),
        supabase
          .from("orgaos")
          .select("id", { count: "exact", head: true })
          .eq("ativo", false),
      ]);

      // Contar órgãos com gestor ativo (via tabela gestores_orgaos)
      const { data: gestoresAtivos, error: errG } = await supabase
        .from("gestores_orgaos")
        .select("orgao_id")
        .is("data_fim", null);

      const orgaosComGestor = errG
        ? 0
        : new Set((gestoresAtivos || []).map((g) => g.orgao_id)).size;

      return {
        total: total.count || 0,
        ativos: ativos.count || 0,
        inativos: inativos.count || 0,
        comGestor: orgaosComGestor,
      };
    } catch (error) {
      console.error("Erro ao obter estatísticas de órgãos:", error);
      return { total: 0, ativos: 0, inativos: 0, comGestor: 0 };
    }
  },

  // ============================================
  // UTILITÁRIOS
  // ============================================

  /**
   * Formata um órgão para exibição
   * @param {Object} orgao - Dados do órgão
   * @returns {string} Nome formatado com sigla
   */
  formatarOrgao(orgao) {
    if (!orgao) return "";
    return orgao.sigla ? `${orgao.nome} (${orgao.sigla})` : orgao.nome;
  },

  /**
   * Busca órgãos por tipo
   * @param {string} tipo - Tipo do órgão
   * @returns {Promise<Array>} Lista de órgãos
   */
  async listarPorTipo(tipo) {
    try {
      const { data, error } = await supabase
        .from("orgaos")
        .select("*")
        .eq("tipo", tipo)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Erro ao listar órgãos por tipo ${tipo}:`, error);
      return [];
    }
  },

  /**
   * Busca órgãos por gestor
   * @param {string} nomeGestor - Nome do gestor
   * @returns {Promise<Array>} Lista de órgãos
   */
  async listarPorGestor(nomeGestor) {
    try {
      const { data, error } = await supabase
        .from("orgaos")
        .select("*")
        .eq("gestor_atual", nomeGestor)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Erro ao listar órgãos por gestor ${nomeGestor}:`, error);
      return [];
    }
  },
};

export default OrgaosService;
