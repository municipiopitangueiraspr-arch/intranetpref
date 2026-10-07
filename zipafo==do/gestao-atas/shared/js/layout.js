/* =====================================================================
   INTRANET MUNICIPAL · PREF. PITANGUEIRAS
   shared/js/layout.js
   ---------------------------------------------------------------------
   Layout injetor compartilhado — sidebar + topbar.

   Este módulo padroniza o "esqueleto" visual de todas as páginas dos
   módulos (Biblioteca, Atas, Estoque, etc.) sem exigir que cada página
   replique sidebar e topbar manualmente.

   Uso básico:
   ----------------------------------------------------------------
   <div class="app-layout">
     <aside class="sidebar" id="sidebar"></aside>
     <div class="main-area">
       <header class="topbar" id="topbar"></header>
       <main class="conteudo">
         ... conteúdo específico da página ...
       </main>
     </div>
   </div>

   <script type="importmap">
   { "imports": { "@supabase/supabase-js":
     "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm" } }
   </script>

   <script type="module">
     import { createClient } from '@supabase/supabase-js';
     import { initLayout } from '../shared/js/layout.js';

     const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

     const usuario = await initLayout({
       supabase,
       brand: { nome: 'Biblioteca', subtitulo: 'Municipal',
                icone: 'fa-book-open-reader' },
       iconeTitulo: 'fa-book',
       titulo: 'Livros',
       subtitulo: 'Acervo bibliográfico da Biblioteca Municipal',
       moduloAtivo: 'livros',
       menu: [
         { section: 'Principal', itens: [
           { id: 'dashboard', rota: 'dashboard.html',
             icone: 'fa-gauge-high', label: 'Painel' },
         ]},
         { section: 'Acervo', itens: [
           { id: 'livros', rota: 'livros.html',
             icone: 'fa-book', label: 'Livros' },
           { id: 'exemplares', rota: 'exemplares.html',
             icone: 'fa-bookmark', label: 'Exemplares' },
         ]},
       ],
       rotaVoltar: '../intranet.html',
       textoVoltar: 'Voltar à intranet',
     });

     // A partir daqui, `usuario` está disponível para a página.
   </script>
   ----------------------------------------------------------------

   Configuração aceita (todas opcionais, exceto supabase):
     supabase         cliente Supabase já inicializado
     brand            { nome, subtitulo, icone }  — cabeçalho da sidebar
     iconeTitulo      ícone Font Awesome do título da topbar
     titulo           título principal da página (topbar)
     subtitulo        subtítulo da página (topbar)
     moduloAtivo      id do item do menu que deve receber .active
     menu             array de grupos: { section, itens: [ {id, rota, icone, label} ] }
                      ou itens diretos no formato { id, rota, icone, label }
     adminOnly        array de ids que só aparecem para ADMIN
     rotaVoltar       URL do link "Voltar" no rodapé da sidebar
     textoVoltar      texto do link "Voltar"
     rotaIntranet     URL para redirecionar quando não autenticado (padrão: '../intranet.html')
     rotaLogin        alias de rotaIntranet
     onLogout         callback async opcional chamado antes do logout
     onUsuario        callback opcional após carregar o usuário
     menuUsuario      opcional; quando informado, transforma o avatar em
                      dropdown com { rotaPerfil, rotaAjuda }

   Retorno:
     Promise<usuario|null>
     - usuario: { id, uuid, nome, email, perfil, ativo, orgao_id }
     - null: não autenticado (a página deve redirecionar sozinha se quiser
             controlar o fluxo; caso contrário o redirect já foi feito)
   ===================================================================== */

/* =====================================================================
   CONSTANTES PADRÃO
   ===================================================================== */
const DEFAULTS = {
  rotaIntranet: "../intranet.html",
  textoVoltar: "Voltar à intranet",
  brand: {
    nome: "Módulo",
    subtitulo: "",
    icone: "fa-cube",
  },
  iconeTitulo: "fa-cube",
  titulo: "Módulo",
  subtitulo: "",
};

/* =====================================================================
   initLayout · função principal
   =====================================================================
   Recebe a configuração, carrega o usuário autenticado, monta sidebar
   e topbar, configura eventos e devolve o usuário para a página.
   ===================================================================== */
