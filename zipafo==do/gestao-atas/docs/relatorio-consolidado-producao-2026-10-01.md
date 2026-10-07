# Relatório consolidado da produção — Intranet Municipal

**Data da verificação:** 1º de outubro de 2026
**Projeto Supabase:** `gestao-atas-pitangueiras`
**Ref:** `qgkjnzcqjhhqdgxmvtew`
**Status do projeto:** `ACTIVE_HEALTHY`
**Escopo:** inventário pós-implantação do módulo Gestão de Trabalho e situação consolidada dos módulos existentes.

## 1. Resumo executivo

A produção está operacional e contém **97 tabelas públicas inventariadas**, todas com RLS habilitado. O catálogo registra **6 módulos ativos e visíveis**. As migrations de fundação, governança, auditoria, aprovação atômica e Gestão de Trabalho estão registradas no histórico do Supabase.

O novo módulo **Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda** está implantado em produção com 17 tabelas, RLS, duas RPCs, 17 triggers de auditoria e dois triggers de notificação. Não foram encontrados dados de fixture nem notificações fictícias persistidas no novo módulo.

A segurança estrutural está ativa em toda a base inventariada, mas há **6 tabelas com RLS habilitado e nenhuma policy declarada**. Em PostgreSQL, isso normalmente resulta em negação por padrão para os papéis sujeitos a RLS; essas tabelas devem ser revisadas antes de serem usadas por novas telas ou APIs.

## 2. Rotas ativas no catálogo de produção

| ID | Nome cadastrado | Descrição | Rota | Situação | Arquivo encontrado no workspace |
|---:|---|---|---|---|---|
| 2 | `atas` | Gestão de Atas de Registro de Preços | `controle-de-saldos/gestao-atas.html` | Ativo e visível | Sim |
| 3 | `estoque` | Gestão de Estoque e Almoxarifado | `#` | Ativo e visível, mas sem rota implementada | Não aplicável |
| 4 | `tarefas` | Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda | `gestao-de-trabalho/index.html` | Ativo e visível | Sim |
| 5 | `atosoficiais` | Gestão de Atos Oficiais (Leis/Decretos) | `gestao-de-atos-oficiais/painel-adm-atos-oficiais.html` | Ativo e visível | Sim |
| 1 | `biblioteca` | Biblioteca Municipal | `biblioteca/dashboard.html` | Ativo e visível | Sim |
| 7 | `compras` | Gestão de Compras Públicas, Processos, Atas e Contratos | `compras/index.html` | Ativo e visível | Sim |

### Observação sobre o catálogo

O módulo de Gestão de Trabalho está funcionalmente nomeado na descrição, mas o campo `nome` do catálogo ainda é `tarefas`. Recomenda-se uma alteração futura para `Gestão de Trabalho`, preservando o ID e a rota, caso o frontend dependa do nome exibido.

O módulo `estoque` está marcado como ativo e visível, porém usa `#` como rota. Ele deve ser ocultado, desativado ou receber uma rota real antes de uma apresentação operacional aos usuários.

## 3. Inventário completo de tabelas

A contagem foi obtida do catálogo PostgreSQL (`public`, relações do tipo tabela). A coluna “policies sem declaração” identifica tabelas com RLS habilitado, mas sem policies encontradas em `pg_policies`.

| Área | Tabelas | RLS | Policies sem declaração | Situação |
|---|---:|---:|---:|---|
| Atas, Saldos e Pedidos | 12 | 12 | 0 | Estruturalmente protegido |
| Atos Oficiais | 9 | 9 | 3 | Revisar as 3 tabelas sem policy |
| Biblioteca | 14 | 14 | 0 | Estruturalmente protegido |
| Compras Públicas | 30 | 30 | 0 | Estruturalmente protegido |
| Gestão de Trabalho | 17 | 17 | 0 | Implantado e protegido |
| Outros / auditoria / legado | 5 | 5 | 0 | Protegido |
| Plataforma / Identidade | 10 | 10 | 3 | Revisar as 3 tabelas sem policy |
| **Total** | **97** | **97** | **6** | **RLS habilitado em 100%** |

### 3.1 Atas, Saldos e Pedidos — 12 tabelas

`aditivos_ata`, `aditivos_itens_historico`, `atas`, `consumos`, `entregas_fracionadas`, `fornecedores`, `gestores_orgaos`, `historico_precos`, `itens_ata`, `itens_pedido`, `pedidos`, `representantes`.

