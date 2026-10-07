// ============================================
// visualizar-ato.js
// Página de Visualização de Ato Oficial
// Integração real com Supabase
// Exibe o ato completo com ementa, texto, tags,
// relacionamentos, linha do tempo e ações
// ============================================

import { supabase } from "./supabase.js";

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let atoAtual = null;
let currentAtoId = null;

// ============================================
// NOTIFICAÇÕES
// ============================================
function showNotification(type, title, message, duration = 4000) {
  const container = document.getElementById("notificationContainer");
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
    <button class="notification-close">✕</button>
  `;
  container.appendChild(toast);
  const closeBtn = toast.querySelector(".notification-close");
  closeBtn.addEventListener("click", () => {
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
}

// ============================================
// FORMATADORES
// ============================================
function formatarData(data) {
  if (!data) return "—";
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarMoeda(valor) {
  if (!valor) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function escapeHTML(texto) {
  if (!texto) return "";
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ============================================
// APLICAR ESTILOS DE DISPOSITIVOS
// ============================================
function aplicarEstilosDispositivos(containerElement, alteracoes) {
  if (!containerElement || !alteracoes || !alteracoes.length) return;

  alteracoes.forEach((alt) => {
    // Buscar elemento pelo ID (âncora)
    const el = containerElement.querySelector(
      `#${alt.identificador_dispositivo}`,
    );
    if (!el) {
      console.warn(
        `⚠️ Dispositivo "${alt.identificador_dispositivo}" não encontrado no texto.`,
      );
      return;
    }

    if (alt.tipo === "revogado") {
      el.classList.add("dispositivo-revogado");
      el.setAttribute(
        "title",
        `Revogado por ${alt.ato_alterador?.tipos_ato?.sigla || "?"} ${alt.ato_alterador?.numero}/${alt.ato_alterador?.ano}`,
      );
    } else if (alt.tipo === "alterado") {
      el.classList.add("dispositivo-alterado");
      el.setAttribute(
        "title",
        `Alterado por ${alt.ato_alterador?.tipos_ato?.sigla || "?"} ${alt.ato_alterador?.numero}/${alt.ato_alterador?.ano}\nNovo texto: ${alt.novo_texto || ""}`,
      );
    }
  });
}

// ============================================
// CARREGAR ATO
// ============================================
async function carregarAto() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  if (!id) {
    mostrarErro("ID do ato não informado.");
    return;
  }

  currentAtoId = parseInt(id);

  // Mostrar loading, esconder conteúdo
  document.getElementById("loadingContainer").style.display = "block";
  document.getElementById("conteudoAto").style.display = "none";
  document.getElementById("erroContainer").style.display = "none";

  try {
    const { data: ato, error } = await supabase
      .from("atos_oficiais")
      .select(
        `
        id,
        numero,
        ano,
        ementa,
        texto_completo,
        status,
        data_publicacao,
        pdf_url,
        palavras_chave,
        versao,
        edicao_diario,
        pagina_diario,
        nome_diario,
        link_diario,
        tipo_id,
        orgao_id,
        tipos_ato!inner (id, nome, sigla),
        orgaos!inner (id, nome)
      `,
      )
      .eq("id", currentAtoId)
      .single();

    if (error) {
      console.error("Erro ao buscar ato:", error);
      mostrarErro("Erro ao carregar o ato: " + error.message);
      return;
    }

    if (!ato) {
      mostrarErro("Ato não encontrado.");
      return;
    }

    atoAtual = ato;

    // Renderizar o ato
    renderizarAto(ato);

    // Carregar dados complementares
    await Promise.all([
      carregarRelacionamentos(ato.id),
      carregarTimeline(ato.id),
      carregarAlteracoesDispositivos(ato.id),
    ]);

    // Esconder loading, mostrar conteúdo
    document.getElementById("loadingContainer").style.display = "none";
    document.getElementById("conteudoAto").style.display = "block";
  } catch (err) {
    console.error("Erro:", err);
    mostrarErro("Falha ao carregar o ato.");
  }
}

