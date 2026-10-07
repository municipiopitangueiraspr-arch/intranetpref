// ============================================
// shared/js/services/usuarios-service.js
// Serviço compartilhado para gestão de usuários
// Integração com Supabase - Centralizado
//
// CORREÇÕES APLICADAS:
//  · Uso de created_at (padrão Supabase) — não criado_em
//  · select("*") para trazer todas as colunas da tabela
//  · Suporte a cargo e telefone no criar/atualizar
//  · Detecção de usuário órfão (Auth sem perfil)
//  · Reativação automática de usuário inativo ao criar
//  · Tratamento explícito de "User already registered"
//  · Soft delete com auditoria (desativado_em, reativado_em)
//  · obterEstatisticas() corrigido (sem groupBy no client)
//  · verificarDependencias() resiliente a tabelas inexistentes
//  · [NOVO] Respeita dados.primeiro_acesso no criar()
// ============================================

import { supabase } from "../supabase.js";

export const UsuariosService = {
  // ============================================
  // CRUD - USUÁRIOS
  // ============================================

  /**
   * Lista todos os usuários
   * @param {Object} options - Opções de filtro
   * @param {boolean} options.onlyActive - Apenas usuários ativos
   * @param {boolean} options.onlyInactive - Apenas usuários inativos
   * @param {string} options.search - Termo de busca (nome ou email)
   * @param {number} options.orgaoId - Filtrar por órgão
   * @param {string} options.perfil - Filtrar por perfil
   * @returns {Promise<Array>} Lista de usuários
   */
  async listar(options = {}) {
    try {
      let query = supabase
        .from("usuarios")
        .select("*, orgao:orgaos(id, nome, sigla)")
        .order("nome");

      // Filtro de status
      if (options.onlyActive) {
        query = query.eq("ativo", true);
      } else if (options.onlyInactive) {
        query = query.eq("ativo", false);
      }

      if (options.search) {
        const termo = `%${options.search}%`;
        query = query.or(`nome.ilike.${termo},email.ilike.${termo}`);
      }

      if (options.orgaoId) {
        query = query.eq("orgao_id", options.orgaoId);
      }

      if (options.perfil) {
        query = query.eq("perfil", options.perfil);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      throw error;
    }
  },

  /**
   * Lista apenas usuários ativos
   * @param {Object} options - Opções de filtro
   * @returns {Promise<Array>} Lista de usuários ativos
   */
  async listarAtivos(options = {}) {
    try {
      return await this.listar({ ...options, onlyActive: true });
    } catch (error) {
      console.error("Erro ao listar usuários ativos:", error);
      throw error;
    }
  },

  /**
   * Lista apenas usuários inativos
   * @param {Object} options - Opções de filtro
   * @returns {Promise<Array>} Lista de usuários inativos
   */
  async listarInativos(options = {}) {
    try {
      return await this.listar({ ...options, onlyInactive: true });
    } catch (error) {
      console.error("Erro ao listar usuários inativos:", error);
      throw error;
    }
  },

  /**
   * Obtém um usuário por ID
   * @param {number} id - ID do usuário
   * @returns {Promise<Object>} Dados do usuário
   */
  async obterPorId(id) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*, orgao:orgaos(id, nome, sigla)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao obter usuário ${id}:`, error);
      throw error;
    }
  },

  /**
   * Obtém um usuário por UUID (do Supabase Auth)
   * @param {string} uuid - UUID do usuário
   * @returns {Promise<Object>} Dados do usuário
   */
  async obterPorUuid(uuid) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*, orgao:orgaos(id, nome, sigla)")
        .eq("uuid", uuid)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao obter usuário por UUID ${uuid}:`, error);
      throw error;
    }
  },

  /**
   * Obtém um usuário por email
   * @param {string} email - Email do usuário
   * @returns {Promise<Object>} Dados do usuário
   */
  async obterPorEmail(email) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*, orgao:orgaos(id, nome, sigla)")
        .eq("email", email)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    } catch (error) {
      console.error(`Erro ao obter usuário por email ${email}:`, error);
      throw error;
    }
  },

  /**
   * Verifica se um usuário já existe na tabela por UUID
   * @param {string} uuid - UUID do usuário
   * @returns {Promise<boolean>} True se existe
   */
  async usuarioExiste(uuid) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id")
        .eq("uuid", uuid)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return !!data;
    } catch (error) {
      console.error("Erro ao verificar existência do usuário:", error);
      return false;
    }
  },

  /**
   * Cria um novo usuário (com autenticação no Supabase Auth)
   *
   * FLUXO:
   *  1. Valida dados obrigatórios
   *  2. Verifica se já existe perfil na tabela usuarios por email
   *  3. Se existe e está INATIVO → reativa automaticamente
   *  4. Se existe e está ATIVO → bloqueia com mensagem clara
   *  5. Se não existe → cria no Auth + cria perfil
   *
   * @param {Object} dados - Dados do usuário
   * @param {string} dados.nome - Nome do usuário (obrigatório)
   * @param {string} dados.email - Email do usuário (obrigatório)
   * @param {string} dados.senha - Senha do usuário (obrigatório, mínimo 6 caracteres)
   * @param {string} dados.perfil - Perfil de acesso (ADMIN, SECRETARIO, SOLICITANTE, ESTAGIARIO)
   * @param {number} dados.orgao_id - ID do órgão
   * @param {string} dados.cargo - Cargo/função (opcional)
   * @param {string} dados.telefone - Telefone (opcional)
   * @param {boolean} dados.ativo - Status do usuário (default: true)
   * @param {boolean} dados.primeiro_acesso - Forçar troca de senha no 1º acesso (default: true)
   * @returns {Promise<Object>} Usuário criado ou reativado
   */
  async criar(dados) {
    try {
      console.log(
        "🔍 [UsuariosService.criar] Dados recebidos:",
        JSON.stringify(
          { ...dados, senha: dados.senha ? "***" : undefined },
          null,
          2,
        ),
      );

      // =====================================================
      // 1. VALIDAÇÕES BÁSICAS
      // =====================================================
      if (!dados.nome) {
        throw new Error("O nome do usuário é obrigatório.");
      }
      if (!dados.email) {
        throw new Error("O e-mail do usuário é obrigatório.");
      }
      if (!dados.senha || dados.senha.length < 6) {
        throw new Error("A senha deve ter no mínimo 6 caracteres.");
      }

      // =====================================================
      // 2. VERIFICA SE JÁ EXISTE PERFIL NA TABELA USUARIOS
      // =====================================================
      console.log(
        "🔍 [UsuariosService.criar] Verificando perfil existente por email...",
      );
      const perfilExistente = await this.obterPorEmail(dados.email.trim());

      if (perfilExistente) {
        // 2.1 — Existe e está INATIVO → REATIVAR
        if (!perfilExistente.ativo) {
          console.log(
            "♻️ [UsuariosService.criar] Perfil existe INATIVO. Reativando...",
          );
          const usuarioReativado = await this.reativar(perfilExistente.id, {
            nome: dados.nome.trim(),
            perfil: dados.perfil || perfilExistente.perfil,
            orgao_id:
              dados.orgao_id !== undefined
                ? dados.orgao_id
                : perfilExistente.orgao_id,
            cargo:
              dados.cargo !== undefined ? dados.cargo : perfilExistente.cargo,
            telefone:
              dados.telefone !== undefined
                ? dados.telefone
                : perfilExistente.telefone,
          });

          console.log(
            "✅ [UsuariosService.criar] Usuário reativado com sucesso!",
          );
          return { ...usuarioReativado, _reativado: true };
        }

        // 2.2 — Existe e está ATIVO → bloquear
        console.warn(
          "⚠️ [UsuariosService.criar] Perfil já existe e está ATIVO.",
        );
        throw new Error(
          `O e-mail "${dados.email}" já está cadastrado e ativo no sistema.`,
        );
      }

      // =====================================================
      // 3. CRIA USUÁRIO NO SUPABASE AUTH
      // =====================================================
      console.log(
        "🔍 [UsuariosService.criar] Criando usuário no Supabase Auth...",
      );
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: dados.email.trim(),
        password: dados.senha,
        options: {
          data: {
            name: dados.nome.trim(),
            perfil: dados.perfil || "SOLICITANTE",
          },
        },
      });

      // 3.1 — Tratamento específico de "User already registered"
      if (authError) {
        console.error("❌ [UsuariosService.criar] Erro no signUp:", authError);

        const msg = (authError.message || "").toLowerCase();
        if (
          msg.includes("already registered") ||
          msg.includes("already been registered") ||
          msg.includes("user already exists")
        ) {
          throw new Error(
            `O e-mail "${dados.email}" já existe no sistema de autenticação, ` +
              `mas NÃO possui perfil cadastrado na tabela de usuários. ` +
              `Isso geralmente acontece quando um usuário foi removido ` +
              `incorretamente (usuário órfão). ` +
              `Contate o administrador para recuperar este usuário ` +
              `diretamente no painel do Supabase (Authentication → Users).`,
          );
        }

        throw new Error(
          `Erro ao criar usuário no sistema de autenticação: ${authError.message}`,
        );
      }

      if (!authData?.user?.id) {
        throw new Error(
          "Erro ao criar usuário no sistema de autenticação: usuário não retornado.",
        );
      }

      console.log(
        "✅ [UsuariosService.criar] Usuário criado no Auth. UUID:",
        authData.user.id,
      );

      // =====================================================
      // 4. VERIFICA SE O PERFIL JÁ FOI CRIADO (trigger automático)
      // =====================================================
      const jaExistePerfil = await this.usuarioExiste(authData.user.id);
      if (jaExistePerfil) {
        console.warn(
          "⚠️ [UsuariosService.criar] Perfil já criado pelo trigger. Atualizando dados...",
        );

        // Respeita a flag do formulário. Se não foi informada, assume true (padrão seguro).
        const primeiroAcesso =
          dados.primeiro_acesso !== undefined ? dados.primeiro_acesso : true;

        const { data: usuarioAtualizado, error: updateError } = await supabase
          .from("usuarios")
          .update({
            nome: dados.nome.trim(),
            email: dados.email.trim(),
            perfil: dados.perfil || "SOLICITANTE",
            orgao_id: dados.orgao_id || null,
            cargo: dados.cargo || null,
            telefone: dados.telefone || null,
            ativo: true,
            primeiro_acesso: primeiroAcesso,
          })
          .eq("uuid", authData.user.id)
          .select()
          .single();

        if (updateError) {
          console.error(
            "❌ [UsuariosService.criar] Erro ao atualizar perfil existente:",
            updateError,
          );
          throw new Error(
            `Erro ao atualizar usuário existente: ${updateError.message}`,
          );
        }

        console.log("✅ [UsuariosService.criar] Perfil atualizado!");
        return usuarioAtualizado;
      }

      // =====================================================
      // 5. CRIA O PERFIL NA TABELA USUARIOS
      // =====================================================
      console.log(
        "🔍 [UsuariosService.criar] Inserindo novo perfil na tabela...",
      );

      // Respeita a flag do formulário. Se não foi informada, assume true (padrão seguro).
      const primeiroAcesso =
        dados.primeiro_acesso !== undefined ? dados.primeiro_acesso : true;

      const dadosParaInserir = {
        uuid: authData.user.id,
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        perfil: dados.perfil || "SOLICITANTE",
        orgao_id: dados.orgao_id || null,
        cargo: dados.cargo || null,
        telefone: dados.telefone || null,
        ativo: dados.ativo !== undefined ? dados.ativo : true,
        primeiro_acesso: primeiroAcesso,
      };

      const { data: usuario, error: insertError } = await supabase
        .from("usuarios")
        .insert([dadosParaInserir])
        .select()
        .single();

      if (insertError) {
        console.error(
          "❌ [UsuariosService.criar] Erro ao inserir perfil:",
          insertError,
        );

        if (insertError.code === "23505") {
          throw new Error(
            "Este usuário já está cadastrado no sistema. Tente fazer login.",
          );
        }

        throw new Error(
          `Erro ao salvar usuário no banco de dados: ${insertError.message}`,
        );
      }

      console.log(
        "✅ [UsuariosService.criar] Usuário criado com sucesso! ID:",
        usuario.id,
      );

      // =====================================================
      // 6. SALVA PERMISSÕES (se houver)
      // =====================================================
      if (dados.permissoes && dados.permissoes.length > 0) {
        console.log(
          "🔍 [UsuariosService.criar] Salvando permissões do usuário...",
        );
        try {
          await this.atualizarPermissoes(usuario.id, dados.permissoes);
        } catch (permErr) {
          console.warn(
            "⚠️ Erro ao salvar permissões (usuário já foi criado):",
            permErr,
          );
        }
      }

      return usuario;
    } catch (error) {
      console.error("❌ [UsuariosService.criar] Erro geral:", error);
      throw error;
    }
  },

  /**
   * Atualiza um usuário existente
   * @param {number} id - ID do usuário
   * @param {Object} dados - Dados para atualizar
   * @returns {Promise<Object>} Usuário atualizado
   */
  async atualizar(id, dados) {
    try {
      const usuarioExistente = await this.obterPorId(id);
      if (!usuarioExistente) {
        throw new Error("Usuário não encontrado.");
      }

      // Verifica se está tentando mudar o email para um que já existe
      if (dados.email && dados.email !== usuarioExistente.email) {
        const emailDisponivel = await this.validarEmail(dados.email, id);
        if (!emailDisponivel) {
          throw new Error(`O e-mail "${dados.email}" já está em uso.`);
        }
      }

      const dadosParaAtualizar = {};

      if (dados.nome !== undefined) dadosParaAtualizar.nome = dados.nome.trim();
      if (dados.email !== undefined)
        dadosParaAtualizar.email = dados.email.trim();
      if (dados.perfil !== undefined) dadosParaAtualizar.perfil = dados.perfil;
      if (dados.orgao_id !== undefined)
        dadosParaAtualizar.orgao_id = dados.orgao_id || null;
      if (dados.cargo !== undefined) dadosParaAtualizar.cargo = dados.cargo;
      if (dados.telefone !== undefined)
        dadosParaAtualizar.telefone = dados.telefone;
      if (dados.ativo !== undefined) dadosParaAtualizar.ativo = dados.ativo;

      const { data, error } = await supabase
        .from("usuarios")
        .update(dadosParaAtualizar)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      if (dados.permissoes) {
        await this.atualizarPermissoes(id, dados.permissoes);
      }

      return data;
    } catch (error) {
      console.error(`Erro ao atualizar usuário ${id}:`, error);
      throw error;
    }
  },

  // ============================================================
  // SOFT DELETE — DESATIVAR / REATIVAR
  // ============================================================

  /**
   * Desativa um usuário (soft delete)
   *
   * Não remove o registro — apenas marca como inativo.
   * Preserva histórico, pedidos, atas, processos, etc.
   * A data de desativação é registrada automaticamente pelo
   * trigger do banco (fn_auditar_desativacao_usuario).
   *
   * @param {number} id - ID do usuário
   * @returns {Promise<Object>} Usuário atualizado
   */
  async desativar(id) {
    try {
      console.log(
        `🔒 [UsuariosService.desativar] Desativando usuário ${id}...`,
      );

      const { data, error } = await supabase
        .from("usuarios")
        .update({ ativo: false })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ [UsuariosService.desativar] Usuário ${id} desativado.`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao desativar usuário ${id}:`, error);
      throw error;
    }
  },

  /**
   * Reativa um usuário previamente desativado
   *
   * @param {number} id - ID do usuário
   * @param {Object} [dados] - Dados opcionais para atualizar na reativação
   * @param {string} [dados.nome] - Novo nome (opcional)
   * @param {string} [dados.perfil] - Novo perfil (opcional)
   * @param {number} [dados.orgao_id] - Novo órgão (opcional)
   * @param {string} [dados.cargo] - Novo cargo (opcional)
   * @param {string} [dados.telefone] - Novo telefone (opcional)
   * @returns {Promise<Object>} Usuário reativado
   */
  async reativar(id, dados = {}) {
    try {
      console.log(`♻️ [UsuariosService.reativar] Reativando usuário ${id}...`);

      const updates = { ativo: true };

      if (dados.nome) updates.nome = dados.nome.trim();
      if (dados.perfil) updates.perfil = dados.perfil;
      if (dados.orgao_id !== undefined)
        updates.orgao_id = dados.orgao_id || null;
      if (dados.cargo !== undefined) updates.cargo = dados.cargo;
      if (dados.telefone !== undefined) updates.telefone = dados.telefone;

      const { data, error } = await supabase
        .from("usuarios")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ [UsuariosService.reativar] Usuário ${id} reativado.`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao reativar usuário ${id}:`, error);
      throw error;
    }
  },

  /**
   * Alias mantido por compatibilidade — chama reativar()
   * @deprecated Use reativar()
   */
  async ativar(id) {
    return this.reativar(id);
  },

  /**
   * Obtém estatísticas de usuários
   *
   * NOTA: o supabase-js NÃO possui .groupBy() — agrupamos no JS.
   *
   * @returns {Promise<Object>} Estatísticas
   */
  async obterEstatisticas() {
    try {
      const { data: usuarios, error } = await supabase
        .from("usuarios")
        .select("perfil, ativo");

      if (error) throw error;

      const lista = usuarios || [];
      const total = lista.length;
      const ativos = lista.filter((u) => u.ativo === true).length;
      const inativos = total - ativos;

      // Agrupa por perfil no JS
      const porPerfil = {};
      lista.forEach((u) => {
        const p = u.perfil || "SEM_PERFIL";
        porPerfil[p] = (porPerfil[p] || 0) + 1;
      });

      return {
        total,
        ativos,
        inativos,
        porPerfil,
      };
    } catch (error) {
      console.error("Erro ao obter estatísticas de usuários:", error);
      return { total: 0, ativos: 0, inativos: 0, porPerfil: {} };
    }
  },

  /**
   * Exclui um usuário PERMANENTEMENTE (não recomendado)
   *
   * ⚠️ ATENÇÃO:
   *  · Remove apenas da tabela usuarios.
   *  · NÃO remove do auth.users (o e-mail ficará ÓRFÃO).
   *  · Use desativar() (soft delete) sempre que possível.
   *
   * @param {number} id - ID do usuário
   * @returns {Promise<boolean>} True se excluído
   */
  async excluir(id) {
    try {
      console.warn(
        `⚠️ [UsuariosService.excluir] Exclusão PERMANENTE do usuário ${id}. ` +
          `Isso deixará o e-mail órfão no auth.users. ` +
          `Prefira usar desativar().`,
      );

      const usuario = await this.obterPorId(id);
      if (!usuario) {
        throw new Error("Usuário não encontrado.");
      }

      const dependencias = await this.verificarDependencias(id);
      if (dependencias.temPedidos) {
        throw new Error(
          "Não é possível excluir o usuário pois existem pedidos vinculados.",
        );
      }
      if (dependencias.temProcessos) {
        throw new Error(
          "Não é possível excluir o usuário pois existem processos vinculados.",
        );
      }
      if (dependencias.temAtos) {
        throw new Error(
          "Não é possível excluir o usuário pois existem atos vinculados.",
        );
      }

      // Remove permissões vinculadas (se a tabela existir)
      try {
        await supabase
          .from("permissoes_usuarios")
          .delete()
          .eq("usuario_id", id);
      } catch (permErr) {
        console.warn(
          "⚠️ Erro ao remover permissões (tabela pode não existir):",
          permErr,
        );
      }

      const { error } = await supabase.from("usuarios").delete().eq("id", id);
      if (error) throw error;

      return true;
    } catch (error) {
      console.error(`Erro ao excluir usuário ${id}:`, error);
      throw error;
    }
  },

  /**
   * Verifica dependências de um usuário
   * Cada verificação é feita individualmente — se uma tabela não
   * existir, não quebra as outras.
   *
   * @param {number} id - ID do usuário
   * @returns {Promise<Object>} Objeto com dependências
   */
  async verificarDependencias(id) {
    const resultados = {
      temPedidos: false,
      temProcessos: false,
      temAtos: false,
    };

    // Pedidos
    try {
      const { count } = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", id);
      resultados.temPedidos = (count || 0) > 0;
    } catch (e) {
      console.warn("⚠️ Tabela pedidos não acessível:", e.message);
    }

    // Processos licitatórios
    try {
      const { count } = await supabase
        .from("processos_licitatorios")
        .select("id", { count: "exact", head: true })
        .eq("responsavel_id", id);
      resultados.temProcessos = (count || 0) > 0;
    } catch (e) {
      console.warn(
        "⚠️ Tabela processos_licitatorios não acessível:",
        e.message,
      );
    }

    // Atos oficiais
    try {
      const { count } = await supabase
        .from("atos_oficiais")
        .select("id", { count: "exact", head: true })
        .eq("usuario_cadastro_id", id);
      resultados.temAtos = (count || 0) > 0;
    } catch (e) {
      console.warn("⚠️ Tabela atos_oficiais não acessível:", e.message);
    }

    return resultados;
  },

  // ============================================
  // PERMISSÕES POR MÓDULO
  // ============================================

  /**
   * Obtém as permissões de um usuário por módulo
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<Array>} Lista de permissões
   */
  async obterPermissoes(usuarioId) {
    try {
      const { data, error } = await supabase
        .from("permissoes_usuarios")
        .select("modulo, permissao, acoes")
        .eq("usuario_id", usuarioId);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Erro ao obter permissões do usuário ${usuarioId}:`, error);
      return [];
    }
  },

  /**
   * Obtém os módulos permitidos para um usuário
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<Array>} Lista de módulos permitidos
   */
  async obterModulosPermitidos(usuarioId) {
    try {
      const permissoes = await this.obterPermissoes(usuarioId);
      const modulos = permissoes
        .filter((p) => p.permissao === "permitido" || p.permissao === "admin")
        .map((p) => p.modulo);
      return [...new Set(modulos)];
    } catch (error) {
      console.error(
        `Erro ao obter módulos permitidos do usuário ${usuarioId}:`,
        error,
      );
      return [];
    }
  },

  /**
   * Verifica se um usuário tem permissão para um módulo
   * @param {number} usuarioId - ID do usuário
   * @param {string} modulo - Nome do módulo
   * @param {string} acao - Ação a verificar (criar, ler, atualizar, deletar)
   * @returns {Promise<boolean>} True se tem permissão
   */
  async temPermissao(usuarioId, modulo, acao = "ler") {
    try {
      const usuario = await this.obterPorId(usuarioId);
      if (usuario?.perfil === "ADMIN") return true;

      const permissoes = await this.obterPermissoes(usuarioId);
      const permissao = permissoes.find((p) => p.modulo === modulo);

      if (!permissao) return false;
      if (permissao.permissao === "admin") return true;
      if (permissao.permissao === "permitido") {
        const acoes = permissao.acoes || ["ler"];
        return acoes.includes(acao);
      }
      return false;
    } catch (error) {
      console.error(
        `Erro ao verificar permissão do usuário ${usuarioId}:`,
        error,
      );
      return false;
    }
  },

  /**
   * Atualiza as permissões de um usuário
   * @param {number} usuarioId - ID do usuário
   * @param {Array} permissoes - Lista de permissões [{modulo, permissao, acoes}]
   * @returns {Promise<boolean>} True se atualizado
   */
  async atualizarPermissoes(usuarioId, permissoes) {
    try {
      await supabase
        .from("permissoes_usuarios")
        .delete()
        .eq("usuario_id", usuarioId);

      if (permissoes && permissoes.length > 0) {
        const dadosParaInserir = permissoes.map((p) => ({
          usuario_id: usuarioId,
          modulo: p.modulo,
          permissao: p.permissao || "permitido",
          acoes: p.acoes || ["ler"],
        }));

        const { error } = await supabase
          .from("permissoes_usuarios")
          .insert(dadosParaInserir);
        if (error) throw error;
      }
      return true;
    } catch (error) {
      console.error(
        `Erro ao atualizar permissões do usuário ${usuarioId}:`,
        error,
      );
      throw error;
    }
  },

  // ============================================
  // VALIDAÇÕES
  // ============================================

  /**
   * Valida se um email é único
   * @param {string} email - Email a validar
   * @param {number} idIgnorar - ID do usuário a ignorar (para edição)
   * @returns {Promise<boolean>} True se o email estiver disponível
   */
  async validarEmail(email, idIgnorar = null) {
    try {
      if (!email) return true;

      let query = supabase
        .from("usuarios")
        .select("id")
        .eq("email", email.trim());

      if (idIgnorar) {
        query = query.neq("id", idIgnorar);
      }

      const { data, error } = await query.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return !data;
    } catch (error) {
      console.error("Erro ao validar email:", error);
      return false;
    }
  },

  /**
   * Valida se um nome de usuário é único (opcional)
   * @param {string} nome - Nome a validar
   * @param {number} idIgnorar - ID do usuário a ignorar (para edição)
   * @returns {Promise<boolean>} True se o nome estiver disponível
   */
  async validarNome(nome, idIgnorar = null) {
    try {
      if (!nome) return true;

      let query = supabase
        .from("usuarios")
        .select("id")
        .eq("nome", nome.trim());

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
  // LOG DE ACESSO
  // ============================================

  /**
   * Registra o login de um usuário
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<boolean>} True se registrado
   */
  async registrarLogin(usuarioId) {
    try {
      const { error } = await supabase
        .from("usuarios")
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq("id", usuarioId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Erro ao registrar login do usuário ${usuarioId}:`, error);
      return false;
    }
  },

  /**
   * Registra o logout de um usuário (opcional)
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<boolean>} True se registrado
   */
  async registrarLogout(usuarioId) {
    try {
      const { error } = await supabase
        .from("usuarios")
        .update({ ultimo_logout: new Date().toISOString() })
        .eq("id", usuarioId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Erro ao registrar logout do usuário ${usuarioId}:`, error);
      return false;
    }
  },

  /**
   * Obtém o histórico de acessos de um usuário
   * @param {number} usuarioId - ID do usuário
   * @param {number} limite - Número de registros
   * @returns {Promise<Array>} Lista de acessos
   */
  async obterHistoricoAcessos(usuarioId, limite = 50) {
    try {
      const { data, error } = await supabase
        .from("logs_acesso")
        .select("*")
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(
        `Erro ao obter histórico de acessos do usuário ${usuarioId}:`,
        error,
      );
      return [];
    }
  },

  // ============================================
  // UTILITÁRIOS
  // ============================================

  /**
   * Formata um usuário para exibição
   * @param {Object} usuario - Dados do usuário
   * @returns {string} Nome formatado
   */
  formatarUsuario(usuario) {
    if (!usuario) return "";
    return usuario.nome || usuario.email || "Usuário";
  },

  /**
   * Obtém a lista de perfis disponíveis
   * @returns {Array} Lista de perfis
   */
  getPerfis() {
    return [
      { value: "ADMIN", label: "Administrador" },
      { value: "SECRETARIO", label: "Secretário" },
      { value: "SOLICITANTE", label: "Solicitante" },
      { value: "ESTAGIARIO", label: "Estagiário" },
    ];
  },

  /**
   * Obtém a lista de módulos disponíveis
   * @returns {Array} Lista de módulos
   */
  getModulos() {
    return [
      { value: "atas", label: "Atas, Saldos e Pedidos" },
      { value: "atos-oficiais", label: "Atos Oficiais" },
      { value: "processos", label: "Processos Licitatórios" },
      { value: "tarefas", label: "Gestão de Tarefas" },
      { value: "usuarios", label: "Gestão de Usuários" },
      { value: "orgaos", label: "Gestão de Órgãos" },
      { value: "permissoes", label: "Gestão de Permissões" },
      { value: "configuracoes", label: "Configurações" },
    ];
  },

  /**
   * Busca usuários por perfil
   * @param {string} perfil - Perfil a buscar
   * @returns {Promise<Array>} Lista de usuários
   */
  async listarPorPerfil(perfil) {
    try {
      return await this.listar({ perfil });
    } catch (error) {
      console.error(`Erro ao listar usuários por perfil ${perfil}:`, error);
      return [];
    }
  },

  /**
   * Busca usuários por órgão
   * @param {number} orgaoId - ID do órgão
   * @returns {Promise<Array>} Lista de usuários
   */
  async listarPorOrgao(orgaoId) {
    try {
      return await this.listar({ orgaoId });
    } catch (error) {
      console.error(`Erro ao listar usuários por órgão ${orgaoId}:`, error);
      return [];
    }
  },

  /**
   * Busca usuários por termo de busca
   * @param {string} termo - Termo de busca
   * @returns {Promise<Array>} Lista de usuários
   */
  async buscar(termo) {
    try {
      return await this.listar({ search: termo });
    } catch (error) {
      console.error(`Erro ao buscar usuários por "${termo}":`, error);
      return [];
    }
  },

  /**
   * Obtém o perfil de um usuário com todas as informações
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<Object>} Perfil completo do usuário
   */
  async obterPerfilCompleto(usuarioId) {
    try {
      const [usuario, permissoes, acessos] = await Promise.all([
        this.obterPorId(usuarioId),
        this.obterPermissoes(usuarioId),
        this.obterHistoricoAcessos(usuarioId, 10),
      ]);

      return {
        ...usuario,
        permissoes,
        ultimos_acessos: acessos,
      };
    } catch (error) {
      console.error(
        `Erro ao obter perfil completo do usuário ${usuarioId}:`,
        error,
      );
      throw error;
    }
  },

  // ============================================
  // REDEFINIR SENHA (FLUXO DE RECUPERAÇÃO)
  // ============================================

  /**
   * Envia um e-mail de redefinição de senha
   * @param {string} email - Email do usuário
   * @returns {Promise<boolean>} True se enviado
   */
  async enviarRedefinicaoSenha(email) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha.html`,
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error(
        `Erro ao enviar redefinição de senha para ${email}:`,
        error,
      );
      throw error;
    }
  },
};

export default UsuariosService;