### 3.2 Atos Oficiais — 9 tabelas

`alteracoes_dispositivos`, `anexos_ato`, `anexos_atos`, `atos_oficiais`, `configuracoes_atos`, `configuracoes_portal`, `relacionamentos_atos`, `tipos_ato`, `versoes_atos`.

Tabelas que aparecem com RLS e **zero policies declaradas**: `anexos_atos`, `configuracoes_atos` e `versoes_atos`. A ausência pode ser intencional para acesso apenas por service role/triggers, mas precisa ser documentada e confirmada.

### 3.3 Biblioteca — 14 tabelas

`bib_autores`, `bib_categorias`, `bib_configuracoes`, `bib_editoras`, `bib_emprestimo_itens`, `bib_emprestimos`, `bib_estantes`, `bib_exemplares`, `bib_leitores`, `bib_livro_autores`, `bib_livro_categorias`, `bib_livros`, `bib_prateleiras`, `bib_reservas`.

### 3.4 Compras Públicas — 30 tabelas

`compras_acessos_recentes`, `compras_artefato_versoes`, `compras_artefatos`, `compras_classificacoes`, `compras_contrato_eventos`, `compras_contratos`, `compras_decisoes`, `compras_demandas`, `compras_documento_versoes`, `compras_documentos`, `compras_eventos_auditoria`, `compras_execucoes_contratuais`, `compras_favoritos`, `compras_feriados`, `compras_fluxo_etapas`, `compras_fluxo_subetapas`, `compras_fluxo_versoes`, `compras_fluxos`, `compras_notificacoes`, `compras_obrigacoes`, `compras_pca_itens`, `compras_pesquisa_precos`, `compras_processos`, `compras_processos_etapas`, `compras_processos_fornecedores`, `compras_processos_itens`, `compras_processos_subetapas`, `compras_publicacoes`, `compras_regras_versoes`, `compras_tarefas`.

### 3.5 Gestão de Trabalho — 17 tabelas

`gestao_trabalho_agenda`, `gestao_trabalho_capacidades`, `gestao_trabalho_categorias`, `gestao_trabalho_comentarios`, `gestao_trabalho_demandas`, `gestao_trabalho_dependencias`, `gestao_trabalho_documentos`, `gestao_trabalho_eventos`, `gestao_trabalho_indisponibilidades`, `gestao_trabalho_notificacoes`, `gestao_trabalho_projetos`, `gestao_trabalho_rotina_ocorrencias`, `gestao_trabalho_rotinas`, `gestao_trabalho_solicitacoes`, `gestao_trabalho_statuses`, `gestao_trabalho_subtarefas`, `gestao_trabalho_tarefas`.

Todas as 17 tabelas estão com RLS e duas policies-base detectadas: leitura tenant-scoped e gestão tenant-scoped. O desenho atual isola municípios, mas a próxima revisão deve especializar edição por papel e objeto.

### 3.6 Plataforma e identidade — 10 tabelas

`app_tenant_memberships`, `app_tenant_units`, `app_tenants`, `modulos_sistema`, `orgaos`, `perfis`, `permissoes`, `permissoes_modulos`, `usuarios`, `usuarios_modulos`.

Tabelas com RLS e **zero policies declaradas**: `perfis`, `permissoes` e `permissoes_modulos`. Confirmar se são tabelas de configuração administrativa acessadas somente por funções privilegiadas ou se precisam de policies Admin-only explícitas.

### 3.7 Outros, auditoria e legado — 5 tabelas

`atas_favoritas`, `atas_historico`, `auditoria_eventos`, `categorias`, `logs_operacoes`.

## 4. Indicadores de dados observados

Os valores abaixo são indicadores técnicos do catálogo e não substituem contagem analítica completa. O `reltuples` do PostgreSQL aparece como `-1` para tabelas ainda não analisadas ou sem estatística atualizada.

| Indicador | Valor observado |
|---|---:|
| Tenants ativos | 1 |
| Memberships estimadas | 3 |
| Unidades do tenant | 13 |
| Usuários estimados | 3 |
| Atas estimadas | 159 |
| Itens de ata estimados | 928 |
| Fornecedores estimados | 137 |
| Itens de pedido estimados | 0 |
| Eventos legados `compras_eventos_auditoria` | 19 |
| Fluxos de compras estimados | 1 |
| Versões de fluxo estimadas | 1 |
| Etapas de fluxo estimadas | 5 |
| Tarefas de fixture no Gestão de Trabalho | 0 |
| Notificações persistidas no Gestão de Trabalho | 0 |

