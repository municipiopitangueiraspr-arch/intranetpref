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
    const direita = document.querySelector(".topbar-direita");
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
    const { data, error } = await supabase.rpc("compras_obter_configuracao_tenant");
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
      const { data, error } = await supabase.rpc("compras_salvar_configuracao_tenant", { p_configuracao: config, p_concluida: true });
      button.disabled = false;
      if (error) { this.toast(error.message, "erro"); return; }
      this.configuracao = data; close(); this.toast("Configuração inicial concluída.", "sucesso");
    };
  }

  async uploadDocumento({ entidade, entidadeId, arquivo }) {
    if (!arquivo || !this.configuracao?.tenant_id) return null;
    if (arquivo.size > 25 * 1024 * 1024) throw new Error("O arquivo excede o limite de 25 MB.");
    const safe = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${this.configuracao.tenant_id}/${entidade}/${entidadeId}/${crypto.randomUUID()}-${safe}`;
    const { error: uploadError } = await supabase.storage.from("compras-documentos").upload(path, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.rpc("compras_registrar_documento", { p_entidade: entidade, p_entidade_id: String(entidadeId), p_nome_arquivo: arquivo.name, p_storage_path: path, p_mime_type: arquivo.type || "application/octet-stream", p_tamanho_bytes: arquivo.size });
    if (error) throw error;
    return data;
  }

  toast(message, type = "info") { this.sistema?.ui?.mostrarToast(type, type === "erro" ? "Não foi possível concluir" : "SaaS", message); }
  escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
  formatDate(value) { return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""; }
  injectStyles() { if (document.getElementById("saasExperienceStyles")) return; const style = document.createElement("style"); style.id = "saasExperienceStyles"; style.textContent = `.saas-notification-wrap{position:relative;margin-right:14px}.saas-notification-button{position:relative;border:0;background:transparent;color:var(--neutral-600,#475569);font-size:1.1rem;padding:9px;cursor:pointer}.saas-notification-button:hover{color:var(--primary-700,#1d4ed8)}.saas-notification-badge{position:absolute;top:1px;right:0;min-width:17px;height:17px;border-radius:99px;background:#dc2626;color:#fff;font:700 .65rem/17px sans-serif;text-align:center}.saas-notification-panel{position:absolute;right:0;top:43px;width:min(370px,calc(100vw - 28px));background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 18px 50px #0f172a2b;z-index:1000;overflow:hidden}.saas-notification-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #e2e8f0}.saas-notification-head button{border:0;background:none;color:#2563eb;font-size:.72rem;cursor:pointer}.saas-notification-list{max-height:390px;overflow:auto}.saas-notification-item{display:flex;gap:10px;width:100%;text-align:left;border:0;border-bottom:1px solid #f1f5f9;background:#fff;padding:12px 14px;cursor:pointer}.saas-notification-item:hover,.saas-notification-item.nao-lida{background:#eff6ff}.saas-notification-item strong,.saas-notification-item small,.saas-notification-item em{display:block}.saas-notification-item strong{font-size:.82rem;color:#0f172a}.saas-notification-item small{font-size:.74rem;color:#475569;margin-top:3px}.saas-notification-item em{font-size:.68rem;color:#94a3b8;margin-top:4px;font-style:normal}.saas-notification-icon{color:#2563eb}.saas-empty{text-align:center;padding:28px 18px;color:#64748b;font-size:.82rem}.saas-onboarding-overlay{position:fixed;inset:0;background:#0f172a80;z-index:2000;display:grid;place-items:center;padding:18px}.saas-onboarding-card{width:min(760px,100%);background:#fff;border-radius:18px;box-shadow:0 24px 70px #0f172a55;overflow:hidden}.saas-onboarding-header{display:flex;justify-content:space-between;gap:20px;padding:28px 30px 20px;background:linear-gradient(135deg,#eff6ff,#f8fafc)}.saas-eyebrow{color:#2563eb;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.saas-onboarding-header h2{margin:6px 0;font-size:1.5rem;color:#0f172a}.saas-onboarding-header p{margin:0;color:#475569}.saas-close{border:0;background:none;font-size:1.6rem;color:#64748b;cursor:pointer}.saas-progress{height:4px;background:#e2e8f0}.saas-progress span{display:block;width:78%;height:100%;background:#2563eb}.saas-onboarding-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px 30px}.saas-onboarding-grid label{font-size:.78rem;font-weight:700;color:#334155}.saas-onboarding-grid label.wide{grid-column:1/-1}.saas-onboarding-grid input{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-weight:400}.saas-onboarding-checks{display:flex;flex-wrap:wrap;gap:8px;padding:0 30px 22px}.saas-onboarding-checks span{font-size:.72rem;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:99px;padding:7px 10px}.saas-onboarding-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 30px;background:#f8fafc}@media(max-width:600px){.saas-onboarding-grid{grid-template-columns:1fr;padding:20px}.saas-onboarding-grid label.wide{grid-column:auto}.saas-onboarding-header,.saas-onboarding-actions,.saas-onboarding-checks{padding-left:20px;padding-right:20px}}`; document.head.appendChild(style); }
}