export async function initLayout(config = {}) {
  // ---------- 1. Normaliza a configuração ----------
  const cfg = { ...DEFAULTS, ...config };
  cfg.brand = { ...DEFAULTS.brand, ...(config.brand || {}) };

  const supabase = cfg.supabase || window.supabase || null;
  if (!supabase) {
    console.error(
      "[layout] Cliente Supabase não informado. Passe via config.supabase " +
        "ou exponha em window.supabase antes de chamar initLayout().",
    );
    return null;
  }

  // ---------- 2. Localiza os containers no DOM ----------
  const sidebar = document.getElementById("sidebar");
  const topbar = document.getElementById("topbar");

  if (!sidebar || !topbar) {
    console.error(
      "[layout] Elementos #sidebar e/ou #topbar não encontrados. " +
        "Verifique se o HTML da página segue o padrão .app-layout.",
    );
    return null;
  }

  // ---------- 3. Carrega usuário autenticado ----------
  let usuario = null;
  try {
    usuario = await carregarUsuario(supabase);
  } catch (err) {
    console.error("[layout] Erro ao carregar usuário:", err);
  }

  // Não autenticado → redireciona
  if (!usuario) {
    const destino = cfg.rotaIntranet || cfg.rotaLogin || DEFAULTS.rotaIntranet;
    console.warn("[layout] Sessão inválida. Redirecionando para", destino);
    window.location.href = destino;
    return null;
  }

  // ---------- 4. Renderiza sidebar ----------
  try {
    sidebar.innerHTML = renderSidebar(cfg, usuario);
  } catch (err) {
    console.error("[layout] Erro ao renderizar sidebar:", err);
  }

  // ---------- 5. Renderiza topbar ----------
  try {
    topbar.innerHTML = renderTopbar(cfg, usuario);
  } catch (err) {
    console.error("[layout] Erro ao renderizar topbar:", err);
  }

  // ---------- 6. Marca o item ativo do menu ----------
  marcarItemAtivo(cfg.moduloAtivo || "");

  // ---------- 7. Configura o toggle mobile + backdrop ----------
  configurarToggleMobile(sidebar);

  // ---------- 8. Configura o menu do usuário e o botão sair ----------
  configurarMenuUsuario();
  configurarLogout(supabase, cfg);
  configurarRetornoModulo();

  // ---------- 9. Expõe o usuário globalmente (atalho de conveniência) ----------
  window.usuarioLogado = usuario;

  // ---------- 10. Callback opcional para a página ----------
  if (typeof cfg.onUsuario === "function") {
    try {
      cfg.onUsuario(usuario);
    } catch (err) {
      console.error("[layout] Erro em onUsuario:", err);
    }
  }

  // ---------- 11. Retorna usuário ----------
  return usuario;
}

/* =====================================================================
   carregarUsuario · busca sessão + perfil completo
   =====================================================================
   · Verifica se há sessão ativa no Supabase Auth
   · Busca dados complementares na tabela `usuarios`
   · Retorna null se sessão ausente, usuário inativo ou registro inexistente
   ===================================================================== */
export async function carregarUsuario(supabase) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: perfil, error } = await supabase
    .from("usuarios")
    .select("id, uuid, nome, email, perfil, ativo, orgao_id, foto_url")
    .eq("uuid", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("[layout] Erro ao buscar perfil:", error.message);
    return null;
  }

  if (!perfil) return null;
  if (perfil.ativo === false) return null;

  return perfil;
}

/* =====================================================================
   renderSidebar · HTML da sidebar
   =====================================================================
   Estrutura interna esperada pelo CSS:
     .sidebar-brand
     .sidebar-nav (com .nav-section e <a>)
     .sidebar-voltar
   ===================================================================== */
