import { supabase } from "../shared/js/supabase.js";

const STORAGE_BUCKET = "biblioteca-documentos";
const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
]);
const MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
};
const DOCUMENT_ENTITIES = new Set(["LIVRO", "EXEMPLAR", "EMPRESTIMO", "LEITOR", "INVENTARIO"]);

export async function initBibliotecaMunicipal() {
  if (window.__bibliotecaMunicipalInicializado) {
    return window.bibliotecaMunicipal?.usuario ?? null;
  }
  window.__bibliotecaMunicipalInicializado = true;
  injectStyles();

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData?.session;
    if (!session) return null;

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id,nome,email,perfil,ativo")
      .eq("uuid", session.user.id)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    if (!usuario || usuario.ativo === false) return null;

    window.bibliotecaMunicipal = { supabase, usuario, uploadDocumento };
    try {
      await renderNotificationCenter();
    } catch (error) {
      console.warn("[biblioteca] Notificações indisponíveis:", error);
    }
    return usuario;
  } catch (error) {
    console.warn("[biblioteca] Não foi possível inicializar os serviços:", error);
    return null;
  }
}

async function renderNotificationCenter() {
  const actions = document.querySelector(".topbar-direita");
  if (!actions || document.getElementById("bibSaasBell")) return;

  const wrap = document.createElement("div");
  wrap.className = "bib-saas-notification-wrap";
  wrap.innerHTML = `
    <button id="bibSaasBell" class="bib-saas-bell" type="button" aria-label="Pendências da biblioteca" aria-expanded="false">
      <i class="fas fa-bell" aria-hidden="true"></i><span id="bibSaasBadge" hidden>0</span>
    </button>
    <div id="bibSaasPanel" class="bib-saas-panel" hidden>
      <div class="bib-saas-panel-head">
        <strong>Pendências da Biblioteca</strong>
        <button id="bibSaasReadAll" type="button">Marcar lidas</button>
      </div>
      <div id="bibSaasNotifications" class="bib-saas-notifications">
        <div class="bib-saas-empty">Carregando...</div>
      </div>
    </div>`;
  actions.insertBefore(wrap, actions.firstChild);

  const bell = wrap.querySelector("#bibSaasBell");
  const panel = wrap.querySelector("#bibSaasPanel");
  bell.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    bell.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target)) {
      panel.hidden = true;
      bell.setAttribute("aria-expanded", "false");
    }
  });

  await loadNotifications();
  wrap.querySelector("#bibSaasReadAll").addEventListener("click", async () => {
    try {
      const { data, error } = await supabase.rpc("bib_listar_notificacoes", {
        p_apenas_nao_lidas: true,
      });
      if (error) throw error;
      const pending = data || [];
      const results = await Promise.all(
        pending.map((item) =>
          supabase.rpc("bib_marcar_notificacao_lida", { p_id: item.id }),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;
      await loadNotifications();
    } catch (error) {
      console.warn("[biblioteca] Não foi possível marcar as notificações como lidas:", error);
    }
  });
}

async function loadNotifications() {
  const { data, error } = await supabase.rpc("bib_listar_notificacoes", {
    p_apenas_nao_lidas: false,
  });
  if (error) throw error;

  const list = data || [];
  const unread = list.filter((item) => !item.lida_em).length;
  const badge = document.getElementById("bibSaasBadge");
  if (badge) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread === 0;
  }

  const out = document.getElementById("bibSaasNotifications");
  if (!out) return;
  out.innerHTML = list.length
    ? list
        .map(
          (item) => `
            <button type="button" class="bib-saas-notification ${item.lida_em ? "" : "unread"}" data-id="${esc(item.id)}">
              <i class="fas ${item.prioridade === "critica" || item.prioridade === "alta" ? "fa-triangle-exclamation" : "fa-circle-info"}" aria-hidden="true"></i>
              <span><strong>${esc(item.titulo)}</strong><small>${esc(item.mensagem)}</small><em>${item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : ""}</em></span>
            </button>`,
        )
        .join("")
    : '<div class="bib-saas-empty"><i class="fas fa-check-circle" aria-hidden="true"></i><br>Nenhuma pendência no momento.</div>';

  out.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const { error: markError } = await supabase.rpc("bib_marcar_notificacao_lida", {
          p_id: button.dataset.id,
        });
        if (markError) throw markError;
        await loadNotifications();
      } catch (error) {
        console.warn("[biblioteca] Não foi possível atualizar a notificação:", error);
      }
    });
  });
}

