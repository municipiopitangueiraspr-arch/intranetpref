// ============================================
// shared/js/auth.js
// Gerenciamento de autenticação - Centralizado
// ============================================

import { supabase } from "./supabase.js";

// ============================================
// CLASSE DE AUTENTICAÇÃO
// ============================================
class AuthManager {
  constructor() {
    this.usuarioAtual = null;
    this.session = null;
  }

  /**
   * Verifica se o usuário está autenticado
   * @returns {Promise<Object|null>} Sessão do usuário ou null
   */
  async verificarSessao() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      this.session = session;

      if (session) {
        // Buscar dados completos do usuário
        const { data: usuario, error } = await supabase
          .from("usuarios")
          .select("*, orgao:orgaos(*)")
          .eq("uuid", session.user.id)
          .single();

        if (error || !usuario) {
          console.warn("Usuário não encontrado na tabela:", error);
          return session;
        }

        this.usuarioAtual = usuario;
        return session;
      }

      return null;
    } catch (error) {
      console.error("Erro ao verificar sessão:", error);
      return null;
    }
  }

  /**
   * Obtém o usuário atual
   * @returns {Object|null} Dados do usuário ou null
   */
  async obterUsuarioAtual() {
    if (this.usuarioAtual) return this.usuarioAtual;

    const session = await this.verificarSessao();
    if (!session) return null;

    return this.usuarioAtual;
  }

  /**
   * Obtém a sessão atual
   * @returns {Object|null} Sessão ou null
   */
  async obterSessao() {
    if (this.session) return this.session;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    this.session = session;
    return session;
  }

  /**
   * Faz login
   * @param {string} email - E-mail do usuário
   * @param {string} password - Senha do usuário
   * @returns {Promise<Object>} Dados da autenticação
   */
  async login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Atualizar sessão
      this.session = data.session;

      // Buscar dados do usuário
      const { data: usuario, error: userError } = await supabase
        .from("usuarios")
        .select("*, orgao:orgaos(*)")
        .eq("uuid", data.user.id)
        .single();

      if (userError) {
        console.warn("Usuário não encontrado na tabela:", userError);
        return data;
      }

      this.usuarioAtual = usuario;

      // Registrar login
      await this.registrarLogin(usuario.id);

      return { ...data, usuario };
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      throw error;
    }
  }

  /**
   * Faz logout
   * @returns {Promise<boolean>} True se logout bem-sucedido
   */
  async logout() {
    try {
      if (this.usuarioAtual) {
        await this.registrarLogout(this.usuarioAtual.id);
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      this.usuarioAtual = null;
      this.session = null;
      return true;
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      throw error;
    }
  }

  /**
   * Registra o login do usuário
   * @param {number} usuarioId - ID do usuário
   */
  async registrarLogin(usuarioId) {
    try {
      await supabase
        .from("usuarios")
        .update({
          ultimo_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", usuarioId);
    } catch (error) {
      console.warn("Erro ao registrar login:", error);
    }
  }

  /**
   * Registra o logout do usuário
   * @param {number} usuarioId - ID do usuário
   */
  async registrarLogout(usuarioId) {
    try {
      await supabase
        .from("usuarios")
        .update({
          ultimo_logout: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", usuarioId);
    } catch (error) {
      console.warn("Erro ao registrar logout:", error);
    }
  }

  /**
   * Verifica se o usuário tem um perfil específico
   * @param {string|Array} perfis - Perfil ou lista de perfis permitidos
   * @returns {Promise<boolean>} True se tem permissão
   */
  async temPerfil(perfis) {
    const usuario = await this.obterUsuarioAtual();
    if (!usuario) return false;

    const perfisArray = Array.isArray(perfis) ? perfis : [perfis];
    return perfisArray.includes(usuario.perfil);
  }

  /**
   * Verifica se o usuário é ADMIN
   * @returns {Promise<boolean>} True se for ADMIN
   */
  async isAdmin() {
    return this.temPerfil("ADMIN");
  }

  /**
   * Obtém o token JWT atual
   * @returns {Promise<string|null>} Token ou null
   */
  async getToken() {
    const session = await this.obterSessao();
    return session?.access_token || null;
  }
}

// ============================================
// EXPORTAÇÃO
// ============================================
export const auth = new AuthManager();

// Exportar também o supabase para compatibilidade
export { supabase };

export default auth;
