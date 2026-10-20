/* Reutiliza literalmente a barra de usuário do hall da Intranet nos módulos. */
(() => {
  const body = document.body;
  if (!body || body.dataset.hallHeaderReady === "true") return;
  body.dataset.hallHeaderReady = "true";

  // O Hall e os módulos compartilham este mesmo fragmento e as mesmas classes
  // estilizadas por shared/css/identity-header.css.
  if (!document.querySelector(".barra-usuario")) {
    const header = `
      <div class="barra-usuario">
        <div class="saudacao-mini">
          <span>Logado como</span>
          <strong id="saudacaoMiniNome">—</strong>
        </div>
        <div class="avatar-wrapper">
          <button
            class="avatar-btn"
            id="avatarBtn"
            title="Menu do usuário"
            aria-haspopup="menu"
            aria-expanded="false"
            type="button">
            <span id="avatarIniciais">?</span>
          </button>
          <div class="avatar-menu" id="avatarMenu" role="menu" aria-hidden="true">
            <div class="avatar-menu-header">
              <span class="avatar-menu-kicker">Conta conectada</span>
              <strong id="menuNome">—</strong>
              <span class="avatar-menu-email" id="menuEmail">—</span>
            </div>
            <div class="avatar-menu-section-label">Ações da conta</div>
            <button
              class="avatar-menu-item avatar-menu-item--profile"
              id="menuMeuPerfil"
              type="button"
              role="menuitem">
              <span class="avatar-menu-item-icon"><i class="fas fa-user-circle"></i></span><span>Meu Perfil</span>
            </button>
            <section class="avatar-menu-quick" aria-labelledby="avatarQuickTitle">
              <h2 class="avatar-menu-quick-title" id="avatarQuickTitle">
                <i class="fas fa-bolt" aria-hidden="true"></i> Módulos autorizados
              </h2>
              <div
                class="avatar-menu-quick-list"
                id="avatarQuickModules"
                role="group"
                aria-label="Módulos disponíveis para esta conta">
                <p class="avatar-menu-quick-empty">Carregando módulos autorizados...</p>
              </div>
            </section>
            <button
              class="avatar-menu-item avatar-menu-item--logout sair"
              id="menuSair"
              type="button"
              role="menuitem">
              <span class="avatar-menu-item-icon"><i class="fas fa-sign-out-alt"></i></span><span>Sair</span>
            </button>
          </div>
        </div>
      </div>`;
    body.insertAdjacentHTML("afterbegin", header);
  }

  const root = body.dataset.shellRoot || "./";
  const moduleName = body.dataset.intranetModule || "";
  const avatarButton = document.getElementById("avatarBtn");
  const avatarMenu = document.getElementById("avatarMenu");
  const closeMenu = () => {
    avatarMenu?.classList.remove("aberto");
    avatarMenu?.setAttribute("aria-hidden", "true");
    avatarButton?.setAttribute("aria-expanded", "false");
  };

  // Os outros módulos têm estes handlers no próprio fluxo de autenticação;
  // Governança não usa layout.js, por isso recebe aqui os handlers do Hall.
  if (moduleName === "governanca") {
    avatarButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = avatarMenu?.getAttribute("aria-hidden") !== "false";
      avatarMenu?.classList.toggle("aberto", open);
      avatarMenu?.setAttribute("aria-hidden", String(!open));
      avatarButton?.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (event) => {
      if (!avatarMenu?.contains(event.target) && !avatarButton?.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
    const logout = document.getElementById("menuSair");
    logout?.addEventListener("click", async () => {
      try {
        const supabaseUrl = new URL(body.dataset.shellSupabase || `${root}shared/js/supabase.js`, document.baseURI).href;
        const { supabase } = await import(supabaseUrl);
        await supabase.auth.signOut();
      } catch (error) {
        console.error("[hall-header] Falha ao sair:", error);
      } finally {
        window.location.assign(new URL(`${root}index.html`, document.baseURI).href);
      }
    });
  }

  document.getElementById("menuMeuPerfil")?.addEventListener("click", () => {
    closeMenu();
    const profileUrl = new URL(`${root}perfil.html`, document.baseURI);
    if (moduleName !== "perfil") {
      profileUrl.searchParams.set("returnTo", `${window.location.pathname}${window.location.search}${window.location.hash}`);
    }
    window.location.assign(profileUrl.href);
  });

  // O cabeçalho global hidrata os dados da conta em telas que não dependem
  // do topbar antigo do layout, incluindo a Visão do Prefeito.
  if (moduleName === "perfil" || moduleName === "governanca" || moduleName === "visao-agregada") {
    void (async () => {
      try {
        const supabaseUrl = new URL(body.dataset.shellSupabase || `${root}shared/js/supabase.js`, document.baseURI).href;
        const layoutUrl = new URL(`${root}shared/js/layout.js?v=20261017-prefeito-no-brand-1`, document.baseURI).href;
        const [{ supabase }, layout] = await Promise.all([import(supabaseUrl), import(layoutUrl)]);
        const user = await layout.carregarUsuario(supabase);
        if (!user) return;
        const name = user.nome || user.email || "Usuário";
        const greeting = document.getElementById("saudacaoMiniNome");
        const menuName = document.getElementById("menuNome");
        const menuEmail = document.getElementById("menuEmail");
        const initials = document.getElementById("avatarIniciais");
        if (greeting) greeting.textContent = name;
        if (menuName) menuName.textContent = name;
        if (menuEmail) menuEmail.textContent = user.email || "—";
        if (initials && user.foto_url) {
          const image = document.createElement("img");
          image.className = "avatar-foto";
          image.src = user.foto_url;
          image.alt = `Foto de ${name}`;
          image.addEventListener("error", () => { image.remove(); initials.textContent = initialsFor(name); }, { once: true });
          initials.replaceChildren(image);
        } else if (initials) {
          initials.textContent = initialsFor(name);
        }
        await layout.carregarAtalhosModulos(supabase, user, {
          rotaIntranet: new URL(`${root}intranet.html`, document.baseURI).href,
        });
      } catch (error) {
        console.warn("[hall-header] Não foi possível preparar os dados do cabeçalho:", error);
      }
    })();
  }

  function initialsFor(name) {
    const words = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words.at(-1)[0] : (words[0] || "?").slice(0, 2)).toUpperCase();
  }
})();