// ============================================
// RENDERIZAR ATO
// ============================================
function renderizarAto(ato) {
  const tipoNome = ato.tipos_ato?.nome || "Ato";
  const tipoSigla = ato.tipos_ato?.sigla || "ATO";
  const orgaoNome = ato.orgaos?.nome || "—";

  // Título
  document.getElementById("atoTipoNome").textContent = tipoNome;
  document.getElementById("atoNumeroAno").textContent =
    `${ato.numero}/${ato.ano}`;

  // Status
  const statusBadge = document.getElementById("atoStatusBadge");
  statusBadge.textContent = ato.status;
  statusBadge.className = `tipo-badge status-badge status-${ato.status.toLowerCase()}`;

  // Meta
  document.getElementById("atoOrgao").textContent = orgaoNome;
  document.getElementById("atoDataPublicacao").textContent = formatarData(
    ato.data_publicacao,
  );
  document.getElementById("atoVersao").textContent = ato.versao || 1;

  // Diário
  const diarioContainer = document.getElementById("atoDiarioContainer");
  if (ato.edicao_diario) {
    diarioContainer.style.display = "inline";
    let diarioTexto = `Ed. ${ato.edicao_diario}`;
    if (ato.pagina_diario) diarioTexto += `, Pág. ${ato.pagina_diario}`;
    if (ato.nome_diario) diarioTexto += ` (${ato.nome_diario})`;
    document.getElementById("atoDiario").textContent = diarioTexto;
  } else {
    diarioContainer.style.display = "none";
  }

  // Ementa
  document.getElementById("atoEmenta").textContent = ato.ementa;

  // Texto completo
  const textoContainer = document.getElementById("atoTextoCompleto");
  if (ato.texto_completo) {
    textoContainer.innerHTML = ato.texto_completo.replace(/\n/g, "<br>");
  } else {
    textoContainer.innerHTML = "<em>Nenhum texto completo cadastrado.</em>";
  }

  // Tags
  const tagsSection = document.getElementById("tagsSection");
  const tagsList = document.getElementById("atoTags");
  tagsList.innerHTML = "";
  if (ato.palavras_chave && ato.palavras_chave.length > 0) {
    tagsSection.style.display = "block";
    ato.palavras_chave.forEach((tag) => {
      const span = document.createElement("span");
      span.className = "tag-item";
      span.textContent = tag;
      tagsList.appendChild(span);
    });
  } else {
    tagsSection.style.display = "none";
  }

  // Atualizar título da página
  document.title = `${tipoNome} ${ato.numero}/${ato.ano} · Portal da Transparência`;

  // Configurar botão de PDF
  const btnPDF = document.getElementById("btnDownloadPDF");
  if (ato.pdf_url) {
    btnPDF.style.display = "inline-flex";
    btnPDF.onclick = () => baixarPDF();
  } else {
    btnPDF.style.display = "none";
  }
}

