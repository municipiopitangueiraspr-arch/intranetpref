// ============================================================
// controle-de-saldos/js/modules/faq.js
// Manual FAQ interativo para secretários
// ------------------------------------------------------------
// O manual é uma página HTML autocontida, carregada em iframe
// para preservar seu CSS, seus efeitos e sua navegação mobile-first
// sem interferir no design system do SPA principal.
// ============================================================

export class FAQ {
  constructor(sistema) {
    this.sistema = sistema;
    this._carregado = false;
  }

  async carregarConteudo() {
    const container = document.getElementById("faqContent");
    if (!container) {
      console.warn("[FAQ] #faqContent não encontrado.");
      return;
    }

    if (this._carregado) return;

    container.innerHTML = `
      <section class="faq-view-shell" aria-label="Manual FAQ">
        <iframe
          title="Manual FAQ de Gestão de Atas"
          src="templates/faq.html"
          loading="eager"
          style="display:block;width:100%;min-height:calc(100vh - 132px);height:calc(100vh - 132px);border:0;border-radius:12px;background:#f3f4f6;"
        ></iframe>
      </section>
    `;

    this._carregado = true;
  }
}