/**
 * Envia um documento para o bucket municipal e registra seus metadados.
 * O caminho não contém tenant: entidade/id/uuid-nome-arquivo.
 * Requer que a RPC e as políticas de Storage do banco usem o mesmo contrato.
 */
export async function uploadDocumento({ entidade, entidadeId, arquivo }) {
  if (!arquivo || typeof arquivo.size !== "number" || typeof arquivo.name !== "string") {
    throw new Error("Selecione um arquivo válido.");
  }
  if (arquivo.size <= 0 || arquivo.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error("O arquivo deve ter conteúdo e não pode exceder 25 MB.");
  }

  const entity = String(entidade || "").trim().toUpperCase();
  if (!DOCUMENT_ENTITIES.has(entity)) {
    throw new Error("Tipo de entidade inválido para anexar documento.");
  }

  const rawEntityId = String(entidadeId ?? "").trim();
  const entityIdSegment = storageSegment(rawEntityId, "Identificador da entidade");
  const originalName = arquivo.name.trim();
  if (!originalName) throw new Error("O arquivo precisa ter um nome válido.");
  const extension = originalName.includes(".") ? originalName.split(".").pop().toLowerCase() : "";
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error("Tipo de arquivo não permitido. Envie PDF, PNG, JPG, WEBP, DOC, DOCX ou ODT.");
  const reportedMime = String(arquivo.type || "").toLowerCase();
  if (reportedMime && reportedMime !== "application/octet-stream" && reportedMime !== mimeType) {
    throw new Error("A extensão do arquivo não corresponde ao tipo informado pelo navegador.");
  }
  if (!ALLOWED_DOCUMENT_MIMES.has(mimeType)) throw new Error("Tipo MIME não permitido para documentos da Biblioteca.");
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+$/, "arquivo");
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error("Este navegador não oferece geração segura de identificadores para upload.");

  const path = `${entity.toLowerCase()}/${entityIdSegment}/${uuid}-${safeName}`;
  const bucket = supabase.storage.from(STORAGE_BUCKET);
  const { data: uploaded, error: uploadError } = await bucket.upload(path, arquivo, {
    contentType: mimeType,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const storagePath = uploaded?.path || path;
  try {
    const { data, error } = await supabase.rpc("bib_registrar_documento", {
      p_entidade: entity,
      p_entidade_id: rawEntityId,
      p_nome_arquivo: originalName,
      p_storage_path: storagePath,
      p_mime_type: mimeType,
      p_tamanho_bytes: arquivo.size,
    });
    if (error) throw error;
    if (data == null) throw new Error("O banco não confirmou o registro dos metadados do documento.");
    return data;
  } catch (error) {
    const { error: cleanupError } = await bucket.remove([storagePath]);
    if (cleanupError) {
      console.error("[biblioteca] Não foi possível remover o upload sem metadados:", cleanupError);
    }
    throw error;
  }
}

function storageSegment(value, label) {
  if (!value || value === "." || value === ".." || /[\\/]/.test(value)) {
    throw new Error(`${label} inválido.`);
  }
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!safe || safe === "." || safe === "..") throw new Error(`${label} inválido.`);
  return safe;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function injectStyles() {
  // A identidade visual é carregada pelo CSS compartilhado da Intranet.
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initBibliotecaMunicipal(), { once: true });
} else {
  void initBibliotecaMunicipal();
}
