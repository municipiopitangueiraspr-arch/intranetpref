# Handoff — Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda

**Data:** 02/10/2026
**Módulo:** Gestão de Trabalho
**Backend:** Supabase PostgreSQL — projeto `gestao-atas-pitangueiras`
**Frontend:** arquivos do módulo `gestao-de-trabalho` no Google Drive

## Entrega desta versão

O módulo foi elevado de uma base operacional para uma central SaaS integrada à Intranet, preservando autenticação, tenants, usuários e layout compartilhado.

### Front-end

- Painel com tarefas abertas, tarefas do dia, atrasos, projetos e carga planejada.
- Minhas tarefas com busca, filtro por status, detalhes e ações de iniciar, pausar, concluir e reabrir.
- Caixa de entrada para tarefas recebidas e solicitações internas.
- Backlog/demandas com conversão persistente em tarefa.
- Projetos com progresso, prazo, prioridade e responsável.
- Agenda diária com eventos persistidos e distinção entre tarefa planejada e atividade agendada.
- Visão de equipe com carga planejada versus capacidade.
- Rotinas e recorrências.
- Relatórios CSV de tarefas e projetos.
- Auditoria com timeline de eventos.
- Configuração de capacidade semanal por usuário.
- Pesquisa global via RPC com respeito ao tenant.
- Detalhamento de tarefas com subtarefas e comentários persistidos.
- Alertas de conflito/sobrecarga sem bloqueio do cadastro.
- Interface responsiva para desktop, tablet e smartphone.
- Identidade azul institucional unificada com Biblioteca, Atas, Saldos, Pedidos e Compras.

### Backend

Migration aplicada no Supabase:

`gestao_trabalho_saas_completo_20261002`

Estruturas complementares:

- `gestao_trabalho_configuracoes`
- `gestao_trabalho_automacoes`
- `gestao_trabalho_integracao_eventos`
- `gestao_trabalho_alertas`
- `gestao_trabalho_relatorios_salvos`

Funções adicionadas:

- `gestao_trabalho_registrar_decisao_conflito`
- `gestao_trabalho_pesquisa_global`
- `gestao_trabalho_resumo`
- `gestao_trabalho_gerar_ocorrencias`
- `gestao_trabalho_atualizar_progresso_projeto`

Também foram adicionados índices para subtarefas, dependências, capacidade, indisponibilidades, comentários, documentos, integrações, alertas e automações.

Todas as novas tabelas possuem RLS por tenant e grants somente para usuários autenticados.

## Arquivos alterados

- `index.html`
- `gestao-trabalho.js`
- `gestao-trabalho.css`
- `20261002100000-gestao-trabalho-saas-completo.sql`
- este handoff

## Testes realizados

- `node --check gestao-trabalho.js` — aprovado.
- Parser HTML de `index.html` — aprovado.
- Migration sem comandos destrutivos — confirmado.
- Aplicação da migration no Supabase — concluída com sucesso.
- Validação de tenants, RLS e persistência permanece obrigatória com sessão autenticada de homologação.

## Regras de negócio preservadas

- Conflito de agenda e sobrecarga são alertas, nunca bloqueios automáticos.
- Duração estimada, tempo real e capacidade são planejamento operacional, não ponto eletrônico.
- Tarefas podem existir sem data, horário ou responsável.
- Histórico e auditoria não são apagados por operações ordinárias.
- Integrações usam origem do registro e não duplicam dados de outros módulos.
- Dados reais não foram substituídos nem excluídos.

## Procedimento de reversão

1. Restaurar os três arquivos HTML/JS/CSS pela versão anterior do Drive.
2. Se necessário, executar a migration de rollback correspondente às estruturas SaaS adicionadas, após backup e revisão do responsável técnico.
3. Não apagar tabelas com dados de auditoria sem exportação e autorização expressa.

## Pendências de homologação

- E2E com sessão Auth real em desktop, tablet e smartphone.
- Validação de upload de anexos no Storage.
- Refinamento de permissões por papel (gestor, supervisor, servidor e consultivo).
- Ativação de workers/scheduler para geração diária de ocorrências de rotinas.
- Teste de carga simultânea e revisão dos advisors de segurança/performance.
- Integrações reais com Compras, Atas, Biblioteca, Contratos e Atos Oficiais.


## Correção do shell compartilhado — 02/10/2026

Foi corrigida a causa da tela aparecer somente com o conteúdo específico: o módulo não carregava explicitamente as folhas oficiais `../shared/css/intranet-base.css` e `../shared/css/componentes.css`, e a configuração não ativava o menu de usuário do cabeçalho.

A página agora carrega o `layout.js` compartilhado, o menu lateral completo, o cabeçalho padrão da Intranet, o avatar com submenu de Perfil/Ajuda/Sair e o cache-busting da folha de identidade. Foram adicionados overrides azuis institucionais no shell para alinhar menu, topbar, marca e avatar aos módulos já validados.

### Validação local adicional

- HTML, JavaScript, CSS e todas as dependências compartilhadas responderam HTTP 200.
- `node --check gestao-trabalho.js` — aprovado.
- IDs HTML sem duplicidade — aprovado.
- Smoke test visual com sessão simulada — menu lateral, cabeçalho, avatar e identidade azul renderizados.
- Console do smoke test — sem erros.
- Breakpoints de sidebar off-canvas, cabeçalho móvel, diálogos e navegação horizontal — verificados.
- Acesso sem sessão continua redirecionando para a intranet por segurança; o 404 observado no teste público corresponde à ausência da cópia local da página de entrada, não a erro do módulo.
