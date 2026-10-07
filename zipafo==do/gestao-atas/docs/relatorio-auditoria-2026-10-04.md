# Auditoria visual e funcional — Sistema-mãe da Intranet

**Data:** 04/10/2026
**Escopo publicado:** Google Drive
**GitHub/GitHub Pages:** não publicado, conforme orientação posterior do usuário

## Resultado executivo

A auditoria dos sete entrypoints — Biblioteca, Controle de Saldos/Gestão de Atas, Gestão de Atos Oficiais, Processos Licitatórios, Gestão de Trabalho, Compras Públicas e Painel Administrativo — encontrou divergências sistêmicas de shell, tokens, fontes, caminhos de assets, estados de interface, acessibilidade, paginação e contratos de backend.

Os principais sinais de protótipo eram:

- shells duplicados ou vazios;
- imports e destinos locais ausentes ou inconsistentes;
- módulos somente leitura ou com tabelas sem renderer;
- estados de erro apresentados como listas vazias/zeros;
- ausência de paginação e ordenação server-side;
- fluxos de gestão anunciados, mas sem formulário, detalhe ou transição real;
- tokens verdes, azuis e roxos concorrendo no mesmo sistema;
- ausência de Manrope carregada de forma confiável;
- acessibilidade incompleta em menus, modais, tabelas e toasts;
- dependência de regras client-side para autorização e ausência de validação transacional em mutações críticas.

## Implementado no Drive

1. Criada a fundação visual compartilhada `system-mother.css` com:
   - tokens institucionais únicos;
   - tipografia e fundo sistêmicos;
   - shell comum para sidebar/topbar;
   - cards, botões, inputs, tabelas, badges, modais, toasts e estados;
   - responsividade para drawer móvel;
   - foco visível e redução de movimento.
2. Criado `system-shell.js` com:
   - classe sistêmica comum;
   - active state e `aria-current`;
   - toggle mobile, backdrop e Escape;
   - `aria-expanded`/`aria-controls`;
   - regiões de loading/toast com `aria-live`;
   - caption automático em tabelas sem caption.
3. Atualizados os sete entrypoints e as rotas administrativas internas para carregarem os assets compartilhados.
4. Corrigida a inconsistência do menu administrativo, evitando que classes antigas sobrescrevam o shell compartilhado.
5. Criado e publicado `audit-build.mjs`, gate que valida os entrypoints e a sintaxe dos arquivos JavaScript antes de uma nova publicação.

## Validação

- Gate local: **passou**.
- Entry points verificados: **7**.
- Arquivos JavaScript verificados: **6**.
- Assets compartilhados verificados remotamente no Drive: **system-mother.css** e **system-shell.js**.
- Entry points representativos verificados remotamente: Biblioteca, Processos Licitatórios e Painel Administrativo.

## Backend / Supabase

Não foram aplicadas migrações ou alterações no Supabase nesta rodada. A auditoria identificou riscos que exigem contrato/schema confirmado antes de qualquer alteração segura: RLS e isolamento por tenant, RPCs, transações de pedidos/consumo/aditivos, Storage, paginação, timezone e máquinas de estado. Alterar tabelas ou políticas sem essa confirmação poderia causar perda de dados, falsa autorização ou quebra de módulos.

## Pendências de produto para a próxima fase

- completar os módulos que ainda são cascas de SPA;
- disponibilizar e validar rotas de detalhe e formulários reais;
- implementar paginação, filtros, ordenação e totais server-side;
- transformar mutações críticas em operações atômicas/idempotentes;
- testar RLS, dois tenants, concorrência, Storage, XSS, CSP, teclado, leitor de tela e viewports móveis;
- substituir placeholders e links sem destino antes de habilitar esses itens na navegação de produção.
