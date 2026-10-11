// ============================================
// shared/js/services/onboarding-service.js
// Serviço centralizado para onboarding e perfil
// ------------------------------------------------------------
// Responsabilidades:
//   • Detectar se o usuário está em primeiro acesso
//   • Detectar se o perfil está incompleto
//   • Trocar senha (inicial e regular) com reautenticação
//   • Salvar dados do onboarding (nome, cargo, telefone, termos)
//   • Obter / atualizar perfil próprio do usuário
//   • Utilitários de validação de força de senha
// ============================================

import { supabase } from "../supabase.js";

export const OnboardingService = {
  // ============================================
  // VERIFICAÇÃO DE STATUS
  // ============================================

  /**
   * Verifica o status de onboarding do usuário logado
   * @returns {Promise<{primeiro_acesso: boolean, perfil_completo: boolean, usuario: Object}>}
   */
  async verificarStatus() {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Usuário não autenticado.");
      }

      const { data: perfil, error } = await supabase
        .from("usuarios")
        .select(
          "id, uuid, nome, email, primeiro_acesso, perfil_completo, ativo",
        )
        .eq("uuid", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!perfil) throw new Error("Perfil não encontrado.");

      return {
        primeiro_acesso: perfil.primeiro_acesso === true,
        perfil_completo: perfil.perfil_completo === true,
        usuario: perfil,
      };
    } catch (error) {
      console.error("[OnboardingService] Erro ao verificar status:", error);
      throw error;
    }
  },

  /**
   * Marca o último acesso do usuário logado (chamado pelo guard)
   * @returns {Promise<void>}
   */
  async registrarUltimoAcesso() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("usuarios")
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq("uuid", user.id);
    } catch (error) {
      // Silencioso — não bloqueia o login por causa disso
      console.warn(
        "[OnboardingService] Erro ao registrar último acesso:",
        error,
      );
    }
  },

  // ============================================
  // TROCA DE SENHA
  // ============================================

  /**
   * Troca a senha do usuário logado.
   * Funciona tanto para o primeiro acesso quanto para troca regular.
   * Reautentica antes de trocar (segurança).
   *
   * @param {string} senhaAtual - Senha atual (para reautenticar)
   * @param {string} novaSenha - Nova senha
   * @returns {Promise<void>}
   */
  async trocarSenha(senhaAtual, novaSenha) {
    try {
      // --- Validações locais ---
      if (!senhaAtual || !novaSenha) {
        throw new Error("Informe a senha atual e a nova senha.");
      }

      if (senhaAtual === novaSenha) {
        throw new Error("A nova senha deve ser diferente da senha atual.");
      }

      const forca = this.validarForcaSenha(novaSenha);
      if (forca.score < 3) {
        throw new Error(
          `Senha muito fraca. ${forca.mensagem} Requisitos: mínimo 8 caracteres, incluindo letras, números e ao menos uma maiúscula.`,
        );
      }

      // --- Pega o e-mail do usuário logado ---
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user || !user.email) {
        throw new Error("Usuário não autenticado.");
      }

      // --- Reautentica com a senha atual ---
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: senhaAtual,
      });
      if (reauthError) {
        throw new Error("Senha atual incorreta.");
      }

      // --- Atualiza a senha no Supabase Auth ---
      const { error: updateError } = await supabase.auth.updateUser({
        password: novaSenha,
      });
      if (updateError) throw updateError;

      // --- Marca no banco a data da troca de senha ---
      const { error: dbError } = await supabase
        .from("usuarios")
        .update({
          senha_alterada_em: new Date().toISOString(),
        })
        .eq("uuid", user.id);
      if (dbError) throw dbError;
    } catch (error) {
      console.error("[OnboardingService] Erro ao trocar senha:", error);
      throw error;
    }
  },

  /**
   * Troca a senha no PRIMEIRO ACESSO.
   * Além de trocar a senha, marca:
   *   • primeiro_acesso = false
   *   • convite_aceito_em = agora
   *
   * @param {string} senhaAtual - Senha temporária
   * @param {string} novaSenha - Nova senha pessoal
   */
  async trocarSenhaInicial(senhaAtual, novaSenha) {
    try {
      // Reaproveita a troca padrão (já reautentica e valida força)
      await this.trocarSenha(senhaAtual, novaSenha);

      // Marca o primeiro acesso como concluído
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const agora = new Date().toISOString();
      const { error } = await supabase
        .from("usuarios")
        .update({
          primeiro_acesso: false,
          convite_aceito_em: agora,
        })
        .eq("uuid", user.id);
      if (error) throw error;
    } catch (error) {
      console.error("[OnboardingService] Erro ao trocar senha inicial:", error);
      throw error;
    }
  },

  /**
   * Troca de senha regular (a qualquer momento, fora do onboarding)
   * Alias semântico para `trocarSenha`.
   */
  async trocarSenhaPropria(senhaAtual, novaSenha) {
    return this.trocarSenha(senhaAtual, novaSenha);
  },

  // ============================================
  // ONBOARDING (completar cadastro)
  // ============================================

  /**
   * Salva os dados do onboarding:
   *   • nome (obrigatório)
   *   • cargo (opcional)
   *   • telefone (opcional)
   *   • aceite dos termos (obrigatório)
   *
   * Ao salvar, marca perfil_completo = true e aceitou_termos_em = agora.
   *
   * @param {Object} dados
   * @param {string} dados.nome
   * @param {string} [dados.cargo]
   * @param {string} [dados.telefone]
   * @param {boolean} dados.aceitou_termos
   * @returns {Promise<Object>} Perfil atualizado
   */
  async salvarOnboarding(dados) {
    try {
      // --- Validações ---
      if (!dados.nome || !dados.nome.trim()) {
        throw new Error("O nome é obrigatório.");
      }
      if (!dados.aceitou_termos) {
        throw new Error(
          "Você precisa aceitar os termos de uso para continuar.",
        );
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Usuário não autenticado.");

      const agora = new Date().toISOString();

      const atualizacao = {
        nome: dados.nome.trim(),
        cargo: dados.cargo?.trim() || null,
        telefone: dados.telefone?.trim() || null,
        perfil_completo: true,
        aceitou_termos_em: agora,
      };

      const { data, error } = await supabase
        .from("usuarios")
        .update(atualizacao)
        .eq("uuid", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("[OnboardingService] Erro ao salvar onboarding:", error);
      throw error;
    }
  },

  // ============================================
  // PERFIL (Meu Perfil)
  // ============================================

  /**
   * Obtém o perfil completo do usuário logado (com órgão).
   * @returns {Promise<Object>}
   */
  async obterPerfilCompleto() {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Usuário não autenticado.");

      const { data, error } = await supabase
        .from("usuarios")
        .select(
          `
          id, uuid, nome, email, cargo, telefone, perfil, ativo, foto_url,
          primeiro_acesso, perfil_completo,
          senha_alterada_em, aceitou_termos_em,
          ultimo_acesso, created_at, updated_at,
          orgao:orgaos ( id, nome, sigla )
        `,
        )
        .eq("uuid", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Perfil não encontrado.");

      return data;
    } catch (error) {
      console.error("[OnboardingService] Erro ao obter perfil:", error);
      throw error;
    }
  },

  /**
   * Atualiza APENAS os dados que o usuário pode editar por conta própria:
   * nome, cargo e telefone.
   *
   * Campos como e-mail, órgão, perfil e ativo NÃO são editáveis aqui.
   *
   * @param {Object} dados - { nome?, cargo?, telefone? }
   * @returns {Promise<Object>} Perfil atualizado
   */
  async atualizarPerfilProprio(dados) {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Usuário não autenticado.");

      const atualizacao = {};

      if (dados.nome !== undefined) {
        if (!dados.nome.trim()) {
          throw new Error("O nome não pode ficar vazio.");
        }
        atualizacao.nome = dados.nome.trim();
      }

      if (dados.cargo !== undefined) {
        atualizacao.cargo = dados.cargo?.trim() || null;
      }

      if (dados.telefone !== undefined) {
        atualizacao.telefone = dados.telefone?.trim() || null;
      }
      if (dados.foto_url !== undefined) {
        if (dados.foto_url && (!String(dados.foto_url).startsWith("data:image/") || String(dados.foto_url).length > 180000)) {
          throw new Error("A foto deve ser uma imagem compactada de até 180 KB.");
        }
        atualizacao.foto_url = dados.foto_url || null;
      }

      if (Object.keys(atualizacao).length === 0) {
        throw new Error("Nenhum dado para atualizar.");
      }

      const { data, error } = await supabase
        .from("usuarios")
        .update(atualizacao)
        .eq("uuid", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("[OnboardingService] Erro ao atualizar perfil:", error);
      throw error;
    }
  },

  // ============================================
  // UTILITÁRIOS
  // ============================================

  /**
   * Valida a força da senha.
   *
   * Regras:
   *   • Mínimo 8 caracteres
   *   • Ao menos 1 letra maiúscula
   *   • Ao menos 1 letra minúscula
   *   • Ao menos 1 número
   *   (caractere especial = bônus, não obrigatório)
   *
   * Score final:
   *   0 = muito fraca
   *   1 = fraca
   *   2 = razoável
   *   3 = boa          ← mínimo aceito
   *   4 = muito forte
   *
   * @param {string} senha
   * @returns {{score: number, mensagem: string, requisitos: Object}}
   */
  validarForcaSenha(senha) {
    const s = String(senha || "");

    const requisitos = {
      tamanho: s.length >= 8,
      maiuscula: /[A-Z]/.test(s),
      minuscula: /[a-z]/.test(s),
      numero: /[0-9]/.test(s),
      especial: /[^A-Za-z0-9]/.test(s),
    };

    // Requisitos obrigatórios (peso maior)
    const obrigatoriosAtendidos = [
      requisitos.tamanho,
      requisitos.maiuscula,
      requisitos.minuscula,
      requisitos.numero,
    ].filter(Boolean).length;

    // Bônus por caractere especial
    const bonus = requisitos.especial ? 1 : 0;

    // Score base 0-3 conforme obrigatórios, +1 se tiver bônus
    let score = 0;
    if (obrigatoriosAtendidos >= 4) score = 3;
    else if (obrigatoriosAtendidos === 3) score = 2;
    else if (obrigatoriosAtendidos === 2) score = 1;
    else score = 0;

    if (score === 3 && bonus) score = 4;

    const mensagens = {
      0: "Muito fraca. Use pelo menos 8 caracteres com letras e números.",
      1: "Fraca. Adicione maiúsculas, minúsculas e números.",
      2: "Razoável. Falta atender algum requisito obrigatório.",
      3: "Boa. Senha dentro das regras de segurança.",
      4: "Muito forte. Excelente escolha!",
    };

    return {
      score,
      mensagem: mensagens[score],
      requisitos,
    };
  },

  /**
   * Formata uma data ISO (YYYY-MM-DD ou timestamp) em pt-BR.
   */
  formatarData(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  },

  /**
   * Formata uma data/hora ISO em pt-BR.
   */
  formatarDataHora(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  },
};

export default OnboardingService;
