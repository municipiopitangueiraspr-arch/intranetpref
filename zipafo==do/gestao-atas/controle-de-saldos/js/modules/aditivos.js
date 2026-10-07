import { supabase } from "../supabase.js";

export class Aditivos {
  constructor(sistema) {
    this.sistema = sistema;
    this.aditivosFiltrados = [];
  }

  async carregarConteudo() {
    const container = document.getElementById("aditivosContent");
    container.innerHTML = this.gerarHTMLAditivos();
    await this.carregarAtasParaAditivo();
    this.configurarEventos();
    await this.carregarAditivos();
  }

  gerarHTMLAditivos() {
    return `
            <div class="aditivos-container">
                <div class="aditivos-header">
                    <h3 style="font-size: 1.1rem">
                        <i class="fas fa-file-contract"></i> Gestão de Aditivos de Atas
                    </h3>
                    <button class="btn-novo-aditivo" id="btnNovoAditivo">
                        <i class="fas fa-plus-circle"></i> Novo Aditivo
                    </button>
                </div>
                <div class="filtros-container" style="margin-bottom: 20px">
                    <div class="filtros-grid">
                        <div class="filtro-grupo">
                            <label class="filtro-label">Buscar</label>
                            <input type="text" id="buscaAditivos" class="filtro-input" placeholder="Nº Ata, Nº Aditivo...">
                        </div>
                        <div class="filtro-grupo">
                            <label class="filtro-label">Tipo</label>
                            <select id="filtroTipoAditivo" class="filtro-select">
                                <option value="todos">Todos</option>
                                <option value="PRAZO">Prazo</option>
                                <option value="VALOR">Valor</option>
                                <option value="AMBOS">Prazo e Valor</option>
                            </select>
                        </div>
                        <div class="filtro-grupo">
                            <label class="filtro-label">Status</label>
                            <select id="filtroStatusAditivo" class="filtro-select">
                                <option value="todos">Todos</option>
                                <option value="aplicado">Aplicados</option>
                                <option value="pendente">Pendentes</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div id="aditivosLista" class="aditivos-grid"></div>
            </div>
        `;
  }

  configurarEventos() {
    document
      .getElementById("btnNovoAditivo")
      .addEventListener("click", () => this.abrirModal());
    document
      .getElementById("buscaAditivos")
      .addEventListener("keyup", () => this.filtrarAditivos());
    document
      .getElementById("filtroTipoAditivo")
      .addEventListener("change", () => this.filtrarAditivos());
    document
      .getElementById("filtroStatusAditivo")
      .addEventListener("change", () => this.filtrarAditivos());
  }

  async carregarAtasParaAditivo() {
    const select = document.getElementById("aditivoAtaOriginal");
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    const { data: atas } = await supabase
      .from("atas")
      .select(
        "id, numero_ata, situacao, data_inicio_vigencia, data_fim_vigencia, valor_global, fornecedor:fornecedores(razao_social)",
      )
      .in("situacao", ["ATIVA", "PROXIMA"])
      .order("numero_ata");
    atas?.forEach((a) => {
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = `${a.numero_ata} - ${a.fornecedor?.razao_social || ""} (${a.situacao})`;
      select.appendChild(o);
    });
  }

