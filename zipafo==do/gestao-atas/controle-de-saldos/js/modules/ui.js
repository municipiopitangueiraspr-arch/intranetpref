export class UI {
  constructor(sistema) {
    this.sistema = sistema;
  }

  // ============================================================
  // TOAST - NOTIFICAÇÕES
  // ============================================================
  mostrarToast(tipo, mensagem, subtitulo = null) {
    const container = document.getElementById("toastContainer");
    if (!container) {
      console.warn("Toast container não encontrado. Criando um...");
      this.criarToastContainer();
      return this.mostrarToast(tipo, mensagem, subtitulo);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;

    const iconMap = {
      sucesso: "fa-check-circle",
      erro: "fa-exclamation-circle",
      aviso: "fa-info-circle",
      info: "fa-info-circle",
    };

    const icon = iconMap[tipo] || "fa-info-circle";

    toast.innerHTML = `
      <i class="fas ${icon}"></i>
      <div style="flex:1;display:flex;flex-direction:column;gap:2px;">
        <span style="font-weight:600;font-size:0.9rem;">${mensagem}</span>
        ${subtitulo ? `<span style="font-size:0.8rem;color:var(--neutral-500);">${subtitulo}</span>` : ""}
      </div>
      <button class="btn-fechar" onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    container.appendChild(toast);

    // Auto-remover após 4 segundos (aumentado para melhor legibilidade)
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  }

  // ============================================================
  // CRIAR CONTAINER DE TOAST (FALLBACK)
  // ============================================================
  criarToastContainer() {
    const container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
    return container;
  }

  // ============================================================
  // FORMATAR MOEDA
  // ============================================================
  formatarMoeda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) {
      return "R$ 0,00";
    }
    return (valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  // ============================================================
  // FORMATAR DATA
  // ============================================================
  formatarData(dataISO) {
    try {
      if (!dataISO) return "N/I";
      const data = new Date(dataISO);
      if (isNaN(data.getTime())) return "N/I";
      return data.toLocaleDateString("pt-BR");
    } catch {
      return "N/I";
    }
  }

  // ============================================================
  // FORMATAR DATA E HORA
  // ============================================================
  formatarDataHora(dataISO) {
    try {
      if (!dataISO) return "N/I";
      const data = new Date(dataISO);
      if (isNaN(data.getTime())) return "N/I";
      return data.toLocaleString("pt-BR");
    } catch {
      return "N/I";
    }
  }

  // ============================================================
  // FORMATAR NÚMERO (COM DECIMAIS)
  // ============================================================
  formatarNumero(valor, decimais = 2) {
    if (valor === null || valor === undefined || isNaN(valor)) {
      return "0";
    }
    return Number(valor).toLocaleString("pt-BR", {
      minimumFractionDigits: decimais,
      maximumFractionDigits: decimais,
    });
  }

  // ============================================================
  // FORMATAR PERCENTUAL
  // ============================================================
  formatarPercentual(valor, decimais = 1) {
    if (valor === null || valor === undefined || isNaN(valor)) {
      return "0%";
    }
    return (
      Number(valor).toLocaleString("pt-BR", {
        minimumFractionDigits: decimais,
        maximumFractionDigits: decimais,
      }) + "%"
    );
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

  // ============================================================
  // FORMATAR CPF
  // ============================================================
  formatarCpf(cpf) {
    if (!cpf) return "";
    const limpo = cpf.replace(/\D/g, "");
    if (limpo.length !== 11) return cpf;
    return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  // ============================================================
  // FORMATAR DOCUMENTO (CPF OU CNPJ)
  // ============================================================
  formatarDocumento(documento) {
    if (!documento) return "";
    const limpo = String(documento).replace(/\D/g, "");
    if (limpo.length === 11) return this.formatarCpf(limpo);
    if (limpo.length === 14) return this.formatarCnpj(limpo);
    return String(documento);
  }

  normalizarDocumento(documento) {
    return documento ? String(documento).replace(/\D/g, "") : "";
  }

  // ============================================================
  // FORMATAR DIAS RESTANTES (COM PLURAL)
  // ============================================================
  formatarDiasRestantes(dias) {
    if (dias === null || dias === undefined) return "N/I";
    const absDias = Math.abs(dias);
    const plural = absDias > 1 ? "dias" : "dia";

    if (dias < 0) {
      return `Vencida há ${absDias} ${plural}`;
    } else if (dias === 0) {
      return "Vence hoje";
    } else {
      return `Vence em ${absDias} ${plural}`;
    }
  }

  // ============================================================
  // OBTER COR DO VENCIMENTO (PARA BADGES)
  // ============================================================
  getCorVencimento(dias) {
    if (dias === null || dias === undefined) return "verde-claro";
    if (dias < 0) return "vermelho";
    if (dias <= 15) return "vermelho";
    if (dias <= 30) return "laranja";
    if (dias <= 60) return "amarelo";
    if (dias <= 90) return "verde";
    return "verde-claro";
  }

  // ============================================================
  // OBTER ÍCONE DO VENCIMENTO
  // ============================================================
  getIconeVencimento(dias) {
    if (dias === null || dias === undefined) return "fa-hourglass-start";
    if (dias < 0) return "fa-exclamation-circle";
    if (dias <= 15) return "fa-exclamation-triangle";
    if (dias <= 30) return "fa-clock";
    if (dias <= 60) return "fa-clock";
    if (dias <= 90) return "fa-hourglass-half";
    return "fa-hourglass-start";
  }

  // ============================================================
  // CARREGAR SELECT DE ÓRGÃOS
  // ============================================================
  async carregarSelectOrgaos(
    selectId,
    selectedId = null,
    placeholder = "Selecione um órgão...",
  ) {
    const select = document.getElementById(selectId);
    if (!select) {
      console.warn(`Select com ID "${selectId}" não encontrado.`);
      return;
    }

    try {
      const orgaos = await this.sistema.carregarOrgaos();
      if (!orgaos || orgaos.length === 0) {
        select.innerHTML = `<option value="">Nenhum órgão encontrado</option>`;
        return;
      }

      select.innerHTML = `<option value="">${placeholder}</option>`;

      orgaos
        .filter((o) => o.ativo !== false)
        .forEach((o) => {
          const opt = document.createElement("option");
          opt.value = o.id;
          opt.textContent = `${o.nome}${o.sigla ? ` (${o.sigla})` : ""}`;
          if (selectedId && o.id == selectedId) opt.selected = true;
          select.appendChild(opt);
        });
    } catch (error) {
      console.error("Erro ao carregar órgãos:", error);
      select.innerHTML = `<option value="">Erro ao carregar órgãos</option>`;
    }
  }

  // ============================================================
  // CARREGAR SELECT DE FORNECEDORES
  // ============================================================
  async carregarSelectFornecedores(
    selectId,
    selectedId = null,
    placeholder = "Selecione um fornecedor...",
  ) {
    const select = document.getElementById(selectId);
    if (!select) {
      console.warn(`Select com ID "${selectId}" não encontrado.`);
      return;
    }

    try {
      const { data: fornecedores, error } = await supabase
        .from("fornecedores")
        .select("id, razao_social, cnpj")
        .order("razao_social");

      if (error) throw error;

      if (!fornecedores || fornecedores.length === 0) {
        select.innerHTML = `<option value="">Nenhum fornecedor encontrado</option>`;
        return;
      }

      select.innerHTML = `<option value="">${placeholder}</option>`;

      fornecedores.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        const cnpjDisplay = f.cnpj ? ` (${this.formatarDocumento(f.cnpj)})` : "";
        opt.textContent = `${f.razao_social}${cnpjDisplay}`;
        if (selectedId && f.id == selectedId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
      select.innerHTML = `<option value="">Erro ao carregar fornecedores</option>`;
    }
  }

  // ============================================================
  // CARREGAR SELECT DE STATUS
  // ============================================================
  carregarSelectStatus(selectId, selectedValue = null) {
    const select = document.getElementById(selectId);
    if (!select) {
      console.warn(`Select com ID "${selectId}" não encontrado.`);
      return;
    }

    const statusOptions = [
      { value: "", label: "Todos os status" },
      { value: "ATIVA", label: "Ativa" },
      { value: "PROXIMA", label: "Próxima" },
      { value: "VENCIDA", label: "Vencida" },
      { value: "CANCELADA", label: "Cancelada" },
      { value: "ENCERRADA", label: "Encerrada" },
    ];

    select.innerHTML = statusOptions
      .map(
        (s) =>
          `<option value="${s.value}" ${selectedValue === s.value ? "selected" : ""}>${s.label}</option>`,
      )
      .join("");
  }

  // ============================================================
  // MOSTRAR SPINNER DE CARREGAMENTO
  // ============================================================
  mostrarSpinner(containerId, mensagem = "Carregando...") {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          ${mensagem}
        </div>
      `;
    } else {
      console.warn(`Container com ID "${containerId}" não encontrado.`);
    }
  }

  // ============================================================
  // ESCONDER SPINNER (MOSTRAR CONTEÚDO)
  // ============================================================
  esconderSpinner(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      const spinner = container.querySelector(".loading-spinner");
      if (spinner) {
        spinner.style.display = "none";
      }
    }
  }

  // ============================================================
  // ESCONDER ELEMENTO COM ANIMAÇÃO
  // ============================================================
  esconderElemento(elemento, tempo = 300) {
    if (!elemento) return;
    elemento.style.transition = `opacity ${tempo}ms ease, transform ${tempo}ms ease`;
    elemento.style.opacity = "0";
    elemento.style.transform = "scale(0.95)";
    setTimeout(() => {
      elemento.style.display = "none";
    }, tempo);
  }

  // ============================================================
  // MOSTRAR ELEMENTO COM ANIMAÇÃO
  // ============================================================
  mostrarElemento(elemento, display = "block", tempo = 300) {
    if (!elemento) return;
    elemento.style.display = display;
    elemento.style.opacity = "0";
    elemento.style.transform = "scale(0.95)";
    elemento.style.transition = `opacity ${tempo}ms ease, transform ${tempo}ms ease`;

    // Forçar reflow para a animação funcionar
    void elemento.offsetHeight;

    elemento.style.opacity = "1";
    elemento.style.transform = "scale(1)";
  }

  // ============================================================
  // TRUNCAR TEXTO
  // ============================================================
  truncarTexto(texto, limite = 100) {
    if (!texto) return "";
    if (texto.length <= limite) return texto;
    return texto.substring(0, limite) + "...";
  }

  // ============================================================
  // VALIDAR CNPJ
  // ============================================================
  validarCnpj(cnpj) {
    if (!cnpj) return false;
    const limpo = cnpj.replace(/\D/g, "");
    if (limpo.length !== 14) return false;

    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(limpo)) return false;

    // Validar dígitos verificadores
    const digitos = limpo.split("").map(Number);
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let soma1 = 0;
    for (let i = 0; i < 12; i++) {
      soma1 += digitos[i] * pesos1[i];
    }
    let resto1 = soma1 % 11;
    const digito1 = resto1 < 2 ? 0 : 11 - resto1;
    if (digito1 !== digitos[12]) return false;

    let soma2 = 0;
    for (let i = 0; i < 13; i++) {
      soma2 += digitos[i] * pesos2[i];
    }
    let resto2 = soma2 % 11;
    const digito2 = resto2 < 2 ? 0 : 11 - resto2;
    if (digito2 !== digitos[13]) return false;

    return true;
  }

  // ============================================================
  // VALIDAR CPF OU CNPJ
  // ============================================================
  validarCpf(cpf) {
    if (!cpf) return false;
    const limpo = String(cpf).replace(/\D/g, "");
    if (limpo.length !== 11 || /^(\d)\1+$/.test(limpo)) return false;
    const calc = (base, pesos) => {
      const soma = String(base).split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    const d1 = calc(limpo.slice(0, 9), [10,9,8,7,6,5,4,3,2]);
    const d2 = calc(limpo.slice(0, 9) + d1, [11,10,9,8,7,6,5,4,3,2]);
    return limpo === limpo.slice(0, 9) + d1 + d2;
  }

  validarDocumento(documento) {
    const limpo = this.normalizarDocumento(documento);
    if (limpo.length === 11) return this.validarCpf(limpo);
    if (limpo.length === 14) return this.validarCnpj(limpo);
    return false;
  }

  // ============================================================
  // VALIDAR EMAIL
  // ============================================================
  validarEmail(email) {
    if (!email) return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // ============================================================
  // GERAR ID ÚNICO
  // ============================================================
  gerarIdUnico(prefixo = "") {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${prefixo}${timestamp}-${random}`;
  }

  // ============================================================
  // COPIAR PARA ÁREA DE TRANSFERÊNCIA
  // ============================================================
  async copiarParaClipboard(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      this.mostrarToast(
        "sucesso",
        "Copiado!",
        "Texto copiado para a área de transferência.",
      );
      return true;
    } catch (error) {
      console.error("Erro ao copiar:", error);
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = texto;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        this.mostrarToast(
          "sucesso",
          "Copiado!",
          "Texto copiado para a área de transferência.",
        );
        return true;
      } catch (err) {
        this.mostrarToast("erro", "Erro ao copiar", "Tente novamente.");
        return false;
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  // ============================================================
  // SCROLL PARA ELEMENTO
  // ============================================================
  scrollParaElemento(elementoId, comportamento = "smooth") {
    const elemento = document.getElementById(elementoId);
    if (elemento) {
      elemento.scrollIntoView({
        behavior: comportamento,
        block: "start",
        inline: "nearest",
      });
    } else {
      console.warn(`Elemento com ID "${elementoId}" não encontrado.`);
    }
  }

  // ============================================================
  // OBTER PARÂMETROS DA URL
  // ============================================================
  getParametroUrl(nome) {
    const params = new URLSearchParams(window.location.search);
    return params.get(nome);
  }

  // ============================================================
  // REDIRECIONAR COM PARÂMETROS
  // ============================================================
  redirecionarComParametros(url, parametros = {}) {
    const params = new URLSearchParams(parametros);
    const urlCompleta = `${url}${params.toString() ? "?" + params.toString() : ""}`;
    window.location.href = urlCompleta;
  }

  // ============================================================
  // DOWNLOAD DE ARQUIVO
  // ============================================================
  downloadArquivo(conteudo, nomeArquivo, tipo = "text/plain") {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================================
  // ESCONDER/MOSTRAR ELEMENTO POR ID
  // ============================================================
  toggleElemento(id) {
    const elemento = document.getElementById(id);
    if (!elemento) {
      console.warn(`Elemento com ID "${id}" não encontrado.`);
      return;
    }
    if (elemento.style.display === "none") {
      this.mostrarElemento(elemento);
    } else {
      this.esconderElemento(elemento);
    }
  }
}