## 5. Triggers e automações de banco

A produção possui **98 triggers não internos** no inventário desta verificação, agrupados da seguinte forma:

| Área | Triggers observados | Destaques |
|---|---:|---|
| Atas, Saldos e Pedidos | 12 | atualização de saldo/status, auditoria canônica, lote e mapeamento tenant/unidade |
| Biblioteca | 6 | códigos, empréstimo, devolução e status |
| Compras Públicas | 51 | auditoria, versionamento, atualização de timestamps e notificações |
| Gestão de Trabalho | 19 | 17 auditorias, 1 notificação de tarefa e 1 notificação de solicitação |
| Outros / identidade | 10 | auditoria, atualização de usuários/órgãos/módulos e append-only da auditoria |

## 6. Funções e RPCs relevantes

As RPCs do módulo Gestão de Trabalho estão disponíveis para `authenticated` como funções `SECURITY INVOKER`:

- `public.gestao_trabalho_analisar_planejamento(...)` — conflitos, carga, capacidade e sobrecarga;
- `public.gestao_trabalho_registrar_evento(...)` — registro de timeline contextual.

A função de notificação `app_private.gestao_trabalho_notificar_responsavel()` é `SECURITY DEFINER`, usada pelos triggers, e não possui execução direta para `authenticated`.

Também permanecem ativas funções críticas das fases anteriores, incluindo `public.compras_aprovar_pedido(...)`, `public.compras_calcular_prazo_dias_uteis(...)`, `public.compras_concluir_etapa(...)`, funções de geração de ata, registro de versões, processamento de Biblioteca e funções privadas de isolamento tenant/RLS.

## 7. Migrations registradas

A sequência recente de produção inclui:

1. `compras_foundation`;
2. `compras_legacy_security`;
3. `compras_policies_rpc`;
4. governança e índices de Compras;
5. calendários e subetapas;
6. notificações automáticas;
7. `atas_aprovacao_atomica`;
8. `auditoria_canonica_admin_only`;
9. `gestao_trabalho_core_production`;
10. `gestao_trabalho_conflicts_production`.

As duas últimas migrations foram aplicadas em 1º de outubro de 2026 e aparecem no histórico do Supabase com versões `20261001220215` e `20261001220231`.

## 8. Situação de segurança e conformidade técnica

A separação tenant-scoped está presente nas tabelas inventariadas e o RLS está habilitado em 100% delas. A auditoria canônica registra alterações críticas com contexto, campos alterados e hash encadeado, com leitura administrativa conforme as policies existentes.

Este relatório é um inventário técnico. Ele não constitui certificação jurídica, assinatura digital qualificada, garantia de retenção legal ou validação completa de cadeia de custódia. Ainda são necessários política municipal de retenção, exportação/preservação, backup físico e restore, revisão formal de perfis e teste E2E browser com sessão Auth real.

## 9. Pendências prioritárias

| Prioridade | Pendência | Impacto |
|---|---|---|
| Alta | Resolver o módulo `estoque` ativo com rota `#` | Evitar card sem destino operacional |
| Alta | Revisar as 6 tabelas com RLS sem policy declarada | Confirmar acesso administrativo ou criar policies explícitas |
| Alta | Refinar policies do Gestão de Trabalho por papel e objeto | Evitar que todo usuário do tenant gerencie todos os registros |
| Média | Confirmar publicação dos arquivos HTML/CSS/JS | Banco e catálogo não publicam a interface automaticamente |
| Média | Executar E2E browser com Auth real | Validar navegação, formulários e sessão visual |
| Média | Executar backup físico e restore | Evidência de recuperação operacional |
| Baixa | Renomear no catálogo `tarefas` para `Gestão de Trabalho` | Coerência entre nome exibido e Termo de Referência |

## 10. Conclusão

A produção contém uma base multi-tenant ativa, com os módulos de Atas, Biblioteca, Atos Oficiais, Compras Públicas e Gestão de Trabalho cadastrados no catálogo. O novo módulo está estruturalmente implantado e validado por inventário de banco, enquanto os módulos legados continuam presentes e suas tabelas permanecem protegidas por RLS.

O principal ponto funcional visível é o card de Estoque com rota `#`. O principal ponto de segurança a revisar é a existência de seis tabelas com RLS sem policies declaradas, além do refinamento futuro das policies do Gestão de Trabalho por perfil.
