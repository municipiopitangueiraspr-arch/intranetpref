// ============================================================
// controle-de-saldos/js/modules/editar-ata.js
// Módulo de Edição de Atas
// ============================================================

import { supabase } from "../supabase.js";

export class EditarAta {
  constructor(sistema) {
    this.sistema = sistema;
    this.ataId = null;
    this.ataDados = null;
    this.itens = [];
    this.itensRemovidos = [];
    this.historico = [];
    this.fornecedoresCache = [];
    this.categoriasCache = [];
    this.isSaving = false;
    this._itemCounter = 0;
  }

  // ============================================================
  // CARREGAR CONTEÚDO DA PÁGINA DE EDIÇÃO
  // ============================================================
  async carregarConteudo(ataId) {
    try {
      this.sistema.mostrarLoading("Carregando dados da ata...");

      this.ataId = ataId;

      // Carregar dados auxiliares
      await this.carregarDadosAuxiliares();

      // Carregar dados da ata
      await this.carregarAta(ataId);

      // Carregar itens da ata
      await this.carregarItens(ataId);

      // Carregar histórico
      await this.carregarHistorico(ataId);

      // Preencher formulário
      this.preencherFormulario();

      // Configurar eventos
      this.configurarEventos();

      // Atualizar informações do usuário
      this.atualizarUserInfo();

      this.sistema.esconderLoading();
    } catch (error) {
      console.error("Erro ao carregar conteúdo:", error);
      this.sistema.esconderLoading();
      this.sistema.ui.mostrarToast("erro", "Erro ao carregar dados da ata.");
    }
  }

  // ============================================================
  // CARREGAR DADOS AUXILIARES
  // ============================================================
  async carregarDadosAuxiliares() {
    try {
      // Carregar fornecedores
      const { data: fornecedores } = await supabase
        .from("fornecedores")
        .select("id, razao_social, cnpj")
        .order("razao_social");
      this.fornecedoresCache = fornecedores || [];

      // Carregar categorias
      const { data: categorias } = await supabase
        .from("categorias")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      this.categoriasCache = categorias || [];
    } catch (error) {
      console.error("Erro ao carregar dados auxiliares:", error);
      throw error;
    }
  }

  // ============================================================
  // CARREGAR ATA
  // ============================================================
  async carregarAta(ataId) {
    try {
      const { data: ata, error } = await supabase
        .from("atas")
        .select(
          `
          *,
          fornecedor:fornecedores(razao_social, cnpj),
          categoria:categorias(id, nome)
        `,
        )
        .eq("id", ataId)
        .single();

      if (error) throw error;
      if (!ata) {
        throw new Error("Ata não encontrada.");
      }

      this.ataDados = ata;

      // Atualizar display do número da ata
      const numeroDisplay = document.getElementById("ataNumeroDisplay");
      if (numeroDisplay) {
        numeroDisplay.textContent = `Nº ${ata.numero_ata || "000/2026"}`;
        const modalidadeDisplay = document.getElementById("ataModalidadeDisplay");
        if (modalidadeDisplay) modalidadeDisplay.textContent = ata.modalidade || "Modalidade não informada";
      }

      // Atualizar status badge
      const statusBadge = document.getElementById("ataStatusBadge");
      if (statusBadge) {
        const statusMap = {
          ATIVA: "status-ativa",
          PROXIMA: "status-proxima",
          VENCIDA: "status-vencida",
        };
        statusBadge.className = `status-badge ${statusMap[ata.situacao] || "status-ativa"}`;
        statusBadge.textContent = ata.situacao || "ATIVA";
      }

      // Atualizar ID display
      const idDisplay = document.getElementById("ataIdDisplay");
      if (idDisplay) {
        idDisplay.textContent = `ID: ${ata.id}`;
      }

      // Mostrar botão de excluir apenas para ADMIN
      const btnExcluir = document.getElementById("btnExcluir");
      if (btnExcluir) {
        const perfil = this.sistema.usuarioAtual?.perfil;
        btnExcluir.style.display = perfil === "ADMIN" ? "inline-flex" : "none";
      }
    } catch (error) {
      console.error("Erro ao carregar ata:", error);
      throw error;
    }
  }