function renderSidebar(cfg, usuario) {
  const isAdmin = usuario?.perfil === "ADMIN";
  const adminOnlyIds = Array.isArray(cfg.adminOnly) ? cfg.adminOnly : [];

  // ---------- Cabeçalho (marca) ----------
  const brandHtml = `
    <div class="sidebar-brand">
      <div class="brand-icon" aria-label="Brasão do Município">
        <img class="brasao-municipio" src="../brasao-pref.png" alt="Brasão do Município" loading="eager" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <i class="fas ${escaparHtml(cfg.brand.icone)}" aria-hidden="true" style="display:none"></i>
      </div>
      <div class="brand-text">
        <h2>${escaparHtml(cfg.brand.nome)}</h2>
        ${
          cfg.brand.subtitulo
            ? `<span>${escaparHtml(cfg.brand.subtitulo)}</span>`
            : ""
        }
      </div>
    </div>
  `;

  // ---------- Navegação ----------
  const menu = Array.isArray(cfg.menu) ? cfg.menu : [];
  const menuHtml = menu
    .map((entrada) => {
      // Grupo com seção
      if (entrada && Array.isArray(entrada.itens)) {
        const itens = entrada.itens
          .filter((item) => item && item.rota && item.label)
          .filter((item) => {
            // Filtro de admin
            if (adminOnlyIds.includes(item.id) && !isAdmin) return false;
            return true;
          });

        if (itens.length === 0) return "";

        const itensHtml = itens.map((item) => renderItemMenu(item)).join("");

        return `
          <div class="nav-section" role="heading" aria-level="2">${escaparHtml(entrada.section || "")}</div>
          ${itensHtml}
        `;
      }

      // Item direto
      if (entrada && entrada.rota && entrada.label) {
        if (adminOnlyIds.includes(entrada.id) && !isAdmin) return "";
        return renderItemMenu(entrada);
      }

      return "";
    })
    .join("");

  const navHtml = `
    <nav class="sidebar-nav" aria-label="Navegação do módulo">
      ${menuHtml}
    </nav>
  `;

  // ---------- Rodapé (voltar à intranet) ----------
  const voltarHtml = cfg.rotaVoltar
    ? `
      <div class="sidebar-voltar">
        <a href="${escaparAtributo(cfg.rotaVoltar)}" data-voltar-modulo>
          <i class="fas fa-arrow-left"></i>
          ${escaparHtml(cfg.textoVoltar || DEFAULTS.textoVoltar)}
        </a>
      </div>
    `
    : "";

  return brandHtml + navHtml + voltarHtml;
}

/* =====================================================================
   renderItemMenu · <a> individual do menu
   ===================================================================== */
function renderItemMenu(item) {
  const icone = item.icone || "fa-cube";
  const label = escaparHtml(item.label);
  const rota = escaparAtributo(item.rota);
  const idMod = item.id ? ` data-modulo="${escaparAtributo(item.id)}"` : "";

  return `
    <a href="${rota}"${idMod} aria-label="${label}">
      <i class="fas ${escaparHtml(icone)}" aria-hidden="true"></i>
      <span class="menu-label">${label}</span>
    </a>
  `;
}

/* =====================================================================
   renderTopbar · HTML da topbar
   ===================================================================== */
