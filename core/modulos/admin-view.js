/* Controlador extraído da página administrativa original; montado por core/admin-panel.js. */

import { supabase } from "../../shared/js/supabase.js";
      // ============================================
      // CONFIG SUPABASE
      // ============================================
      // ============================================
      // ÍCONES SUGERIDOS
      // ============================================
      const ICONES_SUGERIDOS = [
        "fa-book",
        "fa-book-open-reader",
        "fa-gavel",
        "fa-file-contract",
        "fa-boxes-stacked",
        "fa-check-double",
        "fa-users",
        "fa-building",
        "fa-chart-line",
        "fa-gear",
        "fa-folder",
        "fa-folder-open",
        "fa-clipboard-list",
        "fa-database",
        "fa-shield-halved",
        "fa-bell",
        "fa-envelope",
        "fa-calendar",
        "fa-clock",
        "fa-id-card",
        "fa-truck",
        "fa-cart-shopping",
        "fa-money-bill",
        "fa-file-invoice",
        "fa-stethoscope",
      ];

      // ============================================
      // ESTADO
      // ============================================
      let usuarioLogado = null;
      let modulosCarregados = [];

      // ============================================
      // NOTIFICAÇÕES
      // ============================================
      window.showNotification = function (
        type,
        title,
        message,
        duration = 4000,
      ) {
        const container = document.getElementById("notificationCenter");
        if (!container) return;
        const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
        const toast = document.createElement("div");
        toast.className = `notification-toast notification-${type}`;
        toast.innerHTML = `
          <span class="notification-icon">${icons[type]}</span>
          <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
          </div>
          <button class="notification-close" type="button">✕</button>
        `;
        container.appendChild(toast);
        toast
          .querySelector(".notification-close")
          .addEventListener("click", () => {
            toast.classList.add("removing");
            setTimeout(() => toast.remove(), 300);
          });
        if (duration > 0) {
          setTimeout(() => {
            if (toast.parentElement) {
              toast.classList.add("removing");
              setTimeout(() => toast.remove(), 300);
            }
          }, duration);
        }
        return toast;
      };

      window.showConfirm = function (title, message, onConfirm, opts = {}) {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
          position: fixed; inset: 0; background: rgba(15,23,42,0.55);
          backdrop-filter: blur(4px); z-index: 10000;
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        `;
        overlay.innerHTML = `
          <div data-intranet-inline-style="is49352e696255">
            <div data-intranet-inline-style="isdbc4a682dcb7">${opts.icone || "❓"}</div>
            <h3 data-intranet-inline-style="is574c9ef2d20c">
              ${title}
            </h3>
            <p data-intranet-inline-style="is707422852ae5">
              ${message}
            </p>
            <div data-intranet-inline-style="isa1498f40de4d">
              <button class="btn btn-secondary" id="cancelBtn" type="button">Cancelar</button>
              <button class="btn ${opts.btnClass || "btn-danger"}" id="confirmBtn" type="button">
                ${opts.btnLabel || "Confirmar"}
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        const close = () => {
          overlay.style.opacity = "0";
          setTimeout(() => overlay.remove(), 200);
        };
        overlay.querySelector("#cancelBtn").addEventListener("click", close);
        overlay.querySelector("#confirmBtn").addEventListener("click", () => {
          close();
          if (typeof onConfirm === "function") onConfirm();
        });
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) close();
        });
        return overlay;
      };

      // ============================================
      // HELPERS
      // ============================================
      function escaparHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function iniciais(nome) {
        if (!nome) return "?";
        const p = nome.trim().split(/\s+/);
        if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
        return (p[0][0] + p[p.length - 1][0]).toUpperCase();
      }

      function setTexto(id, valor) {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
      }

      function esconderLoading() {
        document.getElementById("loadingOverlay")?.classList.add("hidden");
      }

      function corValida(hex) {
        return /^#[0-9A-Fa-f]{6}$/.test(hex);
      }

      function gerarChaveSlug(str) {
        return str
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 50);
      }

      // ============================================
      // SESSÃO
      // ============================================
      async function verificarSessao() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = "../intranet.html";
          return null;
        }

        const { data: perfil, error } = await supabase
          .from("usuarios")
          .select("id, uuid, nome, email, perfil, ativo")
          .eq("uuid", session.user.id)
          .maybeSingle();

        if (error || !perfil || perfil.ativo === false) {
          window.location.href = "../intranet.html";
          return null;
        }

        if (perfil.perfil !== "ADMIN") {
          window.showNotification(
            "error",
            "Acesso negado",
            "Apenas usuários com perfil ADMIN podem gerenciar módulos.",
          );
          setTimeout(() => {
            window.location.href = "../intranet.html";
          }, 1500);
          return null;
        }

        usuarioLogado = perfil;
        return perfil;
      }

      function renderizarUsuario() {
        if (!usuarioLogado) return;
        setTexto("topbarNome", usuarioLogado.nome || "—");
        setTexto(
          "topbarData",
          new Date().toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
        );
        const el = document.getElementById("avatarIniciais");
        if (el) el.textContent = iniciais(usuarioLogado.nome);
      }

      // ============================================
      // CARREGAR MÓDULOS
      // ============================================
      async function carregarModulos() {
        const grid = document.getElementById("modulosGrid");
        grid.innerHTML = `
          <div class="lista-vazia">
            <i class="fas fa-spinner fa-spin"></i>
            Carregando módulos...
          </div>`;

        const { data, error } = await supabase
          .from("modulos_sistema")
          .select(
            "id, nome, descricao, icone, rota, ativo, ordem, cor, visivel_intranet, created_at, updated_at",
          )
          .order("ordem", { ascending: true });

        if (error) {
          console.error("Erro ao carregar módulos:", error);
          grid.innerHTML = `
            <div class="lista-vazia">
              <i class="fas fa-circle-exclamation"></i>
              Erro ao carregar módulos.<br/>
              <small>${escaparHtml(error.message)}</small>
            </div>`;
          return;
        }

        modulosCarregados = data || [];
        aplicarFiltros();
      }

      // ============================================
      // FILTROS
      // ============================================
      function aplicarFiltros() {
        const busca = document
          .getElementById("inputBusca")
          .value.trim()
          .toLowerCase();
        const status = document.getElementById("filtroStatus").value;
        const visibilidade =
          document.getElementById("filtroVisibilidade").value;

        let resultado = modulosCarregados.slice();

        if (busca) {
          resultado = resultado.filter((m) => {
            const alvo = [m.nome, m.descricao, m.rota]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return alvo.includes(busca);
          });
        }

        if (status === "ativo") {
          resultado = resultado.filter((m) => m.ativo === true);
        } else if (status === "inativo") {
          resultado = resultado.filter((m) => m.ativo === false);
        }

        if (visibilidade === "intranet") {
          resultado = resultado.filter((m) => m.visivel_intranet === true);
        } else if (visibilidade === "oculto") {
          resultado = resultado.filter((m) => m.visivel_intranet === false);
        }

        renderizarGrid(resultado);
      }

      // ============================================
      // RENDERIZAR GRID
      // ============================================
      function renderizarGrid(lista) {
        const grid = document.getElementById("modulosGrid");

        if (lista.length === 0) {
          const total = modulosCarregados.length;
          const msg =
            total === 0
              ? "Nenhum módulo cadastrado ainda. Clique em <strong>Novo módulo</strong> para começar."
              : "Nenhum módulo encontrado com os filtros atuais.";
          grid.innerHTML = `
            <div class="lista-vazia">
              <i class="fas fa-cubes"></i>
              ${msg}
            </div>`;
          return;
        }

        grid.innerHTML = lista
          .map((m) => {
            const cor = corValida(m.cor) ? m.cor : "#0d5e3a";
            const icone = m.icone || "fa-cube";

            return `
              <div class="modulo-card ${m.ativo ? "" : "inativo"}"
                   data-id="${m.id}"
                   style="--cor-modulo: ${cor};">
                <div class="modulo-header">
                  <div class="modulo-icon"
                       style="background: linear-gradient(135deg, ${cor}, ${cor}dd);">
                    <i class="fas ${escaparHtml(icone)}"></i>
                  </div>
                  <div class="modulo-info">
                    <h4>${escaparHtml(m.descricao || m.nome)}</h4>
                    <div class="chave">${escaparHtml(m.nome)}</div>
                  </div>
                </div>

                <div class="modulo-descricao">
                  Rota: <code>${escaparHtml(m.rota || "#")}</code>
                </div>

                <div class="modulo-meta">
                  <span class="meta-badge mono">
                    <i class="fas fa-sort"></i> ${m.ordem}
                  </span>
                  <span class="meta-badge ${m.ativo ? "verde" : "vermelho"}">
                    <i class="fas ${m.ativo ? "fa-circle-check" : "fa-circle-minus"}"></i>
                    ${m.ativo ? "Ativo" : "Inativo"}
                  </span>
                  ${
                    m.visivel_intranet
                      ? `<span class="meta-badge"><i class="fas fa-eye"></i> Intranet</span>`
                      : `<span class="meta-badge"><i class="fas fa-eye-slash"></i> Oculto</span>`
                  }
                </div>

                <div class="modulo-footer">
                  <span data-intranet-inline-style="is2397fea9859f">
                    ID ${m.id}
                  </span>
                  <div class="acoes-card">
                    <button class="btn-acao editar"
                            data-acao="editar"
                            data-id="${m.id}"
                            title="Editar" type="button">
                      <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-acao excluir"
                            data-acao="excluir"
                            data-id="${m.id}"
                            title="Excluir" type="button">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>`;
          })
          .join("");

        grid.querySelectorAll("[data-acao='editar']").forEach((btn) => {
          btn.addEventListener("click", () =>
            abrirModalEdicao(parseInt(btn.dataset.id)),
          );
        });
        grid.querySelectorAll("[data-acao='excluir']").forEach((btn) => {
          btn.addEventListener("click", () =>
            confirmarExclusao(parseInt(btn.dataset.id)),
          );
        });
      }

      // ============================================
      // ÍCONES SUGERIDOS · RENDER
      // ============================================
      function renderizarIconesSugeridos() {
        const container = document.getElementById("iconeSugestoes");
        container.innerHTML = ICONES_SUGERIDOS.map(
          (ic) => `
            <button type="button"
                    class="icone-sugestao"
                    data-icone="${ic}"
                    title="${ic}">
              <i class="fas ${ic}"></i>
            </button>`,
        ).join("");

        container.querySelectorAll(".icone-sugestao").forEach((btn) => {
          btn.addEventListener("click", () => {
            const icone = btn.dataset.icone;
            document.getElementById("inputIcone").value = icone;
            atualizarPreviewIcone();
          });
        });
      }

      function atualizarIconesSelecionados() {
        const atual = document.getElementById("inputIcone").value.trim();
        document.querySelectorAll(".icone-sugestao").forEach((btn) => {
          btn.classList.toggle("selecionado", btn.dataset.icone === atual);
        });
      }

      // ============================================
      // PREVIEW EM TEMPO REAL
      // ============================================
      function atualizarPreviewIcone() {
        const icone =
          document.getElementById("inputIcone").value.trim() || "fa-cube";
        const el = document.getElementById("iconePreview");
        const el2 = document.getElementById("previewIcone");
        if (el) el.className = `fas ${icone}`;
        if (el2) el2.innerHTML = `<i class="fas ${escaparHtml(icone)}"></i>`;
        atualizarIconesSelecionados();
      }

      function atualizarPreviewCard() {
        const nome =
          document.getElementById("inputDescricao").value.trim() ||
          "Nome do módulo";
        const desc = "Descrição que aparecerá no card.";
        const cor =
          document.getElementById("inputCorTexto").value.trim() || "#0D5E3A";

        setTexto("previewNome", nome);
        setTexto("previewDesc", desc);
        const previewConteudo = document.getElementById("previewCard");
        if (previewConteudo) {
          previewConteudo.style.setProperty("--cor-preview", cor);
        }
      }

      // ============================================
      // COLOR PICKER
      // ============================================
      function atualizarPresetCor(cor) {
        document.querySelectorAll(".color-preset").forEach((el) => {
          el.classList.toggle(
            "selecionado",
            el.dataset.cor.toLowerCase() === cor.toLowerCase(),
          );
        });
      }

      function setCor(valor) {
        if (!corValida(valor)) return;
        document.getElementById("inputCor").value = valor;
        document.getElementById("inputCorTexto").value = valor.toUpperCase();
        atualizarPresetCor(valor);
        atualizarPreviewCard();
      }

      // ============================================
      // MODAL
      // ============================================
      function limparFormulario() {
        document.getElementById("formModulo").reset();
        document.getElementById("inputId").value = "";
        document.getElementById("inputOrdem").value = 100;
        document.getElementById("inputIcone").value = "fa-cube";
        document.getElementById("inputAtivo").checked = true;
        document.getElementById("inputVisivel").checked = true;
        setCor("#0D5E3A");
        atualizarPreviewIcone();
        atualizarPreviewCard();
      }

      function abrirModalNovo() {
        limparFormulario();
        document.getElementById("modalTitulo").textContent = "Novo módulo";
        document.getElementById("modalOverlay").style.display = "flex";
        setTimeout(() => document.getElementById("inputNome").focus(), 100);
      }

      function abrirModalEdicao(id) {
        const m = modulosCarregados.find((x) => x.id === id);
        if (!m) return;

        limparFormulario();
        document.getElementById("modalTitulo").textContent = "Editar módulo";
        document.getElementById("inputId").value = m.id;
        document.getElementById("inputNome").value = m.nome || "";
        document.getElementById("inputDescricao").value = m.descricao || "";
        document.getElementById("inputRota").value = m.rota || "";
        document.getElementById("inputIcone").value = m.icone || "fa-cube";
        document.getElementById("inputOrdem").value = m.ordem ?? 100;
        document.getElementById("inputAtivo").checked = !!m.ativo;
        document.getElementById("inputVisivel").checked =
          m.visivel_intranet !== false;
        setCor(m.cor && corValida(m.cor) ? m.cor : "#0D5E3A");

        atualizarPreviewIcone();
        atualizarPreviewCard();
        document.getElementById("modalOverlay").style.display = "flex";
        setTimeout(() => document.getElementById("inputNome").focus(), 100);
      }

      function fecharModal() {
        document.getElementById("modalOverlay").style.display = "none";
      }

      // ============================================
      // SALVAR
      // ============================================
      document
        .getElementById("formModulo")
        .addEventListener("submit", async (e) => {
          e.preventDefault();

          const btn = document.getElementById("btnSalvar");
          const id = document.getElementById("inputId").value;

          let nome = document
            .getElementById("inputNome")
            .value.trim()
            .toLowerCase();
          nome = gerarChaveSlug(nome);

          const descricao = document
            .getElementById("inputDescricao")
            .value.trim();
          const rota = document.getElementById("inputRota").value.trim();
          const icone =
            document.getElementById("inputIcone").value.trim() || "fa-cube";
          const ordem =
            parseInt(document.getElementById("inputOrdem").value) || 100;
          const cor = document
            .getElementById("inputCorTexto")
            .value.trim()
            .toUpperCase();
          const ativo = document.getElementById("inputAtivo").checked;
          const visivel = document.getElementById("inputVisivel").checked;

          if (!nome) {
            window.showNotification(
              "warning",
              "Campo obrigatório",
              "Informe a chave única do módulo.",
            );
            return;
          }
          if (!descricao) {
            window.showNotification(
              "warning",
              "Campo obrigatório",
              "Informe a descrição do módulo.",
            );
            return;
          }
          if (!rota) {
            window.showNotification(
              "warning",
              "Campo obrigatório",
              "Informe a rota do módulo.",
            );
            return;
          }
          if (!corValida(cor)) {
            window.showNotification(
              "warning",
              "Cor inválida",
              "Use o formato hexadecimal (ex: #0D5E3A).",
            );
            return;
          }

          btn.disabled = true;
          btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;

          try {
            const dados = {
              nome,
              descricao,
              rota,
              icone,
              ordem,
              cor,
              ativo,
              visivel_intranet: visivel,
            };

            if (id) {
              const { error } = await supabase
                .from("modulos_sistema")
                .update(dados)
                .eq("id", parseInt(id));
              if (error) throw error;

              window.showNotification(
                "success",
                "Módulo atualizado",
                `"${descricao}" foi atualizado com sucesso.`,
              );
            } else {
              const { error } = await supabase
                .from("modulos_sistema")
                .insert(dados);
              if (error) throw error;

              window.showNotification(
                "success",
                "Módulo criado",
                `"${descricao}" foi adicionado. Conceda acesso aos usuários em Permissões.`,
              );
            }

            fecharModal();
            await carregarModulos();
          } catch (err) {
            console.error(err);
            if (err.code === "23505" || /duplicate key/i.test(err.message)) {
              window.showNotification(
                "error",
                "Chave já existe",
                "Já existe um módulo com esta chave. Escolha outra.",
              );
            } else {
              window.showNotification(
                "error",
                "Erro ao salvar",
                err.message || "Não foi possível salvar o módulo.",
              );
            }
          } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-save"></i> Salvar módulo`;
          }
        });

      // ============================================
      // EXCLUIR
      // ============================================
      async function confirmarExclusao(id) {
        const m = modulosCarregados.find((x) => x.id === id);
        if (!m) return;

        // Verifica se há permissões vinculadas
        const { count } = await supabase
          .from("usuarios_modulos")
          .select("*", { count: "exact", head: true })
          .eq("modulo", m.nome);

        const msg =
          count > 0
            ? `O módulo <strong>${escaparHtml(m.descricao)}</strong> está vinculado a <strong>${count} usuário(s)</strong>.<br/><br/>Ao excluir, essas permissões também serão removidas. Deseja continuar?`
            : `Deseja realmente excluir o módulo <strong>${escaparHtml(m.descricao)}</strong>? Esta ação não pode ser desfeita.`;

        window.showConfirm(
          "Excluir módulo",
          msg,
          async () => {
            try {
              // Remove permissões vinculadas
              await supabase
                .from("usuarios_modulos")
                .delete()
                .eq("modulo", m.nome);

              // Remove o módulo
              const { error } = await supabase
                .from("modulos_sistema")
                .delete()
                .eq("id", id);
              if (error) throw error;

              window.showNotification(
                "success",
                "Módulo excluído",
                `"${m.descricao}" foi removido do sistema.`,
              );
              await carregarModulos();
            } catch (err) {
              console.error(err);
              window.showNotification(
                "error",
                "Erro ao excluir",
                err.message || "Não foi possível excluir o módulo.",
              );
            }
          },
          { icone: "🗑️", btnLabel: "Excluir", btnClass: "btn-danger" },
        );
      }

      // ============================================
      // EVENTOS
      // ============================================
      document.getElementById("inputIcone").addEventListener("input", () => {
        atualizarPreviewIcone();
      });

      document
        .getElementById("inputDescricao")
        .addEventListener("input", () => {
          atualizarPreviewCard();
        });

      document.getElementById("inputCor").addEventListener("input", (e) => {
        const v = e.target.value;
        document.getElementById("inputCorTexto").value = v.toUpperCase();
        atualizarPresetCor(v);
        atualizarPreviewCard();
      });

      document
        .getElementById("inputCorTexto")
        .addEventListener("input", (e) => {
          let v = e.target.value.trim();
          if (v && !v.startsWith("#")) v = "#" + v;
          if (corValida(v)) {
            document.getElementById("inputCor").value = v;
            atualizarPresetCor(v);
            atualizarPreviewCard();
          }
        });

      document.querySelectorAll(".color-preset").forEach((btn) => {
        btn.addEventListener("click", () => setCor(btn.dataset.cor));
      });

      document
        .getElementById("btnNovoModulo")
        .addEventListener("click", abrirModalNovo);
      document
        .getElementById("btnFecharModal")
        .addEventListener("click", fecharModal);
      document
        .getElementById("btnCancelar")
        .addEventListener("click", fecharModal);

      document.getElementById("modalOverlay").addEventListener("click", (e) => {
        if (e.target.id === "modalOverlay") fecharModal();
      });

      document
        .getElementById("inputBusca")
        .addEventListener("input", aplicarFiltros);
      document
        .getElementById("filtroStatus")
        .addEventListener("change", aplicarFiltros);
      document
        .getElementById("filtroVisibilidade")
        .addEventListener("change", aplicarFiltros);

      document.getElementById("btnLimpar").addEventListener("click", () => {
        document.getElementById("inputBusca").value = "";
        document.getElementById("filtroStatus").value = "";
        document.getElementById("filtroVisibilidade").value = "";
        aplicarFiltros();
      });

      document.getElementById("btnSair").addEventListener("click", async () => {
        if (!confirm("Deseja realmente sair do módulo?")) return;
        await supabase.auth.signOut();
        window.location.href = "../intranet.html";
      });

      // ESC fecha modal
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") fecharModal();
      });

      // Toggle sidebar mobile
      const btnToggle = document.getElementById("btnToggleSidebar");
      const sidebar = document.getElementById("sidebar");
      if (!window.ADMIN_SINGLE_PAGE && btnToggle && sidebar) {
        btnToggle.addEventListener("click", () =>
          sidebar.classList.toggle("aberta"),
        );
        sidebar.querySelectorAll("a").forEach((a) => {
          a.addEventListener("click", () => sidebar.classList.remove("aberta"));
        });
      }

      // ============================================
      // INICIALIZAÇÃO
      // ============================================
      async function init() {
        try {
          const usuario = await verificarSessao();
          if (!usuario) return;

          renderizarUsuario();
          renderizarIconesSugeridos();
          atualizarPreviewIcone();
          atualizarPreviewCard();
          atualizarPresetCor("#0D5E3A");
          await carregarModulos();
        } catch (err) {
          console.error("Erro na inicialização:", err);
          window.showNotification(
            "error",
            "Erro inesperado",
            "Não foi possível inicializar a página.",
          );
        } finally {
          esconderLoading();
        }
      }

export async function initializeAdminView() { return await init(); }
