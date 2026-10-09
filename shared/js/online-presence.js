const PRESENCE_TOPIC = "intranet:servidores-online";

async function chaveAnonimaDoUsuario(userId) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("Web Crypto indisponível para criar a chave de presença.");
  }

  const bytes = new TextEncoder().encode(String(userId));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Conecta o usuário autenticado a um canal privado e informa a quantidade de
 * contas únicas atualmente presentes no hall. Nenhum dado pessoal é rastreado.
 * O retorno é o canal Supabase, para permitir removê-lo no logout.
 */
export async function conectarPresencaOnline(
  supabase,
  session,
  onCount,
  onUnavailable,
) {
  const informarIndisponivel = (error) => {
    try {
      onUnavailable?.(error || null);
    } catch (callbackError) {
      console.warn("[Intranet] Falha ao atualizar estado de presença:", callbackError);
    }
  };

  const informarContagem = (count) => {
    try {
      onCount?.(count);
    } catch (callbackError) {
      console.warn("[Intranet] Falha ao atualizar a contagem de presença:", callbackError);
    }
  };

  if (!session?.access_token || !session?.user?.id) {
    informarIndisponivel(new Error("Sessão autenticada não disponível."));
    return null;
  }

  try {
    await supabase.realtime.setAuth(session.access_token);
    const presenceKey = await chaveAnonimaDoUsuario(session.user.id);
    const channel = supabase.channel(PRESENCE_TOPIC, {
      config: {
        private: true,
        presence: { key: presenceKey },
      },
    });

    let rastreando = false;
    const atualizarContagem = () => {
      if (!rastreando) return;
      const state = channel.presenceState() || {};
      // A chave estável por usuário deduplica abas e dispositivos da mesma conta.
      informarContagem(Object.keys(state).length);
    };

    channel.on("presence", { event: "sync" }, atualizarContagem);
    channel.subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        try {
          const trackStatus = await channel.track({ online: true });
          if (trackStatus !== "ok") {
            rastreando = false;
            informarIndisponivel(
              new Error(`Não foi possível registrar presença (${trackStatus}).`),
            );
            return;
          }
          rastreando = true;
          atualizarContagem();
        } catch (trackError) {
          rastreando = false;
          informarIndisponivel(trackError);
        }
        return;
      }

      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        rastreando = false;
        informarIndisponivel(error || new Error(`Realtime: ${status}`));
      }
    });

    return channel;
  } catch (error) {
    informarIndisponivel(error);
    return null;
  }
}
