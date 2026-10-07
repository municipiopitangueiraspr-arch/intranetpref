// ============================================
// shared/js/auth-guard.js
// Guard central de autenticação e onboarding
// ------------------------------------------------------------
// Responsabilidades:
//   • Verificar se o usuário tem sessão ativa
//   • Verificar se o perfil existe e está ativo no banco
//   • Detectar se precisa passar pelo onboarding
//   • Redirecionar para a tela correta conforme o estado
//   • Registrar o último acesso do usuário
//
// Uso típico em qualquer página protegida:
//
//   import { AuthGuard } from "/shared/js/auth-guard.js";
//
//   const resultado = await AuthGuard.protegerRota();
//   if (!resultado.ok) return; // guard já redirecionou
//
// ============================================

import { supabase } from "./supabase.js";
import { OnboardingService } from "./services/onboarding-service.js";

// ------------------------------------------------------------
// Caminhos (relativos à raiz do projeto)
// ------------------------------------------------------------
const ROTAS = {
  LOGIN: "/index.html",
  ONBOARDING: "/onboarding.html",
  INTRANET: "/intranet.html",
};

// ------------------------------------------------------------
// Detecta se estamos JÁ em uma rota específica
// (usado para evitar loop de redirecionamento)
// ------------------------------------------------------------
function estamosEm(rota) {
  const path = window.location.pathname;
  // Normaliza: /onboarding.html ou /onboarding/ caem no mesmo
  return path === rota || path.endsWith(rota);
}

// ------------------------------------------------------------
// Redireciona somente se ainda não estivermos na rota destino
// ------------------------------------------------------------
function redirecionarPara(rota) {
  if (estamosEm(rota)) return false;
  window.location.href = rota;
  return true;
}

// ------------------------------------------------------------
// Guard principal
// ------------------------------------------------------------
export const AuthGuard = {
  /**
   * Protege a rota atual.
   *
   * @param {Object} opcoes
   * @param {boolean} [opcoes.permitirOnboarding=false]
   *   Se `true`, permite que a página atual seja a `/onboarding.html`
   *   sem redirecionar (usado pela própria tela de onboarding).
   *
   * @param {boolean} [opcoes.registrarAcesso=true]
   *   Se `true`, atualiza `ultimo_acesso` no banco.
   *
   * @returns {Promise<{
   *   ok: boolean,
   *   usuario?: Object,
   *   precisaOnboarding?: boolean,
   *   redirect?: string
   * }>}
   *
   *   ok = false  →  o guard já redirecionou, não prossiga
   *   ok = true   →  pode prosseguir com a página
   */
  async protegerRota(opcoes = {}) {
    const { permitirOnboarding = false, registrarAcesso = true } = opcoes;

    try {
      // ------------------------------------------------------
      // 1) Tem sessão ativa?
      // ------------------------------------------------------
      const {
        data: { session },
        error: sessaoError,
      } = await supabase.auth.getSession();

      if (sessaoError || !session) {
        redirecionarPara(ROTAS.LOGIN);
        return { ok: false };
      }

      // ------------------------------------------------------
      // 2) Tem perfil em public.usuarios?
      // ------------------------------------------------------
      const { data: perfil, error: perfilError } = await supabase
        .from("usuarios")
        .select(
          `
          id, uuid, nome, email, perfil, ativo,
          primeiro_acesso, perfil_completo,
          orgao_id
        `,
        )
        .eq("uuid", session.user.id)
        .maybeSingle();

      if (perfilError) {
        console.error("[AuthGuard] Erro ao buscar perfil:", perfilError);
        // Não desloga — pode ser erro transitório de rede
        return { ok: false };
      }

      if (!perfil) {
        // Usuário autenticado no auth.users mas sem perfil em public.usuarios
        // (usuário órfão). Desloga e volta pro login.
        console.warn("[AuthGuard] Usuário órfão detectado. Deslogando...");
        await supabase.auth.signOut();
        redirecionarPara(ROTAS.LOGIN);
        return { ok: false };
      }

      // ------------------------------------------------------
      // 3) Está ativo?
      // ------------------------------------------------------
      if (perfil.ativo === false) {
        console.warn("[AuthGuard] Usuário inativo. Deslogando...");
        await supabase.auth.signOut();
        redirecionarPara(ROTAS.LOGIN);
        return { ok: false };
      }

      // ------------------------------------------------------
      // 4) Está pendente de onboarding?
      // Perfil incompleto, nulo ou legado deve sempre passar pelo onboarding.
      // ------------------------------------------------------
      const precisaOnboarding =
        perfil.primeiro_acesso === true || perfil.perfil_completo !== true;

      // Se precisa onboarding E não estamos permitindo onboarding aqui,
      // redireciona para a tela de onboarding
      if (precisaOnboarding && !permitirOnboarding) {
        redirecionarPara(ROTAS.ONBOARDING);
        return {
          ok: false,
          usuario: perfil,
          precisaOnboarding: true,
          redirect: ROTAS.ONBOARDING,
        };
      }

      // Se NÃO precisa onboarding MAS estamos na tela de onboarding,
      // manda para a intranet (evita ficar preso)
      if (!precisaOnboarding && permitirOnboarding) {
        // Deixa a página de onboarding decidir (não força redirect aqui)
        // Só sinaliza via precisaOnboarding = false
      }

      // ------------------------------------------------------
      // 5) Registra último acesso (silencioso)
      // ------------------------------------------------------
      if (registrarAcesso) {
        // Não bloqueia o fluxo — fire and forget
        OnboardingService.registrarUltimoAcesso().catch((err) => {
          console.warn("[AuthGuard] Não foi possível registrar acesso:", err);
        });
      }

      // ------------------------------------------------------
      // 6) Tudo OK — retorna o usuário
      // ------------------------------------------------------
      return {
        ok: true,
        usuario: perfil,
        precisaOnboarding,
      };
    } catch (error) {
      console.error("[AuthGuard] Erro inesperado:", error);
      redirecionarPara(ROTAS.LOGIN);
      return { ok: false };
    }
  },

  /**
   * Atalho: apenas checa se o usuário está logado
   * (não verifica onboarding). Útil para páginas públicas
   * que querem mudar o conteúdo conforme logado/deslogado.
   *
   * @returns {Promise<{logado: boolean, usuario?: Object}>}
   */
  async verificarSessao() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return { logado: false };

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("id, uuid, nome, email, perfil, ativo")
        .eq("uuid", session.user.id)
        .maybeSingle();

      if (!perfil || perfil.ativo === false) return { logado: false };

      return { logado: true, usuario: perfil };
    } catch {
      return { logado: false };
    }
  },

  /**
   * Faz logout completo e volta para o login.
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = ROTAS.LOGIN;
    }
  },

  /**
   * Exposição das rotas para quem precisar.
   */
  ROTAS,
};

export default AuthGuard;