  // ============================================================
  // CARREGAR ITENS DA ATA
  // ============================================================
  async carregarItens(ataId) {
    try {
      const { data: itens, error } = await supabase
        .from("itens_ata")
        .select("*")
        .eq("ata_id", ataId)
        .order("item_numero", { ascending: true });

      if (error) throw error;

      this.itens = itens || [];
      this.itensOriginais = JSON.parse(JSON.stringify(this.itens));
      this._itemCounter = this.itens.length;
    } catch (error) {
      console.error("Erro ao carregar itens:", error);
      throw error;
    }
  }

  // ============================================================
  // CARREGAR HISTÓRICO DE ALTERAÇÕES
  // ============================================================
  async carregarHistorico(ataId) {
    try {
      const { data: historico, error } = await supabase
        .from("atas_historico")
        .select(
          `
          *,
          usuario:usuarios(nome)
        `,
        )
        .eq("ata_id", ataId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      this.historico = historico || [];

      // Atualizar contador do histórico
      const countEl = document.getElementById("historicoCount");
      if (countEl) {
        countEl.textContent = `${this.historico.length} registros`;
      }

      // Renderizar histórico
      this.renderizarHistorico();
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
      // Não interrompe o fluxo se o histórico não carregar
      this.historico = [];
      this.renderizarHistorico();
    }
  }

  // ============================================================
  // RENDERIZAR HISTÓRICO
  // ============================================================
  renderizarHistorico() {
    const container = document.getElementById("historicoContainer");
    const placeholder = document.getElementById("historicoPlaceholder");
    const lista = document.getElementById("historicoLista");

    if (!container) return;

    if (this.historico.length === 0) {
      if (placeholder) placeholder.style.display = "block";
      if (lista) lista.style.display = "none";
      return;
    }

    if (placeholder) placeholder.style.display = "none";
    if (lista) {
      lista.style.display = "block";
      lista.innerHTML = this.historico
        .map((item) => {
          const data = new Date(item.created_at).toLocaleString("pt-BR");
          const usuarioNome = item.usuario?.nome || "Desconhecido";
          const campoFormatado = this.formatarNomeCampo(item.campo_alterado);

          return `
          <div class="historico-item" onclick="window.abrirModalHistoricoDetalhes(${JSON.stringify(
            {
              id: item.id,
              campo_alterado: campoFormatado,
              valor_antigo: item.valor_antigo,
              valor_novo: item.valor_novo,
              created_at: item.created_at,
              usuario_nome: usuarioNome,
            },
          ).replace(/"/g, "&quot;")})" style="cursor: pointer;">
            <div class="historico-item-left">
              <span class="historico-campo">${campoFormatado}</span>
              <span class="historico-descricao">
                <span class="historico-antigo">${item.valor_antigo || "<em>vazio</em>"}</span>
                <i class="fas fa-arrow-right" style="font-size: 0.6rem; color: var(--neutral-400);"></i>
                <span class="historico-novo">${item.valor_novo || "<em>vazio</em>"}</span>
              </span>
            </div>
            <div class="historico-item-right">
              <span class="historico-usuario">${usuarioNome}</span>
              <span class="historico-data">${data}</span>
              <i class="fas fa-chevron-right" style="color: var(--neutral-400); font-size: 0.7rem;"></i>
            </div>
          </div>
        `;
        })
        .join("");
    }
  }

  // ============================================================
  // FORMATAR NOME DO CAMPO PARA EXIBIÇÃO
  // ============================================================
  formatarNomeCampo(campo) {
    const map = {
      numero_ata: "Número da Ata",
      modalidade: "Modalidade",
      numero_pregao: "Número do Pregão",
      processo_administrativo: "Processo",
      objeto: "Objeto",
      fornecedor_id: "Fornecedor",
      categoria_id: "Categoria",
      data_inicio_vigencia: "Vigência Início",
      data_fim_vigencia: "Vigência Fim",
      valor_global: "Valor Global",
      situacao: "Status",
      observacao: "Observações",
      item_descricao: "Item - Descrição",
      item_quantidade: "Item - Quantidade",
      item_valor_unitario: "Item - Valor Unitário",
      item_valor_total: "Item - Valor Total",
      item_adicionado: "Item Adicionado",
      item_removido: "Item Removido",
    };
    return map[campo] || campo;
  }

  // ============================================================
  // PREENCHER FORMULÁRIO
  // ============================================================
  preencherFormulario() {
    const ata = this.ataDados;
    if (!ata) return;

    // Preencher campos básicos
    document.getElementById("editarNumeroAta").value = ata.numero_ata || "";
    document.getElementById("editarModalidade").value = ata.modalidade || "";
    document.getElementById("editarNumeroPregao").value =
      ata.pregao_numero || ata.numero_pregao || "";
    document.getElementById("editarProcesso").value =
      ata.processo_administrativo || "";
    document.getElementById("editarObjeto").value = ata.objeto || "";
    document.getElementById("editarDataInicio").value =
      ata.data_inicio_vigencia || "";
    document.getElementById("editarDataFim").value =
      ata.data_fim_vigencia || "";
    document.getElementById("editarValorGlobal").value = ata.valor_global || "";
    document.getElementById("editarObservacao").value = ata.observacao || "";

    // Preencher status
    const statusSelect = document.getElementById("editarStatus");
    if (statusSelect) {
      statusSelect.value = ata.situacao || "ATIVA";
    }

    // Preencher fornecedor
    const fornecedorSelect = document.getElementById("editarFornecedor");
    if (fornecedorSelect) {
      fornecedorSelect.innerHTML =
        '<option value="">Selecione um fornecedor...</option>';
      this.fornecedoresCache.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = `${f.razao_social}${f.cnpj ? ` (${this.formatarCnpj(f.cnpj)})` : ""}`;
        if (f.id === ata.fornecedor_id) opt.selected = true;
        fornecedorSelect.appendChild(opt);
      });
    }

