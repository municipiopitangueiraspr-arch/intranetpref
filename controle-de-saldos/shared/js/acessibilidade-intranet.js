/*
 * ACESSIBILIDADE COMPARTILHADA · INTRANET PITANGUEIRAS
 * Compatível com shells novos e telas legadas.
 */
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const firstHeading = (el) => el?.querySelector("h1,h2,h3,h4,[role=heading]");

  function ensureSkipLink() {
    if (document.querySelector(".a11y-skip-link")) return;
    const main = document.querySelector("main, [role=main], #main, .main-area, .conteudo, .page-content");
    if (!main) return;
    if (!main.id) main.id = "conteudo-principal";
    const link = document.createElement("a");
    link.className = "a11y-skip-link";
    link.href = `#${main.id}`;
    link.textContent = "Ir para o conteúdo principal";
    document.body.prepend(link);
  }

  function labelElement(el, fallback = "Controle") {
    if (!el || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return;
    const label = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    const text = label?.textContent?.replace(/[*:\n]+/g, " ").replace(/\s+/g, " ").trim();
    const hint = el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || fallback;
    if (text && text.length < 100) el.setAttribute("aria-label", text);
    else if (hint) el.setAttribute("aria-label", hint.replace(/[_-]+/g, " "));
  }

  function enhanceControls(root = document) {
    root.querySelectorAll?.("input,select,textarea").forEach((el) => {
      if (el.type === "hidden") return;
      labelElement(el, el.tagName === "SELECT" ? "Selecione uma opção" : "Campo de formulário");
    });
    root.querySelectorAll?.("img").forEach((img) => {
      if (!img.hasAttribute("alt")) img.alt = /brasao|logo|marca/i.test(img.src) ? "Brasão da Prefeitura Municipal de Pitangueiras" : "";
    });
    root.querySelectorAll?.("table").forEach((table) => {
      if (!table.hasAttribute("aria-label") && !table.hasAttribute("aria-labelledby")) table.setAttribute("aria-label", "Tabela de dados");
    });
  }

  function titleDialog(el) {
    if (el.hasAttribute("aria-labelledby") || el.hasAttribute("aria-label")) return;
    const heading = firstHeading(el);
    if (heading) {
      if (!heading.id) heading.id = `a11y-dialog-title-${Math.random().toString(36).slice(2, 9)}`;
      el.setAttribute("aria-labelledby", heading.id);
    } else el.setAttribute("aria-label", "Janela de diálogo");
  }

  function enhanceDialogs(root = document) {
    root.querySelectorAll?.("dialog").forEach((dialog) => {
      dialog.setAttribute("aria-modal", "true");
      titleDialog(dialog);
    });
    root.querySelectorAll?.(".modal-overlay,.modal-backdrop,.drawer-overlay").forEach((overlay) => {
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      titleDialog(overlay.querySelector(".modal,.modal-content,.modal-dialog,.drawer") || overlay);
    });
    root.querySelectorAll?.("[data-dismiss],.modal-close,.drawer-close,.btn-fechar,.notification-close").forEach((button) => {
      if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", "Fechar janela");
    });
  }

  function enhanceSidebar() {
    const sidebar = byId("sidebar") || document.querySelector(".sidebar,.admin-sidebar,.shared-admin-sidebar,.system-sidebar");
    const toggle = byId("btnToggleSidebar") || document.querySelector(".btn-toggle-sidebar,[data-toggle-sidebar]");
    if (!sidebar || !toggle || toggle.dataset.a11yBound || toggle.dataset.layoutBound) return;
    if (!sidebar.id) sidebar.id = "sidebar";
    toggle.dataset.a11yBound = "true";
    toggle.setAttribute("aria-controls", sidebar.id);
    toggle.setAttribute("aria-expanded", "false");
    const backdrop = document.createElement("div");
    backdrop.className = "a11y-menu-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.append(backdrop);
    const close = () => {
      sidebar.classList.remove("is-open", "aberta", "open", "visible");
      sidebar.id === "sidebar" && sidebar.classList.remove("a11y-open");
      toggle.setAttribute("aria-expanded", "false");
      backdrop.classList.remove("is-visible");
      toggle.focus({ preventScroll: true });
    };
    const open = () => {
      sidebar.classList.add("a11y-open");
      toggle.setAttribute("aria-expanded", "true");
      backdrop.classList.add("is-visible");
      const focusTarget = sidebar.querySelector("a,button,[tabindex]:not([tabindex='-1'])");
      focusTarget?.focus({ preventScroll: true });
    };
    toggle.addEventListener("click", () => toggle.getAttribute("aria-expanded") === "true" ? close() : open());
    backdrop.addEventListener("click", close);
    sidebar.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => { if (matchMedia("(max-width: 900px)").matches) close(); }));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") close(); });
  }

  function enhanceMenus() {
    document.querySelectorAll("[aria-haspopup='menu'],.avatar-btn").forEach((button) => {
      const menuId = button.getAttribute("aria-controls");
      const menu = (menuId && byId(menuId)) || button.parentElement?.querySelector("[role='menu'],.avatar-menu");
      if (!menu || button.dataset.a11yMenuBound) return;
      if (!menu.id) menu.id = `a11y-menu-${Math.random().toString(36).slice(2, 9)}`;
      button.dataset.a11yMenuBound = "true";
      button.setAttribute("aria-controls", menu.id);
      button.setAttribute("aria-expanded", button.getAttribute("aria-expanded") || "false");
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        menu.toggleAttribute("hidden", expanded);
      });
      menu.querySelectorAll("[role='menuitem'],a,button").forEach((item) => item.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { button.setAttribute("aria-expanded", "false"); menu.hidden = true; button.focus(); }
      }));
    });
  }

  function enhanceAll(root = document) {
    ensureSkipLink();
    enhanceControls(root);
    enhanceDialogs(root);
    enhanceSidebar();
    enhanceMenus();
  }

  function init() {
    if (!document.documentElement.lang) document.documentElement.lang = "pt-BR";
    enhanceAll();
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => node.nodeType === 1 && enhanceAll(node))));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
