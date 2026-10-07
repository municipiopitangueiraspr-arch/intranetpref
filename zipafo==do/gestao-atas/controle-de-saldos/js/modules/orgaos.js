import { supabase } from '../supabase.js'

export class Orgaos {
  constructor(sistema) {
    this.sistema = sistema
  }

  async carregarConteudo() {
    const container = document.getElementById('orgaosContent')
    if (!container) return

    container.innerHTML = `
      <div class="orgaos-container">
        <div class="orgaos-header">
          <h3 style="font-size: 1.1rem">
            <i class="fas fa-university"></i> Gestão de Órgãos / Autarquias
          </h3>
          <button class="btn-novo-orgao" id="btnNovoOrgao">
            <i class="fas fa-plus-circle"></i> Novo Órgão
          </button>
        </div>
        <div class="tabela-container">
          <table class="tabela-orgaos">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Sigla</th>
                <th>CNPJ</th>
                <th>Contato</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="tabelaOrgaosBody"></tbody>
          </table>
        </div>
      </div>
    `

    document.getElementById('btnNovoOrgao').addEventListener('click', () => this.abrirModal())
    await this.carregarTabela()
  }

  async carregarTabela() {
    const tbody = document.getElementById('tabelaOrgaosBody')
    if (!tbody) return

    const { data: orgaos } = await supabase
      .from('orgaos')
      .select('*')
      .order('nome')

    if (!orgaos?.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhum órgão cadastrado</td></tr>'
      return
    }

    tbody.innerHTML = orgaos.map(o => `
      <tr>
        <td>${o.id}</td>
        <td><strong>${o.nome}</strong></td>
        <td><span class="badge-perfil" style="background:var(--primary-100);">${o.sigla || '-'}</span></td>
        <td>${o.cnpj || '-'}</td>
        <td>
          ${o.telefone ? `<i class="fas fa-phone"></i> ${o.telefone}<br>` : ''}
          ${o.email ? `<i class="fas fa-envelope"></i> ${o.email}` : ''}
        </td>
        <td><span class="badge-perfil ${o.ativo ? 'status-ativo' : 'status-inativo'}">${o.ativo ? 'ATIVO' : 'INATIVO'}</span></td>
        <td>
          <button class="btn-editar-orgao" data-id="${o.id}"><i class="fas fa-edit"></i></button>
          <button class="btn-desativar-orgao" data-id="${o.id}"><i class="fas ${o.ativo ? 'fa-times-circle' : 'fa-check-circle'}"></i></button>
        </td>
      </tr>
    `).join('')

    // Adicionar eventos aos botões
    document.querySelectorAll('.btn-editar-orgao').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id
        this.abrirModal(id)
      })
    })

    document.querySelectorAll('.btn-desativar-orgao').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id
        this.toggleStatus(id)
      })
    })
  }

  async abrirModal(id = null) {
    if (this.sistema.usuarioAtual?.perfil !== 'ADMIN') {
      this.sistema.mostrarToast('erro', 'Apenas administradores podem gerenciar órgãos.')
      return
    }

    const modal = document.getElementById('modalOrgao')
    const titulo = document.getElementById('modalOrgaoTitulo')
    titulo.innerHTML = id ? '<i class="fas fa-edit"></i> Editar Órgão' : '<i class="fas fa-plus-circle"></i> Novo Órgão'

    const form = document.getElementById('formOrgao')
    form.innerHTML = `
      <input type="hidden" id="orgaoId" value="${id || ''}">
      <div class="form-group">
        <label>Nome do Órgão</label>
        <input type="text" id="orgaoNome" class="filtro-input" placeholder="Ex: Prefeitura Municipal" required>
      </div>
      <div class="form-group">
        <label>Sigla</label>
        <input type="text" id="orgaoSigla" class="filtro-input" placeholder="Ex: PM" required>
      </div>
      <div class="form-group">
        <label>CNPJ</label>
        <input type="text" id="orgaoCnpj" class="filtro-input" placeholder="00.000.000/0001-00">
      </div>
      <div class="form-group">
        <label>Endereço</label>
        <input type="text" id="orgaoEndereco" class="filtro-input" placeholder="Endereço completo">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Telefone</label>
          <input type="text" id="orgaoTelefone" class="filtro-input" placeholder="(00) 0000-0000">
        </div>
        <div class="form-group">
          <label>E-mail</label>
          <input type="email" id="orgaoEmail" class="filtro-input" placeholder="contato@orgao.gov.br">
        </div>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="orgaoStatus" class="filtro-select">
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
        <button type="button" id="btnCancelarOrgao" style="background: var(--neutral-200); padding: 8px 16px; border: none; border-radius: var(--border-radius-md);">Cancelar</button>
        <button type="submit" style="background: var(--primary-600); color: white; padding: 8px 16px; border: none; border-radius: var(--border-radius-md);">
          <i class="fas fa-save"></i> Salvar Órgão
        </button>
      </div>
    `

    if (id) {
      const { data: o } = await supabase.from('orgaos').select('*').eq('id', id).single()
      if (o) {
        document.getElementById('orgaoId').value = o.id
        document.getElementById('orgaoNome').value = o.nome || ''
        document.getElementById('orgaoSigla').value = o.sigla || ''
        document.getElementById('orgaoCnpj').value = o.cnpj || ''
        document.getElementById('orgaoEndereco').value = o.endereco || ''
        document.getElementById('orgaoTelefone').value = o.telefone || ''
        document.getElementById('orgaoEmail').value = o.email || ''
        document.getElementById('orgaoStatus').value = o.ativo ? 'true' : 'false'
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      this.salvar()
    }, { once: true })

    document.getElementById('btnCancelarOrgao').addEventListener('click', () => {
      modal.classList.remove('active')
    })

    modal.classList.add('active')
  }

  async salvar() {
    const id = document.getElementById('orgaoId').value
    const dados = {
      nome: document.getElementById('orgaoNome').value,
      sigla: document.getElementById('orgaoSigla').value,
      cnpj: document.getElementById('orgaoCnpj').value || null,
      endereco: document.getElementById('orgaoEndereco').value || null,
      telefone: document.getElementById('orgaoTelefone').value || null,
      email: document.getElementById('orgaoEmail').value || null,
      ativo: document.getElementById('orgaoStatus').value === 'true',
    }

    try {
      let error
      if (id) {
        ({ error } = await supabase.from('orgaos').update(dados).eq('id', id))
      } else {
        ({ error } = await supabase.from('orgaos').insert(dados))
      }
      if (error) throw error
      this.sistema.mostrarToast('sucesso', id ? 'Órgão atualizado!' : 'Órgão cadastrado!')
      document.getElementById('modalOrgao').classList.remove('active')
      await this.carregarTabela()
      await this.sistema.carregarOrgaos() // atualiza lista global
    } catch (error) {
      this.sistema.mostrarToast('erro', error.message)
    }
  }

  async toggleStatus(id) {
    const { data: o } = await supabase.from('orgaos').select('ativo').eq('id', id).single()
    if (!o) return

    const confirmado = await this.sistema.confirmar(`${o.ativo ? 'Desativar' : 'Ativar'} este órgão?`)
    if (confirmado) {
      await supabase.from('orgaos').update({ ativo: !o.ativo }).eq('id', id)
      await this.carregarTabela()
      await this.sistema.carregarOrgaos()
      this.sistema.mostrarToast('sucesso', `Órgão ${!o.ativo ? 'ativado' : 'desativado'}!`)
    }
  }
}