function renderTopbar(cfg, usuario) {
  const iniciais = gerarIniciais(usuario.nome);
  const nome = escaparHtml(usuario.nome || "—");
  const fotoUrl = usuario.foto_url ? escaparAtributo(usuario.foto_url) : "";
  const email = escaparHtml(usuario.email || "—");
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const iconeTitulo = escaparHtml(cfg.iconeTitulo || DEFAULTS.iconeTitulo);
  const titulo = escaparHtml(cfg.titulo || DEFAULTS.titulo);
  const subtitulo = cfg.subtitulo ? `<p>${escaparHtml(cfg.subtitulo)}</p>` : "";
  const menuUsuario =
    cfg.menuUsuario && typeof cfg.menuUsuario === "object"
      ? cfg.menuUsuario
      : null;
  const avatarVisual = fotoUrl ? `<img class="avatar-foto" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" src="${fotoUrl}" alt="Foto de ${nome}" loading="lazy">` : `<span>${iniciais}</span>`;
  const retorno = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const perfilHref = `${menuUsuario?.rotaPerfil || "../perfil.html"}?returnTo=${encodeURIComponent(retorno)}`;

  const usuarioDireitaHtml = menuUsuario
    ? `
      <div class="avatar-wrapper">
        <button
          type="button"
          class="avatar-btn"
          id="avatarBtn"
          title="Menu do usuário"
          aria-haspopup="menu"
          aria-expanded="false"
        >
          ${avatarVisual}
        </button>
        <div class="avatar-menu" id="avatarMenu" role="menu">
          <div class="avatar-menu-header">
            <strong>${nome}</strong>
            <span>${email}</span>
          </div>
          <a
            href="${escaparAtributo(perfilHref)}"
            class="avatar-menu-item"
            role="menuitem"
          >
            <i class="fas fa-user-circle"></i> Meu Perfil
          </a>
          <a
            href="${escaparAtributo(menuUsuario.rotaAjuda || "#faq")}"
            class="avatar-menu-item"
            role="menuitem"
          >
            <i class="fas fa-circle-question"></i> Ajuda
          </a>
          <div class="avatar-menu-divisor"></div>
          <button
            type="button"
            class="avatar-menu-item sair"
            id="menuSair"
            role="menuitem"
          >
            <i class="fas fa-right-from-bracket"></i> Sair
          </button>
        </div>
      </div>
    `
    : `
      <div class="avatar-usuario" title="${nome}">${iniciais}</div>
      <button
        type="button"
        class="btn-sair"
        id="btnSair"
        title="Sair do módulo"
      >
        <i class="fas fa-right-from-bracket"></i>
        <span class="btn-sair-texto">Sair</span>
      </button>
    `;

  return `
    <div class="topbar-esquerda">
      <button
        type="button"
        class="btn-toggle-sidebar"
        id="btnToggleSidebar"
        title="Abrir menu"
        aria-label="Abrir menu"
      >
        <i class="fas fa-bars"></i>
      </button>
      <div class="topbar-titulo">
        <h1><i class="fas ${iconeTitulo}"></i> ${titulo}</h1>
        ${subtitulo}
      </div>
    </div>

    <div class="topbar-direita">
      <div class="topbar-info">
        <strong title="${nome}">${nome}</strong>
        <span>${dataHoje}</span>
      </div>
      ${usuarioDireitaHtml}
    </div>
  `;
}

/* =====================================================================
   marcarItemAtivo · aplica .active no item do menu correspondente
   ===================================================================== */
function marcarItemAtivo(moduloAtivo) {
  if (!moduloAtivo) return;

  const links = document.querySelectorAll(".sidebar-nav a[data-modulo]");
  let encontrou = false;

  links.forEach((a) => {
    if (a.dataset.modulo === moduloAtivo) {
      a.classList.add("active");
      a.setAttribute("aria-current", "page");
      encontrou = true;
    } else {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    }
  });

  if (!encontrou) {
    console.warn(
      `[layout] Nenhum item do menu corresponde a moduloAtivo="${moduloAtivo}".`,
    );
  }
}

/* =====================================================================
   configurarToggleMobile · hamburger + backdrop
   =====================================================================
   Funciona em todas as larguras, mas só faz efeito visual quando o CSS
   já coloca a sidebar como off-canvas (media query ≤1024px).
   ===================================================================== */
function configurarToggleMobile(sidebar) {
  const btn = document.getElementById("btnToggleSidebar");
  if (!btn) return;
  btn.dataset.layoutBound = "true";

  // ---------- Backdrop (cria se não existir) ----------
  let backdrop = document.querySelector(".sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  const abrir = () => {
    sidebar.classList.add("aberta");
    backdrop.classList.add("aberta");
    btn.setAttribute("aria-controls", sidebar.id || "sidebar");
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "Fechar menu");
    btn.setAttribute("title", "Fechar menu");
    document.body.style.overflow = "hidden"; // trava scroll do fundo
  };

  const fechar = () => {
    sidebar.classList.remove("aberta");
    backdrop.classList.remove("aberta");
    btn.setAttribute("aria-controls", sidebar.id || "sidebar");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Abrir menu");
    btn.setAttribute("title", "Abrir menu");
    document.body.style.overflow = "";
  };
  btn.setAttribute("aria-controls", sidebar.id || "sidebar");
  btn.setAttribute("aria-expanded", "false");

  // ---------- Botão hamburger ----------
  btn.addEventListener("click", () => {
    if (sidebar.classList.contains("aberta")) {
      fechar();
    } else {
      abrir();
    }
  });

  // ---------- Clique no backdrop fecha ----------
  backdrop.addEventListener("click", fechar);

  // ---------- Clique em qualquer link do menu fecha ----------
  sidebar.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => fechar());
  });

  // ---------- ESC fecha ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("aberta")) {
      fechar();
    }
  });

  // ---------- Se a viewport crescer, garante que fica fechado ----------
  const mq = window.matchMedia("(min-width: 1025px)");
  const aoMudarViewport = (ev) => {
    if (ev.matches) fechar();
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", aoMudarViewport);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(aoMudarViewport); // fallback navegadores antigos
  }
}

