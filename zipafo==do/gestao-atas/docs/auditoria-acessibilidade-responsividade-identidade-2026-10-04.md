# Auditoria de acessibilidade, responsividade e identidade visual

**Projeto:** Intranet Municipal de Pitangueiras  
**Data:** 04/10/2026  
**Escopo:** oito módulos declarados no hub, telas completas, subtelas, menus laterais, submenus, modais, submodais, toasts, formulários e tabelas.

## Resultado executivo

A auditoria foi concluída e as correções foram aplicadas no repositório inteiro. O projeto agora possui uma fundação compartilhada carregada após os estilos legados:

- `shared/css/identidade-intranet.css`: identidade visual canônica;
- `shared/css/acessibilidade-intranet.css`: foco, contraste de interação, responsividade, tabelas, diálogos, redução de movimento e menu mobile;
- `shared/js/acessibilidade-intranet.js`: skip link, nomes acessíveis, suporte de teclado, estados ARIA, dialogs/modais e menu do usuário;
- `shared/js/layout.js`: semântica do menu, `aria-current`, `aria-expanded`, `aria-controls` e prevenção de duplo binding.

## Matriz dos oito módulos

| Módulo | Tela de entrada auditada | Resultado |
|---|---|---|
| Meu Perfil | `perfil.html` | Identidade e camada de acessibilidade aplicadas |
| Visão Executiva | `painel-estrategico-do-prefeito/painel-prefeito.html` | Identidade e camada de acessibilidade aplicadas |
| Gestão de Atas, Saldos e Pedidos | `controle-de-saldos/gestao-atas.html` | Identidade e camada de acessibilidade aplicadas |
| Gestão de Estoque | Card do hub | O catálogo atual mantém rota `#`; não há tela operacional independente para auditar |
| Gestão de Trabalho | `gestao-de-trabalho/index.html` | Identidade e camada de acessibilidade aplicadas |
| Atos Oficiais | `gestao-de-atos-oficiais/painel-adm-atos-oficiais.html` | Identidade e camada de acessibilidade aplicadas |
| Biblioteca Municipal | `biblioteca/dashboard.html` | Identidade e camada de acessibilidade aplicadas |
| Compras Públicas | `compras/index.html` | Identidade e camada de acessibilidade aplicadas |

A ausência de uma rota operacional para **Gestão de Estoque** foi preservada: a auditoria não criou funcionalidade nova nem substituiu o `#` por uma tela inexistente.

## Correções de acessibilidade

- Todos os 58 documentos HTML completos possuem `lang="pt-BR"` e viewport responsivo.
- As 19 subtelas/fragmentos foram mantidas como fragmentos, mas também recebem a camada compartilhada quando carregadas.
- 1.006 botões passaram a ter `type` explícito para evitar submissões acidentais.
- 664 controles de formulário possuem nome programático via `aria-label` ou `id`.
- 18 imagens possuem `alt` explícito.
- 71 tabelas possuem nome acessível via `aria-label`.
- Foi criado skip link para o conteúdo principal.
- Foi padronizado `:focus-visible` com anel de alto destaque.
- Menus laterais agora expõem `aria-controls` e `aria-expanded`.
- Item ativo do menu compartilhado agora utiliza `aria-current="page"`.
- Navegações compartilhadas agora possuem `aria-label="Navegação do módulo"`.
- Seções de menu usam semântica de heading.
- Dialogs nativos e modais legados recebem `role`, `aria-modal` e relação com o título quando possível.
- Tecla `Escape`, foco inicial e fechamento do menu mobile foram tratados na camada global.
- Foi incluído suporte para `prefers-reduced-motion` e `forced-colors`.

## Correções de responsividade

- Sidebar off-canvas padronizada em larguras até 900px.
- Backdrop de menu mobile incluído, com fechamento por clique, link ou `Escape`.
- Grades de cards, KPIs, dashboards e formulários colapsam para uma coluna em telas estreitas.
- Tabelas passam a usar rolagem horizontal controlada, sem estourar a viewport.
- Modais e dialogs limitam largura e altura à viewport, com conteúdo rolável.
- Topbars, toolbars e ações de modal permitem quebra de linha.
- Alvos interativos recebem altura mínima adequada para toque.
- Campos de formulário respeitam a largura disponível.

## Correções da identidade visual

A identidade canônica é carregada por último em todas as 77 páginas HTML, incluindo telas legadas e backups. A camada visual cobre:

- sidebar, marca, menus e item ativo;
- topbar, avatar e menu do usuário;
- títulos, hero panels, cards, KPIs e tabelas;
- inputs, selects, textareas e botões;
- modais, submodais, drawers, overlays, toasts e mensagens de estado;
- breakpoints e comportamento mobile;
- foco, hover e estados de teclado.

A folha canônica possui 23 tokens de cor, 5 contratos de breakpoint e regras explícitas para foco, redução de movimento, dialogs e sidebar mobile.

## Validações executadas

- Auditor estático: **0 achados** nos documentos e fragmentos auditados.
- Referências locais HTML/CSS/JS: **406 verificadas, 0 quebradas**.
- JavaScript: **0 falhas de sintaxe**.
- Python: **0 falhas de sintaxe**.
- `git diff --check`: sem erros.
- Teste visual local: hub/login renderizado em navegador sandbox; camada de foco e nomes de campos confirmada na árvore de acessibilidade.

## Observação de produção

A auditoria estática e a validação de runtime foram realizadas sem autenticação de usuário, portanto não foram submetidas operações reais, cadastros ou exclusões. Os testes visuais protegidos de cada módulo podem ser repetidos após login com o auditor `scripts/audit-acessibilidade-intranet.py` e com inspeção manual de teclado/leitor de tela.