  async abrirModal(ataId = null) {
    if (
      this.sistema.usuarioAtual?.perfil !== "ADMIN" &&
      this.sistema.usuarioAtual?.perfil !== "ESTAGIARIO"
    ) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Apenas administradores e estagiários podem criar aditivos.",
      );
      return;
    }
    document.getElementById("modalAditivoTitulo").innerHTML =
      '<i class="fas fa-file-contract"></i> Novo Aditivo';
    const form = document.getElementById("formAditivo");
    form.innerHTML = this.gerarFormAditivo();
    document.getElementById("camposPrazo").style.display = "none";
    document.getElementById("camposValor").style.display = "none";
    document.getElementById("itensAditivoContainer").style.display = "none";
    document.getElementById("resumoAtaOriginal").innerHTML = "";
    await this.carregarAtasParaAditivo();
    if (ataId) {
      document.getElementById("aditivoAtaOriginal").value = ataId;
      document.getElementById("aditivoAtaOriginal").disabled = true;
      await this.carregarResumoAtaOriginal(ataId);
    } else {
      document.getElementById("aditivoAtaOriginal").disabled = false;
    }
    this.configurarEventosFormAditivo();
    document.getElementById("modalAditivo").classList.add("active");
  }

  gerarFormAditivo() {
    return `
            <input type="hidden" id="aditivoId">
            <div class="form-group">
                <label>Selecione a Ata Original</label>
                <select id="aditivoAtaOriginal" class="filtro-select" required>
                    <option value="">Selecione...</option>
                </select>
                <small style="color: var(--neutral-500);">Apenas atas ativas ou próximas podem receber aditivos</small>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Nº do Aditivo</label>
                    <input type="text" id="aditivoNumero" class="filtro-input" placeholder="Ex: 1º Aditivo" required>
                </div>
                <div class="form-group">
                    <label>Tipo de Aditivo</label>
                    <select id="aditivoTipo" class="filtro-select" required>
                        <option value="">Selecione...</option>
                        <option value="PRAZO">📅 Somente Prazo</option>
                        <option value="VALOR">💰 Somente Valor</option>
                        <option value="AMBOS">📅💰 Prazo e Valor</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Data Assinatura</label>
                    <input type="date" id="aditivoDataAssinatura" class="filtro-input" required>
                </div>
                <div class="form-group">
                    <label>Nº Documento/Processo</label>
                    <input type="text" id="aditivoDocumento" class="filtro-input" placeholder="Ex: 123/2025">
                </div>
            </div>

            <div id="camposPrazo" style="display: none; background: var(--neutral-50); padding: 16px; border-radius: var(--border-radius-lg); margin: 16px 0;">
                <h4 style="margin-bottom: 12px; color: var(--primary-700);">📅 Novas Datas de Vigência</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Nova Data Início</label>
                        <input type="date" id="aditivoNovaDataInicio" class="filtro-input">
                    </div>
                    <div class="form-group">
                        <label>Nova Data Fim</label>
                        <input type="date" id="aditivoNovaDataFim" class="filtro-input">
                    </div>
                </div>
            </div>

            <div id="camposValor" style="display: none; background: var(--neutral-50); padding: 16px; border-radius: var(--border-radius-lg); margin: 16px 0;">
                <h4 style="margin-bottom: 12px; color: var(--primary-700);">💰 Novo Valor</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Novo Valor Global</label>
                        <input type="number" id="aditivoNovoValor" class="filtro-input" step="0.01" min="0">
                    </div>
                </div>
                <div style="margin-top: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="aditivoAlterarItens">
                        <span>Alterar quantidades/valores de itens específicos</span>
                    </label>
                </div>
                <div id="itensAditivoContainer" style="display: none; margin-top: 16px;">
                    <h5 style="margin-bottom: 8px;">Itens da Ata</h5>
                    <div id="itensAditivoLista" class="tabela-container" style="max-height: 300px; overflow-y: auto;"></div>
                </div>
            </div>

            <div class="form-group">
                <label>Justificativa</label>
                <textarea id="aditivoJustificativa" class="filtro-input" rows="3" placeholder="Motivo do aditivo..." required></textarea>
            </div>
            <div class="form-group">
                <label>Observações</label>
                <textarea id="aditivoObservacoes" class="filtro-input" rows="2" placeholder="Informações adicionais..."></textarea>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button type="button" id="btnCancelarAditivo" style="background: var(--neutral-200); padding: 8px 16px; border: none; border-radius: var(--border-radius-md);">Cancelar</button>
                <button type="submit" style="background: var(--primary-600); color: white; padding: 8px 16px; border: none; border-radius: var(--border-radius-md);"><i class="fas fa-save"></i> Salvar Aditivo</button>
            </div>
        `;
  }

  configurarEventosFormAditivo() {
    document
      .getElementById("aditivoAtaOriginal")
      .addEventListener("change", (e) => {
        this.carregarResumoAtaOriginal(e.target.value);
      });
    document.getElementById("aditivoTipo").addEventListener("change", () => {
      this.toggleCamposAditivo();
    });
    document
      .getElementById("aditivoAlterarItens")
      .addEventListener("change", () => {
        this.toggleItensAditivo();
      });
    document
      .getElementById("btnCancelarAditivo")
      .addEventListener("click", () => {
        this.sistema.fecharModalAditivo();
      });
    document.getElementById("formAditivo").addEventListener("submit", (e) => {
      e.preventDefault();
      this.salvarAditivo();
    });
  }

  async carregarResumoAtaOriginal(ataId) {
    if (!ataId) {
      document.getElementById("resumoAtaOriginal").innerHTML = "";
      return;
    }
    const { data: ata } = await supabase
      .from("atas")
      .select("*, fornecedor:fornecedores(*)")
      .eq("id", ataId)
      .single();
    if (ata) {
      this.sistema.ataParaAditivo = ata;
      const { data: consumos } = await supabase
        .from("consumos")
        .select("valor_total")
        .eq("ata_id", ataId);
      const valorConsumido =
        consumos?.reduce((s, c) => s + (c.valor_total || 0), 0) || 0;
      const saldoAtual = (ata.valor_global || 0) - valorConsumido;
      document.getElementById("resumoAtaOriginal").innerHTML = `
                <div class="resumo-ata-original">
                    <h4><i class="fas fa-file-contract"></i> Ata Original</h4>
                    <div class="resumo-grid">
                        <div class="resumo-item"><span class="resumo-label">Número</span><span class="resumo-valor">${ata.numero_ata}</span></div>
                        <div class="resumo-item"><span class="resumo-label">Fornecedor</span><span class="resumo-valor">${ata.fornecedor?.razao_social || ""}</span></div>
                        <div class="resumo-item"><span class="resumo-label">Vigência</span><span class="resumo-valor">${this.sistema.ui.formatarData(ata.data_inicio_vigencia)} até ${this.sistema.ui.formatarData(ata.data_fim_vigencia)}</span></div>
                        <div class="resumo-item"><span class="resumo-label">Valor Global</span><span class="resumo-valor">${this.sistema.ui.formatarMoeda(ata.valor_global)}</span></div>
                        <div class="resumo-item"><span class="resumo-label">Consumido</span><span class="resumo-valor">${this.sistema.ui.formatarMoeda(valorConsumido)}</span></div>
                        <div class="resumo-item"><span class="resumo-label">Saldo Atual</span><span class="resumo-valor destaque">${this.sistema.ui.formatarMoeda(saldoAtual)}</span></div>
                    </div>
                </div>
            `;
    }
  }

  toggleCamposAditivo() {
    const tipo = document.getElementById("aditivoTipo").value;
    document.getElementById("camposPrazo").style.display =
      tipo === "PRAZO" || tipo === "AMBOS" ? "block" : "none";
    document.getElementById("camposValor").style.display =
      tipo === "VALOR" || tipo === "AMBOS" ? "block" : "none";
    if (tipo === "VALOR" || tipo === "AMBOS") {
      const ataId = document.getElementById("aditivoAtaOriginal").value;
      if (ataId) this.carregarItensParaAditivo(ataId);
    }
  }

  async carregarItensParaAditivo(ataId) {
    const { data: itens } = await supabase
      .from("itens_ata")
      .select("*")
      .eq("ata_id", ataId)
      .order("item_numero");
    if (itens?.length) {
      let html = `
                <table class="itens-aditivo-tabela">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Descrição</th>
                            <th>Qtd Original</th>
                            <th>Saldo</th>
                            <th>Valor Unit.</th>
                            <th>Nova Qtd</th>
                            <th>Novo Valor Unit.</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
      itens.forEach((item) => {
        html += `
                    <tr>
                        <td>${item.item_numero}</td>
                        <td>${item.descricao}</td>
                        <td class="numeric">${item.quantidade_contratada}</td>
                        <td class="numeric">${item.saldo_quantidade}</td>
                        <td class="numeric">${this.sistema.ui.formatarMoeda(item.valor_unitario)}</td>
                        <td><input type="number" id="nova_qtd_${item.id}" class="item-nova-qtd" min="0" placeholder="Nova qtd" data-item-id="${item.id}"></td>
                        <td><input type="number" id="novo_valor_${item.id}" class="item-novo-valor" min="0" step="0.01" placeholder="Novo valor" data-item-id="${item.id}"></td>
                    </tr>
                `;
      });
      html += `</tbody></table>`;
      document.getElementById("itensAditivoLista").innerHTML = html;
    }
  }

  toggleItensAditivo() {
    const checked = document.getElementById("aditivoAlterarItens").checked;
    document.getElementById("itensAditivoContainer").style.display = checked
      ? "block"
      : "none";
    if (checked) {
      const ataId = document.getElementById("aditivoAtaOriginal").value;
      if (ataId) this.carregarItensParaAditivo(ataId);
    }
  }

  async salvarAditivo() {
    const ataId = document.getElementById("aditivoAtaOriginal").value;
    if (!ataId) {
      this.sistema.ui.mostrarToast("erro", "Selecione a ata original!");
      return;
    }
    const dadosAditivo = {
      ata_original_id: parseInt(ataId),
      numero_aditivo: document.getElementById("aditivoNumero").value,
      tipo_aditivo: document.getElementById("aditivoTipo").value,
      data_assinatura: document.getElementById("aditivoDataAssinatura").value,
      documento_referencia:
        document.getElementById("aditivoDocumento").value || null,
      nova_data_inicio_vigencia:
        document.getElementById("aditivoNovaDataInicio").value || null,
      nova_data_fim_vigencia:
        document.getElementById("aditivoNovaDataFim").value || null,
      novo_valor_global: document.getElementById("aditivoNovoValor").value
        ? parseFloat(document.getElementById("aditivoNovoValor").value)
        : null,
      justificativa: document.getElementById("aditivoJustificativa").value,
      observacoes: document.getElementById("aditivoObservacoes").value || null,
      usuario_registro_id: this.sistema.usuarioAtual.id,
      status: "ATIVO",
      data_aplicacao: null,
    };
    if (!dadosAditivo.numero_aditivo) {
      this.sistema.ui.mostrarToast("erro", "Informe o número do aditivo!");
      return;
    }
    if (!dadosAditivo.tipo_aditivo) {
      this.sistema.ui.mostrarToast("erro", "Selecione o tipo de aditivo!");
      return;
    }
    if (!dadosAditivo.data_assinatura) {
      this.sistema.ui.mostrarToast("erro", "Informe a data de assinatura!");
      return;
    }
    if (!dadosAditivo.justificativa) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Informe a justificativa do aditivo!",
      );
      return;
    }
    if (
      (dadosAditivo.tipo_aditivo === "PRAZO" ||
        dadosAditivo.tipo_aditivo === "AMBOS") &&
      !dadosAditivo.nova_data_fim_vigencia
    ) {
      this.sistema.ui.mostrarToast(
        "erro",
        "Para aditivo de prazo, informe a nova data de fim de vigência!",
      );
      return;
    }
    try {
      const { data: aditivo, error } = await supabase
        .from("aditivos_ata")
        .insert([dadosAditivo])
        .select()
        .single();
      if (error) throw error;
      if (document.getElementById("aditivoAlterarItens").checked) {
        const itensAlterados = [];
        const inputsQtd = document.querySelectorAll(".item-nova-qtd");
        const inputsValor = document.querySelectorAll(".item-novo-valor");
        inputsQtd.forEach((i) => {
          if (i.value) {
            const itemId = i.dataset.itemId;
            itensAlterados.push({
              item_ata_id: parseInt(itemId),
              nova_quantidade: parseInt(i.value),
            });
          }
        });
        inputsValor.forEach((i) => {
          if (i.value) {
            const itemId = i.dataset.itemId;
            const existente = itensAlterados.find(
              (x) => x.item_ata_id === parseInt(itemId),
            );
            if (existente) {
              existente.novo_valor_unitario = parseFloat(i.value);
            } else {
              itensAlterados.push({
                item_ata_id: parseInt(itemId),
                novo_valor_unitario: parseFloat(i.value),
              });
            }
          }
        });
        for (const item of itensAlterados) {
          const { data: itemAtual } = await supabase
            .from("itens_ata")
            .select("*")
            .eq("id", item.item_ata_id)
            .single();
          if (itemAtual) {
            item.quantidade_anterior = itemAtual.quantidade_contratada;
            item.valor_unitario_anterior = itemAtual.valor_unitario;
            item.valor_total_anterior = itemAtual.valor_total;
            item.saldo_anterior = itemAtual.saldo_quantidade;
            item.nova_quantidade =
              item.nova_quantidade || itemAtual.quantidade_contratada;
            item.novo_valor_unitario =
              item.novo_valor_unitario || itemAtual.valor_unitario;
            item.novo_valor_total =
              item.nova_quantidade * item.novo_valor_unitario;
            item.novo_saldo = item.nova_quantidade;
            await supabase.from("aditivos_itens_historico").insert([
              {
                aditivo_id: aditivo.id,
                item_ata_id: item.item_ata_id,
                quantidade_anterior: item.quantidade_anterior,
                valor_unitario_anterior: item.valor_unitario_anterior,
                valor_total_anterior: item.valor_total_anterior,
                saldo_anterior: item.saldo_anterior,
                nova_quantidade: item.nova_quantidade,
                novo_valor_unitario: item.novo_valor_unitario,
                novo_valor_total: item.novo_valor_total,
                novo_saldo: item.nova_quantidade,
              },
            ]);
          }
        }
      }
      this.sistema.ui.mostrarToast(
        "sucesso",
        "Aditivo registrado! Lembre-se de aplicá-lo para efetivar as mudanças.",
      );
      this.sistema.fecharModalAditivo();
      await this.carregarAditivos();
    } catch (error) {
      console.error(error);
      this.sistema.ui.mostrarToast("erro", error.message);
    }
  }

  async carregarAditivos() {
    const container = document.getElementById("aditivosLista");
    if (!container) return;
    this.sistema.ui.mostrarSpinner("aditivosLista", "Carregando aditivos...");
    try {
      const { data: aditivos, error } = await supabase
        .from("aditivos_ata")
        .select(
          "*, ata_original:atas(numero_ata,situacao,data_inicio_vigencia,data_fim_vigencia,valor_global,fornecedor:fornecedores(razao_social)), usuario:usuarios(nome)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!aditivos?.length) {
        container.innerHTML =
          '<div style="text-align:center;padding:40px;"><i class="fas fa-file-contract" style="font-size:3rem;color:var(--neutral-400);"></i><h3 style="margin-top:15px;">Nenhum aditivo cadastrado</h3></div>';
        return;
      }
      this.aditivosFiltrados = aditivos;
      this.filtrarAditivos();
    } catch (error) {
      container.innerHTML = `<div style="text-align:center;color:var(--error-600);padding:40px;"><i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i><p>Erro: ${error.message}</p></div>`;
    }
  }

  filtrarAditivos() {
    const busca =
      document.getElementById("buscaAditivos")?.value.toLowerCase() || "";
    const tipo = document.getElementById("filtroTipoAditivo")?.value || "todos";
    const status =
      document.getElementById("filtroStatusAditivo")?.value || "todos";
    let filtrados = this.aditivosFiltrados;
    if (busca) {
      filtrados = filtrados.filter(
        (a) =>
          a.numero_aditivo.toLowerCase().includes(busca) ||
          a.ata_original?.numero_ata.toLowerCase().includes(busca),
      );
    }
    if (tipo !== "todos")
      filtrados = filtrados.filter((a) => a.tipo_aditivo === tipo);
    if (status !== "todos") {
      if (status === "aplicado")
        filtrados = filtrados.filter((a) => a.data_aplicacao);
      else filtrados = filtrados.filter((a) => !a.data_aplicacao);
    }
    this.renderizarAditivos(filtrados);
  }

  renderizarAditivos(aditivos) {
    const container = document.getElementById("aditivosLista");
    container.innerHTML = aditivos
      .map((a) => {
        const tipoClass = { PRAZO: "prazo", VALOR: "valor", AMBOS: "ambos" }[
          a.tipo_aditivo
        ];
        const tipoLabel = {
          PRAZO: "📅 Prazo",
          VALOR: "💰 Valor",
          AMBOS: "📅💰 Prazo e Valor",
        }[a.tipo_aditivo];
        const aplicado = a.data_aplicacao ? "✅ Aplicado" : "⏳ Pendente";
        return `
                <div class="aditivo-card" data-tipo="${a.tipo_aditivo}">
                    <div class="aditivo-header">
                        <span class="aditivo-tipo-badge ${tipoClass}">${tipoLabel}</span>
                        <div class="aditivo-numero">${a.numero_aditivo}</div>
                        <div class="aditivo-ata-original"><i class="fas fa-file-contract"></i> Ata Original: ${a.ata_original?.numero_ata || ""}</div>
                        <div class="aditivo-data"><i class="fas fa-calendar"></i> Assinatura: ${this.sistema.ui.formatarData(a.data_assinatura)}</div>
                    </div>
                    <div class="aditivo-body">
                        <div class="aditivo-info-row"><span class="aditivo-label">Status:</span><span class="aditivo-value">${aplicado}</span></div>
                        ${
                          a.tipo_aditivo === "PRAZO" ||
                          a.tipo_aditivo === "AMBOS"
                            ? `
                            <div class="aditivo-info-row"><span class="aditivo-label">Nova Vigência:</span><span class="aditivo-value">${this.sistema.ui.formatarData(a.nova_data_inicio_vigencia)} até ${this.sistema.ui.formatarData(a.nova_data_fim_vigencia)}</span></div>
                        `
                            : ""
                        }
                        ${
                          a.tipo_aditivo === "VALOR" ||
                          a.tipo_aditivo === "AMBOS"
                            ? `
                            <div class="aditivo-info-row"><span class="aditivo-label">Novo Valor:</span><span class="aditivo-value destaque">${this.sistema.ui.formatarMoeda(a.novo_valor_global)}</span></div>
                        `
                            : ""
                        }
                        <div class="aditivo-info-row"><span class="aditivo-label">Justificativa:</span><span class="aditivo-value">${a.justificativa.substring(0, 50)}${a.justificativa.length > 50 ? "..." : ""}</span></div>
                        <div class="aditivo-info-row"><span class="aditivo-label">Registrado por:</span><span class="aditivo-value">${a.usuario?.nome || ""}</span></div>
                    </div>
                    <div class="aditivo-footer">
                        <button class="btn-visualizar-aditivo" onclick="sistema.aditivos.visualizarAditivo(${a.id})"><i class="fas fa-eye"></i> Detalhes</button>
                        ${
                          !a.data_aplicacao
                            ? `
                            <button class="btn-aplicar-aditivo" onclick="sistema.aditivos.aplicarAditivo(${a.id})"><i class="fas fa-check-circle"></i> Aplicar</button>
                        `
                            : `<span style="color:var(--success-600);font-size:0.8rem;"><i class="fas fa-check-circle"></i> Aplicado em ${this.sistema.ui.formatarData(a.data_aplicacao)}</span>`
                        }
                    </div>
                </div>
            `;
      })
      .join("");
  }

  async visualizarAditivo(aditivoId) {
    const { data: aditivo } = await supabase
      .from("aditivos_ata")
      .select(
        "*, ata_original:atas(*, fornecedor:fornecedores(*)), itens_historico:aditivos_itens_historico(*, item:itens_ata(descricao,item_numero)), usuario:usuarios(nome)",
      )
      .eq("id", aditivoId)
      .single();
    if (!aditivo) return;
    let html = `
            <div class="modal-content" style="max-width:900px;">
                <div class="modal-header">
                    <h2 class="modal-titulo">Detalhes do Aditivo</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div style="padding:20px;">
                    <h3 style="color:var(--primary-700);margin-bottom:16px;">${aditivo.numero_aditivo}</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                        <div>
                            <p><strong>Tipo:</strong> ${aditivo.tipo_aditivo}</p>
                            <p><strong>Data Assinatura:</strong> ${this.sistema.ui.formatarData(aditivo.data_assinatura)}</p>
                            <p><strong>Documento:</strong> ${aditivo.documento_referencia || "N/I"}</p>
                        </div>
                        <div>
                            <p><strong>Registrado por:</strong> ${aditivo.usuario?.nome}</p>
                            <p><strong>Data Registro:</strong> ${this.sistema.ui.formatarData(aditivo.created_at)}</p>
                            <p><strong>Data Aplicação:</strong> ${aditivo.data_aplicacao ? this.sistema.ui.formatarData(aditivo.data_aplicacao) : "Pendente"}</p>
                        </div>
                    </div>
                    <div style="background:var(--neutral-50);padding:16px;border-radius:var(--border-radius-lg);margin-bottom:20px;">
                        <h4 style="margin-bottom:8px;">Justificativa</h4>
                        <p>${aditivo.justificativa}</p>
                        ${aditivo.observacoes ? `<p style="margin-top:8px;"><strong>Obs:</strong> ${aditivo.observacoes}</p>` : ""}
                    </div>
                    <h4 style="margin-bottom:12px;">Alterações Realizadas</h4>
                    ${
                      aditivo.tipo_aditivo === "PRAZO" ||
                      aditivo.tipo_aditivo === "AMBOS"
                        ? `
                        <div style="background:var(--primary-50);padding:12px;border-radius:var(--border-radius-lg);margin-bottom:16px;">
                            <p><strong>📅 Vigência Original:</strong> ${this.sistema.ui.formatarData(aditivo.ata_original?.data_inicio_vigencia)} até ${this.sistema.ui.formatarData(aditivo.ata_original?.data_fim_vigencia)}</p>
                            <p><strong>📅 Nova Vigência:</strong> ${this.sistema.ui.formatarData(aditivo.nova_data_inicio_vigencia)} até ${this.sistema.ui.formatarData(aditivo.nova_data_fim_vigencia)}</p>
                        </div>
                    `
                        : ""
                    }
                    ${
                      aditivo.tipo_aditivo === "VALOR" ||
                      aditivo.tipo_aditivo === "AMBOS"
                        ? `
                        <div style="background:var(--success-50);padding:12px;border-radius:var(--border-radius-lg);margin-bottom:16px;">
                            <p><strong>💰 Valor Original:</strong> ${this.sistema.ui.formatarMoeda(aditivo.ata_original?.valor_global)}</p>
                            <p><strong>💰 Novo Valor:</strong> ${this.sistema.ui.formatarMoeda(aditivo.novo_valor_global)}</p>
                        </div>
                    `
                        : ""
                    }
                    ${
                      aditivo.itens_historico?.length > 0
                        ? `
                        <h5 style="margin:20px 0 10px;">Itens Modificados</h5>
                        <div class="tabela-container">
                            <table class="tabela-itens">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Descrição</th>
                                        <th>Qtd Ant.</th>
                                        <th>Saldo Ant.</th>
                                        <th>Nova Qtd</th>
                                        <th>Novo Saldo</th>
                                        <th>Valor Ant.</th>
                                        <th>Novo Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${aditivo.itens_historico
                                      .map(
                                        (h) => `
                                        <tr>
                                            <td>${h.item?.item_numero}</td>
                                            <td>${h.item?.descricao}</td>
                                            <td class="numeric">${h.quantidade_anterior}</td>
                                            <td class="numeric">${h.saldo_anterior}</td>
                                            <td class="numeric"><strong>${h.nova_quantidade}</strong></td>
                                            <td class="numeric"><strong>${h.novo_saldo}</strong></td>
                                            <td class="numeric">${this.sistema.ui.formatarMoeda(h.valor_unitario_anterior)}</td>
                                            <td class="numeric">${this.sistema.ui.formatarMoeda(h.novo_valor_unitario)}</td>
                                        </tr>
                                    `,
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                        </div>
                    `
                        : ""
                    }
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                        <button class="btn" onclick="this.closest('.modal').remove()" style="background:var(--neutral-200);padding:8px 16px;border:none;border-radius:var(--border-radius-md);">Fechar</button>
                        ${
                          !aditivo.data_aplicacao
                            ? `
                            <button class="btn-aplicar-aditivo" onclick="sistema.aditivos.aplicarAditivo(${aditivo.id}); this.closest('.modal').remove()"><i class="fas fa-check-circle"></i> Aplicar Aditivo</button>
                        `
                            : ""
                        }
                    </div>
                </div>
            </div>
        `;
    const modal = document.createElement("div");
    modal.className = "modal active";
    modal.innerHTML = html;
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
  }

  async aplicarAditivo(aditivoId) {
    const confirmado = await this.sistema.confirmar(
      "Ao aplicar este aditivo, a ata será atualizada com os novos valores e os saldos serão resetados. Deseja continuar?",
    );
    if (!confirmado) return;
    try {
      const { data: aditivo, error: e1 } = await supabase
        .from("aditivos_ata")
        .select("*")
        .eq("id", aditivoId)
        .single();
      if (e1) throw e1;
      const { data: itensHistorico } = await supabase
        .from("aditivos_itens_historico")
        .select("*")
        .eq("aditivo_id", aditivoId);
      const updates = {};
      if (
        aditivo.tipo_aditivo === "PRAZO" ||
        aditivo.tipo_aditivo === "AMBOS"
      ) {
        if (aditivo.nova_data_inicio_vigencia)
          updates.data_inicio_vigencia = aditivo.nova_data_inicio_vigencia;
        if (aditivo.nova_data_fim_vigencia)
          updates.data_fim_vigencia = aditivo.nova_data_fim_vigencia;
      }
      if (
        aditivo.tipo_aditivo === "VALOR" ||
        aditivo.tipo_aditivo === "AMBOS"
      ) {
        if (aditivo.novo_valor_global)
          updates.valor_global = aditivo.novo_valor_global;
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("atas")
          .update(updates)
          .eq("id", aditivo.ata_original_id);
      }
      if (itensHistorico?.length > 0) {
        for (const h of itensHistorico) {
          await supabase
            .from("itens_ata")
            .update({
              quantidade_contratada: h.nova_quantidade,
              valor_unitario: h.novo_valor_unitario,
              valor_total: h.novo_valor_total,
              saldo_quantidade: h.nova_quantidade,
            })
            .eq("id", h.item_ata_id);
        }
      }
      await supabase
        .from("aditivos_ata")
        .update({ data_aplicacao: new Date().toISOString().split("T")[0] })
        .eq("id", aditivoId);
      this.sistema.ui.mostrarToast("sucesso", "Aditivo aplicado com sucesso!");
      await this.carregarAditivos();
      await this.sistema.consulta.carregarConteudo();
    } catch (error) {
      this.sistema.ui.mostrarToast("erro", error.message);
    }
  }
}