/* =====================================================================
   configurarMenuUsuario · dropdown do avatar
   ===================================================================== */
function configurarRetornoModulo() {
  document.querySelectorAll("[data-voltar-modulo]").forEach((link) => link.addEventListener("click", (event) => {
    const destino = sessionStorage.getItem("gestaoatas:returnUrl");
    if (destino && destino.startsWith("/")) { event.preventDefault(); sessionStorage.removeItem("gestaoatas:returnUrl"); window.location.href = destino; }
  }));
  const perfil = document.querySelector(".avatar-menu-item[href*='perfil.html']");
  if (perfil) perfil.addEventListener("click", () => sessionStorage.setItem("gestaoatas:returnUrl", window.location.pathname + window.location.search + window.location.hash));
}

function configurarMenuUsuario() {
  const btn = document.getElementById("avatarBtn");
  const menu = document.getElementById("avatarMenu");
  if (!btn || !menu) return;

  const fechar = () => {
    menu.classList.remove("aberto");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    const aberto = menu.classList.toggle("aberto");
    btn.setAttribute("aria-expanded", aberto ? "true" : "false");
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !btn.contains(event.target)) fechar();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") fechar();
  });
}

/* =====================================================================
   configurarLogout · botão "Sair" da topbar ou do dropdown
   ===================================================================== */
function configurarLogout(supabase, cfg) {
  const btn =
    document.getElementById("menuSair") || document.getElementById("btnSair");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const confirmar = window.confirm("Deseja realmente sair do módulo?");
    if (!confirmar) return;

    try {
      if (typeof cfg.onLogout === "function") {
        await cfg.onLogout();
      } else {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("[layout] Erro ao fazer logout:", err);
    }

    const destino = cfg.rotaIntranet || cfg.rotaLogin || DEFAULTS.rotaIntranet;
    window.location.href = destino;
  });
}

/* =====================================================================
   UTILITÁRIOS
   ===================================================================== */

/* ---------- Gera iniciais para o avatar (ex: "João da Silva" → "JS") ---------- */
function gerarIniciais(nome) {
  if (!nome) return "?";
  const partes = String(nome).trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/* ---------- Escapa texto para inserção em HTML ---------- */
function escaparHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- Escapa valor para inserção em atributo HTML ---------- */
function escaparAtributo(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =====================================================================
   AUTO-INIT OPCIONAL
   =====================================================================
   Se a página definir `window.__LAYOUT_CONFIG__` antes de importar este
   módulo, o layout se auto-inicializa assim que o DOM estiver pronto.

   Uso:
   ----------------------------------------------------------------
   <script>
     window.__LAYOUT_CONFIG__ = { ... };
   </script>
   <script type="module" src="../shared/js/layout.js"></script>
   ----------------------------------------------------------------
   ===================================================================== */
if (typeof window !== "undefined" && window.__LAYOUT_CONFIG__) {
  const disparar = () => {
    // Evita reinicialização se já foi chamado manualmente
    if (window.__LAYOUT_INITIALIZED__) return;
    window.__LAYOUT_INITIALIZED__ = true;

    initLayout(window.__LAYOUT_CONFIG__).catch((err) => {
      console.error("[layout] Erro na auto-inicialização:", err);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", disparar, { once: true });
  } else {
    disparar();
  }
}

/* =====================================================================
   EXPORTAÇÕES
   ===================================================================== */
export default { initLayout, carregarUsuario };