// ============================================
// CARREGAR RELACIONAMENTOS
// ============================================
async function carregarRelacionamentos(atoId) {
  const section = document.getElementById("relacionamentosSection");
  const container = document.getElementById("atoRelacionamentos");

  try {
    const [relOrigemRes, relDestinoRes] = await Promise.all([
      supabase
        .from("relacionamentos_atos")
        .select(
          `
          tipo,
          ato_destino:ato_destino_id(
            id, numero, ano,
            tipos_ato (id, nome, sigla),
            orgaos (id, nome)
          )
        `,
        )
        .eq("ato_origem_id", atoId),
      supabase
        .from("relacionamentos_atos")
        .select(
          `
          tipo,
          ato_origem:ato_origem_id(
            id, numero, ano,
            tipos_ato (id, nome, sigla),
            orgaos (id, nome)
          )
        `,
        )
        .eq("ato_destino_id", atoId),
    ]);

    const relsOrigem = relOrigemRes.data || [];
    const relsDestino = relDestinoRes.data || [];

    if (relsOrigem.length === 0 && relsDestino.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    let html = "";

    // Relações de origem (este ato afeta outros)
    if (relsOrigem.length > 0) {
      relsOrigem.forEach((rel) => {
        const dest = rel.ato_destino;
        if (!dest) return;
        const tipoLabel =
          {
            revoga: "Revoga",
            altera: "Altera",
            regulamenta: "Regulamenta",
          }[rel.tipo] || rel.tipo;

        const statusClass = dest.status
          ? `status-${dest.status.toLowerCase()}`
          : "";

        html += `
          <div class="relacionamento-item" onclick="window.location.href='visualizar-ato.html?id=${dest.id}'">
            <span class="rel-tipo">➡️ ${tipoLabel}</span>
            <span class="rel-ato">${dest.tipos_ato?.nome || "Ato"} ${dest.numero}/${dest.ano}</span>
            <span style="color:var(--neutral-400);font-size:13px;">${dest.orgaos?.nome || ""}</span>
            <span class="rel-link"><i class="fas fa-chevron-right"></i></span>
          </div>
        `;
      });
    }

    // Relações de destino (outros atos afetam este)
    if (relsDestino.length > 0) {
      relsDestino.forEach((rel) => {
        const orig = rel.ato_origem;
        if (!orig) return;
        const tipoLabel =
          {
            revoga: "Revogado por",
            altera: "Alterado por",
            regulamenta: "Regulamentado por",
          }[rel.tipo] || rel.tipo;

        html += `
          <div class="relacionamento-item" onclick="window.location.href='visualizar-ato.html?id=${orig.id}'">
            <span class="rel-tipo">⬅️ ${tipoLabel}</span>
            <span class="rel-ato">${orig.tipos_ato?.nome || "Ato"} ${orig.numero}/${orig.ano}</span>
            <span style="color:var(--neutral-400);font-size:13px;">${orig.orgaos?.nome || ""}</span>
            <span class="rel-link"><i class="fas fa-chevron-right"></i></span>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  } catch (err) {
    console.error("Erro ao carregar relacionamentos:", err);
    section.style.display = "none";
  }
}

// ============================================
// CARREGAR LINHA DO TEMPO
// ============================================
async function carregarTimeline(atoId) {
  const section = document.getElementById("timelineSection");
  const container = document.getElementById("atoTimeline");

  try {
    // Buscar ato base
    const { data: ato } = await supabase
      .from("atos_oficiais")
      .select("id, numero, ano, data_publicacao, tipos_ato (nome, sigla)")
      .eq("id", atoId)
      .single();

    if (!ato) {
      section.style.display = "none";
      return;
    }

    // Buscar relacionamentos
    const [relOrigemRes, relDestinoRes, alteracoesRes] = await Promise.all([
      supabase
        .from("relacionamentos_atos")
        .select(
          `
          tipo,
          ato_destino:ato_destino_id(
            id, numero, ano, data_publicacao,
            tipos_ato (nome, sigla)
          )
        `,
        )
        .eq("ato_origem_id", atoId),
      supabase
        .from("relacionamentos_atos")
        .select(
          `
          tipo,
          ato_origem:ato_origem_id(
            id, numero, ano, data_publicacao,
            tipos_ato (nome, sigla)
          )
        `,
        )
        .eq("ato_destino_id", atoId),
      supabase
        .from("alteracoes_dispositivos")
        .select(
          `
          id, tipo, identificador_dispositivo, novo_texto,
          ato_alterador:ato_alterador_id(
            id, numero, ano, data_publicacao,
            tipos_ato (nome, sigla)
          )
        `,
        )
        .eq("ato_origem_id", atoId),
    ]);

    const eventos = [];

    // Publicação
    eventos.push({
      data: ato.data_publicacao,
      titulo: "📅 Publicação",
      descricao: `${ato.tipos_ato?.nome || "Ato"} nº ${ato.numero}/${ato.ano} publicado.`,
      tipo: "publicacao",
      linkAtoId: null,
    });

    // Relações de origem
    if (relOrigemRes.data) {
      relOrigemRes.data.forEach((rel) => {
        const dest = rel.ato_destino;
        if (!dest) return;
        const tipoLabel =
          {
            revoga: "🚫 Revogou",
            altera: "✏️ Alterou",
            regulamenta: "📋 Regulamentou",
          }[rel.tipo] || rel.tipo;
        eventos.push({
          data: dest.data_publicacao || ato.data_publicacao,
          titulo: tipoLabel,
          descricao: `${ato.tipos_ato?.nome || "Ato"} ${ato.numero}/${ato.ano} ${rel.tipo} ${dest.tipos_ato?.nome || "Ato"} ${dest.numero}/${dest.ano}.`,
          tipo: rel.tipo === "revoga" ? "revogado" : "alterado",
          linkAtoId: dest.id,
        });
      });
    }

    // Relações de destino
    if (relDestinoRes.data) {
      relDestinoRes.data.forEach((rel) => {
        const orig = rel.ato_origem;
        if (!orig) return;
        const tipoLabel =
          {
            revoga: "🚫 Revogado por",
            altera: "✏️ Alterado por",
            regulamenta: "📋 Regulamentado por",
          }[rel.tipo] || rel.tipo;
        eventos.push({
          data: orig.data_publicacao || ato.data_publicacao,
          titulo: tipoLabel,
          descricao: `${orig.tipos_ato?.nome || "Ato"} ${orig.numero}/${orig.ano} ${rel.tipo} ${ato.tipos_ato?.nome || "Ato"} ${ato.numero}/${ato.ano}.`,
          tipo: rel.tipo === "revoga" ? "revogado" : "alterado",
          linkAtoId: orig.id,
        });
      });
    }

    // Alterações de dispositivos
    if (alteracoesRes.data) {
      alteracoesRes.data.forEach((alt) => {
        const alterador = alt.ato_alterador;
        if (!alterador) return;
        const tipoLabel =
          {
            revogado: "🚫 Dispositivo revogado",
            alterado: "✏️ Dispositivo alterado",
            acrescentado: "➕ Dispositivo acrescentado",
          }[alt.tipo] || alt.tipo;
        eventos.push({
          data: alterador.data_publicacao || ato.data_publicacao,
          titulo: tipoLabel,
          descricao: `O dispositivo "${alt.identificador_dispositivo}" foi ${alt.tipo} por ${alterador.tipos_ato?.nome || "Ato"} ${alterador.numero}/${alterador.ano}.`,
          tipo: alt.tipo === "revogado" ? "revogado" : "alterado",
          linkAtoId: alterador.id,
        });
      });
    }

    // Ordenar por data
    eventos.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

    if (eventos.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    let html = "";
    eventos.forEach((ev) => {
      const dotClass =
        ev.tipo === "revogado"
          ? "revogado"
          : ev.tipo === "alterado"
            ? "alterado"
            : "";
      html += `
        <div class="timeline-item ${dotClass}">
          <div class="timeline-titulo">${ev.titulo}</div>
          <div class="timeline-desc">
            ${ev.descricao}
            ${ev.linkAtoId ? `<br><a href="visualizar-ato.html?id=${ev.linkAtoId}" class="timeline-link"><i class="fas fa-external-link-alt"></i> Ver ato</a>` : ""}
          </div>
          <div class="timeline-data">${formatarData(ev.data)}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error("Erro ao carregar linha do tempo:", err);
    section.style.display = "none";
  }
}

// ============================================
// CARREGAR ALTERAÇÕES DE DISPOSITIVOS
// ============================================
async function carregarAlteracoesDispositivos(atoId) {
  try {
    const { data: alteracoes, error } = await supabase
      .from("alteracoes_dispositivos")
      .select(
        `
        id, tipo, identificador_dispositivo, novo_texto,
        ato_alterador:ato_alterador_id(
          id, numero, ano,
          tipos_ato (nome, sigla)
        )
      `,
      )
      .eq("ato_origem_id", atoId);

    if (error) {
      console.error("Erro ao carregar alterações de dispositivos:", error);
      return;
    }

    if (!alteracoes || alteracoes.length === 0) return;

    // Aplicar estilos ao texto completo
    const textoContainer = document.getElementById("atoTextoCompleto");
    if (textoContainer) {
      aplicarEstilosDispositivos(textoContainer, alteracoes);
    }
  } catch (err) {
    console.error("Erro ao carregar alterações de dispositivos:", err);
  }
}

// ============================================
// BAIXAR PDF
// ============================================
function baixarPDF() {
  if (!atoAtual || !atoAtual.pdf_url) {
    showNotification(
      "warning",
      "PDF indisponível",
      "Este ato não possui PDF anexado.",
    );
    return;
  }
  window.open(atoAtual.pdf_url, "_blank");
}

// ============================================
// COMPARTILHAR
// ============================================
function compartilhar() {
  const url = window.location.href;
  if (navigator.share) {
    navigator
      .share({
        title: document.title,
        url: url,
      })
      .catch(() => {});
  } else {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        showNotification(
          "success",
          "Link copiado",
          "URL copiada para a área de transferência.",
        );
      })
      .catch(() => {
        // Fallback
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        showNotification(
          "success",
          "Link copiado",
          "URL copiada para a área de transferência.",
        );
      });
  }
}

// ============================================
// MOSTRAR ERRO
// ============================================
function mostrarErro(mensagem) {
  document.getElementById("loadingContainer").style.display = "none";
  document.getElementById("conteudoAto").style.display = "none";
  document.getElementById("erroMensagem").textContent = mensagem;
  document.getElementById("erroContainer").style.display = "block";
}

// ============================================
// CARREGAR CONFIGURAÇÕES DO PORTAL
// ============================================
async function carregarConfiguracoesPortal() {
  try {
    const { data, error } = await supabase
      .from("configuracoes_portal")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const padrao = {
      email_contato: "transparencia@prefeitura.gov.br",
      telefone_contato: "(00) 0000-0000",
      diario_oficial_url: "https://www.diarioficial.gov.br",
      ouvidoria_email: "ouvidoria@prefeitura.gov.br",
    };

    const cfg = data || padrao;

    const footerEmail = document.getElementById("footerEmail");
    const footerTelefone = document.getElementById("footerTelefone");
    const footerDiarioLink = document.getElementById("footerDiarioLink");
    const footerOuvidoriaLink = document.getElementById("footerOuvidoriaLink");
    const footerDataAtualizacao = document.getElementById(
      "footerDataAtualizacao",
    );

    if (footerEmail)
      footerEmail.textContent = cfg.email_contato || padrao.email_contato;
    if (footerTelefone)
      footerTelefone.textContent =
        cfg.telefone_contato || padrao.telefone_contato;
    if (footerDiarioLink)
      footerDiarioLink.href =
        cfg.diario_oficial_url || padrao.diario_oficial_url;
    if (footerOuvidoriaLink)
      footerOuvidoriaLink.href = `mailto:${cfg.ouvidoria_email || padrao.ouvidoria_email}`;
    if (footerDataAtualizacao) {
      const now = new Date();
      footerDataAtualizacao.textContent = now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  } catch (err) {
    console.warn("Erro ao carregar configurações do portal:", err);
    // Usar valores padrão
    const footerEmail = document.getElementById("footerEmail");
    const footerTelefone = document.getElementById("footerTelefone");
    if (footerEmail)
      footerEmail.textContent = "transparencia@prefeitura.gov.br";
    if (footerTelefone) footerTelefone.textContent = "(00) 0000-0000";
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
async function init() {
  // Carregar configurações do portal
  await carregarConfiguracoesPortal();

  // Carregar o ato
  await carregarAto();

  // Event listener para tecla Escape (fechar modal de compartilhamento, etc.)
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      // Fechar notificações, etc.
    }
  });
}

// ============================================
// EXPORTAÇÕES GLOBAIS
// ============================================
window.baixarPDF = baixarPDF;
window.compartilhar = compartilhar;
window.showNotification = showNotification;
window.formatarData = formatarData;
window.formatarMoeda = formatarMoeda;

// ============================================
// INICIAR
// ============================================
document.addEventListener("DOMContentLoaded", init);
