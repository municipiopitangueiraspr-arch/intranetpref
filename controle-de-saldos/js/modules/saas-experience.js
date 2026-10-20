import { supabase } from "../supabase.js";

export class SaaSExperience {
  constructor(sistema) {
    this.sistema = sistema;
    this.notificacoes = [];
    this.configuracao = null;
  }

  async init() {
    this.injectStyles();
    this.injectToolbar();
    await Promise.all([this.carregarNotificacoes(), this.carregarConfiguracao()]);
    if (this.sistema.usuarioAtual?.perfil === "ADMIN" && !this.configuracao?.concluida) this.mostrarOnboarding();
  }

  injectToolbar() {
    const direita = document.querySelector("#moduleNotificationHost");
    if (!direita || document.getElementById("saasNotificationButton")) return;
    const wrap = document.createElement("div");
    wrap.className = "saas-notification-wrap";
    wrap.innerHTML = `<button type="button" id="saasNotificationButton" class="saas-notification-button" aria-label="Notificações" aria-expanded="false"><i class="fas fa-bell"></i><span id="saasNotificationBadge" class="saas-notification-badge" hidden>0</span></button><div id="saasNotificationPanel" class="saas-notification-panel" hidden><div class="saas-notification-head"><strong>Central de pendências</strong><button type="button" id="saasNotificationReadAll">Marcar lidas</button></div><div id="saasNotificationList" class="saas-notification-list"><div class="saas-empty">Carregando...</div></div></div>`;
    direita.insertBefore(wrap, direita.firstChild);
    wrap.querySelector("#saasNotificationButton").addEventListener("click", () => {
      const panel = wrap.querySelector("#saasNotificationPanel");
      panel.hidden = !panel.hidden;
      wrap.querySelector("#saasNotificationButton").setAttribute("aria-expanded", String(!panel.hidden));
    });
    wrap.querySelector("#saasNotificationReadAll").addEventListener("click", () => this.marcarTodasLidas());
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) { wrap.querySelector("#saasNotificationPanel").hidden = true; } });
  }

  async carregarNotificacoes() {
    const { data, error } = await supabase.rpc("compras_listar_notificacoes", { p_apenas_nao_lidas: false });
    if (error) { console.warn("[SaaS] notificações:", error.message); return; }
    this.notificacoes = data || [];
    const naoLidas = this.notificacoes.filter((n) => !n.lida_em).length;
    const badge = document.getElementById("saasNotificationBadge");
    if (badge) { badge.textContent = naoLidas > 99 ? "99+" : String(naoLidas); badge.hidden = naoLidas === 0; }
    const lista = document.getElementById("saasNotificationList");
    if (!lista) return;
    lista.innerHTML = this.notificacoes.length ? this.notificacoes.map((n) => `<button type="button" class="saas-notification-item ${n.lida_em ? "" : "nao-lida"}" data-notificacao-id="${this.escape(n.id)}"><span class="saas-notification-icon"><i class="fas ${n.prioridade === "alta" || n.prioridade === "critica" ? "fa-triangle-exclamation" : "fa-circle-info"}"></i></span><span><strong>${this.escape(n.titulo || "Notificação")}</strong><small>${this.escape(n.mensagem || "")}</small><em>${this.formatDate(n.created_at)}</em></span></button>`).join("") : '<div class="saas-empty"><i class="fas fa-check-circle"></i><br>Nenhuma pendência no momento.</div>';
    lista.querySelectorAll("[data-notificacao-id]").forEach((item) => item.addEventListener("click", () => this.marcarLida(item.dataset.notificacaoId)));
  }

  async marcarLida(id) { await supabase.rpc("compras_marcar_notificacao_lida", { p_id: id }); await this.carregarNotificacoes(); }
  async marcarTodasLidas() { await Promise.all(this.notificacoes.filter((n) => !n.lida_em).map((n) => supabase.rpc("compras_marcar_notificacao_lida", { p_id: n.id }))); await this.carregarNotificacoes(); }

  async carregarConfiguracao() {
    const { data, error } = await supabase.rpc("compras_obter_configuracao_municipio");
    if (!error) this.configuracao = data;
  }

  mostrarOnboarding() {
    if (document.getElementById("saasOnboardingModal")) return;
    const c = this.configuracao?.configuracao || {};
    const modal = document.createElement("div");
    modal.id = "saasOnboardingModal"; modal.className = "saas-onboarding-overlay";
    modal.innerHTML = `<section class="saas-onboarding-card" role="dialog" aria-modal="true"><div class="saas-onboarding-header"><div><span class="saas-eyebrow">Primeira configuração</span><h2>Prepare o módulo para operar</h2><p>Complete estas informações para liberar uma experiência padronizada para o Município.</p></div><button type="button" id="saasOnboardingClose" class="saas-close" aria-label="Fechar">×</button></div><div class="saas-progress"><span></span></div><div class="saas-onboarding-grid"><label>Nome do Município<input id="saasCfgMunicipio" value="${this.escape(c.municipio || "")}" placeholder="Prefeitura Municipal de ..."></label><label>Órgão gestor padrão<input id="saasCfgOrgao" value="${this.escape(c.orgao_gestor || "")}" placeholder="Secretaria responsável"></label><label>Prazo de aprovação (dias)<input id="saasCfgPrazo" type="number" min="1" max="90" value="${Number(c.prazo_aprovacao_dias || 5)}"></label><label>Expiração de reserva (dias)<input id="saasCfgReserva" type="number" min="1" max="90" value="${Number(c.expiracao_reserva_dias || 7)}"></label><label class="wide">Canal de suporte<input id="saasCfgSuporte" value="${this.escape(c.suporte || "")}" placeholder="e-mail ou sistema de chamados"></label></div><div class="saas-onboarding-checks"><span><i class="fas fa-shield-halved"></i> Isolamento por Município</span><span><i class="fas fa-clock-rotate-left"></i> Auditoria habilitada</span><span><i class="fas fa-lock"></i> Documentos privados</span></div><div class="saas-onboarding-actions"><button type="button" class="btn btn-outline" id="saasOnboardingLater">Fazer depois</button><button type="button" class="btn btn-primary" id="saasOnboardingSave"><i class="fas fa-check"></i> Salvar configuração</button></div></section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector("#saasOnboardingClose").onclick = close; modal.querySelector("#saasOnboardingLater").onclick = close;
    modal.querySelector("#saasOnboardingSave").onclick = async () => {
      const config = { municipio: modal.querySelector("#saasCfgMunicipio").value.trim(), orgao_gestor: modal.querySelector("#saasCfgOrgao").value.trim(), prazo_aprovacao_dias: Number(modal.querySelector("#saasCfgPrazo").value), expiracao_reserva_dias: Number(modal.querySelector("#saasCfgReserva").value), suporte: modal.querySelector("#saasCfgSuporte").value.trim() };
      if (!config.municipio || !config.orgao_gestor) { this.toast("Informe o Município e o órgão gestor.", "aviso"); return; }
      const button = modal.querySelector("#saasOnboardingSave"); button.disabled = true;
      const { data, error } = await supabase.rpc("compras_salvar_configuracao_municipio", { p_configuracao: config, p_concluida: true });
      button.disabled = false;
      if (error) { this.toast(error.message, "erro"); return; }
      this.configuracao = data; close(); this.toast("Configuração inicial concluída.", "sucesso");
    };
  }

  async uploadDocumento({ entidade, entidadeId, arquivo }) {
    if (!arquivo || !this.configuracao?.municipio_id) return null;
    if (arquivo.size > 25 * 1024 * 1024) throw new Error("O arquivo excede o limite de 25 MB.");
    const safe = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${this.configuracao.municipio_id}/${entidade}/${entidadeId}/${crypto.randomUUID()}-${safe}`;
    const { error: uploadError } = await supabase.storage.from("compras-documentos").upload(path, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.rpc("compras_registrar_documento", { p_entidade: entidade, p_entidade_id: String(entidadeId), p_nome_arquivo: arquivo.name, p_storage_path: path, p_mime_type: arquivo.type || "application/octet-stream", p_tamanho_bytes: arquivo.size });
    if (error) throw error;
    return data;
  }

  toast(message, type = "info") { this.sistema?.ui?.mostrarToast(type, type === "erro" ? "Não foi possível concluir" : "SaaS", message); }
  escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
  formatDate(value) { return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""; }
  injectStyles() { /* CSS migrated to shared/css/intranet-global.css */ }
}