    // Preencher categoria
    const categoriaSelect = document.getElementById("editarCategoria");
    if (categoriaSelect) {
      categoriaSelect.innerHTML =
        '<option value="">Selecione uma categoria...</option>';
      this.categoriasCache.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.nome;
        if (c.id === ata.categoria_id) opt.selected = true;
        categoriaSelect.appendChild(opt);
      });
    }

    // Preencher itens
    this.renderizarItens();
  }

  // ============================================================
  // RENDERIZAR ITENS
  // ============================================================
  renderizarItens() {
    const tbody = document.getElementById("itensBody");
    const vazio = document.getElementById("itensVazio");
    const totalDisplay = document.getElementById("totalItensValor");
    const totalItensDisplay = document.getElementById("totalItensDisplay");

    if (!tbody) return;

    if (this.itens.length === 0) {
      tbody.innerHTML = "";
      if (vazio) vazio.style.display = "block";
      if (totalItensDisplay) totalItensDisplay.textContent = "0 itens";
      if (totalDisplay) totalDisplay.textContent = "R$ 0,00";
      return;
    }

    if (vazio) vazio.style.display = "none";
    if (totalItensDisplay) {
      totalItensDisplay.textContent = `${this.itens.length} itens`;
    }

    // Calcular total
    let totalGeral = 0;

    tbody.innerHTML = this.itens
      .map((item, index) => {
        const valorTotal =
          (item.quantidade_contratada || 0) * (item.valor_unitario || 0);
        totalGeral += valorTotal;

        return `
        <tr data-item-index="${index}" data-item-id="${item.id || "novo-" + Date.now() + "-" + index}">
          <td>
            <input type="text" class="form-input item-numero" value="${item.item_numero || ""}"
                   placeholder="001" style="width: 100%; padding: 4px 8px; font-size: 0.8rem;">
          </td>
          <td>
            <input type="text" class="form-input item-descricao" value="${item.descricao || ""}"
                   placeholder="Descrição do item" style="width: 100%; padding: 4px 8px; font-size: 0.8rem;">
          </td>
          <td>
            <input type="number" class="form-input item-quantidade" value="${item.quantidade_contratada || 0}"
                   min="0" step="1" style="width: 100%; padding: 4px 8px; font-size: 0.8rem; text-align: right;">
          </td>
          <td>
            <input type="number" class="form-input item-valor-unitario" value="${item.valor_unitario || 0}"
                   min="0" step="0.01" style="width: 100%; padding: 4px 8px; font-size: 0.8rem; text-align: right;">
          </td>
          <td class="item-valor-total" style="text-align: right; font-weight: 600;">
            ${this.sistema.ui.formatarMoeda(valorTotal)}
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn-remover-item" onclick="window.removerItem(${index})"
                    style="background: none; border: none; color: var(--error-600); cursor: pointer; padding: 4px 8px;">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
      })
      .join("");

    // Atualizar total
    if (totalDisplay) {
      totalDisplay.textContent = this.sistema.ui.formatarMoeda(totalGeral);
    }

    // Adicionar eventos para recalcular total
    tbody
      .querySelectorAll(".item-quantidade, .item-valor-unitario")
      .forEach((input) => {
        input.addEventListener("input", () => this.recalcularTotais());
      });

    // Adicionar eventos para remoção via tecla Delete
    tbody
      .querySelectorAll(
        ".item-numero, .item-descricao, .item-quantidade, .item-valor-unitario",
      )
      .forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Delete" || e.key === "Backspace") {
            const tr = input.closest("tr");
            if (tr) {
              const index = parseInt(tr.dataset.itemIndex);
              if (!isNaN(index)) {
                e.preventDefault();
                window.removerItem(index);
              }
            }
          }
        });
      });
  }

  // ============================================================
  // RECALCULAR TOTAIS DOS ITENS
  // ============================================================
  recalcularTotais() {
    const rows = document.querySelectorAll("#itensBody tr");
    let totalGeral = 0;

    rows.forEach((row) => {
      const quantidade =
        parseFloat(row.querySelector(".item-quantidade")?.value) || 0;
      const valorUnitario =
        parseFloat(row.querySelector(".item-valor-unitario")?.value) || 0;
      const valorTotal = quantidade * valorUnitario;

      const totalCell = row.querySelector(".item-valor-total");
      if (totalCell) {
        totalCell.textContent = this.sistema.ui.formatarMoeda(valorTotal);
      }

      totalGeral += valorTotal;
    });

    const totalDisplay = document.getElementById("totalItensValor");
    if (totalDisplay) {
      totalDisplay.textContent = this.sistema.ui.formatarMoeda(totalGeral);
    }
  }

  // ============================================================
  // ADICIONAR ITEM
  // ============================================================
  adicionarItem() {
    this._itemCounter++;
    this.itens.push({
      id: null,
      item_numero: String(this._itemCounter).padStart(3, "0"),
      descricao: "",
      quantidade_contratada: 0,
      valor_unitario: 0,
      valor_total: 0,
      _novo: true,
    });
    this.renderizarItens();

    // Scroll para o novo item
    const tbody = document.getElementById("itensBody");
    if (tbody) {
      const lastRow = tbody.querySelector("tr:last-child");
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: "smooth", block: "center" });
        const primeiroInput = lastRow.querySelector("input");
        if (primeiroInput) primeiroInput.focus();
      }
    }
  }

  // ============================================================
  // REMOVER ITEM
  // ============================================================
  removerItem(index) {
    if (index < 0 || index >= this.itens.length) return;

    const item = this.itens[index];

    // Se o item já existe no banco, marcar para remoção
    if (item.id) {
      this.itensRemovidos.push(item.id);
    }

    this.itens.splice(index, 1);
    this.renderizarItens();
    this.recalcularTotais();
  }

  // ============================================================
  // CONFIGURAR EVENTOS DO FORMULÁRIO
  // ============================================================
  configurarEventos() {
    // Botão adicionar item
    const btnAdicionar = document.getElementById("btnAdicionarItem");
    if (btnAdicionar) {
      btnAdicionar.addEventListener("click", () => this.adicionarItem());
    }

    // Botão salvar
    const btnSalvar = document.getElementById("btnSalvar");
    if (btnSalvar) {
      btnSalvar.addEventListener("click", (e) => {
        e.preventDefault();
        this.salvarAlteracoes();
      });
    }

    // Botão cancelar
    const btnCancelar = document.getElementById("btnCancelar");
    if (btnCancelar) {
      btnCancelar.addEventListener("click", () => {
        this.sistema
          .confirmar(
            "Tem certeza que deseja cancelar? As alterações não serão salvas.",
          )
          .then((confirmado) => {
            if (confirmado) {
              window.history.back();
            }
          });
      });
    }

    // Botão excluir
    const btnExcluir = document.getElementById("btnExcluir");
    if (btnExcluir) {
      btnExcluir.addEventListener("click", () => {
        this.sistema.abrirModalExclusao();
      });
    }

    // Validar datas
    const dataInicio = document.getElementById("editarDataInicio");
    const dataFim = document.getElementById("editarDataFim");

    if (dataInicio && dataFim) {
      dataInicio.addEventListener("change", () => this.validarDatas());
      dataFim.addEventListener("change", () => this.validarDatas());
    }

    // Evento de teclado Ctrl+S para salvar
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        this.salvarAlteracoes();
      }
    });
  }

  // ============================================================
  // VALIDAR DATAS
  // ============================================================
  validarDatas() {
    const dataInicio = document.getElementById("editarDataInicio");
    const dataFim = document.getElementById("editarDataFim");

    if (dataInicio && dataFim && dataInicio.value && dataFim.value) {
      const inicio = new Date(dataInicio.value);
      const fim = new Date(dataFim.value);

      if (fim < inicio) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "A data de fim deve ser posterior à data de início.",
        );
      }
    }
  }

  // ============================================================
  // SALVAR ALTERAÇÕES
  // ============================================================
  async salvarAlteracoes() {
    if (this.isSaving) return;

    try {
      // Validar formulário
      if (!this.validarFormulario()) {
        return;
      }

      // Confirmar com usuário
      const confirmado = await this.sistema.confirmar(
        "Deseja salvar as alterações feitas nesta ata?",
      );
      if (!confirmado) return;

      this.isSaving = true;
      this.sistema.mostrarLoading("Salvando alterações...");

      // Coletar dados do formulário
      const dadosAtualizados = this.coletarDadosFormulario();

      // Verificar o que mudou
      const alteracoes = this.compararDados(this.ataDados, dadosAtualizados);

      // Atualizar a ata
      const { error: updateError } = await supabase
        .from("atas")
        .update({
          numero_ata: dadosAtualizados.numero_ata,
          modalidade: dadosAtualizados.modalidade,
          pregao_numero: dadosAtualizados.numero_pregao,
          processo_administrativo: dadosAtualizados.processo_administrativo,
          objeto: dadosAtualizados.objeto,
          fornecedor_id: dadosAtualizados.fornecedor_id,
          categoria_id: dadosAtualizados.categoria_id,
          data_inicio_vigencia: dadosAtualizados.data_inicio_vigencia,
          data_fim_vigencia: dadosAtualizados.data_fim_vigencia,
          valor_global: dadosAtualizados.valor_global,
          situacao: dadosAtualizados.situacao,
          observacao: dadosAtualizados.observacao,
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.ataId);

      if (updateError) throw updateError;

      // Registrar alterações no histórico
      if (alteracoes.length > 0) {
        await this.registrarHistorico(alteracoes);
      }

      // Processar itens
      await this.processarItens();

      // Atualizar dados locais
      this.ataDados = dadosAtualizados;
      this.itensOriginais = JSON.parse(JSON.stringify(this.itens));
      this.itensRemovidos = [];

      // Recarregar histórico
      await this.carregarHistorico(this.ataId);

      this.sistema.esconderLoading();
      this.isSaving = false;

      this.sistema.ui.mostrarToast("sucesso", "Ata atualizada com sucesso!");

      // Perguntar se deseja voltar
      const voltar = await this.sistema.confirmar(
        "Alterações salvas com sucesso! Deseja voltar para a lista de atas?",
      );
      if (voltar) {
        // ============================================================
        // CORREÇÃO: caminho correto para gestao-atas.html
        // Como estamos em templates/, subimos um nível para a raiz do controle-de-saldos
        // ============================================================
        window.location.href = "../gestao-atas.html";
      }
    } catch (error) {
      console.error("Erro ao salvar alterações:", error);
      this.sistema.esconderLoading();
      this.isSaving = false;
      this.sistema.ui.mostrarToast(
        "erro",
        error.message || "Erro ao salvar alterações.",
      );
    }
  }

  // ============================================================
  // VALIDAR FORMULÁRIO
  // ============================================================
  validarFormulario() {
    const camposObrigatorios = [
      { id: "editarNumeroAta", nome: "Número da Ata" },
      { id: "editarModalidade", nome: "Modalidade" },
      { id: "editarProcesso", nome: "Processo" },
      { id: "editarObjeto", nome: "Objeto" },
      { id: "editarFornecedor", nome: "Fornecedor" },
      { id: "editarDataInicio", nome: "Vigência Início" },
      { id: "editarDataFim", nome: "Vigência Fim" },
      { id: "editarValorGlobal", nome: "Valor Global" },
    ];

    for (const campo of camposObrigatorios) {
      const el = document.getElementById(campo.id);
      if (!el || !el.value || el.value.trim() === "") {
        this.sistema.ui.mostrarToast(
          "aviso",
          `O campo "${campo.nome}" é obrigatório.`,
        );
        el?.focus();
        return false;
      }
    }

    // Validar datas
    const dataInicio = document.getElementById("editarDataInicio").value;
    const dataFim = document.getElementById("editarDataFim").value;

    if (dataInicio && dataFim) {
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      if (fim < inicio) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "A data de fim deve ser posterior à data de início.",
        );
        document.getElementById("editarDataFim").focus();
        return false;
      }
    }

    // Validar itens
    if (this.itens.length === 0) {
      this.sistema.ui.mostrarToast(
        "aviso",
        "A ata deve ter pelo menos um item.",
      );
      return false;
    }

    // Validar itens (descrição não vazia)
    for (const item of this.itens) {
      if (!item.descricao || item.descricao.trim() === "") {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Todos os itens devem ter uma descrição.",
        );
        return false;
      }
      if ((item.quantidade_contratada || 0) <= 0) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Todos os itens devem ter quantidade maior que zero.",
        );
        return false;
      }
      if ((item.valor_unitario || 0) <= 0) {
        this.sistema.ui.mostrarToast(
          "aviso",
          "Todos os itens devem ter valor unitário maior que zero.",
        );
        return false;
      }
    }

    return true;
  }

  // ============================================================
  // COLETAR DADOS DO FORMULÁRIO
  // ============================================================
  coletarDadosFormulario() {
    // Coletar dados dos itens
    const itens = [];
    const rows = document.querySelectorAll("#itensBody tr");

    rows.forEach((row, index) => {
      const itemId = row.dataset.itemId;
      const isNovo = itemId && itemId.startsWith("novo-");

      itens.push({
        id: isNovo ? null : this.itens[index]?.id || null,
        item_numero:
          row.querySelector(".item-numero")?.value ||
          String(index + 1).padStart(3, "0"),
        descricao: row.querySelector(".item-descricao")?.value || "",
        quantidade_contratada:
          parseFloat(row.querySelector(".item-quantidade")?.value) || 0,
        valor_unitario:
          parseFloat(row.querySelector(".item-valor-unitario")?.value) || 0,
        valor_total:
          (parseFloat(row.querySelector(".item-quantidade")?.value) || 0) *
          (parseFloat(row.querySelector(".item-valor-unitario")?.value) || 0),
        _novo: isNovo,
      });
    });

    return {
      numero_ata: document.getElementById("editarNumeroAta").value.trim(),
      modalidade: document.getElementById("editarModalidade").value.trim(),
      numero_pregao: document.getElementById("editarNumeroPregao").value.trim(),
      processo_administrativo: document
        .getElementById("editarProcesso")
        .value.trim(),
      objeto: document.getElementById("editarObjeto").value.trim(),
      fornecedor_id: parseInt(
        document.getElementById("editarFornecedor").value,
      ),
      categoria_id: document.getElementById("editarCategoria").value
        ? parseInt(document.getElementById("editarCategoria").value)
        : null,
      data_inicio_vigencia: document.getElementById("editarDataInicio").value,
      data_fim_vigencia: document.getElementById("editarDataFim").value,
      valor_global:
        parseFloat(document.getElementById("editarValorGlobal").value) || 0,
      situacao: document.getElementById("editarStatus").value,
      observacao: document.getElementById("editarObservacao").value.trim(),
      itens: itens,
    };
  }

  // ============================================================
  // COMPARAR DADOS PARA DETECTAR ALTERAÇÕES
  // ============================================================
  compararDados(original, atualizado) {
    const alteracoes = [];
    const campos = [
      { key: "numero_ata", nome: "Número da Ata" },
      { key: "modalidade", nome: "Modalidade" },
      { key: "numero_pregao", nome: "Número do Pregão" },
      { key: "processo_administrativo", nome: "Processo" },
      { key: "objeto", nome: "Objeto" },
      { key: "fornecedor_id", nome: "Fornecedor" },
      { key: "categoria_id", nome: "Categoria" },
      { key: "data_inicio_vigencia", nome: "Vigência Início" },
      { key: "data_fim_vigencia", nome: "Vigência Fim" },
      { key: "valor_global", nome: "Valor Global" },
      { key: "situacao", nome: "Status" },
      { key: "observacao", nome: "Observações" },
    ];

    for (const campo of campos) {
      const valorOriginal =
        (campo.key === "numero_pregao"
          ? (original.pregao_numero ?? original.numero_pregao)
          : original[campo.key]
        )?.toString() || "";
      const valorAtualizado = atualizado[campo.key]?.toString() || "";

      if (valorOriginal !== valorAtualizado) {
        alteracoes.push({
          campo: campo.key,
          campo_nome: campo.nome,
          valor_antigo: valorOriginal || null,
          valor_novo: valorAtualizado || null,
        });
      }
    }

    return alteracoes;
  }

  // ============================================================
  // REGISTRAR HISTÓRICO DE ALTERAÇÕES
  // ============================================================
  async registrarHistorico(alteracoes) {
    try {
      const registros = alteracoes.map((alteracao) => ({
        ata_id: this.ataId,
        usuario_id: this.sistema.usuarioAtual?.id,
        campo_alterado: alteracao.campo_nome || alteracao.campo,
        valor_antigo: alteracao.valor_antigo,
        valor_novo: alteracao.valor_novo,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("atas_historico").insert(registros);

      if (error) throw error;
    } catch (error) {
      console.error("Erro ao registrar histórico:", error);
      // Não interrompe o fluxo se o histórico falhar
    }
  }

  // ============================================================
  // PROCESSAR ITENS (INSERIR, ATUALIZAR, REMOVER)
  // ============================================================
  async processarItens() {
    try {
      const dados = this.coletarDadosFormulario();
      const itensAtuais = dados.itens;

      // 1. Remover itens marcados
      for (const itemId of this.itensRemovidos) {
        const { error } = await supabase
          .from("itens_ata")
          .delete()
          .eq("id", itemId)
          .eq("ata_id", this.ataId);

        if (error) throw error;

        // Registrar no histórico
        const itemRemovido = this.itensOriginais.find((i) => i.id === itemId);
        if (itemRemovido) {
          await this.registrarHistorico([
            {
              campo: "item_removido",
              campo_nome: "Item Removido",
              valor_antigo: `${itemRemovido.item_numero} - ${itemRemovido.descricao}`,
              valor_novo: null,
            },
          ]);
        }
      }

      // 2. Processar itens (inserir ou atualizar)
      for (const item of itensAtuais) {
        const itemData = {
          ata_id: this.ataId,
          item_numero: item.item_numero,
          descricao: item.descricao,
          quantidade_contratada: item.quantidade_contratada,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          saldo_quantidade: item.quantidade_contratada, // Inicializar saldo com a quantidade contratada
          updated_at: new Date().toISOString(),
        };

        if (item._novo || !item.id) {
          // Inserir novo item
          const { error } = await supabase.from("itens_ata").insert(itemData);

          if (error) throw error;

          // Registrar no histórico
          await this.registrarHistorico([
            {
              campo: "item_adicionado",
              campo_nome: "Item Adicionado",
              valor_antigo: null,
              valor_novo: `${item.item_numero} - ${item.descricao} (${item.quantidade_contratada} x ${this.sistema.ui.formatarMoeda(item.valor_unitario)})`,
            },
          ]);
        } else {
          // Verificar se o item foi alterado
          const itemOriginal = this.itensOriginais.find(
            (i) => i.id === item.id,
          );
          if (itemOriginal) {
            const alteracoesItem = [];

            if (itemOriginal.item_numero !== item.item_numero) {
              alteracoesItem.push({
                campo: "item_numero",
                campo_nome: "Item - Número",
                valor_antigo: itemOriginal.item_numero,
                valor_novo: item.item_numero,
              });
            }
            if (itemOriginal.descricao !== item.descricao) {
              alteracoesItem.push({
                campo: "item_descricao",
                campo_nome: "Item - Descrição",
                valor_antigo: itemOriginal.descricao,
                valor_novo: item.descricao,
              });
            }
            if (
              itemOriginal.quantidade_contratada !== item.quantidade_contratada
            ) {
              alteracoesItem.push({
                campo: "item_quantidade",
                campo_nome: "Item - Quantidade",
                valor_antigo: itemOriginal.quantidade_contratada?.toString(),
                valor_novo: item.quantidade_contratada?.toString(),
              });
            }
            if (itemOriginal.valor_unitario !== item.valor_unitario) {
              alteracoesItem.push({
                campo: "item_valor_unitario",
                campo_nome: "Item - Valor Unitário",
                valor_antigo: itemOriginal.valor_unitario?.toString(),
                valor_novo: item.valor_unitario?.toString(),
              });
            }
            if (itemOriginal.valor_total !== item.valor_total) {
              alteracoesItem.push({
                campo: "item_valor_total",
                campo_nome: "Item - Valor Total",
                valor_antigo: itemOriginal.valor_total?.toString(),
                valor_novo: item.valor_total?.toString(),
              });
            }

            // Se houver alterações, atualizar
            if (alteracoesItem.length > 0) {
              const { error } = await supabase
                .from("itens_ata")
                .update(itemData)
                .eq("id", item.id)
                .eq("ata_id", this.ataId);

              if (error) throw error;

              // Registrar histórico das alterações do item
              await this.registrarHistorico(alteracoesItem);
            }
          }
        }
      }
    } catch (error) {
      console.error("Erro ao processar itens:", error);
      throw error;
    }
  }

  // ============================================================
  // ATUALIZAR INFORMAÇÕES DO USUÁRIO
  // ============================================================
  atualizarUserInfo() {
    const user = this.sistema.usuarioAtual;
    if (!user) return;

    const avatar = document.getElementById("userAvatar");
    const nome = document.getElementById("userName");
    const role = document.getElementById("userRole");

    if (avatar) {
      avatar.textContent = user.nome?.charAt(0).toUpperCase() || "U";
    }
    if (nome) {
      nome.textContent = user.nome || "Usuário";
    }
    if (role) {
      const roles = {
        ADMIN: "Administrador",
        SECRETARIO: "Secretário",
        SOLICITANTE: "Solicitante",
        ESTAGIARIO: "Estagiário",
      };
      role.textContent = roles[user.perfil] || user.perfil || "Usuário";
    }
  }

  // ============================================================
  // FORMATAR CNPJ
  // ============================================================
  formatarCnpj(cnpj) {
    if (!cnpj) return "";
    const limpo = cnpj.replace(/\D/g, "");
    if (limpo.length !== 14) return cnpj;
    return limpo.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
}

// ============================================================
// EXPOR FUNÇÕES GLOBAIS PARA USO NO HTML
// ============================================================

window.adicionarItem = function () {
  if (window.sistema && window.sistema.editar) {
    window.sistema.editar.adicionarItem();
  }
};

window.removerItem = function (index) {
  if (window.sistema && window.sistema.editar) {
    window.sistema.editar.removerItem(index);
  }
};

window.recalcularTotais = function () {
  if (window.sistema && window.sistema.editar) {
    window.sistema.editar.recalcularTotais();
  }
};
