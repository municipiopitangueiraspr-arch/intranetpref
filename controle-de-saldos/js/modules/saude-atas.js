import { supabase } from "../supabase.js";
import { getAnalyticAtaIds } from "../../../shared/js/ata-scope.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const normalizar = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

const moeda = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatarData = (value) => {
  if (!value) return "Sem data informada";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Sem data informada"
    : date.toLocaleDateString("pt-BR");
};

const hojeSemHora = () => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
};

function diasAte(data) {
  if (!data) return null;
  const dataAlvo = new Date(`${String(data).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dataAlvo.getTime())) return null;
  return Math.ceil((dataAlvo - hojeSemHora()) / 86400000);
}

function valorAta(ata) {
  const itens = ata.itens || [];
  const somaItens = itens.reduce(
    (total, item) =>
      total +
      Number(
        item.valor_total ??
          Number(item.quantidade_contratada || 0) * Number(item.valor_unitario || 0),
      ),
    0,
  );
  return Number(ata.valor_global ?? somaItens);
}

function calcularResumo(ata) {
  const itens = ata.itens || [];
  const contratado = valorAta(ata);
  let consumido = 0;
  let totalContratadoItens = 0;
  let saldoQuantidadeBaixo = 0;
  let itensSemSaldo = 0;

  for (const item of itens) {
    const qtdContratada = Number(item.quantidade_contratada || 0);
    const qtdConsumida = Math.max(
      0,
      qtdContratada - Number(item.saldo_quantidade ?? qtdContratada),
    );
    const saldoInformado = Number(item.saldo_quantidade ?? qtdContratada);
    const unitario = Number(item.valor_unitario || 0);
    const totalItem = Number(item.valor_total ?? qtdContratada * unitario);

    totalContratadoItens += totalItem;
    consumido += qtdConsumida * unitario;
    if (qtdContratada > 0 && saldoInformado <= qtdContratada * 0.1) {
      saldoQuantidadeBaixo += 1;
    }
    if (qtdContratada > 0 && saldoInformado <= 0) itensSemSaldo += 1;
  }

  const base = contratado || totalContratadoItens;
  const saldo = Math.max(0, base - consumido);
  const percentualConsumido =
    base > 0 ? Math.min(100, Math.max(0, (consumido / base) * 100)) : null;
  const dias = diasAte(ata.data_fim_vigencia);
  const situacao = String(ata.situacao || "").toUpperCase();
  const vencida = situacao === "VENCIDA" || (dias !== null && dias < 0);
  const venceEm30 = !vencida && dias !== null && dias <= 30;
  const saldoBaixo = base > 0 && saldo / base <= 0.1;
  const motivos = [];

  if (vencida) {
    motivos.push(
      dias !== null && dias < 0
        ? `Vencida há ${Math.abs(dias)} dia(s)`
        : "Ata marcada como vencida",
    );
  } else if (venceEm30) {
    motivos.push(`Vence em ${dias} dia(s)`);
  }
  if (saldoBaixo && base > 0) {
    motivos.push("Saldo financeiro igual ou inferior a 10%");
  }
  if (itensSemSaldo) motivos.push(`${itensSemSaldo} item(ns) sem saldo`);
  if (!ata.data_fim_vigencia) motivos.push("Vigência sem data final cadastrada");

  return {
    valorGlobal: base,
    consumido,
    saldo,
    percentualConsumido,
    dias,
    vencida,
    venceEm30,
    ativa: !vencida && (!situacao || situacao === "ATIVA" || situacao === "PROXIMA"),
    saldoBaixo,
    itensBaixoSaldo: saldoQuantidadeBaixo,
    itensSemSaldo,
    motivos,
    situacao: situacao || "NÃO INFORMADA",
  };
}

const formatarValorFiltro = (value) => escapeHtml(value ?? "");

const TAMANHO_PAGINA = 1000;

async function buscarTodasAsPaginas(criarConsulta) {
  const registros = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await criarConsulta().range(
      inicio,
      inicio + TAMANHO_PAGINA - 1,
    );
    if (error) return { data: registros, error };
    const pagina = Array.isArray(data) ? data : [];
    registros.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) {
      return { data: registros, error: null };
    }
  }
}

function inicioDosUltimos12Meses() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const mes = String(inicio.getMonth() + 1).padStart(2, "0");
  return `${inicio.getFullYear()}-${mes}-01`;
}

export class SaudeAtas {
  constructor(sistema) {
    this.sistema = sistema;
    this.atas = [];
    this.resumos = [];
    this.favoritasIds = new Set();
    this.favoritasErro = false;
    this.modoFavoritas = "todas";
    this.escopoAnaliticoIds = null;
    this.dadosIndicadores = {};
    this.errosIndicadores = new Set();
    this.carregando = false;
    this.filtros = {
      busca: "",
      status: "todos",
      vigencia: "todos",
      dias: "30",
      saude: "todos",
      categoria: "todos",
      valorMin: "",
      valorMax: "",
      ordenacao: "vencimento_asc",
    };
  }

  async carregarConteudo() {
    const container = document.getElementById("saudeContent");
    if (!container || this.carregando) return;

    this.carregando = true;
    container.innerHTML =
      '<div class="saude-loading" role="status"><span class="saude-spinner" aria-hidden="true"></span><p>Carregando informações das atas…</p></div>';

    try {
      const usuarioId = this.sistema.usuarioAtual?.id;
      const escopoAnalitico = await getAnalyticAtaIds(supabase, this.sistema.usuarioAtual);
      this.escopoAnaliticoIds = escopoAnalitico === null
        ? null
        : new Set(escopoAnalitico.map((id) => Number(id)));
      const criarConsultaAtas = () =>
        supabase
          .from("atas")
          .select(
            "id,numero_ata,processo_administrativo,numero_pregao,pregao_numero,objeto,data_assinatura,data_inicio_vigencia,data_fim_vigencia,valor_global,fornecedor_id,situacao,categoria_id,modalidade,created_at,updated_at,gestor_id,fiscal_id,fiscal_substituto_id,orgao_responsavel_id,ato_designacao,data_designacao,processo_compras_id,fornecedor:fornecedores(razao_social,cnpj),itens:itens_ata!fk_item_ata(id,item_numero,codigo_material,codigo_siafem,codigo_catmat,descricao,descricao_detalhada,especificacao_tecnica,unidade_medida,categoria,quantidade_contratada,quantidade_estimada,valor_unitario,valor_total,quantidade_prefeitura,quantidade_saae,quantidade_camara,lote_numero,lote_descricao,saldo_quantidade,saldo_valor,situacao,updated_at),categoria:categorias(id,nome)",
          )
          .order("data_fim_vigencia", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true });

      const consultasIndicadores = [
        [
          "consumos",
          () =>
            supabase
              .from("consumos")
              .select("id,ata_id,item_ata_id,orgao_solicitante_id,unidade_id,quantidade,valor_unitario,valor_total,data_consumo,created_at")
              .gte("data_consumo", inicioDosUltimos12Meses())
              .order("id", { ascending: true }),
        ],
        [
          "pedidos",
          () =>
            supabase
              .from("pedidos")
              .select("id,numero_pedido,ata_id,orgao_solicitante_id,status,status_aprovacao,data_solicitacao,data_autorizacao,valor_total,created_at,updated_at")
              .order("id", { ascending: true }),
        ],
        [
          "itensPedido",
          () =>
            supabase
              .from("itens_pedido")
              .select("id,pedido_id,item_ata_id,quantidade_solicitada,valor_unitario,valor_total")
              .order("id", { ascending: true }),
        ],
        [
          "reservas",
          () =>
            supabase
              .from("pedidos_reservas")
              .select("id,pedido_id,item_pedido_id,item_ata_id,quantidade,valor,status,criada_em,liberada_em")
              .order("id", { ascending: true }),
        ],
        [
          "entregas",
          () =>
            supabase
              .from("pedidos_entregas")
              .select("id,pedido_id,numero,data_entrega,tipo,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "itensEntregues",
          () =>
            supabase
              .from("pedidos_entregas_itens")
              .select("id,entrega_id,pedido_id,item_pedido_id,quantidade,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "ocorrenciasPedidos",
          () =>
            supabase
              .from("pedidos_ocorrencias")
              .select("id,pedido_id,tipo,severidade,resolvida,resolvida_em,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "aditivos",
          () =>
            supabase
              .from("aditivos_ata")
              .select("id,ata_original_id,numero_aditivo,tipo_aditivo,data_assinatura,nova_data_inicio_vigencia,nova_data_fim_vigencia,novo_valor_global,status,data_aplicacao,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "itensAditivos",
          () =>
            supabase
              .from("aditivos_itens_historico")
              .select("id,aditivo_id,item_ata_id,quantidade_anterior,valor_unitario_anterior,valor_total_anterior,nova_quantidade,novo_valor_unitario,novo_valor_total,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "historicoPrecos",
          () =>
            supabase
              .from("historico_precos")
              .select("id,item_ata_id,valor_anterior,valor_novo,percentual_reajuste,data_vigencia,data_reajuste,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "historicoAtas",
          () =>
            supabase
              .from("atas_historico")
              .select("id,ata_id,campo_alterado,created_at")
              .order("id", { ascending: true }),
        ],
        [
          "orgaos",
          () =>
            supabase
              .from("orgaos")
              .select("id,nome,sigla")
              .order("id", { ascending: true }),
        ],
      ];

      const buscarOpcional = async (criarConsulta) => {
        try {
          return await buscarTodasAsPaginas(criarConsulta);
        } catch (error) {
          return { data: [], error };
        }
      };
      const consultaFavoritas = usuarioId
        ? buscarOpcional(() =>
            supabase
              .from("atas_favoritas")
              .select("ata_id")
              .eq("usuario_id", usuarioId)
              .order("id", { ascending: true }),
          )
        : Promise.resolve({
            data: [],
            error: new Error("Sessão do usuário não identificada."),
          });

      const [resultadoAtas, resultadoFavoritas, ...resultadosIndicadores] =
        await Promise.all([
          buscarTodasAsPaginas(criarConsultaAtas),
          consultaFavoritas,
          ...consultasIndicadores.map(([, criarConsulta]) =>
            buscarOpcional(criarConsulta),
          ),
        ]);
      if (resultadoAtas.error) throw resultadoAtas.error;

      this.atas = resultadoAtas.data || [];
      this.dadosIndicadores = {};
      this.errosIndicadores = new Set();
      consultasIndicadores.forEach(([chave], index) => {
        const resultado = resultadosIndicadores[index] || {};
        this.dadosIndicadores[chave] = resultado.data || [];
        if (resultado.error) {
          this.errosIndicadores.add(chave);
          console.warn(
            `[Saúde das Atas] Indicador indisponível (${chave}):`,
            resultado.error?.message,
          );
        }
      });
      if (this.escopoAnaliticoIds !== null) {
        const permitido = this.escopoAnaliticoIds;
        const atasPermitidas = this.atas.filter((ata) => permitido.has(Number(ata.id)));
        const itensPermitidos = new Set(atasPermitidas.flatMap((ata) => (ata.itens || []).map((item) => Number(item.id))));
        const pedidosPermitidos = new Set((this.dadosIndicadores.pedidos || [])
          .filter((pedido) => permitido.has(Number(pedido.ata_id)))
          .map((pedido) => Number(pedido.id)));
        this.dadosIndicadores.consumos = (this.dadosIndicadores.consumos || []).filter((row) => permitido.has(Number(row.ata_id)));
        this.dadosIndicadores.pedidos = (this.dadosIndicadores.pedidos || []).filter((row) => permitido.has(Number(row.ata_id)));
        for (const chave of ["itensPedido", "reservas", "entregas", "itensEntregues", "ocorrenciasPedidos"]) {
          this.dadosIndicadores[chave] = (this.dadosIndicadores[chave] || []).filter((row) => pedidosPermitidos.has(Number(row.pedido_id)));
        }
        this.dadosIndicadores.aditivos = (this.dadosIndicadores.aditivos || []).filter((row) => permitido.has(Number(row.ata_original_id)));
        this.dadosIndicadores.itensAditivos = (this.dadosIndicadores.itensAditivos || []).filter((row) => itensPermitidos.has(Number(row.item_ata_id)));
        this.dadosIndicadores.historicoPrecos = (this.dadosIndicadores.historicoPrecos || []).filter((row) => itensPermitidos.has(Number(row.item_ata_id)));
        this.dadosIndicadores.historicoAtas = (this.dadosIndicadores.historicoAtas || []).filter((row) => permitido.has(Number(row.ata_id)));
      }
      this.favoritasErro = Boolean(resultadoFavoritas.error);
      this.favoritasIds = new Set(
        (resultadoFavoritas.data || [])
          .map((row) => String(row.ata_id ?? ""))
          .filter(Boolean),
      );
      if (this.favoritasErro) {
        console.warn(
          "[Saúde das Atas] Não foi possível carregar as favoritas compartilhadas:",
          resultadoFavoritas.error?.message,
        );
      }
      this.carregando = false;

      const ataId = new URLSearchParams(window.location.search).get("ata");
      if (ataId) {
        const selecionada = this.atas.find(
          (ata) => String(ata.id) === String(ataId),
        );
        if (selecionada) {
          this.abrirDetalhe(selecionada);
          return;
        }
      }
      this.renderizarPainel();
    } catch (error) {
      this.carregando = false;
      console.error("[Saúde das Atas] Falha ao carregar atas:", error);
      container.innerHTML = `<section class="saude-erro" role="alert"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><h2>Não foi possível carregar as atas</h2><p>Verifique a conexão e as permissões de acesso e tente novamente.</p><button type="button" class="saude-btn saude-btn-principal" data-saude-action="recarregar">Tentar novamente</button></section>`;
      container
        .querySelector('[data-saude-action="recarregar"]')
        ?.addEventListener(
          "click",
          () => this.carregarConteudo(),
          { once: true },
        );
    }
  }

  renderizarPainel() {
    const container = document.getElementById("saudeContent");
    if (!container) return;

    this.resumos = this.atas.map((ata) => ({ ata, resumo: calcularResumo(ata) }));
    const resumosAnaliticos = this.escopoAnaliticoIds === null
      ? this.resumos
      : this.resumos.filter(({ ata }) => this.escopoAnaliticoIds.has(Number(ata.id)));
    const ativas = resumosAnaliticos.filter(({ resumo }) => resumo.ativa);
    const vencem30 = resumosAnaliticos.filter(({ resumo }) => resumo.venceEm30);
    const vencem60 = resumosAnaliticos.filter(
      ({ resumo }) =>
        !resumo.vencida && resumo.dias !== null && resumo.dias >= 0 && resumo.dias <= 60,
    );
    const vencem90 = resumosAnaliticos.filter(
      ({ resumo }) =>
        !resumo.vencida && resumo.dias !== null && resumo.dias >= 0 && resumo.dias <= 90,
    );
    const alertas = resumosAnaliticos.filter(({ resumo }) => resumo.motivos.length > 0);
    const valorGlobal = ativas.reduce(
      (sum, entry) => sum + entry.resumo.valorGlobal,
      0,
    );
    const consumido = ativas.reduce(
      (sum, entry) => sum + entry.resumo.consumido,
      0,
    );
    const saldo = ativas.reduce((sum, entry) => sum + entry.resumo.saldo, 0);
    const categorias = [
      ...new Set(
        this.atas
          .map((ata) => String(ata.categoria?.nome || "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (this.filtros.categoria !== "todos" && !categorias.includes(this.filtros.categoria)) {
      this.filtros.categoria = "todos";
    }
    const categoriasHtml = categorias
      .map(
        (categoria) =>
          `<option value="${escapeHtml(categoria)}" ${this.filtros.categoria === categoria ? "selected" : ""}>${escapeHtml(categoria)}</option>`,
      )
      .join("");

    container.innerHTML = `
      <section class="saude-page" aria-labelledby="saude-title">
        <h1 class="saude-sr-only" id="saude-title">Saúde das Atas</h1>

        <section class="saude-kpis" aria-label="Indicadores principais">
          ${this.kpi("Atas vigentes", ativas.length, "fa-file-circle-check", "Atas em situação vigente", "azul")}
          ${this.kpi("Vencem em até 30 dias", vencem30.length, "fa-calendar-xmark", "Atas com data final nos próximos 30 dias", "laranja")}
          ${this.kpi("Valor global vigente", moeda(valorGlobal), "fa-coins", "Soma do valor global das atas vigentes", "azul")}
          ${this.kpi("Utilização estimada", moeda(consumido), "fa-chart-line", "Estimativa: contratado dos itens menos saldo informado", "roxo")}
          ${this.kpi("Consumo registrado", moeda((this.dadosIndicadores.consumos || []).reduce((s, row) => s + Number(row.valor_total || 0), 0)), "fa-receipt", "Lançamentos efetivos na tabela de consumos", "azul")}
          ${this.kpi("Saldo disponível", moeda(saldo), "fa-wallet", "Saldo financeiro estimado das atas vigentes", "verde")}
          ${this.kpi("Atas com alertas", alertas.length, "fa-triangle-exclamation", "Vencidas, vencendo em até 30 dias ou com saldo crítico", "vermelho")}
        </section>

        <div class="saude-nota">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          <span><strong>Como ler:</strong> saldo crítico considera saldo financeiro de até 10%; itens com até 10% da quantidade contratada também são sinalizados. Os prazos são calculados pela data final de vigência.</span>
          <span class="saude-faixas">Até 60 dias: ${vencem60.length} · até 90 dias: ${vencem90.length}</span>
        </div>

        ${this.escopoAnaliticoIds === null ? "" : `<p class="saude-nota saude-escopo-nota" role="status"><i class="fas fa-filter" aria-hidden="true"></i><span>Indicadores gerenciais e relatórios consideram apenas atas com consumo registrado na sua unidade ou em suas subunidades. A lista continua permitindo localizar qualquer ata.</span></p>`}

        ${this.renderIndicadoresGerenciais()}

        <section class="saude-lista" aria-labelledby="saude-lista-title">
          <div class="saude-lista-heading">
            <div>
              <h2 id="saude-lista-title">Localizar e filtrar atas</h2>
              <p>Combine busca, vigência, situação, categoria, saldo e valor. As favoritas ficam em primeiro lugar.</p>
            </div>
            <span class="saude-resultados" id="saudeContagem" aria-live="polite"></span>
          </div>

          <div class="saude-filtros" id="saudeFiltros" role="search" aria-label="Filtros de atas">
          <div class="saude-busca">
            <i class="fas fa-search" aria-hidden="true"></i>
            <label class="saude-sr-only" for="saudeBusca">Buscar atas</label>
            <input id="saudeBusca" data-saude-filtro="busca" type="search" value="${escapeHtml(this.filtros.busca)}" placeholder="Nº da ata, fornecedor, CNPJ, processo ou descrição de item…" autocomplete="off">
            <button type="button" class="saude-limpar-busca" data-saude-action="limpar-busca" aria-label="Limpar busca" title="Limpar busca" ${this.filtros.busca ? "" : "hidden"}><i class="fas fa-xmark" aria-hidden="true"></i></button>
          </div>

            <div class="saude-filtros-grid">
              <label class="saude-filtro">
                <span><i class="fas fa-tag" aria-hidden="true"></i> Situação</span>
                <select class="saude-select" data-saude-filtro="status">
                  <option value="todos" ${this.filtros.status === "todos" ? "selected" : ""}>Todas as situações</option>
                  <option value="ATIVA" ${this.filtros.status === "ATIVA" ? "selected" : ""}>Ativa</option>
                  <option value="PROXIMA" ${this.filtros.status === "PROXIMA" ? "selected" : ""}>Próxima</option>
                  <option value="VENCIDA" ${this.filtros.status === "VENCIDA" ? "selected" : ""}>Vencida</option>
                  <option value="NAO_INFORMADA" ${this.filtros.status === "NAO_INFORMADA" ? "selected" : ""}>Não informada</option>
                </select>
              </label>

              <div class="saude-filtro saude-filtro-vigencia">
                <label class="saude-filtro-label" for="saudeFiltroVigencia"><i class="fas fa-clock" aria-hidden="true"></i> Vigência</label>
                <select class="saude-select" id="saudeFiltroVigencia" data-saude-filtro="vigencia">
                  <option value="todos" ${this.filtros.vigencia === "todos" ? "selected" : ""}>Todas as vigências</option>
                  <option value="vigentes_hoje" ${this.filtros.vigencia === "vigentes_hoje" ? "selected" : ""}>Vigentes hoje</option>
                  <option value="vencendo_em" ${this.filtros.vigencia === "vencendo_em" ? "selected" : ""}>Vencendo em até…</option>
                  <option value="vencidas" ${this.filtros.vigencia === "vencidas" ? "selected" : ""}>Já vencidas</option>
                  <option value="nao_iniciadas" ${this.filtros.vigencia === "nao_iniciadas" ? "selected" : ""}>Não iniciadas</option>
                  <option value="sem_data" ${this.filtros.vigencia === "sem_data" ? "selected" : ""}>Sem data final</option>
                </select>
                <div class="saude-dias-wrap" id="saudeDiasWrap" ${this.filtros.vigencia === "vencendo_em" ? "" : "hidden"}>
                  <label class="saude-sr-only" for="saudeFiltroDias">Quantidade de dias para vencimento</label>
                  <input class="saude-input" id="saudeFiltroDias" data-saude-filtro="dias" type="number" min="1" max="9999" value="${escapeHtml(this.filtros.dias)}">
                  <span>dias</span>
                </div>
              </div>

              <label class="saude-filtro">
                <span><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Saúde / saldo</span>
                <select class="saude-select" data-saude-filtro="saude">
                  <option value="todos" ${this.filtros.saude === "todos" ? "selected" : ""}>Todos os níveis</option>
                  <option value="alertas" ${this.filtros.saude === "alertas" ? "selected" : ""}>Com alertas</option>
                  <option value="saldo_baixo" ${this.filtros.saude === "saldo_baixo" ? "selected" : ""}>Saldo baixo (até 10%)</option>
                  <option value="saldo_zerado" ${this.filtros.saude === "saldo_zerado" ? "selected" : ""}>Saldo zerado</option>
                  <option value="itens_sem_saldo" ${this.filtros.saude === "itens_sem_saldo" ? "selected" : ""}>Itens sem saldo</option>
                </select>
              </label>

              <label class="saude-filtro">
                <span><i class="fas fa-layer-group" aria-hidden="true"></i> Categoria</span>
                <select class="saude-select" data-saude-filtro="categoria">
                  <option value="todos" ${this.filtros.categoria === "todos" ? "selected" : ""}>Todas as categorias</option>
                  ${categoriasHtml}
                </select>
              </label>

              <fieldset class="saude-filtro saude-filtro-valores">
                <legend><i class="fas fa-coins" aria-hidden="true"></i> Valor global</legend>
                <div>
                  <label><span class="saude-sr-only">Valor mínimo</span><input class="saude-input" data-saude-filtro="valorMin" type="number" min="0" step="0.01" value="${formatarValorFiltro(this.filtros.valorMin)}" placeholder="Mínimo (R$)"></label>
                  <span aria-hidden="true">até</span>
                  <label><span class="saude-sr-only">Valor máximo</span><input class="saude-input" data-saude-filtro="valorMax" type="number" min="0" step="0.01" value="${formatarValorFiltro(this.filtros.valorMax)}" placeholder="Máximo (R$)"></label>
                </div>
              </fieldset>

              <label class="saude-filtro">
                <span><i class="fas fa-sort" aria-hidden="true"></i> Ordenar resultados</span>
                <select class="saude-select" data-saude-filtro="ordenacao">
                  <option value="vencimento_asc" ${this.filtros.ordenacao === "vencimento_asc" ? "selected" : ""}>Vencimento mais próximo</option>
                  <option value="vencimento_desc" ${this.filtros.ordenacao === "vencimento_desc" ? "selected" : ""}>Vencimento mais distante</option>
                  <option value="valor_desc" ${this.filtros.ordenacao === "valor_desc" ? "selected" : ""}>Maior valor global</option>
                  <option value="consumo_desc" ${this.filtros.ordenacao === "consumo_desc" ? "selected" : ""}>Maior valor consumido</option>
                  <option value="saldo_asc" ${this.filtros.ordenacao === "saldo_asc" ? "selected" : ""}>Menor saldo disponível</option>
                  <option value="numero_asc" ${this.filtros.ordenacao === "numero_asc" ? "selected" : ""}>Número da ata (crescente)</option>
                  <option value="fornecedor_asc" ${this.filtros.ordenacao === "fornecedor_asc" ? "selected" : ""}>Fornecedor (A–Z)</option>
                </select>
              </label>
            </div>

            <div class="saude-filtros-footer">
              <div class="saude-favoritas-filtro" role="group" aria-label="Filtro compartilhado de atas favoritas">
                <button type="button" data-saude-escopo="favoritas" aria-pressed="${this.modoFavoritas === "favoritas"}"><i class="fas fa-star" aria-hidden="true"></i> Minhas favoritas <span id="saudeQtdFavoritas">${this.favoritasIds.size}</span></button>
                <button type="button" data-saude-escopo="todas" aria-pressed="${this.modoFavoritas === "todas"}"><i class="fas fa-list" aria-hidden="true"></i> Mostrar todas</button>
              </div>
              <p class="saude-filtros-hint" id="saudeFiltrosHint"></p>
              <button type="button" class="saude-limpar-filtros" data-saude-action="limpar-filtros"><i class="fas fa-eraser" aria-hidden="true"></i> Limpar filtros</button>
            </div>
            ${this.favoritasErro ? '<p class="saude-aviso-favoritas" role="status"><i class="fas fa-circle-exclamation" aria-hidden="true"></i> Não foi possível carregar suas favoritas. Você ainda pode escolher “Mostrar todas” ou tentar novamente ao voltar à tela.</p>' : ""}
          </div>

          <div class="saude-lista-atas" id="saudeListaAtas"></div>
        </section>
      </section>`;

    const page = container.querySelector(".saude-page");
    page?.addEventListener("input", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target?.closest("[data-saude-filtro]")) return;
      this.aplicarFiltrosDaTela(page, true);
    });
    page?.addEventListener("change", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target?.closest("[data-saude-filtro]")) return;
      this.aplicarFiltrosDaTela(page, true);
    });
    page?.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;

      const escopo = target.closest("[data-saude-escopo]");
      if (escopo) {
        this.modoFavoritas = escopo.dataset.saudeEscopo === "todas" ? "todas" : "favoritas";
        this.atualizarResultados(page);
        return;
      }

      const acao = target.closest("[data-saude-action]");
      if (acao?.dataset.saudeAction === "limpar-busca") {
        const input = page.querySelector('[data-saude-filtro="busca"]');
        if (input) input.value = "";
        this.aplicarFiltrosDaTela(page, false);
        input?.focus();
        return;
      }
      if (acao?.dataset.saudeAction === "limpar-filtros") {
        this.limparFiltros(page);
        return;
      }
      if (acao?.dataset.saudeAction === "recarregar") {
        this.carregarConteudo();
        return;
      }

      const buttonAta = target.closest("[data-saude-ata]");
      if (buttonAta) {
        const ata = this.atas.find(
          (item) => String(item.id) === buttonAta.dataset.saudeAta,
        );
        if (ata) this.abrirDetalhe(ata);
      }
    });

    this.atualizarResultados(page);
  }

  aplicarFiltrosDaTela(page, ativarTodas) {
    this.filtros = {
      busca: page.querySelector('[data-saude-filtro="busca"]')?.value || "",
      status: page.querySelector('[data-saude-filtro="status"]')?.value || "todos",
      vigencia: page.querySelector('[data-saude-filtro="vigencia"]')?.value || "todos",
      dias: page.querySelector('[data-saude-filtro="dias"]')?.value || "30",
      saude: page.querySelector('[data-saude-filtro="saude"]')?.value || "todos",
      categoria: page.querySelector('[data-saude-filtro="categoria"]')?.value || "todos",
      valorMin: page.querySelector('[data-saude-filtro="valorMin"]')?.value || "",
      valorMax: page.querySelector('[data-saude-filtro="valorMax"]')?.value || "",
      ordenacao: page.querySelector('[data-saude-filtro="ordenacao"]')?.value || "vencimento_asc",
    };
    if (ativarTodas && this.modoFavoritas === "favoritas") {
      this.modoFavoritas = "todas";
    }
    this.atualizarResultados(page);
  }

  limparFiltros(page) {
    this.filtros = {
      busca: "",
      status: "todos",
      vigencia: "todos",
      dias: "30",
      saude: "todos",
      categoria: "todos",
      valorMin: "",
      valorMax: "",
      ordenacao: "vencimento_asc",
    };
    this.modoFavoritas = "todas";
    page.querySelectorAll("[data-saude-filtro]").forEach((control) => {
      const key = control.dataset.saudeFiltro;
      if (key in this.filtros) control.value = this.filtros[key];
    });
    const busca = page.querySelector('[data-saude-filtro="busca"]');
    const limparBusca = page.querySelector('[data-saude-action="limpar-busca"]');
    if (limparBusca) limparBusca.hidden = !busca?.value;
    this.atualizarResultados(page);
  }

  atualizarResultados(page) {
    const lista = page.querySelector("#saudeListaAtas");
    if (!lista) return;

    const resultados = this.aplicarFiltros(this.resumos);
    lista.innerHTML = this.renderLista(resultados);

    const favoritasVisiveis = resultados.filter(({ ata }) =>
      this.favoritasIds.has(String(ata.id)),
    ).length;
    const contador = page.querySelector("#saudeContagem");
    if (contador) {
      contador.textContent = `${resultados.length} resultado${resultados.length === 1 ? "" : "s"} · ${favoritasVisiveis} favorita${favoritasVisiveis === 1 ? "" : "s"}`;
    }

    const quantidadeFavoritas = page.querySelector("#saudeQtdFavoritas");
    if (quantidadeFavoritas) quantidadeFavoritas.textContent = this.favoritasIds.size;

    page.querySelectorAll("[data-saude-escopo]").forEach((button) => {
      const ativo = button.dataset.saudeEscopo === this.modoFavoritas;
      button.classList.toggle("ativo", ativo);
      button.setAttribute("aria-pressed", String(ativo));
    });

    const hint = page.querySelector("#saudeFiltrosHint");
    if (hint) {
      hint.textContent =
        this.modoFavoritas === "favoritas"
          ? "Exibindo apenas suas favoritas. Ao usar outro filtro, todas as atas compatíveis entram no resultado, com as favoritas primeiro."
          : "Exibindo todas as atas que atendem aos filtros; suas favoritas aparecem primeiro e também respeitam os critérios aplicados.";
    }

    const busca = page.querySelector('[data-saude-filtro="busca"]');
    const limparBusca = page.querySelector('[data-saude-action="limpar-busca"]');
    if (limparBusca) limparBusca.hidden = !busca?.value;

    const diasWrap = page.querySelector("#saudeDiasWrap");
    if (diasWrap) {
      const mostrarDias = this.filtros.vigencia === "vencendo_em";
      diasWrap.hidden = !mostrarDias;
    }
  }

  aplicarFiltros(resumos) {
    const filtro = this.filtros;
    const termo = normalizar(filtro.busca.trim());
    const digitosBusca = termo.replace(/\D/g, "");
    const valorMin = filtro.valorMin === "" ? null : Number(filtro.valorMin);
    const valorMax = filtro.valorMax === "" ? null : Number(filtro.valorMax);
    const diasLimite = Math.max(1, Number(filtro.dias) || 30);

    const resultados = resumos.filter(({ ata, resumo }) => {
      const favorita = this.favoritasIds.has(String(ata.id));
      if (this.modoFavoritas === "favoritas" && !favorita) return false;

      if (termo) {
        const campos = [
          ata.numero_ata,
          ata.nome,
          ata.objeto,
          ata.processo_administrativo,
          ata.numero_pregao,
          ata.pregao_numero,
          ata.modalidade,
          ata.fornecedor?.razao_social,
          ata.fornecedor?.cnpj,
          ata.categoria?.nome,
          ...(ata.itens || []).map((item) => item.descricao),
        ];
        const texto = normalizar(campos.filter(Boolean).join(" "));
        const digitosTexto = texto.replace(/\D/g, "");
        if (!texto.includes(termo) && !(digitosBusca.length > 5 && digitosTexto.includes(digitosBusca))) {
          return false;
        }
      }

      const situacao = String(ata.situacao || "").toUpperCase();
      if (filtro.status === "NAO_INFORMADA" && situacao) return false;
      if (filtro.status !== "todos" && filtro.status !== "NAO_INFORMADA" && situacao !== filtro.status) {
        return false;
      }

      const inicioEmDias = diasAte(ata.data_inicio_vigencia);
      switch (filtro.vigencia) {
        case "vigentes_hoje":
          if (!resumo.ativa || (inicioEmDias !== null && inicioEmDias > 0) || (resumo.dias !== null && resumo.dias < 0)) return false;
          break;
        case "vencendo_em":
          if (resumo.vencida || resumo.dias === null || resumo.dias < 0 || resumo.dias > diasLimite) return false;
          break;
        case "vencidas":
          if (!resumo.vencida) return false;
          break;
        case "nao_iniciadas":
          if (inicioEmDias === null || inicioEmDias <= 0) return false;
          break;
        case "sem_data":
          if (ata.data_fim_vigencia) return false;
          break;
        default:
          break;
      }

      if (filtro.saude === "alertas" && resumo.motivos.length === 0) return false;
      if (filtro.saude === "saldo_baixo" && !resumo.saldoBaixo && resumo.itensBaixoSaldo === 0) return false;
      if (filtro.saude === "saldo_zerado" && !(resumo.valorGlobal > 0 && resumo.saldo <= 0)) return false;
      if (filtro.saude === "itens_sem_saldo" && resumo.itensSemSaldo === 0) return false;

      if (filtro.categoria !== "todos" && normalizar(ata.categoria?.nome) !== normalizar(filtro.categoria)) {
        return false;
      }
      if (valorMin !== null && resumo.valorGlobal < valorMin) return false;
      if (valorMax !== null && resumo.valorGlobal > valorMax) return false;
      return true;
    });

    const favoritaPrimeiro = (entry) =>
      this.favoritasIds.has(String(entry.ata.id)) ? 0 : 1;
    resultados.sort((a, b) => {
      const diferencaFavoritas = favoritaPrimeiro(a) - favoritaPrimeiro(b);
      if (diferencaFavoritas) return diferencaFavoritas;

      const dataA = a.resumo.dias;
      const dataB = b.resumo.dias;
      const dataAsc = () => {
        if (dataA === null) return dataB === null ? 0 : 1;
        if (dataB === null) return -1;
        return dataA - dataB;
      };
      const dataDesc = () => {
        if (dataA === null) return dataB === null ? 0 : 1;
        if (dataB === null) return -1;
        return dataB - dataA;
      };

      switch (filtro.ordenacao) {
        case "vencimento_desc":
          return dataDesc();
        case "valor_desc":
          return b.resumo.valorGlobal - a.resumo.valorGlobal;
        case "consumo_desc":
          return b.resumo.consumido - a.resumo.consumido;
        case "saldo_asc":
          return a.resumo.saldo - b.resumo.saldo;
        case "numero_asc":
          return String(a.ata.numero_ata || "").localeCompare(
            String(b.ata.numero_ata || ""),
            "pt-BR",
            { numeric: true, sensitivity: "base" },
          );
        case "fornecedor_asc":
          return String(a.ata.fornecedor?.razao_social || "").localeCompare(
            String(b.ata.fornecedor?.razao_social || ""),
            "pt-BR",
            { sensitivity: "base" },
          );
        default:
          return dataAsc();
      }
    });
    return resultados;
  }

  kpi(titulo, valor, icone, descricao, cor) {
    return `<article class="saude-kpi saude-kpi-${cor}"><span class="saude-kpi-icone"><i class="fas ${icone}" aria-hidden="true"></i></span><div><span class="saude-kpi-label">${escapeHtml(titulo)}</span><strong>${escapeHtml(valor)}</strong><small>${escapeHtml(descricao)}</small></div></article>`;
  }

  renderIndicadoresGerenciais() {
    const dados = this.dadosIndicadores || {};
    const erros = this.errosIndicadores || new Set();
    const indisponivel = (...chaves) => chaves.some((chave) => erros.has(chave));
    const n = (valor) => {
      const numero = Number(valor);
      return Number.isFinite(numero) ? numero : 0;
    };
    const qtd = (valor) => n(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const pct = (valor) => `${n(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    const dataLegivel = (valor) => {
      if (!valor) return "—";
      const data = new Date(`${String(valor).slice(0, 10)}T00:00:00`);
      return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
    };
    const nomeOrgao = new Map(
      (dados.orgaos || []).map((orgao) => [
        String(orgao.id),
        orgao.sigla ? `${orgao.sigla} · ${orgao.nome}` : orgao.nome || `Órgão ${orgao.id}`,
      ]),
    );
    const resumoPorAta = new Map(
      this.resumos.map(({ ata, resumo }) => [String(ata.id), resumo]),
    );
    const itensPorAta = new Map();
    const saldoPorAta = new Map();
    const financasPorItem = new Map();
    let valorCarteiraItens = 0;
    let saldoCarteiraItens = 0;

    for (const { ata, resumo } of this.resumos) {
      const itens = Array.isArray(ata.itens) ? ata.itens : [];
      let contratadoAta = 0;
      let saldoAta = 0;
      if (itens.length) {
        for (const item of itens) {
          const quantidade = n(item.quantidade_contratada);
          const unitario = n(item.valor_unitario);
          const contratado = Math.max(0, n(item.valor_total ?? quantidade * unitario));
          const saldoInformado = item.saldo_valor != null
            ? n(item.saldo_valor)
            : item.saldo_quantidade != null
              ? n(item.saldo_quantidade) * unitario
              : contratado;
          const saldoItem = Math.max(0, contratado > 0 ? Math.min(contratado, saldoInformado) : saldoInformado);
          contratadoAta += contratado;
          saldoAta += saldoItem;
          if (item.id != null) {
            financasPorItem.set(String(item.id), {
              ataId: String(ata.id),
              contratado,
              saldo: saldoItem,
              unitario,
            });
          }
        }
        if (contratadoAta <= 0) {
          contratadoAta = Math.max(0, n(resumo.valorGlobal));
          saldoAta = Math.max(0, Math.min(contratadoAta, n(resumo.saldo)));
        }
      } else {
        contratadoAta = Math.max(0, n(resumo.valorGlobal));
        saldoAta = Math.max(0, Math.min(contratadoAta, n(resumo.saldo)));
      }
      saldoPorAta.set(String(ata.id), saldoAta);
      itensPorAta.set(String(ata.id), itens);
      if (resumo.ativa) {
        valorCarteiraItens += contratadoAta;
        saldoCarteiraItens += saldoAta;
      }
    }

    const exposicao = { dias30: 0, dias60: 0, dias90: 0, vencidas: 0 };
    for (const { ata, resumo } of this.resumos) {
      const saldo = saldoPorAta.get(String(ata.id)) || 0;
      if (resumo.vencida || (resumo.dias !== null && resumo.dias < 0)) {
        exposicao.vencidas += saldo;
      } else if (resumo.dias !== null && resumo.dias <= 30) {
        exposicao.dias30 += saldo;
      } else if (resumo.dias !== null && resumo.dias <= 60) {
        exposicao.dias60 += saldo;
      } else if (resumo.dias !== null && resumo.dias <= 90) {
        exposicao.dias90 += saldo;
      }
    }

    const pedidos = dados.pedidos || [];
    const itensPedido = dados.itensPedido || [];
    const pedidoPorId = new Map(pedidos.map((pedido) => [String(pedido.id), pedido]));
    const itemPedidoPorId = new Map(itensPedido.map((item) => [String(item.id), item]));
    const statusFinal = new Set([
      "REPROVADO", "CANCELADO", "ENCERRADO", "ESTORNADO", "DEVOLVIDO",
      "LIBERADO", "LIBERADA", "DEVOLVIDO_AJUSTE", "PEDIDO_REALIZADO",
    ]);
    const normalizarStatus = (valor) => String(valor || "").trim().toUpperCase().replace(/\s+/g, "_");
    const atasAtivasIds = new Set(
      this.atas
        .filter((ata) => resumoPorAta.get(String(ata.id))?.ativa)
        .map((ata) => String(ata.id)),
    );
    const reservaBrutaPorItem = new Map();
    for (const reserva of dados.reservas || []) {
      const statusReserva = normalizarStatus(reserva.status);
      const pedido = pedidoPorId.get(String(reserva.pedido_id));
      const statusAprovacaoPedido = normalizarStatus(pedido?.status_aprovacao);
      const statusOperacionalPedido = normalizarStatus(pedido?.status);
      if (
        reserva.liberada_em ||
        statusFinal.has(statusReserva) ||
        statusFinal.has(statusAprovacaoPedido) ||
        statusFinal.has(statusOperacionalPedido)
      ) continue;
      const itemPedido = itemPedidoPorId.get(String(reserva.item_pedido_id));
      const itemAtaId = reserva.item_ata_id ?? itemPedido?.item_ata_id;
      const financa = financasPorItem.get(String(itemAtaId ?? ""));
      if (!financa || !atasAtivasIds.has(financa.ataId)) continue;
      const valorReserva = n(reserva.valor) > 0
        ? n(reserva.valor)
        : n(reserva.quantidade) * financa.unitario;
      const chave = String(itemAtaId);
      reservaBrutaPorItem.set(chave, (reservaBrutaPorItem.get(chave) || 0) + Math.max(0, valorReserva));
    }
    let reservado = 0;
    let excessoReserva = 0;
    for (const [itemId, valor] of reservaBrutaPorItem) {
      const saldo = financasPorItem.get(itemId)?.saldo || 0;
      reservado += Math.min(valor, saldo);
      excessoReserva += Math.max(0, valor - saldo);
    }
    reservado = Math.min(reservado, saldoCarteiraItens);
    const livre = Math.max(0, saldoCarteiraItens - reservado);
    const consumidoDerivado = Math.max(0, valorCarteiraItens - saldoCarteiraItens);
    const reservasDisponiveis = !indisponivel("reservas", "pedidos", "itensPedido");

    const totalAtas = this.atas.length;
    const cobertura = [
      ["Gestor cadastrado", this.atas.filter((ata) => ata.gestor_id).length],
      ["Fiscal cadastrado", this.atas.filter((ata) => ata.fiscal_id).length],
      ["Órgão responsável", this.atas.filter((ata) => ata.orgao_responsavel_id).length],
      ["Ato e data de designação", this.atas.filter((ata) => ata.ato_designacao && ata.data_designacao).length],
    ];

    const meses = [];
    const hoje = new Date();
    for (let indice = 11; indice >= 0; indice -= 1) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - indice, 1);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
      meses.push({ chave, rotulo: data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""), valor: 0 });
    }
    const mesPorChave = new Map(meses.map((mes) => [mes.chave, mes]));
    const consumoPorOrgao = new Map();
    for (const consumo of dados.consumos || []) {
      const data = String(consumo.data_consumo || consumo.created_at || "").slice(0, 7);
      const mes = mesPorChave.get(data);
      if (!mes) continue;
      const valor = n(consumo.valor_total ?? n(consumo.quantidade) * n(consumo.valor_unitario));
      mes.valor += valor;
      const orgaoId = consumo.orgao_solicitante_id;
      const nome = orgaoId == null
        ? "Órgão não informado"
        : nomeOrgao.get(String(orgaoId)) || `Órgão ${orgaoId}`;
      consumoPorOrgao.set(nome, (consumoPorOrgao.get(nome) || 0) + valor);
    }
    const consumo12Meses = meses.reduce((soma, mes) => soma + mes.valor, 0);
    const maxMes = Math.max(0, ...meses.map((mes) => mes.valor));
    const topOrgaos = [...consumoPorOrgao.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    const entreguesPorItem = new Map();
    for (const entrega of dados.itensEntregues || []) {
      const chave = String(entrega.item_pedido_id ?? "");
      if (!chave) continue;
      entreguesPorItem.set(chave, (entreguesPorItem.get(chave) || 0) + n(entrega.quantidade));
    }
    const ordensAguardando = pedidos.filter((pedido) =>
      normalizarStatus(pedido.status_aprovacao || "AGUARDANDO_APROVACAO") === "AGUARDANDO_APROVACAO" &&
      !statusFinal.has(normalizarStatus(pedido.status)),
    ).length;
    let ordensComPendencia = 0;
    let quantidadePendente = 0;
    let valorPendente = 0;
    const ordensAprovadas = pedidos.filter((pedido) =>
      normalizarStatus(pedido.status_aprovacao) === "APROVADO" &&
      !statusFinal.has(normalizarStatus(pedido.status)),
    );
    for (const pedido of ordensAprovadas) {
      let pendenciaPedido = 0;
      for (const item of itensPedido.filter((linha) => String(linha.pedido_id) === String(pedido.id))) {
        const quantidadeRestante = Math.max(0, n(item.quantidade_solicitada) - (entreguesPorItem.get(String(item.id)) || 0));
        if (!quantidadeRestante) continue;
        pendenciaPedido += quantidadeRestante;
        quantidadePendente += quantidadeRestante;
        valorPendente += quantidadeRestante * n(item.valor_unitario ?? (n(item.valor_total) / Math.max(n(item.quantidade_solicitada), 1)));
      }
      if (pendenciaPedido > 0) ordensComPendencia += 1;
    }
    const ocorrenciasAbertas = (dados.ocorrenciasPedidos || []).filter((ocorrencia) => !ocorrencia.resolvida).length;
    const entregasRegistradas = (dados.entregas || []).length;
    const totalEntregue = (dados.itensEntregues || []).reduce((total, item) => total + n(item.quantidade), 0);

    const fornecedores = new Map();
    const categorias = new Map();
    for (const ata of this.atas.filter((item) => resumoPorAta.get(String(item.id))?.ativa)) {
      const valor = n(resumoPorAta.get(String(ata.id))?.valorGlobal);
      const fornecedor = ata.fornecedor?.razao_social || ata.fornecedor?.nome_fantasia || "Fornecedor não informado";
      const chaveFornecedor = normalizar(fornecedor);
      const fornecedorAtual = fornecedores.get(chaveFornecedor) || { nome: fornecedor, valor: 0, atas: 0 };
      fornecedorAtual.valor += valor;
      fornecedorAtual.atas += 1;
      fornecedores.set(chaveFornecedor, fornecedorAtual);
      const itens = Array.isArray(ata.itens) ? ata.itens : [];
      if (!itens.length) {
        const categoria = ata.categoria?.nome || "Sem categoria";
        categorias.set(categoria, (categorias.get(categoria) || 0) + valor);
      } else {
        for (const item of itens) {
          const categoria = String(item.categoria || ata.categoria?.nome || "Sem categoria").trim();
          const valorItem = n(item.valor_total ?? n(item.quantidade_contratada) * n(item.valor_unitario));
          categorias.set(categoria, (categorias.get(categoria) || 0) + valorItem);
        }
      }
    }
    const topFornecedores = [...fornecedores.values()].sort((a, b) => b.valor - a.valor).slice(0, 5);
    const topCategorias = [...categorias.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
    const valorFornecedores = [...fornecedores.values()].reduce((soma, item) => soma + item.valor, 0);
    const valorCategorias = [...categorias.values()].reduce((soma, valor) => soma + valor, 0);

    const aditivos = dados.aditivos || [];
    const historicoPrecos = dados.historicoPrecos || [];
    const historicoItensAditivos = dados.itensAditivos || [];
    const variacoesItens = historicoItensAditivos
      .filter((linha) => linha.valor_total_anterior != null && linha.novo_valor_total != null)
      .map((linha) => n(linha.novo_valor_total) - n(linha.valor_total_anterior));
    const percentuaisReajuste = historicoPrecos.map((linha) => {
      if (linha.percentual_reajuste != null) return n(linha.percentual_reajuste);
      const anterior = n(linha.valor_anterior);
      return anterior > 0 ? ((n(linha.valor_novo) - anterior) / anterior) * 100 : null;
    }).filter((valor) => valor != null && Number.isFinite(valor));
    const mediaReajuste = percentuaisReajuste.length
      ? percentuaisReajuste.reduce((soma, valor) => soma + valor, 0) / percentuaisReajuste.length
      : null;
    const tiposAditivo = new Map();
    for (const aditivo of aditivos) {
      const tipo = String(aditivo.tipo_aditivo || "Tipo não informado");
      tiposAditivo.set(tipo, (tiposAditivo.get(tipo) || 0) + 1);
    }
    const tipoAditivoMaisComum = [...tiposAditivo.entries()].sort((a, b) => b[1] - a[1])[0];
    const dataMaisRecentePreco = historicoPrecos
      .map((linha) => linha.data_reajuste || linha.data_vigencia || linha.created_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    const itens = this.atas.flatMap((ata) => Array.isArray(ata.itens) ? ata.itens : []);
    const historicoAtas = dados.historicoAtas || [];
    const ultimaAlteracao = historicoAtas.map((linha) => linha.created_at).filter(Boolean).sort().at(-1);
    const itensTodos = this.atas.flatMap((ata) => Array.isArray(ata.itens) ? ata.itens : []);
    const itensSemSaldoGeral = itensTodos.filter((item) => n(item.saldo_quantidade) <= 0).length;
    const itensCriticosGeral = itensTodos.filter((item) => n(item.quantidade_contratada) > 0 && n(item.saldo_quantidade) > 0 && n(item.saldo_quantidade) / n(item.quantidade_contratada) <= 0.10).length;
    const consumoRegistradoTotal = (dados.consumos || []).reduce((soma, row) => soma + n(row.valor_total ?? n(row.quantidade) * n(row.valor_unitario)), 0);
    const qualidade = [
      ["Sem data final de vigência", this.atas.filter((ata) => !ata.data_fim_vigencia).length],
      ["Sem CNPJ do fornecedor", this.atas.filter((ata) => !ata.fornecedor?.cnpj).length],
      ["Itens sem descrição", itens.filter((item) => !String(item.descricao || "").trim()).length],
      ["Vigências com datas incoerentes", this.atas.filter((ata) => ata.data_inicio_vigencia && ata.data_fim_vigencia && ata.data_inicio_vigencia > ata.data_fim_vigencia).length],
    ];

    const stat = (rotulo, valor, nota = "") => `<div class="saude-indicador-stat"><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(valor)}</strong>${nota ? `<small>${escapeHtml(nota)}</small>` : ""}</div>`;
    const barra = (rotulo, valor, maximo, exibicao, nota = "") => {
      const largura = maximo > 0 ? Math.max(valor > 0 ? 2 : 0, Math.min(100, (valor / maximo) * 100)) : 0;
      return `<div class="saude-indicador-barra"><div class="saude-indicador-barra-titulo"><span title="${escapeHtml(rotulo)}">${escapeHtml(rotulo)}</span><strong>${escapeHtml(exibicao)}</strong></div><div class="saude-indicador-trilho" role="progressbar" aria-label="${escapeHtml(rotulo)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${largura.toFixed(1)}"><span style="width:${largura.toFixed(1)}%"></span></div>${nota ? `<small>${escapeHtml(nota)}</small>` : ""}</div>`;
    };
    const cardInicio = (icone, titulo, subtitulo, classe = "") => `<article class="saude-indicador-card ${classe}"><header class="saude-indicador-card-cabecalho"><span><i class="fas ${icone}" aria-hidden="true"></i></span><div><h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(subtitulo)}</p></div></header>`;
    const avisoSemDados = (texto) => `<p class="saude-indicador-vazio"><i class="fas fa-circle-info" aria-hidden="true"></i>${escapeHtml(texto)}</p>`;
    const linhasMeses = meses.map((mes) => barra(mes.rotulo, mes.valor, maxMes, moeda(mes.valor))).join("");
    const linhasOrgaos = topOrgaos.length
      ? topOrgaos.map((item) => barra(item.nome, item.valor, topOrgaos[0].valor, moeda(item.valor))).join("")
      : avisoSemDados("Ainda não há lançamentos de consumo por órgão no período consultado.");
    const linhasFornecedores = topFornecedores.length
      ? topFornecedores.map((item) => barra(item.nome, item.valor, topFornecedores[0].valor, moeda(item.valor), `${item.atas} ata(s) · ${pct(valorFornecedores ? item.valor / valorFornecedores * 100 : 0)} da carteira ativa`)).join("")
      : avisoSemDados("Não há fornecedor associado às atas vigentes.");
    const linhasCategorias = topCategorias.length
      ? topCategorias.map((item) => barra(item.nome, item.valor, topCategorias[0].valor, moeda(item.valor), `${pct(valorCategorias ? item.valor / valorCategorias * 100 : 0)} dos valores dos itens`)).join("")
      : avisoSemDados("Não há categorias de item informadas.");
    const linhasCobertura = cobertura.map(([rotulo, valor]) =>
      barra(rotulo, valor, totalAtas || 1, `${valor}/${totalAtas}`, `${pct(totalAtas ? valor / totalAtas * 100 : 0)} das atas`),
    ).join("");
    const linhasQualidade = qualidade.map(([rotulo, valor]) =>
      `<li><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(qtd(valor))}</strong></li>`,
    ).join("");
    const mesesHtml = indisponivel("consumos")
      ? avisoSemDados("Não foi possível consultar os lançamentos de consumo.")
      : consumo12Meses > 0
        ? linhasMeses
        : avisoSemDados("Sem lançamentos com data nos últimos 12 meses.");
    const organsHtml = indisponivel("consumos", "orgaos")
      ? avisoSemDados("Consumo por órgão indisponível: verifique as permissões das tabelas de consumo e órgãos.")
      : linhasOrgaos;
    const prioridades = [];
    if (exposicao.vencidas > 0) prioridades.push(`<li data-nivel="critica"><strong>Crítica</strong><span>${moeda(exposicao.vencidas)} de saldo em atas vencidas.</span></li>`);
    if (exposicao.dias30 > 0) prioridades.push(`<li data-nivel="alta"><strong>Alta</strong><span>${moeda(exposicao.dias30)} expostos em atas que vencem em até 30 dias.</span></li>`);
    if (ordensAguardando > 0) prioridades.push(`<li data-nivel="alta"><strong>Alta</strong><span>${qtd(ordensAguardando)} pedido(s) aguardando aprovação.</span></li>`);
    if (itensSemSaldoGeral > 0) prioridades.push(`<li data-nivel="alta"><strong>Alta</strong><span>${qtd(itensSemSaldoGeral)} item(ns) sem saldo; ${qtd(itensCriticosGeral)} em pré-ruptura.</span></li>`);
    if (cobertura.some(([, valor]) => valor < totalAtas)) prioridades.push(`<li data-nivel="media"><strong>Média</strong><span>${qtd(totalAtas)} ata(s) com alguma pendência de governança.</span></li>`);
    const filaPrioridades = prioridades.length ? prioridades.slice(0, 6).join("") : '<li data-nivel="info"><strong>Informativa</strong><span>Nenhuma prioridade calculada.</span></li>';
    return `<section class="saude-indicadores" aria-labelledby="saude-indicadores-titulo">
      <div class="saude-indicadores-heading"><div><span class="saude-indicadores-eyebrow">LEITURA GERENCIAL</span><h2 id="saude-indicadores-titulo">Indicadores para tomada de decisão</h2><p>Visão da carteira; os filtros da lista de atas abaixo não alteram estes totais.</p></div><span class="saude-indicadores-contexto">${this.atas.length} atas · ${itens.length} itens</span></div>
      <div class="saude-indicadores-grid">
        ${cardInicio("fa-list-check", "Fila de decisão", "Alertas ordenados por impacto financeiro, prazo e operação.", "saude-indicador-largo")}
          <ul class="saude-fila-prioridades">${filaPrioridades}</ul>
          <p class="saude-indicador-nota">Cada item deve ser aberto para confirmar saldo, vigência e responsável antes da ação.</p>
        </article>
        ${cardInicio("fa-hourglass-half", "Saldo exposto ao vencimento", "Saldo estimado remanescente por faixa de vencimento.", "saude-indicador-metade")}
          <div class="saude-indicador-stats saude-indicador-stats-quatro">${stat("Até 30 dias", moeda(exposicao.dias30))}${stat("31–60 dias", moeda(exposicao.dias60))}${stat("61–90 dias", moeda(exposicao.dias90))}${stat("Atas vencidas", moeda(exposicao.vencidas))}</div>
          <p class="saude-indicador-nota">Cálculo por saldo de item (<code>saldo_valor</code>; na ausência, quantidade remanescente × preço unitário). Atas sem data final não entram nas faixas.</p>
        </article>

        ${cardInicio("fa-scale-balanced", "Livre × reservado × consumido", "Composição financeira das atas vigentes a partir dos saldos dos itens.", "saude-indicador-metade")}
          <div class="saude-indicador-stats">${stat("Livre após reservas", reservasDisponiveis ? moeda(livre) : "Indisponível")}${stat("Reservado", reservasDisponiveis ? moeda(reservado) : "Indisponível")}${stat("Consumido estimado", moeda(consumidoDerivado))}</div>
          ${reservasDisponiveis ? `<div class="saude-indicador-faixa"><span style="width:${valorCarteiraItens > 0 ? Math.min(100, livre / valorCarteiraItens * 100).toFixed(1) : 0}%"></span><span style="width:${valorCarteiraItens > 0 ? Math.min(100, reservado / valorCarteiraItens * 100).toFixed(1) : 0}%"></span><span style="width:${valorCarteiraItens > 0 ? Math.min(100, consumidoDerivado / valorCarteiraItens * 100).toFixed(1) : 0}%"></span></div><div class="saude-indicador-legenda"><span><i class="livre"></i>Livre</span><span><i class="reservado"></i>Reservado</span><span><i class="consumido"></i>Consumido</span></div>${excessoReserva > 0 ? `<p class="saude-indicador-alerta"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> ${moeda(excessoReserva)} em reservas supera o saldo dos itens vinculados; revisar vínculos/status.</p>` : ""}` : avisoSemDados("Não foi possível confirmar reservas, pedidos e itens de pedido; o saldo livre não será estimado como zero.")}
          <p class="saude-indicador-nota">“Consumido” é estimado por valor contratado dos itens menos saldo atual. Reservas consideradas são as não liberadas e ligadas a pedidos não encerrados.</p>
        </article>

        ${cardInicio("fa-user-shield", "Cobertura de gestão e fiscalização", "Preenchimento dos responsáveis e do ato de designação nas atas.", "saude-indicador-metade")}
          <div class="saude-indicador-barras">${linhasCobertura}</div>
          <p class="saude-indicador-nota">A cobertura é contada sobre todas as atas cadastradas; “ato e data” exige os dois campos.</p>
        </article>

        ${cardInicio("fa-chart-column", "Consumo por órgão e evolução mensal", "Valores lançados nos últimos 12 meses, com base na data de consumo.", "saude-indicador-largo")}
          ${indisponivel("consumos") ? avisoSemDados("Dados mensais indisponíveis.") : `<div class="saude-indicador-consumo-grid"><div><h4>Evolução mensal</h4><div class="saude-indicador-barras">${mesesHtml}</div></div><div><h4>Órgãos com maior consumo</h4><div class="saude-indicador-barras">${organsHtml}</div></div></div>`}
          <p class="saude-indicador-nota">Total registrado no período: ${indisponivel("consumos") ? "indisponível" : moeda(consumo12Meses)}. Base histórica atual: ${moeda(consumoRegistradoTotal)} em lançamentos. Sem movimentação suficiente, não há projeção de tendência.</p>
        </article>

        ${cardInicio("fa-truck-fast", "Pedidos pendentes e entregas", "Aprovações aguardando decisão e saldo de entrega dos pedidos aprovados.", "saude-indicador-metade")}
          ${indisponivel("pedidos") ? avisoSemDados("Não foi possível consultar os pedidos.") : `<div class="saude-indicador-stats">${stat("Aguardando aprovação", qtd(ordensAguardando))}${stat("Pedidos com entrega pendente", indisponivel("itensPedido", "itensEntregues") ? "Indisponível" : qtd(ordensComPendencia))}${stat("Quantidade pendente", indisponivel("itensPedido", "itensEntregues") ? "Indisponível" : qtd(quantidadePendente))}${stat("Entregas registradas", indisponivel("entregas") ? "Indisponível" : qtd(entregasRegistradas))}</div><p class="saude-indicador-nota">${indisponivel("itensPedido", "itensEntregues") ? "Pendência de entrega não calculável porque itens/recebimentos estão indisponíveis." : `${qtd(totalEntregue)} unidade(s) recebida(s) registrada(s); valor estimado pendente: ${moeda(valorPendente)}.`} ${indisponivel("ocorrenciasPedidos") ? "Ocorrências não disponíveis." : `${qtd(ocorrenciasAbertas)} ocorrência(s) de pedido sem resolução.`}</p>`}
          <p class="saude-indicador-nota">O esquema não informa prazo contratual de entrega; por isso este painel não classifica pedidos como atrasados.</p>
        </article>

        ${cardInicio("fa-chart-pie", "Concentração por fornecedor e categoria", "Valor global das atas vigentes e composição dos valores dos itens.", "saude-indicador-metade")}
          <div class="saude-indicador-duas-listas"><div><h4>Fornecedores</h4><div class="saude-indicador-barras">${linhasFornecedores}</div></div><div><h4>Categorias de item</h4><div class="saude-indicador-barras">${linhasCategorias}</div></div></div>
          <p class="saude-indicador-nota">Ranking dos cinco maiores; a participação usa os valores cadastrados, não mede desempenho ou risco de mercado.</p>
        </article>

        ${cardInicio("fa-file-signature", "Aditivos e reajustes", "Alterações contratuais e variações de preço efetivamente registradas.", "saude-indicador-metade")}
          ${indisponivel("aditivos", "historicoPrecos") ? avisoSemDados("Histórico de aditivos ou preços indisponível.") : `<div class="saude-indicador-stats">${stat("Aditivos registrados", qtd(aditivos.length))}${stat("Itens com snapshot de alteração", indisponivel("itensAditivos") ? "Indisponível" : qtd(variacoesItens.length))}${stat("Reajustes registrados", qtd(historicoPrecos.length))}${stat("Reajuste médio informado", mediaReajuste === null ? "—" : pct(mediaReajuste))}</div><p class="saude-indicador-nota">${tipoAditivoMaisComum ? `Tipo mais frequente: ${escapeHtml(tipoAditivoMaisComum[0])} (${qtd(tipoAditivoMaisComum[1])}). ` : ""}${variacoesItens.length ? `Variação líquida dos snapshots por item: ${moeda(variacoesItens.reduce((soma, valor) => soma + valor, 0))}. ` : "Sem snapshots suficientes para estimar variação financeira por item. "}${dataMaisRecentePreco ? `Último reajuste: ${dataLegivel(dataMaisRecentePreco)}.` : "Sem data de reajuste registrada."}</p>`}
        </article>

        ${cardInicio("fa-clipboard-check", "Qualidade e histórico dos dados", "Pendências de cadastro que podem reduzir a confiabilidade da análise.", "saude-indicador-metade")}
          <div class="saude-indicador-cobertura-resumo"><strong>${qtd(totalAtas)}</strong><span>atas · ${qtd(itens.length)} itens avaliados</span></div>
          <ul class="saude-indicador-qualidade">${linhasQualidade}</ul>
          <div class="saude-indicador-historico"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i><span>${indisponivel("historicoAtas") ? "Histórico de alterações indisponível." : `${qtd(historicoAtas.length)} alteração(ões) registradas; última: ${dataLegivel(ultimaAlteracao)}.`}</span></div>
          <p class="saude-indicador-nota">A checagem é indicativa e não substitui validação documental; valores antigos/novos do histórico não são exibidos.</p>
        </article>
      </div>
    </section>`;
  }

  renderLista(entradas) {
    if (!entradas.length) {
      if (this.modoFavoritas === "favoritas" && this.favoritasIds.size === 0) {
        return `<div class="saude-empty"><i class="fas fa-star" aria-hidden="true"></i><h3>Nenhuma ata favorita encontrada</h3><p>Favorite atas na aba Consulta para vê-las aqui ou confira todas as atas.</p><button type="button" class="saude-btn saude-btn-principal" data-saude-escopo="todas" aria-pressed="false"><i class="fas fa-list" aria-hidden="true"></i> Mostrar todas as atas</button></div>`;
      }
      const mensagem =
        this.modoFavoritas === "favoritas"
          ? "Nenhuma das suas favoritas atende aos filtros selecionados."
          : "Nenhuma ata corresponde aos filtros. Ajuste os critérios ou limpe a busca.";
      return `<div class="saude-empty"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><h3>Nenhuma ata encontrada</h3><p>${escapeHtml(mensagem)}</p></div>`;
    }

    return entradas
      .map(({ ata, resumo }) => {
        const favorita = this.favoritasIds.has(String(ata.id));
        const statusLabel = resumo.vencida
          ? "Vencida"
          : resumo.dias !== null && resumo.dias <= 30
            ? "Vence em breve"
            : resumo.situacao;
        const classe = resumo.vencida
          ? "critico"
          : (resumo.dias !== null && resumo.dias <= 30) || resumo.saldoBaixo
            ? "atencao"
            : "ok";
        const dataAlerta = resumo.vencida
          ? resumo.dias !== null && resumo.dias < 0
            ? `Vencida há ${Math.abs(resumo.dias)} dias`
            : "Situação cadastrada como vencida"
          : resumo.dias !== null && resumo.dias >= 0 && resumo.dias <= 90
            ? `Vence em ${resumo.dias} dias`
            : formatarData(ata.data_fim_vigencia);
        const itensPreview = (ata.itens || [])
          .slice(0, 2)
          .map((item) => {
            const descricao = String(item.descricao || "Item sem descrição").trim();
            const curta = descricao.length > 50 ? `${descricao.slice(0, 50).trimEnd()}…` : descricao;
            return `<span title="${escapeHtml(descricao)}">${escapeHtml(curta)}</span>`;
          })
          .join("");
        const rotuloConsumo =
          resumo.percentualConsumido === null
            ? "Consumo n/d"
            : `${resumo.percentualConsumido.toFixed(1)}% consumido`;

        return `<article class="saude-ata-card">
          <div class="saude-ata-card-main">
            <div class="saude-ata-titulo">
              <span class="saude-status saude-status-${classe}"><i class="fas ${classe === "critico" ? "fa-circle-exclamation" : classe === "atencao" ? "fa-triangle-exclamation" : "fa-circle-check"}" aria-hidden="true"></i>${escapeHtml(statusLabel)}</span>
              <h3>Ata nº ${escapeHtml(ata.numero_ata || "—")}</h3>
              ${favorita ? '<span class="saude-favorita-badge"><i class="fas fa-star" aria-hidden="true"></i> Favorita</span>' : ""}
            </div>
            <p class="saude-fornecedor"><i class="fas fa-building" aria-hidden="true"></i>${escapeHtml(ata.fornecedor?.razao_social || "Fornecedor não informado")} <span>${ata.fornecedor?.cnpj ? `· CNPJ ${escapeHtml(ata.fornecedor.cnpj)}` : ""}</span></p>
            <div class="saude-ata-meta">
              <span><i class="fas fa-calendar" aria-hidden="true"></i>${escapeHtml(dataAlerta)}</span>
              <span><i class="fas fa-boxes-stacked" aria-hidden="true"></i>${(ata.itens || []).length} ${(ata.itens || []).length === 1 ? "item" : "itens"}</span>
              <span><i class="fas fa-chart-pie" aria-hidden="true"></i>${escapeHtml(rotuloConsumo)}</span>
            </div>
            ${itensPreview ? `<div class="saude-item-preview"><strong>Itens:</strong>${itensPreview}</div>` : ""}
          </div>
          <div class="saude-ata-card-financeiro">
            <span>Valor global <strong>${moeda(resumo.valorGlobal)}</strong></span>
            <span>Consumido <strong>${moeda(resumo.consumido)}</strong></span>
            <span>Saldo estimado <strong>${moeda(resumo.saldo)}</strong></span>
            <button type="button" class="saude-btn saude-btn-principal" data-saude-ata="${escapeHtml(ata.id)}">Ver saúde da ata <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
          </div>
        </article>`;
      })
      .join("");
  }

  abrirDetalhe(ata) {
    if (ata?.id) this.sistema.abrirSaudeAta(ata.id);
  }
}
